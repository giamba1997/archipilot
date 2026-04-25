import { useState, useEffect, useCallback } from "react";
import { AC, ACL, ACL2, TX, TX2, TX3, SB, SB2, SBB, WH, RD, GR, BL } from "../constants/tokens";
import { Ico } from "../components/ui";
import { PLANS } from "../constants/config";
import {
  loadMyOrganizations,
  loadOrgMembers,
  loadPendingOrgInvitations,
  inviteOrgMember,
  revokeOrgInvite,
  removeOrgMember,
  createOrganization,
} from "../db";

const ROLES = [
  { id: "admin",  label: "Administrateur", desc: "Peut inviter, retirer, modifier l'agence" },
  { id: "member", label: "Membre",         desc: "Peut créer / éditer les projets" },
  { id: "viewer", label: "Lecteur",        desc: "Lecture seule" },
];
const ROLE_LABEL = Object.fromEntries(ROLES.map(r => [r.id, r.label]));
ROLE_LABEL.owner = "Propriétaire";

/**
 * AgencyView — manage the user's Team agency.
 *
 * Three modes:
 *   - empty: user has no org → create-agency CTA
 *   - active: user is a member → members list + (if admin/owner) invite controls
 *   - loading on first mount
 *
 * Role-aware: only owner/admin see invite + remove buttons.
 * Owner cannot be removed; only the owner can remove an admin.
 */
export function AgencyView({ profile, onBack, onAgencyChanged }) {
  const [orgs, setOrgs] = useState(null); // null = loading, [] = none
  const [activeOrgId, setActiveOrgId] = useState(null);
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      const list = await loadMyOrganizations();
      setOrgs(list);
      if (list.length > 0) {
        const orgId = activeOrgId && list.some(o => o.id === activeOrgId) ? activeOrgId : list[0].id;
        setActiveOrgId(orgId);
        const [mems, invs] = await Promise.all([
          loadOrgMembers(orgId),
          loadPendingOrgInvitations(orgId),
        ]);
        setMembers(mems);
        setInvitations(invs);
      }
    } catch (e) {
      setError(e.message || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [activeOrgId]);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  const activeOrg = (orgs || []).find(o => o.id === activeOrgId);
  const myRole = activeOrg?._myRole;
  const isAdmin = myRole === "owner" || myRole === "admin";
  const isOwner = myRole === "owner";
  const seatsUsed = members.length + invitations.length;
  const seatsLimit = activeOrg?.seat_limit || 0;
  const seatsFull = seatsUsed >= seatsLimit;

  const handleCreate = async (name) => {
    setBusy(true);
    setError("");
    try {
      const newOrg = await createOrganization(name);
      setActiveOrgId(newOrg.id);
      setShowCreate(false);
      await refreshAll();
      if (onAgencyChanged) onAgencyChanged();
    } catch (e) {
      setError(e.message || "Création impossible");
    } finally {
      setBusy(false);
    }
  };

  const handleInvite = async (email, role) => {
    setBusy(true);
    setError("");
    try {
      await inviteOrgMember(activeOrgId, email, role);
      setShowInvite(false);
      const invs = await loadPendingOrgInvitations(activeOrgId);
      setInvitations(invs);
    } catch (e) {
      setError(e.message || "Invitation impossible");
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (invId) => {
    if (!confirm("Annuler cette invitation ?")) return;
    setBusy(true);
    try {
      await revokeOrgInvite(invId);
      setInvitations(invs => invs.filter(i => i.id !== invId));
    } catch (e) {
      setError(e.message || "Révocation impossible");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (m) => {
    if (!confirm(`Retirer ${m.name || m.email} de l'agence ?`)) return;
    setBusy(true);
    try {
      await removeOrgMember(activeOrgId, m.user_id);
      setMembers(ms => ms.filter(x => x.user_id !== m.user_id));
    } catch (e) {
      setError(e.message || "Suppression impossible");
    } finally {
      setBusy(false);
    }
  };

  // ── Render ──
  if (loading && orgs === null) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: TX3 }}>
        <div style={{ width: 24, height: 24, border: `3px solid ${SB}`, borderTopColor: AC, borderRadius: "50%", animation: "spin 0.7s linear infinite", margin: "0 auto 12px" }} />
        Chargement de l'agence…
      </div>
    );
  }

  // Empty state
  if (!orgs || orgs.length === 0) {
    return (
      <div style={{ animation: "fadeIn 0.2s ease" }}>
        <PageHeader onBack={onBack} title="Mon agence" />
        <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 14, padding: "32px 28px", textAlign: "center", maxWidth: 560, margin: "20px auto" }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: ACL, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <Ico name="users" size={26} color={AC} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: TX, marginBottom: 6 }}>Pas encore d'agence</div>
          <div style={{ fontSize: 13, color: TX2, lineHeight: 1.5, marginBottom: 18 }}>
            Crée une agence pour partager tes projets avec d'autres architectes, gérer les rôles et débloquer les fonctionnalités Team.
          </div>
          <div style={{ fontSize: 11, color: TX3, marginBottom: 18, padding: "10px 14px", background: SB, borderRadius: 8 }}>
            Plan Team — {PLANS.team.seatsIncluded} sièges inclus à {PLANS.team.price} €/mois · +{PLANS.team.extraSeatPrice} €/siège supplémentaire
          </div>
          <button onClick={() => setShowCreate(true)} disabled={busy}
            style={{ padding: "11px 22px", border: "none", borderRadius: 10, background: AC, color: "#fff", fontSize: 13, fontWeight: 700, cursor: busy ? "wait" : "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 8, boxShadow: "0 4px 12px rgba(201,90,27,0.25)" }}>
            <Ico name="plus" size={13} color="#fff" />
            Créer mon agence
          </button>
          {error && <div style={{ marginTop: 14, color: RD, fontSize: 12 }}>{error}</div>}
        </div>
        {showCreate && <CreateOrgModal onSubmit={handleCreate} onClose={() => setShowCreate(false)} busy={busy} />}
      </div>
    );
  }

  // Active state
  return (
    <div style={{ animation: "fadeIn 0.2s ease" }}>
      <PageHeader onBack={onBack} title="Mon agence" />

      {error && (
        <div style={{ padding: "10px 14px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, marginBottom: 14, fontSize: 13, color: RD }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {/* Org card */}
        <div style={{ flex: "2 1 320px", background: WH, border: `1px solid ${SBB}`, borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: AC, textTransform: "uppercase", letterSpacing: "0.1em" }}>Agence Team</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: TX, marginTop: 2 }}>{activeOrg.name}</div>
              <div style={{ fontSize: 11, color: TX3, marginTop: 4 }}>Ton rôle : <strong style={{ color: TX2 }}>{ROLE_LABEL[myRole] || myRole}</strong></div>
            </div>
            <SeatsBadge used={seatsUsed} total={seatsLimit} />
          </div>

          {isAdmin && (
            <button onClick={() => setShowInvite(true)} disabled={busy || seatsFull}
              style={{ padding: "9px 16px", border: "none", borderRadius: 9, background: seatsFull ? SB : AC, color: seatsFull ? TX3 : "#fff", fontSize: 12, fontWeight: 700, cursor: seatsFull ? "not-allowed" : "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Ico name="plus" size={11} color={seatsFull ? TX3 : "#fff"} />
              {seatsFull ? "Tous les sièges utilisés" : "Inviter un membre"}
            </button>
          )}
        </div>
      </div>

      {/* Members list */}
      <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 14, padding: "16px 20px", marginTop: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: TX3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Membres ({members.length})</div>
        {members.length === 0 && <div style={{ fontSize: 12, color: TX3, padding: "8px 0" }}>Aucun membre.</div>}
        {members.map(m => (
          <div key={m.user_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: `1px solid ${SB2}` }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: m.avatar ? `url(${m.avatar}) center/cover` : SB, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 11, fontWeight: 700, color: TX3 }}>
              {!m.avatar && (m.name || m.email || "?").slice(0, 2).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {m.name || m.email}
              </div>
              <div style={{ fontSize: 11, color: TX3 }}>{m.email}</div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: m.role === "owner" ? AC : TX2, background: m.role === "owner" ? ACL : SB, padding: "3px 9px", borderRadius: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {ROLE_LABEL[m.role] || m.role}
            </span>
            {isAdmin && m.role !== "owner" && m.user_id !== profile?.userId && (m.role !== "admin" || isOwner) && (
              <button onClick={() => handleRemove(m)} disabled={busy}
                title="Retirer ce membre"
                style={{ padding: "5px 8px", border: `1px solid ${SBB}`, borderRadius: 7, background: WH, color: RD, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                Retirer
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 14, padding: "16px 20px", marginTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: TX3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Invitations en attente ({invitations.length})</div>
          {invitations.map(inv => (
            <div key={inv.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: `1px solid ${SB2}` }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: SB, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Ico name="send" size={13} color={TX3} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: TX }}>{inv.email}</div>
                <div style={{ fontSize: 11, color: TX3 }}>
                  Expire le {new Date(inv.expires_at).toLocaleDateString("fr-BE")}
                </div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: TX2, background: SB, padding: "3px 9px", borderRadius: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {ROLE_LABEL[inv.role] || inv.role}
              </span>
              {isAdmin && (
                <button onClick={() => handleRevoke(inv.id)} disabled={busy}
                  style={{ padding: "5px 8px", border: `1px solid ${SBB}`, borderRadius: 7, background: WH, color: TX3, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  Annuler
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {showInvite && (
        <InviteModal
          onSubmit={handleInvite}
          onClose={() => setShowInvite(false)}
          busy={busy}
          remainingSeats={Math.max(0, seatsLimit - seatsUsed)}
        />
      )}
      {showCreate && <CreateOrgModal onSubmit={handleCreate} onClose={() => setShowCreate(false)} busy={busy} />}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────

function PageHeader({ onBack, title }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
      <button onClick={onBack}
        style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${SBB}`, background: WH, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Ico name="back" size={13} color={TX2} />
      </button>
      <div style={{ fontSize: 22, fontWeight: 800, color: TX, letterSpacing: "-0.4px" }}>{title}</div>
    </div>
  );
}

function SeatsBadge({ used, total }) {
  const ratio = total > 0 ? used / total : 0;
  const color = ratio >= 1 ? RD : ratio >= 0.8 ? "#D97706" : GR;
  return (
    <div style={{ padding: "6px 12px", border: `1px solid ${color}33`, background: `${color}10`, borderRadius: 10, textAlign: "center" }}>
      <div style={{ fontSize: 16, fontWeight: 800, color }}>{used}<span style={{ fontSize: 11, color: TX3, fontWeight: 600 }}>/{total}</span></div>
      <div style={{ fontSize: 9, color: TX3, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Sièges</div>
    </div>
  );
}

function CreateOrgModal({ onSubmit, onClose, busy }) {
  const [name, setName] = useState("");
  const submit = (e) => { e.preventDefault(); if (name.trim()) onSubmit(name.trim()); };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10005, background: "rgba(31,41,55,0.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 420, background: WH, borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.18)", padding: "24px 26px" }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: TX, marginBottom: 6 }}>Créer une agence</div>
        <div style={{ fontSize: 12, color: TX2, marginBottom: 16, lineHeight: 1.5 }}>
          Donne un nom à ton agence — c'est ce que tes coéquipiers verront.
        </div>
        <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Atelier Moreau Architecture" maxLength={120}
          style={{ width: "100%", padding: "11px 14px", border: `1px solid ${SBB}`, borderRadius: 9, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", marginBottom: 16 }} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} disabled={busy}
            style={{ padding: "10px 16px", border: `1px solid ${SBB}`, borderRadius: 9, background: WH, color: TX2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Annuler</button>
          <button type="submit" disabled={busy || !name.trim()}
            style={{ padding: "10px 22px", border: "none", borderRadius: 9, background: name.trim() ? AC : SBB, color: name.trim() ? "#fff" : TX3, fontSize: 13, fontWeight: 700, cursor: (busy || !name.trim()) ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            {busy ? "Création…" : "Créer"}
          </button>
        </div>
      </form>
    </div>
  );
}

function InviteModal({ onSubmit, onClose, busy, remainingSeats }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const submit = (e) => { e.preventDefault(); if (email.trim()) onSubmit(email.trim().toLowerCase(), role); };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10005, background: "rgba(31,41,55,0.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 460, background: WH, borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.18)", padding: "24px 26px" }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: TX, marginBottom: 6 }}>Inviter un membre</div>
        <div style={{ fontSize: 12, color: TX2, marginBottom: 16, lineHeight: 1.5 }}>
          {remainingSeats > 0 ? `Il te reste ${remainingSeats} ${remainingSeats > 1 ? "sièges" : "siège"} disponible${remainingSeats > 1 ? "s" : ""}.` : "Plus de sièges disponibles."}
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, color: TX2, marginBottom: 6 }}>Email</div>
        <input autoFocus type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="alice@example.com"
          style={{ width: "100%", padding: "11px 14px", border: `1px solid ${SBB}`, borderRadius: 9, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", marginBottom: 14 }} />

        <div style={{ fontSize: 11, fontWeight: 600, color: TX2, marginBottom: 6 }}>Rôle</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
          {ROLES.map(r => (
            <label key={r.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", border: `1.5px solid ${role === r.id ? AC : SBB}`, background: role === r.id ? ACL : WH, borderRadius: 9, cursor: "pointer", transition: "all 0.12s" }}>
              <input type="radio" name="role" value={r.id} checked={role === r.id} onChange={() => setRole(r.id)} style={{ marginTop: 2 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: role === r.id ? AC : TX }}>{r.label}</div>
                <div style={{ fontSize: 11, color: TX3, marginTop: 1 }}>{r.desc}</div>
              </div>
            </label>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} disabled={busy}
            style={{ padding: "10px 16px", border: `1px solid ${SBB}`, borderRadius: 9, background: WH, color: TX2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Annuler</button>
          <button type="submit" disabled={busy || !email.trim()}
            style={{ padding: "10px 22px", border: "none", borderRadius: 9, background: email.trim() ? AC : SBB, color: email.trim() ? "#fff" : TX3, fontSize: 13, fontWeight: 700, cursor: (busy || !email.trim()) ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            {busy ? "Envoi…" : "Envoyer l'invitation"}
          </button>
        </div>
      </form>
    </div>
  );
}
