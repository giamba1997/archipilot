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

// ── Core ──
export const AC   = "#C05A2C";   // Terracotta — CTAs, active states, key actions
export const ACL  = "#FAF0EA";   // Soft terracotta bg — selected items, subtle highlights
export const ACL2 = "#F0DDD0";   // Accent border — focus rings, selected borders
export const SB   = "#F8F7F4";   // Surface (sidebar, inputs, subtle bg) — warm
export const SB2  = "#F0EFEB";   // Surface hover — warm
export const SBB  = "#E2E0DB";   // Borders (warm grey)
export const TX   = "#2C2926";   // Primary text (warm dark brown)
export const TX2  = "#6B6862";   // Secondary text (warm grey)
export const TX3  = "#A09D96";   // Tertiary text (warm placeholders)
export const BG   = "#FAFAF8";   // Page background — slightly warm
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
export const E_LIN_BG       = "#EFEDE9";  // Esquisse — neutre chaud
export const E_PRELIM_BG    = "#EFEDE9";  // Avant-projet — neutre chaud
export const E_PERMIT_BG    = "#EFEDE9";  // Permis — neutre chaud
export const E_PEACH_BG     = "#FAF0EA";  // Exécution / Chantier — accent terracotta doux
export const E_BOIS_BG      = "#EFEDE9";  // Réception — neutre chaud
export const E_GRAPHITE_BG  = "#E7E5E0";  // Clôturé — neutre un peu plus gris (archivé)
export const E_TX_TAUPE     = "#2C2926";  // texte phase — neutre foncé (= TX)
export const E_TX_TAUPE2    = "#2C2926";  // texte phase — neutre foncé
export const E_TX_BOIS      = "#2C2926";  // texte phase — neutre foncé
export const E_TX_DARK      = "#6B6862";  // texte discret (clôturé / brouillon = TX2)

// ── Quick-tools tints (minimaliste : tuiles neutres) ────────
// Discipline couleur : on retire les 4 jewel-tones (bleu/coral/moss/ocre) au
// profit de tuiles neutres + icône neutre. La reconnaissance passe par la
// forme de l'icône, pas par la teinte — moins de bruit, plus de cohérence.
export const QT_DOC_BG     = "#F0EFEB";
export const QT_DOC_FG     = "#6B6862";
export const QT_PHOTO_BG   = "#F0EFEB";
export const QT_PHOTO_FG   = "#6B6862";
export const QT_PLAN_BG    = "#F0EFEB";
export const QT_PLAN_FG    = "#6B6862";
export const QT_LIST_BG    = "#F0EFEB";
export const QT_LIST_FG    = "#6B6862";

// ── Semantic colors (vivid — must function as traffic lights) ─────
export const SG     = "#5A8C3F";  // grass green — résolu / levée
export const SGB    = "#E2EDD3";  // grass bg
export const BR     = "#D2362A";  // rouge urgent — distinct de l'accent terracotta (AC)
                                  // pour ne pas confondre statut urgent et bouton d'action
export const BRB    = "#F8DCCF";  // brick bg
export const AM     = "#C0791A";  // amber — en cours / partielle / à relire
export const AMB    = "#F8E5BD";  // amber bg
export const ST     = "#3A7396";  // blueprint blue — envoyé / minor
export const STB    = "#D6E1EB";  // blueprint bg

// ── Legacy / lot color picker (still used for user-customisable lots) ──
// Kept for the lot color picker UI; sober variants closer to the new palette.
export const BL   = "#5A7A8F";   // steel blue (was bright #3B82F6)
export const BLB  = "#E2E8EE";
export const OR   = "#C05A2C";   // terracotta (collapsed onto AC family)
export const ORB  = "#F5E1D2";
export const VI   = "#7E6D8A";   // violet désaturé (was #7C3AED)
export const VIB  = "#E9E5EE";
export const TE   = "#6B8B8E";   // teal sourd (was #0891B2)
export const TEB  = "#E2EAEB";
export const PU   = "#8A6E80";   // mauve sourd (was #A855F7)
export const PUB  = "#EBE3E7";
export const GRY  = "#6B6862";   // graphite chaud (was #6B7280 cold grey)
export const GRYB = "#EAE7E1";
export const REDBG  = "#F4E1DB"; // brique bg
export const REDBRD = "#E0BFB4"; // brique border (subtle)
export const GRBG   = "#EAEDE3"; // sauge bg
export const DIS    = "#D6D2C9"; // disabled — warm
export const DIST   = "#A09D96"; // disabled text — warm
