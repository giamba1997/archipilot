-- ─────────────────────────────────────────────────────────────
-- F1 — Honoraires & facturation par phases
--
-- L'architecte facture par tranches indexées sur les phases du projet
-- (esquisse, AVP, permis, exécution, chantier, réception). Cette
-- migration crée :
--   1. `invoices`           — une facture par ligne, lien optionnel
--      à une phase du projet (phase_id = id JSONB côté client).
--   2. `invoice_counters`   — compteur per-user-per-year pour
--      générer des numéros TVA conformes (format "YYYY-NNN" séquentiel
--      par année, comme l'exige le SPF Finances belge).
--   3. `next_invoice_number()` RPC — incrément atomique du compteur
--      avec verrou pessimiste, pour qu'aucun doublon ne soit possible
--      même en cas de double-clic ou de course concurrente.
--
-- v1 sans intégration paiement : pas de Stripe, pas de webhook bancaire,
-- pas de relance automatique (sera F5 + extension F1). On stocke juste
-- les factures, le PDF est généré côté client (comme PV/OPR) et l'archi
-- déclenche manuellement les changements de statut.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Owner : la facture appartient à un user (perso) ou à une agence (Team).
  -- RLS s'appuie dessus.
  owner_user_id   uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id          uuid REFERENCES organizations(id) ON DELETE CASCADE,

  -- Référence au projet (text car le projet vit dans user_data JSONB).
  -- phase_id est l'identifiant de la phase telle que stockée dans
  -- project.phases[] côté client (ex : "permit", "execution", "reception").
  project_id      text NOT NULL,
  project_name    text,    -- snapshot pour affichage hors-projet
  phase_id        text,
  phase_label     text,    -- snapshot label phase au moment de l'émission

  -- Numéro TVA séquentiel "YYYY-NNN" — généré atomiquement via RPC.
  -- Unique par owner pour ne pas exposer le compteur d'un user à un autre.
  number          text NOT NULL,

  -- Client facturé (snapshot — l'archi peut éditer une facture sans que
  -- les modifs participants/MO du projet rétroactivent la facture)
  client_name     text NOT NULL,
  client_address  text,
  client_vat      text,    -- BE0XXX.XXX.XXX si pro

  description     text NOT NULL,
  amount_ht       numeric(10,2) NOT NULL CHECK (amount_ht >= 0),
  vat_rate        numeric(4,2)  NOT NULL DEFAULT 21
                  CHECK (vat_rate IN (0, 6, 12, 21)),  -- taux belges autorisés
  -- Colonnes calculées : pas de drift possible entre HT / TVA / TTC.
  -- round(..., 2) car numeric(10,2) — sinon Postgres rejette la précision.
  amount_vat      numeric(10,2) GENERATED ALWAYS AS (round(amount_ht * vat_rate / 100, 2)) STORED,
  amount_ttc      numeric(10,2) GENERATED ALWAYS AS (round(amount_ht * (1 + vat_rate / 100), 2)) STORED,

  issue_date      date NOT NULL,
  due_date        date NOT NULL,

  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','sent','paid','overdue','cancelled')),
  sent_at         timestamptz,
  paid_at         timestamptz,
  payment_method  text,         -- "virement", "stripe" (v2), etc.
  payment_ref     text,         -- communication structurée ou ref banque

  pdf_url         text,         -- si on stocke une copie en Storage (v2)
  reminder_count  int NOT NULL DEFAULT 0,
  last_reminder_at timestamptz,

  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Au moins une dimension d'appartenance
  CONSTRAINT invoices_scope_check
    CHECK (owner_user_id IS NOT NULL OR org_id IS NOT NULL),
  -- Numéro unique par owner (perso ou agence)
  CONSTRAINT invoices_number_unique_user UNIQUE (owner_user_id, number)
);

CREATE INDEX IF NOT EXISTS idx_invoices_owner
  ON invoices(owner_user_id, issue_date DESC)
  WHERE owner_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_org
  ON invoices(org_id, issue_date DESC)
  WHERE org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_project
  ON invoices(project_id);

CREATE INDEX IF NOT EXISTS idx_invoices_status_due
  ON invoices(status, due_date)
  WHERE status IN ('sent', 'overdue');

-- ── Compteur per-user-per-year pour numérotation TVA ─────────
CREATE TABLE IF NOT EXISTS invoice_counters (
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year          int  NOT NULL,
  last_n        int  NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_user_id, year)
);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_counters ENABLE ROW LEVEL SECURITY;

-- invoices : owner lit/écrit ses factures ; membres d'org peuvent lire,
-- membres avec droit d'écriture peuvent CUD.
DROP POLICY IF EXISTS invoices_select ON invoices;
CREATE POLICY invoices_select ON invoices
  FOR SELECT
  USING (
    auth.uid() = owner_user_id
    OR (org_id IS NOT NULL AND public.is_org_member(org_id))
  );

DROP POLICY IF EXISTS invoices_insert ON invoices;
CREATE POLICY invoices_insert ON invoices
  FOR INSERT
  WITH CHECK (
    (owner_user_id = auth.uid() AND org_id IS NULL)
    OR (org_id IS NOT NULL AND public.can_write_org_data(org_id))
  );

DROP POLICY IF EXISTS invoices_update ON invoices;
CREATE POLICY invoices_update ON invoices
  FOR UPDATE
  USING (
    auth.uid() = owner_user_id
    OR (org_id IS NOT NULL AND public.can_write_org_data(org_id))
  );

DROP POLICY IF EXISTS invoices_delete ON invoices;
CREATE POLICY invoices_delete ON invoices
  FOR DELETE
  USING (
    auth.uid() = owner_user_id
    OR (org_id IS NOT NULL AND public.can_write_org_data(org_id))
  );

-- invoice_counters : lecture/écriture par RPC SECURITY DEFINER uniquement —
-- on bloque tout accès direct depuis le client pour empêcher manipulation.
DROP POLICY IF EXISTS invoice_counters_no_direct ON invoice_counters;
CREATE POLICY invoice_counters_no_direct ON invoice_counters
  FOR ALL USING (false) WITH CHECK (false);

-- ── updated_at triggers ──────────────────────────────────────
DROP TRIGGER IF EXISTS invoices_touch_updated_at ON invoices;
CREATE TRIGGER invoices_touch_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS invoice_counters_touch_updated_at ON invoice_counters;
CREATE TRIGGER invoice_counters_touch_updated_at
  BEFORE UPDATE ON invoice_counters
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

-- ── RPC : next_invoice_number(year) ──────────────────────────
-- Incrément atomique sous verrou (FOR UPDATE) → impossible d'obtenir
-- deux fois le même numéro même en cas de course. Retourne "YYYY-NNN"
-- avec NNN zéro-paddé sur 3 chiffres (ex "2026-001").
-- L'archi peut surcharger manuellement le numéro à la création s'il
-- reprend une numérotation existante (champ libre côté client) — la
-- contrainte UNIQUE empêche les collisions.
CREATE OR REPLACE FUNCTION public.next_invoice_number(_year int)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  n int;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Upsert + lock + increment + return
  INSERT INTO invoice_counters (owner_user_id, year, last_n)
  VALUES (uid, _year, 1)
  ON CONFLICT (owner_user_id, year)
  DO UPDATE SET last_n = invoice_counters.last_n + 1,
                updated_at = now()
  RETURNING last_n INTO n;

  RETURN _year::text || '-' || lpad(n::text, 3, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_invoice_number(int) TO authenticated;

-- ── Champs émetteur sur `profiles` ──────────────────────────
-- Pour générer un PDF de facture conforme TVA belge il faut l'IBAN du
-- bureau et son n° de TVA. On les stocke sur le profil utilisateur
-- (cohérent avec les autres infos pro déjà là : structure, address, etc.)
-- pour ne pas les ressaisir à chaque facture.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS iban text,
  ADD COLUMN IF NOT EXISTS vat_number text,
  ADD COLUMN IF NOT EXISTS invoice_payment_terms_days int NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS invoice_payment_note text;

