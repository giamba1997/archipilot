import { useState, useEffect, useMemo } from "react";
import {
  AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, RD, GR,
  AM, AMB, ST, STB, BR, BRB, SG, SGB,
  DIS, DIST,
} from "../constants/tokens";
import { getStatus } from "../constants/statuses";
import { Ico, MobileConsultationBanner } from "../components/ui";
import { useIsMobile } from "../hooks/useIsMobile";
import { loadProgressReports, saveProgressReport, deleteProgressReport, generateProgressReportContent, loadPermits } from "../db";

// ── F10 — Rapports d'avancement client ──────────────────────
// v1 : génération à la demande (l'archi clique "Générer"). Le contenu
// markdown produit par l'IA est éditable côté front. Export en PDF
// client-side (réutilise jsPDF, similaire à OPR / Journal / Facture).
//
// Pour v2 : ajouter cron périodique 7/15/30j + envoi auto au MO.

const PERIOD_PRESETS = [
  { id: 7,   label: "Dernière semaine",      short: "7 j" },
  { id: 15,  label: "Dernières 2 semaines",  short: "2 sem." },
  { id: 30,  label: "Dernier mois",          short: "1 mois" },
  { id: 90,  label: "Dernier trimestre",     short: "Trimestre" },
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
// "juin 2026" depuis la fin de période (titre du rapport).
const monthLabel = (iso) => {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("fr-BE", { month: "long", year: "numeric" });
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
  const isMobile = useIsMobile();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [periodDays, setPeriodDays] = useState(30);
  const [selectedId, setSelectedId] = useState(null);

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
    } catch (e) {
      console.error("Progress report generation error:", e);
      showToast?.("Échec de la génération du rapport — vérifie ta connexion et réessaie.", "error");
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

  const sel = reports.find(r => r.id === selectedId) || reports[0] || null;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", animation: "fadeIn 0.2s ease" }}>
      {/* En-tête éditorial */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 18 }}>
        <button onClick={onBack} aria-label="Retour" style={{ background: SB, border: `1px solid ${SBB}`, cursor: "pointer", padding: 7, minWidth: 36, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, marginTop: 2 }}>
          <Ico name="back" color={TX2} size={16} />
        </button>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: AC, marginBottom: 6 }}>Rapports client · générés par l'IA</div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: "-0.5px", color: TX }}>États d'avancement</h1>
        </div>
      </div>

      {isMobile && <MobileConsultationBanner hint="génération de rapports IA depuis l'ordinateur." />}

      {isMobile ? (
        <ReportsList reports={reports} loading={loading} selectedId={sel?.id} onSelect={(r) => setEditing(r)} onDelete={handleDelete} />
      ) : (
        <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
          {/* Colonne gauche : générateur + liste */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ background: ACL, border: `1px solid ${ACL2}`, borderRadius: 14, padding: "16px 18px", marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
                <Ico name="sparkle" size={17} color={AC} />
                <span style={{ fontSize: 14, fontWeight: 700, color: TX }}>Générer un rapport</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: TX2 }}>Période :</span>
                <div style={{ display: "inline-flex", gap: 3, background: WH, border: `1px solid ${ACL2}`, borderRadius: 9, padding: 3 }}>
                  {PERIOD_PRESETS.map(p => {
                    const a = periodDays === p.id;
                    return <button key={p.id} onClick={() => setPeriodDays(p.id)} title={p.label} style={{ padding: "5px 11px", borderRadius: 6, border: "none", background: a ? AC : "transparent", color: a ? "#fff" : TX2, fontSize: 12, fontWeight: a ? 600 : 500, cursor: "pointer", fontFamily: "inherit" }}>{p.short}</button>;
                  })}
                </div>
                <button onClick={handleGenerate} disabled={generating} style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 7, height: 38, padding: "0 15px", background: generating ? DIS : AC, color: generating ? DIST : "#fff", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: generating ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                  <Ico name="sparkle" size={14} color={generating ? DIST : "#fff"} />{generating ? "Synthèse IA…" : "Générer"}
                </button>
              </div>
              <div style={{ fontSize: 12, color: "#8B5A3C", marginTop: 10, lineHeight: 1.5 }}>
                L'IA synthétise PV, photos et réserves de la période en un rapport prêt à relire puis envoyer au MO. Sur cette période : {preview.pvs.length} PV · {preview.photos.length} photos · {preview.reservesOpen.length} réserves · {preview.tasksOpen.length} tâches.
              </div>
            </div>

            <div style={{ fontSize: 11, fontWeight: 600, color: TX3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>Rapports générés</div>
            <ReportsList reports={reports} loading={loading} selectedId={sel?.id} onSelect={(r) => setSelectedId(r.id)} onDelete={handleDelete} />
          </div>

          {/* Colonne droite : aperçu */}
          <div style={{ width: 340, flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: TX3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>{sel ? `Aperçu · ${monthLabel(sel.period_end)}` : "Aperçu"}</div>
            {sel ? (
              <>
                <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 14, padding: "22px 24px" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: TX3, marginBottom: 4 }}>État d'avancement</div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: TX, letterSpacing: "-0.3px", marginBottom: 3, textTransform: "capitalize" }}>{project.name} — {monthLabel(sel.period_end)}</div>
                  <div style={{ fontSize: 12, color: TX3, marginBottom: 16, paddingBottom: 14, borderBottom: `1px solid ${SBB}` }}>{project.client ? `Pour : ${project.client} · ` : ""}période du {fmtDate(sel.period_start)} au {fmtDate(sel.period_end)}</div>
                  <ReportBody md={sel.content_md} />
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  {/* Les deux actions ouvrent l'éditeur (édition + destinataires +
                      copie/export PDF = la préparation d'envoi). On n'affiche plus
                      « Envoyer au MO » qui laissait croire à un envoi un-clic
                      inexistant. */}
                  <button onClick={() => setEditing(sel)} style={{ flex: 1, height: 38, background: WH, border: `1px solid ${SBB}`, borderRadius: 9, fontSize: 13, fontWeight: 500, color: TX2, cursor: "pointer", fontFamily: "inherit" }}>Modifier</button>
                  <button onClick={() => setEditing(sel)} style={{ flex: 1.4, height: 38, background: AC, border: "none", borderRadius: 9, fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Ico name="send" size={13} color="#fff" />Préparer l'envoi au MO</button>
                </div>
              </>
            ) : (
              <div style={{ background: SB, border: `1px dashed ${SBB}`, borderRadius: 14, padding: "32px 20px", textAlign: "center", color: TX3, fontSize: 13, lineHeight: 1.5 }}>Génère un rapport pour voir son aperçu ici.</div>
            )}
          </div>
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

// Liste des rapports générés (ligne = fichier + titre + statut, cliquable).
function ReportsList({ reports, loading, selectedId, onSelect, onDelete }) {
  if (loading) return <div style={{ padding: "30px 0", textAlign: "center", color: TX3, fontSize: 13 }}>Chargement…</div>;
  if (!reports.length) return <div style={{ padding: "28px 20px", textAlign: "center", background: WH, border: `1px dashed ${SBB}`, borderRadius: 14, color: TX3, fontSize: 13 }}>Aucun rapport encore. Choisis une période et clique « Générer ».</div>;
  return (
    <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 14, overflow: "hidden" }}>
      {reports.map((r, i) => {
        const s = STATUS_META[r.status] || STATUS_META.draft;
        const active = r.id === selectedId;
        return (
          <div key={r.id} onClick={() => onSelect(r)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderBottom: i < reports.length - 1 ? `1px solid ${SB2}` : "none", cursor: "pointer", background: active ? ACL : WH, transition: "background 0.15s" }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: ACL, color: AC, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Ico name="file" size={17} color={AC} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: TX, textTransform: "capitalize" }}>Avancement — {monthLabel(r.period_end)}</div>
              <div style={{ fontSize: 12, color: TX3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fmtDate(r.period_start)} au {fmtDate(r.period_end)} · {r.sent_at ? `envoyé le ${fmtDate(r.sent_at)}` : `généré le ${fmtDate(r.generated_at)}`}</div>
            </div>
            <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 999, background: s.bg, color: s.color, fontWeight: 500, flexShrink: 0 }}>{s.label}</span>
            {onDelete && <button onClick={(e) => { e.stopPropagation(); onDelete(r); }} title="Supprimer" aria-label="Supprimer" style={{ background: "transparent", border: "none", cursor: "pointer", color: TX3, padding: 4, display: "flex", flexShrink: 0 }}><Ico name="trash" size={14} color={TX3} /></button>}
          </div>
        );
      })}
    </div>
  );
}

// Rendu léger du markdown du rapport (titres de section en brand, paragraphes).
function ReportBody({ md }) {
  const out = [];
  (md || "").split("\n").forEach((ln, i) => {
    const t = ln.trim();
    if (!t) return;
    const head = t.match(/^#{1,3}\s+(.*)$/) || (/^\*\*(.+?)\*\*:?$/.test(t) ? [null, t.replace(/\*\*/g, "").replace(/:$/, "")] : null);
    if (head) { out.push(<div key={i} style={{ fontSize: 12, fontWeight: 700, color: AC, margin: out.length ? "12px 0 6px" : "0 0 6px" }}>{head[1]}</div>); return; }
    if (/^[-*]\s/.test(t)) { out.push(<div key={i} style={{ fontSize: 13, color: TX2, lineHeight: 1.6, paddingLeft: 4 }}>• {t.replace(/^[-*]\s/, "").replace(/\*\*/g, "")}</div>); return; }
    out.push(<p key={i} style={{ margin: "0 0 12px", fontSize: 13, lineHeight: 1.6, color: TX2 }}>{t.replace(/\*\*/g, "")}</p>);
  });
  if (!out.length) out.push(<div key="e" style={{ fontSize: 13, color: TX3, fontStyle: "italic" }}>Rapport vide — ouvre « Modifier » pour rédiger.</div>);
  return <div>{out}</div>;
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
