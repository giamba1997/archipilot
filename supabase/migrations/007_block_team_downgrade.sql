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
