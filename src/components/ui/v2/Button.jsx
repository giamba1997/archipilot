import { forwardRef, useState } from "react";
import { tokens } from "../../../design/tokens";

// ── Button — composant atomique ─────────────────────────────
//
// 4 variants × 3 tailles. Le seul à utiliser brand.500 est `primary`.
// Tous les autres restent en neutres pour respecter la règle d'or
// (un seul CTA primaire visible par zone fonctionnelle).
//
// Hover et pressed sont gérés en local via React state (pas de :hover
// CSS) pour rester en CSS-in-JS inline cohérent avec le reste du projet.
//
// Props :
//   variant   "primary" | "secondary" | "ghost" | "icon"  (défaut "secondary")
//   size      "sm" | "md" | "lg"                          (défaut "md")
//   leftIcon  ReactNode — SVG ou autre, rendu à gauche du label
//   rightIcon ReactNode — pareil à droite
//   disabled  boolean
//   fullWidth boolean — étend à 100% du conteneur
//   onClick   handler
//   children  label
//   ...rest   forwardé au <button> (type, aria-*, etc.)

const SIZE_CONFIG = {
  sm: {
    height: 28,
    paddingX: tokens.space[2],
    fontSize: tokens.font.size.xs,
    iconGap: tokens.space[1],
    radius: tokens.radius.sm,
  },
  md: {
    height: 36,
    paddingX: tokens.space[3],
    fontSize: tokens.font.size.sm,
    iconGap: tokens.space[2],
    radius: tokens.radius.md,
  },
  lg: {
    height: 44,
    paddingX: tokens.space[4],
    fontSize: tokens.font.size.base,
    iconGap: tokens.space[2],
    radius: tokens.radius.md,
  },
};

// Définition des couleurs par variant. Chaque variant déclare 4 états :
// base, hover, pressed, disabled. Le focus est géré via shadow.focus.
const VARIANT_CONFIG = {
  primary: {
    base:     { background: tokens.color.brand[500], color: tokens.color.neutral[0],   border: "1px solid transparent" },
    hover:    { background: tokens.color.brand[600], color: tokens.color.neutral[0],   border: "1px solid transparent" },
    pressed:  { background: tokens.color.brand[700], color: tokens.color.neutral[0],   border: "1px solid transparent" },
    disabled: { background: tokens.color.neutral[200], color: tokens.color.neutral[500], border: "1px solid transparent" },
  },
  secondary: {
    base:     { background: tokens.color.neutral[0],   color: tokens.color.neutral[700], border: `1px solid ${tokens.color.neutral[200]}` },
    hover:    { background: tokens.color.neutral[50],  color: tokens.color.neutral[900], border: `1px solid ${tokens.color.neutral[300]}` },
    pressed:  { background: tokens.color.neutral[100], color: tokens.color.neutral[900], border: `1px solid ${tokens.color.neutral[300]}` },
    disabled: { background: tokens.color.neutral[0],   color: tokens.color.neutral[500], border: `1px solid ${tokens.color.neutral[200]}` },
  },
  ghost: {
    // Pas de fond ni bordure au repos — utile dans les barres d'outils
    // pour ne pas charger visuellement. Le hover révèle un fond léger.
    base:     { background: "transparent",            color: tokens.color.neutral[700], border: "1px solid transparent" },
    hover:    { background: tokens.color.neutral[100], color: tokens.color.neutral[900], border: "1px solid transparent" },
    pressed:  { background: tokens.color.neutral[200], color: tokens.color.neutral[900], border: "1px solid transparent" },
    disabled: { background: "transparent",            color: tokens.color.neutral[500], border: "1px solid transparent" },
  },
  icon: {
    // Variant "icon" = carré sans label, juste un glyphe. Reste sobre
    // (neutres) — pour un icon button avec accent fort, créer un wrapper
    // dédié au cas par cas plutôt qu'un 5ème variant générique.
    base:     { background: "transparent",            color: tokens.color.neutral[500], border: "1px solid transparent" },
    hover:    { background: tokens.color.neutral[100], color: tokens.color.neutral[900], border: "1px solid transparent" },
    pressed:  { background: tokens.color.neutral[200], color: tokens.color.neutral[900], border: "1px solid transparent" },
    disabled: { background: "transparent",            color: tokens.color.neutral[300], border: "1px solid transparent" },
  },
};

export const Button = forwardRef(function Button(
  {
    variant = "secondary",
    size = "md",
    leftIcon,
    rightIcon,
    disabled = false,
    fullWidth = false,
    onClick,
    children,
    ...rest
  },
  ref,
) {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);

  const sizeCfg = SIZE_CONFIG[size] || SIZE_CONFIG.md;
  const variantCfg = VARIANT_CONFIG[variant] || VARIANT_CONFIG.secondary;
  const state = disabled ? "disabled" : pressed ? "pressed" : hover ? "hover" : "base";
  const stateStyle = variantCfg[state];

  const isIconOnly = variant === "icon" || (!children && (leftIcon || rightIcon));

  return (
    <button
      ref={ref}
      type={rest.type || "button"}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      style={{
        ...stateStyle,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: children ? sizeCfg.iconGap : 0,
        height: sizeCfg.height,
        padding: isIconOnly ? 0 : `0 ${sizeCfg.paddingX}`,
        width: isIconOnly ? sizeCfg.height : fullWidth ? "100%" : "auto",
        fontFamily: tokens.font.family,
        fontSize: sizeCfg.fontSize,
        fontWeight: tokens.font.weight.medium,
        lineHeight: 1,
        borderRadius: sizeCfg.radius,
        cursor: disabled ? "not-allowed" : "pointer",
        outline: "none",
        boxShadow: focused && !disabled ? tokens.shadow.focus : "none",
        transition: tokens.transition.base,
        userSelect: "none",
        whiteSpace: "nowrap",
      }}
      {...rest}
    >
      {leftIcon}
      {children}
      {rightIcon}
    </button>
  );
});

export default Button;
