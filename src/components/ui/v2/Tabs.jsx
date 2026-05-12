import { useRef, useState } from "react";
import { tokens } from "../../../design/tokens";
import { Badge } from "./Badge";

// ── Tabs — onglets ─────────────────────────────────────────
//
// Liste d'onglets horizontale avec indicateur d'élément actif sous
// forme de barre fine (2px) — pas de fond plein. C'est le seul endroit
// (avec le logo et l'élément actif de sidebar) où `brand.500` se montre
// hors d'un CTA primaire.
//
// Le compteur optionnel par tab utilise le Badge atomique en variant
// neutral. Pas de couleur sémantique pour ne pas concurrencer le
// signal visuel de la barre active.
//
// Accessibilité : role="tablist" + role="tab" + aria-selected, navigation
// clavier (flèches gauche/droite) gérée par le composant.
//
// Props :
//   items    Array<{ id, label, count?, showZero? }>
//            count : nombre à afficher en badge
//            showZero : true si on veut afficher "0" (par défaut le badge
//                       n'apparaît qu'à partir de 1)
//   activeId id de l'onglet actif
//   onChange (id) => void

export function Tabs({ items = [], activeId, onChange }) {
  const listRef = useRef(null);

  // Navigation clavier — flèches déplacent le focus parmi les onglets.
  // Tab passe au contenu (sortie du tablist). Pattern WAI-ARIA standard.
  const onKeyDown = (e) => {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const buttons = listRef.current?.querySelectorAll('[role="tab"]') || [];
    const currentIndex = Array.from(buttons).findIndex(b => b === document.activeElement);
    if (currentIndex === -1) return;
    const next = (currentIndex + dir + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      onKeyDown={onKeyDown}
      style={{
        display: "flex",
        gap: tokens.space[1],
        borderBottom: `1px solid ${tokens.color.neutral[200]}`,
        marginBottom: tokens.space[4],
      }}
    >
      {items.map(item => {
        const isActive = item.id === activeId;
        const showCount = typeof item.count === "number" && (item.count > 0 || item.showZero);
        return (
          <TabButton
            key={item.id}
            item={item}
            isActive={isActive}
            showCount={showCount}
            onSelect={() => onChange?.(item.id)}
          />
        );
      })}
    </div>
  );
}

// Bouton individuel — extrait pour gérer son propre state hover/focus
// sans pollution du parent.
function TabButton({ item, isActive, showCount, onSelect }) {
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);

  const color = isActive
    ? tokens.color.neutral[900]
    : hover
      ? tokens.color.neutral[700]
      : tokens.color.neutral[500];

  return (
    <button
      role="tab"
      aria-selected={isActive}
      tabIndex={isActive ? 0 : -1}
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: tokens.space[2],
        padding: `${tokens.space[2]} ${tokens.space[3]}`,
        // Barre active 2px en brand.500 — overlap sur le border-bottom
        // du container via marginBottom négatif.
        borderBottom: `2px solid ${isActive ? tokens.color.brand[500] : "transparent"}`,
        marginBottom: -1,
        background: isActive && hover ? tokens.color.brand[50] : "transparent",
        color,
        fontFamily: tokens.font.family,
        fontSize: tokens.font.size.sm,
        fontWeight: isActive ? tokens.font.weight.semibold : tokens.font.weight.medium,
        lineHeight: 1,
        border: "none",
        borderRadius: 0,
        cursor: "pointer",
        outline: "none",
        boxShadow: focused ? tokens.shadow.focus : "none",
        transition: tokens.transition.base,
        whiteSpace: "nowrap",
      }}
    >
      {item.label}
      {showCount && (
        <Badge variant="neutral">{item.count}</Badge>
      )}
    </button>
  );
}

export default Tabs;
