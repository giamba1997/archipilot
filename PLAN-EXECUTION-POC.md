# Plan d'exécution POC — ArchiPilot (étape par étape)

> **But.** Transformer l'app actuelle (large, multi-features, multi-tenant) en **POC solo-first**
> (architecte indépendant, plan **Pro 39 €**, Belgique FR), wedge = boucle PV.
> Dérivé de `ArchiPilot-Perimetre-POC.md`. Chaque point est **vérifié contre le code réel**
> (ancres `fichier:ligne` ci-dessous). On exécute **point par point**, en cochant au fur et à mesure.
>
> **Convention** : `KEEP` = garder · `DEFER` = masquer derrière feature-flag (jamais supprimer) · `CUT` = retirer.

---

## ⚠️ Règles impératives (à relire avant chaque étape)

1. **DEFER = UI uniquement.** Aucune migration, aucune suppression de table/colonne JSONB. On retire
   seulement les points d'entrée (bouton/onglet/case `view`/alerte/notif) et la vue reste dans le code.
2. **Ne jamais casser le workspace perso.** `user_data.projects` doit rester 100 % fonctionnel. Tester un
   compte perso de bout en bout après chaque étape lourde (surtout l'étape 5 — RLS).
3. **Ne pas casser le gating Free/Pro.** `hasFeature` / `getLimit` / `config.js` restent valides ; les gates
   de features différées deviennent dormants (OK), on ne les supprime pas.

### Décision produit verrouillée (§4.1 — collapse des réserves)
**Option (A) retenue** ✅ (2026-06-27) : différer **tout** le concept de réserve avec l'OPR, et **rabattre la
capture terrain sur les tâches/actions** (qui restent KEEP).
- Conversion « remarque → réserve » retirée ; « remarque → tâche » conservée.
- Création de réserve sur le terrain (Mode Chantier) retirée.
- Blocs réserves de la galerie, de l'Overview et du journal masqués/filtrés.
- Données `reserves[]` / `oprHistory[]` **conservées dans le JSONB** (rallumage fast-follow avec l'OPR).

➡️ L'étape 5 ci-dessous applique cette décision.

### Note d'infrastructure (vérification hors repo)
Les tables de base **`user_data` et `organization_data` ne sont PAS dans les migrations du repo**
(001→016). Elles ont été créées via le dashboard Supabase / un schéma initial non versionné.
➡️ La réécriture RLS de l'étape 5 devra **inspecter ces policies directement dans le projet Supabase**
(SQL editor), pas seulement dans le repo.

---

## Suivi d'avancement

| # | Étape | Statut |
|---|-------|--------|
| 0 | Sauvegarde & tag git `pre-poc-cut` | ✅ |
| 1 | Créer `featureFlags.js` | ✅ |
| 2 | Câbler `isEnabled('x')` sur tous les points DEFER | ✅ |
| 3 | Collapse plans Team → Free + Pro (+ Stripe) | ✅ |
| 4 | CUT agence — RLS d'abord, puis drop, puis UI/Edge, puis `usePresence` | ✅ (migration 017 à appliquer) |
| 5 | Collapse réserves (§4.1 — **option A verrouillée**) | ✅ |
| 6 | Trim alertes / notifs / push / score MobileHome | ✅ |
| 7 | Prérequis techniques (photos→Storage, nettoyage logs) | ✅ |
| 8 | Non-régression (build OK + 96 tests verts) | ✅ |

> **État au 2026-06-27** : toutes les modifications de **code** sont faites et validées
> (build OK, 96 tests verts, aucune nouvelle erreur de lint vs baseline). **Actions manuelles infra
> restantes** (non automatisables ici) :
> 1. Appliquer la **migration `017_drop_org_layer.sql`** (`supabase db push`) — APRÈS avoir vérifié dans le
>    SQL editor que les policies de `user_data` / `project_members` ne référencent pas les fonctions org
>    (cf. en-tête de la migration ; le `DROP FUNCTION` échoue volontairement si une dépendance subsiste).
> 2. **Dashboard Stripe** : retirer/désactiver le produit & price IDs Team.
> 3. **Re-déployer les Edge Functions** (7 fonctions org supprimées du repo + `config.toml`).

---

# Étape 0 — Sauvegarde & réversibilité

- [ ] **0.1** Commit propre de l'état actuel (ou stash) pour partir d'une base saine.
- [ ] **0.2** Créer le tag de retour arrière : `git tag pre-poc-cut`.
- [ ] **0.3** Vérifier que le projet build (`npm run build`) et que les tests passent (`npm run test:run`)
      **avant** toute modif — référence de non-régression.

---

# Étape 1 — Mécanisme de feature-flag

- [ ] **1.1** Créer `src/constants/featureFlags.js` :
```js
// Source unique de vérité du périmètre POC. Passer à true pour rallumer en fast-follow.
export const FEATURES = {
  collaboration:   false, // CollabModal, project_members, "Partagés avec moi"
  invoices:        false, // InvoicesView, onglet Factures
  opr:             false, // OprView + signatures + réserves formelles
  permits:         false, // PermitsView
  quotes:          false, // QuotesView (comparaison devis)
  progressReports: false, // ProgressReportsView (rapports MO)
  cdcParsing:      false, // CdcStructureModal / parse-cdc
  planning:        false, // PlanningView / Gantt / lots
  timesheets:      false, // TimesheetView
  map:             false, // MapDashboardView
};
export const isEnabled = (k) => FEATURES[k] === true;
```
- [ ] **1.2** Exporter depuis `src/constants/index.js` si le projet ré-exporte les constantes (vérifier le
      pattern existant avant d'ajouter).

> **Règle de câblage** (rappel) : chaque feature DEFER gardée à **3 niveaux** — (a) le point d'entrée
> (bouton/onglet), (b) le `case`/render du switch `view`, (c) toute alerte/notif/CTA qui pointe dessus.

---

# Étape 2 — Câblage `isEnabled('x')` sur les points DEFER (UI uniquement)

> Toutes les ancres ci-dessous sont dans `src/App.jsx` (2761 l.) sauf mention contraire.
> **Méthode** : pour chaque render `{view === "x" && <View/>}`, ajouter `isEnabled('x') &&`. Pour chaque
> point d'entrée, masquer le bouton/onglet. Le `MOBILE_FORBIDDEN_VIEWS` (App.jsx:221-227) reste mais devient
> partiellement redondant — OK.

### 2.1 `invoices` — InvoicesView
- [ ] Render : `App.jsx:1584` → gate `isEnabled('invoices')`.
- [ ] Entrée ProjectDetail : `App.jsx:1489` (`onInvoices`).
- [ ] Onglet « Facturation » : `Overview.jsx:341` (tabs array 332-362, `desktopOnly`).
- [ ] KPI CA / résumé factures : `Overview.jsx:189-244` (masquer le bloc revenu).
- [ ] CTA wizard éventuel : `App.jsx:2378` (PhaseWizardModal).

### 2.2 `opr` — OprView (+ réserves, voir étape 5)
- [ ] Render : `App.jsx:1582` → `isEnabled('opr')`.
- [ ] Handlers : `App.jsx:1492-1494`, `1522` (`onOpr`), quick-action `1415`, mobile `2553-2554`.
- [ ] CTA wizard : `App.jsx:2384-2386` ; `phaseWizards.js:150` (cta.action `"opr"`).
- [ ] Hero OPR : `OverviewPhaseHero.jsx:432-495` → remplacer par hero générique/`TasksHero` quand off
      (sélecteur de variante `OverviewPhaseHero.jsx:32-67`).
- [ ] **Route publique `/sign/:token`** (`PublicSignPage`) → désactiver le routing public (voir §4.4).

### 2.3 `permits` — PermitsView
- [ ] Render : `App.jsx:1585` → `isEnabled('permits')`.
- [ ] Handlers : `App.jsx:1496`, `1522` (`onPermits`).
- [ ] Hero Permis : `OverviewPhaseHero.jsx:183-283`.
- [ ] ToolEntry « Permis d'urbanisme » : `Overview.jsx:784-792`.
- [ ] CTA wizard : `phaseWizards.js:66` (cta.action `"permits"`).
- [ ] Terme de score MobileHome « permis J- » : `MobileHome.jsx:301-302` (voir étape 6).
- [ ] Notifs/alertes permis : `MobileNotifs.jsx:196-206`, `alerts.js` règle 3 (voir étape 6).

### 2.4 `quotes` — QuotesView
- [ ] Render : `App.jsx:1586` → `isEnabled('quotes')`.
- [ ] Handlers : `App.jsx:1490`, `1522` (`onQuotes`).
- [ ] Onglet « Devis » : `Overview.jsx:342`.
- [ ] Edge `parse-quote` : ne plus l'appeler (coût Vision). Desktop-only de toute façon.

### 2.5 `progressReports` — ProgressReportsView
- [ ] Render : `App.jsx:1587` → `isEnabled('progressReports')`.
- [ ] Handlers : `App.jsx:1497`, `1522` (`onReports`).
- [ ] ToolEntry « Rapport MO » : `Overview.jsx:794-802`.
- [ ] Edge `generate-progress-report` : ne plus l'appeler.

### 2.6 `cdcParsing` — CdcStructureModal / CdcBanner / parse-cdc
- [ ] Bannière CdC + modal structure : masquer (`CdcBanner.jsx`, `CdcStructureModal.jsx`).
- [ ] Handler `onAskAiAboutCdc` : `App.jsx:1523-1562` — **garder** le texte brut `project.cahierDesCharges`
      alimentant le copilote ; ne désactiver que **l'extraction structurée** (`parse-cdc`).

### 2.7 `planning` — PlanningView + PlanningDashboard
- [ ] Render PlanningView : `App.jsx:1580` → `isEnabled('planning')`.
- [ ] Render PlanningDashboard : `App.jsx:1589`.
- [ ] Handler : `App.jsx:1522` (`onViewPlanning`), CTA wizard `2380-2382`, `phaseWizards.js:89`.
- [ ] Onglet « Planning » : `Overview.jsx:335`.
- [ ] Hero Planning : `OverviewPhaseHero.jsx:289-359`.
- [ ] **Dépendance `lots`** : vérifier si `generate-pv` / suivi par lot du PV référence `project.lots[]`.
      Si oui → garder un concept lot minimal (tag) ; sinon différer tout. **(à vérifier au câblage)**

### 2.8 `timesheets` — TimesheetView
- [ ] Render : `App.jsx:1654-1667` → `isEnabled('timesheets')`.
- [ ] Liens depuis PlanningDashboard : `App.jsx:1589` (`onSwitchToTimesheet`).
- [ ] **⚠️ Ne pas casser le timer du Mode Chantier** : `chantierVisit.js` partage `utils/timer.js`. Le timer
      de visite reste KEEP — n'isoler que la **vue d'agrégation** timesheet.
- [ ] Contexte copilote « Temps passé » : `chatContext.js:160-174` (voir étape 6).

### 2.9 `map` — MapDashboardView
- [ ] Render : `App.jsx:1590` → `isEnabled('map')`.
- [ ] Entrées : mobile home `App.jsx:1598` (`onOpenMap`), picker mobile `2677`.

### 2.10 `collaboration` — CollabModal
- [ ] Modal render : `App.jsx:1672-1673` → `isEnabled('collaboration')`.
- [ ] Bouton « Collaborateurs » : `Overview.jsx:896` (mobile), `1189` (desktop), `1343` (sheet).
- [ ] Section « Partagés avec moi » du Sidebar : `Sidebar.jsx:272-290` (voir étape 4.1).
- [ ] Notifs `invite` / `comment` : `MobileNotifs.jsx:37,43` (voir étape 6).

### 2.11 Vérif transverse onglets/heroes/CTAs
- [ ] Onglets Overview résultants : `Résumé | Actions | PV | Documents | Photos | Fiche` (Planning/Factures/
      Devis retirés). Tabs array `Overview.jsx:332-362`.
- [ ] Heroes de phase off → fallback générique : `PermitHero`/`PlanningHero`/`OprHero` neutralisés ;
      `ProgramHero`/`TasksHero`/`ClosedHero` restent (`OverviewPhaseHero.jsx:55-67`).
- [ ] ToolEntries : **garder Journal** (`Overview.jsx:804-824`), retirer Permis (784-792) & Rapport MO (794-802).
- [ ] CTAs `phaseWizards.js` neutralisés pour permit/devis/planning/OPR ; **garder PV/journal/photos**
      (`phaseWizards.js:22-175`).

> ✅ **Test étape 2** : compte perso, aucune entrée morte ; chaque vue différée inaccessible ; le PV, le
> journal, les photos, le copilote fonctionnent.

---

# Étape 3 — Collapse du modèle de plans (Team → Free + Pro) + Stripe

### 3.1 `src/constants/config.js`
- [ ] **3.1.1** Retirer la clé `team` de `PLANS` (garder `free`, `pro`).
- [ ] **3.1.2** Dans `PLAN_FEATURES`, retirer les **gates Team-only** : `roles`, `planningCross`, `exportCsv`.
- [ ] **3.1.3** Garder ACTIFS : `maxProjects`, `maxPvPerMonth`, `maxAiPerMonth`, `sendEmail`, `gallery`,
      `pdfNoWatermark`, `pdfCustomLogo`.
- [ ] **3.1.4** Laisser **dormants** (ne pas supprimer) : `opr`, `planning`, `lots`, `checklists`,
      `dashboardFull`, `maxCollabPerProj`.
- [ ] **3.1.5** Vérifier que `hasFeature` / `getLimit` ne lèvent pas d'erreur sur clé absente après retrait
      de Team (fallback `f.free` déjà présent — OK, confirmer).

### 3.2 Onboarding & pricing UI
- [ ] Wizard étape Plan : retirer la **carte Team** (`OnboardingWizard.jsx:83-87` `ONB_PLANS`, rendu 98-126,
      bouton « Essayer Team » l.122). Ne montrer que Free / Pro.
- [ ] `PricingSection.jsx` : retirer Team.
- [ ] Détection org-admin résiduelle (`App.jsx:1655-1657`) devient inutile après CUT agence — nettoyer.

### 3.3 Stripe
- [ ] Retirer le produit/price **Team** côté `stripe-checkout`, `stripe-webhook` (et dashboard Stripe).
- [ ] Ne garder que **Pro mensuel 39 € / annuel 390 €**.

> ✅ **Test étape 3** : checkout Pro mensuel & annuel OK ; aucune référence Team résiduelle dans l'UI.

---

# Étape 4 — CUT agence (ordre critique : RLS d'abord)

> **L'ordre compte.** Réécrire les policies RLS **avant** de dropper les fonctions org, sinon l'accès perso
> casse. C'est le point de rupture le plus probable.

### 4.1 (FAIT EN PREMIER) Réécrire les policies RLS des tables conservées en `owner_user_id` seul
> 20 policies + 1 corps de fonction RPC référencent `is_org_member()` / `can_write_org_data()`.
> Écrire une **nouvelle migration `017_drop_org_layer.sql`** qui `DROP POLICY` + `CREATE POLICY` réécrit,
> puis (en fin de migration seulement) supprime les fonctions/tables org.

- [ ] **invoices** (4 policies) `011_invoicing.sql:112-142` → retirer la branche `org_id … can_write_org_data`,
      garder `auth.uid() = owner_user_id`.
- [ ] **reserve_templates** (4 policies) `010_reserve_templates.sql:61-107` + **RPC**
      `increment_reserve_template_usage()` qui appelle `is_org_member()` à `010:134` → réécrire le corps.
- [ ] **permits** (4 policies) `012_permits.sql:70-100`.
- [ ] **quotes** (4 policies) `013_quotes.sql:67-97`.
- [ ] **progress_reports** (4 policies) `015_progress_reports.sql:49-79`.
- [ ] **opr_signature_requests** `008:78-92` → déjà `owner_user_id` seul, **rien à faire** (vérifier).
- [ ] **invoice_counters** `011:146-148` → `USING(false)`, **rien à faire**.
- [ ] **⚠️ Hors repo** : inspecter dans Supabase les policies de `user_data` (et toute autre table de base)
      pour vérifier qu'aucune ne référence une fonction org. Réécrire si besoin **avant** le drop.
- [ ] `005_fix_invitations_select_policy.sql` : concerne `organization_invitations` (table CUT) — rien à
      réécrire, elle disparaît avec le drop.

### 4.2 Dropper tables & fonctions org (en fin de migration 017)
- [ ] DROP tables : `organizations`, `organization_members`, `organization_invitations`, `organization_data`
      (créées `004_organizations.sql:11-74`).
- [ ] DROP fonctions : `is_org_member()`, `is_org_admin()`, `can_write_org_data()`
      (`004:77-122`). **Uniquement après** 4.1.

### 4.3 Retirer l'UI agence
- [ ] `AgencyView.jsx` : modal `App.jsx:2798-2810`, bouton `ProfileView` `App.jsx:1461` (`onOpenAgency`).
- [ ] `OrgInviteModal.jsx` : `App.jsx:2788-2794`.
- [ ] **Context switcher Personnel ↔ Agences** : `Sidebar.jsx:74-85` (wrapper) + composant `370-441` ;
      props `App.jsx:1144` (`activeContext`, `myOrgs`, `onSwitchContext`).
- [ ] Hook `useWorkspaceContext` : simplifier (toujours contexte perso) — `App.jsx:139-151`, `switchWorkspace`
      `505-507`.
- [ ] Section « Partagés avec moi » : `Sidebar.jsx:272-290` (aussi couverte par `collaboration` étape 2.10).

### 4.4 Retirer les Edge Functions org
- [ ] Supprimer / désactiver le déploiement : `create-org`, `invite-org-member`, `accept-org-invite`,
      `revoke-org-invite`, `remove-org-member`, `transfer-org-ownership`, `leave-org`.

### 4.5 Retirer `usePresence` (soft-lock multi-édition)
- [ ] `NoteEditor.jsx:12` (import), `:32` (appel `usePresence(presenceKey, presenceInfo)`) → supprimer ;
      passer en édition directe sans claim (en solo, toujours « propriétaire »).
- [ ] Vérifier `hooks/usePresence.js` non utilisé ailleurs (sinon supprimer le fichier).

### 4.6 `delete-account` (chemin owner-org)
- [ ] Simplifier le branchement « owner d'org » devenu mort après le CUT (`export-data`/`delete-account`
      restent KEEP — RGPD).

### 4.7 F6 communication unifiée
- [ ] Retirer toute trace de teasing/roadmap UI s'il en existe (jamais démarrée).

> ✅ **Test étape 4 (CRITIQUE)** : compte perso → lecture/écriture projet OK ; lecture/écriture
> `invoices`/`permits`/`quotes`/`reserve_templates` OK (même si UI masquée) ; **aucune policy ne référence une
> fonction org supprimée** ; Sidebar sans switcher ; pas d'erreur console.

---

# Étape 5 — Collapse des réserves (§4.1) — **Option A (verrouillée)**

> Décision : différer **tout** le concept de réserve, rabattre la capture terrain sur les **tâches**.
> Données `reserves[]`/`oprHistory[]` conservées dans le JSONB (jamais supprimées).

### 5.1 NoteEditor — retirer « convertir remarque → réserve »
- [ ] `NoteEditor.jsx:455-490` : retirer la fonction de conversion (`convertedToReserveId`/`Code`, `R-XXX`).
- [ ] `NoteEditor.jsx:764-769` : retirer le badge « OPR R-XXX » et le bouton « convertir en réserve ».
- [ ] **Garder** la conversion « remarque → tâche ».

### 5.2 ChantierModeView — retirer « créer une réserve »
- [ ] `ChantierModeView.jsx:429-434` : retirer l'`ActionButton` « Réserve ».
- [ ] `ChantierModeView.jsx:626-634` : retirer `NewReserveSheet`.
- [ ] `ChantierModeView.jsx:483-527` : retirer/neutraliser les blocs « Réserves ouvertes » / « Nouvelles
      réserves » (ou les remplacer par un suivi de **tâches**).

### 5.3 GalleryView — retirer « Lier à réserve »
- [ ] `GalleryView.jsx:320-400` : retirer le modal « Lier la photo à une réserve » (`photo.linkedReserves[]`).

### 5.4 Overview — bloc réserves
- [ ] `Overview.jsx:358` (entrée mobile « Réserves (OPR) »), `808` / `828-844` (compteur réserves),
      `1205` (« N réserves ouvertes ») → masquer.

### 5.5 JournalView — filtrer sources OPR/réserves
- [ ] `JournalView.jsx:97-112` (agrégation OPR `oprHistory[]`), `114-130` (agrégation `reserves[]`) →
      **filtrer ces types** (ne pas planter sur tableau vide). **Garder** PV + Photos + Actions/Tâches +
      entrées libres + export PDF.

### 5.6 chatContext — retirer la section Réserves
- [ ] `chatContext.js:119-133` (section « Réserves (OPR) ») → retirer pour ne pas injecter de données mortes.

> ✅ **Test étape 5** : aucun point de création de réserve ; journal + galerie + overview sans bloc réserve ;
> copilote ne mentionne plus de réserves ; pas d'erreur sur `reserves`/`oprHistory` vides.

---

# Étape 6 — Trim alertes / notifs / push / score mobile

### 6.1 AlertsDrawer / utils/alerts.js (garder 2 règles)
- [ ] **Garder** : règle 6 « pas de PV depuis 30j » (`alerts.js:175-197`), règle 4 « tâches overdue ≤7j »
      (`alerts.js:131-151`).
- [ ] **Désactiver** : règle 1 réception J-365 (`57-85`), règle 2 réserves overdue (`87-107`), règle 3 permis
      (`110-129`), règle 5 factures impayées (`154-172`).
- [ ] Ne pas casser le tri sévérité→daysUntil ni `profile.alert_settings`.

### 6.2 MobileNotifs (types vivants seulement)
- [ ] Retirer types : `invite` (`:37`), `comment` (`:43`), `opr_signed/declined/completed` (`:46-52`),
      échéances permis (`:196-206`), réserves overdue (`:207-217`).
- [ ] **Garder** notifs tâches/PV (`:224-231`).

### 6.3 MobileHome — score d'urgence « Aujourd'hui »
- [ ] Retirer le terme **permis J-** (`MobileHome.jsx:301-302`).
- [ ] Garder : réunion=100 (`:281`), notifs=30 (`:319`), chantiers proches (`174-182`), stats hebdo (`185-204`).

### 6.4 Push settings & alert_settings
- [ ] Trimmer `profile.push_settings` aux catégories vivantes (retirer opr/permits/reserves/invoices/collab/
      reception ; garder tâches/PV).
- [ ] `INIT_PROFILE.alertSettings` (`config.js:80-88`) : retirer `reserve_overdue`, `permit_deadline`,
      `invoice_overdue`, `reception_definitive` ; garder `task_overdue`, `no_pv_30d`, `email_digest`.

> ✅ **Test étape 6** : drawer alertes n'affiche que PV-30j + tâches ; MobileNotifs sans types morts ;
> score « Aujourd'hui » cohérent ; préférences alertes/push réduites.

---

# Étape 7 — Prérequis techniques bloquants

### 7.1 Migration photos base64 → Storage (BLOQUANT avant inscriptions)
- [ ] Adapter `uploadPhoto` (`db.js`) : écrire dans le bucket `project-files` au lieu d'embarquer le dataUrl
      dans `gallery[]` du JSONB.
- [ ] Adapter la lecture (`getPhotoUrl`) : servir l'URL cloud au lieu du dataUrl.
- [ ] Prévoir une **migration des données existantes** (photos déjà en base64 dans les rows).
- [ ] Garder l'UX d'upload async (dataUrl immédiat → URL cloud si online).

### 7.2 Nettoyage des `console.log` de debug
- [ ] `db.js` : retirer les logs de debug (`loadSharedProjects`, `uploadPhoto`, …).

### 7.3 Garde-fou audio Mode Chantier
- [ ] Avertissement UX si réunion > 1 h ou reload pendant enregistrement (blob audio perdu — limite acceptée).

---

# Étape 8 — Checklist de non-régression (compte perso uniquement)

- [ ] Inscription → onboarding → 1er projet créé sans erreur.
- [ ] Créer un PV (écrit + dicté) → génération IA OK → PDF OK → envoi email + tracking OK (Pro).
- [ ] Free : plafond 3 PV/mois déclenche `UpgradeRequiredModal` ; gate `sendEmail`/filigrane OK.
- [ ] Mode Chantier (mobile) : visite → photos/notes → brouillon de PV à la sortie.
- [ ] Copilote IA répond avec le contexte projet (sans planter sur réserves/temps vides).
- [ ] Journal RGPT : timeline + entrées libres + export PDF, sans erreur sur OPR/réserves absentes.
- [ ] Aucune entrée morte dans Sidebar / onglets Overview / MobileNotifs / phase wizards.
- [ ] Stripe : checkout Pro mensuel & annuel OK ; aucune référence Team résiduelle.
- [ ] RGPD : export-data + delete-account OK (chemin owner-org simplifié).
- [ ] **Aucune policy RLS ne référence une fonction org supprimée** (test lecture/écriture projet perso).
- [ ] Photos : upload → stockées en Storage (plus en base64 dans le JSONB).
- [ ] `npm run build` OK + `npm run test:run` vert.

---

# Annexe — À CONSTRUIRE plus tard (NE PAS « nettoyer », hors périmètre retrait)

> Listé pour ne pas supprimer ces chantiers à venir.
- **PV instantané dans l'onboarding** (fin wizard → coller/dicter notes → 1er PV à J0). Plus gros levier.
- **Handoff mobile** : QR code fin de wizard → installer la PWA.
- **Capter la date de prochaine visite** → push de rappel le jour J.
- **Logger la RAISON de chaque UpgradeGate/UpgradeRequiredModal** (`maxPvPerMonth`/`sendEmail`/
  `pdfNoWatermark`/`gallery`) dans `analytics_events` (App.jsx:2900-2909, SendPvModal).

---

*Plan vérifié contre le code au 2026-06-27. Ancres `fichier:ligne` indicatives — revérifier au moment d'éditer
(les lignes bougent après chaque modif).*
