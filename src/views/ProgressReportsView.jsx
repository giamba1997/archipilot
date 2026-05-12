import { useState, useEffect, useMemo } from "react";
import {
  AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, RD, GR,
  AM, AMB, ST, STB, BR, BRB, SG, SGB,
  DIS, DIST,
} from "../constants/tokens";
import { getStatus } from "../constants/statuses";
import { Ico } from "../components/ui";
import { loadProgressReports, saveProgressReport, deleteProgressReport, generateProgressReportContent, loadPermits } from "../db";

// ── F10 — Rapports d'avancement client ──────────────────────
// v1 : génération à la demande (l'archi clique "Générer"). Le contenu
// markdown produit par l'IA est éditable côté front. Export en PDF
// client-side (réutilise jsPDF, similaire à OPR / Journal / Facture).
//
// Pour v2 : ajouter cron périodique 7/15/30j + envoi auto au MO.

const PERIOD_PRESETS = [
  { id: 7,   label: "Dernière semaine" },
  { id: 15,  label: "Dernières 2 semaines" },
  { id: 30,  label: "Dernier mois" },
  { id: 90,  label: "Dernier trimestre" },
];

const STATUS_META = {
  draft:    { label: "Brouillon", color: TX2, bg: SB  },
  reviewed: { label: "Relu",      color: ST,  bg: STB },
  sent:     { label: "Envoyé",    color: GR,  bg: SGB },
};

const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const dateToISO = (d) => d.toISOString().slice(0, 10);
const parseDateAny = (s) => {
  if (!s) return null;
  const iso = new Date(s);
  if (!isNaN(iso)) return iso;
  const m = (s || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const year = y.length === 2 ? 2000 + parseInt(y, 10) : parseInt(y, 10);
    return new Date(year, parseInt(mo, 10) - 1, parseInt(d, 10));
  }
  return null;
};

export function ProgressReportsView({ project, profile, showToast, onBack }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [periodDays, setPeriodDays] = useState(30);

  useEffect(() => {
    let cancelled = false;
    loadProgressReports({ projectId: project.id })
      .then(rows => { if (!cancelled) { setReports(rows); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [project.id]);

  const refresh = async () => {
    const rows = await loadProgressReports({ projectId: project.id });
    setReports(rows);
  };

  // Aperçu : ce qui sera dans le rapport pour la période choisie
  const preview = useMemo(() => {
    const end = new Date();
    const start = new Date(); start.setDate(start.getDate() - periodDays);
    const inRange = (iso) => {
      const d = parseDateAny(iso);
      return d && d >= start && d <= end;
    };
    const pvs = (project.pvHistory || []).filter(pv => inRange(pv.date));
    const photos = (project.gallery || []).filter(ph => inRange(ph.date || ph.takenAt));
    const reservesOpen = (project.reserves || []).filter(r => r.status !== "levee");
    const tasksOpen = (project.tasks || []).filter(t => !["done", "cancelled", "closed"].includes(t.status));
    return {
      period_start: dateToISO(start),
      period_end: dateToISO(end),
      pvs, photos, reservesOpen, tasksOpen,
    };
  }, [project, periodDays]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      // Charger les permits du projet
      const permits = await loadPermits({ projectId: project.id });

      const result = await generateProgressReportContent({
        project_name: project.name,
        status_label: getStatus(project.statusId).label,
        period_start: preview.period_start,
        period_end: preview.period_end,
        pvs: preview.pvs,
        tasks: preview.tasksOpen,
        reserves: preview.reservesOpen,
        photos_count: preview.photos.length,
        permits,
      });

      if (result.upgradeRequired) {
        showToast?.("Plan supérieur requis pour la synthèse IA", "error");
        return;
      }
      if (result.error) {
        showToast?.(`Erreur génération : ${result.error}`, "error");
        return;
      }

      // Sauvegarder le brouillon en DB
      const saved = await saveProgressReport({
        project_id: project.id,
        project_name: project.name,
        period_start: preview.period_start,
        period_end: preview.period_end,
        content_md: result.content_md,
        status: "draft",
      });
      if (saved) {
        await refresh();
        setEditing(saved);
        showToast?.("Rapport généré — édite-le avant envoi");
      } else {
        showToast?.("Échec de la sauvegarde", "error");
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (r) => {
    if (!confirm(`Supprimer le rapport du ${fmtDate(r.period_end)} ?`)) return;
    const ok = await deleteProgressReport(r.id);
    if (ok) {
      setReports(prev => prev.filter(x => x.id !== r.id));
      showToast?.("Rapport supprimé");
    }
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", animation: "fadeIn 0.2s ease" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onBack} style={{ background: SB, border: `1px solid ${SBB}`, cursor: "pointer", padding: 7, minWidth: 36, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 }}>
            <Ico name="back" color={TX2} size={16} />
          </button>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: TX }}>Rapports d'avancement</div>
            <div style={{ fontSize: 12, color: TX3 }}>{project.name} — Synthèse IA pour le MO</div>
          </div>
        </div>
      </div>

      {/* Carte génération */}
      <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 10 }}>Générer un nouveau rapport</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {PERIOD_PRESETS.map(p => (
            <button
              key={p.id}
              onClick={() => setPeriodDays(p.id)}
              style={{
                padding: "6px 12px",
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

        {/* Aperçu du contenu */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px,1fr))", gap: 8, marginBottom: 12 }}>
          <KpiSmall label="PV de la période" value={preview.pvs.length} />
          <KpiSmall label="Photos prises" value={preview.photos.length} />
          <KpiSmall label="Réserves ouvertes" value={preview.reservesOpen.length} />
          <KpiSmall label="Tâches ouvertes" value={preview.tasksOpen.length} />
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating}
          style={{
            width: "100%", padding: "11px 16px", border: "none", borderRadius: 10,
            background: generating ? DIS : AC,
            color: generating ? DIST : "#fff",
            fontSize: 13, fontWeight: 700,
            cursor: generating ? "not-allowed" : "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}
        >
          <Ico name="sparkle" size={13} color={generating ? DIST : "#fff"} />
          {generating ? "Synthèse IA en cours…" : "Générer le rapport"}
        </button>
      </div>

      {/* Historique */}
      {loading ? (
        <div style={{ padding: "30px 0", textAlign: "center", color: TX3, fontSize: 13 }}>Chargement…</div>
      ) : reports.length === 0 ? (
        <div style={{ padding: "20px", textAlign: "center", color: TX3, fontSize: 12 }}>
          Aucun rapport encore. Clique « Générer » pour produire le premier.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 4 }}>Historique ({reports.length})</div>
          {reports.map(r => {
            const s = STATUS_META[r.status] || STATUS_META.draft;
            return (
              <div key={r.id} style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: TX }}>Période {fmtDate(r.period_start)} → {fmtDate(r.period_end)}</span>
                    <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 999, background: s.bg, color: s.color, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      {s.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: TX3 }}>
                    Généré {fmtDate(r.generated_at)}
                    {r.sent_at && ` · Envoyé ${fmtDate(r.sent_at)}`}
                  </div>
                </div>
                <button onClick={() => setEditing(r)} style={iconBtnStyle} title="Voir / éditer">
                  <Ico name="edit" size={14} color={TX2} />
                </button>
                <button onClick={() => handleDelete(r)} style={iconBtnStyle} title="Supprimer">
                  <Ico name="trash" size={14} color={RD} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Editor modal */}
      {editing && (
        <ReportEditorModal
          report={editing}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            const saved = await saveProgressReport({ ...editing, ...patch, _wasSent: !!editing.sent_at });
            if (saved) {
              setEditing(saved);
              await refresh();
              showToast?.("Rapport enregistré");
            }
          }}
        />
      )}
    </div>
  );
}

function KpiSmall({ label, value }) {
  return (
    <div style={{ background: SB, border: `1px solid ${SBB}`, borderRadius: 8, padding: "8px 10px" }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: TX3, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: TX, marginTop: 2 }}>{value}</div>
    </div>
  );
}

// ── Modal éditeur — édition du markdown + statut ──
function ReportEditorModal({ report, onClose, onSave }) {
  const [content, setContent] = useState(report.content_md || "");
  const [status, setStatus] = useState(report.status || "draft");
  const [sentTo, setSentTo] = useState((report.sent_to || []).join(", "));

  const save = () => {
    onSave({
      content_md: content,
      status,
      sent_to: sentTo ? sentTo.split(",").map(s => s.trim()).filter(Boolean) : null,
    });
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 250, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: WH, borderRadius: 14, width: "100%", maxWidth: 780, maxHeight: "92vh", overflowY: "auto", padding: 22, fontFamily: "inherit" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: TX }}>Rapport — {fmtDate(report.period_start)} → {fmtDate(report.period_end)}</div>
            <div style={{ fontSize: 11, color: TX3, marginTop: 2 }}>Édite le markdown à ta guise. L'export PDF/copier suivra ces modifications.</div>
          </div>
          <button onClick={onClose} style={{ background: SB, border: `1px solid ${SBB}`, cursor: "pointer", padding: 6, borderRadius: 8 }}>
            <Ico name="x" size={14} color={TX2} />
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: TX2, marginBottom: 5 }}>Statut</div>
            <div style={{ display: "flex", gap: 4 }}>
              {Object.entries(STATUS_META).map(([id, m]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setStatus(id)}
                  style={{
                    flex: 1, padding: "7px 8px",
                    border: `1.5px solid ${status === id ? m.color : SBB}`,
                    borderRadius: 8,
                    background: status === id ? m.bg : WH,
                    color: status === id ? m.color : TX3,
                    fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          {status === "sent" && (
            <div style={{ flex: 2 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: TX2, marginBottom: 5 }}>Envoyé à (séparé par virgule)</div>
              <input value={sentTo} onChange={e => setSentTo(e.target.value)} placeholder="client@example.com" style={inputStyle} />
            </div>
          )}
        </div>

        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          rows={20}
          style={{ ...inputStyle, fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: 12, lineHeight: 1.55, resize: "vertical", whiteSpace: "pre-wrap" }}
        />

        <div style={{ marginTop: 12, padding: "8px 12px", background: SB, border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 11, color: TX3, lineHeight: 1.5 }}>
          Astuce : copie-colle le markdown ci-dessus dans ton email au MO (la plupart des clients mails le rendent correctement), ou utilise une extension comme « Markdown Here ».
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "11px 16px", border: `1px solid ${SBB}`, borderRadius: 10, background: WH, color: TX2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Annuler
          </button>
          <button
            onClick={() => { navigator.clipboard?.writeText(content); }}
            style={{ flex: 1, padding: "11px 16px", border: `1px solid ${SBB}`, borderRadius: 10, background: WH, color: TX, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
          >
            <Ico name="copy" size={12} color={TX2} /> Copier
          </button>
          <button
            onClick={save}
            style={{ flex: 2, padding: "11px 16px", border: "none", borderRadius: 10, background: AC, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
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
