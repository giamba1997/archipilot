import { useState, useMemo, useRef } from "react";
import { useT } from "../i18n";
import { AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, RD, GR, SP, FS, RAD, BL, BLB, OR, ORB, VI, VIB, TE, TEB, PU, PUB, GRY, GRYB, REDBG } from "../constants/tokens";
import { calcLotStatus, LOT_COLORS } from "../constants/statuses";
import { Ico, PB, Modal } from "../components/ui";

export function PlanningView({ project, setProjects, onBack }) {
  const EMPTY_LOT = { name: "", contractor: "", startDate: "", endDate: "", duration: "", progress: 0, color: "amber", steps: [], postId: "" };
  const EMPTY_STEP = { name: "", startDate: "", endDate: "", duration: "", done: false };
  const [modal,     setModal]     = useState(null); // null | "add" | "edit"
  const [editLot,   setEditLot]   = useState(EMPTY_LOT);
  const [editingId, setEditingId] = useState(null);
  const [confirmDeleteLot, setConfirmDeleteLot] = useState(null);
  const importRef = useRef(null);
  const t = useT();

  // Auto-calc endDate from startDate + duration (days)
  const calcEndFromDuration = (start, days) => {
    if (!start || !days) return "";
    const d = new Date(start);
    d.setDate(d.getDate() + parseInt(days));
    return d.toISOString().slice(0, 10);
  };
  const calcDuration = (start, end) => {
    if (!start || !end) return "";
    const diff = Math.round((new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24));
    return diff > 0 ? String(diff) : "";
  };

  // Import CSV — step 1: parse, step 2: mapping UI
  const [importData, setImportData] = useState(null); // { headers: [], rows: [], mapping: {} }

  const handleImportFile = (file) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const lines = text.split("\n").filter(l => l.trim());
      if (lines.length < 2) return;
      const sep = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",";
      const headers = lines[0].split(sep).map(c => c.replace(/^"|"$/g, "").trim());
      const rows = lines.slice(1).map(line => line.split(sep).map(c => c.replace(/^"|"$/g, "").trim()));
      // Auto-detect mapping from header names
      const autoMap = {};
      const fields = [
        { key: "name", labels: ["lot", "nom", "name", "tâche", "tache", "task", "libellé", "libelle", "description"] },
        { key: "contractor", labels: ["responsable", "entreprise", "contractor", "société", "societe", "company", "attribué", "attribue"] },
        { key: "startDate", labels: ["début", "debut", "start", "date début", "date debut", "start date", "begin"] },
        { key: "endDate", labels: ["fin", "end", "date fin", "end date", "échéance", "echeance", "deadline"] },
        { key: "progress", labels: ["avancement", "progress", "%", "progression", "completion"] },
        { key: "duration", labels: ["durée", "duree", "duration", "jours", "days"] },
      ];
      headers.forEach((h, i) => {
        const lower = h.toLowerCase();
        for (const f of fields) {
          if (f.labels.some(l => lower.includes(l)) && !autoMap[f.key]) {
            autoMap[f.key] = i;
            break;
          }
        }
      });
      setImportData({ headers, rows, mapping: autoMap });
    };
    reader.readAsText(file);
  };

  const applyImport = () => {
    if (!importData) return;
    const { rows, mapping } = importData;
    const get = (row, key) => mapping[key] !== undefined ? (row[mapping[key]] || "") : "";
    const newLots = rows.map(row => {
      const name = get(row, "name");
      if (!name) return null;
      const startDate = get(row, "startDate");
      const endDate = get(row, "endDate");
      const dur = get(row, "duration");
      const finalEnd = endDate || (startDate && dur ? calcEndFromDuration(startDate, dur) : "");
      return {
        id: Date.now() + Math.random(), name,
        contractor: get(row, "contractor"),
        startDate, endDate: finalEnd,
        duration: calcDuration(startDate, finalEnd) || dur,
        progress: parseInt(get(row, "progress")) || 0,
        color: "amber", steps: [],
      };
    }).filter(Boolean);
    if (newLots.length > 0) {
      setProjects(prev => prev.map(p => p.id === project.id ? { ...p, lots: [...(p.lots || []), ...newLots] } : p));
    }
    setImportData(null);
  };

  const lots = project.lots || [];

  const saveLot = () => {
    if (!editLot.name.trim()) return;
    if (modal === "add") {
      setProjects((prev) => prev.map((p) => p.id === project.id ? {
        ...p, lots: [...(p.lots || []), { ...editLot, id: Date.now() }]
      } : p));
    } else {
      setProjects((prev) => prev.map((p) => p.id === project.id ? {
        ...p, lots: (p.lots || []).map((l) => l.id === editingId ? { ...editLot, id: editingId } : l)
      } : p));
    }
    setModal(null); setEditLot(EMPTY_LOT); setEditingId(null);
  };

  const deleteLot = (id) => setProjects((prev) => prev.map((p) => p.id === project.id ? {
    ...p, lots: (p.lots || []).filter((l) => l.id !== id)
  } : p));

  const setProgress = (id, val) => setProjects((prev) => prev.map((p) => p.id === project.id ? {
    ...p, lots: (p.lots || []).map((l) => l.id === id ? { ...l, progress: val } : l)
  } : p));

  // ── Gantt helpers ───────────────────────────────────────────
  const datedLots = lots.filter((l) => l.startDate && l.endDate);
  const toMs  = (d) => new Date(d).getTime();
  const minMs = datedLots.length ? Math.min(...datedLots.map((l) => toMs(l.startDate))) : null;
  const maxMs = datedLots.length ? Math.max(...datedLots.map((l) => toMs(l.endDate)))   : null;
  const spanMs = maxMs && minMs ? maxMs - minMs : 0;
  const pct = (ms) => spanMs > 0 ? Math.max(0, Math.min(100, ((ms - minMs) / spanMs) * 100)) : 0;
  const todayMs = (() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); })();
  const todayPct = spanMs > 0 && todayMs >= minMs && todayMs <= maxMs ? pct(todayMs) : null;

  const fmtDate = (d) => { if (!d) return "—"; const dt = new Date(d); return dt.toLocaleDateString("fr-BE", { day: "numeric", month: "short" }); };
  const overallProgress = lots.length ? Math.round(lots.reduce((s, l) => s + (l.progress || 0), 0) / lots.length) : 0;

  const getLotColor = (lot) => LOT_COLORS.find((c) => c.id === (lot.color || "amber")) || LOT_COLORS[0];

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: "8px", minWidth: 40, minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 }}><Ico name="back" color={TX2} /></button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: TX }}>{t("planning.title")}</div>
          <div style={{ fontSize: 12, color: TX3 }}>{project.name}{lots.length > 0 ? ` · ${lots.length} lot${lots.length > 1 ? "s" : ""} · ${overallProgress}% avancement` : ""}</div>
        </div>
        <button onClick={() => importRef.current?.click()} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, color: TX2, fontWeight: 500, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
          <Ico name="upload" size={13} color={TX3} />Importer CSV
        </button>
        <button onClick={() => { setEditLot(EMPTY_LOT); setEditingId(null); setModal("add"); }} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", border: "none", borderRadius: 8, background: AC, color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
          <Ico name="plus" size={14} color="#fff" />{t("planning.lot")}
        </button>
        <input ref={importRef} type="file" accept=".csv,.xlsx,.xls,.tsv" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) handleImportFile(e.target.files[0]); e.target.value = ""; }} />
      </div>
      <div style={{ fontSize: 10, color: TX3, marginBottom: 12, padding: "0 2px" }}>
        Format CSV pour import : <strong>Lot ; Responsable ; Début (YYYY-MM-DD) ; Fin (YYYY-MM-DD) ; Avancement (%)</strong>
      </div>

      {lots.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 20px", border: `2px dashed ${SBB}`, borderRadius: 14, background: WH, textAlign: "center" }}>
          <Ico name="gantt" size={40} color={TX3} />
          <div style={{ fontSize: 15, fontWeight: 600, color: TX, marginTop: 16, marginBottom: 6 }}>{t("planning.noLots")}</div>
          <div style={{ fontSize: 13, color: TX3, marginBottom: 20, maxWidth: 320 }}>{t("planning.noLotsDesc")}</div>
          <button onClick={() => { setEditLot(EMPTY_LOT); setEditingId(null); setModal("add"); }} style={{ padding: "10px 24px", border: "none", borderRadius: 10, background: AC, color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>{t("planning.addLot")}</button>
        </div>
      ) : (
        <div>
          {/* Overall progress */}
          <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 12, padding: "12px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: TX }}>{t("planning.globalProgress")}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: TX }}>{overallProgress}%</span>
              </div>
              <PB value={overallProgress} />
            </div>
            <div style={{ display: "flex", gap: 10, fontSize: 11, color: TX3, flexShrink: 0 }}>
              <span style={{ color: GR, fontWeight: 600 }}>{lots.filter((l) => calcLotStatus(l).id === "done").length} terminé{lots.filter((l) => calcLotStatus(l).id === "done").length > 1 ? "s" : ""}</span>
              <span style={{ color: RD, fontWeight: 600 }}>{lots.filter((l) => calcLotStatus(l).id === "delayed").length} {t("planning.late")}</span>
            </div>
          </div>

          {/* Gantt timeline */}
          {datedLots.length > 0 && (
            <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 12, padding: 16, marginBottom: 14, overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: TX3 }}>{fmtDate(new Date(minMs).toISOString().slice(0,10))}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: TX2 }}>{t("planning.calendar")}</span>
                <span style={{ fontSize: 11, color: TX3 }}>{fmtDate(new Date(maxMs).toISOString().slice(0,10))}</span>
              </div>
              <div style={{ position: "relative" }}>
                {/* Today marker */}
                {todayPct !== null && (
                  <div style={{ position: "absolute", left: `${todayPct}%`, top: 0, bottom: 0, width: 1.5, background: RD, zIndex: 2, pointerEvents: "none" }} />
                )}
                {datedLots.map((lot, i) => {
                  const lc     = getLotColor(lot);
                  const st     = calcLotStatus(lot);
                  const left   = pct(toMs(lot.startDate));
                  const width  = Math.max(1, pct(toMs(lot.endDate)) - left);
                  const steps  = (lot.steps || []).filter(s => s.startDate && s.endDate);
                  return (
                    <div key={lot.id} style={{ marginBottom: i < datedLots.length - 1 ? 2 : 0 }}>
                      {/* Lot bar */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: TX2, width: 90, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={lot.name}>{lot.name}</div>
                        <div style={{ flex: 1, position: "relative", height: 18, background: SB, borderRadius: 4 }}>
                          <div style={{ position: "absolute", left: `${left}%`, width: `${width}%`, height: "100%", background: lc.bg, border: `1px solid ${lc.value}40`, borderRadius: 4 }} />
                          <div style={{ position: "absolute", left: `${left}%`, width: `${width * (lot.progress || 0) / 100}%`, height: "100%", background: st.id === "delayed" ? RD + "80" : lc.value + "80", borderRadius: 4 }} />
                          {(lot.progress || 0) > 0 && (
                            <div style={{ position: "absolute", left: `${left}%`, width: `${width}%`, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: TX, opacity: 0.75 }}>{lot.progress}%</span>
                            </div>
                          )}
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: st.color, background: st.bg, padding: "1px 5px", borderRadius: 4, flexShrink: 0 }}>{st.label}</span>
                      </div>
                      {/* Step bars (indented, smaller) */}
                      {steps.map(step => {
                        const sLeft = pct(toMs(step.startDate));
                        const sWidth = Math.max(0.5, pct(toMs(step.endDate)) - sLeft);
                        return (
                          <div key={step.name + step.startDate} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 1 }}>
                            <div style={{ fontSize: 9, color: TX3, width: 90, flexShrink: 0, paddingLeft: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={step.name}>{step.name}</div>
                            <div style={{ flex: 1, position: "relative", height: 10, borderRadius: 3 }}>
                              <div style={{ position: "absolute", left: `${sLeft}%`, width: `${sWidth}%`, height: "100%", background: step.done ? GR + "60" : lc.value + "40", borderRadius: 3 }} />
                            </div>
                            <div style={{ width: 42 }} />
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
                {/* Today label */}
                {todayPct !== null && (
                  <div style={{ position: "absolute", left: `${todayPct}%`, top: -18, transform: "translateX(-50%)", fontSize: 10, fontWeight: 700, color: RD, background: REDBG, padding: "1px 4px", borderRadius: 3, pointerEvents: "none", whiteSpace: "nowrap" }}>{t("planning.today")}</div>
                )}
              </div>
            </div>
          )}

          {/* Lot list */}
          {lots.map((lot) => {
            const st = calcLotStatus(lot);
            const lc = getLotColor(lot);
            return (
              <div key={lot.id} style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 12, padding: 14, marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: lc.value, marginTop: 4, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: TX }}>{lot.name}</div>
                    {lot.contractor && <span style={{ fontSize: 12, color: TX3 }}>{lot.contractor}</span>}
                    {lot.postId && (() => { const post = (project.posts || []).find(p => p.id === lot.postId); return post ? <span style={{ fontSize: 10, color: BL, background: BLB, padding: "1px 6px", borderRadius: 4, marginLeft: 6 }}>{post.id}. {post.label}</span> : null; })()}
                    <div style={{ display: "flex", gap: 10, marginTop: 3, fontSize: 11, color: TX3 }}>
                      {lot.startDate && <span>{fmtDate(lot.startDate)}</span>}
                      {lot.startDate && lot.endDate && <span>→</span>}
                      {lot.endDate   && <span>{fmtDate(lot.endDate)}</span>}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: st.color, background: st.bg, padding: "2px 7px", borderRadius: 6, flexShrink: 0 }}>{st.label}</span>
                  <button onClick={() => { setEditLot({ name: lot.name, contractor: lot.contractor || "", startDate: lot.startDate || "", endDate: lot.endDate || "", duration: calcDuration(lot.startDate, lot.endDate), progress: lot.progress || 0, color: lot.color || "amber", steps: lot.steps || [], postId: lot.postId || "" }); setEditingId(lot.id); setModal("edit"); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0 }}>
                    <Ico name="edit" size={14} color={TX3} />
                  </button>
                  {confirmDeleteLot === lot.id ? (
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => { deleteLot(lot.id); setConfirmDeleteLot(null); }} style={{ fontSize: 11, fontWeight: 700, color: WH, background: RD, border: "none", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontFamily: "inherit" }}>Supprimer</button>
                      <button onClick={() => setConfirmDeleteLot(null)} style={{ fontSize: 11, color: TX2, background: SB, border: `1px solid ${SBB}`, borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontFamily: "inherit" }}>{t("cancel")}</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDeleteLot(lot.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0 }}>
                      <Ico name="trash" size={14} color={TX3} />
                    </button>
                  )}
                </div>

                {/* Duration */}
                {lot.startDate && lot.endDate && (
                  <div style={{ fontSize: 10, color: TX3, marginTop: 2 }}>
                    Durée : {calcDuration(lot.startDate, lot.endDate)} jours
                  </div>
                )}

                {/* Steps */}
                {(lot.steps || []).length > 0 && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${SB2}` }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: TX3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Étapes ({(lot.steps || []).length})</div>
                    {(lot.steps || []).map((step, si) => (
                      <div key={si} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0" }}>
                        <button onClick={() => {
                          setProjects(prev => prev.map(p => p.id === project.id ? {
                            ...p, lots: (p.lots || []).map(l => l.id === lot.id ? {
                              ...l, steps: l.steps.map((s, j) => j === si ? { ...s, done: !s.done } : s)
                            } : l)
                          } : p));
                        }} style={{ width: 16, height: 16, borderRadius: 3, border: `1.5px solid ${step.done ? GR : SBB}`, background: step.done ? "#F0FDF4" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0 }}>
                          {step.done && <Ico name="check" size={9} color={GR} />}
                        </button>
                        <span style={{ fontSize: 11, color: step.done ? TX3 : TX, textDecoration: step.done ? "line-through" : "none", flex: 1 }}>{step.name}</span>
                        {step.startDate && <span style={{ fontSize: 9, color: TX3 }}>{fmtDate(step.startDate)}{step.endDate ? ` → ${fmtDate(step.endDate)}` : ""}</span>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Progress slider */}
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ fontSize: 11, color: TX3 }}>Avancement</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: lot.progress >= 100 ? GR : TX }}>{lot.progress || 0}%</span>
                  </div>
                  <div style={{ position: "relative", height: 8, background: SB2, borderRadius: 4 }}>
                    <div style={{ height: "100%", width: `${lot.progress || 0}%`, background: lot.progress >= 100 ? GR : (calcLotStatus(lot).id === "delayed" ? RD : lc.value), borderRadius: 4, transition: "width 0.2s" }} />
                    <input
                      type="range" min={0} max={100} value={lot.progress || 0}
                      onChange={(e) => setProgress(lot.id, Number(e.target.value))}
                      style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%", margin: 0 }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Import mapping modal */}
      {importData && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setImportData(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: WH, borderRadius: 14, width: "100%", maxWidth: 600, maxHeight: "85vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)", animation: "modalIn 0.18s ease" }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${SBB}` }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: TX }}>Mapper les colonnes</div>
              <div style={{ fontSize: 12, color: TX3, marginTop: 2 }}>{importData.rows.length} ligne{importData.rows.length > 1 ? "s" : ""} détectée{importData.rows.length > 1 ? "s" : ""} · {importData.headers.length} colonne{importData.headers.length > 1 ? "s" : ""}</div>
            </div>

            <div style={{ padding: "16px 20px" }}>
              {/* Mapping selectors */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                {[
                  { key: "name", label: "Nom du lot *", required: true },
                  { key: "contractor", label: "Responsable" },
                  { key: "startDate", label: "Date de début" },
                  { key: "endDate", label: "Date de fin" },
                  { key: "duration", label: "Durée (jours)" },
                  { key: "progress", label: "Avancement (%)" },
                ].map(field => (
                  <div key={field.key}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: TX2, marginBottom: 3 }}>{field.label}</div>
                    <select
                      value={importData.mapping[field.key] ?? ""}
                      onChange={e => setImportData(prev => ({ ...prev, mapping: { ...prev.mapping, [field.key]: e.target.value === "" ? undefined : Number(e.target.value) } }))}
                      style={{ width: "100%", padding: "7px 10px", border: `1px solid ${importData.mapping[field.key] !== undefined ? AC : SBB}`, borderRadius: 6, fontSize: 12, fontFamily: "inherit", background: importData.mapping[field.key] !== undefined ? ACL : SB, color: TX, cursor: "pointer" }}
                    >
                      <option value="">— Non mappé —</option>
                      {importData.headers.map((h, i) => (
                        <option key={i} value={i}>{h}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* Preview */}
              <div style={{ fontSize: 11, fontWeight: 600, color: TX3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Aperçu ({Math.min(3, importData.rows.length)} premières lignes)</div>
              <div style={{ overflowX: "auto", marginBottom: 16 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${SBB}` }}>
                      {importData.headers.map((h, i) => {
                        const mappedTo = Object.entries(importData.mapping).find(([, v]) => v === i);
                        return (
                          <th key={i} style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600, color: mappedTo ? AC : TX3, background: mappedTo ? ACL : "transparent" }}>
                            {h}
                            {mappedTo && <div style={{ fontSize: 9, fontWeight: 700, color: AC }}>→ {mappedTo[0]}</div>}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {importData.rows.slice(0, 3).map((row, ri) => (
                      <tr key={ri} style={{ borderBottom: `1px solid ${SB}` }}>
                        {row.map((cell, ci) => {
                          const mappedTo = Object.entries(importData.mapping).find(([, v]) => v === ci);
                          return <td key={ci} style={{ padding: "5px 8px", color: mappedTo ? TX : TX3, background: mappedTo ? ACL + "40" : "transparent" }}>{cell}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ padding: "12px 20px", borderTop: `1px solid ${SBB}`, display: "flex", gap: 8 }}>
              <button onClick={() => setImportData(null)} style={{ flex: 1, padding: 11, border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: TX2 }}>Annuler</button>
              <button onClick={applyImport} disabled={importData.mapping.name === undefined} style={{ flex: 2, padding: 11, border: "none", borderRadius: 8, background: importData.mapping.name !== undefined ? AC : DIS, color: importData.mapping.name !== undefined ? "#fff" : DIST, fontSize: 13, fontWeight: 600, cursor: importData.mapping.name !== undefined ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
                Importer {importData.rows.length} lot{importData.rows.length > 1 ? "s" : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit modal */}
      <Modal open={!!modal} onClose={() => { setModal(null); setEditLot(EMPTY_LOT); setEditingId(null); }} title={modal === "add" ? t("planning.newLot") : t("planning.editLot")} wide>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: TX2, marginBottom: 4 }}>{t("planning.lotName")} *</div>
          <input value={editLot.name} onChange={(e) => setEditLot((p) => ({ ...p, name: e.target.value }))} placeholder={t("planning.lotPlaceholder")} style={{ width: "100%", padding: "9px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: SB, color: TX, boxSizing: "border-box" }} autoFocus />
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: TX2, marginBottom: 4 }}>Responsable / Entreprise</div>
            <input value={editLot.contractor || ""} onChange={(e) => setEditLot((p) => ({ ...p, contractor: e.target.value }))} placeholder="ex. Entreprise Dupont" style={{ width: "100%", padding: "9px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: SB, color: TX, boxSizing: "border-box" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: TX2, marginBottom: 4 }}>Poste PV associé</div>
            <select value={editLot.postId || ""} onChange={(e) => setEditLot((p) => ({ ...p, postId: e.target.value }))} style={{ width: "100%", padding: "9px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: SB, color: TX, boxSizing: "border-box", appearance: "auto", cursor: "pointer" }}>
              <option value="">— Aucun poste —</option>
              {(project.posts || []).map(p => (
                <option key={p.id} value={p.id}>{p.id}. {p.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: TX2, marginBottom: 4 }}>{t("planning.start")}</div>
            <input type="date" value={editLot.startDate} onChange={(e) => {
              const start = e.target.value;
              const end = editLot.duration ? calcEndFromDuration(start, editLot.duration) : editLot.endDate;
              setEditLot(p => ({ ...p, startDate: start, endDate: end }));
            }} style={{ width: "100%", padding: "9px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: SB, color: TX, boxSizing: "border-box" }} />
          </div>
          <div style={{ flex: "0 0 90px" }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: TX2, marginBottom: 4 }}>Durée (jours)</div>
            <input type="number" min="1" value={editLot.duration || ""} onChange={(e) => {
              const dur = e.target.value;
              const end = editLot.startDate && dur ? calcEndFromDuration(editLot.startDate, dur) : editLot.endDate;
              setEditLot(p => ({ ...p, duration: dur, endDate: end }));
            }} placeholder="—" style={{ width: "100%", padding: "9px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: SB, color: TX, boxSizing: "border-box" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: TX2, marginBottom: 4 }}>{t("planning.end")}</div>
            <input type="date" value={editLot.endDate} onChange={(e) => {
              const end = e.target.value;
              const dur = editLot.startDate ? calcDuration(editLot.startDate, end) : "";
              setEditLot(p => ({ ...p, endDate: end, duration: dur }));
            }} style={{ width: "100%", padding: "9px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: SB, color: TX, boxSizing: "border-box" }} />
          </div>
        </div>

        {/* Steps */}
        <div style={{ marginBottom: 14, borderTop: `1px solid ${SBB}`, paddingTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: TX2 }}>Étapes</span>
            <button onClick={() => setEditLot(p => ({ ...p, steps: [...(p.steps || []), { ...EMPTY_STEP }] }))} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", fontSize: 11, color: AC, fontWeight: 600, fontFamily: "inherit" }}>
              <Ico name="plus" size={10} color={AC} />Ajouter une étape
            </button>
          </div>
          {(editLot.steps || []).length === 0 && (
            <div style={{ fontSize: 11, color: TX3, fontStyle: "italic", padding: "4px 0" }}>Aucune étape — optionnel, pour détailler le lot</div>
          )}
          {(editLot.steps || []).map((step, si) => (
            <div key={si} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center", padding: "6px 8px", background: SB, borderRadius: 8 }}>
              <input value={step.name} onChange={e => setEditLot(p => ({ ...p, steps: p.steps.map((s, j) => j === si ? { ...s, name: e.target.value } : s) }))} placeholder="Nom de l'étape" style={{ flex: 1, padding: "6px 8px", border: `1px solid ${SBB}`, borderRadius: 6, fontSize: 12, fontFamily: "inherit", background: WH, color: TX, minWidth: 0 }} />
              <input type="date" value={step.startDate || ""} onChange={e => {
                const start = e.target.value;
                const end = step.duration ? calcEndFromDuration(start, step.duration) : step.endDate;
                setEditLot(p => ({ ...p, steps: p.steps.map((s, j) => j === si ? { ...s, startDate: start, endDate: end || "" } : s) }));
              }} style={{ width: 120, padding: "6px 6px", border: `1px solid ${SBB}`, borderRadius: 6, fontSize: 11, fontFamily: "inherit", background: WH, color: TX }} />
              <input type="number" min="1" value={step.duration || ""} onChange={e => {
                const dur = e.target.value;
                const end = step.startDate && dur ? calcEndFromDuration(step.startDate, dur) : step.endDate;
                setEditLot(p => ({ ...p, steps: p.steps.map((s, j) => j === si ? { ...s, duration: dur, endDate: end || "" } : s) }));
              }} placeholder="j" title="Durée en jours" style={{ width: 45, padding: "6px 6px", border: `1px solid ${SBB}`, borderRadius: 6, fontSize: 11, fontFamily: "inherit", background: WH, color: TX, textAlign: "center" }} />
              <input type="date" value={step.endDate || ""} onChange={e => {
                const end = e.target.value;
                const dur = step.startDate ? calcDuration(step.startDate, end) : "";
                setEditLot(p => ({ ...p, steps: p.steps.map((s, j) => j === si ? { ...s, endDate: end, duration: dur } : s) }));
              }} style={{ width: 120, padding: "6px 6px", border: `1px solid ${SBB}`, borderRadius: 6, fontSize: 11, fontFamily: "inherit", background: WH, color: TX }} />
              <button onClick={() => setEditLot(p => ({ ...p, steps: p.steps.filter((_, j) => j !== si) }))} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0 }}>
                <Ico name="x" size={10} color={TX3} />
              </button>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: TX2, marginBottom: 6 }}>{t("planning.progressPct")} — {editLot.progress}%</div>
          <input type="range" min={0} max={100} value={editLot.progress} onChange={(e) => setEditLot((p) => ({ ...p, progress: Number(e.target.value) }))} style={{ width: "100%", accentColor: AC }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: TX2, marginBottom: 6 }}>Couleur</div>
          <div style={{ display: "flex", gap: 8 }}>
            {LOT_COLORS.map((c) => (
              <button key={c.id} onClick={() => setEditLot((p) => ({ ...p, color: c.id }))} style={{ width: 26, height: 26, borderRadius: "50%", background: c.value, border: editLot.color === c.id ? `3px solid ${TX}` : `3px solid transparent`, cursor: "pointer", outline: "none" }} />
            ))}
          </div>
        </div>
        <button onClick={saveLot} disabled={!editLot.name.trim()} style={{ width: "100%", padding: 14, border: "none", borderRadius: 10, background: editLot.name.trim() ? AC : DIS, color: editLot.name.trim() ? "#fff" : DIST, fontSize: 15, fontWeight: 600, cursor: editLot.name.trim() ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
          {modal === "add" ? t("planning.addLotBtn") : t("save")}
        </button>
      </Modal>
    </div>
  );
}

