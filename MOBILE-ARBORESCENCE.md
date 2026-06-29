# ArchiPilot — Arborescence mobile détaillée

> Document de référence pour review externe (ChatGPT, UX consultant, équipe).
> État du code au **25 mai 2026**, après la session de refonte mobile complète
> (10 commits, branche `master`).
>
> Lieu dans le repo : `MOBILE-ARBORESCENCE.md` (racine).

---

## 1. Contexte projet

**ArchiPilot V3** est un copilote IA pour architectes (cible principale : marché
belge). Une PWA React + Vite + Supabase, déployée sur Vercel. Le desktop est
l'environnement principal pour les tâches administratives (Gantt, factures,
comparaison de devis, génération de PDF). Le mobile a un rôle distinct, pensé
pour le terrain.

### Audience mobile

> L'architecte sur chantier, en route entre deux RDV, ou en salle de réunion
> avec le maître d'ouvrage (MO) et les entrepreneurs.

Sessions courtes (30 secondes à 5 minutes), interactions au pouce, écran 6"
parfois utilisé avec des gants, conditions de luminosité variables, réseau 4G
parfois instable.

### Jobs-to-be-done mobiles (priorité décroissante)

1. **Je vais sur chantier** → démarrer une visite walk-through
2. **Je viens de finir une visite, autour de la table avec le client** → enregistrer la rédaction du PV
3. **Je dois retrouver une info** (client m'appelle, je suis en route) → consultation projet
4. **Quelque chose mérite mon attention** → notifications / échéances / signatures attendues
5. **Je dois aller quelque part** → itinéraire vers le chantier

---

## 2. Principes directeurs de la refonte

| Principe | Application concrète |
|---|---|
| **Job-to-be-done first** | Hiérarchie pilotée par les 5 jobs ci-dessus, pas par la sitemap desktop |
| **One thumb, one tap** | Toutes les actions principales accessibles en 1 tap depuis n'importe où via la bottom bar |
| **Visibilité > élégance** | Le Mode Chantier est le différenciateur PWA mobile → FAB central permanent, pas caché derrière un hero conditionnel |
| **Promise = delivery** | Si la home propose une action, le tap doit livrer ; sinon on retire l'item (cf. retrait des "Factures en retard" du bloc Aujourd'hui) |
| **Consultation par défaut, capture explicite** | Pas de banner permanent ; la capture passe par le FAB Visite ou par les boutons in-context |
| **L'archi parle, l'IA structure** | Pas de formulaires complexes sur mobile ; dictée vocale + transcription Whisper qui alimente le brouillon PV au desktop |

---

## 3. Vue d'ensemble — bottom bar 5 slots

```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│   [🏠 Accueil]  [📁 Chantiers]  [🏗 Visite FAB]  [🔔 Notifs●]  [👤 Moi]
│        ↓             ↓                   ↓                ↓             ↓
│   mobileHome    chantiersList       chantier          notifs       profile
│   (default)     (cross-projects)    (Mode Chantier)   (page)       (page)
│                                                                       │
└─────────────────────────────────────────────────────────────┘
```

### Détection mobile

- Hook `useIsMobile()` → `window.innerWidth < 768 px`, resize-aware
- Au boot : si mobile, `view` est forcé à `mobileHome` (au lieu de l'Overview du dernier projet auto-sélectionné)
- **3 vues forbidden sur mobile** (`MOBILE_FORBIDDEN_VIEWS` dans `App.jsx`) :
  - `planning` (Gantt desktop-heavy)
  - `invoices` (édition factures + génération PDF)
  - `quotes` (comparaison PDF de devis)
  - Tentative d'accès → redirige vers `overview`

### Comportement de chaque slot

| Slot | Vue / Action | Spécificité |
|---|---|---|
| **🏠 Accueil** | `setView("mobileHome")` | Default au boot mobile |
| **📁 Chantiers** | `setView("chantiersList")` | Liste complète cross-projects avec search/filtres |
| **🏗 Visite FAB** | Si project actif → `setView("chantier")` <br>Sinon → fallback `mobileHome` + toast "Sélectionne un chantier" | FAB central 62×62 px terracotta avec icône building, surélevé via SVG bump |
| **🔔 Notifs** | `setView("notifs")` (mobile) <br>OU toggle drawer (desktop) | Sur mobile, toggle : re-tap revient à `mobileHome` ; badge `unreadCount` |
| **👤 Moi** | `setView("profile")` | Renommé "Moi" pour ton plus personnel (même destination que l'ancien "Profil") |

---

## 4. Écrans détaillés

### 4.1 MobileHome (slot Accueil)

**Fichier** : `src/views/MobileHome.jsx`
**Rôle** : répondre à la question "qu'est-ce que je fais maintenant ?"

```
MobileHome
│
├── Banner "Visite en cours" (CONDITIONNELLE, sticky top)
│   ├── Visible si getActiveVisit() retourne une visite non terminée
│   ├── ACL background + AC border + icône building animée
│   ├── Chrono live "N min depuis le start"
│   └── tap → setView("chantier") (reprend exactement où l'archi en était)
│
├── Greeting
│   ├── "Bonjour, Anthony" (calculé selon l'heure : Bonne nuit/Bonjour/Bon après-midi/Bonsoir)
│   └── Sous-titre : "Voici ta journée" / "Tout est calme aujourd'hui"
│
├── Section "Aujourd'hui" (urgences cross-projects)
│   ├── Réunions du jour
│   │   ├── Tap card → ouvre projet (setView "overview")
│   │   └── Bouton "Y aller" séparé → Google Maps universel (project.geo ou formatAddress)
│   ├── Permis avec deadline ≤ 7 jours
│   │   └── Tap → permits du projet concerné
│   ├── Notifications non lues
│   │   └── Tap → ouvre drawer notifs (desktop) ou page Notifs (mobile)
│   └── Empty state si rien : "Aucune échéance urgente · Tu peux respirer (ou rattraper de l'admin)"
│
├── Section "Mes chantiers" (5 plus récents triés par activité)
│   ├── ProjectCard : nom + status badge + hint contextuel coloré
│   │   ├── Hint dynamique (priorité décroissante) :
│   │   │   1. "Réunion aujourd'hui" (AC)
│   │   │   2. "N PV à finir" (AM, ambre)
│   │   │   3. "N réserves ouvertes" (BR, brick)
│   │   │   4. "N PV au total" (TX3, gris) fallback
│   │   └── Tap → ouvre projet
│   └── Lien "Voir tous (N) →" → chantiersList
│
├── Section "Chantiers proches" (opt-in géoloc)
│   ├── État initial : GeoPrompt cliquable "Active la géolocalisation"
│   ├── En attente : "Localisation en cours…"
│   ├── Refus / indispo : message + lien "Voir la carte complète →"
│   └── Granted : 3 plus proches via Haversine (distance < 1 km en m, sinon en km)
│       └── + bouton "Voir tout sur la carte →" → mapDashboard
│
└── Section "Stats hebdo" (1 ligne, si > 0 stats)
    └── "Cette semaine : N PV · N réserves levées · N visites"
```

**Décisions notables** :
- Les chips "Actions rapides" (Photo / PV vocal / Réserve) qui apparaissaient dans les premiers mockups ont été **retirés volontairement** : pas de capture out-of-context → la capture passe TOUJOURS par le FAB Visite (un seul chemin, pas de confusion)
- Le bloc "Factures en retard" (présent à l'origine) a été retiré : la facturation est forbidden sur mobile, le tap menait à un fallback overview qui ne livrait pas la promesse
- Les "Signatures OPR attendues" ne sont plus dans MobileHome ; consolidées dans la page Notifs pour éviter la duplication

### 4.2 MobileChantiersList (slot Chantiers)

**Fichier** : `src/views/MobileChantiersList.jsx`
**Rôle** : "où est ce chantier ?" sur l'ensemble du portfolio

```
MobileChantiersList
│
├── Sticky header (sur fond blanc, border-bottom gris)
│   ├── Back ← → mobileHome
│   ├── Titre "Mes chantiers (N filtrés)"
│   └── Bouton "+" rond brand → modale "Nouveau projet"
│
├── Search input (debounce-free pour v1)
│   ├── Icône loupe à gauche
│   ├── Bouton X à droite si query non vide
│   └── Recherche dans : name, address, city, client, contractor, participants
│
├── Filtres tactiles pills (toujours visibles)
│   ├── [Actifs●] (default) : !p.archived
│   ├── [Tous]              : tout
│   └── [Archivés]          : p.archived
│
└── Liste triée
    ├── Si "Archivés" : ordre alphabétique pur
    └── Sinon : urgencyScore décroissant, puis alphabétique
        └── urgencyScore = (réunion today ? 100 : 0) + drafts × 10 + reservesOpen
    └── ProjectCard étendu (vs MobileHome) :
        ├── Nom + status badge
        ├── Hint contextuel coloré (idem MobileHome)
        ├── Adresse si renseignée (icône pin + city)
        └── Tap → setView("overview") + setActiveId

Empty states :
├── Query non vide, aucun résultat : "Aucun chantier ne correspond à 'X'"
└── Filtre vide : "Aucun chantier dans cette catégorie"
```

### 4.3 MobileNotifs (slot Notifs)

**Fichier** : `src/views/MobileNotifs.jsx`
**Rôle** : consolidation Inbox (Invitations / Échéances / Notifications / Historique)

Sur **desktop**, c'est un drawer dropdown sous la cloche header (340 px).
Sur **mobile**, c'est une page plein écran.

```
MobileNotifs (page plein écran)
│
├── Sticky header
│   ├── Back ← → mobileHome
│   ├── Titre "Notifs" + badge "N non lues" (chip ACL)
│   └── Bouton "Tout lu" (si non lues > 0)
│
├── Section "Invitations" (visible si > 0)
│   └── Card par invitation :
│       ├── "<Name> t'a invité à collaborer sur <Project>"
│       └── [Accepter] (AC plein) | [Refuser] (gris)
│
├── Section "Échéances < 7 jours" (visible si > 0)
│   ├── Permis avec deadline_date < 7j
│   │   └── Tap → projet/permits
│   └── Réserves overdue cross-projects
│       └── Tap → projet/opr
│
├── Section "Notifications" (non lues)
│   └── NotifCard avec :
│       ├── Icône sémantique :
│       │   ├── opr_signed / opr_completed : check vert
│       │   ├── opr_declined : alert rouge
│       │   ├── invite / invite_accepted : users bleu
│       │   └── comment : mail brand
│       ├── Message FR (cf. notifMessage helper)
│       ├── Timestamp court (FR locale)
│       ├── Tap → markRead + navigation (OPR ouvre la vue opr)
│       └── Bouton X → delete
│
├── Section "Historique" (collapsable)
│   ├── Notifs lues, dim/grisées
│   └── Bouton "Tout supprimer" dashed danger (si > 1)
│
└── Empty state global (si rien dans aucune section)
    └── "Tout est sous contrôle · Aucune notification, aucune échéance proche"
```

**Architecture data** :
- Pas de duplication DB : MobileNotifs reçoit callbacks props
- État `notifications` / `invitations` reste source unique dans `App.jsx`
- Échéances calculées localement (loadPermits + parcours projects.reserves)

### 4.4 ChantierModeView — le différenciateur

**Fichier** : `src/views/ChantierModeView.jsx`
**Rôle** : visite chantier en deux phases explicites

```
ChantierModeView (vue plein écran, sans bottom bar)
│
├── Header sticky (couleur change selon la phase)
│   ├── Phase Inspection :
│   │   ├── Fond blanc, border-bottom gris
│   │   └── Chip "● Visite en cours · M min" (AC pulse)
│   ├── Phase Réunion :
│   │   ├── Fond ROUGE (RD #DC2626 gradient)
│   │   ├── Chip "● ENR · Réunion · mm:ss" (texte blanc)
│   │   └── Bouton X devient "rgba(255,255,255,0.16)" (cohérence visuelle)
│   ├── Nom projet (gras)
│   └── Chip météo discret "☀️ 18°C" si fetch Open-Meteo abouti (Tier 1)
│
├── ═══ PHASE 1 — Inspection (default au boot de la visite) ═══
│   │
│   ├── 3 boutons d'action tactiles (grille 3 colonnes)
│   │   ├── 📷 Photo → ouvre PhotoSheet (cf. § 5.1)
│   │   ├── 🎤 Note vocale → ouvre VoiceSheet (Whisper monolocuteur court)
│   │   └── ⚠ Réserve → ouvre NewReserveSheet (form compact)
│   │   Chacun a un badge count en haut-droite (photos/decisions/created)
│   │
│   ├── Stats récap (chips horizontales)
│   │   └── lifted / still / created / decisions / photos
│   │
│   ├── Section "Présents" (pointage)
│   │   ├── Liste participants du projet (préchargés)
│   │   └── Tap chip → toggle présent/absent (couleur SG/SBB)
│   │
│   ├── Section "Réserves ouvertes"
│   │   └── ReserveRow par réserve :
│   │       ├── Code + sévérité (barre latérale couleur)
│   │       ├── Description + contractor
│   │       └── 2 boutons : [⚠ Toujours] [✓ Levée]
│   │           → applique IMMÉDIATEMENT à project.reserves.status
│   │           → logge l'action dans visit.reserveActions
│   │
│   ├── Section "Nouvelles réserves" (créées pendant la visite)
│   │   └── Liste read-only des reserves nouvellement créées
│   │
│   └── Section "Décisions notées"
│       └── Liste avec icône mic/pen2 selon source (voice/text)
│           └── Bouton X par décision
│
├── ═══ Transition Phase 1 → 2 ═══
│   └── RgpdConfirmModal (modal centré)
│       ├── Icône mic rouge 56 px (cercle FDECEC + RD)
│       ├── Titre "Démarrer la réunion ?"
│       ├── Body : explication du mode + bénéfice
│       ├── 3 vérifications cochées en vert :
│       │   ├── Les participants sont informés
│       │   ├── Les données restent privées
│       │   └── Sortie possible à tout moment
│       └── [Annuler] [● Démarrer] (rouge plein)
│
├── ═══ PHASE 2 — Réunion ═══
│   └── MeetingPhase composant
│       ├── Hero "Pose le téléphone sur la table"
│       │   ├── Icône mic 38 px + ring pulse rouge animée (si recording active)
│       │   └── Texte rassurant "La conversation est enregistrée…"
│       │
│       ├── Card live recorder (visible si recorder.isRecording)
│       │   ├── Chip "● Enregistrement" (RD pulse) ou "En pause" (AM)
│       │   ├── Chrono mm:ss (durée enregistrement EFFECTIVE, hors pauses)
│       │   ├── Audio meter horizontal gradient SG → AM → RD (level RMS live)
│       │   ├── Taille fichier "~ N Ko/Mo enregistrés"
│       │   └── Bouton [Pause] ou [Reprendre] (AC plein)
│       │
│       ├── Error display si mic refusé / non détecté (BRB bg + BR text)
│       │
│       └── AI hint subtle : "Parle naturellement, l'IA structurera"
│
└── Sticky footer (2 boutons selon phase)
    ├── Phase Inspection :
    │   ├── [Terminer sans réunion] (secondaire, WH)
    │   └── [Passer à la réunion ▸] (primaire AC, déclenche modal RGPD)
    │
    └── Phase Réunion :
        ├── [Reprendre l'inspection] (secondaire, WH)
        │   └── retour Phase 1 SANS couper l'enregistrement (PAUSE auto)
        │       → Resume auto au retour en Phase 2
        └── [Terminer la visite ▸] → EndVisitSheet
            ├── Récap stats (durée totale / lifted / still / new / decisions / photos)
            ├── Si transcribing : loader "Transcription Whisper en cours…"
            ├── [Continuer la visite] [Terminer · Créer brouillon]
            └── onConfirm :
                1. Stop recorder → blob webm (await)
                2. Envoie blob à transcribe-audio (edge function Whisper)
                3. setMeetingTranscript(visit, text)
                4. composeDraftPvFromVisit (inclut bloc "Compte-rendu de la réunion (N min)")
                5. savePvDraftLocal + clearVisit
                6. Toast "Visite terminée — brouillon PV n°N créé"
                7. setView("overview")
```

### 4.5 Project Overview (mobile)

**Fichier** : `src/views/Overview.jsx`
**Rôle** : consultation d'un projet sur mobile

Sur mobile, l'Overview utilise un **switcher de vue compact** (bottom sheet
au lieu de 9 onglets horizontaux).

```
Project Overview (mobile)
│
├── Topbar global (ap-header)
│   ├── Nom projet + chevron (mobile project switcher)
│   ├── Status badge (couleur phase)
│   └── Bouton notifs (cloche)
│
├── Bouton "Vue : <courante> ↓" (sticky)
│   └── Tap → BottomSheet avec radios :
│       ├── ◉ Résumé (default)
│       ├── ○ Actions / Tâches
│       ├── ○ PV
│       ├── ○ Documents
│       ├── ○ Photos
│       ├── ○ Fiche
│       └── [Onglets masqués mobile : Planning · Devis · Facturation]
│
├── PhaseHero (contextuel par phase)
│   └── CTA principal selon project.statusId :
│       ├── Chantier → "🏗 Démarrer la visite" → Mode Chantier
│       ├── Permis → "📋 Suivre le permis" → permits
│       ├── OPR → "⚠ Voir les réserves" → opr
│       └── Réception → "Préparer réception définitive"
│
└── Contenu de la vue active (réduit pour mobile)
    └── MobileConsultationBanner "Mode consultation — ouvre sur ordi pour modifier"
```

**Vues additionnelles accessibles** (via PhaseHero ou deep-link push) :
- `opr` — OprView (consultation seule sur mobile)
- `permits` — PermitsView (consultation)
- `journal` — JournalView (consultation, masque export PDF)
- `reports` — ProgressReportsView (consultation)
- `tasks` — TasksView (tap-to-advance status)

### 4.6 ProfileView (slot Moi)

Renommé "Moi" dans la bottom bar pour un ton plus personnel.
Coordonnées + signature + push settings + plan + déconnexion.
Aucun changement spécifique mobile vs desktop dans cette session.

---

## 5. Sheets & modals dans le Mode Chantier

### 5.1 PhotoSheet — annotation vocale par photo (Tier 2)

Modal bottom sheet ouvert automatiquement après tap "📷 Photo".

```
PhotoSheet
│
├── Auto-open caméra native (input[capture=environment]) à l'ouverture
│
├── Après capture :
│   ├── Preview de la photo
│   ├── Overlay chrono en haut-gauche (si recording active)
│   │   └── ● mm:ss (RD pulse + monospace)
│   │
│   ├── ⚠ AUTO-START Whisper 250 ms après preview (mains-libres)
│   │
│   ├── Card transcript (toujours visible)
│   │   ├── Label dynamique : "Dictée en cours…" / "Transcription…" / "Annotation vocale"
│   │   ├── Icône mic AC si voiceAnnotated
│   │   ├── Si vide : message d'invitation ("Décris ce que tu viens de photographier…")
│   │   └── Si rempli : textarea ÉDITABLE (l'archi peut corriger la transcription)
│   │
│   ├── Error display si mic refusé / pas de mic (BRB)
│   │
│   └── 3 boutons (gap 6 px) :
│       ├── [Sans annotation] (secondaire) → submit avec caption ""
│       ├── [⟳] (recommencer) → reset transcript + restart recorder
│       └── [✓ Garder] (primaire AC) → submit avec annotation
│
└── Submit → onAddPhoto(dataUrl, caption, voiceAnnotated)
    ├── Photo enregistrée immédiatement (project.gallery)
    ├── photoId taggé sur visit.photoIds
    ├── Upload Supabase Storage en background (si online)
    └── Géoloc en background (getCurrentPositionSafe 4 s) → patche photo.geo si dispo
```

**Note pin GPS Tier 1** : déclenché en parallèle, non bloquant. Si l'archi
refuse la géoloc ou si le timeout 4 s expire, la photo reste sans coords.

### 5.2 NewReserveSheet, VoiceSheet, EndVisitSheet

Forms compacts existants (pré-refonte session) :
- **NewReserveSheet** : description + sévérité (4 options) + entreprise (datalist) + localisation
- **VoiceSheet** : Whisper monolocuteur court → ajoute une décision avec source "voice"
- **EndVisitSheet** : modal de confirmation fin de visite (cf. § 4.4)

---

## 6. Composants flottants permanents

### 6.1 ChatLauncher (FAB IA)

**Fichier** : `src/views/ChatModal.jsx`
**Rendu** : sur toutes les pages, sauf Mode Chantier (visite plein écran).

```
ChatLauncher (cercle 56×56 px terracotta avec ✦)
├── position : fixed
├── bottom : calc(108px + safe-area-inset-bottom)
│             [pour passer au-dessus de la bottom bar v3 (60 nav + 36 SVG bump = ~96 px)]
├── right : 16
└── tap → ChatModal (panel full-width mobile, bottom 172 px, height max)
```

### 6.2 Banner "Visite en cours" (sticky top sur MobileHome)

Apparaît si `getActiveVisit()` retourne une visite non terminée. Permet à
l'archi de reprendre exactement où il était après un appel téléphonique
ou une fermeture d'app.

---

## 7. Persistance d'état

| State | Storage | Effet sur reload |
|---|---|---|
| `chantier_active_visit` | localStorage | Banner "Visite en cours" sur MobileHome + reprise possible |
| `visit.phase` | inclus dans visit state | Reprend en Inspection ou Réunion selon dernière phase |
| `visit.weather` | inclus dans visit state | Météo fetch une fois (flag `_weatherFetched`) |
| `visit.meetingStartedAt` | inclus dans visit state | Chrono réunion préservé sur retours en Inspection |
| `visit.meetingTranscript` | inclus dans visit state | Brouillon PV inclut le compte-rendu si Whisper a abouti |
| `view` | non persisté | Au boot mobile → forcé à `mobileHome` |

---

## 8. Push notifications & deep-linking

```
Push reçu (système OS)
    ↓
Service Worker (src/sw.js) handle "push" event → showNotification()
    ↓
Tap sur la notification → SW handle "notificationclick" → openWindow(URL)
    ↓
URL format : /?project=ID&view=VIEW
    ↓
App.jsx parse au mount + via message "archipilot:deep-link"
    ↓
applyDeepLink(url) → setActiveId(projectId) + setView(viewName)
```

**Cas particuliers iOS** : Web Push uniquement supporté à partir d'iOS 16.4
ET quand l'app est ajoutée à l'écran d'accueil (PWA installée). La
ProfileView affiche un message contextuel pour guider l'archi.

---

## 9. Tier 1 — Enrichissements zero-effort

Trois enrichissements automatiques au démarrage d'une visite :

| Feature | Comment ça marche | Où c'est utilisé |
|---|---|---|
| **🌤 Météo automatique** | `fetchWeatherAt(lat, lng)` via Open-Meteo (gratuit, sans clé). Preferred coords = `project.geo`, fallback `getCurrentPositionSafe(5s)`. 27 codes WMO mappés en labels FR + emoji. | Chip discret dans le header chantier + ligne "Conditions" dans le brouillon PV (RGPT-compliant) |
| **📍 Pin GPS photos** | `getCurrentPositionSafe(4s)` en background à chaque photo. Patche `photo.geo = {lat, lng, accuracy}` après sauvegarde. Non bloquant. | Stocké sur la photo, prêt pour futur "filtre par zone" en galerie et journal de chantier RGPT |
| **💾 Reprise de visite** | `getActiveVisit()` détecté sur MobileHome au mount | Banner sticky avec building pulse + chrono "N min depuis le start" + "Reprendre →" |

---

## 10. Limitations connues v1

### Audio / Mode Chantier

- **Pas d'upload périodique** de l'audio pendant l'enregistrement. Si l'archi reload pendant la réunion, le blob en mémoire est perdu. Le chrono dans `meetingStartedAt` reste persisté en localStorage.
- **Pas de diarization** : Whisper produit du texte brut sans identification des locuteurs. L'archi structurera (ou GPT structurera) au desktop.
- **iOS Safari < 16.4** : Wake Lock API indisponible. L'écran peut couper le mic après quelques minutes de standby. Pas de fallback.
- **Coût Whisper** ~0,006 $/min, soit ~0,36 € pour une réunion d'1 h. Rate limit à prévoir côté backend si l'usage explose.

### UX

- **Switcher Overview compact** sur mobile : seulement 6 onglets visibles (Résumé / Actions / PV / Documents / Photos / Fiche). Les vues OPR / Permis / Journal / Rapports sont accessibles via PhaseHero CTAs uniquement → leur découvrabilité dépend de la phase du projet.
- **Banner "Visite en cours"** sur MobileHome uniquement (pas sur les autres pages). Si l'archi navigue vers Chantiers ou Notifs, plus de raccourci visible — mais il peut tap le FAB Visite qui le réamènera dans la visite active.
- **Onglet "Chantiers"** redondant avec la section "Mes chantiers" de la home si l'archi a peu de projets. Justifié quand portfolio > 10 chantiers.

### Desktop touch (tablette)

- Pas de comportement tablette dédié. La bascule mobile/desktop est binaire à 768 px de largeur. Les tablettes en mode portrait (iPad mini, etc.) utilisent l'UX mobile ; en mode paysage, l'UX desktop.

---

## 11. Stack technique

| Couche | Tech |
|---|---|
| Frontend | React 18 + Vite 6 + zustand (UI store) |
| PWA | vite-plugin-pwa (mode `injectManifest` pour SW custom) |
| Audio capture | MediaRecorder API + AudioContext (audio meter) + Wake Lock API |
| Transcription | Edge function Supabase `transcribe-audio` → OpenAI Whisper-1 |
| Météo | Open-Meteo (REST, gratuit, sans clé) |
| Géoloc | navigator.geolocation API native, wrapper silencieux |
| Push notifications | Web Push standard (VAPID) + Service Worker custom |
| Storage local | localStorage (visit state, profile cache, photo dataUrl avant upload) |
| Backend | Supabase (Postgres + Auth + Storage + Edge Functions) |
| Design tokens | `src/constants/tokens.js` (palette earth/terracotta, échelle 4 px) |

---

## 12. Récap des commits de la session refonte

10 commits, branche `master`, intervalle ~2 jours :

```
2e3fd0e fix(mobile): masque le skip link d'accessibilité sur mobile
721bd8b fix(mobile): ChatLauncher remonté de 32 px — chevauchement bottom bar v3
aa7ebb3 feat(mobile): Tier 1 — météo auto, pin GPS photos, reprise de visite
ec7dc1a feat(mobile): enregistrement de la conversation en Phase 2 réunion
5e1e361 feat(mobile): annotation vocale par photo en Phase 1 — mains-libres
180a199 feat(mobile): Mode Chantier en 2 phases — Inspection → Réunion
308eb99 feat(mobile): page Notifs consolidée — Inbox plein écran
0456e3c feat(mobile): page Chantiers cross-projects avec search + filtres
3441b74 build: augmente la limite PWA precache à 5 MiB
fa05573 refactor(mobile): retire les factures en retard du bloc Aujourd'hui
60e8bc7 refactor(mobile): bottom bar v3 — FAB Visite central + 5 slots
```

---

## 13. Points ouverts pour review externe

Points sur lesquels un avis extérieur (UX, dev seniors, ChatGPT) serait utile :

1. **Découverabilité des vues OPR / Permis / Journal sur mobile** : actuellement masquées du switcher principal, accessibles seulement via PhaseHero. Risque de "vue cachée" si l'archi ne passe pas par le hero.

2. **Slot "Chantiers" justifié ?** : avec 5 chantiers récents déjà sur la home, l'onglet 2 fait potentiellement doublon pour les archis à petit portfolio. Faut-il le rendre adaptatif (≥ 10 projets seulement) ?

3. **FAB Visite vs Long-press capture** : le mockup initial prévoyait un long-press du FAB Visite pour ouvrir un menu capture (Photo / Vocal / Réserve). Pas implémenté pour l'instant. Pertinence ?

4. **Audio long format en mode background** : la stratégie actuelle (blob en mémoire, upload final) est simple mais fragile en cas de reload. Faut-il passer à un chunking + upload périodique à 30 s ?

5. **Diarization à terme** : Whisper produit du texte brut, le PV final mélange les voix. Pyannote (lourd) ou GPT-deviné-depuis-contexte (light) ?

6. **Mode déconnecté complet** : la PWA fonctionne en lecture seule offline, mais pas en écriture (sauf le brouillon visite). Le Tier 1 météo nécessite réseau. Faut-il étendre l'offline ?

7. **iOS Safari < 16.4 (~10 % du parc)** : ces utilisateurs perdent le Wake Lock + le Web Push. Faut-il un fallback non-PWA (page d'install + warning) ou accepter cette dégradation ?

8. **Densité d'info sur MobileHome** : avec 4 sections (Aujourd'hui / Chantiers / Près de moi / Stats), la home peut être longue à scroller pour un archi avec beaucoup d'urgences. Faut-il un mode compact toggleable ?

---

*Fin du document.*
