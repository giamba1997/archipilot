import { AC, SB, SB2, SBB, TX, TX2, TX3, WH, BG, GR, AM, BR } from "../constants/tokens";
import { getPvStatus } from "../constants/statuses";
import { Ico } from "../components/ui";
import { getPhotoUrl } from "../db";
import { generatePDF } from "../utils/pdf";

// ── Détail PV (mobile, lecture seule) — handoff_mobile ───────
// Consultation pure : titre + statut, méta, contenu par poste, photos
// liées, export PDF / partage. L'édition reste sur desktop.

// Parse le contenu généré en postes : "NN. Titre" => en-tête de poste,
// "NN.X texte" => remarque numérotée. Tout le reste => paragraphe.
function parsePvContent(content) {
  const lines = (content || "").split("\n").map(l => l.replace(/\s+$/, "")).filter(l => l.trim());
  const blocks = [];
  let cur = null;
  for (const raw of lines) {
    const ln = raw.trim();
    const isRemark = /^\d{1,2}\.\d/.test(ln);
    const isPoste = !isRemark && /^\d{1,2}[.)·\-\s]/.test(ln);
    if (isPoste) { cur = { title: ln.replace(/^#+\s*/, ""), items: [] }; blocks.push(cur); }
    else if (cur) { cur.items.push(ln.replace(/\*\*/g, "")); }
    else { cur = { title: "", items: [ln.replace(/\*\*/g, "")] }; blocks.push(cur); }
  }
  return blocks;
}

// Met en évidence les remarques urgentes (mots-clés) en rouge léger.
const URGENT_RE = /\b(urgent|critique|danger|sécurit|différentiel|sous-dimensionn|à corriger|avant mise)/i;

export function MobilePvDetail({ pv, project, profile, onClose }) {
  const st = getPvStatus(pv.status);
  const blocks = parsePvContent(pv.content);
  const photos = pv.photos || [];
  const presents = pv.recipients?.length || (project?.participants || []).length || null;

  const doPdf = async () => {
    try {
      if (pv.pdfDataUrl) { const a = document.createElement("a"); a.href = pv.pdfDataUrl; a.download = pv.fileName || `PV-${pv.number}.pdf`; a.click(); return; }
      const res = await generatePDF(project, pv.number, pv.date, pv.content, profile, { returnDataUrl: true });
      const a = document.createElement("a"); a.href = res.dataUrl; a.download = res.fileName || `PV-${pv.number}.pdf`; a.click();
    } catch (e) { console.error("PDF mobile error:", e); }
  };
  const doShare = async () => {
    const text = `PV n°${pv.number} — ${project?.name || ""}\n\n${pv.content || ""}`;
    try { if (navigator.share) { await navigator.share({ title: `PV n°${pv.number}`, text }); return; } } catch { /* annulé */ }
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
  };

  const metaBox = (label, value) => (
    <div style={{ flex: 1, background: WH, border: `1px solid #EFEDEB`, borderRadius: 12, padding: 11, textAlign: "center" }}>
      <div style={{ fontSize: 12, color: TX3 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: TX, marginTop: 2 }}>{value}</div>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: BG, overflowY: "auto", fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif" }}>
      {/* Nav */}
      <div style={{ display: "flex", alignItems: "center", padding: "calc(8px + env(safe-area-inset-top, 0px)) 16px 14px" }}>
        <button onClick={onClose} aria-label="Retour" style={{ width: 38, height: 38, borderRadius: 999, background: WH, border: "1px solid #EFEDEB", display: "flex", alignItems: "center", justifyContent: "center", color: TX2, cursor: "pointer" }}><Ico name="back" size={18} color={TX2} /></button>
      </div>

      {/* Titre */}
      <div style={{ padding: "0 20px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "ui-monospace, monospace", color: TX }}>PV n°{pv.number}</span>
          <span style={{ fontSize: 11, padding: "2px 9px", borderRadius: 999, background: st.bg, color: st.color, fontWeight: 500 }}>{st.label}</span>
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: TX, letterSpacing: "-0.3px", lineHeight: 1.25 }}>{pv.title || `PV du ${pv.date}`}</div>
        <div style={{ fontSize: 13, color: TX3, marginTop: 4 }}>{[project?.name, pv.postsCount ? `${pv.postsCount} postes` : null, presents ? `${presents} présents` : null].filter(Boolean).join(" · ")}</div>
      </div>

      {/* Méta */}
      <div style={{ padding: "0 16px 18px", display: "flex", gap: 8 }}>
        {pv.weather && metaBox("Météo", typeof pv.weather === "string" ? pv.weather : `${pv.weather.temperature}°C`)}
        {metaBox("Postes", pv.postsCount || blocks.length || "—")}
        {metaBox("Date", pv.date || "—")}
      </div>

      {/* Contenu par poste */}
      {pv.pdfDataUrl ? (
        <div style={{ padding: "0 16px 16px" }}>
          <iframe src={pv.pdfDataUrl} title={`PV n°${pv.number}`} style={{ width: "100%", height: "60vh", border: `1px solid ${SBB}`, borderRadius: 12, background: SB }} />
        </div>
      ) : blocks.length ? (
        <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 14 }}>
          {blocks.map((b, i) => (
            <div key={i} style={{ background: WH, border: `1px solid #EFEDEB`, borderRadius: 14, padding: 15 }}>
              {b.title && <div style={{ fontSize: 13, fontWeight: 700, color: URGENT_RE.test(b.title) ? BR : AC, marginBottom: 8 }}>{b.title.replace(/\*\*/g, "")}</div>}
              {b.items.map((it, j) => {
                const m = it.match(/^(\d{1,2}\.\d+)\s*(.*)$/);
                const urgent = URGENT_RE.test(it);
                return (
                  <div key={j} style={{ fontSize: 13.5, color: TX2, lineHeight: 1.55, marginBottom: j < b.items.length - 1 ? 8 : 0 }}>
                    {m ? <><b style={{ color: TX }}>{m[1]}</b> <span style={urgent ? { background: "#FEF2F2", color: BR, borderRadius: 3, padding: "0 3px" } : undefined}>{m[2]}</span></> : it}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: "0 20px", fontSize: 14, color: TX3 }}>Aucun contenu.</div>
      )}

      {/* Photos liées */}
      {photos.length > 0 && (
        <>
          <div style={{ padding: "18px 20px 10px" }}><div style={{ fontSize: 12, fontWeight: 700, color: TX3, textTransform: "uppercase", letterSpacing: "0.05em" }}>Photos liées · {photos.length}</div></div>
          <div style={{ padding: "0 16px", display: "flex", gap: 7, flexWrap: "wrap" }}>
            {photos.slice(0, 8).map((p, i) => <img key={i} src={getPhotoUrl(p)} alt="" style={{ flex: "1 1 22%", maxWidth: "23%", height: 60, objectFit: "cover", borderRadius: 9, border: `1px solid ${SBB}` }} />)}
          </div>
        </>
      )}

      <div style={{ height: 90 }} />

      {/* Actions collantes */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "14px 16px calc(20px + env(safe-area-inset-bottom, 0px))", background: "rgba(252,251,250,0.94)", backdropFilter: "blur(10px)", borderTop: "1px solid #EFEDEB", zIndex: 10, display: "flex", gap: 10 }}>
        <button onClick={doPdf} style={{ flex: 1, height: 48, background: WH, border: `1px solid ${SBB}`, borderRadius: 13, color: TX2, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
          <Ico name="download" size={16} color={TX2} />PDF
        </button>
        <button onClick={doShare} style={{ flex: 1, height: 48, background: AC, border: "none", borderRadius: 13, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
          <Ico name="send" size={16} color="#fff" />Partager
        </button>
      </div>
    </div>
  );
}
