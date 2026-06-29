# Handoff — Mobile (Direction D) · ArchiPilot

## Périmètre de ce package
Ce package couvre **uniquement** le fichier **`design-reference-mobile.dc.html`**,
la refonte **mobile** d'ArchiPilot. Philosophie : sur téléphone, l'architecte fait
deux choses — **consulter** (vite, une main) ou **capturer en visite** (chrono, photo,
vocal, réserve, audio de réunion). Pas de facturation, pas de Gantt, pas d'édition
lourde : ça reste sur desktop.

Écrans inclus :
1. **Accueil** — « qu'est-ce que je fais maintenant ? » : CTA *Démarrer une visite*,
   agenda du jour, chantiers récents + à proximité. Tab bar 3 onglets + **FAB ✦ assistant**.
2. **Chantiers** (onglet) — liste filtrable, carte par chantier + signal prioritaire.
3. **Notifs** (onglet) — groupées Nouveau / Plus tôt, typées sémantiquement.
4. **Consultation projet** (lecture seule) — en-tête phase + KPIs + accès PV/réserves/photos/plans.
5. **Mode Chantier** (visite, thème clair) — chrono, entrée **Enregistrer la réunion**
   (audio), 3 cibles tactiles Photo / Note vocale / Réserve, fil des captures, « Finir → PV ».
6. **Enregistrement réunion** — le téléphone = micro : waveform, chrono, bloc
   **« Se synchronise sur l'ordinateur »** (continuité asynchrone, pas de live streaming).
7. **Créer une réserve** — photo d'abord + annotation, description dictable, gravité,
   localisation (punaise sur plan), responsable, échéance. Fonctionne hors-ligne.
8. **Détail réserve** (lecture) — photos, méta, description, suivi chronologique.
9. **Détail PV** (lecture) — contenu par poste, méta, photos liées, PDF / partage.
10. **Assistant** — chat Q&A sur documents (source citée) + **historique des conversations** ;
    accès via FAB ✦ (poser vite) et icône horloge (retrouver).
11. **Mon profil** — identité, abonnement, préférences (push/géoloc/synchro), compte.

Les écrans sont rendus dans un cadre iPhone fourni par `ios-frame.jsx` (inclus).
C'est un **élément de présentation** (le bezel + status bar) — à ignorer au portage ;
seul le contenu de chaque écran compte. Statut bar simulée → en prod, c'est l'OS.

## À propos du fichier de design
`design-reference-mobile.dc.html` est une **référence de design en HTML** — prototype
d'apparence/comportement, **pas du code de production à copier**. Styles inline =
source de vérité (couleurs/espacements/typo). **La tâche** : recréer ces écrans en
React dans le codebase (responsive / composants mobiles existants), en réutilisant
`src/design/tokens.js` et `src/components/ui/v2/*`.

## Principes mobile (à respecter)
- **Moins de features, le bon réflexe.** Exclure du mobile : facturation, Gantt,
  édition de PV, devis. Inclure : consultation + capture terrain + assistant Q&A.
- **Cibles tactiles ≥ 44px** (les actions de visite sont à ~50px).
- **Hors-ligne d'abord** : toute capture (réserve, photo, vocal, audio) doit survivre
  sans réseau et rejoindre la file de synchro (cf. `offline.js` / `sw.js`).
- **Tab bar = destinations** (Accueil / Chantiers / Notifs), **FAB = action contextuelle**
  (assistant). Ne pas mettre l'assistant dans la tab bar.
- **Mode Chantier en thème clair** comme le reste (même Direction D, pas de dark mode).
- Une seule action primaire (terracotta) par écran ; statuts en couleur sémantique.

## Tokens (= `src/design/tokens.js`)
- Marque terracotta (rare) : `#FDF6F1 / #F5DCC9 / #E8B58E / #D17A47 / #B85C2C (primary) / #A04C20 (hover)`.
  Dégradé `135deg,#D17A47→#B85C2C` réservé à l'**assistant** (FAB, avatar) et aux CTA héros.
- Neutres : `#FFFFFF / #FAFAF9 / #F5F5F4 / #E7E5E4 / #78716C / #44403C / #1C1917`
  (fonds chauds `#FCFBFA`, séparateurs `#EFEDEB`, champ `#F1ECE8`).
- Statuts projet : Chantier terracotta `#B85C2C`, Permis `#C0791A`, Avant-projet `#9A8478`.
- Sémantique : success `{#F0FDF4,#166534,#BBF7D0}` · warning `{#FFFBEB,#92400E,#FDE68A}`
  · danger `{#FEF2F2,#991B1B,#FECACA}` · info `{#EFF6FF,#1E40AF,#BFDBFE}`.
- Typo Inter · radius lg 12 / xl 16 / cards 14–18 · espacement multiples de 4.

## Correspondance design → code
| Écran du proto | Fichier source à faire évoluer |
|---|---|
| Accueil mobile | `src/views/MobileHome.jsx` |
| Chantiers (liste) | `src/views/MobileChantiersList.jsx` |
| Notifs | `src/views/MobileNotifs.jsx` |
| Consultation projet | `src/views/Overview.jsx` (rendu mobile) |
| Mode Chantier + audio | `src/views/ChantierModeView.jsx`, `src/hooks/useConversationRecorder.js`, `useWhisperRecorder.js` |
| Créer / détail réserve | `src/views/OprView.jsx`, `ChantierModeView.jsx` |
| Détail PV | `src/views/PvRow.jsx`, `ResultView.jsx` |
| Assistant + historique | `src/views/ChatModal.jsx` |
| Mon profil | `src/views/ProfileView.jsx`, `src/pages/Account.jsx` |
| Hors-ligne / synchro | `src/utils/offline.js`, `src/sw.js` |
| Tokens / statuts | `src/design/tokens.js`, `src/constants/statuses.js` |

## Utilisation dans Claude Code
1. Dézippe ce dossier à la racine de ton repo ArchiPilot.
2. `claude` dans le terminal.
3. Exemple, **écran par écran** :
   > « Lis `handoff_mobile/README.md` et le prototype `design-reference-mobile.dc.html`.
   > Recrée l'écran **Mode Chantier** dans `src/views/ChantierModeView.jsx`, en réutilisant
   > `src/design/tokens.js` et nos composants. Respecte : thème clair, cibles ≥44px,
   > hors-ligne d'abord. Ne copie pas le HTML — porte-le dans nos patterns. »
4. Ordre conseillé : Accueil → Mode Chantier (+ audio) → Créer/Détail réserve →
   Détail PV → Consultation → Chantiers/Notifs → Assistant → Profil.

## Fichiers
- `design-reference-mobile.dc.html` — le prototype (11 écrans mobiles).
- `ios-frame.jsx` — cadre iPhone (présentation ; non destiné à la prod).
