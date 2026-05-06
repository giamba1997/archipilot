import { useState, useMemo } from "react";
import { AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, BR, BRB } from "../constants/tokens";
import { Ico } from "../components/ui";
import { formatDuration, totalSecondsFor, groupSessionsByUser } from "../utils/timer";
import { downloadCSV } from "../utils/csv";

const dayLabel = (iso) => new Date(iso).toLocaleDateString("fr-BE", { weekday: "short", day: "2-digit", month: "short" });
const timeLabel = (iso) => new Date(iso).toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" });

const startOfWeek = (d = new Date()) => {
  const day = new Date(d);
  const dow = (day.getDay() + 6) % 7; // Monday = 0
  day.setDate(day.getDate() - dow);
  day.setHours(0, 0, 0, 0);
  return day;
};
const startOfMonth = (d = new Date()) => {
  const m = new Date(d.getFullYear(), d.getMonth(), 1);
  m.setHours(0, 0, 0, 0);
  return m;
};

// Vue cross-projets de toutes les sessions de l'utilisateur (ou de toute l'agence
// quand admin org). Stats par période + breakdown par projet + liste détaillée.
export function TimesheetView({ projects, profile, isOrgAdmin, activeContext, onBack, onSelectProject, onSwitchToCalendar }) {
  const [scope, setScope] = useState(isOrgAdmin ? "team" : "mine"); // "mine" | "team"

  // Aggrège toutes les sessions de tous les projets, en associant chaque session à son projet.
  const allSessions = useMemo(() => {
    const out = [];
    for (const p of projects) {
      for (const s of (p.timeSessions || [])) {
        out.push({ ...s, _project: p });
      }
    }
    return out.sort((a, b) => (b.startedAt || "").localeCompare(a.startedAt || ""));
  }, [projects]);

  // Filtre par scope (mine / team)
  const filtered = useMemo(() => {
    if (scope === "team") return allSessions;
    return allSessions.filter(s => {
      // "Mine" = sessions avec userId == moi, ou pas de userId (legacy avant le tag user)
      if (!s.userId && !s.userName) return true;
      if (profile?.id && s.userId === profile.id) return true;
      if (profile?.name && s.userName === profile.name) return true;
      return false;
    });
  }, [allSessions, scope, profile]);

  // Périodes
  const now = new Date();
  const weekStart = startOfWeek(now);
  const monthStart = startOfMonth(now);
  const inWeek = filtered.filter(s => new Date(s.startedAt) >= weekStart);
  const inMonth = filtered.filter(s => new Date(s.startedAt) >= monthStart);

  // Breakdown par projet
  const byProject = useMemo(() => {
    const map = new Map();
    for (const s of filtered) {
      const key = s._project.id;
      const ex = map.get(key) || { project: s._project, totalSeconds: 0, sessions: [] };
      ex.totalSeconds += s.durationSeconds || 0;
      ex.sessions.push(s);
      map.set(key, ex);
    }
    return [...map.values()].sort((a, b) => b.totalSeconds - a.totalSeconds);
  }, [filtered]);

  const handleExport = () => {
    if (filtered.length === 0) return;
    const headers = ["Date", "Projet", "Membre", "Début", "Fin", "Durée (h)", "Note", "Saisie"];
    const rows = filtered.map(s => [
      new Date(s.startedAt).toLocaleDateString("fr-BE"),
      s._project.name || "",
      s.userName || "—",
      timeLabel(s.startedAt),
      timeLabel(s.endedAt),
      (s.durationSeconds / 3600).toFixed(2),
      s.note || "",
      s.isManual ? "Manuelle" : "Timer",
    ]);
    downloadCSV(`temps-${scope === "team" ? "agence" : "moi"}-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };

  return (
    <div style={{ animation: "fadeIn 0.2s ease" }}>
      {/* Header — aligné avec StatsView et PlanningDashboard pour cohérence */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 8, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Ico name="back" color={TX2} />
          </button>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: TX, letterSpacing: "-0.3px" }}>Vue d'ensemble</div>
            <div style={{ fontSize: 12, color: TX3 }}>
              {filtered.length} session{filtered.length > 1 ? "s" : ""} · {formatDuration(totalSecondsFor(filtered)) || "0min"} cumulées
            </div>
          </div>
        </div>
        {/* Toggle 2 modes — Calendrier · Temps */}
        <div style={{ display: "inline-flex", background: SB, border: `1px solid ${SBB}`, borderRadius: 8, padding: 2, gap: 1 }}>
          <button onClick={onSwitchToCalendar} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", border: "none", borderRadius: 6, background: "transparent", cursor: "pointer", fontFamily: "inherit", transition: "background 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.background = SB2}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            <Ico name="calendar" size={12} color={TX3} />
            <span style={{ fontSize: 12, fontWeight: 500, color: TX2 }}>Calendrier</span>
          </button>
          <button aria-pressed="true" style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", border: "none", borderRadius: 6, background: WH, cursor: "default", fontFamily: "inherit", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
            <Ico name="clock" size={12} color={AC} />
            <span style={{ fontSize: 12, fontWeight: 600, color: AC }}>Temps</span>
          </button>
        </div>
        {/* Right actions */}
        <div style={{ display: "flex", gap: 6 }}>
          {filtered.length > 0 && (
            <button onClick={handleExport} title="Exporter en CSV"
              style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "8px 12px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, fontSize: 12, color: TX2, cursor: "pointer", fontFamily: "inherit", minHeight: 36 }}>
              <Ico name="download" size={12} color={TX3} />CSV
            </button>
          )}
        </div>
      </div>

      {/* Toggle scope — Mine vs Team (admin org seulement) */}
      {isOrgAdmin && (
        <div style={{ display: "inline-flex", background: SB, border: `1px solid ${SBB}`, borderRadius: 8, padding: 2, gap: 1, marginBottom: 14 }}>
          {[
            { id: "mine", label: "Mon temps", icon: "user" },
            { id: "team", label: "Toute l'agence", icon: "users" },
          ].map(opt => {
            const active = scope === opt.id;
            return (
              <button key={opt.id} onClick={() => setScope(opt.id)} aria-pressed={active}
                style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", border: "none", borderRadius: 6,
                  background: active ? WH : "transparent", cursor: active ? "default" : "pointer", fontFamily: "inherit",
                  boxShadow: active ? "0 1px 2px rgba(0,0,0,0.05)" : "none" }}>
                <Ico name={opt.icon} size={11} color={active ? AC : TX3} />
                <span style={{ fontSize: 11, fontWeight: active ? 700 : 500, color: active ? AC : TX2 }}>{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* KPI cards — total, semaine, mois */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 18 }}>
        {[
          { label: "Cette semaine", seconds: totalSecondsFor(inWeek), count: inWeek.length, accent: true },
          { label: "Ce mois", seconds: totalSecondsFor(inMonth), count: inMonth.length, accent: false },
          { label: "Total cumulé", seconds: totalSecondsFor(filtered), count: filtered.length, accent: false },
        ].map((k, i) => (
          <div key={i} style={{
            background: WH, border: `1px solid ${k.accent ? ACL2 : SBB}`,
            borderRadius: 12, padding: "14px 16px",
            boxShadow: k.accent ? `0 1px 3px ${AC}18` : "none",
          }}>
            <div style={{ fontSize: 11, color: TX3, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
              {k.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: k.accent ? AC : TX, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
              {k.seconds > 0 ? formatDuration(k.seconds) : "—"}
            </div>
            <div style={{ fontSize: 11, color: TX3, marginTop: 2 }}>
              {k.count} session{k.count > 1 ? "s" : ""}
            </div>
          </div>
        ))}
      </div>

      {/* Breakdown par projet */}
      <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 12, overflow: "hidden", marginBottom: 18 }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${SB2}`, fontSize: 12, fontWeight: 700, color: TX, letterSpacing: "-0.1px" }}>
          Par projet
        </div>
        {byProject.length === 0 ? (
          <div style={{ padding: "24px 16px", textAlign: "center", color: TX3, fontSize: 13 }}>
            Aucune session enregistrée pour le moment.
          </div>
        ) : (
          byProject.map((g, i) => (
            <button key={g.project.id} onClick={() => onSelectProject(g.project.id)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderTop: i > 0 ? `1px solid ${SB2}` : "none", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "background 0.1s" }}
              onMouseEnter={e => e.currentTarget.style.background = SB}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {g.project.name}
                </div>
                <div style={{ fontSize: 11, color: TX3, marginTop: 2 }}>
                  {g.sessions.length} session{g.sessions.length > 1 ? "s" : ""}
                  {g.project.client ? ` · ${g.project.client}` : ""}
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: TX, fontVariantNumeric: "tabular-nums" }}>
                {formatDuration(g.totalSeconds)}
              </div>
              <Ico name="arrowr" size={11} color={TX3} />
            </button>
          ))
        )}
      </div>

      {/* Sessions récentes (10 dernières) */}
      {filtered.length > 0 && (
        <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${SB2}`, fontSize: 12, fontWeight: 700, color: TX, letterSpacing: "-0.1px" }}>
            Sessions récentes
          </div>
          {filtered.slice(0, 12).map((s, i) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderTop: i > 0 ? `1px solid ${SB2}` : "none" }}>
              <div style={{ minWidth: 90, fontSize: 11, color: TX3, fontWeight: 600 }}>{dayLabel(s.startedAt)}</div>
              <div style={{ minWidth: 90, fontSize: 13, fontWeight: 700, color: TX, fontVariantNumeric: "tabular-nums" }}>
                {formatDuration(s.durationSeconds)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <button onClick={() => onSelectProject(s._project.id)} style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: TX }}>{s._project.name}</span>
                  {s.note && <span style={{ fontSize: 11, color: TX2, marginLeft: 6 }}> · {s.note}</span>}
                </button>
              </div>
              {scope === "team" && s.userName && (
                <span style={{ fontSize: 10, color: TX3, fontStyle: "italic" }}>{s.userName}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
