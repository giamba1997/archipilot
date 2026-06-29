import { useEffect, useMemo, useState } from "react";
import {
  AC, ACL, SB, SBB, TX, TX2, TX3, WH, SP, RAD,
  BR, AM, AMB, ST, STB, GR, RD,
} from "../constants/tokens";
import { Ico } from "../components/ui";
import { loadPermits } from "../db";
import { parseDateFR } from "../utils/dates";
import { isEnabled } from "../constants/featureFlags";

// ── MobileNotifs — page Notifs consolidée (mobile) ────────
//
// Vue dédiée mobile qui remplace le drawer dropdown (toujours utilisé
// sur desktop). Consolide en un seul endroit ce qui mérite l'attention
// de l'archi entre deux RDV :
//
//   1. Invitations en attente — réponse rapide accept/decline
//   2. Échéances proches — permis < 7j + réserves overdue (cross-projects)
//   3. Notifications non lues — OPR signé/refusé, comments, invites acceptés
//   4. Notifications lues (collapsable) — historique
//
// Les actions DB passent par les callbacks props (App.jsx gère l'état
// notifications/invitations en source unique). Ce composant ne mute que
// son état local (collapse, échéances chargées au mount).

const TODAY_TS = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return +d; })();

function reservesOverdueOf(p) {
  return (p.reserves || []).filter(r => {
    if (r.status === "levee") return false;
    if (!r.deadline) return false;
    const d = parseDateFR(r.deadline);
    return d && +d < TODAY_TS;
  });
}

function notifMessage(n) {
  if (n.type === "invite") {
    return (<><strong>{n.actor_name || "Quelqu'un"}</strong> t'a invité à collaborer sur <strong>{n.project_name || n.project_id}</strong></>);
  }
  if (n.type === "invite_accepted") {
    return (<><strong>{n.actor_name}</strong> a accepté ton invitation</>);
  }
  if (n.type === "comment") {
    return (<><strong>{n.actor_name}</strong> a commenté sur <strong>{n.project_name || n.project_id}</strong></>);
  }
  if (n.type === "opr_signed") {
    return (<><strong>{n.actor_name || "Un signataire"}</strong> a signé l'OPR n°{n.data?.opr_number} <span style={{ color: TX3 }}>· {n.project_name}</span></>);
  }
  if (n.type === "opr_declined") {
    return (<><strong>{n.actor_name || "Un signataire"}</strong> a refusé de signer l'OPR n°{n.data?.opr_number} <span style={{ color: TX3 }}>· {n.project_name}</span></>);
  }
  if (n.type === "opr_completed") {
    return (<><strong style={{ color: GR }}>OPR n°{n.data?.opr_number} entièrement signé</strong> — prêt à diffuser <span style={{ color: TX3 }}>· {n.project_name}</span></>);
  }
  return n.message || n.type;
}

function notifIcon(n) {
  if (n.type === "opr_signed" || n.type === "opr_completed") return { name: "check", color: GR, bg: "#EAF3DE" };
  if (n.type === "opr_declined") return { name: "alert", color: BR, bg: "#F4E1DB" };
  if (n.type === "invite" || n.type === "invite_accepted") return { name: "users", color: ST, bg: STB };
  if (n.type === "comment") return { name: "mail", color: AC, bg: ACL };
  return { name: "bell", color: TX2, bg: SB };
}

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("fr-BE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

// Temps relatif court : "il y a 12 min" / "il y a 2 h" / "hier · 14:05" / "lun. · 11:20".
function relTime(iso) {
  try {
    const d = new Date(iso); const s = (Date.now() - d.getTime()) / 1000;
    if (s < 3600) return `il y a ${Math.max(1, Math.floor(s / 60))} min`;
    if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
    if (s < 172800) return `hier · ${d.toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" })}`;
    return d.toLocaleDateString("fr-BE", { weekday: "short" }) + " · " + d.toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

export function MobileNotifs({
  projects = [],
  notifications = [],
  invitations = [],
  onSelectProject,
  onMarkRead,
  onMarkAllRead,
  onDelete,
  onDeleteAll,
  onAcceptInvite,
  onDeclineInvite,
  onBack,
}) {
  const [permits, setPermits] = useState([]);
  const [readExpanded, setReadExpanded] = useState(false);

  useEffect(() => {
    if (!isEnabled("permits")) return; // POC : permis différés
    let cancelled = false;
    (async () => {
      const pe = await loadPermits().catch(() => []);
      if (!cancelled) setPermits(pe || []);
    })();
    return () => { cancelled = true; };
  }, []);

  const permitsSoon = useMemo(() => {
    if (!isEnabled("permits")) return [];
    return (permits || [])
      .map(pe => {
        if (!pe.deadline_date) return null;
        const d = new Date(pe.deadline_date);
        if (isNaN(d)) return null;
        const days = Math.ceil((d - TODAY_TS) / 86400000);
        if (days < 0 || days > 7) return null;
        const proj = projects.find(p => String(p.id) === String(pe.project_id));
        return { id: pe.id, days, projectName: proj?.name || pe.project_name || "Permis", project: proj };
      })
      .filter(Boolean)
      .sort((a, b) => a.days - b.days);
  }, [permits, projects]);

  const reservesOverdue = useMemo(() => {
    if (!isEnabled("opr")) return []; // POC : réserves différées
    const out = [];
    (projects || []).forEach(p => {
      if (p.archived) return;
      reservesOverdueOf(p).forEach(r => {
        out.push({
          id: `${p.id}-${r.id}`,
          projectId: p.id,
          projectName: p.name,
          label: r.label || r.text || `Réserve #${r.number || ""}`,
          deadline: r.deadline,
        });
      });
    });
    return out;
  }, [projects]);

  const unread = useMemo(() => notifications.filter(n => !n.read), [notifications]);
  const read = useMemo(() => notifications.filter(n => n.read), [notifications]);

  const hasAnyEcheance = permitsSoon.length + reservesOverdue.length > 0;
  const hasAnyNotif = unread.length + read.length + invitations.length > 0;

  const handleNotifClick = (n) => {
    if (!n.read) onMarkRead?.(n.id);
    const isOpr = n.type === "opr_signed" || n.type === "opr_declined" || n.type === "opr_completed";
    if (isOpr && n.project_id) {
      onSelectProject?.(n.project_id, "opr");
    } else if (n.project_id) {
      onSelectProject?.(n.project_id);
    }
  };

  return (
    <div style={{ maxWidth: "none", margin: "0 auto", paddingBottom: SP.xl * 4 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 20px 14px" }}>
        <h1 style={{ flex: 1, fontSize: 26, fontWeight: 700, color: TX, margin: 0, letterSpacing: "-0.5px" }}>Notifications</h1>
        {unread.length > 0 && (
          <button onClick={onMarkAllRead} aria-label="Tout marquer lu" style={{ background: "none", border: "none", padding: 6, cursor: "pointer", fontSize: 13, color: "#A04C20", fontWeight: 600, fontFamily: "inherit" }}>
            Tout lire
          </button>
        )}
      </div>

      <div style={{ padding: "12px 12px 0" }}>
        {/* ── Invitations en attente ── (collaboration différée au POC) */}
        {isEnabled("collaboration") && invitations.length > 0 && (
          <Section title="Invitations" iconName="users" color={ST}>
            {invitations.map(inv => (
              <div key={inv.id} style={{ padding: 14, background: WH, border: `1px solid ${SBB}`, borderRadius: RAD.md, marginBottom: 8 }}>
                <div style={{ fontSize: 13, color: TX, lineHeight: 1.45, marginBottom: 10 }}>
                  <strong>{inv.invited_name || "Quelqu'un"}</strong> t'a invité à collaborer sur <strong>{inv.project_name || inv.project_id}</strong>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => onAcceptInvite?.(inv.id)} style={{ flex: 1, padding: "9px 12px", border: "none", borderRadius: RAD.sm, background: AC, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                    Accepter
                  </button>
                  <button onClick={() => onDeclineInvite?.(inv.id)} style={{ flex: 1, padding: "9px 12px", border: `1px solid ${SBB}`, borderRadius: RAD.sm, background: WH, color: TX2, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                    Refuser
                  </button>
                </div>
              </div>
            ))}
          </Section>
        )}

        {/* ── Échéances proches ── */}
        {hasAnyEcheance && (
          <Section title={`Échéances < 7 jours (${permitsSoon.length + reservesOverdue.length})`} iconName="clock" color={AM}>
            {permitsSoon.map(pe => (
              <UrgencyRow
                key={`pe-${pe.id}`}
                icon="file"
                color={AM}
                bg={AMB}
                title={pe.projectName}
                sub={`Permis : J-${pe.days}${pe.days === 0 ? " (aujourd'hui)" : ""}`}
                onClick={() => pe.project && onSelectProject?.(pe.project.id, "permits")}
              />
            ))}
            {reservesOverdue.map(r => (
              <UrgencyRow
                key={`r-${r.id}`}
                icon="alert"
                color={BR}
                bg="#F4E1DB"
                title={r.projectName}
                sub={`Réserve en retard : ${r.label}`}
                onClick={() => onSelectProject?.(r.projectId, "opr")}
              />
            ))}
          </Section>
        )}

        {/* ── Notifications non lues ── */}
        {unread.length > 0 && (
          <Section title="Nouveau" iconName="bell" color={AC}>
            {unread.map(n => (
              <NotifCard
                key={n.id}
                notification={n}
                onClick={() => handleNotifClick(n)}
                onDelete={() => onDelete?.(n.id)}
              />
            ))}
          </Section>
        )}

        {/* ── Notifications lues (collapsable) ── */}
        {read.length > 0 && (
          <section style={{ marginBottom: SP.lg }}>
            <button
              onClick={() => setReadExpanded(v => !v)}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 2px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", marginBottom: 8 }}
              aria-expanded={readExpanded}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Ico name="history" size={14} color={TX3} />
                <span style={{ fontSize: 12, fontWeight: 700, color: TX3, textTransform: "uppercase", letterSpacing: 0.6 }}>
                  Plus tôt ({read.length})
                </span>
              </span>
              <Ico name={readExpanded ? "chevron-up" : "chevron-down"} size={14} color={TX3} />
            </button>
            {readExpanded && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {read.map(n => (
                  <NotifCard
                    key={n.id}
                    notification={n}
                    onClick={() => handleNotifClick(n)}
                    onDelete={() => onDelete?.(n.id)}
                    dim
                  />
                ))}
                {read.length > 1 && (
                  <button
                    onClick={onDeleteAll}
                    style={{ marginTop: 8, padding: "10px 12px", background: "none", border: `1px dashed ${SBB}`, borderRadius: RAD.md, color: RD, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                  >
                    Tout supprimer
                  </button>
                )}
              </div>
            )}
          </section>
        )}

        {/* ── Empty state global ── */}
        {!hasAnyEcheance && !hasAnyNotif && (
          <div style={{ padding: SP.xl, marginTop: SP.md, textAlign: "center", background: SB, borderRadius: RAD.md }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: WH, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
              <Ico name="check" size={22} color={GR} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: TX, marginBottom: 4 }}>Tout est sous contrôle</div>
            <div style={{ fontSize: 12, color: TX3, lineHeight: 1.5 }}>
              Aucune notification, aucune échéance proche.<br />
              Tu peux respirer (ou attaquer une visite).
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────
function Section({ title, iconName, color, children }) {
  return (
    <section style={{ marginBottom: SP.lg }}>
      <header style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 2px", marginBottom: 8 }}>
        {iconName && <Ico name={iconName} size={14} color={color || TX3} />}
        <h2 style={{ fontSize: 12, fontWeight: 700, color: color || TX3, margin: 0, textTransform: "uppercase", letterSpacing: 0.6 }}>{title}</h2>
      </header>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {children}
      </div>
    </section>
  );
}

function UrgencyRow({ icon, color, bg, title, sub, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 14px", textAlign: "left",
        border: `1px solid ${SBB}`, background: WH,
        borderRadius: RAD.md, cursor: "pointer",
        fontFamily: "inherit", width: "100%",
      }}
    >
      <div style={{ width: 36, height: 36, borderRadius: 10, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Ico name={icon} size={18} color={color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
        <div style={{ fontSize: 11, color: TX3, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>
      </div>
      <Ico name="chevron-right" size={16} color={TX3} />
    </button>
  );
}

function NotifCard({ notification: n, onClick, onDelete, dim }) {
  const ico = notifIcon(n);
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "14px",
        paddingLeft: dim ? 14 : 18,
        border: "1px solid #EFEDEB",
        background: WH,
        borderRadius: 14,
        cursor: "pointer",
        opacity: dim ? 0.78 : 1,
        position: "relative",
      }}
    >
      {!dim && <div style={{ position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)", width: 7, height: 7, borderRadius: 999, background: AC }} />}
      <div style={{ width: 40, height: 40, borderRadius: 11, background: ico.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Ico name={ico.name} size={19} color={ico.color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: TX, lineHeight: 1.45 }}>
          {notifMessage(n)}
        </div>
        <div style={{ fontSize: 12, color: TX3, marginTop: 3 }}>{relTime(n.created_at)}</div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
        aria-label="Supprimer"
        style={{ background: "none", border: "none", cursor: "pointer", padding: 6, flexShrink: 0 }}
      >
        <Ico name="x" size={13} color={TX3} />
      </button>
    </div>
  );
}
