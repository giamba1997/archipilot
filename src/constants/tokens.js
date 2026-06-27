// ── Design Tokens ──────────────────────────────────────────
//
// Color usage system:
//   AC  → Primary actions ONLY (CTA buttons, active nav, key focus states)
//   ACL → Soft accent backgrounds (selected card, active tab bg, subtle highlights)
//   ACL2→ Accent borders (selected items, focus rings)
//   TX  → Primary text (headings, body, labels)
//   TX2 → Secondary text (descriptions, metadata, captions)
//   TX3 → Tertiary text (placeholders, disabled labels, timestamps)
//   SB  → Surface background (sidebar, cards, input fields)
//   SB2 → Hover state on surfaces
//   SBB → Borders (cards, dividers, input borders)
//   BG  → Page background
//   WH  → White (card backgrounds, modals)
//
// Orange is used SPARINGLY:
//   ✓ Primary CTA buttons
//   ✓ Active sidebar item indicator (thin left bar, not full bg)
//   ✓ Focus rings on inputs
//   ✓ Badge dots for active states
//   ✗ NOT for large backgrounds
//   ✗ NOT for card fills
//   ✗ NOT for section headers

// ── Core ── (aligné sur la Direction D — src/design/tokens.js)
// Même terracotta de marque (brand.500 #B85C2C) + rampe neutre chaude du
// handoff, pour que le chrome (sidebar/topbar) colle au contenu v2.
export const AC   = "#B85C2C";   // Terracotta brand.500 — CTAs, active states
export const ACL  = "#FDF6F1";   // brand.50 — fonds doux, items sélectionnés
export const ACL2 = "#E8B58E";   // brand.200 — bordures d'accent, focus
export const SB   = "#F5F5F4";   // neutral.100 — surfaces (sidebar, inputs)
export const SB2  = "#EFEDEB";   // surface hover
export const SBB  = "#E7E5E4";   // neutral.200 — bordures
export const TX   = "#1C1917";   // neutral.900 — texte principal
export const TX2  = "#44403C";   // neutral.700 — texte secondaire
export const TX3  = "#78716C";   // neutral.500 — texte tertiaire
export const BG   = "#FAFAF9";   // neutral.50 — fond de page
export const WH   = "#FFFFFF";   // White
export const RD   = "#DC2626";   // Danger / urgent
export const GR   = "#16A34A";   // Success / resolved

// ── Spacing ──
export const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 };

// ── Typography ──
// Rebased per ui-ux-pro-max guidance: minimum 11px for any visible text
// (sub-11 fails contrast/readability tests on chantier with sun glare).
// `base` is the body default at 13px; `lg`/`xl` cover headings.
export const FS = { xs: 11, sm: 12, base: 13, md: 14, lg: 16, xl: 20, xxl: 28 };
export const LH = { tight: "1.2", normal: "1.5", relaxed: "1.65" };

// ── Radius ──
export const RAD = { sm: 6, md: 8, lg: 10, xl: 12, xxl: 14, full: "50%" };

// ── Lifecycle palette (minimaliste) ────────────────────────
// Discipline couleur : les 7 phases sont en NEUTRE chaud — la distinction est
// portée par le label + les step-dots (position), pas par la teinte. SEULE la
// phase active (exécution/chantier) reçoit l'accent terracotta pour signaler
// « c'est là que ça se passe ». Évite l'arc-en-ciel lavande/bleu/pêche/moss.
export const E_LIN_BG       = "#F5F5F4";  // Esquisse — neutral.100
export const E_PRELIM_BG    = "#F5F5F4";  // Avant-projet
export const E_PERMIT_BG    = "#F5F5F4";  // Permis
export const E_PEACH_BG     = "#FDF6F1";  // Exécution / Chantier — brand.50 (phase active)
export const E_BOIS_BG      = "#F5F5F4";  // Réception
export const E_GRAPHITE_BG  = "#E7E5E4";  // Clôturé — neutral.200 (archivé)
export const E_TX_TAUPE     = "#1C1917";  // texte phase — neutral.900 (= TX)
export const E_TX_TAUPE2    = "#1C1917";  // texte phase
export const E_TX_BOIS      = "#1C1917";  // texte phase
export const E_TX_DARK      = "#44403C";  // texte discret (clôturé / brouillon = TX2)

// ── Quick-tools tints (minimaliste : tuiles neutres) ────────
// Discipline couleur : on retire les 4 jewel-tones (bleu/coral/moss/ocre) au
// profit de tuiles neutres + icône neutre. La reconnaissance passe par la
// forme de l'icône, pas par la teinte — moins de bruit, plus de cohérence.
export const QT_DOC_BG     = "#F5F5F4";
export const QT_DOC_FG     = "#78716C";
export const QT_PHOTO_BG   = "#F5F5F4";
export const QT_PHOTO_FG   = "#78716C";
export const QT_PLAN_BG    = "#F5F5F4";
export const QT_PLAN_FG    = "#78716C";
export const QT_LIST_BG    = "#F5F5F4";
export const QT_LIST_FG    = "#78716C";

// ── Semantic colors (vivid — must function as traffic lights) ─────
export const SG     = "#166534";  // success.fg — résolu / levée
export const SGB    = "#DCFCE7";  // success bg
export const BR     = "#DC2626";  // danger — urgent (distinct de l'accent terracotta)
export const BRB    = "#FEE2E2";  // danger bg
export const AM     = "#B45309";  // warning — en cours / partielle / à relire
export const AMB    = "#FEF3C7";  // warning bg
export const ST     = "#1E40AF";  // info.fg — envoyé / minor
export const STB    = "#DBEAFE";  // info bg

// ── Legacy / lot color picker (still used for user-customisable lots) ──
// Kept for the lot color picker UI; sober variants closer to the new palette.
export const BL   = "#5A7A8F";   // steel blue (was bright #3B82F6)
export const BLB  = "#E2E8EE";
export const OR   = "#B85C2C";   // terracotta brand (= AC)
export const ORB  = "#FDF6F1";
export const VI   = "#7E6D8A";   // violet désaturé (was #7C3AED)
export const VIB  = "#E9E5EE";
export const TE   = "#6B8B8E";   // teal sourd (was #0891B2)
export const TEB  = "#E2EAEB";
export const PU   = "#8A6E80";   // mauve sourd (was #A855F7)
export const PUB  = "#EBE3E7";
export const GRY  = "#78716C";   // neutral.500
export const GRYB = "#F5F5F4";   // neutral.100
export const REDBG  = "#FEF2F2"; // danger bg
export const REDBRD = "#FECACA"; // danger border
export const GRBG   = "#F0FDF4"; // success bg
export const DIS    = "#E7E5E4"; // disabled — neutral.200
export const DIST   = "#A8A29E"; // disabled text
