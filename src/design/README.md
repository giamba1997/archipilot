# Design system v2 — ArchiPilot

Ce dossier contient la **source de vérité** du nouveau système visuel.
Toute valeur (couleur, espacement, typo, radius, ombre, transition)
utilisée par les composants `src/components/ui/v2/*` et les pages
`src/pages/*` est définie ici.

## Architecture

```
src/design/
  tokens.js          # ★ La source de vérité — n'écrire de valeur en dur nulle part ailleurs
  README.md          # Ce fichier

src/components/ui/v2/
  Button.jsx
  Badge.jsx
  Card.jsx
  Tabs.jsx
  IconButton.jsx
```

**Cohabitation** : `src/design/tokens.js` (v2) vit en parallèle de
`src/constants/tokens.js` (système historique, palette earth). Les
composants v2 importent depuis `src/design/`. Les composants historiques
continuent avec `src/constants/`. Aucune migration forcée à ce stade —
elle viendra une fois la v2 validée en intégration.

## Les 3 règles essentielles

### 1. La règle d'or — `brand.500` est rare et précieux

`brand.500` (`#B85C2C`) est la couleur d'identité d'ArchiPilot. Son
usage est **strictement limité** à :

- Le logo ArchiPilot.
- **UN SEUL CTA primaire** visible par zone fonctionnelle (ex : un
  bouton "Préparer le PV n°11" sur la page projet — c'est l'unique
  `<Button variant="primary">` de toute la zone visible).
- L'indicateur d'élément actif (barre fine 2px sous un onglet ou à
  gauche d'un item de sidebar — pas de fond plein).
- L'icône du FAB assistant IA (à venir dans un prompt ultérieur).

**Ne pas utiliser pour** : les boutons secondaires (Modifier, Ouvrir,
Gérer, etc.), les fonds de cards, les badges de statut, les liens
textuels.

Cette discipline est ce qui distingue un produit "design SaaS"
générique d'un outil métier où l'utilisateur passe ses journées
sans saturation visuelle. Tester la règle : si tu vois `brand.500`
plus d'**une fois** au scroll initial d'une page, il y a un problème.

### 2. Une seule action primaire visible par zone

Corollaire de la règle 1. Sur chaque écran, il y a UNE chose que
l'utilisateur doit faire en priorité. C'est cette action qui est en
`<Button variant="primary">`. Toutes les autres actions, même
utiles, sont en `secondary` ou `ghost`.

Exemple page projet Résumé :
- ✅ "Démarrer" (préparer le PV n°11) → `primary`
- ✅ "Ouvrir" (Honoraires, Devis, Journal), "Gérer" (Réserves),
  "Modifier" (Réunion), "Démarrer une session" (Suivi temps) → `secondary`

Le test : si plusieurs primaires sont visibles à la fois, l'utilisateur
ne sait plus laquelle est *la* prochaine action.

### 3. Sémantique pour les statuts, pas brand

Les badges de statut utilisent les couleurs `semantic.*` (info, success,
warning, danger). Jamais `brand.*`.

| Badge                  | Variant   |
| ---------------------- | --------- |
| "Esquisse"             | `info`    |
| "Permis"               | `info`    |
| "Octroyé", "Payée"     | `success` |
| "Passée 3j", "Proche"  | `warning` |
| "Refusé", "En retard"  | `danger`  |
| "Clôturé", "10 PV"     | `neutral` |

Rationale : les utilisateurs reconnaissent les couleurs sémantiques
(rouge = problème, ambre = vigilance, vert = OK) immédiatement, sans
avoir à mémoriser un mapping interne au produit.

## Utilisation pratique

```jsx
import { tokens } from "@/design/tokens";
import { Button } from "@/components/ui/v2/Button";
import { Badge } from "@/components/ui/v2/Badge";
import { Card } from "@/components/ui/v2/Card";

// Toujours via tokens — jamais de hex en dur
<div style={{
  padding: tokens.space[4],
  background: tokens.color.neutral[0],
  borderRadius: tokens.radius.lg,
}}>
  <Button variant="primary">Démarrer</Button>
  <Badge variant="warning" dot>Passée 3j</Badge>
</div>
```

## Tester la nouvelle page projet

Pendant la phase de cohabitation, la nouvelle page projet est
accessible via l'URL `/p/<id>` (ex : `http://localhost:3000/p/1`).

- `/` → page projet historique (Overview)
- `/p/<n'importe quoi>` → nouvelle page projet (ProjectDetail v2)

Le sidebar et la topbar restent inchangés (ils seront refondus dans
un prompt ultérieur).

## Échelle des tokens

| Catégorie     | Échelle                                     |
| ------------- | ------------------------------------------- |
| `space`       | 1 (4px) → 12 (48px), multiples de 4         |
| `radius`      | sm 6 / md 8 / lg 12 / xl 16 / full 999      |
| `font.size`   | xs 12 → 3xl 32, ratio ~1.125                |
| `font.weight` | regular 400 / medium 500 / semibold 600 / bold 700 |
| `transition`  | fast 100ms / base 150ms / slow 250ms        |

## Évolution

Avant d'ajouter une valeur (nouvelle teinte, nouvelle taille, etc.) :

1. Regarder si une valeur existante couvre le besoin (90 % des cas).
2. Si non, vérifier que c'est un manque structurel (pas un cas isolé).
3. Ajouter la valeur dans `tokens.js` avec un commentaire de rôle.
4. Documenter ici si la règle évolue.

L'objectif est de garder ce système **minimal et discipliné**. Un
design system qui grossit sans contrôle finit par ne plus contraindre
les choix — il devient juste un catalogue de tout.
