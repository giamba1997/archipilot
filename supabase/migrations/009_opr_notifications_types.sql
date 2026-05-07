-- ─────────────────────────────────────────────────────────────
-- Étend la table `notifications` pour accepter les types OPR.
--
-- Le INSERT depuis l'Edge Function `opr-signing` échoue silencieusement
-- si une CHECK constraint sur `type` n'autorise pas les nouvelles
-- valeurs (opr_signed / opr_declined / opr_completed). On fait sauter
-- la contrainte si elle existe — on garde le typage côté code.
--
-- On s'assure aussi que la table est bien dans la publication realtime
-- pour que la souscription côté client reçoive les INSERT en live.
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  rec record;
BEGIN
  -- Drop any CHECK constraint involving the column "type" on "notifications".
  -- Le nom exact n'est pas connu (auto-généré ou custom), on les drop tous.
  FOR rec IN
    SELECT c.conname AS conname
    FROM pg_constraint c
    JOIN pg_class cls ON cls.oid = c.conrelid
    JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
    WHERE cls.relname = 'notifications'
      AND nsp.nspname = 'public'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%type%'
  LOOP
    EXECUTE format('ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS %I', rec.conname);
  END LOOP;
END $$;

-- Add table to supabase_realtime publication if not already.
-- supabase-js .channel().on('postgres_changes') ne reçoit les events que
-- pour les tables présentes dans cette publication.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications';
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    -- Publication inexistante en local dev — pas grave
    NULL;
END $$;
