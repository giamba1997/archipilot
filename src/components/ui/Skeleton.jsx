import { SB2 } from "../../constants/tokens";

export function Skeleton({ w = "100%", h = 14, r = 6, mb = 0 }) {
  return <div style={{ width: w, height: h, borderRadius: r, background: SB2, marginBottom: mb, animation: "skeleton 1.2s ease infinite" }} />;
}
