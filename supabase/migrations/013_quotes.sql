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
