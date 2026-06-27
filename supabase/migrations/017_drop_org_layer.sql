-- ─────────────────────────────────────────────────────────────
-- 017 — CUT de l'étage agence (POC solo-first)
--
-- Retire tout le multi-tenant « agence » : tables organizations*,
-- conteneur organization_data, et fonctions RLS org. AVANT de dropper
-- les fonctions, on RÉÉCRIT les policies des tables CONSERVÉES en
-- `owner_user_id` seul (sinon l'accès perso casserait — c'est le point
-- de rupture le plus probable).
--
-- ⚠️ ORDRE IMPÉRATIF : (1) réécrire les policies → (2) réécrire le RPC
-- reserve_templates → (3) dropper tables org → (4) dropper fonctions org.
--
-- ⚠️ VÉRIFICATION MANUELLE AVANT APPLICATION (hors repo) :
--   Les tables de base `user_data`, `organization_data` et `project_members`
--   ne sont PAS créées dans ce repo (schéma initial via dashboard Supabase).
--   Inspecter leurs policies dans le SQL editor : si l'une référence
--   `is_org_member()` / `is_org_admin()` / `can_write_org_data()`, la
--   réécrire en `owner_user_id` seul AVANT de lancer cette migration.
--   Le DROP FUNCTION final (sans CASCADE) échouera volontairement et
--   bruyamment si une dépendance subsiste — c'est le filet de sécurité.
-- ─────────────────────────────────────────────────────────────

-- ╔══════════════════════════════════════════════════════════╗
-- ║ 1. Réécriture des policies (owner_user_id seul)            ║
-- ╚══════════════════════════════════════════════════════════╝

-- ── invoices ─────────────────────────────────────────────────
DROP POLICY IF EXISTS invoices_select ON invoices;
CREATE POLICY invoices_select ON invoices
  FOR SELECT USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS invoices_insert ON invoices;
CREATE POLICY invoices_insert ON invoices
  FOR INSERT WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS invoices_update ON invoices;
CREATE POLICY invoices_update ON invoices
  FOR UPDATE USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS invoices_delete ON invoices;
CREATE POLICY invoices_delete ON invoices
  FOR DELETE USING (auth.uid() = owner_user_id);

-- ── reserve_templates ────────────────────────────────────────
-- (conserve la lecture des modèles système et l'immuabilité is_system)
DROP POLICY IF EXISTS reserve_templates_select ON reserve_templates;
CREATE POLICY reserve_templates_select ON reserve_templates
  FOR SELECT USING (
    auth.uid() = owner_user_id
    OR is_system = true
  );

DROP POLICY IF EXISTS reserve_templates_insert ON reserve_templates;
CREATE POLICY reserve_templates_insert ON reserve_templates
  FOR INSERT WITH CHECK (
    is_system = false AND owner_user_id = auth.uid()
  );

DROP POLICY IF EXISTS reserve_templates_update ON reserve_templates;
CREATE POLICY reserve_templates_update ON reserve_templates
  FOR UPDATE USING (
    is_system = false AND auth.uid() = owner_user_id
  );

DROP POLICY IF EXISTS reserve_templates_delete ON reserve_templates;
CREATE POLICY reserve_templates_delete ON reserve_templates
  FOR DELETE USING (
    is_system = false AND auth.uid() = owner_user_id
  );

-- ── permits ──────────────────────────────────────────────────
DROP POLICY IF EXISTS permits_select ON permits;
CREATE POLICY permits_select ON permits
  FOR SELECT USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS permits_insert ON permits;
CREATE POLICY permits_insert ON permits
  FOR INSERT WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS permits_update ON permits;
CREATE POLICY permits_update ON permits
  FOR UPDATE USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS permits_delete ON permits;
CREATE POLICY permits_delete ON permits
  FOR DELETE USING (auth.uid() = owner_user_id);

-- ── quotes ───────────────────────────────────────────────────
DROP POLICY IF EXISTS quotes_select ON quotes;
CREATE POLICY quotes_select ON quotes
  FOR SELECT USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS quotes_insert ON quotes;
CREATE POLICY quotes_insert ON quotes
  FOR INSERT WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS quotes_update ON quotes;
CREATE POLICY quotes_update ON quotes
  FOR UPDATE USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS quotes_delete ON quotes;
CREATE POLICY quotes_delete ON quotes
  FOR DELETE USING (auth.uid() = owner_user_id);

-- ── progress_reports ─────────────────────────────────────────
DROP POLICY IF EXISTS progress_reports_select ON progress_reports;
CREATE POLICY progress_reports_select ON progress_reports
  FOR SELECT USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS progress_reports_insert ON progress_reports;
CREATE POLICY progress_reports_insert ON progress_reports
  FOR INSERT WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS progress_reports_update ON progress_reports;
CREATE POLICY progress_reports_update ON progress_reports
  FOR UPDATE USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS progress_reports_delete ON progress_reports;
CREATE POLICY progress_reports_delete ON progress_reports
  FOR DELETE USING (auth.uid() = owner_user_id);

-- ╔══════════════════════════════════════════════════════════╗
-- ║ 2. RPC increment_reserve_template_usage — retrait org      ║
-- ╚══════════════════════════════════════════════════════════╝
CREATE OR REPLACE FUNCTION public.increment_reserve_template_usage(_template_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Vérifie l'accès owner / système (plus de branche org).
  IF NOT EXISTS (
    SELECT 1 FROM reserve_templates
    WHERE id = _template_id
      AND (owner_user_id = auth.uid() OR is_system = true)
  ) THEN
    RAISE EXCEPTION 'Template not found or not accessible';
  END IF;

  UPDATE reserve_templates
  SET usage_count = usage_count + 1,
      last_used_at = now()
  WHERE id = _template_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_reserve_template_usage(uuid) TO authenticated;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ 3. DROP des tables org                                     ║
-- ╚══════════════════════════════════════════════════════════╝
-- organization_data / _members / _invitations référencent organizations.
-- organizations est référencée par les colonnes org_id (FK ON DELETE
-- CASCADE) des tables conservées → DROP ... CASCADE retire ces contraintes
-- FK (les colonnes org_id restent, nullables, toujours NULL en solo).
DROP TABLE IF EXISTS organization_data CASCADE;
DROP TABLE IF EXISTS organization_invitations CASCADE;
DROP TABLE IF EXISTS organization_members CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ 4. DROP des fonctions org (SANS cascade = filet de secu)   ║
-- ╚══════════════════════════════════════════════════════════╝
-- Si ce DROP échoue, c'est qu'une policy d'une table NON versionnée
-- (user_data, project_members…) référence encore la fonction : la
-- réécrire en owner_user_id seul puis relancer.
DROP FUNCTION IF EXISTS public.can_write_org_data(uuid);
DROP FUNCTION IF EXISTS public.is_org_admin(uuid);
DROP FUNCTION IF EXISTS public.is_org_member(uuid);
