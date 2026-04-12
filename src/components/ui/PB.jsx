import { SB2, GR, AC, RD } from "../../constants/tokens";

export function PB({ value }) {
  return (
    <div style={{ width: "100%", height: 7, borderRadius: 4, background: SB2, overflow: "hidden" }}>
      <div style={{ width: `${value}%`, height: "100%", borderRadius: 4, background: value > 60 ? GR : value > 30 ? AC : RD, transition: "width 0.4s" }} />
    </div>
  );
}
