import { forwardRef, useState } from "react";
import { tokens } from "../../../design/tokens";

// ── IconButton — bouton icône-seule ────────────────────────
//
// Spécialisé pour les barres d'actions où le label texte serait du bruit
// (header, toolbar de card, ligne d'item répétée). Pour un bouton avec
// icône ET label, utiliser `<Button leftIcon={...}>` à la place.
//
// L'aria-label est OBLIGATOIRE — un icon-only button sans label est
// inaccessible par lecteur d'écran. Le composant warn en console si
// omis (dev only — n'apparaît pas en prod).
//
// Variants :
//   ghost   — pas de fond ni bordure, hover bg neutral.100  (défaut)
//   filled  — fond neutral.100, hover neutral.200
//   outline — bordure neutral.200, fond blanc
//
// Sizes :
//   sm — 28×28 (toolbars denses, lignes d'items)
//   md — 32×32 (toolbars standards)               (défaut)
//   lg — 40×40 (FAB, actions principales)
//
// Props :
//   variant     "ghost" | "filled" | "outline"   (défaut "ghost")
//   size        "sm" | "md" | "lg"               (défaut "md")
//   label       aria-label OBLIGATOIRE
//   disabled    boolean
//   onClick     handler
//   children    SVG ou autre glyphe — pas de label texte ici

const SIZE_CONFIG = {
  sm: { dimension: 28, iconSize: 14, radius: tokens.radius.sm },
  md: { dimension: 32, iconSize: 16, radius: tokens.radius.md },
  lg: { dimension: 40, iconSize: 20, radius: tokens.radius.md },
};

const VARIANT_CONFIG = {
  ghost: {
    base:     { background: "transparent",            border: "1px solid transparent",                color: tokens.color.neutral[500] },
    hover:    { background: tokens.color.neutral[100], border: "1px solid transparent",                color: tokens.color.neutral[900] },
    pressed:  { background: tokens.color.neutral[200], border: "1px solid transparent",                color: tokens.color.neutral[900] },
    disabled: { background: "transparent",            border: "1px solid transparent",                color: tokens.color.neutral[300] },
  },
  filled: {
    base:     { background: tokens.color.neutral[100], border: "1px solid transparent",                color: tokens.color.neutral[700] },
    hover:    { background: tokens.color.neutral[200], border: "1px solid transparent",                color: tokens.color.neutral[900] },
    pressed:  { background: tokens.color.neutral[300], border: "1px solid transparent",                color: tokens.color.neutral[900] },
    disabled: { background: tokens.color.neutral[100], border: "1px solid transparent",                color: tokens.color.neutral[300] },
  },
  outline: {
    base:     { background: tokens.color.neutral[0],   border: `1px solid ${tokens.color.neutral[200]}`, color: tokens.color.neutral[700] },
    hover:    { background: tokens.color.neutral[50],  border: `1px solid ${tokens.color.neutral[300]}`, color: tokens.color.neutral[900] },
    pressed:  { background: tokens.color.neutral[100], border: `1px solid ${tokens.color.neutral[300]}`, color: tokens.color.neutral[900] },
    disabled: { background: tokens.color.neutral[0],   border: `1px solid ${tokens.color.neutral[200]}`, color: tokens.color.neutral[300] },
  },
};

export const IconButton = forwardRef(function IconButton(
  {
    variant = "ghost",
    size = "md",
    label,
    disabled = false,
    onClick,
    children,
    ...rest
  },
  ref,
) {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);

  // Warning dev pour rappeler l'a11y. Pas de throw : on dégrade
  // gracieusement (le bouton reste utilisable, juste mal annoté).
  // En prod Vite (import.meta.env.PROD = true), pas de log.
  if (!label && import.meta.env?.DEV) {
    console.warn("[IconButton] `label` (aria-label) est obligatoire pour l'accessibilité.");
  }

  const sizeCfg = SIZE_CONFIG[size] || SIZE_CONFIG.md;
  const variantCfg = VARIANT_CONFIG[variant] || VARIANT_CONFIG.ghost;
  const state = disabled ? "disabled" : pressed ? "pressed" : hover ? "hover" : "base";
  const stateStyle = variantCfg[state];

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
      aria-label={label}
      title={label}
      style={{
        ...stateStyle,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: sizeCfg.dimension,
        height: sizeCfg.dimension,
        borderRadius: sizeCfg.radius,
        padding: 0,
        cursor: disabled ? "not-allowed" : "pointer",
        outline: "none",
        boxShadow: focused && !disabled ? tokens.shadow.focus : "none",
        transition: tokens.transition.base,
        flexShrink: 0,
      }}
      {...rest}
    >
      {/* `children` est typiquement un SVG. On le contraint via wrapper
          pour garantir la taille même si l'icône n'a pas de width/height
          propres — utile quand on passe currentColor + size dynamique. */}
      <span
        aria-hidden="true"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: sizeCfg.iconSize,
          height: sizeCfg.iconSize,
        }}
      >
        {children}
      </span>
    </button>
  );
});

export default IconButton;
