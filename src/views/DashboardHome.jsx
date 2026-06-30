import { useState, useMemo, useRef, useEffect } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { tokens } from "../design/tokens";
import { Button } from "../components/ui/v2/Button";
import { STATUSES, getStatus, STATUS_TOTAL_STEPS } from "../constants/statuses";
import { isEnabled } from "../constants/featureFlags";
import { parseDateFR } from "../utils/dates";
import { geocodeProjects } from "../utils/geocode";

// ── Dashboard multi-projets « Mes chantiers » (Direction D) ──────
// Deux vues : Liste (grille de cartes priorisées) et Carte (tournée
// terrain, Leaflet + drawer). En-tête éditorial commun, chiffres-clés
// consolidés, filtres par statut. Chaque carte affiche son signal le
// plus important. Porté sur src/design/tokens + components/ui/v2.

const C = tokens.color;
const FMONTH = ["jan", "fév", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"];
const FDAY = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const startToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const toDate = (v) => { if (!v) return null; const d = /^\d{4}-\d{2}-\d{2}/.test(v) ? new Date(v + "T00:00:00") : (parseDateFR(v) || new Date(v)); return isNaN(+d) ? null : d; };
const shortDate = (v) => { const d = toDate(v); return d ? `${d.getDate()} ${FMONTH[d.getMonth()]}` : ""; };
const within = (v, days) => { const d = toDate(v); if (!d) return false; const diff = (d - startToday()) / 86400000; return diff >= 0 && diff <= days; };

// Icônes inline (stroke = currentColor) — cohérentes 1.7px.
const S = ({ d, size = 16, sw = 1.7, fill }) => <svg width={size} height={size} viewBox="0 0 24 24" fill={fill || "none"} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
const IC = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  list: <><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></>,
  pin: <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></>,
  plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
  cal: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 16 14" /></>,
  alert: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h16.9a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>,
  check: <polyline points="20 6 9 17 4 12" />,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>,
  users: <><circle cx="9" cy="7" r="3" /><path d="M2 21a7 7 0 0 1 14 0" /></>,
  chev: <polyline points="9 6 15 12 9 18" />,
  down: <polyline points="6 9 12 15 18 9" />,
  x: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
  route: <path d="M9 18l6-6-6-6" />,
  search: <><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></>,
};

// Signal prioritaire d'un projet (sémantique, jamais brand).
function projectSignal(p) {
  const acts = (p.actions || []).filter(a => a.open !== false);
  const urgent = acts.filter(a => a.urgent || a.priority === "urgent");
  const overdue = acts.filter(a => { const d = toDate(a.due); return d && d < startToday(); });
  const plural = (n) => (n > 1 ? "s" : "");
  if (overdue.length) return { tone: "danger", icon: IC.clock, text: `${overdue.length} action${plural(overdue.length)} en retard` };
  if (urgent.length) return { tone: "warning", icon: IC.alert, text: `${urgent.length} action${plural(urgent.length)} urgente${plural(urgent.length)}` };
  if (p.statusId === "sketch") return { tone: "neutral", icon: IC.file, text: "Esquisse à valider" };
  if (p.statusId === "preliminary") return { tone: "neutral", icon: IC.file, text: "Avant-projet en cours" };
  if (p.statusId === "permit") return { tone: "info", icon: IC.file, text: "Permis en instruction" };
  if (acts.length) return { tone: "info", icon: IC.list, text: `${acts.length} action${plural(acts.length)} ouverte${plural(acts.length)}` };
  return { tone: "success", icon: IC.check, text: "À jour · rien d'urgent" };
}
const severityRank = { danger: 0, warning: 1, info: 2, neutral: 3, success: 4 };

function StatusPill({ statusId }) {
  const s = getStatus(statusId);
  return <span style={{ fontSize: 11, fontWeight: tokens.font.weight.semibold, padding: "3px 9px", borderRadius: tokens.radius.full, background: s.bg, color: s.color }}>{s.label}</span>;
}
function PhaseGauge({ statusId }) {
  const s = getStatus(statusId);
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {Array.from({ length: STATUS_TOTAL_STEPS }, (_, i) => (
        <span key={i} style={{ width: 14, height: 4, borderRadius: tokens.radius.full, background: i < s.step ? s.color : C.neutral[200] }} />
      ))}
    </div>
  );
}
function Tone({ tone, icon, text }) {
  const t = C.semantic[tone] || { bg: C.neutral[100], fg: C.neutral[700] };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: tokens.font.size.xs, color: t.fg, background: t.bg, borderRadius: tokens.radius.md, padding: "7px 9px" }}>
      <span style={{ display: "inline-flex", flexShrink: 0 }}><S d={icon} size={13} /></span>{text}
    </div>
  );
}

function KpiCard({ label, value, unit, tone }) {
  const t = tone ? C.semantic[tone] : null;
  return (
    <div style={{ background: C.neutral[0], border: `1px solid ${t ? t.border : C.neutral[200]}`, borderRadius: tokens.radius.lg, padding: "15px 17px" }}>
      <div style={{ fontSize: tokens.font.size.xs, color: t ? t.fg : C.neutral[500], marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: tokens.font.size["2xl"], fontWeight: tokens.font.weight.bold, color: t ? t.fg : C.neutral[900], letterSpacing: "-0.5px" }}>{value}{unit && <span style={{ fontSize: tokens.font.size.base, fontWeight: tokens.font.weight.medium }}> {unit}</span>}</div>
    </div>
  );
}

function Chip({ active, label, count, dot, onClick }) {
  return (
    <button onClick={onClick} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 13px", borderRadius: tokens.radius.full, border: `1px solid ${active ? C.brand[200] : C.neutral[200]}`, background: active ? C.brand[50] : C.neutral[0], color: active ? C.brand[600] : C.neutral[500], fontFamily: "inherit", fontSize: tokens.font.size.xs, fontWeight: active ? tokens.font.weight.semibold : tokens.font.weight.medium, cursor: "pointer" }}>
      {dot && <span style={{ width: 7, height: 7, borderRadius: tokens.radius.full, background: dot }} />}{label}{count != null && ` · ${count}`}
    </button>
  );
}
function ViewToggle({ view, onChange }) {
  const opt = (id, icon, label) => {
    const a = view === id;
    return <button onClick={() => onChange(id)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: tokens.radius.md, border: "none", background: a ? C.neutral[0] : "transparent", boxShadow: a ? tokens.shadow.sm : "none", color: a ? C.neutral[900] : C.neutral[500], fontFamily: "inherit", fontSize: tokens.font.size.sm, fontWeight: a ? tokens.font.weight.semibold : tokens.font.weight.medium, cursor: "pointer" }}><S d={icon} size={14} sw={1.8} />{label}</button>;
  };
  return <div style={{ display: "inline-flex", gap: 3, background: C.neutral[100], borderRadius: tokens.radius.md, padding: 3 }}>{opt("list", IC.list, "Liste")}{opt("map", IC.pin, "Carte")}</div>;
}

function ProjectCard({ p, onOpen }) {
  const [hover, setHover] = useState(false);
  const sig = projectSignal(p);
  const open = (p.actions || []).filter(a => a.open !== false).length;
  return (
    <div onClick={() => onOpen?.(p.id)} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ background: C.neutral[0], border: `1px solid ${hover ? C.brand[200] : C.neutral[200]}`, borderRadius: tokens.radius.xl, padding: tokens.space[4], cursor: "pointer", transition: tokens.transition.base, transform: hover ? "translateY(-2px)" : "none", boxShadow: hover ? tokens.shadow.md : "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <StatusPill statusId={p.statusId} />
        <span style={{ marginLeft: "auto" }}><PhaseGauge statusId={p.statusId} /></span>
      </div>
      <div style={{ fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.bold, color: C.neutral[900], letterSpacing: "-0.2px", marginBottom: 2 }}>{p.name}</div>
      <div style={{ fontSize: tokens.font.size.xs, color: C.neutral[500], marginBottom: 14 }}>{[p.city, p.client].filter(Boolean).join(" · ") || "—"}</div>
      <div style={{ marginBottom: 14 }}><Tone {...sig} /></div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: tokens.font.size.xs, color: C.neutral[500], paddingTop: 12, borderTop: `1px solid ${C.neutral[100]}` }}>
        {p.nextMeeting && <span style={{ display: "flex", alignItems: "center", gap: 5 }}><S d={IC.cal} size={13} />Réunion {shortDate(p.nextMeeting)}</span>}
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}><S d={IC.list} size={13} />{open} action{open > 1 ? "s" : ""}</span>
      </div>
    </div>
  );
}
function GhostCard({ onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ background: hover ? C.brand[50] : C.neutral[50], border: `1.5px dashed ${hover ? C.brand[200] : C.neutral[300]}`, borderRadius: tokens.radius.xl, padding: tokens.space[4], cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", minHeight: 172, fontFamily: "inherit", transition: tokens.transition.base }}>
      <span style={{ width: 42, height: 42, borderRadius: tokens.radius.lg, background: C.brand[50], color: C.brand[600], display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}><S d={IC.plus} size={22} sw={1.8} /></span>
      <span style={{ fontSize: tokens.font.size.base, fontWeight: tokens.font.weight.semibold, color: C.neutral[900], marginBottom: 3 }}>Nouveau projet</span>
      <span style={{ fontSize: tokens.font.size.xs, color: C.neutral[500], lineHeight: 1.4 }}>Importer un CdC ou partir de zéro</span>
    </button>
  );
}

// ── Carte (Leaflet) + drawer ─────────────────────────────────
const PIN_BRUSSELS = [50.85, 4.35];
function makeIcon(color, selected) {
  return L.divIcon({ className: "ap-dash-pin", iconSize: selected ? [32, 42] : [26, 36], iconAnchor: [13, 34], html: `<div style="width:${selected ? 30 : 26}px;height:${selected ? 30 : 26}px;background:${color};border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:${selected ? "0 0 0 6px rgba(184,92,44,.25)," : ""}0 3px 8px rgba(0,0,0,.35)"></div>` });
}
function MapPanel({ projects, statusFilter, onOpen, setProjects }) {
  const elRef = useRef(null), mapRef = useRef(null), markersRef = useRef({});
  const [selected, setSelected] = useState(null);

  const visible = useMemo(() => (projects || []).filter(p => !p.archived).filter(p => statusFilter === "all" || p.statusId === statusFilter).filter(p => p.geo?.lat && p.geo?.lng), [projects, statusFilter]);
  const notMappable = (projects || []).filter(p => !p.archived && !p.geo?.lat).length;

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, { zoomControl: true }).setView(PIN_BRUSSELS, 9);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '&copy; OpenStreetMap', maxZoom: 19 }).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Géocode les projets sans coords (réutilise l'utilitaire existant).
  useEffect(() => {
    if (!setProjects) return;
    let cancelled = false;
    const todo = (projects || []).filter(p => !p.archived && !p.geo?.lat && (p.address || p.city));
    if (!todo.length) return;
    geocodeProjects(todo, {}).then(res => {
      if (cancelled) return;
      setProjects(prev => prev.map(p => res[p.id] ? { ...p, geo: { lat: res[p.id].lat, lng: res[p.id].lng, geocoded_at: res[p.id].at } } : p));
    });
    return () => { cancelled = true; };
  }, [projects, setProjects]);

  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const ids = new Set(visible.map(p => String(p.id)));
    for (const [id, m] of Object.entries(markersRef.current)) { if (!ids.has(id)) { m.remove(); delete markersRef.current[id]; } }
    for (const p of visible) {
      const s = getStatus(p.statusId);
      const isSel = selected?.id === p.id;
      if (markersRef.current[p.id]) markersRef.current[p.id].setIcon(makeIcon(s.color, isSel));
      else markersRef.current[String(p.id)] = L.marker([p.geo.lat, p.geo.lng], { icon: makeIcon(s.color, isSel) }).addTo(map).on("click", () => setSelected(p));
    }
    if (visible.length) map.fitBounds(L.latLngBounds(visible.map(p => [p.geo.lat, p.geo.lng])), { padding: [60, 60], maxZoom: 13 });
  }, [visible, selected]);

  return (
    <div style={{ flex: 1, display: "flex", gap: tokens.space[4], minHeight: 0 }}>
      <div ref={elRef} style={{ flex: 1, minWidth: 0, borderRadius: tokens.radius.xl, border: `1px solid ${C.neutral[200]}`, overflow: "hidden", background: C.neutral[100] }} />
      <div style={{ width: 296, flexShrink: 0, display: "flex", flexDirection: "column", gap: tokens.space[3] }}>
        {selected ? (() => { const sig = projectSignal(selected); return (
          <div style={{ background: C.neutral[0], border: `1px solid ${C.neutral[200]}`, borderRadius: tokens.radius.xl, padding: tokens.space[4] }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
              <StatusPill statusId={selected.statusId} />
              <button onClick={() => setSelected(null)} aria-label="Fermer" style={{ marginLeft: "auto", width: 26, height: 26, borderRadius: tokens.radius.sm, border: "none", background: "transparent", color: C.neutral[500], cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><S d={IC.x} size={14} sw={2} /></button>
            </div>
            <div style={{ fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.bold, color: C.neutral[900], letterSpacing: "-0.3px", marginBottom: 3 }}>{selected.name}</div>
            {selected.client && <div style={{ fontSize: tokens.font.size.xs, color: C.neutral[500], marginBottom: 2 }}>MO : {selected.client}</div>}
            {(selected.address || selected.city) && <div style={{ fontSize: tokens.font.size.xs, color: C.neutral[500], marginBottom: 14 }}>{selected.address || selected.city}</div>}
            <div style={{ marginBottom: 14 }}><Tone {...sig} /></div>
            <Button variant="primary" size="md" fullWidth onClick={() => onOpen?.(selected.id)} rightIcon={<S d={IC.chev} size={15} sw={2} />}>Ouvrir le projet</Button>
          </div>
        ); })() : (
          <div style={{ background: C.neutral[100], border: `1px dashed ${C.neutral[300]}`, borderRadius: tokens.radius.xl, padding: tokens.space[5], color: C.neutral[500], fontSize: tokens.font.size.sm, textAlign: "center" }}>Clique un pin pour voir le détail du chantier.</div>
        )}
        {notMappable > 0 && (
          <div style={{ background: C.semantic.warning.bg, border: `1px solid ${C.semantic.warning.border}`, borderRadius: tokens.radius.lg, padding: "12px 14px", fontSize: tokens.font.size.xs, color: C.semantic.warning.fg, lineHeight: 1.5 }}>
            <b>{notMappable} chantier{notMappable > 1 ? "s" : ""} sans adresse</b> n'apparaî{notMappable > 1 ? "ssent" : "t"} pas. Renseigne l'adresse pour {notMappable > 1 ? "les" : "le"} voir ici.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Composant principal ──────────────────────────────────────
export function DashboardHome({ projects = [], profile, onOpenProject, onNewProject, setProjects }) {
  const [view, setView] = useState("list");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortByPriority, setSortByPriority] = useState(true);

  const active = useMemo(() => (projects || []).filter(p => !p.archived), [projects]);
  const counts = useMemo(() => { const c = { all: active.length }; for (const s of STATUSES) c[s.id] = active.filter(p => p.statusId === s.id).length; return c; }, [active]);

  const filtered = useMemo(() => {
    let r = active.filter(p => statusFilter === "all" || p.statusId === statusFilter);
    if (sortByPriority) r = [...r].sort((a, b) => severityRank[projectSignal(a).tone] - severityRank[projectSignal(b).tone]);
    else r = [...r].sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0)); // « récent » = ajout le plus récent (id croissant)
    return r;
  }, [active, statusFilter, sortByPriority]);

  // KPIs consolidés (uniquement sur données disponibles ; les signaux
  // différés — factures/réserves — n'apparaissent que si activés).
  const kpis = useMemo(() => {
    const urgent = active.reduce((n, p) => n + (p.actions || []).filter(a => a.open !== false && (a.urgent || a.priority === "urgent")).length, 0);
    const openTotal = active.reduce((n, p) => n + (p.actions || []).filter(a => a.open !== false).length, 0);
    const meetings = active.filter(p => within(p.nextMeeting, 7)).length;
    const list = [
      { label: "Chantiers actifs", value: active.filter(p => p.statusId !== "closed").length },
      { label: "Actions urgentes", value: urgent, tone: urgent > 0 ? "warning" : undefined },
    ];
    // NB : KPI « Factures en retard » retiré — il était codé en dur à 0 € avec un
    // ton "danger" (fausse alerte permanente). À réintroduire quand les données de
    // facturation seront chargées dans le dashboard (calcul réel des échéances).
    list.push({ label: "Réunions (7 j)", value: meetings });
    list.push({ label: "Actions ouvertes", value: openTotal });
    return list.slice(0, 4);
  }, [active]);

  const firstName = (profile?.name || "").trim().split(" ")[0];
  const now = new Date();
  const dateLabel = `${FDAY[now.getDay()]} ${now.getDate()} ${FMONTH[now.getMonth()]}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", fontFamily: tokens.font.family, color: C.neutral[900] }}>
      {/* En-tête éditorial */}
      <div style={{ display: "flex", alignItems: "flex-start", marginBottom: tokens.space[5], gap: tokens.space[4], flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.semibold, letterSpacing: "0.06em", textTransform: "uppercase", color: C.brand[600], marginBottom: 6 }}>{dateLabel} · bonne journée</div>
          <h1 style={{ margin: 0, fontSize: tokens.font.size["2xl"], fontWeight: tokens.font.weight.bold, letterSpacing: "-0.5px", color: C.neutral[900] }}>Bonjour{firstName ? ` ${firstName}` : ""} 👋</h1>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: tokens.space[2] }}>
          <ViewToggle view={view} onChange={setView} />
          <Button variant="primary" size="md" leftIcon={<S d={IC.plus} size={16} sw={2} />} onClick={onNewProject}>Nouveau projet</Button>
        </div>
      </div>

      {/* Chiffres-clés consolidés */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${kpis.length}, 1fr)`, gap: tokens.space[3], marginBottom: tokens.space[5] }}>
        {kpis.map((k, i) => <KpiCard key={i} {...k} />)}
      </div>

      {/* Filtres statut + tri */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: tokens.space[4], flexWrap: "wrap" }}>
        <Chip active={statusFilter === "all"} label="Tous" count={counts.all} onClick={() => setStatusFilter("all")} />
        {STATUSES.filter(s => counts[s.id] > 0).map(s => (
          <Chip key={s.id} active={statusFilter === s.id} label={s.label} count={counts[s.id]} dot={s.color} onClick={() => setStatusFilter(s.id)} />
        ))}
        <button onClick={() => setSortByPriority(v => !v)} style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 7, height: 32, padding: "0 12px", background: C.neutral[0], border: `1px solid ${C.neutral[200]}`, borderRadius: tokens.radius.md, fontFamily: "inherit", fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.medium, color: C.neutral[700], cursor: "pointer" }}>
          Trier : {sortByPriority ? "priorité" : "récent"}<S d={IC.down} size={13} sw={2} />
        </button>
      </div>

      {/* Contenu : liste ou carte */}
      {view === "list" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: tokens.space[4], alignItems: "start", paddingBottom: tokens.space[4] }}>
          {filtered.map(p => <ProjectCard key={p.id} p={p} onOpen={onOpenProject} />)}
          <GhostCard onClick={onNewProject} />
        </div>
      ) : (
        <div style={{ display: "flex", height: "calc(100vh - 320px)", minHeight: 440, maxHeight: 760 }}>
          <MapPanel projects={active} statusFilter={statusFilter} onOpen={onOpenProject} setProjects={setProjects} />
        </div>
      )}
    </div>
  );
}

// ── Preview /dashboard/demo ──────────────────────────────────
const DASH_MOCK = [
  { id: 1, name: "Hôtel de Ville", city: "Nivelles", client: "Ville de Nivelles", address: "Grand-Place 1, 1400 Nivelles", statusId: "construction", geo: { lat: 50.5977, lng: 4.3279 }, nextMeeting: "2026-06-30", actions: [{ open: true, urgent: true, due: "2026-06-20" }, { open: true, urgent: true, due: "2026-06-25" }, { open: true }] },
  { id: 2, name: "Villa Lambert", city: "Waterloo", client: "privé", statusId: "construction", geo: { lat: 50.7156, lng: 4.3991 }, nextMeeting: "2026-07-02", actions: [{ open: true, urgent: true, due: "2026-07-10" }, { open: true }] },
  { id: 3, name: "Écoles des Sources", city: "Genappe", client: "Commune de Genappe", statusId: "permit", geo: { lat: 50.6107, lng: 4.4517 }, actions: [{ open: true }, { open: true }] },
  { id: 4, name: "Bureaux Axis", city: "Louvain-la-Neuve", client: "Axis SA", statusId: "construction", geo: { lat: 50.6682, lng: 4.6118 }, actions: [] },
  { id: 5, name: "Maison Verte", city: "Ottignies", client: "privé", statusId: "preliminary", geo: { lat: 50.6647, lng: 4.5687 }, actions: [] },
  { id: 6, name: "Centre culturel", city: "Wavre", client: "Ville de Wavre", statusId: "sketch", actions: [] },
];
export function DashboardDemo() {
  const [projects, setProjects] = useState(DASH_MOCK);
  return (
    <div style={{ minHeight: "100dvh", background: C.neutral[50] }}>
      <div style={{ padding: "20px 28px", maxWidth: 1200, margin: "0 auto" }}>
        <DashboardHome projects={projects} setProjects={setProjects} profile={{ name: "Gaëlle Dupont" }} onOpenProject={() => { window.location.href = "/p/demo"; }} onNewProject={() => {}} />
      </div>
    </div>
  );
}
