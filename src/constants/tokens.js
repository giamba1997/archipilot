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
export const AC   = "#C95A1B";   // Primary orange — CTAs, active states, key actions
export const ACL  = "#F4E4D8";   // Soft orange bg — selected items, subtle highlights
export const ACL2 = "#E8CCBA";   // Accent border — focus rings, selected borders
export const SB   = "#F7F7F5";   // Surface (sidebar, inputs, subtle bg)
export const SB2  = "#EEEEEB";   // Surface hover
export const SBB  = "#E5E7EB";   // Borders (neutral grey, not warm)
export const TX   = "#1F2937";   // Primary text (dark grey, not pure black)
export const TX2  = "#6B7280";   // Secondary text
export const TX3  = "#9CA3AF";   // Tertiary text (placeholders, timestamps)
export const BG   = "#FAFAF9";   // Page background
export const WH   = "#FFFFFF";   // White
export const RD   = "#DC2626";   // Danger / urgent
export const GR   = "#16A34A";   // Success / resolved

// ── Spacing ──
export const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 };

// ── Typography ──
export const FS = { xs: 10, sm: 11, base: 12, md: 13, lg: 15, xl: 18, xxl: 22 };
export const LH = { tight: "1.2", normal: "1.4", relaxed: "1.6" };

// ── Radius ──
export const RAD = { sm: 6, md: 8, lg: 10, xl: 12, xxl: 14, full: "50%" };

// ── Status accent colors (muted, not saturated) ──
export const BL   = "#3B82F6";   // Blue (permis, envoyé)
export const BLB  = "#EFF6FF";   // Blue light bg
export const OR   = "#EA580C";   // Orange vif (chantier)
export const ORB  = "#FFF7ED";   // Orange light bg
export const VI   = "#7C3AED";   // Violet (avant-projet)
export const VIB  = "#F5F3FF";   // Violet light bg
export const TE   = "#0891B2";   // Teal (technique)
export const TEB  = "#ECFEFF";   // Teal light bg
export const PU   = "#A855F7";   // Purple (esquisse)
export const PUB  = "#FAF5FF";   // Purple light bg
export const GRY  = "#6B7280";   // Grey (clôturé)
export const GRYB = "#F3F4F6";   // Grey light bg
export const REDBG  = "#FEF2F2"; // Danger bg
export const REDBRD = "#FECACA"; // Danger border
export const GRBG   = "#F0FDF4"; // Success bg
export const DIS    = "#D1D5DB"; // Disabled bg
export const DIST   = "#9CA3AF"; // Disabled text
