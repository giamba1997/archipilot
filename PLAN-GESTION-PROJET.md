# Plan — Refonte de la gestion de projet ArchiPilot

> Document de cadrage issu du brainstorm. À utiliser comme base de discussion et de découpage en tickets. Aucune décision n'est encore figée.

---

## 0. Principes directeurs

Deux règles transverses qui conditionnent tout le reste :

1. **Système intégré, pas modules silotés.** CDC, actions, PV, OPR, planning, réunions, phases ne sont pas des fonctionnalités juxtaposées. Une remarque urgente PV alimente une action ; une remarque « à lever » alimente une réserve OPR ; le CDC alimente postes + checklists + réserves attendues ; les jalons font progresser la phase. Chaque axe est conçu pour qu'au moins deux autres axes en bénéficient.

2. **IA contextuelle, opt-in partout.** À chaque étape du processus l'utilisateur peut déclencher une assistance IA — jamais imposée, toujours disponible. Le contexte est pré-rempli automatiquement (poste actuel, remarque sélectionnée, réserve en cours, phase…). Pattern UI unique : un bouton/icône « Demander à l'IA » avec la même affordance partout, ouvrant la `ChatModal` existante avec `chatPrefill`.

---

## 1. Contexte

ArchiPilot V3 couvre déjà le pipeline « notes → PV IA → PDF → email » de bout en bout. La couche *gestion de projet* (création, suivi, lifecycle, OPR, planning) est en revanche un assemblage de modules qui ne se parlent pas entre eux. Ce document liste les frictions observées à la lecture du code et propose six axes d'amélioration indépendants.

## 2. État actuel — cycle de vie

```
[Création] → [Cadrage] → [Suivi terrain] → [Synthèse] → [Réception] → [Clôture]
 modal/wizard  participants   photos/plans/    PV (notes →   OPR/réserves   archivage
              postes/CDC      dictée/timer     IA → PDF)     checklists
```

Phases projet (`statusId`) : `sketch → preliminary → permit → execution → construction → reception → closed`.

Modèle projet (extrait, JSONB dans `user_data.projects` ou `organization_data.projects`) :

```
{
  id, name, client, contractor, address, statusId, progress,
  startDate, endDate, nextMeeting, recurrence, archived,
  participants[], posts[], pvHistory[], actions[],
  planFiles[], gallery[], lots[], checklists[],
  reserves[], oprHistory[], customFields[],
  cahierDesCharges, timeSessions[],
  pvTemplate, remarkNumbering, postTemplate
}
```

## 3. Frictions identifiées

| # | Friction | Impact |
|---|----------|--------|
| F1 | CDC sous-exploité — PDF banner décoratif, pas source des postes/checklists | Pas d'effet de levier IA sur le contenu |
| F2 | Actions orphelines des PV — lien textuel `since: "PV 27"`, pas de continuité | Pas de relance, pas de cycle de vie action |
| F3 | Planning Gantt isolé — `lots[]` non liés à postes/réunions/réserves | Vue jolie mais inutile au quotidien |
| F4 | OPR coupée — réserves créées à la main, pas issues des remarques PV ; pas de PDF rapport | Le module réception n'aboutit pas |
| F5 | Phases décoratives — changement manuel, aucun jalon automatique | Pas de visibilité sur l'avancement réel |
| F6 | Onboarding projet pauvre — formulaire vide ou import dossier brut | L'utilisateur configure tout à la main |
| F7 | Réunions = champ texte — pas d'agenda, pas d'ICS, pas de présents réels | Pas de boucle réunion → PV → suivi |
| F8 | Versioning absent — PV éditable post-envoi sans trace, plans sans version | Risque légal pour un architecte |

## 4. Interconnexions cibles

Matrice « ce qui produit » → « ce qui consomme » une fois la refonte en place :

```
┌─────────────┐   postes,         ┌──────────┐  remarque    ┌──────────┐
│     CDC     │── obligations ──► │   PV     │── urgente ──►│ Actions  │
│             │   checklists      │          │              │          │
│             │── réserves        │          │              │          │
│             │   attendues ─────►│          │── à lever ──►│  OPR     │
└─────────────┘                   └────┬─────┘              └────┬─────┘
                                       │                         │
                                       │ jalon "1er PV"          │ jalon "toutes
                                       ▼                         ▼ levées"
                                 ┌────────────┐          ┌────────────┐
                                 │  Phase     │          │   Phase    │
                                 │ chantier   │          │   closed   │
                                 └────────────┘          └────────────┘

┌─────────────┐  pré-cochés  ┌──────────┐   action      ┌──────────────┐
│  Réunions   │── présents ─►│   PV     │── deadline ──►│  Action      │
│  (agenda)   │              │          │   = prochaine │  avec date   │
└─────────────┘              └──────────┘   réunion     └──────────────┘

┌──────────────┐  bootstrap  ┌──────────┐ + ┌──────────┐ + ┌──────────┐
│  Modèle de   │────────────►│  Postes  │   │ Checklist│   │  Lots    │
│   projet     │             │          │   │   visite │   │ planning │
└──────────────┘             └──────────┘   └──────────┘   └──────────┘
```

Chaque flèche représente une intégration concrète à coder, pas une simple jolie idée d'archi.

## 5. Axes d'amélioration

### Axe A — Unifier le cycle de vie projet

**Promesse.** Les phases progressent automatiquement via des jalons (1er PV → `chantier`, signature OPR → `reception`, dernière réserve levée → `closed`). Un dashboard projet montre où on en est et ce qu'il manque pour passer à la phase suivante.

**Modèle.** Ajouter `milestones[]` et `phaseHistory[]` au projet. Définir une matrice phase → jalons attendus (configurable).

**UI.** Header projet : la pill phase devient un *stepper* cliquable indiquant le prochain jalon. Overview : carte « Avancement projet » avec checklist phase courante.

**Effort.** Moyen. Pas d'Edge Function, pas de migration. Logique côté client + un constants/lifecycle.js.

**Dépendances.** Plus puissant si Axe C (actions liées) et Axe D (OPR connectée) existent.

---

### Axe B — Cahier des charges central

**Promesse.** Le CDC importé alimente automatiquement les *postes* du projet, génère une checklist de visite, et sert de référence cross-modules. Une question dans le chat « est-ce que la marque imposée est respectée ? » trouve la réponse.

**Modèle.** Étendre `cahierDesCharges` :
```
{ fileName, dataUrl, extractedText, structured: {
  posts[],          // postes détectés (n° + label + clauses clés)
  obligations[],    // exigences (matériau, marque, performance)
  attendus[]        // documents/checks attendus à la réception
}, version, parsedAt }
```

**Edge Function.** `parse-cdc` : prend `extractedText`, retourne un JSON structuré (gpt-4o-mini, system prompt strict pour BTP belge).

**UI.** Wizard import : étape « relire la structure détectée », l'utilisateur valide/corrige avant création projet. Bouton « Régénérer postes depuis CDC » dans Profile/Edit Info.

**Effort.** Élevé (parsing IA fiable + UI revue).

**Dépendances.** Aucune.

---

### Axe C — Continuité des actions

**Promesse.** Une remarque urgente d'un PV devient une *action ouverte*. À la rédaction du PV suivant, l'IA propose : « PV 27 : 3 actions toujours ouvertes — voici un rappel automatique ». L'auteur valide → elles sont reportées avec mention `Rappel — PV 27`.

**Modèle.** L'action existe déjà (`{id, text, who, urgent, open, since}`). Ajouter :
```
{
  ..., createdInPv, lastReminderPv, deadline?, status: "open"|"in_progress"|"done",
  history: [{pvNumber, action: "created"|"reminded"|"resolved", date}]
}
```

**Logique IA.** `generate-pv` reçoit les actions ouvertes en contexte et insère un bloc rappel dans le PV.

**UI.** Carte Actions : filtre par statut + deadline + responsable. Action depuis NoteEditor pour transformer une remarque en action.

**Effort.** Moyen.

**Dépendances.** Indépendant. Renforce Axe A.

---

### Axe D — OPR connectée

**Promesse.** Une remarque PV taggée « réserve » crée automatiquement une entrée OPR. Le rapport OPR génère un PDF dédié (mêmes règles de branding que le PV). Historique versionné des levées.

**Modèle.** Ajouter à reserve : `originPvNumber?, originRemarkId?, history[]`. Créer `oprReports[]` (snapshots PDF des rapports émis).

**Edge Function.** `generate-opr-report` (similaire à `generate-pv` mais template OPR) ou réutiliser `pdf.js` côté client avec un template `pdfOpr`.

**UI.** NoteEditor : bouton « Convertir en réserve » par remarque. OprView : timeline par réserve, export PDF rapport.

**Effort.** Moyen-élevé.

**Dépendances.** Renforce Axe A (jalon « toutes réserves levées » → phase `closed`).

---

### Axe E — Réunions de chantier vraies

**Promesse.** Calendrier des réunions, génération d'invitation ICS, lien réunion ↔ présents réels ↔ PV. À la création du PV, on coche les présents depuis la liste, plus de saisie texte libre.

**Modèle.** Nouveau `meetings[]` :
```
{
  id, projectId, scheduledAt, durationMin, location, agenda,
  invitees[], attendees[], pvNumber?, status: "scheduled"|"held"|"cancelled"
}
```

`nextMeeting` (champ texte) devient `meetings[].scheduledAt` triés.

**Edge Function.** Réutiliser `send-invite-email` ou nouveau `send-meeting-invite` (avec ICS attaché).

**UI.** Nouvelle vue `MeetingsView` ou onglet dans Overview. NoteEditor : pré-sélection meeting → présents auto.

**Effort.** Moyen. Le `recurrence` existant peut être réutilisé pour générer la série.

**Dépendances.** Renforce Axe C (action avec deadline = prochaine réunion).

---

### Axe F — Modèles de projet

**Promesse.** « Nouveau projet » propose des modèles métier complets, pas juste une liste de postes : *Rénovation Bruxelles* livre postes + checklist visite + réserves attendues + planning type + participants types (MO, archi, entreprise, ingénieur stabilité).

**Modèle.** `constants/projectTemplates.js` :
```
{
  id, label, structureType, postTemplate,
  defaultLots[], defaultChecklists[], expectedReserves[],
  participantsRoles[]
}
```

**UI.** Modal « Nouveau projet » : étape 1 = choisir un modèle (ou « vide »). Étape 2 = formulaire pré-rempli. Étape 3 = personnalisation.

**Effort.** Faible (curation de contenu) à moyen (UI wizard).

**Dépendances.** Plus pertinent une fois Axe B en place (le CDC peut surcharger le modèle).

---

## 6. Couche transverse — IA contextuelle opt-in

L'IA n'est pas un axe parmi d'autres : c'est une couche de surface présente partout, jamais bloquante.

### Principe

- **Présence systématique mais discrète.** Bouton/icône « Demander à l'IA » (même look, même placement relatif) à chaque endroit où l'utilisateur prend une décision.
- **Contexte automatique.** L'utilisateur n'a rien à expliquer — la modal s'ouvre avec le bon prefill (projet, poste, remarque, réserve, phase…).
- **Aucune suggestion non sollicitée.** Pas de popup, pas de tooltip qui s'incruste. L'utilisateur déclenche, l'IA répond.
- **Réutilisation de l'existant.** `ChatModal` + `chatPrefill` + Edge Function `ask-archipilot` couvrent déjà l'infra. On étend les *touchpoints*, pas le moteur.

### Touchpoints à câbler (par étape du cycle)

| Étape | Touchpoint | Prefill suggéré |
|-------|-----------|-----------------|
| Création | Modal nouveau projet | « Aide-moi à structurer ce projet à partir de cette description » |
| Cadrage | CDC banner (déjà en place — à étendre) | CDC complet + « quelles obligations clés ? » |
| Cadrage | Liste des postes | Postes actuels + CDC + « postes manquants ? » |
| Cadrage | Modal participants | Liste actuelle + « rôles manquants pour ce type de chantier ? » |
| Suivi terrain | Photo annotée | Photo + « décris ce que tu vois » / « risque potentiel ? » |
| Suivi terrain | Remarque dans NoteEditor | Remarque + « reformule en PV professionnel » |
| Synthèse | NoteEditor (poste actif) | Notes du poste + « ai-je oublié quelque chose vu le CDC ? » |
| Synthèse | ResultView (PV généré) | Contenu PV + « relis et propose des corrections » |
| Synthèse | Bloc action (par action) | Action + « rédige une relance email courte » |
| Réception | Réserve OPR | Réserve + photo + « niveau de sévérité justifié ? » |
| Réception | Rapport OPR | Toutes réserves + « synthèse pour rapport client » |
| Phases | Stepper phase | Phase + jalons restants + « que dois-je faire pour passer à la suivante ? » |
| Planning | Lot Gantt | Lot + dépendances + « risque de retard ? » |
| Réunions | Card réunion | Agenda + actions ouvertes + « ordre du jour proposé » |

### Pattern UI commun

Composant réutilisable `<AskAiButton context={…} />` :
- Icône sparkle/IA + label optionnel
- Tailles : `inline` (icône seule) | `compact` (icône + texte court) | `cta` (bouton plein)
- Hover : tooltip indiquant ce que l'IA va recevoir comme contexte (transparence)
- Clic : ouvre `ChatModal` avec `chatPrefill = { message, attachments, sourceTag }`

### Coût IA

Chaque touchpoint augmente la conso. À cadrer :
- Free : 3 IA/mois → suffit pour tester un projet, pas pour usage quotidien.
- Pro/Team : illimité → vrai cas d'usage.
- À surveiller : `ai_usage` table (quota mensuel, race condition à corriger).

### Effort

Faible côté infra (composant + branchement). Élevé côté curation des prefills (un par touchpoint, à tester).

---

## 7. Priorisation recommandée

```
Phase 1 (contenu + IA)          Phase 2 (interconnexion)        Phase 3 (orchestration)
─────────────────────           ─────────────────────           ─────────────────────
F. Modèles de projet    ───►    C. Continuité actions   ───►    A. Cycle unifié
B. CDC central                  D. OPR connectée                E. Réunions vraies
+ AskAiButton (touchpoints      + Touchpoints PV/OPR            + Touchpoints phase
  création / cadrage)                                             & réunions
```

**Pourquoi cet ordre.**

- **Phase 1 — F + B + premiers touchpoints IA.** F et B remplissent le projet à la création. Sans contenu, les interconnexions n'ont rien à connecter. Les premiers `AskAiButton` se posent là où ça sert immédiatement (CDC, création, postes).
- **Phase 2 — C + D + touchpoints PV/OPR.** Les liens contenu ↔ contenu se font (remarque → action → réserve). Les touchpoints IA arrivent dans NoteEditor et OprView.
- **Phase 3 — A + E.** Le cycle s'orchestre tout seul (jalons auto, phases qui progressent), les réunions deviennent un objet de première classe avec ICS et présents réels.

## 8. Découpage en tickets (suggestion Phase 1)

### Ticket F1 — Catalogue de modèles de projet
- [ ] `constants/projectTemplates.js` avec 3 modèles initiaux (Rénovation BE, Construction neuve BE, Aménagement intérieur)
- [ ] Schema partagé avec `POST_TEMPLATES` mais qui inclut `defaultLots[]`, `defaultChecklists[]`, `participantsRoles[]`, `expectedReserves[]`

### Ticket F2 — Wizard nouveau projet
- [ ] Étape 0 : choisir un modèle ou « vide »
- [ ] Pré-remplissage formulaire existant
- [ ] Application des `defaultLots/Checklists/Participants` à la création

### Ticket B1 — Edge Function `parse-cdc`
- [ ] Endpoint qui prend `extractedText`, retourne JSON `{ posts, obligations, attendus }`
- [ ] System prompt strict BTP belge, schéma JSON imposé
- [ ] Quota partagé `ai_usage`

### Ticket B2 — Wizard relecture CDC
- [ ] Étape post-import : afficher la structure détectée, l'utilisateur valide/corrige
- [ ] Application au projet (postes, checklist visite générée, réserves attendues)

### Ticket IA1 — Composant `<AskAiButton />`
- [ ] 3 tailles (`inline`, `compact`, `cta`), une icône sparkle commune
- [ ] Tooltip de transparence (ce que l'IA reçoit comme contexte)
- [ ] Branche sur `setChatOpen(true)` + `setChatPrefill(...)` au niveau App

### Ticket IA2 — Premiers touchpoints (Phase 1)
- [ ] Création projet — assistant de structuration
- [ ] CDC banner — extension de l'existant `onAskAi`
- [ ] Liste des postes — « postes manquants vu le CDC »
- [ ] Modal participants — « rôles manquants »

## 9. Risques transverses

- **Migration JSONB rétro-compatible.** Tout ajout au shape projet doit fallback sur l'ancien (utilisateurs Free n'ouvrent pas l'app pendant des semaines).
- **Quota IA.** Axes B et C augmentent la conso. Vérifier la limite mensuelle Free (3 IA/mois aujourd'hui).
- **RLS organisations.** Toute nouvelle table satellite doit avoir des policies miroirs sur perso + org.
- **Test manuel obligatoire.** UI riche, peu couverte par tests automatisés. Prévoir scénarios de régression sur les flows critiques (création, PV, OPR).

## 10. Hors-scope (autres dettes identifiées)

À traiter séparément, non bloquantes pour la gestion de projet :

- Migrer photos base64 → Storage (JSONB obèse).
- PDF multi-page dans `PlanViewer`.
- Idempotency `stripe-webhook`.
- Atomicité `ai_usage`.
- Sync offline à la reconnexion (drafts orphelins).
- Finir migration `useState` → Zustand stores.

---

*Document vivant. À itérer après validation de la priorisation.*
