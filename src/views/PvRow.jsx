import { AC, ACL, SB, SB2, SBB, TX, TX2, TX3, WH, BL, BLB, SP, FS, RAD, LH } from "../constants/tokens";
import { PV_STATUSES, getPvStatus, nextPvStatus } from "../constants/statuses";
import { Ico, PvStatusBadge } from "../components/ui";
import { relativeDate } from "../utils/dates";

export function PvRow({ pv, onViewPV, onViewPdf, updatePvStatus, t }) {
  const hasInput = pv.inputNotes && pv.inputNotes.length > 0;
  const hasContent = !!(pv.content || pv.pdfDataUrl);
  return (
    <div
      className="plan-file-row"
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderTop: `1px solid ${SB2}`, borderRadius: 8, marginTop: 1 }}
    >
      <div style={{ width: 28, height: 28, borderRadius: 7, background: pv.imported ? BLB : SB, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Ico name={pv.imported ? "upload" : "file"} size={12} color={pv.imported ? BL : TX3} />
      </div>
      <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => onViewPV(pv)}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: TX }}>{pv.title || `PV n°${pv.number}`}</span>
          {pv.imported
            ? <span style={{ fontSize: 9, fontWeight: 600, color: BL, background: BLB, padding: "1px 6px", borderRadius: 10 }}>{t("project.imported")}</span>
            : <PvStatusBadge status={pv.status} onClick={(e) => { e.stopPropagation(); updatePvStatus(pv.number, nextPvStatus(pv.status || "draft")); }} />
          }
        </div>
        <div style={{ fontSize: FS.xs, color: TX3, marginTop: 1 }}><span title={pv.date}>{relativeDate(pv.date)}</span> · {pv.author}</div>
      </div>
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        {/* Bouton Rédaction — ouvre le contenu texte/notes */}
        <button onClick={() => onViewPV(pv)} style={{ height: 28, padding: "0 9px", borderRadius: 6, border: `1px solid ${SBB}`, background: WH, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit" }}>
          <Ico name="edit" size={10} color={TX3} /><span style={{ fontSize: 9, fontWeight: 500, color: TX2 }}>Rédaction</span>
        </button>
        {/* Bouton PDF — génère et affiche le PDF */}
        {hasContent && (
          <button onClick={() => onViewPdf(pv)} style={{ height: 28, padding: "0 9px", borderRadius: 6, border: `1px solid ${AC}`, background: ACL, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit" }}>
            <Ico name="file" size={10} color={AC} /><span style={{ fontSize: 9, fontWeight: 600, color: AC }}>PDF</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Shared UI components (extracted from render bodies) ────
const Card = ({ children, style = {} }) => (
  <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: RAD.xl, padding: `${SP.lg}px ${SP.lg + 2}px`, ...style }}>{children}</div>
);
const CardHeader = ({ title, action }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: SP.md }}>
    <span role="heading" aria-level="2" style={{ fontSize: FS.md, fontWeight: 700, color: TX, lineHeight: LH.tight }}>{title}</span>
    {action}
  </div>
);
export const SmallBtn = ({ onClick, icon, label }) => (
  <button onClick={onClick} style={{ background: SB, border: `1px solid ${SBB}`, borderRadius: RAD.sm + 1, cursor: "pointer", padding: `${SP.xs + 1}px ${SP.sm + 2}px`, display: "flex", alignItems: "center", gap: SP.xs, fontFamily: "inherit" }}>
    <Ico name={icon} size={FS.base} color={TX3} /><span style={{ fontSize: FS.sm, color: TX2, fontWeight: 500 }}>{label}</span>
  </button>
);
