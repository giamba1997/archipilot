import { useState } from "react";
import { AC, ACL, SB, SBB, TX, TX2, TX3, WH, RD, GR, DIS, DIST } from "../../constants/tokens";
import { Ico } from "../ui";
import { requestOprSignatures } from "../../db";
import { generateOprPdf } from "../../utils/pdf";
import { UpgradeRequiredModal } from "./UpgradeRequiredModal";

// Modal d'envoi de demandes de signature OPR à distance.
//
// Crée un OPR en mode "in_signing" dans project.oprHistory, génère un PDF
// non signé (preview) puis appelle l'Edge Function qui crée N tokens et
// envoie N emails personnalisés. La progression sera ensuite chargée
// depuis la DB par OprView.

async function hashReserves(reserves) {
  try {
    const json = JSON.stringify(reserves || []);
    const buf = new TextEncoder().encode(json);
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
  } catch { return ""; }
}

export function RequestSignaturesModal({ project, setProjects, profile, onClose, onSent, onUpgrade }) {
  // Slots pré-remplis : participants avec email
  const [slots, setSlots] = useState(() => {
    const fromParticipants = (project?.participants || [])
      .filter(p => p.email)
      .map((p, i) => ({
        slotId: `p-${i}`,
        name: p.name || "",
        role: p.role || "",
        email: p.email || "",
        checked: true,
      }));
    return fromParticipants.length > 0 ? fromParticipants : [
      { slotId: "mo", name: "", role: "Maître d'Ouvrage", email: "", checked: true },
      { slotId: "ent", name: "", role: "Entreprise", email: "", checked: true },
    ];
  });

  const [oprType, setOprType] = useState("provisoire");
  const [customMessage, setCustomMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [upgradeInfo, setUpgradeInfo] = useState(null);
  const [delivery, setDelivery] = useState(null); // résultat après envoi

  const reserves = project.reserves || [];

  const updateSlot = (slotId, patch) => setSlots(prev => prev.map(s => s.slotId === slotId ? { ...s, ...patch } : s));
  const removeSlot = (slotId) => setSlots(prev => prev.filter(s => s.slotId !== slotId));
  const addSlot = () => setSlots(prev => [...prev, { slotId: `extra-${Date.now()}`, name: "", role: "", email: "", checked: true }]);

  const validSlots = slots.filter(s => s.checked && s.name.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.email.trim()));
  const canSend = validSlots.length > 0 && !sending;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true); setError("");

    // 1. Crée un OPR local figé (snapshot) avec un id stable
    const oprId = `opr-${Date.now()}`;
    const today = new Date();
    const oprDate = today.toLocaleDateString("fr-BE");
    const oprNumber = (project.oprHistory || []).length + 1;
    const reservesSnapshot = reserves.map(r => ({ ...r }));
    const reservesHash = await hashReserves(reservesSnapshot);

    const oprRecord = {
      id: oprId,
      number: oprNumber,
      type: oprType,
      date: oprDate,
      createdAt: today.toISOString(),
      createdBy: profile?.name || profile?.email || "—",
      reserves: reservesSnapshot,
      reservesHash,
      signatures: [],         // se remplit au fur et à mesure des signatures
      signingRequest: true,   // marque l'OPR comme en cours de signature à distance
      sentTo: validSlots.map(s => s.email),
      sentAt: today.toISOString(),
    };

    // 2. Génère un PDF preview (non signé) pour pièce jointe email
    let pdfBase64 = null;
    let pdfFileName = null;
    try {
      await import("jspdf");
      const res = await generateOprPdf(project, oprRecord, profile, { returnDataUrl: true });
      if (res?.dataUrl) {
        pdfBase64 = res.dataUrl.split(",")[1];
        pdfFileName = res.fileName;
      }
    } catch (e) {
      console.error("PDF generation failed:", e);
      setError("Génération du PDF impossible.");
      setSending(false);
      return;
    }

    // 3. Appel Edge Function — création des tokens + envoi emails
    const result = await requestOprSignatures({
      projectId: project.id,
      projectName: project.name,
      opr: { id: oprId, number: oprNumber, date: oprDate, type: oprType, reserves: reservesSnapshot, reservesHash },
      signatories: validSlots.map(s => ({ name: s.name.trim(), role: s.role.trim(), email: s.email.trim().toLowerCase() })),
      pdfBase64,
      pdfFileName,
      authorName: profile?.name || profile?.email || "L'architecte",
      structureName: profile?.structure,
      customMessage: customMessage.trim() ? customMessage.trim().replace(/\n/g, "<br>") : "",
    });

    setSending(false);
    if (result.upgradeRequired) { setUpgradeInfo(result.upgradeRequired); return; }
    if (result.error) { setError(result.error); return; }

    // 4. Persiste l'OPR localement (history)
    setProjects(prev => prev.map(p => p.id !== project.id ? p : {
      ...p,
      oprHistory: [...(p.oprHistory || []), oprRecord],
    }));

    setDelivery(result.delivery || []);
    onSent?.(result);
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
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 600 }} onClick={onClose}>
      <div style={{ background: WH, borderRadius: 16, width: "100%", maxWidth: 640, maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: "20px 24px 14px", borderBottom: `1px solid ${SBB}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Ico name="send" size={16} color={AC} />
            <span style={{ fontSize: 16, fontWeight: 700, color: TX }}>Envoyer pour signature</span>
          </div>
          <div style={{ fontSize: 12, color: TX3 }}>
            {project.name} — {reserves.length} réserve{reserves.length !== 1 ? "s" : ""}
          </div>
        </div>

        {/* État envoyé */}
        {delivery ? (
          <div style={{ padding: "20px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#EAF3DE", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Ico name="check" size={16} color={GR} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: TX }}>Demandes envoyées</div>
                <div style={{ fontSize: 12, color: TX3 }}>
                  {delivery.filter(d => d.sent).length} / {delivery.length} email{delivery.length > 1 ? "s" : ""} envoyé{delivery.filter(d => d.sent).length > 1 ? "s" : ""}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {delivery.map(d => (
                <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: d.sent ? "#F4F8EE" : "#FEF2F2", border: `1px solid ${d.sent ? "#D5E5BC" : "#FECACA"}`, borderRadius: 8 }}>
                  <Ico name={d.sent ? "check" : "x"} size={11} color={d.sent ? GR : RD} />
                  <span style={{ fontSize: 12, color: TX, flex: 1 }}>{d.email}</span>
                  {!d.sent && d.error && <span style={{ fontSize: 10, color: RD }}>{d.error}</span>}
                </div>
              ))}
            </div>
            <button onClick={onClose} style={{ marginTop: 16, width: "100%", padding: 12, border: "none", borderRadius: 10, background: AC, color: WH, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              Fermer
            </button>
          </div>
        ) : (
          <>
            {/* Type OPR */}
            <div style={{ padding: "14px 24px 0" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 6 }}>Type de réception</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                {[{ id: "provisoire", label: "Provisoire" }, { id: "definitive", label: "Définitive" }].map(t => (
                  <button key={t.id} onClick={() => setOprType(t.id)}
                    style={{ flex: 1, padding: "8px 12px", border: `1.5px solid ${oprType === t.id ? AC : SBB}`, borderRadius: 8, background: oprType === t.id ? ACL : WH, color: oprType === t.id ? AC : TX2, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Signataires */}
            <div style={{ padding: "10px 24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3 }}>
                  Signataires ({validSlots.length} valide{validSlots.length > 1 ? "s" : ""})
                </div>
                <button onClick={addSlot}
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 10px", border: `1px solid ${SBB}`, borderRadius: 6, background: WH, color: TX2, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  <Ico name="plus" size={10} color={TX2} /> Ajouter
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {slots.map(s => (
                  <div key={s.slotId} style={{ background: s.checked ? WH : SB, border: `1px solid ${SBB}`, borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="checkbox" checked={s.checked} onChange={() => updateSlot(s.slotId, { checked: !s.checked })} style={{ accentColor: AC, width: 16, height: 16 }} />
                    <input value={s.name} onChange={e => updateSlot(s.slotId, { name: e.target.value })}
                      placeholder="Nom"
                      style={{ flex: 1, minWidth: 80, padding: "6px 8px", border: `1px solid ${SBB}`, borderRadius: 6, fontSize: 12, fontWeight: 600, color: TX, fontFamily: "inherit", background: WH }} />
                    <input value={s.role} onChange={e => updateSlot(s.slotId, { role: e.target.value })}
                      placeholder="Rôle"
                      style={{ width: 110, padding: "6px 8px", border: `1px solid ${SBB}`, borderRadius: 6, fontSize: 11, color: TX2, fontFamily: "inherit", background: WH }} />
                    <input type="email" value={s.email} onChange={e => updateSlot(s.slotId, { email: e.target.value })}
                      placeholder="email@..."
                      style={{ flex: 1.4, minWidth: 120, padding: "6px 8px", border: `1px solid ${SBB}`, borderRadius: 6, fontSize: 11, color: TX, fontFamily: "inherit", background: WH }} />
                    <button onClick={() => removeSlot(s.slotId)} title="Retirer"
                      style={{ background: "none", border: "none", padding: 4, cursor: "pointer" }}>
                      <Ico name="trash" size={12} color={TX3} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Message custom */}
            <div style={{ padding: "10px 24px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 6 }}>Message (facultatif)</div>
              <textarea value={customMessage} onChange={e => setCustomMessage(e.target.value)} rows={3}
                placeholder="Bonjour, voici le PV de réception... (laisser vide pour le message par défaut)"
                style={{ width: "100%", padding: "10px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 12, fontFamily: "inherit", background: WH, color: TX, boxSizing: "border-box", resize: "vertical", lineHeight: 1.5 }} />
            </div>

            <div style={{ margin: "0 24px 14px", padding: "10px 12px", background: SB, borderRadius: 8, fontSize: 11, color: TX2, lineHeight: 1.5 }}>
              <strong style={{ color: TX }}>Chaque signataire</strong> recevra un email avec un lien personnel et le PDF de l'OPR en pièce jointe.
              Les liens expirent après 14 jours.
            </div>

            {error && (
              <div style={{ margin: "0 24px 14px", padding: "8px 12px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, fontSize: 12, color: RD }}>{error}</div>
            )}

            <div style={{ padding: "0 24px 20px", display: "flex", gap: 8 }}>
              <button onClick={onClose}
                style={{ flex: 1, padding: 11, border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: TX2 }}>
                Annuler
              </button>
              <button onClick={handleSend} disabled={!canSend}
                style={{ flex: 2, padding: 11, border: "none", borderRadius: 8, background: canSend ? AC : DIS, color: canSend ? WH : DIST, fontSize: 13, fontWeight: 700, cursor: canSend ? "pointer" : "not-allowed", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {sending ? (
                  <><div style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: WH, borderRadius: "50%", animation: "sp .6s linear infinite" }} />Envoi...</>
                ) : (
                  <><Ico name="send" size={13} color={canSend ? WH : DIST} />Envoyer à {validSlots.length} signataire{validSlots.length > 1 ? "s" : ""}</>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
