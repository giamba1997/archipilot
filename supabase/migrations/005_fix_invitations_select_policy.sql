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
