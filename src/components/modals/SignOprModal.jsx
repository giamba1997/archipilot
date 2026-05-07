import { useState, useRef, useEffect } from "react";
import { AC, ACL, SBB, TX, TX2, TX3, WH, GR, DIS, DIST } from "../../constants/tokens";
import { Ico } from "../ui";

// Modal de signature OPR — canvas tactile/souris pour chaque signataire.
//
// Flow :
//  1. Liste des signataires attendus (participants + ajout libre)
//  2. Clic « Signer » → canvas plein écran, signature au doigt/souris
//  3. Validation → la signature est stockée en mémoire avec métadonnées
//     (nom, rôle, email, dataUrl PNG, signedAt, userAgent, hash réserves)
//  4. « Terminer » → crée une entrée dans project.oprHistory (snapshot
//     immutable des réserves + signatures) et déclenche onComplete

// Hash simple SHA-256 des réserves snapshot pour preuve d'intégrité.
async function hashReserves(reserves) {
  try {
    const json = JSON.stringify(reserves || []);
    const buf = new TextEncoder().encode(json);
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return "";
  }
}

export function SignOprModal({ open, onClose, project, setProjects, profile, showToast, onComplete }) {
  // Slots de signature — un par signataire attendu
  const initialSlots = () => {
    const fromParticipants = (project?.participants || []).map((p, i) => ({
      slotId: `p-${i}`,
      name: p.name || "",
      role: p.role || "",
      email: p.email || "",
      dataUrl: null,
      signedAt: null,
    }));
    return fromParticipants.length > 0 ? fromParticipants : [
      { slotId: "mo", name: "", role: "Maître d'Ouvrage", email: "", dataUrl: null, signedAt: null },
      { slotId: "archi", name: profile?.name || "", role: "Architecte", email: profile?.email || "", dataUrl: null, signedAt: null },
      { slotId: "ent", name: "", role: "Entreprise", email: "", dataUrl: null, signedAt: null },
    ];
  };

  const [slots, setSlots] = useState(initialSlots);
  const [activeSlot, setActiveSlot] = useState(null); // slotId currently signing
  const [oprType, setOprType] = useState("provisoire"); // "provisoire" | "definitive"

  if (!open) return null;

  const signedCount = slots.filter(s => s.dataUrl).length;
  const canFinalize = signedCount > 0;

  const onSignaturePadSave = (slotId, dataUrl) => {
    setSlots(prev => prev.map(s => s.slotId === slotId
      ? { ...s, dataUrl, signedAt: new Date().toISOString() }
      : s,
    ));
    setActiveSlot(null);
  };

  const removeSignature = (slotId) => {
    setSlots(prev => prev.map(s => s.slotId === slotId
      ? { ...s, dataUrl: null, signedAt: null }
      : s,
    ));
  };

  const updateSlot = (slotId, patch) => {
    setSlots(prev => prev.map(s => s.slotId === slotId ? { ...s, ...patch } : s));
  };

  const addSignatorySlot = () => {
    setSlots(prev => [...prev, {
      slotId: `extra-${Date.now()}`,
      name: "",
      role: "",
      email: "",
      dataUrl: null,
      signedAt: null,
    }]);
  };

  const removeSlot = (slotId) => {
    setSlots(prev => prev.filter(s => s.slotId !== slotId));
  };

  const finalize = async () => {
    const reservesSnapshot = (project.reserves || []).map(r => ({ ...r }));
    const integrityHash = await hashReserves(reservesSnapshot);
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const oprNumber = (project.oprHistory || []).length + 1;
    const today = new Date();
    const oprDate = today.toLocaleDateString("fr-BE");

    const opr = {
      id: `opr-${Date.now()}`,
      number: oprNumber,
      type: oprType,
      date: oprDate,
      createdAt: today.toISOString(),
      createdBy: profile?.name || profile?.email || "—",
      reserves: reservesSnapshot,
      reservesHash: integrityHash,
      signatures: slots.filter(s => s.dataUrl).map(s => ({
        name: s.name || "",
        role: s.role || "",
        email: s.email || "",
        dataUrl: s.dataUrl,
        signedAt: s.signedAt,
        userAgent: ua,
        hash: integrityHash,
      })),
      sentTo: [],
      sentAt: null,
    };

    setProjects(prev => prev.map(p => p.id === project.id
      ? { ...p, oprHistory: [...(p.oprHistory || []), opr] }
      : p,
    ));

    showToast?.(`OPR n°${oprNumber} signé par ${opr.signatures.length} personne${opr.signatures.length > 1 ? "s" : ""}`);
    onComplete?.(opr);
    onClose?.();
  };

  // Si un slot est en mode "signing", on affiche le canvas pad par-dessus
  const activeSlotData = activeSlot ? slots.find(s => s.slotId === activeSlot) : null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 600 }} onClick={onClose}>
      <div style={{ background: WH, borderRadius: 16, width: "100%", maxWidth: 640, maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: "20px 24px 14px", borderBottom: `1px solid ${SBB}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Ico name="edit" size={16} color={AC} />
            <span style={{ fontSize: 16, fontWeight: 700, color: TX }}>Faire signer l'OPR</span>
          </div>
          <div style={{ fontSize: 12, color: TX3 }}>{project.name} — {(project.reserves || []).length} réserve{(project.reserves || []).length !== 1 ? "s" : ""}</div>
        </div>

        {/* Type OPR selector */}
        <div style={{ padding: "14px 24px 0" }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 6 }}>Type de réception</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {[
              { id: "provisoire", label: "Provisoire" },
              { id: "definitive", label: "Définitive" },
            ].map(t => (
              <button key={t.id} onClick={() => setOprType(t.id)}
                style={{ flex: 1, padding: "8px 12px", border: `1.5px solid ${oprType === t.id ? AC : SBB}`, borderRadius: 8, background: oprType === t.id ? ACL : WH, color: oprType === t.id ? AC : TX2, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Slots list */}
        <div style={{ padding: "10px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3 }}>
              Signataires ({signedCount}/{slots.length} signés)
            </div>
            <button onClick={addSignatorySlot}
              style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 10px", border: `1px solid ${SBB}`, borderRadius: 6, background: WH, color: TX2, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              <Ico name="plus" size={10} color={TX2} /> Ajouter
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {slots.map(s => (
              <div key={s.slotId} style={{ background: s.dataUrl ? "#F4F8EE" : WH, border: `1px solid ${s.dataUrl ? GR : SBB}`, borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <input value={s.name} onChange={e => updateSlot(s.slotId, { name: e.target.value })}
                      placeholder="Nom complet"
                      style={{ width: "100%", border: "none", background: "transparent", fontSize: 13, fontWeight: 600, color: TX, fontFamily: "inherit", outline: "none", padding: 0 }} />
                    <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                      <input value={s.role} onChange={e => updateSlot(s.slotId, { role: e.target.value })}
                        placeholder="Rôle"
                        style={{ width: 130, border: "none", background: "transparent", fontSize: 11, color: TX3, fontFamily: "inherit", outline: "none", padding: 0 }} />
                      <input value={s.email} onChange={e => updateSlot(s.slotId, { email: e.target.value })}
                        placeholder="Email (facultatif)"
                        style={{ flex: 1, border: "none", background: "transparent", fontSize: 11, color: TX3, fontFamily: "inherit", outline: "none", padding: 0 }} />
                    </div>
                  </div>
                  {s.dataUrl ? (
                    <>
                      <img src={s.dataUrl} alt="signature" style={{ width: 80, height: 36, objectFit: "contain", border: `1px solid ${SBB}`, borderRadius: 4, background: WH }} />
                      <button onClick={() => removeSignature(s.slotId)} title="Refaire la signature"
                        style={{ background: "none", border: "none", padding: 4, cursor: "pointer" }}>
                        <Ico name="x" size={12} color={TX3} />
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setActiveSlot(s.slotId)} disabled={!s.name.trim()}
                      style={{ padding: "7px 14px", border: "none", borderRadius: 7, background: s.name.trim() ? AC : DIS, color: s.name.trim() ? WH : DIST, fontSize: 12, fontWeight: 600, cursor: s.name.trim() ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
                      Signer
                    </button>
                  )}
                  <button onClick={() => removeSlot(s.slotId)} title="Retirer ce signataire"
                    style={{ background: "none", border: "none", padding: 4, cursor: "pointer" }}>
                    <Ico name="trash" size={12} color={TX3} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ padding: "14px 24px 20px", display: "flex", gap: 8 }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: 11, border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: TX2 }}>
            Annuler
          </button>
          <button onClick={finalize} disabled={!canFinalize}
            style={{ flex: 2, padding: 11, border: "none", borderRadius: 8, background: canFinalize ? AC : DIS, color: canFinalize ? WH : DIST, fontSize: 13, fontWeight: 700, cursor: canFinalize ? "pointer" : "not-allowed", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Ico name="check" size={14} color={canFinalize ? WH : DIST} />
            Finaliser l'OPR ({signedCount} signature{signedCount > 1 ? "s" : ""})
          </button>
        </div>
      </div>

      {/* Pop-over canvas pad — par-dessus la modal principale */}
      {activeSlotData && (
        <SignaturePad
          name={activeSlotData.name}
          role={activeSlotData.role}
          onCancel={() => setActiveSlot(null)}
          onSave={(dataUrl) => onSignaturePadSave(activeSlotData.slotId, dataUrl)}
        />
      )}
    </div>
  );
}

// ── Sous-composant : canvas de signature ──
// Trait au doigt/souris, fond blanc, taille adaptée au viewport.
function SignaturePad({ name, role, onCancel, onSave }) {
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const lastPt = useRef({ x: 0, y: 0 });

  // Init canvas (haute résolution)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = "#1d1d1b";
  }, []);

  const getPoint = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    if (e.touches && e.touches.length > 0) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e) => {
    e.preventDefault();
    setDrawing(true);
    lastPt.current = getPoint(e);
  };
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
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    setHasInk(false);
  };

  const save = () => {
    if (!hasInk) return;
    const dataUrl = canvasRef.current.toDataURL("image/png");
    onSave(dataUrl);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 700, padding: 20 }} onClick={onCancel}>
      <div style={{ background: WH, borderRadius: 16, width: "100%", maxWidth: 720, padding: 24 }} onClick={e => e.stopPropagation()}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: TX }}>{name}</div>
          {role && <div style={{ fontSize: 12, color: TX3 }}>{role}</div>}
        </div>
        <div style={{ fontSize: 11, color: TX3, marginBottom: 8 }}>
          Signez dans la zone ci-dessous (souris ou doigt sur écran tactile).
        </div>
        <canvas
          ref={canvasRef}
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end}
          style={{ width: "100%", height: 240, border: `2px dashed ${SBB}`, borderRadius: 10, background: WH, touchAction: "none", cursor: "crosshair", display: "block" }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={onCancel}
            style={{ flex: 1, padding: 11, border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: TX2 }}>
            Annuler
          </button>
          <button onClick={clear} disabled={!hasInk}
            style={{ flex: 1, padding: 11, border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: hasInk ? "pointer" : "not-allowed", fontSize: 13, fontFamily: "inherit", color: hasInk ? TX2 : DIST }}>
            Effacer
          </button>
          <button onClick={save} disabled={!hasInk}
            style={{ flex: 2, padding: 11, border: "none", borderRadius: 8, background: hasInk ? AC : DIS, color: hasInk ? WH : DIST, fontSize: 13, fontWeight: 700, cursor: hasInk ? "pointer" : "not-allowed", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Ico name="check" size={13} color={hasInk ? WH : DIST} />Valider la signature
          </button>
        </div>
      </div>
    </div>
  );
}
