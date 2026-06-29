# Handoff — Refonte UX/UI ArchiPilot (Direction D)

## Vue d'ensemble
Refonte desktop complète d'ArchiPilot (copilote IA de gestion de chantier pour
architectes). Le parcours couvre : authentification → onboarding → espace projet
(7 onglets) → création de PV → vues métier → compte → assistant IA.

La direction artistique retenue est **« Direction D »** : en-tête éditorial
constant, chiffres-clés glanceables, surfaces neutres, et la couleur terracotta
de marque utilisée avec parcimonie (logo, onglet actif, jauge de phase, et **une
seule action primaire par écran**). Le rouge/ambre/vert ne servent qu'aux signaux
sémantiques réels (retard, gravité, écart de prix).

## À propos des fichiers de design
Le fichier `design-reference.dc.html` est une **référence de design créée en HTML**
— un prototype montrant l'apparence et le comportement visés, **pas du code de
production à copier tel quel**. Le HTML est entièrement en styles inline (lisibles)
et sert de source de vérité pour les couleurs, espacements, typographies et layouts.

**La tâche** : recréer ces écrans dans le codebase existant (React 18 + Vite), en
réutilisant son design system et ses composants — **ne pas livrer le HTML directement**.

> ⚠️ Ce design a été construit **sur le design system v2 existant** du projet
> (`src/design/tokens.js` + `src/components/ui/v2/*`). La recréation doit donc
> réutiliser ces tokens et composants, pas réinventer des valeurs. Toute couleur,
> espacement ou radius ci-dessous correspond déjà à `tokens.js`.

## Fidélité
**Haute fidélité (hifi).** Couleurs, typographies, espacements et interactions sont
définitifs. Recréer pixel-près avec les composants v2 existants (`Button`, `Badge`,
`Card`, `Tabs`, `IconButton`, `SectionHeader`) et les tokens. Là où un atome manque
(ex. en-tête de page éditorial, jauge de phase, grille bento, Gantt, stepper de
wizard, overlay de tour guidé), le créer dans `src/components/ui/v2/` en suivant la
même discipline de tokens.

## Comment l'utiliser avec Claude Code
1. Dézippe ce dossier à la racine de ton repo ArchiPilot (ou à côté).
2. Dans le terminal, lance `claude` depuis la racine du repo.
3. Prompt suggéré :
   > « Lis `design_handoff_archipilot_refonte/README.md` et le prototype
   > `design-reference.dc.html`. Recrée l'écran **[nom de l'écran]** comme un
   > composant React dans `src/`, en réutilisant `src/design/tokens.js` et les
   > composants `src/components/ui/v2/*`. Respecte la discipline couleur décrite
   > (terracotta rare, sémantique pour les statuts). Ne copie pas le HTML : porte
   > le design dans nos patterns existants. »
4. Avance **écran par écran** (commence par l'espace projet → onglet Résumé, qui
   pose tous les patterns réutilisés ailleurs). Le HTML étant en styles inline,
   Claude Code peut lire chaque valeur exacte directement dans le fichier.

## Tokens de design (= `src/design/tokens.js`)
**Marque (terracotta, rare) :** `brand.50 #FDF6F1` · `100 #F5DCC9` · `200 #E8B58E`
· `400 #D17A47` · `500 #B85C2C` (CTA primaire) · `600 #A04C20` (hover) ·
`700 #8B3A14` · `900 #5A2509`.
**Neutres (90% des surfaces) :** `0 #FFFFFF` · `50 #FAFAF9` · `100 #F5F5F4` ·
`200 #E7E5E4` · `300 #D6D3D1` · `500 #78716C` · `700 #44403C` · `900 #1C1917`.
(Le prototype utilise aussi `#FCFBFA`/`#FBF8F5` comme fonds chauds et `#A8A29E`,
`#EFEDEB`, `#F0DCCB` comme nuances intermédiaires — à mapper sur les voisins de la
rampe neutre/brand lors du portage.)
**Sémantique :** info `{#EFF6FF,#1E40AF,#BFDBFE}` · success `{#F0FDF4,#166534,#BBF7D0}`
· warning `{#FFFBEB,#92400E,#FDE68A}` · danger `{#FEF2F2,#991B1B,#FECACA}`.
**Radius :** sm 6 · md 8 · lg 12 · xl 16 · full 999 (le proto pousse certaines
cards à 14–22px pour un rendu plus doux — aligner sur xl/lg au portage).
**Typo :** Inter. Tailles xs 12 · sm 13 · base 14 · md 15 · lg 17 · xl 20 ·
2xl 24 · 3xl 32. Poids 400/500/600/700. Titres en `letter-spacing:-.3 à -.8px`.
**Espacement :** multiples de 4 (4/8/12/16/20/24/32/40/48).
**Transitions :** 100ms (tactile) · 150ms (état UI) · 250ms (layout).

## Principes transverses (à respecter partout)
- **En-tête de projet constant** : overline phase (uppercase, brand.600) + titre
  (28–32px, bold) + jauge de phase fine (7 segments, remplis jusqu'à l'étape) +
  bande de chiffres-clés (PV émis · réserves · à relancer · temps). Identique sur
  les 7 onglets ; seul le contenu sous la barre d'onglets change.
- **Onglets** : soulignés (barre 2px brand.500 sous l'actif), pas de fond plein.
- **Une seule action primaire visible** par écran (bouton brand.500). Le reste en
  secondaire (fond blanc, bordure neutral.200) ou ghost.
- **Cards** : fond blanc, bordure `neutral.200`, radius lg/xl. Hover : léger
  translateY(-2px) + ombre douce + bordure `brand.200`.
- **Statuts** : toujours via la palette sémantique, jamais brand.

## Inventaire des écrans (regroupés par process dans le canvas)
### 1. Authentification (split-screen : panneau marque terracotta + formulaire)
- **Connexion** — Google SSO, email/mot de passe (avec œil), « Rester connecté »,
  lien « Oublié ? », bascule vers inscription.
- **Inscription** — preuve sociale, nom/email/mot de passe, mention CGU.
- **Mot de passe oublié** — email + « Envoyer le lien ».
- **Email envoyé** — confirmation (icône verte), renvoyer, retour connexion.

### 2. Wizard de première connexion (modale centrée, 5 étapes, progress dots)
Rôle (4 cartes) → Structure (nom/agence/adresse) → Formule (Free/Pro recommandé/
Team, sans paiement) → Premier projet (nom suffit) → Bienvenue (checklist + CTA
visite guidée). Non bloquant, sortie possible à chaque étape.

### 3. Tour guidé (overlay sombre + spotlight cutout)
Coachmark avec flèche + progression (7 cibles), « Passer » toujours visible.
Spotlight = élément en `position:relative;z-index:2` avec
`box-shadow: 0 0 0 3px #B85C2C, 0 0 0 9999px rgba(28,25,23,.72)`.

### 4. Espace projet — 7 onglets
Résumé (en-tête + action focale tintée + grille bento glanceable) · Fiche (infos +
intervenants + CdC + phases) · Actions (board À traiter/En cours/Résolu) · Planning
(Gantt Phase→Lot→Tâche, repère « Aujourd'hui ») · PV (action focale + historique) ·
Documents (dossiers + table de fichiers) · Photos (grille par visite + badges).

### 5. Création d'un PV (composer plein écran, stepper 1·Saisie 2·Rédaction 3·Diffusion)
Choix de la méthode (manuel / audio) → [Enregistrement audio avec transcription IA
live | Widget import de notes] → Saisie par poste (remarques taggées statut +
destinataire, reports auto du PV précédent) → Rédaction (PV éditable côte à côte
avec les remarques source, renvois « → 03.2 ») → Diffusion (tâches suggérées IA +
envoi email).

### 6. Vues métier
Réserves OPR (KPIs + liste avec gravité/statut cyclique) · Honoraires & facturation
(KPIs + factures, accent rouge sur retard) · Devis (cartes + matrice comparative
vert=mieux-disant / rouge=plus cher / —=absent).

### 7. Compte (nav latérale + sections)
Profil · Structure & facturation (conforme SEPA) · Signature email · Abonnement
(Free/Pro/Team + historique) · Sécurité (mot de passe, 2FA, sessions) ·
Notifications (matrice Cloche/Push/Email) · Données & RGPD (export, consentements,
suppression de compte).

### 8. Assistant ArchiPilot (panneau flottant + FAB ✦)
État d'accueil (greeting + insight contextuel + 4 suggestions) et conversation
(rédaction contextuelle ancrée dans les données, marqueur de source, actions
Copier/Raccourcir). **Lecture seule** : il rédige, ne mute jamais les données.

## Fichiers
- `design-reference.dc.html` — prototype HTML de tous les écrans (styles inline,
  navigable en zoom/pan dans l'outil de design ; lisible comme source pour les
  valeurs exactes).
- Codebase cible : `src/design/tokens.js`, `src/components/ui/v2/*`, `src/views/*`,
  `src/pages/ProjectDetail.jsx` (la page Résumé v2 existante à faire évoluer).
