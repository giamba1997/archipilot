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
