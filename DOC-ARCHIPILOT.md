# ArchiPilot — Documentation produit & technique

> **But de ce document.** Servir de brief de référence (pour Claude ou tout intervenant)
> afin de définir : (1) la **stratégie MVP**, (2) la **stratégie digitale**, (3) la
> **stratégie d'acquisition**. Il décrit le projet, l'architecture, toutes les features,
> le modèle économique, l'état d'avancement, et la matière première stratégique.
>
> Version produit : `0.3.0` · Stack : React + Supabase + OpenAI · Statut : pré-commercialisation.

---

## 1. Vision & positionnement

**ArchiPilot est le copilote IA des architectes belges francophones pour la gestion de chantier et la génération de procès-verbaux (PV).**

L'app remplace un patchwork d'outils (Word + Excel + email + photos sur le téléphone + post-its)
par un seul espace de travail, pensé **terrain-first** (mobile/chantier) et **offline-first**
(le réseau 4G est aléatoire sur un chantier).

### Le problème résolu
L'architecte de chantier passe un temps fou sur de la paperasse à faible valeur :
- rédiger des PV de réunion de chantier après chaque visite,
- suivre les réserves (défauts) jusqu'à leur levée,
- relancer les permis d'urbanisme et leurs délais légaux,
- facturer ses honoraires par phase,
- comparer les devis des entreprises,
- tenir un journal de chantier (**obligation légale RGPT** en Belgique),
- produire des points d'avancement pour le maître d'ouvrage (MO).

### Cible
- **Persona principal** : architecte indépendant ou petite agence belge francophone,
  qui gère plusieurs chantiers en parallèle et fait lui-même le suivi terrain.
- **Personas secondaires** (déjà prévus dans `STRUCTURE_TYPES`) : bureau d'études,
  promoteur, entreprise de construction.
- **Marché initial** : Belgique francophone (Bruxelles / Wallonie). Le produit est
  imprégné du droit belge : phases d'honoraires, RGPT, procédures de permis 30/75/105/230j,
  TVA 21 %/6 %, CCT, PEB.

### Principe directeur produit
**L'IA assiste, elle ne remplace jamais le process.** Elle est toujours *opt-in* :
elle propose, l'architecte valide. Le copilote IA est en **lecture seule** sur les
données de l'app — il rédige des textes prêts-à-coller mais ne modifie jamais une
réserve ou un PV à la place de l'humain. L'archi garde le contrôle.

---

## 2. Proposition de valeur (par bénéfice)

| Bénéfice | Comment ArchiPilot le délivre |
|---|---|
| **Gagner du temps sur les PV** | Prise de notes par poste → génération du PV par IA → PDF aux couleurs du cabinet → envoi email + tracking de lecture |
| **Ne rien oublier** | Alertes intelligentes (échéances réserves, permis, factures, réception définitive) |
| **Être en règle** | Journal de chantier légal (RGPT) généré automatiquement, signature électronique |
| **Sécuriser les réserves** | OPR (réception) avec signature à distance par token, valeur probante |
| **Se faire payer** | Facturation par phase, numérotation TVA conforme, relances automatiques |
| **Décider plus vite** | Comparaison de devis assistée par IA (extraction + matrice + reco) |
| **Travailler sur le terrain** | Mode Chantier mobile : timer, dictée vocale, photos, réserves, brouillon de PV |
| **Travailler à plusieurs** | Plan Team (agence), collaboration projet, présence temps réel |

---

## 3. Stack & architecture technique

### 3.1 Stack
| Couche | Technologie |
|---|---|
| Front | React 18, Vite 6, Zustand 5 (état), routing manuel par état `view` (pas de React Router en flux principal) |
| Backend | Supabase : Postgres, Auth (email/password + MFA), Storage, Realtime, Edge Functions (Deno/TypeScript) |
| IA | **OpenAI `gpt-4o-mini`** (clé serveur côté Edge Functions) + **Whisper** (transcription vocale) + Vision (parsing PDF devis) |
| PDF | jsPDF (client-side) — PV, OPR, factures, journal |
| Carte | Leaflet + OpenStreetMap, géocodage Nominatim (gratuit) |
| PWA / offline | vite-plugin-pwa + Workbox, web push VAPID, file d'attente offline (localStorage) |
| Paiement | Stripe (checkout, billing portal, webhook) |
| Emails transactionnels | Resend (via Edge Functions) |
| Monitoring | Sentry |
| Déploiement | Vercel |
| i18n | FR (base), structure prête NL/EN/DE |

### 3.2 Modèle de données — architecture hybride
- **Projets stockés en JSONB** dans `user_data.projects` (perso) ou `organization_data.projects`
  (agence). Sync **debouncée 1,5 s** vers Supabase → expérience offline-first, écriture optimiste locale.
- **Tables relationnelles dédiées** pour ce qui doit être requêtable / atomique / multi-acteurs :
  `invoices`, `permits`, `quotes`, `progress_reports`, `reserve_templates`,
  `opr_signature_requests`, `notifications`, `project_members`, `pv_sends` / `pv_reads`,
  `web_push_subscriptions`, `analytics_events`, `rate_limits`.
- **Multi-tenant (agences)** : `organizations` + `organization_members`
  (rôles : owner / admin / member / viewer), isolation par **RLS** via fonctions
  `is_org_member()`, `is_org_admin()`, `can_write_org_data()`.
- 16 migrations SQL (`001` → `016`) qui tracent l'historique des features.

### 3.3 Edge Functions (logique serveur)
IA : `ask-archipilot` (chat copilote), `generate-pv`, `parse-cdc` (cahier des charges),
`parse-quote` (devis), `generate-progress-report`, `transcribe-audio`, `dispatch-remarks`.
Transactionnel : `send-pv-email`, `send-invite-email`, `send-push-notification`,
`request-opr-signatures`, `opr-signing`, `track-pv-read`.
Orgs : `create-org`, `invite-org-member`, `accept-org-invite`, `revoke-org-invite`,
`remove-org-member`, `transfer-org-ownership`, `leave-org`.
Paiement / RGPD : `stripe-checkout`, `stripe-portal`, `stripe-webhook`,
`export-data`, `delete-account`.

### 3.4 Approche IA
Le copilote (`ask-archipilot`) reçoit un **contexte projet injecté en markdown**
(`chatContext.js`) — pas de RAG/embeddings, du *context stuffing*. System prompt strict :
- ton « collègue archi expérimenté », direct, tutoiement, opinions assumées ;
- **anti-hallucination** sur les données perso (tout chiffre/nom/date vient du contexte) ;
- **lecture seule** sur les données app ;
- connaissances générales autorisées (normes belges, technique chantier).
**Contrôle des coûts** : table `rate_limits` + quotas par plan (`maxAiPerMonth`).

### 3.5 Mobile vs Desktop
- `useIsMobile()` (breakpoint 768 px).
- Vues mobiles dédiées : `MobileHome`, `MobileChantiersList`, `MobileNotifs`, `ChantierModeView`.
- Vues lourdes bloquées sur mobile : Planning (Gantt), Factures, Devis.
- Safe-area insets (encoche/barre), deep-links via push (Service Worker → `postMessage`).
- **Mode Chantier** = la feature mobile signature (voir §4).

---

## 4. Features détaillées

### 4.1 Cœur du produit (le « job to be done »)

**Gestion multi-projets**
- Cycle de vie en 7 phases : Esquisse → Avant-projet → Permis → Exécution → Chantier → Réception → Clôturé.
- Création / duplication / archivage, participants (email + tél + rôle), récurrence de réunions.
- Templates de projet (rôles, lots, champs custom, réserves attendues).

**Notes & génération de PV** (`NoteEditor`, `ResultView`, `generate-pv`)
- Saisie par poste du cahier des charges (3 modes : écrire / dicter via Whisper / free-write).
- Génération du PV par IA → markdown → **PDF aux couleurs du cabinet** (jsPDF).
- Statuts PV : Brouillon → À relire → Validé → Envoyé → En retard.
- Historique des PV, actions ouvertes suivies entre PV, **tâches suggérées par IA** (opt-in).
- Envoi email + **tracking de lecture** (`pv_sends` / `pv_reads`).

**Cahier des charges** (`parse-cdc`)
- Import PDF → extraction IA de la structure (postes, obligations, attendus).

### 4.2 OPR & réserves (réception des travaux)
- Cycle de vie des réserves : Non levée → Partiellement levée → Levée ; sévérités Critique/Majeure/Mineure/Esthétique.
- **Signature à distance** des OPR : token sécurisé, expiration 14 j, page publique sans login
  (`PublicSignPage`), snapshot immuable des réserves (valeur probante), relance possible.
- **Bibliothèque de réserves types** (F8) : modèles perso / agence / système, autocomplete trié par fréquence.

### 4.3 Tier 1 — Revenu & obligations légales (livré)

**F1 — Honoraires & facturation** (`InvoicesView`, table `invoices`)
- Facturation par phase, numérotation **TVA séquentielle atomique** (RPC `next_invoice_number` → `2026-001`).
- TVA 21 % / 6 % (rénovation), montants HT/TVA/TTC générés en base.
- Statuts : draft → sent → paid → overdue → cancelled. PDF cabinet. (⚠️ bloqué sur mobile.)

**F2 — Journal de chantier** (`JournalView`)
- Timeline chronologique agrégeant PV + photos + actions + sessions de temps.
- Réponse à l'**obligation légale RGPT**. Export PDF, entrées libres, signature électronique.

**F3 — Comparaison de devis** (`QuotesView`, `parse-quote`)
- Upload N PDF de devis pour un lot → extraction IA (texte ou Vision pour scans).
- Matrice comparative par poste, highlight des écarts, statut `awarded`. (⚠️ bloqué sur mobile.)

### 4.4 Tier 2 — Gain de temps & différenciation (livré)

**F4 — Suivi des permis d'urbanisme** (`PermitsView`, table `permits`)
- Procédures 30/75/105/230j, calcul auto des échéances, statuts préparation → octroyé/refusé/recours, documents.

**F5 — Alertes & rappels intelligents** (`AlertsDrawer`, `alert_settings`)
- Préférences par catégorie : réception définitive, réserve en retard, échéance permis,
  tâche en retard, facture impayée, absence de PV 30j, digest email.

### 4.5 Tier 3 — Polish & expérience (livré)

**F7 — Offline robuste** : file d'attente locale, brouillons de PV récupérables, badge de sync.
**F9 — Carte multi-projets** (`MapDashboardView`) : pins par statut, géocodage Nominatim, drawer infos.
**F10 — Rapports client automatiques** (`ProgressReportsView`, `generate-progress-report`) :
synthèse IA (PV + tâches + réserves + photos + permis) → markdown éditable → PDF → envoi MO.

### 4.6 Mode Chantier (feature mobile clé)
Vue plein écran terrain (`ChantierModeView`) : démarrage de visite avec **timer**,
**dictée vocale**, **photos**, **création de réserves**, géoloc, météo. À la sortie,
compose automatiquement un **brouillon de PV**. État persistant en local (résiste aux coupures réseau).

### 4.7 Collaboration & agences
- Invitation de collaborateurs par projet (`project_members`), rôles, notifications temps réel.
- **Plan Team** : organisation multi-sièges, `AgencyView` (membres, invitations, facturation),
  présence temps réel (soft-lock sur l'éditeur de PV).

### 4.8 Transverse
- Galerie photos + annotation de plans (`PlanViewer`, `PhotoAnnotationViewer`, crop/rotate/markers).
- Planning / Gantt (lots, tâches, dépendances) ; feuilles de temps (`TimesheetView`, export CSV).
- Onboarding (wizard + tour guidé), notifications cloche + **web push PWA**.
- RGPD : export de données, suppression de compte. MFA. Pages légales.
- Analytics maison (events batchés toutes les 5 s dans `analytics_events`).

### 4.9 Roadmap restante (non livrée)
- **F6 — Communication unifiée client** : adresse email magique par projet, ingestion
  d'emails entrants (Postmark/Mailgun), thread chat-like searchable. Effort 20-30h.
  *Seule feature majeure de la roadmap encore au stade conception (pas de migration).*

---

## 5. Modèle économique (état actuel du code)

Source : `src/constants/config.js`.

| Plan | Prix | Projets | PV/mois | IA/mois | Collab/projet | Cible |
|---|---|---|---|---|---|---|
| **Free** | 0 € | 1 | 3 | 3 | 0 | Découverte / acquisition |
| **Pro** | **39 €/mois** (390 €/an) | ∞ | ∞ | ∞ | 3 | Archi indépendant |
| **Team** | **89 €/mois** (890 €/an) | ∞ | ∞ | ∞ | ∞ | Agence (3 sièges inclus, +9,99 €/siège) |

**Feature gates principaux** (réservés Pro/Team) : envoi email, galerie, planning, lots,
checklists, dashboard complet, PDF sans filigrane, PDF logo custom, OPR.
**Team uniquement** : rôles, planning cross-projets, export CSV.

**Leviers de conversion intégrés** : filigrane PDF en Free, limites projets/PV/IA,
modales d'upgrade contextuelles (`UpgradeGate`, `UpgradeRequiredModal`, `upgradeMessages`),
pricing in-app (`PricingSection`).

---

## 6. État d'avancement & maturité

**Livré (production-ready ou proche)** : cœur PV, OPR + signature à distance, F1-F5, F7-F10,
Mode Chantier, collaboration/agences, Stripe, RGPD, MFA, PWA/push.

**Documents internes existants** : `ROADMAP-FEATURES.md` (F1-F10 détaillées),
`ROADMAP-COMMERCIALISATION.md`, `AUDIT-PRE-COMMERCIALISATION.md`,
`PLAN-GESTION-PROJET.md`, `MOBILE-ROADMAP.md`, `MOBILE-ARBORESCENCE.md`.

**Dette technique / points de vigilance repérés** (à arbitrer avant scale) :
1. `db.js` truffé de `console.log` de debug (`loadSharedProjects`, `uploadPhoto`…) → nettoyer avant prod.
2. Sync agence en **last-write-wins sans verrou** (présence/lock prévus « Phase 4 ») → risque de conflit en multi-édition.
3. Photos base64 encore stockées dans le **JSONB projets** (row Supabase ~1 Mo pratique) → risque de saturation ; migration vers Storage à terme.
4. F6 (comm unifiée) non démarrée.

---

## 7. Matière première pour la stratégie

> Cette section ne tranche pas la stratégie — elle réunit les éléments factuels
> et les angles à exploiter pour la définir.

### 7.1 Forces différenciantes
- **Vertical & local** : 100 % pensé pour l'archi belge (droit, TVA, RGPT, procédures permis).
  Un concurrent généraliste ne peut pas répliquer cette précision réglementaire facilement.
- **IA contextuelle** : le copilote connaît *les projets de l'utilisateur*, pas juste un LLM générique.
- **Terrain + offline** : Mode Chantier mobile = usage réel sur site, là où les outils desktop échouent.
- **Couverture fonctionnelle large déjà livrée** : de la prise de note à la facturation, en passant par le légal (journal, OPR signé).

### 7.2 Axes de différenciation marketing
- « **Le seul outil qui couvre TOUT le chantier**, de la première visite au paiement de la dernière facture. »
- « **Conforme RGPT / TVA belge** out-of-the-box » (argument de vente légal, F2 journal).
- « **Votre copilote IA qui connaît vos chantiers** » (vs ChatGPT générique).
- « **Pensé pour le terrain** » (Mode Chantier, offline, dictée vocale).

### 7.3 Angles MVP (à arbitrer)
Le produit est *plus* qu'un MVP en surface fonctionnelle. La vraie question MVP est :
**quel sous-ensemble pousser comme produit d'appel pour acquérir et convertir ?**
- *Option « PV-first »* : focaliser le marketing sur le gain de temps PV (le pain le plus universel et fréquent), le reste en upsell.
- *Option « conformité-first »* : entrer par le journal de chantier RGPT + OPR signé (peur du litige/contrôle).
- *Option « tout-en-un »* : assumer la largeur fonctionnelle comme argument anti-multi-abonnements.

### 7.4 Acquisition — pistes à explorer
- **Free plan comme produit d'appel** (1 projet, 3 PV/mois, filigrane) → boucle d'activation → upgrade.
- **Canaux pros** : ordre des architectes belges, syndicats/fédérations, écoles d'archi, groupes LinkedIn/Facebook d'archis BE.
- **Contenu SEO/légal** : guides « journal de chantier obligatoire ? », « délais permis Wallonie/Bruxelles », « modèle de PV de chantier » → capter l'intention.
- **Bouche-à-oreille / referral** : le plan Team et la collaboration projet sont des vecteurs viraux naturels (un archi invite ses confrères/collaborateurs).
- **Démo terrain** : le Mode Chantier filmé (vidéo courte « une visite de chantier en 3 min ») est un asset social fort.

### 7.5 Questions ouvertes à trancher pour la stratégie
1. **Cible prioritaire** : indépendant (Pro 39 €) ou agence (Team 89 €) en premier ?
2. **Géographie** : rester Belgique FR, ou viser Wallonie + France (droit différent → effort) ?
3. **Pricing** : 39 €/mois est-il aligné sur la valeur (vs coût d'un logiciel métier archi classique) ?
4. **Produit d'appel** : PV, conformité légale, ou tout-en-un ?
5. **Moat IA** : jusqu'où pousser l'IA contextuelle comme argument différenciant central ?
6. **Pré-requis avant scale** : nettoyer la dette (§6) — surtout stockage photos & conflits agence.

---

## 8. Glossaire métier

- **PV** : procès-verbal de réunion de chantier (le livrable récurrent de l'archi de chantier).
- **OPR** : Opérations Préalables à la Réception — constat des réserves (défauts) avant réception des travaux.
- **Réserve** : défaut constaté à lever par l'entreprise.
- **MO** : Maître d'Ouvrage (le client final).
- **RGPT** : Règlement Général pour la Protection du Travail (impose le journal de chantier en BE).
- **CdC** : Cahier des Charges.
- **Lot** : corps de métier / bundle de travaux (maçonnerie, électricité…).
- **Phase** : étape d'honoraires (esquisse, AVP, permis, exécution, chantier, réception).
