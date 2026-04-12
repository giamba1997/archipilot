import { WH, SBB, SB, TX, TX3 } from "../../constants/tokens";
import { Ico } from "./Ico";

export function KpiCard({ iconName, label, value, color = TX, sub, extra }) {
  return (
    <div style={{ flex: "1 1 140px", background: WH, border: `1px solid ${SBB}`, borderRadius: 10, padding: "16px 14px", animation: "fadeIn 0.2s ease" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: SB, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Ico name={iconName} size={14} color={TX3} />
        </div>
        <span style={{ fontSize: 11, color: TX3, fontWeight: 500 }}>{label}</span>
        {extra}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color, letterSpacing: "-0.02em", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: TX3, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
