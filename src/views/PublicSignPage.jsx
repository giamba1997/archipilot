import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabase";

// Page publique de signature OPR — sans login, accès via /sign/:token.
//
// Authentification = le token uniquement. Tout passe par l'Edge Function
// `opr-signing` qui valide en service-role et applique les transitions
// d'état (pending → signed/declined/expired).
//
// États visuels :
//   loading       — fetching the request
//   error_invalid — token introuvable
//   error_expired — délai dépassé
//   already_signed— déjà signé (montre la date)
//   declined      — déjà refusé
//   ready         — affichage des réserves + canvas pour signer
//   submitting    — envoi en cours
//   done          — signature enregistrée

const AC = "#B85C2C";
const ACD = "#A04C20";
const ACL = "#FDF6F1";
const TX = "#1D1D1B";
const TX2 = "#3D3A36";
const TX3 = "#807D77";
const TX4 = "#A8A29E";
const SBB = "#E2E1DD";
const SB = "#F4F3EF";
const WH = "#FFFFFF";
const BG = "#FAFAF8";
const RD = "#991B1B";
const REDBG = "#FEF2F2";
const REDBD = "#FECACA";
const AM = "#92400E";
const AMBG = "#FFFBEB";
const AMBD = "#FDE68A";
const GR = "#166534";
const GRBG = "#F0FDF4";
const GRBD = "#BBF7D0";

export function PublicSignPage({ token }) {
  const [state, setState] = useState("loading");
  const [request, setRequest] = useState(null);
  const [error, setError] = useState("");

  // Charge la demande au mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data, error: e } = await supabase.functions.invoke("opr-signing", {
          body: { action: "load", token },
        });
        if (!mounted) return;
        if (e || !data) { setError("Lien invalide"); setState("error_invalid"); return; }
        if (data.error) { setError(data.error); setState("error_invalid"); return; }

        const r = data.request;
        setRequest(r);
        if (r.status === "expired") setState("error_expired");
        else if (r.status === "signed") setState("already_signed");
        else if (r.status === "declined") setState("declined");
        else setState("ready");
      } catch (err) {
        if (!mounted) return;
        setError(err?.message || "Erreur de chargement");
        setState("error_invalid");
      }
    })();
    return () => { mounted = false; };
  }, [token]);

  // ── Submit ────────────────────────────────────────
  const submit = async (signatureDataUrl) => {
    setState("submitting");
    try {
      const { data, error: e } = await supabase.functions.invoke("opr-signing", {
        body: { action: "submit", token, signatureDataUrl },
      });
      if (e || !data || data.error) {
        setError(data?.error || e?.message || "Échec de l'envoi");
        setState("ready");
        return;
      }
      setState("done");
    } catch (err) {
      setError(err?.message || "Erreur réseau");
      setState("ready");
    }
  };

  const decline = async (reason) => {
    setState("submitting");
    try {
      const { data, error: e } = await supabase.functions.invoke("opr-signing", {
        body: { action: "decline", token, reason },
      });
      if (e || !data || data.error) {
        setError(data?.error || e?.message || "Échec");
        setState("ready");
        return;
      }
      setState("declined");
    } catch (err) {
      setError(err?.message || "Erreur");
      setState("ready");
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif", display: "flex", flexDirection: "column" }}>
      {/* Header de marque pleine largeur — rassure le signataire externe */}
      <div style={{ height: 60, flexShrink: 0, background: WH, borderBottom: "1px solid #EFEDEB", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: AC, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 15, fontFamily: "'Manrope','Inter',sans-serif" }}>A</div>
        <span style={{ fontSize: 16, fontWeight: 700, color: TX, letterSpacing: "-0.2px" }}>ArchiPilot</span>
        <span style={{ marginLeft: 8, fontSize: 12, color: TX4, borderLeft: `1px solid ${SBB}`, paddingLeft: 10 }}>Signature électronique sécurisée</span>
      </div>
      <div style={{ flex: 1, padding: "32px 16px" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>

        {state === "loading" && <CardCenter><Spinner /><div style={{ color: TX3, fontSize: 13, marginTop: 12 }}>Chargement du document...</div></CardCenter>}

        {state === "error_invalid" && (
          <CardCenter>
            <Badge color={RD}>Lien invalide</Badge>
            <div style={{ fontSize: 14, color: TX, marginTop: 12 }}>{error || "Ce lien de signature n'existe pas ou a été révoqué."}</div>
            <div style={{ fontSize: 12, color: TX3, marginTop: 8 }}>Contactez l'architecte qui vous a envoyé l'email.</div>
          </CardCenter>
        )}

        {state === "error_expired" && (
          <CardCenter>
            <Badge color={RD}>Lien expiré</Badge>
            <div style={{ fontSize: 14, color: TX, marginTop: 12 }}>Ce lien de signature a expiré.</div>
            <div style={{ fontSize: 12, color: TX3, marginTop: 8 }}>Demandez à l'architecte de vous envoyer un nouveau lien.</div>
          </CardCenter>
        )}

        {state === "already_signed" && request && (
          <CardCenter>
            <Badge color={GR}>Déjà signé</Badge>
            <div style={{ fontSize: 16, fontWeight: 700, color: TX, marginTop: 12 }}>OPR n°{request.opr_number} — {request.project_name}</div>
            <div style={{ fontSize: 12, color: TX3, marginTop: 6 }}>
              Signé par {request.signatory_name} le {request.signed_at ? new Date(request.signed_at).toLocaleDateString("fr-BE") : "—"}.
            </div>
            {request.signature_data_url && (
              <img src={request.signature_data_url} alt="Signature" style={{ marginTop: 14, maxWidth: 280, height: 80, objectFit: "contain", border: `1px solid ${SBB}`, borderRadius: 8, padding: 6, background: WH }} />
            )}
          </CardCenter>
        )}

        {state === "declined" && (
          <CardCenter>
            <Badge color={RD}>Signature refusée</Badge>
            <div style={{ fontSize: 14, color: TX, marginTop: 12 }}>Vous avez refusé de signer ce document.</div>
            <div style={{ fontSize: 12, color: TX3, marginTop: 8 }}>L'architecte a été informé.</div>
          </CardCenter>
        )}

        {state === "done" && (
          <CardCenter>
            <Badge color={GR}>Signature enregistrée</Badge>
            <div style={{ fontSize: 14, color: TX, marginTop: 12 }}>Merci. Votre signature a été transmise à l'architecte.</div>
            <div style={{ fontSize: 12, color: TX3, marginTop: 8 }}>Vous pouvez fermer cette page.</div>
          </CardCenter>
        )}

        {(state === "ready" || state === "submitting") && request && (
          <SignReadyView request={request} submitting={state === "submitting"} error={error} onSubmit={submit} onDecline={decline} />
        )}
        </div>
      </div>
    </div>
  );
}

// ── UI helpers ──────────────────────────────────────────────
function CardCenter({ children }) {
  return (
    <div style={{ background: WH, borderRadius: 16, border: `1px solid ${SBB}`, padding: "40px 24px", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      {children}
    </div>
  );
}
function Badge({ color, children }) {
  return (
    <div style={{ display: "inline-block", padding: "4px 12px", background: color + "1A", color, borderRadius: 6, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
      {children}
    </div>
  );
}
function Spinner() {
  return (
    <div style={{ display: "inline-block", width: 32, height: 32, border: "3px solid #E2E1DD", borderTop: `3px solid ${AC}`, borderRadius: "50%", animation: "spin 0.7s linear infinite" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

// ── Vue prête à signer (page unique, Direction D) ─────────────
function SignReadyView({ request, submitting, error, onSubmit, onDecline }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const lastPt = useRef({ x: 0, y: 0 });
  const [hasInk, setHasInk] = useState(false);
  const [consent, setConsent] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio; canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.fillStyle = "#FCFBFA"; ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = 2.5; ctx.strokeStyle = TX;
  }, []);

  const pt = (e) => { const r = canvasRef.current.getBoundingClientRect(); const t = e.touches?.[0]; return { x: (t ? t.clientX : e.clientX) - r.left, y: (t ? t.clientY : e.clientY) - r.top }; };
  const down = (e) => { e.preventDefault(); drawing.current = true; lastPt.current = pt(e); };
  const moveE = (e) => { if (!drawing.current) return; e.preventDefault(); const ctx = canvasRef.current.getContext("2d"); const p = pt(e); ctx.beginPath(); ctx.moveTo(lastPt.current.x, lastPt.current.y); ctx.lineTo(p.x, p.y); ctx.stroke(); lastPt.current = p; if (!hasInk) setHasInk(true); };
  const up = () => { drawing.current = false; };
  const clear = () => { const c = canvasRef.current; const ctx = c.getContext("2d"); const r = c.getBoundingClientRect(); ctx.fillStyle = "#FCFBFA"; ctx.fillRect(0, 0, r.width, r.height); setHasInk(false); };
  const sign = () => { if (!hasInk || !consent || submitting) return; onSubmit(canvasRef.current.toDataURL("image/png")); };

  const reserves = request.reserves || [];
  const crit = reserves.filter(r => r.severity === "critical").length;
  const minor = reserves.length - crit;
  const expiry = request.expires_at ? new Date(request.expires_at) : null;
  const sender = request.sender_name || request.architect_name || null;
  const canSign = hasInk && consent && !submitting;

  return (
    <>
      {/* Intro */}
      <div style={{ textAlign: "center", marginBottom: 22 }}>
        <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: ACD, marginBottom: 8 }}>Demande de signature · OPR</div>
        <h1 style={{ margin: "0 0 8px", fontSize: 24, fontWeight: 700, color: TX, letterSpacing: "-0.5px" }}>Procès-verbal de réception</h1>
        <div style={{ fontSize: 14, color: TX3, lineHeight: 1.55 }}>{request.project_name}{sender ? <> · transmis par <b style={{ color: TX2 }}>{sender}</b></> : ""}.<br />Merci de vérifier les réserves puis de signer ci-dessous.</div>
      </div>

      {/* Bandeau expiration */}
      {expiry && !isNaN(+expiry) && (
        <div style={{ display: "flex", alignItems: "center", gap: 9, background: AMBG, border: `1px solid ${AMBD}`, borderRadius: 11, padding: "11px 14px", marginBottom: 18 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={AM} strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>
          <span style={{ fontSize: 13, color: AM }}>Ce lien expire le <b>{expiry.toLocaleDateString("fr-BE", { day: "numeric", month: "long", year: "numeric" })}</b>. Aucun compte n'est requis.</span>
        </div>
      )}

      {/* Récap réserves */}
      <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 14, overflow: "hidden", marginBottom: 18 }}>
        <div style={{ padding: "13px 16px", borderBottom: "1px solid #EFEDEB", display: "flex", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: TX }}>{reserves.length} réserve{reserves.length > 1 ? "s" : ""}{reserves.length ? " à lever" : ""}</span>
          {reserves.length > 0 && <span style={{ marginLeft: "auto", fontSize: 12, color: TX4 }}>{crit} critique{crit > 1 ? "s" : ""} · {minor} mineure{minor > 1 ? "s" : ""}</span>}
        </div>
        {reserves.length === 0 ? (
          <div style={{ padding: 16, textAlign: "center", fontSize: 13, color: GR, fontWeight: 600, background: GRBG }}>Aucune réserve constatée — réception sans réserve.</div>
        ) : reserves.map((r, i) => <ReserveRow key={r.id || i} reserve={r} last={i === reserves.length - 1} />)}
      </div>

      {/* Signature */}
      <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 14, padding: 18, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: TX }}>Votre signature</span>
          <button onClick={clear} disabled={!hasInk} style={{ marginLeft: "auto", background: "none", border: "none", fontSize: 12, color: hasInk ? ACD : TX4, cursor: hasInk ? "pointer" : "default", fontFamily: "inherit" }}>Effacer</button>
        </div>
        <div style={{ position: "relative" }}>
          <canvas ref={canvasRef} onMouseDown={down} onMouseMove={moveE} onMouseUp={up} onMouseLeave={up} onTouchStart={down} onTouchMove={moveE} onTouchEnd={up}
            style={{ width: "100%", height: 150, border: "1.5px dashed #D6D3D1", borderRadius: 11, background: "#FCFBFA", touchAction: "none", cursor: "crosshair", display: "block" }} />
          {!hasInk && <span style={{ position: "absolute", bottom: 8, left: 0, right: 0, textAlign: "center", fontSize: 11, color: "#C7C2BD", pointerEvents: "none" }}>Signez avec la souris ou le doigt</span>}
        </div>
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: TX2, marginBottom: 6 }}>Nom &amp; qualité</div>
          <div style={{ height: 42, border: `1px solid ${SBB}`, borderRadius: 10, background: WH, display: "flex", alignItems: "center", padding: "0 13px", fontSize: 14, color: TX }}>{request.signatory_name}{request.signatory_role ? ` · ${request.signatory_role}` : ""}</div>
        </div>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 9, marginTop: 14, cursor: "pointer" }} onClick={() => setConsent(c => !c)}>
          <span style={{ width: 18, height: 18, borderRadius: 5, background: consent ? AC : WH, border: consent ? "none" : `1.5px solid ${SBB}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{consent && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}</span>
          <span style={{ fontSize: 12, color: TX3, lineHeight: 1.5 }}>Je reconnais avoir pris connaissance des réserves listées et j'accepte de les signer électroniquement (valeur légale).</span>
        </label>
      </div>

      {error && <div style={{ marginBottom: 14, padding: "10px 14px", background: REDBG, border: `1px solid ${REDBD}`, borderRadius: 8, fontSize: 12, color: RD }}>{error}</div>}

      {/* Refus inline ou actions */}
      {declineOpen ? (
        <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 11, padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: TX2, marginBottom: 6 }}>Motif du refus (facultatif)</div>
          <textarea value={declineReason} onChange={e => setDeclineReason(e.target.value)} rows={3} placeholder="Pourquoi refusez-vous de signer ?" style={{ width: "100%", padding: "10px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: WH, color: TX, boxSizing: "border-box", resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => setDeclineOpen(false)} disabled={submitting} style={{ flex: 1, height: 44, border: `1px solid ${SBB}`, borderRadius: 10, background: WH, color: TX2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Annuler</button>
            <button onClick={() => onDecline(declineReason)} disabled={submitting} style={{ flex: 1, height: 44, border: "none", borderRadius: 10, background: RD, color: "#fff", fontSize: 13, fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer", fontFamily: "inherit" }}>Confirmer le refus</button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setDeclineOpen(true)} disabled={submitting} style={{ height: 48, padding: "0 18px", background: WH, border: `1px solid ${SBB}`, borderRadius: 11, fontSize: 14, fontWeight: 600, color: RD, cursor: submitting ? "not-allowed" : "pointer", fontFamily: "inherit" }}>Refuser</button>
          <button onClick={sign} disabled={!canSign} style={{ flex: 1, height: 48, background: canSign ? AC : "#E0DDD6", color: canSign ? "#fff" : "#9E9B96", border: "none", borderRadius: 11, fontSize: 15, fontWeight: 700, cursor: canSign ? "pointer" : "not-allowed", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5" /></svg>{submitting ? "Envoi…" : "Signer le procès-verbal"}
          </button>
        </div>
      )}

      {/* Footer confiance */}
      <div style={{ textAlign: "center", marginTop: 16, fontSize: 11, color: TX4, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>Connexion chiffrée · horodatage certifié · conforme eIDAS
      </div>
    </>
  );
}

// ── Ligne de réserve (récap compact) ─────────────────────────
function ReserveRow({ reserve, last }) {
  const strong = reserve.severity === "critical" || reserve.severity === "major";
  const sevLabel = reserve.severity === "critical" ? "Critique" : reserve.severity === "major" ? "Majeure" : reserve.severity === "minor" ? "Mineure" : "Esthétique";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: last ? "none" : "1px solid #F5F2EF" }}>
      <span style={{ fontSize: 12, fontFamily: "ui-monospace, monospace", color: TX4, width: 46, flexShrink: 0 }}>{reserve.code || "—"}</span>
      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: strong ? REDBG : "#F5F5F4", color: strong ? RD : TX3, fontWeight: 600, width: 60, textAlign: "center", flexShrink: 0 }}>{sevLabel}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: TX, lineHeight: 1.4 }}>{reserve.description}</span>
    </div>
  );
}
