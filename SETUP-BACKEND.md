# Recréer le backend Supabase — runbook

> L'ancien projet Supabase (`vijrrcimntzzmbhcbpcl`) a été supprimé. Ce guide recrée un backend
> fonctionnel pour tester le flow complet. Le schéma de base manquant a été reconstruit dans
> `supabase/migrations/000_base_schema.sql`.

---

## 1. Créer le projet Supabase
1. https://supabase.com/dashboard → **New project** (région **EU West** de préférence, comme l'ancien).
2. Note le mot de passe de la base (tu en auras besoin pour la CLI).
3. Dans **Project Settings → API**, récupère :
   - **Project URL** (`https://xxxx.supabase.co`)
   - **anon public key**

## 2. Mettre à jour `.env`
Remplace les valeurs dans `.env` (à la racine du projet) :
```
VITE_SUPABASE_URL=https://<NOUVEAU-REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<NOUVELLE-ANON-KEY>
VITE_VAPID_PUBLIC_KEY=<optionnel — laisse vide si tu ne testes pas le push>
```
Puis **redémarre `npm run dev`** (Vite ne recharge pas le `.env` à chaud).

## 3. Appliquer le schéma (migrations)
**Ordre impératif** : `000` d'abord (tables de base), puis `001` → `016`, puis `017` en dernier
(017 réécrit les RLS en `owner_user_id` seul et retire l'étage agence — il dépend des tables 011-015).

### Option A — Dashboard (simple, sans CLI)
**SQL Editor** → colle et exécute le contenu de chaque fichier `supabase/migrations/*.sql`
**dans l'ordre numérique** (000, 001, 002, … 016, 017). Un fichier à la fois.

### Option B — CLI Supabase (recommandé)
```bash
# installer la CLI si besoin : https://supabase.com/docs/guides/cli
supabase login
supabase link --project-ref <NOUVEAU-REF>   # mdp DB demandé
supabase db push                            # applique 000 → 017 dans l'ordre
```

> ℹ️ Les migrations `004/005/007` (étage agence) sont appliquées puis **annulées par `017`** : c'est
> normal et nécessaire (les tables `invoices`/`permits`/… référencent les fonctions org créées en 004
> avant d'être réécrites en 017). Le résultat final = backend solo propre.

## 4. Déployer les Edge Functions + secrets
Pour le **flow cœur (PV)**, le minimum est `generate-pv` (+ clé OpenAI). Ajoute les autres selon ce que tu testes.

```bash
# Secrets (au minimum OpenAI pour la génération IA + dictée)
supabase secrets set OPENAI_API_KEY=sk-...
# (optionnels selon features testées)
supabase secrets set RESEND_API_KEY=...        # envoi PV par email
supabase secrets set STRIPE_SECRET_KEY=...     # checkout Pro
supabase secrets set STRIPE_PRO_MONTHLY_PRICE_ID=... STRIPE_PRO_YEARLY_PRICE_ID=...

# Déployer les fonctions (les 7 fonctions org ont été retirées du repo)
supabase functions deploy generate-pv
supabase functions deploy transcribe-audio
supabase functions deploy ask-archipilot
# puis au besoin : send-pv-email, track-pv-read, parse-cdc, stripe-checkout, stripe-portal,
# stripe-webhook, export-data, delete-account, send-push-notification, generate-progress-report…
```
> Le `config.toml` met déjà `verify_jwt = false` sur les fonctions qui valident le token elles-mêmes.

## 5. Auth
Par défaut Supabase autorise l'inscription email/password — rien à faire pour tester.
Le trigger `handle_new_user()` (dans `000`) crée automatiquement la ligne `profiles` à l'inscription.

## 6. Tester
`npm run dev` → http://localhost:3000 → **Inscription** (nouveau compte) → onboarding → 1er projet →
PV (écrit/dicté) → génération IA → PDF.

---

## Checklist de vérification
- [ ] `.env` pointe vers le nouveau projet + dev relancé
- [ ] `000 → 017` appliquées sans erreur (vérifier que `017` n'a pas échoué sur un `DROP FUNCTION` —
      sinon une policy hors-repo référence encore une fonction org : ici tout est dans le repo, donc OK)
- [ ] Bucket Storage **`project-files`** présent (créé par `000`)
- [ ] `generate-pv` déployée + `OPENAI_API_KEY` défini
- [ ] Inscription → ligne créée automatiquement dans `profiles` et `user_data`

## ⚠️ Limites de la reconstruction (schéma `000`)
Le schéma de base a été **reverse-engineeré depuis le code** (`db.js` + Edge Functions), pas restauré
depuis un dump. Il couvre les colonnes lues/écrites par l'app. Si une requête échoue sur une colonne
manquante, ajoute-la (le code est la source de vérité). Hypothèses prises : voir le commentaire en tête
de `000_base_schema.sql`.
