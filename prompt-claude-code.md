# Refonte page projet ArchiPilot (vue détaillée projet)

## Contexte
Je travaille sur **ArchiPilot**, un SaaS de gestion de projets pour architectes (Belgique). Tu vas refondre la page de détail d'un projet (capture d'écran fournie : projet "SNCB"). L'UI actuelle fonctionne mais souffre de problèmes de hiérarchie, de surcharge de couleur, et d'incohérences. Je veux **garder l'identité visuelle terracotta/crème** (qui est juste et différenciante), mais **corriger tous les problèmes de design** identifiés ci-dessous — notamment en **désaturant le terracotta** pour qu'il évoque la terre cuite authentique plutôt qu'un orange SaaS générique.

## Stack technique (à respecter strictement)
- React 18.3 + JSX
- Vite 6.0
- react-router-dom 7.14
- Zustand 5.0 (state global)
- **CSS-in-JS inline** — pas de Tailwind, pas de CSS modules, pas de styled-components. Tu utilises l'attribut `style={{ ... }}` sur les éléments JSX, ou des objets de style définis en haut du fichier.
- Pas de librairie UI (pas de shadcn, pas de MUI, pas de Chakra)

## Architecture demandée

### 1. Créer un fichier de design tokens
`src/design/tokens.js` — exporte un objet `tokens` avec toutes les valeurs (couleurs, spacings, typo, radius, shadows, transitions). C'est la source de vérité. Tout le reste consomme ce fichier.

### 2. Créer des composants atomiques réutilisables
Dans `src/components/ui/` :
- `Button.jsx` — variants : `primary`, `secondary`, `ghost`, `icon`. Tailles : `sm`, `md`, `lg`.
- `Badge.jsx` — variants sémantiques : `neutral`, `info`, `success`, `warning`, `danger`. Un seul système, pas de couleurs ad-hoc.
- `Card.jsx` — conteneur de base avec padding et bordure cohérents.
- `Tabs.jsx` — onglets (Résumé / Fiche / Actions / Planning / PV / Documents / Photos).
- `IconButton.jsx` — bouton icône-seule pour barres d'action.

### 3. Refondre la page projet
`src/pages/ProjectDetail.jsx` — la page complète, qui utilise les composants ci-dessus.

## Design tokens à utiliser

**Note sur la palette** : la couleur de marque passe de `#C2410C` (orange SaaS saturé, fatigant à l'œil sur la durée) à `#B85C2C` (terracotta désaturé, terre cuite authentique). C'est le même territoire visuel, mais plus mat et plus reposant pour un outil utilisé quotidiennement.

```js
export const tokens = {
  color: {
    // === IDENTITÉ — Terracotta authentique (désaturé, terreux) ===
    brand: {
      50:  '#FDF6F1',   // fond très clair — zones d'accent, hover subtil
      100: '#F5DCC9',   // fond clair — badges warning, indicateurs
      200: '#E8B58E',   // bordure d'accent
      400: '#D17A47',   // hover du primaire
      500: '#B85C2C',   // ★ CTA PRIMAIRE — un seul par zone visible
      700: '#8B3A14',   // texte sur fond brand-50, état pressed
      900: '#5A2509',   // texte fort sur fond brand-100
    },

    // === NEUTRES — 90% des surfaces ===
    neutral: {
      0:   '#FFFFFF',   // surfaces (cards, modals)
      50:  '#FAFAF9',   // fond de l'app
      100: '#F5F5F4',   // sidebar, fond du panneau droit
      200: '#E7E5E4',   // bordures par défaut
      300: '#D6D3D1',   // bordures hover, séparateurs forts
      500: '#78716C',   // texte secondaire, icônes
      700: '#44403C',   // texte courant
      900: '#1C1917',   // titres, texte fort
    },

    // === SÉMANTIQUE — badges, alertes, statuts ===
    semantic: {
      info:    { bg: '#EFF6FF', fg: '#1E40AF', border: '#BFDBFE' },
      success: { bg: '#F0FDF4', fg: '#166534', border: '#BBF7D0' },
      warning: { bg: '#FFFBEB', fg: '#92400E', border: '#FDE68A' },
      danger:  { bg: '#FEF2F2', fg: '#991B1B', border: '#FECACA' },
    },
  },

  space: {
    1: '4px', 2: '8px', 3: '12px', 4: '16px',
    5: '20px', 6: '24px', 8: '32px', 10: '40px', 12: '48px',
  },

  radius: {
    sm: '6px', md: '8px', lg: '12px', xl: '16px', full: '999px',
  },

  font: {
    family: "'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    size: {
      xs: '12px', sm: '13px', base: '14px', md: '15px',
      lg: '17px', xl: '20px', '2xl': '24px', '3xl': '32px',
    },
    weight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
    leading: { tight: 1.2, normal: 1.5, relaxed: 1.7 },
  },

  shadow: {
    none: 'none',
    sm: '0 1px 2px rgba(28, 25, 23, 0.04)',
    md: '0 2px 8px rgba(28, 25, 23, 0.06)',
    focus: '0 0 0 3px rgba(184, 92, 44, 0.2)', // anneau focus aux couleurs brand
  },

  transition: {
    fast: 'all 100ms ease',
    base: 'all 150ms ease',
    slow: 'all 250ms ease',
  },
};
```

## Règles d'usage de la couleur (impératives)

### Règle d'or : `brand.500` (#B85C2C) est rare et précieux
Ne l'utilise QUE pour :
1. Le **logo** ArchiPilot.
2. **UN seul CTA primaire** visible par zone fonctionnelle (ex: "Préparer le PV n°11").
3. **L'indicateur d'élément actif** (tab sélectionné, projet sélectionné dans la sidebar) — sous forme de barre fine de 2px, pas de fond plein.
4. **L'icône** du bouton flottant assistant IA.

Ne l'utilise JAMAIS pour :
- Les boutons secondaires (Modifier, Ouvrir, Gérer, Voir le dernier PV) → ce sont des `secondary` (fond blanc, bordure neutral.200).
- Les fonds de cards ou de blocs → utilise `neutral.0` (blanc) ou `neutral.100` (gris clair).
- Les badges de statut → utilise les couleurs sémantiques.
- Les liens textuels → utilise `neutral.700` souligné, ou `semantic.info.fg` si vraiment c'est un lien.

### `brand.50` et `brand.100` : fonds doux
- `brand.50` (#FDF6F1) : hover discret sur les éléments cliquables, fond du tab actif si tu veux une zone tintée.
- `brand.100` (#F5DCC9) : fond du badge "Passée 3j" (avec `brand.700` en texte), avatar utilisateur dans la sidebar.

### Couleurs sémantiques pour les badges
- "Clôturé" → `neutral` (fond `neutral.100`, texte `neutral.700`)
- "Passée 3j" → `warning` ambre, PAS terracotta
- "Esquisse" → `info`
- "10 PV", "1 projet" → `neutral` avec petit chiffre
- Tous au même format : `padding: 2px 8px`, `radius: full`, `font.size.xs`, `font.weight.medium`.

## Règles de design impératives (corrections à appliquer)

### 1. Une seule action primaire visible
Sur la page projet, l'action principale est **"Préparer le PV n°11"** (c'est ce que l'utilisateur doit faire maintenant). C'est le seul bouton `brand.500` visible. Tous les autres CTAs sont secondaires.

### 2. Hiérarchie : remonter le "À faire"
Le bloc "À faire maintenant" (Préparer le PV n°11) doit être **en haut de la colonne centrale**, juste sous les tabs, pas en bas. C'est l'info la plus actionnable.

### 3. Simplifier le bloc "Prochaine réunion"
- Fond : `neutral.100` (PAS de fond terracotta).
- Date : `font.size.xl`, `font.weight.semibold`, `neutral.900`.
- "passée (3j)" en `semantic.warning.fg`, taille `font.size.sm`.
- UN seul bouton visible "Modifier" (style secondaire), les actions Cal et .ics passent dans un menu kebab (⋯) accessible au clic.

### 4. Cards de modules
- Padding réduit : `space.4` (16px) vertical au lieu de l'actuel ~32px.
- Bordure unique `1px solid neutral.200`, pas d'ombre, fond `neutral.0` (blanc).
- L'icône à gauche : carré 40×40, fond `neutral.100`, icône en `neutral.500`, radius `md`.
- Bouton "Ouvrir" / "Gérer" : style secondaire (fond blanc, bordure neutral.200, texte neutral.700).
- Hover sur la card entière : fond `brand.50` (très discret), curseur pointer si toute la card est cliquable.

### 5. Typographie cohérente
- Labels de sections sidebar (PROJETS, ARCHIVÉS, ESPACE) : `font.size.xs`, `font.weight.semibold`, `letterSpacing: '0.05em'`, `color: neutral.500`, `textTransform: 'uppercase'`.
- Titres de cards : `font.size.md`, `font.weight.semibold`, `neutral.900`.
- Sous-titres / métadonnées : `font.size.sm`, `neutral.500`.
- Titre projet ("SNCB") : `font.size.2xl`, `font.weight.bold`, `neutral.900`.

### 6. Densité
Réduire l'espacement vertical entre les cards de modules à `space.3` (12px). Pour un outil métier utilisé quotidiennement, la densité prime sur l'aération excessive.

### 7. Bouton flottant assistant IA
- Taille 48×48 (au lieu de 56+).
- Fond `brand.500` avec opacité 0.9 au repos, opacité 1 au hover.
- Icône blanche au centre (étincelle ou similaire, SVG inline).
- Position : `bottom: 24px, right: 24px`, `position: fixed`.
- Ombre légère `shadow.md`.

### 8. Header projet
- Titre "SNCB" en `font.size.2xl`, `font.weight.bold`, `neutral.900`.
- L'adresse et la date de mise à jour en `font.size.sm`, `neutral.500`, séparées par un point médian (·).
- "Compléter les informations" : transformer en lien discret avec icône crayon, `font.size.sm`, `neutral.700`, soulignement au hover seulement.
- Badges de statut ("Clôturé", "Passée 3j") alignés à droite du titre, gap de `space.2`.

### 9. Sidebar
- Largeur fixe : 280px.
- Fond : `neutral.100`.
- Projet sélectionné : pas de fond plein terracotta, juste une **barre verticale de 2px** en `brand.500` à gauche + texte en `font.weight.semibold` + fond `neutral.0` (blanc).
- Logo ArchiPilot en haut : `brand.500`.
- Avatar utilisateur en bas : initiales sur fond `brand.100`, texte `brand.700`.

### 10. Barre de recherche (header)
- Une seule icône de recherche à gauche, placeholder "Rechercher", raccourci `⌘K` à droite en `neutral.500`.
- Les autres icônes (cloche, horloge) regroupées proprement à droite avec un espacement de `space.3` entre elles.

## Contenu fictif à utiliser

```js
const project = {
  name: 'SNCB',
  status: 'Clôturé',
  address: 'Rue Neuve Cour 80, 1480 Tubize',
  updatedAt: '07/05/2026',
  nextMeeting: {
    date: '09/05/2026',
    overdueDays: 3,
    type: 'Sur site',
    recurrence: 'Ponctuel',
  },
  modules: [
    { id: 'billing',  title: 'Honoraires & facturation', subtitle: 'Émettre une facture conforme TVA · numérotation auto', icon: 'file',  action: 'Ouvrir' },
    { id: 'quotes',   title: 'Devis & soumissions',      subtitle: 'Upload + extraction IA + comparaison automatique',  icon: 'chart', action: 'Ouvrir' },
    { id: 'journal',  title: 'Journal de chantier',      subtitle: '17 entrées chronologiques',                          icon: 'clock', action: 'Ouvrir' },
    { id: 'reserves', title: 'Réserves OPR',             subtitle: '0/2 levées',                                         icon: 'alert', action: 'Gérer' },
  ],
  tabs: [
    { id: 'summary',  label: 'Résumé',    count: null, active: true },
    { id: 'sheet',    label: 'Fiche',     count: null },
    { id: 'actions',  label: 'Actions',   count: 0 },
    { id: 'planning', label: 'Planning',  count: 3 },
    { id: 'pv',       label: 'PV',        count: 10 },
    { id: 'docs',     label: 'Documents', count: 2 },
    { id: 'photos',   label: 'Photos',    count: 1 },
  ],
  todo: {
    type: 'now',
    title: 'Préparer le PV n°11',
    subtitle: 'À partir du dernier PV validé et des éléments du projet.',
  },
  timeTracking: { totalMinutes: 0, sessionCount: 7 },
};

const projects = [
  { id: 'fdgf', name: 'FDGF', count: 1, items: [{ name: 'testfggf', status: 'Esquisse', progress: 1 }] },
  { id: 'sncb', name: 'SNCB', count: 1, items: [{ name: 'SNCB', status: 'Clôturé', progress: 6, pvCount: 10, selected: true }] },
];
```

## Layout attendu

```
┌─────────────┬──────────────────────────────────────┬──────────────┐
│             │ [×] SNCB [badge Clôturé][badge ⚠3j] │              │
│  SIDEBAR    │ Rue Neuve Cour 80 · MAJ 07/05/2026  │ Prochaine    │
│  280px      │ ✎ Compléter les informations         │ réunion      │
│             ├──────────────────────────────────────┤ (compacte)   │
│ Logo        │ [Résumé] Fiche Actions Planning ... │ neutral.100  │
│ Espace      ├──────────────────────────────────────┤              │
│             │  ┌────────────────────────────────┐  │ Suivi temps  │
│ [+ Nouveau] │  │ À FAIRE — Préparer PV n°11 [▶]│  │ [Démarrer]   │
│ Importer    │  └────────────────────────────────┘  │ brand.500    │
│             │  ┌────────────────────────────────┐  │              │
│ Vue ensemb. │  │ 📄 Honoraires & facturation [→]│  │              │
│             │  ├────────────────────────────────┤  │              │
│ PROJETS     │  │ 📊 Devis & soumissions      [→]│  │              │
│ • FDGF      │  ├────────────────────────────────┤  │              │
│ ┃ SNCB ✓   │  │ 🕐 Journal de chantier      [→]│  │              │
│ (barre 2px) │  ├────────────────────────────────┤  │              │
│ ARCHIVÉS    │  │ ⚠️  Réserves OPR (0/2)  [Gérer]│  │              │
│             │  └────────────────────────────────┘  │              │
│ User card   │                                       │              │
└─────────────┴──────────────────────────────────────┴──────────────┘
                                                          [● IA]
                                                       brand.500/90%
```

Sidebar : 280px fixe. Panneau droit : 320px fixe. Centre : `flex: 1`.

## Livrables attendus
1. `src/design/tokens.js`
2. `src/components/ui/Button.jsx`
3. `src/components/ui/Badge.jsx`
4. `src/components/ui/Card.jsx`
5. `src/components/ui/Tabs.jsx`
6. `src/components/ui/IconButton.jsx`
7. `src/pages/ProjectDetail.jsx`
8. Un court `README.md` qui explique :
   - Comment les tokens fonctionnent.
   - La règle d'or : `brand.500` est rare et précieux.
   - La règle "un seul CTA primaire visible par zone".

## Contraintes
- Pas d'ajout de dépendance npm. Tout en React + CSS-in-JS inline.
- Pour les icônes : utilise des SVG inline simples (24×24, `strokeWidth: 1.5`, `stroke: 'currentColor'`, `fill: 'none'`). Pas de lucide-react ni autre.
- Accessibilité : `role`, `aria-label` sur les boutons icônes, `tabIndex` cohérent, contraste AA minimum (vérifié : `brand.500` sur blanc = 4.8:1 ✓, `neutral.500` sur blanc = 4.6:1 ✓).
- États de focus visibles : utilise `tokens.shadow.focus` (anneau couleur brand) sur tout élément interactif.
- Code commenté en français quand utile (le projet est francophone).
- Composants en function components avec hooks, pas de classes.

## Approche
Procède dans cet ordre :
1. D'abord `tokens.js` (montre-le moi, je valide la palette en contexte avant que tout en hérite).
2. Puis les composants UI atomiques (Button, Badge, Card, Tabs, IconButton).
3. Enfin la page complète `ProjectDetail.jsx`.

**Arrête-toi après les tokens** pour que je valide avant de continuer.
