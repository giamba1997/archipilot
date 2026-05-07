import { useState, useMemo } from "react";
import { AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, BR, BRB, REDBRD, SP, FS, RAD } from "../constants/tokens";
import { Modal, Field, Ico, TaskSearchSelect } from "../components/ui";
import { formatDuration, totalSecondsFor, buildManualSession, groupSessionsByUser } from "../utils/timer";
import { downloadCSV } from "../utils/csv";

const dayLabel = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-BE", { weekday: "short", day: "2-digit", month: "short" });
};
const timeLabel = (iso) => new Date(iso).toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" });

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Helpers pour le filtre plage horaire — formats YYYY-MM-DD compatibles avec
// <input type="date">.
const toIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const startOfWeekIso = (d = new Date()) => {
  const day = new Date(d);
  const dow = (day.getDay() + 6) % 7; // Lundi = 0
  day.setDate(day.getDate() - dow);
  return day;
};
const shortcutBtn = {
  padding: "3px 8px", border: `1px solid ${SBB}`, borderRadius: 12,
  background: WH, color: TX2, fontSize: 10, fontWeight: 600,
  cursor: "pointer", fontFamily: "inherit",
};

// Modal — liste des sessions, ajout manuel, édition, suppression, export CSV.
// Quand l'utilisateur est admin/owner d'une org, un toggle "Par membre"
// apparaît pour voir le breakdown du temps par employé sur ce projet.
export function SessionsModal({ open, onClose, project, currentUser, isOrgAdmin, onAddManual, onEdit, onDelete }) {
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [groupMode, setGroupMode] = useState("flat"); // "flat" | "byUser"
  const [form, setForm] = useState({ date: today(), durationMinutes: 60, note: "", taskId: "" });
  // Filtre plage horaire (date début / date fin) — borne incluse à 23:59 pour
  // le jour de fin. Vide = pas de filtre. Local au modal, ne touche pas à la
  // saisie ni au timer en cours.
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const projectTasks = useMemo(() => project?.tasks || [], [project]);
  const allSessions = useMemo(() => {
    return [...(project?.timeSessions || [])].sort((a, b) =>
      (b.startedAt || "").localeCompare(a.startedAt || ""));
  }, [project]);
  // Sessions visibles après application du filtre plage horaire — utilisé
  // pour la liste détaillée, l'export CSV, et le total affiché.
  const sessions = useMemo(() => {
    if (!dateFrom && !dateTo) return allSessions;
    const fromMs = dateFrom ? new Date(dateFrom + "T00:00:00").getTime() : -Infinity;
    const toMs = dateTo ? new Date(dateTo + "T23:59:59").getTime() : Infinity;
    return allSessions.filter(s => {
      const t = new Date(s.startedAt).getTime();
      return t >= fromMs && t <= toMs;
    });
  }, [allSessions, dateFrom, dateTo]);
  const total = totalSecondsFor(sessions);
  const totalAllSessions = totalSecondsFor(allSessions);
  const filterActive = !!(dateFrom || dateTo);
  const userGroups = useMemo(() => groupSessionsByUser(sessions), [sessions]);
  const showByUser = isOrgAdmin && groupMode === "byUser";

  const handleSubmit = () => {
    setFormError("");
    try {
      const session = buildManualSession({
        date: form.date,
        durationMinutes: form.durationMinutes,
        note: form.note,
        taskId: form.taskId,
      });
      if (editingId) {
        onEdit(editingId, {
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          durationSeconds: session.durationSeconds,
          note: session.note,
          taskId: session.taskId || "",
          isManual: true,
        });
      } else {
        onAddManual(session);
      }
      resetForm();
    } catch (e) {
      setFormError(e.message);
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm({ date: today(), durationMinutes: 60, note: "", taskId: "" });
    setFormError("");
  };

  const startEdit = (s) => {
    const d = new Date(s.startedAt);
    setForm({
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      durationMinutes: Math.round(s.durationSeconds / 60),
      note: s.note || "",
      taskId: s.taskId || "",
    });
    setEditingId(s.id);
    setShowForm(true);
  };

  const handleExport = () => {
    if (sessions.length === 0) return;
    const headers = ["Date", "Début", "Fin", "Durée (h)", "Durée (min)", "Note", "Saisie", "Tâche n°", "Tâche titre"];
    const rows = sessions.map(s => {
      const start = new Date(s.startedAt);
      const minutes = Math.round(s.durationSeconds / 60);
      const linkedTask = s.taskId ? projectTasks.find(t => t.id === s.taskId) : null;
      return [
        start.toLocaleDateString("fr-BE"),
        timeLabel(s.startedAt),
        timeLabel(s.endedAt),
        (s.durationSeconds / 3600).toFixed(2),
        String(minutes),
        s.note || "",
        s.isManual ? "Manuelle" : "Timer",
        linkedTask?.number ? `#${linkedTask.number}` : "",
        linkedTask?.title || "",
      ];
    });
    downloadCSV(`temps-${(project.name || "projet").replace(/\s+/g, "-")}.csv`, headers, rows);
  };

  return (
    <Modal open={open} onClose={onClose} title={`Suivi du temps · ${project?.name || ""}`} wide>
      {/* Toggle vue Tous · Par membre — uniquement pour les admins org */}
      {isOrgAdmin && (
        <div style={{ display: "inline-flex", background: SB, border: `1px solid ${SBB}`, borderRadius: 8, padding: 2, gap: 1, marginBottom: 14 }}>
          {[
            { id: "flat", label: "Mes sessions", icon: "history" },
            { id: "byUser", label: `Par membre (${userGroups.length})`, icon: "users" },
          ].map(opt => {
            const active = groupMode === opt.id;
            return (
              <button key={opt.id} onClick={() => setGroupMode(opt.id)} aria-pressed={active}
                style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", border: "none", borderRadius: 6,
                  background: active ? WH : "transparent", cursor: active ? "default" : "pointer", fontFamily: "inherit",
                  boxShadow: active ? "0 1px 2px rgba(0,0,0,0.05)" : "none" }}>
                <Ico name={opt.icon} size={11} color={active ? AC : TX3} />
                <span style={{ fontSize: 11, fontWeight: active ? 700 : 500, color: active ? AC : TX2 }}>{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Total + actions */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, color: TX3, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>
            {filterActive ? "Total sur la période" : "Total cumulé"}
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: TX, fontVariantNumeric: "tabular-nums" }}>
            {total > 0 ? formatDuration(total) : "Aucune session"}
          </div>
          <div style={{ fontSize: 11, color: TX3, marginTop: 2 }}>
            {sessions.length > 0 && <span>{sessions.length} session{sessions.length > 1 ? "s" : ""}</span>}
            {filterActive && totalAllSessions > total && (
              <span> · sur {formatDuration(totalAllSessions)} au total</span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => { setEditingId(null); setShowForm(v => !v); setFormError(""); }}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "8px 14px", border: "none", borderRadius: 8,
              background: AC, color: "#fff", fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit", minHeight: 36,
            }}
          >
            <Ico name="plus" size={12} color="#fff" />
            Ajouter du temps
          </button>
          {sessions.length > 0 && (
            <button
              onClick={handleExport}
              title="Exporter en CSV"
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "8px 12px", border: `1px solid ${SBB}`, borderRadius: 8,
                background: WH, fontSize: 12, color: TX2,
                cursor: "pointer", fontFamily: "inherit", minHeight: 36,
              }}
            >
              <Ico name="download" size={12} color={TX3} />
              CSV
            </button>
          )}
        </div>
      </div>

      {/* Filtre plage horaire — bornes incluses (00:00 → 23:59 sur le jour de fin).
          Les sessions, le total, et l'export CSV reflètent le filtre actif. */}
      {allSessions.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap", padding: "8px 12px", background: filterActive ? ACL : SB, border: `1px solid ${filterActive ? ACL2 : SBB}`, borderRadius: 8 }}>
          <Ico name="calendar" size={12} color={filterActive ? AC : TX3} />
          <span style={{ fontSize: 11, fontWeight: 700, color: filterActive ? AC : TX3, textTransform: "uppercase", letterSpacing: "0.05em" }}>Période</span>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 11, color: TX3 }}>du</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} max={dateTo || undefined}
              style={{ padding: "4px 7px", border: `1px solid ${SBB}`, borderRadius: 6, background: WH, color: TX, fontSize: 11, fontFamily: "inherit" }} />
            <span style={{ fontSize: 11, color: TX3, marginLeft: 4 }}>au</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} min={dateFrom || undefined}
              style={{ padding: "4px 7px", border: `1px solid ${SBB}`, borderRadius: 6, background: WH, color: TX, fontSize: 11, fontFamily: "inherit" }} />
          </div>
          {/* Raccourcis rapides — utilisent les ranges classiques de timesheet */}
          {!filterActive && (
            <>
              <span style={{ color: SBB }}>·</span>
              <button onClick={() => { const d = new Date(); setDateFrom(toIso(startOfWeekIso(d))); setDateTo(toIso(d)); }}
                style={shortcutBtn}>Cette semaine</button>
              <button onClick={() => { const d = new Date(); setDateFrom(toIso(new Date(d.getFullYear(), d.getMonth(), 1))); setDateTo(toIso(d)); }}
                style={shortcutBtn}>Ce mois</button>
            </>
          )}
          <div style={{ flex: 1 }} />
          {filterActive && (
            <>
              <span style={{ fontSize: 11, color: AC, fontWeight: 600 }}>{sessions.length} session{sessions.length > 1 ? "s" : ""} · {formatDuration(total) || "0min"}</span>
              <button onClick={() => { setDateFrom(""); setDateTo(""); }}
                style={{ background: "none", border: "none", padding: "4px 6px", cursor: "pointer", fontFamily: "inherit", fontSize: 11, color: TX3, textDecoration: "underline" }}>
                Réinitialiser
              </button>
            </>
          )}
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div style={{ background: SB, border: `1px solid ${SBB}`, borderRadius: 10, padding: "14px 16px", marginBottom: 14, animation: "fadeIn 0.15s ease" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, marginBottom: 10 }}>
            {editingId ? "Modifier la session" : "Ajouter du temps manuellement"}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 160px" }}>
              <Field
                label="Date"
                type="date"
                value={form.date}
                onChange={(v) => setForm(f => ({ ...f, date: v }))}
              />
            </div>
            <div style={{ flex: "1 1 140px" }}>
              <Field
                label="Durée (minutes)"
                type="number"
                value={String(form.durationMinutes)}
                onChange={(v) => setForm(f => ({ ...f, durationMinutes: v }))}
              />
            </div>
            <div style={{ flex: "2 1 200px" }}>
              <Field
                label="Note (facultative)"
                value={form.note}
                onChange={(v) => setForm(f => ({ ...f, note: v }))}
                placeholder="Ex: Plans façade, réunion chantier..."
              />
            </div>
          </div>
          {/* Lien tâche — recherche par titre ou par numéro (#5) */}
          {projectTasks.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: TX2, marginBottom: 5 }}>
                Lier à une tâche (facultatif)
              </label>
              <TaskSearchSelect
                tasks={projectTasks}
                value={form.taskId}
                onChange={(id) => setForm(f => ({ ...f, taskId: id }))}
                placeholder="Tape le titre ou un numéro (ex: #5)…"
              />
            </div>
          )}
          {formError && (
            <div style={{ padding: "8px 10px", background: BRB, border: `1px solid ${REDBRD}`, borderRadius: 6, fontSize: 12, color: BR, marginBottom: 10 }}>
              {formError}
            </div>
          )}
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button
              onClick={resetForm}
              style={{ padding: "7px 14px", border: `1px solid ${SBB}`, borderRadius: 7, background: WH, fontSize: 12, color: TX2, cursor: "pointer", fontFamily: "inherit" }}
            >
              Annuler
            </button>
            <button
              onClick={handleSubmit}
              style={{ padding: "7px 14px", border: "none", borderRadius: 7, background: AC, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
            >
              {editingId ? "Enregistrer" : "Ajouter"}
            </button>
          </div>
        </div>
      )}

      {/* Liste sessions */}
      {sessions.length === 0 ? (
        <div style={{ padding: "32px 0", textAlign: "center", color: TX3, fontSize: 13 }}>
          Aucune session enregistrée pour le moment.<br />
          <span style={{ fontSize: 11 }}>Démarrez le suivi depuis l'aperçu projet, ou ajoutez du temps manuellement.</span>
        </div>
      ) : showByUser ? (
        // Vue admin org — breakdown par membre
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {userGroups.map((g, i) => (
            <div key={g.userId || g.userName || i} style={{ background: SB, border: `1px solid ${SBB}`, borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: ACL, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: AC }}>
                  {(g.userName || "?").split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: TX }}>{g.userName || "Membre inconnu"}</div>
                  <div style={{ fontSize: 11, color: TX3 }}>{g.sessions.length} session{g.sessions.length > 1 ? "s" : ""}</div>
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: AC, fontVariantNumeric: "tabular-nums" }}>
                  {formatDuration(g.totalSeconds)}
                </div>
              </div>
              {/* Mini-list des sessions du membre */}
              <div style={{ paddingLeft: 42, display: "flex", flexDirection: "column", gap: 4 }}>
                {g.sessions.slice().sort((a, b) => (b.startedAt || "").localeCompare(a.startedAt || "")).slice(0, 5).map(s => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: TX3 }}>
                    <span style={{ minWidth: 70 }}>{dayLabel(s.startedAt)}</span>
                    <span style={{ fontWeight: 600, color: TX2, fontVariantNumeric: "tabular-nums", minWidth: 60 }}>{formatDuration(s.durationSeconds)}</span>
                    <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {s.note || <span style={{ fontStyle: "italic" }}>Sans note</span>}
                    </span>
                  </div>
                ))}
                {g.sessions.length > 5 && (
                  <span style={{ fontSize: 10, color: TX3, fontStyle: "italic" }}>+ {g.sessions.length - 5} autres sessions</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Vue flat — sessions chronologiques
        <div style={{ display: "flex", flexDirection: "column" }}>
          {sessions.map((s, i) => {
            const isMine = !s.userId || s.userId === currentUser?.id || (!s.userId && s.userName === currentUser?.name);
            return (
              <div key={s.id} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 0",
                borderTop: i > 0 ? `1px solid ${SB2}` : "none",
              }}>
                <div style={{ minWidth: 90, fontSize: 11, color: TX3, fontWeight: 600 }}>
                  {dayLabel(s.startedAt)}
                </div>
                <div style={{ minWidth: 110, display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: TX, fontVariantNumeric: "tabular-nums" }}>
                    {formatDuration(s.durationSeconds)}
                  </span>
                  {s.isManual && (
                    <span title="Saisie manuelle" style={{ fontSize: 9, fontWeight: 600, color: TX3, background: SB2, padding: "1px 6px", borderRadius: 3 }}>M</span>
                  )}
                </div>
                <div style={{ flex: 1, fontSize: 12, color: TX2, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {s.note || <span style={{ color: TX3, fontStyle: "italic" }}>Sans note</span>}
                  {/* Référence tâche liée — chip discrète, lookup dans la liste actuelle */}
                  {s.taskId && (() => {
                    const t = projectTasks.find(t => t.id === s.taskId);
                    if (!t) return null;
                    return (
                      <span title={t.title} style={{ fontSize: 9, fontWeight: 700, color: AC, background: ACL, padding: "1px 6px", borderRadius: 8, marginLeft: 6, fontFamily: "ui-monospace, monospace" }}>
                        #{t.number}
                      </span>
                    );
                  })()}
                  {isOrgAdmin && s.userName && !isMine && (
                    <span style={{ fontSize: 10, color: TX3, marginLeft: 6 }}>· {s.userName}</span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: TX3, whiteSpace: "nowrap" }}>
                  {timeLabel(s.startedAt)}–{timeLabel(s.endedAt)}
                </div>
                {isMine ? (
                  <>
                    <button onClick={() => startEdit(s)} aria-label="Modifier" title="Modifier"
                      style={{ width: 28, height: 28, border: "none", borderRadius: 6, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Ico name="edit" size={12} color={TX3} />
                    </button>
                    <button onClick={() => { if (confirm("Supprimer cette session ?")) onDelete(s.id); }} aria-label="Supprimer" title="Supprimer"
                      style={{ width: 28, height: 28, border: "none", borderRadius: 6, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Ico name="trash" size={12} color={TX3} />
                    </button>
                  </>
                ) : (
                  <span title="Session d'un autre membre" style={{ width: 56, fontSize: 9, color: TX3, textAlign: "center", fontStyle: "italic" }}>
                    lecture seule
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
