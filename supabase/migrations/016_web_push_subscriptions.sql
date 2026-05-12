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
