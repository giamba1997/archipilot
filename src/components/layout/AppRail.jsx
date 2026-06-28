import { useState, useRef, useEffect } from "react";
import { AC, ACL, BG, SB, SB2, SBB, TX, TX2, TX3, WH, RAD } from "../../constants/tokens";
import { getStatus } from "../../constants/statuses";

// ── AppRail — rail de navigation fin (62px) « Direction D » ──────
//
// Remplace, sur desktop, l'ancienne sidebar large de 264px. Enveloppe
// minimaliste : carré logo + icônes de nav + avatar profil en bas.
// La sélection de projet (perdue avec un rail fin) est reloggée dans un
// POPOVER ouvert depuis l'icône « Projets » et depuis le fil d'ariane de
// la topbar — rien n'est perdu, tout est plus sobre.

const Svg = ({ d, size = 19 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d.split("|").map((seg, i) => <path key={i} d={seg} />)}
  </svg>
);

const ICONS = {
  grid:     "M4 4h6v6H4z|M14 4h6v6h-6z|M4 14h6v6H4z|M14 14h6v6h-6z",
  building: "M3 21h18|M5 21V7l8-4v18|M19 21V11l-6-4",
  chart:    "M6 20V13|M12 20V4|M18 20V9",
  plus:     "M12 5v14|M5 12h14",
  user:     "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M4 21a8 8 0 0 1 16 0",
  search:   "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z|M21 21l-4.5-4.5",
};

function RailIcon({ icon, label, active, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label={label}
      title={label}
      style={{
        width: 38, height: 38, borderRadius: 10, border: "none", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: active ? SB : hover ? SB2 : "transparent",
        color: active ? TX : TX3,
        transition: "background 0.15s, color 0.15s",
      }}
    >
      <Svg d={ICONS[icon]} />
    </button>
  );
}

export function AppRail({ projects = [], activeId, view, project, onSelectProject, onNewProject, onOverview, onHome, onProfile, profile }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);

  // Fermeture au clic extérieur / Échap.
  useEffect(() => {
    if (!pickerOpen) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setPickerOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setPickerOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [pickerOpen]);

  const inProject = !["stats", "planningDashboard", "timesheet", "profile", "home"].includes(view);
  const active = (projects || []).filter(p => !p.archived);
  const filtered = q.trim()
    ? active.filter(p => (p.name || "").toLowerCase().includes(q.toLowerCase()) || (p.client || "").toLowerCase().includes(q.toLowerCase()))
    : active;
  const initials = (profile?.name || "?").trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase() || "?";

  const pick = (id) => { onSelectProject?.(id); setPickerOpen(false); setQ(""); };

  return (
    <div ref={ref} style={{ position: "fixed", left: 0, top: 0, bottom: 0, width: 62, background: BG, borderRight: `1px solid ${SBB}`, display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 0", gap: 6, zIndex: 100 }}>
      {/* Logo → accueil multi-projets */}
      <button onClick={onHome || onOverview} aria-label="ArchiPilot — Mes chantiers" title="Mes chantiers" style={{ width: 34, height: 34, borderRadius: 9, background: AC, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 16, marginBottom: 12, fontFamily: "'Manrope','Inter',sans-serif" }}>A</button>

      {/* Nav */}
      {onHome && <RailIcon icon="grid" label="Mes chantiers" active={view === "home"} onClick={onHome} />}
      <RailIcon icon="building" label="Projets" active={inProject && pickerOpen === false} onClick={() => setPickerOpen(v => !v)} />
      <RailIcon icon="chart" label="Vue d'ensemble" active={["stats", "planningDashboard", "timesheet"].includes(view)} onClick={onOverview} />
      <RailIcon icon="plus" label="Nouveau projet" onClick={onNewProject} />

      <div style={{ flex: 1 }} />

      {/* Avatar profil */}
      <button onClick={onProfile} aria-label="Mon profil" title={profile?.name || "Mon profil"} style={{ width: 34, height: 34, borderRadius: "50%", border: view === "profile" ? `2px solid ${AC}` : `1px solid ${SBB}`, background: ACL, color: AC, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, fontFamily: "inherit" }}>{initials}</button>

      {/* Popover sélecteur de projet */}
      {pickerOpen && (
        <div style={{ position: "absolute", left: 70, top: 56, width: 300, maxHeight: "70vh", background: WH, border: `1px solid ${SBB}`, borderRadius: RAD.xl, boxShadow: "0 12px 40px rgba(28,25,23,0.16)", display: "flex", flexDirection: "column", overflow: "hidden", zIndex: 200 }}>
          <div style={{ padding: "10px 12px", borderBottom: `1px solid ${SBB}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, height: 34, padding: "0 10px", background: SB, borderRadius: RAD.md, color: TX3 }}>
              <Svg d={ICONS.search} size={15} />
              <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un projet…" style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontFamily: "inherit", fontSize: 13, color: TX }} />
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 6 }}>
            {filtered.length === 0 && <div style={{ padding: "16px 10px", fontSize: 12, color: TX3, textAlign: "center" }}>Aucun projet</div>}
            {filtered.map(p => {
              const st = getStatus(p.statusId);
              const isActive = String(p.id) === String(activeId) && inProject;
              return (
                <button key={p.id} onClick={() => pick(p.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: RAD.md, border: "none", cursor: "pointer", background: isActive ? ACL : "transparent", textAlign: "left", fontFamily: "inherit", marginBottom: 2 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: st?.color || TX3, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: isActive ? 700 : 600, color: TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                    <span style={{ display: "block", fontSize: 11, color: TX3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.client || st?.label || "—"}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <button onClick={() => { setPickerOpen(false); onNewProject?.(); }} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: 40, borderTop: `1px solid ${SBB}`, background: WH, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: AC }}>
            <Svg d={ICONS.plus} size={14} /> Nouveau projet
          </button>
        </div>
      )}
    </div>
  );
}

export default AppRail;
