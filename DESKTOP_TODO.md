# ArchiPilot — Desktop : checklist d'actions

> Liste actionnable dérivée de l'audit (`DESKTOP_BACKLOG.md`). Coche au fur et à
> mesure. Ordre conseillé : **Lot C + Lot A** (impact/risque) → B → D → E → F.
> Gravité : **P1** impact fort · **P2** moyen · **P3** cosmétique/nettoyage.

---

## Lot A — Garde-fous sur actions destructives/sensibles
- [x] **P1** `MfaSection.jsx:79` — confirmation avant `disableMfa()` (désactivation 2FA).
- [x] **P1** `PlanManager.jsx:348,399` — `confirm()` avant `deleteItem()` (dossier + fichiers/sous-dossiers récursifs), surtout si `getChildren(id).length > 0`.
- [x] **P1** `GalleryView.jsx:160,277` — confirmation avant suppression groupée « Supprimer (n) » et suppression en lightbox.
- [x] **P2** `CollabModal.jsx:76` — confirmation avant `handleRemove()` (retrait d'un collaborateur).
- [x] **P2** `PricingSection.jsx:140` — confirmation avant rétrogradation vers Free (perte d'accès features).
- [x] **P2** `PlanViewer.jsx:938` — confirmation avant « Tout effacer » (calques d'annotation).

## Lot B — Erreurs de chargement vs état vide
- [x] **P2** `InvoicesView.jsx:47` — état erreur distinct + toast (au lieu de `setLoading(false)` seul → faux « Aucune facture »).
- [x] **P2** `QuotesView.jsx:46` — idem (état erreur distinct + toast).
- [x] **P2** `PermitsView.jsx:96` — idem.
- [x] **P2** `MapDashboardView.jsx` — idem (catch de chargement).
- [x] **P2** `ProgressReportsView.jsx:100-146` — `try/catch` + `showToast(…, "error")` sur `handleGenerate` (échec IA/réseau silencieux).
- [x] **P2** `CollabModal.jsx:29` — état loading (skeleton/spinner) tant que le 1er load n'a pas répondu.
- [x] **P3** `AlertsDrawer.jsx:51,94` — distinguer l'erreur de l'état succès « Tout est à jour ».

## Lot C — Bugs fonctionnels
- [x] **P1** `DashboardHome.jsx:121,137,196,199,200` — `C.neutral[400]` inexistant → remplacer par `C.neutral[500]` (hiérarchie de texte cassée sur toutes les cartes).
- [x] **P1** `NoteEditor.jsx:1132` — gater la dictée sur `navigator.mediaDevices?.getUserMedia && window.MediaRecorder` (et non `SpeechRecognition`) → débloque Firefox/Safari desktop.
- [x] **P1** `ProgressReportsView.jsx:218-219` — vrai flux « Envoyer au MO » (statut sent + sent_to) ou retirer le CTA trompeur (même handler que « Modifier »).
- [x] **P1** `ProfileView.jsx:673` — supprimer le doublon `<input type="color">` superposé (captation de clic imprévisible).
- [x] **P2** `Overview.jsx:136,1600` — câbler la suppression de PV (passer `setPvToDelete` à `PvRow`) ou retirer le code mort `deletePv`.
- [x] **P2** `DashboardHome.jsx:242` — KPI « Factures en retard » : calculer la vraie valeur (ou retirer le ton `danger` quand 0) → plus de « 0 € » rouge permanent.
- [x] **P2** `DashboardHome.jsx:221,277` — implémenter le tri par date (« Trier : récent » ne trie pas) ou renommer le bouton.
- [x] **P2** `Overview.jsx:129,158-160` — gardes `(project.actions || [])` / `(project.pvHistory || [])` (crash potentiel).
- [x] **P2** `PlanningDashboard.jsx:123-165` — supprimer `DetailPanel` (jamais rendu + caractère corrompu « é�lément »).
- [x] **P3** `QuotesView.jsx:148` — `handleAward` : dériver `_wasAwarded` de `q` (au lieu de `false` codé en dur).
- [ ] **P3** `SessionsModal.jsx:143,355` — toggle « Mes sessions » liste TOUTES les sessions → renommer « Toutes » ou filtrer réellement.
- [ ] **P3** `QuotesView.jsx:261` — message d'état vide « Drag-and-drop un PDF » conditionnel `isMobile` (dropzone masquée sur mobile).
- [ ] **P3** `PlanningView.jsx:327-360 vs 566-575` — harmoniser la suppression de lot entre vue Gantt et vue Hiérarchie.
- [ ] **P3** `SearchModal.jsx:115` — deep-link vers l'élément trouvé (remark/action/participant), pas seulement le projet.

## Lot D — Accessibilité
- [x] **P1** `ProfileView.jsx:536,1046` — toggles Alertes & Push : `role="switch"` + `aria-checked` (ou `aria-pressed`).
- [~] **P2** aria-label sur boutons (boutons retour + OprView edit/suppr + ProfileView avatar + lightbox faits ; reste actions de ligne Invoices/Quotes/Planning) icône-seule : `InvoicesView:130,332,549` · `QuotesView:309-319` · `MapDashboardView:158,209` · `AlertsDrawer:87` · `CollabModal:179` · `GalleryView:282,289,294` · `OprView:541,544` · `PlanningView:209,344,563,572,591,806` · `ProfileView:157`.
- [x] **P2** `DashboardHome.jsx:114` — `ProjectCard` : `role="button"`, `tabIndex={0}`, handler clavier Enter/Espace.
- [x] **P2** `GalleryView.jsx` — navigation clavier de la lightbox (Esc / flèches).
- [x] **P2** Polices ≥ 11px (`FS.xs`) : `InvoicesView:206` · `QuotesView:291` · `MapDashboardView:206` · `PlanningDashboard:259,274,295,403,485`.
- [ ] **P3** Cibles ≥ 44px : `TasksView:312` · `MapDashboardView:209` · `MeetingCard:131-142`.

## Lot E — Discipline des tokens (Direction D)
- [ ] **P2** `MeetingCard.jsx:47-48,86,131-141` — réduire le sur-usage terracotta (1 seule action AC, secondaires en TX2/SBB).
- [ ] **P2** `MapDashboardView.jsx:262-263` — `#F8E5BD/#C0791A` → `AMB/AM`.
- [ ] **P2** `Overview.jsx:496,1466` + `CdcBanner.jsx:109` — bordures `#E8E1DA` → `SBB`.
- [ ] **P2** `OprView.jsx:299,405` — orange « En cours » `#D97706` → `AM` ; `:232,713,739,769,999` → `SB2/SB/GRBG`.
- [ ] **P2** `MfaSection.jsx:70,71,98` — `#EAF3DE/#C6E9B4`, `#FEF2F2/#FECACA`, `#D3D1C7` → `SGB/SG`, `BRB/REDBRD`, `DIS`.
- [ ] **P2** `PricingSection.jsx:55,59,93,135` — `#FDF4E7`, `#EAF3DE/#C6E9B4`, `#FEF2F2/#FECACA`, `#D3D1C7` → `ACL/SGB/BRB/DIS`.
- [ ] **P2** `CollabModal.jsx:98` — pending `#E8A317` → `AM`.
- [ ] **P2** `PlanningDashboard.jsx:48,63,66,274` — `#FEF2F2` → `REDBG/BRB`.
- [ ] **P2** `ReserveLibrarySection.jsx:304-305` — badge « Perso » vert `#EBF3E8/#5A8C3F` → paire de tokens.
- [ ] **P3** `"#fff"/"#000"` littéraux → `WH` (`NoteEditor:658,778`, `GalleryView`, `OprView`…).
- [ ] **P3** `ResultView.jsx:273` — « Rédigé par gpt-4o » externalisé + typo en `FS` (17,9).
- [ ] **P3** `TasksView.jsx:208` — pastilles de groupe terracotta → neutre/couleur du lot.
- [ ] **P3** `CdcBanner.jsx:211` — boxShadow terracotta `rgba(184,92,44,0.18)` (retirer/dériver d'AC).
- [ ] **DÉCISION** — converger les deux systèmes de tokens (`constants/tokens.js` v1 vs `design/tokens.js` v2) — racine du bug `neutral[400]`.

## Lot F — Nettoyage
- [ ] **P3** Imports inutilisés : `Overview` (MEETING_MODES, AskAiButton, BL/BLB/TE/TEB, QT_*) · `ResultView` (DIS/DIST/PB/PvStatusBadge/PV_STATUSES/getPvStatus/nextPvStatus/loadPvSends/formatAddress) · `TasksView` (BL/BLB/REDBG/REDBRD/LH/SB2) · `PlanningView` (useMemo, VI*/TE*/PU*/GRY*/OR*) · `MapDashboardView` (SB2/RD/GR) · `ProfileView` (BL/BLB/AM/SB2).
- [ ] **P3** Code mort : `PermitsView.jsx:415` (`iconBtnStyle`) · `ProgressReportsView.jsx:248-255,394-397` (`KpiSmall`, `iconBtnStyle`).

---

### Récap
- **P1 (8)** : neutral[400], dictée NoteEditor, Envoyer au MO, color-picker dup,
  toggles a11y, + 3 garde-fous (MFA, PlanManager, Gallery).
- **P2 (~25)** : erreurs vs vide, garde-fous restants, bugs fonctionnels, a11y, tokens.
- **P3 (~17)** : nettoyage, cosmétique, micro-UX.
- **0 P0** — rien de bloquant.
