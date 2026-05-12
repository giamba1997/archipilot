import { useState, useMemo, useRef } from "react";
import {
  AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, RD, GR,
  AM, AMB, ST, STB, BR, BRB, SG, SGB, VI, VIB,
  DIS, DIST, REDBG, REDBRD,
} from "../constants/tokens";
import { getReserveSeverity, getReserveStatus } from "../constants/statuses";
import { Ico } from "../components/ui";
import { uploadPhoto } from "../db";
import { generateChantierJournalPdf } from "../utils/pdf";
import { MAX_UPLOAD_PHOTO_BYTES } from "../constants/config";

// ── F2 — Journal de chantier ────────────────────────────────
// Timeline chronologique unique qui agrège tout ce qui s'est passé
// sur le projet (PV / photos / OPR / réserves créées / actions /
// entrées libres saisies par l'archi). Objectif : satisfaire
// l'obligation légale RGPT et faciliter audits / litiges.
//
// Les "entrées libres" (visites sans PV) sont stockées dans
// project.journalEntries[] — pas de nouvelle table, on garde le
// pattern JSONB existant (cohérence avec reserves/actions/etc.).
//
// Cohérence UX : pas de mutation auto, l'archi déclenche ses ajouts.
// Le PDF généré est une *proposition* qu'il télécharge — pas un envoi
// automatique vers un tiers.

// ── Types d'entrées + métadonnées visuelles ──
// Chaque type a sa couleur de dot dans la timeline (cf roadmap §F2 :
// PV=ambre, photo=bleu, action=violet, manuel=gris). Pour la sévérité
// des réserves on réutilise les couleurs sémantiques existantes.
const ENTRY_TYPES = {
  pv:      { label: "PV",       icon: "file",      dot: AM, dotBg: AMB },
  opr:     { label: "OPR",      icon: "checksq",   dot: AC, dotBg: ACL },
  reserve: { label: "Réserve",  icon: "alert",     dot: BR, dotBg: BRB },
  action:  { label: "Action",   icon: "listcheck", dot: VI, dotBg: VIB },
  photo:   { label: "Photo",    icon: "camera",    dot: ST, dotBg: STB },
  manual:  { label: "Visite",   icon: "pen2",      dot: TX2, dotBg: SB2 },
};

const ALL_TYPES = Object.keys(ENTRY_TYPES);

// Parse d'une date FR (DD/MM/YYYY) vers Date — réutilise le pattern
// déjà présent dans utils/dates.js mais inlined pour éviter d'imposer
// son format aux entrées non-PV.
function parseDate(input) {
  if (!input) return null;
  if (input instanceof Date) return isNaN(input) ? null : input;
  if (typeof input !== "string") return null;
  // ISO d'abord (createdAt ...)
  const iso = new Date(input);
  if (!isNaN(iso)) return iso;
  // Format français DD/MM/YYYY
  const m = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const year = y.length === 2 ? 2000 + parseInt(y, 10) : parseInt(y, 10);
    return new Date(year, parseInt(mo, 10) - 1, parseInt(d, 10));
  }
  return null;
}

// Format DD/MM/YYYY HH:mm (ou juste DD/MM/YYYY si pas d'heure)
function fmtDate(d, withTime = false) {
  if (!d || isNaN(d)) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  if (!withTime || (d.getHours() === 0 && d.getMinutes() === 0)) return `${dd}/${mm}/${yy}`;
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yy} ${hh}:${mi}`;
}

// ── Agrégation : produit la liste chronologique inversée d'entrées ──
// Chaque entrée a { id, type, date (Date), title, subtitle, body, photos, raw }
// `raw` pointe vers l'objet source pour le drawer détail.
function buildTimeline(project, { typeFilter, search, periodDays }) {
  const entries = [];

  // PV — pvHistory[] (date FR DD/MM/YYYY)
  for (const pv of (project.pvHistory || [])) {
    const d = parseDate(pv.date);
    if (!d) continue;
    entries.push({
      id: `pv-${pv.number}`,
      type: "pv",
      date: d,
      title: `PV n°${pv.number}`,
      subtitle: pv.author ? `Rédigé par ${pv.author}` : null,
      body: pv.excerpt || pv.content?.slice(0, 220) || "",
      photos: [],
      raw: pv,
    });
  }

  // OPR — oprHistory[]
  for (const opr of (project.oprHistory || [])) {
    const d = parseDate(opr.date);
    if (!d) continue;
    const typeLbl = opr.type === "definitive" ? "définitive" : "provisoire";
    entries.push({
      id: `opr-${opr.id || opr.number}`,
      type: "opr",
      date: d,
      title: `OPR n°${opr.number} — Réception ${typeLbl}`,
      subtitle: `${(opr.reserves || []).length} réserve${(opr.reserves || []).length > 1 ? "s" : ""} constatée${(opr.reserves || []).length > 1 ? "s" : ""}`,
      body: "",
      photos: [],
      raw: opr,
    });
  }

  // Réserves créées — reserves[] (createdAt ISO)
  for (const r of (project.reserves || [])) {
    const d = parseDate(r.createdAt);
    if (!d) continue;
    const sev = getReserveSeverity(r.severity);
    const st = getReserveStatus(r.status);
    entries.push({
      id: `reserve-${r.id}`,
      type: "reserve",
      date: d,
      title: `${r.code || "Réserve"} — ${sev.label}`,
      subtitle: [r.contractor, r.location, st.label].filter(Boolean).join(" · "),
      body: r.description || "",
      photos: r.photos || [],
      raw: r,
    });
  }

  // Actions — actions[] (depuis "since" pas idéal — on prend tasks si dispo)
  for (const a of (project.actions || [])) {
    // Les actions historiques n'ont pas toujours de date. On les ignore
    // pour éviter du bruit chronologique sans valeur. Si le projet utilise
    // tasks[] (modèle plus riche), on prend createdAt là-bas.
    if (!a.createdAt) continue;
    const d = parseDate(a.createdAt);
    if (!d) continue;
    entries.push({
      id: `action-${a.id}`,
      type: "action",
      date: d,
      title: "Action",
      subtitle: a.who || null,
      body: a.text || "",
      photos: [],
      raw: a,
    });
  }

  // Tâches — project.tasks[] (modèle riche : createdAt, dueDate, status)
  for (const tk of (project.tasks || [])) {
    if (!tk.createdAt) continue;
    const d = parseDate(tk.createdAt);
    if (!d) continue;
    entries.push({
      id: `task-${tk.id}`,
      type: "action",
      date: d,
      title: tk.title || "Tâche",
      subtitle: [tk.assignee, tk.priority].filter(Boolean).join(" · "),
      body: tk.notes || "",
      photos: [],
      raw: tk,
    });
  }

  // Photos — gallery[] (groupées par jour pour limiter le bruit)
  const photoByDay = {};
  for (const ph of (project.gallery || [])) {
    const d = parseDate(ph.date || ph.takenAt || ph.createdAt);
    if (!d) continue;
    const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!photoByDay[dayKey]) photoByDay[dayKey] = { date: d, photos: [], captions: [] };
    photoByDay[dayKey].photos.push(ph.url || ph.dataUrl);
    if (ph.caption) photoByDay[dayKey].captions.push(ph.caption);
  }
  for (const [k, group] of Object.entries(photoByDay)) {
    entries.push({
      id: `photo-${k}`,
      type: "photo",
      date: group.date,
      title: `${group.photos.length} photo${group.photos.length > 1 ? "s" : ""} ajoutée${group.photos.length > 1 ? "s" : ""}`,
      subtitle: null,
      body: group.captions.slice(0, 3).join(" · "),
      photos: group.photos,
      raw: group,
    });
  }

  // Entrées libres — project.journalEntries[]
  for (const je of (project.journalEntries || [])) {
    const d = parseDate(je.entryDate);
    if (!d) continue;
    entries.push({
      id: `manual-${je.id}`,
      type: "manual",
      date: d,
      title: "Visite de chantier",
      subtitle: (je.authors || []).join(", ") || null,
      body: je.observation || "",
      photos: je.photos || [],
      raw: je,
    });
  }

  // Filtres
  const q = (search || "").trim().toLowerCase();
  const cutoff = periodDays > 0 ? new Date(Date.now() - periodDays * 86400000) : null;
  return entries
    .filter(e => typeFilter === "all" || e.type === typeFilter)
    .filter(e => !cutoff || e.date >= cutoff)
    .filter(e => !q ||
      e.title.toLowerCase().includes(q) ||
      (e.subtitle || "").toLowerCase().includes(q) ||
      (e.body || "").toLowerCase().includes(q))
    .sort((a, b) => b.date - a.date);
}

// ──────────────────────────────────────────────────────────────
// Composant principal
// ──────────────────────────────────────────────────────────────
export function JournalView({ project, setProjects, profile, onBack, showToast }) {
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [periodDays, setPeriodDays] = useState(0); // 0 = tout, 7 = 1 semaine, 30 = 1 mois
  const [drawerEntry, setDrawerEntry] = useState(null);
  const [addingManual, setAddingManual] = useState(false);
  const [exporting, setExporting] = useState(false);

  const timeline = useMemo(
    () => buildTimeline(project, { typeFilter, search, periodDays }),
    [project, typeFilter, search, periodDays]
  );

  const counts = useMemo(() => {
    const all = buildTimeline(project, { typeFilter: "all", search: "", periodDays: 0 });
    const out = { all: all.length };
    for (const t of ALL_TYPES) out[t] = all.filter(e => e.type === t).length;
    return out;
  }, [project]);

  const addManualEntry = (entry) => {
    setProjects(prev => prev.map(p => p.id === project.id
      ? { ...p, journalEntries: [...(p.journalEntries || []), entry] }
      : p));
    setAddingManual(false);
    showToast?.("Entrée ajoutée au journal");
  };

  const deleteManualEntry = (id) => {
    if (!confirm("Supprimer cette entrée du journal ?")) return;
    setProjects(prev => prev.map(p => p.id === project.id
      ? { ...p, journalEntries: (p.journalEntries || []).filter(e => e.id !== id) }
      : p));
    setDrawerEntry(null);
  };

  const exportPdf = async () => {
    setExporting(true);
    try {
      await generateChantierJournalPdf(project, timeline, profile);
      showToast?.("Journal exporté");
    } catch (e) {
      console.error("Journal PDF error:", e);
      showToast?.(`Erreur PDF : ${e?.message || e}`, "error");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", animation: "fadeIn 0.2s ease" }}>
      {/* Header — exactement le pattern OprView */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onBack} style={{ background: SB, border: `1px solid ${SBB}`, cursor: "pointer", padding: 7, minWidth: 36, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 }}>
            <Ico name="back" color={TX2} size={16} />
          </button>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: TX }}>Journal de chantier</div>
            <div style={{ fontSize: 12, color: TX3 }}>{project.name} — Chronologie agrégée (PV, photos, réserves, visites)</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={exportPdf}
            disabled={exporting || timeline.length === 0}
            title="Télécharger le journal complet en PDF (pour archivage / audit Cnac)"
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "9px 14px", borderRadius: 10,
              border: `1px solid ${SBB}`, background: WH,
              color: timeline.length === 0 ? DIST : TX2,
              fontSize: 13, fontWeight: 600,
              cursor: exporting || timeline.length === 0 ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            <Ico name="download" size={13} color={timeline.length === 0 ? DIST : TX2} />
            {exporting ? "..." : "PDF"}
          </button>
          <button
            onClick={() => setAddingManual(true)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "9px 14px", borderRadius: 10,
              border: "none", background: AC, color: "#fff",
              fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <Ico name="plus" size={13} color="#fff" /> Entrée libre
          </button>
        </div>
      </div>

      {/* Filtres */}
      <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 14, padding: 14, marginBottom: 14, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {/* Type */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <FilterChip active={typeFilter === "all"} onClick={() => setTypeFilter("all")} label={`Tout (${counts.all})`} />
          {ALL_TYPES.map(t => counts[t] > 0 && (
            <FilterChip
              key={t}
              active={typeFilter === t}
              onClick={() => setTypeFilter(t)}
              label={`${ENTRY_TYPES[t].label} (${counts[t]})`}
              dot={ENTRY_TYPES[t].dot}
            />
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 12 }} />
        {/* Période */}
        <div style={{ display: "flex", gap: 4 }}>
          {[
            { id: 0, label: "Tout" },
            { id: 7, label: "7j" },
            { id: 30, label: "30j" },
            { id: 90, label: "3 mois" },
          ].map(p => (
            <button
              key={p.id}
              onClick={() => setPeriodDays(p.id)}
              style={{
                padding: "5px 11px",
                border: `1px solid ${periodDays === p.id ? ACL2 : SBB}`,
                borderRadius: 999,
                background: periodDays === p.id ? ACL : WH,
                color: periodDays === p.id ? AC : TX2,
                fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        {/* Recherche */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher..."
          style={{
            flexBasis: 220, padding: "6px 10px",
            border: `1px solid ${SBB}`, borderRadius: 8,
            fontSize: 12, fontFamily: "inherit", background: SB, color: TX,
            outline: "none", boxSizing: "border-box",
          }}
        />
      </div>

      {/* Timeline */}
      {timeline.length === 0 ? (
        <div style={{ padding: "32px 20px", textAlign: "center", background: WH, border: `1px dashed ${SBB}`, borderRadius: 14, color: TX3, fontSize: 13 }}>
          {search || typeFilter !== "all" || periodDays > 0
            ? "Aucune entrée ne correspond aux filtres."
            : "Aucune entrée pour l'instant. Ajoute une visite libre, ou crée un PV / une réserve / une photo dans le projet."}
        </div>
      ) : (
        <div style={{ position: "relative", paddingLeft: 22 }}>
          {/* Trait vertical de la timeline */}
          <div style={{ position: "absolute", left: 7, top: 0, bottom: 0, width: 2, background: SBB, borderRadius: 1 }} />

          {timeline.map((e, idx) => {
            const meta = ENTRY_TYPES[e.type];
            return (
              <div
                key={e.id}
                style={{ position: "relative", paddingBottom: idx === timeline.length - 1 ? 0 : 14 }}
              >
                {/* Dot */}
                <div style={{
                  position: "absolute", left: -22, top: 14,
                  width: 16, height: 16, borderRadius: "50%",
                  background: meta.dotBg, border: `2px solid ${meta.dot}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  zIndex: 1,
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: meta.dot }} />
                </div>

                {/* Card cliquable */}
                <button
                  onClick={() => setDrawerEntry(e)}
                  style={{
                    width: "100%", textAlign: "left", padding: "12px 14px",
                    border: `1px solid ${SBB}`, borderRadius: 10, background: WH,
                    cursor: "pointer", fontFamily: "inherit", transition: "border-color 0.15s, background 0.15s",
                  }}
                  onMouseEnter={(ev) => { ev.currentTarget.style.borderColor = ACL2; }}
                  onMouseLeave={(ev) => { ev.currentTarget.style.borderColor = SBB; }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
                      <span style={{
                        fontSize: 9, padding: "2px 7px", borderRadius: 999,
                        background: meta.dotBg, color: meta.dot, fontWeight: 700,
                        textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0,
                      }}>{meta.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {e.title}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, color: TX3, fontWeight: 600, flexShrink: 0 }}>{fmtDate(e.date)}</span>
                  </div>
                  {e.subtitle && (
                    <div style={{ fontSize: 11, color: TX3, marginBottom: e.body ? 4 : 0 }}>{e.subtitle}</div>
                  )}
                  {e.body && (
                    <div style={{ fontSize: 12, color: TX2, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {e.body}
                    </div>
                  )}
                  {e.photos.length > 0 && (
                    <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                      {e.photos.slice(0, 5).map((p, i) => (
                        <img key={i} src={p} style={{ width: 44, height: 44, borderRadius: 6, objectFit: "cover", border: `1px solid ${SBB}` }} />
                      ))}
                      {e.photos.length > 5 && (
                        <div style={{ width: 44, height: 44, borderRadius: 6, background: SB, border: `1px solid ${SBB}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: TX2 }}>
                          +{e.photos.length - 5}
                        </div>
                      )}
                    </div>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Drawer détail */}
      {drawerEntry && (
        <EntryDrawer
          entry={drawerEntry}
          onClose={() => setDrawerEntry(null)}
          onDelete={drawerEntry.type === "manual" ? () => deleteManualEntry(drawerEntry.raw.id) : null}
        />
      )}

      {/* Modal entrée libre */}
      {addingManual && (
        <ManualEntryModal
          authorDefault={profile?.name || ""}
          onCancel={() => setAddingManual(false)}
          onSave={addManualEntry}
        />
      )}
    </div>
  );
}

// ── FilterChip — pattern réutilisé partout (OPR, Bibliothèque) ──
function FilterChip({ active, onClick, label, dot }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "5px 11px",
        border: `1px solid ${active ? ACL2 : SBB}`,
        borderRadius: 999,
        background: active ? ACL : WH,
        color: active ? AC : TX2,
        fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
      }}
    >
      {dot && <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot }} />}
      {label}
    </button>
  );
}

// ── Drawer détail d'une entrée ──
function EntryDrawer({ entry, onClose, onDelete }) {
  const meta = ENTRY_TYPES[entry.type];
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 240, display: "flex", justifyContent: "flex-end" }}
      onClick={onClose}
    >
      <div style={{ background: "rgba(0,0,0,0.3)", position: "absolute", inset: 0 }} />
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: "relative", width: "100%", maxWidth: 480,
          background: WH, overflowY: "auto", padding: 20,
          animation: "slideInRight 0.25s ease-out",
          fontFamily: "inherit",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: meta.dotBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Ico name={meta.icon} size={14} color={meta.dot} />
            </div>
            <div>
              <div style={{ fontSize: 9, color: meta.dot, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>{meta.label}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: TX, lineHeight: 1.2 }}>{entry.title}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: SB, border: `1px solid ${SBB}`, cursor: "pointer", padding: 6, borderRadius: 8, display: "flex" }}>
            <Ico name="x" size={14} color={TX2} />
          </button>
        </div>

        <div style={{ fontSize: 11, color: TX3, marginBottom: 4 }}>Date</div>
        <div style={{ fontSize: 13, color: TX, marginBottom: 14 }}>{fmtDate(entry.date, true)}</div>

        {entry.subtitle && (
          <>
            <div style={{ fontSize: 11, color: TX3, marginBottom: 4 }}>Détails</div>
            <div style={{ fontSize: 13, color: TX, marginBottom: 14 }}>{entry.subtitle}</div>
          </>
        )}

        {entry.body && (
          <>
            <div style={{ fontSize: 11, color: TX3, marginBottom: 4 }}>Observation</div>
            <div style={{ fontSize: 13, color: TX, marginBottom: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{entry.body}</div>
          </>
        )}

        {entry.photos.length > 0 && (
          <>
            <div style={{ fontSize: 11, color: TX3, marginBottom: 6 }}>Photos ({entry.photos.length})</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 6, marginBottom: 14 }}>
              {entry.photos.map((p, i) => (
                <img key={i} src={p} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 8, border: `1px solid ${SBB}` }} />
              ))}
            </div>
          </>
        )}

        {onDelete && (
          <button
            onClick={onDelete}
            style={{ width: "100%", padding: "10px 14px", border: `1px solid ${REDBRD}`, borderRadius: 9, background: WH, color: RD, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
          >
            <Ico name="trash" size={12} color={RD} /> Supprimer cette entrée
          </button>
        )}
      </div>
    </div>
  );
}

// ── Modal d'ajout d'entrée libre (visite sans PV) ──
function ManualEntryModal({ authorDefault, onCancel, onSave }) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const [entryDate, setEntryDate] = useState(todayStr);
  const [entryTime, setEntryTime] = useState("");
  const [authors, setAuthors] = useState(authorDefault || "");
  const [observation, setObservation] = useState("");
  const [photos, setPhotos] = useState([]);
  const [weather, setWeather] = useState("");
  const [uploading, setUploading] = useState(false);
  const photoRef = useRef(null);

  const handlePhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("Format non supporté — image attendue."); e.target.value = ""; return; }
    if (file.size > MAX_UPLOAD_PHOTO_BYTES) {
      const mb = Math.round(file.size / 1024 / 1024);
      alert(`Photo trop lourde (${mb} Mo). Limite : ${MAX_UPLOAD_PHOTO_BYTES / 1024 / 1024} Mo.`);
      e.target.value = "";
      return;
    }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result;
      setPhotos(prev => [...prev, dataUrl]);
      if (navigator.onLine) {
        const result = await uploadPhoto(dataUrl);
        if (result) {
          setPhotos(prev => prev.map(p => p === dataUrl ? result.url : p));
        }
      }
      setUploading(false);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const canSave = entryDate && observation.trim();

  const submit = () => {
    if (!canSave) return;
    // Composer la date ISO avec l'heure si fournie
    let iso = entryDate;
    if (entryTime) iso = `${entryDate}T${entryTime}:00`;
    const entry = {
      id: `je-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      entryDate: iso,
      authors: authors.split(",").map(s => s.trim()).filter(Boolean),
      observation: observation.trim(),
      photos,
      weather: weather.trim() || null,
      createdAt: new Date().toISOString(),
    };
    onSave(entry);
  };

  return (
    <div
      onClick={onCancel}
      style={{ position: "fixed", inset: 0, zIndex: 250, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: WH, borderRadius: 14, width: "100%", maxWidth: 520, padding: 22, maxHeight: "90vh", overflowY: "auto", fontFamily: "inherit" }}
      >
        <div style={{ fontSize: 17, fontWeight: 700, color: TX, marginBottom: 4 }}>Nouvelle visite de chantier</div>
        <div style={{ fontSize: 12, color: TX3, marginBottom: 18, lineHeight: 1.5 }}>
          Pour une visite courte ou un constat ponctuel qui ne mérite pas un PV complet. L'entrée apparaît dans le journal et dans l'export PDF.
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: TX2, marginBottom: 4 }}>Date *</div>
            <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ width: 110 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: TX2, marginBottom: 4 }}>Heure</div>
            <input type="time" value={entryTime} onChange={e => setEntryTime(e.target.value)} style={inputStyle} />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: TX2, marginBottom: 4 }}>Présents (séparés par des virgules)</div>
          <input value={authors} onChange={e => setAuthors(e.target.value)} placeholder="ex : Architecte, MO" style={inputStyle} />
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: TX2, marginBottom: 4 }}>Observation *</div>
          <textarea
            value={observation}
            onChange={e => setObservation(e.target.value)}
            placeholder="ex : Visite de contrôle. Le coffrage du linteau Nord est en place. Pose béton prévue mardi."
            rows={4}
            style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: TX2, marginBottom: 4 }}>Météo (optionnel)</div>
          <input value={weather} onChange={e => setWeather(e.target.value)} placeholder="ex : Pluie matinale, 8°C" style={inputStyle} />
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: TX2, marginBottom: 6 }}>Photos</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {photos.map((p, i) => (
              <div key={i} style={{ position: "relative" }}>
                <img src={p} style={{ width: 64, height: 64, borderRadius: 8, objectFit: "cover", border: `1px solid ${SBB}` }} />
                <button
                  onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                  style={{ position: "absolute", top: -4, right: -4, width: 18, height: 18, borderRadius: "50%", background: RD, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  <Ico name="x" size={10} color="#fff" />
                </button>
              </div>
            ))}
            <button
              onClick={() => photoRef.current?.click()}
              style={{ width: 64, height: 64, borderRadius: 8, border: `1.5px dashed ${SBB}`, background: SB, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}
            >
              <Ico name="camera" size={16} color={TX3} />
              <span style={{ fontSize: 8, color: TX3, fontWeight: 600 }}>{uploading ? "..." : "Photo"}</span>
            </button>
            <input ref={photoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhoto} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onCancel}
            style={{ flex: 1, padding: "11px 16px", border: `1px solid ${SBB}`, borderRadius: 10, background: WH, color: TX2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
          >
            Annuler
          </button>
          <button
            onClick={submit}
            disabled={!canSave}
            style={{
              flex: 2, padding: "11px 16px", border: "none", borderRadius: 10,
              background: canSave ? AC : DIS,
              color: canSave ? "#fff" : DIST,
              fontSize: 13, fontWeight: 700,
              cursor: canSave ? "pointer" : "not-allowed", fontFamily: "inherit",
            }}
          >
            Ajouter au journal
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "10px 12px", border: `1px solid ${SBB}`, borderRadius: 8,
  fontSize: 13, fontFamily: "inherit", background: WH, color: TX,
  outline: "none", boxSizing: "border-box", transition: "border-color 0.15s",
};
