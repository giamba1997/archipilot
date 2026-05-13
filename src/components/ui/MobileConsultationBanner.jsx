import { AC, ACL, TX2, TX3, SBB, RAD, SP } from "../../constants/tokens";
import { Ico } from "./Ico";

// ── MobileConsultationBanner ──────────────────────────────
//
// Affiché en haut de chaque vue projet sur mobile pour rappeler que
// la modification se fait au bureau. Les CTAs « + Nouveau X »,
// « Modifier », « Importer » sont masqués via `useIsMobile()` dans
// chaque vue ; ce bandeau explique pourquoi.
//
// Pourquoi pas un toast contextuel à chaque tap raté ? Parce que
// l'archi ne tape pas un bouton manquant — il voit qu'il n'y est pas
// et comprend tout de suite. Le bandeau évite l'effet « UI cassée ».
//
// Compact (40 px de hauteur, 1 ligne) pour ne pas voler trop de pixels
// au contenu — le mobile est déjà à l'étroit.
export function MobileConsultationBanner({ hint }) {
  return (
    <div
      role="note"
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 12px",
        marginBottom: SP.md,
        background: ACL,
        border: `1px solid ${SBB}`,
        borderRadius: RAD.md,
        fontSize: 11.5, color: TX2, lineHeight: 1.4,
      }}
    >
      <Ico name="eye" size={14} color={AC} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ color: TX2, fontWeight: 700 }}>Mode consultation</strong>
        <span style={{ color: TX3 }}>
          {" "}— {hint || "ouvre l'app sur ordinateur pour modifier."}
        </span>
      </span>
    </div>
  );
}
