import { useState, useEffect, useRef } from "react";
import { tokens } from "../design/tokens";
import { parseDateFR } from "../utils/dates";

// ── Sélecteur de date unifié (Direction D) ───────────────────
// Calendrier popover identique partout — basé sur le picker des échéances
// d'actions. Émet une valeur ISO "YYYY-MM-DD" (compatible <input type=date>).
//
//   variant="chip"  → pastille compacte (cartes, lignes) — défaut
//   variant="field" → champ pleine largeur (formulaires)

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const DOW = ["L", "M", "M", "J", "V", "S", "D"];
const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const toDate = (v) => {
  if (!v) return null;
  const d = /^\d{4}-\d{2}-\d{2}/.test(v) ? new Date(v + "T00:00:00") : (parseDateFR(v) || new Date(v));
  return isNaN(+d) ? null : d;
};
const Cal = ({ size = 14 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>;
const Chev = ({ d, size = 14 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points={d === "l" ? "15 18 9 12 15 6" : "9 6 15 12 9 18"} /></svg>;

export function DatePicker({ value, onChange, placeholder = "Échéance", variant = "chip", clearable = true, fullWidth }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const cur = toDate(value);
  const safe = cur || new Date();
  const [view, setView] = useState({ y: safe.getFullYear(), m: safe.getMonth() });
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const t = new Date();
  const todayIso = iso(t.getFullYear(), t.getMonth(), t.getDate());
  const curIso = cur ? iso(cur.getFullYear(), cur.getMonth(), cur.getDate()) : "";
  const firstDow = (new Date(view.y, view.m, 1).getDay() + 6) % 7;
  const nDays = new Date(view.y, view.m + 1, 0).getDate();
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: nDays }, (_, i) => i + 1)];
  const shift = (n) => setView(v => { const d = new Date(v.y, v.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });

  const isField = variant === "field";
  const label = cur
    ? cur.toLocaleDateString("fr-BE", isField ? { day: "2-digit", month: "2-digit", year: "numeric" } : { day: "numeric", month: "short" })
    : placeholder;

  const trigger = isField
    ? { display: "flex", alignItems: "center", gap: 8, width: fullWidth === false ? undefined : "100%", boxSizing: "border-box", height: 44, padding: "0 14px", borderRadius: tokens.radius.md, border: `1px solid ${open ? tokens.color.brand[400] : tokens.color.neutral[200]}`, background: tokens.color.neutral[0], color: cur ? tokens.color.neutral[900] : tokens.color.neutral[400], cursor: "pointer", fontFamily: "inherit", fontSize: tokens.font.size.sm, textAlign: "left", boxShadow: open ? `0 0 0 3px ${tokens.color.brand[500]}22` : "none", transition: "all .15s" }
    : { display: "inline-flex", alignItems: "center", gap: 4, height: 24, padding: "0 8px", borderRadius: tokens.radius.full, border: `1px ${cur ? "solid" : "dashed"} ${tokens.color.neutral[200]}`, background: tokens.color.neutral[0], color: cur ? tokens.color.neutral[700] : tokens.color.neutral[500], cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: tokens.font.weight.medium };

  return (
    <div ref={ref} style={{ position: "relative", width: isField && fullWidth !== false ? "100%" : undefined }} onClick={e => e.stopPropagation()}>
      <button type="button" onClick={() => setOpen(o => !o)} style={trigger}>
        <span style={{ display: "inline-flex", color: isField ? tokens.color.neutral[400] : "inherit" }}><Cal size={isField ? 15 : 11} /></span>
        <span style={isField ? { flex: 1 } : undefined}>{label}</span>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 80, width: 244, background: tokens.color.neutral[0], border: `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.lg, boxShadow: "0 12px 32px rgba(28,25,23,0.16)", padding: tokens.space[3] }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: tokens.space[2] }}>
            <button type="button" onClick={() => shift(-1)} style={{ width: 26, height: 26, borderRadius: tokens.radius.md, border: "none", background: "transparent", color: tokens.color.neutral[500], cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Chev d="l" /></button>
            <span style={{ fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[900], textTransform: "capitalize" }}>{MONTHS[view.m]} {view.y}</span>
            <button type="button" onClick={() => shift(1)} style={{ width: 26, height: 26, borderRadius: tokens.radius.md, border: "none", background: "transparent", color: tokens.color.neutral[500], cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Chev d="r" /></button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 2 }}>{DOW.map((d, i) => <span key={i} style={{ textAlign: "center", fontSize: 10, color: tokens.color.neutral[400], padding: "2px 0" }}>{d}</span>)}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {cells.map((d, i) => {
              if (d === null) return <span key={i} />;
              const c = iso(view.y, view.m, d), sel = c === curIso, isToday = c === todayIso;
              return <button type="button" key={i} onClick={() => { onChange(c); setOpen(false); }} style={{ height: 28, borderRadius: tokens.radius.full, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: tokens.font.size.xs, fontWeight: sel ? tokens.font.weight.bold : tokens.font.weight.medium, background: sel ? tokens.color.brand[500] : isToday ? tokens.color.brand[50] : "transparent", color: sel ? "#fff" : tokens.color.neutral[900] }}>{d}</button>;
            })}
          </div>
          {clearable && cur && <button type="button" onClick={() => { onChange(""); setOpen(false); }} style={{ marginTop: tokens.space[2], width: "100%", height: 28, borderRadius: tokens.radius.md, border: `1px solid ${tokens.color.neutral[200]}`, background: tokens.color.neutral[0], color: tokens.color.neutral[500], cursor: "pointer", fontFamily: "inherit", fontSize: tokens.font.size.xs }}>Effacer la date</button>}
        </div>
      )}
    </div>
  );
}
