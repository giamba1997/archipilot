import { tokens } from "../../../design/tokens";

// ── SectionHeader — mini-header de zone ────────────────────────
//
// Petit en-tête qui découpe une page en zones lisibles avant que le
// contenu n'arrive. Sur mobile, ce pattern fait toute la différence
// entre "j'arrive sur une suite de cartes anonymes" et "je sais
// exactement où je suis et ce que je vais lire". On le porte sur
// desktop pour ramener cette clarté éditoriale.
//
// Format :
//   [icone 16×16  LABEL EN CAPS]
//   ─────────────────────────────
//   (contenu de la section juste en dessous)
//
// Convention : Inter, 12px (`font.size.xs`), semibold, uppercase,
// letter-spacing 0.05em, couleur neutral.500. L'icône est passive
// (même teinte que le label), pas brand.
//
// Props :
//   icon       ReactNode (SVG préféré) OU string parmi le registry
//              ci-dessous. Si la string ne matche pas, l'icône est omise.
//   label      string — texte du header (sera passé en uppercase via CSS)
//   action     ReactNode optionnel — petit lien/bouton aligné à droite
//              (ex. "Voir tout", "Tout marquer lu")
//   style      override partiel
//
// Discipline d'usage :
//   - Un SectionHeader marque le début d'une zone, jamais le milieu.
//   - 3-4 SectionHeader max par page ; au-delà, c'est qu'il faut
//     repenser la hiérarchie.
//   - L'icône reste petite (16px) et passive. Pour un en-tête plus
//     fort (titre de page), c'est un <h1>/<h2> avec ses tokens propres.

// ── Mini-registry SVG inline ──
// On n'importe pas le gros registry de `components/ui/Ico.jsx` (qui est
// lié à la palette earth-historique) pour garder `v2/` autonome. Ces 6
// icônes couvrent la grande majorité des en-têtes (tâches, outils,
// échéances, projet, lieu, temps). Pour un cas exotique, le caller passe
// un SVG en JSX directement.
const ICON_PATHS = {
  bolt:     "M13 2L3 14h7l-1 8 10-12h-7l1-8z",
  wrench:   "M14.7 6.3a4 4 0 0 1-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 1 5.4-5.4l-2.2 2.2 1.5 1.5 2.2-2.2-1.5-1.5z M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0",
  calendar: "M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z M16 2v4 M8 2v4 M3 10h18",
  building: "M3 21h18 M5 21V7l8-4v18 M19 21V11l-6-4",
  mappin:   "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  clock:    "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M12 6v6l4 2",
  sparkle:  "M12 4l1.8 5.4L19 12l-5.2 2.6L12 20l-1.8-5.4L5 12l5.2-2.6z",
};

function InlineSvg({ name, color }) {
  const d = ICON_PATHS[name];
  if (!d) return null;
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.split(" M").map((seg, i) => (
        <path key={i} d={i === 0 ? seg : "M" + seg} />
      ))}
    </svg>
  );
}

export function SectionHeader({ icon, label, action, style: styleOverride }) {
  const color = tokens.color.neutral[500];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: tokens.space[2],
        marginBottom: tokens.space[3],
        ...styleOverride,
      }}
    >
      {/* Icône — supporte string (registry) ou JSX direct */}
      {typeof icon === "string"
        ? <InlineSvg name={icon} color={color} />
        : icon}
      <span
        style={{
          fontFamily: tokens.font.family,
          fontSize: tokens.font.size.xs,
          fontWeight: tokens.font.weight.semibold,
          color,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          lineHeight: 1,
        }}
      >
        {label}
      </span>
      {/* Action optionnelle alignée à droite (ex. "Voir tout") */}
      {action && (
        <div style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center" }}>
          {action}
        </div>
      )}
    </div>
  );
}

export default SectionHeader;
