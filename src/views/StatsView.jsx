import { useState } from "react";
import { useT } from "../i18n";
import { AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, RD, GR } from "../constants/tokens";
import { getStatus, calcLotStatus } from "../constants/statuses";
import { Ico, PvStatusBadge, KpiCard } from "../components/ui";
import { exportProjectsCSV, exportActionsCSV, exportRemarksCSV } from "../utils/csv";
import { hasFeature } from "../constants/config";

export function StatsView({ projects, profile, onBack, onSelectProject, onNewPV, onNewProject, onUpgrade }) {
  const t = useT();
  const active = projects.filter(p => !p.archived);
  const [showExport, setShowExport] = useState(false);

  // ── Compute all stats ──
  const openActions = projects.reduce((s, p) => s + (p.actions || []).filter(a => a.open).length, 0);
  const urgentActions = projects.reduce((s, p) => s + (p.actions || []).filter(a => a.open && a.urgent).length, 0);
  const totalLots = projects.reduce((s, p) => s + (p.lots?.length || 0), 0);
  const delayedLots = projects.reduce((s, p) => s + (p.lots || []).filter(l => calcLotStatus(l).id === "delayed").length, 0);

  // Urgent items across all projects
  const allUrgent = [];
  active.forEach(p => {
    (p.actions || []).filter(a => a.open && a.urgent).forEach(a => allUrgent.push({ type: "action", text: a.text, who: a.who, since: a.since, project: p }));
    (p.lots || []).filter(l => calcLotStatus(l).id === "delayed").forEach(l => allUrgent.push({ type: "delay", text: `${l.name} — en retard`, who: l.contractor, project: p }));
  });

  // PV needing action (drafts, not sent)
  const pvToResume = [];
  active.forEach(p => {
    (p.pvHistory || []).forEach(pv => {
      const st = pv.status || "draft";
      if (st === "draft" || st === "review") pvToResume.push({ ...pv, project: p });
    });
  });
  pvToResume.sort((a, b) => (b.date || "").localeCompare(a.date || "")).splice(6);

  // Meetings this week
  const now = new Date();
  const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7);
  const meetingsThisWeek = active.filter(p => {
    if (!p.nextMeeting) return false;
    const parts = p.nextMeeting.split("/");
    if (parts.length !== 3) return false;
    const d = new Date(parts[2], parts[1] - 1, parts[0]);
    return d >= now && d <= weekEnd;
  });

  // Project stats for table
  const projectStats = active.map(p => {
    const open = (p.actions || []).filter(a => a.open).length;
    const urgent = (p.actions || []).filter(a => a.open && a.urgent).length;
    const delayed = (p.lots || []).filter(l => calcLotStatus(l).id === "delayed").length;
    const st = getStatus(p.statusId);
    const lastPV = p.pvHistory?.[0];
    return { ...p, openActions: open, urgentActions: urgent, delayedLots: delayed, status: st, lastPV };
  }).sort((a, b) => b.urgentActions - a.urgentActions || b.openActions - a.openActions);

  // Lots needing attention
  const lotsToWatch = [];
  active.forEach(p => {
    (p.lots || []).forEach(l => {
      const st = calcLotStatus(l);
      if (st.id === "delayed" || st.id === "active") lotsToWatch.push({ ...l, lotStatus: st, project: p });
    });
  });
  lotsToWatch.sort((a, b) => (a.lotStatus.id === "delayed" ? 0 : 1) - (b.lotStatus.id === "delayed" ? 0 : 1)).splice(5);

  // Activity feed
  const activity = [];
  active.forEach(p => {
    (p.pvHistory || []).slice(0, 2).forEach(pv => activity.push({ type: "pv", text: `PV n°${pv.number} ${pv.imported ? "importé" : "rédigé"}`, date: pv.date, project: p }));
    (p.gallery || []).slice(-2).forEach(ph => activity.push({ type: "photo", text: "Photo ajoutée", date: ph.date ? new Date(ph.date).toLocaleDateString("fr-BE") : "", project: p }));
  });
  activity.sort((a, b) => (b.date || "").localeCompare(a.date || "")).splice(6);

  // Contractor performance
  const contractors = {};
  projects.forEach(p => { (p.actions || []).forEach(a => { const who = a.who?.trim(); if (!who) return; if (!contractors[who]) contractors[who] = { total: 0, open: 0, urgent: 0, closed: 0 }; contractors[who].total++; if (a.open) { contractors[who].open++; if (a.urgent) contractors[who].urgent++; } else contractors[who].closed++; }); });
  const contractorList = Object.entries(contractors).map(([name, s]) => ({ name, ...s })).sort((a, b) => b.open - a.open);

  const Bar = ({ value, max, color }) => (
    <div style={{ flex: 1, height: 6, background: SB2, borderRadius: 3, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${max > 0 ? (value / max) * 100 : 0}%`, background: color || AC, borderRadius: 3, transition: "width 0.3s" }} />
    </div>
  );
  const SectionTitle = ({ children, action }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
      <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3 }}>{children}</span>
      {action}
    </div>
  );
  const DashCard = ({ children, style: s = {} }) => (
    <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 14, padding: "16px 18px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", ...s }}>{children}</div>
  );

  // Upcoming meetings sorted by date
  const upcomingMeetings = active.filter(p => p.nextMeeting).map(p => {
    const parts = p.nextMeeting.split("/");
    const d = parts.length === 3 ? new Date(parts[2], parts[1] - 1, parts[0]) : null;
    return { project: p, date: d, dateStr: p.nextMeeting };
  }).filter(m => m.date && m.date >= now).sort((a, b) => a.date - b.date);

  // ═══════════════════════════════════════════════════
  // ══ MOBILE DASHBOARD ══
  // ═══════════════════════════════════════════════════
  if (typeof window !== "undefined" && window.innerWidth < 768) {
    return (
      <div style={{ animation: "fadeIn 0.2s ease", display: "flex", flexDirection: "column", gap: 10 }}>

        {/* 1. Urgences */}
        {allUrgent.length > 0 && (
          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: RD }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: "#B91C1C", flex: 1 }}>À traiter</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: RD }}>{allUrgent.length}</span>
            </div>
            {allUrgent.slice(0, 2).map((item, i) => (
              <div key={i} onClick={() => onSelectProject(item.project.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderTop: i > 0 ? "1px solid #FECACA40" : "none", cursor: "pointer" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#B91C1C", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.text}</div>
                  <div style={{ fontSize: 9, color: "#DC2626" }}>{item.project.name}{item.who ? ` · ${item.who}` : ""}</div>
                </div>
                <Ico name="arrowr" size={9} color="#DC2626" />
              </div>
            ))}
          </div>
        )}

        {/* 2. Prochaine réunion */}
        {upcomingMeetings.length > 0 && (
          <button onClick={() => onSelectProject(upcomingMeetings[0].project.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: ACL, border: `1px solid ${ACL2}`, borderRadius: 10, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: WH, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Ico name="calendar" size={14} color={AC} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: TX }}>{upcomingMeetings[0].dateStr}</div>
              <div style={{ fontSize: 10, color: TX3 }}>{upcomingMeetings[0].project.name}</div>
            </div>
            <Ico name="arrowr" size={10} color={AC} />
          </button>
        )}

        {/* 3. Projets — la vraie vue décisionnelle */}
        {projectStats.length > 0 && (
          <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "9px 12px", borderBottom: `1px solid ${SB2}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: TX }}>Mes projets</span>
              <button onClick={onNewProject} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", border: `1px solid ${SBB}`, borderRadius: 6, background: WH, cursor: "pointer", fontFamily: "inherit" }}>
                <Ico name="plus" size={10} color={TX3} />
                <span style={{ fontSize: 10, fontWeight: 600, color: TX2 }}>Nouveau</span>
              </button>
            </div>
            {projectStats.map((p, i) => {
              const attention = p.urgentActions + p.delayedLots;
              return (
                <div key={p.id} onClick={() => onSelectProject(p.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderBottom: i < projectStats.length - 1 ? `1px solid ${SB2}` : "none", cursor: "pointer" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                      <span style={{ fontSize: 8, fontWeight: 600, color: p.status.color, background: p.status.bg, padding: "1px 5px", borderRadius: 4 }}>{p.status.label}</span>
                      {p.nextMeeting && <span style={{ fontSize: 9, color: TX3 }}>{p.nextMeeting}</span>}
                    </div>
                  </div>
                  {attention > 0 && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 9, fontWeight: 700, color: RD, background: "#FEF2F2", padding: "2px 6px", borderRadius: 8 }}>
                      <span style={{ width: 4, height: 4, borderRadius: "50%", background: RD }} />{attention}
                    </span>
                  )}
                  {pvToResume.some(pv => pv.project.id === p.id) && (
                    <span style={{ fontSize: 8, fontWeight: 600, color: AC, background: ACL, padding: "2px 5px", borderRadius: 4 }}>PV</span>
                  )}
                  <Ico name="arrowr" size={9} color={TX3} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════
  // ══ DESKTOP DASHBOARD ══
  // ═══════════════════════════════════════════════════
  return (
    <div style={{ animation: "fadeIn 0.2s ease" }}>

      {/* ═══ 1. Header ═══ */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 8, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}><Ico name="back" color={TX2} /></button>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: TX, letterSpacing: "-0.3px" }}>Dashboard</div>
            <div style={{ fontSize: 12, color: TX3 }}>{active.length} projet{active.length > 1 ? "s" : ""} actif{active.length > 1 ? "s" : ""}{urgentActions > 0 ? ` · ${urgentActions} urgence${urgentActions > 1 ? "s" : ""}` : ""}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={onNewProject} style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 14px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 500, color: TX2 }}>
            <Ico name="plus" size={12} color={TX3} />Projet
          </button>
          <button onClick={() => { if (!hasFeature(profile?.plan, "exportCsv")) { onUpgrade?.("exportCsv"); return; } setShowExport(p => !p); }} style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 12px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", fontFamily: "inherit", fontSize: 12, color: TX3 }}>
            <Ico name="download" size={12} color={TX3} />
          </button>
        </div>
      </div>
      {showExport && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14, animation: "fadeIn 0.12s ease-out" }}>
          <button onClick={() => { exportProjectsCSV(projects); setShowExport(false); }} style={{ padding: "6px 12px", border: `1px solid ${SBB}`, borderRadius: 6, background: WH, cursor: "pointer", fontSize: 11, fontFamily: "inherit", color: TX2 }}>Projets CSV</button>
          <button onClick={() => { exportActionsCSV(projects); setShowExport(false); }} style={{ padding: "6px 12px", border: `1px solid ${SBB}`, borderRadius: 6, background: WH, cursor: "pointer", fontSize: 11, fontFamily: "inherit", color: TX2 }}>Actions CSV</button>
          <button onClick={() => { exportRemarksCSV(projects); setShowExport(false); }} style={{ padding: "6px 12px", border: `1px solid ${SBB}`, borderRadius: 6, background: WH, cursor: "pointer", fontSize: 11, fontFamily: "inherit", color: TX2 }}>Remarques CSV</button>
        </div>
      )}

      {/* ═══ 2. Urgences (hero) ═══ */}
      {allUrgent.length > 0 && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 14, padding: "16px 20px", marginBottom: 16 }}>
          <SectionTitle action={<span style={{ fontSize: 11, fontWeight: 600, color: RD }}>{allUrgent.length} point{allUrgent.length > 1 ? "s" : ""}</span>}>
            À traiter maintenant
          </SectionTitle>
          {allUrgent.slice(0, 5).map((item, i) => (
            <div key={i} onClick={() => onSelectProject(item.project.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: i > 0 ? "1px solid #FECACA40" : "none", cursor: "pointer" }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: item.type === "action" ? RD : AC, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#B91C1C" }}>{item.text}</div>
                <div style={{ fontSize: 10, color: "#DC2626" }}>{item.project.name}{item.who ? ` · ${item.who}` : ""}</div>
              </div>
              <Ico name="arrowr" size={11} color="#DC2626" />
            </div>
          ))}
        </div>
      )}

      {/* ═══ 3. Two-column layout ═══ */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>

        {/* ── Left: projets (la vraie vue) ── */}
        <div style={{ flex: "1 1 520px", display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>

          {/* Tableau projets */}
          <DashCard>
            <SectionTitle>Portefeuille projets</SectionTitle>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${SBB}` }}>
                    <th style={{ textAlign: "left", padding: "8px 6px", color: TX3, fontWeight: 600 }}>Projet</th>
                    <th style={{ textAlign: "center", padding: "8px 6px", color: TX3, fontWeight: 600 }}>Phase</th>
                    <th style={{ textAlign: "center", padding: "8px 6px", color: TX3, fontWeight: 600 }}>Alertes</th>
                    <th style={{ textAlign: "center", padding: "8px 6px", color: TX3, fontWeight: 600 }}>Réunion</th>
                    <th style={{ textAlign: "center", padding: "8px 6px", color: TX3, fontWeight: 600 }}>PV</th>
                    <th style={{ textAlign: "center", padding: "8px 6px", color: TX3, fontWeight: 600 }}>Avancement</th>
                    <th style={{ padding: "8px 4px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {projectStats.map(p => {
                    const attention = p.urgentActions + p.delayedLots;
                    const hasDraftPV = pvToResume.some(pv => pv.project.id === p.id);
                    return (
                      <tr key={p.id} onClick={() => onSelectProject(p.id)} className="plan-file-row" style={{ borderBottom: `1px solid ${SB}`, cursor: "pointer" }}>
                        <td style={{ padding: "10px 6px" }}>
                          <div style={{ fontWeight: 600, color: TX }}>{p.name}</div>
                          <div style={{ fontSize: 10, color: TX3, marginTop: 1 }}>{p.client || "—"}</div>
                        </td>
                        <td style={{ textAlign: "center", padding: "10px 6px" }}>
                          <span style={{ fontSize: 9, fontWeight: 600, color: p.status.color, background: p.status.bg, padding: "2px 7px", borderRadius: 5 }}>{p.status.label}</span>
                        </td>
                        <td style={{ textAlign: "center", padding: "10px 6px" }}>
                          {attention > 0 ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 700, color: RD, background: "#FEF2F2", padding: "2px 8px", borderRadius: 10 }}>
                              <span style={{ width: 5, height: 5, borderRadius: "50%", background: RD }} />{attention}
                            </span>
                          ) : (
                            <span style={{ fontSize: 10, color: GR, fontWeight: 600 }}>OK</span>
                          )}
                        </td>
                        <td style={{ textAlign: "center", padding: "10px 6px", fontSize: 11, color: p.nextMeeting ? TX : TX3 }}>
                          {p.nextMeeting || "—"}
                        </td>
                        <td style={{ textAlign: "center", padding: "10px 6px" }}>
                          {hasDraftPV ? (
                            <span style={{ fontSize: 9, fontWeight: 600, color: AC, background: ACL, padding: "2px 6px", borderRadius: 4 }}>Brouillon</span>
                          ) : (
                            <span style={{ fontSize: 10, color: TX3 }}>{p.pvHistory?.length || 0}</span>
                          )}
                        </td>
                        <td style={{ padding: "10px 6px", width: 90 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <Bar value={p.progress || 0} max={100} color={p.delayedLots > 0 ? RD : GR} />
                            <span style={{ fontSize: 10, fontWeight: 600, color: TX2, minWidth: 24 }}>{p.progress || 0}%</span>
                          </div>
                        </td>
                        <td style={{ padding: "10px 4px", textAlign: "right" }} onClick={e => e.stopPropagation()}>
                          <button onClick={() => onNewPV(p.id)} title="Nouveau PV" style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${ACL2}`, background: ACL, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Ico name="edit" size={11} color={AC} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </DashCard>

          {/* Lots à surveiller */}
          {lotsToWatch.length > 0 && (
            <DashCard>
              <SectionTitle action={<span style={{ fontSize: 10, color: TX3 }}>{totalLots} lots · {delayedLots} en retard</span>}>Planning chantier</SectionTitle>
              {lotsToWatch.map((l, i) => (
                <div key={i} onClick={() => onSelectProject(l.project.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: i > 0 ? `1px solid ${SB}` : "none", cursor: "pointer" }}>
                  <div style={{ width: 3, height: 24, borderRadius: 2, background: l.lotStatus.id === "delayed" ? RD : AC, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: TX }}>{l.name}</div>
                    <div style={{ fontSize: 10, color: TX3 }}>{l.project.name}{l.contractor ? ` · ${l.contractor}` : ""}</div>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 600, color: l.lotStatus.color, background: l.lotStatus.bg, padding: "2px 7px", borderRadius: 5 }}>{l.lotStatus.label}</span>
                </div>
              ))}
            </DashCard>
          )}
        </div>

        {/* ── Right column ── */}
        <div style={{ flex: "0 1 280px", display: "flex", flexDirection: "column", gap: 14, minWidth: 220 }}>

          {/* Prochaines réunions */}
          {upcomingMeetings.length > 0 && (
            <DashCard style={{ background: ACL, border: `1px solid ${ACL2}` }}>
              <SectionTitle>Réunions à venir</SectionTitle>
              {upcomingMeetings.slice(0, 4).map((m, i) => (
                <div key={i} onClick={() => onSelectProject(m.project.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: i > 0 ? `1px solid ${ACL2}` : "none", cursor: "pointer" }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: WH, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Ico name="calendar" size={12} color={AC} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: TX }}>{m.dateStr}</div>
                    <div style={{ fontSize: 10, color: TX3 }}>{m.project.name}</div>
                  </div>
                </div>
              ))}
            </DashCard>
          )}

          {/* PV à finaliser */}
          {pvToResume.length > 0 && (
            <DashCard>
              <SectionTitle action={<span style={{ fontSize: 10, fontWeight: 600, color: AC }}>{pvToResume.length}</span>}>
                PV à finaliser
              </SectionTitle>
              {pvToResume.slice(0, 4).map((pv, i) => (
                <div key={i} onClick={() => onSelectProject(pv.project.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: i > 0 ? `1px solid ${SB}` : "none", cursor: "pointer" }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: ACL, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Ico name="edit" size={10} color={AC} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>PV n°{pv.number} — {pv.project.name}</div>
                    <div style={{ fontSize: 9, color: TX3 }}>{pv.date}</div>
                  </div>
                  <PvStatusBadge status={pv.status} />
                </div>
              ))}
            </DashCard>
          )}

          {/* Intervenants à suivre */}
          {contractorList.filter(c => c.open > 0).length > 0 && (
            <DashCard>
              <SectionTitle>Intervenants à suivre</SectionTitle>
              {contractorList.filter(c => c.open > 0).slice(0, 6).map(c => (
                <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: `1px solid ${SB}` }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: c.urgent > 0 ? "#FEF2F2" : SB, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 9, fontWeight: 700, color: c.urgent > 0 ? RD : TX3 }}>
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: TX, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                  </div>
                  <span style={{ fontSize: 10, color: TX3 }}>{c.open} ouv.</span>
                  {c.urgent > 0 && <span style={{ fontSize: 9, fontWeight: 700, color: RD, background: "#FEF2F2", padding: "1px 5px", borderRadius: 3 }}>{c.urgent}!</span>}
                </div>
              ))}
            </DashCard>
          )}
        </div>
      </div>
    </div>
  );
}
