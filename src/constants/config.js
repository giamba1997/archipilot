import { BL, BLB, VI, VIB, GR, GRBG } from "./tokens";

// ── Limites d'upload côté client ────────────────────────────
// Bornes dures pour éviter crash navigateur + saturation localStorage/
// row Supabase JSONB (~1MB pratique). Au-delà, message d'erreur clair.
export const MAX_UPLOAD_PHOTO_BYTES = 5 * 1024 * 1024;  // 5 MB par photo
export const MAX_UPLOAD_PDF_BYTES   = 10 * 1024 * 1024; // 10 MB par PDF
export const MAX_UPLOAD_DOC_BYTES   = 12 * 1024 * 1024; // 12 MB cahier des charges (existant)

export const STRUCTURE_TYPES = [
  { id: "architecte", label: "Architecte" },
  { id: "bureau_etudes", label: "Bureau d'études" },
  { id: "promoteur", label: "Promoteur immobilier" },
  { id: "entreprise_construction", label: "Entreprise de construction" },
  { id: "autre", label: "Autre" },
];

// ── Plans & Feature Gates ──────────────────────────────────
// Team includes 3 seats; extra seats billed at +9.99 €/mo each.
export const PLANS = {
  free: { id: "free", label: "Free", price: 0, priceYear: 0 },
  pro:  { id: "pro",  label: "Pro",  price: 39, priceYear: 390 },
  team: { id: "team", label: "Team", price: 89, priceYear: 890, seatsIncluded: 3, extraSeatPrice: 9.99 },
};
export const PLAN_FEATURES = {
  maxProjects:      { free: 1,     pro: Infinity, team: Infinity },
  maxPvPerMonth:    { free: 3,     pro: Infinity, team: Infinity },
  maxAiPerMonth:    { free: 3,     pro: Infinity, team: Infinity },
  maxCollabPerProj: { free: 0,     pro: 3,        team: Infinity },
  sendEmail:        { free: false, pro: true,     team: true },
  gallery:          { free: false, pro: true,     team: true },
  planning:         { free: false, pro: true,     team: true },
  lots:             { free: false, pro: true,     team: true },
  checklists:       { free: false, pro: true,     team: true },
  roles:            { free: false, pro: false,    team: true },
  dashboardFull:    { free: false, pro: true,     team: true },
  planningCross:    { free: false, pro: false,    team: true },
  exportCsv:        { free: false, pro: false,    team: true },
  pdfNoWatermark:   { free: false, pro: true,     team: true },
  pdfCustomLogo:    { free: false, pro: true,     team: true },
  opr:              { free: false, pro: true,     team: true },
};
export const hasFeature = (plan, feature) => {
  const p = plan || "free";
  const f = PLAN_FEATURES[feature];
  if (!f) return true;
  return f[p] !== undefined ? f[p] : f.free;
};
export const getLimit = (plan, feature) => {
  const p = plan || "free";
  const f = PLAN_FEATURES[feature];
  if (!f) return Infinity;
  return f[p] !== undefined ? f[p] : f.free;
};

export const INIT_PROFILE = {
  name: "Gaëlle CNOP",
  structure: "DEWIL architecten",
  structureType: "architecte",
  address: "",
  phone: "0474 50 85 80",
  email: "gaelle@dewil-architect.be",
  picture: null,
  pdfColor: "#C95A1B",
  pdfFont: "helvetica",
  // apiKey retiré : l'IA passe désormais par les edge functions Supabase
  // (OPENAI_API_KEY côté serveur). Champ BYO-key obsolète.
  lang: "fr",
  plan: "free",
  postTemplate: "general",
  pvTemplate: "standard",
  remarkNumbering: "none",
  emailSignature: "",
  // F1 — émetteur de factures
  iban: "",
  vatNumber: "",
  invoicePaymentTermsDays: 30,
  invoicePaymentNote: "",
  // F5 — préférences d'alertes
  alertSettings: {
    reception_definitive: true,
    reserve_overdue:      true,
    permit_deadline:      true,
    task_overdue:         true,
    invoice_overdue:      true,
    no_pv_30d:            false,
    email_digest:         false,
  },
};

export const COLOR_PRESETS = [
  { value: "#C95A1B", label: "Terracotta" },
  { value: "#3B82F6", label: "Bleu" },
  { value: "#16A34A", label: "Vert" },
  { value: "#7C3AED", label: "Violet" },
  { value: "#DC2626", label: "Rouge" },
  { value: "#1F2937", label: "Anthracite" },
];

export const FONT_OPTIONS = [
  { id: "helvetica", label: "Helvetica", desc: "Sans-sérif, moderne" },
  { id: "times",     label: "Times",     desc: "Sérif, classique" },
];

export const DOC_CATEGORIES = [
  { id: "plans",  label: "Plans",           color: BL,  bg: BLB  },
  { id: "admin",  label: "Administratif",   color: VI,  bg: VIB  },
  { id: "photos", label: "Photos chantier", color: GR,  bg: GRBG },
];
