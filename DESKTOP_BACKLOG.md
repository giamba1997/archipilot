# ArchiPilot — Audit desktop : backlog priorisé

> Audit de ~25 vues + modales desktop (5 agents en parallèle), grille : cohérence
> Direction D · friction UX · bugs/code mort · accessibilité.
> **Aucun P0** (rien de bloquant/crashant). L'app desktop est fonctionnelle et
> globalement fidèle à la Direction D ; les sujets se regroupent en 6 familles.

---

## 🎯 Familles (vue d'ensemble)
1. **Garde-fous manquants sur actions destructives/sensibles** (récurrent, P1/P2).
2. **Erreurs de chargement déguisées en état vide** (systémique sur les vues data).
3. **Bugs fonctionnels** (token fantôme, dictée mal gatée, CTA non câblés…).
4. **Accessibilité** (aria-labels, toggles non annoncés, clavier, polices <11px).
5. **Discipline des tokens** (hex en dur réintroduits, sur-usage terracotta).
6. **Nettoyage** (imports/code morts).

---

## 🔴 P1 — à traiter d'abord (impact fort)

- **[C] DashboardHome.jsx:121,137,196,199,200** — `C.neutral[400]` n'existe pas dans
  `design/tokens.js` (rampe 300→500) → `color: undefined` → texte secondaire
  (ville/client, sous-titres, icône Fermer) en quasi-noir → **hiérarchie cassée
  sur toutes les cartes**. → `C.neutral[500]`.
- **[C] NoteEditor.jsx:1132** — la dictée est gatée sur `window.SpeechRecognition`
  alors que l'enregistrement passe par `useWhisperRecorder` (MediaRecorder) →
  **dictée bloquée à tort sur Firefox/Safari desktop**. → gater sur
  `navigator.mediaDevices?.getUserMedia && window.MediaRecorder`.
- **[B] ProgressReportsView.jsx:218-219** — « Modifier » et le CTA « Envoyer au MO »
  appellent le **même handler** `setEditing(sel)` → **aucun envoi réel**. →
  implémenter un vrai flux d'envoi (statut sent + sent_to) ou retirer le CTA.
- **[B] MfaSection.jsx:79** — `disableMfa()` désactive la 2FA **en un clic, sans
  confirmation** (régression de sécurité). → `confirm()` / mini-modal avant unenroll.
- **[C] ProfileView.jsx:673** — **deux `<input type="color">` superposés** liés à
  `pdfColor` (1er en `position:absolute`, marges négatives) → captation de clic
  imprévisible. → n'en garder qu'un.
- **[D] ProfileView.jsx:536 & 1046** — toggles Alertes & Notifications push =
  `<button>` **sans `role="switch"`/`aria-checked`** → état invisible au lecteur
  d'écran. → ajouter `aria-pressed` (ou role switch + aria-checked).
- **[B] PlanManager.jsx:348,399** — `deleteItem()` supprime un dossier **et tous
  ses fichiers/sous-dossiers récursivement, sans confirmation**. → `confirm()`
  (surtout si `getChildren(id).length > 0`).
- **[B] GalleryView.jsx:160,277** — suppression groupée « Supprimer (n) » + suppression
  en lightbox effacent les photos (et `deletePhoto` cloud) **sans confirmation**.
  → confirmer avant suppression.

## 🟠 P2 — impact moyen

**Erreurs de chargement → état vide trompeur (systémique) :**
- **[B] InvoicesView:47 / QuotesView:46 / PermitsView:96 / MapDashboardView** — le
  `.catch` ne fait que `setLoading(false)` → une panne réseau s'affiche comme
  « Aucune facture… ». → état erreur distinct + toast.
- **[B] ProgressReportsView.jsx:100-146** — `handleGenerate` n'a qu'un `finally`,
  pas de `catch` → **échec IA/réseau silencieux**. → try/catch + `showToast(…, "error")`.
- **[B] CollabModal.jsx:29** — pas d'état loading → « Aucun membre » clignote avant
  résolution. → skeleton/spinner tant que le 1er load n'a pas répondu.

**Bugs fonctionnels :**
- **[C] Overview.jsx:136,1600** — la modale « Supprimer ce PV » + `deletePv` sont
  **inatteignables** (`setPvToDelete` jamais appelé ; `onDeletePv={null}`) →
  impossible de supprimer un PV. → câbler ou retirer le code mort.
- **[B] DashboardHome.jsx:242** — KPI « Factures en retard » = `value:0` codé en dur
  + `tone:"danger"` → **« 0 € » en rouge en permanence** (faux signal). → calculer
  la vraie valeur, ou pas de ton danger à 0.
- **[C/B] DashboardHome.jsx:221,277** — « Trier : récent » **ne trie pas** quand
  `sortByPriority=false`. → implémenter le tri par date ou renommer.
- **[C] Overview.jsx:129,158-160** — accès non gardés `project.actions.filter` /
  `project.pvHistory[0]` → **crash potentiel** si tableaux absents. → `(… || [])`.
- **[C] PlanningDashboard.jsx:123-165** — `DetailPanel` (~40 l.) défini mais jamais
  rendu + **caractère corrompu** (« é�lément »). → supprimer.

**Garde-fous (suite) :**
- **[B] CollabModal.jsx:76** — `handleRemove()` retire un collaborateur sans confirmation.
- **[B] PricingSection.jsx:140** — « Rétrograder » vers Free change le plan
  instantanément (perte d'accès features) sans confirmation.
- **[B] PlanViewer.jsx:938** — « Tout effacer » (calques d'annotation) sans confirmation/undo.

**Discipline tokens (hex en dur → tokens) :**
- **[A] MapDashboardView.jsx:262-263** — `#F8E5BD/#C0791A` hors-palette → `AMB/AM`.
- **[A] Overview.jsx:496,1466 + CdcBanner.jsx:109** — `#E8E1DA` (bordures) → `SBB`.
- **[A] OprView.jsx:299,405** — orange « En cours » `#D97706` → `AM` ; + `#EFEDEB/
  #F5F2EF/#F7F5F3/#F0F9F1` (l.232,713,739,769,999) → `SB2/SB/GRBG`.
- **[A] MfaSection.jsx:70,71,98** — `#EAF3DE/#C6E9B4`, `#FEF2F2/#FECACA`, `#D3D1C7`
  → `SGB/SG, BRB/REDBRD, DIS`.
- **[A] PricingSection.jsx:55,59,93,135** — `#FDF4E7, #EAF3DE/#C6E9B4, #FEF2F2/
  #FECACA, #D3D1C7` → `ACL/SGB/BRB/DIS`.
- **[A] CollabModal.jsx:98** — pending `#E8A317` → `AM`.
- **[A] PlanningDashboard.jsx:48,63,66,274** — `#FEF2F2` → `REDBG/BRB`.
- **[A] ReserveLibrarySection.jsx:304-305** — badge « Perso » vert `#EBF3E8/#5A8C3F`
  hors-palette → paire de tokens.
- **[A] MeetingCard.jsx:47-48,86,131-141** — **sur-usage terracotta** (fond ACL +
  label AC + badge AC + 3 boutons AC sur une carte) → réserver l'AC à une seule
  action, secondaires en neutre (TX2/SBB).

**Accessibilité :**
- **[D] aria-label manquants sur boutons icône-seule** (récurrent) : InvoicesView
  (130,332,549), QuotesView (309-319), MapDashboardView (158,209), AlertsDrawer (87),
  CollabModal (179), GalleryView lightbox (282,289,294), OprView (541,544),
  PlanningView (209,344,563,572,591,806). *(PermitsView le fait déjà bien.)*
- **[D] DashboardHome.jsx:114** — `ProjectCard` = `<div onClick>` non focusable clavier
  → `role="button"`, `tabIndex={0}`, handler Enter/Espace.
- **[D] GalleryView.jsx** — lightbox sans navigation clavier (Esc/flèches).
- **[A/D] Polices <11px** : badges `fontSize:9` (InvoicesView:206, QuotesView:291,
  MapDashboardView:206) ; PlanningDashboard 7/8/9/10 (259,274,295,403,485) →
  minimum `FS.xs` (11).

## 🟡 P3 — cosmétique / nettoyage
- **[C] Imports inutilisés** : Overview (MEETING_MODES, AskAiButton, BL/BLB/TE/TEB,
  QT_*), ResultView (DIS/DIST/PB/PvStatusBadge/PV_STATUSES/getPvStatus/nextPvStatus/
  loadPvSends/formatAddress), TasksView (BL/BLB/REDBG/REDBRD/LH/SB2), PlanningView
  (useMemo, VI*/TE*/PU*/GRY*/OR*), MapDashboardView (SB2/RD/GR), ProfileView (BL/BLB/AM/SB2).
- **[C] Code mort** : PermitsView `iconBtnStyle` (415), ProgressReportsView
  `KpiSmall`/`iconBtnStyle` (248-255,394-397).
- **[C] QuotesView.jsx:148** — `handleAward` envoie `_wasAwarded:false` codé en dur.
- **[A] `"#fff"/"#000"` littéraux → `WH`** (NoteEditor:658,778 ; GalleryView ; OprView…).
- **[A] ResultView.jsx:273** — « Rédigé par gpt-4o » codé en dur + typo brute (17,9) → FS.
- **[A] TasksView.jsx:208** — pastilles de groupe en terracotta décoratif → neutre/couleur lot.
- **[A] CdcBanner.jsx:211** — boxShadow terracotta `rgba(184,92,44,0.18)` sur CTA.
- **[D] Cibles <44px** : TasksView:312, MapDashboardView:209, MeetingCard:131-142.
- **[B] SessionsModal.jsx:143,355** — toggle « Mes sessions » liste en fait TOUTES les
  sessions du projet (label trompeur).
- **[B] QuotesView.jsx:261** — état vide « Drag-and-drop un PDF » alors que la dropzone
  est masquée sur mobile (226).
- **[B] PlanningView** — suppression de lot possible en Gantt mais pas en Hiérarchie.
- **[B] SearchModal.jsx:115** — résultats remark/action/participant n'ouvrent que le
  projet (pas de deep-link vers l'élément).
- **[B] AlertsDrawer.jsx:51,94** — échec loadPermits/loadInvoices → tombe sur « Tout
  est à jour » (faux succès).

---

## 🧱 Note transverse — deux systèmes de tokens
`src/constants/tokens.js` (exports nommés AC, ACL…) **et** `src/design/tokens.js`
(objet `tokens` v2). DashboardHome utilise le v2 ; le reste le v1. Les deux visent
la même terracotta, mais c'est la source du bug `neutral[400]`. **Décision à
prendre** : converger sur un seul système (ou documenter la frontière).

---

## 📦 Lots de travail proposés (regroupés pour exécution efficace)
- **Lot A — Garde-fous destructifs** : confirmations sur MFA off, retrait collab,
  rétrogradation plan, suppression dossier (PlanManager), suppression photos
  (Gallery), « Tout effacer » (PlanViewer). *1 pattern, ~6 sites.* (P1/P2)
- **Lot B — Erreurs vs état vide** : état erreur distinct + toast sur les 4 vues data
  + ProgressReports (catch) + CollabModal (loading). (P2)
- **Lot C — Bugs fonctionnels** : neutral[400], dictée NoteEditor, « Envoyer au MO »,
  color-picker dup, deletePv, KPI faux, tri factice, accès tableaux non gardés. (P1/P2)
- **Lot D — Accessibilité** : aria-labels batch, toggles role=switch, ProjectCard
  clavier, lightbox clavier, polices ≥11px. (P1/P2)
- **Lot E — Discipline tokens** : hex → tokens (batch), MeetingCard terracotta,
  #fff→WH, + décision sur les deux systèmes de tokens. (P2/P3)
- **Lot F — Nettoyage** : imports + code morts. (P3)
