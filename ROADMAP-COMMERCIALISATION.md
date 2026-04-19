# Roadmap de commercialisation — ArchiPilot

> Date : 2026-04-18
> Objectif : liste exhaustive des elements a mettre en place avant et apres le lancement commercial

---

## BLOQUANT — Sans ca, pas de lancement

| # | Element | Statut | Detail |
|---|---------|--------|--------|
| 1 | **Stripe en production** | Code pret, pas active | Creer les produits/prix Stripe, mettre `STRIPE_ENABLED = true`, configurer le webhook |
| 2 | **Textes legaux relus par un juriste** | Templates en place | Les CGU et Politique de Confidentialite sont des templates — un juriste belge doit les valider |
| 3 | **Edge Functions stables** | Partiellement casse | `generate-pv` fonctionne en inline, les autres utilisent `_shared/` qui cause des `EarlyDrop` — il faut inliner toutes les fonctions |
| 4 | **Domaine personnalise** | Non fait | `archipilot-delta.vercel.app` n'est pas commercial — configurer `app.archipilot.app` sur Vercel |
| 5 | **Email expediteur verifie** | Partiellement | Verifier que le domaine `archipilot.app` est bien configure dans Resend (SPF, DKIM, DMARC) pour eviter les spams |
| 6 | **Localisation de remarques sur plan** | **Deja en place** | Markers sur plan associes aux postes (PlanViewer), comptes dans NoteEditor et inclus dans le PDF. Verifier que l'UX est au niveau des concurrents (drag & drop, filtrage par lot). |
| 7 | **Test complet du flow de paiement** | Non fait | Creer un compte test, upgrader, downgrader, annuler — verifier que tout fonctionne end-to-end |

---

## HAUTE PRIORITE — Premieres semaines

| # | Element | Statut | Detail |
|---|---------|--------|--------|
| 8 | **OPR / Levee de reserves** | Non fait | Workflow dedie pour les operations prealables a reception — moment cle du chantier, attendu par les archi |
| 9 | **Export PDF enrichi** | Basique | Ajouter : photos integrees au PV, tableau recapitulatif des remarques par lot/statut, remarques localisees sur plan |
| 10 | **Sentry configure** | Code pret, DSN manquant | Creer le projet Sentry, ajouter `VITE_SENTRY_DSN` dans Vercel — sinon tu es aveugle en production |
| 11 | **Landing page / site vitrine** | Non fait | Page marketing sur `archipilot.app` avec pricing, demo, temoignages — indispensable pour l'acquisition |
| 12 | **Signature electronique PV** | Non fait | Les entreprises signent le PV sur tablette a la fin de la reunion. Attendu par le marche |
| 13 | **Notifications push (PWA)** | Non fait | Notifier quand un PV est envoye, une remarque assignee, une invitation recue |
| 14 | **Rappels automatiques** | Non fait | Relance email automatique aux entreprises pour remarques non resolues apres X jours |
| 15 | **Portail client read-only** | Non fait | Lien partageable pour que le maitre d'ouvrage suive l'avancement sans creer de compte |

---

## MOYENNE PRIORITE — Premier mois

| # | Element | Statut | Detail |
|---|---------|--------|--------|
| 16 | **Templates de postes par type de chantier** | Partiel (6 templates) | Ajouter : renovation appartement, construction neuve, facade, interieur, etc. avec postes pre-configures realistes |
| 17 | **Resume executif IA** | Non fait | Generer un resume en 5 points du PV pour le MO — differenciation forte |
| 18 | **PV comparatif (diff)** | Non fait | Vue cote a cote PV n vs PV n-1 : nouveau, resolu, inchange |
| 19 | **Detection d'anomalies recurrentes** | Non fait | IA alerte : "Poste electricite : 12 remarques non resolues depuis 3 PV" |
| 20 | **Analyse de photos IA** | Non fait | Envoyer une photo et l'IA genere la remarque associee (vision par ordinateur) |
| 21 | **Traduction auto FR/NL** | Non fait | Generer le PV en deux langues — niche belge tres pertinente |
| 22 | **GED avancee** | Basique | Versioning de documents, classement par phases, partage securise avec entreprises |
| 23 | **Timeline visuelle du projet** | Non fait | Frise chronologique avec PV, photos cles et jalons |
| 24 | **Help center / FAQ** | Non fait | Centre d'aide avec guides, videos, FAQ — reduire le support |
| 25 | **Changelog public** | Non fait | Page "Nouveautes" pour montrer que le produit evolue |

---

## BASSE PRIORITE — Scaling

| # | Element | Statut | Detail |
|---|---------|--------|--------|
| 26 | **App native iOS/Android** | Non (PWA) | Les concurrents ont des apps natives. La PWA suffit pour le lancement mais sera un frein pour certains |
| 27 | **Integrations (BIM, calendrier, comptabilite)** | Non fait | API ouverte, webhook, connexion a des outils tiers |
| 28 | **Suivi budgetaire** | Non fait | Pas le coeur de metier mais attendu sur le plan Team |
| 29 | **QR codes chantier** | Non fait | Scanner un QR colle sur le mur et ouvrir le poste correspondant |
| 30 | **Export IFC/BIM** | Non fait | Pour les grands projets avec maquette numerique |
| 31 | **Suggestion de remarques IA** | Non fait | Pre-remplir les remarques recurrentes basees sur l'historique |
| 32 | **Estimation de retard IA** | Non fait | Predire les risques base sur le rythme de cloture des remarques |

---

## Analyse concurrentielle — Positionnement

### ArchiPilot vs Concurrents

| Fonctionnalite | ArchiPilot | Archipad | BatiScript | PlanRadar | Fieldwire |
|---|:---:|:---:|:---:|:---:|:---:|
| Gestion de projets | oui | oui | oui | oui | oui |
| Remarques / reserves | oui | oui | oui | oui | oui |
| Photos de chantier | oui | oui | oui | oui | oui |
| Generation de PV / CR | **IA** | template | template | template | manuel |
| Dictee vocale + IA | **oui** | non | non | non | non |
| Collaboration | oui | oui | oui | oui | oui |
| Roles (admin/contrib/lecteur) | oui | oui | oui | oui | oui |
| Envoi PV par email | oui | oui | oui | oui | non |
| Suivi de lecture (tracking) | **oui** | non | non | non | non |
| PWA / mode offline | oui | app native | app native | app native | app native |
| Localisation sur plan | oui | **avance** | **avance** | **avance** | **avance** |
| Checklists qualite | oui | oui | oui | oui | oui |
| Planning / Gantt | basique | **avance** | **avance** | non | oui |
| Appels d'offres / DCE | non | non | **oui** | non | non |
| Suivi budgetaire | non | non | **oui** | non | non |
| OPR / Levee de reserves | non | **oui** | **oui** | **oui** | oui |
| Signatures electroniques | non | **oui** | **oui** | non | non |
| GED (gestion documentaire) | basique | **oui** | **oui** | **oui** | oui |
| Multi-langue | FR/EN | FR/EN | FR | 30+ | multi |
| App native iOS/Android | non | **oui** | **oui** | **oui** | **oui** |
| API / integrations | non | oui | oui | **oui** | **oui** |
| Prix | 0-59 EUR/mois | ~100+ EUR/mois | ~99+ EUR/mois | ~35+ EUR/user/mois | ~39+ EUR/user/mois |

### Avantages uniques ArchiPilot (USP)

| Feature | Description | Concurrent le plus proche |
|---------|-------------|--------------------------|
| **PV genere par IA** | L'IA redige le PV complet, pas juste une mise en forme | Aucun |
| **Dictee vocale + repartition IA** | Dicter pendant la visite, l'IA range dans les postes | Aucun |
| **Suivi de lecture des PV** | Savoir qui a ouvert le PV envoye par email | Aucun |
| **Prix agressif** | Free + 29 EUR/mois vs 100+ EUR chez les concurrents | PlanRadar (35 EUR/user) |

### Positionnement recommande

> "Le seul outil de PV de chantier qui redige le proces-verbal a votre place grace a l'IA.
> Dictez pendant la visite, recevez un PV professionnel en 2 minutes."

Les concurrents automatisent la **mise en forme** du PV. ArchiPilot automatise la **redaction**. C'est une difference fondamentale.

### Reponse par concurrent

| Concurrent | Son avantage | Reponse ArchiPilot |
|------------|-------------|-------------------|
| **Archipad** | UX mature, app native, OPR | IA + prix agressif (29 EUR vs ~100+ EUR) |
| **BatiScript** | ERP complet (budget, DCE) | Specialisation PV + simplicite + IA |
| **PlanRadar** | International, integrations | Niche architectes belges/FR + IA + prix |
| **Fieldwire** | Plans avances, gros chantiers | PME/independants + IA + onboarding rapide |

---

## Planning d'execution

| Phase | Periode | Items |
|-------|---------|-------|
| **Lancement** | Semaines 1-2 | #1 a #7 (bloquants) |
| **Premiers clients payants** | Semaines 3-6 | #8 a #15 (haute priorite) |
| **Croissance** | Mois 2-3 | #16 a #25 (moyenne priorite) |
| **Scaling** | Mois 4+ | #26 a #32 (basse priorite) |

**Item critique** : le #6 (localisation sur plan) est deja en place — c'est un avantage. Le vrai bloquant restant est le #1 (Stripe) et le #4 (domaine).
