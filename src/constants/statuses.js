import { AC, GR, GRY, GRYB, BL, BLB, OR, ORB, VI, VIB, PU, PUB, RD, REDBG, GRBG, TE, TEB, ACL } from "./tokens";

export const STATUSES = [
  { id: "sketch",       label: "Esquisse",      color: PU,  bg: PUB  },
  { id: "preliminary",  label: "Avant-projet",  color: VI,  bg: VIB  },
  { id: "permit",       label: "Permis",        color: BL,  bg: BLB  },
  { id: "execution",    label: "Exécution",     color: AC,  bg: ACL  },
  { id: "construction", label: "Chantier",      color: OR,  bg: ORB  },
  { id: "reception",    label: "Réception",     color: GR,  bg: GRBG },
  { id: "closed",       label: "Clôturé",       color: GRY, bg: GRYB },
];

export const getStatus = (id) => STATUSES.find((s) => s.id === id) || STATUSES[0];

export const REMARK_STATUSES = [
  { id: "open",     label: "À traiter", color: "#9E3A34", bg: "#FDF2F1", dot: RD },
  { id: "progress", label: "En cours",  color: "#8B6420", bg: "#FDF8EE", dot: "#E7A33C" },
  { id: "done",     label: "Résolu",    color: "#4A6B55", bg: "#EDF4EF", dot: GR },
];
export const nextStatus = (s) => s === "open" ? "progress" : s === "progress" ? "done" : "open";
export const getRemarkStatus = (id) => REMARK_STATUSES.find((s) => s.id === id) || REMARK_STATUSES[0];

export const PV_STATUSES = [
  { id: "draft",     label: "Brouillon", color: GRY,      bg: GRYB,  dot: "#A09889" },
  { id: "review",    label: "À relire",  color: "#8B6420", bg: "#FDF8EE", dot: "#E7A33C" },
  { id: "validated", label: "Validé",    color: "#4A6B55", bg: "#EDF4EF", dot: GR },
  { id: "sent",      label: "Envoyé",    color: BL,       bg: BLB,   dot: BL },
  { id: "late",      label: "En retard", color: "#9E3A34", bg: "#FDF2F1", dot: RD },
];
export const getPvStatus  = (id) => PV_STATUSES.find((s) => s.id === id) || PV_STATUSES[0];
export const nextPvStatus = (id) => { const i = PV_STATUSES.findIndex(s => s.id === id); return PV_STATUSES[(i + 1) % PV_STATUSES.length].id; };

export const LOT_COLORS = [
  { id: "amber",  value: AC,  bg: ACL  },
  { id: "blue",   value: BL,  bg: BLB  },
  { id: "green",  value: GR,  bg: GRBG },
  { id: "violet", value: VI,  bg: VIB  },
  { id: "red",    value: RD,  bg: REDBG},
  { id: "teal",   value: TE,  bg: TEB  },
];

export const calcLotStatus = (lot) => {
  const now   = new Date(); now.setHours(0,0,0,0);
  const start = lot.startDate ? new Date(lot.startDate) : null;
  const end   = lot.endDate   ? new Date(lot.endDate)   : null;
  if (lot.progress >= 100) return { id: "done",    label: "Terminé",  color: GR,  bg: GRBG  };
  if (end && now > end)    return { id: "delayed", label: "En retard", color: RD,  bg: REDBG };
  if (start && now >= start) return { id: "active", label: "En cours", color: AC,  bg: ACL   };
  return { id: "planned", label: "Planifié", color: BL, bg: BLB };
};
