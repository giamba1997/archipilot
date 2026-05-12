-- ─────────────────────────────────────────────────────────────
-- F8 — Bibliothèque de réserves types
--
-- Catalogue (perso + partagé + système) de réserves récurrentes que
-- l'architecte saisit en quelques clics au lieu de retaper « joint
-- silicone manquant cuisine » à chaque OPR.
--
-- Trois niveaux de visibilité :
--   1. owner_user_id = X, org_id = NULL  → modèle perso (read/write own)
--   2. owner_user_id = NULL, org_id = Y  → modèle partagé dans l'agence
--   3. owner_user_id = NULL, org_id = NULL, is_system = true → seed commun
--      (visible à tous, non éditable — sert de bibliothèque de démarrage)
--
-- Le tri d'autocomplete utilise `usage_count` : plus un modèle est
-- choisi, plus il remonte. Pour les modèles système, le compteur est
-- global (signal de popularité communautaire) ; pour les perso, il est
-- propre à l'utilisateur.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reserve_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- NULL pour les modèles système / partagés (org)
  owner_user_id   uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id          uuid REFERENCES organizations(id) ON DELETE CASCADE,
  is_system       boolean NOT NULL DEFAULT false,

  description     text NOT NULL,
  default_severity text NOT NULL DEFAULT 'major'
                  CHECK (default_severity IN ('critical','major','minor','cosmetic')),
  default_contractor_type text,
  category        text,

  usage_count     int NOT NULL DEFAULT 0,
  last_used_at    timestamptz,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Au moins une dimension d'appartenance doit être renseignée
  CONSTRAINT reserve_templates_scope_check
    CHECK (owner_user_id IS NOT NULL OR org_id IS NOT NULL OR is_system = true)
);

CREATE INDEX IF NOT EXISTS idx_reserve_templates_owner
  ON reserve_templates(owner_user_id, usage_count DESC)
  WHERE owner_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reserve_templates_org
  ON reserve_templates(org_id, usage_count DESC)
  WHERE org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reserve_templates_system
  ON reserve_templates(usage_count DESC)
  WHERE is_system = true;

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE reserve_templates ENABLE ROW LEVEL SECURITY;

-- SELECT : ses propres modèles + ceux de son agence + les modèles système
DROP POLICY IF EXISTS reserve_templates_select ON reserve_templates;
CREATE POLICY reserve_templates_select ON reserve_templates
  FOR SELECT
  USING (
    auth.uid() = owner_user_id
    OR (org_id IS NOT NULL AND public.is_org_member(org_id))
    OR is_system = true
  );

-- INSERT : un user peut créer un modèle perso pour lui-même, ou un modèle
-- org pour une agence dont il est membre (admin/owner/member, pas viewer).
-- Les modèles système sont insérés via cette migration (seed) ou via
-- service-role (jamais via le client).
DROP POLICY IF EXISTS reserve_templates_insert ON reserve_templates;
CREATE POLICY reserve_templates_insert ON reserve_templates
  FOR INSERT
  WITH CHECK (
    is_system = false
    AND (
      (owner_user_id = auth.uid() AND org_id IS NULL)
      OR (org_id IS NOT NULL AND public.can_write_org_data(org_id))
    )
  );

-- UPDATE / DELETE : seulement ses propres modèles, ou ceux de son agence
-- s'il a les droits d'écriture. Les modèles système sont immuables côté user.
DROP POLICY IF EXISTS reserve_templates_update ON reserve_templates;
CREATE POLICY reserve_templates_update ON reserve_templates
  FOR UPDATE
  USING (
    is_system = false
    AND (
      auth.uid() = owner_user_id
      OR (org_id IS NOT NULL AND public.can_write_org_data(org_id))
    )
  );

DROP POLICY IF EXISTS reserve_templates_delete ON reserve_templates;
CREATE POLICY reserve_templates_delete ON reserve_templates
  FOR DELETE
  USING (
    is_system = false
    AND (
      auth.uid() = owner_user_id
      OR (org_id IS NOT NULL AND public.can_write_org_data(org_id))
    )
  );

-- ── updated_at trigger ───────────────────────────────────────
DROP TRIGGER IF EXISTS reserve_templates_touch_updated_at ON reserve_templates;
CREATE TRIGGER reserve_templates_touch_updated_at
  BEFORE UPDATE ON reserve_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

-- ── RPC : incrémente usage_count atomiquement ────────────────
-- Appelée à chaque fois qu'un modèle est utilisé (description copiée
-- dans une nouvelle réserve). SECURITY DEFINER pour pouvoir incrémenter
-- les modèles système malgré la RLS (mais on vérifie la lecture).
CREATE OR REPLACE FUNCTION public.increment_reserve_template_usage(_template_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Re-vérifie que l'utilisateur a bien accès au modèle (sinon il pourrait
  -- incrémenter n'importe quel id deviné).
  IF NOT EXISTS (
    SELECT 1 FROM reserve_templates
    WHERE id = _template_id
      AND (
        owner_user_id = auth.uid()
        OR (org_id IS NOT NULL AND public.is_org_member(org_id))
        OR is_system = true
      )
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

-- ── Seed : bibliothèque système de ~50 réserves classiques ───
-- Catégories alignées sur les lots de chantier belges les plus courants.
-- Sévérité par défaut : "major" sauf cosmétique évident.
INSERT INTO reserve_templates (is_system, description, default_severity, default_contractor_type, category) VALUES
  -- Finitions / Peinture / Plâtrerie
  (true, 'Joint silicone manquant ou défaillant',                    'minor',    'Finitions',     'Finitions'),
  (true, 'Peinture éclatée ou écaillée',                              'cosmetic', 'Peinture',      'Finitions'),
  (true, 'Coulure ou trace de pinceau sur peinture',                  'cosmetic', 'Peinture',      'Finitions'),
  (true, 'Différence de teinte entre lés de peinture',                'minor',    'Peinture',      'Finitions'),
  (true, 'Plinthe descellée ou décollée',                             'minor',    'Finitions',     'Finitions'),
  (true, 'Enduit fissuré ou cloqué',                                  'major',    'Plâtrerie',     'Finitions'),
  (true, 'Raccord enduit / plafond non net',                          'minor',    'Plâtrerie',     'Finitions'),
  -- Sol / Carrelage
  (true, 'Carrelage fissuré ou cassé',                                'major',    'Carrelage',     'Sol'),
  (true, 'Carrelage mal aligné ou joints irréguliers',                'minor',    'Carrelage',     'Sol'),
  (true, 'Carrelage qui sonne creux',                                 'major',    'Carrelage',     'Sol'),
  (true, 'Parquet rayé ou marqué',                                    'minor',    'Parquet',       'Sol'),
  (true, 'Parquet qui grince ou se soulève',                          'major',    'Parquet',       'Sol'),
  (true, 'Plinthe mal coupée à l''angle',                             'minor',    'Finitions',     'Sol'),
  -- Étanchéité / Humidité
  (true, 'Trace d''humidité visible',                                 'major',    'Étanchéité',    'Étanchéité'),
  (true, 'Auréole ou tache au plafond',                               'major',    'Étanchéité',    'Étanchéité'),
  (true, 'Joint d''étanchéité dégradé',                               'major',    'Étanchéité',    'Étanchéité'),
  (true, 'Infiltration en pied de mur',                               'critical', 'Étanchéité',    'Étanchéité'),
  (true, 'Condensation excessive sur menuiseries',                    'major',    'HVAC',          'Étanchéité'),
  -- Menuiseries intérieures
  (true, 'Porte intérieure qui frotte ou ne ferme pas',               'minor',    'Menuiserie',    'Menuiseries'),
  (true, 'Serrure défectueuse ou clé bloquée',                        'major',    'Menuiserie',    'Menuiseries'),
  (true, 'Chambranle de porte mal posé',                              'minor',    'Menuiserie',    'Menuiseries'),
  (true, 'Plinthe ou chambranle manquant',                            'minor',    'Menuiserie',    'Menuiseries'),
  -- Menuiseries extérieures
  (true, 'Châssis qui ne ferme pas hermétiquement',                   'major',    'Menuiserie',    'Châssis'),
  (true, 'Vitrage rayé ou ébréché',                                   'major',    'Vitrerie',      'Châssis'),
  (true, 'Joint de châssis manquant ou décollé',                      'major',    'Menuiserie',    'Châssis'),
  (true, 'Quincaillerie de châssis défectueuse',                      'minor',    'Menuiserie',    'Châssis'),
  -- Électricité
  (true, 'Prise électrique non fixée ou mal alignée',                 'minor',    'Électricité',   'Électricité'),
  (true, 'Interrupteur défectueux',                                   'major',    'Électricité',   'Électricité'),
  (true, 'Point lumineux non fonctionnel',                            'major',    'Électricité',   'Électricité'),
  (true, 'Circuit non identifié au tableau',                          'major',    'Électricité',   'Électricité'),
  (true, 'Mise à la terre absente ou défectueuse',                    'critical', 'Électricité',   'Électricité'),
  -- Sanitaire
  (true, 'Fuite visible sous évier / lavabo',                         'critical', 'Sanitaire',     'Sanitaire'),
  (true, 'Robinet qui goutte ou mal fixé',                            'minor',    'Sanitaire',     'Sanitaire'),
  (true, 'Évacuation lente ou bouchée',                               'major',    'Sanitaire',     'Sanitaire'),
  (true, 'WC mal fixé ou qui bouge',                                  'major',    'Sanitaire',     'Sanitaire'),
  (true, 'Siphon manquant ou non posé',                               'major',    'Sanitaire',     'Sanitaire'),
  -- HVAC / Chauffage
  (true, 'Radiateur non fonctionnel',                                 'major',    'HVAC',          'HVAC'),
  (true, 'Thermostat non câblé ou non programmé',                     'minor',    'HVAC',          'HVAC'),
  (true, 'VMC bruyante ou non fonctionnelle',                         'major',    'HVAC',          'HVAC'),
  (true, 'Bouche d''extraction obstruée',                             'major',    'HVAC',          'HVAC'),
  -- Gros œuvre / Maçonnerie
  (true, 'Fissure visible sur mur porteur',                           'critical', 'Gros œuvre',    'Gros œuvre'),
  (true, 'Fissure de retrait sur enduit',                             'minor',    'Plâtrerie',     'Gros œuvre'),
  (true, 'Mur non d''aplomb',                                         'major',    'Gros œuvre',    'Gros œuvre'),
  (true, 'Linteau apparent ou mal masqué',                            'minor',    'Gros œuvre',    'Gros œuvre'),
  -- Toiture / Couverture
  (true, 'Tuile cassée ou déplacée',                                  'major',    'Couverture',    'Toiture'),
  (true, 'Gouttière mal fixée ou désalignée',                         'major',    'Couverture',    'Toiture'),
  (true, 'Solin défectueux en pied de cheminée',                      'major',    'Couverture',    'Toiture'),
  -- Sécurité / Conformité
  (true, 'Garde-corps non conforme ou manquant',                      'critical', 'Sécurité',      'Sécurité'),
  (true, 'Détecteur de fumée non posé ou non fonctionnel',            'critical', 'Sécurité',      'Sécurité'),
  (true, 'Resserrage coupe-feu non réalisé',                          'critical', 'Sécurité',      'Sécurité'),
  (true, 'Nez de marche glissant ou non visible',                     'major',    'Sécurité',      'Sécurité'),
  -- Nettoyage / livraison
  (true, 'Local non nettoyé / déchets de chantier présents',          'minor',    'Nettoyage',     'Réception'),
  (true, 'Étiquettes / protections non retirées',                     'minor',    'Nettoyage',     'Réception')
ON CONFLICT DO NOTHING;
