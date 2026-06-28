import { useMemo, useState } from "react";
import { DatePicker } from "../DatePicker";
import {
  AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, BR, BRB, SG, SGB,
  REDBRD, SP, FS, RAD, DIS, DIST,
} from "../../constants/tokens";
import { Modal, Field, Ico } from "../ui";
import {
  TASK_PRIORITIES, getTaskPriority, newTask, nextTaskNumber,
} from "../../utils/tasks";

// Modal de revue des tâches suggérées par l'IA après génération d'un PV.
//
// Reçoit un projet, agrège toutes les suggestions encore en statut "pending"
// (groupées par PV d'origine), et permet de les valider une par une.
//
// Principe directeur (cf. memory/feedback_ia_assistant) : l'IA propose,
// l'utilisateur dispose. Aucune création silencieuse — chaque tâche acceptée
// l'est sur action explicite.

export function SuggestedTasksModal({ open, onClose, project, setProjects, profile, showToast }) {
  // Pour chaque suggestion, état local d'édition (l'utilisateur peut affiner
  // le titre / la priorité / l'échéance avant d'accepter).
  const [edits, setEdits] = useState({}); // { suggestionId: patch }

  // Toutes les suggestions encore en attente, groupées par PV.
  const groups = useMemo(() => {
    if (!project) return [];
    const out = [];
    for (const pv of (project.pvHistory || [])) {
      const pending = (pv.suggestedTasks || []).filter(s => s.status === "pending");
      if (pending.length > 0) out.push({ pv, suggestions: pending });
    }
    return out;
  }, [project]);

  const totalPending = groups.reduce((s, g) => s + g.suggestions.length, 0);

  // Accepte une suggestion : crée une tâche dans project.tasks (avec
  // origin="pv" + pvNumber pour traçabilité) et marque la suggestion
  // comme acceptée pour qu'elle disparaisse du bandeau.
  const acceptSuggestion = (pvNumber, suggestion) => {
    const patch = edits[suggestion.id] || {};
    setProjects(prev => prev.map(p => {
      if (p.id !== project.id) return p;
      const number = nextTaskNumber(p);
      const task = newTask({
        number,
        title: patch.title ?? suggestion.title,
        priority: patch.priority ?? suggestion.priority ?? "medium",
        dueDate: patch.dueDate ?? suggestion.dueDate ?? "",
        assigneeName: patch.assigneeName ?? suggestion.assigneeName ?? "",
        postId: suggestion.postId || "",
        origin: "pv",
        pvNumber,
        status: "open",  // suggestion validée → directement à faire (skip "Créée")
        createdBy: profile?.name || "—",
      });
      return {
        ...p,
        tasks: [...(p.tasks || []), task],
        pvHistory: p.pvHistory.map(pv => pv.number !== pvNumber ? pv : {
          ...pv,
          suggestedTasks: (pv.suggestedTasks || []).map(s =>
            s.id === suggestion.id ? { ...s, status: "accepted", taskId: task.id } : s
          ),
        }),
      };
    }));
  };

  const rejectSuggestion = (pvNumber, suggestion) => {
    setProjects(prev => prev.map(p => {
      if (p.id !== project.id) return p;
      return {
        ...p,
        pvHistory: p.pvHistory.map(pv => pv.number !== pvNumber ? pv : {
          ...pv,
          suggestedTasks: (pv.suggestedTasks || []).map(s =>
            s.id === suggestion.id ? { ...s, status: "rejected" } : s
          ),
        }),
      };
    }));
  };

  // "Tout accepter" — accepte toutes les suggestions en attente d'un coup.
  // Pratique quand l'IA a tapé juste sur tous les points.
  const acceptAll = () => {
    if (!window.confirm(`Créer ${totalPending} tâche${totalPending > 1 ? "s" : ""} d'un coup à partir des suggestions IA ?`)) return;
    for (const g of groups) {
      for (const s of g.suggestions) acceptSuggestion(g.pv.number, s);
    }
    showToast?.(`${totalPending} tâche${totalPending > 1 ? "s" : ""} créée${totalPending > 1 ? "s" : ""}`);
  };

  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title={`Suggestions IA · ${totalPending} tâche${totalPending > 1 ? "s" : ""} à valider`} wide>
      <div style={{ fontSize: FS.sm, color: TX2, lineHeight: 1.5, marginBottom: SP.md }}>
        L'IA a détecté ces actions concrètes dans tes PV récents. <strong style={{ color: TX }}>Rien n'est créé sans ta validation</strong> — accepte les pertinentes, rejette les autres.
      </div>

      {totalPending === 0 ? (
        <div style={{ padding: "20px 0", textAlign: "center", color: TX3, fontSize: FS.sm }}>
          Plus aucune suggestion en attente. Reviens après ta prochaine génération de PV.
        </div>
      ) : (
        <>
          {groups.map(g => (
            <div key={g.pv.number} style={{ marginBottom: SP.lg }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: SP.sm }}>
                <span style={{ fontSize: FS.xs, fontWeight: 700, color: TX3, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  PV n°{g.pv.number}
                </span>
                <span style={{ fontSize: FS.xs, color: TX3 }}>· {g.pv.date} · {g.suggestions.length} suggestion{g.suggestions.length > 1 ? "s" : ""}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {g.suggestions.map(s => (
                  <SuggestionRow key={s.id} suggestion={s} pvNumber={g.pv.number}
                    edit={edits[s.id]}
                    onEditChange={(patch) => setEdits(e => ({ ...e, [s.id]: { ...(e[s.id] || {}), ...patch } }))}
                    onAccept={() => acceptSuggestion(g.pv.number, s)}
                    onReject={() => rejectSuggestion(g.pv.number, s)}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* CTA bottom */}
          <div style={{ display: "flex", gap: SP.sm, alignItems: "center", paddingTop: SP.md, borderTop: `1px solid ${SBB}` }}>
            <button onClick={onClose}
              style={{ padding: "9px 14px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, color: TX2, fontSize: FS.sm, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Fermer
            </button>
            <div style={{ flex: 1 }} />
            <button onClick={acceptAll}
              style={{ padding: "9px 18px", border: "none", borderRadius: 8, background: AC, color: WH, fontSize: FS.sm, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Ico name="check" size={11} color={WH} />
              Tout accepter ({totalPending})
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

// ── Sous-composant : ligne d'une suggestion ──
function SuggestionRow({ suggestion, edit, onEditChange, onAccept, onReject }) {
  const merged = { ...suggestion, ...(edit || {}) };
  const priority = getTaskPriority(merged.priority);
  return (
    <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 10, padding: "12px 14px" }}>
      {/* Source — l'extrait du PV qui a déclenché la suggestion */}
      {merged.sourceExcerpt && (
        <div style={{ fontSize: FS.xs, color: TX3, fontStyle: "italic", marginBottom: 8, paddingLeft: 10, borderLeft: `2px solid ${SBB}` }}>
          « {merged.sourceExcerpt} »
        </div>
      )}

      {/* Champs éditables — l'utilisateur peut affiner avant accepter */}
      <input
        value={merged.title}
        onChange={(e) => onEditChange({ title: e.target.value })}
        style={{ width: "100%", border: `1px solid ${SBB}`, borderRadius: 6, padding: "8px 10px", fontSize: FS.sm, fontFamily: "inherit", color: TX, fontWeight: 600, marginBottom: 6 }}
      />
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
        <select value={merged.priority || "medium"} onChange={(e) => onEditChange({ priority: e.target.value })}
          style={{ padding: "5px 8px", border: `1px solid ${SBB}`, borderRadius: 6, fontSize: 11, fontFamily: "inherit", background: priority.bg, color: priority.color, cursor: "pointer" }}>
          {TASK_PRIORITIES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <DatePicker value={merged.dueDate || ""} onChange={(v) => onEditChange({ dueDate: v })} placeholder="Échéance" />
        <input value={merged.assigneeName || ""} onChange={(e) => onEditChange({ assigneeName: e.target.value })}
          placeholder="Assigné à…"
          style={{ padding: "5px 8px", border: `1px solid ${SBB}`, borderRadius: 6, fontSize: 11, fontFamily: "inherit", background: WH, color: TX, minWidth: 120, flex: 1 }} />
      </div>

      {/* Actions accept / reject */}
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button onClick={onReject}
          style={{ padding: "6px 12px", border: `1px solid ${SBB}`, borderRadius: 6, background: WH, color: TX3, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Ico name="x" size={10} color={TX3} />Rejeter
        </button>
        <button onClick={onAccept}
          style={{ padding: "6px 14px", border: "none", borderRadius: 6, background: SG, color: WH, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Ico name="check" size={10} color={WH} />Créer la tâche
        </button>
      </div>
    </div>
  );
}
