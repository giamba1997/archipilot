import { useState, useEffect, useMemo, useRef } from "react";
import {
  AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, RD, GR,
  AM, AMB, ST, STB, BR, BRB, SG, SGB,
  DIS, DIST,
} from "../constants/tokens";
import { Ico, MobileConsultationBanner } from "../components/ui";
import { useIsMobile } from "../hooks/useIsMobile";
import { loadQuotes, saveQuote, deleteQuote, parseQuotePdf } from "../db";
import { extractPdfText } from "../utils/chatAttachments";
import { MAX_UPLOAD_PDF_BYTES } from "../constants/config";

// ── F3 — Comparaison de devis ────────────────────────────────
// L'archi drag-and-drop N PDF de devis pour un même lot. L'IA extrait
// les postes (description, qté, PU HT, total). Pour 2+ devis sur un lot,
// on construit une vue matrice avec écarts mis en évidence.
//
// v1 :
//   - Extraction texte via pdf.js (les PDFs natifs marchent bien)
//   - Fallback Vision (images) à venir en v2 — pour l'instant on
//     prévient l'archi si extractPdfText renvoie peu de texte
//   - Matching de postes entre devis = fuzzy par description (basique mais OK)

const STATUSES = {
  pending:  { label: "En attente",  color: TX2, bg: SB },
  awarded:  { label: "Attribué",    color: GR,  bg: SGB },
  rejected: { label: "Rejeté",      color: BR,  bg: BRB },
};

export function QuotesView({ project, profile, showToast, onBack }) {
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [comparingLot, setComparingLot] = useState(null);
  const fileRef = useRef(null);
  const isMobile = useIsMobile();

  const lots = project.lots || [];
  const [activeLotId, setActiveLotId] = useState(lots[0]?.id || "");

  useEffect(() => {
    let cancelled = false;
    loadQuotes({ projectId: project.id })
      .then(rows => { if (!cancelled) { setQuotes(rows); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [project.id]);

  const refresh = async () => {
    const rows = await loadQuotes({ projectId: project.id });
    setQuotes(rows);
  };

  // Group quotes par lot
  const quotesByLot = useMemo(() => {
    const byLot = {};
    for (const q of quotes) {
      const key = q.lot_id || "_no_lot";
      if (!byLot[key]) byLot[key] = [];
      byLot[key].push(q);
    }
    return byLot;
  }, [quotes]);

  const handleFile = async (file) => {
    if (!file || file.type !== "application/pdf") {
      showToast?.("Sélectionne un fichier PDF", "error");
      return;
    }
    // Garde-fou : un PDF trop gros crash le navigateur (FileReader + dataURL
    // + Supabase row size). Au-delà de la limite, on rejette plutôt qu'attendre.
    if (file.size > MAX_UPLOAD_PDF_BYTES) {
      const mb = Math.round(file.size / 1024 / 1024);
      showToast?.(`PDF trop lourd (${mb} Mo). Limite : ${MAX_UPLOAD_PDF_BYTES / 1024 / 1024} Mo.`, "error");
      return;
    }
    setUploading(true);

    // 1. Convertir en dataURL pour preview / fallback
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = e => resolve(e.target.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });

    // 2. Extraire texte via pdf.js
    let text = "";
    try { text = await extractPdfText(file); } catch (e) {
      console.warn("extractPdfText failed:", e);
    }

    // 3. Si pas de texte (PDF scanné), avertir — vision sera implémenté v2
    if (!text.trim() || text.length < 100) {
      showToast?.("PDF scanné détecté — extraction limitée. Tu pourras corriger à la main.", "info");
    }

    const activeLot = lots.find(l => l.id === activeLotId);

    // 4. Appel parse-quote (edge function OpenAI)
    const result = await parseQuotePdf({
      text,
      contractorHint: null,
    });

    if (result.upgradeRequired) {
      showToast?.("Plan supérieur requis pour le parsing IA", "error");
      setUploading(false);
      return;
    }
    if (result.error) {
      showToast?.(`Échec parsing : ${result.error}`, "error");
      setUploading(false);
      return;
    }

    // 5. Sauvegarder en DB
    const parsed = result.parsed;
    const saved = await saveQuote({
      project_id: project.id,
      lot_id: activeLotId || null,
      lot_label: activeLot?.label || null,
      contractor_name: parsed.contractor_name || file.name.replace(/\.pdf$/i, ""),
      contractor_email: parsed.contractor_email || null,
      file_name: file.name,
      file_data_url: dataUrl,
      total_ht: parsed.total_ht,
      total_ttc: parsed.total_ttc,
      validity_days: parsed.validity_days,
      parsed,
      parse_status: 'ok',
      status: 'pending',
    });

    if (saved) {
      showToast?.(`Devis "${saved.contractor_name}" ajouté`);
      await refresh();
    } else {
      showToast?.("Échec de la sauvegarde", "error");
    }
    setUploading(false);
  };

  const handleAward = async (q) => {
    if (!confirm(`Attribuer le lot à ${q.contractor_name} ?\n\nLes autres devis seront marqués comme rejetés.`)) return;
    // 1. Attribuer ce devis
    await saveQuote({ ...q, status: "awarded", _wasAwarded: q.status === "awarded" });
    // 2. Rejeter les autres pour le même lot
    const others = quotes.filter(x => x.lot_id === q.lot_id && x.id !== q.id && x.status !== "rejected");
    for (const o of others) {
      await saveQuote({ ...o, status: "rejected" });
    }
    await refresh();
    showToast?.(`Lot attribué à ${q.contractor_name}`);
  };

  const handleDelete = async (q) => {
    if (!confirm(`Supprimer le devis de ${q.contractor_name} ?`)) return;
    const ok = await deleteQuote(q.id);
    if (ok) {
      setQuotes(prev => prev.filter(x => x.id !== q.id));
      showToast?.("Devis supprimé");
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", animation: "fadeIn 0.2s ease" }}>
      {/* Header — bouton retour conditionnel (mode plein écran uniquement).
          Embarqué dans un onglet, la nav passe par la tab bar. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {onBack && (
            <button onClick={onBack} style={{ background: SB, border: `1px solid ${SBB}`, cursor: "pointer", padding: 7, minWidth: 36, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 }}>
              <Ico name="back" color={TX2} size={16} />
            </button>
          )}
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: TX }}>Devis & soumissions</div>
            <div style={{ fontSize: 12, color: TX3 }}>{project.name} — Upload + extraction IA + comparaison par lot</div>
          </div>
        </div>
      </div>

      {/* Sélecteur de lot */}
      {lots.length > 0 && (
        <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 12, padding: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: TX2, marginBottom: 6 }}>Lot pour le prochain upload</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {lots.map(l => (
              <button
                key={l.id}
                onClick={() => setActiveLotId(l.id)}
                style={{
                  padding: "5px 11px",
                  border: `1px solid ${activeLotId === l.id ? ACL2 : SBB}`,
                  borderRadius: 999,
                  background: activeLotId === l.id ? ACL : WH,
                  color: activeLotId === l.id ? AC : TX2,
                  fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {l.label}
              </button>
            ))}
            <button
              onClick={() => setActiveLotId("")}
              style={{
                padding: "5px 11px",
                border: `1px solid ${activeLotId === "" ? ACL2 : SBB}`,
                borderRadius: 999,
                background: activeLotId === "" ? ACL : WH,
                color: activeLotId === "" ? AC : TX2,
                fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Non rattaché
            </button>
          </div>
        </div>
      )}

      {isMobile && <MobileConsultationBanner hint="import et comparaison de devis depuis l'ordinateur." />}

      {/* Drop zone — masquée sur mobile (l'import PDF/IA est une action bureau) */}
      {!isMobile && <div
        onClick={() => !uploading && fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault();
          if (uploading) return;
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        style={{
          padding: "24px 20px",
          border: `2px dashed ${uploading ? AC : SBB}`,
          borderRadius: 14,
          background: uploading ? ACL : SB,
          cursor: uploading ? "default" : "pointer",
          marginBottom: 16,
          textAlign: "center",
          transition: "all 0.15s",
        }}
      >
        <Ico name="upload" size={22} color={uploading ? AC : TX2} />
        <div style={{ fontSize: 13, fontWeight: 700, color: TX, marginTop: 8 }}>
          {uploading ? "Extraction IA en cours…" : "Glisse un PDF de devis ici"}
        </div>
        <div style={{ fontSize: 11, color: TX3, marginTop: 4 }}>
          ou clique pour parcourir · l'IA extrait les postes automatiquement
        </div>
        <input ref={fileRef} type="file" accept="application/pdf" style={{ display: "none" }} onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
      </div>}

      {/* Liste groupée par lot */}
      {loading ? (
        <div style={{ padding: "30px 0", textAlign: "center", color: TX3, fontSize: 13 }}>Chargement…</div>
      ) : quotes.length === 0 ? (
        <div style={{ padding: "20px", textAlign: "center", color: TX3, fontSize: 13 }}>
          Aucun devis pour l'instant. Drag-and-drop un PDF pour commencer.
        </div>
      ) : (
        Object.entries(quotesByLot).map(([lotKey, lotQuotes]) => {
          const lotLabel = lotKey === "_no_lot" ? "Non rattaché" : (lots.find(l => l.id === lotKey)?.label || lotQuotes[0]?.lot_label || "Lot inconnu");
          const canCompare = lotQuotes.length >= 2;
          return (
            <div key={lotKey} style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: TX }}>
                  {lotLabel} <span style={{ color: TX3, fontWeight: 500 }}>· {lotQuotes.length} devis</span>
                </div>
                {canCompare && (
                  <button
                    onClick={() => setComparingLot(lotKey)}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", border: `1px solid ${ACL2}`, borderRadius: 8, background: ACL, color: AC, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                  >
                    <Ico name="chart" size={11} color={AC} /> Comparer
                  </button>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {lotQuotes.map(q => {
                  const s = STATUSES[q.status] || STATUSES.pending;
                  return (
                    <div key={q.id} style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 6, height: 32, borderRadius: 3, background: s.color, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: TX }}>{q.contractor_name}</span>
                          <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 999, background: s.bg, color: s.color, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                            {s.label}
                          </span>
                          {q.contractor_email && (
                            <span style={{ fontSize: 10, color: TX3 }}>{q.contractor_email}</span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: TX3, marginTop: 2 }}>
                          {q.parsed?.items?.length || 0} poste{q.parsed?.items?.length > 1 ? "s" : ""}
                          {q.validity_days ? ` · valable ${q.validity_days}j` : ""}
                          {q.file_name && ` · ${q.file_name}`}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", fontSize: 14, fontWeight: 700, color: TX, flexShrink: 0, minWidth: 110 }}>
                        {q.total_ht != null ? `${fmtEur(q.total_ht)} HT` : "—"}
                        {q.total_ttc != null && <div style={{ fontSize: 10, color: TX3, fontWeight: 500 }}>{fmtEur(q.total_ttc)} TTC</div>}
                      </div>
                      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                        <button onClick={() => setEditingId(q.id)} title="Détails" style={iconBtnStyle}>
                          <Ico name="eye" size={14} color={TX2} />
                        </button>
                        {q.status !== "awarded" && (
                          <button onClick={() => handleAward(q)} title="Attribuer ce lot" style={iconBtnStyle}>
                            <Ico name="check" size={14} color={GR} />
                          </button>
                        )}
                        <button onClick={() => handleDelete(q)} title="Supprimer" style={iconBtnStyle}>
                          <Ico name="trash" size={14} color={RD} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      {/* Modal détail */}
      {editingId && (
        <QuoteDetailModal
          quote={quotes.find(q => q.id === editingId)}
          onClose={() => setEditingId(null)}
        />
      )}

      {/* Modal comparaison */}
      {comparingLot && (
        <ComparisonModal
          lotLabel={comparingLot === "_no_lot" ? "Non rattaché" : (lots.find(l => l.id === comparingLot)?.label || "Lot")}
          quotes={quotesByLot[comparingLot] || []}
          onClose={() => setComparingLot(null)}
        />
      )}
    </div>
  );
}

// ── Modal détail ──
function QuoteDetailModal({ quote, onClose }) {
  if (!quote) return null;
  const items = quote.parsed?.items || [];
  const warnings = quote.parsed?.warnings || [];
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 250, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: WH, borderRadius: 14, width: "100%", maxWidth: 760, maxHeight: "92vh", overflowY: "auto", padding: 22, fontFamily: "inherit" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: TX }}>{quote.contractor_name}</div>
            <div style={{ fontSize: 11, color: TX3, marginTop: 2 }}>
              {items.length} poste{items.length > 1 ? "s" : ""}
              {quote.total_ht != null && ` · ${fmtEur(quote.total_ht)} HT`}
              {quote.total_ttc != null && ` · ${fmtEur(quote.total_ttc)} TTC`}
            </div>
          </div>
          <button onClick={onClose} style={{ background: SB, border: `1px solid ${SBB}`, cursor: "pointer", padding: 6, borderRadius: 8 }}>
            <Ico name="x" size={14} color={TX2} />
          </button>
        </div>

        {quote.parsed?.summary && (
          <div style={{ padding: "10px 12px", background: ACL, border: `1px solid ${ACL2}`, borderRadius: 8, fontSize: 12, color: TX, marginBottom: 12, lineHeight: 1.5 }}>
            <strong>Résumé IA :</strong> {quote.parsed.summary}
          </div>
        )}

        {warnings.length > 0 && (
          <div style={{ padding: "10px 12px", background: AMB, border: `1px solid ${AM}33`, borderRadius: 8, fontSize: 11, color: TX2, marginBottom: 12 }}>
            <strong>Points à vérifier :</strong>
            <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
              {warnings.map((w, i) => <li key={i}>{String(w)}</li>)}
            </ul>
          </div>
        )}

        {items.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center", color: TX3, fontSize: 12 }}>
            Aucun poste extrait — l'IA n'a pas pu structurer ce devis. Réessaie ou saisis manuellement.
          </div>
        ) : (
          <div style={{ border: `1px solid ${SBB}`, borderRadius: 8, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "50px 1fr 50px 60px 80px 90px", padding: "8px 10px", background: SB, fontSize: 10, fontWeight: 700, color: TX3, textTransform: "uppercase", letterSpacing: "0.04em", gap: 6 }}>
              <div>Code</div>
              <div>Description</div>
              <div>Qté</div>
              <div>Unité</div>
              <div style={{ textAlign: "right" }}>PU HT</div>
              <div style={{ textAlign: "right" }}>Total HT</div>
            </div>
            {items.map((it, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "50px 1fr 50px 60px 80px 90px", padding: "8px 10px", borderTop: `1px solid ${SBB}`, fontSize: 11, color: TX, gap: 6, alignItems: "center" }}>
                <div style={{ fontFamily: "ui-monospace, monospace", color: TX3 }}>{it.code || "—"}</div>
                <div>{it.description || "—"}</div>
                <div>{it.quantity ?? "—"}</div>
                <div style={{ color: TX3 }}>{it.unit || "—"}</div>
                <div style={{ textAlign: "right", fontFamily: "ui-monospace, monospace" }}>{it.unit_price_ht != null ? fmtEur(it.unit_price_ht) : "—"}</div>
                <div style={{ textAlign: "right", fontFamily: "ui-monospace, monospace", fontWeight: 700 }}>{it.total_ht != null ? fmtEur(it.total_ht) : "—"}</div>
              </div>
            ))}
          </div>
        )}

        {quote.file_data_url && (
          <div style={{ marginTop: 12 }}>
            <a href={quote.file_data_url} download={quote.file_name || "devis.pdf"} style={{ fontSize: 12, color: AC, fontWeight: 600, textDecoration: "none" }}>
              <Ico name="download" size={11} color={AC} /> Télécharger le PDF original
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Modal comparaison matricielle ──
// Matche les postes entre N devis par description (fuzzy lowercase).
// Affiche un tableau : lignes = postes union, colonnes = entreprises.
// Highlighting des écarts > 20% par rapport à la moyenne.
function ComparisonModal({ lotLabel, quotes, onClose }) {
  // Construit la liste union de postes (clé = description normalisée)
  const norm = (s) => (s || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 80);
  const itemsByKey = new Map(); // key → { label, byQuote: { quoteId: total } }

  for (const q of quotes) {
    for (const it of (q.parsed?.items || [])) {
      const key = norm(it.description);
      if (!key) continue;
      if (!itemsByKey.has(key)) {
        itemsByKey.set(key, { label: it.description, byQuote: {} });
      }
      itemsByKey.get(key).byQuote[q.id] = Number(it.total_ht) || 0;
    }
  }

  const rows = [...itemsByKey.values()].sort((a, b) => {
    // Trier par "présent partout" d'abord
    const aN = Object.keys(a.byQuote).length;
    const bN = Object.keys(b.byQuote).length;
    if (aN !== bN) return bN - aN;
    return a.label.localeCompare(b.label);
  });

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 250, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: WH, borderRadius: 14, width: "100%", maxWidth: 1100, maxHeight: "92vh", overflow: "auto", padding: 22, fontFamily: "inherit" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: TX }}>Comparaison — {lotLabel}</div>
            <div style={{ fontSize: 11, color: TX3, marginTop: 2 }}>
              {quotes.length} devis · {rows.length} postes uniques · écarts {">20%"} en rouge/vert
            </div>
          </div>
          <button onClick={onClose} style={{ background: SB, border: `1px solid ${SBB}`, cursor: "pointer", padding: 6, borderRadius: 8 }}>
            <Ico name="x" size={14} color={TX2} />
          </button>
        </div>

        {/* Totaux */}
        <div style={{ display: "grid", gridTemplateColumns: `minmax(200px,2fr) repeat(${quotes.length}, minmax(110px,1fr))`, gap: 1, marginBottom: 14, background: SBB, border: `1px solid ${SBB}`, borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "10px 12px", background: SB, fontSize: 11, fontWeight: 700, color: TX2 }}>TOTAL HT</div>
          {quotes.map(q => {
            const totals = quotes.map(x => Number(x.total_ht) || 0).filter(t => t > 0);
            const min = Math.min(...totals);
            const max = Math.max(...totals);
            const t = Number(q.total_ht) || 0;
            const color = t === min && quotes.length > 1 ? GR : t === max && quotes.length > 1 ? BR : TX;
            return (
              <div key={q.id} style={{ padding: "10px 12px", background: WH, fontSize: 13, fontWeight: 800, color, fontFamily: "ui-monospace, monospace", textAlign: "right" }}>
                {t > 0 ? fmtEur(t) : "—"}
                <div style={{ fontSize: 10, color: TX3, fontWeight: 500, marginTop: 2 }}>{q.contractor_name}</div>
              </div>
            );
          })}
        </div>

        {/* Postes */}
        <div style={{ border: `1px solid ${SBB}`, borderRadius: 8, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: `minmax(200px,2fr) repeat(${quotes.length}, minmax(110px,1fr))`, padding: "8px 12px", background: SB, fontSize: 10, fontWeight: 700, color: TX3, textTransform: "uppercase", letterSpacing: "0.04em", gap: 6 }}>
            <div>Poste</div>
            {quotes.map(q => <div key={q.id} style={{ textAlign: "right" }}>{q.contractor_name}</div>)}
          </div>
          {rows.map((row, idx) => {
            const values = quotes.map(q => row.byQuote[q.id]);
            const presentVals = values.filter(v => v != null && v > 0);
            const avg = presentVals.length > 0 ? presentVals.reduce((s, v) => s + v, 0) / presentVals.length : 0;
            return (
              <div key={idx} style={{
                display: "grid",
                gridTemplateColumns: `minmax(200px,2fr) repeat(${quotes.length}, minmax(110px,1fr))`,
                padding: "8px 12px",
                borderTop: `1px solid ${SBB}`,
                background: presentVals.length < quotes.length ? AMB : WH,
                fontSize: 11, color: TX, gap: 6, alignItems: "center",
              }}>
                <div title={row.label} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {presentVals.length < quotes.length && (
                    <Ico name="alert" size={10} color={AM} />
                  )} {row.label}
                </div>
                {values.map((v, i) => {
                  let color = TX;
                  if (v != null && v > 0 && avg > 0) {
                    const diff = (v - avg) / avg;
                    if (diff > 0.2) color = BR;
                    else if (diff < -0.2) color = GR;
                  }
                  return (
                    <div key={i} style={{ textAlign: "right", color, fontFamily: "ui-monospace, monospace", fontWeight: v === Math.min(...presentVals) && presentVals.length > 1 ? 700 : 500 }}>
                      {v != null ? fmtEur(v) : "—"}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 12, fontSize: 11, color: TX3, lineHeight: 1.5 }}>
          <strong>Légende :</strong> rouge = poste {">20%"} au-dessus de la moyenne · vert = {">20%"} en-dessous · jaune = poste absent chez au moins un soumissionnaire.
        </div>
      </div>
    </div>
  );
}

function fmtEur(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("fr-BE", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " €";
}

const iconBtnStyle = {
  background: "transparent", border: "none", cursor: "pointer", padding: 6,
  display: "flex", alignItems: "center", justifyContent: "center",
};
