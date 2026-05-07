import { useState } from "react";
import useUIStore from "../../stores/useUIStore";
import { AC, ACL, ACL2, WH, FS, RAD } from "../../constants/tokens";
import { Ico } from "./Ico";

// Bouton "Demander à l'IA" disponible partout dans le produit.
//
// Principe directeur : l'IA est opt-in et contextuelle. Ce composant rend
// l'affordance uniforme : même icône, même couleur, même mécanique. Le
// click ouvre le ChatModal avec le prefill fourni — la modal est centralisée
// dans App.jsx et lue depuis useUIStore (chatOpen / chatPrefill / askAi).
//
// Trois tailles :
//   - "inline"  : icône seule, 22×22, pour s'incruster à côté d'un titre
//   - "compact" : icône + label court, hauteur 28px
//   - "cta"     : bouton plein, hauteur 36px, pour appeler à l'action
//
// La prop `contextHint` est affichée dans un tooltip pour la transparence —
// l'utilisateur voit ce que l'IA va recevoir comme contexte avant de cliquer.

export function AskAiButton({
  // ── Contenu envoyé à l'IA quand on clique (au moins l'un des trois) ──
  message,                  // string — message pré-rédigé pour l'utilisateur
  attachments,              // [{ type, name, mimeType, content?, dataUrl? }]
  sourceTag,                // string — étiquette de provenance pour analytics
  // ── Présentation ──
  size = "compact",         // "inline" | "compact" | "cta"
  label = "Demander à l'IA",
  contextHint,              // string — tooltip de transparence (résumé du contexte)
  disabled = false,
  // ── Hooks de surcharge ──
  onBeforeOpen,             // () => boolean | void — empêche l'ouverture si return false
  style,                    // surcharges fines
}) {
  const askAi = useUIStore(s => s.askAi);
  const [hover, setHover] = useState(false);

  const handleClick = () => {
    if (disabled) return;
    if (onBeforeOpen && onBeforeOpen() === false) return;
    askAi({ message, attachments, sourceTag });
  };

  const tooltip = contextHint || "L'IA répondra avec le contexte du projet en cours.";

  // ── Inline : icône seule ────────────────────────────────────
  if (size === "inline") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        title={tooltip}
        aria-label={label}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          width: 24, height: 24, padding: 0,
          border: "none", borderRadius: 6,
          background: hover ? ACL : "transparent",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          transition: "background 0.15s",
          ...style,
        }}
      >
        <Ico name="sparkle" size={13} color={AC} />
      </button>
    );
  }

  // ── CTA : bouton plein ──────────────────────────────────────
  if (size === "cta") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        title={tooltip}
        style={{
          padding: "9px 14px",
          border: "none", borderRadius: RAD.md,
          background: AC, color: WH,
          fontSize: FS.sm, fontWeight: 600,
          fontFamily: "inherit",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
          display: "inline-flex", alignItems: "center", gap: 6,
          ...style,
        }}
      >
        <Ico name="sparkle" size={13} color={WH} />
        {label}
      </button>
    );
  }

  // ── Compact : icône + label (par défaut) ────────────────────
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      title={tooltip}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: "5px 10px 5px 8px",
        border: `1px solid ${hover ? AC : ACL2}`,
        borderRadius: 14,
        background: hover ? ACL : WH,
        color: AC,
        fontSize: FS.xs, fontWeight: 600,
        fontFamily: "inherit",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        display: "inline-flex", alignItems: "center", gap: 5,
        transition: "all 0.15s",
        ...style,
      }}
    >
      <Ico name="sparkle" size={11} color={AC} />
      {label}
    </button>
  );
}
