import { useRef, useState } from "react";
import { AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, BR, BRB, SP, FS, RAD, BL, BLB, AM, AMB, SG, SGB } from "../constants/tokens";
import { Ico, AskAiButton } from "../components/ui";
import { extractDocumentText, formatBytes } from "../utils/chatAttachments";

// Bannière fine du Cahier des Charges, affichée tout en haut de l'Overview.
// Toujours visible : le CdC est un document de référence consulté en
// permanence pendant l'exécution du chantier.
//
// Formats acceptés : PDF (texte ou scanné) et Word .docx. L'ancien .doc
// binaire n'est pas supporté (bibliothèque mammoth ne le lit pas).
//
// L'extraction est dispatchée par `extractDocumentText` qui retourne :
//   - kind="text"   → cdc.extractedText rempli
//   - kind="vision" → cdc.imagePages[] rempli (PDF scanné — l'IA les lit en mode vision)
//   - kind="empty"  → ni l'un ni l'autre (Word .doc, PDF protégé) — on stocke
//                     quand même le fichier pour consultation, l'IA répond
//                     avec le contexte projet seulement.

const MAX_BYTES = 12 * 1024 * 1024; // 12 Mo, comme les autres uploads
const ACCEPT_FILES = "application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx";

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
    const isPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
    const isDocx = /\.docx$/i.test(file.name) || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const isLegacyDoc = /\.doc$/i.test(file.name) && !isDocx;
    if (isLegacyDoc) {
      setErr("Format .doc (ancien Word binaire) non supporté. Enregistre le fichier en .docx ou en PDF.");
      return;
    }
    if (!isPdf && !isDocx) {
      setErr("Format non supporté. Accepté : PDF (texte ou scanné) ou Word .docx.");
      return;
    }
    setBusy(true);
    try {
      // Lire le fichier en dataUrl pour stockage durable (consultation).
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      // Dispatcher d'extraction : texte si possible, sinon images de pages
      // pour le mode vision IA, sinon rien (on stocke quand même le fichier).
      let extractedText = "";
      let imagePages = null;
      try {
        const result = await extractDocumentText(file);
        if (result.kind === "text") {
          extractedText = result.text;
        } else if (result.kind === "vision") {
          imagePages = result.pages;
        }
      } catch (extractErr) {
        console.warn("CdC extraction failed:", extractErr);
      }
      onUpload({
        fileName: file.name,
        size: file.size,
        mimeType: isDocx ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf",
        dataUrl,
        extractedText,
        imagePages,
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
  // Aligné avec le header projet : carte blanche, bordure douce #E8E1DA, radius 16.
  const cardWrap = { display: "flex", alignItems: "center", gap: SP.md, padding: "14px 18px", borderRadius: 16, marginBottom: SP.md, background: WH, border: `1px solid #E8E1DA`, position: "relative" };
  const iconBox = (bg, fg) => ({ width: 36, height: 36, borderRadius: 8, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: fg });

  // ── État vide ────────────────────────────────────────────
  if (!cdc) {
    return (
      <div style={{ ...cardWrap, borderStyle: "dashed", background: SB }}>
        <div style={iconBox(SB2, TX3)}>
          <Ico name="file" size={16} color={TX3} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: FS.md, fontWeight: 600, color: TX, lineHeight: 1.2 }}>Document de référence</div>
          <div style={{ fontSize: FS.sm, color: TX2, lineHeight: 1.4, marginTop: 2 }}>
            Cahier des charges, marché, ou tout autre document servant de référence — PDF (texte ou scanné) ou Word .docx, 12 Mo max.
          </div>
        </div>
        {canEdit && (
          <button
            onClick={handlePick}
            disabled={busy}
            style={{ padding: "8px 14px", border: "none", borderRadius: 8, background: AC, color: "#fff", fontSize: FS.sm, fontWeight: 600, cursor: busy ? "wait" : "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}
          >
            <Ico name="upload" size={12} color="#fff" />
            {busy ? "Lecture…" : "Uploader le document"}
          </button>
        )}
        <input ref={fileRef} type="file" accept={ACCEPT_FILES} onChange={handleFile} style={{ display: "none" }} />
        {err && <div role="alert" style={{ color: BR, fontSize: FS.sm, marginLeft: SP.sm }}>{err}</div>}
      </div>
    );
  }

  // ── État rempli ──────────────────────────────────────────
  // L'API IA a 3 modes : "compare_ft" (CTA principal), "summary" (menu),
  // "question" (menu). Le caller (App.jsx via Overview) construit le bon
  // prefill selon le mode. Mode legacy "" = compare_ft pour rétro-compat.
  const askIa = (mode) => { onAskAi?.(cdc, mode); };

  // Type du document — pour l'instant figé à "Cahier des charges" car c'est
  // l'usage initial. cdc.documentType peut surcharger plus tard si on
  // accepte d'autres types (marché, brief, note de mission…).
  const documentType = cdc.documentType || "Cahier des charges";

  // Statut d'extraction — 4 états possibles. cdc._extracting est posé par
  // le parent quand une extraction asynchrone est en cours (futur — pour
  // l'instant l'extraction est sync à l'upload donc cet état est rare).
  const status = cdc._extracting ? "in_progress"
    : cdc.extractedText ? "extracted"
    : (cdc.imagePages && cdc.imagePages.length > 0) ? "to_analyze"
    : "impossible";
  const STATUS_META = {
    extracted:   { label: "Texte extrait",        color: SG,  bg: SGB,  border: SG + "40",  tooltip: "Le texte du document a été extrait. L'IA peut répondre sur son contenu intégral." },
    in_progress: { label: "Extraction en cours…", color: AM,  bg: AMB,  border: AM + "40",  tooltip: "Lecture du document en cours, ça peut prendre quelques secondes." },
    to_analyze:  { label: "À analyser",           color: BL,  bg: BLB,  border: BL + "40",  tooltip: `Document scanné — l'IA le lira en mode vision (${cdc.imagePages?.length || 0} premières pages) à la prochaine question.` },
    impossible:  { label: "Extraction impossible",color: BR,  bg: BRB,  border: BR + "40",  tooltip: "Aucun contenu n'a pu être extrait. L'IA répondra avec le contexte projet uniquement." },
  };
  const sm = STATUS_META[status];

  return (
    <div style={cardWrap}>
      <div style={iconBox(ACL, AC)}>
        <Ico name="file" size={16} color={AC} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Ligne 1 : header de section + badge statut */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: FS.xs, fontWeight: 700, color: TX3, textTransform: "uppercase", letterSpacing: "0.06em" }}>Document de référence</span>
          <span title={sm.tooltip}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9, color: sm.color, background: sm.bg, border: `1px solid ${sm.border}`, padding: "1px 7px", borderRadius: 10, fontWeight: 600 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: sm.color }} />
            {sm.label}
          </span>
        </div>
        {/* Ligne 2 : type du document — sert à classifier (futur : marché, brief, note de mission…) */}
        <div style={{ fontSize: FS.md, fontWeight: 600, color: TX, lineHeight: 1.3, marginTop: 2 }}>
          {documentType}
        </div>
        {/* Ligne 3 : nom de fichier + meta — petit, gris, lisible */}
        <div style={{ fontSize: FS.xs, color: TX2, lineHeight: 1.4, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={cdc.fileName}>
          <span style={{ fontWeight: 500 }}>{cdc.fileName}</span>
          <span style={{ color: TX3 }}>
            {" · "}{formatBytes(cdc.size)}
            {cdc.uploadedBy ? ` · par ${cdc.uploadedBy}` : ""}
            {cdc.uploadedAt ? ` · ${new Date(cdc.uploadedAt).toLocaleDateString("fr-BE")}` : ""}
          </span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {/* Action secondaire — Ouvrir le document dans un nouvel onglet */}
        <button
          onClick={handleOpen}
          style={{ padding: "8px 12px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, color: TX2, fontSize: FS.sm, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 5 }}
        >
          <Ico name="eye" size={11} color={TX3} />Ouvrir
        </button>
        {/* Action principale — Comparer une fiche technique. Le CTA reflète
            l'usage prioritaire identifié avec l'utilisateur : recevoir une FT
            d'une entreprise et vérifier qu'elle respecte ce qui a été imposé. */}
        {onAskAi && (
          <button
            onClick={() => askIa("compare_ft")}
            title="Ouvre le chat avec le document en pièce jointe. Joins ensuite la fiche technique à comparer."
            style={{ padding: "8px 14px", border: "none", borderRadius: 8, background: AC, color: WH, fontSize: FS.sm, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6, boxShadow: "0 1px 3px rgba(184,92,44,0.18)" }}
          >
            <Ico name="sparkle" size={11} color={WH} />
            Comparer une FT
          </button>
        )}
        {/* Menu d'actions secondaires — résumer / poser une question / remplacer / supprimer */}
        {(canEdit || onAskAi) && (
          <button
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Plus d'actions"
            style={{ width: 34, height: 34, border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}
          >
            <span style={{ fontSize: 16, color: TX3, lineHeight: 1, fontWeight: 700, letterSpacing: 1 }}>⋯</span>
          </button>
        )}
      </div>
      {menuOpen && (
        <>
          <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 50 }} />
          <div style={{ position: "absolute", right: 18, top: "calc(100% - 4px)", marginTop: 4, background: WH, border: `1px solid ${SBB}`, borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.08)", minWidth: 220, padding: 4, zIndex: 51 }}>
            {onAskAi && (
              <>
                <button
                  onClick={() => { setMenuOpen(false); askIa("summary"); }}
                  style={menuItemStyle(TX)}
                >
                  <Ico name="sparkle" size={11} color={AC} />Résumer avec l'IA
                </button>
                <button
                  onClick={() => { setMenuOpen(false); askIa("question"); }}
                  style={menuItemStyle(TX)}
                >
                  <Ico name="sparkle" size={11} color={AC} />Poser une question sur ce document
                </button>
                {canEdit && <div style={{ height: 1, background: SBB, margin: "4px 6px" }} />}
              </>
            )}
            {canEdit && (
              <>
                <button
                  onClick={handlePick}
                  disabled={busy}
                  style={menuItemStyle(TX, busy)}
                >
                  <Ico name="upload" size={11} color={TX3} />{busy ? "Lecture…" : "Remplacer le document"}
                </button>
                <button
                  onClick={() => { setMenuOpen(false); onRemove(); }}
                  style={menuItemStyle(BR)}
                >
                  <Ico name="trash" size={11} color={BR} />Supprimer
                </button>
              </>
            )}
          </div>
        </>
      )}
      <input ref={fileRef} type="file" accept={ACCEPT_FILES} onChange={handleFile} style={{ display: "none" }} />
      {err && <div role="alert" style={{ position: "absolute", left: 18, bottom: -22, color: BR, fontSize: FS.xs }}>{err}</div>}
    </div>
  );
}

const menuItemStyle = (color, disabled = false) => ({
  width: "100%", textAlign: "left", padding: "8px 10px",
  border: "none", background: "transparent", borderRadius: 6,
  cursor: disabled ? "wait" : "pointer", fontFamily: "inherit",
  fontSize: FS.sm, color, display: "flex", alignItems: "center", gap: 8,
});
