# Audit pré-commercialisation — ArchiPilot

> Date : 2026-04-18
> Version auditée : 0.3.0

---

## BLOQUANTS CRITIQUES

### 1. Paiement / Stripe — inexistant

- Aucune intégration de paiement. La page pricing est purement cosmétique.
- Les limites Free/Pro/Team sont appliquées **côté client uniquement** — un utilisateur peut modifier le localStorage pour contourner toutes les restrictions.
- **A faire :**
  - Intégrer Stripe Checkout + Webhooks
  - Vérifier le plan côté serveur (Supabase RLS ou Edge Functions)
  - Ajouter un portail de gestion d'abonnement (Stripe Customer Portal)
  - Historique de facturation / factures

### 2. Pages légales — inexistantes

- Aucune Politique de Confidentialité, CGU/CGV, ni mention légale.
- Aucun bandeau de consentement cookies.
- L'app cible la Belgique — le RGPD s'applique strictement. Lancer sans ces pages expose à des sanctions.
- **A faire :**
  - Politique de Confidentialité
  - Conditions Générales d'Utilisation
  - Mentions légales
  - Bandeau cookies (consentement RGPD)
  - Data Processing Agreement (DPA) pour les clients Team

### 3. Suppression de compte / Droit à l'effacement (RGPD Art. 17) — inexistant

- Aucun bouton "Supprimer mon compte".
- Aucun export complet des données personnelles (le CSV partiel ne suffit pas).
- Aucune politique de rétention des données.
- **A faire :**
  - Bouton "Supprimer mon compte" avec confirmation
  - Export complet des données (JSON/ZIP)
  - Purge des données associées (photos, projets, PV, analytics)
  - Politique de rétention documentée

### 4. Enforcement des plans côté serveur — absent

- `hasFeature()` et les quotas (maxPvPerMonth, maxAiPerMonth) ne sont vérifiés qu'en JavaScript côté client.
- Les Edge Functions ne vérifient pas le plan de l'utilisateur avant d'exécuter.
- Risque : tout utilisateur free peut exploiter les fonctionnalités Pro.
- **A faire :**
  - Stocker le plan dans la table `profiles` côté Supabase
  - Vérifier le plan dans chaque Edge Function (generate-pv, send-pv-email, etc.)
  - Ajouter des RLS policies basées sur le plan
  - Synchroniser le plan via Stripe Webhooks

---

## HAUTE PRIORITE

### 5. Monitoring / Error tracking — absent

- Pas de Sentry, LogRocket, ou équivalent. Les erreurs production passent inaperçues.
- Le `componentDidCatch` n'envoie rien, il ne fait que `console.error`.
- Impossible de détecter les incidents ou les régressions.
- **A faire :**
  - Intégrer Sentry (frontend + Edge Functions)
  - Configurer des alertes sur les erreurs critiques
  - Ajouter du monitoring de performance (Web Vitals)

### 6. Rate limiting faible

- Seul `generate-pv` est limité (10/h, en mémoire — perdu au redémarrage).
- Aucun rate limiting sur : envoi d'emails PV, invitations collaborateurs, upload de photos.
- Risque d'abus de crédits (OpenAI, Resend) et de spam.
- **A faire :**
  - Rate limiting persistant (stocké en base, pas en mémoire)
  - Limiter l'envoi d'emails (ex. 50/jour)
  - Limiter les invitations (ex. 20/jour)
  - Limiter les uploads (ex. taille max + quota par utilisateur)
  - Protection DDoS (Cloudflare ou équivalent)

### 7. Securite — points manquants

- Pas de Content-Security-Policy (CSP), pas de X-Frame-Options.
- CORS `Access-Control-Allow-Origin: *` sur les Edge Functions — trop permissif.
- Pas de sanitisation HTML (DOMPurify) pour les contenus utilisateur affichés.
- Les données offline (localStorage) ne sont pas chiffrées.
- **A faire :**
  - Ajouter les headers de sécurité (CSP, X-Frame-Options, X-Content-Type-Options)
  - Restreindre CORS aux domaines autorisés uniquement
  - Intégrer DOMPurify pour tout contenu utilisateur rendu en HTML
  - Audit des politiques RLS Supabase

### 8. Tests — couverture minimale

- Seuls 2 fichiers de tests unitaires (address, dates).
- Aucun test de composant React.
- Aucun test E2E (Playwright/Cypress).
- Aucun test des Edge Functions.
- Risque élevé de régressions silencieuses.
- **A faire :**
  - Tests unitaires sur les fonctions critiques (db.js, helpers, offline)
  - Tests de composants (Auth, UpgradeGate, NoteEditor)
  - Tests E2E sur les parcours critiques (inscription, création PV, envoi email)
  - Tests des Edge Functions (generate-pv, send-pv-email)

---

## PRIORITE MOYENNE

### 9. Onboarding — minimal

- Pas de wizard d'accueil, pas de tooltips, pas d'email de bienvenue.
- Les projets démo peuvent confondre les nouveaux utilisateurs.
- Impact direct sur le taux de conversion et le churn.
- **A faire :**
  - Wizard d'accueil (3-5 étapes : profil, premier projet, découverte)
  - Tooltips / feature hints sur les fonctionnalités clés
  - Email de bienvenue avec guide de démarrage
  - Checklist "Getting Started" dans le dashboard

### 10. Accessibilite (WCAG 2.1 AA) — partielle

- Quelques `aria-label` présents, mais il manque : landmarks ARIA, skip-to-content, gestion du focus dans les modales, contraste non vérifié.
- Obligation légale en UE (European Accessibility Act, juin 2025).
- **A faire :**
  - Ajouter les landmarks ARIA (main, nav, complementary)
  - Lien skip-to-content
  - Gestion du focus dans les modales et les menus
  - Vérification des contrastes (WCAG AA ratio 4.5:1)
  - Navigation clavier complète

### 11. CI/CD — absent

- Pas de GitHub Actions ni de pipeline automatisé.
- Pas de lint/test automatique avant déploiement.
- Le build Vercel se fait en auto-deploy sans vérification.
- **A faire :**
  - GitHub Actions : lint + tests + build sur chaque PR
  - Bloquer le merge si les tests échouent
  - Deploy preview sur Vercel pour chaque PR
  - Vérification automatique des types (si TypeScript migré)

### 12. Documentation

- Pas de documentation utilisateur / centre d'aide.
- Pas de documentation API.
- Pas de changelog public.
- **A faire :**
  - Centre d'aide (FAQ, guides, tutoriels)
  - Changelog public pour les mises à jour
  - Documentation API si intégrations tierces prévues

### 13. Backup et Recovery

- Dépendance aux backups automatiques de Supabase, sans SLA documenté.
- Pas de point-in-time restore accessible.
- Aucune communication aux utilisateurs sur la durabilité de leurs données.
- **A faire :**
  - Documenter la stratégie de backup (fréquence, rétention)
  - Tester la procédure de restore
  - Communiquer aux utilisateurs (page "Sécurité des données")
  - Envisager des backups externes (S3, Google Cloud Storage)

---

## POINTS POSITIFS (deja en place)

- Auth robuste (email + Google/Apple OAuth + MFA/TOTP)
- Row Level Security sur Supabase (isolation des données)
- PWA avec support offline fonctionnel
- Système de collaboration avec rôles (admin/contributor/reader)
- Notifications temps réel
- Architecture Edge Functions pour les opérations sensibles (clés API jamais exposées côté client)
- Feature gating UI bien structuré (même si non enforced côté serveur)
- i18n FR/EN en place
- Debounced saves pour éviter de surcharger la base
- Analytics events batchés toutes les 5 secondes

---

## RESUME PAR PRIORITE

| Priorite | Sujet | Effort |
|----------|-------|--------|
| BLOQUANT | Intégration Stripe + enforcement serveur | Gros |
| BLOQUANT | Pages légales (RGPD, CGU, cookies) | Moyen |
| BLOQUANT | Suppression de compte + export RGPD | Moyen |
| BLOQUANT | Enforcement des plans côté serveur | Moyen |
| HAUTE | Sentry / monitoring | Petit |
| HAUTE | Rate limiting persistant sur tous les endpoints | Moyen |
| HAUTE | Headers de sécurité (CSP, CORS restrictif) | Petit |
| HAUTE | Tests (composants + E2E) | Gros |
| MOYENNE | Onboarding utilisateur | Moyen |
| MOYENNE | Accessibilité WCAG | Moyen |
| MOYENNE | CI/CD pipeline | Petit |
| MOYENNE | Documentation / Help center | Moyen |
| MOYENNE | Backup et recovery | Petit |
