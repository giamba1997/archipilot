import { useState, useMemo } from "react";
import { useT } from "../i18n";
import { AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, RD, GR, SP, FS, LH, RAD, GRBG, REDBG, REDBRD, BL, BLB, TE, TEB } from "../constants/tokens";
import { getStatus, STATUSES, nextPvStatus } from "../constants/statuses";
const updateProjectField = (project, setProjects, field, value) => setProjects(prev => prev.map(p => p.id === project.id ? { ...p, [field]: value } : p));
import { RECURRENCES } from "../constants/templates";
import { Ico, Modal, Field, StatusBadge, PvStatusBadge, KpiCard } from "../components/ui";
import { relativeDate } from "../utils/dates";
import { formatAddress } from "../utils/address";
import { getPvDrafts, removePvDraft } from "../utils/offline";
import { isReadOnly, canEdit, canManageMembers } from "../components/modals/CollabModal";
import { WeatherWidget } from "./WeatherWidget";
import { MeetingCard, MEETING_MODES } from "./MeetingCard";
import { PvRow, SmallBtn } from "./PvRow";
import { CollabModalWrapper } from "../components/modals/CollabModalWrapper";
import { usePresence } from "../hooks/usePresence";

// Compact stack of avatars for live presence — shows up to 4 distinct
// users currently on the project, with a +N pill if there are more.
function PresenceAvatars({ present, selfId }) {
  // De-duplicate by user_id and exclude self.
  const others = [];
  const seen = new Set();
  for (const u of present) {
    if (u.user_id === selfId) continue;
    if (seen.has(u.user_id)) continue;
    seen.add(u.user_id);
    others.push(u);
  }
  if (others.length === 0) return null;
  const visible = others.slice(0, 4);
  const overflow = others.length - visible.length;
  const initials = (name) => (name || "?").trim().split(/\s+/).map(s => s[0] || "").join("").slice(0, 2).toUpperCase();
  const titleAll = others.map(u => `${u.name || "?"}${u.viewing && u.viewing !== "overview" ? " · " + u.viewing : ""}`).join("\n");
  return (
    <div title={titleAll} style={{ display: "flex", alignItems: "center" }}>
      {visible.map((u, i) => (
        <div key={u.user_id}
          style={{
            width: 24, height: 24, borderRadius: "50%",
            border: `2px solid ${WH}`,
            background: u.avatar ? `url(${u.avatar}) center/cover` : SB2,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 9, fontWeight: 700, color: TX2,
            marginLeft: i === 0 ? 0 : -7,
            position: "relative", zIndex: visible.length - i,
          }}>
          {!u.avatar && initials(u.name)}
        </div>
      ))}
      {overflow > 0 && (
        <div style={{ marginLeft: -7, height: 24, padding: "0 7px", borderRadius: 12, background: SB, border: `2px solid ${WH}`, fontSize: 10, fontWeight: 700, color: TX2, display: "flex", alignItems: "center" }}>
          +{overflow}
        </div>
      )}
    </div>
  );
}

const Card = ({ children, style = {} }) => (
  <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: RAD.xl, padding: `${SP.lg}px ${SP.lg + 2}px`, ...style }}>{children}</div>
);
const CardHeader = ({ title, action }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: SP.md }}>
    <span role="heading" aria-level="2" style={{ fontSize: FS.md, fontWeight: 700, color: TX, lineHeight: LH.tight }}>{title}</span>
    {action}
  </div>
);

export function Overview({ project, onStartNotes, onEditInfo, onEditParticipants, onViewPV, onViewPdf, onViewPlan, onViewPlanning, onViewChecklists, onOpr, onArchive, onDuplicate, onImportPV, setProjects, onCollab, onGallery, activeContext, profile }) {
  const _readOnly = isReadOnly(project);
  const _canEdit = canEdit(project);
  const _canManage = canManageMembers(project);
  // Live presence — only meaningful when the project is shared via an
  // organization. Personal projects don't broadcast presence.
  const presenceKey = activeContext?.startsWith?.("org:")
    ? `presence:${activeContext}:project:${project.id}`
    : null;
  const presenceInfo = useMemo(() => ({
    name: profile?.name || "",
    avatar: profile?.picture || null,
    viewing: "overview",
  }), [profile?.name, profile?.picture]);
  const { present, selfId } = usePresence(presenceKey, presenceInfo);
  const updatePvStatus = (pvNum, newStatus) => setProjects(prev => prev.map(p => p.id === project.id ? { ...p, pvHistory: p.pvHistory.map(pv => pv.number === pvNum ? { ...pv, status: newStatus } : pv) } : p));
  const urgent = project.actions.filter((a) => a.urgent && a.open);
  const toggleAction = (aid) => setProjects((prev) => prev.map((p) => p.id === project.id ? { ...p, actions: p.actions.map((a) => a.id === aid ? { ...a, open: !a.open } : a) } : p));
  const rec = RECURRENCES.find((r) => r.id === project.recurrence);
  const t = useT();
  const [showAllPV, setShowAllPV] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
  const [mobileSheet, setMobileSheet] = useState(null); // "pv" | "actions" | "team" | "meeting"

  const openActions   = project.actions.filter((a) => a.open);
  const closedActions = project.actions.filter((a) => !a.open);
  const lastPV        = project.pvHistory[0] || null;

  return (
    <div className="ap-overview-wrap" style={{ maxWidth: 1200, margin: "0 auto", animation: "fadeIn 0.2s ease" }}>

      {/* ── Barre contexte projet — masquée sur mobile (redondant avec header) ── */}
      <div className="ap-context-bar" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <ProjectStatusSelector statusId={project.statusId} onChange={(id) => updateProjectField(project, setProjects, "statusId", id)} />
          {project.client     && <span style={{ fontSize: 12, color: TX3 }}>MO <strong style={{ color: TX2, fontWeight: 600 }}>{project.client}</strong></span>}
          {project.contractor && <><span style={{ color: SBB }}>·</span><span style={{ fontSize: 12, color: TX3 }}>Entr. <strong style={{ color: TX2, fontWeight: 600 }}>{project.contractor}</strong></span></>}
          {(project.city || project.address) && <><span style={{ color: SBB }}>·</span><span style={{ fontSize: 12, color: TX3 }}><Ico name="mappin" size={10} color={TX3} /> {project.city || project.address}</span></>}
          {project.startDate  && <><span style={{ color: SBB }}>·</span><span style={{ fontSize: 12, color: TX3 }}>{project.startDate}{project.endDate ? ` → ${project.endDate}` : ""}</span></>}
        </div>
        <PresenceAvatars present={present} selfId={selfId} />
      </div>

      {/* ── Bandeau urgences ── */}
      {urgent.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#EF4444", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Ico name="alert" size={14} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#B91C1C" }}>{urgent.length} action{urgent.length > 1 ? "s" : ""} urgente{urgent.length > 1 ? "s" : ""} — </span>
            <span style={{ fontSize: 13, color: "#B91C1C" }}>{urgent.map(a => a.text).join(" · ")}</span>
          </div>
        </div>
      )}

      {/* ── Brouillons hors-ligne en attente ── */}
      {(() => {
        const drafts = getPvDrafts().filter(d => d.projectId === project.id);
        if (drafts.length === 0) return null;
        return (
          <div style={{ marginBottom: 14, padding: "12px 16px", background: "#FDF4E7", border: `1px solid ${ACL2}`, borderRadius: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Ico name="clock" size={14} color={AC} />
              <span style={{ fontSize: 13, fontWeight: 700, color: TX }}>{drafts.length} brouillon{drafts.length > 1 ? "s" : ""} en attente de génération</span>
            </div>
            {drafts.map(d => (
              <div key={d.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 0", borderTop: `1px solid ${ACL2}` }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: TX }}>{d.pvTitle || `PV n°${d.pvNumber}`}</div>
                  <div style={{ fontSize: 10, color: TX3 }}>Sauvegardé le {new Date(d.savedAt).toLocaleDateString("fr-BE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {navigator.onLine && (
                    <button onClick={() => {
                      removePvDraft(d.id);
                      onStartNotes("write");
                    }} style={{ padding: "5px 12px", border: "none", borderRadius: 6, background: AC, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 10 }}>✦</span> Générer
                    </button>
                  )}
                  <button onClick={() => { removePvDraft(d.id); }} style={{ padding: "5px 10px", border: `1px solid ${SBB}`, borderRadius: 6, background: WH, color: TX3, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                    <Ico name="x" size={10} color={TX3} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* ── Layout 2 colonnes ── */}
      <div className="ap-overview-grid" style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>

        {/* ═══ Colonne principale ═══ */}
        <div className="ap-col-main" style={{ flex: "1 1 360px", display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>

          {/* ── Mobile Dashboard — operational, action-oriented ── */}
          <div className="ap-mobile-dashboard" style={{ display: "none", flexDirection: "column", gap: 10 }}>

            {/* Prochaine réunion */}
            <button onClick={() => setMobileSheet("meeting")} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: project.nextMeeting ? ACL : WH, border: `1px solid ${project.nextMeeting ? ACL2 : SBB}`, borderRadius: 10, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: project.nextMeeting ? WH : SB2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Ico name="calendar" size={14} color={project.nextMeeting ? AC : TX3} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: AC, textTransform: "uppercase", letterSpacing: "0.05em" }}>Prochaine réunion</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: TX }}>{project.nextMeeting || "Non planifiée"}</div>
              </div>
              <Ico name="arrowr" size={14} color={TX3} />
            </button>

            {/* Accès rapides — 4 colonnes */}
            {/* Quick access — 4 columns, bigger */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
              {[
                { label: "Documents", icon: "folder", color: BL, bg: BLB, count: (project.planFiles||[]).filter(f=>f.type!=="folder").length, onClick: onViewPlan },
                { label: "Photos",    icon: "camera", color: AC, bg: ACL, count: (project.gallery||[]).length, onClick: onGallery },
                { label: "Planning",  icon: "gantt",  color: GR, bg: GRBG, count: (project.lots||[]).length, onClick: onViewPlanning },
                { label: "Listes",    icon: "listcheck", color: TE, bg: TEB, count: (project.checklists||[]).length, onClick: onViewChecklists },
              ].map(s => (
                <button key={s.label} onClick={s.onClick} style={{ padding: "12px 4px", border: `1px solid ${s.color}18`, borderRadius: 10, background: s.bg, cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <Ico name={s.icon} size={18} color={s.color} />
                  <span style={{ fontSize: 10, fontWeight: 600, color: s.color }}>{s.label}</span>
                  {s.count > 0 && <span style={{ fontSize: 9, color: s.color, opacity: 0.7 }}>{s.count}</span>}
                </button>
              ))}
            </div>

            {/* ── Sections — independent cards ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

              {/* Actions */}
              <button onClick={() => setMobileSheet("actions")} className="ap-profile-card" style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", border: `1px solid ${SBB}`, borderRadius: 10, background: WH, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: openActions.length > 0 ? (urgent.length > 0 ? "#FEF2F2" : SB) : GRBG, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Ico name="alert" size={16} color={openActions.length > 0 ? (urgent.length > 0 ? RD : TX3) : GR} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: TX }}>Actions</div>
                  <div style={{ fontSize: 11, color: openActions.length > 0 ? (urgent.length > 0 ? "#B91C1C" : TX3) : GR }}>
                    {openActions.length === 0 ? "Toutes clôturées" : `${openActions.length} ouverte${openActions.length > 1 ? "s" : ""}${urgent.length > 0 ? ` · ${urgent.length} urgente${urgent.length > 1 ? "s" : ""}` : ""}`}
                  </div>
                </div>
                <Ico name="arrowr" size={14} color={TX3} />
              </button>

              {/* Historique PV */}
              <button onClick={() => setMobileSheet("pv")} className="ap-profile-card" style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", border: `1px solid ${SBB}`, borderRadius: 10, background: WH, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: ACL, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Ico name="file" size={16} color={AC} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: TX }}>Historique des PV</div>
                  <div style={{ fontSize: 11, color: TX3 }}>
                    {project.pvHistory.length === 0 ? "Aucun PV" : `${project.pvHistory.length} PV${lastPV ? ` · dernier : PV n°${lastPV.number}` : ""}`}
                  </div>
                </div>
                <Ico name="arrowr" size={14} color={TX3} />
              </button>

              {/* Participants */}
              <button onClick={() => setMobileSheet("team")} className="ap-profile-card" style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", border: `1px solid ${SBB}`, borderRadius: 10, background: WH, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: ACL, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Ico name="users" size={16} color={AC} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: TX }}>Participants ({project.participants.length})</div>
                  <div style={{ fontSize: 11, color: TX3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {project.participants.length === 0 ? "Aucun participant" : project.participants.slice(0, 3).map(p => p.name.split(" ")[0]).join(", ")}{project.participants.length > 3 ? "…" : ""}
                  </div>
                </div>
                <div style={{ display: "flex", flexShrink: 0, marginRight: 4 }}>
                  {project.participants.slice(0, 3).map((p, i) => (
                    <div key={i} style={{ width: 24, height: 24, borderRadius: "50%", background: ACL, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: AC, border: `1.5px solid ${WH}`, marginLeft: i > 0 ? -6 : 0, zIndex: 3 - i }}>
                      {p.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                    </div>
                  ))}
                </div>
                <Ico name="arrowr" size={14} color={TX3} />
              </button>

              {/* Infos projet */}
              <button onClick={() => setMobileSheet("info")} className="ap-profile-card" style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", border: `1px solid ${SBB}`, borderRadius: 10, background: WH, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: SB, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Ico name="building" size={16} color={TX3} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: TX }}>Infos projet</div>
                  <div style={{ fontSize: 11, color: TX3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {[project.client, project.contractor, project.city].filter(Boolean).join(" · ") || "Aucune info"}
                  </div>
                </div>
                <Ico name="arrowr" size={14} color={TX3} />
              </button>

            </div>

          </div>

          {/* CTA Nouveau PV */}
          {_canEdit && <button className="ap-touch-btn ap-cta-newpv" onClick={() => onStartNotes()} style={{ width: "100%", padding: "15px 20px", border: "none", borderRadius: 12, background: AC, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 2px 10px rgba(192,90,44,0.22)", letterSpacing: "-0.1px" }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Ico name="edit" size={16} color="#fff" />
            </div>
            <div style={{ textAlign: "left" }}>
              <div>{t("project.newPV")} · n°{project.pvHistory.length + 1}</div>
              <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.85, marginTop: 1 }}>
                {project.nextMeeting ? t("project.meetingOn", { date: project.nextMeeting }) : t("project.prepareNextPV")}
              </div>
            </div>
            <Ico name="arrowr" size={18} color="rgba(255,255,255,0.8)" />
          </button>}

          {/* OPR Summary Card */}
          {(project.statusId === "reception" || (project.reserves || []).length > 0) && (() => {
            const res = project.reserves || [];
            const total = res.length;
            const levees = res.filter(r => r.status === "levee").length;
            const pct = total > 0 ? Math.round((levees / total) * 100) : 0;
            return (
              <div style={{ background: WH, border: `1px solid ${total > 0 && pct < 100 ? REDBRD : SBB}`, borderRadius: 12, padding: "14px 16px", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: total > 0 ? 10 : 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: total > 0 && pct < 100 ? REDBG : GRBG, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Ico name={pct === 100 ? "check" : "alert"} size={14} color={pct === 100 ? GR : RD} />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: TX }}>Réserves OPR</div>
                      <div style={{ fontSize: 11, color: TX3 }}>{total === 0 ? "Aucune réserve" : `${levees}/${total} levées`}</div>
                    </div>
                  </div>
                  <button onClick={onOpr} style={{ padding: "7px 14px", border: "none", borderRadius: 8, background: total === 0 ? AC : SB, color: total === 0 ? "#fff" : TX, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                    {total === 0 ? "Démarrer l'OPR" : "Gérer"}
                  </button>
                </div>
                {total > 0 && (
                  <div style={{ height: 6, background: SB, borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? GR : AC, borderRadius: 3, transition: "width 0.4s" }} />
                  </div>
                )}
              </div>
            );
          })()}

          {/* Outils rapides — masqués sur mobile (bottom bar remplace) */}
          <div className="ap-quick-tools" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              { label: "Documents",            icon: "folder",    color: BL,  bg: BLB,  count: (project.planFiles||[]).filter(f=>f.type!=="folder").length, onClick: onViewPlan },
              { label: "Photos",               icon: "camera",    color: AC,  bg: ACL,  count: (project.gallery||[]).length,     onClick: onGallery },
              { label: t("project.planning"),  icon: "gantt",     color: GR,  bg: GRBG, count: (project.lots||[]).length,        onClick: onViewPlanning },
              { label: t("project.lists"),     icon: "listcheck", color: TE,  bg: TEB,  count: (project.checklists||[]).length,  onClick: onViewChecklists },
              ...((project.statusId === "reception" || (project.reserves || []).length > 0) ? [{ label: "Réserves", icon: "alert", color: RD, bg: REDBG, count: (project.reserves || []).filter(r => r.status !== "levee").length, onClick: onOpr }] : []),
            ].map((tb) => (
              <button key={tb.label} onClick={tb.onClick} style={{ flex: "1 1 80px", padding: "10px 8px", border: `1px solid ${tb.color}25`, borderRadius: 10, background: tb.bg, cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <Ico name={tb.icon} size={16} color={tb.color} />
                <span style={{ fontSize: 11, fontWeight: 600, color: tb.color }}>{tb.label}</span>
                {tb.count > 0 && <span style={{ fontSize: 10, color: tb.color, opacity: 0.75 }}>{tb.count}</span>}
              </button>
            ))}
          </div>

          {/* Mobile: Accès rapides (Documents, Planning, Listes) */}
          <div className="ap-mobile-shortcuts" style={{ display: "none", gap: SP.sm }}>
            {[
              { label: "Documents", icon: "folder", color: BL, bg: BLB, count: (project.planFiles||[]).filter(f=>f.type!=="folder").length, onClick: onViewPlan },
              { label: "Planning",  icon: "gantt",  color: GR, bg: GRBG, count: (project.lots||[]).length, onClick: onViewPlanning },
              { label: "Listes",    icon: "listcheck", color: TE, bg: TEB, count: (project.checklists||[]).length, onClick: onViewChecklists },
            ].map(s => (
              <button key={s.label} onClick={s.onClick} style={{ flex: 1, padding: `${SP.sm + 2}px ${SP.sm}px`, border: `1px solid ${s.color}20`, borderRadius: RAD.lg, background: s.bg, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: SP.sm, minHeight: 44 }}>
                <Ico name={s.icon} size={16} color={s.color} />
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: FS.sm, fontWeight: 600, color: s.color }}>{s.label}</div>
                  {s.count > 0 && <div style={{ fontSize: FS.xs - 1, color: s.color, opacity: 0.7 }}>{s.count} élément{s.count > 1 ? "s" : ""}</div>}
                </div>
              </button>
            ))}
          </div>

          {/* Dernier PV */}
          <div className="ap-section-pv"><Card>
            <CardHeader
              title={t("project.pvHistory")}
              action={<SmallBtn onClick={onImportPV} icon="upload" label={t("import")} />}
            />
            {project.pvHistory.length === 0 ? (
              <div style={{ padding: "16px 0", textAlign: "center" }}>
                <div style={{ fontSize: 13, color: TX3, marginBottom: 10 }}>{t("project.noPV")}</div>
                <button onClick={() => onStartNotes("write")} style={{ padding: "8px 18px", border: "none", borderRadius: 8, background: AC, color: "#fff", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Ico name="edit" size={13} color="#fff" />{t("project.createFirstPV")}
                </button>
              </div>
            ) : (
              <>
                {/* PV le plus récent — mis en avant */}
                {lastPV && (
                  <div style={{ padding: "12px 14px", background: ACL, border: `1px solid ${ACL2}`, borderRadius: 10, marginBottom: project.pvHistory.length > 1 ? 10 : 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: TX }}>{lastPV.title || `PV n°${lastPV.number}`}</span>
                          {lastPV.imported
                            ? <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 600, color: BL, background: BLB, padding: "2px 7px 2px 5px", borderRadius: 20 }}><span style={{ width: 5, height: 5, borderRadius: "50%", background: BL, display: "inline-block" }} />{t("project.imported")}</span>
                            : <PvStatusBadge status={lastPV.status} onClick={() => updatePvStatus(lastPV.number, nextPvStatus(lastPV.status || "draft"))} />
                          }
                        </div>
                        <div style={{ fontSize: 12, color: TX2, lineHeight: 1.5, marginBottom: 6 }}>{lastPV.excerpt}</div>
                        <div style={{ display: "flex", gap: 10, fontSize: FS.sm, color: TX3 }}>
                          <span title={lastPV.date}>{relativeDate(lastPV.date)}</span><span>{lastPV.author}</span>
                          {!lastPV.imported && <span>{lastPV.postsCount} poste{lastPV.postsCount > 1 ? "s" : ""}</span>}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: SP.xs, flexShrink: 0 }}>
                        <button onClick={() => onViewPV(lastPV)} style={{ background: WH, border: `1px solid ${ACL2}`, borderRadius: RAD.sm, cursor: "pointer", padding: `${SP.xs + 2}px ${SP.sm + 1}px`, display: "flex", alignItems: "center", gap: SP.xs, fontFamily: "inherit" }}>
                          <Ico name="edit" size={11} color={TX3} /><span style={{ fontSize: FS.sm, color: TX2, fontWeight: 500 }}>Rédaction</span>
                        </button>
                        {(lastPV.content || lastPV.pdfDataUrl) && (
                          <button onClick={() => onViewPdf(lastPV)} style={{ background: ACL, border: `1px solid ${ACL2}`, borderRadius: RAD.sm, cursor: "pointer", padding: `${SP.xs + 2}px ${SP.sm + 1}px`, display: "flex", alignItems: "center", gap: SP.xs, fontFamily: "inherit" }}>
                            <Ico name="file" size={11} color={AC} /><span style={{ fontSize: FS.sm, color: AC, fontWeight: 600 }}>PDF</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {/* Anciens PV — limité à 2 (3 total avec le dernier) */}
                {project.pvHistory.slice(1, 3).map((pv, i) => (
                  <PvRow key={i} pv={pv} onViewPV={onViewPV} onViewPdf={onViewPdf} updatePvStatus={updatePvStatus} t={t} />
                ))}
                {/* Bouton voir tout */}
                {project.pvHistory.length > 3 && !showAllPV && (
                  <button onClick={() => setShowAllPV(true)} style={{ width: "100%", marginTop: 6, padding: "8px 12px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontFamily: "inherit", fontSize: 11, fontWeight: 600, color: TX2 }}>
                    <Ico name="clock" size={11} color={TX3} />
                    Voir tout l'historique ({project.pvHistory.length} PV)
                  </button>
                )}
                {showAllPV && project.pvHistory.slice(3).map((pv, i) => (
                  <PvRow key={i + 3} pv={pv} onViewPV={onViewPV} onViewPdf={onViewPdf} updatePvStatus={updatePvStatus} t={t} />
                ))}
                {showAllPV && project.pvHistory.length > 3 && (
                  <button onClick={() => setShowAllPV(false)} style={{ width: "100%", marginTop: 6, padding: "6px 12px", border: "none", borderRadius: 8, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4, fontFamily: "inherit", fontSize: 10, color: TX3 }}>
                    <Ico name="chevron-up" size={10} color={TX3} />Réduire
                  </button>
                )}
              </>
            )}
          </Card></div>

          {/* Actions */}
          <div className="ap-section-actions"><Card>
            <CardHeader
              title={t("project.actions")}
              action={openActions.length > 0
                ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: urgent.length > 0 ? "#B91C1C" : TX3, background: urgent.length > 0 ? "#FEF2F2" : SB2, padding: "2px 9px 2px 6px", borderRadius: 20 }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: urgent.length > 0 ? "#EF4444" : TX3, display: "inline-block" }} />
                    {openActions.length} ouverte{openActions.length > 1 ? "s" : ""}
                    {urgent.length > 0 && ` · ${urgent.length} urgente${urgent.length > 1 ? "s" : ""}`}
                  </span>
                : null}
            />
            {openActions.length === 0 && closedActions.length === 0 && (
              <div style={{ fontSize: 13, color: TX3, padding: "8px 0" }}>{t("project.noActions")}</div>
            )}
            {openActions.length === 0 && closedActions.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0" }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#F0FDF4", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Ico name="check" size={13} color={GR} />
                </div>
                <span style={{ fontSize: 13, color: GR, fontWeight: 500 }}>{t("project.allActionsClosed")}</span>
              </div>
            )}
            {/* Urgentes en premier */}
            {project.actions.filter(a => a.open && a.urgent).map((a) => (
              <div key={a.id} style={{ display: "flex", gap: 10, padding: "9px 10px", marginBottom: 4, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, alignItems: "flex-start" }}>
                <button onClick={() => toggleAction(a.id)} style={{ width: 18, height: 18, borderRadius: 4, border: "1.5px solid #EF4444", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1, padding: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "#B91C1C", fontWeight: 600, lineHeight: 1.3 }}>{a.text}</div>
                  <div style={{ fontSize: 11, color: "#EF4444", marginTop: 2 }}>{a.who} — {a.since}</div>
                </div>
              </div>
            ))}
            {/* Normales */}
            {project.actions.filter(a => a.open && !a.urgent).map((a) => (
              <div key={a.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderTop: `1px solid ${SB2}`, alignItems: "flex-start" }}>
                <button onClick={() => toggleAction(a.id)} style={{ width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${SBB}`, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2, padding: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: TX, lineHeight: 1.3 }}>{a.text}</div>
                  <div style={{ fontSize: 11, color: TX3, marginTop: 1 }}>{a.who} — {a.since}</div>
                </div>
              </div>
            ))}
            {/* Clôturées — discrètes */}
            {closedActions.length > 0 && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${SB2}` }}>
                {closedActions.map((a) => (
                  <div key={a.id} style={{ display: "flex", gap: 10, padding: "6px 0", alignItems: "center", opacity: 0.55 }}>
                    <button onClick={() => toggleAction(a.id)} style={{ width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${GR}`, background: "#F0FDF4", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0 }}>
                      <Ico name="check" size={11} color={GR} />
                    </button>
                    <div style={{ fontSize: 12, color: TX3, textDecoration: "line-through", flex: 1, minWidth: 0 }}>{a.text}</div>
                  </div>
                ))}
              </div>
            )}
          </Card></div>

        </div>

        {/* ═══ Colonne secondaire ═══ */}
        <div className="ap-overview-side" style={{ flex: "0 1 272px", display: "flex", flexDirection: "column", gap: SP.lg - 2, minWidth: 220 }}>

          {/* ── Mobile: Participants inline (avatars cliquables) ── */}
          <div className="ap-mobile-participants" style={{ display: "none" }}>
            <Card>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: SP.sm }}>
                <span style={{ fontSize: FS.sm, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3 }}>Équipe</span>
                <button onClick={onEditParticipants} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex", alignItems: "center", gap: SP.xs }}>
                  <Ico name="edit" size={11} color={TX3} /><span style={{ fontSize: FS.xs, color: TX3 }}>Modifier</span>
                </button>
              </div>
              <div style={{ display: "flex", gap: SP.sm, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 2 }}>
                {project.participants.map((p, i) => (
                  <a key={i} href={p.phone ? `tel:${p.phone.replace(/\s/g, "")}` : undefined} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 56, textDecoration: "none", flexShrink: 0 }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: ACL, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: AC, border: p.phone ? `2px solid ${AC}` : `2px solid ${SBB}` }}>
                      {p.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                    </div>
                    <span style={{ fontSize: 9, color: TX, fontWeight: 500, textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 56 }}>{p.name.split(" ")[0]}</span>
                    <span style={{ fontSize: 8, color: TX3, marginTop: -2 }}>{p.role}</span>
                  </a>
                ))}
                <button onClick={onCollab} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 56, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", border: `2px dashed ${SBB}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Ico name="plus" size={14} color={TX3} />
                  </div>
                  <span style={{ fontSize: 9, color: TX3 }}>Inviter</span>
                </button>
              </div>
              {project.participants.some(p => p.phone) && (
                <div style={{ fontSize: FS.xs - 1, color: TX3, marginTop: SP.sm, textAlign: "center", fontStyle: "italic" }}>Appuyez sur un contact pour appeler</div>
              )}
            </Card>
          </div>

          {/* ── Mobile: Infos projet compactes ── */}
          <div className="ap-mobile-infos" style={{ display: "none" }}>
            <Card>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: SP.sm }}>
                <span style={{ fontSize: FS.sm, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3 }}>Projet</span>
                <button onClick={onEditInfo} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex", alignItems: "center", gap: SP.xs }}>
                  <Ico name="edit" size={11} color={TX3} /><span style={{ fontSize: FS.xs, color: TX3 }}>Modifier</span>
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: `${SP.sm}px ${SP.md}px` }}>
                {[
                  { icon: "users",    label: "MO",       value: project.client },
                  { icon: "building", label: "Entreprise", value: project.contractor },
                  { icon: "mappin",   label: "Lieu",     value: project.city || formatAddress(project) },
                  { icon: "calendar", label: "Début",    value: project.startDate },
                ].filter(item => item.value).map((item, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: SP.sm - 2, padding: `${SP.sm - 2}px 0` }}>
                    <Ico name={item.icon} size={12} color={TX3} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 8, color: TX3, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{item.label}</div>
                      <div style={{ fontSize: FS.sm, color: TX, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* ── Desktop: full cards (hidden on mobile) ── */}
          <div className="ap-desktop-side">
            <div style={{ display: "flex", flexDirection: "column", gap: SP.lg - 2 }}>
              <MeetingCard project={project} setProjects={setProjects} rec={rec} />

              {(project.city || project.address) && <WeatherWidget address={project.city || formatAddress(project)} />}

              <Card>
                <CardHeader
                  title={`Participants (${project.participants.length})`}
                  action={<button onClick={onEditParticipants} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><Ico name="edit" size={13} color={TX3} /></button>}
                />
                {project.participants.length === 0 && <div style={{ fontSize: 13, color: TX3 }}>Aucun participant.</div>}
                {project.participants.map((p, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 0", borderTop: i > 0 ? `1px solid ${SB2}` : "none" }}>
                    <div style={{ width: 30, height: 30, borderRadius: "50%", background: ACL, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: AC, flexShrink: 0 }}>
                      {p.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: TX3 }}>{p.role}{p.phone ? ` · ${p.phone}` : ""}</div>
                    </div>
                  </div>
                ))}
                <button className="ap-cta-collab" onClick={onCollab} style={{ width: "100%", marginTop: 10, padding: "8px 12px", border: `1px dashed ${SBB}`, borderRadius: 8, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "inherit", fontSize: 12, fontWeight: 500, color: AC, transition: "all 0.15s" }}>
                  <Ico name="plus" size={12} color={AC} />
                  Inviter des collaborateurs
                </button>
              </Card>

              <Card>
                <CardHeader title={t("project.info")} action={<button onClick={onEditInfo} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><Ico name="edit" size={13} color={TX3} /></button>} />
                <div className="ap-info-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: `${SP.md}px ${SP.lg}px` }}>
                  {[
                    { icon: "users",   label: t("project.client"),     value: project.client },
                    { icon: "building", label: t("project.enterprise"), value: project.contractor },
                    { icon: "mappin",  label: t("project.address"),     value: formatAddress(project) },
                    { icon: "calendar", label: t("project.startDate"),  value: project.startDate },
                    { icon: "calendar", label: t("project.endDate"),    value: project.endDate || "—" },
                    ...(project.customFields || []).filter(cf => cf.label && cf.value).map(cf => ({ icon: "file", label: cf.label, value: cf.value })),
                  ].filter(item => item.value).map((item, i) => (
                    <div key={i} style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: SP.xs, marginBottom: 2 }}>
                        <Ico name={item.icon} size={11} color={TX3} />
                        <span style={{ fontSize: FS.xs, color: TX3, fontWeight: 500 }}>{item.label}</span>
                      </div>
                      <div style={{ fontSize: FS.base, color: TX, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </Card>

              {_canManage && <div className="ap-admin-actions" style={{ display: "flex", gap: 6 }}>
                <SmallBtn onClick={onEditInfo} icon="edit" label={t("edit")} />
                <SmallBtn onClick={onDuplicate} icon="dup" label={t("duplicate")} />
                <SmallBtn onClick={onArchive} icon="archive" label={project.archived ? t("project.unarchive") : t("project.archive")} />
              </div>}
            </div>
          </div>

        </div>
      </div>

      {/* ── Mobile Sheets ── */}
      {mobileSheet && (
        <div style={{ position: "fixed", inset: 0, zIndex: 250, display: "flex", flexDirection: "column", justifyContent: "flex-end" }} onClick={() => setMobileSheet(null)}>
          <div style={{ background: "rgba(0,0,0,0.3)", position: "absolute", inset: 0 }} />
          <div onClick={e => e.stopPropagation()} style={{ position: "relative", background: WH, borderRadius: "20px 20px 0 0", maxHeight: "80vh", display: "flex", flexDirection: "column", animation: "sheetUp 0.25s ease-out", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: SBB, margin: `${SP.md}px auto ${SP.sm}px` }} />

            {/* Sheet: PV History */}
            {mobileSheet === "pv" && (
              <div style={{ padding: `0 ${SP.lg}px ${SP.lg}px`, overflowY: "auto" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: SP.md }}>
                  <span style={{ fontSize: FS.lg + 1, fontWeight: 700, color: TX }}>Historique PV</span>
                  <SmallBtn onClick={onImportPV} icon="upload" label="Importer" />
                </div>
                {project.pvHistory.length === 0 ? (
                  <div style={{ padding: `${SP.xl}px 0`, textAlign: "center", color: TX3, fontSize: FS.md }}>Aucun PV rédigé</div>
                ) : project.pvHistory.map((pv, i) => (
                  <PvRow key={i} pv={pv} onViewPV={(p) => { setMobileSheet(null); onViewPV(p); }} onViewPdf={(p) => { setMobileSheet(null); onViewPdf(p); }} updatePvStatus={updatePvStatus} t={t} />
                ))}
              </div>
            )}

            {/* Sheet: Actions */}
            {mobileSheet === "actions" && (
              <div style={{ padding: `0 ${SP.lg}px ${SP.lg}px`, overflowY: "auto" }}>
                <span style={{ fontSize: FS.lg + 1, fontWeight: 700, color: TX, display: "block", marginBottom: SP.md }}>Actions ({openActions.length} ouverte{openActions.length > 1 ? "s" : ""})</span>
                {openActions.length === 0 && <div style={{ padding: `${SP.xl}px 0`, textAlign: "center", color: TX3, fontSize: FS.md }}>Aucune action ouverte</div>}
                {openActions.map(a => (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: SP.sm, padding: `${SP.sm}px 0`, borderTop: `1px solid ${SB2}` }}>
                    <button onClick={() => toggleAction(a.id)} style={{ width: 24, height: 24, borderRadius: RAD.sm, border: `2px solid ${a.urgent ? RD : SBB}`, background: WH, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0 }} />
                    <span style={{ fontSize: FS.md, color: TX, flex: 1 }}>{a.text}</span>
                    {a.urgent && <span style={{ fontSize: FS.xs, fontWeight: 700, color: RD, background: "#FEF2F2", padding: "2px 6px", borderRadius: 4 }}>Urgent</span>}
                  </div>
                ))}
              </div>
            )}

            {/* Sheet: Team */}
            {mobileSheet === "team" && (
              <div style={{ padding: `0 ${SP.lg}px ${SP.lg}px`, overflowY: "auto" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: SP.md }}>
                  <span style={{ fontSize: FS.lg + 1, fontWeight: 700, color: TX }}>Équipe</span>
                  <button onClick={() => { setMobileSheet(null); setTimeout(onEditParticipants, 100); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: FS.sm, color: AC, fontWeight: 600, fontFamily: "inherit" }}>Modifier</button>
                </div>
                {project.participants.map((p, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: SP.md, padding: `${SP.sm + 2}px 0`, borderTop: i > 0 ? `1px solid ${SB2}` : "none" }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: ACL, display: "flex", alignItems: "center", justifyContent: "center", fontSize: FS.base, fontWeight: 700, color: AC, flexShrink: 0 }}>
                      {p.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: FS.md, fontWeight: 600, color: TX }}>{p.name}</div>
                      <div style={{ fontSize: FS.sm, color: TX3 }}>{p.role}</div>
                    </div>
                    {p.phone && (
                      <a href={`tel:${p.phone.replace(/\s/g, "")}`} style={{ width: 36, height: 36, borderRadius: "50%", background: GRBG, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", flexShrink: 0 }}>
                        <Ico name="phone" size={16} color={GR} />
                      </a>
                    )}
                  </div>
                ))}
                <button onClick={() => { setMobileSheet(null); onCollab(); }} style={{ width: "100%", marginTop: SP.md, padding: `${SP.sm + 2}px`, border: `1px dashed ${SBB}`, borderRadius: RAD.md, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: SP.sm, fontFamily: "inherit", fontSize: FS.base, color: AC }}>
                  <Ico name="plus" size={14} color={AC} />Inviter
                </button>
              </div>
            )}

            {/* Sheet: Meeting */}
            {mobileSheet === "meeting" && (
              <div style={{ padding: `0 ${SP.lg}px ${SP.lg}px` }}>
                <span style={{ fontSize: FS.lg + 1, fontWeight: 700, color: TX, display: "block", marginBottom: SP.md }}>Prochaine réunion</span>
                <MeetingCard project={project} setProjects={setProjects} rec={rec} />
              </div>
            )}

            {/* Sheet: Infos projet */}
            {mobileSheet === "info" && (
              <div style={{ padding: `0 ${SP.lg}px ${SP.lg}px`, overflowY: "auto" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: SP.md }}>
                  <span style={{ fontSize: FS.lg + 1, fontWeight: 700, color: TX }}>Infos projet</span>
                  <button onClick={() => { setMobileSheet(null); setTimeout(onEditInfo, 100); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: FS.sm, color: AC, fontWeight: 600, fontFamily: "inherit" }}>Modifier</button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: SP.md }}>
                  {[
                    { icon: "users", label: "Maître d'ouvrage", value: project.client },
                    { icon: "building", label: "Entreprise", value: project.contractor },
                    { icon: "mappin", label: "Adresse", value: formatAddress(project) || project.city },
                    { icon: "calendar", label: "Date de début", value: project.startDate },
                    { icon: "calendar", label: "Date de fin", value: project.endDate },
                    ...(project.customFields || []).filter(cf => cf.label && cf.value).map(cf => ({ icon: "file", label: cf.label, value: cf.value })),
                  ].filter(item => item.value).map((item, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: SP.md, padding: `${SP.sm}px 0`, borderTop: i > 0 ? `1px solid ${SB2}` : "none" }}>
                      <div style={{ width: 32, height: 32, borderRadius: RAD.sm, background: SB, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Ico name={item.icon} size={14} color={TX3} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: FS.xs, color: TX3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>{item.label}</div>
                        <div style={{ fontSize: FS.md, color: TX, fontWeight: 500 }}>{item.value}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

// ── Project Status Selector (clickable badge with dropdown) ──
function ProjectStatusSelector({ statusId, onChange }) {
  const [open, setOpen] = useState(false);
  const s = getStatus(statusId);
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button onClick={() => setOpen(!open)} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: s.color, background: s.bg, padding: "3px 10px 3px 7px", borderRadius: 20, border: "none", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
        {s.label}
        <Ico name="back" size={9} color={s.color} style={{ transform: open ? "rotate(90deg)" : "rotate(-90deg)", transition: "transform 0.15s" }} />
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setOpen(false)} />
          <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, background: WH, border: `1px solid ${SBB}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 100, minWidth: 160, padding: 4, animation: "fadeIn 0.15s ease" }}>
            {STATUSES.map(st => (
              <button key={st.id} onClick={() => { onChange(st.id); setOpen(false); }}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: "none", borderRadius: 7, background: st.id === statusId ? st.bg : "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "background 0.1s" }}
                onMouseEnter={e => { if (st.id !== statusId) e.currentTarget.style.background = SB; }}
                onMouseLeave={e => { if (st.id !== statusId) e.currentTarget.style.background = "transparent"; }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: st.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: st.id === statusId ? 700 : 500, color: st.id === statusId ? st.color : TX }}>{st.label}</span>
                {st.id === statusId && <Ico name="check" size={12} color={st.color} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
