import { useState, useEffect } from "react";
import { AC, ACL, TX, TX2, TX3, SB, SBB, WH, RD, GR } from "../../constants/tokens";
import { Ico } from "../ui";
import { acceptOrgInvite } from "../../db";

const ROLES_FR = {
  admin: "Administrateur",
  member: "Membre",
  viewer: "Lecteur",
};

/**
 * OrgInviteModal — handles the `?invite=<token>` flow.
 *
 * The invitee lands here after clicking the email link. The actual
 * validation happens server-side via accept-org-invite — this modal
 * just confirms the action with the user, calls the Edge Function,
 * and surfaces the result (joined / wrong email / expired / etc.).
 */
export function OrgInviteModal({ token, profile, onClose, onAccepted }) {
  const [stage, setStage] = useState("confirm"); // "confirm" | "loading" | "success" | "error"
  const [orgInfo, setOrgInfo] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Strip ?invite=… from the URL while the modal is open so a refresh
  // doesn't replay the flow once accepted.
  useEffect(() => {
    if (!token) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("invite");
    window.history.replaceState({}, "", url.toString());
  }, [token]);

  const handleAccept = async () => {
    setStage("loading");
    setErrorMsg("");
    try {
      const result = await acceptOrgInvite(token);
      setOrgInfo(result);
      setStage("success");
      // Notify the parent so it can refresh org list
      if (onAccepted) onAccepted(result);
    } catch (e) {
      setErrorMsg(e.message || "Impossible d'accepter l'invitation");
      setStage("error");
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10010, background: "rgba(31,41,55,0.55)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 460, background: WH, borderRadius: 18, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", overflow: "hidden", animation: "modalIn 0.2s ease-out" }}>
        <div style={{ padding: "28px 28px 4px", display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/icon-512.png" alt="" style={{ width: 36, height: 36 }} />
          <div style={{ fontFamily: "'Manrope', 'Inter', sans-serif", fontSize: 13, fontWeight: 800, color: "#4A3428", letterSpacing: "0.5px", textTransform: "uppercase" }}>ArchiPilot</div>
        </div>

        <div style={{ padding: "16px 28px 28px" }}>
          {stage === "confirm" && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: AC, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8 }}>Invitation reçue</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: TX, letterSpacing: "-0.5px", lineHeight: 1.2, marginBottom: 10 }}>Rejoindre une agence</div>
              <div style={{ fontSize: 13, color: TX2, lineHeight: 1.6, marginBottom: 20 }}>
                Tu as été invité à rejoindre une agence sur ArchiPilot. En acceptant, tu auras accès à ses projets partagés et à ses PV.
                {profile?.email && (
                  <div style={{ marginTop: 8, fontSize: 12, color: TX3 }}>
                    Connecté en tant que <strong style={{ color: TX2 }}>{profile.email}</strong>.
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={onClose}
                  style={{ flex: 1, padding: "11px 16px", border: `1px solid ${SBB}`, borderRadius: 10, background: WH, color: TX2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  Plus tard
                </button>
                <button onClick={handleAccept}
                  style={{ flex: 2, padding: "11px 16px", border: "none", borderRadius: 10, background: AC, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, boxShadow: "0 4px 12px rgba(201,90,27,0.25)" }}>
                  <Ico name="check" size={13} color="#fff" />
                  Accepter l'invitation
                </button>
              </div>
            </>
          )}

          {stage === "loading" && (
            <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
              <div style={{ width: 26, height: 26, border: `3px solid ${SB}`, borderTopColor: AC, borderRadius: "50%", animation: "spin 0.7s linear infinite", margin: "0 auto 14px" }} />
              <div style={{ fontSize: 13, color: TX2 }}>Validation de l'invitation…</div>
            </div>
          )}

          {stage === "success" && (
            <>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: `${GR}18`, display: "flex", alignItems: "center", justifyContent: "center", margin: "4px auto 16px" }}>
                <Ico name="check" size={28} color={GR} />
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: TX, textAlign: "center", marginBottom: 6 }}>
                Bienvenue {orgInfo?.org_name ? `chez ${orgInfo.org_name}` : "dans l'agence"} !
              </div>
              <div style={{ fontSize: 13, color: TX2, textAlign: "center", lineHeight: 1.5, marginBottom: 18 }}>
                {orgInfo?.alreadyMember
                  ? "Tu étais déjà membre de cette agence."
                  : <>Ton rôle : <strong style={{ color: AC }}>{ROLES_FR[orgInfo?.role] || orgInfo?.role}</strong>. Tu peux maintenant accéder aux projets partagés.</>}
              </div>
              <button onClick={onClose}
                style={{ width: "100%", padding: "11px 16px", border: "none", borderRadius: 10, background: AC, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                Continuer
              </button>
            </>
          )}

          {stage === "error" && (
            <>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", margin: "4px auto 16px" }}>
                <Ico name="alert" size={26} color={RD} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: TX, textAlign: "center", marginBottom: 6 }}>
                Invitation impossible
              </div>
              <div style={{ fontSize: 13, color: TX2, textAlign: "center", lineHeight: 1.5, marginBottom: 18 }}>
                {errorMsg || "Cette invitation n'est pas valide."}
              </div>
              <button onClick={onClose}
                style={{ width: "100%", padding: "11px 16px", border: `1px solid ${SBB}`, borderRadius: 10, background: WH, color: TX2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                Fermer
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
