import { useState } from "react";
import { AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, RD, GR, BL, BLB, SP, FS, RAD } from "../constants/tokens";
import { calcLotStatus } from "../constants/statuses";
import { Ico } from "../components/ui";

export function PlanningDashboard({ projects, onBack, onSelectProject }) {
  const active = projects.filter(p => !p.archived);
  const [viewMode, setViewMode] = useState("week");
  const [filter, setFilter] = useState("all");
  const [filterProject, setFilterProject] = useState("all");
  const [selected, setSelected] = useState(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [mobileDetail, setMobileDetail] = useState(null);

  // ── Date helpers ──
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const parseDate = (str) => {
    if (!str) return null;
    if (str.includes("/")) { const p = str.split("/"); return p.length === 3 ? new Date(p[2], p[1] - 1, p[0]) : null; }
    const d = new Date(str); return isNaN(d.getTime()) ? null : d;
  };
  const fmtDay = (d) => d.toLocaleDateString("fr-BE", { weekday: "short", day: "numeric", month: "short" });
  const fmtShort = (d) => d.toLocaleDateString("fr-BE", { day: "numeric", month: "short" });
  const isSameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  // ── Week range ──
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1 + weekOffset * 7); // Monday
  const weekDays = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; });

  // ── Month range ──
  const monthStart = new Date(today.getFullYear(), today.getMonth() + (viewMode === "month" ? weekOffset : 0), 1);
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);

  // ── Gather all events ──
  const events = [];
  const src = filterProject === "all" ? active : active.filter(p => String(p.id) === String(filterProject));

  src.forEach(p => {
    // Meetings
    const md = parseDate(p.nextMeeting);
    if (md) events.push({ type: "meeting", title: "Réunion de chantier", project: p, date: md, icon: "calendar", color: BL, bg: BLB });

    // Actions with deadlines (use `since` as context, no explicit deadline field — show open urgent ones)
    (p.actions || []).filter(a => a.open).forEach(a => {
      events.push({ type: "action", title: a.text, project: p, date: md || today, who: a.who, urgent: a.urgent, since: a.since, icon: "alert", color: a.urgent ? RD : AC, bg: a.urgent ? "#FEF2F2" : ACL, actionData: a });
    });

    // Lots
    (p.lots || []).forEach(l => {
      const st = calcLotStatus(l);
      const start = parseDate(l.startDate);
      const end = parseDate(l.endDate);
      if (start || end) {
        events.push({ type: "lot", title: l.name, project: p, date: start || end, endDate: end, startDate: start, contractor: l.contractor, lotStatus: st, progress: l.progress || 0, icon: "gantt", color: st.color, bg: st.bg, lotData: l });
      }
    });

    // Alerts: lot delayed, meeting past without PV
    (p.lots || []).filter(l => calcLotStatus(l).id === "delayed").forEach(l => {
      events.push({ type: "alert", title: `${l.name} — en retard`, project: p, date: parseDate(l.endDate) || today, icon: "alert", color: RD, bg: "#FEF2F2" });
    });
    if (md && md < today && (!p.pvHistory?.length || p.pvHistory[0].status === "draft")) {
      events.push({ type: "alert", title: "Réunion passée sans PV finalisé", project: p, date: md, icon: "file", color: RD, bg: "#FEF2F2" });
    }
  });

  // ── Filter events ──
  const filtered = events.filter(e => {
    if (filter !== "all" && e.type !== filter) return false;
    return true;
  });

  // ── Events for a specific day ──
  const eventsForDay = (day) => filtered.filter(e => {
    if (e.type === "lot" && e.startDate && e.endDate) {
      return day >= e.startDate && day <= e.endDate;
    }
    return e.date && isSameDay(e.date, day);
  });

  // ── Events for today view ──
  const todayEvents = filtered.filter(e => {
    if (e.type === "lot" && e.startDate && e.endDate) return today >= e.startDate && today <= e.endDate;
    return e.date && isSameDay(e.date, today);
  });

  // ── Events for month view ──
  const monthEvents = filtered.filter(e => {
    const d = e.date;
    if (!d) return false;
    return d >= monthStart && d <= monthEnd;
  });

  // ── Summaries ──
  const meetingsWeek = events.filter(e => e.type === "meeting" && e.date >= weekDays[0] && e.date <= weekDays[6]).length;
  const actionsOpen = events.filter(e => e.type === "action").length;
  const lotsRisk = events.filter(e => e.type === "lot" && e.lotStatus?.id === "delayed").length;
  const alerts = events.filter(e => e.type === "alert").length;
  const typeLabel = { meeting: "Reunion", action: "Action", lot: "Lot", alert: "Alerte" };

  const typeIcon = { meeting: "calendar", action: "alert", lot: "gantt", alert: "alert" };
  const EventCard = ({ ev }) => {
    const isSel = selected === ev;
    return (
      <div onClick={() => setSelected(ev)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 6px", background: isSel ? ev.color + "14" : WH, border: `1px solid ${isSel ? ev.color + "50" : SBB + "80"}`, borderRadius: 6, cursor: "pointer", transition: "all 0.1s", marginBottom: 3, borderLeft: `3px solid ${ev.color}` }}>
        <Ico name={typeIcon[ev.type] || "file"} size={10} color={ev.color} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: isSel ? ev.color : TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.3 }}>{ev.title}</div>
          <div style={{ fontSize: 8, color: TX3, lineHeight: 1.2 }}>{ev.project.name}{ev.who ? ` · ${ev.who}` : ""}</div>
        </div>
        {ev.urgent && <div style={{ width: 5, height: 5, borderRadius: "50%", background: RD, flexShrink: 0, animation: "ring 2s ease infinite" }} />}
        {ev.lotStatus && ev.lotStatus.id === "delayed" && <div style={{ width: 5, height: 5, borderRadius: "50%", background: RD, flexShrink: 0 }} />}
      </div>
    );
  };

  const periodLabel = viewMode === "today" ? fmtDay(today) : viewMode === "week" ? `${fmtShort(weekDays[0])} — ${fmtShort(weekDays[6])}` : monthStart.toLocaleDateString("fr-BE", { month: "long", year: "numeric" });

  // ── Detail panel (kept for month view clicks) ──
  const DetailPanel = () => {
    if (!selected) return (
      <div style={{ padding: 20, textAlign: "center", color: TX3, fontSize: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", background: SB, display: "flex", alignItems: "center", justifyContent: "center", margin: "20px auto 10px" }}>
          <Ico name="calendar" size={18} color={TX3} />
        </div>
        Sélectionnez un ��lément pour voir ses détails
      </div>
    );
    const ev = selected;
    return (
      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: ev.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Ico name={ev.icon} size={15} color={ev.color} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: ev.color }}>{ev.type === "meeting" ? "Réunion" : ev.type === "action" ? "Action" : ev.type === "lot" ? "Lot" : "Alerte"}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: TX }}>{ev.title}</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Ico name="building" size={11} color={TX3} /><span style={{ color: TX2 }}>{ev.project.name}</span></div>
          {ev.date && <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Ico name="calendar" size={11} color={TX3} /><span style={{ color: TX2 }}>{fmtDay(ev.date)}{ev.endDate && !isSameDay(ev.date, ev.endDate) ? ` → ${fmtShort(ev.endDate)}` : ""}</span></div>}
          {ev.who && <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Ico name="users" size={11} color={TX3} /><span style={{ color: TX2 }}>{ev.who}</span></div>}
          {ev.since && <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Ico name="file" size={11} color={TX3} /><span style={{ color: TX3 }}>Source : {ev.since}</span></div>}
          {ev.contractor && <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Ico name="users" size={11} color={TX3} /><span style={{ color: TX2 }}>{ev.contractor}</span></div>}
          {ev.lotStatus && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: ev.lotStatus.color, background: ev.lotStatus.bg, padding: "2px 8px", borderRadius: 5 }}>{ev.lotStatus.label}</span>
              {ev.progress > 0 && <span style={{ fontSize: 10, color: TX3 }}>{ev.progress}%</span>}
            </div>
          )}
          {ev.urgent && <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: RD }} /><span style={{ fontSize: 11, fontWeight: 600, color: RD }}>Urgent</span></div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 16 }}>
          <button onClick={() => onSelectProject(ev.project.id)} style={{ width: "100%", padding: "9px 12px", border: "none", borderRadius: 8, background: AC, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Ico name="arrowr" size={11} color="#fff" />Ouvrir le projet
          </button>
        </div>
      </div>
    );
  };

  // ═══ MOBILE PLANNING ═══
  if (typeof window !== "undefined" && window.innerWidth < 768) {
    // Group events by day for agenda view
    const groupByDay = (evts) => {
      const groups = {};
      evts.forEach(ev => {
        if (ev.type === "lot" && ev.startDate && ev.endDate) {
          // Show lot on its start date only for cleaner list
          const key = ev.startDate.toDateString();
          if (!groups[key]) groups[key] = { date: ev.startDate, events: [] };
          groups[key].events.push(ev);
        } else if (ev.date) {
          const key = ev.date.toDateString();
          if (!groups[key]) groups[key] = { date: ev.date, events: [] };
          groups[key].events.push(ev);
        }
      });
      return Object.values(groups).sort((a, b) => a.date - b.date);
    };

    const dayLabel = (d) => {
      if (isSameDay(d, today)) return "Aujourd'hui";
      const tom = new Date(today); tom.setDate(tom.getDate() + 1);
      if (isSameDay(d, tom)) return "Demain";
      return d.toLocaleDateString("fr-BE", { weekday: "long", day: "numeric", month: "long" });
    };

    // Events for the selected period
    const mobileEvents = viewMode === "today" ? todayEvents
      : viewMode === "week" ? filtered.filter(e => { const d = e.date; if (!d) return false; return d >= weekDays[0] && d <= weekDays[6]; })
      : filtered.filter(e => { const d = e.date; if (!d) return false; const futureLimit = new Date(today); futureLimit.setDate(futureLimit.getDate() + 30); return d >= today && d <= futureLimit; });

    const grouped = groupByDay(mobileEvents);

    // Lot context helper
    const lotContext = (ev) => {
      if (!ev.lotStatus) return "";
      if (ev.lotStatus.id === "delayed") return "En retard";
      if (ev.lotStatus.id === "active") return "En cours";
      if (ev.startDate) {
        const tom = new Date(today); tom.setDate(tom.getDate() + 1);
        if (isSameDay(ev.startDate, today)) return "Demarre aujourd'hui";
        if (isSameDay(ev.startDate, tom)) return "Demarre demain";
      }
      return ev.lotStatus.label;
    };

    return (
      <div style={{ animation: "fadeIn 0.2s ease", display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Period switch — centered, prominent */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <div style={{ display: "flex", background: SB, borderRadius: 10, padding: 3, gap: 3, border: `1px solid ${SBB}` }}>
            {[{ id: "today", label: "Jour" }, { id: "week", label: "Semaine" }, { id: "month", label: "À venir" }].map(v => (
              <button key={v.id} onClick={() => { setViewMode(v.id); setWeekOffset(0); }} style={{ padding: "9px 22px", border: "none", borderRadius: 8, fontSize: 13, fontWeight: viewMode === v.id ? 700 : 500, cursor: "pointer", fontFamily: "inherit", background: viewMode === v.id ? WH : "transparent", color: viewMode === v.id ? AC : TX3, boxShadow: viewMode === v.id ? "0 2px 6px rgba(0,0,0,0.08)" : "none", transition: "all 0.12s" }}>{v.label}</button>
            ))}
          </div>
        </div>

        {/* Filter chips — centered */}
        <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
          {[
            { id: "all", label: "Tous", color: TX },
            { id: "meeting", label: "Réunions", color: BL },
            { id: "action", label: "Actions", color: AC },
            { id: "lot", label: "Lots", color: GR },
            { id: "alert", label: "Alertes", color: RD },
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", border: `1px solid ${filter === f.id ? f.color + "40" : SBB}`, borderRadius: 14, background: filter === f.id ? f.color + "10" : WH, cursor: "pointer", fontFamily: "inherit" }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: f.color, opacity: filter === f.id ? 1 : 0.3 }} />
              <span style={{ fontSize: 11, fontWeight: filter === f.id ? 700 : 500, color: filter === f.id ? f.color : TX3 }}>{f.label}</span>
            </button>
          ))}
        </div>

        {/* Agenda list */}
        {grouped.length === 0 ? (
          <div style={{ padding: "32px 0", textAlign: "center" }}>
            <Ico name="calendar" size={22} color={SBB} />
            <div style={{ fontSize: 12, color: TX3, marginTop: 6 }}>
              {viewMode === "today" ? "Rien de prevu aujourd'hui" : viewMode === "week" ? "Aucun evenement cette semaine" : "Rien a venir pour le moment"}
            </div>
            <div style={{ fontSize: 10, color: TX3, marginTop: 2 }}>
              {filter !== "all" ? "Essayez un autre filtre" : "Vos reunions et actions apparaitront ici"}
            </div>
          </div>
        ) : grouped.map((group, gi) => (
          <div key={gi}>
            {/* Day header */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 0 3px" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: isSameDay(group.date, today) ? AC : TX, textTransform: "capitalize" }}>{dayLabel(group.date)}</span>
              <div style={{ flex: 1, height: 1, background: isSameDay(group.date, today) ? AC + "30" : SBB }} />
              <span style={{ fontSize: 9, color: TX3 }}>{group.events.length} elem.</span>
            </div>
            {/* Events */}
            {group.events.map((ev, ei) => (
              <button key={ei} onClick={() => setMobileDetail(ev)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: WH, border: `1px solid ${SBB}`, borderRadius: 8, cursor: "pointer", fontFamily: "inherit", textAlign: "left", marginBottom: 6, borderLeft: `3px solid ${ev.color}` }}>
                <Ico name={typeIcon[ev.type] || "file"} size={13} color={ev.color} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ev.title}</div>
                  <div style={{ fontSize: 9, color: TX3, marginTop: 1, display: "flex", alignItems: "center", gap: 4 }}>
                    <span>{ev.project.name}</span>
                    {ev.who && <><span style={{ color: SBB }}>·</span><span>{ev.who}</span></>}
                    {ev.type === "lot" && <><span style={{ color: SBB }}>·</span><span style={{ color: ev.lotStatus?.id === "delayed" ? RD : ev.color, fontWeight: 600 }}>{lotContext(ev)}</span></>}
                  </div>
                </div>
                {ev.urgent && <div style={{ width: 5, height: 5, borderRadius: "50%", background: RD, flexShrink: 0 }} />}
                {ev.lotStatus && ev.lotStatus.id === "delayed" && <span style={{ fontSize: 7, fontWeight: 700, color: RD, background: "#FEF2F2", padding: "1px 4px", borderRadius: 3, flexShrink: 0 }}>!</span>}
                <Ico name="arrowr" size={8} color={SBB} />
              </button>
            ))}
          </div>
        ))}

        {/* Detail bottom sheet */}
        {mobileDetail && (
          <div style={{ position: "fixed", inset: 0, zIndex: 250, display: "flex", flexDirection: "column", justifyContent: "flex-end" }} onClick={() => setMobileDetail(null)}>
            <div style={{ background: "rgba(0,0,0,0.3)", position: "absolute", inset: 0 }} />
            <div onClick={e => e.stopPropagation()} style={{ position: "relative", background: WH, borderRadius: "20px 20px 0 0", animation: "sheetUp 0.25s ease-out", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: SBB, margin: `${SP.md}px auto ${SP.sm}px` }} />
              {(() => { const ev = mobileDetail; return (
                <div style={{ padding: `0 ${SP.lg}px ${SP.lg}px` }}>
                  {/* Type + title */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: ev.bg || ev.color + "14", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Ico name={typeIcon[ev.type] || "file"} size={15} color={ev.color} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: ev.color }}>{typeLabel[ev.type]}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: TX }}>{ev.title}</div>
                    </div>
                  </div>
                  {/* Meta */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16, fontSize: 13 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}><Ico name="building" size={13} color={TX3} /><span style={{ color: TX2 }}>{ev.project.name}</span></div>
                    {ev.date && <div style={{ display: "flex", alignItems: "center", gap: 7 }}><Ico name="calendar" size={13} color={TX3} /><span style={{ color: TX2 }}>{fmtDay(ev.date)}{ev.endDate && !isSameDay(ev.date, ev.endDate) ? ` → ${fmtShort(ev.endDate)}` : ""}</span></div>}
                    {ev.who && <div style={{ display: "flex", alignItems: "center", gap: 7 }}><Ico name="users" size={13} color={TX3} /><span style={{ color: TX2 }}>{ev.who}</span></div>}
                    {ev.contractor && <div style={{ display: "flex", alignItems: "center", gap: 7 }}><Ico name="users" size={13} color={TX3} /><span style={{ color: TX2 }}>{ev.contractor}</span></div>}
                    {ev.since && <div style={{ display: "flex", alignItems: "center", gap: 7 }}><Ico name="file" size={13} color={TX3} /><span style={{ color: TX3 }}>{ev.since}</span></div>}
                    {ev.lotStatus && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: ev.lotStatus.color, background: ev.lotStatus.bg, padding: "3px 10px", borderRadius: 6 }}>{ev.lotStatus.label}</span>
                        {ev.progress > 0 && <span style={{ fontSize: 11, color: TX3 }}>{ev.progress}%</span>}
                      </div>
                    )}
                    {ev.urgent && (
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: RD }} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: RD }}>Urgent</span>
                      </div>
                    )}
                  </div>
                  {/* CTA */}
                  <button onClick={() => { setMobileDetail(null); onSelectProject(ev.project.id); }} style={{ width: "100%", padding: "12px 16px", border: "none", borderRadius: 10, background: AC, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    Ouvrir le projet <Ico name="arrowr" size={12} color="#fff" />
                  </button>
                </div>
              ); })()}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═══ DESKTOP PLANNING ═══
  return (
    <div style={{ animation: "fadeIn 0.2s ease" }}>
      {/* Unified top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: 6, display: "flex", alignItems: "center" }}><Ico name="back" color={TX2} size={16} /></button>
          <span style={{ fontSize: 18, fontWeight: 800, color: TX, letterSpacing: "-0.3px" }}>Planning</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ display: "flex", background: SB, borderRadius: 8, padding: 2, gap: 2 }}>
            {[{ id: "today", label: "Jour" }, { id: "week", label: "Semaine" }, { id: "month", label: "Mois" }].map(v => (
              <button key={v.id} onClick={() => { setViewMode(v.id); setWeekOffset(0); }} style={{ padding: "5px 10px", border: "none", borderRadius: 6, fontSize: 11, fontWeight: viewMode === v.id ? 700 : 500, cursor: "pointer", fontFamily: "inherit", background: viewMode === v.id ? WH : "transparent", color: viewMode === v.id ? TX : TX3, boxShadow: viewMode === v.id ? "0 1px 3px rgba(0,0,0,0.06)" : "none", transition: "all 0.12s" }}>{v.label}</button>
            ))}
          </div>
          <div style={{ width: 1, height: 20, background: SBB }} />
          <button onClick={() => setWeekOffset(o => o - 1)} style={{ width: 28, height: 28, border: `1px solid ${SBB}`, borderRadius: 6, background: WH, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Ico name="back" size={11} color={TX3} /></button>
          <span style={{ fontSize: 12, fontWeight: 600, color: TX, minWidth: 130, textAlign: "center" }}>{periodLabel}</span>
          <button onClick={() => setWeekOffset(o => o + 1)} style={{ width: 28, height: 28, border: `1px solid ${SBB}`, borderRadius: 6, background: WH, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Ico name="arrowr" size={11} color={TX3} /></button>
          {weekOffset !== 0 && <button onClick={() => setWeekOffset(0)} style={{ padding: "4px 10px", border: `1px solid ${SBB}`, borderRadius: 6, background: WH, cursor: "pointer", fontFamily: "inherit", fontSize: 10, fontWeight: 600, color: AC }}>Aujourd'hui</button>}
          <div style={{ width: 1, height: 20, background: SBB }} />
          <select value={filterProject} onChange={e => setFilterProject(e.target.value)} style={{ padding: "5px 10px", border: `1px solid ${SBB}`, borderRadius: 6, fontSize: 11, fontFamily: "inherit", background: WH, color: TX, cursor: "pointer" }}>
            <option value="all">Tous les projets</option>
            {active.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      {/* 3-column layout */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>

        {/* ─��� Left column: filters + summary ─�� */}
        <div style={{ width: 150, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Type filters with counts */}
          <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 10, padding: 8 }}>
            {[
              { id: "all", label: "Tous", color: TX, count: filtered.length },
              { id: "meeting", label: "Reunions", color: BL, count: events.filter(e => e.type === "meeting").length },
              { id: "action", label: "Actions", color: AC, count: events.filter(e => e.type === "action").length },
              { id: "lot", label: "Lots", color: GR, count: events.filter(e => e.type === "lot").length },
              { id: "alert", label: "Alertes", color: RD, count: events.filter(e => e.type === "alert").length },
            ].map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", border: "none", borderRadius: 6, background: filter === f.id ? f.color + "10" : "transparent", cursor: "pointer", fontFamily: "inherit", transition: "all 0.1s" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: f.color, flexShrink: 0, opacity: filter === f.id ? 1 : 0.4 }} />
                <span style={{ flex: 1, textAlign: "left", fontSize: 11, fontWeight: filter === f.id ? 600 : 400, color: filter === f.id ? f.color : TX2 }}>{f.label}</span>
                <span style={{ fontSize: 9, fontWeight: 600, color: filter === f.id ? f.color : TX3 }}>{f.count}</span>
              </button>
            ))}
          </div>
          {/* Summary */}
          <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 10, padding: 8 }}>
            <div style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: TX3, marginBottom: 6 }}>Synthese</div>
            {[
              { v: meetingsWeek, label: "reunion", color: BL },
              { v: actionsOpen, label: "action", color: AC },
              { v: lotsRisk, label: "lot a risque", color: lotsRisk > 0 ? RD : GR },
              ...(alerts > 0 ? [{ v: alerts, label: "alerte", color: RD }] : []),
            ].map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, padding: "2px 0" }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: s.color, minWidth: 14, textAlign: "right" }}>{s.v}</span>
                <span style={{ fontSize: 9, color: TX3 }}>{s.label}{s.v !== 1 ? "s" : ""}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Center: main planning view ── */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* ── TODAY VIEW ── */}
          {viewMode === "today" && (
            <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: TX, marginBottom: 10 }}>Aujourd'hui — {fmtDay(today)}</div>
              {todayEvents.length === 0 ? (
                <div style={{ padding: "20px 0", textAlign: "center", color: TX3, fontSize: 12 }}>Aucun événement aujourd'hui</div>
              ) : todayEvents.map((ev, i) => <EventCard key={i} ev={ev} />)}
            </div>
          )}

          {/* ── WEEK VIEW ── */}
          {viewMode === "week" && (
            <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 10, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: `2px solid ${SBB}` }}>
                {weekDays.map((day, di) => { const isT = isSameDay(day, today); const isWe = di >= 5; return (
                  <div key={di} style={{ padding: "10px 4px 8px", textAlign: "center", background: isT ? AC + "08" : isWe ? SB : "transparent", borderRight: di < 6 ? `1px solid ${SB2}` : "none" }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: isT ? AC : isWe ? TX3 : TX2, textTransform: "uppercase", letterSpacing: "0.04em" }}>{day.toLocaleDateString("fr-BE", { weekday: "short" })}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: isT ? AC : isWe ? TX3 : TX, lineHeight: 1.2, marginTop: 1 }}>
                      {isT ? <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "50%", background: AC, color: "#fff" }}>{day.getDate()}</span> : day.getDate()}
                    </div>
                  </div>
                ); })}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", minHeight: 380 }}>
                {weekDays.map((day, di) => { const dayEv = eventsForDay(day); const isT = isSameDay(day, today); const isWe = di >= 5; return (
                  <div key={di} style={{ padding: "6px 4px", borderRight: di < 6 ? `1px solid ${SB2}` : "none", background: isT ? AC + "04" : isWe ? SB + "80" : "transparent" }}>
                    {dayEv.length === 0 && <div style={{ fontSize: 9, color: SBB, textAlign: "center", paddingTop: 20 }}>—</div>}
                    {dayEv.map((ev, i) => <EventCard key={i} ev={ev} />)}
                  </div>
                ); })}
              </div>
            </div>
          )}

          {/* ── MONTH VIEW ── */}
          {viewMode === "month" && (() => {
            const firstDay = new Date(monthStart);
            const startPad = (firstDay.getDay() + 6) % 7;
            const totalDays = monthEnd.getDate();
            const cells = [];
            for (let i = 0; i < startPad; i++) cells.push(null);
            for (let i = 1; i <= totalDays; i++) cells.push(new Date(monthStart.getFullYear(), monthStart.getMonth(), i));
            return (
              <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 10, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: `1px solid ${SBB}` }}>
                  {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map(d => (
                    <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 600, color: TX3, padding: "8px 4px" }}>{d}</div>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
                  {cells.map((day, i) => {
                    if (!day) return <div key={i} style={{ borderRight: `1px solid ${SB2}`, borderBottom: `1px solid ${SB2}` }} />;
                    const dayEv = eventsForDay(day);
                    const isT = isSameDay(day, today);
                    return (
                      <div key={i} onClick={() => dayEv.length > 0 && setSelected(dayEv[0])} style={{ padding: "4px 3px", minHeight: 60, borderRight: `1px solid ${SB2}`, borderBottom: `1px solid ${SB2}`, cursor: dayEv.length > 0 ? "pointer" : "default", background: isT ? AC + "06" : "transparent" }}>
                        <div style={{ fontSize: 10, fontWeight: isT ? 700 : 400, color: isT ? AC : TX2, marginBottom: 2 }}>{day.getDate()}</div>
                        {dayEv.slice(0, 2).map((ev, j) => (
                          <div key={j} style={{ fontSize: 8, fontWeight: 600, color: ev.color, background: ev.bg, padding: "1px 4px", borderRadius: 3, marginBottom: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ev.title}</div>
                        ))}
                        {dayEv.length > 2 && <div style={{ fontSize: 7, color: TX3 }}>+{dayEv.length - 2}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>

        {/* ── Right column: detail panel ── */}
        <div style={{ width: 200, flexShrink: 0, position: "sticky", top: 72 }}>
          <div style={{ background: WH, border: `1px solid ${selected ? selected.color + "30" : SBB}`, borderRadius: 10, transition: "border-color 0.15s" }}>
          {!selected ? (
            <div style={{ padding: "28px 16px", textAlign: "center" }}>
              <Ico name="calendar" size={20} color={SBB} />
              <div style={{ fontSize: 11, color: TX3, marginTop: 8 }}>Cliquez sur un element</div>
            </div>
          ) : (() => { const ev = selected; return (
            <div style={{ padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: ev.color }}>{typeLabel[ev.type]}</span>
                <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}><Ico name="x" size={12} color={TX3} /></button>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: TX, marginBottom: 10, lineHeight: 1.3 }}>{ev.title}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11, marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}><Ico name="building" size={10} color={TX3} /><span style={{ color: TX2 }}>{ev.project.name}</span></div>
                {ev.date && <div style={{ display: "flex", alignItems: "center", gap: 5 }}><Ico name="calendar" size={10} color={TX3} /><span style={{ color: TX2 }}>{fmtShort(ev.date)}{ev.endDate && !isSameDay(ev.date, ev.endDate) ? ` → ${fmtShort(ev.endDate)}` : ""}</span></div>}
                {ev.who && <div style={{ display: "flex", alignItems: "center", gap: 5 }}><Ico name="users" size={10} color={TX3} /><span style={{ color: TX2 }}>{ev.who}</span></div>}
                {ev.contractor && <div style={{ display: "flex", alignItems: "center", gap: 5 }}><Ico name="users" size={10} color={TX3} /><span style={{ color: TX2 }}>{ev.contractor}</span></div>}
                {ev.since && <div style={{ display: "flex", alignItems: "center", gap: 5 }}><Ico name="file" size={10} color={TX3} /><span style={{ color: TX3 }}>{ev.since}</span></div>}
                {ev.lotStatus && <span style={{ alignSelf: "flex-start", fontSize: 9, fontWeight: 600, color: ev.lotStatus.color, background: ev.lotStatus.bg, padding: "2px 7px", borderRadius: 4 }}>{ev.lotStatus.label}{ev.progress > 0 ? ` · ${ev.progress}%` : ""}</span>}
                {ev.urgent && <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 5, height: 5, borderRadius: "50%", background: RD }} /><span style={{ fontSize: 10, fontWeight: 600, color: RD }}>Urgent</span></div>}
              </div>
              <button onClick={() => onSelectProject(ev.project.id)} style={{ width: "100%", padding: "8px 10px", border: "none", borderRadius: 7, background: AC, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>Ouvrir le projet <Ico name="arrowr" size={10} color="#fff" /></button>
            </div>
          ); })()}
          </div>
        </div>
      </div>
    </div>
  );
}
