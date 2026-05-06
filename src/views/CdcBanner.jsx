import { useRef, useState } from "react";
import { AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, BR, SP, FS, RAD, BL } from "../constants/tokens";
import { Ico } from "../components/ui";
import { extractPdfText, formatBytes } from "../utils/chatAttachments";

// Bannière fine du Cahier des Charges, affichée tout en haut de l'Overview.
// Toujours visible : le CdC est un document de référence consulté en
// permanence pendant l'exécution du chantier.
//
// Deux états :
//   - vide      : CTA upload + sous-texte explicatif
//   - rempli    : nom + taille + actions Ouvrir / Demander à l'IA / ⋯
//
// L'extraction du texte du PDF est faite ICI, au moment de l'upload, et
// stockée dans `cahierDesCharges.extractedText`. Ça évite de re-parser à
// chaque question chatbot et permet d'inclure le CdC dans le contexte
// global du chat sans recharger un buffer 10 Mo à chaque fois.

const MAX_BYTES = 12 * 1024 * 1024; // 12 Mo, comme les autres uploads

export function CdcBanner({ project, profile, onUpload, onRemove, onAskAi, canEdit }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const cdc = project.cahierDesCharges || null;

  const handlePick = () => fileRef.current?.click();

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so re-uploading the same file fires onChange
    if (!file) return;
    setErr("");
    if (file.size > MAX_BYTES) {
      setErr(`Fichier trop lourd (${Math.round(file.size / 1024 / 1024)} Mo). Limite : 12 Mo.`);
      return;
    }
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
      setErr("Format non supporté. PDF uniquement pour le cahier des charges.");
      return;
    }
    setBusy(true);
    try {
      // Lire le fichier en dataUrl pour stockage durable
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      // Extraire le texte une seule fois (pour le chatbot)
      let extractedText = "";
      try {
        extractedText = await extractPdfText(file);
      } catch (extractErr) {
        // PDF scanné non-OCR ou autre — on stocke quand même le fichier mais
        // l'IA n'aura pas accès au contenu textuel.
        console.warn("CdC extraction text failed:", extractErr);
      }
      onUpload({
        fileName: file.name,
        size: file.size,
        mimeType: "application/pdf",
        dataUrl,
        extractedText,
        uploadedAt: new Date().toISOString(),
        uploadedBy: profile?.name || profile?.email || "—",
      });
    } catch (uploadErr) {
      console.error("CdC upload failed:", uploadErr);
      setErr("Échec du chargement. Réessaie.");
    } finally {
      setBusy(false);
      setMenuOpen(false);
    }
  };

  const handleOpen = () => {
    if (!cdc?.dataUrl) return;
    // Ouvrir le PDF dans un nouvel onglet
    const w = window.open();
    if (!w) return;
    w.document.title = cdc.fileName;
    w.document.body.style.margin = "0";
    const iframe = w.document.createElement("iframe");
    iframe.src = cdc.dataUrl;
    iframe.style.cssText = "border:none;width:100vw;height:100vh;";
    w.document.body.appendChild(iframe);
  };

  // ── Style commun ─────────────────────────────────────────
  const wrap = { display: "flex", alignItems: "center", gap: SP.md, padding: `${SP.sm + 2}px ${SP.md + 2}px`, borderRadius: RAD.lg, marginBottom: SP.md };
  const iconBox = (bg, fg) => ({ width: 36, height: 36, borderRadius: 8, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: fg });

  // ── État vide ────────────────────────────────────────────
  if (!cdc) {
    return (
      <div style={{ ...wrap, background: SB, border: `1px dashed ${SBB}` }}>
        <div style={iconBox(SB2, TX3)}>
          <Ico name="file" size={16} color={TX3} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: FS.md, fontWeight: 600, color: TX, lineHeight: 1.2 }}>Cahier des charges</div>
          <div style={{ fontSize: FS.sm, color: TX3, lineHeight: 1.3, marginTop: 2 }}>
            Habituellement soumis lors de l'appel d'offres — tu peux l'ajouter à n'importe quel moment.
          </div>
        </div>
        {canEdit && (
          <button
            onClick={handlePick}
            disabled={busy}
            style={{ padding: "8px 14px", border: "none", borderRadius: 8, background: AC, color: "#fff", fontSize: FS.sm, fontWeight: 600, cursor: busy ? "wait" : "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}
          >
            <Ico name="upload" size={12} color="#fff" />
            {busy ? "Lecture…" : "Uploader le PDF"}
          </button>
        )}
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" onChange={handleFile} style={{ display: "none" }} />
        {err && <div role="alert" style={{ color: BR, fontSize: FS.sm, marginLeft: SP.sm }}>{err}</div>}
      </div>
    );
  }

  // ── État rempli ──────────────────────────────────────────
  return (
    <div style={{ ...wrap, background: ACL, border: `1px solid ${ACL2}`, position: "relative" }}>
      <div style={iconBox(WH, AC)}>
        <Ico name="file" size={16} color={AC} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: FS.xs, fontWeight: 700, color: TX3, textTransform: "uppercase", letterSpacing: "0.06em" }}>Cahier des charges</span>
          {!cdc.extractedText && (
            <span title="Texte non extrait (PDF scanné ?). L'IA ne pourra pas répondre sur le contenu." style={{ fontSize: 9, color: BR, background: WH, border: `1px solid ${BR}`, padding: "1px 6px", borderRadius: 10, fontWeight: 600 }}>OCR manquant</span>
          )}
        </div>
        <div style={{ fontSize: FS.md, fontWeight: 600, color: TX, lineHeight: 1.3, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={cdc.fileName}>
          {cdc.fileName}
        </div>
        <div style={{ fontSize: FS.xs, color: TX3, lineHeight: 1.3, marginTop: 2 }}>
          {formatBytes(cdc.size)}
          {cdc.uploadedBy ? ` · par ${cdc.uploadedBy}` : ""}
          {cdc.uploadedAt ? ` · ${new Date(cdc.uploadedAt).toLocaleDateString("fr-BE")}` : ""}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button
          onClick={handleOpen}
          style={{ padding: "7px 12px", border: `1px solid ${ACL2}`, borderRadius: 7, background: WH, color: TX2, fontSize: FS.sm, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 5 }}
        >
          <Ico name="eye" size={11} color={TX3} />Ouvrir
        </button>
        {cdc.extractedText && onAskAi && (
          <button
            onClick={() => onAskAi(cdc)}
            title="Pose une question sur le cahier des charges, ou compare avec une fiche technique"
            style={{ padding: "7px 12px", border: "none", borderRadius: 7, background: AC, color: "#fff", fontSize: FS.sm, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 5 }}
          >
            <span style={{ fontSize: 12, lineHeight: 1 }}>✦</span>Demander à l'IA
          </button>
        )}
        {canEdit && (
          <button
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Plus d'actions"
            style={{ width: 32, height: 32, border: `1px solid ${ACL2}`, borderRadius: 7, background: WH, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}
          >
            <span style={{ fontSize: 16, color: TX3, lineHeight: 1, fontWeight: 700, letterSpacing: 1 }}>⋯</span>
          </button>
        )}
      </div>
      {menuOpen && (
        <>
          <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 50 }} />
          <div style={{ position: "absolute", right: SP.md, top: "100%", marginTop: 4, background: WH, border: `1px solid ${SBB}`, borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.08)", minWidth: 180, padding: 4, zIndex: 51 }}>
            <button
              onClick={handlePick}
              disabled={busy}
              style={{ width: "100%", textAlign: "left", padding: "8px 10px", border: "none", background: "transparent", borderRadius: 6, cursor: busy ? "wait" : "pointer", fontFamily: "inherit", fontSize: FS.sm, color: TX, display: "flex", alignItems: "center", gap: 8 }}
            >
              <Ico name="upload" size={11} color={TX3} />{busy ? "Lecture…" : "Remplacer le PDF"}
            </button>
            <button
              onClick={() => { setMenuOpen(false); onRemove(); }}
              style={{ width: "100%", textAlign: "left", padding: "8px 10px", border: "none", background: "transparent", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: FS.sm, color: BR, display: "flex", alignItems: "center", gap: 8 }}
            >
              <Ico name="trash" size={11} color={BR} />Supprimer
            </button>
          </div>
        </>
      )}
      <input ref={fileRef} type="file" accept="application/pdf,.pdf" onChange={handleFile} style={{ display: "none" }} />
      {err && <div role="alert" style={{ position: "absolute", left: SP.md, bottom: -22, color: BR, fontSize: FS.xs }}>{err}</div>}
    </div>
  );
}
