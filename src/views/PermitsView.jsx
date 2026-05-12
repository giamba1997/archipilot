import { useState, useEffect, useMemo } from "react";
import {
  AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, RD, GR,
  AM, AMB, ST, STB, BR, BRB, SG, SGB,
  DIS, DIST, E_PERMIT_BG, E_TX_TAUPE2,
} from "../constants/tokens";
import { Ico } from "../components/ui";
import { loadPermits, savePermit, deletePermit } from "../db";

// ── F4 — Suivi des permis d'urbanisme ───────────────────────
// Vue plein écran par projet. Chaque permis a son cycle de vie, un délai
// légal calculé selon la procédure (30/75/105/230 jours), et une liste de
// documents (forme libre, snapshot URL en v1).
//
// Statuts :
//   preparation       → dossier en cours de rédaction
//   deposited         → dossier déposé en commune
//   complete_request  → commune a demandé des compléments
//   in_review         → instruction en cours
//   granted           → octroyé
//   refused           → refusé
//   recourse          → recours en cours
//   expired           → délai dépassé (silence vaut quoi)

const PERMIT_TYPES = [
  { id: "urbanisme",  label: "Urbanisme" },
  { id: "env",        label: "Environnement" },
  { id: "mixte",      label: "Mixte (URB + ENV)" },
  { id: "enseigne",   label: "Enseigne" },
  { id: "demolition", label: "Démolition" },
  { id: "autres",     label: "Autres" },
];

// Durées légales en jours pour le calcul de la deadline depuis l'AR
const PROCEDURES = [
  { id: "30j",    label: "30 jours (modif mineure)",       days: 30  },
  { id: "75j",    label: "75 jours (permis simple)",       days: 75  },
  { id: "105j",   label: "105 jours (avec consultation)",  days: 105 },
  { id: "230j",   label: "230 jours (avec EIE)",           days: 230 },
  { id: "autres", label: "Autres (jours personnalisés)",   days: null },
];

const STATUSES = [
  { id: "preparation",      label: "En préparation",     color: TX2, bg: SB,           dot: TX3 },
  { id: "deposited",        label: "Déposé",             color: E_TX_TAUPE2, bg: E_PERMIT_BG, dot: E_TX_TAUPE2 },
  { id: "complete_request", label: "Compléments demandés", color: AM,  bg: AMB,         dot: AM  },
  { id: "in_review",        label: "En instruction",     color: ST,  bg: STB,          dot: ST  },
  { id: "granted",          label: "Octroyé",            color: GR,  bg: SGB,          dot: GR  },
  { id: "refused",          label: "Refusé",             color: BR,  bg: BRB,          dot: BR  },
  { id: "recourse",         label: "Recours",            color: AM,  bg: AMB,          dot: AM  },
  { id: "expired",          label: "Expiré",             color: BR,  bg: BRB,          dot: BR  },
];
const getStatus = (id) => STATUSES.find(s => s.id === id) || STATUSES[0];

// ── Calcul automatique de la deadline ───
// deadline = (ar_date || depot_date) + procedure_days
function computeDeadline({ ar_date, depot_date, procedure, procedure_days }) {
  const start = ar_date || depot_date;
  if (!start) return null;
  let days;
  if (procedure === "autres") days = Number(procedure_days) || 0;
  else days = PROCEDURES.find(p => p.id === procedure)?.days || 75;
  if (days === 0) return null;
  const d = new Date(start);
  if (isNaN(d)) return null;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Jours restants avant deadline (négatif = dépassé)
function daysUntil(iso) {
  if (!iso) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(iso); target.setHours(0,0,0,0);
  return Math.round((target - today) / 86400000);
}

const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit", year: "numeric" });
};

export function PermitsView({ project, profile, showToast, onBack }) {
  const [permits, setPermits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    let cancelled = false;
    loadPermits({ projectId: project.id })
      .then(rows => { if (!cancelled) { setPermits(rows); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [project.id]);

  const refresh = async () => {
    const rows = await loadPermits({ projectId: project.id });
    setPermits(rows);
  };

  const handleSave = async (draft) => {
    // Recalcule deadline à chaque save pour la garder cohérente
    draft.deadline_date = computeDeadline(draft) || draft.deadline_date;
    const saved = await savePermit(draft);
    if (saved) {
      setEditing(null);
      await refresh();
      showToast?.(draft.id ? "Permis mis à jour" : "Permis créé");
    } else {
      showToast?.("Échec de la sauvegarde", "error");
    }
  };

  const handleDelete = async (p) => {
    if (!confirm(`Supprimer ce permis ?\n\nRéférence : ${p.reference || "sans référence"}`)) return;
    const ok = await deletePermit(p.id);
    if (ok) {
      setPermits(prev => prev.filter(x => x.id !== p.id));
      showToast?.("Permis supprimé");
    }
  };

  // KPIs : alertes les plus urgentes en haut
  const alerts = useMemo(() => {
    const active = permits.filter(p => ["deposited", "complete_request", "in_review"].includes(p.status));
    return active
      .map(p => ({ permit: p, days: daysUntil(p.deadline_date) }))
      .filter(x => x.days !== null && x.days <= 30)
      .sort((a, b) => a.days - b.days);
  }, [permits]);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", animation: "fadeIn 0.2s ease" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onBack} style={{ background: SB, border: `1px solid ${SBB}`, cursor: "pointer", padding: 7, minWidth: 36, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 }}>
            <Ico name="back" color={TX2} size={16} />
          </button>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: TX }}>Permis d'urbanisme</div>
            <div style={{ fontSize: 12, color: TX3 }}>{project.name} — Suivi des dossiers + alertes d'échéance</div>
          </div>
        </div>
        <button
          onClick={() => setEditing("new")}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 10, border: "none", background: AC, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
        >
          <Ico name="plus" size={13} color="#fff" /> Nouveau permis
        </button>
      </div>

      {/* Alertes échéance */}
      {alerts.length > 0 && (
        <div style={{ background: BRB, border: `1px solid ${BR}33`, borderRadius: 12, padding: "10px 14px", marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: BR, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
            <Ico name="alert" size={11} color={BR} /> {alerts.length} échéance{alerts.length > 1 ? "s" : ""} approche{alerts.length > 1 ? "nt" : ""}
          </div>
          {alerts.slice(0, 3).map(a => (
            <div key={a.permit.id} style={{ fontSize: 12, color: TX, marginBottom: 2 }}>
              <strong>{a.permit.reference || "Permis sans référence"}</strong> · {a.days < 0 ? `dépassé de ${-a.days}j` : a.days === 0 ? "aujourd'hui" : `dans ${a.days}j`}
            </div>
          ))}
        </div>
      )}

      {/* Liste */}
      {loading ? (
        <div style={{ padding: "30px 0", textAlign: "center", color: TX3, fontSize: 13 }}>Chargement…</div>
      ) : permits.length === 0 ? (
        <div style={{ padding: "32px 20px", textAlign: "center", background: WH, border: `1px dashed ${SBB}`, borderRadius: 14, color: TX3, fontSize: 13 }}>
          Aucun permis pour ce projet. Crée-en un pour traquer le dépôt, l'AR et l'échéance de décision.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {permits.map(p => {
            const s = getStatus(p.status);
            const days = daysUntil(p.deadline_date);
            const isUrgent = days !== null && days <= 30 && ["deposited","complete_request","in_review"].includes(p.status);
            const proc = PROCEDURES.find(x => x.id === p.procedure);
            return (
              <div key={p.id} style={{ background: WH, border: `1px solid ${isUrgent ? BR : SBB}`, borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ width: 6, height: 36, borderRadius: 3, background: s.dot, flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: TX }}>{p.reference || "Permis sans référence"}</span>
                      <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 999, background: s.bg, color: s.color, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        {s.label}
                      </span>
                      <span style={{ fontSize: 10, color: TX3 }}>{PERMIT_TYPES.find(t => t.id === p.permit_type)?.label || p.permit_type}</span>
                      {proc && <span style={{ fontSize: 10, color: TX3 }}>· {proc.label}</span>}
                    </div>
                    <div style={{ fontSize: 11, color: TX3, display: "flex", flexWrap: "wrap", gap: 10 }}>
                      {p.commune && <span><strong style={{ color: TX2 }}>Commune :</strong> {p.commune}</span>}
                      {p.depot_date && <span><strong style={{ color: TX2 }}>Dépôt :</strong> {fmtDate(p.depot_date)}</span>}
                      {p.ar_date && <span><strong style={{ color: TX2 }}>AR :</strong> {fmtDate(p.ar_date)}</span>}
                      {p.deadline_date && (
                        <span style={{ color: isUrgent ? BR : TX3 }}>
                          <strong style={{ color: isUrgent ? BR : TX2 }}>Échéance :</strong> {fmtDate(p.deadline_date)}
                          {days !== null && ` (${days < 0 ? `dépassée de ${-days}j` : days === 0 ? "aujourd'hui" : `J-${days}`})`}
                        </span>
                      )}
                      {p.decision_date && <span><strong style={{ color: TX2 }}>Décision :</strong> {fmtDate(p.decision_date)}</span>}
                    </div>
                    {p.notes && (
                      <div style={{ fontSize: 12, color: TX2, marginTop: 6, lineHeight: 1.5 }}>{p.notes}</div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button onClick={() => setEditing(p)} title="Modifier" style={iconBtnStyle}>
                      <Ico name="edit" size={14} color={TX2} />
                    </button>
                    <button onClick={() => handleDelete(p)} title="Supprimer" style={iconBtnStyle}>
                      <Ico name="trash" size={14} color={RD} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal édition / création */}
      {editing && (
        <PermitFormModal
          permit={editing === "new" ? null : editing}
          project={project}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

// ── Formulaire ──
function PermitFormModal({ permit, project, onCancel, onSave }) {
  const [form, setForm] = useState(() => ({
    id: permit?.id || null,
    project_id: project.id,
    project_name: project.name,
    permit_type: permit?.permit_type || "urbanisme",
    procedure: permit?.procedure || "75j",
    procedure_days: permit?.procedure_days || "",
    reference: permit?.reference || "",
    commune: permit?.commune || project.city || "",
    depot_date: permit?.depot_date || "",
    ar_date: permit?.ar_date || "",
    deadline_date: permit?.deadline_date || "",
    decision_date: permit?.decision_date || "",
    decision_text: permit?.decision_text || "",
    status: permit?.status || "preparation",
    documents: permit?.documents || [],
    notes: permit?.notes || "",
  }));

  // Recalcule deadline en live quand l'archi modifie procédure ou dates.
  // computeDeadline est pas cher → pas besoin de useMemo, on évite aussi
  // la complication des deps exhaustifs sur un objet form complet.
  const previewDeadline = computeDeadline(form);

  const canSave = form.permit_type && form.procedure;

  return (
    <div
      onClick={onCancel}
      style={{ position: "fixed", inset: 0, zIndex: 250, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: WH, borderRadius: 14, width: "100%", maxWidth: 620, padding: 22, maxHeight: "92vh", overflowY: "auto", fontFamily: "inherit" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: TX }}>{permit ? "Modifier le permis" : "Nouveau permis"}</div>
            <div style={{ fontSize: 12, color: TX3, marginTop: 2 }}>L'échéance est calculée automatiquement depuis la date d'AR (ou de dépôt).</div>
          </div>
          <button onClick={onCancel} style={{ background: SB, border: `1px solid ${SBB}`, cursor: "pointer", padding: 6, borderRadius: 8, display: "flex" }}>
            <Ico name="x" size={14} color={TX2} />
          </button>
        </div>

        {/* Type + Procédure */}
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <Label>Type de permis</Label>
            <select value={form.permit_type} onChange={e => setForm(f => ({ ...f, permit_type: e.target.value }))} style={inputStyle}>
              {PERMIT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <Label>Procédure légale</Label>
            <select value={form.procedure} onChange={e => setForm(f => ({ ...f, procedure: e.target.value }))} style={inputStyle}>
              {PROCEDURES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
        </div>
        {form.procedure === "autres" && (
          <div style={{ marginBottom: 12 }}>
            <Label>Délai personnalisé (jours)</Label>
            <input type="number" min="0" value={form.procedure_days} onChange={e => setForm(f => ({ ...f, procedure_days: e.target.value }))} style={inputStyle} />
          </div>
        )}

        {/* Référence + commune */}
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <Label>Référence dossier</Label>
            <input value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} placeholder="ex : URB/2026/0123" style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <Label>Commune</Label>
            <input value={form.commune} onChange={e => setForm(f => ({ ...f, commune: e.target.value }))} placeholder="ex : Schaerbeek" style={inputStyle} />
          </div>
        </div>

        {/* Dates clés */}
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <Label>Date de dépôt</Label>
            <input type="date" value={form.depot_date} onChange={e => setForm(f => ({ ...f, depot_date: e.target.value }))} style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <Label>Date d'AR (commune)</Label>
            <input type="date" value={form.ar_date} onChange={e => setForm(f => ({ ...f, ar_date: e.target.value }))} style={inputStyle} />
          </div>
        </div>

        {/* Aperçu deadline calculée */}
        {previewDeadline && (
          <div style={{ padding: "10px 12px", background: ACL, border: `1px solid ${ACL2}`, borderRadius: 8, fontSize: 12, color: AC, marginBottom: 12 }}>
            <strong>Échéance calculée :</strong> {fmtDate(previewDeadline)} — silence vaut acceptation/refus selon la procédure.
          </div>
        )}

        {/* Décision + statut */}
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <Label>Date de décision (si reçue)</Label>
            <input type="date" value={form.decision_date} onChange={e => setForm(f => ({ ...f, decision_date: e.target.value }))} style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <Label>Statut</Label>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={inputStyle}>
              {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
        </div>

        {form.decision_date && (
          <div style={{ marginBottom: 12 }}>
            <Label>Texte de la décision</Label>
            <textarea value={form.decision_text} onChange={e => setForm(f => ({ ...f, decision_text: e.target.value }))} rows={2} placeholder="ex : Octroyé sous condition de conserver les arbres remarquables…" style={{ ...inputStyle, resize: "vertical" }} />
          </div>
        )}

        <Label>Notes</Label>
        <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Observations, contacts commune…" style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} />

        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "11px 16px", border: `1px solid ${SBB}`, borderRadius: 10, background: WH, color: TX2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Annuler
          </button>
          <button
            onClick={() => canSave && onSave(form)}
            disabled={!canSave}
            style={{ flex: 2, padding: "11px 16px", border: "none", borderRadius: 10, background: canSave ? AC : DIS, color: canSave ? "#fff" : DIST, fontSize: 13, fontWeight: 700, cursor: canSave ? "pointer" : "not-allowed", fontFamily: "inherit" }}
          >
            {permit ? "Enregistrer" : "Créer le permis"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Label({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: TX2, marginBottom: 5 }}>{children}</div>;
}

const inputStyle = {
  width: "100%", padding: "10px 12px", border: `1px solid ${SBB}`, borderRadius: 8,
  fontSize: 13, fontFamily: "inherit", background: WH, color: TX,
  outline: "none", boxSizing: "border-box",
};

const iconBtnStyle = {
  background: "transparent", border: "none", cursor: "pointer", padding: 6,
  display: "flex", alignItems: "center", justifyContent: "center",
};
