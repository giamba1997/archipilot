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
