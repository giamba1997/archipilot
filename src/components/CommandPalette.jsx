import { useState, useEffect, useMemo, useRef } from "react";
import { tokens } from "../design/tokens";
import { getStatus } from "../constants/statuses";

// ── Recherche globale ⌘K (Direction D) ───────────────────────
// Palette de commandes : recherche cross-projets (projets · réserves · PV)
// + actions rapides. Résultats groupés, terme surligné en brand.600,
// navigation clavier complète (↑↓ naviguer · ↵ ouvrir · esc fermer).
// Portée sur src/design/tokens — alimentée par la liste de projets.

const C = tokens.color;

const S = ({ d, size = 17, sw = 1.7 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
const IC = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  building: <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4" />,
  alert: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h16.9a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>,
  sparkle: <path d="M12 3l1.9 6.1L20 11l-6.1 1.9L12 19l-1.9-6.1L4 11l6.1-1.9z" />,
  plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
};
const TONES = {
  brand: { bg: C.brand[50], fg: C.brand[600] },
  danger: { bg: C.semantic.danger.bg, fg: C.semantic.danger.fg },
  warning: { bg: C.semantic.warning.bg, fg: C.semantic.warning.fg },
  info: { bg: C.semantic.info.bg, fg: C.semantic.info.fg },
  neutral: { bg: C.neutral[100], fg: C.neutral[500] },
};

function Kbd({ children }) {
  return <span style={{ fontSize: 11, color: C.neutral[400], border: `1px solid ${C.neutral[200]}`, borderRadius: 5, padding: "1px 6px", fontFamily: "ui-monospace, monospace", lineHeight: 1.4 }}>{children}</span>;
}
function Hi({ text, q }) {
  if (!q) return text || "";
  const t = text || "";
  const i = t.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return t;
  return <>{t.slice(0, i)}<b style={{ color: C.brand[600], fontWeight: 700 }}>{t.slice(i, i + q.length)}</b>{t.slice(i + q.length)}</>;
}

const SEV_TONE = { critical: "danger", major: "danger", minor: "warning", esthetic: "neutral" };

export function CommandPalette({ projects = [], onClose, onOpenProject, onOpenPv, onNewPv, onNewProject }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const items = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const active = (projects || []).filter(p => !p.archived);
    const out = [];

    // Projets
    active.filter(p => !ql
      || (p.name || "").toLowerCase().includes(ql)
      || (p.client || "").toLowerCase().includes(ql)
      || (p.lots || []).some(l => (l.name || "").toLowerCase().includes(ql)))
      .slice(0, 5)
      .forEach(p => out.push({
        group: "Projets", icon: "building", tone: "brand",
        title: p.name, sub: [getStatus(p.statusId).label, p.client].filter(Boolean).join(" · "),
        kbd: "↵", run: () => onOpenProject?.(p.id),
      }));

    // Réserves & PV
    const rp = [];
    for (const p of active) {
      for (const r of (p.reserves || [])) {
        const code = r.code || "Réserve";
        const desc = r.text || r.description || "";
        if (ql && !`${code} ${desc}`.toLowerCase().includes(ql)) continue;
        rp.push({ group: "Réserves & PV", icon: "alert", tone: SEV_TONE[r.severity] || "danger", title: `${code} · ${desc}`, sub: `${p.name}${r.severity ? ` · ${r.severity === "critical" ? "critique" : r.severity === "major" ? "majeure" : "mineure"}` : ""}`, run: () => onOpenProject?.(p.id) });
      }
      for (const pv of (p.pvHistory || [])) {
        const label = `PV n°${pv.number}${pv.title ? ` — ${pv.title}` : ""}`;
        const hay = `${label} ${pv.excerpt || ""}`;
        if (ql && !hay.toLowerCase().includes(ql)) continue;
        rp.push({ group: "Réserves & PV", icon: "file", tone: "warning", title: label, sub: `${p.name}${pv.date ? ` · ${pv.date}` : ""}`, run: () => onOpenPv?.(p.id, pv) });
      }
    }
    rp.slice(0, 6).forEach(x => out.push(x));

    // Actions rapides
    [
      { group: "Actions rapides", icon: "sparkle", tone: "brand", title: "Nouveau PV…", kbd: "⌘N", run: () => onNewPv?.() },
      { group: "Actions rapides", icon: "plus", tone: "brand", title: "Nouveau projet…", run: () => onNewProject?.() },
    ].filter(a => !ql || a.title.toLowerCase().includes(ql)).forEach(a => out.push(a));

    return out;
  }, [q, projects, onOpenProject, onOpenPv, onNewPv, onNewProject]);

  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") { e.preventDefault(); onClose?.(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setSel(s => Math.min(items.length - 1, s + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
      else if (e.key === "Enter") { e.preventDefault(); items[sel]?.run?.(); onClose?.(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [items, sel, onClose]);

  // Garde l'élément sélectionné visible.
  useEffect(() => { listRef.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" }); }, [sel]);

  let flat = -1; // index plat pour la sélection clavier
  let lastGroup = null;

  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, zIndex: 11000, background: "rgba(28,25,23,0.4)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "90px 16px 16px", fontFamily: tokens.font.family }}>
      <style>{`@keyframes cmdkUp{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}`}</style>
      <div onMouseDown={e => e.stopPropagation()} style={{ width: 620, maxWidth: "100%", background: C.neutral[0], borderRadius: 16, boxShadow: "0 24px 70px rgba(28,25,23,0.32)", overflow: "hidden", animation: "cmdkUp .18s ease both" }}>
        {/* Champ */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", borderBottom: `1px solid ${C.neutral[150] || "#EFEDEB"}` }}>
          <span style={{ color: C.neutral[400], display: "inline-flex" }}><S d={IC.search} size={20} sw={2} /></span>
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher projets, réserves, PV…"
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontFamily: "inherit", fontSize: 17, color: C.neutral[900] }} />
          <Kbd>esc</Kbd>
        </div>

        {/* Résultats */}
        <div ref={listRef} style={{ maxHeight: 420, overflowY: "auto", padding: 8 }}>
          {items.length === 0 ? (
            <div style={{ padding: "28px 12px", textAlign: "center", color: C.neutral[500], fontSize: 14 }}>Aucun résultat pour « {q} ».</div>
          ) : items.map((it, i) => {
            flat = i;
            const header = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            const active = i === sel;
            const t = TONES[it.tone] || TONES.neutral;
            return (
              <div key={i}>
                {header && <div style={{ fontSize: 11, fontWeight: 600, color: C.neutral[400], textTransform: "uppercase", letterSpacing: "0.05em", padding: i === 0 ? "8px 12px 6px" : "12px 12px 6px" }}>{header}</div>}
                <div data-i={i} onMouseEnter={() => setSel(i)} onClick={() => { it.run?.(); onClose?.(); }}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 9, cursor: "pointer", background: active ? C.brand[50] : "transparent" }}>
                  <span style={{ width: 32, height: 32, borderRadius: 8, background: t.bg, color: t.fg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><S d={IC[it.icon]} size={17} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.neutral[900], whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}><Hi text={it.title} q={q.trim()} /></div>
                    {it.sub && <div style={{ fontSize: 12, color: C.neutral[400], whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.sub}</div>}
                  </div>
                  {(active || it.kbd) && <Kbd>{it.kbd || "↵"}</Kbd>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Pied : raccourcis */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "11px 18px", borderTop: `1px solid ${C.neutral[150] || "#EFEDEB"}`, background: "#FCFBFA" }}>
          <span style={{ fontSize: 12, color: C.neutral[400], display: "flex", alignItems: "center", gap: 5 }}><Kbd>↑↓</Kbd>naviguer</span>
          <span style={{ fontSize: 12, color: C.neutral[400], display: "flex", alignItems: "center", gap: 5 }}><Kbd>↵</Kbd>ouvrir</span>
          <span style={{ marginLeft: "auto", fontSize: 12, color: C.neutral[400], display: "flex", alignItems: "center", gap: 5 }}><Kbd>⌘K</Kbd>partout</span>
        </div>
      </div>
    </div>
  );
}
