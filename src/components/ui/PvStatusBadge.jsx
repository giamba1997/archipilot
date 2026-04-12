import { getPvStatus } from "../../constants/statuses";

export function PvStatusBadge({ status, onClick }) {
  const s = getPvStatus(status || "draft");
  return (
    <button
      onClick={onClick}
      title={onClick ? "Cliquer pour changer le statut" : undefined}
      style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px 2px 6px", border: `1px solid ${s.bg}`, borderRadius: 20, background: s.bg, cursor: onClick ? "pointer" : "default", fontFamily: "inherit", outline: "none" }}
    >
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.dot, display: "inline-block", flexShrink: 0 }} />
      <span style={{ fontSize: 10, fontWeight: 600, color: s.color, letterSpacing: "0.01em" }}>{s.label}</span>
    </button>
  );
}
