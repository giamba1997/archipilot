import { useState } from "react";
import { AC, SB, SBB, TX, TX2, TX3, WH, RD, GR, SP, FS, DIS, DIST } from "../../constants/tokens";
import { Ico } from "../ui";
import { sendOprByEmail } from "../../db";
import { generateOprPdf } from "../../utils/pdf";
import { UpgradeRequiredModal } from "./UpgradeRequiredModal";

// Modal d'envoi de l'OPR par email — calqué sur SendPvModal.
//
// Reçoit l'objet `opr` (entrée de project.oprHistory déjà signée) et envoie :
//  - PDF OPR généré à la volée (signatures embarquées)
//  - Email HTML via Resend (badge "OPR de chantier" en orange)
//  - Track lecture par destinataire (réutilise pixel pv_read avec id "OPR-...")

export function SendOprModal({ project, opr, profile, extraRecipients = [], onClose, onSent, onUpgrade }) {
  // Initial recipients = participants projet + signataires distants reçus.
  // On dédoublonne par email (lowercase) — un signataire qui était déjà
  // dans participants n'apparaît qu'une fois.
  const [recipients, setRecipients] = useState(() => {
    const seen = new Set();
    const out = [];
    for (const p of (project.participants || [])) {
      if (!p.email) continue;
      const key = p.email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ email: p.email, name: p.name, role: p.role, checked: true });
    }
    for (const r of extraRecipients) {
      if (!r.email) continue;
      const key = r.email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ email: r.email, name: r.name || r.email, role: r.role || "", checked: true });
    }
    return out;
  });
  const [extraEmail, setExtraEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [upgradeInfo, setUpgradeInfo] = useState(null);
  const [subject, setSubject] = useState(`OPR n°${opr.number} — ${project.name} (${opr.date})`);

  const reservesCount = (opr.reserves || []).length;
  const signaturesCount = (opr.signatures || []).length;
  const oprTypeLabel = opr.type === "definitive" ? "définitive" : "provisoire";

  const signatureHtml = profile.emailSignature?.trim()
    || `Cordialement,<br>${profile.name}${profile.structure ? `<br>${profile.structure}` : ""}`;

  const [emailBody, setEmailBody] = useState(
    `Bonjour,<br><br>Veuillez trouver ci-joint le procès-verbal de réception ${oprTypeLabel} n°${opr.number} relatif au chantier «&nbsp;${project.name}&nbsp;», dressé le ${opr.date}.<br><br>` +
    `Le rapport recense <strong>${reservesCount} réserve${reservesCount !== 1 ? "s" : ""}</strong>${signaturesCount > 0 ? ` et a été signé par ${signaturesCount} partie${signaturesCount > 1 ? "s" : ""}` : ""}.<br><br>` +
    `Merci d'en prendre connaissance.<br><br>${signatureHtml}`,
  );

  const toggleRecipient = (email) => setRecipients(prev =>
    prev.map(r => r.email === email ? { ...r, checked: !r.checked } : r),
  );

  const addExtra = () => {
    const em = extraEmail.trim().toLowerCase();
    if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) return;
    if (recipients.some(r => r.email === em)) return;
    setRecipients(prev => [...prev, { email: em, name: em, role: "", checked: true }]);
    setExtraEmail("");
  };

  const checkedCount = recipients.filter(r => r.checked).length;
  const checkedRecipients = recipients.filter(r => r.checked);

  const handleSend = async () => {
    const to = checkedRecipients.map(r => r.email);
    if (to.length === 0) return;
    setSending(true); setError("");

    let pdfBase64 = null;
    let pdfFileName = null;
    try {
      await import("jspdf");
      const res = await generateOprPdf(project, opr, profile, { returnDataUrl: true });
      if (res?.dataUrl) {
        pdfBase64 = res.dataUrl.split(",")[1];
        pdfFileName = res.fileName;
      }
    } catch (e) {
      console.error("OPR PDF generation failed:", e);
      setError("Génération du PDF impossible.");
      setSending(false);
      return;
    }

    const res = await sendOprByEmail({
      to,
      projectName: project.name,
      oprNumber: opr.number,
      oprDate: opr.date,
      authorName: profile.name || profile.email || "L'architecte",
      structureName: profile.structure,
      pdfBase64,
      pdfFileName,
      subject,
      customMessage: emailBody
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/\bon\w+\s*=/gi, "data-removed="),
    });

    setSending(false);
    if (res.upgradeRequired) { setUpgradeInfo(res.upgradeRequired); return; }
    if (res.error) { setError(res.error); return; }
    onSent?.(to);
  };

  if (upgradeInfo) {
    return (
      <UpgradeRequiredModal
        feature={upgradeInfo.feature}
        message={upgradeInfo.error}
        currentPlan={upgradeInfo.currentPlan}
        requiredPlan={upgradeInfo.requiredPlan}
        onClose={() => { setUpgradeInfo(null); onClose?.(); }}
        onUpgrade={() => { setUpgradeInfo(null); onClose?.(); onUpgrade?.(); }}
      />
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500 }} onClick={onClose}>
      <div style={{ background: WH, borderRadius: 16, width: "100%", maxWidth: 540, maxHeight: "85vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: "20px 24px 14px", borderBottom: `1px solid ${SBB}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Ico name="send" size={16} color={AC} />
            <span style={{ fontSize: 16, fontWeight: 700, color: TX }}>Envoyer l'OPR n°{opr.number}</span>
          </div>
          <div style={{ fontSize: 12, color: TX3 }}>
            {project.name} — {opr.date} — {reservesCount} réserve{reservesCount !== 1 ? "s" : ""}
            {signaturesCount > 0 && ` • ${signaturesCount} signature${signaturesCount > 1 ? "s" : ""}`}
          </div>
        </div>

        {/* Recipients */}
        <div style={{ padding: "14px 24px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 10 }}>
            Destinataires ({checkedCount} sélectionné{checkedCount > 1 ? "s" : ""})
          </div>
          {recipients.length === 0 && (
            <div style={{ fontSize: 12, color: TX3, padding: "8px 0", fontStyle: "italic" }}>
              Aucun participant avec email. Ajoutez un email ci-dessous.
            </div>
          )}
          {recipients.map((r, i) => (
            <label key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${SB}`, cursor: "pointer" }}>
              <input type="checkbox" checked={r.checked} onChange={() => toggleRecipient(r.email)} style={{ accentColor: AC, width: 16, height: 16 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: TX, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                <div style={{ fontSize: 11, color: TX3 }}>{r.email}{r.role ? ` · ${r.role}` : ""}</div>
              </div>
            </label>
          ))}
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <input
              type="email" value={extraEmail} onChange={e => setExtraEmail(e.target.value)}
              placeholder="Ajouter un email..."
              onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addExtra())}
              style={{ flex: 1, padding: "8px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 12, fontFamily: "inherit", background: SB, color: TX }}
            />
            <button onClick={addExtra} style={{ padding: "8px 14px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", fontSize: 12, fontFamily: "inherit", color: TX2 }}>+</button>
          </div>
        </div>

        {/* Subject */}
        <div style={{ padding: "0 24px 10px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 6 }}>Objet</div>
          <input
            value={subject} onChange={e => setSubject(e.target.value)}
            style={{ width: "100%", padding: "9px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 13, fontWeight: 600, fontFamily: "inherit", background: WH, color: TX, boxSizing: "border-box" }}
          />
        </div>

        {/* Message */}
        <div style={{ padding: "0 24px 10px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 6 }}>Message</div>
          <div
            contentEditable suppressContentEditableWarning
            role="textbox" aria-label="Corps du message email" aria-multiline="true"
            onInput={e => setEmailBody(e.currentTarget.innerHTML)}
            dangerouslySetInnerHTML={{ __html: emailBody }}
            style={{ width: "100%", minHeight: 120, padding: "10px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 12, lineHeight: 1.6, fontFamily: "inherit", background: WH, color: TX, boxSizing: "border-box", outline: "none", overflowWrap: "break-word" }}
          />
        </div>

        {/* PDF info */}
        <div style={{ margin: "0 24px 14px", padding: "10px 12px", background: SB, borderRadius: 8, display: "flex", alignItems: "center", gap: 10 }}>
          <Ico name="file" size={14} color={AC} />
          <div style={{ flex: 1, fontSize: 12, color: TX2 }}>
            <strong style={{ color: TX }}>Rapport OPR PDF</strong> sera joint automatiquement
            {signaturesCount > 0 && <span style={{ color: GR }}> · signatures embarquées</span>}
          </div>
        </div>

        {error && (
          <div style={{ margin: "0 24px 14px", padding: "8px 12px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, fontSize: 12, color: RD }}>{error}</div>
        )}

        <div style={{ padding: "0 24px 20px", display: "flex", gap: 8 }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: 11, border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: TX2 }}>
            Annuler
          </button>
          <button onClick={handleSend} disabled={sending || checkedCount === 0}
            style={{ flex: 2, padding: 11, border: "none", borderRadius: 8, background: (sending || checkedCount === 0) ? DIS : AC, color: (sending || checkedCount === 0) ? DIST : WH, fontSize: 13, fontWeight: 600, cursor: (sending || checkedCount === 0) ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {sending ? (
              <><div style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: WH, borderRadius: "50%", animation: "sp .6s linear infinite" }} />Envoi en cours...</>
            ) : (
              <><Ico name="send" size={14} color={(checkedCount === 0) ? DIST : WH} />Envoyer à {checkedCount}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
