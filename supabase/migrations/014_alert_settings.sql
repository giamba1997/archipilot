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
