import { useEffect, useMemo, useRef, useState } from "react";
import { DatePicker } from "../DatePicker";
import {
  AC, ACL, ACL2, BL, BLB, SB, SB2, SBB, TX, TX2, TX3, WH, BR, RD, GR, SP, FS, RAD, DIS, DIST,
} from "../../constants/tokens";
import { Modal, Field, Ico } from "../ui";
import {
  TASK_STATUSES, TASK_PRIORITIES, getTaskStatus, getTaskPriority,
  newTask, isTaskValid, validParentCandidates,
} from "../../utils/tasks";

// Modal de création / édition d'une tâche du chantier.
//
// Props :
//   - open / onClose
//   - project       : le projet courant (pour les listes de lots / postes / participants)
//   - existingTask  : optionnel, si édition. Sinon on part d'un newTask().
//   - profile       : pour author des commentaires
//   - onSave(task)  : appelé avec la tâche complète (à insérer ou remplacer côté caller)
//   - onDelete(id)  : optionnel, affiche le bouton suppression si fourni
//
// Le modal est entièrement contrôlé en local — il ne mute le projet qu'au save.

const FILE_MAX_BYTES = 5 * 1024 * 1024; // 5 Mo par fichier joint à une tâche

export function TaskEditModal({ open, onClose, project, existingTask, defaults, profile, onSave, onDelete }) {
  const isEdit = !!existingTask;
  const buildInitial = () => existingTask
    ? { ...existingTask }
    : newTask({ createdBy: profile?.name || "", ...(defaults || {}) });
  const [task, setTask] = useState(buildInitial);
  const [newComment, setNewComment] = useState("");
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const fileRef = useRef(null);

  // Re-init quand on ouvre la modal sur une nouvelle tâche
  useEffect(() => {
    if (!open) return;
    setTask(buildInitial());
    setNewComment("");
    setLinkPickerOpen(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existingTask?.id, defaults?.parentId, defaults?.lotId]);

  const lots = project?.lots || [];
  const posts = project?.posts || [];
  const participants = project?.participants || [];
  const planFiles = (project?.planFiles || []).filter(f => f.type !== "folder");
  // Candidats valides comme parent — toutes les tâches sauf self et descendants
  // pour éviter les cycles dans l'arbre. En création, taskId est null donc on
  // a toutes les tâches du projet (sauf qu'il n'y en a pas encore avec ce id).
  const parentCandidates = validParentCandidates(project?.tasks || [], task.id)
    .filter(t => t.id !== task.id); // sécurité pour la création (id existe déjà sur le draft)

  const valid = isTaskValid(task);
  const status = getTaskStatus(task.status);
  const priority = getTaskPriority(task.priority);

  // ── Attachments ──
  const handleFilePick = () => fileRef.current?.click();
  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > FILE_MAX_BYTES) {
      alert(`Fichier trop lourd (${Math.round(file.size / 1024 / 1024)} Mo). Limite : 5 Mo.`);
      return;
    }
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    const att = {
      kind: "file",
      id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      dataUrl,
    };
    setTask(t => ({ ...t, attachments: [...(t.attachments || []), att] }));
  };
  const handleLinkDoc = (planFile) => {
    const att = {
      kind: "doc_link",
      id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      planFileId: planFile.id,
      name: planFile.name,
    };
    setTask(t => ({ ...t, attachments: [...(t.attachments || []), att] }));
    setLinkPickerOpen(false);
  };
  const removeAttachment = (id) => {
    setTask(t => ({ ...t, attachments: (t.attachments || []).filter(a => a.id !== id) }));
  };

  // ── Commentaires ──
  const addComment = () => {
    const text = newComment.trim();
    if (!text) return;
    const comment = {
      id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      author: profile?.name || "—",
      text,
      createdAt: new Date().toISOString(),
    };
    setTask(t => ({ ...t, comments: [...(t.comments || []), comment] }));
    setNewComment("");
  };

  const handleSave = () => {
    if (!valid) return;
    onSave({ ...task, updatedAt: new Date().toISOString() });
    onClose();
  };

  const handleDelete = () => {
    if (!isEdit || !onDelete) return;
    if (!window.confirm("Supprimer cette tâche ? Cette action est irréversible.")) return;
    onDelete(task.id);
    onClose();
  };

  // Titre de la modal — préfixé par le numéro de la tâche en édition pour
  // que l'utilisateur sache rapidement laquelle il modifie. En création, le
  // numéro sera attribué au save (donc on n'a rien à afficher).
  const modalTitle = isEdit && task.number
    ? `Modifier la tâche #${task.number}`
    : isEdit ? "Modifier la tâche" : "Nouvelle tâche";

  return (
    <Modal open={open} onClose={onClose} title={modalTitle} wide>
      {/* Titre + description */}
      <Field
        label="Titre *"
        value={task.title}
        onChange={(v) => setTask(t => ({ ...t, title: v }))}
        placeholder="ex: Vérifier les resserrages coupe-feu RDC"
      />
      <Field
        label="Description (optionnel)"
        value={task.description}
        onChange={(v) => setTask(t => ({ ...t, description: v }))}
        placeholder="Contexte, références, étapes…"
        area
      />

      {/* Statut + priorité */}
      <div style={{ display: "flex", gap: 10 }}>
        <Field
          half
          label="Statut"
          value={task.status}
          onChange={(v) => setTask(t => ({ ...t, status: v, closedAt: v === "closed" ? new Date().toISOString() : null }))}
          select
          options={TASK_STATUSES}
        />
        <Field
          half
          label="Priorité"
          value={task.priority}
          onChange={(v) => setTask(t => ({ ...t, priority: v }))}
          select
          options={TASK_PRIORITIES}
        />
      </div>

      {/* Échéance + assigné */}
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: "block", fontSize: FS.xs, fontWeight: 600, color: TX2, marginBottom: 5 }}>Échéance</label>
          <DatePicker variant="field" value={task.dueDate || ""} onChange={(v) => setTask(t => ({ ...t, dueDate: v }))} placeholder="jj/mm/aaaa" />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: "block", fontSize: FS.xs, fontWeight: 600, color: TX2, marginBottom: 5 }}>Assigné à</label>
          <input
            list="task-assignees"
            value={task.assigneeName}
            onChange={(e) => setTask(t => ({ ...t, assigneeName: e.target.value }))}
            placeholder="Nom (libre ou choix dans la liste)"
            style={{ width: "100%", padding: "10px 12px", border: `1px solid ${SBB}`, borderRadius: RAD.md, fontSize: FS.base, fontFamily: "inherit", background: WH, color: TX, boxSizing: "border-box" }}
          />
          <datalist id="task-assignees">
            {participants.map((p, i) => <option key={i} value={p.name}>{p.role}</option>)}
          </datalist>
        </div>
      </div>

      {/* Lot + poste */}
      <div style={{ display: "flex", gap: 10, marginBottom: SP.sm }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: "block", fontSize: FS.xs, fontWeight: 600, color: TX2, marginBottom: 5 }}>Lot (optionnel)</label>
          <select
            value={task.lotId || ""}
            onChange={(e) => setTask(t => ({ ...t, lotId: e.target.value }))}
            style={{ width: "100%", padding: "10px 12px", border: `1px solid ${SBB}`, borderRadius: RAD.md, fontSize: FS.base, fontFamily: "inherit", background: WH, color: TX, boxSizing: "border-box" }}
          >
            <option value="">— Aucun (transverse) —</option>
            {lots.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: "block", fontSize: FS.xs, fontWeight: 600, color: TX2, marginBottom: 5 }}>Poste (optionnel)</label>
          <select
            value={task.postId || ""}
            onChange={(e) => setTask(t => ({ ...t, postId: e.target.value }))}
            style={{ width: "100%", padding: "10px 12px", border: `1px solid ${SBB}`, borderRadius: RAD.md, fontSize: FS.base, fontFamily: "inherit", background: WH, color: TX, boxSizing: "border-box" }}
          >
            <option value="">— Aucun —</option>
            {posts.map(p => <option key={p.id} value={p.id}>{p.id} {p.label}</option>)}
          </select>
        </div>
      </div>

      {/* Tâche parent — pour grouper plusieurs tâches sous une tâche pivot.
          Les descendants sont exclus du dropdown pour éviter les cycles. */}
      <div style={{ marginBottom: SP.md }}>
        <label style={{ display: "block", fontSize: FS.xs, fontWeight: 600, color: TX2, marginBottom: 5 }}>
          Tâche parent (optionnel) <span style={{ fontWeight: 500, color: TX3 }}>— pour rattacher cette tâche à une tâche pivot</span>
        </label>
        <select
          value={task.parentId || ""}
          onChange={(e) => setTask(t => ({ ...t, parentId: e.target.value }))}
          style={{ width: "100%", padding: "10px 12px", border: `1px solid ${SBB}`, borderRadius: RAD.md, fontSize: FS.base, fontFamily: "inherit", background: WH, color: TX, boxSizing: "border-box" }}
        >
          <option value="">— Aucun (tâche autonome) —</option>
          {parentCandidates.map(t => (
            <option key={t.id} value={t.id}>
              {t.number ? `#${t.number} — ` : ""}{t.title || "(sans titre)"}
            </option>
          ))}
        </select>
      </div>

      {/* Pièces jointes */}
      <div style={{ marginBottom: SP.md }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: FS.xs, fontWeight: 600, color: TX2 }}>Pièces jointes</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={handleFilePick} style={btnLightStyle}>
              <Ico name="upload" size={11} color={AC} /> Fichier
            </button>
            {planFiles.length > 0 && (
              <button type="button" onClick={() => setLinkPickerOpen(o => !o)} style={btnLightStyle}>
                <Ico name="folder" size={11} color={AC} /> Document du projet
              </button>
            )}
          </div>
        </div>
        <input ref={fileRef} type="file" onChange={handleFile} style={{ display: "none" }} />

        {/* Picker des documents existants */}
        {linkPickerOpen && (
          <div style={{ border: `1px solid ${SBB}`, borderRadius: RAD.md, background: SB, padding: 6, marginBottom: 8, maxHeight: 180, overflowY: "auto" }}>
            {planFiles.length === 0 ? (
              <div style={{ fontSize: FS.xs, color: TX3, padding: 8 }}>Aucun document dans le projet — uploade-en depuis Documents.</div>
            ) : planFiles.map(f => (
              <button key={f.id} type="button" onClick={() => handleLinkDoc(f)}
                style={{ width: "100%", textAlign: "left", padding: "6px 10px", border: "none", background: "transparent", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8 }}
                onMouseEnter={e => e.currentTarget.style.background = SB2}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <Ico name="file" size={11} color={TX3} />
                <span style={{ fontSize: FS.sm, color: TX, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{f.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Liste des attachments */}
        {(task.attachments || []).length === 0 ? (
          <div style={{ fontSize: FS.xs, color: TX3, fontStyle: "italic" }}>Aucune pièce jointe.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {task.attachments.map(a => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: SB, border: `1px solid ${SBB}`, borderRadius: RAD.sm }}>
                <Ico name={a.kind === "doc_link" ? "folder" : "file"} size={11} color={TX3} />
                <span style={{ fontSize: FS.sm, color: TX, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                  {a.name}
                  {a.kind === "doc_link" && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: BL, background: BLB, padding: "1px 5px", borderRadius: 8 }}>LIEN</span>}
                </span>
                <button type="button" onClick={() => removeAttachment(a.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                  <Ico name="x" size={11} color={TX3} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Commentaires */}
      <div style={{ marginBottom: SP.md, paddingTop: SP.md, borderTop: `1px solid ${SBB}` }}>
        <span style={{ fontSize: FS.xs, fontWeight: 600, color: TX2, display: "block", marginBottom: 6 }}>
          Commentaires {task.comments?.length ? `(${task.comments.length})` : ""}
        </span>
        {(task.comments || []).map(c => (
          <div key={c.id} style={{ background: SB, borderRadius: RAD.sm, padding: "8px 10px", marginBottom: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ fontSize: FS.xs, fontWeight: 700, color: TX }}>{c.author}</span>
              <span style={{ fontSize: 10, color: TX3 }}>{new Date(c.createdAt).toLocaleString("fr-BE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <div style={{ fontSize: FS.sm, color: TX2, lineHeight: 1.4, whiteSpace: "pre-wrap" }}>{c.text}</div>
          </div>
        ))}
        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addComment(); } }}
            placeholder="Ajouter un commentaire…"
            style={{ flex: 1, padding: "8px 10px", border: `1px solid ${SBB}`, borderRadius: RAD.sm, fontSize: FS.sm, fontFamily: "inherit", background: WH, color: TX }}
          />
          <button type="button" onClick={addComment} disabled={!newComment.trim()}
            style={{ padding: "8px 14px", border: "none", borderRadius: RAD.sm, background: newComment.trim() ? AC : DIS, color: newComment.trim() ? WH : DIST, fontSize: FS.sm, fontWeight: 600, cursor: newComment.trim() ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
            Ajouter
          </button>
        </div>
      </div>

      {/* Footer actions */}
      <div style={{ display: "flex", gap: SP.sm, alignItems: "center", paddingTop: SP.md, borderTop: `1px solid ${SBB}` }}>
        {/* Aperçu rapide statut/priorité */}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: status.color, background: status.bg, padding: "3px 9px", borderRadius: 14 }}>{status.label}</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: priority.color, background: priority.bg, padding: "3px 9px", borderRadius: 14 }}>{priority.label}</span>
        </div>
        <div style={{ flex: 1 }} />
        {isEdit && onDelete && (
          <button type="button" onClick={handleDelete} style={{ padding: "9px 14px", border: `1px solid ${RD}`, borderRadius: RAD.md, background: WH, color: RD, fontSize: FS.sm, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Ico name="trash" size={11} color={RD} /> Supprimer
          </button>
        )}
        <button type="button" onClick={onClose} style={{ padding: "9px 14px", border: `1px solid ${SBB}`, borderRadius: RAD.md, background: WH, color: TX2, fontSize: FS.sm, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Annuler</button>
        <button type="button" onClick={handleSave} disabled={!valid}
          style={{ padding: "9px 18px", border: "none", borderRadius: RAD.md, background: valid ? AC : DIS, color: valid ? WH : DIST, fontSize: FS.sm, fontWeight: 700, cursor: valid ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
          {isEdit ? "Enregistrer" : "Créer la tâche"}
        </button>
      </div>
    </Modal>
  );
}

const btnLightStyle = {
  padding: "5px 10px", border: `1px solid ${ACL2}`, borderRadius: 6, background: WH,
  color: AC, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
  display: "inline-flex", alignItems: "center", gap: 4,
};
