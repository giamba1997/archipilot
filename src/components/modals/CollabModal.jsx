import { useState, useEffect } from "react";
import { useT } from "../../i18n";
import { AC, ACL, SB, SBB, TX, TX2, TX3, WH, RD, GR } from "../../constants/tokens";
import { Ico } from "../ui";
import { inviteMember, loadProjectMembers, updateMemberRole, removeMember, track } from "../../db";
import { getLimit } from "../../constants/config";

// ── Project Permissions Helper ──────────────────────────────
export const getProjectRole = (project) => {
  if (project._shared) return project._role || "reader";
  return "owner";
};
export const canEdit = (project) => { const r = getProjectRole(project); return r === "owner" || r === "admin" || r === "contributor"; };
export const canManageMembers = (project) => { const r = getProjectRole(project); return r === "owner" || r === "admin"; };
export const canManageSettings = (project) => { const r = getProjectRole(project); return r === "owner" || r === "admin"; };
export const isReadOnly = (project) => getProjectRole(project) === "reader";

export function CollabModal({ project, ownerId, onClose, showToast, profile, onUpgrade }) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("contributor");
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const isAdmin = canManageMembers(project) || !project._shared; // owner or admin

  useEffect(() => {
    loadProjectMembers(String(project.id), ownerId).then(setMembers);
  }, [project.id, ownerId]);

  const adminCount = members.filter(m => m.role === "admin" && m.status === "accepted").length;

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    // Plan gate — Free has 0 collaborators, Pro has 3/project, Team unlimited.
    const limit = getLimit(profile?.plan || "free", "maxCollabPerProj");
    if (members.length >= limit) { onUpgrade?.(); return; }
    setError(""); setLoading(true);
    const res = await inviteMember(String(project.id), ownerId, email.trim(), role, project.name, profile?.name || profile?.email || "");
    setLoading(false);
    if (res.error === "already_invited") { setError(t("collab.alreadyInvited")); return; }
    if (res.error) { setError(res.error); return; }
    setEmail("");
    showToast(t("collab.inviteSent"));
    track("invite_sent", { role, project_name: project.name, _page: "collab" });
    loadProjectMembers(String(project.id), ownerId).then(setMembers);
  };

  const handleRemove = async (id) => {
    const member = members.find(m => m.id === id);
    if (member?.role === "admin" && adminCount <= 1) { setError(t("collab.lastAdmin")); return; }
    await removeMember(id);
    setMembers(prev => prev.filter(m => m.id !== id));
  };

  const handleRoleChange = async (id, newRole) => {
    const member = members.find(m => m.id === id);
    if (member?.role === "admin" && newRole !== "admin" && adminCount <= 1) { setError(t("collab.lastAdmin")); return; }
    setError("");
    await updateMemberRole(id, newRole);
    setMembers(prev => prev.map(m => m.id === id ? { ...m, role: newRole } : m));
  };

  const ROLES = [
    { id: "admin", label: t("collab.roleAdmin"), desc: t("collab.roleAdminDesc") },
    { id: "contributor", label: t("collab.roleContributor"), desc: t("collab.roleContributorDesc") },
    { id: "reader", label: t("collab.roleReader"), desc: t("collab.roleReaderDesc") },
  ];

  const statusColors = { pending: "#E8A317", accepted: GR, declined: RD };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500 }} onClick={onClose}>
      <div style={{ background: WH, borderRadius: 16, width: "100%", maxWidth: 520, maxHeight: "85vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)", animation: "modalIn 0.2s ease-out" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${SBB}` }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: TX, marginBottom: 4 }}>{t("collab.inviteTitle")}</div>
          <div style={{ fontSize: 12, color: TX3 }}>{t("collab.inviteDesc")}</div>
        </div>

        {/* Invite form — admin only */}
        {isAdmin ? (
          <form onSubmit={handleInvite} style={{ padding: "16px 24px", borderBottom: `1px solid ${SBB}` }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder={t("collab.email")}
                required
                style={{ flex: 1, padding: "9px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: SB, color: TX, boxSizing: "border-box", minWidth: 0 }}
              />
              <select value={role} onChange={e => setRole(e.target.value)} style={{ padding: "9px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: SB, color: TX, cursor: "pointer" }}>
                {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>
            {/* Role description */}
            <div style={{ fontSize: 11, color: TX3, marginBottom: 10, lineHeight: 1.4 }}>
              {ROLES.find(r => r.id === role)?.desc}
              <span style={{ display: "block", fontSize: 10, color: AC, marginTop: 3, fontWeight: 500 }}>{t("collab.roleNote")}</span>
            </div>
            {error && <div style={{ fontSize: 12, color: RD, marginBottom: 8 }}>{error}</div>}
            <button type="submit" disabled={loading} style={{ padding: "9px 20px", border: "none", borderRadius: 8, background: AC, color: "#fff", fontSize: 13, fontWeight: 600, cursor: loading ? "wait" : "pointer", fontFamily: "inherit" }}>
              {loading ? "..." : t("collab.send")}
            </button>
          </form>
        ) : (
          <div style={{ padding: "12px 24px", borderBottom: `1px solid ${SBB}`, fontSize: 12, color: TX3, fontStyle: "italic" }}>
            Seuls les admins peuvent inviter des membres.
          </div>
        )}

        {/* Members list */}
        <div style={{ padding: "12px 24px 20px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 10 }}>{t("collab.members")} ({members.length})</div>
          {error && members.length > 0 && <div style={{ fontSize: 11, color: RD, marginBottom: 8 }}>{error}</div>}
          {members.length === 0 && (
            <div style={{ fontSize: 13, color: TX3, padding: "8px 0" }}>{t("collab.noMembers")}</div>
          )}
          {members.map(m => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${SBB}` }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: ACL, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: AC, flexShrink: 0 }}>
                {(m.invited_name || m.invited_email || "?").charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: TX, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.invited_name || m.invited_email}</div>
                <div style={{ fontSize: 11, color: TX3 }}>{m.invited_email}</div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, color: statusColors[m.status] || TX3, textTransform: "uppercase" }}>
                {t(`collab.${m.status}`)}
              </span>
              {isAdmin ? (
                <>
                  <select value={m.role} onChange={e => handleRoleChange(m.id, e.target.value)} style={{ padding: "4px 8px", border: `1px solid ${SBB}`, borderRadius: 6, fontSize: 11, fontFamily: "inherit", background: SB, color: TX2, cursor: "pointer" }}>
                    {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                  </select>
                  <button onClick={() => handleRemove(m.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                    <Ico name="x" size={14} color={TX3} />
                  </button>
                </>
              ) : (
                <span style={{ fontSize: 11, fontWeight: 500, color: TX2 }}>{ROLES.find(r => r.id === m.role)?.label}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
