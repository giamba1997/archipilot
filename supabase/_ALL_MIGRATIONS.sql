-- ============================================================
-- ArchiPilot - schema complet (000 -> 017) concatene.
-- A coller en une fois dans le SQL Editor Supabase (nouveau projet).
-- Idempotent : re-exécutable sans risque (IF NOT EXISTS / DROP IF EXISTS).
-- ============================================================

-- ------------------------------------------------------------
-- FILE: 000_base_schema.sql
-- ------------------------------------------------------------
-- ─────────────────────────────────────────────────────────────
-- 000 — BASE SCHEMA (RECONSTRUCTION)
--
-- ⚠️ This file is a REVERSE-ENGINEERED reconstruction of the original
-- base tables that were created by hand in the Supabase dashboard and
-- were NEVER captured in this repo's migrations. The original project
-- was deleted, so these tables are rebuilt from the data-access code:
--   - src/db.js
--   - supabase/functions/** (Edge Functions)
--
-- It MUST run FIRST (before 001-017), because migrations 002/006/011/014/016
-- ALTER `profiles`, and many later migrations assume these tables exist.
--
-- Tables here are the ones referenced in code but created by NO migration:
--   profiles, user_data, project_members, notifications, comments,
--   pv_sends, pv_reads, analytics_events
--
-- Conventions mirror migration 017 (solo-first, owner-scoped, auth.uid()):
--   - RLS enabled on every table
--   - owner-scoped policies, auth.uid() based
--   - NO org / organization references (that layer is being cut in 017)
--
-- Types were inferred conservatively. Where ambiguous, the safest type
-- (text / jsonb) was chosen. See the assumptions list accompanying this file.
-- ─────────────────────────────────────────────────────────────

-- ╔══════════════════════════════════════════════════════════╗
-- ║ profiles                                                   ║
-- ║ 1 row per auth user. Mirrors auth.users.id as PK.          ║
-- ║ ALTERed later by 002 (stripe), 006 (onboarding),           ║
-- ║ 011 (iban/vat/invoice_payment_*), 014 (alert_settings),    ║
-- ║ 016 (push_settings) — those columns are NOT defined here.  ║
-- ╚══════════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS public.profiles (
  id               uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name             text,
  structure        text,
  structure_type   text    DEFAULT 'architecte',
  address          text,
  phone            text,
  email            text,
  picture_url      text,
  pdf_color        text    DEFAULT '#C95A1B',
  pdf_font         text    DEFAULT 'helvetica',
  api_key          text,              -- legacy BYO OpenAI key (no longer read/written)
  lang             text    DEFAULT 'fr',
  post_template    text    DEFAULT 'general',
  pv_template      text    DEFAULT 'standard',
  remark_numbering text    DEFAULT 'none',
  plan             text    NOT NULL DEFAULT 'free',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Self can read/write own row. SELECT is open to any authenticated user
-- because inviteMember()/loadOrgMembers() look up OTHER users' profiles by
-- email/id to resolve collaborators — strict id=auth.uid() would break invites.
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS profiles_insert ON public.profiles;
CREATE POLICY profiles_insert ON public.profiles
  FOR INSERT WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE USING (id = auth.uid());

DROP POLICY IF EXISTS profiles_delete ON public.profiles;
CREATE POLICY profiles_delete ON public.profiles
  FOR DELETE USING (id = auth.uid());

-- ── Auto-create a profiles row on signup ─────────────────────
-- loadProfile() does .single() and errors when no row exists, so every
-- auth user needs a profiles row created at signup time.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ╔══════════════════════════════════════════════════════════╗
-- ║ project_members                                            ║
-- ║ Collaboration invites. project_id is the owner's local     ║
-- ║ project id stored as text (String(projectId)).             ║
-- ║ Créé AVANT user_data : les policies de user_data/comments  ║
-- ║ référencent cette table.                                   ║
-- ╚══════════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS public.project_members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    text NOT NULL,                                    -- String(projectId)
  owner_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- null until accepted/known
  role          text NOT NULL,
  invited_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_email text NOT NULL,                                    -- stored lowercased
  invited_name  text DEFAULT '',
  status        text NOT NULL DEFAULT 'pending',                  -- pending|accepted|declined
  accepted_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_members_owner   ON public.project_members(owner_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user    ON public.project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_email   ON public.project_members(invited_email);
CREATE INDEX IF NOT EXISTS idx_project_members_project ON public.project_members(project_id);

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- Visible to the owner, the linked user, and the invitee (by email — needed
-- before they have a user_id, e.g. loadMyInvitations / respondToInvitation).
DROP POLICY IF EXISTS project_members_select ON public.project_members;
CREATE POLICY project_members_select ON public.project_members
  FOR SELECT USING (
    owner_id = auth.uid()
    OR user_id = auth.uid()
    OR invited_email = lower(auth.jwt() ->> 'email')
  );

-- Only the owner creates invites.
DROP POLICY IF EXISTS project_members_insert ON public.project_members;
CREATE POLICY project_members_insert ON public.project_members
  FOR INSERT WITH CHECK (owner_id = auth.uid());

-- Owner manages roles; the invitee updates their own row to accept/decline.
DROP POLICY IF EXISTS project_members_update ON public.project_members;
CREATE POLICY project_members_update ON public.project_members
  FOR UPDATE USING (
    owner_id = auth.uid()
    OR user_id = auth.uid()
    OR invited_email = lower(auth.jwt() ->> 'email')
  );

DROP POLICY IF EXISTS project_members_delete ON public.project_members;
CREATE POLICY project_members_delete ON public.project_members
  FOR DELETE USING (owner_id = auth.uid());

-- ╔══════════════════════════════════════════════════════════╗
-- ║ user_data                                                  ║
-- ║ Per-user JSONB blob holding the whole projects array +     ║
-- ║ the active project id. Upserted on onConflict = user_id.   ║
-- ╚══════════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS public.user_data (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  projects   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  active_id  bigint,                       -- project id (Date.now()-based) or 1
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_data ENABLE ROW LEVEL SECURITY;

-- Owner full access. SELECT also granted to accepted collaborators so
-- loadSharedProjects() can read the owner's projects blob.
DROP POLICY IF EXISTS user_data_select ON public.user_data;
CREATE POLICY user_data_select ON public.user_data
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.owner_id = user_data.user_id
        AND pm.user_id  = auth.uid()
        AND pm.status   = 'accepted'
    )
  );

DROP POLICY IF EXISTS user_data_insert ON public.user_data;
CREATE POLICY user_data_insert ON public.user_data
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_data_update ON public.user_data;
CREATE POLICY user_data_update ON public.user_data
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_data_delete ON public.user_data;
CREATE POLICY user_data_delete ON public.user_data
  FOR DELETE USING (user_id = auth.uid());

-- ╔══════════════════════════════════════════════════════════╗
-- ║ notifications                                              ║
-- ║ In-app bell. Realtime subscribed on INSERT (user_id).      ║
-- ╚══════════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS public.notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,  -- recipient
  type         text NOT NULL,                          -- invite|invite_accepted|opr_signed|...
  project_id   text,                                   -- String(projectId)
  project_name text,
  actor_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- nullable (server actions)
  actor_name   text,
  data         jsonb NOT NULL DEFAULT '{}'::jsonb,
  read         boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Recipient reads/updates/deletes own notifications.
DROP POLICY IF EXISTS notifications_select ON public.notifications;
CREATE POLICY notifications_select ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

-- Any authenticated user may create a notification for ANOTHER user
-- (inviteMember notifies the invitee; respondToInvitation notifies the owner).
-- Server-side fan-out (opr-signing) uses the service role and bypasses RLS.
DROP POLICY IF EXISTS notifications_insert ON public.notifications;
CREATE POLICY notifications_insert ON public.notifications
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS notifications_update ON public.notifications;
CREATE POLICY notifications_update ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_delete ON public.notifications;
CREATE POLICY notifications_delete ON public.notifications
  FOR DELETE USING (user_id = auth.uid());

-- ╔══════════════════════════════════════════════════════════╗
-- ║ comments                                                   ║
-- ║ Comments on a post/remark of a project.                    ║
-- ║ owner_id = project owner; author_id = comment writer.      ║
-- ║ user_id mirrors the author (default auth.uid()) — used by  ║
-- ║ delete-account's service-role purge (.eq("user_id", ...)). ║
-- ╚══════════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS public.comments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     text NOT NULL,                          -- String(projectId)
  owner_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id        text NOT NULL,                          -- String(postId)
  remark_index   integer,
  author_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name    text DEFAULT '',
  author_picture text,
  body           text NOT NULL,
  user_id        uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_lookup ON public.comments(project_id, owner_id, post_id);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- Project owner, the author, and accepted collaborators on the project can read.
DROP POLICY IF EXISTS comments_select ON public.comments;
CREATE POLICY comments_select ON public.comments
  FOR SELECT USING (
    owner_id  = auth.uid()
    OR author_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.owner_id   = comments.owner_id
        AND pm.project_id = comments.project_id
        AND pm.user_id    = auth.uid()
        AND pm.status     = 'accepted'
    )
  );

DROP POLICY IF EXISTS comments_insert ON public.comments;
CREATE POLICY comments_insert ON public.comments
  FOR INSERT WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS comments_delete ON public.comments;
CREATE POLICY comments_delete ON public.comments
  FOR DELETE USING (author_id = auth.uid() OR owner_id = auth.uid());

-- ╔══════════════════════════════════════════════════════════╗
-- ║ pv_sends                                                   ║
-- ║ One row per PV email dispatch. project_id holds the        ║
-- ║ projectName string here (see sendPvByEmail).               ║
-- ║ user_id (default auth.uid()) is the owner column used by   ║
-- ║ RLS and delete-account; sent_by mirrors it.                ║
-- ╚══════════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS public.pv_sends (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text,                                       -- projectName string
  pv_number  text,                                       -- PV/OPR number (kept text)
  sent_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_to    jsonb,                                      -- recipient(s); may be an array
  resend_id  text DEFAULT '',
  user_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  sent_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pv_sends_lookup ON public.pv_sends(project_id, pv_number);

ALTER TABLE public.pv_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pv_sends_select ON public.pv_sends;
CREATE POLICY pv_sends_select ON public.pv_sends
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS pv_sends_insert ON public.pv_sends;
CREATE POLICY pv_sends_insert ON public.pv_sends
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS pv_sends_delete ON public.pv_sends;
CREATE POLICY pv_sends_delete ON public.pv_sends
  FOR DELETE USING (user_id = auth.uid());

-- ╔══════════════════════════════════════════════════════════╗
-- ║ pv_reads                                                   ║
-- ║ Email open tracking. Written ONLY by the track-pv-read     ║
-- ║ Edge Function via the service role (no user context).      ║
-- ║ pv_id is an opaque "projectName-pvNumber" string.          ║
-- ╚══════════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS public.pv_reads (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pv_id      text NOT NULL,
  read_at    timestamptz NOT NULL DEFAULT now(),
  ip         text,
  user_agent text
);

CREATE INDEX IF NOT EXISTS idx_pv_reads_pv ON public.pv_reads(pv_id, read_at DESC);

ALTER TABLE public.pv_reads ENABLE ROW LEVEL SECURITY;

-- No user/owner column exists on this table, so it cannot be owner-scoped
-- precisely. Inserts come from the service role (RLS bypassed). Reads are
-- limited to authenticated users (loadPvReads filters by the opaque pv_id).
DROP POLICY IF EXISTS pv_reads_select ON public.pv_reads;
CREATE POLICY pv_reads_select ON public.pv_reads
  FOR SELECT USING (auth.role() = 'authenticated');

-- ╔══════════════════════════════════════════════════════════╗
-- ║ analytics_events                                           ║
-- ║ Batched product analytics (flushed from the client).       ║
-- ╚══════════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event      text NOT NULL,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  device     text,                                       -- 'mobile' | 'desktop'
  page       text DEFAULT '',
  session_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_user ON public.analytics_events(user_id, created_at DESC);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS analytics_events_select ON public.analytics_events;
CREATE POLICY analytics_events_select ON public.analytics_events
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS analytics_events_insert ON public.analytics_events;
CREATE POLICY analytics_events_insert ON public.analytics_events
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- ╔══════════════════════════════════════════════════════════╗
-- ║ Storage bucket                                             ║
-- ║ "project-files" — photos uploaded under {user.id}/photos/. ║
-- ║ Public bucket (getPublicUrl is used for display).          ║
-- ╚══════════════════════════════════════════════════════════╝
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-files', 'project-files', true)
ON CONFLICT (id) DO NOTHING;

-- Owner-scoped storage policies: a user can only write/delete under a
-- top-level folder named after their own uid. Public read matches getPublicUrl.
DROP POLICY IF EXISTS project_files_read ON storage.objects;
CREATE POLICY project_files_read ON storage.objects
  FOR SELECT USING (bucket_id = 'project-files');

DROP POLICY IF EXISTS project_files_insert ON storage.objects;
CREATE POLICY project_files_insert ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'project-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS project_files_delete ON storage.objects;
CREATE POLICY project_files_delete ON storage.objects
  FOR DELETE USING (
    bucket_id = 'project-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- ------------------------------------------------------------
-- FILE: 001_rate_limits.sql
-- ------------------------------------------------------------
-- Rate limiting table for persistent rate limiting across Edge Functions
CREATE TABLE IF NOT EXISTS rate_limits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  window_start timestamptz NOT NULL DEFAULT now(),
  count integer NOT NULL DEFAULT 1,
  UNIQUE(user_id, action)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_rate_limits_user_action ON rate_limits(user_id, action);

-- RLS: only service role should access this table
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Auto-cleanup: delete expired entries older than 24h (run via pg_cron or manually)
-- SELECT cron.schedule('cleanup-rate-limits', '0 * * * *', $$DELETE FROM rate_limits WHERE window_start < now() - interval '24 hours'$$);


-- ------------------------------------------------------------
-- FILE: 002_stripe_fields.sql
-- ------------------------------------------------------------
-- Add Stripe-related fields to the profiles table
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

-- Index for fast Stripe customer lookups (used by webhooks)
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer ON profiles(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;


-- ------------------------------------------------------------
-- FILE: 003_ai_usage.sql
-- ------------------------------------------------------------
-- Monthly AI usage tracking for plan limit enforcement (maxAiPerMonth).
-- One row per (user, calendar month). The year_month key is "YYYY-MM" in UTC.
CREATE TABLE IF NOT EXISTS ai_usage (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year_month text NOT NULL,
  count      integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, year_month)
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_month ON ai_usage(user_id, year_month);

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

-- Users can read their own counter (to display usage in the UI).
DROP POLICY IF EXISTS "ai_usage_self_read" ON ai_usage;
CREATE POLICY "ai_usage_self_read" ON ai_usage
  FOR SELECT USING (auth.uid() = user_id);

-- Writes are done via Edge Functions with service role only (no insert/update policy).


-- ------------------------------------------------------------
-- FILE: 004_organizations.sql
-- ------------------------------------------------------------
-- ─────────────────────────────────────────────────────────────
-- Phase 1 — Multi-tenant foundations for the Team plan
--
-- An "organization" is an architecture firm subscribing to Team. It owns
-- a shared workspace with multiple seats. Personal accounts (Free/Pro)
-- keep using user_data unchanged — orgs introduce a parallel storage
-- (organization_data) so we don't risk regressions on existing rows.
-- ─────────────────────────────────────────────────────────────

-- ─── Organizations (Team tenants) ────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  plan text NOT NULL DEFAULT 'team',
  -- Total authorized seats (3 included by default; raised when the admin
  -- adds extra paid seats — Stripe sync will keep this in line later).
  seat_limit int NOT NULL DEFAULT 3,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','past_due','unpaid','archived')),
  grace_period_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organizations_owner ON organizations(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_organizations_stripe ON organizations(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- ─── Members (occupied seats) ────────────────────────────────
CREATE TABLE IF NOT EXISTS organization_members (
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','admin','member','viewer')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  invited_by uuid REFERENCES auth.users(id),
  PRIMARY KEY (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);

-- ─── Pending email invitations ───────────────────────────────
CREATE TABLE IF NOT EXISTS organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','member','viewer')),
  invited_by uuid REFERENCES auth.users(id),
  token text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','expired','revoked')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_invitations_email
  ON organization_invitations(lower(email))
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_org_invitations_token
  ON organization_invitations(token)
  WHERE status = 'pending';

-- ─── Org-scoped projects storage (mirrors user_data) ─────────
-- One row per organization, projects stored as a JSONB array (same
-- pattern as user_data so the client can swap data sources easily).
CREATE TABLE IF NOT EXISTS organization_data (
  org_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  projects jsonb NOT NULL DEFAULT '[]'::jsonb,
  active_id int,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Helpers (SECURITY DEFINER to avoid recursive RLS lookups) ──
CREATE OR REPLACE FUNCTION public.is_org_member(_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organization_members
    WHERE org_id = _org_id
      AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organization_members
    WHERE org_id = _org_id
      AND user_id = auth.uid()
      AND role IN ('owner','admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_write_org_data(_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organization_members
    WHERE org_id = _org_id
      AND user_id = auth.uid()
      AND role IN ('owner','admin','member')
  );
$$;

-- ─── Row-Level Security ──────────────────────────────────────
ALTER TABLE organizations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members      ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_data         ENABLE ROW LEVEL SECURITY;

-- organizations: read if member, update/delete if admin/owner.
-- INSERT goes through the create-org Edge Function (service role) so
-- there's no permissive insert policy here.
DROP POLICY IF EXISTS orgs_select ON organizations;
CREATE POLICY orgs_select ON organizations
  FOR SELECT
  USING (public.is_org_member(id));

DROP POLICY IF EXISTS orgs_update ON organizations;
CREATE POLICY orgs_update ON organizations
  FOR UPDATE
  USING (public.is_org_admin(id));

DROP POLICY IF EXISTS orgs_delete ON organizations;
CREATE POLICY orgs_delete ON organizations
  FOR DELETE
  USING (auth.uid() = owner_user_id);

-- organization_members: read if member, write if admin/owner.
DROP POLICY IF EXISTS org_members_select ON organization_members;
CREATE POLICY org_members_select ON organization_members
  FOR SELECT
  USING (public.is_org_member(org_id));

DROP POLICY IF EXISTS org_members_write ON organization_members;
CREATE POLICY org_members_write ON organization_members
  FOR ALL
  USING (public.is_org_admin(org_id));

-- organization_invitations: members of the org see them OR the invitee
-- sees their own pending invitation by email match.
DROP POLICY IF EXISTS org_invitations_select ON organization_invitations;
CREATE POLICY org_invitations_select ON organization_invitations
  FOR SELECT
  USING (
    public.is_org_member(org_id)
    OR lower(email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
  );

DROP POLICY IF EXISTS org_invitations_write ON organization_invitations;
CREATE POLICY org_invitations_write ON organization_invitations
  FOR ALL
  USING (public.is_org_admin(org_id));

-- organization_data: members can read; viewers cannot write.
DROP POLICY IF EXISTS org_data_select ON organization_data;
CREATE POLICY org_data_select ON organization_data
  FOR SELECT
  USING (public.is_org_member(org_id));

DROP POLICY IF EXISTS org_data_write ON organization_data;
CREATE POLICY org_data_write ON organization_data
  FOR ALL
  USING (public.can_write_org_data(org_id));

-- ─── updated_at triggers ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organizations_touch_updated_at ON organizations;
CREATE TRIGGER organizations_touch_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS organization_data_touch_updated_at ON organization_data;
CREATE TRIGGER organization_data_touch_updated_at
  BEFORE UPDATE ON organization_data
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();


-- ------------------------------------------------------------
-- FILE: 005_fix_invitations_select_policy.sql
-- ------------------------------------------------------------
-- ─────────────────────────────────────────────────────────────
-- Fix: organization_invitations SELECT policy was using a subquery
-- against auth.users which the `authenticated` role cannot read.
-- That broke the policy for owners/admins viewing their own org's
-- pending invitations: the list came back empty even though the
-- rows existed.
--
-- Replace the subquery with `auth.jwt() ->> 'email'`, which reads
-- the email straight from the JWT claims — no table access needed.
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS org_invitations_select ON organization_invitations;

CREATE POLICY org_invitations_select ON organization_invitations
  FOR SELECT
  USING (
    public.is_org_member(org_id)
    OR lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );


-- ------------------------------------------------------------
-- FILE: 006_onboarding_field.sql
-- ------------------------------------------------------------
-- ─────────────────────────────────────────────────────────────
-- Move the "onboarding done" flag off browser localStorage and onto
-- the profiles row, so it can't bleed between accounts on a shared
-- browser. Backfill anyone who already has a name + structure since
-- they almost certainly completed onboarding under the old check.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

UPDATE profiles
SET onboarding_completed_at = now()
WHERE onboarding_completed_at IS NULL
  AND name IS NOT NULL AND name <> ''
  AND structure IS NOT NULL AND structure <> '';


-- ------------------------------------------------------------
-- FILE: 007_block_team_downgrade.sql
-- ------------------------------------------------------------
-- ─────────────────────────────────────────────────────────────
-- Phase 5.1 — Server-side guard against silently downgrading from
-- Team to Pro/Free while still owning an active organisation with
-- other members. The client may have its own check, but this trigger
-- is the safety net: even a direct profile update via SQL is rejected.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.block_team_downgrade_with_members()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  member_count int;
BEGIN
  -- Only fire when leaving the team plan
  IF OLD.plan = 'team' AND NEW.plan <> 'team' THEN
    SELECT COUNT(*) INTO member_count
    FROM organization_members om
    JOIN organizations o ON o.id = om.org_id
    WHERE o.owner_user_id = NEW.id
      AND o.status = 'active';

    IF member_count > 1 THEN
      RAISE EXCEPTION 'team_downgrade_blocked: % membres actifs dans votre agence. Retirez-les, transférez la propriété ou supprimez l''agence avant de rétrograder.', member_count
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_block_team_downgrade ON profiles;
CREATE TRIGGER profiles_block_team_downgrade
  BEFORE UPDATE OF plan ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.block_team_downgrade_with_members();


-- ------------------------------------------------------------
-- FILE: 008_opr_signature_requests.sql
-- ------------------------------------------------------------
-- ─────────────────────────────────────────────────────────────
-- OPR — demandes de signature à distance
--
-- Workflow : l'architecte génère un OPR puis crée N demandes de signature
-- (une par signataire). Chaque demande porte un token unique permettant à
-- son destinataire d'accéder à une page publique (sans login) pour signer
-- au doigt/souris. La signature finale (PNG dataUrl) est stockée ici, et
-- le PDF consolidé est régénéré côté client à partir des entrées signées.
--
-- Le token est l'unique authentification pour la page publique — il doit
-- donc être imprévisible (≥ 32 caractères) et son cycle de vie strict
-- (status + expires_at). Un token signé ne peut plus être réutilisé.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS opr_signature_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Lien vers l'architecte qui a émis la demande (RLS s'appuie dessus).
  -- Le projet vit dans user_data JSONB côté client, donc on ne référence
  -- pas une projects(id) — on conserve juste un identifiant texte stable.
  owner_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id      text NOT NULL,
  project_name    text NOT NULL,
  opr_id          text NOT NULL,
  opr_number      int  NOT NULL,
  opr_date        text NOT NULL,
  opr_type        text NOT NULL DEFAULT 'provisoire'
                  CHECK (opr_type IN ('provisoire','definitive')),

  -- Snapshot figé : la liste des réserves au moment de l'envoi. Permet
  -- au signataire de voir le document tel qu'il était, même si l'archi
  -- les modifie ensuite (preuve d'intégrité). Hash SHA-256 stocké pour
  -- vérification ultérieure.
  reserves_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  reserves_hash     text,

  -- Signataire ciblé
  signatory_name  text NOT NULL,
  signatory_role  text,
  signatory_email text NOT NULL,

  -- Authentification publique : token aléatoire 32+ chars
  token           text UNIQUE NOT NULL,

  -- Cycle de vie
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','signed','declined','expired')),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '14 days'),

  -- Résultat de signature
  signature_data_url text,       -- PNG base64
  signed_at          timestamptz,
  signed_ip          text,
  signed_user_agent  text,
  decline_reason     text,

  -- Trace d'envoi email
  sent_at           timestamptz NOT NULL DEFAULT now(),
  resend_id         text,
  reminded_at       timestamptz,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opr_sigreq_owner   ON opr_signature_requests(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_opr_sigreq_project ON opr_signature_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_opr_sigreq_opr     ON opr_signature_requests(opr_id);
CREATE INDEX IF NOT EXISTS idx_opr_sigreq_token   ON opr_signature_requests(token);
CREATE INDEX IF NOT EXISTS idx_opr_sigreq_status  ON opr_signature_requests(status, expires_at);

-- ── RLS ──────────────────────────────────────────────────────
-- L'architecte (owner) a accès complet via JWT auth.uid().
-- L'écriture par token (signature soumise) passe par une Edge Function
-- en service-role — donc la RLS bloque tout accès anon direct (sécurité).
ALTER TABLE opr_signature_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner reads own requests"
  ON opr_signature_requests FOR SELECT
  USING (auth.uid() = owner_user_id);

CREATE POLICY "owner inserts own requests"
  ON opr_signature_requests FOR INSERT
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "owner updates own requests"
  ON opr_signature_requests FOR UPDATE
  USING (auth.uid() = owner_user_id);

CREATE POLICY "owner deletes own requests"
  ON opr_signature_requests FOR DELETE
  USING (auth.uid() = owner_user_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION trg_opr_sigreq_touch()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS opr_sigreq_touch ON opr_signature_requests;
CREATE TRIGGER opr_sigreq_touch
BEFORE UPDATE ON opr_signature_requests
FOR EACH ROW EXECUTE FUNCTION trg_opr_sigreq_touch();


-- ------------------------------------------------------------
-- FILE: 009_opr_notifications_types.sql
-- ------------------------------------------------------------
-- ─────────────────────────────────────────────────────────────
-- Étend la table `notifications` pour accepter les types OPR.
--
-- Le INSERT depuis l'Edge Function `opr-signing` échoue silencieusement
-- si une CHECK constraint sur `type` n'autorise pas les nouvelles
-- valeurs (opr_signed / opr_declined / opr_completed). On fait sauter
-- la contrainte si elle existe — on garde le typage côté code.
--
-- On s'assure aussi que la table est bien dans la publication realtime
-- pour que la souscription côté client reçoive les INSERT en live.
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  rec record;
BEGIN
  -- Drop any CHECK constraint involving the column "type" on "notifications".
  -- Le nom exact n'est pas connu (auto-généré ou custom), on les drop tous.
  FOR rec IN
    SELECT c.conname AS conname
    FROM pg_constraint c
    JOIN pg_class cls ON cls.oid = c.conrelid
    JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
    WHERE cls.relname = 'notifications'
      AND nsp.nspname = 'public'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%type%'
  LOOP
    EXECUTE format('ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS %I', rec.conname);
  END LOOP;
END $$;

-- Add table to supabase_realtime publication if not already.
-- supabase-js .channel().on('postgres_changes') ne reçoit les events que
-- pour les tables présentes dans cette publication.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications';
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    -- Publication inexistante en local dev — pas grave
    NULL;
END $$;


-- ------------------------------------------------------------
-- FILE: 010_reserve_templates.sql
-- ------------------------------------------------------------
-- ─────────────────────────────────────────────────────────────
-- F8 — Bibliothèque de réserves types
--
-- Catalogue (perso + partagé + système) de réserves récurrentes que
-- l'architecte saisit en quelques clics au lieu de retaper « joint
-- silicone manquant cuisine » à chaque OPR.
--
-- Trois niveaux de visibilité :
--   1. owner_user_id = X, org_id = NULL  → modèle perso (read/write own)
--   2. owner_user_id = NULL, org_id = Y  → modèle partagé dans l'agence
--   3. owner_user_id = NULL, org_id = NULL, is_system = true → seed commun
--      (visible à tous, non éditable — sert de bibliothèque de démarrage)
--
-- Le tri d'autocomplete utilise `usage_count` : plus un modèle est
-- choisi, plus il remonte. Pour les modèles système, le compteur est
-- global (signal de popularité communautaire) ; pour les perso, il est
-- propre à l'utilisateur.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reserve_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- NULL pour les modèles système / partagés (org)
  owner_user_id   uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id          uuid REFERENCES organizations(id) ON DELETE CASCADE,
  is_system       boolean NOT NULL DEFAULT false,

  description     text NOT NULL,
  default_severity text NOT NULL DEFAULT 'major'
                  CHECK (default_severity IN ('critical','major','minor','cosmetic')),
  default_contractor_type text,
  category        text,

  usage_count     int NOT NULL DEFAULT 0,
  last_used_at    timestamptz,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Au moins une dimension d'appartenance doit être renseignée
  CONSTRAINT reserve_templates_scope_check
    CHECK (owner_user_id IS NOT NULL OR org_id IS NOT NULL OR is_system = true)
);

CREATE INDEX IF NOT EXISTS idx_reserve_templates_owner
  ON reserve_templates(owner_user_id, usage_count DESC)
  WHERE owner_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reserve_templates_org
  ON reserve_templates(org_id, usage_count DESC)
  WHERE org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reserve_templates_system
  ON reserve_templates(usage_count DESC)
  WHERE is_system = true;

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE reserve_templates ENABLE ROW LEVEL SECURITY;

-- SELECT : ses propres modèles + ceux de son agence + les modèles système
DROP POLICY IF EXISTS reserve_templates_select ON reserve_templates;
CREATE POLICY reserve_templates_select ON reserve_templates
  FOR SELECT
  USING (
    auth.uid() = owner_user_id
    OR (org_id IS NOT NULL AND public.is_org_member(org_id))
    OR is_system = true
  );

-- INSERT : un user peut créer un modèle perso pour lui-même, ou un modèle
-- org pour une agence dont il est membre (admin/owner/member, pas viewer).
-- Les modèles système sont insérés via cette migration (seed) ou via
-- service-role (jamais via le client).
DROP POLICY IF EXISTS reserve_templates_insert ON reserve_templates;
CREATE POLICY reserve_templates_insert ON reserve_templates
  FOR INSERT
  WITH CHECK (
    is_system = false
    AND (
      (owner_user_id = auth.uid() AND org_id IS NULL)
      OR (org_id IS NOT NULL AND public.can_write_org_data(org_id))
    )
  );

-- UPDATE / DELETE : seulement ses propres modèles, ou ceux de son agence
-- s'il a les droits d'écriture. Les modèles système sont immuables côté user.
DROP POLICY IF EXISTS reserve_templates_update ON reserve_templates;
CREATE POLICY reserve_templates_update ON reserve_templates
  FOR UPDATE
  USING (
    is_system = false
    AND (
      auth.uid() = owner_user_id
      OR (org_id IS NOT NULL AND public.can_write_org_data(org_id))
    )
  );

DROP POLICY IF EXISTS reserve_templates_delete ON reserve_templates;
CREATE POLICY reserve_templates_delete ON reserve_templates
  FOR DELETE
  USING (
    is_system = false
    AND (
      auth.uid() = owner_user_id
      OR (org_id IS NOT NULL AND public.can_write_org_data(org_id))
    )
  );

-- ── updated_at trigger ───────────────────────────────────────
DROP TRIGGER IF EXISTS reserve_templates_touch_updated_at ON reserve_templates;
CREATE TRIGGER reserve_templates_touch_updated_at
  BEFORE UPDATE ON reserve_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

-- ── RPC : incrémente usage_count atomiquement ────────────────
-- Appelée à chaque fois qu'un modèle est utilisé (description copiée
-- dans une nouvelle réserve). SECURITY DEFINER pour pouvoir incrémenter
-- les modèles système malgré la RLS (mais on vérifie la lecture).
CREATE OR REPLACE FUNCTION public.increment_reserve_template_usage(_template_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Re-vérifie que l'utilisateur a bien accès au modèle (sinon il pourrait
  -- incrémenter n'importe quel id deviné).
  IF NOT EXISTS (
    SELECT 1 FROM reserve_templates
    WHERE id = _template_id
      AND (
        owner_user_id = auth.uid()
        OR (org_id IS NOT NULL AND public.is_org_member(org_id))
        OR is_system = true
      )
  ) THEN
    RAISE EXCEPTION 'Template not found or not accessible';
  END IF;

  UPDATE reserve_templates
  SET usage_count = usage_count + 1,
      last_used_at = now()
  WHERE id = _template_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_reserve_template_usage(uuid) TO authenticated;

-- ── Seed : bibliothèque système de ~50 réserves classiques ───
-- Catégories alignées sur les lots de chantier belges les plus courants.
-- Sévérité par défaut : "major" sauf cosmétique évident.
INSERT INTO reserve_templates (is_system, description, default_severity, default_contractor_type, category) VALUES
  -- Finitions / Peinture / Plâtrerie
  (true, 'Joint silicone manquant ou défaillant',                    'minor',    'Finitions',     'Finitions'),
  (true, 'Peinture éclatée ou écaillée',                              'cosmetic', 'Peinture',      'Finitions'),
  (true, 'Coulure ou trace de pinceau sur peinture',                  'cosmetic', 'Peinture',      'Finitions'),
  (true, 'Différence de teinte entre lés de peinture',                'minor',    'Peinture',      'Finitions'),
  (true, 'Plinthe descellée ou décollée',                             'minor',    'Finitions',     'Finitions'),
  (true, 'Enduit fissuré ou cloqué',                                  'major',    'Plâtrerie',     'Finitions'),
  (true, 'Raccord enduit / plafond non net',                          'minor',    'Plâtrerie',     'Finitions'),
  -- Sol / Carrelage
  (true, 'Carrelage fissuré ou cassé',                                'major',    'Carrelage',     'Sol'),
  (true, 'Carrelage mal aligné ou joints irréguliers',                'minor',    'Carrelage',     'Sol'),
  (true, 'Carrelage qui sonne creux',                                 'major',    'Carrelage',     'Sol'),
  (true, 'Parquet rayé ou marqué',                                    'minor',    'Parquet',       'Sol'),
  (true, 'Parquet qui grince ou se soulève',                          'major',    'Parquet',       'Sol'),
  (true, 'Plinthe mal coupée à l''angle',                             'minor',    'Finitions',     'Sol'),
  -- Étanchéité / Humidité
  (true, 'Trace d''humidité visible',                                 'major',    'Étanchéité',    'Étanchéité'),
  (true, 'Auréole ou tache au plafond',                               'major',    'Étanchéité',    'Étanchéité'),
  (true, 'Joint d''étanchéité dégradé',                               'major',    'Étanchéité',    'Étanchéité'),
  (true, 'Infiltration en pied de mur',                               'critical', 'Étanchéité',    'Étanchéité'),
  (true, 'Condensation excessive sur menuiseries',                    'major',    'HVAC',          'Étanchéité'),
  -- Menuiseries intérieures
  (true, 'Porte intérieure qui frotte ou ne ferme pas',               'minor',    'Menuiserie',    'Menuiseries'),
  (true, 'Serrure défectueuse ou clé bloquée',                        'major',    'Menuiserie',    'Menuiseries'),
  (true, 'Chambranle de porte mal posé',                              'minor',    'Menuiserie',    'Menuiseries'),
  (true, 'Plinthe ou chambranle manquant',                            'minor',    'Menuiserie',    'Menuiseries'),
  -- Menuiseries extérieures
  (true, 'Châssis qui ne ferme pas hermétiquement',                   'major',    'Menuiserie',    'Châssis'),
  (true, 'Vitrage rayé ou ébréché',                                   'major',    'Vitrerie',      'Châssis'),
  (true, 'Joint de châssis manquant ou décollé',                      'major',    'Menuiserie',    'Châssis'),
  (true, 'Quincaillerie de châssis défectueuse',                      'minor',    'Menuiserie',    'Châssis'),
  -- Électricité
  (true, 'Prise électrique non fixée ou mal alignée',                 'minor',    'Électricité',   'Électricité'),
  (true, 'Interrupteur défectueux',                                   'major',    'Électricité',   'Électricité'),
  (true, 'Point lumineux non fonctionnel',                            'major',    'Électricité',   'Électricité'),
  (true, 'Circuit non identifié au tableau',                          'major',    'Électricité',   'Électricité'),
  (true, 'Mise à la terre absente ou défectueuse',                    'critical', 'Électricité',   'Électricité'),
  -- Sanitaire
  (true, 'Fuite visible sous évier / lavabo',                         'critical', 'Sanitaire',     'Sanitaire'),
  (true, 'Robinet qui goutte ou mal fixé',                            'minor',    'Sanitaire',     'Sanitaire'),
  (true, 'Évacuation lente ou bouchée',                               'major',    'Sanitaire',     'Sanitaire'),
  (true, 'WC mal fixé ou qui bouge',                                  'major',    'Sanitaire',     'Sanitaire'),
  (true, 'Siphon manquant ou non posé',                               'major',    'Sanitaire',     'Sanitaire'),
  -- HVAC / Chauffage
  (true, 'Radiateur non fonctionnel',                                 'major',    'HVAC',          'HVAC'),
  (true, 'Thermostat non câblé ou non programmé',                     'minor',    'HVAC',          'HVAC'),
  (true, 'VMC bruyante ou non fonctionnelle',                         'major',    'HVAC',          'HVAC'),
  (true, 'Bouche d''extraction obstruée',                             'major',    'HVAC',          'HVAC'),
  -- Gros œuvre / Maçonnerie
  (true, 'Fissure visible sur mur porteur',                           'critical', 'Gros œuvre',    'Gros œuvre'),
  (true, 'Fissure de retrait sur enduit',                             'minor',    'Plâtrerie',     'Gros œuvre'),
  (true, 'Mur non d''aplomb',                                         'major',    'Gros œuvre',    'Gros œuvre'),
  (true, 'Linteau apparent ou mal masqué',                            'minor',    'Gros œuvre',    'Gros œuvre'),
  -- Toiture / Couverture
  (true, 'Tuile cassée ou déplacée',                                  'major',    'Couverture',    'Toiture'),
  (true, 'Gouttière mal fixée ou désalignée',                         'major',    'Couverture',    'Toiture'),
  (true, 'Solin défectueux en pied de cheminée',                      'major',    'Couverture',    'Toiture'),
  -- Sécurité / Conformité
  (true, 'Garde-corps non conforme ou manquant',                      'critical', 'Sécurité',      'Sécurité'),
  (true, 'Détecteur de fumée non posé ou non fonctionnel',            'critical', 'Sécurité',      'Sécurité'),
  (true, 'Resserrage coupe-feu non réalisé',                          'critical', 'Sécurité',      'Sécurité'),
  (true, 'Nez de marche glissant ou non visible',                     'major',    'Sécurité',      'Sécurité'),
  -- Nettoyage / livraison
  (true, 'Local non nettoyé / déchets de chantier présents',          'minor',    'Nettoyage',     'Réception'),
  (true, 'Étiquettes / protections non retirées',                     'minor',    'Nettoyage',     'Réception')
ON CONFLICT DO NOTHING;


-- ------------------------------------------------------------
-- FILE: 011_invoicing.sql
-- ------------------------------------------------------------
-- ─────────────────────────────────────────────────────────────
-- F1 — Honoraires & facturation par phases
--
-- L'architecte facture par tranches indexées sur les phases du projet
-- (esquisse, AVP, permis, exécution, chantier, réception). Cette
-- migration crée :
--   1. `invoices`           — une facture par ligne, lien optionnel
--      à une phase du projet (phase_id = id JSONB côté client).
--   2. `invoice_counters`   — compteur per-user-per-year pour
--      générer des numéros TVA conformes (format "YYYY-NNN" séquentiel
--      par année, comme l'exige le SPF Finances belge).
--   3. `next_invoice_number()` RPC — incrément atomique du compteur
--      avec verrou pessimiste, pour qu'aucun doublon ne soit possible
--      même en cas de double-clic ou de course concurrente.
--
-- v1 sans intégration paiement : pas de Stripe, pas de webhook bancaire,
-- pas de relance automatique (sera F5 + extension F1). On stocke juste
-- les factures, le PDF est généré côté client (comme PV/OPR) et l'archi
-- déclenche manuellement les changements de statut.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Owner : la facture appartient à un user (perso) ou à une agence (Team).
  -- RLS s'appuie dessus.
  owner_user_id   uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id          uuid REFERENCES organizations(id) ON DELETE CASCADE,

  -- Référence au projet (text car le projet vit dans user_data JSONB).
  -- phase_id est l'identifiant de la phase telle que stockée dans
  -- project.phases[] côté client (ex : "permit", "execution", "reception").
  project_id      text NOT NULL,
  project_name    text,    -- snapshot pour affichage hors-projet
  phase_id        text,
  phase_label     text,    -- snapshot label phase au moment de l'émission

  -- Numéro TVA séquentiel "YYYY-NNN" — généré atomiquement via RPC.
  -- Unique par owner pour ne pas exposer le compteur d'un user à un autre.
  number          text NOT NULL,

  -- Client facturé (snapshot — l'archi peut éditer une facture sans que
  -- les modifs participants/MO du projet rétroactivent la facture)
  client_name     text NOT NULL,
  client_address  text,
  client_vat      text,    -- BE0XXX.XXX.XXX si pro

  description     text NOT NULL,
  amount_ht       numeric(10,2) NOT NULL CHECK (amount_ht >= 0),
  vat_rate        numeric(4,2)  NOT NULL DEFAULT 21
                  CHECK (vat_rate IN (0, 6, 12, 21)),  -- taux belges autorisés
  -- Colonnes calculées : pas de drift possible entre HT / TVA / TTC.
  -- round(..., 2) car numeric(10,2) — sinon Postgres rejette la précision.
  amount_vat      numeric(10,2) GENERATED ALWAYS AS (round(amount_ht * vat_rate / 100, 2)) STORED,
  amount_ttc      numeric(10,2) GENERATED ALWAYS AS (round(amount_ht * (1 + vat_rate / 100), 2)) STORED,

  issue_date      date NOT NULL,
  due_date        date NOT NULL,

  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','sent','paid','overdue','cancelled')),
  sent_at         timestamptz,
  paid_at         timestamptz,
  payment_method  text,         -- "virement", "stripe" (v2), etc.
  payment_ref     text,         -- communication structurée ou ref banque

  pdf_url         text,         -- si on stocke une copie en Storage (v2)
  reminder_count  int NOT NULL DEFAULT 0,
  last_reminder_at timestamptz,

  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Au moins une dimension d'appartenance
  CONSTRAINT invoices_scope_check
    CHECK (owner_user_id IS NOT NULL OR org_id IS NOT NULL),
  -- Numéro unique par owner (perso ou agence)
  CONSTRAINT invoices_number_unique_user UNIQUE (owner_user_id, number)
);

CREATE INDEX IF NOT EXISTS idx_invoices_owner
  ON invoices(owner_user_id, issue_date DESC)
  WHERE owner_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_org
  ON invoices(org_id, issue_date DESC)
  WHERE org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_project
  ON invoices(project_id);

CREATE INDEX IF NOT EXISTS idx_invoices_status_due
  ON invoices(status, due_date)
  WHERE status IN ('sent', 'overdue');

-- ── Compteur per-user-per-year pour numérotation TVA ─────────
CREATE TABLE IF NOT EXISTS invoice_counters (
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year          int  NOT NULL,
  last_n        int  NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_user_id, year)
);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_counters ENABLE ROW LEVEL SECURITY;

-- invoices : owner lit/écrit ses factures ; membres d'org peuvent lire,
-- membres avec droit d'écriture peuvent CUD.
DROP POLICY IF EXISTS invoices_select ON invoices;
CREATE POLICY invoices_select ON invoices
  FOR SELECT
  USING (
    auth.uid() = owner_user_id
    OR (org_id IS NOT NULL AND public.is_org_member(org_id))
  );

DROP POLICY IF EXISTS invoices_insert ON invoices;
CREATE POLICY invoices_insert ON invoices
  FOR INSERT
  WITH CHECK (
    (owner_user_id = auth.uid() AND org_id IS NULL)
    OR (org_id IS NOT NULL AND public.can_write_org_data(org_id))
  );

DROP POLICY IF EXISTS invoices_update ON invoices;
CREATE POLICY invoices_update ON invoices
  FOR UPDATE
  USING (
    auth.uid() = owner_user_id
    OR (org_id IS NOT NULL AND public.can_write_org_data(org_id))
  );

DROP POLICY IF EXISTS invoices_delete ON invoices;
CREATE POLICY invoices_delete ON invoices
  FOR DELETE
  USING (
    auth.uid() = owner_user_id
    OR (org_id IS NOT NULL AND public.can_write_org_data(org_id))
  );

-- invoice_counters : lecture/écriture par RPC SECURITY DEFINER uniquement —
-- on bloque tout accès direct depuis le client pour empêcher manipulation.
DROP POLICY IF EXISTS invoice_counters_no_direct ON invoice_counters;
CREATE POLICY invoice_counters_no_direct ON invoice_counters
  FOR ALL USING (false) WITH CHECK (false);

-- ── updated_at triggers ──────────────────────────────────────
DROP TRIGGER IF EXISTS invoices_touch_updated_at ON invoices;
CREATE TRIGGER invoices_touch_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS invoice_counters_touch_updated_at ON invoice_counters;
CREATE TRIGGER invoice_counters_touch_updated_at
  BEFORE UPDATE ON invoice_counters
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

-- ── RPC : next_invoice_number(year) ──────────────────────────
-- Incrément atomique sous verrou (FOR UPDATE) → impossible d'obtenir
-- deux fois le même numéro même en cas de course. Retourne "YYYY-NNN"
-- avec NNN zéro-paddé sur 3 chiffres (ex "2026-001").
-- L'archi peut surcharger manuellement le numéro à la création s'il
-- reprend une numérotation existante (champ libre côté client) — la
-- contrainte UNIQUE empêche les collisions.
CREATE OR REPLACE FUNCTION public.next_invoice_number(_year int)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  n int;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Upsert + lock + increment + return
  INSERT INTO invoice_counters (owner_user_id, year, last_n)
  VALUES (uid, _year, 1)
  ON CONFLICT (owner_user_id, year)
  DO UPDATE SET last_n = invoice_counters.last_n + 1,
                updated_at = now()
  RETURNING last_n INTO n;

  RETURN _year::text || '-' || lpad(n::text, 3, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_invoice_number(int) TO authenticated;

-- ── Champs émetteur sur `profiles` ──────────────────────────
-- Pour générer un PDF de facture conforme TVA belge il faut l'IBAN du
-- bureau et son n° de TVA. On les stocke sur le profil utilisateur
-- (cohérent avec les autres infos pro déjà là : structure, address, etc.)
-- pour ne pas les ressaisir à chaque facture.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS iban text,
  ADD COLUMN IF NOT EXISTS vat_number text,
  ADD COLUMN IF NOT EXISTS invoice_payment_terms_days int NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS invoice_payment_note text;



-- ------------------------------------------------------------
-- FILE: 012_permits.sql
-- ------------------------------------------------------------
-- ─────────────────────────────────────────────────────────────
-- F4 — Suivi des permis d'urbanisme
--
-- Le permis d'urbanisme est l'étape la plus stressante d'un projet :
-- plusieurs mois d'attente, courriers commune demandant des compléments,
-- délais légaux, recours possibles. Cette migration crée la table qui
-- traque tout ce cycle de vie pour chaque permis d'un projet.
--
-- Le délai légal est calculé à partir de la date d'AR (accusé de réception)
-- selon la procédure (30/75/105/230 jours en Wallonie/Bruxelles). v1 le
-- calcule côté client ; une future Edge Function pourra trigger les
-- alertes J-30 / J-7 / J-1 via cron (cf F5).
--
-- v1 sans intégration commune (pas d'API IRIS, pas de scraping). L'archi
-- saisit manuellement les dates au fil de la correspondance.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS permits (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  owner_user_id   uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id          uuid REFERENCES organizations(id) ON DELETE CASCADE,

  project_id      text NOT NULL,
  project_name    text,

  permit_type     text NOT NULL DEFAULT 'urbanisme'
                  CHECK (permit_type IN ('urbanisme','env','mixte','enseigne','demolition','autres')),
  -- Procédure légale qui détermine le délai. Les durées sont stockées en jours
  -- pour permettre du custom ; les valeurs canoniques sont 30/75/105/230.
  procedure       text NOT NULL DEFAULT '75j'
                  CHECK (procedure IN ('30j','75j','105j','230j','autres')),
  procedure_days  int,  -- override pour cas "autres"

  reference       text,                    -- n° dossier commune
  commune         text,

  -- Dates clés
  depot_date      date,
  ar_date         date,
  deadline_date   date,                    -- calculé côté client (ou cron)
  decision_date   date,
  decision_text   text,

  status          text NOT NULL DEFAULT 'preparation'
                  CHECK (status IN ('preparation','deposited','complete_request','in_review','granted','refused','recourse','expired')),

  -- Documents attachés. Forme libre JSONB :
  --   [{ name, url, type, uploaded_at }]
  -- Pour v1 on stocke juste des URLs externes / dataURLs ; l'upload Storage
  -- pourra être ajouté quand on en aura besoin.
  documents       jsonb NOT NULL DEFAULT '[]'::jsonb,

  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT permits_scope_check
    CHECK (owner_user_id IS NOT NULL OR org_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_permits_owner    ON permits(owner_user_id, project_id) WHERE owner_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_permits_org      ON permits(org_id, project_id)        WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_permits_project  ON permits(project_id);
CREATE INDEX IF NOT EXISTS idx_permits_deadline ON permits(deadline_date) WHERE deadline_date IS NOT NULL AND status IN ('deposited','complete_request','in_review');

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE permits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS permits_select ON permits;
CREATE POLICY permits_select ON permits
  FOR SELECT
  USING (
    auth.uid() = owner_user_id
    OR (org_id IS NOT NULL AND public.is_org_member(org_id))
  );

DROP POLICY IF EXISTS permits_insert ON permits;
CREATE POLICY permits_insert ON permits
  FOR INSERT
  WITH CHECK (
    (owner_user_id = auth.uid() AND org_id IS NULL)
    OR (org_id IS NOT NULL AND public.can_write_org_data(org_id))
  );

DROP POLICY IF EXISTS permits_update ON permits;
CREATE POLICY permits_update ON permits
  FOR UPDATE
  USING (
    auth.uid() = owner_user_id
    OR (org_id IS NOT NULL AND public.can_write_org_data(org_id))
  );

DROP POLICY IF EXISTS permits_delete ON permits;
CREATE POLICY permits_delete ON permits
  FOR DELETE
  USING (
    auth.uid() = owner_user_id
    OR (org_id IS NOT NULL AND public.can_write_org_data(org_id))
  );

DROP TRIGGER IF EXISTS permits_touch_updated_at ON permits;
CREATE TRIGGER permits_touch_updated_at
  BEFORE UPDATE ON permits
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();


-- ------------------------------------------------------------
-- FILE: 013_quotes.sql
-- ------------------------------------------------------------
-- ─────────────────────────────────────────────────────────────
-- F3 — Comparaison de devis (soumissions)
--
-- L'archi reçoit N devis pour un même lot (maçonnerie, électricité, etc.).
-- Aujourd'hui il recopie chaque poste dans Excel → chronophage et fautif.
-- Cette table stocke les devis avec extraction IA des postes (via
-- l'Edge Function `parse-quote` qui utilise OpenAI Vision sur le PDF).
--
-- v1 sans matching de communications ni gestion de pieces jointes en
-- Storage. Le PDF est conservé en dataURL pour la prévisualisation (peut
-- migrer vers Storage en v2 quand on aura besoin de versionner).
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS quotes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  owner_user_id   uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id          uuid REFERENCES organizations(id) ON DELETE CASCADE,

  project_id      text NOT NULL,
  lot_id          text,         -- id du lot dans project.lots[] (optionnel)
  lot_label       text,         -- snapshot du libellé pour affichage

  contractor_name  text NOT NULL,
  contractor_email text,

  -- Source PDF — soit un dataURL inliné (v1), soit une URL Storage (v2).
  -- Limite jsonb à ~1 MB en pratique côté usage Supabase.
  file_name       text,
  file_url        text,         -- pour Storage v2
  file_data_url   text,         -- pour preview v1

  -- Totaux récupérés de l'extraction IA (NULL si parsing partiel)
  total_ht        numeric(12,2),
  total_ttc       numeric(12,2),
  validity_days   int,

  -- Résultat brut du parsing IA :
  -- {
  --   items: [{ code, description, quantity, unit, unit_price_ht, total_ht, category }],
  --   summary: "texte court — points d'attention",
  --   warnings: ["postes ambigus", ...]
  -- }
  parsed          jsonb NOT NULL DEFAULT '{}'::jsonb,
  parse_status    text NOT NULL DEFAULT 'pending'
                  CHECK (parse_status IN ('pending','ok','error')),
  parse_error     text,

  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','awarded','rejected')),
  awarded_at      timestamptz,

  notes           text,
  uploaded_at     timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT quotes_scope_check
    CHECK (owner_user_id IS NOT NULL OR org_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_quotes_owner   ON quotes(owner_user_id, project_id) WHERE owner_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_org     ON quotes(org_id, project_id)        WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_project ON quotes(project_id, lot_id);

ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quotes_select ON quotes;
CREATE POLICY quotes_select ON quotes
  FOR SELECT
  USING (
    auth.uid() = owner_user_id
    OR (org_id IS NOT NULL AND public.is_org_member(org_id))
  );

DROP POLICY IF EXISTS quotes_insert ON quotes;
CREATE POLICY quotes_insert ON quotes
  FOR INSERT
  WITH CHECK (
    (owner_user_id = auth.uid() AND org_id IS NULL)
    OR (org_id IS NOT NULL AND public.can_write_org_data(org_id))
  );

DROP POLICY IF EXISTS quotes_update ON quotes;
CREATE POLICY quotes_update ON quotes
  FOR UPDATE
  USING (
    auth.uid() = owner_user_id
    OR (org_id IS NOT NULL AND public.can_write_org_data(org_id))
  );

DROP POLICY IF EXISTS quotes_delete ON quotes;
CREATE POLICY quotes_delete ON quotes
  FOR DELETE
  USING (
    auth.uid() = owner_user_id
    OR (org_id IS NOT NULL AND public.can_write_org_data(org_id))
  );

DROP TRIGGER IF EXISTS quotes_touch_updated_at ON quotes;
CREATE TRIGGER quotes_touch_updated_at
  BEFORE UPDATE ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();


-- ------------------------------------------------------------
-- FILE: 014_alert_settings.sql
-- ------------------------------------------------------------
-- ─────────────────────────────────────────────────────────────
-- F5 — Alerts & rappels intelligents
--
-- v1 : drawer d'échéances 100% client-side (agrégation en temps réel
-- des permits/invoices/réserves/tâches/OPR). Cette migration ajoute
-- juste les préférences d'alerte sur le profil pour permettre à
-- l'utilisateur d'activer/désactiver chaque type — la persistance est
-- prête pour brancher un cron pg_cron en v2 sans rebuild front.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS alert_settings jsonb NOT NULL DEFAULT '{
    "reception_definitive": true,
    "reserve_overdue":      true,
    "permit_deadline":      true,
    "task_overdue":         true,
    "invoice_overdue":      true,
    "no_pv_30d":            false,
    "email_digest":         false
  }'::jsonb;


-- ------------------------------------------------------------
-- FILE: 015_progress_reports.sql
-- ------------------------------------------------------------
-- ─────────────────────────────────────────────────────────────
-- F10 — Rapports d'avancement client
--
-- L'archi envoie périodiquement (7/15/30j) un point d'avancement au MO :
-- résumé synthétique des PV récents + best-of photos + KPIs + réserves
-- ouvertes + prochaines étapes. Pour v1 : génération à la demande
-- (l'archi clique « Générer ») + brouillon éditable avant export PDF.
-- Le cron périodique sera v2 (réutilise infra F5).
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS progress_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  owner_user_id   uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id          uuid REFERENCES organizations(id) ON DELETE CASCADE,

  project_id      text NOT NULL,
  project_name    text,

  period_start    date NOT NULL,
  period_end      date NOT NULL,

  -- Sortie de la génération IA :
  --   { summary, highlights, reserves_open, next_steps, photos[], pvs[] }
  -- Modifiable par l'archi avant export — content_html est le rendu final
  -- édité dans le WYSIWYG.
  content_md      text,         -- markdown généré par l'IA (source)
  content_html    text,         -- HTML édité par l'archi (rendu final)

  pdf_url         text,
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','reviewed','sent')),
  sent_at         timestamptz,
  sent_to         text[],

  generated_at    timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT progress_reports_scope_check
    CHECK (owner_user_id IS NOT NULL OR org_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_prog_reports_owner   ON progress_reports(owner_user_id, project_id) WHERE owner_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prog_reports_org     ON progress_reports(org_id, project_id)        WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prog_reports_project ON progress_reports(project_id, period_end DESC);

ALTER TABLE progress_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS progress_reports_select ON progress_reports;
CREATE POLICY progress_reports_select ON progress_reports
  FOR SELECT
  USING (
    auth.uid() = owner_user_id
    OR (org_id IS NOT NULL AND public.is_org_member(org_id))
  );

DROP POLICY IF EXISTS progress_reports_insert ON progress_reports;
CREATE POLICY progress_reports_insert ON progress_reports
  FOR INSERT
  WITH CHECK (
    (owner_user_id = auth.uid() AND org_id IS NULL)
    OR (org_id IS NOT NULL AND public.can_write_org_data(org_id))
  );

DROP POLICY IF EXISTS progress_reports_update ON progress_reports;
CREATE POLICY progress_reports_update ON progress_reports
  FOR UPDATE
  USING (
    auth.uid() = owner_user_id
    OR (org_id IS NOT NULL AND public.can_write_org_data(org_id))
  );

DROP POLICY IF EXISTS progress_reports_delete ON progress_reports;
CREATE POLICY progress_reports_delete ON progress_reports
  FOR DELETE
  USING (
    auth.uid() = owner_user_id
    OR (org_id IS NOT NULL AND public.can_write_org_data(org_id))
  );

DROP TRIGGER IF EXISTS progress_reports_touch_updated_at ON progress_reports;
CREATE TRIGGER progress_reports_touch_updated_at
  BEFORE UPDATE ON progress_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();


-- ------------------------------------------------------------
-- FILE: 016_web_push_subscriptions.sql
-- ------------------------------------------------------------
-- ─────────────────────────────────────────────────────────────
-- Mobile Étape 4 — Web Push notifications
--
-- v1 : on stocke les abonnements Web Push (endpoint + clés p256dh + auth)
-- par utilisateur. Un même utilisateur peut être abonné depuis plusieurs
-- appareils (téléphone, desktop, tablette), d'où la clé composite
-- (user_id, endpoint).
--
-- Les push réels sont envoyés par l'edge function `send-push-notification`
-- qui charge tous les abonnements actifs d'un user et appelle la lib
-- web-push avec les VAPID keys stockées en secrets.
--
-- Préférences (toggles par catégorie) : on étend `profiles` avec une
-- colonne JSONB `push_settings`. v1 : 6 catégories alignées sur les types
-- de notifications déjà émis par l'app.
-- ─────────────────────────────────────────────────────────────

-- Table des abonnements Web Push par appareil
CREATE TABLE IF NOT EXISTS web_push_subscriptions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint         text NOT NULL,
  p256dh_key       text NOT NULL,
  auth_key         text NOT NULL,
  user_agent       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_used_at     timestamptz,
  UNIQUE (user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS web_push_subscriptions_user_id_idx
  ON web_push_subscriptions(user_id);

-- RLS : un user ne voit/modifie que ses propres abonnements.
-- L'edge function utilise le service role et bypass RLS pour push.
ALTER TABLE web_push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS web_push_sub_select_own ON web_push_subscriptions;
CREATE POLICY web_push_sub_select_own ON web_push_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS web_push_sub_insert_own ON web_push_subscriptions;
CREATE POLICY web_push_sub_insert_own ON web_push_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS web_push_sub_update_own ON web_push_subscriptions;
CREATE POLICY web_push_sub_update_own ON web_push_subscriptions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS web_push_sub_delete_own ON web_push_subscriptions;
CREATE POLICY web_push_sub_delete_own ON web_push_subscriptions
  FOR DELETE USING (auth.uid() = user_id);

-- ── Préférences push par utilisateur (toggles granulaires) ──
--
-- enabled        : kill-switch global ; si false, aucun push n'est envoyé
--                  même si les sous-toggles sont à true.
-- opr            : OPR signé / refusé / completed
-- permits        : permis avec échéance proche
-- reserves       : réserve critique non levée depuis 30 jours
-- invoices       : facture impayée passée la due_date
-- collab         : invitation acceptée, modif coéquipier
-- reception      : reception définitive (J-30 anniversaire OPR provisoire)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS push_settings jsonb NOT NULL DEFAULT '{
    "enabled":   true,
    "opr":       true,
    "permits":   true,
    "reserves":  true,
    "invoices":  true,
    "collab":    true,
    "reception": true
  }'::jsonb;


-- ------------------------------------------------------------
-- FILE: 017_drop_org_layer.sql
-- ------------------------------------------------------------
-- ─────────────────────────────────────────────────────────────
-- 017 — CUT de l'étage agence (POC solo-first)
--
-- Retire tout le multi-tenant « agence » : tables organizations*,
-- conteneur organization_data, et fonctions RLS org. AVANT de dropper
-- les fonctions, on RÉÉCRIT les policies des tables CONSERVÉES en
-- `owner_user_id` seul (sinon l'accès perso casserait — c'est le point
-- de rupture le plus probable).
--
-- ⚠️ ORDRE IMPÉRATIF : (1) réécrire les policies → (2) réécrire le RPC
-- reserve_templates → (3) dropper tables org → (4) dropper fonctions org.
--
-- ⚠️ VÉRIFICATION MANUELLE AVANT APPLICATION (hors repo) :
--   Les tables de base `user_data`, `organization_data` et `project_members`
--   ne sont PAS créées dans ce repo (schéma initial via dashboard Supabase).
--   Inspecter leurs policies dans le SQL editor : si l'une référence
--   `is_org_member()` / `is_org_admin()` / `can_write_org_data()`, la
--   réécrire en `owner_user_id` seul AVANT de lancer cette migration.
--   Le DROP FUNCTION final (sans CASCADE) échouera volontairement et
--   bruyamment si une dépendance subsiste — c'est le filet de sécurité.
-- ─────────────────────────────────────────────────────────────

-- ╔══════════════════════════════════════════════════════════╗
-- ║ 1. Réécriture des policies (owner_user_id seul)            ║
-- ╚══════════════════════════════════════════════════════════╝

-- ── invoices ─────────────────────────────────────────────────
DROP POLICY IF EXISTS invoices_select ON invoices;
CREATE POLICY invoices_select ON invoices
  FOR SELECT USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS invoices_insert ON invoices;
CREATE POLICY invoices_insert ON invoices
  FOR INSERT WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS invoices_update ON invoices;
CREATE POLICY invoices_update ON invoices
  FOR UPDATE USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS invoices_delete ON invoices;
CREATE POLICY invoices_delete ON invoices
  FOR DELETE USING (auth.uid() = owner_user_id);

-- ── reserve_templates ────────────────────────────────────────
-- (conserve la lecture des modèles système et l'immuabilité is_system)
DROP POLICY IF EXISTS reserve_templates_select ON reserve_templates;
CREATE POLICY reserve_templates_select ON reserve_templates
  FOR SELECT USING (
    auth.uid() = owner_user_id
    OR is_system = true
  );

DROP POLICY IF EXISTS reserve_templates_insert ON reserve_templates;
CREATE POLICY reserve_templates_insert ON reserve_templates
  FOR INSERT WITH CHECK (
    is_system = false AND owner_user_id = auth.uid()
  );

DROP POLICY IF EXISTS reserve_templates_update ON reserve_templates;
CREATE POLICY reserve_templates_update ON reserve_templates
  FOR UPDATE USING (
    is_system = false AND auth.uid() = owner_user_id
  );

DROP POLICY IF EXISTS reserve_templates_delete ON reserve_templates;
CREATE POLICY reserve_templates_delete ON reserve_templates
  FOR DELETE USING (
    is_system = false AND auth.uid() = owner_user_id
  );

-- ── permits ──────────────────────────────────────────────────
DROP POLICY IF EXISTS permits_select ON permits;
CREATE POLICY permits_select ON permits
  FOR SELECT USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS permits_insert ON permits;
CREATE POLICY permits_insert ON permits
  FOR INSERT WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS permits_update ON permits;
CREATE POLICY permits_update ON permits
  FOR UPDATE USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS permits_delete ON permits;
CREATE POLICY permits_delete ON permits
  FOR DELETE USING (auth.uid() = owner_user_id);

-- ── quotes ───────────────────────────────────────────────────
DROP POLICY IF EXISTS quotes_select ON quotes;
CREATE POLICY quotes_select ON quotes
  FOR SELECT USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS quotes_insert ON quotes;
CREATE POLICY quotes_insert ON quotes
  FOR INSERT WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS quotes_update ON quotes;
CREATE POLICY quotes_update ON quotes
  FOR UPDATE USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS quotes_delete ON quotes;
CREATE POLICY quotes_delete ON quotes
  FOR DELETE USING (auth.uid() = owner_user_id);

-- ── progress_reports ─────────────────────────────────────────
DROP POLICY IF EXISTS progress_reports_select ON progress_reports;
CREATE POLICY progress_reports_select ON progress_reports
  FOR SELECT USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS progress_reports_insert ON progress_reports;
CREATE POLICY progress_reports_insert ON progress_reports
  FOR INSERT WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS progress_reports_update ON progress_reports;
CREATE POLICY progress_reports_update ON progress_reports
  FOR UPDATE USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS progress_reports_delete ON progress_reports;
CREATE POLICY progress_reports_delete ON progress_reports
  FOR DELETE USING (auth.uid() = owner_user_id);

-- ╔══════════════════════════════════════════════════════════╗
-- ║ 2. RPC increment_reserve_template_usage — retrait org      ║
-- ╚══════════════════════════════════════════════════════════╝
CREATE OR REPLACE FUNCTION public.increment_reserve_template_usage(_template_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Vérifie l'accès owner / système (plus de branche org).
  IF NOT EXISTS (
    SELECT 1 FROM reserve_templates
    WHERE id = _template_id
      AND (owner_user_id = auth.uid() OR is_system = true)
  ) THEN
    RAISE EXCEPTION 'Template not found or not accessible';
  END IF;

  UPDATE reserve_templates
  SET usage_count = usage_count + 1,
      last_used_at = now()
  WHERE id = _template_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_reserve_template_usage(uuid) TO authenticated;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ 3. DROP des tables org                                     ║
-- ╚══════════════════════════════════════════════════════════╝
-- organization_data / _members / _invitations référencent organizations.
-- organizations est référencée par les colonnes org_id (FK ON DELETE
-- CASCADE) des tables conservées → DROP ... CASCADE retire ces contraintes
-- FK (les colonnes org_id restent, nullables, toujours NULL en solo).
DROP TABLE IF EXISTS organization_data CASCADE;
DROP TABLE IF EXISTS organization_invitations CASCADE;
DROP TABLE IF EXISTS organization_members CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ 4. DROP des fonctions org (SANS cascade = filet de secu)   ║
-- ╚══════════════════════════════════════════════════════════╝
-- Si ce DROP échoue, c'est qu'une policy d'une table NON versionnée
-- (user_data, project_members…) référence encore la fonction : la
-- réécrire en owner_user_id seul puis relancer.
DROP FUNCTION IF EXISTS public.can_write_org_data(uuid);
DROP FUNCTION IF EXISTS public.is_org_admin(uuid);
DROP FUNCTION IF EXISTS public.is_org_member(uuid);

