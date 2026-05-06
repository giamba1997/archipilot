import {
  AC, ACL, BL, BLB, VI, VIB, TE, TEB, PU, PUB, RD,
  E_LIN_BG, E_PRELIM_BG, E_PERMIT_BG, E_PEACH_BG, E_BOIS_BG, E_GRAPHITE_BG,
  E_TX_TAUPE, E_TX_TAUPE2, E_TX_BOIS, E_TX_DARK,
  SG, SGB, BR, BRB, AM, AMB, ST, STB,
} from "./tokens";

// Project lifecycle — earth family, light → accent → dark.
// Construction (active phase) is the only one that gets the terracotta accent.
// `step` = position in the 7-phase journey (used by ProjectProgressDots in
// the sidebar so users can scan progress without reading the label).
export const STATUSES = [
  { id: "sketch",       label: "Esquisse",      color: E_TX_TAUPE,  bg: E_LIN_BG,      step: 1 },
  { id: "preliminary",  label: "Avant-projet",  color: E_TX_TAUPE,  bg: E_PRELIM_BG,   step: 2 },
  { id: "permit",       label: "Permis",        color: E_TX_TAUPE2, bg: E_PERMIT_BG,   step: 3 },
  { id: "execution",    label: "Exécution",     color: AC,          bg: E_PEACH_BG,    step: 4 },
  { id: "construction", label: "Chantier",      color: AC,          bg: E_PEACH_BG,    step: 5 },
  { id: "reception",    label: "Réception",     color: E_TX_BOIS,   bg: E_BOIS_BG,     step: 6 },
  { id: "closed",       label: "Clôturé",       color: E_TX_DARK,   bg: E_GRAPHITE_BG, step: 7 },
];

export const STATUS_TOTAL_STEPS = 7;

export const getStatus = (id) => STATUSES.find((s) => s.id === id) || STATUSES[0];

export const REMARK_STATUSES = [
  { id: "open",     label: "À traiter", color: BR,  bg: BRB,  dot: BR },
  { id: "progress", label: "En cours",  color: AM,  bg: AMB,  dot: AM },
  { id: "done",     label: "Résolu",    color: SG,  bg: SGB,  dot: SG },
];
export const nextStatus = (s) => s === "open" ? "progress" : s === "progress" ? "done" : "open";
export const getRemarkStatus = (id) => REMARK_STATUSES.find((s) => s.id === id) || REMARK_STATUSES[0];

export const PV_STATUSES = [
  { id: "draft",     label: "Brouillon", color: E_TX_DARK, bg: E_GRAPHITE_BG, dot: E_TX_DARK },
  { id: "review",    label: "À relire",  color: AM,        bg: AMB,           dot: AM        },
  { id: "validated", label: "Validé",    color: SG,        bg: SGB,           dot: SG        },
  { id: "sent",      label: "Envoyé",    color: ST,        bg: STB,           dot: ST        },
  { id: "late",      label: "En retard", color: BR,        bg: BRB,           dot: BR        },
];
export const getPvStatus  = (id) => PV_STATUSES.find((s) => s.id === id) || PV_STATUSES[0];
export const nextPvStatus = (id) => { const i = PV_STATUSES.findIndex(s => s.id === id); return PV_STATUSES[(i + 1) % PV_STATUSES.length].id; };

// Lot colors stay pickable (user-assigned) but use the toned-down hues from
// tokens so a planning Gantt doesn't burn the eyes.
export const LOT_COLORS = [
  { id: "amber",  value: AC,  bg: ACL  },
  { id: "blue",   value: BL,  bg: BLB  },
  { id: "green",  value: SG,  bg: SGB  },
  { id: "violet", value: VI,  bg: VIB  },
  { id: "red",    value: BR,  bg: BRB  },
  { id: "teal",   value: TE,  bg: TEB  },
];

// ── Reserve statuses (OPR) ──
export const RESERVE_STATUSES = [
  { id: "non_levee",           label: "Non levée",           color: BR, bg: BRB, dot: BR },
  { id: "partiellement_levee", label: "Partiellement levée", color: AM, bg: AMB, dot: AM },
  { id: "levee",               label: "Levée",               color: SG, bg: SGB, dot: SG },
];
export const RESERVE_SEVERITIES = [
  { id: "critical", label: "Critique",    color: BR,        bg: BRB           },
  { id: "major",    label: "Majeure",     color: AM,        bg: AMB           },
  { id: "minor",    label: "Mineure",     color: ST,        bg: STB           },
  { id: "cosmetic", label: "Esthétique",  color: E_TX_DARK, bg: E_GRAPHITE_BG },
];
export const getReserveStatus = (id) => RESERVE_STATUSES.find(s => s.id === id) || RESERVE_STATUSES[0];
export const getReserveSeverity = (id) => RESERVE_SEVERITIES.find(s => s.id === id) || RESERVE_SEVERITIES[3];
export const nextReserveStatus = (s) => s === "non_levee" ? "partiellement_levee" : s === "partiellement_levee" ? "levee" : "non_levee";

export const calcLotStatus = (lot) => {
  const now   = new Date(); now.setHours(0,0,0,0);
  const start = lot.startDate ? new Date(lot.startDate) : null;
  const end   = lot.endDate   ? new Date(lot.endDate)   : null;
  if (lot.progress >= 100) return { id: "done",    label: "Terminé",   color: SG, bg: SGB };
  if (end && now > end)    return { id: "delayed", label: "En retard", color: BR, bg: BRB };
  if (start && now >= start) return { id: "active", label: "En cours", color: AC, bg: ACL };
  return { id: "planned", label: "Planifié", color: ST, bg: STB };
};
