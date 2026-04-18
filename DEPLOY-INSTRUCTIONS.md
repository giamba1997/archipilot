# Instructions de déploiement — ArchiPilot

## 1. SQL à exécuter dans Supabase (SQL Editor)

Allez dans **Supabase Dashboard > SQL Editor** et exécutez ce script en une seule fois :

```sql
-- ============================================================
-- MIGRATION 1 : Table rate_limits (rate limiting persistant)
-- ============================================================

CREATE TABLE IF NOT EXISTS rate_limits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  window_start timestamptz NOT NULL DEFAULT now(),
  count integer NOT NULL DEFAULT 1,
  UNIQUE(user_id, action)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_user_action ON rate_limits(user_id, action);

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- MIGRATION 2 : Colonnes Stripe + plan sur profiles
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer ON profiles(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- ============================================================
-- Vérification : lister les colonnes de profiles
-- ============================================================

SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'profiles'
ORDER BY ordinal_position;
```

---

## 2. Edge Functions à déployer

Exécutez ces commandes **une par une** dans votre terminal (depuis la racine du projet) :

```bash
# Fonctions existantes (mises à jour avec CORS, auth, rate limiting)
supabase functions deploy generate-pv
supabase functions deploy dispatch-remarks
supabase functions deploy send-pv-email
supabase functions deploy send-invite-email
supabase functions deploy track-pv-read

# Nouvelles fonctions
supabase functions deploy delete-account
supabase functions deploy export-data
supabase functions deploy stripe-checkout
supabase functions deploy stripe-webhook
supabase functions deploy stripe-portal
```

Ou tout d'un coup :

```bash
supabase functions deploy generate-pv && supabase functions deploy dispatch-remarks && supabase functions deploy send-pv-email && supabase functions deploy send-invite-email && supabase functions deploy track-pv-read && supabase functions deploy delete-account && supabase functions deploy export-data && supabase functions deploy stripe-checkout && supabase functions deploy stripe-webhook && supabase functions deploy stripe-portal
```

---

## 3. Variables d'environnement Supabase

Allez dans **Supabase Dashboard > Project Settings > Edge Functions > Secrets** et ajoutez :

| Variable | Valeur | Requis maintenant ? |
|----------|--------|---------------------|
| `ENVIRONMENT` | `production` | OUI — active le CORS restrictif |
| `STRIPE_SECRET_KEY` | `sk_live_...` ou `sk_test_...` | NON — pas encore activé |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | NON — pas encore activé |
| `STRIPE_PRO_MONTHLY_PRICE_ID` | `price_...` | NON |
| `STRIPE_PRO_YEARLY_PRICE_ID` | `price_...` | NON |
| `STRIPE_TEAM_MONTHLY_PRICE_ID` | `price_...` | NON |
| `STRIPE_TEAM_YEARLY_PRICE_ID` | `price_...` | NON |

Les variables suivantes doivent déjà exister :

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | URL du projet Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service role |
| `OPENAI_API_KEY` | Clé API OpenAI |
| `RESEND_API_KEY` | Clé API Resend |
| `APP_URL` | `https://archipilot-delta.vercel.app` |

---

## 4. Variable d'environnement Vercel

Allez dans **Vercel Dashboard > Project > Settings > Environment Variables** et ajoutez :

| Variable | Valeur | Requis maintenant ? |
|----------|--------|---------------------|
| `VITE_SENTRY_DSN` | `https://xxx@sentry.io/xxx` | NON — Sentry est optionnel, l'app marche sans |

---

## 5. Vérification post-déploiement

1. Ouvrir l'app et vérifier que la page de login s'affiche
2. Se connecter et vérifier que l'onboarding wizard apparaît (si nouveau compte)
3. Aller dans Profil > Abonnement et tester le changement de plan (mode test)
4. Aller dans Profil > Données et tester l'export
5. Vérifier les liens légaux dans le footer de la page d'auth
6. Tester le bandeau cookies (vider localStorage pour le revoir)
