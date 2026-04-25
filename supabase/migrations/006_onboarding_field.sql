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
