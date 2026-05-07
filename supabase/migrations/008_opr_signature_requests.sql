-- ─────────────────────────────────────────────────────────────
-- OPR — demandes de signature à distance
--
-- Workflow : l'architecte génère un OPR puis crée N demandes de signature
-- (une par signataire). Chaque demande porte un token unique permettant à
-- son destinataire d'accéder à une page publique (sans login) pour signer
-- au doigt/souris. La signature finale (PNG dataUrl) est stockée ici, et
-- le PDF consolidé est régénéré côté client à partir des entrées signées.
--
-- Le token est l'unique authentification pour la page publique — il doit
-- donc être imprévisible (≥ 32 caractères) et son cycle de vie strict
-- (status + expires_at). Un token signé ne peut plus être réutilisé.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS opr_signature_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Lien vers l'architecte qui a émis la demande (RLS s'appuie dessus).
  -- Le projet vit dans user_data JSONB côté client, donc on ne référence
  -- pas une projects(id) — on conserve juste un identifiant texte stable.
  owner_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id      text NOT NULL,
  project_name    text NOT NULL,
  opr_id          text NOT NULL,
  opr_number      int  NOT NULL,
  opr_date        text NOT NULL,
  opr_type        text NOT NULL DEFAULT 'provisoire'
                  CHECK (opr_type IN ('provisoire','definitive')),

  -- Snapshot figé : la liste des réserves au moment de l'envoi. Permet
  -- au signataire de voir le document tel qu'il était, même si l'archi
  -- les modifie ensuite (preuve d'intégrité). Hash SHA-256 stocké pour
  -- vérification ultérieure.
  reserves_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  reserves_hash     text,

  -- Signataire ciblé
  signatory_name  text NOT NULL,
  signatory_role  text,
  signatory_email text NOT NULL,

  -- Authentification publique : token aléatoire 32+ chars
  token           text UNIQUE NOT NULL,

  -- Cycle de vie
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','signed','declined','expired')),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '14 days'),

  -- Résultat de signature
  signature_data_url text,       -- PNG base64
  signed_at          timestamptz,
  signed_ip          text,
  signed_user_agent  text,
  decline_reason     text,

  -- Trace d'envoi email
  sent_at           timestamptz NOT NULL DEFAULT now(),
  resend_id         text,
  reminded_at       timestamptz,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opr_sigreq_owner   ON opr_signature_requests(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_opr_sigreq_project ON opr_signature_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_opr_sigreq_opr     ON opr_signature_requests(opr_id);
CREATE INDEX IF NOT EXISTS idx_opr_sigreq_token   ON opr_signature_requests(token);
CREATE INDEX IF NOT EXISTS idx_opr_sigreq_status  ON opr_signature_requests(status, expires_at);

-- ── RLS ──────────────────────────────────────────────────────
-- L'architecte (owner) a accès complet via JWT auth.uid().
-- L'écriture par token (signature soumise) passe par une Edge Function
-- en service-role — donc la RLS bloque tout accès anon direct (sécurité).
ALTER TABLE opr_signature_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner reads own requests"
  ON opr_signature_requests FOR SELECT
  USING (auth.uid() = owner_user_id);

CREATE POLICY "owner inserts own requests"
  ON opr_signature_requests FOR INSERT
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "owner updates own requests"
  ON opr_signature_requests FOR UPDATE
  USING (auth.uid() = owner_user_id);

CREATE POLICY "owner deletes own requests"
  ON opr_signature_requests FOR DELETE
  USING (auth.uid() = owner_user_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION trg_opr_sigreq_touch()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS opr_sigreq_touch ON opr_signature_requests;
CREATE TRIGGER opr_sigreq_touch
BEFORE UPDATE ON opr_signature_requests
FOR EACH ROW EXECUTE FUNCTION trg_opr_sigreq_touch();
