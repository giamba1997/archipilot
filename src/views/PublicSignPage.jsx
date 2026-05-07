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

const AC = "#C95A1B";
const TX = "#1D1D1B";
const TX2 = "#3D3A36";
const TX3 = "#807D77";
const SBB = "#E2E1DD";
const SB = "#F4F3EF";
const WH = "#FFFFFF";
const BG = "#FAFAF8";
const RD = "#C4392A";
const GR = "#4E8E5A";

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
    <div style={{ minHeight: "100vh", background: BG, fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif", padding: "24px 16px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        {/* Brand header */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <img src="/icon-512.png" alt="ArchiPilot" style={{ width: 40, height: 40, borderRadius: 10 }} />
          <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 14, fontWeight: 800, color: "#4A3428", marginTop: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>ArchiPilot</div>
        </div>

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

// ── Vue prête à signer ──────────────────────────────────────
function SignReadyView({ request, submitting, error, onSubmit, onDecline }) {
  const [showCanvas, setShowCanvas] = useState(false);
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [declineReason, setDeclineReason] = useState("");

  const reserves = request.reserves || [];
  const docTypeLabel = request.opr_type === "definitive" ? "définitive" : "provisoire";

  return (
    <div style={{ background: WH, borderRadius: 16, border: `1px solid ${SBB}`, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      {/* Header */}
      <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${SBB}`, background: BG }}>
        <Badge color={AC}>Signature requise</Badge>
        <div style={{ fontSize: 22, fontWeight: 700, color: TX, marginTop: 10 }}>OPR n°{request.opr_number}</div>
        <div style={{ fontSize: 13, color: TX3, marginTop: 4 }}>
          Réception {docTypeLabel} · {request.project_name} · {request.opr_date}
        </div>
      </div>

      {/* Signataire */}
      <div style={{ padding: "16px 24px", background: SB, borderBottom: `1px solid ${SBB}` }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 4 }}>Signataire</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: TX }}>{request.signatory_name}</div>
        {request.signatory_role && <div style={{ fontSize: 12, color: TX3 }}>{request.signatory_role}</div>}
      </div>

      {/* Réserves */}
      <div style={{ padding: "20px 24px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TX, marginBottom: 10 }}>
          Réserves consignées ({reserves.length})
        </div>
        {reserves.length === 0 ? (
          <div style={{ padding: 16, background: "#EAF3DE", borderRadius: 10, fontSize: 13, color: GR, fontWeight: 600, textAlign: "center" }}>
            Aucune réserve constatée — réception sans réserve.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 360, overflow: "auto" }}>
            {reserves.map((r, i) => (
              <ReserveRow key={r.id || i} reserve={r} />
            ))}
          </div>
        )}

        <div style={{ marginTop: 16, padding: 12, background: BG, borderRadius: 10, fontSize: 12, color: TX2, lineHeight: 1.6 }}>
          En signant ci-dessous, vous certifiez avoir pris connaissance des réserves listées.
          Votre signature sera horodatée et transmise à l'architecte.
        </div>
      </div>

      {/* Erreur */}
      {error && (
        <div style={{ margin: "0 24px 14px", padding: "10px 14px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, fontSize: 12, color: RD }}>
          {error}
        </div>
      )}

      {/* Actions */}
      {!showCanvas && !showDeclineForm && (
        <div style={{ padding: "0 24px 24px", display: "flex", gap: 10 }}>
          <button onClick={() => setShowDeclineForm(true)} disabled={submitting}
            style={{ flex: 1, padding: "12px 14px", border: `1px solid ${SBB}`, borderRadius: 10, background: WH, color: TX2, fontSize: 13, fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            Refuser
          </button>
          <button onClick={() => setShowCanvas(true)} disabled={submitting}
            style={{ flex: 2, padding: "12px 18px", border: "none", borderRadius: 10, background: AC, color: WH, fontSize: 14, fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            Signer le document
          </button>
        </div>
      )}

      {/* Decline form */}
      {showDeclineForm && (
        <div style={{ padding: "0 24px 24px" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: TX2, marginBottom: 6 }}>Motif (facultatif)</div>
          <textarea value={declineReason} onChange={e => setDeclineReason(e.target.value)} rows={3}
            placeholder="Pourquoi refusez-vous de signer ?"
            style={{ width: "100%", padding: "10px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: WH, color: TX, boxSizing: "border-box", resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => setShowDeclineForm(false)} disabled={submitting}
              style={{ flex: 1, padding: "11px 14px", border: `1px solid ${SBB}`, borderRadius: 10, background: WH, color: TX2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Annuler
            </button>
            <button onClick={() => onDecline(declineReason)} disabled={submitting}
              style={{ flex: 1, padding: "11px 14px", border: "none", borderRadius: 10, background: RD, color: WH, fontSize: 13, fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
              Confirmer le refus
            </button>
          </div>
        </div>
      )}

      {/* Canvas pad inline */}
      {showCanvas && (
        <div style={{ padding: "0 24px 24px" }}>
          <SignaturePad onCancel={() => setShowCanvas(false)} onSubmit={onSubmit} submitting={submitting} />
        </div>
      )}
    </div>
  );
}

// ── Réserve row read-only ───────────────────────────────────
function ReserveRow({ reserve }) {
  const sevColor = reserve.severity === "critical" ? RD
    : reserve.severity === "major" ? "#D97706"
    : TX3;
  const sevLabel = reserve.severity === "critical" ? "Critique"
    : reserve.severity === "major" ? "Majeure"
    : reserve.severity === "minor" ? "Mineure"
    : "Esthétique";
  const statColor = reserve.status === "levee" ? GR
    : reserve.status === "partiellement_levee" ? "#D97706"
    : RD;
  const statLabel = reserve.status === "levee" ? "Levée"
    : reserve.status === "partiellement_levee" ? "En cours"
    : "Non levée";

  return (
    <div style={{ background: WH, border: `1px solid ${reserve.severity === "critical" && reserve.status !== "levee" ? "#FECACA" : SBB}`, borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: TX, fontFamily: "monospace" }}>{reserve.code || "—"}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: sevColor, background: sevColor + "1A", padding: "2px 6px", borderRadius: 4 }}>{sevLabel.toUpperCase()}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: statColor, background: statColor + "1A", padding: "2px 6px", borderRadius: 4 }}>{statLabel.toUpperCase()}</span>
        {reserve.contractor && <span style={{ marginLeft: "auto", fontSize: 11, color: TX3 }}>{reserve.contractor}</span>}
      </div>
      <div style={{ fontSize: 13, color: TX, lineHeight: 1.5 }}>{reserve.description}</div>
      {(reserve.location || reserve.deadline) && (
        <div style={{ fontSize: 11, color: TX3, marginTop: 4 }}>
          {reserve.location && <span>📍 {reserve.location}</span>}
          {reserve.location && reserve.deadline && <span> · </span>}
          {reserve.deadline && <span>Échéance {reserve.deadline}</span>}
        </div>
      )}
    </div>
  );
}

// ── Canvas signature inline ─────────────────────────────────
function SignaturePad({ onCancel, onSubmit, submitting }) {
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const lastPt = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.fillStyle = WH;
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = TX;
  }, []);

  const getPoint = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    if (e.touches && e.touches.length > 0) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const start = (e) => { e.preventDefault(); setDrawing(true); lastPt.current = getPoint(e); };
  const move = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const pt = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(lastPt.current.x, lastPt.current.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    lastPt.current = pt;
    if (!hasInk) setHasInk(true);
  };
  const end = () => setDrawing(false);

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = WH;
    ctx.fillRect(0, 0, rect.width, rect.height);
    setHasInk(false);
  };

  const validate = () => {
    if (!hasInk || submitting) return;
    onSubmit(canvasRef.current.toDataURL("image/png"));
  };

  return (
    <>
      <div style={{ fontSize: 12, color: TX3, marginBottom: 8 }}>
        Signez dans la zone ci-dessous (souris ou doigt sur écran tactile).
      </div>
      <canvas
        ref={canvasRef}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end}
        style={{ width: "100%", height: 200, border: `2px dashed ${SBB}`, borderRadius: 10, background: WH, touchAction: "none", cursor: "crosshair", display: "block" }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={onCancel} disabled={submitting}
          style={{ flex: 1, padding: 11, border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: submitting ? "not-allowed" : "pointer", fontSize: 13, fontFamily: "inherit", color: TX2 }}>
          Annuler
        </button>
        <button onClick={clear} disabled={!hasInk || submitting}
          style={{ flex: 1, padding: 11, border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: hasInk && !submitting ? "pointer" : "not-allowed", fontSize: 13, fontFamily: "inherit", color: hasInk ? TX2 : "#A09D96" }}>
          Effacer
        </button>
        <button onClick={validate} disabled={!hasInk || submitting}
          style={{ flex: 2, padding: 11, border: "none", borderRadius: 8, background: hasInk && !submitting ? AC : "#E0DDD6", color: hasInk && !submitting ? WH : "#9E9B96", fontSize: 13, fontWeight: 700, cursor: hasInk && !submitting ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
          {submitting ? "Envoi..." : "Valider la signature"}
        </button>
      </div>
    </>
  );
}
