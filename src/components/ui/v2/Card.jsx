import { forwardRef, useState } from "react";
import { tokens } from "../../../design/tokens";

// ── Card — conteneur atomique ───────────────────────────────
//
// Conteneur de base pour les blocs de contenu. Bordure unique, fond
// blanc, pas d'ombre par défaut. La densité est volontairement serrée
// (padding `space.4` = 16px) — pour un outil métier quotidien, l'aération
// excessive devient du gaspillage d'espace écran.
//
// Variants :
//   default     — bordure neutral.200, fond blanc, statique
//   interactive — même base, mais hover bg brand.50 + cursor pointer.
//                 Utiliser quand TOUTE la card est cliquable.
//
// Props :
//   variant     "default" | "interactive"  (défaut "default")
//   padding     clé de tokens.space (1 à 12)  (défaut 4)
//   onClick     handler — déclenche le variant interactive automatiquement
//   as          tag HTML — "div" par défaut, "button" si onClick fourni
//                          (override possible si besoin sémantique précis)
//   ariaLabel   requis si as="button"
//   style       override partiel autorisé (ne pas écraser background/border
//               sans bonne raison — c'est ce qu'on cherche à standardiser)
//   children    contenu

export const Card = forwardRef(function Card(
  {
    variant,
    padding = 4,
    onClick,
    as,
    ariaLabel,
    style: styleOverride,
    children,
    ...rest
  },
  ref,
) {
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);

  // L'interactivité est inférée d'`onClick` mais peut être forcée via
  // variant="interactive" (utile pour wrap dans un <Link> qui clique).
  const isInteractive = variant === "interactive" || !!onClick;

  // Sémantique HTML : si la card est cliquable, c'est un <button> par
  // défaut (a11y native — keyboard, screen readers). L'override `as`
  // permet de forcer un <div role="button"> dans les cas rares.
  const Tag = as || (onClick ? "button" : "div");

  const baseStyle = {
    background: hover && isInteractive ? tokens.color.brand[50] : tokens.color.neutral[0],
    border: `1px solid ${hover && isInteractive ? tokens.color.brand[200] : tokens.color.neutral[200]}`,
    borderRadius: tokens.radius.lg,
    padding: tokens.space[padding] || tokens.space[4],
    cursor: isInteractive ? "pointer" : "default",
    transition: tokens.transition.base,
    color: "inherit",
    textAlign: "inherit",
    fontFamily: tokens.font.family,
    fontSize: tokens.font.size.base,
    width: "100%",
    boxSizing: "border-box",
    outline: "none",
    boxShadow: focused && isInteractive ? tokens.shadow.focus : "none",
  };

  return (
    <Tag
      ref={ref}
      onClick={onClick}
      onMouseEnter={() => isInteractive && setHover(true)}
      onMouseLeave={() => isInteractive && setHover(false)}
      onFocus={() => isInteractive && setFocused(true)}
      onBlur={() => isInteractive && setFocused(false)}
      aria-label={Tag === "button" ? ariaLabel : undefined}
      type={Tag === "button" ? "button" : undefined}
      style={{ ...baseStyle, ...styleOverride }}
      {...rest}
    >
      {children}
    </Tag>
  );
});

export default Card;
