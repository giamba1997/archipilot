// Tâches du chantier — modèle unifié.
//
// Une tâche est l'unité de travail concrète : titre, échéance, priorité,
// statut, assigné. Elle peut vivre dans un lot (steps de Gantt) ou en
// transverse (suivi PV, vérif libre…). Origine traçable :
//   - "manual"        → créée à la main
//   - "pv"            → acceptée depuis une suggestion IA d'un PV
//   - "ai_suggested"  → encore au stade suggestion (visible dans la modal de revue)
//
// Le statut suit un workflow strict (Créée → Ouverte → En progrès → En
// attente de validation → Clôturée) avec backflow possible depuis « En
// attente de validation » vers « En progrès » en cas de rejet.

import {
  TX3, SB, SBB, ST, STB, AC, ACL, ACL2, VI, VIB, SG, SGB,
  AM, AMB, BR, BRB,
} from "../constants/tokens";

// ── Statuts ─────────────────────────────────────────────────
export const TASK_STATUSES = [
  { id: "created",            label: "Créée",                  color: TX3,  bg: SB,   border: SBB,   dot: TX3 },
  { id: "open",               label: "Ouverte",                color: ST,   bg: STB,  border: STB,   dot: ST  },
  { id: "in_progress",        label: "En progrès",             color: AC,   bg: ACL,  border: ACL2,  dot: AC  },
  { id: "pending_validation", label: "En attente de validation", color: VI, bg: VIB,  border: VIB,   dot: VI  },
  { id: "closed",             label: "Clôturée",               color: SG,   bg: SGB,  border: SGB,   dot: SG  },
];

export const getTaskStatus = (id) =>
  TASK_STATUSES.find(s => s.id === id) || TASK_STATUSES[0];

// Workflow normal — le bouton « Avancer » suit cet ordre.
const STATUS_ORDER = ["created", "open", "in_progress", "pending_validation", "closed"];

export const nextTaskStatus = (currentId) => {
  const i = STATUS_ORDER.indexOf(currentId);
  if (i < 0 || i >= STATUS_ORDER.length - 1) return currentId;
  return STATUS_ORDER[i + 1];
};

// Backflow autorisé depuis "En attente de validation" → "En progrès" (rejet).
export const canRejectValidation = (currentId) => currentId === "pending_validation";

export const isClosed = (currentId) => currentId === "closed";

// ── Priorités ───────────────────────────────────────────────
export const TASK_PRIORITIES = [
  { id: "low",    label: "Basse",   color: TX3, bg: SB,  rank: 0 },
  { id: "medium", label: "Moyenne", color: ST,  bg: STB, rank: 1 },
  { id: "high",   label: "Haute",   color: AM,  bg: AMB, rank: 2 },
  { id: "urgent", label: "Urgente", color: BR,  bg: BRB, rank: 3 },
];

export const getTaskPriority = (id) =>
  TASK_PRIORITIES.find(p => p.id === id) || TASK_PRIORITIES[1];

// ── Origines ────────────────────────────────────────────────
export const TASK_ORIGINS = {
  manual:        { label: "Manuelle" },
  pv:            { label: "Issue d'un PV" },
  ai_suggested:  { label: "Suggérée par l'IA" },
};

// ── Création d'une nouvelle tâche ───────────────────────────
// Retourne un objet avec des défauts sains. Le caller peut surcharger
// n'importe quel champ. Ne touche pas à la persistence — c'est le caller
// qui setProjects(...) avec le résultat.
//
// `number` (entier 1+) est laissé à null à la création — il est attribué
// au moment de l'insertion dans le projet via nextTaskNumber(). Cela
// garantit l'atomicité de la numérotation côté caller (PlanningView/App).
export const newTask = (overrides = {}) => ({
  id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  number: null,           // entier — assigné par nextTaskNumber au save
  title: "",
  description: "",
  status: "created",
  priority: "medium",
  dueDate: "",            // ISO date (yyyy-mm-dd) ou ""
  assigneeName: "",       // libre OU choisi parmi project.participants[].name
  lotId: "",              // optionnel
  postId: "",             // optionnel
  parentId: "",           // optionnel — pointe vers une autre tâche du projet
  origin: "manual",
  pvNumber: null,         // si origin = "pv"
  attachments: [],        // [{ kind: "file" | "doc_link", ... }]
  comments: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  createdBy: "",          // user.id ou nom — rempli par le caller
  closedAt: null,
  ...overrides,
});

// Numéro entier auto-incrémenté pour la prochaine tâche du projet.
// Démarre à 1, ne réutilise jamais un numéro supprimé (cohérence des refs
// pointant vers une tâche depuis le suivi du temps, les commentaires, etc.).
export const nextTaskNumber = (project) => {
  const max = (project?.tasks || []).reduce((m, t) => {
    const n = Number(t.number);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return max + 1;
};

// Tâches enfants directes d'un parent donné.
export const getChildTasks = (tasks = [], parentId) =>
  tasks.filter(t => t.parentId === parentId);

// Liste des ids descendants (enfants + petits-enfants...) — utile pour
// empêcher un cycle quand on choisit un parent dans la modal d'édition.
export const getDescendantIds = (tasks = [], taskId) => {
  const result = new Set();
  const queue = [taskId];
  while (queue.length) {
    const current = queue.shift();
    for (const t of tasks) {
      if (t.parentId === current && !result.has(t.id)) {
        result.add(t.id);
        queue.push(t.id);
      }
    }
  }
  return result;
};

// Candidats valides comme parent d'une tâche : toutes les tâches du projet,
// sauf la tâche elle-même et ses descendants (sinon = cycle).
export const validParentCandidates = (tasks = [], taskId) => {
  if (!taskId) return tasks; // nouvelle tâche → toutes valides
  const blocked = getDescendantIds(tasks, taskId);
  return tasks.filter(t => t.id !== taskId && !blocked.has(t.id));
};

// ── Validation ──────────────────────────────────────────────
export const isTaskValid = (task) => !!(task && task.title && task.title.trim().length >= 3);

// ── Filtres / vue ───────────────────────────────────────────
// "Travail en cours" = tout sauf les statuts terminaux (clôturée).
export const isOpenStatus = (id) => id !== "closed";

// "En retard" = échéance dans le passé ET pas clôturée.
export const isOverdue = (task) => {
  if (!task?.dueDate || isClosed(task.status)) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(task.dueDate); due.setHours(0, 0, 0, 0);
  return due < today;
};

// Tri "à faire en premier" : urgentes d'abord, puis échéances proches,
// puis ordre de création.
export const sortTasks = (tasks) => {
  return [...tasks].sort((a, b) => {
    const ra = getTaskPriority(a.priority).rank;
    const rb = getTaskPriority(b.priority).rank;
    if (ra !== rb) return rb - ra; // urgent -> low
    const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    if (da !== db) return da - db;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
};

// Compteurs pour les cards résumé / banners.
export const countTasks = (tasks = []) => {
  let total = 0, open = 0, inProgress = 0, pendingValidation = 0,
      closed = 0, urgent = 0, overdue = 0;
  for (const t of tasks) {
    total++;
    if (t.status === "closed") { closed++; continue; }
    if (t.status === "open") open++;
    else if (t.status === "in_progress") inProgress++;
    else if (t.status === "pending_validation") pendingValidation++;
    if (t.priority === "urgent" && t.status !== "closed") urgent++;
    if (isOverdue(t)) overdue++;
  }
  // "Actif" = tout ce qui n'est ni "Créée" (brouillon), ni "Clôturée".
  const active = open + inProgress + pendingValidation;
  return { total, active, open, inProgress, pendingValidation, closed, urgent, overdue };
};

// ── Mutations utilitaires ───────────────────────────────────
export const updateTask = (project, taskId, patch) => ({
  ...project,
  tasks: (project.tasks || []).map(t =>
    t.id === taskId ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t
  ),
});

export const addTask = (project, task) => ({
  ...project,
  tasks: [...(project.tasks || []), task],
});

export const removeTask = (project, taskId) => ({
  ...project,
  tasks: (project.tasks || []).filter(t => t.id !== taskId),
});

export const advanceTaskStatus = (project, taskId) => {
  const tasks = project.tasks || [];
  const task = tasks.find(t => t.id === taskId);
  if (!task) return project;
  const next = nextTaskStatus(task.status);
  if (next === task.status) return project;
  const closedAt = next === "closed" ? new Date().toISOString() : task.closedAt;
  return updateTask(project, taskId, { status: next, closedAt });
};

// Ajout d'un commentaire à une tâche
export const addTaskComment = (project, taskId, { author, text }) => {
  const comment = {
    id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    author: author || "—",
    text: String(text || "").slice(0, 2000),
    createdAt: new Date().toISOString(),
  };
  return updateTask(project, taskId, {
    comments: [...((project.tasks || []).find(t => t.id === taskId)?.comments || []), comment],
  });
};
