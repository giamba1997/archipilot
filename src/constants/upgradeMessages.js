// Per-feature upgrade copy — mirrors _shared/auth.ts FEATURE_UPGRADE_MESSAGES
// so the UI can trigger the UpgradeRequiredModal for frontend-only gates
// (project count, view entry, etc.) without calling the backend first.

export const UPGRADE_MESSAGES = {
  maxProjects:    "Le plan Free est limité à 1 projet. Les plans Pro et Team vous permettent de gérer une infinité de projets.",
  maxPvPerMonth:  "Le plan Free est limité à 3 PV par mois. Passez à Pro pour générer autant de PV que vous le souhaitez.",
  maxAiPerMonth:  "Le plan Free est limité à 3 générations IA par mois. Passez à Pro pour une IA illimitée.",
  maxCollabPerProj:"Inviter des collaborateurs est réservé aux plans Pro et Team (3 collaborateurs/projet sur Pro, illimité sur Team).",
  sendEmail:      "L'envoi de PV par email est réservé aux plans Pro et Team.",
  gallery:        "La galerie photos est réservée aux plans Pro et Team. Centralisez toutes les photos de chantier, annotées.",
  planning:       "Le planning de chantier est réservé aux plans Pro et Team. Visualisez l'avancement par poste et par lot.",
  lots:           "La gestion des lots est réservée aux plans Pro et Team. Regroupez les postes par corps de métier.",
  checklists:     "Les checklists sont réservées aux plans Pro et Team. Standardisez vos contrôles de chantier.",
  opr:            "La Levée de réserves (OPR) est réservée aux plans Pro et Team. Gérez les opérations préalables à réception.",
  pdfNoWatermark: "Les PDF sans watermark sont réservés aux plans Pro et Team. Donnez un rendu 100% professionnel à vos documents.",
  roles:          "La gestion des rôles est réservée au plan Team.",
  dashboardFull:  "Le dashboard complet est réservé aux plans Pro et Team.",
  planningCross:  "Le planning cross-projets est réservé au plan Team.",
  exportCsv:      "L'export CSV est réservé au plan Team.",
  pdfCustomLogo:  "Le logo personnalisé sur PDF est réservé au plan Team.",
};

/** Minimum plan required to unlock each feature — drives the modal's plan card. */
export const FEATURE_MIN_PLAN = {
  maxProjects: "pro", maxPvPerMonth: "pro", maxAiPerMonth: "pro",
  maxCollabPerProj: "pro", sendEmail: "pro", gallery: "pro",
  planning: "pro", lots: "pro", checklists: "pro", opr: "pro",
  pdfNoWatermark: "pro", dashboardFull: "pro",
  roles: "team", planningCross: "team", exportCsv: "team", pdfCustomLogo: "team",
};
