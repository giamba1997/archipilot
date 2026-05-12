# ROADMAP Mobile — ArchiPilot

Document de travail pour la PWA mobile-optimisée d'ArchiPilot. Stratégie
de portage : **Chemin A — PWA optimisée** (vs native app, cf. discussion
brainstorm). 80 % du gain pour 20 % de l'effort, 1 codebase, déploiement
identique à la version desktop.

L'objectif n'est PAS de répliquer le desktop en plus petit. C'est de
créer une **expérience mobile spécifique au terrain** : capture in-situ,
voix mains-libres, géolocalisation, notifications push, offline robuste.

Public cible : architectes belges qui passent 40-60 % de leur temps
hors bureau (visites chantier, OPR, déplacements MO).

---

## Vision globale

| Desktop = bureau | Mobile = chantier |
| --- | --- |
| Création, structure, analyse | Capture, consultation, validation |
| Devis comparaison, planning Gantt, factures | Photo + voix + réserves + comm rapide |
| Sessions de 30+ min | Sessions de 30 sec à 5 min |
| Souris + clavier + écran large | Pouce, voix, écran 6", parfois gants |

Le mobile n'a **pas vocation à faire la création complexe** (devis, planning,
facturation détaillée). En cas de tentative d'action « bureau » sur mobile,
l'app affiche un message clair : « Cette action est plus simple sur ordinateur. »

---

## Les 4 étapes

L'ordre des étapes est important : chacune capitalise sur la précédente.

### Étape 1 — Mode Chantier (~3-5 jours)

**Le différenciateur principal.** Une vue plein écran dédiée à la visite
chantier — pas une nav fluctuante, pas de menu hamburger, pas de bandeaux.
L'archi sait pourquoi il a sorti son téléphone et l'app le sait aussi.

#### Pourquoi en premier ?

C'est ce qui justifie l'existence d'une version mobile. Sans Mode Chantier,
on n'a qu'une PWA responsive — ce que l'app est déjà partiellement. Avec
Mode Chantier, on a un outil de terrain.

#### Quoi (fonctionnel)

- Déclenché par un bouton **« 🏗 Démarrer la visite »** depuis la home du
  projet sur mobile uniquement.
- Verrouille l'interface en mode "walk-through" :
  - Header compact (nom projet + chronomètre depuis le début de visite)
  - 3 boutons d'action tactiles 60 px : **📷 Photo · 🎤 Note vocale · ⚠ Réserve**
  - **Liste des réserves ouvertes** sous forme de cartes swipables :
    - Swipe gauche → « Toujours présent » (incrémente le compteur de visites)
    - Swipe droite → « Levée à cette visite » (statut levée, timestamp)
  - **Pointage des présents** : ligne avec les participants du projet,
    tap pour cocher / décocher
  - **Nouvelles décisions** : zone de capture rapide (voix ou texte court)
- À tout moment, photo → annotation au doigt → choix « lier à réserve X
  ou nouvelle réserve »
- **Auto-save** dans `localStorage` (clé `chantier_visit_<projectId>`)
  pour que l'app puisse crasher / l'archi sortir et revenir sans perdre
- Bouton **« 🏁 Terminer la visite »** :
  - Stoppe le chronomètre
  - Compose un brouillon de PV pré-rempli :
    - Durée de visite
    - Participants pointés présents
    - Réserves nouvelles + modifiées
    - Photos prises
    - Décisions textées / dictées
  - Brouillon stocké pour finalisation au bureau (PV status = draft)

#### Comment (technique)

- Nouvelle vue `src/views/ChantierModeView.jsx`
- Activable seulement si `window.innerWidth < 768` (forcer responsive)
- Contexte React `ChantierVisitContext` pour partager l'état de la visite
  entre les sous-composants (chrono, captures, décisions)
- Réutilise tous les composants existants :
  - `uploadPhoto` pour les photos
  - `useWhisperRecorder` pour la dictée
  - `saveReserveTemplate` + autocomplete bibliothèque pour les réserves
  - `savePvDraft` pour le brouillon final
- Offline-first : toutes les actions sont d'abord stockées en localStorage,
  synchronisées au retour en ligne via le `SyncBadge` existant

#### Effort estimé

**3-5 jours**. La complexité tient au state management (chrono persisté,
captures bufférisées, fin de visite qui compose le brouillon).

#### Risques

- **Performance des photos** : si l'archi prend 30 photos en 1h, le
  localStorage peut saturer. Solution : upload Supabase Storage au fil
  de l'eau, garder seulement les URLs en local.
- **Crash navigateur** : safari iOS peut tuer la tab si l'archi switch
  d'app pendant 10 min. L'auto-save doit être fréquent (chaque interaction).
- **Permissions** : caméra + microphone requièrent un consentement.
  Pattern à intégrer au démarrage de la visite (pas en plein milieu).

#### Dépendances

Aucune nouvelle. Toute l'infra (photos, voix, réserves, PV drafts) existe.

---

### Étape 2 — Bottom bar mobile enrichie (~1-2 jours)

Aujourd'hui la `MobileBottomBar` ne sert qu'à la navigation entre vues.
On la transforme en **barre de capture rapide** : depuis n'importe où dans
l'app, l'archi peut ajouter une donnée en 1 tap.

#### Pourquoi en deuxième ?

Une fois le Mode Chantier dispo, l'archi va vouloir utiliser ses capacités
de capture **même hors visite** (ex: photo opportuniste en passant devant
un autre chantier). La bottom bar étend ces capacités à toute l'app.

#### Quoi (fonctionnel)

- 4 boutons d'action centraux (au milieu de la bottom bar, taille +50% vs
  les boutons nav) :
  - **📷 Photo** — caméra ouverte, après capture : choix « ajouter au
    projet courant » ou « choisir un autre projet »
  - **🎤 Note vocale** — enregistrement libre, transcription Whisper, l'archi
    peut l'attacher à un projet/réserve OU la garder comme memo libre
  - **⚠ Réserve** — formulaire ultra-compact pour ajouter une réserve à
    un projet (par défaut le projet courant)
  - **💬 PV brouillon** — démarre une dictée Whisper qui composera un
    brouillon de PV (raccourci vers le NoteEditor en mode dictée)
- **Long-press** sur un bouton → options avancées (ex: long-press Photo →
  « Photo depuis la galerie »)
- Les boutons restent visibles même en Mode Chantier mais désactivés
  visuellement (l'archi est censé utiliser les actions du mode)

#### Comment (technique)

- Refonte de `src/components/layout/MobileBottomBar.jsx`
- Nouvelle structure : `[Nav gauche] [4 actions centre] [Nav droite]`
- Modal partagé `QuickCaptureSheet` pour les 4 actions (similaire au
  pattern du `mobileSheet` actuel)
- Voice memo libre : nouveau composant qui upload audio → Whisper →
  texte + audio attachés à l'entité choisie
- Géolocalisation passive : si l'archi a `geolocation` autorisée, on
  peut suggérer « tu sembles être au chantier X, ajouter à ce projet ? »

#### Effort estimé

**1-2 jours**. La structure existe, c'est principalement de l'intégration
avec les flux capture déjà en place.

#### Risques

- **Confusion entre projet courant et projet cible** : la photo doit être
  rattachée explicitement, sinon l'archi prend une photo qui finit au
  mauvais endroit. Solution : toujours afficher un picker projet par
  défaut sur le projet ouvert.
- **Bouton voice memo trop ambigu** : « note ou PV ? » L'archi peut hésiter.
  Solution : copy claire (« Note rapide » vs « Démarrer un PV »).

#### Dépendances

- Étape 1 (Mode Chantier) pour les patterns de capture inline

---

### Étape 3 — Home mobile dédiée (~2-3 jours)

La home actuelle sur mobile est l'Overview compactée. Elle est passable
mais pas pensée pour le mobile. On crée une home **spécifique** qui répond
à la question « qu'est-ce que je fais maintenant ? »

#### Pourquoi en troisième ?

Sans Mode Chantier ni bottom bar enrichie, la home mobile n'aurait pas
beaucoup de matière à présenter. Une fois les capacités de capture là,
la home devient l'orchestrateur de ces capacités.

#### Quoi (fonctionnel)

Vue d'accueil mobile composée de :

1. **Bloc "Aujourd'hui"** en haut
   - Projets avec réunion prévue aujourd'hui (badge calendar)
   - Projets avec échéance proche (permis J-7, facture en retard)
   - Projets avec notifications non lues (OPR signé, MO email)
   - Si rien → message rassurant « Aucune échéance urgente aujourd'hui »

2. **Section "Mes chantiers"** (compact)
   - 3-5 derniers projets touchés (sort by `updatedAt`)
   - Chaque card : nom, phase, prochaine action visible (« 3 réserves
     ouvertes » ou « PV à rédiger »)
   - Tap → ouvre le projet

3. **Mini-carte** des chantiers proches (réutilise `MapDashboardView`)
   - Si géoloc autorisée, centrée sur la position
   - 3-5 pins les plus proches
   - Tap pin → quick actions ou ouverture projet

4. **Statistiques de la semaine** (1 ligne)
   - « Cette semaine : 5 PV rédigés · 12 réserves levées · 3 visites »
   - Petit signal de productivité, motive

5. **Bouton flottant "Tous les projets"** vers la liste complète

#### Comment (technique)

- Nouvelle vue `src/views/MobileHome.jsx`
- Au mount d'App.jsx sur mobile, détecte la résolution :
  - `< 768px` → MobileHome par défaut (pas de projet auto-sélectionné)
  - `>= 768px` → comportement actuel (Overview du dernier projet)
- Réutilise les hooks existants :
  - `projects` du `useWorkspaceContext`
  - `notifications` d'App.jsx
  - `useGeolocation` (à créer, ~30 lignes)
- Le bloc "Aujourd'hui" filtre les projets sur :
  - `project.nextMeeting === today`
  - permits avec `deadline_date <= today + 7d`
  - invoices avec status `sent` et `due_date < today`
  - notifications avec `read = false`

#### Effort estimé

**2-3 jours**. L'agrégation des données est la partie complexe (plusieurs
sources à croiser pour la liste "Aujourd'hui").

#### Risques

- **Surcharge si beaucoup de projets** : un archi avec 30 projets actifs
  aurait une home énorme. Solution : tronquer chaque section à 5 items
  + lien « Voir tout ».
- **Demande de géoloc trop tôt** : si on demande la permission au mount,
  c'est intrusif. Solution : ne demander qu'au premier clic sur la mini-carte
  ou via un toggle dans le profil.

#### Dépendances

- Étape 1 + 2 pour que la home ait des actions à exposer

---

### Étape 4 — Push notifications (~3-4 jours)

Le mobile sans push n'est pas un mobile. C'est ce qui transforme l'app
d'un outil qu'on ouvre quand on y pense, en un outil qui prévient quand
quelque chose mérite l'attention de l'archi.

#### Pourquoi en dernier ?

C'est la plus complexe techniquement (Service Worker, VAPID, backend,
permissions) et elle ne sert à rien sans les 3 étapes précédentes : si
le push arrive et que l'archi ouvre l'app pour tomber sur une UI desktop
mal adaptée, l'expérience est cassée.

#### Quoi (fonctionnel)

Notifications push pour les événements suivants (opt-in par type) :

1. **OPR signé / refusé** par un signataire (déjà tracké en DB)
2. **Permis : échéance proche** (J-7, J-1, J+0)
3. **Réserve critique non levée** depuis 30 jours
4. **Facture impayée** (J+30 après due_date)
5. **Notification de collaboration** (un coéquipier Org édite un PV)
6. **Réception définitive** (J-30 avant l'anniversaire de l'OPR provisoire)

Chaque notif :
- Titre + corps (« BESIX a signé l'OPR n°3 du SNCB Hall 6 »)
- Icône ArchiPilot
- Click → ouverture deep-link vers le projet et la sous-vue pertinente
- Action button rapide (« Voir » pour les infos, « Marquer lu » pour les notifs)

#### Comment (technique)

**Backend** :
- Migration `016_web_push_subscriptions.sql` :
  ```sql
  CREATE TABLE web_push_subscriptions (
    id uuid PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint text NOT NULL,
    p256dh_key text NOT NULL,
    auth_key text NOT NULL,
    user_agent text,
    created_at timestamptz DEFAULT now(),
    last_used_at timestamptz,
    UNIQUE (user_id, endpoint)
  );
  ```
- Edge function `send-push-notification` :
  - Reçoit `{ user_id, title, body, deep_link, icon? }`
  - Charge les subscriptions du user
  - Envoie via `web-push` library (Deno) avec les VAPID keys
  - Met à jour `last_used_at`
- VAPID keys générées une fois, stockées en secrets Supabase
  (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`)
- Triggers backend qui appellent l'edge function :
  - Sur INSERT dans `notifications` (pattern existant)
  - Sur cron `daily-reminders` pour les échéances (à créer)

**Frontend** :
- Service Worker enrichi (`public/sw.js` ou via vite-plugin-pwa)
  pour gérer `push` event + `notificationclick`
- Hook `useWebPushSubscription()` :
  - `subscribe()` → demande permission + crée subscription côté SW + envoie endpoint à Supabase
  - `unsubscribe()` → l'inverse
  - `isSubscribed` → état courant
- Section "Notifications push" dans ProfileView avec :
  - Toggle global
  - Toggles par type (OPR / permis / réserves / facturation / collab / réception)
  - Stockés en JSONB `profile.push_settings`
- Banner d'invitation à activer push après une 1ère utilisation
  significative (ex: après le 3e PV envoyé)

#### Effort estimé

**3-4 jours**. La complexité vient de l'infra (Service Worker + VAPID +
backend) plus que de la feature elle-même. Une fois la pipeline en place,
ajouter de nouveaux types de notif = quelques lignes.

#### Risques

- **iOS Safari** ne supporte Web Push qu'à partir d'iOS 16.4 (mars 2023)
  et **uniquement quand l'app est installée en home screen** (« Add to
  Home Screen »). Solution : afficher un guide d'installation PWA aux
  utilisateurs iOS pour profiter du push.
- **Permission denied permanent** : si l'archi refuse à la 1ère demande,
  il faut une vraie procédure pour ré-autoriser depuis les settings du
  navigateur. Solution : page d'aide dédiée + screenshot par navigateur.
- **Sur-notification** : trop de pings tue les pings. Solution : toggles
  granulaires opt-in + digest quotidien plutôt que push immédiat sur
  certaines catégories (échéances).

#### Dépendances

- Migration + edge function + VAPID setup côté infra
- Vite PWA plugin doit exposer le SW pour ajouts custom
- Système `notifications` table existant (déjà en place)

---

## Ordre d'implémentation recommandé

```
Semaine 1 :  Étape 1 (Mode Chantier)
Semaine 2 :  Étape 2 (Bottom bar) + début Étape 3 (Home mobile)
Semaine 3 :  Fin Étape 3 + début Étape 4 (Push backend)
Semaine 4 :  Fin Étape 4 + tests terrain, ajustements
```

Total estimé : **~2 semaines de dev concentré** + 1-2 semaines de polish
et de tests terrain (idéalement avec 2-3 archis bêta-testeurs sur
chantier réel).

---

## Métriques de succès

À mesurer 1 mois après le lancement de chaque étape :

### Étape 1 — Mode Chantier
- **Adoption** : % d'archis qui utilisent le Mode au moins une fois en 30 jours
- **Rétention** : % qui l'utilisent au moins 2 visites consécutives
- **Productivité** : temps moyen entre fin de visite et PV envoyé (cible : ÷ 3
  vs aujourd'hui)

### Étape 2 — Bottom bar
- **Usage des boutons capture** : nombre de captures (photo/voice/réserve)
  hors Mode Chantier
- **Voice memos** : combien sont créées, combien sont transcrites/exploitées

### Étape 3 — Home mobile
- **Engagement** : sessions mobile / semaine par utilisateur
- **Temps avant 1ère action** : depuis l'ouverture, combien de secondes
  avant qu'une action métier soit déclenchée (cible : < 5s)

### Étape 4 — Push
- **Taux d'opt-in** : % qui activent les push à l'invitation
- **Taux d'ouverture** : % de notifs qui mènent à une ouverture de l'app
- **Désabonnements** : signal de sur-notification (cible : < 5 %/mois)

---

## Ce qui n'est PAS dans cette roadmap

Pour rester focus sur le Chemin A, on ne fait PAS :

- App native iOS / Android (Chemin B)
- Géolocalisation background (impossible en PWA)
- Apple Watch / Wear OS
- Signature OPR mobile native avec biométrie
- Mode hors-ligne 100 % (avec queue d'opérations complexe)
- Widgets iOS / Android

Ces extensions deviennent envisageables **après** validation du Chemin A.
Si l'adoption mobile dépasse 50 % du temps d'usage moyen, alors la native
peut se justifier économiquement.

---

## Questions ouvertes / à trancher

1. **Mode Chantier accessible aussi sur desktop ?**
   Pour les archis qui testent depuis leur bureau. À voir : peut-être un
   bouton « Aperçu mobile » qui simule la taille mobile dans une div
   centrée 375 × 812.

2. **Sync visite multi-utilisateur ?**
   Si deux collaborateurs sont sur le même chantier, voient-ils la même
   visite live ? Probablement non en v1 (chacun sa visite indépendante,
   merge à la fin). Mais à confirmer.

3. **Audio des notes vocales : on garde ou on jette après transcription ?**
   Garder = traçabilité, mais saturation Storage. Jeter = plus léger.
   Choix par défaut probablement : jeter après 30 jours, configurable.

4. **Cibles iOS Safari < 16.4 ?**
   Sans push, faut-il encore investir dans une UX mobile complète pour
   ces utilisateurs ? Réponse : oui, push n'est qu'un bonus. Le Mode
   Chantier marche sans push.

---

## Suivi de progression

À cocher au fur et à mesure :

- [ ] **Étape 1** — Mode Chantier
  - [ ] `ChantierVisitContext` (state management)
  - [ ] `ChantierModeView.jsx` (UI principale)
  - [ ] Auto-save localStorage
  - [ ] Brouillon de PV à la fin
  - [ ] Bouton "Démarrer la visite" dans MobileHome
  - [ ] Tests terrain avec 2 archis volontaires
- [ ] **Étape 2** — Bottom bar enrichie
  - [ ] Refonte de `MobileBottomBar.jsx`
  - [ ] `QuickCaptureSheet` modal
  - [ ] Voice memo libre (sans projet)
  - [ ] Géolocalisation passive (suggestion projet)
- [ ] **Étape 3** — Home mobile
  - [ ] `MobileHome.jsx`
  - [ ] Logique d'agrégation "Aujourd'hui"
  - [ ] Mini-carte intégrée
  - [ ] Stats de la semaine
  - [ ] Routing conditionnel par résolution
- [ ] **Étape 4** — Push notifications
  - [ ] VAPID keys + secrets Supabase
  - [ ] Migration `016_web_push_subscriptions.sql`
  - [ ] Edge function `send-push-notification`
  - [ ] Service Worker `push` + `notificationclick` handlers
  - [ ] Hook `useWebPushSubscription`
  - [ ] Section ProfileView avec toggles
  - [ ] Documentation iOS Safari (Add to Home Screen)
  - [ ] Banner d'invitation contextuelle
