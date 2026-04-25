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
