import { tokens } from "../../../design/tokens";

// ── Badge — composant atomique ──────────────────────────────
//
// 5 variants sémantiques exclusifs. Un seul système, pas de couleurs
// ad-hoc — toute exception introduit de la dette visuelle.
//
// Convention sémantique stricte :
//   neutral — état passif, catégorie, métadonnée (ex: "10 PV", "1 projet")
//   info    — phase / étape informationnelle (ex: "Esquisse", "Permis")
//   success — état accompli (ex: "Payée", "Levée", "Octroyé")
//   warning — vigilance (ex: "Passée 3j", "Échéance proche")
//   danger  — alerte (ex: "Refusé", "En retard", "Critique")
//
// Pour "Clôturé" on utilise neutral (état terminal sans signal d'urgence).
//
// Props :
//   variant  "neutral" | "info" | "success" | "warning" | "danger"  (défaut "neutral")
//   dot      boolean — affiche un petit point coloré devant le label
//   children label (string ou number)

const VARIANT_STYLES = {
  neutral: {
    background: tokens.color.neutral[100],
    color:      tokens.color.neutral[700],
    border:     `1px solid ${tokens.color.neutral[200]}`,
    dot:        tokens.color.neutral[500],
  },
  info: {
    background: tokens.color.semantic.info.bg,
    color:      tokens.color.semantic.info.fg,
    border:     `1px solid ${tokens.color.semantic.info.border}`,
    dot:        tokens.color.semantic.info.fg,
  },
  success: {
    background: tokens.color.semantic.success.bg,
    color:      tokens.color.semantic.success.fg,
    border:     `1px solid ${tokens.color.semantic.success.border}`,
    dot:        tokens.color.semantic.success.fg,
  },
  warning: {
    background: tokens.color.semantic.warning.bg,
    color:      tokens.color.semantic.warning.fg,
    border:     `1px solid ${tokens.color.semantic.warning.border}`,
    dot:        tokens.color.semantic.warning.fg,
  },
  danger: {
    background: tokens.color.semantic.danger.bg,
    color:      tokens.color.semantic.danger.fg,
    border:     `1px solid ${tokens.color.semantic.danger.border}`,
    dot:        tokens.color.semantic.danger.fg,
  },
};

export function Badge({ variant = "neutral", dot = false, children, ...rest }) {
  const style = VARIANT_STYLES[variant] || VARIANT_STYLES.neutral;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: dot ? tokens.space[1] : 0,
        padding: `2px ${tokens.space[2]}`,
        background: style.background,
        color: style.color,
        border: style.border,
        borderRadius: tokens.radius.full,
        fontFamily: tokens.font.family,
        fontSize: tokens.font.size.xs,
        fontWeight: tokens.font.weight.medium,
        lineHeight: 1.4,
        whiteSpace: "nowrap",
      }}
      {...rest}
    >
      {dot && (
        <span
          aria-hidden="true"
          style={{
            width: 6,
            height: 6,
            borderRadius: tokens.radius.full,
            background: style.dot,
            flexShrink: 0,
          }}
        />
      )}
      {children}
    </span>
  );
}

export default Badge;
