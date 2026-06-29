# Handoff — États transverses (Direction D) · ArchiPilot

## Périmètre de ce package
Ce package couvre **uniquement** le fichier **`design-reference-etats-transverses.dc.html`**,
qui regroupe les **états transverses** de l'app — ceux qui traversent tous les écrans :

1. **Recherche globale / ⌘K** (desktop) — palette de commandes : recherche cross-projets
   (projets, réserves, PV) + actions rapides (Nouveau PV…), navigation clavier.
2. **Hors-ligne & synchro — desktop** — bandeau hors-ligne (anthracite, non alarmiste)
   + compteur « en attente » + file de synchronisation détaillée par élément.
3. **Hors-ligne & synchro — mobile** — bandeau mode hors-ligne + file « À synchroniser »
   (poids des fichiers) + groupe « Déjà synchronisé ».
4. **Connexion rétablie — mobile** — bandeau vert + barre de progression globale ;
   chaque élément passe de « en attente » au check vert (% d'upload pour les photos).

Les écrans **mobile** sont rendus dans un cadre iPhone fourni par `ios-frame.jsx`
(inclus dans le package). C'est un **prop de présentation** (le bezel) — à ignorer
lors du portage ; seul le contenu de l'écran compte.

## À propos du fichier de design
`design-reference-etats-transverses.dc.html` est une **référence de design créée en
HTML** — un prototype d'apparence/comportement, **pas du code de production à copier
tel quel**. Styles inline (lisibles) = source de vérité pour couleurs/espacements/typo.
**La tâche** : recréer ces états dans le codebase existant (React 18 + Vite), en
réutilisant `src/design/tokens.js` et `src/components/ui/v2/*`.

## Principes de ces états
- **Rassurer, jamais bloquer.** Le hors-ligne n'empêche rien : l'utilisateur continue
  de travailler/capturer, tout part au retour du réseau. Bandeau sobre (anthracite),
  pas de rouge alarmiste.
- **Langage de synchro cohérent** : spinner/anneau **ambre** = en attente · barre/anneau
  **bleu** = en cours (avec %) · check **vert** = synchronisé.
- **⌘K = actions + navigation**, résultats groupés (Projets / Réserves & PV / Actions
  rapides), terme recherché surligné en `brand.600`, raccourcis clavier en pied.

## Tokens (= `src/design/tokens.js`)
- Marque terracotta (rare) : `#FDF6F1 / #F5DCC9 / #E8B58E / #D17A47 / #B85C2C (primary) / #A04C20 (hover)`.
- Neutres : `#FFFFFF / #FAFAF9 / #F5F5F4 / #E7E5E4 / #78716C / #44403C / #1C1917`
  (+ fonds chauds `#FCFBFA`, séparateurs `#EFEDEB`).
- Sémantique : success `{#F0FDF4,#166534,#BBF7D0}` · warning `{#FFFBEB,#92400E,#FDE68A}`
  · danger `{#FEF2F2,#991B1B,#FECACA}` · info `{#EFF6FF,#1E40AF,#BFDBFE}`.
- Bandeau hors-ligne : fond `#44403C`, accent icône `#E8B58E`.
- Typo Inter · radius lg 12 / xl 16 · espacement multiples de 4.

## Correspondance design → code
| État du proto | Fichier source à faire évoluer |
|---|---|
| Hors-ligne & synchro (logique) | `src/utils/offline.js`, `src/sw.js` |
| Recherche globale ⌘K | à créer (nouveau composant `CommandPalette`) — alimenté par `useProjectStore` |
| Bandeaux (offline / back-online) | shell de l'app `src/App.jsx` (bandeau global) |
| Tokens | `src/design/tokens.js`, `src/constants/tokens.js` |

## Utilisation dans Claude Code
1. Dézippe ce dossier à la racine de ton repo ArchiPilot.
2. `claude` dans le terminal.
3. Exemple :
   > « Lis `handoff_etats_transverses/README.md` et le prototype
   > `design-reference-etats-transverses.dc.html`. Implémente le **bandeau hors-ligne
   > + la file de synchro** dans le shell `src/App.jsx`, branché sur `src/utils/offline.js`,
   > en réutilisant `src/design/tokens.js`. Ne copie pas le HTML — porte-le dans nos patterns. »

## Fichiers
- `design-reference-etats-transverses.dc.html` — le prototype (⌘K, hors-ligne, synchro, retour en ligne).
- `ios-frame.jsx` — cadre iPhone (présentation des écrans mobiles ; non destiné à la prod).
