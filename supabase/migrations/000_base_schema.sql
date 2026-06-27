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
