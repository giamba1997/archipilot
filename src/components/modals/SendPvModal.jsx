import { useState } from "react";
import { useT } from "../../i18n";
import { AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, RD, GR, SP, FS, DIS, DIST } from "../../constants/tokens";
import { Ico } from "../ui";
import { sendPvByEmail } from "../../db";
import { generatePDF } from "../../utils/pdf";

export function SendPvModal({ project, pvNumber, pvDate, pvContent, profile, onClose, onSent }) {
  const t = useT();
  const [step, setStep] = useState("recipients"); // "recipients" | "preview" | "sent"
  const [recipients, setRecipients] = useState(
    project.participants.filter(p => p.email).map(p => ({ email: p.email, name: p.name, role: p.role, checked: true }))
  );
  const [extraEmail, setExtraEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [includePdf, setIncludePdf] = useState(true);
  const [subject, setSubject] = useState(`PV n\u00B0${pvNumber} \u2014 ${project.name} (${pvDate})`);
  const signatureHtml = profile.emailSignature?.trim() || `Cordialement,<br>${profile.name}${profile.structure ? `<br>${profile.structure}` : ""}`;
  const [emailBody, setEmailBody] = useState(
    `Bonjour,<br><br>Veuillez trouver ci-${includePdf ? "joint" : "dessous"} le proc\u00E8s-verbal n\u00B0${pvNumber} relatif au chantier \u00AB\u00A0${project.name}\u00A0\u00BB, dress\u00E9 en date du ${pvDate}.<br><br>Merci d'en prendre connaissance et de me faire part de vos \u00E9ventuelles remarques.<br><br>${signatureHtml}`
  );

  const toggleRecipient = (email) => setRecipients(prev => prev.map(r => r.email === email ? { ...r, checked: !r.checked } : r));

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
    if (includePdf) {
      try {
        await import("jspdf"); // ensure jsPDF is loaded
        const res = await generatePDF(project, pvNumber, pvDate, pvContent, profile, { returnDataUrl: true });
        if (res?.dataUrl) {
          pdfBase64 = res.dataUrl.split(",")[1];
          pdfFileName = res.fileName;
        }
      } catch (e) {
        console.error("PDF generation for email failed:", e);
      }
    }

    const res = await sendPvByEmail({
      to,
      projectName: project.name,
      pvNumber,
      pvDate,
      pvContent,
      authorName: profile.name || profile.email || "L'architecte",
      structureName: profile.structure,
      pdfBase64,
      pdfFileName,
      subject,
      customMessage: emailBody.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "").replace(/\bon\w+\s*=/gi, "data-removed="),
    });

    setSending(false);
    if (res.error) { setError(res.error); return; }
    setStep("sent");
    if (onSent) onSent(to);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500 }} onClick={onClose}>
      <div style={{ background: WH, borderRadius: 16, width: "100%", maxWidth: 520, maxHeight: "85vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)", animation: "modalIn 0.2s ease-out" }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: "20px 24px 14px", borderBottom: `1px solid ${SBB}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Ico name="send" size={16} color={AC} />
            <span style={{ fontSize: 16, fontWeight: 700, color: TX }}>Envoyer le PV n°{pvNumber}</span>
          </div>
          <div style={{ fontSize: 12, color: TX3 }}>{project.name} — {pvDate}</div>
          {/* Step indicator with labels */}
          {step !== "sent" && (
            <div style={{ display: "flex", gap: SP.sm, marginTop: SP.md }}>
              {[
                { id: "recipients", label: "1. Destinataires" },
                { id: "preview", label: "2. Aperçu" },
              ].map((s, i) => {
                const active = step === s.id || (step === "preview" && i === 0);
                return (
                  <div key={s.id} style={{ flex: 1 }}>
                    <div style={{ height: 3, borderRadius: 2, background: active ? AC : SBB, transition: "background 0.3s", marginBottom: SP.xs }} />
                    <span style={{ fontSize: FS.xs, fontWeight: active ? 600 : 400, color: active ? AC : TX3 }}>{s.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Step: Sent confirmation ── */}
        {step === "sent" && (
          <div style={{ padding: "32px 24px", textAlign: "center" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#EAF3DE", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <Ico name="check" size={22} color={GR} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: TX, marginBottom: 6 }}>PV envoyé !</div>
            <div style={{ fontSize: 13, color: TX3, marginBottom: 20 }}>
              Envoyé à {checkedCount} destinataire{checkedCount > 1 ? "s" : ""}
            </div>
            <button onClick={onClose} style={{ padding: "10px 24px", border: "none", borderRadius: 8, background: AC, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Fermer</button>
          </div>
        )}

        {/* ── Step 1: Recipients ── */}
        {step === "recipients" && (
          <>
            <div style={{ padding: "14px 24px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 10 }}>
                Destinataires ({checkedCount} sélectionné{checkedCount > 1 ? "s" : ""})
              </div>
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

            <div style={{ padding: "0 24px 14px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "8px 0" }}>
                <input type="checkbox" checked={includePdf} onChange={e => setIncludePdf(e.target.checked)} style={{ accentColor: AC, width: 16, height: 16 }} />
                <span style={{ fontSize: 12, color: TX2 }}>Joindre le PV en PDF</span>
              </label>
            </div>

            <div style={{ padding: "0 24px 20px", display: "flex", gap: 8 }}>
              <button onClick={onClose} style={{ flex: 1, padding: 11, border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: TX2 }}>Annuler</button>
              <button onClick={() => setStep("preview")} disabled={checkedCount === 0} style={{ flex: 2, padding: 11, border: "none", borderRadius: 8, background: checkedCount === 0 ? DIS : AC, color: checkedCount === 0 ? DIST : "#fff", fontSize: 13, fontWeight: 600, cursor: checkedCount === 0 ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <Ico name="eye" size={14} color={checkedCount === 0 ? DIST : "#fff"} />Aperçu de l'email
              </button>
            </div>
          </>
        )}

        {/* ── Step 2: Email Preview & Edit ── */}
        {step === "preview" && (
          <>
            <div style={{ padding: "14px 24px 0" }}>
              {/* Recipients summary */}
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 6 }}>À</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 14 }}>
                {checkedRecipients.map((r, i) => (
                  <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", background: SB, borderRadius: 6, fontSize: 11, color: TX2 }}>
                    {r.name || r.email}
                  </span>
                ))}
              </div>

              {/* Subject */}
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 6 }}>Objet</div>
              <input
                value={subject} onChange={e => setSubject(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 13, fontWeight: 600, fontFamily: "inherit", background: WH, color: TX, marginBottom: 14, boxSizing: "border-box" }}
              />

              {/* Email body */}
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 6 }}>Message</div>
              <div
                contentEditable
                suppressContentEditableWarning
                role="textbox" aria-label="Corps du message email" aria-multiline="true"
                onInput={e => setEmailBody(e.currentTarget.innerHTML)}
                dangerouslySetInnerHTML={{ __html: emailBody }}
                style={{ width: "100%", minHeight: 140, padding: "10px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 12, lineHeight: 1.6, fontFamily: "inherit", background: WH, color: TX, marginBottom: 10, boxSizing: "border-box", outline: "none", overflowWrap: "break-word" }}
              />

              {/* Visual preview */}
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 6 }}>Aperçu visuel</div>
              <div style={{ border: `1px solid ${SBB}`, borderRadius: 10, overflow: "hidden", marginBottom: 14, background: "#F7F6F4" }}>
                {/* Mini email header */}
                <div style={{ background: WH, padding: "12px 16px", borderBottom: `1px solid ${SBB}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <img src="/icon-512.png" alt="ArchiPilot" style={{ width: 28, height: 28, flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#4A3428", fontFamily: "'Manrope', 'Inter', sans-serif", textTransform: "uppercase", letterSpacing: "0.5px" }}>ArchiPilot</div>
                      <div style={{ fontSize: 10, color: TX3 }}>noreply@archipilot.app</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: TX, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subject || "(sans objet)"}</div>
                </div>
                {/* Email body preview */}
                <div style={{ padding: 16, fontSize: 12, lineHeight: 1.7, color: TX, background: WH, margin: 10, borderRadius: 8 }} dangerouslySetInnerHTML={{ __html: emailBody }} />
                {/* PV excerpt */}
                <div style={{ margin: "0 10px 10px", padding: 12, background: "#F7F6F4", borderRadius: 8, border: `1px solid ${SBB}` }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: AC, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>PV de chantier</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: TX, marginBottom: 2 }}>PV n°{pvNumber} — {project.name}</div>
                  <div style={{ fontSize: 10, color: TX3, marginBottom: 6 }}>{pvDate} · {profile.name}</div>
                  <div style={{ fontSize: 10, color: TX2, lineHeight: 1.5, maxHeight: 60, overflow: "hidden" }}>
                    {(pvContent || "").slice(0, 200)}{(pvContent || "").length > 200 ? "…" : ""}
                  </div>
                </div>
                {includePdf && (
                  <div style={{ margin: "0 10px 10px", padding: "8px 12px", background: WH, borderRadius: 8, border: `1px solid ${SBB}`, display: "flex", alignItems: "center", gap: 8 }}>
                    <Ico name="file" size={14} color={AC} />
                    <span style={{ fontSize: 11, color: TX2 }}>PV-{pvNumber}-{project.name.replace(/[^\w\u00C0-\u024F-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "")}.pdf</span>
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div style={{ margin: "0 24px 14px", padding: "8px 12px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, fontSize: 12, color: RD }}>{error}</div>
            )}

            <div style={{ padding: "0 24px 20px", display: "flex", gap: 8 }}>
              <button onClick={() => setStep("recipients")} style={{ flex: 1, padding: 11, border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: TX2, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <Ico name="chevron-left" size={14} color={TX3} />Retour
              </button>
              <button onClick={handleSend} disabled={sending} style={{ flex: 2, padding: 11, border: "none", borderRadius: 8, background: sending ? DIS : AC, color: sending ? DIST : "#fff", fontSize: 13, fontWeight: 600, cursor: sending ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {sending ? <><div style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "sp .6s linear infinite" }} />Envoi en cours...</> : <><Ico name="send" size={14} color="#fff" />Envoyer</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
