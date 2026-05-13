// ─────────────────────────────────────────────────────────────
// Design tokens — ArchiPilot v2
//
// Source de vérité unique pour la nouvelle identité visuelle. Tout
// composant `src/components/ui/v2/*` et page `src/pages/*` importe
// depuis ce fichier. Aucune valeur numérique de couleur, taille,
// padding ou typo ne doit être écrite en dur dans les composants.
//
// Cohabitation : ce fichier vit en PARALLÈLE de `src/constants/tokens.js`
// (le système earth-palette historique). Les anciens composants
// continuent d'utiliser l'ancien fichier ; tout ce qui est créé sous
// `v2/` utilise celui-ci. À terme, une migration consolidera les deux.
//
// ── La règle d'or — `brand.500` est rare et précieux ──
//
// `brand.500` (#B85C2C, terracotta désaturé) est la couleur d'identité
// d'ArchiPilot. Elle ne doit JAMAIS être utilisée comme :
//   - fond de card ou de bloc large,
//   - fond de bouton secondaire,
//   - couleur de badge de statut générique.
//
// Elle est réservée à :
//   1. Le logo ArchiPilot.
//   2. UN SEUL CTA primaire visible par zone fonctionnelle.
//   3. L'indicateur d'élément actif (barre fine 2px, pas de fond plein).
//   4. L'icône du FAB assistant IA.
//
// Les fonds doux dérivés (`brand.50`, `brand.100`) sont utilisables
// plus largement pour des accents subtils — voir commentaires inline.
//
// ── 90% neutre, 10% accent ──
//
// Les surfaces, bordures, textes et états passifs utilisent la rampe
// `neutral.*`. Une page projet bien designée doit pouvoir se rendre
// quasiment sans `brand.*` : c'est la présence rare qui donne sa valeur
// à la couleur de marque.
//
// ── Pour les statuts, badges, alertes : `semantic.*` ──
//
// "Esquisse" → info (bleu), "Passée 3j" → warning (ambre), pas brand.
// Cette discipline garantit que les utilisateurs lisent les statuts
// par leur sémantique (couleur familière) et non par mémorisation.
//
// ── Rôles stricts de `brand.400` et `brand.600` ──
//
// `brand.600` (#A04C20) :
//   → HOVER du CTA primaire UNIQUEMENT.
//   → NE PAS l'utiliser comme "deuxième primaire" pour des cas
//     intermédiaires. Si un bouton doit être moins fort, c'est un
//     secondary (fond blanc, bordure neutral.200) — pas un brand.600.
//
// `brand.400` (#D17A47) :
//   AUTORISÉ :
//   → Icône et anneau du FAB assistant IA (le distingue d'un CTA dur).
//   → Accents graphiques décoratifs : étoiles, sparkles, illustrations
//     d'états vides.
//   INTERDIT :
//   → Couleur de texte (texte courant ou label).
//   → Bordure d'élément interactif (input, bouton, card).
//   → Fond de bouton, quel que soit le variant.
// ─────────────────────────────────────────────────────────────

export const tokens = {
  color: {
    // ── IDENTITÉ — Terracotta authentique (désaturé, terreux) ──
    // L'évolution depuis l'orange SaaS générique (#C2410C) vers ce
    // terracotta plus mat (#B85C2C) répond à un usage quotidien et
    // prolongé : la saturation excessive fatigue l'œil sur la durée.
    // La nouvelle teinte évoque la terre cuite (matériau d'architecture)
    // plutôt qu'un signal de notification.
    brand: {
      50:  "#FDF6F1",  // Fond très clair — hover discret, fond de tab actif tinté
      100: "#F5DCC9",  // Fond clair — badge warning custom, avatar utilisateur
      200: "#E8B58E",  // Bordure d'accent — focus ring secondaire, séparateur tinté
      400: "#D17A47",  // Accent décoratif — FAB IA + sparkles (cf. rôles stricts)
      500: "#B85C2C",  // ★ CTA PRIMAIRE — réservé (cf. règle d'or ci-dessus)
      600: "#A04C20",  // Hover du CTA primaire UNIQUEMENT (cf. rôles stricts)
      700: "#8B3A14",  // Texte sur fond brand-50, état pressed du primaire
      900: "#5A2509",  // Texte fort sur fond brand-100, contrastes max
    },

    // ── NEUTRES — 90% des surfaces ──
    // Rampe chaude (warm grey) cohérente avec l'identité terre cuite.
    // Les valeurs intermédiaires (300, 500) servent à hiérarchiser sans
    // alourdir : `neutral.500` pour les métadonnées et icônes passives,
    // `neutral.700` pour le texte courant, `neutral.900` pour les titres.
    neutral: {
      0:   "#FFFFFF",  // Surfaces actives (cards, modals, popovers)
      50:  "#FAFAF9",  // Fond de l'app
      100: "#F5F5F4",  // Sidebar, panneau droit, zones secondaires
      200: "#E7E5E4",  // Bordures par défaut
      300: "#D6D3D1",  // Bordures hover, séparateurs forts
      500: "#78716C",  // Texte secondaire, icônes passives, placeholders
      700: "#44403C",  // Texte courant
      900: "#1C1917",  // Titres, texte fort, contrastes max
    },

    // ── SÉMANTIQUE — badges, alertes, statuts ──
    // 4 familles couvrent 100% des besoins de signalement. Chaque famille
    // a un trio { bg, fg, border } pour rendre les badges directement —
    // pas besoin de calculer des opacités à la volée.
    //
    // Convention d'usage :
    //   info    — neutre informationnel (phase "Esquisse", tag de catégorie)
    //   success — état accompli (paiement reçu, réserve levée, validation)
    //   warning — vigilance (échéance proche, action requise sans urgence)
    //   danger  — alerte (en retard, refusé, erreur)
    semantic: {
      info:    { bg: "#EFF6FF", fg: "#1E40AF", border: "#BFDBFE" },
      success: { bg: "#F0FDF4", fg: "#166534", border: "#BBF7D0" },
      warning: { bg: "#FFFBEB", fg: "#92400E", border: "#FDE68A" },
      danger:  { bg: "#FEF2F2", fg: "#991B1B", border: "#FECACA" },
    },
  },

  // ── ESPACEMENTS — échelle multiplicateur de 4px ──
  // L'échelle est continue pour les cas courants (1–6) puis saute pour
  // les espaces plus larges (8, 10, 12). Pas de demi-valeurs : si tu
  // ressens le besoin d'un "3.5", c'est probablement que la hiérarchie
  // visuelle n'est pas claire.
  space: {
    1:  "4px",
    2:  "8px",
    3:  "12px",
    4:  "16px",
    5:  "20px",
    6:  "24px",
    8:  "32px",
    10: "40px",
    12: "48px",
  },

  // ── RAYONS DE BORDURE ──
  // `sm` pour les inputs et petits boutons, `md` par défaut, `lg` pour
  // les cards, `xl` pour les modales, `full` pour les badges et pills.
  radius: {
    sm:   "6px",
    md:   "8px",
    lg:   "12px",
    xl:   "16px",
    full: "999px",
  },

  // ── TYPOGRAPHIE ──
  // Inter en système font stack par défaut. Sizes en échelle modulaire
  // proche du ratio mineur seconde (1.125) pour rester lisible à toutes
  // les densités. Pas de fontFamily alternative : un seul caractère
  // typographique pour toute l'app, hiérarchisation par poids + taille.
  font: {
    family: "'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    size: {
      xs:   "12px",  // Métadonnées, captions, labels secondaires
      sm:   "13px",  // Texte courant des cards denses
      base: "14px",  // Body par défaut
      md:   "15px",  // Titres de cards
      lg:   "17px",  // Sous-titres de page
      xl:   "20px",  // Titres de section
      "2xl":"24px",  // Titre de page (nom du projet)
      "3xl":"32px",  // Hero — réservé aux landings / onboarding
    },
    weight: {
      regular:  400,
      medium:   500,
      semibold: 600,
      bold:     700,
    },
    leading: {
      tight:   1.2,  // Titres et chiffres
      normal:  1.5,  // Body
      relaxed: 1.7,  // Paragraphes longs, descriptions
    },
  },

  // ── OMBRES ──
  // Volontairement discrètes — l'app est plutôt "flat with care" qu'un
  // skeumorphisme. L'ombre `focus` utilise la couleur brand pour signaler
  // l'élément actif au clavier (a11y) — aspect identitaire + utilitaire.
  shadow: {
    none:  "none",
    sm:    "0 1px 2px rgba(28, 25, 23, 0.04)",
    md:    "0 2px 8px rgba(28, 25, 23, 0.06)",
    focus: "0 0 0 3px rgba(184, 92, 44, 0.35)",  // Anneau brand pour focus visible (WCAG 2.4.11)
    // Card prioritaire ("À faire", éléments mis en avant) — élévation
    // tintée brand, très subtile. Combinée avec une bordure latérale
    // `brand.500` 3px sur Card(priority), elle signale l'importance sans
    // virer au "fond brand plein" qui violerait la règle d'or.
    priority: "0 2px 8px rgba(184, 92, 44, 0.08)",
  },

  // ── TRANSITIONS ──
  // 100ms pour les interactions tactiles (hover, press), 150ms pour
  // les changements d'état UI, 250ms pour les animations de layout.
  // Au-delà de 250ms, l'utilisateur perçoit la latence — à éviter.
  transition: {
    fast: "all 100ms ease",
    base: "all 150ms ease",
    slow: "all 250ms ease",
  },
};

// ─────────────────────────────────────────────────────────────
// Export par défaut pour permettre `import tokens from '...'`
// en plus de l'import nommé `import { tokens } from '...'`. Les deux
// formes sont équivalentes et acceptables — préférer la forme nommée
// pour rester explicite.
// ─────────────────────────────────────────────────────────────
export default tokens;
