import { useState, useMemo, useEffect, useRef } from "react";
import { useT } from "../i18n";
import { AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, RD, GR, SP, FS, LH, RAD, GRBG, REDBG, REDBRD, BL, BLB, TE, TEB, QT_DOC_BG, QT_DOC_FG, QT_PHOTO_BG, QT_PHOTO_FG, QT_PLAN_BG, QT_PLAN_FG, QT_LIST_BG, QT_LIST_FG, BR, BRB, SG, SGB } from "../constants/tokens";
import { getStatus, STATUSES, nextPvStatus, PV_STATUSES, getPvStatus } from "../constants/statuses";
import { parseDateFR } from "../utils/dates";
const updateProjectField = (project, setProjects, field, value) => setProjects(prev => prev.map(p => p.id === project.id ? { ...p, [field]: value } : p));
import { RECURRENCES } from "../constants/templates";
import { Ico, Modal, Field, StatusBadge, PvStatusBadge, KpiCard } from "../components/ui";
import { relativeDate } from "../utils/dates";
import { formatAddress } from "../utils/address";
import { getPvDrafts, removePvDraft } from "../utils/offline";
import { stripMarkdown, nextPvNumber } from "../utils/helpers";
import { countTasks, sortTasks, getTaskStatus, getTaskPriority, isOverdue, isClosed, advanceTaskStatus } from "../utils/tasks";
import { getProjectPhase } from "../utils/phases";
import { isReadOnly, canEdit, canManageMembers } from "../components/modals/CollabModal";
import { MeetingCard, MEETING_MODES } from "./MeetingCard";
import { PvRow, SmallBtn } from "./PvRow";
import { CollabModalWrapper } from "../components/modals/CollabModalWrapper";
import { usePresence } from "../hooks/usePresence";
import { TimerCard } from "./TimerCard";
import { CdcBanner } from "./CdcBanner";
import { PlanManager } from "./PlanManager";
import { PlanningView } from "./PlanningView";
import { GalleryView } from "./GalleryView";
import { AskAiButton } from "../components/ui";
import { SuggestedTasksModal } from "../components/modals/SuggestedTasksModal";

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

export function Overview({ project, onStartNotes, onEditInfo, onEditParticipants, onViewPV, onViewPdf, onViewPlan, onViewPlanning, onViewTasks, onOpr, onArchive, onDuplicate, onImportPV, setProjects, onCollab, onGallery, activeContext, profile, activeTimer, onStartTimer, onPauseResumeTimer, onStopTimer, onDiscardTimer, onOpenSessions, onAskAiAboutCdc, onAnnotatePlan, onCropPlan, onAnnotatePhoto }) {
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
  const deletePv = (pvNum) => setProjects(prev => prev.map(p => p.id === project.id ? { ...p, pvHistory: p.pvHistory.filter(pv => pv.number !== pvNum) } : p));
  const setCdc = (cdc) => setProjects(prev => prev.map(p => p.id === project.id ? { ...p, cahierDesCharges: cdc } : p));
  const urgent = project.actions.filter((a) => a.urgent && a.open);
  const toggleAction = (aid) => setProjects((prev) => prev.map((p) => p.id === project.id ? { ...p, actions: p.actions.map((a) => a.id === aid ? { ...a, open: !a.open } : a) } : p));
  const rec = RECURRENCES.find((r) => r.id === project.recurrence);
  const t = useT();
  const [showAllPV, setShowAllPV] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
  const [mobileSheet, setMobileSheet] = useState(null); // "pv" | "actions" | "team" | "meeting"
  const [pvToDelete, setPvToDelete] = useState(null); // PV object pending deletion confirmation
  // ── Onglets workspace projet ──
  // "resume" est la vue par défaut. Les autres onglets (PV/Actions/Documents/
  // Planning/Photos) montrent un panneau ciblé + un bouton pour ouvrir la vue
  // dédiée (PlanManager, PlanningView, GalleryView) quand le sujet le justifie.
  // Persistance localStorage pour que l'utilisateur retrouve son onglet après
  // un aller-retour vers une vue standalone (ex : annotation plein écran).
  const [activeTab, setActiveTab] = useState(() => {
    try { return localStorage.getItem(`archipilot_overview_tab:${project?.id}`) || "resume"; }
    catch { return "resume"; }
  });
  useEffect(() => {
    try { localStorage.setItem(`archipilot_overview_tab:${project?.id}`, activeTab); }
    catch { /* ignore */ }
  }, [activeTab, project?.id]);

  const openActions   = project.actions.filter((a) => a.open);
  const closedActions = project.actions.filter((a) => !a.open);
  const lastPV        = project.pvHistory[0] || null;

  // Suggestions IA en attente — comptées sur tous les PV. Le banner ne
  // s'affiche que si > 0 et la modal de revue est portée par Overview.
  const pendingAiSuggestions = useMemo(() => {
    let count = 0;
    let lastPvNumber = null;
    for (const pv of (project.pvHistory || [])) {
      const pending = (pv.suggestedTasks || []).filter(s => s.status === "pending");
      if (pending.length > 0) {
        count += pending.length;
        if (lastPvNumber === null) lastPvNumber = pv.number;
      }
    }
    return { count, lastPvNumber };
  }, [project.pvHistory]);
  const [suggestionsModalOpen, setSuggestionsModalOpen] = useState(false);
  const showToast = (msg) => {
    // Toast minimal (pas d'API exposée par Overview, on log + alert simple).
    // Dans un futur refacto, remonter showToast depuis App.jsx.
    if (msg) console.log("[toast]", msg);
  };

  return (
    <div className="ap-overview-wrap" style={{ maxWidth: 1200, margin: "0 auto", animation: "fadeIn 0.2s ease" }}>

      {/* Barre contexte projet — déplacée dans le top header (App.jsx).
          Ici on garde uniquement la présence collab à droite du contenu. */}
      {(present.length > 0) && (
        <div className="ap-context-bar" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginBottom: 12 }}>
          <PresenceAvatars present={present} selfId={selfId} />
        </div>
      )}

      {/* Time tracking — déplacé dans le top header (TimerPill).
          La SessionsModal reste accessible via le pill chrono. */}

      {/* Le header projet a fusionné avec la topbar (cf. App.jsx). Inutile
          d'avoir deux blocs identiques empilés. Document de référence reste
          juste sous la topbar comme document de travail visible. */}

      {/* ── Cahier des charges (toujours visible) ── */}
      <CdcBanner
        project={project}
        profile={profile}
        canEdit={_canEdit}
        onUpload={setCdc}
        onRemove={() => setCdc(null)}
        onAskAi={onAskAiAboutCdc ? (_cdc, mode) => onAskAiAboutCdc(project, mode) : null}
      />

      {/* ── Bandeau urgences ── */}
      {urgent.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: BRB, border: `1px solid ${REDBRD}`, borderRadius: 10, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: BR, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Ico name="alert" size={14} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: BR }}>{urgent.length} action{urgent.length > 1 ? "s" : ""} urgente{urgent.length > 1 ? "s" : ""} — </span>
            <span style={{ fontSize: 13, color: BR }}>{urgent.map(a => a.text).join(" · ")}</span>
          </div>
        </div>
      )}

      {/* ── Brouillons hors-ligne en attente ── */}
      {(() => {
        const drafts = getPvDrafts().filter(d => d.projectId === project.id);
        if (drafts.length === 0) return null;
        return (
          <div style={{ marginBottom: 14, padding: "12px 16px", background: ACL, border: `1px solid ${ACL2}`, borderRadius: 10 }}>
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

      {/* La carte "Prochaine action recommandée" a été déplacée dans la
          section Actions ouvertes du Résumé (sous-section "À faire maintenant")
          pour éviter la répétition du CTA en haut de page. */}

      {/* ═══ Tabs workspace projet ═══
          Navigation entre les sous-vues du projet. Style "tabs de navigation"
          (underline orange sous l'onglet actif), pas "boutons CTA". La barre
          horizontale est délimitée par un fin trait gris ; l'underline 2px de
          l'onglet actif vient s'y poser. Pas de fond, pas de bordure latérale. */}
      {(() => {
        // Règle d'affichage des compteurs :
        //   - Actions : toujours visible (le 0 est lui-même informatif —
        //     « rien à traiter en ce moment »)
        //   - Autres (PV, Documents, Planning, Photos) : visible seulement
        //     quand >0 pour éviter le bruit visuel des onglets vides
        //   - Résumé / Plus : pas de compteur (vues d'agrégation)
        const tabs = [
          { id: "resume",     label: "Résumé" },
          { id: "actions",    label: "Actions",   count: openActions.length,                showZero: true },
          { id: "planning",   label: "Planning",  count: (project.lots || []).length,       showZero: false },
          { id: "pv",         label: "PV",        count: (project.pvHistory || []).length, showZero: false },
          { id: "documents",  label: "Documents", count: (project.planFiles || []).filter(f => f.type !== "folder").length, showZero: false },
          { id: "photos",     label: "Photos",    count: (project.gallery || []).length,    showZero: false },
        ];
        return (
          <div style={{
            marginBottom: 16,
            borderBottom: `1px solid #E8E1DA`,
            display: "flex", gap: 2, flexWrap: "wrap",
          }}>
            {tabs.map(t => {
              const active = activeTab === t.id;
              return (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  aria-pressed={active}
                  style={{
                    padding: "10px 14px",
                    border: "none",
                    borderBottom: `2px solid ${active ? AC : "transparent"}`,
                    marginBottom: -1,           // overlap avec le trait du conteneur
                    background: "transparent",
                    color: active ? AC : TX2,
                    fontSize: FS.sm, fontWeight: active ? 700 : 600,
                    cursor: "pointer", fontFamily: "inherit",
                    display: "inline-flex", alignItems: "center", gap: 6,
                    transition: "color 0.12s, border-color 0.12s",
                    outline: "none",
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = TX; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = TX2; }}>
                  {t.label}
                  {typeof t.count === "number" && (t.count > 0 || t.showZero) && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: TX3, background: SB2, padding: "1px 7px", borderRadius: 10, fontFamily: "ui-monospace, monospace" }}>
                      {t.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })()}

      {/* ── Layout 2 colonnes — Visible uniquement dans l'onglet Résumé ── */}
      {activeTab === "resume" && (
      <div className="ap-overview-grid" style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>

        {/* ═══ Colonne principale ═══ */}
        <div className="ap-col-main" style={{ flex: "1 1 360px", display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>

          {/* Banner suggestions IA — apparaît tant qu'il y a des tâches
              potentielles non traitées sur les PV. Subtil, action explicite. */}
          {pendingAiSuggestions.count > 0 && (
            <div style={{
              background: WH, border: `1px solid ${ACL2}`, borderRadius: 12,
              padding: "12px 14px", display: "flex", alignItems: "center", gap: 12,
            }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: ACL, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Ico name="sparkle" size={14} color={AC} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: FS.sm, fontWeight: 700, color: TX }}>
                  {pendingAiSuggestions.count} tâche{pendingAiSuggestions.count > 1 ? "s" : ""} potentielle{pendingAiSuggestions.count > 1 ? "s" : ""} détectée{pendingAiSuggestions.count > 1 ? "s" : ""} dans le{pendingAiSuggestions.lastPvNumber ? ` PV n°${pendingAiSuggestions.lastPvNumber}` : "s PV récents"}
                </div>
                <div style={{ fontSize: FS.xs, color: TX3, marginTop: 2 }}>
                  Vérifie et accepte celles qui méritent d'être suivies — tu décides.
                </div>
              </div>
              <button onClick={() => setSuggestionsModalOpen(true)}
                style={{ padding: "8px 14px", border: "none", borderRadius: 8, background: AC, color: WH, fontSize: FS.sm, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                Voir les suggestions
              </button>
            </div>
          )}


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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
              {[
                { label: "Planning",  icon: "gantt",  color: GR, bg: GRBG, count: (project.lots||[]).length, onClick: onViewPlanning },
                { label: "Documents", icon: "folder", color: BL, bg: BLB, count: (project.planFiles||[]).filter(f=>f.type!=="folder").length, onClick: onViewPlan },
                { label: "Photos",    icon: "camera", color: AC, bg: ACL, count: (project.gallery||[]).length, onClick: onGallery },
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
                <div style={{ width: 34, height: 34, borderRadius: 8, background: openActions.length > 0 ? (urgent.length > 0 ? BRB : SB) : GRBG, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Ico name="alert" size={16} color={openActions.length > 0 ? (urgent.length > 0 ? RD : TX3) : GR} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: TX }}>Actions</div>
                  <div style={{ fontSize: 11, color: openActions.length > 0 ? (urgent.length > 0 ? BR : TX3) : GR }}>
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

          {/* Anciennes cartes colorées Documents/Photos/Planning/Listes retirées —
              remplacées par les onglets en haut de la page. */}

          {/* À faire — la carte Actions ouvertes a été remplacée par cette
              to-do list basée sur project.tasks[] (modèle riche : statuts,
              priorités, échéances, parent). En tête : "À faire maintenant"
              avec le prochain PV à préparer. Liste ensuite les tâches
              ouvertes triées par priorité puis échéance. */}
          {(() => {
            const tasks = project.tasks || [];
            // "Ouvertes" = tout sauf clôturées et brouillons (Créée). On
            // priorise ce qui est réellement actif : Ouverte / En progrès /
            // En attente de validation.
            const openTasks = sortTasks(tasks.filter(t => !isClosed(t.status) && t.status !== "created"));
            const top = openTasks.slice(0, 6);
            const remaining = openTasks.length - top.length;
            return (
              <div className="ap-section-actions"><Card>
                <CardHeader
                  title="À faire"
                  action={openTasks.length > 0
                    ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: TX3, background: SB2, padding: "2px 9px", borderRadius: 20 }}>{openTasks.length} ouverte{openTasks.length > 1 ? "s" : ""}</span>
                    : null}
                />

                {/* Sous-section "À faire maintenant" — guidance contextuelle. */}
                {_canEdit && (() => {
                  const nextPvN = nextPvNumber(project.pvHistory);
                  const hasMeeting = !!project.nextMeeting;
                  return (
                    <div style={{ background: SB, border: `1px solid ${SBB}`, borderRadius: 10, padding: "12px 14px", marginBottom: openTasks.length > 0 ? 12 : 0 }}>
                      <div style={{ fontSize: FS.xs, fontWeight: 700, color: TX3, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        À faire maintenant
                      </div>
                      <div style={{ fontSize: FS.md, fontWeight: 700, color: TX, lineHeight: 1.3, marginTop: 2 }}>
                        Préparer le PV n°{nextPvN}
                      </div>
                      <div style={{ fontSize: FS.sm, color: TX2, lineHeight: 1.4, marginTop: 2 }}>
                        À partir du dernier PV validé et des éléments du projet.
                      </div>
                      {!hasMeeting && (
                        <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6, fontSize: FS.xs, color: TX3, flexWrap: "wrap" }}>
                          <Ico name="calendar" size={10} color={TX3} />
                          <span>Aucune réunion planifiée</span>
                          <span style={{ color: SBB }}>·</span>
                          <button onClick={onEditInfo}
                            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: FS.xs, color: AC, fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 2 }}>
                            Planifier maintenant
                          </button>
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                        {lastPV && (
                          <button onClick={() => onViewPV(lastPV)}
                            style={{ padding: "8px 14px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, color: TX2, fontSize: FS.sm, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 5 }}>
                            <Ico name="eye" size={11} color={TX3} />
                            Voir le dernier PV
                          </button>
                        )}
                        <button onClick={() => onStartNotes()}
                          style={{ padding: "8px 16px", border: "none", borderRadius: 8, background: AC, color: WH, fontSize: FS.sm, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6, boxShadow: "0 1px 3px rgba(192,90,44,0.2)" }}>
                          <Ico name="edit" size={11} color={WH} />
                          Préparer le PV n°{nextPvN}
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* Liste des tâches ouvertes — checkbox compacte qui avance le statut. */}
                {openTasks.length === 0 ? (
                  <div style={{ fontSize: 13, color: TX3, padding: "8px 0" }}>Aucune tâche ouverte.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", border: `1px solid ${SBB}`, borderRadius: 8, overflow: "hidden" }}>
                    {top.map((task, i) => {
                      const status = getTaskStatus(task.status);
                      const priority = getTaskPriority(task.priority);
                      const overdue = isOverdue(task);
                      const due = task.dueDate ? new Date(task.dueDate).toLocaleDateString("fr-BE", { day: "numeric", month: "short" }) : null;
                      return (
                        <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderTop: i > 0 ? `1px solid ${SBB}` : "none", background: WH }}>
                          <button onClick={() => setProjects(prev => prev.map(p => p.id !== project.id ? p : advanceTaskStatus(p, task.id)))}
                            title={`Avancer le statut (actuel : ${status.label})`}
                            style={{ width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${SBB}`, background: WH, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0 }}>
                            <Ico name="arrowr" size={9} color={TX3} />
                          </button>
                          <span title={priority.label} style={{ width: 7, height: 7, borderRadius: "50%", background: priority.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 10, fontWeight: 700, color: TX3, fontFamily: "ui-monospace, monospace", flexShrink: 0 }}>#{task.number || "?"}</span>
                          <div style={{ flex: 1, minWidth: 0, fontSize: FS.sm, fontWeight: 500, color: TX, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {task.title}
                            {due && <span style={{ marginLeft: 8, fontSize: 10, color: overdue ? BR : TX3, fontWeight: overdue ? 700 : 500 }}>· {due}{overdue && " (en retard)"}</span>}
                          </div>
                          <span style={{ fontSize: 9, fontWeight: 700, color: status.color, background: status.bg, padding: "2px 7px", borderRadius: 10, flexShrink: 0 }}>{status.label}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Lien vers la vue Tâches complète (Listes de contrôle retirée
                    — voir Tasks pour le suivi des actions). */}
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  {(remaining > 0 || openTasks.length > 0) && (
                    <button onClick={onViewTasks}
                      style={{ padding: "7px 12px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, color: TX2, fontSize: FS.sm, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <Ico name="listcheck" size={11} color={TX3} />
                      {remaining > 0 ? `Voir toutes les tâches (+${remaining})` : "Ouvrir la vue Tâches"}
                    </button>
                  )}
                </div>
              </Card></div>
            );
          })()}

          {/* ── Informations projet — déplacée depuis la colonne secondaire
              pour densifier la zone principale du Résumé. ── */}
          <Card>
            <CardHeader title={t("project.info")} action={<button onClick={onEditInfo} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><Ico name="edit" size={13} color={TX3} /></button>} />
            <div className="ap-info-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: `${SP.md}px ${SP.lg}px` }}>
              {[
                { icon: "users",    label: t("project.client"),     value: project.client },
                { icon: "building", label: t("project.enterprise"), value: project.contractor },
                { icon: "mappin",   label: t("project.address"),    value: formatAddress(project) },
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
            {/* Actions admin intégrées en pied de card Informations — discrètes */}
            {_canManage && (
              <div className="ap-admin-actions" style={{ display: "flex", gap: 4, marginTop: SP.md, paddingTop: SP.sm + 2, borderTop: `1px solid ${SB2}` }}>
                <SmallBtn onClick={onDuplicate} icon="dup" label={t("duplicate")} />
                <SmallBtn onClick={onArchive} icon="archive" label={project.archived ? t("project.unarchive") : t("project.archive")} />
              </div>
            )}
          </Card>

        </div>

        {/* ═══ Colonne secondaire ═══ */}
        <div className="ap-overview-side" style={{ flex: "0 1 272px", display: "flex", flexDirection: "column", gap: SP.lg - 2, minWidth: 220 }}>

          {/* La carte Participants est désormais positionnée APRÈS la
              MeetingCard (Prochaine réunion) dans desktop-side ci-dessous. */}

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
              {/* Ordre demandé : Prochaine réunion d'abord, Participants ensuite. */}
              <MeetingCard project={project} setProjects={setProjects} rec={rec} />

              {/* Carte Participants — vit après la prochaine réunion. */}
              <Card>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: SP.sm }}>
                  <span style={{ fontSize: FS.md, fontWeight: 700, color: TX, lineHeight: LH.tight }}>Participants</span>
                  <span style={{ fontSize: FS.xs, color: TX3 }}>{project.participants.length} {project.participants.length > 1 ? "participants" : "participant"}</span>
                </div>
                {project.participants.length === 0 ? (
                  <div style={{ fontSize: FS.sm, color: TX3, fontStyle: "italic", padding: "4px 0 8px" }}>Aucun participant.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: SP.xs, marginBottom: SP.sm }}>
                    {project.participants.slice(0, 6).map((p, i) => {
                      const initials = (p.name || "?").split(" ").map(s => s[0] || "").join("").slice(0, 2).toUpperCase();
                      return (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                          <div style={{ width: 28, height: 28, borderRadius: "50%", background: ACL, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: AC, flexShrink: 0 }}>
                            {initials}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: FS.sm, fontWeight: 600, color: TX, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name || "—"}</div>
                            {p.role && <div style={{ fontSize: FS.xs, color: TX3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.role}</div>}
                          </div>
                        </div>
                      );
                    })}
                    {project.participants.length > 6 && (
                      <div style={{ fontSize: FS.xs, color: TX3, fontStyle: "italic", paddingLeft: 36 }}>+ {project.participants.length - 6} autre{project.participants.length - 6 > 1 ? "s" : ""}</div>
                    )}
                  </div>
                )}
                {_canManage && (
                  <button onClick={onEditParticipants}
                    style={{ width: "100%", padding: "8px 12px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, color: TX2, fontSize: FS.sm, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 6 }}>
                    <Ico name="edit" size={11} color={TX3} />
                    Gérer les participants
                  </button>
                )}
                <button onClick={onCollab}
                  style={{ width: "100%", padding: "8px 12px", border: "none", borderRadius: 8, background: AC, color: WH, fontSize: FS.sm, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <Ico name="users" size={11} color={WH} />
                  Inviter des collaborateurs
                </button>
              </Card>

              {/* Suivi du temps — sous les blocs principaux. */}
              {onStartTimer && (
                <TimerCard
                  project={project}
                  activeTimer={activeTimer}
                  onStart={onStartTimer}
                  onPauseResume={onPauseResumeTimer}
                  onStop={onStopTimer}
                  onDiscard={onDiscardTimer}
                  onOpenSessions={onOpenSessions}
                />
              )}
            </div>
          </div>

        </div>
      </div>
      )}

      {/* ═══ Onglet PV ═══ — historique complet, filtres statut + tri */}
      {activeTab === "pv" && (
        <TabPanelPv
          project={project}
          setProjects={setProjects}
          onStartNotes={onStartNotes}
          onViewPV={onViewPV}
          onViewPdf={onViewPdf}
          onImportPV={onImportPV}
          canEdit={_canEdit}
        />
      )}

      {/* ═══ Onglet Actions ═══ */}
      {activeTab === "actions" && (
        <TabPanelActions project={project} setProjects={setProjects}
          openActions={openActions} closedActions={closedActions} canEdit={_canEdit} profile={profile} />
      )}

      {/* ═══ Onglet Documents — PlanManager embarqué inline ═══ */}
      {activeTab === "documents" && (
        <TabPanelDocuments project={project} setProjects={setProjects}
          onAnnotate={onAnnotatePlan} onCrop={onCropPlan} />
      )}

      {/* ═══ Onglet Planning — PlanningView embarqué inline ═══ */}
      {activeTab === "planning" && (
        <TabPanelPlanning project={project} setProjects={setProjects} profile={profile} />
      )}

      {/* ═══ Onglet Photos — GalleryView embarqué inline ═══ */}
      {activeTab === "photos" && (
        <TabPanelPhotos project={project} setProjects={setProjects} onAnnotate={onAnnotatePhoto} />
      )}

      {/* Modal de revue des suggestions IA — déclenchée par le banner Résumé. */}
      <SuggestedTasksModal
        open={suggestionsModalOpen}
        onClose={() => setSuggestionsModalOpen(false)}
        project={project}
        setProjects={setProjects}
        profile={profile}
        showToast={showToast}
      />

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
                    {a.urgent && <span style={{ fontSize: FS.xs, fontWeight: 700, color: RD, background: BRB, padding: "2px 6px", borderRadius: 4 }}>Urgent</span>}
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

      {/* Modale confirmation suppression PV ── */}
      <Modal open={!!pvToDelete} onClose={() => setPvToDelete(null)} title="Supprimer ce PV ?">
        {pvToDelete && (
          <div style={{ display: "flex", flexDirection: "column", gap: SP.md }}>
            <div style={{ padding: `${SP.md}px ${SP.md + 2}px`, background: SB, border: `1px solid ${SBB}`, borderRadius: RAD.md }}>
              <div style={{ fontSize: FS.md, fontWeight: 600, color: TX, marginBottom: 4 }}>
                {pvToDelete.title || `PV n°${pvToDelete.number}`}
              </div>
              <div style={{ fontSize: FS.sm, color: TX3 }}>
                {pvToDelete.date}{pvToDelete.author ? ` · ${pvToDelete.author}` : ""}
              </div>
            </div>
            {pvToDelete.status === "sent" && (
              <div style={{ padding: `${SP.sm + 2}px ${SP.md}px`, background: BRB, border: `1px solid ${REDBRD}`, borderRadius: RAD.md, fontSize: FS.sm, color: TX, lineHeight: 1.5 }}>
                <strong style={{ color: BR }}>Ce PV a été envoyé.</strong> Le destinataire en conserve sa copie ; la suppression ici ne le retire que de ton historique ArchiPilot.
              </div>
            )}
            <div style={{ fontSize: FS.sm, color: TX2, lineHeight: 1.5 }}>
              Cette action est définitive. Le numéro <strong>n°{pvToDelete.number}</strong> ne sera pas réattribué — le prochain PV utilisera le numéro suivant le plus haut.
            </div>
            <div style={{ display: "flex", gap: SP.sm, justifyContent: "flex-end", marginTop: SP.xs }}>
              <button
                onClick={() => setPvToDelete(null)}
                style={{ padding: "8px 16px", border: `1px solid ${SBB}`, borderRadius: RAD.sm, background: WH, color: TX2, fontSize: FS.sm, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}
              >
                Annuler
              </button>
              <button
                onClick={() => { deletePv(pvToDelete.number); setPvToDelete(null); }}
                style={{ padding: "8px 16px", border: "none", borderRadius: RAD.sm, background: BR, color: "#fff", fontSize: FS.sm, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <Ico name="trash" size={12} color="#fff" />Supprimer
              </button>
            </div>
          </div>
        )}
      </Modal>

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

// ═══════════════════════════════════════════════════════════════════
// Sous-composants des onglets workspace projet.
// Pour l'instant : panneaux ciblés + bouton vers la vue dédiée pour les
// modules lourds (PlanManager, PlanningView, GalleryView). On gardera
// la même Coquille pour pouvoir enrichir progressivement chaque onglet.
// ═══════════════════════════════════════════════════════════════════

const PanelCard = ({ children, style = {} }) => (
  <div style={{ background: WH, border: `1px solid #E8E1DA`, borderRadius: 16, padding: "18px 22px", ...style }}>{children}</div>
);

const PanelTitle = ({ children, action }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
    <span style={{ fontSize: FS.lg, fontWeight: 700, color: TX, lineHeight: LH.tight }}>{children}</span>
    {action}
  </div>
);

// ── Onglet PV ──────────────────────────────────────────────────────
// Ordre canonique des statuts PV pour le tri "par statut" — repris de
// PV_STATUSES dans constants/statuses.js (draft → review → validated → sent → late).
const PV_STATUS_RANK = PV_STATUSES.reduce((map, s, i) => { map[s.id] = i; return map; }, {});

function TabPanelPv({ project, setProjects, onStartNotes, onViewPV, onViewPdf, onImportPV, canEdit }) {
  const pvs = project.pvHistory || [];
  // Filtre par statut (multi). Set vide = tous affichés.
  const [filterStatuses, setFilterStatuses] = useState(new Set());
  // Tri : 4 modes possibles. Date desc par défaut (plus récent en haut).
  const [sortBy, setSortBy] = useState("date_desc");

  const updatePvStatus = (pvNum, newStatus) => setProjects(prev => prev.map(p =>
    p.id !== project.id ? p : { ...p, pvHistory: p.pvHistory.map(pv => pv.number === pvNum ? { ...pv, status: newStatus } : pv) }
  ));

  const visiblePvs = useMemo(() => {
    let list = pvs;
    if (filterStatuses.size > 0) {
      list = list.filter(pv => filterStatuses.has(pv.status || "draft"));
    }
    list = [...list].sort((a, b) => {
      if (sortBy === "status_asc" || sortBy === "status_desc") {
        const ra = PV_STATUS_RANK[a.status || "draft"] ?? 99;
        const rb = PV_STATUS_RANK[b.status || "draft"] ?? 99;
        if (ra !== rb) return sortBy === "status_asc" ? ra - rb : rb - ra;
        // tie-break par date (plus récent en premier)
        return (parseDateFR(b.date)?.getTime() || 0) - (parseDateFR(a.date)?.getTime() || 0);
      }
      // Tri date
      const da = parseDateFR(a.date)?.getTime() || 0;
      const db = parseDateFR(b.date)?.getTime() || 0;
      if (da !== db) return sortBy === "date_asc" ? da - db : db - da;
      // tie-break par numéro
      return sortBy === "date_asc" ? (a.number || 0) - (b.number || 0) : (b.number || 0) - (a.number || 0);
    });
    return list;
  }, [pvs, filterStatuses, sortBy]);

  const toggleFilterStatus = (id) => {
    setFilterStatuses(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const t = (k) => k; // PvRow utilise t("project.imported") — fallback identité, le label est compréhensible

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <PanelCard>
        <PanelTitle action={canEdit && (
          <div style={{ display: "flex", gap: 6 }}>
            {onImportPV && (
              <button onClick={onImportPV}
                style={{ padding: "8px 14px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, color: TX2, fontSize: FS.sm, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Ico name="upload" size={11} color={TX3} />Importer un PV
              </button>
            )}
            <button onClick={() => onStartNotes()}
              style={{ padding: "8px 16px", border: "none", borderRadius: 8, background: AC, color: WH, fontSize: FS.sm, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Ico name="edit" size={11} color={WH} />Nouveau PV
            </button>
          </div>
        )}>Historique des PV</PanelTitle>

        {pvs.length === 0 ? (
          <div style={{ padding: "24px 0", textAlign: "center", color: TX3, fontSize: FS.sm }}>
            Aucun PV pour le moment. Démarre la prise de notes pour générer le premier.
          </div>
        ) : (
          <>
            {/* Barre filtres + tri — discrète, alignée comme les autres cards. */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap", paddingBottom: 10, borderBottom: `1px solid ${SBB}` }}>
              {/* Filtre statut — pills multi-select */}
              <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: TX3, textTransform: "uppercase", letterSpacing: "0.05em", marginRight: 2 }}>Statut :</span>
                {PV_STATUSES.map(s => {
                  const active = filterStatuses.has(s.id);
                  return (
                    <button key={s.id} onClick={() => toggleFilterStatus(s.id)}
                      style={{ padding: "4px 10px", border: `1px solid ${active ? s.color : SBB}`, borderRadius: 14, background: active ? s.bg : WH, color: active ? s.color : TX3, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.dot }} />
                      {s.label}
                    </button>
                  );
                })}
                {filterStatuses.size > 0 && (
                  <button onClick={() => setFilterStatuses(new Set())}
                    style={{ background: "none", border: "none", padding: "4px 6px", cursor: "pointer", fontFamily: "inherit", fontSize: 11, color: TX3, textDecoration: "underline" }}>
                    Tout
                  </button>
                )}
              </div>
              <div style={{ flex: 1 }} />
              {/* Tri — dropdown compact */}
              <div style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: TX3, textTransform: "uppercase", letterSpacing: "0.05em" }}>Trier :</span>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                  style={{ padding: "5px 8px", border: `1px solid ${SBB}`, borderRadius: 7, background: WH, color: TX2, fontSize: 11, fontFamily: "inherit", cursor: "pointer" }}>
                  <option value="date_desc">Date — récent d'abord</option>
                  <option value="date_asc">Date — ancien d'abord</option>
                  <option value="status_asc">Statut — A → Z</option>
                  <option value="status_desc">Statut — Z → A</option>
                </select>
              </div>
            </div>

            {/* Liste PV — affichage à plat selon les filtres/tri */}
            {visiblePvs.length === 0 ? (
              <div style={{ padding: "20px 0", textAlign: "center", color: TX3, fontSize: FS.sm }}>
                Aucun PV ne correspond aux filtres actifs.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {visiblePvs.map(pv => (
                  <PvRow key={pv.number}
                    pv={pv}
                    onViewPV={() => onViewPV(pv)}
                    onViewPdf={() => onViewPdf(pv)}
                    updatePvStatus={updatePvStatus}
                    onDeletePv={null}
                    t={t}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </PanelCard>
    </div>
  );
}

// ── Onglet Actions ────────────────────────────────────────────────
function TabPanelActions({ project, setProjects, openActions, closedActions, canEdit, profile }) {
  const allActions = [...openActions, ...closedActions];
  // Id de l'action qu'on vient de créer — à auto-focus dans son input.
  const [autoFocusId, setAutoFocusId] = useState(null);
  const updateAction = (id, patch) => setProjects(prev => prev.map(p =>
    p.id !== project.id ? p : { ...p, actions: (p.actions || []).map(a => a.id === id ? { ...a, ...patch } : a) }
  ));
  const deleteAction = (id) => setProjects(prev => prev.map(p =>
    p.id !== project.id ? p : { ...p, actions: (p.actions || []).filter(a => a.id !== id) }
  ));
  const addAction = () => {
    const id = Math.max(0, ...(project.actions || []).map(a => a.id || 0)) + 1;
    // createdAt + createdBy capturés à la création. Conservés tels quels
    // après édition (le titre peut changer mais l'auteur initial reste).
    const newAction = {
      id, text: "", who: "", urgent: false, open: true, since: "",
      createdAt: new Date().toISOString(),
      createdBy: profile?.name || "—",
    };
    setProjects(prev => prev.map(p => p.id !== project.id ? p : { ...p, actions: [...(p.actions || []), newAction] }));
    setAutoFocusId(id);
  };
  return (
    <PanelCard>
      <PanelTitle action={canEdit && (
        <button onClick={addAction}
          style={{ padding: "8px 16px", border: "none", borderRadius: 8, background: AC, color: WH, fontSize: FS.sm, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 5 }}>
          <Ico name="plus" size={11} color={WH} />Ajouter une action
        </button>
      )}>Actions de suivi</PanelTitle>
      {allActions.length === 0 ? (
        <div style={{ padding: "24px 0", textAlign: "center", color: TX3, fontSize: FS.sm }}>
          Aucune action enregistrée. Les actions urgentes des PV apparaissent automatiquement ici.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {openActions.map(a => (
            <ActionEditableRow key={a.id} action={a} autoFocus={autoFocusId === a.id}
              onUpdate={(patch) => updateAction(a.id, patch)}
              onClose={() => updateAction(a.id, { open: false })}
              onDelete={() => deleteAction(a.id)}
              onAutoFocusConsumed={() => setAutoFocusId(null)}
              participants={project.participants || []}
              canEdit={canEdit} />
          ))}
          {closedActions.length > 0 && (
            <>
              <div style={{ fontSize: FS.xs, fontWeight: 700, color: TX3, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 14, marginBottom: 6 }}>
                Clôturées · {closedActions.length}
              </div>
              {closedActions.map(a => (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, opacity: 0.65 }}>
                  <button onClick={() => updateAction(a.id, { open: true })} title="Rouvrir l'action"
                    style={{ width: 18, height: 18, border: "none", borderRadius: 4, background: SGB, cursor: "pointer", padding: 0, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Ico name="check" size={11} color={GR} />
                  </button>
                  <span style={{ flex: 1, fontSize: FS.sm, color: TX3, textDecoration: "line-through" }}>{a.text || "(sans titre)"}</span>
                  {canEdit && (
                    <button onClick={() => deleteAction(a.id)} title="Supprimer"
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                      <Ico name="trash" size={11} color={TX3} />
                    </button>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </PanelCard>
  );
}

// Ligne d'action éditable inline. Le titre est un input qui se confond avec
// du texte, donc on peut taper directement. Toggle urgent + qui + supprimer
// en bouts de ligne. autoFocus est utilisé pour les actions tout juste créées.
function ActionEditableRow({ action, autoFocus, onUpdate, onClose, onDelete, onAutoFocusConsumed, participants, canEdit }) {
  const inputRef = useRef(null);
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
      onAutoFocusConsumed?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", border: `1px solid ${action.urgent ? REDBRD : SBB}`, borderRadius: 8, background: action.urgent ? REDBG : WH }}>
      <button onClick={onClose} title="Marquer comme close"
        style={{ width: 18, height: 18, border: `1.5px solid ${SBB}`, borderRadius: 4, background: WH, cursor: "pointer", padding: 0, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <input
          ref={inputRef}
          value={action.text}
          onChange={(e) => onUpdate({ text: e.target.value })}
          placeholder="Décris l'action…"
          disabled={!canEdit}
          style={{ width: "100%", border: "none", background: "transparent", padding: 0, fontSize: FS.sm, fontWeight: 600, color: TX, fontFamily: "inherit", outline: "none" }}
        />
        <div style={{ fontSize: 10, color: TX3, marginTop: 2, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <input
            list={`assignees-${action.id}`}
            value={action.who || ""}
            onChange={(e) => onUpdate({ who: e.target.value })}
            placeholder="Assigné à…"
            disabled={!canEdit}
            style={{ border: "none", background: "transparent", padding: 0, fontSize: 10, color: TX3, fontFamily: "inherit", outline: "none", minWidth: 80, maxWidth: 160 }}
          />
          <datalist id={`assignees-${action.id}`}>
            {participants.map((p, i) => <option key={i} value={p.name}>{p.role}</option>)}
          </datalist>
          {action.since && <span>· {action.since}</span>}
          {/* Auteur + date de création — uniquement si l'info est en base
              (les actions héritées d'avant cette feature ne les ont pas). */}
          {action.createdAt && (
            <span style={{ color: TX3 }}>
              · Créée le {new Date(action.createdAt).toLocaleDateString("fr-BE", { day: "2-digit", month: "short", year: "numeric" })}
              {action.createdBy ? ` par ${action.createdBy}` : ""}
            </span>
          )}
        </div>
      </div>
      {canEdit && (
        <>
          <button onClick={() => onUpdate({ urgent: !action.urgent })}
            title={action.urgent ? "Retirer l'urgence" : "Marquer urgent"}
            style={{ padding: "4px 9px", border: `1px solid ${action.urgent ? BR : SBB}`, borderRadius: 12, background: action.urgent ? BR : WH, color: action.urgent ? WH : TX3, fontSize: 9, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            {action.urgent ? "URGENT" : "Urgent ?"}
          </button>
          <button onClick={onDelete} title="Supprimer"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <Ico name="trash" size={11} color={TX3} />
          </button>
        </>
      )}
    </div>
  );
}

// ── Onglet Documents ──────────────────────────────────────────────
// PlanManager embarqué inline pour la liste/upload/dossiers. Annoter et
// Rogner délèguent au parent qui ouvre la vue standalone plein écran
// (meilleure UX qu'un overlay dans une zone d'onglet contrainte). Au retour,
// localStorage restaure automatiquement l'onglet Documents actif.
function TabPanelDocuments({ project, setProjects, onAnnotate, onCrop }) {
  return <PlanManager project={project} setProjects={setProjects} onAnnotate={onAnnotate} onCrop={onCrop} />;
}

// ── Onglet Planning ───────────────────────────────────────────────
// PlanningView embarqué directement (Hiérarchie + Gantt, filtre phase, lots,
// tâches, modals lot/tâche). Pas de PanelCard wrapper pour ne pas contraindre
// la timeline Gantt. Toutes les modals utilisent position:fixed donc
// l'embarquement ne pose pas de problème comme avec PlanViewer.
function TabPanelPlanning({ project, setProjects, profile }) {
  return <PlanningView project={project} setProjects={setProjects} profile={profile} />;
}

// ── Onglet Photos ─────────────────────────────────────────────────
// GalleryView embarqué inline. L'annotation photo (qui utilise PlanViewer
// en plein écran) délègue au parent via onAnnotate, qui redirige vers la
// vue standalone — même pattern que pour Annoter dans Documents.
function TabPanelPhotos({ project, setProjects, onAnnotate }) {
  return <GalleryView project={project} setProjects={setProjects} onAnnotatePhoto={onAnnotate} />;
}

// TabPanelPlus retiré — l'onglet Plus a été supprimé et le module Listes
// de contrôle est déprécié. Dupliquer / Archiver restent dans la card
// Informations (admin actions).
