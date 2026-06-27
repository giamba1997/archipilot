// Phases du projet — modèle hybride : par défaut on utilise le cycle de vie
// canonique (STATUSES, 7 phases métier belges), mais l'utilisateur peut
// personnaliser la liste pour un projet donné.
//
// Stratégie de stockage :
//   - project.phases absent / vide → on utilise STATUSES (rétro-compat)
//   - project.phases défini       → on utilise cette liste sur-mesure
//
// La personnalisation est opt-in : l'utilisateur clique « Personnaliser »
// dans le menu Phases, on copie alors STATUSES dans project.phases pour
// qu'il puisse partir d'une base, puis éditer.

import { STATUSES } from "../constants/statuses";

// Palette pour les phases custom. Couleurs choisies dans l'esprit "matériaux
// d'architecture" déjà présentes dans tokens.js (lin/cream/blueprint/peach/
// moss/graphite). Le user choisit une couleur dans le picker, on stocke le
// (color, bg) pair pour rendu cohérent partout.
export const PHASE_COLORS = [
  { id: "lavender", label: "Lavande",   color: "#6B4F86", bg: "#EBE2F0" },
  { id: "cream",    label: "Crème",     color: "#8B7B5A", bg: "#F0E8D5" },
  { id: "blueprint",label: "Bleu",      color: "#2E5680", bg: "#D6E1EB" },
  { id: "peach",    label: "Terracotta",color: "#B85C2C", bg: "#F5DCC4" },
  { id: "moss",     label: "Mousse",    color: "#4D8030", bg: "#D8E3CC" },
  { id: "graphite", label: "Graphite",  color: "#4A4644", bg: "#D8D5CE" },
  { id: "rose",     label: "Brique",    color: "#C04525", bg: "#F8DCCF" },
  { id: "amber",    label: "Ambre",     color: "#C0791A", bg: "#F8E5BD" },
];

export const getPhaseColor = (id) =>
  PHASE_COLORS.find(c => c.id === id) || PHASE_COLORS[3]; // peach par défaut

// Renvoie la liste des phases applicables au projet — custom si définies,
// fallback STATUSES sinon. Toujours non-vide tant que STATUSES l'est.
export const getProjectPhases = (project) => {
  const custom = project?.phases;
  if (Array.isArray(custom) && custom.length > 0) return custom;
  return STATUSES;
};

// Trouve une phase par son id dans project.phases puis dans STATUSES (rétro-
// compat avec les anciens projets dont statusId pointe vers un id global).
// Renvoie toujours quelque chose : la première phase si l'id est inconnu.
export const getProjectPhase = (project, phaseId) => {
  const list = getProjectPhases(project);
  return list.find(p => p.id === phaseId)
    || STATUSES.find(p => p.id === phaseId)
    || list[0];
};

// Phase suivante dans l'ordre du projet (utilisé pour bouton "Avancer").
// Retourne la phase courante si on est déjà à la dernière.
export const nextProjectPhase = (project, currentId) => {
  const list = getProjectPhases(project);
  const i = list.findIndex(p => p.id === currentId);
  if (i < 0 || i >= list.length - 1) return list[Math.max(0, i)] || list[0];
  return list[i + 1];
};

// Construit une nouvelle phase custom — id stable, label requis, couleur par
// défaut (peach). step calculé depuis le rang dans la liste à l'insertion.
export const newPhase = ({ label = "Nouvelle phase", colorId = "peach" } = {}) => {
  const c = getPhaseColor(colorId);
  return {
    id: `ph_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    label,
    color: c.color,
    bg: c.bg,
    colorId,
    isCustom: true,
  };
};

// Première personnalisation : copie STATUSES dans une liste éditable. On
// garde les ids canoniques pour que statusId reste valide après seed.
export const seedPhasesFromDefaults = () =>
  STATUSES.map(s => ({
    id: s.id,
    label: s.label,
    color: s.color,
    bg: s.bg,
    step: s.step,
    isCustom: false, // marquage soft — origine canonique, mais éditable
  }));

// Helpers de mutation immutable
export const addProjectPhase = (project, phase) => ({
  ...project,
  phases: [...(getProjectPhases(project)), phase],
});

export const updateProjectPhase = (project, phaseId, patch) => ({
  ...project,
  phases: getProjectPhases(project).map(p => p.id === phaseId ? { ...p, ...patch } : p),
});

export const removeProjectPhase = (project, phaseId) => {
  const phases = getProjectPhases(project).filter(p => p.id !== phaseId);
  // Si on supprime la phase active, on bascule vers la première restante.
  let statusId = project.statusId;
  if (statusId === phaseId) {
    statusId = phases[0]?.id || project.statusId;
  }
  // Les lots assignés à cette phase deviennent transverses (phaseId vidé).
  const lots = (project.lots || []).map(l => l.phaseId === phaseId ? { ...l, phaseId: "" } : l);
  return { ...project, phases, statusId, lots };
};

export const moveProjectPhase = (project, phaseId, direction) => {
  const phases = [...getProjectPhases(project)];
  const i = phases.findIndex(p => p.id === phaseId);
  if (i < 0) return project;
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= phases.length) return project;
  [phases[i], phases[j]] = [phases[j], phases[i]];
  return { ...project, phases };
};
