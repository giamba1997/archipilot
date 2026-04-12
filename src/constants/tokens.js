// ── Design Tokens — Mid-Century Modern Palette ─────────────
//
// Base:    Clean neutrals (white, warm greys, beige)
// Primary: Burnt orange #D65A1F (buttons, CTAs, active states)
// Text:    Dark brown #4A3428 (headings, primary text)
//
// Accents used sparingly for status, charts, phases:
//   Yellow #E7A33C · Green #6F8F7A · Beige #EAD8C0
//   Muted blue #5B7B8A · Muted plum #8B6F7E · Terracotta #C4704F

// ── Core colors ──
export const AC   = "#D65A1F";   // Primary orange (CTAs, active, brand)
export const ACL  = "#FBF0E8";   // Primary light bg
export const ACL2 = "#F5DFD0";   // Primary light border
export const SB   = "#F8F6F3";   // Sidebar / subtle background (warm grey)
export const SB2  = "#EFECE7";   // Sidebar hover
export const SBB  = "#E3DED6";   // Borders (warm)
export const TX   = "#4A3428";   // Primary text (dark brown)
export const TX2  = "#7A6B62";   // Secondary text
export const TX3  = "#8C7E75";   // Tertiary text (WCAG AA on SB)
export const BG   = "#FAFAF7";   // Page background (warm white)
export const WH   = "#FFFFFF";   // White
export const RD   = "#B8433A";   // Danger / urgent (muted red)
export const GR   = "#6F8F7A";   // Success / resolved (mid-century green)

// ── Spacing scale (base 4px) ──
export const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 };

// ── Typography scale ──
export const FS = { xs: 10, sm: 11, base: 12, md: 13, lg: 15, xl: 18, xxl: 22 };
export const LH = { tight: "1.2", normal: "1.4", relaxed: "1.6" };

// ── Radius scale ──
export const RAD = { sm: 6, md: 8, lg: 10, xl: 12, xxl: 14, full: "50%" };

// ── Phase / Status accent colors ──
export const BL   = "#5B7B8A";   // Muted blue (permis, versions)
export const BLB  = "#EBF1F4";   // Blue light bg
export const OR   = "#C4704F";   // Terracotta (chantier)
export const ORB  = "#FAF0EB";   // Terracotta light bg
export const VI   = "#8B6F7E";   // Muted plum (avant-projet)
export const VIB  = "#F3EEF1";   // Plum light bg
export const TE   = "#5B8A7A";   // Teal-green
export const TEB  = "#ECF4F1";   // Teal light bg
export const PU   = "#9B8A6E";   // Warm taupe (esquisse)
export const PUB  = "#F5F1EB";   // Taupe light bg
export const GRY  = "#8C7E75";   // Neutral brown-grey (clôturé)
export const GRYB = "#F2EFE9";   // Grey light bg
export const REDBG  = "#FDF2F1"; // Danger bg
export const REDBRD = "#F5D0CC"; // Danger border
export const GRBG   = "#EDF4EF"; // Success bg (green tint)
export const DIS    = "#D6D1C9"; // Disabled bg
export const DIST   = "#A09889"; // Disabled text
