import { getStatus } from "../../constants/statuses";

export function StatusBadge({ statusId, small }) {
  const s = getStatus(statusId);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: small ? 10 : 11, fontWeight: 600, color: s.color, background: s.bg, padding: small ? "2px 7px 2px 5px" : "3px 10px 3px 7px", borderRadius: 20, whiteSpace: "nowrap", letterSpacing: "0.01em" }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.color, display: "inline-block", flexShrink: 0 }} />
      {s.label}
    </span>
  );
}
