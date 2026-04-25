import { useState, useRef } from "react";
import { AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, RD, GR, SP, FS, RAD, DIS, DIST, REDBG, REDBRD, GRBG, BG } from "../constants/tokens";
import { RESERVE_STATUSES, RESERVE_SEVERITIES, getReserveStatus, getReserveSeverity, nextReserveStatus } from "../constants/statuses";
import { Ico } from "../components/ui";
import { uploadPhoto, getPhotoUrl } from "../db";

// ── OPR View ─────────────────────────────────────────────────

export function OprView({ project, setProjects, onBack }) {
  const [mode, setMode] = useState("list"); // "list" | "add" | "edit"
  const [editingId, setEditingId] = useState(null);
  const [filter, setFilter] = useState("all"); // "all" | "non_levee" | "partiellement_levee" | "levee"
  const [filterContractor, setFilterContractor] = useState("all");
  const photoRef = useRef(null);

  const reserves = project.reserves || [];

  // Stats
  const total = reserves.length;
  const levees = reserves.filter(r => r.status === "levee").length;
  const partielles = reserves.filter(r => r.status === "partiellement_levee").length;
  const nonLevees = reserves.filter(r => r.status === "non_levee").length;
  const critiques = reserves.filter(r => r.severity === "critical" && r.status !== "levee").length;
  const pctLevees = total > 0 ? Math.round((levees / total) * 100) : 0;

  // Contractors from reserves + participants
  const contractors = [...new Set([
    ...reserves.map(r => r.contractor).filter(Boolean),
    ...(project.participants || []).filter(p => p.role !== "Architecte").map(p => p.name),
  ])];

  // Filtered reserves
  const filtered = reserves.filter(r => {
    if (filter !== "all" && r.status !== filter) return false;
    if (filterContractor !== "all" && r.contractor !== filterContractor) return false;
    return true;
  });

  // Per-contractor stats
  const contractorStats = contractors.map(c => {
    const cReserves = reserves.filter(r => r.contractor === c);
    const cLevees = cReserves.filter(r => r.status === "levee").length;
    return { name: c, total: cReserves.length, levees: cLevees, pct: cReserves.length > 0 ? Math.round((cLevees / cReserves.length) * 100) : 0 };
  }).filter(c => c.total > 0).sort((a, b) => a.pct - b.pct);

  const updateReserves = (newReserves) => {
    setProjects(prev => prev.map(p => p.id === project.id ? { ...p, reserves: newReserves } : p));
  };

  const toggleStatus = (reserveId) => {
    updateReserves(reserves.map(r => {
      if (r.id !== reserveId) return r;
      const next = nextReserveStatus(r.status);
      return { ...r, status: next, resolvedAt: next === "levee" ? new Date().toISOString() : null };
    }));
  };

  const deleteReserve = (reserveId) => {
    if (!confirm("Supprimer cette réserve ?")) return;
    updateReserves(reserves.filter(r => r.id !== reserveId));
  };

  // ── Add / Edit form ──
  if (mode === "add" || mode === "edit") {
    const existing = mode === "edit" ? reserves.find(r => r.id === editingId) : null;
    return (
      <ReserveForm
        reserve={existing}
        contractors={contractors}
        nextCode={`R-${String(reserves.length + 1).padStart(3, "0")}`}
        onSave={(reserve) => {
          if (mode === "edit") {
            updateReserves(reserves.map(r => r.id === reserve.id ? reserve : r));
          } else {
            updateReserves([...reserves, reserve]);
          }
          setMode("list");
          setEditingId(null);
        }}
        onCancel={() => { setMode("list"); setEditingId(null); }}
      />
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", animation: "fadeIn 0.2s ease" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onBack} style={{ background: SB, border: `1px solid ${SBB}`, cursor: "pointer", padding: 7, minWidth: 36, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 }}>
            <Ico name="back" color={TX2} size={16} />
          </button>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: TX }}>Réserves OPR</div>
            <div style={{ fontSize: 12, color: TX3 }}>{project.name} — Opérations préalables à réception</div>
          </div>
        </div>
        <button
          onClick={() => setMode("add")}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", border: "none", borderRadius: 10, background: AC, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
        >
          <Ico name="plus" size={14} color="#fff" /> Nouvelle réserve
        </button>
      </div>

      {/* KPI Dashboard */}
      {total > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 16 }}>
          <KpiBox label="Total" value={total} color={TX} />
          <KpiBox label="Non levées" value={nonLevees} color={RD} />
          <KpiBox label="En cours" value={partielles} color="#D97706" />
          <KpiBox label="Levées" value={levees} color={GR} />
          {critiques > 0 && <KpiBox label="Critiques" value={critiques} color={RD} accent />}
        </div>
      )}

      {/* Global progress */}
      {total > 0 && (
        <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 12, padding: "14px 18px", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: TX }}>Progression globale</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: pctLevees === 100 ? GR : AC }}>{pctLevees}%</span>
          </div>
          <div style={{ height: 8, background: SB, borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pctLevees}%`, background: pctLevees === 100 ? GR : AC, borderRadius: 4, transition: "width 0.4s" }} />
          </div>
          {pctLevees === 100 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, padding: "8px 12px", background: GRBG, borderRadius: 8, fontSize: 13, color: GR, fontWeight: 600 }}>
              <Ico name="check" size={14} color={GR} />
              Toutes les réserves sont levées — vous pouvez procéder à la réception.
            </div>
          )}
        </div>
      )}

      {/* Per-contractor breakdown */}
      {contractorStats.length > 0 && (
        <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 12, padding: "14px 18px", marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 10 }}>Par entreprise</div>
          {contractorStats.map((c, i) => (
            <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderTop: i > 0 ? `1px solid ${SB}` : "none" }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: SB, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Ico name="users" size={13} color={TX3} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: TX }}>{c.name}</div>
                <div style={{ height: 4, background: SB, borderRadius: 2, marginTop: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${c.pct}%`, background: c.pct === 100 ? GR : AC, borderRadius: 2, transition: "width 0.3s" }} />
                </div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: c.pct === 100 ? GR : TX2, flexShrink: 0 }}>{c.levees}/{c.total}</span>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      {total > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {[{ id: "all", label: "Toutes" }, ...RESERVE_STATUSES].map(s => (
            <button key={s.id} onClick={() => setFilter(s.id)}
              style={{ padding: "5px 12px", border: `1px solid ${filter === s.id ? AC : SBB}`, borderRadius: 20, background: filter === s.id ? ACL : WH, color: filter === s.id ? AC : TX2, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              {s.label} {s.id !== "all" && `(${reserves.filter(r => r.status === s.id).length})`}
            </button>
          ))}
          {contractors.length > 1 && (
            <select value={filterContractor} onChange={e => setFilterContractor(e.target.value)}
              style={{ padding: "5px 10px", border: `1px solid ${SBB}`, borderRadius: 20, background: WH, color: TX2, fontSize: 11, fontFamily: "inherit", cursor: "pointer" }}>
              <option value="all">Toutes les entreprises</option>
              {contractors.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>
      )}

      {/* Reserve list */}
      {total === 0 ? (
        <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 12, padding: "40px 20px", textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: SB, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <Ico name="check" size={24} color={TX3} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: TX, marginBottom: 6 }}>Aucune réserve</div>
          <div style={{ fontSize: 13, color: TX3, marginBottom: 16 }}>Commencez par ajouter les réserves constatées lors de la visite OPR.</div>
          <button onClick={() => setMode("add")}
            style={{ padding: "10px 20px", border: "none", borderRadius: 10, background: AC, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Ajouter une réserve
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(r => {
            const st = getReserveStatus(r.status);
            const sev = getReserveSeverity(r.severity);
            return (
              <div key={r.id} style={{ background: WH, border: `1px solid ${r.severity === "critical" && r.status !== "levee" ? REDBRD : SBB}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "stretch" }}>
                  {/* Left accent */}
                  <div style={{ width: 4, background: st.color, flexShrink: 0 }} />

                  <div style={{ flex: 1, padding: "12px 14px", minWidth: 0 }}>
                    {/* Top row: code + severity + status */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: TX, fontFamily: "monospace" }}>{r.code}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: sev.color, background: sev.bg, padding: "2px 8px", borderRadius: 4 }}>{sev.label}</span>
                      <button onClick={() => toggleStatus(r.id)} title="Cliquez pour changer le statut"
                        style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, color: st.color, background: st.bg, padding: "2px 8px", borderRadius: 4, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: st.dot }} />
                        {st.label}
                      </button>
                      <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                        <button onClick={() => { setEditingId(r.id); setMode("edit"); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                          <Ico name="edit" size={13} color={TX3} />
                        </button>
                        <button onClick={() => deleteReserve(r.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                          <Ico name="x" size={13} color={TX3} />
                        </button>
                      </div>
                    </div>

                    {/* Description */}
                    <div style={{ fontSize: 13, color: TX, lineHeight: 1.5, marginBottom: 6 }}>{r.description}</div>

                    {/* Meta row */}
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11, color: TX3 }}>
                      {r.contractor && (
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <Ico name="users" size={11} color={TX3} /> {r.contractor}
                        </span>
                      )}
                      {r.location && (
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <Ico name="building" size={11} color={TX3} /> {r.location}
                        </span>
                      )}
                      {r.deadline && (
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <Ico name="calendar" size={11} color={TX3} /> {r.deadline}
                        </span>
                      )}
                      {(r.photos || []).length > 0 && (
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <Ico name="camera" size={11} color={TX3} /> {r.photos.length} photo{r.photos.length > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>

                    {/* Photos */}
                    {(r.photos || []).length > 0 && (
                      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                        {r.photos.slice(0, 4).map((ph, i) => (
                          <img key={i} src={ph} style={{ width: 48, height: 48, borderRadius: 6, objectFit: "cover", border: `1px solid ${SBB}` }} />
                        ))}
                        {r.photos.length > 4 && (
                          <div style={{ width: 48, height: 48, borderRadius: 6, background: SB, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: TX3 }}>+{r.photos.length - 4}</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ padding: 20, textAlign: "center", fontSize: 13, color: TX3 }}>Aucune réserve ne correspond aux filtres.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── KPI Box ──
function KpiBox({ label, value, color, accent }) {
  return (
    <div style={{ background: accent ? REDBG : WH, border: `1px solid ${accent ? REDBRD : SBB}`, borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
      <div style={{ fontSize: 24, fontWeight: 800, color, letterSpacing: "-0.5px", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 600, color: TX3, textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 4 }}>{label}</div>
    </div>
  );
}

// ── Reserve Form ──
function ReserveForm({ reserve, contractors, nextCode, onSave, onCancel }) {
  const [form, setForm] = useState(() => ({
    id: reserve?.id || Date.now() + Math.random(),
    code: reserve?.code || nextCode,
    description: reserve?.description || "",
    severity: reserve?.severity || "major",
    status: reserve?.status || "non_levee",
    contractor: reserve?.contractor || "",
    location: reserve?.location || "",
    deadline: reserve?.deadline || "",
    photos: reserve?.photos || [],
    notes: reserve?.notes || "",
    createdAt: reserve?.createdAt || new Date().toISOString(),
    resolvedAt: reserve?.resolvedAt || null,
  }));
  const photoRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const set = (key) => (val) => setForm(f => ({ ...f, [key]: val }));

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result;
      setForm(f => ({ ...f, photos: [...f.photos, dataUrl] }));
      if (navigator.onLine) {
        const result = await uploadPhoto(dataUrl);
        if (result) {
          setForm(f => ({ ...f, photos: f.photos.map(p => p === dataUrl ? result.url : p) }));
        }
      }
      setUploading(false);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const removePhoto = (idx) => setForm(f => ({ ...f, photos: f.photos.filter((_, i) => i !== idx) }));

  const canSave = form.description.trim();

  return (
    <div style={{ maxWidth: 600, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <button onClick={onCancel} style={{ background: SB, border: `1px solid ${SBB}`, cursor: "pointer", padding: 7, minWidth: 36, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 }}>
          <Ico name="back" color={TX2} size={16} />
        </button>
        <div style={{ fontSize: 18, fontWeight: 700, color: TX }}>{reserve ? `Modifier ${form.code}` : "Nouvelle réserve"}</div>
      </div>

      <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 14, padding: 20 }}>
        {/* Code */}
        <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
          <FormField label="Code" half>
            <input value={form.code} onChange={e => set("code")(e.target.value)} placeholder="R-001"
              style={{ ...inputStyle, fontFamily: "monospace", fontWeight: 700 }} />
          </FormField>
          <FormField label="Gravité" half>
            <div style={{ display: "flex", gap: 4 }}>
              {RESERVE_SEVERITIES.map(s => (
                <button key={s.id} onClick={() => set("severity")(s.id)}
                  style={{ flex: 1, padding: "7px 4px", border: `1.5px solid ${form.severity === s.id ? s.color : SBB}`, borderRadius: 8, background: form.severity === s.id ? s.bg : WH, color: form.severity === s.id ? s.color : TX3, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textAlign: "center" }}>
                  {s.label}
                </button>
              ))}
            </div>
          </FormField>
        </div>

        {/* Description */}
        <FormField label="Description *">
          <textarea value={form.description} onChange={e => set("description")(e.target.value)} placeholder="Décrivez le défaut constaté..."
            rows={3} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
        </FormField>

        {/* Contractor + Location */}
        <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
          <FormField label="Entreprise" half>
            <input list="contractors-list" value={form.contractor} onChange={e => set("contractor")(e.target.value)} placeholder="Sélectionner ou saisir..."
              style={inputStyle} />
            <datalist id="contractors-list">
              {contractors.map(c => <option key={c} value={c} />)}
            </datalist>
          </FormField>
          <FormField label="Localisation" half>
            <input value={form.location} onChange={e => set("location")(e.target.value)} placeholder="ex: Cuisine RDC"
              style={inputStyle} />
          </FormField>
        </div>

        {/* Deadline */}
        <FormField label="Échéance">
          <input type="date" value={form.deadline} onChange={e => set("deadline")(e.target.value)} style={inputStyle} />
        </FormField>

        {/* Notes */}
        <FormField label="Notes complémentaires">
          <textarea value={form.notes} onChange={e => set("notes")(e.target.value)} placeholder="Observations, commentaires..."
            rows={2} style={{ ...inputStyle, resize: "vertical" }} />
        </FormField>

        {/* Photos */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: TX2, marginBottom: 6 }}>Photos</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {form.photos.map((ph, i) => (
              <div key={i} style={{ position: "relative" }}>
                <img src={ph} style={{ width: 64, height: 64, borderRadius: 8, objectFit: "cover", border: `1px solid ${SBB}` }} />
                <button onClick={() => removePhoto(i)} style={{ position: "absolute", top: -4, right: -4, width: 18, height: 18, borderRadius: "50%", background: RD, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Ico name="x" size={10} color="#fff" />
                </button>
              </div>
            ))}
            <button onClick={() => photoRef.current?.click()}
              style={{ width: 64, height: 64, borderRadius: 8, border: `1.5px dashed ${SBB}`, background: SB, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
              <Ico name="camera" size={16} color={TX3} />
              <span style={{ fontSize: 8, color: TX3, fontWeight: 600 }}>{uploading ? "..." : "Photo"}</span>
            </button>
            <input ref={photoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhoto} />
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, paddingTop: 6 }}>
          <button onClick={onCancel}
            style={{ flex: 1, padding: "11px 16px", border: `1px solid ${SBB}`, borderRadius: 10, background: WH, color: TX2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Annuler
          </button>
          <button onClick={() => canSave && onSave(form)} disabled={!canSave}
            style={{ flex: 2, padding: "11px 16px", border: "none", borderRadius: 10, background: canSave ? AC : DIS, color: canSave ? "#fff" : DIST, fontSize: 13, fontWeight: 700, cursor: canSave ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
            {reserve ? "Enregistrer" : "Ajouter la réserve"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Form Field ──
function FormField({ label, children, half }) {
  return (
    <div style={{ flex: half ? 1 : undefined, marginBottom: half ? 0 : 14 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: TX2, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "10px 12px", border: `1px solid ${SBB}`, borderRadius: 8,
  fontSize: 13, fontFamily: "inherit", background: WH, color: TX,
  outline: "none", boxSizing: "border-box", transition: "border-color 0.15s",
};
