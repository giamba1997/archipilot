# ArchiPilot — Spécification produit exhaustive

> **Nature du document.** Cahier des charges fonctionnel détaillé, dérivé du **code réel**
> (vues React, Edge Functions, migrations SQL) — pas d'invention. Pour chaque feature :
> objectif, user stories, écrans/UI, états & statuts, règles métier, edge cases, gating par plan.
>
> Produit : ArchiPilot `v0.3.0` — copilote IA de gestion de chantier pour architectes belges francophones.
> Stack : React 18 + Vite + Zustand · Supabase (Postgres/Auth/Storage/Realtime/Edge Functions Deno) ·
> OpenAI `gpt-4o-mini` + Whisper · PWA offline-first · Stripe · Vercel.
>
> **Source autoritative du gating** : `src/constants/config.js` (les quotas ci-dessous priment sur toute autre mention).

---

## 0. Conventions & référentiels transverses

### 0.1 Plans & quotas (autoritatif — `config.js`)

| Capacité (`PLAN_FEATURES`) | Free | Pro (39 €/mois · 390 €/an) | Team (89 €/mois · 890 €/an) |
|---|---|---|---|
| `maxProjects` | **1** | ∞ | ∞ |
| `maxPvPerMonth` | **3** | ∞ | ∞ |
| `maxAiPerMonth` | **3** | ∞ | ∞ |
| `maxCollabPerProj` | **0** | **3** | ∞ |
| `sendEmail` (envoi PV/OPR) | ❌ | ✅ | ✅ |
| `gallery` (galerie photos) | ❌ | ✅ | ✅ |
| `planning` / `lots` / `checklists` | ❌ | ✅ | ✅ |
| `opr` (réserves + signatures) | ❌ | ✅ | ✅ |
| `dashboardFull` | ❌ | ✅ | ✅ |
| `pdfNoWatermark` / `pdfCustomLogo` | ❌ | ✅ | ✅ |
| `roles` (rôles collab) | ❌ | ❌ | ✅ |
| `planningCross` (planning cross-projets) | ❌ | ❌ | ✅ |
| `exportCsv` | ❌ | ❌ | ✅ |

- Team inclut **3 sièges**, siège supplémentaire **+9,99 €/mois**.
- Helpers : `hasFeature(plan, feature)` (booléen), `getLimit(plan, feature)` (numérique).
- Les quotas IA (`maxAiPerMonth`, `maxPvPerMonth`) sont **comptés et appliqués côté serveur** (Edge Functions + table `rate_limits` / `ai_usage`). Le client affiche des modales d'upgrade (`UpgradeGate`, `UpgradeRequiredModal`, `upgradeMessages`).
- Limites d'upload (dures, client) : photo **5 Mo**, PDF **10 Mo**, cahier des charges **12 Mo**.

### 0.2 Statuts normalisés (`src/constants/statuses.js`)

- **Cycle de vie projet (7 phases, `step` 1→7)** : `sketch` Esquisse → `preliminary` Avant-projet → `permit` Permis → `execution` Exécution → `construction` Chantier → `reception` Réception → `closed` Clôturé.
- **PV** : `draft` Brouillon → `review` À relire → `validated` Validé → `sent` Envoyé → `late` En retard.
- **Remarques/Actions** : `open` À traiter → `progress` En cours → `done` Résolu (clic cyclique).
- **Réserves OPR (statut)** : `non_levee` → `partiellement_levee` → `levee` (clic cyclique).
- **Réserves OPR (sévérité)** : `critical` Critique · `major` Majeure · `minor` Mineure · `cosmetic` Esthétique.
- **Lots (calculé `calcLotStatus`)** : `planned` (start futur) · `active` (en cours) · `delayed` (fin dépassée) · `done` (progress ≥ 100).
- **Permis** : `preparation` · `deposited` · `complete_request` · `in_review` · `granted` · `refused` · `recourse` · `expired`.
- **Factures** : `draft` · `sent` · `paid` · `overdue` · `cancelled`.
- **Devis** : `pending` · `awarded` · `rejected` (+ `parse_status` : `pending`/`ok`/`error`).
- **Rapports d'avancement** : `draft` · `reviewed` · `sent`.
- **Demandes de signature OPR** : `pending` · `signed` · `declined` · `expired`.

### 0.3 Principe directeur (à respecter dans toute évolution)

> **L'IA assiste, ne se substitue jamais à l'archi.** Toujours opt-in : elle propose, l'archi valide.
> Le copilote est en **lecture seule** sur les données de l'app (il rédige des textes prêts-à-coller, ne mute jamais une réserve/un PV). Aucune action automatique sans validation explicite.

### 0.4 Mobile vs Desktop

`useIsMobile()` — breakpoint **768 px**, resize-aware. Vues **bloquées en édition sur mobile** (consultation seule via `MobileConsultationBanner`) : Factures, Devis, Planning/Gantt (édition), Journal (entrées libres + export), Rapports (génération), Permis (édition), Galerie (upload). Le mobile est centré sur la **capture terrain** (Mode Chantier) et la **consultation**.

---

# PARTIE I — Fondations : projets, cycle de vie, onboarding, navigation

## I.1 Onboarding (`OnboardingWizard.jsx`)

**Objectif.** Initialiser l'utilisateur (rôle, structure, plan) et créer son premier projet en < 3 min.

**User stories.**
- En tant qu'archi solo, je complète un wizard 5 étapes : rôle → structure → plan → 1er projet → confirmation.
- En tant qu'invité d'agence (`compact=true`), je ne renseigne que mon nom (flux 3 étapes).

**Écrans / UI.** Modal plein écran (520–720 px), progress dots.
1. **Rôle** : 4 boutons (Architecte, Conducteur, MO, Entrepreneur) — requis.
2. **Structure** : nom personnel*, nom agence*, adresse siège. *(Variante light invité : nom seul.)*
3. **Plan** : 3 cartes (Free/Pro/Team) — optionnel, ne bloque pas, **aucun paiement à ce stade**.
4. **Premier projet** : nom*, client, entreprise, ville, dates → `onCreateProject({name, client, contractor, city, startDate, endDate})`.
5. **Done** : « Bienvenue, {prénom}. »

**Règles.** Validations par étape (champs* requis pour activer « Continuer »). Plan choisi → `onUpdateProfile({plan})`. `onboarding_completed_at` posé en fin.

**Edge cases.** Plan ne déclenche pas de checkout. Code postal libre. localStorage indisponible → pas de crash (try/catch).

## I.2 Tour guidé (`GuidedTour.jsx`)

**Objectif.** Onboarding éducatif non bloquant : overlay SVG avec cutout sur 7 cibles UI (Overview, sidebar, header, CTA nouveau PV, CTA collab, avatar profil, fin). Fallback de sélecteur si cible absente du DOM ; re-mesure au resize. Skippable à tout moment.

## I.3 Wizards de phase (`PhaseWizardModal.jsx` + `phaseWizards.js`)

**Objectif.** À chaque changement de phase projet, présenter (une seule fois) les features clés de cette phase, sans bloquer.

**Contenu par phase.**
- `preliminary` : CdC, participants, description du programme (pas de CTA).
- `permit` : suivi dossier, alertes, historique → CTA « Ouvrir le suivi permis ».
- `execution` : comparaison devis IA, planning, honoraires → CTA « Voir le planning ».
- `construction` : PV dictée, journal, photos annotées, tâches, rapports → CTA « Commencer un PV ».
- `reception` : OPR, bibliothèque de modèles, signatures à distance → CTA « Ouvrir l'OPR ».
- `closed` : journal consolidé, réception J-365, archivage → CTA « Voir le journal ».

**Règles.** `localStorage: archipilot_phase_wizards_seen` (array phaseIds) → ne re-spamme jamais. Fermeture/CTA → `markWizardSeen(phaseId)`.

## I.4 Gestion des phases (`PhaseManagerModal.jsx`)

**Objectif.** Personnaliser les 7 phases : renommer, réordonner (↑↓), recolorer (palette 7 teintes), ajouter/supprimer.

**Règles.** Minimum 1 phase. Suppression d'une phase active → réassignée à la 1ʳᵉ restante ; lots rattachés → deviennent transverses (`phaseId=""`). Au save : si `statusId` n'existe plus → bascule sur `phases[0]`. État local jusqu'à « Enregistrer ». « Réinitialiser » → `seedPhasesFromDefaults()`.

## I.5 Vue d'ensemble projet (`Overview.jsx` + hero `OverviewPhaseHero.jsx`)

**Objectif.** État global du projet en un coup d'œil + prochaine action contextualisée par phase.

**Onglets workspace.** `Résumé | Actions(n) | Planning | PV(n) | Factures | Devis | Documents(n) | Photos(n) | Fiche`. Compteurs affichés si > 0. Persistance onglet : `localStorage archipilot_overview_tab:{projectId}`. Desktop = barre d'onglets ; mobile = sélecteur (bottom sheet) masquant les vues desktop-only.

**Layout desktop.** Colonne gauche : hero de phase + carte « À faire » + bannière suggestions IA + ToolEntries (Permis, Rapport MO, Journal) + résumé OPR. Colonne droite : prochaine réunion (+ itinéraire Maps), participants (avatars cliquables `tel:`), suivi du temps (total + démarrer).

**Hero adaptatif (variante par phase).**
- `sketch`/`preliminary` → **ProgramHero** : checklist 3 items (CdC, MO, participants), CTA progressif (importer CdC → renseigner participants → interroger l'IA).
- `permit` → **PermitHero** : KPI échéance du permis actif (gros chiffre J-X/J+X, couleur rouge ≤7j / ambre ≤30j / bleu sinon).
- `execution` → **PlanningHero** : aperçu top-5 lots (progress < 100).
- `construction` → **TasksHero** : « Prochain PV à rédiger » + « N PV émis » + CTA « Démarrer une visite » / « Préparer le PV n°X » + top-4 actions ouvertes.
- `reception` → **OprHero** : % de levée (gros), barre de progression, pills (non levées / en cours / levées / critiques pulsantes), CTA « Gérer les réserves ».
- `closed` → **ClosedHero** : archivage + **countdown réception définitive J-365** (anniversaire OPR provisoire) + CTA « Exporter le journal » / « Archiver ».

**Carte « À faire ».** Bloc « À faire maintenant » (« Préparer le PV n°{nextPvNumber} », alerte si pas de réunion planifiée). Liste top-6 tâches ouvertes (= statut ∉ {done, created, cancelled}), triées `sortTasks()` (priorité puis échéance), checkbox = avance le statut, dot priorité, n° monospace, date rouge si overdue. Lien « Voir toutes les tâches ».

**Bandeaux.** Brouillons offline (si présents, bouton « Générer » si online) ; urgences (« X action(s) urgente(s) »).

**Edge cases.** Pas de participants/PV/réunion → messages dédiés. Onglet masqué au changement de viewport → fallback « Résumé ». `loadInvoices`/`loadQuotes` échouent (table absente) → fallback silencieux.

## I.6 Navigation & contexte (`Sidebar.jsx`)

**Objectif.** Sélection rapide de projet + bascule workspace Personnel ↔ Agences.

**UI.** Sidebar 264 px : branding, **context switcher** (Personnel / org:{id} · rôle, + « Créer une agence »), CTA « Nouveau projet », « Vue d'ensemble », section **Projets** (tri Client / Récents / A→Z), section **Partagés avec moi** (si > 0), section **Archivés** (collapsible). Chaque projet : icône colorée par phase, nom + sous-titre (client ou phase + n° PV), **7 progress dots** (remplis jusqu'à `step`), indicateur actif. Tri par client = groupes collapsibles avec compteur.

## I.7 Participants & rôles (`participantRoles.js`)

**Rôles standards.** MOA (MO, Promoteur) · MOE (Architecte, Bureau d'études, Ing. stabilité/PEB/techniques, Géomètre-expert, Contrôleur technique) · Exécution (Entreprise, Sous-traitant, Coordinateur sécurité-santé). Rôle libre possible (datalist). Avatars : initiales 2 lettres, `tel:` si téléphone.

---

# PARTIE II — Cœur métier : prise de notes, génération de PV, copilote IA

## II.1 Prise de notes & remarques (`NoteEditor.jsx`)

**Objectif.** Capturer les observations d'une visite (texte / dictée par poste / dictée continue) et les structurer en **remarques atomiques** taggées par statut et destinataire.

**User stories.** Dicter mes observations et les voir transformées en remarques · saisir une remarque urgente · revoir ma dictée avant répartition · suivre le statut (open→progress→done) · assigner à un participant · convertir une remarque en réserve OPR sans ressaisir.

**Modes de saisie.**
- **Chooser** (1er accès) : Écrire / Dicter (par poste) / Dicter (continu).
- **Write** : input + toggles Observation/Urgent + « Ajouter ».
- **Voice (par poste)** : bouton rond rouge pulsant, VU-mètre, spinner « Transcription… », transcription Whisper splittée en phrases → **1 phrase = 1 remarque** (regex `(?<=[.!?…])\s+(?=[A-ZÉÈÀ…])`).
- **Dictée continue** : enregistrement long → mode **Review** (texte complet éditable) → `dispatch-remarks` (algo déterministe, **pas d'IA**) répartit le texte par poste.

**Remarque (modèle).** `{ id, text, urgent, status, recipients[], carriedFrom (pvNumber), convertedToReserveId, convertedToReserveCode }`.

**Règles métier.**
- **Auto-report** : au 1er accès, les remarques non `done` sans `carriedFrom` sont taggées `carriedFrom: lastPvNumber` (continuité entre PV).
- **Photos** : miniatures 80×80, badge « annoté » (strokes/markers/pins), clic → `PhotoAnnotationViewer` (dessin). Upload async en arrière-plan (queue si offline).
- **Conversion remarque → réserve** : crée `project.reserves[]` avec code `R-XXX` auto, sévérité (urgent→critical sinon major), statut `non_levee`, back-links `originPostId`/`originRemarkId` ; remarque marquée convertie.
- **Présence / soft-lock** (`usePresence`) : l'éditeur = client avec le `claim_at` le plus récent ; bouton « Reprendre la main » met à jour `claim_at` ; les autres passent en lecture seule visuelle.
- **Undo/Redo** par poste (stack 50, Ctrl+Z / Ctrl+Shift+Z).
- **Présence/absence** des participants + `visitStart`/`visitEnd` (HH:MM fr-BE) stockés dans `pvFieldData`.

**Edge cases.** Micro refusé/absent/erreur → messages dédiés. Audio : compresseur dynamique + gain (chantier bruyant), opus 32 kbps. PV sans poste → `dispatch-remarks` crée « 01 Situation du chantier ». Offline → state local + queue.

## II.2 Génération de PV (`ResultView.jsx` + `generate-pv`)

**Objectif.** Transformer les remarques brutes en PV rédigé professionnel, selon un style, avec filtrage par destinataire, édition, validation, export PDF.

**User stories.** Générer en un clic · choisir le style · filtrer par destinataire · éditer/valider avant sauvegarde · télécharger en PDF (filigrane selon plan) · récupérer les tâches suggérées.

**Templates de PV (`templates.js`).** `standard` (belge, 3ᵉ pers., factuel), `detailed` (+ « ACTIONS REQUISES » par section), `concise` (points clés), `french` (FR, vouvoiement).

**Numérotation des remarques (`remarkNumbering`).** `none` · `sequential` · `post-seq` (01.1) · `global` (continu).

**Flux IA (2 appels OpenAI `gpt-4o-mini`).**
1. **Génération PV** : systemPrompt (template) + userPrompt en 3 blocs (Contexte non-reproduit / Notes brutes groupées par statut / Rappel format strict `NN. Titre`, `NN.X texte`). Inclut le **PV précédent (cap 6000 car.)** pour détecter les évolutions → section optionnelle « 00. Évolutions ». Temp 0.3, `max_tokens` min(client, 4000). Nettoyage `cleanPvOutput()` (strip markdown, force numérotation).
2. **Extraction de tâches** (non bloquant) : JSON strict, **anti-bruit** (rien plutôt que du vague), max 8 tâches, rejette « informer/discuter/voir avec X » sans livrable, `sourceExcerpt` copié du PV. Temp 0.1.

**Sauvegarde PV (`pvHistory[]`).** `{ number, date, author, postsCount, excerpt(140c), content, inputNotes (snapshot), status:"draft", suggestedTasks[] }`. Remarques non résolues reportées au prochain PV (`carriedFrom`) ; remarques `done` effacées.

**UI.** États loading (étapes animées + barre + Annuler/AbortController) / result (bannière IA, textarea éditable, Copier, Valider&Sauvegarder, Générer PDF, notice filigrane si Free, Envoyer par email après save) / error (Réessayer).

**Filtrage destinataire.** Si `pvRecipients` fourni : garde les remarques sans assignataire (= pour tous) + celles assignées au destinataire.

**Gating.** `maxPvPerMonth` (Free 3) · `pdfNoWatermark` (Pro+) · `sendEmail` (Pro+).

**Edge cases.** Réponse vide → erreur. Cap tokens serveur 4000. Offline → erreur + Réessayer. Tâches suggérées en échec = liste vide (non bloquant).

## II.3 Tâches suggérées (`SuggestedTasksModal.jsx`)

**Objectif.** Valider (opt-in) les actions détectées par l'IA dans le PV.

**UI.** Groupées par PV. Par suggestion : `sourceExcerpt` (extrait justificatif), champs éditables (titre, priorité low/medium/high/urgent, échéance, assigné), boutons Rejeter / Créer la tâche. « Tout accepter » (avec confirmation).

**Règles.** Accepter → `newTask()` (status `open`, `origin:"pv"`, `pvNumber`) ajoutée à `project.tasks[]` ; suggestion → `accepted` + `taskId`. Rejeter → `rejected`. Réouverture = uniquement les `pending`.

## II.4 Copilote IA — chat (`ChatModal.jsx` + `ask-archipilot`)

**Objectif.** Assistant conversationnel contextuel (projets, PV, CdC, actions) : brainstorming, rédaction, analyse, conseils métier — sans quitter l'app. « Remplace ChatGPT, mais qui connaît tes chantiers. »

**User stories.** Poser des questions sur mes projets · joindre photo/PDF et demander un avis · basculer entre sujets sans perdre l'historique · poser depuis n'importe quel contexte (prefill via `AskAiButton`) · dicter ma question.

**UI.** FAB « ✦ » (point rouge si non-lu). Modal flottante : header (nouveau sujet « + », archives, fermer), body 3 états (empty avec greeting + insight contextualisé + 4 suggestions dynamiques / messages avec markdown léger / archives), input (textarea auto-grow, paperclip, micro Web Speech fr-FR, send). Drag & drop de fichiers.

**Contexte injecté (`chatContext.js`).** Markdown *stuffé* (pas d'embeddings) : header user, résumé global, **projet actif détaillé** (méta, actions ouvertes/urgentes, dernier PV intégral cap 8000c, CdC cap 30 000c, réserves, compteurs postes, sessions de temps), autres projets en synthèse, archivés en liste. Caps pour rester sous le budget tokens.

**Pièces jointes (`chatAttachments.js`).** Images (≤5 Mo, resize ≤1600px, vision low-detail) · PDF (≤12 Mo, `extractPdfText` 30 pages/30 000c, fallback `rasterizePdfPages` 5 pages si scanné) · texte (≤12 Mo). `history` = 25 derniers messages (sans pièces jointes). Réponse `max_tokens` 2500, temp 0.4.

**System prompt (strict).** Ton « collègue archi », tutoiement, opinions assumées, emojis rares. **Anti-hallucination** sur les données perso (tout chiffre/nom/date vient du contexte, sinon « je ne vois pas ce projet ») · connaissances générales autorisées (normes belges) · **lecture seule** (rédige, ne mute pas) · pas de méta (« d'après le contexte »).

**Archives.** Jusqu'à 10 conversations (FIFO), localStorage. « + » archive la courante (titre = 1ʳᵉ question, 60c).

**Gating.** `maxAiPerMonth` (Free 3). Edge cases : offline → erreur ; PDF scanné → vision ; overflow → trim/caps.

## II.5 Cahier des charges (`CdcStructureModal.jsx` + `parse-cdc`)

**Objectif.** Extraire la structure d'un CdC (postes, obligations, attendus) en JSON, puis laisser l'archi valider avant application.

**Flux.** Bannière CdC (`CdcBanner.jsx`) si `project.cahierDesCharges` → « Voir la structure ». Modal : loading / error (Réessayer + upgrade) / data en 3 sections (Postes cochables avec « tout cocher », Obligations avec badge type, Attendus avec catégorie). CTA `AskAiButton` (« Discuter avec l'IA » en passant la structure en pièce jointe) + Appliquer (compteur sélection).

**Sortie `parse-cdc`** (temp 0.1, JSON). Postes (n° 2 chiffres, numérotation métier 01-99, max 25, label court + summary 100c) · Obligations (type matériau/marque/performance/norme/délai/autre, postId optionnel, max 30) · Attendus (catégorie documents/tests/essais/autre, max 20). Terminologie belge (PEB, RGPT, CCT, RGIE, CSTC). N'invente rien ; CdC non reconnu → tableaux vides.

**Application non destructive (client).** Postes fusionnés (ajoute manquants), obligations → `customFields`, attendus → checklist `tasks[]`. Cache `cdc.structured` (re-visite = pas de re-call).

**Gating.** `maxAiPerMonth`. Edge cases : PDF scanné → state vide ; quota → upgrade ; input cap.

## II.6 Envoi de PV par email (`SendPvModal.jsx` + `send-pv-email`)

**Objectif.** Envoyer le PV (PDF ou texte) avec aperçu et signature personnalisée + tracking de lecture.

**Flux 2 étapes.** (1) Destinataires : participants cochables + ajout email externe (regex) + « joindre le PDF ». (2) Aperçu/édition : objet pré-rempli (`PV n°X — Projet (date)`), message HTML éditable (sanitizé), éditeur de **signature globale** inline (persistée `profile.emailSignature`), aperçu visuel email. États sent/error.

**Règles.** PDF via `generatePDF(returnDataUrl)` → base64. `send-pv-email` → enregistre `pv_sends` (sent_at/sent_to/resend_id). Lecture trackée via `track-pv-read` → `pv_reads`. **Gating** `sendEmail` (Pro+). Si Free → `UpgradeRequiredModal`.

---

# PARTIE III — OPR, réserves & signature électronique

> **Gating global : la feature OPR est réservée Pro/Team** (`opr`). L'envoi (signature/email) requiert `sendEmail`. Rate-limit : **50 demandes de signature/heure**.

## III.1 Écran OPR (`OprView.jsx`)

**Objectif.** Centraliser la réception : CRUD réserves, signatures (sur place + à distance), historique OPR.

**User stories.** Lister/filtrer les réserves (par statut, par entreprise) · changer le statut en un clic (cycle) · créer/éditer une réserve complète · envoyer un OPR figé pour signature à distance · signer sur place (canvas) · diffuser l'OPR final par email + tracer l'envoi.

**Dashboard KPI.** Total · Non levées · En cours · Levées (+ %) · Critiques non levées (si > 0) · barre de progression. Filtres : statut, entreprise (desktop). Stats par entreprise (barres, desktop).

**Historique OPR (`project.oprHistory[]`).** Par OPR : n° + type (provisoire/définitive) + date + nb réserves figées + signatures locales + signatures distantes (« 2/3 signées »). **Badges** : « Prêt à diffuser » (toutes signées) · « Diffusé » (`completed`) · « N refus ». Détail par demande (statut, date, motif de refus) + bouton **Relancer** (si declined/expired → nouveau sigreq).

**Mobile.** Boutons « Signer sur place » / « Envoyer pour signature » masqués ; statut en lecture seule ; section « Par entreprise » masquée ; bannière de consultation.

## III.2 Formulaire réserve (`ReserveForm` dans `OprView`)

**Champs.** Code (`R-001` éditable) · gravité (4 boutons) · description* (avec **autocomplete bibliothèque F8** si < 60c, top-5 par usage) · entrepreneur (datalist participants) · localisation · échéance · notes · photos (grid, upload immédiat ou lien galerie). Bouton « Enregistrer comme modèle » (si desc > 10c, pas déjà un modèle).

## III.3 Bibliothèque de réserves types (`ReserveLibrarySection.jsx`, F8)

**3 niveaux.** Perso (`owner_user_id`) éditable · Agence (`org_id`, si droit d'écriture) · Système (`is_system`, ~50 modèles seedés, lecture seule). Filtres (Tous/Perso/Agence/Système) + recherche. Tri par `usage_count`. RPC `increment_reserve_template_usage` (fire-and-forget) au moment d'enregistrer une réserve issue d'un modèle.

## III.4 Signature sur place (`SignOprModal.jsx`)

**Flux.** Type OPR (provisoire/définitive) → slots signataires (pré-remplis depuis participants, sinon MO/Archi/Entreprise) → canvas signature (souris + tactile, 240px) → « Finaliser l'OPR ». Crée `oprRecord` : `{ id, number, type, date, reserves (snapshot), reservesHash (SHA-256), signatures[{name, role, email, dataUrl, signedAt, userAgent, hash}], sentTo[], completed:false }`. Activable dès ≥ 1 signature.

## III.5 Signature à distance (`RequestSignaturesModal.jsx` + `request-opr-signatures`)

**Flux.** Type OPR + signataires (nom/rôle/email) + message custom → génère PDF non signé (même pour tous) → Edge Function : par signataire crée une ligne `opr_signature_requests` (token 64 hex, `status:pending`, `expires_at: +14j`) + envoie l'email Resend (lien `${APP_URL}/sign/${token}` + PDF). Retour `delivery[]` (envoyé/erreur par email). Sauvegarde `oprRecord` local (`signingRequest:true`).

**Edge cases.** 1–20 signataires. Rate-limit 50/h (429 + resetAt). Email échoué → affiché, non bloquant.

## III.6 Page publique de signature (`PublicSignPage.jsx` + `opr-signing`)

**Objectif.** Signer **sans compte**, via le token de l'URL (Edge Function service-role, bypass RLS).

**États.** loading · error_invalid · error_expired · already_signed (affiche la signature) · declined · ready · submitting · done.

**Vue ready.** Badge « Signature requise » + OPR n° + type + projet + date + bloc signataire + **liste des réserves figées** (code, sévérité, statut, contractor, lieu, échéance ; ou « réception sans réserve ») + mention de valeur probante. Actions : **Refuser** (motif ≤500c) ou **Signer** (canvas inline 200px).

**Actions Edge.** `load` (auto-expire si > 14j) · `submit` (valide pending + non expiré + dataUrl ≤2 Mo ; pose status `signed`, `signed_at/ip/user_agent` ; notifie `opr_signed` ; si **tous** signés → notif `opr_completed`) · `decline` (status `declined` + `decline_reason` ; notifie `opr_declined`).

**Sécurité.** Snapshot immuable + hash SHA-256. Token unique non réutilisable. dataUrl jamais loggée. Relance = **nouveau** sigreq (l'ancien conservé pour audit).

## III.7 Diffusion OPR par email (`SendOprModal.jsx`)

Destinataires dédupliqués (participants + signataires distants) + ajout libre, objet/message éditables, PDF auto-joint (signatures embarquées si présentes). Gating `sendEmail`.

**Flux complet.** Créer réserves → signer sur place et/ou envoyer à distance → (tous signés → notif `opr_completed`) → diffuser le rapport final consolidé (badge « Diffusé »).

---

# PARTIE IV — Finance

> Vues **desktop-only en édition** (mobile = consultation). RLS : `owner_user_id` OU membre org avec droit d'écriture.

## IV.1 Honoraires & facturation (`InvoicesView.jsx`, F1)

**Objectif.** Facturer les honoraires par phase, numérotation TVA conforme, suivi des paiements.

**User stories.** Créer/éditer une facture · changer son statut · annuler (garde le n°) · lister avec KPI · télécharger le PDF · supprimer (déconseillé).

**UI.** KPI (CA TTC total · Payé · En attente · En retard + count) · filtres statut · cartes facture (n° monospace, badge statut, phase, description, client, dates, TTC/HT, actions download/send/check/edit/trash, accent « EN RETARD »). Modal : phase + n° (bouton « Auto »), client (nom*/adresse/TVA), description*, montants (HT* + taux **21/12/6/0%** + TTC calculé live), dates (émission* / échéance* = +`invoicePaymentTermsDays`), communication bancaire, notes, statut, **warning si profil émetteur incomplet** (IBAN/TVA).

**Règles.**
- **Numérotation `next_invoice_number(year)`** : RPC **atomique** (verrou), format `YYYY-NNN`, unique par `owner`. Saisie manuelle possible (contrainte UNIQUE).
- **TVA** : `amount_vat` et `amount_ttc` sont des colonnes **GENERATED STORED** (pas de drift). Taux belges 0/6/12/21.
- **Timestamps status-driven** : `sent_at` posé 1× au passage `sent`, `paid_at` 1× au passage `paid` (jamais écrasés ; `_wasSent`/`_wasPaid`).
- **Overdue temps réel** : `status==='overdue' || (status==='sent' && due_date < today)`.

**Edge cases.** Suppression facturée → confirmation « préfère Annulée ». Phase supprimée → `phase_id/label` conservés (snapshot immuable). Profil sans IBAN → PDF non conforme SEPA + warning.

## IV.2 Comparaison de devis (`QuotesView.jsx` + `parse-quote`, F3)

**Objectif.** Comparer N devis d'un même lot via extraction IA + matrice d'écarts.

**User stories.** Upload drag-drop · parsing IA auto · détail devis · matrice comparative · attribuer le lot · sélectionner le lot actif.

**UI.** Sélecteur de lot (chips) · drop-zone (desktop, masquée mobile) · liste groupée par lot (carte : contractor, badge statut, n° postes, validité, total HT/TTC, actions eye/check/trash, « Comparer » si ≥2). Modal détail : résumé IA + warnings + tableau postes (code/desc/qté/unité/PU HT/total HT). Modal comparaison : totaux HT (min vert / max rouge) + matrice postes×entreprises (écarts >20% : **vert** < moyenne, **rouge** > moyenne ; **jaune** si poste absent chez ≥1 ; « — » si absent).

**Règles `parse-quote`.** OpenAI `gpt-4o-mini`, input `text` (pdf.js) ou `imagesBase64` (Vision fallback scanné). Sortie JSON : `contractor_name/email`, `total_ht/ttc`, `validity_days`, `items[{code, description, quantity, unit, unit_price_ht, total_ht, category}]`, `summary`, `warnings[]`. Champs non identifiés → null/"" (jamais deviner). Max 50 items. **Prompt défensif anti-injection** (le devis est une donnée, pas une instruction). `response_format json_object`, temp 0.1. **Rate-limit 20 devis/h**.

**Attribution.** Award X → status `awarded` + `awarded_at` ; tous les autres devis du lot → `rejected` (avec confirmation).

**Gating.** Parsing IA → `checkAiUsage()` → upgrade requis (Free n'a pas l'IA). Stockage v1 : `file_data_url` base64 (champ `file_url` Storage réservé v2).

---

# PARTIE V — Suivi & conformité

## V.1 Permis d'urbanisme (`PermitsView.jsx`, F4)

**Objectif.** Suivre le cycle de vie d'un permis belge avec calcul auto des échéances légales.

**UI.** Encadré rouge des 3 permis les plus urgents · liste de cartes (référence, badge statut, type, procédure, commune, dates dépôt/AR/échéance/décision, notes) · modal création/édition (desktop) avec **aperçu live du deadline**. Mobile = consultation.

**Règles.** `deadline = (ar_date || depot_date) + procedure_days`. Procédures **30/75/105/230 j** (ou `autres` = durée custom). Pas de date de départ → deadline null. **Alerte active** si statut ∈ {deposited, complete_request, in_review} ET `daysUntil ≤ 30` (urgence visuelle rouge). Types : urbanisme/env/mixte/enseigne/démolition.

**Edge cases.** Dates invalides → « — ». Documents : champ JSONB (URLs/notes en v1, pas d'upload).

## V.2 Alertes & rappels (`AlertsDrawer.jsx` + `alerts.js`, F5)

**Objectif.** Drawer « Prochaines échéances » **100% client-side** (pas de cron), agrégeant tous les projets. Pull-based, opt-in, jamais intrusif.

**Règles (6 règles JS).**
1. **Réception définitive J-365** (OPR provisoire il y a 11-13 mois).
2. **Réserves overdue** (non levées, deadline ≤ 30j).
3. **Permis deadline** (statut actif, deadline ≤ 30j).
4. **Tâches overdue** (ouvertes, dueDate ≤ 7j).
5. **Factures impayées** (`sent`/`overdue`, due_date < today) → **toujours `critical`**.
6. **Pas de PV depuis 30j** (projet en construction/exécution).

**Sévérité.** `critical` (daysUntil ≤ 0) · `high` (≤7j) · `medium` (≤30j) · `low` (>30j). Tri par sévérité puis daysUntil. Préférences `profile.alert_settings` (toggle par type) ; types désactivés masqués. Clic alerte → ouvre le projet/vue concernée.

## V.3 Journal de chantier (`JournalView.jsx`, F2)

**Objectif.** Timeline chronologique unique (récent en haut) agrégeant tout l'historique → **conformité RGPT** (audits/litiges).

**Entrées agrégées.** PV · OPR · Réserves · Actions/Tâches · Photos (groupées par jour) · **entrées libres** (`project.journalEntries[]` : date, présents, observation, météo, photos). Dot coloré par type.

**UI.** Filtres (type, période 7/30/90j, recherche texte) · timeline (badge type, titre, date, body 2 lignes, miniatures ≤5) · drawer détail · modal entrée libre (date*/heure/présents/observation*/météo/photos) · **export PDF** (jsPDF, nom de l'archi). Mobile = lecture seule.

**Edge cases.** Parse ISO puis FR. Vide → message. Photos > 5 → « +N ». Entrée sans heure → date seule.

## V.4 Rapports d'avancement client (`ProgressReportsView.jsx` + `generate-progress-report`, F10)

**Objectif.** Générer (IA, à la demande) un rapport markdown de synthèse pour le MO, sur une période, éditable puis exportable.

**UI.** Carte « Générer » (pills 7/15/30/90j + 4 KPI période : PV/photos/réserves ouvertes/tâches ouvertes + « Générer ») · historique (badge statut, généré/envoyé, éditer/supprimer) · modal éditeur (statut draft/reviewed/sent, champ « Envoyé à » si sent, textarea markdown, Copier/Enregistrer). Mobile = consultation.

**IA.** `gpt-4o-mini`, structure imposée (`# Avancement` + Faits marquants / État / Points de vigilance / Prochaines étapes), max ~400 mots, pas d'invention, agrège PV+photos+réserves+tâches+permits de la période. **Gating** : génération IA (upgrade requis), rate-limit 10/h.

---

# PARTIE VI — Planning, temps, galerie, carte

## VI.1 Planning / Gantt (`PlanningView.jsx`) — `gating: planning`/`lots` (Pro+)

**Objectif.** Hiérarchie **Phase → Lot → Tâche** + vue Gantt.

**UI.** 2 vues : **Hiérarchie** (sections par phase, lots repliables, tâches arborescentes `parentId`, +Lot/+Task) et **Gantt** (barres lot + steps indentés, progression, marqueur « Aujourd'hui »). Filtre par phase (défaut « Toutes »). **Import CSV** (mapping colonnes Lot/Responsable/Début/Fin/Avancement, preview, desktop).

**Modèles.** Lot `{id, name, responsable, startDate, endDate, duration, progress, color, phaseId}`. Tâche `{id, number (stable, jamais réutilisé), title, status, priority, dueDate, assignee, lotId, parentId, notes}`. `calcLotStatus` (planned/active/delayed/done). Durée = start+end (auto duration) ou start+duration (auto end). Mobile = hiérarchie seule.

## VI.2 Feuilles de temps (`TimesheetView.jsx` + `timer.js`)

**Objectif.** Time-tracking cross-projets (timer + saisie manuelle), agrégation, export CSV. — `exportCsv` réservé Team.

**UI.** Toggle scope (Mon temps / Toute l'agence — admin org) · KPI (semaine/mois/total) · breakdown par projet · liste filtrable (mois/lot/personne) · export CSV. Session `{id, startedAt, endedAt, durationSeconds, note, taskId, isManual, userId, userName}`. Timer persistant localStorage (segments pause/reprise). Saisie manuelle : date+durée ou timestamps (validation 0 < durée ≤ 24h).

## VI.3 Galerie photos (`GalleryView.jsx`) — `gating: gallery` (Pro+)

**Objectif.** Bibliothèque photos + annotation (markers/strokes via `PlanViewer`) + liaison réserves (N:N) + lightbox + sélection batch.

**UI.** Grid 4 colonnes (badges : annoté / N réserves / mic vocal / date) · lightbox (prev/next, annoter/lier/supprimer) · modal « Lier à réserve » (checkboxes triées open→partial→closed). Photo `{id, url|dataUrl, storagePath, date, caption, voiceAnnotated, markers[], strokes[], linkedReserves[], pins[], geo?}`. Upload : FileReader → dataUrl → `uploadPhoto` async (remplace par URL cloud si online, sinon reste local). Mobile = upload masqué (annotation = plein écran desktop).

## VI.4 Carte multi-projets (`MapDashboardView.jsx` + `geocode.js`, F9)

**Objectif.** Vue Leaflet/OSM cross-projets, pins par statut, géocodage Nominatim caché.

**UI.** Filtres statut (pills) · carte Leaflet (pins divIcon colorés par statut) · drawer infos (nom/MO/adresse/Ouvrir) · info « N sans adresse ». Géocodage : cache `localStorage archipilot:geocache:v1`, **file 1 req/sec** (1100ms), `?countrycodes=be&limit=1`, résultat `{lat, lng, at}` → `project.geo`. fitBounds auto. **Gratuit** (Nominatim).

---

# PARTIE VII — Mobile & Mode Chantier

## VII.1 Mode Chantier (`ChantierModeView.jsx` + `chantierVisit.js`)

**Objectif.** Capturer une visite terrain (réserves, photos, décisions, réunion enregistrée) et composer un **brouillon de PV** à la sortie. Feature mobile signature, **gratuite**.

**Déroulé (2 phases).**
- **Phase Inspection** (header blanc) : chip durée live, 3 boutons (Photo / Note vocale / Réserve), stats récap, présents (chips toggle), réserves ouvertes (boutons « Toujours » / « Levée »), nouvelles réserves, décisions.
- **Phase Réunion** (header **rouge**, après modal RGPD) : enregistrement audio de la conversation (audio-mètre live, chrono), recorder pause en inspection / resume en réunion.
- **Fin** : Whisper transcrit l'audio → `composeDraftPvFromVisit` (présents + réserves par catégorie + décisions + photos + transcription) → `savePvDraftLocal` → toast « PV n°N créé » → retour Overview.

**État persistant (`localStorage archipilot_active_visit`).** `{projectId, startedAt, endedAt, phase, meetingStartedAt, weather, presents[], reserveActions[], newReserveIds[], decisions[], photoIds[], meetingTranscript}`.

**Règles.** `startVisit` : reprend si visite active sur ce projet ; **null si visite active sur un autre projet**. Mutations métier (statut réserve, création réserve `R-XXX`, photo) **appliquées immédiatement** à l'état (la visite ne fait que logger l'ordre temporel). **Enrichissements Tier 1** : météo auto (Open-Meteo, codes WMO→FR, dans le PV pour RGPT) ; GPS photo (4s, non bloquant) ; reprise de visite (banner sticky sur MobileHome).

**Capture photo (`CaptureSheet`/`PhotoSheet`).** Auto-ouvre caméra (`capture=environment`) → preview → auto-Whisper 250ms → transcription éditable → Garder/Recommencer/Sans annotation. `voiceAnnotated` → badge mic. GPS + upload async en arrière-plan.

**Edge cases.** Reload pendant enregistrement → blob audio perdu (limite v1 connue), `meetingStartedAt` conservé. Micro refusé → visite continue sans transcription. Réunion > 1h → un seul appel Whisper final (pas de chunking v1). Réserve supprimée pendant la visite → filtrée à la composition.

## VII.2 Vues mobiles

**MobileHome (`MobileHome.jsx`).** Greeting heure-aware, banner visite en cours, **Aujourd'hui** (urgences scorées : réunion=100, permis J-=80→59, notifs=30 ; cap 3 + expander), **Mes chantiers** (top-5 par activité, hints contextuels), **Chantiers proches** (géoloc opt-in, Haversine, cache 30 min), **Stats hebdo** (7j). Footer (Tous les projets / Nouveau projet).

**MobileChantiersList (`MobileChantiersList.jsx`).** Recherche instantanée (nom/adresse/ville/client/contractor/participants) + filtres (Actifs/Tous/Archivés) ; tri actifs par `urgencyScore`, archivés alphabétique.

**MobileNotifs (`MobileNotifs.jsx`).** Inbox consolidée : Invitations (Accepter/Refuser) · Échéances <7j (permis, réserves en retard) · Notifs non lues (icônes sémantiques opr_signed/declined/completed, comment, invite) · Historique collapsible (« Tout supprimer »). Navigation : permis→`permits`, réserve→`opr`.

**MobileBottomBar (`MobileBottomBar.jsx`).** 5 slots : Accueil · Chantiers · **FAB Visite** (terracotta, pulse si visite active) · Notifs (badge non-lus) · Moi. Safe-area inset respectée.

## VII.3 Capture rapide (`QuickCaptureSheet.jsx`)

Sheet 2×2 : Photo / Note vocale / Réserve / PV dicté (`MobilePvDictateSheet.jsx`). Sous-sheet vocal auto-start.

---

# PARTIE VIII — Collaboration & agences

## VIII.1 Collaboration projet (`CollabModal.jsx` + `project_members`)

**Objectif.** Inviter des externes (MO, entreprises) sur **un** projet.

**Rôles.** Admin (gère + invite) · Contributor (crée/édite) · Reader (lecture). **Gating** : Free 0 · **Pro 3/projet, Contributor uniquement** · Team ∞, tous rôles. Détection « déjà dans ton agence » (warning). Au moins 1 admin requis. Lifecycle invitation : pending → accepted/declined (email via `send-invite-email`, notif cloche). Edge : « Déjà invité », « Au moins un admin requis ».

## VIII.2 Agences / Team (`AgencyView.jsx` + `organizations`)

**Objectif.** Créer/gérer une agence partageant **tous** ses projets (`organization_data`).

**Rôles org.** owner · admin · member · viewer. **Sièges** : `seat_limit` (Team = 3 inclus + extras), `seatsUsed = members + invitations`, Inviter désactivé si plein. Info : « les membres accèdent à TOUS les projets ; pour un projet précis, utiliser Collaborateurs ».

**Actions.** Créer org (`create-org`) · inviter (`invite-org-member`, email + rôle, token 7j) · révoquer (`revoke-org-invite`) · retirer (`remove-org-member`) · **transférer la propriété** (`transfer-org-ownership`) · **supprimer l'agence** (owner, cascade irréversible) · **quitter** (`leave-org`, non-owner, contributions conservées). Multi-tenant via RLS (`is_org_member`, `is_org_admin`, `can_write_org_data`). Sync `organization_data` debouncée 1,5s (**last-write-wins, sans verrou** — limite connue).

---

# PARTIE IX — Offline, PWA & notifications

## IX.1 Offline & persistance locale (`offline.js`)

**Clés localStorage.** `archipilot_active_visit` · `archipilot_pv_drafts` · `archipilot_offline_queue` (structure réservée v2) · `archipilot_sync_state` `{dirty, lastSyncedAt, changedAt}`.

**Règles.** Mutations offline appliquées au state + `markDirty()`. Photos : dataUrl immédiat, upload async si online (sinon retenté au sync). Brouillons PV offline → proposés au merge sur desktop (draft local override). Badge de sync (`SyncBadge`) côté desktop. **Lecture seule offline** (cache SW). Edge : Whisper offline → pas de transcription ; reload en visite → blob perdu.

## IX.2 Web Push (`useWebPushSubscription.js` + `sw.js` + `send-push-notification`)

**Flux.** Permission → `pushManager.subscribe(VAPID_PUBLIC)` → upsert `web_push_subscriptions(user_id, endpoint, p256dh, auth, user_agent)`. Payload `{title, body, icon, category, deep_link, data}`. SW : handler `push` (showNotification) + `notificationclick` (focus client existant + postMessage `archipilot:deep-link`, sinon `openWindow`). Deep-link `/?project=ID&view=VIEW` appliqué par `App.jsx`.

**Préférences (`profile.push_settings`).** Kill-switch `enabled` + toggles par catégorie : opr, permits, reserves, invoices, collab, reception. `triggerPushNotification` non bloquant (la notif cloche en DB reste créée même si push échoue).

**Edge.** iOS Safari < 16.4 / HTTP → non supporté (message « installer comme app »). Endpoint 410 → cleanup. Multi-device : un endpoint par device.

## IX.3 Service Worker (`sw.js`)

Workbox : précache + runtime (statics CacheFirst 30j, images 90j). Handlers push + notificationclick (deep-link).

---

# PARTIE X — Données, sécurité, IA (récapitulatif technique)

## X.1 Modèle de données

- **JSONB** : `user_data.projects` (perso) / `organization_data.projects` (agence) — sync debouncée 1,5s. Un projet contient : méta, `phases[]`, `participants[]`, `posts[]`/remarques, `pvHistory[]`, `oprHistory[]`, `reserves[]`, `actions[]`/`tasks[]`, `lots[]`, `gallery[]`, `journalEntries[]`, `timeSessions[]`, `cahierDesCharges`, `geo`, `customFields`.
- **Tables relationnelles** : `profiles`, `invoices` (+ `invoice_counters`/RPC), `permits`, `quotes`, `progress_reports`, `reserve_templates`, `opr_signature_requests`, `project_members`, `notifications`, `pv_sends`/`pv_reads`, `web_push_subscriptions`, `organizations`/`organization_members`/`organization_invitations`, `comments`, `analytics_events`, `rate_limits`/`ai_usage`.
- **Storage** : bucket `project-files` (photos). 16 migrations (`001`→`016`).

## X.2 Edge Functions

IA : `generate-pv`, `ask-archipilot`, `parse-cdc`, `parse-quote`, `generate-progress-report`, `transcribe-audio`, `dispatch-remarks` (déterministe). Transactionnel : `send-pv-email`, `send-invite-email`, `send-push-notification`, `request-opr-signatures`, `opr-signing`, `track-pv-read`. Orgs : `create-org`, `invite/accept/revoke-org-*`, `remove-org-member`, `transfer-org-ownership`, `leave-org`. Stripe/RGPD : `stripe-checkout`, `stripe-portal`, `stripe-webhook`, `export-data`, `delete-account`.

## X.3 Récapitulatif IA

| Fonction | Endpoint | Modèle | Temp | Gating |
|---|---|---|---|---|
| Génération PV | `generate-pv` | gpt-4o-mini | 0.3 | `maxPvPerMonth`/`maxAiPerMonth` |
| Extraction tâches | (dans generate-pv) | gpt-4o-mini | 0.1 | inclus, non bloquant |
| Chat copilote | `ask-archipilot` | gpt-4o-mini | 0.4 | `maxAiPerMonth` |
| Parsing CdC | `parse-cdc` | gpt-4o-mini | 0.1 | `maxAiPerMonth` |
| Parsing devis | `parse-quote` | gpt-4o-mini (+Vision) | 0.1 | upgrade + 20/h |
| Rapport client | `generate-progress-report` | gpt-4o-mini | — | upgrade + 10/h |
| Transcription | `transcribe-audio` | Whisper | — | inclus |

## X.4 Sécurité & conformité

RLS partout (perso/org/public). Signatures : token cryptographique 64 hex, expiration 14j, snapshot + hash SHA-256, service-role pour signature publique, dataUrl ≤2 Mo jamais loggée. Emails sanitizés (`<script>`/`on*` retirés). RGPD : export complet (`export-data`), suppression de compte (`delete-account`, gère le cas owner d'orgs), consentement cookies. MFA (`MfaSection`). Pages légales (`LegalPages`).

## X.5 Limites connues (v1) à arbitrer avant scale

1. `console.log` de debug en clair dans `db.js` (`loadSharedProjects`, `uploadPhoto`) → nettoyer.
2. Sync agence **last-write-wins sans verrou** → risque de conflit multi-édition (présence/lock prévus « Phase 4 »).
3. Photos base64 dans le **JSONB projets** (row ~1 Mo pratique) → risque de saturation, migration Storage à prévoir.
4. Audio Mode Chantier : pas de chunking ni de récupération du blob après reload ; réunion > 1h fragile.
5. **F6 (communication unifiée client)** : seule feature majeure de la roadmap non démarrée (pas de migration).

---

## Annexe — Index des fichiers par feature

| Feature | Fichiers clés |
|---|---|
| Projets / Overview | `Overview.jsx`, `OverviewPhaseHero.jsx`, `pages/ProjectDetail.jsx`, `Sidebar.jsx`, `constants/statuses.js`, `phaseWizards.js`, `projectTemplates.js`, `participantRoles.js` |
| Onboarding | `OnboardingWizard.jsx`, `GuidedTour.jsx`, `PhaseWizardModal.jsx`, `PhaseManagerModal.jsx` |
| PV / Notes / IA | `NoteEditor.jsx`, `ResultView.jsx`, `ChatModal.jsx`, `AskAiButton.jsx`, `SendPvModal.jsx`, `SuggestedTasksModal.jsx`, `CdcStructureModal.jsx`, `utils/chatContext.js`, `utils/chatAttachments.js`, `hooks/useWhisperRecorder.js`, fns `generate-pv`/`ask-archipilot`/`parse-cdc` |
| OPR / Réserves | `OprView.jsx`, `SignOprModal.jsx`, `RequestSignaturesModal.jsx`, `SendOprModal.jsx`, `PublicSignPage.jsx`, `ReserveLibrarySection.jsx`, fns `request-opr-signatures`/`opr-signing`/`dispatch-remarks` |
| Finance | `InvoicesView.jsx`, `QuotesView.jsx`, fn `parse-quote`, migrations `011`/`013` |
| Suivi / conformité | `PermitsView.jsx`, `AlertsDrawer.jsx`, `utils/alerts.js`, `JournalView.jsx`, `ProgressReportsView.jsx`, fn `generate-progress-report`, migrations `012`/`014`/`015` |
| Planning / temps / galerie / carte | `PlanningView.jsx`, `PlanningDashboard.jsx`, `TimesheetView.jsx`, `utils/timer.js`, `GalleryView.jsx`, `PlanViewer.jsx`, `MapDashboardView.jsx`, `utils/geocode.js` |
| Mobile / Chantier | `ChantierModeView.jsx`, `utils/chantierVisit.js`, `MobileHome.jsx`, `MobileChantiersList.jsx`, `MobileNotifs.jsx`, `MobileBottomBar.jsx`, `QuickCaptureSheet.jsx`, `CaptureSheet.jsx`, `utils/weather.js`, `hooks/useGeolocation.js` |
| Collaboration / Agences | `CollabModal.jsx`, `AgencyView.jsx`, `OrgInviteModal.jsx`, fns org-* |
| Offline / PWA / Push | `utils/offline.js`, `SyncBadge.jsx`, `hooks/useWebPushSubscription.js`, `sw.js`, fn `send-push-notification` |

---

*Document dérivé du code réel (mai 2026). Les quotas et gating font foi via `src/constants/config.js` ; toute autre mention chiffrée est indicative.*
