// Per-feature upgrade copy — mirrors _shared/auth.ts FEATURE_UPGRADE_MESSAGES
// so the UI can trigger the UpgradeRequiredModal for frontend-only gates
// (project count, view entry, etc.) without calling the backend first.

export const UPGRADE_MESSAGES = {
  maxProjects:    "Le plan Free est limité à 1 projet. Le plan Pro vous permet de gérer une infinité de projets.",
  maxPvPerMonth:  "Le plan Free est limité à 3 PV par mois. Passez à Pro pour générer autant de PV que vous le souhaitez.",
  maxAiPerMonth:  "Le plan Free est limité à 3 générations IA par mois. Passez à Pro pour une IA illimitée.",
  maxCollabPerProj:"Inviter des collaborateurs est réservé au plan Pro.",
  sendEmail:      "L'envoi de PV par email est réservé au plan Pro.",
  gallery:        "La galerie photos est réservée au plan Pro. Centralisez toutes les photos de chantier, annotées.",
  planning:       "Le planning de chantier est réservé au plan Pro. Visualisez l'avancement par poste et par lot.",
  lots:           "La gestion des lots est réservée au plan Pro. Regroupez les postes par corps de métier.",
  checklists:     "Les checklists sont réservées au plan Pro. Standardisez vos contrôles de chantier.",
  opr:            "La Levée de réserves (OPR) est réservée au plan Pro. Gérez les opérations préalables à réception.",
  pdfNoWatermark: "Les PDF sans watermark sont réservés au plan Pro. Donnez un rendu 100% professionnel à vos documents.",
  dashboardFull:  "Le dashboard complet est réservé au plan Pro.",
  pdfCustomLogo:  "Le logo personnalisé sur PDF est réservé au plan Pro.",
};

/** Minimum plan required to unlock each feature — drives the modal's plan card. */
export const FEATURE_MIN_PLAN = {
  maxProjects: "pro", maxPvPerMonth: "pro", maxAiPerMonth: "pro",
  maxCollabPerProj: "pro", sendEmail: "pro", gallery: "pro",
  planning: "pro", lots: "pro", checklists: "pro", opr: "pro",
  pdfNoWatermark: "pro", dashboardFull: "pro", pdfCustomLogo: "pro",
};

import { PLAN_FEATURES } from "./config";

/**
 * Returns the next plan that unlocks `feature` for a user currently on `currentPlan`.
 * For boolean features: the next plan where the value flips to true.
 * For numeric limits: the next plan with a strictly higher cap than currentPlan.
 * Falls back to FEATURE_MIN_PLAN or "pro" when no better tier exists.
 */
export function getRequiredPlan(feature, currentPlan) {
  const f = PLAN_FEATURES[feature];
  if (!f) return FEATURE_MIN_PLAN[feature] || "pro";
  const order = ["free", "pro"];
  const cur = order.indexOf(currentPlan || "free");
  const curVal = f[currentPlan || "free"];
  for (let i = Math.max(0, cur) + 1; i < order.length; i++) {
    const p = order[i];
    const v = f[p];
    if (typeof v === "boolean") { if (v) return p; }
    else if (typeof v === "number") { if (v > (curVal ?? 0)) return p; }
  }
  return FEATURE_MIN_PLAN[feature] || "pro";
}
