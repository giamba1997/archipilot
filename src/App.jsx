import { useState, useRef, useEffect, useMemo, Component } from "react";
import { jsPDF } from "jspdf";
import { LangContext, useT, useTP } from "./i18n";
import { supabase } from "./supabase";

// ── Error Boundary ────────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error("ArchiPilot crash:", error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#FAFAF9", fontFamily: "system-ui, -apple-system, sans-serif" }}>
          <div style={{ textAlign: "center", maxWidth: 400, padding: 32 }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#C4392A" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4 M12 17h.01 M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /></svg>
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1D1D1B", marginBottom: 8 }}>Quelque chose s'est mal passé</h2>
            <p style={{ fontSize: 13, color: "#6B6B66", lineHeight: 1.6, marginBottom: 24 }}>
              Une erreur inattendue est survenue. Vos données sont en sécurité. Rechargez la page pour continuer.
            </p>
            <button onClick={() => window.location.reload()} style={{ padding: "10px 24px", border: "none", borderRadius: 8, background: "#D97B0D", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Recharger la page
            </button>
            {this.state.error && (
              <details style={{ marginTop: 20, textAlign: "left" }}>
                <summary style={{ fontSize: 11, color: "#767672", cursor: "pointer" }}>Détails techniques</summary>
                <pre style={{ fontSize: 10, color: "#C4392A", background: "#FEF2F2", padding: 12, borderRadius: 8, marginTop: 8, overflow: "auto", maxHeight: 120 }}>{this.state.error.toString()}</pre>
              </details>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
import { loadProjects as dbLoadProjects, saveProjects as dbSaveProjects, loadProfile as dbLoadProfile, saveProfile as dbSaveProfile, uploadPhoto, deletePhoto, getPhotoUrl, inviteMember, loadProjectMembers, updateMemberRole, removeMember, loadMyInvitations, respondToInvitation, loadSharedProjects, loadNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification, deleteAllNotifications, subscribeToNotifications, sendPvByEmail, loadPvSends, track } from "./db";

// ── Design Tokens ──────────────────────────────────────────
// Colors
const AC = "#D97B0D";
const ACL = "#FDF4E7";
const ACL2 = "#FAE9CF";
const SB = "#F7F6F4";
const SB2 = "#EEEDEA";
const SBB = "#E2E1DD";
const TX = "#1D1D1B";
const TX2 = "#6B6B66";
const TX3 = "#656560";  // rehaussé pour WCAG AA (4.5:1 sur SB)
const BG = "#FAFAF9";
const WH = "#FFFFFF";
const RD = "#C4392A";
const GR = "#2D8A4E";

// Spacing scale (base 4px)
const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 };

// Typography scale
const FS = { xs: 10, sm: 11, base: 12, md: 13, lg: 15, xl: 18, xxl: 22 };
const LH = { tight: "1.2", normal: "1.4", relaxed: "1.6" };

// Radius scale
const RAD = { sm: 6, md: 8, lg: 10, xl: 12, xxl: 14, full: "50%" };

const BL   = "#2B6CB0";   // Bleu (permis, versions)
const BLB  = "#E6F1FB";   // Bleu clair fond
const OR   = "#D85A30";   // Orange (chantier)
const ORB  = "#FAECE7";   // Orange clair fond
const VI   = "#6366F1";   // Violet (indigo)
const VIB  = "#EDEFFD";   // Violet clair fond
const TE   = "#0E7490";   // Teal
const TEB  = "#E0F5F9";   // Teal clair fond
const PU   = "#9F7AEA";   // Pourpre
const PUB  = "#F3EEFB";   // Pourpre clair fond
const GRY  = "#6B6B66";   // Gris fermé
const GRYB = "#F1EFE8";   // Gris fermé clair fond
const REDBG  = "#FEF2F2"; // Fond rouge clair
const REDBRD = "#FECACA"; // Bordure rouge clair
const GRBG   = "#EAF3DE"; // Fond vert clair
const DIS    = "#D3D1C7"; // Désactivé fond
const DIST   = "#8A8A85"; // Désactivé texte (rehaussé contraste)

const STATUSES = [
  { id: "sketch",       label: "Esquisse",      color: PU,  bg: PUB  },
  { id: "preliminary",  label: "Avant-projet",  color: VI,  bg: VIB  },
  { id: "permit",       label: "Permis",        color: BL,  bg: BLB  },
  { id: "execution",    label: "Exécution",     color: AC,  bg: ACL  },
  { id: "construction", label: "Chantier",      color: OR,  bg: ORB  },
  { id: "reception",    label: "Réception",     color: GR,  bg: GRBG },
  { id: "closed",       label: "Clôturé",       color: GRY, bg: GRYB },
];

const getStatus = (id) => STATUSES.find((s) => s.id === id) || STATUSES[0];

// ── Offline Queue ──────────────────────────────────────────
const OFFLINE_QUEUE_KEY = "archipilot_offline_queue";
const OFFLINE_DRAFTS_KEY = "archipilot_pv_drafts";

function getOfflineQueue() {
  try { return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]"); } catch { return []; }
}
function addToOfflineQueue(item) {
  const queue = getOfflineQueue();
  queue.push({ ...item, id: Date.now() + Math.random(), createdAt: new Date().toISOString() });
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}
function clearOfflineQueue() {
  localStorage.setItem(OFFLINE_QUEUE_KEY, "[]");
}

function getPvDrafts() {
  try { return JSON.parse(localStorage.getItem(OFFLINE_DRAFTS_KEY) || "[]"); } catch { return []; }
}
function savePvDraft(draft) {
  const drafts = getPvDrafts();
  drafts.push({ ...draft, id: Date.now(), savedAt: new Date().toISOString() });
  localStorage.setItem(OFFLINE_DRAFTS_KEY, JSON.stringify(drafts));
}
function removePvDraft(draftId) {
  const drafts = getPvDrafts().filter(d => d.id !== draftId);
  localStorage.setItem(OFFLINE_DRAFTS_KEY, JSON.stringify(drafts));
}

// Build display address from structured fields (or fallback to legacy string)
// Relative date helper (dd/mm/yyyy → "il y a X jours")
const relativeDate = (dateStr) => {
  if (!dateStr) return "";
  const parts = dateStr.split("/");
  if (parts.length !== 3) return dateStr;
  const d = new Date(parts[2], parts[1] - 1, parts[0]);
  if (isNaN(d)) return dateStr;
  const diff = Math.floor((Date.now() - d) / 86400000);
  if (diff < 0) return `dans ${-diff}j`;
  if (diff === 0) return "aujourd'hui";
  if (diff === 1) return "hier";
  if (diff < 7) return `il y a ${diff}j`;
  if (diff < 30) return `il y a ${Math.floor(diff / 7)} sem.`;
  if (diff < 365) return `il y a ${Math.floor(diff / 30)} mois`;
  return `il y a ${Math.floor(diff / 365)} an${Math.floor(diff / 365) > 1 ? "s" : ""}`;
};

const formatAddress = (p) => {
  if (p.street || p.city) {
    const line1 = [p.street, p.number].filter(Boolean).join(" ");
    const line2 = [p.postalCode, p.city].filter(Boolean).join(" ");
    return [line1, line2, p.country !== "Belgique" ? p.country : ""].filter(Boolean).join(", ");
  }
  return p.address || "";
};

// Parse legacy address string into structured fields (best-effort)
const parseAddress = (addr) => {
  if (!addr) return { street: "", number: "", postalCode: "", city: "", country: "Belgique" };
  // Try pattern: "Street Number, PostalCode City" or "Street Number, City"
  const parts = addr.split(",").map(s => s.trim());
  if (parts.length >= 2) {
    const streetPart = parts[0];
    const cityPart = parts[parts.length - 1];
    const streetMatch = streetPart.match(/^(.+?)\s+(\d+\w*)$/);
    const cityMatch = cityPart.match(/^(\d{4,5})?\s*(.+)$/);
    return {
      street: streetMatch ? streetMatch[1] : streetPart,
      number: streetMatch ? streetMatch[2] : "",
      postalCode: cityMatch?.[1] || "",
      city: cityMatch?.[2] || cityPart,
      country: "Belgique",
    };
  }
  return { street: "", number: "", postalCode: "", city: addr, country: "Belgique" };
};

const RECURRENCES = [
  { id: "none", label: "Ponctuel (pas de récurrence)", days: 0 },
  { id: "2x_week", label: "2x par semaine", days: 3 },
  { id: "3x_week", label: "3x par semaine", days: 2 },
  { id: "weekly", label: "1x par semaine", days: 7 },
  { id: "biweekly", label: "1x / 2 semaines", days: 14 },
  { id: "monthly", label: "1x par mois", days: 30 },
  { id: "6weeks", label: "1x / 6 semaines", days: 42 },
];

// Parse dd/mm/yyyy to Date
function parseDateFR(str) {
  if (!str) return null;
  const p = str.split("/");
  if (p.length !== 3) return null;
  return new Date(+p[2], +p[1] - 1, +p[0]);
}

// Format Date to dd/mm/yyyy
function formatDateFR(d) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

// Calculate next meeting date from last meeting + recurrence
function calcNextMeeting(lastDate, recurrenceId) {
  const rec = RECURRENCES.find(r => r.id === recurrenceId);
  if (!rec || rec.days === 0 || !lastDate) return null;
  const d = parseDateFR(lastDate);
  if (!d) return null;
  d.setDate(d.getDate() + rec.days);
  return formatDateFR(d);
}

// Days until a date
function daysUntil(dateStr) {
  const d = parseDateFR(dateStr);
  if (!d) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.ceil((d - now) / (1000 * 60 * 60 * 24));
}

const STRUCTURE_TYPES = [
  { id: "architecte", label: "Architecte" },
  { id: "bureau_etudes", label: "Bureau d'études" },
  { id: "promoteur", label: "Promoteur immobilier" },
  { id: "entreprise_construction", label: "Entreprise de construction" },
  { id: "autre", label: "Autre" },
];

// ── Plans & Feature Gates ──────────────────────────────────
const PLANS = {
  free: { id: "free", label: "Free", price: 0, priceYear: 0 },
  pro: { id: "pro", label: "Pro", price: 29, priceYear: 290 },
  team: { id: "team", label: "Team", price: 59, priceYear: 590 },
};
const PLAN_FEATURES = {
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
  pdfCustomLogo:    { free: false, pro: false,    team: true },
};
const hasFeature = (plan, feature) => {
  const p = plan || "free";
  const f = PLAN_FEATURES[feature];
  if (!f) return true;
  return f[p] !== undefined ? f[p] : f.free;
};
const getLimit = (plan, feature) => {
  const p = plan || "free";
  const f = PLAN_FEATURES[feature];
  if (!f) return Infinity;
  return f[p] !== undefined ? f[p] : f.free;
};

const INIT_PROFILE = {
  name: "Gaëlle CNOP",
  structure: "DEWIL architecten",
  structureType: "architecte",
  address: "",
  phone: "0474 50 85 80",
  email: "gaelle@dewil-architect.be",
  picture: null,
  pdfColor: "#D97B0D",
  pdfFont: "helvetica",
  apiKey: "",
  lang: "fr",
  plan: "free",
  postTemplate: "general",
  pvTemplate: "standard",
  remarkNumbering: "none",
  emailSignature: "",
};

const COLOR_PRESETS = [
  { value: "#D97B0D", label: "Ambre" },
  { value: "#2B6CB0", label: "Bleu" },
  { value: "#2D8A4E", label: "Vert" },
  { value: "#6366F1", label: "Indigo" },
  { value: "#C4392A", label: "Terre cuite" },
  { value: "#2D2D2A", label: "Anthracite" },
];

const FONT_OPTIONS = [
  { id: "helvetica", label: "Helvetica", desc: "Sans-sérif, moderne" },
  { id: "times",     label: "Times",     desc: "Sérif, classique" },
];

const DOC_CATEGORIES = [
  { id: "plans",  label: "Plans",           color: BL,  bg: BLB  },
  { id: "admin",  label: "Administratif",   color: VI,  bg: VIB  },
  { id: "photos", label: "Photos chantier", color: GR,  bg: GRBG },
];

// ── Post Templates by project type ──────────────────────────
const POST_TEMPLATES = [
  {
    id: "general",
    label: "Réunion de chantier (standard)",
    icon: "building",
    posts: [
      { id: "01", label: "Situation du chantier" }, { id: "02", label: "Généralités" },
      { id: "03", label: "Planning" },
    ],
  },
  {
    id: "renovation",
    label: "Rénovation",
    icon: "edit",
    posts: [
      { id: "01", label: "Situation du chantier" }, { id: "02", label: "Généralités" },
      { id: "03", label: "Planning" }, { id: "10", label: "Démolition" },
      { id: "20", label: "Gros œuvre" }, { id: "30", label: "Toiture" },
      { id: "40", label: "Menuiseries extérieures" }, { id: "50", label: "Parachèvements" },
      { id: "60", label: "HVAC" }, { id: "70", label: "Électricité" },
      { id: "80", label: "Sanitaire" },
    ],
  },
  {
    id: "newbuild",
    label: "Construction neuve",
    icon: "building",
    posts: [
      { id: "01", label: "Situation du chantier" }, { id: "02", label: "Généralités" },
      { id: "03", label: "Planning" }, { id: "10", label: "Terrassement" },
      { id: "20", label: "Fondations" }, { id: "21", label: "Gros œuvre" },
      { id: "30", label: "Toiture & étanchéité" }, { id: "35", label: "Façades" },
      { id: "40", label: "Châssis & vitrages" }, { id: "45", label: "Portes intérieures" },
      { id: "50", label: "Chapes & sols" }, { id: "55", label: "Peinture & finitions" },
      { id: "60", label: "HVAC" }, { id: "65", label: "Électricité" },
      { id: "70", label: "Sanitaire" }, { id: "80", label: "Abords" },
    ],
  },
  {
    id: "interior",
    label: "Aménagement intérieur",
    icon: "edit",
    posts: [
      { id: "01", label: "Situation du chantier" }, { id: "02", label: "Généralités" },
      { id: "03", label: "Planning" }, { id: "10", label: "Cloisons" },
      { id: "20", label: "Faux-plafonds" }, { id: "30", label: "Menuiseries intérieures" },
      { id: "40", label: "Revêtements sols" }, { id: "50", label: "Peinture" },
      { id: "60", label: "Mobilier fixe" }, { id: "70", label: "Électricité & éclairage" },
      { id: "80", label: "HVAC & ventilation" },
    ],
  },
  {
    id: "public",
    label: "Bâtiment public / tertiaire",
    icon: "building",
    posts: [
      { id: "01", label: "Situation du chantier" }, { id: "02", label: "Généralités" },
      { id: "03", label: "Planning" }, { id: "04", label: "Documents & conformité" },
      { id: "10", label: "Gros œuvre" }, { id: "20", label: "Façades & isolation" },
      { id: "30", label: "Toiture" }, { id: "40", label: "Menuiseries" },
      { id: "50", label: "Parachèvements" }, { id: "60", label: "HVAC" },
      { id: "65", label: "Électricité HT/BT" }, { id: "70", label: "Sanitaire" },
      { id: "75", label: "Détection incendie" }, { id: "80", label: "Ascenseurs" },
      { id: "90", label: "Abords & signalétique" },
    ],
  },
  {
    id: "custom",
    label: "Personnalisé (vide)",
    icon: "plus",
    posts: [],
  },
];

// ── PV Structure Templates ──────────────────────────────────
const PV_TEMPLATES = [
  {
    id: "standard",
    label: "Standard (belge)",
    desc: "3ème personne, factuel, terminologie belge",
    prompt: "Tu es un assistant pour rédiger des PV de chantier pour architectes belges. Notes en PV professionnel. 3ème personne, factuel. '- ' points, '> ' importants. 'Le MO demande...', 'Il est demandé de...'. Terminologie belge. Garde la numérotation. Max 1200 mots. Corps uniquement.",
  },
  {
    id: "detailed",
    label: "Détaillé",
    desc: "Plus long, avec actions et échéances",
    prompt: "Tu es un assistant pour rédiger des PV de chantier détaillés pour architectes belges. Notes en PV professionnel. 3ème personne, factuel. '- ' pour les constats, '> ' pour les points urgents. Ajoute des ACTIONS REQUISES à la fin de chaque section avec responsable et échéance. Terminologie belge. Garde la numérotation. Max 2000 mots. Corps uniquement.",
  },
  {
    id: "concise",
    label: "Concis",
    desc: "Court et synthétique, points clés uniquement",
    prompt: "Tu es un assistant pour rédiger des PV de chantier concis pour architectes belges. Notes en PV synthétique. 3ème personne, factuel. Seulement les points essentiels. '- ' pour les points, '> ' pour les urgences. Max 600 mots. Corps uniquement.",
  },
  {
    id: "french",
    label: "Français (France)",
    desc: "Terminologie française, vouvoiement",
    prompt: "Tu es un assistant pour rédiger des comptes-rendus de chantier pour architectes français. Notes en CR professionnel. 3ème personne, factuel, vouvoiement. '- ' pour les observations, '> ' pour les points importants. Terminologie française. Garde la numérotation. Max 1200 mots. Corps uniquement.",
  },
];

// ── Remark Numbering Modes ──────────────────────────────────
const REMARK_NUMBERING = [
  { id: "none", label: "Sans numérotation" },
  { id: "sequential", label: "Séquentielle (1, 2, 3...)" },
  { id: "post-seq", label: "Par poste (01.1, 01.2, 02.1...)" },
  { id: "global", label: "Globale continue (1, 2, ... tous postes)" },
];

const CHECKLIST_TEMPLATES = [
  {
    id: "visit",
    label: "Visite de chantier",
    color: BL, bg: BLB,
    items: [
      { text: "EPI disponibles sur chantier",        section: "Sécurité" },
      { text: "Clôture et signalisation en place",   section: "Sécurité" },
      { text: "Panneau de chantier conforme",        section: "Sécurité" },
      { text: "Implantation vérifiée / conforme plans", section: "Gros œuvre" },
      { text: "Fouilles et fondations conformes",    section: "Gros œuvre" },
      { text: "Armatures contrôlées avant coulage",  section: "Gros œuvre" },
      { text: "Réservations réalisées",              section: "Gros œuvre" },
      { text: "Menuiseries : dimensions conformes",  section: "Menuiseries" },
      { text: "Calfeutrement et étanchéité OK",      section: "Menuiseries" },
      { text: "Surfaces sans défauts apparents",     section: "Finitions" },
      { text: "Joints et raccords réalisés",         section: "Finitions" },
      { text: "Nettoyage effectué",                  section: "Finitions" },
    ],
  },
  {
    id: "reception",
    label: "Réception provisoire",
    color: GR, bg: GRBG,
    items: [
      { text: "Plans as-built remis au MO",          section: "Documents" },
      { text: "Carnets d'entretien remis",            section: "Documents" },
      { text: "Attestations techniques remises",      section: "Documents" },
      { text: "Dossier d'intervention ultérieure (DIU)", section: "Documents" },
      { text: "PEB complété et déposé",               section: "Documents" },
      { text: "Essai d'étanchéité à l'air effectué",  section: "Technique" },
      { text: "Installations HVAC testées",            section: "Technique" },
      { text: "Installations électriques vérifiées",   section: "Technique" },
      { text: "Installations sanitaires testées",      section: "Technique" },
      { text: "Défauts de finition répertoriés",       section: "Réception" },
      { text: "Nettoyage final effectué",              section: "Réception" },
      { text: "Débarras du chantier",                  section: "Réception" },
      { text: "Clés et accès remis au MO",             section: "Réception" },
    ],
  },
  {
    id: "structure",
    label: "Contrôle structure",
    color: RD, bg: REDBG,
    items: [
      { text: "Profondeur de fondations conforme",    section: "Fondations" },
      { text: "Sol de fondation contrôlé (portance)", section: "Fondations" },
      { text: "Armatures fondations vérifiées",       section: "Fondations" },
      { text: "Poteaux et poutres conformes aux plans", section: "Structure" },
      { text: "Dalle de plancher conforme",            section: "Structure" },
      { text: "Voiles porteurs conformes",             section: "Structure" },
      { text: "Linteaux et seuils conformes",          section: "Structure" },
      { text: "Structure de toiture conforme",         section: "Toiture" },
      { text: "Étanchéité posée et contrôlée",         section: "Toiture" },
      { text: "Évacuations d'eaux pluviales réalisées", section: "Toiture" },
    ],
  },
  { id: "blank", label: "Liste vide", color: GRY, bg: GRYB, items: [] },
];

const REMARK_STATUSES = [
  { id: "open",     label: "À traiter", color: "#B91C1C", bg: "#FEF2F2", dot: "#EF4444" },
  { id: "progress", label: "En cours",  color: "#92400E", bg: "#FFFBEB", dot: AC },
  { id: "done",     label: "Résolu",    color: "#166534", bg: "#F0FDF4", dot: GR },
];
const nextStatus = (s) => s === "open" ? "progress" : s === "progress" ? "done" : "open";
const getRemarkStatus = (id) => REMARK_STATUSES.find((s) => s.id === id) || REMARK_STATUSES[0];

const PV_STATUSES = [
  { id: "draft",     label: "Brouillon", color: GRY,      bg: GRYB,  dot: "#8A8A85" },
  { id: "review",    label: "À relire",  color: "#92400E", bg: "#FFFBEB", dot: AC },
  { id: "validated", label: "Validé",    color: "#166534", bg: "#F0FDF4", dot: GR },
  { id: "sent",      label: "Envoyé",    color: BL,       bg: BLB,   dot: BL },
  { id: "late",      label: "En retard", color: "#B91C1C", bg: "#FEF2F2", dot: "#EF4444" },
];
const getPvStatus  = (id) => PV_STATUSES.find((s) => s.id === id) || PV_STATUSES[0];
const nextPvStatus = (id) => { const i = PV_STATUSES.findIndex(s => s.id === id); return PV_STATUSES[(i + 1) % PV_STATUSES.length].id; };

const LOT_COLORS = [
  { id: "amber",  value: AC,  bg: ACL  },
  { id: "blue",   value: BL,  bg: BLB  },
  { id: "green",  value: GR,  bg: GRBG },
  { id: "violet", value: VI,  bg: VIB  },
  { id: "red",    value: RD,  bg: REDBG},
  { id: "teal",   value: TE,  bg: TEB  },
];

const calcLotStatus = (lot) => {
  const now   = new Date(); now.setHours(0,0,0,0);
  const start = lot.startDate ? new Date(lot.startDate) : null;
  const end   = lot.endDate   ? new Date(lot.endDate)   : null;
  if (lot.progress >= 100) return { id: "done",    label: "Terminé",  color: GR,  bg: GRBG  };
  if (end && now > end)    return { id: "delayed", label: "En retard", color: RD,  bg: REDBG };
  if (start && now >= start) return { id: "active", label: "En cours", color: AC,  bg: ACL   };
  return { id: "planned", label: "Planifié", color: BL, bg: BLB };
};

const parseNotesToRemarks = (notes) =>
  notes.split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => ({
      id: Date.now() + Math.random(),
      text: l.replace(/^[-–>]\s*/, ""),
      urgent: l.startsWith(">"),
      status: "open",
    }));

// Backward-compatible getter: supports both legacy flat docs and versioned docs
const getDocCurrent = (doc) => {
  if (doc.versions && doc.versions.length > 0) {
    const v = doc.versions[doc.versions.length - 1];
    return { dataUrl: v.dataUrl, size: v.size, type: v.type, addedAt: v.addedAt, version: doc.versions.length };
  }
  return { dataUrl: doc.dataUrl, size: doc.size, type: doc.type, addedAt: doc.addedAt, version: 1 };
};

const hexToRgb = (hex) => {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
};

// Composite plan image + annotation strokes + markers on an off-screen canvas
const compositePlanImage = (project) => new Promise((resolve) => {
  if (!project.planImage) return resolve(null);
  const img = new Image();
  img.onload = () => {
    const maxW  = 1200;
    const scale = img.naturalWidth > maxW ? maxW / img.naturalWidth : 1;
    const cw    = Math.round(img.naturalWidth  * scale);
    const ch    = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext("2d");

    // Draw base plan
    ctx.drawImage(img, 0, 0, cw, ch);

    // Draw annotation strokes
    (project.planStrokes || []).forEach((s) => {
      ctx.strokeStyle = s.color; ctx.fillStyle = s.color;
      ctx.lineWidth = Math.max(3, cw * 0.003);
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      if (s.type === "arrow") {
        const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
        const hl  = Math.max(16, len * 0.18);
        const ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
        ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(s.x2, s.y2);
        ctx.lineTo(s.x2 - hl * Math.cos(ang - Math.PI / 6), s.y2 - hl * Math.sin(ang - Math.PI / 6));
        ctx.lineTo(s.x2 - hl * Math.cos(ang + Math.PI / 6), s.y2 - hl * Math.sin(ang + Math.PI / 6));
        ctx.closePath(); ctx.fill();
      } else if (s.type === "rect") {
        ctx.strokeRect(s.x1, s.y1, s.x2 - s.x1, s.y2 - s.y1);
      } else if (s.type === "circle") {
        const rx = Math.abs(s.x2 - s.x1) / 2, ry = Math.abs(s.y2 - s.y1) / 2;
        ctx.beginPath();
        ctx.ellipse((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2, Math.max(rx, 1), Math.max(ry, 1), 0, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (s.type === "pen") {
        if (s.points.length < 2) return;
        ctx.beginPath();
        s.points.forEach((pt, i) => { if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y); });
        ctx.stroke();
      } else if (s.type === "text") {
        const fs = Math.round(cw * 0.04);
        ctx.font = `bold ${fs}px system-ui, -apple-system, sans-serif`;
        ctx.fillText(s.text, s.x, s.y + fs);
      }
    });

    // Draw markers (pin = circle + triangle + number)
    const r = Math.max(14, cw * 0.018);
    (project.planMarkers || []).forEach((m) => {
      const mx = (m.x / 100) * cw;
      const my = (m.y / 100) * ch;
      const cy = my - r * 1.4;
      // Shadow
      ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
      // Circle fill
      ctx.fillStyle = "#D97B0D";
      ctx.beginPath(); ctx.arc(mx, cy, r, 0, 2 * Math.PI); ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      // White border
      ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(2, r * 0.18);
      ctx.beginPath(); ctx.arc(mx, cy, r, 0, 2 * Math.PI); ctx.stroke();
      // Triangle pointer
      ctx.fillStyle = "#D97B0D";
      ctx.beginPath();
      ctx.moveTo(mx - r * 0.45, cy + r * 0.55);
      ctx.lineTo(mx + r * 0.45, cy + r * 0.55);
      ctx.lineTo(mx, my - r * 0.05);
      ctx.closePath(); ctx.fill();
      // Number
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${Math.round(r * 1.15)}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(m.number), mx, cy);
    });

    resolve({ dataUrl: canvas.toDataURL("image/jpeg", 0.92), w: cw, h: ch });
  };
  img.onerror = () => resolve(null);
  img.src = project.planImage;
});

async function generatePDF(project, pvNum, date, result, profile, options) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, H = 297;
  const ML = 18, MR = 18;
  const CW = W - ML - MR; // 174 mm

  const AMBER  = hexToRgb(profile?.pdfColor || "#D97B0D");
  const font   = profile?.pdfFont || "helvetica";
  const DARK   = [29, 29, 27];
  const GRAY   = [107, 107, 102];
  const LGRAY  = [226, 225, 221];
  const BGGRAY = [247, 246, 244];
  const RED    = [196, 57, 42];
  const REDBG  = [254, 242, 242];

  let y = 0;

  const checkY = (needed = 12) => {
    if (y + needed > H - 20) {
      doc.addPage();
      y = 22;
    }
  };

  const imgFmt = (dataUrl) => {
    if (dataUrl.startsWith("data:image/png")) return "PNG";
    if (dataUrl.startsWith("data:image/webp")) return "WEBP";
    return "JPEG";
  };

  // ── HEADER PAGE 1 ──────────────────────────────────────────
  doc.setFillColor(...AMBER);
  doc.rect(0, 0, W, 11, "F");

  y = 19;

  if (profile?.picture) {
    try { doc.addImage(profile.picture, imgFmt(profile.picture), W - MR - 22, 13, 22, 22); } catch (_) {}
  }

  const bureauName = profile?.structure || "ArchiPilot";
  doc.setFont(font, "bold");
  doc.setFontSize(14);
  doc.setTextColor(...DARK);
  doc.text(bureauName, ML, y);
  y += 5.5;

  doc.setFont(font, "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY);
  const contactParts = [profile?.phone, profile?.email].filter(Boolean).join("   ");
  if (profile?.address) { doc.text(profile.address, ML, y); y += 4.5; }
  if (contactParts)      { doc.text(contactParts, ML, y);   y += 4.5; }

  y = Math.max(y, 40);
  doc.setDrawColor(...LGRAY);
  doc.setLineWidth(0.4);
  doc.line(ML, y, W - MR, y);
  y += 9;

  // ── PV TITRE ───────────────────────────────────────────────
  doc.setFont(font, "bold");
  doc.setFontSize(22);
  doc.setTextColor(...AMBER);
  doc.text(`PROCE\u0300S-VERBAL N\u00B0${pvNum}`, ML, y);
  y += 7;

  doc.setFont(font, "normal");
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text(`Re\u0301union de chantier du ${date}`, ML, y);
  y += 9;

  // ── FICHE PROJET ───────────────────────────────────────────
  doc.setFillColor(...BGGRAY);
  doc.rect(ML, y, CW, 28, "F");

  const bY = y + 5;
  const c1 = ML + 5, c2 = ML + 62, c3 = ML + 120;

  doc.setFont(font, "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY);
  doc.text("CHANTIER", c1, bY);
  doc.text("MA\u00CETRE D'OUVRAGE", c2, bY);
  doc.text("ENTREPRISE", c3, bY);

  doc.setFont(font, "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...DARK);
  const splitProject = doc.splitTextToSize(project.name, 54);
  doc.text(splitProject, c1, bY + 5);
  doc.text(doc.splitTextToSize(project.client, 54), c2, bY + 5);
  doc.text(doc.splitTextToSize(project.contractor, 46), c3, bY + 5);

  doc.setFont(font, "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY);
  if (project.address) doc.text(project.address, c1, bY + 13);
  y += 36;

  // ── PRÉSENTS ───────────────────────────────────────────────
  if (project.participants.length > 0) {
    doc.setFont(font, "bold");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text("PRE\u0301SENTS", ML, y);
    y += 4.5;

    project.participants.forEach((p, i) => {
      if (i % 2 === 0) { doc.setFillColor(...BGGRAY); doc.rect(ML, y - 3.5, CW, 6.5, "F"); }
      doc.setFont(font, "bold");   doc.setFontSize(9);   doc.setTextColor(...DARK);
      doc.text(p.name, ML + 3, y);
      doc.setFont(font, "normal"); doc.setFontSize(8.5); doc.setTextColor(...GRAY);
      doc.text(p.role, ML + 82, y);
      if (p.email) doc.text(p.email, ML + 110, y);
      y += 6.5;
    });
    y += 3;
  }

  // ── SÉPARATEUR AMBRE ───────────────────────────────────────
  doc.setFillColor(...AMBER);
  doc.rect(ML, y, CW, 0.8, "F");
  y += 9;

  // ── CONTENU (résultat Claude) ──────────────────────────────
  const lines = result.split("\n");
  for (const line of lines) {
    const t = line.trim();
    if (!t) { y += 2; continue; }

    const isSec     = /^\d{1,2}[.\-]\s/.test(t) && t.length < 90;
    const isUrgent  = t.startsWith(">");
    const isPoint   = t.startsWith("-");

    if (isSec) {
      checkY(16);
      doc.setFillColor(...BGGRAY);
      doc.rect(ML, y - 4.5, CW, 9, "F");
      doc.setFillColor(...AMBER);
      doc.rect(ML, y - 4.5, 2.5, 9, "F");
      doc.setFont(font, "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(...DARK);
      doc.text(t, ML + 6, y);
      y += 9;
    } else if (isUrgent) {
      const content = t.slice(1).trim();
      const wrapped = doc.splitTextToSize("! " + content, CW - 12);
      checkY(wrapped.length * 5 + 5);
      doc.setFillColor(...REDBG);
      doc.rect(ML, y - 3.5, CW, wrapped.length * 5 + 3, "F");
      doc.setFillColor(...RED);
      doc.rect(ML, y - 3.5, 2, wrapped.length * 5 + 3, "F");
      doc.setFont(font, "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...RED);
      wrapped.forEach((wl, wi) => doc.text(wl, ML + 6, y + wi * 5));
      y += wrapped.length * 5 + 5;
    } else if (isPoint) {
      const content = t.slice(1).trim();
      const wrapped = doc.splitTextToSize(content, CW - 10);
      checkY(wrapped.length * 5 + 2);
      doc.setFillColor(...GRAY);
      doc.circle(ML + 3, y - 1.5, 0.8, "F");
      doc.setFont(font, "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(...DARK);
      wrapped.forEach((wl, wi) => doc.text(wl, ML + 8, y + wi * 5));
      y += wrapped.length * 5 + 2;
    } else {
      const wrapped = doc.splitTextToSize(t, CW);
      checkY(wrapped.length * 5 + 2);
      doc.setFont(font, "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(...DARK);
      wrapped.forEach((wl, wi) => doc.text(wl, ML, y + wi * 5));
      y += wrapped.length * 5 + 2;
    }
  }

  // ── PLAN DU CHANTIER ───────────────────────────────────────
  const markers = project.planMarkers || [];
  if (project.planImage && markers.length > 0) {
    const composite = await compositePlanImage(project);
    if (composite) {
      checkY(20);
      y += 4;
      doc.setFillColor(...AMBER);
      doc.rect(ML, y, CW, 0.8, "F");
      y += 9;
      doc.setFont(font, "bold");
      doc.setFontSize(11);
      doc.setTextColor(...DARK);
      doc.text("LOCALISATION SUR PLAN", ML, y);
      y += 8;

      // Place image, keeping aspect ratio, max height 110mm
      const aspect = composite.w / composite.h;
      const planW  = CW;
      const planH  = Math.min(planW / aspect, 110);
      checkY(planH + 5);
      try { doc.addImage(composite.dataUrl, "JPEG", ML, y, planW, planH); } catch (_) {}
      y += planH + 8;

      // Legend
      if (markers.length > 0) {
        checkY(markers.length * 7 + 14);
        doc.setFont(font, "bold");
        doc.setFontSize(8);
        doc.setTextColor(...GRAY);
        doc.text("LÉGENDE", ML, y);
        y += 5;
        markers.forEach((m, i) => {
          checkY(7);
          if (i % 2 === 0) { doc.setFillColor(...BGGRAY); doc.rect(ML, y - 3.5, CW, 6.5, "F"); }
          // Amber circle with number
          doc.setFillColor(...AMBER);
          doc.circle(ML + 4, y - 1.2, 3.2, "F");
          doc.setFont(font, "bold");
          doc.setFontSize(7);
          doc.setTextColor(255, 255, 255);
          doc.text(String(m.number), ML + 4, y - 1.2, { align: "center", baseline: "middle" });
          // Post label
          const post = project.posts.find((p) => p.id === m.postId);
          doc.setFont(font, "normal");
          doc.setFontSize(9);
          doc.setTextColor(...DARK);
          doc.text(post ? `${post.id}. ${post.label}` : "(poste supprimé)", ML + 11, y);
          y += 6.5;
        });
        y += 4;
      }
    }
  }

  // ── PHOTOS ─────────────────────────────────────────────────
  const postsWithPhotos = project.posts.filter((p) => (p.photos || []).length > 0);
  if (postsWithPhotos.length > 0) {
    checkY(20);
    y += 4;
    doc.setFillColor(...AMBER);
    doc.rect(ML, y, CW, 0.8, "F");
    y += 9;
    doc.setFont(font, "bold");
    doc.setFontSize(11);
    doc.setTextColor(...DARK);
    doc.text("PHOTOS JOINTES", ML, y);
    y += 8;

    postsWithPhotos.forEach((post) => {
      checkY(12);
      doc.setFont(font, "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...GRAY);
      doc.text(`${post.id}. ${post.label}`, ML, y);
      y += 5;

      const photos = post.photos;
      const cols = Math.min(photos.length, 3);
      const gap = 3;
      const imgW = (CW - gap * (cols - 1)) / cols;
      const imgH = imgW * 0.65;

      checkY(imgH + 6);
      photos.forEach((ph, idx) => {
        const col = idx % cols;
        if (col === 0 && idx > 0) { y += imgH + gap; checkY(imgH + gap); }
        try { const phUrl = getPhotoUrl(ph); doc.addImage(phUrl, imgFmt(phUrl), ML + col * (imgW + gap), y, imgW, imgH); } catch (_) {}
      });
      y += imgH + 8;
    });
  }

  // ── PIED DE PAGE (toutes les pages) ────────────────────────
  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LGRAY);
    doc.setLineWidth(0.3);
    doc.line(ML, H - 15, W - MR, H - 15);
    doc.setFont(font, "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY);
    doc.text(bureauName, ML, H - 10);
    if (contactParts) doc.text(contactParts, ML, H - 6);
    doc.text(`PV n\u00B0${pvNum}  \u2014  ${date}`, W - MR, H - 10, { align: "right" });
    doc.text(`Page ${i} / ${total}`, W - MR, H - 6, { align: "right" });
  }

  const safeName = project.name.replace(/[^\w\s\u00C0-\u024F]/g, "").replace(/\s+/g, "_");
  const safeDate = date.replace(/\//g, "-");
  if (options?.returnDataUrl) {
    return { dataUrl: doc.output("datauristring"), fileName: `PV_${pvNum}_${safeName}_${safeDate}.pdf` };
  }
  doc.save(`PV_${pvNum}_${safeName}_${safeDate}.pdf`);
}

function Ico({ name, size = 18, color = TX3 }) {
  const paths = {
    menu: "M3 12h18 M3 6h18 M3 18h18",
    x: "M18 6L6 18 M6 6l12 12",
    back: "M15 18l-6-6 6-6",
    file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8",
    edit: "M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z",
    check: "M20 6L9 17l-5-5",
    plus: "M12 5v14 M5 12h14",
    send: "M22 2L11 13 M22 2l-7 20-4-9-9-4z",
    users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    clock: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M12 6v6l4 2",
    lock: "M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z M7 11V7a5 5 0 0 1 10 0v4",
    alert: "M12 9v4 M12 17h.01",
    building: "M3 21h18 M5 21V7l8-4v18 M19 21V11l-6-4",
    copy: "M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2z M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
    calendar: "M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z M16 2v4 M8 2v4 M3 10h18",
    trash: "M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
    save: "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z M17 21v-8H7v8 M7 3v5h8",
    chart: "M18 20V10 M12 20V4 M6 20v-6",
    archive: "M21 8v13H3V8 M1 3h22v5H1z M10 12h4",
    dup: "M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1z M20 5H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z",
    mail: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M22 6l-10 7L2 6",
    bell: "M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0",
    phone: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z",
    eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z",
    repeat: "M17 1l4 4-4 4 M3 11V9a4 4 0 0 1 4-4h14 M7 23l-4-4 4-4 M21 13v2a4 4 0 0 1-4 4H3",
    camera: "M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    image: "M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M21 15l-5-5L5 21",
    mappin: "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
    folder: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z",
    download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3",
    wifioff: "M1 1l22 22 M16.72 11.06A10.94 10.94 0 0 1 19 12.55 M5 12.55a10.94 10.94 0 0 1 5.17-2.39 M10.71 5.05A16 16 0 0 1 22.56 9 M1.42 9a15.91 15.91 0 0 1 4.7-2.88 M8.53 16.11a6 6 0 0 1 6.95 0 M12 20h.01",
    install: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M12 8v8 M8 12l4 4 4-4",
    gantt:  "M3 5h4v3H3z M3 10h8v3H3z M3 15h6v3H3z M10 6h11 M10 11h7 M10 16h9",
    upload:    "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12",
    listcheck: "M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
    checksq:   "M9 11l3 3 5-5 M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
    arrowr: "M5 12h14 M12 5l7 7-7 7",
    arrowd: "M12 5v14 M5 12l7 7 7-7",
    rectc:  "M3 3h18v18H3z",
    circlec:"M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z",
    pen2:   "M12 20h9 M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z",
    textT:  "M4 7V4h16v3 M9 20h6 M12 4v16",
    search: "M11 17a6 6 0 1 0 0-12 6 6 0 0 0 0 12z M21 21l-4.35-4.35",
    history: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M12 6v6l4 2",
    mic: "M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v4 M8 23h8",
    logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
    "chevron-down": "M6 9l6 6 6-6",
    "chevron-right": "M9 18l6-6-6-6",
    "chevron-up":   "M18 15l-6-6-6 6",
    undo:           "M3 7v6h6 M3 13a9 9 0 1 0 2.64-6.36",
    line:           "M5 19L19 5",
    fit:            "M4 8V4h4M4 4l5 5M20 8V4h-4m4 0l-5 5M4 16v4h4m-4 0l5-5M20 16v4h-4m4 0l-5-5",
    cursor:         "M4 4l7 19 3-7 7-3z",
    "eye-off":      "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94 M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19 M1 1l22 22",
    bold:           "M6 4h8a4 4 0 0 1 0 8H6z M6 12h9a4 4 0 0 1 0 8H6z",
    italic:         "M19 4h-9 M14 20H5 M15 4L9 20",
    move:           "M5 9l-3 3 3 3 M9 5l3-3 3 3 M15 19l-3 3-3-3 M19 9l3 3-3 3 M2 12h20 M12 2v20",
    layers:         "M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5",
    pipette:        "M7 21l-4-4 8.5-8.5 4 4L7 21z M14.5 5.5l4 4 M16.5 3.5a2.12 2.12 0 0 1 3 3l-2 2-4-4 2-2z",
    stop:           "M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  };
  const d = paths[name] || "";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {d.split(" M").map((seg, i) => (
        <path key={i} d={i === 0 ? seg : "M" + seg} />
      ))}
    </svg>
  );
}

function Skeleton({ w = "100%", h = 14, r = 6, mb = 0 }) {
  return <div style={{ width: w, height: h, borderRadius: r, background: SB2, marginBottom: mb, animation: "skeleton 1.2s ease infinite" }} />;
}

function PB({ value }) {
  return (
    <div style={{ width: "100%", height: 7, borderRadius: 4, background: SB2, overflow: "hidden" }}>
      <div style={{ width: `${value}%`, height: "100%", borderRadius: 4, background: value > 60 ? GR : value > 30 ? AC : RD, transition: "width 0.4s" }} />
    </div>
  );
}

function Modal({ open, onClose, title, children, wide }) {
  const modalRef = useRef(null);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Focus trap
  useEffect(() => {
    if (!open || !modalRef.current) return;
    const el = modalRef.current;
    const focusable = el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable.length) focusable[0].focus();
    const trap = (e) => {
      if (e.key !== "Tab" || !focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
      else { if (document.activeElement === last) { e.preventDefault(); first.focus(); } }
    };
    el.addEventListener("keydown", trap);
    return () => el.removeEventListener("keydown", trap);
  }, [open]);

  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: SP.lg }} onClick={onClose}>
      <div ref={modalRef} className="ap-modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title} style={{ background: WH, borderRadius: RAD.xxl, width: "100%", maxWidth: wide ? 640 : 520, maxHeight: "85vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)", animation: "modalIn 0.18s ease" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: `${SP.md}px ${SP.lg + 2}px`, borderBottom: `1px solid ${SBB}`, position: "sticky", top: 0, background: WH, borderRadius: `${RAD.xxl}px ${RAD.xxl}px 0 0`, zIndex: 1 }}>
          <span style={{ fontSize: FS.lg + 1, fontWeight: 600, color: TX, lineHeight: LH.tight }}>{title}</span>
          <button onClick={onClose} aria-label="Fermer" style={{ background: "none", border: "none", cursor: "pointer", padding: SP.sm, minWidth: 36, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: RAD.sm }}>
            <Ico name="x" color={TX3} />
          </button>
        </div>
        <div style={{ padding: `${SP.lg}px ${SP.lg + 2}px ${SP.lg + 2}px` }}>{children}</div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, area, half, type = "text", placeholder, select, options, required }) {
  const base = { width: "100%", padding: area ? SP.md : `${SP.sm + 1}px ${SP.md}px`, border: `1px solid ${SBB}`, borderRadius: RAD.md, fontSize: 14, fontFamily: "inherit", background: SB, color: TX, boxSizing: "border-box", lineHeight: LH.normal };
  // Inline validation
  const hasValue = value && value.trim();
  let error = null;
  if (hasValue && type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim())) error = "Email invalide";
  if (hasValue && type === "tel" && value.trim().length > 0 && value.trim().length < 8) error = "Numéro trop court";
  if (required && !hasValue) error = null; // don't show required error while empty (only on save)
  const borderColor = error ? RD : SBB;
  return (
    <div style={{ flex: half ? 1 : undefined, marginBottom: SP.md }}>
      {label && <div style={{ fontSize: FS.base, fontWeight: 500, color: TX2, marginBottom: SP.xs }}>{label}{required ? <span style={{ color: RD, marginLeft: 2 }}>*</span> : ""}</div>}
      {select ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...base, appearance: "auto" }}>
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      ) : area ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={4} placeholder={placeholder} style={{ ...base, resize: "vertical", lineHeight: LH.relaxed, borderColor }} />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ ...base, borderColor }} />
      )}
      {error && <div style={{ fontSize: FS.xs, color: RD, marginTop: SP.xs - 1 }}>{error}</div>}
    </div>
  );
}

function StatusBadge({ statusId, small }) {
  const s = getStatus(statusId);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: small ? 10 : 11, fontWeight: 600, color: s.color, background: s.bg, padding: small ? "2px 7px 2px 5px" : "3px 10px 3px 7px", borderRadius: 20, whiteSpace: "nowrap", letterSpacing: "0.01em" }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.color, display: "inline-block", flexShrink: 0 }} />
      {s.label}
    </span>
  );
}

function PvStatusBadge({ status, onClick }) {
  const s = getPvStatus(status || "draft");
  return (
    <button
      onClick={onClick}
      title={onClick ? "Cliquer pour changer le statut" : undefined}
      style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px 2px 6px", border: `1px solid ${s.bg}`, borderRadius: 20, background: s.bg, cursor: onClick ? "pointer" : "default", fontFamily: "inherit", outline: "none" }}
    >
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.dot, display: "inline-block", flexShrink: 0 }} />
      <span style={{ fontSize: 10, fontWeight: 600, color: s.color, letterSpacing: "0.01em" }}>{s.label}</span>
    </button>
  );
}

function KpiCard({ iconName, label, value, color = TX, sub, extra }) {
  return (
    <div style={{ flex: "1 1 140px", background: WH, border: `1px solid ${SBB}`, borderRadius: 10, padding: "16px 14px", animation: "fadeIn 0.2s ease" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: SB, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Ico name={iconName} size={14} color={TX3} />
        </div>
        <span style={{ fontSize: 11, color: TX3, fontWeight: 500 }}>{label}</span>
        {extra}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color, letterSpacing: "-0.02em", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: TX3, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

const INIT_PROJECTS = [
  {
    id: 1, name: "SNCB Hall n°6", client: "SNCB sa", contractor: "LAURENTY",
    desc: "Rénovation et aménagement des espaces de travail", address: "Schaerbeek, Bruxelles",
    statusId: "construction", progress: 72, bureau: "DEWIL architecten",
    startDate: "25/09/2025", endDate: "28/09/2026", nextMeeting: "09/04/2026", recurrence: "weekly", archived: false,
    participants: [
      { role: "MO", name: "Giorgio CUOMO", email: "giorgio.cuomo@belgiantrain.be", phone: "0491 99 96 67" },
      { role: "MO", name: "Roselien VANDERHASSELT", email: "roselien.vanderhasselt@belgiantrain.be", phone: "0490 49 20 81" },
      { role: "Entreprise", name: "François HAMACKER", email: "francois.hamacker@laurenty.com", phone: "0471 10 75 12" },
      { role: "Architecte", name: "Gaëlle CNOP", email: "gaelle@dewil-architect.be", phone: "0474 50 85 80" },
    ],
    posts: [
      { id: "01", label: "Situation du chantier", notes: "" }, { id: "02", label: "Généralités", notes: "" },
      { id: "03", label: "Planning", notes: "" }, { id: "04", label: "Documents", notes: "" },
      { id: "12", label: "Démolition", notes: "" }, { id: "23", label: "Maçonnerie intérieure", notes: "" },
      { id: "36", label: "Châssis aluminium", notes: "" }, { id: "45", label: "Carrelage sols", notes: "" },
      { id: "49", label: "Faux-plafonds", notes: "" }, { id: "53", label: "Portes intérieures", notes: "" },
      { id: "59", label: "Cloisons", notes: "" },
      { id: "70-HVAC", label: "HVAC", notes: "" }, { id: "70-SAN", label: "Sanitaire", notes: "" }, { id: "70-ELEC", label: "Électricité", notes: "" },
    ],
    pvHistory: [
      { number: 28, date: "01/04/2026", author: "Gaëlle CNOP", postsCount: 14, excerpt: "Peinture démarrée RDC, resserrages coupe-feu en retard...", content: "01. Situation du chantier\n- Les travaux de peinture ont débuté au rez-de-chaussée.\n> Les resserrages coupe-feu n'ont toujours pas été réalisés.\n\n02. Généralités\n- Le MO rappelle l'obligation du port du gilet et du casque.\n\n03. Planning\n- Réception phase 1 repoussée au 22/04/2026." },
      { number: 27, date: "25/03/2026", author: "Gaëlle CNOP", postsCount: 12, excerpt: "Vitrages cloisons mobiles posés, faux-plafonds en cours...", content: "01. Situation\n- Les vitrages des cloisons mobiles ont été posés.\n- La structure des faux-plafonds est en cours." },
      { number: 26, date: "18/03/2026", author: "Meriam GAALOUL", postsCount: 11, excerpt: "Double porte installée, linteau abaissé...", content: "01. Situation\n- La double porte destinée aux dépanneurs est installée.\n- Le linteau a été abaissé." },
    ],
    actions: [
      { id: 1, text: "Resserrages coupe-feu à réaliser", who: "LAURENTY", urgent: true, open: true, since: "PV 26" },
      { id: 2, text: "FT électricité manquantes", who: "LAURENTY", urgent: true, open: true, since: "PV 27" },
      { id: 3, text: "Évaluer peinture atelier", who: "Architecte", urgent: false, open: true, since: "PV 28" },
    ],
  },
  {
    id: 2, name: "Résidence Parc Léopold", client: "Immo Invest SA", contractor: "BESIX",
    desc: "Construction de 24 appartements", address: "Etterbeek, Bruxelles",
    statusId: "execution", progress: 45, bureau: "DEWIL architecten",
    startDate: "15/01/2026", endDate: "15/03/2027", nextMeeting: "10/04/2026", recurrence: "weekly", archived: false,
    participants: [
      { role: "MO", name: "Philippe RENARD", email: "p.renard@immoinvest.be", phone: "0475 12 34 56" },
      { role: "Entreprise", name: "Marc DUBOIS", email: "m.dubois@besix.com", phone: "0476 78 90 12" },
      { role: "Architecte", name: "Gaëlle CNOP", email: "gaelle@dewil-architect.be", phone: "0474 50 85 80" },
    ],
    posts: [
      { id: "01", label: "Situation du chantier", notes: "" }, { id: "02", label: "Généralités", notes: "" },
      { id: "03", label: "Planning", notes: "" }, { id: "20", label: "Fondations", notes: "" },
      { id: "21", label: "Gros œuvre", notes: "" }, { id: "30", label: "Toiture", notes: "" },
    ],
    pvHistory: [{ number: 15, date: "28/03/2026", author: "Gaëlle CNOP", postsCount: 6, excerpt: "Coffrage étage 2 terminé...", content: "01. Situation\n- Coffrage étage 2 terminé.\n- Béton coulé." }],
    actions: [{ id: 1, text: "Plans étage 3 à valider", who: "Architecte", urgent: true, open: true, since: "PV 15" }],
  },
];

const SAMPLES = { "01": "- peinture démarrée rdc, 1ere couche ok\n- goulottes en cours\n- resserrages coupe-feu TOUJOURS PAS FAITS\n> retard 5 jours ouvrables", "02": "- MO rappelle: gilet fluo + casque obligatoires\n- nettoyage insuffisant", "03": "- réception phase 1 repoussée au 22/04", "45": "- bandes antislip posées, conforme\n- carrelage meeting #6 remplacé", "59": "- film opaque posé ok\n- joints vitrages à reprendre", "70-HVAC": "- flexibles corrigés 6/10\n- radiateur hall commandé", "70-ELEC": "- goulottes 5 locaux ok\n- screens en cours" };

// ── Mobile Bottom Tab Bar ──────────────────────────────────
function MobileBottomBar({ view, onNavigate, onCapture }) {
  const isActive = (id) => view === id || (id === "overview" && view === "overview") || (id === "notes" && (view === "notes" || view === "result")) || (id === "plan" && (view === "plan" || view === "planning" || view === "checklists"));
  const TAB_MUTED = "#B5B5B0";
  const Tab = ({ id, icon, label }) => {
    const active = isActive(id);
    return (
      <button onClick={() => onNavigate(id)} aria-label={label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 3, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", padding: "0 0 5px", borderRadius: 0, transition: "color 0.15s", minHeight: 48, position: "relative" }}>
        {active && <div style={{ position: "absolute", top: 4, left: "50%", transform: "translateX(-50%)", width: 20, height: 3, borderRadius: 2, background: AC }} />}
        <Ico name={icon} size={23} color={active ? AC : TAB_MUTED} />
        <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, color: active ? AC : TAB_MUTED, lineHeight: 1, textAlign: "center", width: "100%" }}>{label}</span>
      </button>
    );
  };
  return (
    <nav className="ap-mobile-bar" style={{ display: "none", position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200, paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      {/* Background shape — full width, deep bump hugging the 56px circle */}
      <svg style={{ position: "absolute", top: -36, left: 0, width: "100%", height: "calc(100% + 36px)", pointerEvents: "none", filter: "drop-shadow(0 -1px 3px rgba(0,0,0,0.06))" }} viewBox="0 0 400 98" preserveAspectRatio="none">
        <path d="M0,36 L140,36 C150,36 155,35 160,30 C168,20 177,2 200,2 C223,2 232,20 240,30 C245,35 250,36 260,36 L400,36 L400,98 L0,98 Z" fill={WH} />
        <path d="M0,36 L140,36 C150,36 155,35 160,30 C168,20 177,2 200,2 C223,2 232,20 240,30 C245,35 250,36 260,36 L400,36" fill="none" stroke={SBB} strokeWidth="0.7" />
      </svg>
      <div style={{ position: "relative", display: "flex", alignItems: "flex-end", height: 60, padding: "0 4px" }}>
        {/* Left tabs */}
        <Tab id="overview" icon="building" label="Projet" />
        <Tab id="notes" icon="file" label="PV" />
        {/* Center FAB — raised into the bump */}
        <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", position: "relative" }}>
          <button onClick={onCapture} aria-label="Photo" style={{ width: 62, height: 62, borderRadius: "50%", background: `linear-gradient(145deg, ${AC} 0%, #C06A08 100%)`, border: "none", boxShadow: `0 0 20px rgba(217,123,13,0.4), 0 0 40px rgba(217,123,13,0.15)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, cursor: "pointer", padding: 0, fontFamily: "inherit", position: "absolute", bottom: 14 }}>
            <Ico name="camera" size={26} color="#fff" />
            <span style={{ fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.9)", textAlign: "center", width: "100%" }}>Photo</span>
          </button>
        </div>
        {/* Right tabs */}
        <Tab id="plan" icon="folder" label="Docs" />
        <Tab id="profile" icon="user" label="Profil" />
      </div>
    </nav>
  );
}

// ── Mobile Capture Sheet ──────────────────────────────────
function CaptureSheet({ open, onClose, onPhoto, onGallery, photoCount }) {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 250, display: "flex", flexDirection: "column", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ background: "rgba(0,0,0,0.3)", position: "absolute", inset: 0 }} />
      <div onClick={e => e.stopPropagation()} style={{ position: "relative", background: WH, borderRadius: "20px 20px 0 0", padding: `${SP.xl}px ${SP.lg}px`, paddingBottom: `max(${SP.xl}px, env(safe-area-inset-bottom, 20px))`, animation: "sheetUp 0.25s ease-out" }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: SBB, margin: "0 auto 20px" }} />
        <div style={{ fontSize: FS.lg + 1, fontWeight: 700, color: TX, marginBottom: SP.xs, textAlign: "center" }}>Photos</div>
        <div style={{ fontSize: FS.base, color: TX3, marginBottom: SP.xl, textAlign: "center" }}>Capturez ou consultez les photos du chantier</div>
        <div style={{ display: "flex", gap: SP.md }}>
          {/* Prendre une photo */}
          <button onClick={onPhoto} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: SP.sm, padding: `${SP.xl}px ${SP.md}px`, border: `2px solid ${AC}`, borderRadius: RAD.xxl, background: `linear-gradient(180deg, ${ACL} 0%, #FFF8F0 100%)`, cursor: "pointer", fontFamily: "inherit" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: `linear-gradient(135deg, ${AC} 0%, #C06A08 100%)`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(217,123,13,0.3)" }}>
              <Ico name="camera" size={24} color="#fff" />
            </div>
            <div style={{ fontSize: FS.md + 1, fontWeight: 700, color: TX }}>Prendre</div>
            <div style={{ fontSize: FS.sm, color: TX2, lineHeight: LH.relaxed }}>Ouvrir la caméra</div>
          </button>
          {/* Voir les photos */}
          <button onClick={onGallery} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: SP.sm, padding: `${SP.xl}px ${SP.md}px`, border: `1.5px solid ${SBB}`, borderRadius: RAD.xxl, background: WH, cursor: "pointer", fontFamily: "inherit" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: SB, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Ico name="image" size={24} color={TX2} />
            </div>
            <div style={{ fontSize: FS.md + 1, fontWeight: 700, color: TX }}>Galerie</div>
            <div style={{ fontSize: FS.sm, color: TX3, lineHeight: LH.relaxed }}>{photoCount > 0 ? `${photoCount} photo${photoCount > 1 ? "s" : ""}` : "Aucune photo"}</div>
          </button>
        </div>
        <button onClick={onClose} style={{ width: "100%", marginTop: SP.lg, padding: `${SP.sm + 2}px`, border: `1px solid ${SBB}`, borderRadius: RAD.lg, background: WH, cursor: "pointer", fontSize: FS.md, color: TX3, fontFamily: "inherit" }}>Annuler</button>
      </div>
    </div>
  );
}

function Sidebar({ projects, activeId, view, onSelect, open, onClose, profile, onNewProject, onProfile, installable, onInstall, sharedProjects, onSelectShared, onStats, onPlanning }) {
  const [sortBy, setSortBy] = useState("client"); // "recency" | "name" | "client"
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [collapsedClients, setCollapsedClients] = useState({});
  const t = useT();
  const active = useMemo(() => projects.filter((p) => !p.archived), [projects]);
  const archived = useMemo(() => projects.filter((p) => p.archived), [projects]);
  const sortedActive = useMemo(() => [...active].sort((a, b) => {
    if (sortBy === "name") return a.name.localeCompare(b.name, "fr");
    if (sortBy === "client") return (a.client || "").localeCompare(b.client || "", "fr") || a.name.localeCompare(b.name, "fr");
    const aDate = a.pvHistory?.[0]?.date || "";
    const bDate = b.pvHistory?.[0]?.date || "";
    return bDate.localeCompare(aDate) || b.id - a.id;
  }), [active, sortBy]);

  // Group by client
  const clientGroups = useMemo(() => sortBy === "client" ? sortedActive.reduce((acc, p) => {
    const client = p.client || "Sans client";
    if (!acc[client]) acc[client] = [];
    acc[client].push(p);
    return acc;
  }, {}) : null, [sortedActive, sortBy]);
  const toggleClient = (client) => setCollapsedClients(prev => ({ ...prev, [client]: !prev[client] }));

  const TX4 = "#8A8A85"; // muted text (sidebar only)

  // Swipe to dismiss
  const touchRef = useRef(null);
  const handleTouchStart = (e) => { touchRef.current = e.touches[0].clientX; };
  const handleTouchEnd = (e) => {
    if (touchRef.current === null) return;
    const diff = e.changedTouches[0].clientX - touchRef.current;
    if (diff < -60) onClose(); // swipe left > 60px = close
    touchRef.current = null;
  };

  return (
    <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} style={{ position: "fixed", left: 0, top: 0, bottom: 0, width: 264, background: SB, borderRight: `1px solid ${SBB}`, display: "flex", flexDirection: "column", zIndex: 100, transform: open ? "translateX(0)" : "translateX(-264px)", transition: "transform 0.25s ease" }}>

      {/* ── Branding + collapse ── */}
      <div style={{ padding: "16px 18px 14px", borderBottom: `1px solid ${SBB}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: AC, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 15, fontWeight: 800, letterSpacing: "-0.5px", flexShrink: 0 }}>A</div>
          <div style={{ flex: 1 }}>
            <div style={{ color: TX, fontSize: 14, fontWeight: 700, letterSpacing: "-0.2px" }}>ArchiPilot</div>
            <div style={{ color: TX3, fontSize: 10, marginTop: 1 }}>{t("app.tagline")}</div>
          </div>
          <button onClick={onClose} title="Réduire la barre latérale" style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.15s" }} onMouseEnter={e => e.currentTarget.style.background = SB2} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            <Ico name="back" size={14} color={TX3} />
          </button>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 10px 10px" }}>

        {/* CTA Nouveau projet — pleine largeur */}
        <button onClick={onNewProject} className="sb-cta" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 0", border: "none", borderRadius: 8, background: AC, cursor: "pointer", fontFamily: "inherit", marginBottom: 16 }}>
          <Ico name="plus" size={13} color="#fff" />
          <span style={{ fontSize: 12, fontWeight: 700, color: "#fff", letterSpacing: "0.01em" }}>{t("sidebar.newProject")}</span>
        </button>

        {/* Navigation — Dashboard + Planning */}
        <div style={{ display: "flex", gap: 4, marginBottom: SP.md }}>
          {[
            { id: "stats", label: "Dashboard", icon: "chart", onClick: onStats },
            { id: "planningDashboard", label: "Planning", icon: "calendar", onClick: onPlanning },
          ].map(btn => {
            const isAct = view === btn.id;
            return (
              <button key={btn.id} onClick={btn.onClick} className="sb-nav" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: `${SP.sm - 1}px ${SP.xs}px`, border: "none", borderRadius: RAD.sm, cursor: "pointer", fontFamily: "inherit", background: isAct ? WH : "transparent", boxShadow: isAct ? "0 1px 3px rgba(0,0,0,0.06)" : "none", transition: "background 0.15s" }}>
                <Ico name={btn.icon} size={13} color={isAct ? AC : TX3} />
                <span style={{ fontSize: FS.sm, fontWeight: isAct ? 600 : 500, color: isAct ? AC : TX2 }}>{btn.label}</span>
              </button>
            );
          })}
        </div>

        {/* Section header + mode de vue */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: `0 ${SP.xs}px`, marginBottom: SP.sm }}>
          <div style={{ display: "flex", alignItems: "center", gap: SP.xs }}>
            <span style={{ fontSize: FS.xs, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: TX2 }}>{t("sidebar.projects")}</span>
            {/* Collapse all — visible en mode client avec 2+ groupes */}
            {sortBy === "client" && clientGroups && Object.keys(clientGroups).length > 1 && (
              <button onClick={() => {
                const allCollapsed = Object.keys(clientGroups).every(c => collapsedClients[c]);
                setCollapsedClients(allCollapsed ? {} : Object.keys(clientGroups).reduce((a, c) => ({ ...a, [c]: true }), {}));
              }} title={Object.keys(clientGroups).every(c => collapsedClients[c]) ? "Tout déplier" : "Tout replier"} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: SP.xs }}>
                <Ico name={Object.keys(clientGroups).every(c => collapsedClients[c]) ? "chevron-down" : "chevron-up"} size={10} color={TX3} />
              </button>
            )}
          </div>
          <div style={{ display: "flex", background: SB2, borderRadius: RAD.sm, padding: 2, gap: 1 }}>
            {[
              { id: "client", icon: "folder", label: "Client" },
              { id: "recency", icon: "clock", label: "R\u00E9cents" },
              { id: "name", icon: null, label: "A\u2192Z" },
            ].map(s => (
              <button key={s.id} onClick={() => setSortBy(s.id)} style={{ display: "flex", alignItems: "center", gap: 3, padding: `3px ${RAD.sm}px`, border: "none", borderRadius: 5, background: sortBy === s.id ? WH : "transparent", cursor: "pointer", fontFamily: "inherit", boxShadow: sortBy === s.id ? "0 1px 2px rgba(0,0,0,0.08)" : "none", transition: "all 0.15s" }}>
                {s.icon && <Ico name={s.icon} size={FS.xs} color={sortBy === s.id ? AC : TX3} />}
                <span style={{ fontSize: 9, fontWeight: 600, color: sortBy === s.id ? AC : TX3 }}>{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Liste des projets */}
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {sortBy === "client" && clientGroups ? (
            Object.entries(clientGroups).map(([client, clientProjects], gi) => {
              const collapsed = collapsedClients[client];
              const hasActive = clientProjects.some(p => p.id === activeId);
              return (
                <div key={client} style={{ marginBottom: 2 }}>
                  {/* Separator between client groups */}
                  {gi > 0 && <div style={{ height: 1, background: SBB, margin: "6px 6px 6px 6px", opacity: 0.6 }} />}
                  {/* Client section header */}
                  <button onClick={() => toggleClient(client)} className="sb-client" style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 8,
                    padding: "7px 6px", border: "none", background: "transparent",
                    cursor: "pointer", fontFamily: "inherit", borderRadius: 6,
                  }}>
                    <Ico name={collapsed ? "chevron-right" : "chevron-down"} size={10} color={TX3} />
                    <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: hasActive ? TX : TX2, textAlign: "left", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: "-0.1px" }}>{client}</span>
                    <span style={{ fontSize: 9, color: TX4, fontWeight: 600, flexShrink: 0 }}>{clientProjects.length}</span>
                  </button>
                  {/* Projects in this client group */}
                  {!collapsed && (
                    <div style={{ marginLeft: 14, borderLeft: `2px solid ${hasActive ? ACL2 : SBB}`, paddingLeft: 0, transition: "border-color 0.2s" }}>
                      {clientProjects.map((p) => {
                        const st = getStatus(p.statusId);
                        const isAct = activeId === p.id;
                        const pvCount = (p.pvHistory || []).length;
                        return (
                          <button key={p.id} onClick={() => { onSelect(p.id); }} title={`${p.name} · ${st.label}${pvCount ? ` · ${pvCount} PV` : ""}`} className="sb-project" style={{
                            width: "100%", display: "flex", alignItems: "center", gap: 8,
                            padding: "7px 10px 7px 12px",
                            border: "none",
                            borderRadius: 7, cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                            background: isAct ? WH : "transparent",
                            boxShadow: isAct ? "0 1px 4px rgba(0,0,0,0.06)" : "none",
                            transition: "background 0.15s, box-shadow 0.15s", marginTop: 1,
                          }}>
                            <div style={{ width: 26, height: 26, borderRadius: 6, background: isAct ? st.bg : SB2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.15s" }}>
                              <Ico name="building" size={12} color={isAct ? st.color : TX4} />
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: 12, fontWeight: isAct ? 650 : 500, color: isAct ? TX : TX2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: "16px" }}>{p.name}</div>
                              <div style={{ fontSize: 9, color: isAct ? TX3 : TX4, marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                                <span style={{ fontSize: 9, fontWeight: 600, color: st.color, background: st.bg, padding: "1px 6px", borderRadius: 4, lineHeight: "14px" }}>{st.label}</span>
                                {pvCount > 0 && <span style={{ color: isAct ? AC : TX4, fontWeight: 600 }}>{pvCount} PV</span>}
                              </div>
                            </div>
                            {isAct && <div style={{ width: 5, height: 5, borderRadius: "50%", background: AC, flexShrink: 0 }} />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            sortedActive.map((p) => {
              const st = getStatus(p.statusId);
              const isActive = activeId === p.id;
              const pvCount = (p.pvHistory || []).length;
              return (
                <button
                  key={p.id}
                  onClick={() => { onSelect(p.id); }}
                  title={`${p.name} · ${p.client || ""} · ${st.label}${pvCount ? ` · ${pvCount} PV` : ""}`}
                  className="sb-project"
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 9,
                    padding: isActive ? "9px 10px 9px 10px" : "8px 10px 8px 12px",
                    border: "none",
                    borderLeft: isActive ? `3px solid ${AC}` : "3px solid transparent",
                    borderRadius: 8, cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                    background: isActive ? WH : "transparent",
                    boxShadow: isActive ? "0 1px 5px rgba(0,0,0,0.06)" : "none",
                    transition: "background 0.15s, box-shadow 0.15s",
                  }}
                >
                  <div style={{ width: 30, height: 30, borderRadius: 7, background: isActive ? st.bg : SB2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.15s" }}>
                    <Ico name="building" size={14} color={isActive ? st.color : TX4} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: isActive ? 650 : 500, color: isActive ? TX : TX2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: "17px" }}>{p.name}</div>
                    <div style={{ fontSize: 10, color: isActive ? TX3 : TX4, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 4 }}>
                      <span>{p.client}</span>
                      {pvCount > 0 && <span style={{ color: isActive ? AC : TX4, fontWeight: 600 }}>&middot; {pvCount} PV</span>}
                    </div>
                  </div>
                  {isActive && (
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: AC, flexShrink: 0 }} />
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Section Partagés */}
        {sharedProjects && sharedProjects.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 4px", marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: TX2 }}>{t("collab.sharedWithMe")}</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: TX3, background: SB2, padding: "1px 6px", borderRadius: 10 }}>{sharedProjects.length}</span>
            </div>
            {sharedProjects.map((p) => (
              <button key={`shared-${p._ownerId}-${p.id}`} onClick={() => { onSelectShared(p); }} className="sb-project" style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "7px 10px 7px 12px", border: "none", borderLeft: "3px solid transparent", borderRadius: 8, cursor: "pointer", textAlign: "left", fontFamily: "inherit", background: "transparent", marginTop: 1, transition: "background 0.15s" }}>
                <div style={{ width: 28, height: 28, borderRadius: 7, background: ACL, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Ico name="users" size={13} color={AC} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 12, color: TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>{p.name}</span>
                  <span style={{ fontSize: 10, color: TX4 }}>{t(`collab.role${p._role.charAt(0).toUpperCase() + p._role.slice(1)}`)}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Section Archivés — masquée si vide */}
        {archived.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <button
              onClick={() => setArchivedOpen((v) => !v)}
              className="sb-client"
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 4px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", borderRadius: 6 }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: TX2 }}>{t("sidebar.archived")}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: TX4, background: SB2, padding: "1px 6px", borderRadius: 10 }}>{archived.length}</span>
              </div>
              <Ico name={archivedOpen ? "chevron-up" : "chevron-down"} size={11} color={TX3} />
            </button>

            {archivedOpen && archived.map((p) => (
              <button key={p.id} onClick={() => { onSelect(p.id); }} className="sb-project" style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "7px 10px 7px 12px", border: "none", borderLeft: "3px solid transparent", borderRadius: 8, cursor: "pointer", textAlign: "left", fontFamily: "inherit", background: "transparent", marginTop: 1, transition: "background 0.15s" }}>
                <div style={{ width: 28, height: 28, borderRadius: 7, background: SB2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: 0.6 }}>
                  <Ico name="archive" size={13} color={TX3} />
                </div>
                <span style={{ fontSize: 12, color: TX3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
              </button>
            ))}
          </div>
        )}

      </div>

      {/* ── Installer PWA ── */}
      {installable && (
        <div style={{ padding: "0 10px 10px", flexShrink: 0 }}>
          <button onClick={onInstall} style={{ width: "100%", padding: "9px 12px", border: `1px solid ${ACL2}`, borderRadius: 8, background: ACL, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontFamily: "inherit" }}>
            <Ico name="install" size={14} color={AC} />
            <div style={{ flex: 1, textAlign: "left" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: AC }}>{t("sidebar.install")}</div>
              <div style={{ fontSize: 10, color: TX3, marginTop: 1 }}>{t("sidebar.installDesc")}</div>
            </div>
          </button>
        </div>
      )}

      {/* ── Footer : profil + déconnexion ── */}
      <div style={{ padding: "10px 10px 12px", flexShrink: 0, borderTop: `1px solid ${SBB}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "0 4px" }}>
          {/* Avatar — cliquable vers profil */}
          <button onClick={onProfile} aria-label="Mon profil" className="sb-avatar" style={{ width: 32, height: 32, borderRadius: "50%", background: ACL, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 11, fontWeight: 700, color: AC, border: `2px solid transparent`, cursor: "pointer", transition: "border-color 0.15s", padding: 0, fontFamily: "inherit" }}>
            {(profile?.name || "?").split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
          </button>
          {/* Nom + structure — cliquable vers profil */}
          <button onClick={onProfile} className="sb-profile-text" style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", cursor: "pointer", textAlign: "left", padding: 0, fontFamily: "inherit" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: "16px" }}>{profile?.name || "Mon profil"}</div>
            <div style={{ fontSize: 10, color: TX4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: "14px" }}>{profile?.structure || ""}</div>
          </button>
          {/* Logout — icône, toggle confirm */}
          <button onClick={() => setLogoutConfirm(v => !v)} aria-label="Se déconnecter" className="sb-logout-icon" title={t("sidebar.logout")} style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: logoutConfirm ? SB2 : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0, transition: "background 0.15s" }}>
            <Ico name="logout" size={14} color={logoutConfirm ? RD : TX3} />
          </button>
        </div>
        {/* Confirmation de déconnexion */}
        {logoutConfirm && (
          <div style={{ display: "flex", gap: 6, marginTop: 8, padding: "0 4px", animation: "fadeIn 0.15s ease-out" }}>
            <button onClick={() => setLogoutConfirm(false)} style={{ flex: 1, padding: "7px 0", border: `1px solid ${SBB}`, borderRadius: 6, background: WH, cursor: "pointer", fontSize: 11, fontWeight: 500, color: TX2, fontFamily: "inherit", transition: "background 0.15s" }}>
              Annuler
            </button>
            <button onClick={() => supabase.auth.signOut()} style={{ flex: 1, padding: "7px 0", border: "none", borderRadius: 6, background: RD, cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#fff", fontFamily: "inherit", transition: "background 0.15s" }}>
              Se déconnecter
            </button>
          </div>
        )}
      </div>

    </div>
  );
}

// ── Collab Modal Wrapper (gets userId) ─────────────────────
function CollabModalWrapper({ project, onClose, showToast, profile }) {
  const [ownerId, setOwnerId] = useState(project._ownerId || null);
  useEffect(() => {
    if (!ownerId) {
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) setOwnerId(user.id);
      });
    }
  }, [ownerId]);
  if (!ownerId) return null;
  return <CollabModal project={project} ownerId={ownerId} onClose={onClose} showToast={showToast} profile={profile} />;
}

// ── Upgrade Gate Component ──────────────────────────────────
function UpgradeGate({ plan, feature, children, fallback }) {
  if (hasFeature(plan, feature)) return children;
  if (fallback) return fallback;
  const minPlan = PLAN_FEATURES[feature]?.pro ? "pro" : "team";
  return (
    <div style={{ padding: "16px", background: SB, borderRadius: 10, border: `1px solid ${SBB}`, textAlign: "center" }}>
      <Ico name="lock" size={20} color={TX3} />
      <div style={{ fontSize: 12, fontWeight: 600, color: TX, marginTop: 6 }}>Fonctionnalité {PLANS[minPlan]?.label}</div>
      <div style={{ fontSize: 11, color: TX3, marginTop: 2 }}>Passez au plan {PLANS[minPlan]?.label} pour débloquer</div>
    </div>
  );
}

// ── Pricing Section (for profile) ───────────────────────────
function PricingSection({ currentPlan, onSelectPlan }) {
  const t = useT();
  const plans = [
    { ...PLANS.free, desc: t("plan.freeDesc"), features: ["1 projet", "3 PV / mois", "3 IA / mois", "PDF avec watermark"] },
    { ...PLANS.pro, desc: t("plan.proDesc"), popular: true, features: ["Projets illimités", "PV illimités", "IA illimitée", "Envoi email PV", "Galerie photos", "Planning & Lots", "3 collaborateurs / projet", "PDF sans watermark"] },
    { ...PLANS.team, desc: t("plan.teamDesc"), features: ["Tout le Pro", "Collaborateurs illimités", "Rôles & permissions", "Dashboard complet", "Planning cross-projets", "Export CSV", "PDF logo personnalisé", "Support prioritaire"] },
  ];
  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 700, color: TX, marginBottom: 4 }}>Votre abonnement</div>
      <div style={{ fontSize: 12, color: TX3, marginBottom: 16 }}>Plan actuel : <strong style={{ color: AC }}>{PLANS[currentPlan]?.label || "Free"}</strong></div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {plans.map(p => {
          const isCurrent = p.id === currentPlan;
          return (
            <div key={p.id} style={{ flex: "1 1 200px", minWidth: 180, background: WH, border: `${p.popular ? "2px" : "1px"} solid ${p.popular ? AC : SBB}`, borderRadius: 14, padding: "18px 16px", position: "relative", display: "flex", flexDirection: "column" }}>
              {p.popular && <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#fff", background: AC, padding: "2px 10px", borderRadius: 10 }}>Populaire</div>}
              <div style={{ fontSize: 16, fontWeight: 700, color: TX }}>{p.label}</div>
              <div style={{ fontSize: 11, color: TX3, marginBottom: 10 }}>{p.desc}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 2, marginBottom: 12 }}>
                <span style={{ fontSize: 28, fontWeight: 800, color: TX }}>{p.price === 0 ? "0" : p.price}€</span>
                <span style={{ fontSize: 11, color: TX3 }}>/mois</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
                {p.features.map((f, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: TX2 }}>
                    <Ico name="check" size={10} color={GR} />
                    {f}
                  </div>
                ))}
              </div>
              {isCurrent ? (
                <div style={{ width: "100%", padding: "9px 16px", border: `1px solid ${SBB}`, borderRadius: 8, textAlign: "center", fontSize: 12, fontWeight: 600, color: TX3, marginTop: 14 }}>Plan actuel</div>
              ) : (
                <button onClick={() => onSelectPlan(p.id)} style={{ width: "100%", padding: "9px 16px", border: "none", borderRadius: 8, background: p.popular ? AC : SB, color: p.popular ? "#fff" : TX, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginTop: 14 }}>
                  {p.price === 0 ? "Rétrograder" : `Passer au ${p.label}`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Project Permissions Helper ──────────────────────────────
const getProjectRole = (project) => {
  if (project._shared) return project._role || "reader";
  return "owner"; // project owner has full access
};
const canEdit = (project) => { const r = getProjectRole(project); return r === "owner" || r === "admin" || r === "contributor"; };
const canManageMembers = (project) => { const r = getProjectRole(project); return r === "owner" || r === "admin"; };
const canManageSettings = (project) => { const r = getProjectRole(project); return r === "owner" || r === "admin"; };
const isReadOnly = (project) => getProjectRole(project) === "reader";

// ── Invite / Members Modal ─────────────────────────────────
function CollabModal({ project, ownerId, onClose, showToast, profile }) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("contributor");
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const isAdmin = canManageMembers(project) || !project._shared; // owner or admin

  useEffect(() => {
    loadProjectMembers(String(project.id), ownerId).then(setMembers);
  }, [project.id, ownerId]);

  const adminCount = members.filter(m => m.role === "admin" && m.status === "accepted").length;

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError(""); setLoading(true);
    const res = await inviteMember(String(project.id), ownerId, email.trim(), role, project.name, profile?.name || profile?.email || "");
    setLoading(false);
    if (res.error === "already_invited") { setError(t("collab.alreadyInvited")); return; }
    if (res.error) { setError(res.error); return; }
    setEmail("");
    showToast(t("collab.inviteSent"));
    track("invite_sent", { role, project_name: project.name, _page: "collab" });
    loadProjectMembers(String(project.id), ownerId).then(setMembers);
  };

  const handleRemove = async (id) => {
    const member = members.find(m => m.id === id);
    if (member?.role === "admin" && adminCount <= 1) { setError(t("collab.lastAdmin")); return; }
    await removeMember(id);
    setMembers(prev => prev.filter(m => m.id !== id));
  };

  const handleRoleChange = async (id, newRole) => {
    const member = members.find(m => m.id === id);
    if (member?.role === "admin" && newRole !== "admin" && adminCount <= 1) { setError(t("collab.lastAdmin")); return; }
    setError("");
    await updateMemberRole(id, newRole);
    setMembers(prev => prev.map(m => m.id === id ? { ...m, role: newRole } : m));
  };

  const ROLES = [
    { id: "admin", label: t("collab.roleAdmin"), desc: t("collab.roleAdminDesc") },
    { id: "contributor", label: t("collab.roleContributor"), desc: t("collab.roleContributorDesc") },
    { id: "reader", label: t("collab.roleReader"), desc: t("collab.roleReaderDesc") },
  ];

  const statusColors = { pending: "#E8A317", accepted: GR, declined: RD };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500 }} onClick={onClose}>
      <div style={{ background: WH, borderRadius: 16, width: "100%", maxWidth: 520, maxHeight: "85vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)", animation: "modalIn 0.2s ease-out" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${SBB}` }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: TX, marginBottom: 4 }}>{t("collab.inviteTitle")}</div>
          <div style={{ fontSize: 12, color: TX3 }}>{t("collab.inviteDesc")}</div>
        </div>

        {/* Invite form — admin only */}
        {isAdmin ? (
          <form onSubmit={handleInvite} style={{ padding: "16px 24px", borderBottom: `1px solid ${SBB}` }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder={t("collab.email")}
                required
                style={{ flex: 1, padding: "9px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: SB, color: TX, boxSizing: "border-box", minWidth: 0 }}
              />
              <select value={role} onChange={e => setRole(e.target.value)} style={{ padding: "9px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: SB, color: TX, cursor: "pointer" }}>
                {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>
            {/* Role description */}
            <div style={{ fontSize: 11, color: TX3, marginBottom: 10, lineHeight: 1.4 }}>
              {ROLES.find(r => r.id === role)?.desc}
              <span style={{ display: "block", fontSize: 10, color: AC, marginTop: 3, fontWeight: 500 }}>{t("collab.roleNote")}</span>
            </div>
            {error && <div style={{ fontSize: 12, color: RD, marginBottom: 8 }}>{error}</div>}
            <button type="submit" disabled={loading} style={{ padding: "9px 20px", border: "none", borderRadius: 8, background: AC, color: "#fff", fontSize: 13, fontWeight: 600, cursor: loading ? "wait" : "pointer", fontFamily: "inherit" }}>
              {loading ? "..." : t("collab.send")}
            </button>
          </form>
        ) : (
          <div style={{ padding: "12px 24px", borderBottom: `1px solid ${SBB}`, fontSize: 12, color: TX3, fontStyle: "italic" }}>
            Seuls les admins peuvent inviter des membres.
          </div>
        )}

        {/* Members list */}
        <div style={{ padding: "12px 24px 20px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 10 }}>{t("collab.members")} ({members.length})</div>
          {error && members.length > 0 && <div style={{ fontSize: 11, color: RD, marginBottom: 8 }}>{error}</div>}
          {members.length === 0 && (
            <div style={{ fontSize: 13, color: TX3, padding: "8px 0" }}>{t("collab.noMembers")}</div>
          )}
          {members.map(m => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${SBB}` }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: ACL, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: AC, flexShrink: 0 }}>
                {(m.invited_name || m.invited_email || "?").charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: TX, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.invited_name || m.invited_email}</div>
                <div style={{ fontSize: 11, color: TX3 }}>{m.invited_email}</div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, color: statusColors[m.status] || TX3, textTransform: "uppercase" }}>
                {t(`collab.${m.status}`)}
              </span>
              {isAdmin ? (
                <>
                  <select value={m.role} onChange={e => handleRoleChange(m.id, e.target.value)} style={{ padding: "4px 8px", border: `1px solid ${SBB}`, borderRadius: 6, fontSize: 11, fontFamily: "inherit", background: SB, color: TX2, cursor: "pointer" }}>
                    {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                  </select>
                  <button onClick={() => handleRemove(m.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                    <Ico name="x" size={14} color={TX3} />
                  </button>
                </>
              ) : (
                <span style={{ fontSize: 11, fontWeight: 500, color: TX2 }}>{ROLES.find(r => r.id === m.role)?.label}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Weather Widget (OpenMeteo — free, no API key) ───────────
function WeatherWidget({ address }) {
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!address) { setLoading(false); return; }
    (async () => {
      try {
        // Extract city from address — try last parts (e.g. "Rue X 12, 1000 Bruxelles" → "Bruxelles")
        const parts = address.split(",").map(s => s.trim());
        const searchTerms = [
          parts[parts.length - 1],  // last part (usually city)
          parts.length > 1 ? parts[parts.length - 1].replace(/^\d+\s*/, "") : null, // remove postal code
          address, // full address as fallback
        ].filter(Boolean);

        let loc = null;
        for (const term of searchTerms) {
          const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(term)}&count=1&language=fr`);
          const geoData = await geoRes.json();
          loc = geoData?.results?.[0];
          if (loc) break;
        }
        if (!loc) { setLoading(false); return; }

        // Get weather
        const wRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&timezone=auto`);
        const wData = await wRes.json();
        const c = wData?.current;
        if (!c) { setLoading(false); return; }

        const codes = { 0: "Ciel dégagé", 1: "Principalement dégagé", 2: "Partiellement nuageux", 3: "Couvert", 45: "Brouillard", 48: "Brouillard givrant", 51: "Bruine légère", 53: "Bruine modérée", 55: "Bruine forte", 61: "Pluie légère", 63: "Pluie modérée", 65: "Pluie forte", 71: "Neige légère", 73: "Neige modérée", 75: "Neige forte", 80: "Averses légères", 81: "Averses modérées", 82: "Averses fortes", 95: "Orage", 96: "Orage grêle" };
        const icons = { 0: "☀️", 1: "🌤️", 2: "⛅", 3: "☁️", 45: "🌫️", 48: "🌫️", 51: "🌦️", 53: "🌧️", 55: "🌧️", 61: "🌧️", 63: "🌧️", 65: "🌧️", 71: "🌨️", 73: "🌨️", 75: "🌨️", 80: "🌦️", 81: "🌧️", 82: "🌧️", 95: "⛈️", 96: "⛈️" };

        setWeather({
          temp: Math.round(c.temperature_2m),
          desc: codes[c.weather_code] || "—",
          icon: icons[c.weather_code] || "🌡️",
          wind: Math.round(c.wind_speed_10m),
          humidity: c.relative_humidity_2m,
          lat: loc.latitude,
          lon: loc.longitude,
          city: loc.name,
        });
      } catch (e) { console.error("Weather fetch error:", e); }
      setLoading(false);
    })();
  }, [address]);

  if (loading || !weather) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: WH, border: `1px solid ${SBB}`, borderRadius: 10 }}>
      <span style={{ fontSize: 28 }}>{weather.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: TX }}>{weather.temp}°C</span>
          <span style={{ fontSize: 11, color: TX3 }}>{weather.desc}</span>
        </div>
        <div style={{ fontSize: 10, color: TX3, marginTop: 1 }}>
          Vent {weather.wind} km/h · Humidité {weather.humidity}% · {weather.city}
        </div>
      </div>
      <a href={`https://www.google.com/maps?q=${weather.lat},${weather.lon}`} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 7, background: SB, border: `1px solid ${SBB}`, textDecoration: "none" }} title="Voir sur Google Maps">
        <Ico name="mappin" size={13} color={TX3} />
      </a>
    </div>
  );
}

// ── Meeting Card (editable) ─────────────────────────────────
const MEETING_MODES = [
  { id: "onsite", label: "Sur site", icon: "building", color: AC },
  { id: "remote", label: "À distance", icon: "users", color: BL },
  { id: "hybrid", label: "Hybride", icon: "repeat", color: VI },
];

function MeetingCard({ project, setProjects, rec }) {
  const [editing, setEditing] = useState(false);
  const [dateVal, setDateVal] = useState(project.nextMeeting || "");
  const meetingMode = project.meetingMode || "onsite";
  const t = useT();

  const update = (patch) => setProjects(prev => prev.map(p => p.id === project.id ? { ...p, ...patch } : p));
  const days = daysUntil(project.nextMeeting);
  const isPast = days !== null && days < 0;
  const isToday = days === 0;
  const isSoon = days !== null && days > 0 && days <= 2;
  const mode = MEETING_MODES.find(m => m.id === meetingMode) || MEETING_MODES[0];
  const suggested = rec && rec.id !== "none" ? calcNextMeeting(project.nextMeeting, project.recurrence) : null;

  const Card = ({ children, style = {} }) => (
    <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 12, padding: "16px 18px", ...style }}>{children}</div>
  );

  return (
    <Card style={{ background: project.nextMeeting ? ACL : WH, border: `1px solid ${project.nextMeeting ? ACL2 : SBB}` }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: AC, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>{t("project.nextMeeting")}</div>

      {editing ? (
        <div>
          {/* Date input */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 500, color: TX2, display: "block", marginBottom: 4 }}>Date</label>
            <input
              type="text" value={dateVal} onChange={e => setDateVal(e.target.value)}
              placeholder="dd/mm/yyyy" autoFocus
              style={{ width: "100%", padding: "8px 10px", border: `1px solid ${SBB}`, borderRadius: 6, fontSize: 13, fontFamily: "inherit", background: WH, color: TX, boxSizing: "border-box" }}
            />
          </div>
          {/* Meeting mode */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 500, color: TX2, display: "block", marginBottom: 4 }}>Format</label>
            <div style={{ display: "flex", gap: 4 }}>
              {MEETING_MODES.map(m => (
                <button key={m.id} onClick={() => update({ meetingMode: m.id })} style={{
                  flex: 1, padding: "6px 8px", border: `1.5px solid ${meetingMode === m.id ? m.color : SBB}`,
                  borderRadius: 6, background: meetingMode === m.id ? m.color + "14" : WH,
                  cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                }}>
                  <Ico name={m.icon} size={10} color={meetingMode === m.id ? m.color : TX3} />
                  <span style={{ fontSize: 10, fontWeight: 600, color: meetingMode === m.id ? m.color : TX3 }}>{m.label}</span>
                </button>
              ))}
            </div>
          </div>
          {/* Recurrence quick display */}
          {rec && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 10, fontSize: 10, color: TX3 }}>
              <Ico name="repeat" size={10} color={TX3} />
              {rec.label}
            </div>
          )}
          {/* Save / Cancel */}
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => { update({ nextMeeting: dateVal }); setEditing(false); }} style={{ flex: 1, padding: "7px 12px", border: "none", borderRadius: 6, background: AC, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Enregistrer</button>
            <button onClick={() => { setDateVal(project.nextMeeting || ""); setEditing(false); }} style={{ padding: "7px 12px", border: `1px solid ${SBB}`, borderRadius: 6, background: WH, color: TX3, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Annuler</button>
          </div>
        </div>
      ) : (
        <div>
          {/* Date display */}
          {project.nextMeeting ? (
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 20, fontWeight: 700, color: TX, letterSpacing: "-0.5px", lineHeight: 1.2 }}>{project.nextMeeting}</span>
                {isToday && <span style={{ fontSize: 11, fontWeight: 700, color: AC, background: WH, padding: "2px 8px", borderRadius: 10 }}>Aujourd'hui</span>}
                {isSoon && <span style={{ fontSize: 11, fontWeight: 600, color: AC }}>dans {days}j</span>}
                {isPast && <span style={{ fontSize: 11, fontWeight: 600, color: RD }}>passée ({Math.abs(days)}j)</span>}
                {days !== null && days > 2 && <span style={{ fontSize: 11, color: TX3 }}>dans {days} jours</span>}
              </div>
              {/* Mode badge */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", background: WH, border: `1px solid ${mode.color}22`, borderRadius: 6 }}>
                  <Ico name={mode.icon} size={10} color={mode.color} />
                  <span style={{ fontSize: 10, fontWeight: 600, color: mode.color }}>{mode.label}</span>
                </div>
                {rec && rec.id !== "none" && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                    <Ico name="repeat" size={10} color={TX3} />
                    <span style={{ fontSize: 10, color: TX3 }}>{rec.label}</span>
                  </div>
                )}
                {rec && rec.id === "none" && (
                  <span style={{ fontSize: 10, color: TX3 }}>Ponctuel</span>
                )}
              </div>
              {/* Suggest next if past */}
              {isPast && suggested && (
                <button onClick={() => { update({ nextMeeting: suggested }); setDateVal(suggested); }} style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", border: `1px solid ${AC}`, borderRadius: 6, background: WH, cursor: "pointer", fontFamily: "inherit", fontSize: 10, fontWeight: 600, color: AC, width: "100%" }}>
                  <Ico name="repeat" size={10} color={AC} />Planifier la prochaine : {suggested}
                </button>
              )}
            </div>
          ) : (
            <span style={{ fontSize: 14, color: TX3, fontWeight: 400 }}>{t("project.notPlanned")}</span>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button onClick={() => { setDateVal(project.nextMeeting || ""); setEditing(true); }} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "6px 10px", border: `1px solid ${ACL2}`, borderRadius: 6, background: WH, fontSize: 10, fontWeight: 600, color: AC, cursor: "pointer", fontFamily: "inherit" }}>
              <Ico name="edit" size={11} color={AC} />{project.nextMeeting ? "Modifier" : "Planifier"}
            </button>
            {project.nextMeeting && getGoogleCalendarUrl(project) && (
              <a href={getGoogleCalendarUrl(project)} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "6px 10px", border: `1px solid ${ACL2}`, borderRadius: 6, background: WH, fontSize: 10, fontWeight: 600, color: AC, textDecoration: "none" }}>
                <Ico name="calendar" size={10} color={AC} />Cal
              </a>
            )}
            {project.nextMeeting && (
              <button onClick={() => downloadICS(project)} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "6px 10px", border: `1px solid ${ACL2}`, borderRadius: 6, background: WH, fontSize: 10, fontWeight: 600, color: AC, cursor: "pointer", fontFamily: "inherit" }}>
                <Ico name="download" size={10} color={AC} />.ics
              </button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// ── PV Row (reusable) ────────────────────────────────────────
function PvRow({ pv, onViewPV, onViewPdf, updatePvStatus, t }) {
  const hasInput = pv.inputNotes && pv.inputNotes.length > 0;
  const hasContent = !!(pv.content || pv.pdfDataUrl);
  return (
    <div
      className="plan-file-row"
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderTop: `1px solid ${SB2}`, borderRadius: 8, marginTop: 1 }}
    >
      <div style={{ width: 28, height: 28, borderRadius: 7, background: pv.imported ? BLB : SB, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Ico name={pv.imported ? "upload" : "file"} size={12} color={pv.imported ? BL : TX3} />
      </div>
      <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => onViewPV(pv)}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: TX }}>{pv.title || `PV n°${pv.number}`}</span>
          {pv.imported
            ? <span style={{ fontSize: 9, fontWeight: 600, color: BL, background: BLB, padding: "1px 6px", borderRadius: 10 }}>{t("project.imported")}</span>
            : <PvStatusBadge status={pv.status} onClick={(e) => { e.stopPropagation(); updatePvStatus(pv.number, nextPvStatus(pv.status || "draft")); }} />
          }
        </div>
        <div style={{ fontSize: FS.xs, color: TX3, marginTop: 1 }}><span title={pv.date}>{relativeDate(pv.date)}</span> · {pv.author}</div>
      </div>
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        {/* Bouton Rédaction — ouvre le contenu texte/notes */}
        <button onClick={() => onViewPV(pv)} style={{ height: 28, padding: "0 9px", borderRadius: 6, border: `1px solid ${SBB}`, background: WH, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit" }}>
          <Ico name="edit" size={10} color={TX3} /><span style={{ fontSize: 9, fontWeight: 500, color: TX2 }}>Rédaction</span>
        </button>
        {/* Bouton PDF — génère et affiche le PDF */}
        {hasContent && (
          <button onClick={() => onViewPdf(pv)} style={{ height: 28, padding: "0 9px", borderRadius: 6, border: `1px solid ${AC}`, background: ACL, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit" }}>
            <Ico name="file" size={10} color={AC} /><span style={{ fontSize: 9, fontWeight: 600, color: AC }}>PDF</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Shared UI components (extracted from render bodies) ────
const Card = ({ children, style = {} }) => (
  <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: RAD.xl, padding: `${SP.lg}px ${SP.lg + 2}px`, ...style }}>{children}</div>
);
const CardHeader = ({ title, action }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: SP.md }}>
    <span role="heading" aria-level="2" style={{ fontSize: FS.md, fontWeight: 700, color: TX, lineHeight: LH.tight }}>{title}</span>
    {action}
  </div>
);
const SmallBtn = ({ onClick, icon, label }) => (
  <button onClick={onClick} style={{ background: SB, border: `1px solid ${SBB}`, borderRadius: RAD.sm + 1, cursor: "pointer", padding: `${SP.xs + 1}px ${SP.sm + 2}px`, display: "flex", alignItems: "center", gap: SP.xs, fontFamily: "inherit" }}>
    <Ico name={icon} size={FS.base} color={TX3} /><span style={{ fontSize: FS.sm, color: TX2, fontWeight: 500 }}>{label}</span>
  </button>
);

function Overview({ project, onStartNotes, onEditInfo, onEditParticipants, onViewPV, onViewPdf, onViewPlan, onViewPlanning, onViewChecklists, onArchive, onDuplicate, onImportPV, setProjects, onCollab, onGallery }) {
  const _readOnly = isReadOnly(project);
  const _canEdit = canEdit(project);
  const _canManage = canManageMembers(project);
  const updatePvStatus = (pvNum, newStatus) => setProjects(prev => prev.map(p => p.id === project.id ? { ...p, pvHistory: p.pvHistory.map(pv => pv.number === pvNum ? { ...pv, status: newStatus } : pv) } : p));
  const urgent = project.actions.filter((a) => a.urgent && a.open);
  const toggleAction = (aid) => setProjects((prev) => prev.map((p) => p.id === project.id ? { ...p, actions: p.actions.map((a) => a.id === aid ? { ...a, open: !a.open } : a) } : p));
  const rec = RECURRENCES.find((r) => r.id === project.recurrence);
  const t = useT();
  const [showAllPV, setShowAllPV] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
  const [mobileSheet, setMobileSheet] = useState(null); // "pv" | "actions" | "team" | "meeting"

  const openActions   = project.actions.filter((a) => a.open);
  const closedActions = project.actions.filter((a) => !a.open);
  const lastPV        = project.pvHistory[0] || null;

  return (
    <div className="ap-overview-wrap" style={{ maxWidth: 1200, margin: "0 auto", animation: "fadeIn 0.2s ease" }}>

      {/* ── Barre contexte projet — masquée sur mobile (redondant avec header) ── */}
      <div className="ap-context-bar" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <StatusBadge statusId={project.statusId} />
          {project.client     && <span style={{ fontSize: 12, color: TX3 }}>MO <strong style={{ color: TX2, fontWeight: 600 }}>{project.client}</strong></span>}
          {project.contractor && <><span style={{ color: SBB }}>·</span><span style={{ fontSize: 12, color: TX3 }}>Entr. <strong style={{ color: TX2, fontWeight: 600 }}>{project.contractor}</strong></span></>}
          {(project.city || project.address) && <><span style={{ color: SBB }}>·</span><span style={{ fontSize: 12, color: TX3 }}><Ico name="mappin" size={10} color={TX3} /> {project.city || project.address}</span></>}
          {project.startDate  && <><span style={{ color: SBB }}>·</span><span style={{ fontSize: 12, color: TX3 }}>{project.startDate}{project.endDate ? ` → ${project.endDate}` : ""}</span></>}
        </div>
      </div>

      {/* ── Bandeau urgences ── */}
      {urgent.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#EF4444", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Ico name="alert" size={14} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#B91C1C" }}>{urgent.length} action{urgent.length > 1 ? "s" : ""} urgente{urgent.length > 1 ? "s" : ""} — </span>
            <span style={{ fontSize: 13, color: "#B91C1C" }}>{urgent.map(a => a.text).join(" · ")}</span>
          </div>
        </div>
      )}

      {/* ── Brouillons hors-ligne en attente ── */}
      {(() => {
        const drafts = getPvDrafts().filter(d => d.projectId === project.id);
        if (drafts.length === 0) return null;
        return (
          <div style={{ marginBottom: 14, padding: "12px 16px", background: "#FDF4E7", border: `1px solid ${ACL2}`, borderRadius: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Ico name="clock" size={14} color={AC} />
              <span style={{ fontSize: 13, fontWeight: 700, color: TX }}>{drafts.length} brouillon{drafts.length > 1 ? "s" : ""} en attente de génération</span>
            </div>
            {drafts.map(d => (
              <div key={d.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 0", borderTop: `1px solid ${ACL2}` }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: TX }}>{d.pvTitle || `PV n°${d.pvNumber}`}</div>
                  <div style={{ fontSize: 10, color: TX3 }}>Sauvegardé le {new Date(d.savedAt).toLocaleDateString("fr-BE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {navigator.onLine && (
                    <button onClick={() => {
                      removePvDraft(d.id);
                      onStartNotes();
                    }} style={{ padding: "5px 12px", border: "none", borderRadius: 6, background: AC, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 10 }}>✦</span> Générer
                    </button>
                  )}
                  <button onClick={() => { removePvDraft(d.id); }} style={{ padding: "5px 10px", border: `1px solid ${SBB}`, borderRadius: 6, background: WH, color: TX3, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                    <Ico name="x" size={10} color={TX3} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* ── Layout 2 colonnes ── */}
      <div className="ap-overview-grid" style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>

        {/* ═══ Colonne principale ═══ */}
        <div className="ap-col-main" style={{ flex: "1 1 360px", display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>

          {/* ── Mobile Dashboard — operational, action-oriented ── */}
          <div className="ap-mobile-dashboard" style={{ display: "none", flexDirection: "column", gap: 10 }}>

            {/* Prochaine réunion */}
            <button onClick={() => setMobileSheet("meeting")} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: project.nextMeeting ? ACL : WH, border: `1px solid ${project.nextMeeting ? ACL2 : SBB}`, borderRadius: 10, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: project.nextMeeting ? WH : SB2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Ico name="calendar" size={14} color={project.nextMeeting ? AC : TX3} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: AC, textTransform: "uppercase", letterSpacing: "0.05em" }}>Prochaine réunion</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: TX }}>{project.nextMeeting || "Non planifiée"}</div>
              </div>
              <Ico name="arrowr" size={14} color={TX3} />
            </button>

            {/* Accès rapides — 4 colonnes */}
            {/* Quick access — 4 columns, bigger */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
              {[
                { label: "Documents", icon: "folder", color: BL, bg: BLB, count: (project.planFiles||[]).filter(f=>f.type!=="folder").length, onClick: onViewPlan },
                { label: "Photos",    icon: "camera", color: AC, bg: ACL, count: (project.gallery||[]).length, onClick: onGallery },
                { label: "Planning",  icon: "gantt",  color: GR, bg: GRBG, count: (project.lots||[]).length, onClick: onViewPlanning },
                { label: "Listes",    icon: "listcheck", color: TE, bg: TEB, count: (project.checklists||[]).length, onClick: onViewChecklists },
              ].map(s => (
                <button key={s.label} onClick={s.onClick} style={{ padding: "12px 4px", border: `1px solid ${s.color}18`, borderRadius: 10, background: s.bg, cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <Ico name={s.icon} size={18} color={s.color} />
                  <span style={{ fontSize: 10, fontWeight: 600, color: s.color }}>{s.label}</span>
                  {s.count > 0 && <span style={{ fontSize: 9, color: s.color, opacity: 0.7 }}>{s.count}</span>}
                </button>
              ))}
            </div>

            {/* ── Sections — independent cards ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

              {/* Actions */}
              <button onClick={() => setMobileSheet("actions")} className="ap-profile-card" style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", border: `1px solid ${SBB}`, borderRadius: 10, background: WH, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: openActions.length > 0 ? (urgent.length > 0 ? "#FEF2F2" : SB) : GRBG, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Ico name="alert" size={16} color={openActions.length > 0 ? (urgent.length > 0 ? RD : TX3) : GR} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: TX }}>Actions</div>
                  <div style={{ fontSize: 11, color: openActions.length > 0 ? (urgent.length > 0 ? "#B91C1C" : TX3) : GR }}>
                    {openActions.length === 0 ? "Toutes clôturées" : `${openActions.length} ouverte${openActions.length > 1 ? "s" : ""}${urgent.length > 0 ? ` · ${urgent.length} urgente${urgent.length > 1 ? "s" : ""}` : ""}`}
                  </div>
                </div>
                <Ico name="arrowr" size={14} color={TX3} />
              </button>

              {/* Historique PV */}
              <button onClick={() => setMobileSheet("pv")} className="ap-profile-card" style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", border: `1px solid ${SBB}`, borderRadius: 10, background: WH, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: ACL, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Ico name="file" size={16} color={AC} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: TX }}>Historique des PV</div>
                  <div style={{ fontSize: 11, color: TX3 }}>
                    {project.pvHistory.length === 0 ? "Aucun PV" : `${project.pvHistory.length} PV${lastPV ? ` · dernier : PV n°${lastPV.number}` : ""}`}
                  </div>
                </div>
                <Ico name="arrowr" size={14} color={TX3} />
              </button>

              {/* Participants */}
              <button onClick={() => setMobileSheet("team")} className="ap-profile-card" style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", border: `1px solid ${SBB}`, borderRadius: 10, background: WH, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: ACL, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Ico name="users" size={16} color={AC} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: TX }}>Participants ({project.participants.length})</div>
                  <div style={{ fontSize: 11, color: TX3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {project.participants.length === 0 ? "Aucun participant" : project.participants.slice(0, 3).map(p => p.name.split(" ")[0]).join(", ")}{project.participants.length > 3 ? "…" : ""}
                  </div>
                </div>
                <div style={{ display: "flex", flexShrink: 0, marginRight: 4 }}>
                  {project.participants.slice(0, 3).map((p, i) => (
                    <div key={i} style={{ width: 24, height: 24, borderRadius: "50%", background: ACL, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: AC, border: `1.5px solid ${WH}`, marginLeft: i > 0 ? -6 : 0, zIndex: 3 - i }}>
                      {p.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                    </div>
                  ))}
                </div>
                <Ico name="arrowr" size={14} color={TX3} />
              </button>

              {/* Infos projet */}
              <button onClick={() => setMobileSheet("info")} className="ap-profile-card" style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", border: `1px solid ${SBB}`, borderRadius: 10, background: WH, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: SB, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Ico name="building" size={16} color={TX3} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: TX }}>Infos projet</div>
                  <div style={{ fontSize: 11, color: TX3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {[project.client, project.contractor, project.city].filter(Boolean).join(" · ") || "Aucune info"}
                  </div>
                </div>
                <Ico name="arrowr" size={14} color={TX3} />
              </button>

            </div>

          </div>

          {/* CTA Nouveau PV */}
          {_canEdit && <button className="ap-touch-btn ap-cta-newpv" onClick={onStartNotes} style={{ width: "100%", padding: "15px 20px", border: "none", borderRadius: 12, background: AC, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 2px 10px rgba(217,123,13,0.22)", letterSpacing: "-0.1px" }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Ico name="edit" size={16} color="#fff" />
            </div>
            <div style={{ textAlign: "left" }}>
              <div>{t("project.newPV")} · n°{project.pvHistory.length + 1}</div>
              <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.85, marginTop: 1 }}>
                {project.nextMeeting ? t("project.meetingOn", { date: project.nextMeeting }) : t("project.prepareNextPV")}
              </div>
            </div>
            <Ico name="arrowr" size={18} color="rgba(255,255,255,0.8)" style={{ marginLeft: "auto" }} />
          </button>}

          {/* Outils rapides — masqués sur mobile (bottom bar remplace) */}
          <div className="ap-quick-tools" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              { label: "Documents",            icon: "folder",    color: BL,  bg: BLB,  count: (project.planFiles||[]).filter(f=>f.type!=="folder").length, onClick: onViewPlan },
              { label: "Photos",               icon: "camera",    color: AC,  bg: ACL,  count: (project.gallery||[]).length,     onClick: onGallery },
              { label: t("project.planning"),  icon: "gantt",     color: GR,  bg: GRBG, count: (project.lots||[]).length,        onClick: onViewPlanning },
              { label: t("project.lists"),     icon: "listcheck", color: TE,  bg: TEB,  count: (project.checklists||[]).length,  onClick: onViewChecklists },
            ].map((tb) => (
              <button key={tb.label} onClick={tb.onClick} style={{ flex: "1 1 80px", padding: "10px 8px", border: `1px solid ${tb.color}25`, borderRadius: 10, background: tb.bg, cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <Ico name={tb.icon} size={16} color={tb.color} />
                <span style={{ fontSize: 11, fontWeight: 600, color: tb.color }}>{tb.label}</span>
                {tb.count > 0 && <span style={{ fontSize: 10, color: tb.color, opacity: 0.75 }}>{tb.count}</span>}
              </button>
            ))}
          </div>

          {/* Mobile: Accès rapides (Documents, Planning, Listes) */}
          <div className="ap-mobile-shortcuts" style={{ display: "none", gap: SP.sm }}>
            {[
              { label: "Documents", icon: "folder", color: BL, bg: BLB, count: (project.planFiles||[]).filter(f=>f.type!=="folder").length, onClick: onViewPlan },
              { label: "Planning",  icon: "gantt",  color: GR, bg: GRBG, count: (project.lots||[]).length, onClick: onViewPlanning },
              { label: "Listes",    icon: "listcheck", color: TE, bg: TEB, count: (project.checklists||[]).length, onClick: onViewChecklists },
            ].map(s => (
              <button key={s.label} onClick={s.onClick} style={{ flex: 1, padding: `${SP.sm + 2}px ${SP.sm}px`, border: `1px solid ${s.color}20`, borderRadius: RAD.lg, background: s.bg, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: SP.sm, minHeight: 44 }}>
                <Ico name={s.icon} size={16} color={s.color} />
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: FS.sm, fontWeight: 600, color: s.color }}>{s.label}</div>
                  {s.count > 0 && <div style={{ fontSize: FS.xs - 1, color: s.color, opacity: 0.7 }}>{s.count} élément{s.count > 1 ? "s" : ""}</div>}
                </div>
              </button>
            ))}
          </div>

          {/* Dernier PV */}
          <div className="ap-section-pv"><Card>
            <CardHeader
              title={t("project.pvHistory")}
              action={<SmallBtn onClick={onImportPV} icon="upload" label={t("import")} />}
            />
            {project.pvHistory.length === 0 ? (
              <div style={{ padding: "16px 0", textAlign: "center" }}>
                <div style={{ fontSize: 13, color: TX3, marginBottom: 10 }}>{t("project.noPV")}</div>
                <button onClick={onStartNotes} style={{ padding: "8px 18px", border: "none", borderRadius: 8, background: AC, color: "#fff", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Ico name="edit" size={13} color="#fff" />{t("project.createFirstPV")}
                </button>
              </div>
            ) : (
              <>
                {/* PV le plus récent — mis en avant */}
                {lastPV && (
                  <div style={{ padding: "12px 14px", background: ACL, border: `1px solid ${ACL2}`, borderRadius: 10, marginBottom: project.pvHistory.length > 1 ? 10 : 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: TX }}>{lastPV.title || `PV n°${lastPV.number}`}</span>
                          {lastPV.imported
                            ? <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 600, color: BL, background: BLB, padding: "2px 7px 2px 5px", borderRadius: 20 }}><span style={{ width: 5, height: 5, borderRadius: "50%", background: BL, display: "inline-block" }} />{t("project.imported")}</span>
                            : <PvStatusBadge status={lastPV.status} onClick={() => updatePvStatus(lastPV.number, nextPvStatus(lastPV.status || "draft"))} />
                          }
                        </div>
                        <div style={{ fontSize: 12, color: TX2, lineHeight: 1.5, marginBottom: 6 }}>{lastPV.excerpt}</div>
                        <div style={{ display: "flex", gap: 10, fontSize: FS.sm, color: TX3 }}>
                          <span title={lastPV.date}>{relativeDate(lastPV.date)}</span><span>{lastPV.author}</span>
                          {!lastPV.imported && <span>{lastPV.postsCount} poste{lastPV.postsCount > 1 ? "s" : ""}</span>}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: SP.xs, flexShrink: 0 }}>
                        <button onClick={() => onViewPV(lastPV)} style={{ background: WH, border: `1px solid ${ACL2}`, borderRadius: RAD.sm, cursor: "pointer", padding: `${SP.xs + 2}px ${SP.sm + 1}px`, display: "flex", alignItems: "center", gap: SP.xs, fontFamily: "inherit" }}>
                          <Ico name="edit" size={11} color={TX3} /><span style={{ fontSize: FS.sm, color: TX2, fontWeight: 500 }}>Rédaction</span>
                        </button>
                        {(lastPV.content || lastPV.pdfDataUrl) && (
                          <button onClick={() => onViewPdf(lastPV)} style={{ background: ACL, border: `1px solid ${ACL2}`, borderRadius: RAD.sm, cursor: "pointer", padding: `${SP.xs + 2}px ${SP.sm + 1}px`, display: "flex", alignItems: "center", gap: SP.xs, fontFamily: "inherit" }}>
                            <Ico name="file" size={11} color={AC} /><span style={{ fontSize: FS.sm, color: AC, fontWeight: 600 }}>PDF</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {/* Anciens PV — limité à 2 (3 total avec le dernier) */}
                {project.pvHistory.slice(1, 3).map((pv, i) => (
                  <PvRow key={i} pv={pv} onViewPV={onViewPV} onViewPdf={onViewPdf} updatePvStatus={updatePvStatus} t={t} />
                ))}
                {/* Bouton voir tout */}
                {project.pvHistory.length > 3 && !showAllPV && (
                  <button onClick={() => setShowAllPV(true)} style={{ width: "100%", marginTop: 6, padding: "8px 12px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontFamily: "inherit", fontSize: 11, fontWeight: 600, color: TX2 }}>
                    <Ico name="clock" size={11} color={TX3} />
                    Voir tout l'historique ({project.pvHistory.length} PV)
                  </button>
                )}
                {showAllPV && project.pvHistory.slice(3).map((pv, i) => (
                  <PvRow key={i + 3} pv={pv} onViewPV={onViewPV} onViewPdf={onViewPdf} updatePvStatus={updatePvStatus} t={t} />
                ))}
                {showAllPV && project.pvHistory.length > 3 && (
                  <button onClick={() => setShowAllPV(false)} style={{ width: "100%", marginTop: 6, padding: "6px 12px", border: "none", borderRadius: 8, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4, fontFamily: "inherit", fontSize: 10, color: TX3 }}>
                    <Ico name="chevron-up" size={10} color={TX3} />Réduire
                  </button>
                )}
              </>
            )}
          </Card></div>

          {/* Actions */}
          <div className="ap-section-actions"><Card>
            <CardHeader
              title={t("project.actions")}
              action={openActions.length > 0
                ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: urgent.length > 0 ? "#B91C1C" : TX3, background: urgent.length > 0 ? "#FEF2F2" : SB2, padding: "2px 9px 2px 6px", borderRadius: 20 }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: urgent.length > 0 ? "#EF4444" : TX3, display: "inline-block" }} />
                    {openActions.length} ouverte{openActions.length > 1 ? "s" : ""}
                    {urgent.length > 0 && ` · ${urgent.length} urgente${urgent.length > 1 ? "s" : ""}`}
                  </span>
                : null}
            />
            {openActions.length === 0 && closedActions.length === 0 && (
              <div style={{ fontSize: 13, color: TX3, padding: "8px 0" }}>{t("project.noActions")}</div>
            )}
            {openActions.length === 0 && closedActions.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0" }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#F0FDF4", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Ico name="check" size={13} color={GR} />
                </div>
                <span style={{ fontSize: 13, color: GR, fontWeight: 500 }}>{t("project.allActionsClosed")}</span>
              </div>
            )}
            {/* Urgentes en premier */}
            {project.actions.filter(a => a.open && a.urgent).map((a) => (
              <div key={a.id} style={{ display: "flex", gap: 10, padding: "9px 10px", marginBottom: 4, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, alignItems: "flex-start" }}>
                <button onClick={() => toggleAction(a.id)} style={{ width: 18, height: 18, borderRadius: 4, border: "1.5px solid #EF4444", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1, padding: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "#B91C1C", fontWeight: 600, lineHeight: 1.3 }}>{a.text}</div>
                  <div style={{ fontSize: 11, color: "#EF4444", marginTop: 2 }}>{a.who} — {a.since}</div>
                </div>
              </div>
            ))}
            {/* Normales */}
            {project.actions.filter(a => a.open && !a.urgent).map((a) => (
              <div key={a.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderTop: `1px solid ${SB2}`, alignItems: "flex-start" }}>
                <button onClick={() => toggleAction(a.id)} style={{ width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${SBB}`, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2, padding: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: TX, lineHeight: 1.3 }}>{a.text}</div>
                  <div style={{ fontSize: 11, color: TX3, marginTop: 1 }}>{a.who} — {a.since}</div>
                </div>
              </div>
            ))}
            {/* Clôturées — discrètes */}
            {closedActions.length > 0 && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${SB2}` }}>
                {closedActions.map((a) => (
                  <div key={a.id} style={{ display: "flex", gap: 10, padding: "6px 0", alignItems: "center", opacity: 0.55 }}>
                    <button onClick={() => toggleAction(a.id)} style={{ width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${GR}`, background: "#F0FDF4", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0 }}>
                      <Ico name="check" size={11} color={GR} />
                    </button>
                    <div style={{ fontSize: 12, color: TX3, textDecoration: "line-through", flex: 1, minWidth: 0 }}>{a.text}</div>
                  </div>
                ))}
              </div>
            )}
          </Card></div>

        </div>

        {/* ═══ Colonne secondaire ═══ */}
        <div className="ap-overview-side" style={{ flex: "0 1 272px", display: "flex", flexDirection: "column", gap: SP.lg - 2, minWidth: 220 }}>

          {/* ── Mobile: Participants inline (avatars cliquables) ── */}
          <div className="ap-mobile-participants" style={{ display: "none" }}>
            <Card>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: SP.sm }}>
                <span style={{ fontSize: FS.sm, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3 }}>Équipe</span>
                <button onClick={onEditParticipants} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex", alignItems: "center", gap: SP.xs }}>
                  <Ico name="edit" size={11} color={TX3} /><span style={{ fontSize: FS.xs, color: TX3 }}>Modifier</span>
                </button>
              </div>
              <div style={{ display: "flex", gap: SP.sm, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 2 }}>
                {project.participants.map((p, i) => (
                  <a key={i} href={p.phone ? `tel:${p.phone.replace(/\s/g, "")}` : undefined} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 56, textDecoration: "none", flexShrink: 0 }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: ACL, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: AC, border: p.phone ? `2px solid ${AC}` : `2px solid ${SBB}` }}>
                      {p.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                    </div>
                    <span style={{ fontSize: 9, color: TX, fontWeight: 500, textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 56 }}>{p.name.split(" ")[0]}</span>
                    <span style={{ fontSize: 8, color: TX3, marginTop: -2 }}>{p.role}</span>
                  </a>
                ))}
                <button onClick={onCollab} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 56, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", border: `2px dashed ${SBB}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Ico name="plus" size={14} color={TX3} />
                  </div>
                  <span style={{ fontSize: 9, color: TX3 }}>Inviter</span>
                </button>
              </div>
              {project.participants.some(p => p.phone) && (
                <div style={{ fontSize: FS.xs - 1, color: TX3, marginTop: SP.sm, textAlign: "center", fontStyle: "italic" }}>Appuyez sur un contact pour appeler</div>
              )}
            </Card>
          </div>

          {/* ── Mobile: Infos projet compactes ── */}
          <div className="ap-mobile-infos" style={{ display: "none" }}>
            <Card>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: SP.sm }}>
                <span style={{ fontSize: FS.sm, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3 }}>Projet</span>
                <button onClick={onEditInfo} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex", alignItems: "center", gap: SP.xs }}>
                  <Ico name="edit" size={11} color={TX3} /><span style={{ fontSize: FS.xs, color: TX3 }}>Modifier</span>
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: `${SP.sm}px ${SP.md}px` }}>
                {[
                  { icon: "users",    label: "MO",       value: project.client },
                  { icon: "building", label: "Entreprise", value: project.contractor },
                  { icon: "mappin",   label: "Lieu",     value: project.city || formatAddress(project) },
                  { icon: "calendar", label: "Début",    value: project.startDate },
                ].filter(item => item.value).map((item, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: SP.sm - 2, padding: `${SP.sm - 2}px 0` }}>
                    <Ico name={item.icon} size={12} color={TX3} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 8, color: TX3, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{item.label}</div>
                      <div style={{ fontSize: FS.sm, color: TX, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* ── Desktop: full cards (hidden on mobile) ── */}
          <div className="ap-desktop-side">
            <div style={{ display: "flex", flexDirection: "column", gap: SP.lg - 2 }}>
              <MeetingCard project={project} setProjects={setProjects} rec={rec} />

              {(project.city || project.address) && <WeatherWidget address={project.city || formatAddress(project)} />}

              <Card>
                <CardHeader
                  title={`Participants (${project.participants.length})`}
                  action={<button onClick={onEditParticipants} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><Ico name="edit" size={13} color={TX3} /></button>}
                />
                {project.participants.length === 0 && <div style={{ fontSize: 13, color: TX3 }}>Aucun participant.</div>}
                {project.participants.map((p, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 0", borderTop: i > 0 ? `1px solid ${SB2}` : "none" }}>
                    <div style={{ width: 30, height: 30, borderRadius: "50%", background: ACL, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: AC, flexShrink: 0 }}>
                      {p.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: TX3 }}>{p.role}{p.phone ? ` · ${p.phone}` : ""}</div>
                    </div>
                  </div>
                ))}
                <button onClick={onCollab} style={{ width: "100%", marginTop: 10, padding: "8px 12px", border: `1px dashed ${SBB}`, borderRadius: 8, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "inherit", fontSize: 12, fontWeight: 500, color: AC, transition: "all 0.15s" }}>
                  <Ico name="plus" size={12} color={AC} />
                  Inviter des collaborateurs
                </button>
              </Card>

              <Card>
                <CardHeader title={t("project.info")} action={<button onClick={onEditInfo} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><Ico name="edit" size={13} color={TX3} /></button>} />
                <div className="ap-info-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: `${SP.md}px ${SP.lg}px` }}>
                  {[
                    { icon: "users",   label: t("project.client"),     value: project.client },
                    { icon: "building", label: t("project.enterprise"), value: project.contractor },
                    { icon: "mappin",  label: t("project.address"),     value: formatAddress(project) },
                    { icon: "calendar", label: t("project.startDate"),  value: project.startDate },
                    { icon: "calendar", label: t("project.endDate"),    value: project.endDate || "—" },
                    ...(project.customFields || []).filter(cf => cf.label && cf.value).map(cf => ({ icon: "file", label: cf.label, value: cf.value })),
                  ].filter(item => item.value).map((item, i) => (
                    <div key={i} style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: SP.xs, marginBottom: 2 }}>
                        <Ico name={item.icon} size={11} color={TX3} />
                        <span style={{ fontSize: FS.xs, color: TX3, fontWeight: 500 }}>{item.label}</span>
                      </div>
                      <div style={{ fontSize: FS.base, color: TX, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </Card>

              {_canManage && <div className="ap-admin-actions" style={{ display: "flex", gap: 6 }}>
                <SmallBtn onClick={onEditInfo} icon="edit" label={t("edit")} />
                <SmallBtn onClick={onDuplicate} icon="dup" label={t("duplicate")} />
                <SmallBtn onClick={onArchive} icon="archive" label={project.archived ? t("project.unarchive") : t("project.archive")} />
              </div>}
            </div>
          </div>

        </div>
      </div>

      {/* ── Mobile Sheets ── */}
      {mobileSheet && (
        <div style={{ position: "fixed", inset: 0, zIndex: 250, display: "flex", flexDirection: "column", justifyContent: "flex-end" }} onClick={() => setMobileSheet(null)}>
          <div style={{ background: "rgba(0,0,0,0.3)", position: "absolute", inset: 0 }} />
          <div onClick={e => e.stopPropagation()} style={{ position: "relative", background: WH, borderRadius: "20px 20px 0 0", maxHeight: "80vh", display: "flex", flexDirection: "column", animation: "sheetUp 0.25s ease-out", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: SBB, margin: `${SP.md}px auto ${SP.sm}px` }} />

            {/* Sheet: PV History */}
            {mobileSheet === "pv" && (
              <div style={{ padding: `0 ${SP.lg}px ${SP.lg}px`, overflowY: "auto" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: SP.md }}>
                  <span style={{ fontSize: FS.lg + 1, fontWeight: 700, color: TX }}>Historique PV</span>
                  <SmallBtn onClick={onImportPV} icon="upload" label="Importer" />
                </div>
                {project.pvHistory.length === 0 ? (
                  <div style={{ padding: `${SP.xl}px 0`, textAlign: "center", color: TX3, fontSize: FS.md }}>Aucun PV rédigé</div>
                ) : project.pvHistory.map((pv, i) => (
                  <PvRow key={i} pv={pv} onViewPV={(p) => { setMobileSheet(null); onViewPV(p); }} onViewPdf={(p) => { setMobileSheet(null); onViewPdf(p); }} updatePvStatus={updatePvStatus} t={t} />
                ))}
              </div>
            )}

            {/* Sheet: Actions */}
            {mobileSheet === "actions" && (
              <div style={{ padding: `0 ${SP.lg}px ${SP.lg}px`, overflowY: "auto" }}>
                <span style={{ fontSize: FS.lg + 1, fontWeight: 700, color: TX, display: "block", marginBottom: SP.md }}>Actions ({openActions.length} ouverte{openActions.length > 1 ? "s" : ""})</span>
                {openActions.length === 0 && <div style={{ padding: `${SP.xl}px 0`, textAlign: "center", color: TX3, fontSize: FS.md }}>Aucune action ouverte</div>}
                {openActions.map(a => (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: SP.sm, padding: `${SP.sm}px 0`, borderTop: `1px solid ${SB2}` }}>
                    <button onClick={() => toggleAction(a.id)} style={{ width: 24, height: 24, borderRadius: RAD.sm, border: `2px solid ${a.urgent ? RD : SBB}`, background: WH, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0 }} />
                    <span style={{ fontSize: FS.md, color: TX, flex: 1 }}>{a.text}</span>
                    {a.urgent && <span style={{ fontSize: FS.xs, fontWeight: 700, color: RD, background: "#FEF2F2", padding: "2px 6px", borderRadius: 4 }}>Urgent</span>}
                  </div>
                ))}
              </div>
            )}

            {/* Sheet: Team */}
            {mobileSheet === "team" && (
              <div style={{ padding: `0 ${SP.lg}px ${SP.lg}px`, overflowY: "auto" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: SP.md }}>
                  <span style={{ fontSize: FS.lg + 1, fontWeight: 700, color: TX }}>Équipe</span>
                  <button onClick={() => { setMobileSheet(null); setTimeout(onEditParticipants, 100); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: FS.sm, color: AC, fontWeight: 600, fontFamily: "inherit" }}>Modifier</button>
                </div>
                {project.participants.map((p, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: SP.md, padding: `${SP.sm + 2}px 0`, borderTop: i > 0 ? `1px solid ${SB2}` : "none" }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: ACL, display: "flex", alignItems: "center", justifyContent: "center", fontSize: FS.base, fontWeight: 700, color: AC, flexShrink: 0 }}>
                      {p.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: FS.md, fontWeight: 600, color: TX }}>{p.name}</div>
                      <div style={{ fontSize: FS.sm, color: TX3 }}>{p.role}</div>
                    </div>
                    {p.phone && (
                      <a href={`tel:${p.phone.replace(/\s/g, "")}`} style={{ width: 36, height: 36, borderRadius: "50%", background: GRBG, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", flexShrink: 0 }}>
                        <Ico name="phone" size={16} color={GR} />
                      </a>
                    )}
                  </div>
                ))}
                <button onClick={() => { setMobileSheet(null); onCollab(); }} style={{ width: "100%", marginTop: SP.md, padding: `${SP.sm + 2}px`, border: `1px dashed ${SBB}`, borderRadius: RAD.md, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: SP.sm, fontFamily: "inherit", fontSize: FS.base, color: AC }}>
                  <Ico name="plus" size={14} color={AC} />Inviter
                </button>
              </div>
            )}

            {/* Sheet: Meeting */}
            {mobileSheet === "meeting" && (
              <div style={{ padding: `0 ${SP.lg}px ${SP.lg}px` }}>
                <span style={{ fontSize: FS.lg + 1, fontWeight: 700, color: TX, display: "block", marginBottom: SP.md }}>Prochaine réunion</span>
                <MeetingCard project={project} setProjects={setProjects} rec={rec} />
              </div>
            )}

            {/* Sheet: Infos projet */}
            {mobileSheet === "info" && (
              <div style={{ padding: `0 ${SP.lg}px ${SP.lg}px`, overflowY: "auto" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: SP.md }}>
                  <span style={{ fontSize: FS.lg + 1, fontWeight: 700, color: TX }}>Infos projet</span>
                  <button onClick={() => { setMobileSheet(null); setTimeout(onEditInfo, 100); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: FS.sm, color: AC, fontWeight: 600, fontFamily: "inherit" }}>Modifier</button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: SP.md }}>
                  {[
                    { icon: "users", label: "Maître d'ouvrage", value: project.client },
                    { icon: "building", label: "Entreprise", value: project.contractor },
                    { icon: "mappin", label: "Adresse", value: formatAddress(project) || project.city },
                    { icon: "calendar", label: "Date de début", value: project.startDate },
                    { icon: "calendar", label: "Date de fin", value: project.endDate },
                    ...(project.customFields || []).filter(cf => cf.label && cf.value).map(cf => ({ icon: "file", label: cf.label, value: cf.value })),
                  ].filter(item => item.value).map((item, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: SP.md, padding: `${SP.sm}px 0`, borderTop: i > 0 ? `1px solid ${SB2}` : "none" }}>
                      <div style={{ width: 32, height: 32, borderRadius: RAD.sm, background: SB, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Ico name={item.icon} size={14} color={TX3} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: FS.xs, color: TX3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>{item.label}</div>
                        <div style={{ fontSize: FS.md, color: TX, fontWeight: 500 }}>{item.value}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

const ANNO_TOOLS = [
  { id: "select", label: "Sélect.",   icon: "cursor"  },
  { id: "arrow",  label: "Flèche",    icon: "arrowr"  },
  { id: "rect",   label: "Rectangle", icon: "rectc"   },
  { id: "circle", label: "Cercle",    icon: "circlec" },
  { id: "pen",    label: "Crayon",    icon: "pen2"    },
  { id: "text",   label: "Texte",     icon: "textT"   },
];
const ANNO_COLORS = ["#EF4444", "#F97316", AC, "#3B82F6", "#1D1D1B", "#FFFFFF"];

function AnnotationEditor({ photo, onSave, onClose }) {
  const canvasRef      = useRef(null);
  const imgRef         = useRef(null);
  const containerRef   = useRef(null);
  const textInputRef   = useRef(null);
  const colorPickerRef = useRef(null);
  const planAreaRef    = useRef(null);

  // Mode: vue | marqueur | dessin
  const [mode, setMode] = useState("dessin");

  // Drawing state
  const [tool,        setTool]        = useState("select");
  const [color,       setColor]       = useState("#EF4444");
  const [strokes,     setStrokes]     = useState([]);
  const [drawing,     setDrawing]     = useState(false);
  const [startPt,     setStartPt]     = useState(null);
  const [currentPt,   setCurrentPt]   = useState(null);
  const [penPoints,   setPenPoints]   = useState([]);
  const [textPending, setTextPending] = useState(null);
  const [textValue,   setTextValue]   = useState("");

  // Markers
  const [markers, setMarkers] = useState([]);
  const [markerLabel, setMarkerLabel] = useState("");
  const [pendingMarkerPt, setPendingMarkerPt] = useState(null);

  // Selection & transform
  const [selectedId,   setSelectedId]   = useState(null);
  const selectedIdRef  = useRef(null);
  const selDragRef     = useRef(null);
  const strokesRef     = useRef([]);

  // Text style
  const [textFontSize, setTextFontSize] = useState(18);
  const [textBold,     setTextBold]     = useState(false);
  const [textItalic,   setTextItalic]   = useState(false);

  // Viewport (zoom + pan)
  const [vp, setVp]             = useState({ zoom: 1, panX: 0, panY: 0 });
  const [imgBase, setImgBase]   = useState({ w: 0, h: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const vpRef       = useRef({ zoom: 1, panX: 0, panY: 0 });
  const imgBaseRef  = useRef({ w: 0, h: 0 });
  const panningRef  = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const panOriginRef= useRef({ x: 0, y: 0 });
  const spaceHeldRef= useRef(false);
  const t = useT();

  // Keep refs in sync
  strokesRef.current    = strokes;
  selectedIdRef.current = selectedId;

  const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

  const switchMode = (m) => {
    setMode(m); setTextPending(null); setTextValue(""); setSelectedId(null);
    selectedIdRef.current = null; selDragRef.current = null;
    setPendingMarkerPt(null); setMarkerLabel("");
    redrawCanvas(strokesRef.current);
  };

  // Load image
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const maxW = 1200;
      const scale = img.naturalWidth > maxW ? maxW / img.naturalWidth : 1;
      const bw = Math.round(img.naturalWidth  * scale);
      const bh = Math.round(img.naturalHeight * scale);
      canvas.width  = bw;
      canvas.height = bh;
      imgBaseRef.current = { w: bw, h: bh };
      setImgBase({ w: bw, h: bh });
      redrawCanvas([]);
      setTimeout(() => {
        const el = planAreaRef.current;
        if (!el || !bw) return;
        const aw = el.clientWidth, ah = el.clientHeight;
        if (!aw || !ah) return;
        const fz = Math.min(aw / bw, ah / bh) * 0.92;
        const next = { zoom: fz, panX: (aw - bw * fz) / 2, panY: Math.max(16, (ah - bh * fz) / 2) };
        vpRef.current = next; setVp(next);
      }, 60);
    };
    img.src = getPhotoUrl(photo);
  }, []);

  // Auto-redraw when strokes state changes
  useEffect(() => { redrawCanvas(strokes); }, [strokes]);

  // Sync sidebar controls when selecting existing annotation
  useEffect(() => {
    if (tool === "select" && selectedId) {
      const sel = strokesRef.current.find(s => s.id === selectedId);
      if (sel) {
        setColor(sel.color);
        if (sel.type === "text") { setTextFontSize(sel.fontSize || 18); setTextBold(!!sel.bold); setTextItalic(!!sel.italic); }
      }
    }
  }, [selectedId, tool]);

  // Space key for pan
  useEffect(() => {
    const down = (e) => { if (e.code === "Space" && !e.repeat) { e.preventDefault(); spaceHeldRef.current = true; setSpaceHeld(true); } };
    const up   = (e) => { if (e.code === "Space") { spaceHeldRef.current = false; setSpaceHeld(false); } };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  // Zoom with mouse wheel
  useEffect(() => {
    const el = planAreaRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const prev = vpRef.current;
      const nz = Math.min(10, Math.max(0.1, prev.zoom * factor));
      const next = { zoom: nz, panX: mx - (mx - prev.panX) * (nz / prev.zoom), panY: my - (my - prev.panY) * (nz / prev.zoom) };
      vpRef.current = next; setVp(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Zoom buttons
  const zoomBy = (factor) => {
    const el = planAreaRef.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
    const prev = vpRef.current;
    const nz = Math.min(10, Math.max(0.1, prev.zoom * factor));
    const next = { zoom: nz, panX: cx - (cx - prev.panX) * (nz / prev.zoom), panY: cy - (cy - prev.panY) * (nz / prev.zoom) };
    vpRef.current = next; setVp(next);
  };

  // Pan area events
  const onAreaDown = (e) => {
    if (spaceHeldRef.current || (mode !== "dessin" && mode !== "marqueur")) {
      panningRef.current = true;
      panStartRef.current = { x: e.clientX, y: e.clientY };
      panOriginRef.current = { x: vpRef.current.panX, y: vpRef.current.panY };
    }
  };
  const onAreaMove = (e) => {
    if (!panningRef.current) return;
    const dx = e.clientX - panStartRef.current.x, dy = e.clientY - panStartRef.current.y;
    const next = { ...vpRef.current, panX: panOriginRef.current.x + dx, panY: panOriginRef.current.y + dy };
    vpRef.current = next; setVp(next);
  };
  const onAreaUp = () => { panningRef.current = false; };

  const getCursor = () => {
    if (spaceHeldRef.current || panningRef.current) return "grab";
    if (mode === "vue") return "default";
    if (mode === "marqueur") return "crosshair";
    return "default";
  };

  // Handle plan click for markers
  const handlePlanClick = (e) => {
    if (mode !== "marqueur" || spaceHeldRef.current) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setPendingMarkerPt({ x, y });
    setMarkerLabel("");
  };

  const confirmMarker = () => {
    if (!pendingMarkerPt) return;
    const num = markers.length + 1;
    setMarkers(prev => [...prev, { id: genId(), x: pendingMarkerPt.x, y: pendingMarkerPt.y, number: num, label: markerLabel.trim() || `#${num}` }]);
    setPendingMarkerPt(null);
    setMarkerLabel("");
  };

  const removeMarker = (id) => {
    setMarkers(prev => {
      const arr = prev.filter(m => m.id !== id);
      return arr.map((m, i) => ({ ...m, number: i + 1 }));
    });
  };

  // Pipette (eyedropper)
  const pickColorFromImage = () => {
    if (window.EyeDropper) {
      const dropper = new window.EyeDropper();
      dropper.open().then(result => {
        setColor(result.sRGBHex);
        if (tool === "select" && selectedId) {
          setStrokes(prev => prev.map(s => s.id === selectedId ? { ...s, color: result.sRGBHex } : s));
        }
      }).catch(() => {});
    } else {
      colorPickerRef.current?.click();
    }
  };

  // ── Geometry helpers ─────────────────────────────────────────
  const aeDistToSeg = (px, py, x1, y1, x2, y2) => {
    const A = px-x1, B = py-y1, C = x2-x1, D = y2-y1;
    const t = (C*C+D*D) !== 0 ? Math.max(0, Math.min(1, (A*C+B*D)/(C*C+D*D))) : 0;
    return Math.hypot(px-(x1+t*C), py-(y1+t*D));
  };

  const aeStrokeBounds = (s, cw) => {
    if (s.type === "pen") { const xs=s.points.map(p=>p.x), ys=s.points.map(p=>p.y); return { x1:Math.min(...xs), y1:Math.min(...ys), x2:Math.max(...xs), y2:Math.max(...ys) }; }
    if (s.type === "text") { const fs=s.fontSize||Math.round(cw*0.04); const tw=(s.text?.length||0)*fs*0.58; return { x1:s.x, y1:s.y, x2:s.x+tw, y2:s.y+fs }; }
    return { x1:Math.min(s.x1,s.x2), y1:Math.min(s.y1,s.y2), x2:Math.max(s.x1,s.x2), y2:Math.max(s.y1,s.y2) };
  };

  const aeHitTest = (s, px, py, cw) => {
    const M = 12;
    if (s.type === "text") { const b=aeStrokeBounds(s,cw); return px>=b.x1-M&&px<=b.x2+M&&py>=b.y1-M&&py<=b.y2+M; }
    if (s.type === "pen") { for (let i=1;i<s.points.length;i++) { if (aeDistToSeg(px,py,s.points[i-1].x,s.points[i-1].y,s.points[i].x,s.points[i].y)<M) return true; } return false; }
    if (s.type === "arrow") return aeDistToSeg(px,py,s.x1,s.y1,s.x2,s.y2)<M;
    if (s.type === "rect") { const bx1=Math.min(s.x1,s.x2),bx2=Math.max(s.x1,s.x2),by1=Math.min(s.y1,s.y2),by2=Math.max(s.y1,s.y2); return (px>=bx1-M&&px<=bx2+M&&py>=by1-M&&py<=by2+M)&&!(px>=bx1+M&&px<=bx2-M&&py>=by1+M&&py<=by2-M); }
    if (s.type === "circle") { const cx=(s.x1+s.x2)/2,cy=(s.y1+s.y2)/2,rx=Math.abs(s.x2-s.x1)/2||1,ry=Math.abs(s.y2-s.y1)/2||1; return Math.abs(Math.sqrt(((px-cx)/rx)**2+((py-cy)/ry)**2)-1)<M/Math.min(rx,ry); }
    return false;
  };

  const aeGetHandles = (b) => {
    const mx=(b.x1+b.x2)/2, my=(b.y1+b.y2)/2;
    return [
      {name:"nw",x:b.x1,y:b.y1},{name:"n",x:mx,y:b.y1},{name:"ne",x:b.x2,y:b.y1},
      {name:"e",x:b.x2,y:my},
      {name:"se",x:b.x2,y:b.y2},{name:"s",x:mx,y:b.y2},{name:"sw",x:b.x1,y:b.y2},
      {name:"w",x:b.x1,y:my},
    ];
  };

  const aeHitHandle = (s, px, py, cw) => {
    const b = aeStrokeBounds(s, cw);
    for (const h of aeGetHandles({x1:b.x1-8,y1:b.y1-8,x2:b.x2+8,y2:b.y2+8})) { if (Math.abs(px-h.x)<=9&&Math.abs(py-h.y)<=9) return h.name; }
    return null;
  };

  const aeDrawSelection = (ctx, s, cw) => {
    const b = aeStrokeBounds(s, cw);
    const PAD=8, HS=6;
    ctx.save();
    ctx.strokeStyle="#3B82F6"; ctx.lineWidth=1.5; ctx.setLineDash([5,3]);
    ctx.strokeRect(b.x1-PAD,b.y1-PAD,b.x2-b.x1+PAD*2,b.y2-b.y1+PAD*2);
    ctx.setLineDash([]);
    aeGetHandles({x1:b.x1-PAD,y1:b.y1-PAD,x2:b.x2+PAD,y2:b.y2+PAD}).forEach(h => {
      ctx.fillStyle="#fff"; ctx.fillRect(h.x-HS/2,h.y-HS/2,HS,HS);
      ctx.strokeStyle="#3B82F6"; ctx.lineWidth=1.5; ctx.strokeRect(h.x-HS/2,h.y-HS/2,HS,HS);
    });
    ctx.restore();
  };

  const aeApplyMove = (s, dx, dy) => {
    if (s.type==="pen") return {...s, points:s.points.map(p=>({x:p.x+dx,y:p.y+dy}))};
    if (s.type==="text") return {...s, x:s.x+dx, y:s.y+dy};
    return {...s, x1:s.x1+dx, y1:s.y1+dy, x2:s.x2+dx, y2:s.y2+dy};
  };

  const aeApplyResize = (s, handle, dx, dy) => {
    if (s.type==="pen") return aeApplyMove(s, dx/2, dy/2);
    if (s.type==="text") return {...s, fontSize:Math.max(8,(s.fontSize||18)-dy*0.4)};
    const n={...s};
    if (handle.includes("n")) n.y1=s.y1+dy;
    if (handle.includes("s")) n.y2=s.y2+dy;
    if (handle.includes("w")) n.x1=s.x1+dx;
    if (handle.includes("e")) n.x2=s.x2+dx;
    return n;
  };

  // ── Canvas rendering ─────────────────────────────────────────
  const redrawCanvas = (list, inProgress = null) => {
    const canvas = canvasRef.current;
    if (!canvas || !imgRef.current) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imgRef.current, 0, 0, canvas.width, canvas.height);
    list.forEach(s => { if (s.visible !== false) paintStroke(ctx, s, canvas.width); });
    if (inProgress) paintStroke(ctx, inProgress, canvas.width);
    const selId = selectedIdRef.current;
    if (selId) {
      const sel = list.find(s => s.id === selId) || (inProgress?.id === selId ? inProgress : null);
      if (sel && sel.visible !== false) aeDrawSelection(ctx, sel, canvas.width);
    }
  };

  const paintArrow = (ctx, x1, y1, x2, y2) => {
    const len = Math.hypot(x2-x1, y2-y1);
    const headLen = Math.max(14, len * 0.18);
    const angle = Math.atan2(y2-y1, x2-x1);
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2,y2);
    ctx.lineTo(x2-headLen*Math.cos(angle-Math.PI/6), y2-headLen*Math.sin(angle-Math.PI/6));
    ctx.lineTo(x2-headLen*Math.cos(angle+Math.PI/6), y2-headLen*Math.sin(angle+Math.PI/6));
    ctx.closePath(); ctx.fill();
  };

  const paintStroke = (ctx, s, cw) => {
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color;
    ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (s.type === "arrow") { paintArrow(ctx, s.x1, s.y1, s.x2, s.y2); }
    else if (s.type === "rect") { ctx.strokeRect(s.x1, s.y1, s.x2-s.x1, s.y2-s.y1); }
    else if (s.type === "circle") {
      const rx=Math.abs(s.x2-s.x1)/2, ry=Math.abs(s.y2-s.y1)/2;
      ctx.beginPath(); ctx.ellipse((s.x1+s.x2)/2,(s.y1+s.y2)/2,Math.max(rx,1),Math.max(ry,1),0,0,2*Math.PI); ctx.stroke();
    } else if (s.type === "pen") {
      if (s.points.length < 2) return;
      ctx.beginPath(); s.points.forEach((pt,i) => { if (i===0) ctx.moveTo(pt.x,pt.y); else ctx.lineTo(pt.x,pt.y); }); ctx.stroke();
    } else if (s.type === "text") {
      const fs = s.fontSize || Math.round(cw * 0.05);
      const wt = s.bold ? "bold" : "normal", st = s.italic ? "italic" : "normal";
      ctx.font = `${st} ${wt} ${fs}px system-ui,-apple-system,sans-serif`;
      ctx.fillText(s.text, s.x, s.y + fs);
    }
  };

  const getCanvasPt = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX-rect.left)*sx, y: (src.clientY-rect.top)*sy };
  };

  // ── Pointer events ───────────────────────────────────────────
  const onDown = (e) => {
    if (spaceHeldRef.current) return;
    e.preventDefault();
    const cw = canvasRef.current?.width || 1;

    if (tool === "select") {
      const pt = getCanvasPt(e);
      const list = strokesRef.current;
      if (selectedIdRef.current) {
        const sel = list.find(s => s.id === selectedIdRef.current);
        if (sel) {
          const handle = aeHitHandle(sel, pt.x, pt.y, cw);
          if (handle) { selDragRef.current = { action:"resize", handle, origStroke:{...sel, points:sel.points?[...sel.points]:undefined}, startPt:pt }; return; }
        }
      }
      for (let i = list.length-1; i >= 0; i--) {
        if (list[i].visible === false) continue;
        if (aeHitTest(list[i], pt.x, pt.y, cw)) {
          const hit = list[i];
          setSelectedId(hit.id); selectedIdRef.current = hit.id;
          if (hit.type === "text") { setTextFontSize(hit.fontSize||18); setTextBold(!!hit.bold); setTextItalic(!!hit.italic); }
          setColor(hit.color);
          selDragRef.current = { action:"move", origStroke:{...hit, points:hit.points?[...hit.points]:undefined}, startPt:pt };
          redrawCanvas(list);
          return;
        }
      }
      setSelectedId(null); selectedIdRef.current = null; selDragRef.current = null;
      redrawCanvas(list);
      return;
    }

    if (tool === "text") {
      const pt = getCanvasPt(e);
      const src = e.touches ? e.touches[0] : e;
      const areaRect = planAreaRef.current.getBoundingClientRect();
      setTextPending({ x: pt.x, y: pt.y, screenX: src.clientX - areaRect.left, screenY: src.clientY - areaRect.top });
      setTextValue("");
      setTimeout(() => textInputRef.current?.focus(), 60);
      return;
    }

    const pt = getCanvasPt(e);
    setSelectedId(null); selectedIdRef.current = null;
    setDrawing(true); setStartPt(pt); setCurrentPt(pt);
    if (tool === "pen") setPenPoints([pt]);
  };

  const onMove = (e) => {
    if (spaceHeldRef.current) return;
    e.preventDefault();
    if (tool === "select") {
      if (!selDragRef.current) return;
      const pt = getCanvasPt(e);
      const drag = selDragRef.current;
      const dx = pt.x-drag.startPt.x, dy = pt.y-drag.startPt.y;
      const updated = drag.action==="move" ? aeApplyMove(drag.origStroke,dx,dy) : aeApplyResize(drag.origStroke,drag.handle,dx,dy);
      drag.currentStroke = updated;
      redrawCanvas(strokesRef.current.map(s => s.id===updated.id ? updated : s));
      return;
    }
    if (!drawing) return;
    const pt = getCanvasPt(e);
    setCurrentPt(pt);
    if (tool === "pen") {
      setPenPoints(prev => { const pts=[...prev,pt]; redrawCanvas(strokesRef.current, {type:"pen",color,points:pts}); return pts; });
    } else {
      redrawCanvas(strokesRef.current, {type:tool,color,x1:startPt.x,y1:startPt.y,x2:pt.x,y2:pt.y});
    }
  };

  const onUp = (e) => {
    if (spaceHeldRef.current) return;
    e.preventDefault();
    if (tool === "select") {
      const drag = selDragRef.current;
      if (drag?.currentStroke) {
        const updated = drag.currentStroke;
        setStrokes(prev => prev.map(s => s.id===updated.id ? updated : s));
      }
      selDragRef.current = null;
      return;
    }
    if (!drawing) return;
    setDrawing(false);
    let stroke;
    if (tool === "pen") {
      if (penPoints.length < 2) { setPenPoints([]); return; }
      stroke = { id:genId(), visible:true, type:"pen", color, points:penPoints };
      setPenPoints([]);
    } else {
      const pt = currentPt || startPt;
      if (!pt || (Math.abs(pt.x-startPt.x)<3 && Math.abs(pt.y-startPt.y)<3)) { redrawCanvas(strokesRef.current); return; }
      stroke = { id:genId(), visible:true, type:tool, color, x1:startPt.x, y1:startPt.y, x2:pt.x, y2:pt.y };
    }
    const id = stroke.id;
    setStrokes(prev => [...prev, stroke]);
    setSelectedId(id); selectedIdRef.current = id;
  };

  const confirmText = () => {
    if (!textPending || !textValue.trim()) { setTextPending(null); setTextValue(""); return; }
    const stroke = { id:genId(), visible:true, type:"text", color, x:textPending.x, y:textPending.y, text:textValue.trim(), fontSize:textFontSize, bold:textBold, italic:textItalic };
    const id = stroke.id;
    setStrokes(prev => [...prev, stroke]);
    setSelectedId(id); selectedIdRef.current = id;
    setTextPending(null); setTextValue("");
  };

  // ── Layer helpers ────────────────────────────────────────────
  const undoStroke = () => { setStrokes(prev => prev.slice(0,-1)); setSelectedId(null); selectedIdRef.current = null; };
  const clearStrokes = () => { setStrokes([]); setSelectedId(null); selectedIdRef.current = null; };
  const deleteLayerStroke = (idx) => { if (strokes[idx]?.id===selectedId) { setSelectedId(null); selectedIdRef.current=null; } setStrokes(prev => prev.filter((_,i)=>i!==idx)); };
  const toggleLayerVisibility = (id) => setStrokes(prev => prev.map(s => s.id===id ? {...s, visible:s.visible===false} : s));
  const reorderLayerStrokes = (from, to) => setStrokes(prev => { const arr=[...prev]; const [item]=arr.splice(from,1); arr.splice(to,0,item); return arr; });

  // ── Save (bake markers into canvas) ──────────────────────────
  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Create a temp canvas to composite markers
    const tmp = document.createElement("canvas");
    tmp.width = canvas.width; tmp.height = canvas.height;
    const ctx = tmp.getContext("2d");
    ctx.drawImage(canvas, 0, 0);
    // Draw markers
    markers.forEach(m => {
      const px = (m.x / 100) * tmp.width;
      const py = (m.y / 100) * tmp.height;
      const r = 14;
      ctx.beginPath(); ctx.arc(px, py - r - 4, r, 0, 2 * Math.PI); ctx.fillStyle = AC; ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.font = "bold 11px system-ui,-apple-system,sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(m.number), px, py - r - 4);
      // Triangle
      ctx.beginPath();
      ctx.moveTo(px - 6, py - 4); ctx.lineTo(px + 6, py - 4); ctx.lineTo(px, py + 3);
      ctx.closePath(); ctx.fillStyle = AC; ctx.fill();
      ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
    });
    onSave(tmp.toDataURL("image/jpeg", 0.92));
  };

  return (
    <div style={{ position:"fixed", inset:0, background:BG, zIndex:300, display:"flex", flexDirection:"column" }}>

      {/* ── Header ── */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 16px", background:WH, borderBottom:`1px solid ${SBB}`, flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:15, fontWeight:700, color:TX }}>{t("photoAnno.title")}</span>
          <span style={{ fontSize:11, color:TX3, fontWeight:500 }}>{strokes.length + markers.length} annotation{(strokes.length + markers.length) !== 1 ? "s" : ""}</span>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <button onClick={handleSave}
            style={{ padding:"7px 16px", border:"none", borderRadius:7, background:AC, color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", gap:6 }}>
            <Ico name="check" size={14} color="#fff" />{t("save")}
          </button>
          <button onClick={onClose} style={{ padding:"7px 18px", border:"none", borderRadius:8, background:TX, color:"#fff", fontWeight:600, fontSize:13, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
            {t("close")}
          </button>
        </div>
      </div>

      {/* ── Body : sidebar + image ── */}
      <div style={{ flex:1, display:"flex", overflow:"hidden" }}>

        {/* ── Sidebar ── */}
        <div style={{ width:210, flexShrink:0, background:SB, borderRight:`1px solid ${SBB}`, display:"flex", flexDirection:"column", overflowY:"auto" }}>

          {/* Sélecteur de mode */}
          <div style={{ padding:"10px 10px 0", flexShrink:0, borderBottom:`1px solid ${SBB}`, paddingBottom:10 }}>
            <div style={{ display:"flex", background:SB2, borderRadius:8, padding:3 }}>
              {[
                { id:"vue",      label:t("photoAnno.modeView"),   icon:"eye"    },
                { id:"marqueur", label:t("photoAnno.modeMarker"), icon:"mappin" },
                { id:"dessin",   label:t("photoAnno.modeDraw"),   icon:"pen2"   },
              ].map(m => (
                <button key={m.id} onClick={() => switchMode(m.id)}
                  style={{ flex:1, padding:"6px 2px", border:"none", borderRadius:6, background:mode===m.id?WH:"transparent", color:mode===m.id?TX:TX3, fontWeight:mode===m.id?700:400, fontSize:10, cursor:"pointer", fontFamily:"inherit", boxShadow:mode===m.id?"0 1px 2px rgba(0,0,0,0.08)":"none", display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                  <Ico name={m.icon} size={13} color={mode===m.id?AC:TX3} />
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── MODE VUE ── */}
          {mode === "vue" && (
            <div style={{ padding:"12px 12px 14px", flex:1 }}>
              <div style={{ display:"flex", gap:6, marginBottom:14 }}>
                <div style={{ flex:1, background:WH, border:`1px solid ${SBB}`, borderRadius:8, padding:"8px 6px", textAlign:"center" }}>
                  <div style={{ fontSize:20, fontWeight:700, color:AC, lineHeight:1 }}>{markers.length}</div>
                  <div style={{ fontSize:9, color:TX3, marginTop:3, fontWeight:500 }}>marqueur{markers.length !== 1 ? "s" : ""}</div>
                </div>
                <div style={{ flex:1, background:WH, border:`1px solid ${SBB}`, borderRadius:8, padding:"8px 6px", textAlign:"center" }}>
                  <div style={{ fontSize:20, fontWeight:700, color:TX2, lineHeight:1 }}>{strokes.length}</div>
                  <div style={{ fontSize:9, color:TX3, marginTop:3, fontWeight:500 }}>dessin{strokes.length !== 1 ? "s" : ""}</div>
                </div>
              </div>

              {markers.length > 0 && (
                <>
                  <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", color:TX3, marginBottom:8 }}>{t("photoAnno.markers")}</div>
                  {markers.map(m => (
                    <div key={m.id} style={{ display:"flex", alignItems:"center", gap:7, padding:"6px 0", borderBottom:`1px solid ${SB2}` }}>
                      <div style={{ width:20, height:20, borderRadius:"50%", background:AC, color:"#fff", fontSize:10, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{m.number}</div>
                      <span style={{ fontSize:11, color:TX2, flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.label}</span>
                      <button onClick={() => removeMarker(m.id)} style={{ background:"none", border:"none", cursor:"pointer", padding:2, flexShrink:0, opacity:0.4 }}><Ico name="trash" size={11} color={TX3} /></button>
                    </div>
                  ))}
                </>
              )}

              {strokes.length > 0 && (
                <>
                  <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", color:TX3, marginBottom:8, marginTop:markers.length > 0 ? 14 : 0 }}>Annotations</div>
                  {strokes.map((s, idx) => {
                    const toolDef = ANNO_TOOLS.find(t => t.id === s.type);
                    return (
                      <div key={idx} style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 0", borderBottom:`1px solid ${SB2}` }}>
                        <div style={{ width:7, height:7, borderRadius:"50%", background:s.color, border:"1px solid rgba(0,0,0,0.08)", flexShrink:0 }} />
                        <Ico name={toolDef?.icon || "pen2"} size={11} color={TX3} />
                        <span style={{ fontSize:11, color:TX2, flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          {s.type === "text" ? `"${s.text}"` : toolDef?.label || s.type}
                        </span>
                        <button onClick={() => deleteLayerStroke(idx)} style={{ background:"none", border:"none", cursor:"pointer", padding:2, flexShrink:0, opacity:0.4 }}><Ico name="trash" size={11} color={TX3} /></button>
                      </div>
                    );
                  })}
                </>
              )}

              {markers.length === 0 && strokes.length === 0 && (
                <div style={{ padding:"14px 6px", textAlign:"center", color:TX3, fontSize:11, lineHeight:1.7 }}>{t("photoAnno.noAnnotation")}</div>
              )}
            </div>
          )}

          {/* ── MODE MARQUEUR ── */}
          {mode === "marqueur" && (
            <div style={{ padding:"12px 12px 14px" }}>
              {!pendingMarkerPt ? (
                <div style={{ padding:"8px 10px", background:ACL, border:`1px solid ${ACL2}`, borderRadius:7, fontSize:11, color:AC, fontWeight:500, display:"flex", alignItems:"center", gap:6, marginBottom:14 }}>
                  <Ico name="mappin" size={12} color={AC} />
                  {t("photoAnno.clickPhoto")}
                </div>
              ) : (
                <div style={{ padding:"10px 10px", background:ACL, border:`1px solid ${ACL2}`, borderRadius:8, marginBottom:14 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:AC, marginBottom:6 }}>{t("photoAnno.markerLabel")}</div>
                  <input value={markerLabel} onChange={e => setMarkerLabel(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") confirmMarker(); if (e.key === "Escape") { setPendingMarkerPt(null); setMarkerLabel(""); } }}
                    placeholder={`Marqueur #${markers.length + 1}`}
                    style={{ width:"100%", padding:"6px 8px", border:`1px solid ${ACL2}`, borderRadius:6, fontSize:12, background:WH, color:TX, fontFamily:"inherit", marginBottom:8, boxSizing:"border-box" }}
                    autoFocus
                  />
                  <div style={{ display:"flex", gap:6 }}>
                    <button onClick={confirmMarker} style={{ flex:1, padding:"6px 0", border:"none", borderRadius:6, background:AC, color:"#fff", fontWeight:600, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>{t("confirm")}</button>
                    <button onClick={() => { setPendingMarkerPt(null); setMarkerLabel(""); }} style={{ padding:"6px 10px", border:`1px solid ${ACL2}`, borderRadius:6, background:WH, color:TX2, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>✕</button>
                  </div>
                </div>
              )}

              {markers.length > 0 && (
                <>
                  <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", color:TX3, marginBottom:8 }}>{t("photoAnno.placed")} · {markers.length}</div>
                  {markers.map(m => (
                    <div key={m.id} style={{ display:"flex", alignItems:"center", gap:7, padding:"6px 0", borderBottom:`1px solid ${SB2}` }}>
                      <div style={{ width:20, height:20, borderRadius:"50%", background:AC, color:"#fff", fontSize:10, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{m.number}</div>
                      <span style={{ fontSize:11, color:TX2, flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.label}</span>
                      <button onClick={() => removeMarker(m.id)} style={{ background:"none", border:"none", cursor:"pointer", padding:2, flexShrink:0 }}><Ico name="trash" size={11} color={TX3} /></button>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* ── MODE DESSIN ── */}
          {mode === "dessin" && (
            <div style={{ padding:"12px 12px 14px" }}>
              {/* Outils */}
              <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", color:TX3, marginBottom:8 }}>{t("anno.tool")}</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:3, marginBottom:14 }}>
                {ANNO_TOOLS.map(t => {
                  const active = tool === t.id;
                  return (
                    <button key={t.id} title={t.label}
                      onClick={() => { setTool(t.id); if (t.id!=="select") { setSelectedId(null); selectedIdRef.current=null; redrawCanvas(strokesRef.current); } }}
                      style={{ padding:`${SP.sm+2}px ${SP.xs}px ${SP.sm}px`, border:`1.5px solid ${active?AC:SBB}`, borderRadius:RAD.md, background:active?ACL:WH, cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:SP.xs, fontFamily:"inherit", boxShadow:active?"none":"0 1px 2px rgba(0,0,0,0.04)", minHeight:44 }}>
                      <Ico name={t.icon} size={16} color={active?AC:TX2} />
                      <span style={{ fontSize:FS.xs, fontWeight:active?700:500, color:active?AC:TX3, letterSpacing:"0.01em", lineHeight:1 }}>{t.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Couleur */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", color:TX3 }}>{t("anno.color")}</div>
                <div style={{ width:16, height:16, borderRadius:4, background:color, border:"1px solid rgba(0,0,0,0.12)", flexShrink:0 }} />
              </div>
              <div style={{ display:"flex", gap:5, alignItems:"center", marginBottom:14 }}>
                {ANNO_COLORS.map(c => (
                  <button key={c} title={c}
                    onClick={() => {
                      setColor(c);
                      if (tool==="select" && selectedId) {
                        const sel = strokesRef.current.find(s=>s.id===selectedId);
                        if (sel) setStrokes(prev=>prev.map(s=>s.id===selectedId?{...s,color:c}:s));
                      }
                    }}
                    style={{ width:22, height:22, borderRadius:"50%", background:c, border:color===c?`2.5px solid ${AC}`:"1.5px solid rgba(0,0,0,0.12)", cursor:"pointer", boxShadow:color===c?`0 0 0 2px ${ACL}`:"none", outline:"none", flexShrink:0 }}
                  />
                ))}
                {/* Pipette / color picker */}
                <button onClick={pickColorFromImage} title={t("anno.pipette")} style={{ width:22, height:22, borderRadius:"50%", border:`1.5px solid ${SBB}`, background:WH, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, padding:0 }}>
                  <Ico name="pipette" size={12} color={TX2} />
                </button>
                <input ref={colorPickerRef} type="color" value={color}
                  onChange={e => {
                    const c = e.target.value;
                    setColor(c);
                    if (tool==="select" && selectedId) {
                      setStrokes(prev => prev.map(s => s.id===selectedId ? {...s, color:c} : s));
                    }
                  }}
                  style={{ width:0, height:0, padding:0, border:"none", opacity:0, position:"absolute", pointerEvents:"none" }}
                />
              </div>

              {/* Propriétés texte */}
              {(tool==="text" || (tool==="select" && strokes.find(s=>s.id===selectedId)?.type==="text")) && (
                <div style={{ marginBottom:14 }}>
                  <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", color:TX3, marginBottom:7 }}>{t("anno.sizeStyle")}</div>
                  <div style={{ display:"flex", gap:3, marginBottom:6 }}>
                    {[12,16,22,32,48].map(sz => (
                      <button key={sz}
                        onClick={() => {
                          setTextFontSize(sz);
                          if (tool==="select" && selectedId) {
                            const sel = strokesRef.current.find(s=>s.id===selectedId);
                            if (sel?.type==="text") setStrokes(prev=>prev.map(s=>s.id===selectedId?{...s,fontSize:sz}:s));
                          }
                        }}
                        style={{ flex:1, padding:"4px 1px", border:`1.5px solid ${textFontSize===sz?AC:SBB}`, borderRadius:5, background:textFontSize===sz?ACL:WH, cursor:"pointer", fontSize:Math.max(7,Math.min(11,sz*0.42)), fontWeight:600, color:textFontSize===sz?AC:TX3, fontFamily:"inherit" }}
                      >{sz}</button>
                    ))}
                  </div>
                  <div style={{ display:"flex", gap:4 }}>
                    <button
                      onClick={() => {
                        const next=!textBold;
                        setTextBold(next);
                        if (tool==="select" && selectedId) { const sel=strokesRef.current.find(s=>s.id===selectedId); if (sel?.type==="text") setStrokes(prev=>prev.map(s=>s.id===selectedId?{...s,bold:next}:s)); }
                      }}
                      style={{ flex:1, padding:"6px 0", border:`1.5px solid ${textBold?AC:SBB}`, borderRadius:6, background:textBold?ACL:WH, cursor:"pointer", fontWeight:800, fontSize:13, color:textBold?AC:TX2, fontFamily:"inherit" }}>B</button>
                    <button
                      onClick={() => {
                        const next=!textItalic;
                        setTextItalic(next);
                        if (tool==="select" && selectedId) { const sel=strokesRef.current.find(s=>s.id===selectedId); if (sel?.type==="text") setStrokes(prev=>prev.map(s=>s.id===selectedId?{...s,italic:next}:s)); }
                      }}
                      style={{ flex:1, padding:"6px 0", border:`1.5px solid ${textItalic?AC:SBB}`, borderRadius:6, background:textItalic?ACL:WH, cursor:"pointer", fontStyle:"italic", fontWeight:700, fontSize:13, color:textItalic?AC:TX2, fontFamily:"inherit" }}>I</button>
                  </div>
                </div>
              )}

              {/* Calques */}
              <div style={{ height:1, background:SBB, marginBottom:10 }} />
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:strokes.length>0?6:0 }}>
                <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", color:TX3, display:"flex", alignItems:"center", gap:5 }}>
                  <Ico name="layers" size={11} color={TX3} />{t("anno.layers")} · {strokes.length}
                </div>
                {strokes.length > 0 && (
                  <div style={{ display:"flex", gap:2 }}>
                    <button onClick={undoStroke} title={t("anno.undoLast")} style={{ background:"none", border:"none", cursor:"pointer", padding:"3px 5px", borderRadius:5 }}><Ico name="undo" size={12} color={TX2} /></button>
                    <button onClick={clearStrokes} title={t("anno.clearAll")} style={{ background:"none", border:"none", cursor:"pointer", padding:"3px 5px", borderRadius:5 }}><Ico name="trash" size={12} color={RD} /></button>
                  </div>
                )}
              </div>
              {strokes.length===0 && (
                <div style={{ fontSize:11, color:DIST, padding:"18px 6px 10px", textAlign:"center" }}>{t("anno.noDrawing")}</div>
              )}
              {[...strokes].reverse().map((s, revIdx) => {
                const actualIdx = strokes.length-1-revIdx;
                const toolDef = ANNO_TOOLS.find(t=>t.id===s.type);
                const isSel = s.id === selectedId;
                const isHidden = s.visible === false;
                return (
                  <div key={s.id||actualIdx}
                    draggable
                    onDragStart={e=>{ e.dataTransfer.setData("text/plain",String(actualIdx)); e.dataTransfer.effectAllowed="move"; }}
                    onDragOver={e=>e.preventDefault()}
                    onDrop={e=>{ e.preventDefault(); const from=parseInt(e.dataTransfer.getData("text/plain")); if (from!==actualIdx) reorderLayerStrokes(from,actualIdx); }}
                    onClick={() => {
                      setTool("select");
                      setSelectedId(s.id); selectedIdRef.current=s.id;
                      if (s.type==="text") { setTextFontSize(s.fontSize||18); setTextBold(!!s.bold); setTextItalic(!!s.italic); }
                      setColor(s.color);
                      redrawCanvas(strokesRef.current);
                    }}
                    style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 4px", borderRadius:5, marginBottom:1, background:isSel?ACL:"transparent", border:`1px solid ${isSel?ACL2:"transparent"}`, cursor:"pointer", opacity:isHidden?0.4:1 }}
                  >
                    <div style={{ cursor:"grab", color:DIST, fontSize:10, lineHeight:1, paddingRight:1, flexShrink:0 }}>⠿</div>
                    <div style={{ width:7, height:7, borderRadius:"50%", background:s.color, border:"1px solid rgba(0,0,0,0.1)", flexShrink:0 }} />
                    <Ico name={toolDef?.icon||"pen2"} size={10} color={isSel?AC:TX3} />
                    <span style={{ fontSize:10.5, color:isSel?AC:TX2, flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontWeight:isSel?600:400 }}>
                      {s.type==="text"?`"${s.text}"`:toolDef?.label||s.type}
                    </span>
                    <button onClick={e=>{ e.stopPropagation(); toggleLayerVisibility(s.id); }} title={isHidden?t("anno.show"):t("anno.hide")}
                      style={{ background:"none", border:"none", cursor:"pointer", padding:2, flexShrink:0, opacity:isHidden?0.4:0.6 }}>
                      <Ico name={isHidden?"eye-off":"eye"} size={10} color={TX3} />
                    </button>
                    <button onClick={e=>{ e.stopPropagation(); if (isSel) { setSelectedId(null); selectedIdRef.current=null; } deleteLayerStroke(actualIdx); }}
                      style={{ background:"none", border:"none", cursor:"pointer", padding:2, flexShrink:0, opacity:0.4 }}>
                      <Ico name="trash" size={10} color={TX3} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Image area (zoomable + pannable) ── */}
        <div
          ref={planAreaRef}
          style={{ flex:1, position:"relative", overflow:"hidden", background:"#ECEAE6", cursor:getCursor() }}
          onMouseDown={onAreaDown}
          onMouseMove={onAreaMove}
          onMouseUp={onAreaUp}
          onMouseLeave={onAreaUp}
        >
          {/* Image transformée (zoom + pan) */}
          <div
            ref={containerRef}
            onClick={handlePlanClick}
            style={{ position:"absolute", top:0, left:0, transformOrigin:"0 0", transform:`translate(${vp.panX}px,${vp.panY}px) scale(${vp.zoom})`, boxShadow:"0 4px 24px rgba(0,0,0,0.15)", borderRadius:6, overflow:"hidden", userSelect:"none" }}
          >
            {imgBase.w > 0 && (
              <img src={getPhotoUrl(photo)} alt="Photo" style={{ display:"block", width:imgBase.w, height:imgBase.h }} />
            )}

            {/* Canvas annotation overlay */}
            <canvas
              ref={canvasRef}
              style={{ position:"absolute", inset:0, width:"100%", height:"100%", pointerEvents:(mode==="dessin" && !textPending && !spaceHeld)?"auto":"none", cursor:tool==="select"?"default":tool==="text"?"text":"crosshair", touchAction:"none" }}
              onMouseDown={mode==="dessin"?onDown:undefined}
              onMouseMove={mode==="dessin"?onMove:undefined}
              onMouseUp={mode==="dessin"?onUp:undefined}
              onMouseLeave={mode==="dessin"?onUp:undefined}
              onTouchStart={mode==="dessin"?onDown:undefined}
              onTouchMove={mode==="dessin"?onMove:undefined}
              onTouchEnd={mode==="dessin"?onUp:undefined}
            />

            {/* Marqueurs affichés */}
            {markers.map(m => (
              <div key={m.id} onClick={e => e.stopPropagation()} title={m.label} style={{ position:"absolute", left:`${m.x}%`, top:`${m.y}%`, transform:"translate(-50%, -100%)", zIndex:10 }}>
                <div style={{ width:28, height:28, borderRadius:"50%", background:AC, color:"#fff", fontSize:11, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", border:"2.5px solid #fff", boxShadow:"0 2px 10px rgba(0,0,0,0.4)" }}>{m.number}</div>
                <div style={{ width:0, height:0, borderLeft:"6px solid transparent", borderRight:"6px solid transparent", borderTop:`7px solid ${AC}`, margin:"0 auto" }} />
              </div>
            ))}

            {/* Marqueur en attente */}
            {pendingMarkerPt && (
              <div style={{ position:"absolute", left:`${pendingMarkerPt.x}%`, top:`${pendingMarkerPt.y}%`, transform:"translate(-50%, -100%)", zIndex:11, pointerEvents:"none" }}>
                <div style={{ width:28, height:28, borderRadius:"50%", background:TX3, color:"#fff", fontSize:14, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", border:"2.5px solid #fff", boxShadow:"0 2px 10px rgba(0,0,0,0.25)" }}>?</div>
                <div style={{ width:0, height:0, borderLeft:"6px solid transparent", borderRight:"6px solid transparent", borderTop:`7px solid ${TX3}`, margin:"0 auto" }} />
              </div>
            )}
          </div>

          {/* Saisie texte */}
          {textPending && (
            <div style={{ position:"absolute", left:textPending.screenX, top:textPending.screenY, zIndex:30, pointerEvents:"auto" }}
              onMouseDown={e => e.stopPropagation()}>
              <input
                ref={textInputRef}
                value={textValue}
                onChange={e => {
                  const v=e.target.value; setTextValue(v);
                  redrawCanvas(strokesRef.current, v?{type:"text",color,x:textPending.x,y:textPending.y,text:v,fontSize:textFontSize,bold:textBold,italic:textItalic}:null);
                }}
                onKeyDown={e=>{ if (e.key==="Enter") confirmText(); if (e.key==="Escape") { redrawCanvas(strokesRef.current); setTextPending(null); setTextValue(""); } }}
                placeholder="Texte…"
                style={{ border:`2px solid ${color}`, borderRadius:5, background:"rgba(255,255,255,0.93)", color, fontSize:textFontSize*vp.zoom, fontWeight:textBold?700:400, fontStyle:textItalic?"italic":"normal", fontFamily:"system-ui,-apple-system,sans-serif", padding:"5px 10px", minWidth:90, maxWidth:280, outline:"none", boxShadow:"0 3px 16px rgba(0,0,0,0.22)", backdropFilter:"blur(4px)", display:"block" }}
              />
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.9)", background:"rgba(0,0,0,0.55)", padding:"2px 6px", borderRadius:"0 0 4px 4px", textAlign:"center", backdropFilter:"blur(3px)" }}>↵ Valider · Esc Annuler</div>
            </div>
          )}

          {/* Bannières mode actif */}
          {mode === "marqueur" && !pendingMarkerPt && (
            <div style={{ position:"absolute", top:14, left:"50%", transform:"translateX(-50%)", background:"rgba(217,123,13,0.92)", color:"#fff", fontSize:11, fontWeight:600, padding:"5px 14px 5px 10px", borderRadius:20, pointerEvents:"none", whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:6, backdropFilter:"blur(4px)", zIndex:20 }}>
              <Ico name="mappin" size={12} color="#fff" />{t("anno.clickToPlaceMarker")}
            </div>
          )}
          {mode === "dessin" && !textPending && tool !== "select" && (
            <div style={{ position:"absolute", top:14, left:"50%", transform:"translateX(-50%)", background:"rgba(29,29,27,0.78)", color:"#fff", fontSize:11, fontWeight:600, padding:"5px 14px 5px 10px", borderRadius:20, pointerEvents:"none", whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:6, backdropFilter:"blur(4px)", zIndex:20 }}>
              <Ico name={ANNO_TOOLS.find(at => at.id === tool)?.icon || "pen2"} size={12} color="#fff" />
              {ANNO_TOOLS.find(at => at.id === tool)?.label}
              {spaceHeld && <span style={{ opacity:0.65, fontWeight:400, marginLeft:2 }}>· Navigation</span>}
            </div>
          )}
          {mode === "dessin" && tool === "select" && !selectedId && !spaceHeld && strokes.length > 0 && (
            <div style={{ position:"absolute", top:14, left:"50%", transform:"translateX(-50%)", background:"rgba(29,29,27,0.55)", color:"#fff", fontSize:11, fontWeight:500, padding:"4px 12px", borderRadius:20, pointerEvents:"none", whiteSpace:"nowrap", backdropFilter:"blur(4px)", zIndex:20 }}>
              {t("anno.clickToSelect")}
            </div>
          )}

          {/* Contrôles zoom */}
          <div style={{ position:"absolute", bottom:16, right:16, zIndex:20, display:"flex", alignItems:"center", gap:2, background:"rgba(255,255,255,0.94)", backdropFilter:"blur(8px)", border:`1px solid ${SBB}`, borderRadius:22, padding:"4px 6px", boxShadow:"0 2px 12px rgba(0,0,0,0.10)" }}>
            <button onClick={() => zoomBy(1/1.4)} title="Zoom arrière" style={{ width:27, height:27, border:"none", borderRadius:6, background:"transparent", cursor:"pointer", fontSize:17, fontWeight:300, color:TX2, display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1, fontFamily:"inherit" }}>−</button>
            <span style={{ fontSize:10, color:TX3, fontWeight:600, minWidth:36, textAlign:"center" }}>{Math.round(vp.zoom * 100)}%</span>
            <button onClick={() => zoomBy(1.4)} title="Zoom avant" style={{ width:27, height:27, border:"none", borderRadius:6, background:"transparent", cursor:"pointer", fontSize:17, fontWeight:300, color:TX2, display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1, fontFamily:"inherit" }}>+</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function NoteEditor({ project, setProjects, profile, onBack, onGenerate }) {
  const [activePost,      setActivePost]      = useState(null);
  const [annotatingPhoto, setAnnotatingPhoto] = useState(null);
  const [addText,    setAddText]    = useState("");
  const [addUrgent,  setAddUrgent]  = useState(false);
  const [recipientFilters, setRecipientFilters] = useState(null); // null = not chosen yet, [] = tous explicitly
  const hasExistingRemarks = project.posts.some(p => (p.remarks || []).length > 0 || p.notes?.trim());
  const [inputMethod, setInputMethod] = useState(() => hasExistingRemarks ? "write" : null); // null = choose, "write" | "dictate"
  const [selectedMethod, setSelectedMethod] = useState("dictate"); // pre-selected method in chooser
  const [pvTitle, setPvTitle] = useState(`PV n°${project.pvHistory.length + 1}`);
  const [mobileStep, setMobileStep] = useState(0);
  const [renamingPost, setRenamingPost] = useState(null);
  const [renameVal,    setRenameVal]    = useState("");
  const [inputMode,    setInputMode]    = useState("write"); // "write" | "voice"
  const [isRecording,  setIsRecording]  = useState(false);
  const [voiceInterim, setVoiceInterim] = useState("");
  const [voiceErr,     setVoiceErr]     = useState("");
  const photoRef       = useRef(null);
  const addInputRef    = useRef(null);
  const recognitionRef = useRef(null);
  const t = useT();
  const tp = useTP();

  // ── Attendance tracking ──
  const [attendance, setAttendance] = useState(
    () => project.participants.map(p => ({ ...p, present: true }))
  );
  const toggleAttendance = (idx) => setAttendance(prev => prev.map((a, i) => i === idx ? { ...a, present: !a.present } : a));

  // ── Visit timestamp ──
  const [visitStart] = useState(() => new Date().toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" }));
  const [visitEnd, setVisitEnd] = useState("");

  // Arrêter la reconnaissance vocale quand on change de poste
  useEffect(() => {
    return () => { recognitionRef.current?.stop(); };
  }, [activePost]);

  const stopVoice = () => {
    recognitionRef.current?.stop();
    setIsRecording(false);
    setVoiceInterim("");
  };

  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setVoiceErr(t("notes.voiceNotSupported"));
      return;
    }
    setVoiceErr("");
    const rec = new SR();
    rec.lang = "fr-FR";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          const text = e.results[i][0].transcript.trim();
          if (text) {
            const post = project.posts.find((p) => p.id === activePost);
            if (post) {
              const current = getRemarks(post);
              setRemarks(post.id, [...current, { id: Date.now() + Math.random(), text, urgent: false, status: "open" }]);
            }
          }
        } else {
          interim += e.results[i][0].transcript;
        }
      }
      setVoiceInterim(interim);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed") setVoiceErr(t("notes.micDenied"));
      else if (e.error !== "no-speech") setVoiceErr("Erreur microphone : " + e.error);
      setIsRecording(false);
      setVoiceInterim("");
    };
    rec.onend = () => { setIsRecording(false); setVoiceInterim(""); };
    recognitionRef.current = rec;
    rec.start();
    setIsRecording(true);
  };

  // ── Continuous recording (global, not per-post) ──
  const [contRecording, setContRecording] = useState(false);
  const [contTranscript, setContTranscript] = useState("");
  const [contInterim, setContInterim] = useState("");
  const [contDispatching, setContDispatching] = useState(false);
  const [contReview, setContReview] = useState(false);
  const [contErr, setContErr] = useState("");
  const [contSeconds, setContSeconds] = useState(0);
  const contRecRef = useRef(null);
  const contTimerRef = useRef(null);
  const contTranscriptRef = useRef("");

  const startContinuous = (resume = false) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setContErr(t("notes.voiceNotSupported")); return; }
    setContErr("");
    if (!resume) {
      setContTranscript("");
      setContSeconds(0);
      contTranscriptRef.current = "";
    }
    setContInterim("");
    const rec = new SR();
    rec.lang = "fr-FR";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          const text = e.results[i][0].transcript.trim();
          if (text) {
            contTranscriptRef.current += (contTranscriptRef.current ? " " : "") + text;
            setContTranscript(contTranscriptRef.current);
          }
        } else {
          interim += e.results[i][0].transcript;
        }
      }
      setContInterim(interim);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed") setContErr(t("notes.micDenied"));
      else if (e.error !== "no-speech") setContErr("Erreur microphone : " + e.error);
      setContRecording(false);
      clearInterval(contTimerRef.current);
    };
    rec.onend = () => {
      // Auto-restart if still in continuous mode (browser stops after silence)
      // Check both _keepAlive AND that contRecRef still points to this instance
      if (rec._keepAlive && contRecRef.current === rec) {
        try { rec.start(); } catch (_) {}
      }
    };
    rec._keepAlive = true;
    contRecRef.current = rec;
    rec.start();
    setContRecording(true);
    contTimerRef.current = setInterval(() => setContSeconds(s => s + 1), 1000);
  };

  const stopContinuous = () => {
    // Disable auto-restart BEFORE stopping
    if (contRecRef.current) {
      contRecRef.current._keepAlive = false;
    }
    // Small delay to let the last onresult fire before we read the ref
    setTimeout(() => {
      if (contRecRef.current) {
        try { contRecRef.current.stop(); } catch (_) {}
        contRecRef.current = null;
      }
      setContRecording(false);
      setContInterim("");
      clearInterval(contTimerRef.current);
      // Combine finalized transcript + any pending interim
      const transcript = contTranscriptRef.current.trim();
      if (!transcript) {
        // Nothing was captured — go back to chooser
        setInputMethod(null);
        return;
      }
      setContTranscript(transcript);
      setContReview(true);
    }, 300);
  };

  const submitTranscript = async () => {
    const transcript = contTranscript.trim();
    if (!transcript) return;
    setContReview(false);
    await dispatchTranscript(transcript);
  };

  const dispatchTranscript = async (transcript) => {
    setContDispatching(true);
    setContErr("");
    try {
      const posts = project.posts.map(p => ({ id: p.id, label: p.label }));
      console.log("dispatch-remarks payload:", { transcript: transcript?.slice(0, 100), transcriptLength: transcript?.length, postsCount: posts.length, posts });
      if (!transcript?.trim()) {
        throw new Error("La transcription est vide. Parlez dans le microphone avant de répartir.");
      }
      if (!posts?.length) {
        // Auto-create a default post if none exist
        setProjects(prev => prev.map(p => p.id === project.id && (!p.posts || p.posts.length === 0) ? { ...p, posts: [{ id: "01", label: "Situation du chantier", notes: "", remarks: [] }] } : p));
        throw new Error("Aucun poste défini — un poste par défaut a été créé. Réessayez.");
      }
      const { data, error } = await supabase.functions.invoke("dispatch-remarks", {
        body: { transcript, posts },
      });
      if (error) throw new Error(error.message || "Erreur serveur");
      if (data?.error) throw new Error(data.error);
      const items = data?.items;
      if (!Array.isArray(items)) throw new Error("Réponse invalide");
      // Normalize postIds for flexible matching (e.g. "1" matches "01")
      const normalizeId = (id) => String(id).replace(/^0+/, "") || "0";
      const postIds = project.posts.map(po => po.id);
      const findPost = (rawId) => {
        const s = String(rawId);
        if (postIds.includes(s)) return s;
        const norm = normalizeId(s);
        const match = postIds.find(pid => normalizeId(pid) === norm);
        return match || postIds[0] || null;
      };
      const grouped = {};
      for (const it of items) {
        const resolvedId = findPost(it.postId);
        if (!resolvedId) continue;
        if (!grouped[resolvedId]) grouped[resolvedId] = [];
        grouped[resolvedId].push({ id: Date.now() + Math.random(), text: it.text, urgent: !!it.urgent, status: "open" });
      }
      setProjects(prev => prev.map(p => {
        if (p.id !== project.id) return p;
        const updatedPosts = p.posts.map(po => {
          const newRemarks = grouped[po.id] || [];
          if (newRemarks.length === 0) return po;
          const existing = (po.remarks || []).length > 0 ? po.remarks : (po.notes?.trim() ? parseNotesToRemarks(po.notes) : []);
          return { ...po, remarks: [...existing, ...newRemarks], notes: "" };
        });
        return { ...p, posts: updatedPosts };
      }));
      setContTranscript("");
      setInputMethod("write");
    } catch (e) {
      console.error("Dispatch error:", e);
      setContErr("Erreur : " + e.message);
      setContReview(true);
    } finally {
      setContDispatching(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (contRecRef.current) { contRecRef.current._keepAlive = false; contRecRef.current.stop(); }
      clearInterval(contTimerRef.current);
    };
  }, []);

  const initials = (name) => name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  const updatePost = (postId, patch) => setProjects((prev) => prev.map((p) => p.id === project.id ? {
    ...p, posts: p.posts.map((po) => po.id === postId ? { ...po, ...patch } : po)
  } : p));

  const getRemarks = (post) => {
    // Migrate legacy notes on first access
    if ((post.remarks || []).length === 0 && post.notes?.trim()) {
      return parseNotesToRemarks(post.notes);
    }
    return post.remarks || [];
  };

  const setRemarks = (postId, remarks) => updatePost(postId, { remarks, notes: "" });

  const addRemark = (postId) => {
    if (!addText.trim()) return;
    const post = project.posts.find((p) => p.id === postId);
    const current = getRemarks(post);
    const newRemark = { id: Date.now() + Math.random(), text: addText.trim(), urgent: addUrgent, status: "open" };
    setRemarks(postId, [...current, newRemark]);
    setAddText("");
    // keep urgency toggle so rapid entries stay consistent
    setTimeout(() => addInputRef.current?.focus(), 30);
  };

  const removeRemark = (postId, remarkId) => {
    const post = project.posts.find((p) => p.id === postId);
    setRemarks(postId, getRemarks(post).filter((r) => r.id !== remarkId));
  };

  const cycleStatus = (postId, remarkId) => {
    const post = project.posts.find((p) => p.id === postId);
    setRemarks(postId, getRemarks(post).map((r) => r.id === remarkId ? { ...r, status: nextStatus(r.status) } : r));
  };

  const editRemarkText = (postId, remarkId, text) => {
    const post = project.posts.find((p) => p.id === postId);
    setRemarks(postId, getRemarks(post).map((r) => r.id === remarkId ? { ...r, text } : r));
  };

  const toggleRemarkUrgent = (postId, remarkId) => {
    const post = project.posts.find((p) => p.id === postId);
    setRemarks(postId, getRemarks(post).map((r) => r.id === remarkId ? { ...r, urgent: !r.urgent } : r));
  };

  const toggleRemarkRecipient = (postId, remarkId, participantName) => {
    const post = project.posts.find((p) => p.id === postId);
    setRemarks(postId, getRemarks(post).map((r) => {
      if (r.id !== remarkId) return r;
      const cur = r.recipients || [];
      const has = cur.includes(participantName);
      return { ...r, recipients: has ? cur.filter((n) => n !== participantName) : [...cur, participantName] };
    }));
  };

  const addPhotos = (postId, files) => {
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = ev.target.result;
        const photoId = Date.now() + Math.random();
        // Add immediately with dataUrl for instant preview
        setProjects((prev) => prev.map((p) => p.id === project.id ? {
          ...p, posts: p.posts.map((po) => po.id === postId ? {
            ...po, photos: [...(po.photos || []), { id: photoId, dataUrl }]
          } : po)
        } : p));
        // Upload to Storage in background, then replace dataUrl with URL
        if (navigator.onLine) {
          const result = await uploadPhoto(dataUrl);
          if (result) {
            setProjects((prev) => prev.map((p) => p.id === project.id ? {
              ...p, posts: p.posts.map((po) => po.id === postId ? {
                ...po, photos: (po.photos || []).map((ph) => ph.id === photoId ? { ...ph, url: result.url, storagePath: result.storagePath } : ph)
              } : po)
            } : p));
          }
        } else {
          // Queue for upload when back online — photo stays as dataUrl locally
          addToOfflineQueue({ type: "photo_upload", projectId: project.id, postId, photoId, dataUrl: dataUrl.slice(0, 50) + "..." });
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removePhoto = (postId, photoId) => {
    const post = project.posts.find(po => po.id === postId);
    const photo = (post?.photos || []).find(ph => ph.id === photoId);
    if (photo?.storagePath) deletePhoto(photo.storagePath);
    setProjects((prev) => prev.map((p) => p.id === project.id ? {
      ...p, posts: p.posts.map((po) => po.id === postId ? { ...po, photos: (po.photos || []).filter((ph) => ph.id !== photoId) } : po)
    } : p));
  };

  const saveAnnotation = async (postId, photoId, newDataUrl) => {
    // Update locally immediately
    setProjects((prev) => prev.map((p) => p.id === project.id ? {
      ...p, posts: p.posts.map((po) => po.id === postId ? {
        ...po, photos: (po.photos || []).map((ph) => ph.id === photoId ? { ...ph, dataUrl: newDataUrl, annotated: true } : ph)
      } : po)
    } : p));
    setAnnotatingPhoto(null);
    // Re-upload annotated version to Storage
    const result = await uploadPhoto(newDataUrl);
    if (result) {
      // Delete old file if exists
      const post = project.posts.find(po => po.id === postId);
      const oldPhoto = (post?.photos || []).find(ph => ph.id === photoId);
      if (oldPhoto?.storagePath) deletePhoto(oldPhoto.storagePath);
      // Update with new URL
      setProjects((prev) => prev.map((p) => p.id === project.id ? {
        ...p, posts: p.posts.map((po) => po.id === postId ? {
          ...po, photos: (po.photos || []).map((ph) => ph.id === photoId ? { ...ph, url: result.url, storagePath: result.storagePath } : ph)
        } : po)
      } : p));
    }
  };

  const loadSamples = () => setProjects((prev) => prev.map((p) => p.id === project.id ? {
    ...p, posts: p.posts.map((po) => ({
      ...po,
      remarks: SAMPLES[po.id] ? parseNotesToRemarks(SAMPLES[po.id]) : (po.remarks || []),
      notes: "",
    }))
  } : p));

  const commitRename = (postId) => {
    if (renameVal.trim()) {
      setProjects(prev => prev.map(p => p.id === project.id ? {
        ...p, posts: p.posts.map(po => po.id === postId ? { ...po, label: renameVal.trim() } : po)
      } : p));
    }
    setRenamingPost(null);
  };

  const deletePost = (postId) => {
    setProjects(prev => prev.map(p => p.id === project.id ? {
      ...p, posts: p.posts.filter(po => po.id !== postId)
    } : p));
  };

  const filledCount = project.posts.filter((p) => {
    const remarks = (p.remarks || []).length > 0 ? p.remarks : (p.notes?.trim() ? parseNotesToRemarks(p.notes) : []);
    return remarks.length > 0 || (p.photos || []).length > 0 || (project.planMarkers || []).some((m) => m.postId === p.id);
  }).length;

  if (annotatingPhoto) {
    return (
      <AnnotationEditor
        photo={annotatingPhoto.photo}
        onSave={(dataUrl) => saveAnnotation(annotatingPhoto.postId, annotatingPhoto.photo.id, dataUrl)}
        onClose={() => setAnnotatingPhoto(null)}
      />
    );
  }

  if (activePost) {
    const post    = project.posts.find((p) => p.id === activePost);
    const photos  = post.photos || [];
    const remarks = getRemarks(post);
    const openCount     = remarks.filter((r) => r.status === "open").length;
    const progressCount = remarks.filter((r) => r.status === "progress").length;
    const doneCount     = remarks.filter((r) => r.status === "done").length;

    return (
      <div>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <button onClick={() => setActivePost(null)} style={{ background: "none", border: "none", cursor: "pointer", padding: "8px", minWidth: 40, minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 }}><Ico name="back" color={TX2} /></button>
          <div style={{ flex: 1 }}>
            {renamingPost === post.id ? (
              <input
                autoFocus
                value={renameVal}
                onChange={(e) => setRenameVal(e.target.value)}
                onBlur={() => commitRename(post.id)}
                onKeyDown={(e) => { if (e.key === "Enter") commitRename(post.id); if (e.key === "Escape") setRenamingPost(null); }}
                style={{ fontSize: 16, fontWeight: 600, color: TX, border: `1px solid ${AC}`, borderRadius: 6, padding: "3px 8px", background: WH, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" }}
              />
            ) : (
              <div
                onClick={() => { setRenamingPost(post.id); setRenameVal(post.label); }}
                style={{ fontSize: 16, fontWeight: 600, color: TX, cursor: "text", display: "flex", alignItems: "center", gap: 6 }}
                title={t("notes.rename")}
              >
                {post.id}. {post.label}
                <Ico name="edit" size={13} color={TX3} />
              </div>
            )}
            {remarks.length > 0 && (
              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                {openCount > 0     && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: FS.sm, fontWeight: 600, color: "#B91C1C", background: "#FEF2F2", padding: "2px 8px 2px 6px", borderRadius: 20 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "#EF4444", display: "inline-block" }} />{openCount} {t("notes.toProcess")}</span>}
                {progressCount > 0 && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: FS.sm, fontWeight: 600, color: "#92400E", background: "#FFFBEB", padding: "2px 8px 2px 6px", borderRadius: 20 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: AC,       display: "inline-block" }} />{progressCount} {t("notes.inProgress")}</span>}
                {doneCount > 0     && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: FS.sm, fontWeight: 600, color: "#166534", background: "#F0FDF4",  padding: "2px 8px 2px 6px", borderRadius: 20 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: GR,        display: "inline-block" }} />{doneCount} résolu{doneCount > 1 ? "s" : ""}</span>}
              </div>
            )}
          </div>
        </div>

        {/* Mode toggle: Écrire / Dicter */}
        <div style={{ display: "flex", gap: 4, marginBottom: 12, background: SB, borderRadius: 10, padding: 4 }}>
          <button
            onClick={() => { setInputMode("write"); stopVoice(); }}
            style={{ flex: 1, padding: "7px", border: "none", borderRadius: 8, background: inputMode === "write" ? WH : "transparent", color: inputMode === "write" ? TX : TX3, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, boxShadow: inputMode === "write" ? "0 1px 3px rgba(0,0,0,0.08)" : "none", transition: "all 0.15s" }}
          >
            <Ico name="edit" size={14} color={inputMode === "write" ? TX : TX3} />{t("notes.write")}
          </button>
          <button
            onClick={() => { setInputMode("voice"); setAddText(""); setAddUrgent(false); }}
            style={{ flex: 1, padding: "7px", border: "none", borderRadius: 8, background: inputMode === "voice" ? WH : "transparent", color: inputMode === "voice" ? RD : TX3, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, boxShadow: inputMode === "voice" ? "0 1px 3px rgba(0,0,0,0.08)" : "none", transition: "all 0.15s" }}
          >
            <Ico name="mic" size={14} color={inputMode === "voice" ? RD : TX3} />{t("notes.dictate")}
          </button>
        </div>

        {inputMode === "write" ? (
          <>
            {/* Quick-add texte */}
            <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center" }}>
              <button onClick={() => setAddUrgent(false)} style={{ padding: "5px 11px", border: "none", borderRadius: 6, background: !addUrgent ? SB2 : SB, color: !addUrgent ? TX : TX3, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>{t("notes.observation")}</button>
              <button onClick={() => setAddUrgent(true)}  style={{ padding: "5px 11px", border: "none", borderRadius: 6, background: addUrgent ? REDBG : SB, color: addUrgent ? RD : TX3, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>{t("notes.urgentBtn")}</button>
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              <input
                ref={addInputRef}
                value={addText}
                onChange={(e) => setAddText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addRemark(post.id); }}
                placeholder={addUrgent ? t("notes.placeholderUrgent") : t("notes.placeholderNormal")}
                style={{ flex: 1, padding: "9px 12px", border: `1px solid ${addUrgent ? RD + "60" : SBB}`, borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: WH, color: TX }}
                autoFocus
              />
              <button onClick={() => addRemark(post.id)} style={{ padding: "9px 14px", border: "none", borderRadius: 8, background: AC, color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                <Ico name="plus" size={16} color="#fff" />
              </button>
            </div>
          </>
        ) : (
          /* Interface dictée vocale */
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "28px 20px 20px", marginBottom: 12, background: isRecording ? REDBG : SB, borderRadius: 12, border: `1px solid ${isRecording ? RD + "40" : SBB}`, transition: "background 0.3s, border-color 0.3s" }}>
            <button
              onClick={isRecording ? stopVoice : startVoice}
              style={{ width: 76, height: 76, borderRadius: "50%", background: isRecording ? RD : WH, border: `2px solid ${isRecording ? RD : SBB}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, animation: isRecording ? "ring 1.4s ease infinite" : "none", boxShadow: isRecording ? "none" : "0 2px 10px rgba(0,0,0,0.1)", transition: "background 0.2s, border-color 0.2s" }}
            >
              <Ico name="mic" size={30} color={isRecording ? "#fff" : TX2} />
            </button>
            <div style={{ fontSize: 14, fontWeight: 600, color: isRecording ? RD : TX2, marginBottom: 6 }}>
              {isRecording ? t("notes.listening") : t("notes.pressToSpeak")}
            </div>
            {voiceInterim && (
              <div style={{ fontSize: 13, color: TX3, fontStyle: "italic", textAlign: "center", maxWidth: 320, lineHeight: 1.5, marginTop: 4 }}>
                « {voiceInterim} »
              </div>
            )}
            {voiceErr && (
              <div style={{ marginTop: 10, fontSize: 12, color: RD, textAlign: "center", padding: "8px 12px", background: REDBG, borderRadius: 8, border: `1px solid ${RD}20` }}>{voiceErr}</div>
            )}
            {!voiceErr && !isRecording && (
              <div style={{ fontSize: 11, color: TX3, marginTop: 6, textAlign: "center" }}>
                {t("notes.voiceSentence")}
              </div>
            )}
          </div>
        )}

        {/* Remark list */}
        {remarks.length > 0 ? (
          <div style={{ marginBottom: 12 }}>
            {remarks.map((r) => {
              const rs = getRemarkStatus(r.status);
              return (
                <div key={r.id} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 10px", marginBottom: 4, background: WH, border: `1px solid ${SBB}`, borderRadius: 10 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
                    {/* Status pill — click to cycle */}
                    <button onClick={() => cycleStatus(post.id, r.id)} title={`Statut : ${rs.label} — cliquer pour changer`} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: SP.xs, padding: `${SP.xs}px ${SP.sm + 1}px ${SP.xs}px ${SP.sm - 2}px`, border: `1px solid ${r.urgent && r.status === "open" ? REDBRD : rs.dot + "40"}`, borderRadius: 20, background: r.urgent && r.status === "open" ? "#FEF2F2" : rs.bg, cursor: "pointer", fontFamily: "inherit", marginTop: 1, whiteSpace: "nowrap", outline: "none", transition: "all 0.15s" }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: r.urgent && r.status === "open" ? "#EF4444" : rs.dot, flexShrink: 0 }} />
                      <span style={{ fontSize: FS.sm, fontWeight: 700, color: r.urgent && r.status === "open" ? "#B91C1C" : rs.color }}>
                        {r.urgent && r.status === "open" ? t("notes.urgent") : rs.label}
                      </span>
                      <Ico name="chevron-down" size={9} color={r.urgent && r.status === "open" ? "#B91C1C" : rs.color} />
                    </button>
                    {r.carriedFrom && <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9, fontWeight: 600, color: AC, background: ACL, border: `1px solid ${ACL2}`, padding: "2px 6px", borderRadius: 20, marginTop: 2, whiteSpace: "nowrap" }}>↩ PV{r.carriedFrom}</span>}
                    <input value={r.text} onChange={(e) => editRemarkText(post.id, r.id, e.target.value)} style={{ flex: 1, border: "none", outline: "none", fontSize: 13, color: r.status === "done" ? TX3 : TX, background: "transparent", fontFamily: "inherit", textDecoration: r.status === "done" ? "line-through" : "none", padding: 0, minWidth: 0 }} />
                    <button onClick={() => removeRemark(post.id, r.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0 }}>
                      <Ico name="x" size={13} color={TX3} />
                    </button>
                  </div>
                  {/* Participant assignment chips */}
                  {project.participants.length > 0 && (
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", paddingLeft: 2 }}>
                      {project.participants.map((p, pi) => {
                        const assigned = (r.recipients || []).includes(p.name);
                        return (
                          <button key={pi} onClick={() => toggleRemarkRecipient(post.id, r.id, p.name)} title={`${assigned ? "Retirer" : "Assigner à"} ${p.name}`} style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 7px", border: `1px solid ${assigned ? AC : SBB}`, borderRadius: 20, background: assigned ? ACL : "transparent", cursor: "pointer", fontFamily: "inherit" }}>
                            <div style={{ width: 16, height: 16, borderRadius: "50%", background: assigned ? AC : SB2, color: assigned ? "#fff" : TX3, fontSize: 8, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              {initials(p.name)}
                            </div>
                            <span style={{ fontSize: 10, color: assigned ? AC : TX3, fontWeight: assigned ? 600 : 400 }}>{p.name.split(" ")[0]}</span>
                          </button>
                        );
                      })}
                      {(r.recipients || []).length === 0 && <span style={{ fontSize: 10, color: TX3, fontStyle: "italic", alignSelf: "center" }}>{t("notes.allRecipientsList")}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: TX3, padding: "12px 0", textAlign: "center" }}>{t("notes.noRemarks")}</div>
        )}

        {/* Photos */}
        <div style={{ padding: "12px 14px", background: SB, borderRadius: 10, border: `1px solid ${SBB}`, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: photos.length > 0 ? 10 : 0 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: TX2 }}>{t("notes.photos")}{photos.length > 0 ? ` (${photos.length})` : ""}</span>
            <button onClick={() => photoRef.current.click()} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", border: "none", borderRadius: 6, background: ACL, cursor: "pointer", fontFamily: "inherit" }}>
              <Ico name="camera" size={13} color={AC} />
              <span style={{ fontSize: 12, fontWeight: 600, color: AC }}>{t("notes.addPhotos")}</span>
            </button>
            <input ref={photoRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => { addPhotos(post.id, e.target.files); e.target.value = ""; }} />
          </div>
          {photos.length > 0 ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {photos.map((ph) => (
                <div key={ph.id} style={{ position: "relative", width: 80, height: 80, flexShrink: 0 }}>
                  <img src={getPhotoUrl(ph)} alt="" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: `2px solid ${ph.annotated ? AC : SBB}` }} />
                  <button onClick={() => setAnnotatingPhoto({ postId: post.id, photo: ph })} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0)", borderRadius: 8, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0, transition: "opacity 0.15s" }} onMouseEnter={(e) => e.currentTarget.style.opacity="1"} onMouseLeave={(e) => e.currentTarget.style.opacity="0"} onFocus={(e) => e.currentTarget.style.opacity="1"} onBlur={(e) => e.currentTarget.style.opacity="0"} title={t("notes.annotate")}>
                    <div style={{ background: "rgba(0,0,0,0.55)", borderRadius: 6, padding: "4px 6px" }}><Ico name="pen2" size={12} color="#fff" /></div>
                  </button>
                  {ph.annotated && <div style={{ position: "absolute", bottom: 3, left: 3, background: AC, borderRadius: 4, padding: "1px 4px" }}><Ico name="pen2" size={9} color="#fff" /></div>}
                  <button onClick={() => removePhoto(post.id, ph.id)} aria-label="Supprimer la photo" style={{ position: "absolute", top: -6, right: -6, width: 24, height: 24, borderRadius: "50%", background: RD, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                    <Ico name="x" size={10} color="#fff" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: TX3, marginTop: 4 }}>{t("notes.noPhotos")}</div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: TX3 }}>{remarks.length} remarque{remarks.length !== 1 ? "s" : ""} · {photos.length} photo{photos.length !== 1 ? "s" : ""}</span>
          <button onClick={() => setActivePost(null)} style={{ padding: "8px 20px", border: "none", borderRadius: 8, background: AC, color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>{t("validate")}</button>
        </div>
      </div>
    );
  }

  // Compute carried-over remarks summary
  const allCarried = project.posts.flatMap((p) => (p.remarks || []).filter((r) => r.carriedFrom));
  const carriedCount = allCarried.length;
  const carriedFromPV = carriedCount > 0 ? Math.max(...allCarried.map((r) => r.carriedFrom)) : null;

  // Stats pour le résumé
  const totalRemarks = project.posts.reduce((acc, p) => acc + getRemarks(p).length, 0);
  const urgentCount  = project.posts.reduce((acc, p) => acc + getRemarks(p).filter(r => r.urgent).length, 0);
  const totalPhotos  = project.posts.reduce((acc, p) => acc + (p.photos || []).length, 0);
  const readyToGenerate = filledCount > 0 && recipientFilters !== null;

  // Steps data (shared between desktop and mobile)
  const stepsData = [
    { step: 1, label: "Saisie", sub: `${filledCount}/${project.posts.length} postes`, icon: "listcheck", done: filledCount > 0 },
    { step: 2, label: "Destinataires", sub: recipientFilters === null ? "À définir" : recipientFilters.length === 0 ? "Tous" : `${recipientFilters.length} filtrés`, icon: "users", done: recipientFilters !== null },
    { step: 3, label: "Génération", sub: readyToGenerate ? "Prêt" : "En attente", icon: "send", done: false },
  ];
  const activeStepIdx = stepsData.findIndex(s => !s.done);
  const currentStep = activeStepIdx === -1 ? stepsData.length - 1 : activeStepIdx;

  return (
    <div className="ap-note-container" data-mobile-step={mobileStep} style={{ maxWidth: 960, margin: "0 auto", paddingBottom: 32 }}>

      {/* ── Mobile top bar — back + stepper ── */}
      <div className="ap-note-mobile-stepper" style={{ display: "none", padding: "8px 0 10px", flexShrink: 0, borderBottom: `1px solid ${SB2}`, marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0 }}>
            {stepsData.map((s, i) => {
              const isDone = s.done;
              const isActive = i === mobileStep;
              return (
                <div key={s.step} style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0 }}>
                  <div
                    onClick={() => setMobileStep(i)}
                    style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", flex: 1, minWidth: 0, padding: "3px 4px", borderRadius: 6, background: isActive ? ACL : "transparent", transition: "all 0.15s" }}
                  >
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: isDone ? AC : isActive ? AC : SB2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.2s" }}>
                      {isDone ? <Ico name="check" size={9} color="#fff" /> : <span style={{ fontSize: 9, fontWeight: 700, color: isActive ? "#fff" : TX3 }}>{s.step}</span>}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: isActive ? 700 : 500, color: isActive ? TX : isDone ? AC : TX3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.label}</span>
                  </div>
                  {i < stepsData.length - 1 && (
                    <div style={{ width: 12, height: 2, background: isDone ? AC : SBB, borderRadius: 1, flexShrink: 0, margin: "0 2px" }} />
                  )}
                </div>
              );
            })}
        </div>
      </div>

      {/* ── Desktop Header ── */}
      <div className="ap-note-desktop-header" style={{ background: WH, borderRadius: 12, padding: "16px 20px 14px", marginBottom: 14, border: `1px solid ${SBB}`, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <button onClick={onBack} style={{ background: SB, border: `1px solid ${SBB}`, cursor: "pointer", padding: 7, minWidth: 36, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, flexShrink: 0, marginTop: 1 }}>
            <Ico name="back" color={TX2} size={16} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 1 }}>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: AC, background: ACL, padding: "2px 7px", borderRadius: 3 }}>{t("notes.redaction")}</div>
            </div>
            <input
              value={pvTitle}
              onChange={(e) => setPvTitle(e.target.value)}
              style={{ fontSize: 20, fontWeight: 800, color: TX, border: "none", background: "transparent", outline: "none", padding: 0, fontFamily: "inherit", width: "100%", letterSpacing: "-0.4px", lineHeight: 1.25 }}
              title="Cliquez pour renommer"
            />
            <div style={{ fontSize: 11, color: TX3, marginTop: 2, display: "flex", alignItems: "center", gap: 5 }}>
              <span>{project.name}</span>
              <span style={{ width: 2.5, height: 2.5, borderRadius: "50%", background: TX3, opacity: 0.5 }} />
              <span>{new Date().toLocaleDateString("fr-BE", { day: "numeric", month: "long", year: "numeric" })}</span>
            </div>
          </div>
          <button onClick={loadSamples} style={{ padding: "6px 12px", border: `1px solid ${SBB}`, borderRadius: 7, background: WH, cursor: "pointer", fontSize: 10, color: TX3, fontFamily: "inherit", flexShrink: 0, fontWeight: 500 }}>{t("examples")}</button>
        </div>

        {/* Barre de progression intégrée au header */}
        {(() => {
          const steps = [
            { step: 1, label: t("notes.stepPosts"), sub: `${filledCount}/${project.posts.length}`, icon: "listcheck", done: filledCount > 0 },
            { step: 2, label: t("notes.stepRecipients"), sub: recipientFilters === null ? "À définir" : recipientFilters.length === 0 ? t("notes.allRecipients") : `${recipientFilters.length} filtrés`, icon: "users", done: recipientFilters !== null },
            { step: 3, label: t("notes.stepGeneration"), sub: readyToGenerate ? t("notes.stepReady") : t("notes.stepWaiting"), icon: "send", done: false },
          ];
          const activeIdx = steps.findIndex(s => !s.done);
          const activeStep = activeIdx === -1 ? steps.length - 1 : activeIdx;
          return (
            <div style={{ marginTop: 14, background: SB, borderRadius: 10, padding: "4px 4px", display: "flex", alignItems: "stretch", gap: 3 }}>
              {steps.map((s, i) => {
                const isDone = s.done;
                const isActive = i === activeStep;
                return (
                  <div key={s.step} style={{ flex: 1, display: "flex", alignItems: "center", gap: 0, minWidth: 0 }}>
                    <div style={{
                      flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                      background: isActive ? WH : "transparent",
                      borderRadius: 8,
                      boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                      transition: "all 0.25s",
                    }}>
                      <div style={{
                        width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                        background: isDone ? AC : isActive ? AC + "14" : SB2,
                        border: isActive ? `2px solid ${AC}` : "2px solid transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: isDone ? "0 1px 3px rgba(217,123,13,0.25)" : "none",
                        transition: "all 0.3s",
                      }}>
                        {isDone
                          ? <Ico name="check" size={11} color="#fff" />
                          : <Ico name={s.icon} size={11} color={isActive ? AC : TX3} />
                        }
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: isDone || isActive ? 700 : 500, color: isDone ? TX : isActive ? TX : TX3, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {s.label}
                        </div>
                        <div style={{ fontSize: 9.5, color: isDone ? GR : isActive ? AC : DIST, fontWeight: 500, marginTop: 0, whiteSpace: "nowrap" }}>
                          {isDone ? t("notes.stepCompleted") : s.sub}
                        </div>
                      </div>
                    </div>
                    {i < steps.length - 1 && (
                      <div style={{ width: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Ico name="arrowr" size={9} color={isDone ? AC : SBB} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* ── Step 0: Saisie ── */}
      <div className="ap-note-section-0">

      {/* Content area for step 0 */}
      <div className="ap-note-step-content">

      {/* ── Rappel remarques non clôturées ── */}
      {carriedCount > 0 && (
        <div className="ap-carried-reminder" style={{ display: "flex", alignItems: "stretch", borderRadius: 10, marginBottom: 12, overflow: "hidden", border: `1px solid ${ACL2}`, background: WH }}>
          <div style={{ width: 4, background: AC, flexShrink: 0 }} />
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: ACL }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: WH, border: `1px solid ${ACL2}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Ico name="repeat" size={14} color={AC} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TX, lineHeight: 1.3 }}>
                {carriedCount} remarque{carriedCount > 1 ? "s" : ""} reportée{carriedCount > 1 ? "s" : ""}
                <span style={{ fontWeight: 500, color: TX2 }}> depuis le PV n°{carriedFromPV}</span>
              </div>
              <div style={{ fontSize: 10.5, color: TX3, marginTop: 2, lineHeight: 1.3 }}>{t("notes.carried.desc")}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0, background: WH, border: `1px solid ${ACL2}`, borderRadius: 6, padding: "4px 8px" }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: AC, lineHeight: 1 }}>{carriedCount}</span>
              <span style={{ fontSize: 9, color: TX3, fontWeight: 500, lineHeight: 1.1 }}>à<br/>suivre</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Section 1 : Remarques ── */}
      <div className="ap-section-card" style={{ background: WH, borderRadius: 12, border: `1px solid ${SBB}`, overflow: "hidden", marginBottom: 12 }}>
        {/* Section header */}
        <div className="ap-section-hdr" style={{ padding: "11px 16px", borderBottom: `1px solid ${SBB}`, background: SB }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: filledCount > 0 ? AC : SB2, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: filledCount > 0 ? "0 1px 3px rgba(217,123,13,0.25)" : "none" }}>
                {filledCount > 0 ? <Ico name="check" size={11} color="#fff" /> : <span style={{ fontSize: 9, fontWeight: 700, color: TX3 }}>1</span>}
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: TX, letterSpacing: "-0.1px" }}>{t("notes.posts")}</span>
              <span style={{ fontSize: 10.5, color: TX3, fontWeight: 400 }}>{filledCount}/{project.posts.length}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {/* Inline stat chips */}
            {(totalRemarks > 0 || totalPhotos > 0) && (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: WH, border: `1px solid ${SBB}`, borderRadius: 6, padding: "3px 8px" }}>
                  <Ico name="edit" size={10} color={TX3} />
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: TX2 }}>{totalRemarks}</span>
                </div>
                {urgentCount > 0 && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: REDBG, border: `1px solid ${REDBRD}`, borderRadius: 6, padding: "3px 8px" }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: RD, flexShrink: 0 }} />
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: RD }}>{urgentCount}</span>
                  </div>
                )}
                {carriedCount > 0 && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: ACL, border: `1px solid ${ACL2}`, borderRadius: 6, padding: "3px 8px" }}>
                    <Ico name="repeat" size={9} color={AC} />
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: AC }}>{carriedCount}</span>
                  </div>
                )}
                {totalPhotos > 0 && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: WH, border: `1px solid ${SBB}`, borderRadius: 6, padding: "3px 8px" }}>
                    <Ico name="camera" size={10} color={TX3} />
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: TX2 }}>{totalPhotos}</span>
                  </div>
                )}
              </div>
            )}
            {/* Delete all posts — hidden on mobile */}
            {project.posts.length > 0 && (
              <button
                className="ap-delete-all-btn"
                onClick={() => { if (confirm(`Supprimer les ${project.posts.length} postes et tout leur contenu ?`)) setProjects(prev => prev.map(p => p.id === project.id ? { ...p, posts: [] } : p)); }}
                style={{ display: "inline-flex", alignItems: "center", gap: 4, background: WH, border: `1px solid ${SBB}`, borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = RD; e.currentTarget.style.background = "#FEF2F2"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = SBB; e.currentTarget.style.background = WH; }}
                title="Supprimer tous les postes"
              >
                <Ico name="trash" size={10} color={RD} />
                <span style={{ fontSize: 10.5, fontWeight: 600, color: RD }}>Tout supprimer</span>
              </button>
            )}
            </div>
          </div>
        </div>

        {/* ── Method chooser / Dictation / Review / Dispatch / Post list ── */}
        {contDispatching ? (
          /* Dispatching state */
          <div style={{ padding: "12px" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "36px 20px", background: ACL, borderRadius: 12, border: `1px solid ${ACL2}` }}>
              <div style={{ width: 52, height: 52, borderRadius: "50%", background: WH, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, boxShadow: "0 2px 10px rgba(217,123,13,0.15)" }}>
                <div style={{ width: 22, height: 22, border: `3px solid ${AC}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: TX, marginBottom: 4 }}>Répartition en cours...</div>
              <div style={{ fontSize: 12, color: TX3 }}>L'IA analyse et répartit vos remarques dans les postes</div>
            </div>
          </div>
        ) : contRecording ? (
          /* Active recording */
          <div style={{ padding: "12px" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "28px 16px", background: "#FEF2F2", borderRadius: 12, border: "1px solid #FECACA", transition: "all 0.3s" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: RD, animation: "ring 1.4s ease infinite" }} />
                <span style={{ fontSize: 15, fontWeight: 700, color: RD }}>Enregistrement en cours</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#B91C1C", fontVariantNumeric: "tabular-nums" }}>
                  {String(Math.floor(contSeconds / 60)).padStart(2, "0")}:{String(contSeconds % 60).padStart(2, "0")}
                </span>
              </div>
              <div style={{ width: "100%", minHeight: 60, maxHeight: 220, overflowY: "auto", marginBottom: 16, padding: "12px 14px", background: WH, borderRadius: 10, border: "1px solid #FECACA", fontSize: 13, color: TX, lineHeight: 1.7 }}>
                {contTranscript ? (
                  <>{contTranscript}{contInterim && <span style={{ color: TX3, fontStyle: "italic" }}> {contInterim}</span>}</>
                ) : contInterim ? (
                  <span style={{ color: TX3, fontStyle: "italic" }}>{contInterim}</span>
                ) : (
                  <span style={{ color: TX3 }}>Parlez librement de chaque poste...</span>
                )}
              </div>
              <button
                onClick={stopContinuous}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 32px", border: "none", borderRadius: 10, background: RD, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 3px 12px rgba(196,57,42,0.25)" }}
              >
                <Ico name="stop" size={16} color="#fff" />
                Terminer l'enregistrement
              </button>
            </div>
          </div>
        ) : contReview ? (
          /* Review & edit transcript before dispatch */
          <div style={{ padding: "12px" }}>
            <div style={{ padding: "20px 16px", background: SB, borderRadius: 12, border: `1px solid ${SBB}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: AC, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Ico name="check" size={14} color="#fff" />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: TX }}>Transcription terminée</div>
                  <div style={{ fontSize: 11, color: TX3 }}>Relisez et corrigez si besoin avant la répartition</div>
                </div>
              </div>
              <textarea
                value={contTranscript}
                onChange={(e) => setContTranscript(e.target.value)}
                style={{ width: "100%", minHeight: 120, maxHeight: 300, padding: "12px 14px", border: `1px solid ${SBB}`, borderRadius: 10, fontSize: 13, color: TX, lineHeight: 1.7, fontFamily: "inherit", background: WH, resize: "vertical", outline: "none" }}
                onFocus={(e) => { e.target.style.borderColor = AC; }}
                onBlur={(e) => { e.target.style.borderColor = SBB; }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button
                  onClick={() => { setContReview(false); setContTranscript(""); contTranscriptRef.current = ""; setInputMethod(null); }}
                  style={{ flex: 1, padding: "11px 16px", border: `1px solid ${SBB}`, borderRadius: 10, background: WH, color: TX2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                >
                  Annuler
                </button>
                <button
                  onClick={() => { contTranscriptRef.current = contTranscript; setContReview(false); startContinuous(true); }}
                  style={{ padding: "11px 16px", border: `1px solid ${SBB}`, borderRadius: 10, background: WH, color: TX2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}
                >
                  <Ico name="mic" size={13} color={RD} />Reprendre
                </button>
                <button
                  onClick={submitTranscript}
                  disabled={!contTranscript.trim()}
                  style={{ flex: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "11px 20px", border: "none", borderRadius: 10, background: contTranscript.trim() ? AC : SBB, color: contTranscript.trim() ? "#fff" : TX3, fontSize: 13, fontWeight: 700, cursor: contTranscript.trim() ? "pointer" : "default", fontFamily: "inherit", boxShadow: contTranscript.trim() ? "0 3px 12px rgba(217,123,13,0.2)" : "none" }}
                >
                  <span style={{ fontSize: 14 }}>✦</span>Répartir dans les postes
                </button>
              </div>
              {contErr && <div style={{ marginTop: 10, fontSize: 12, color: RD, textAlign: "center", padding: "8px 12px", background: "#FEF2F2", borderRadius: 8, border: `1px solid ${RD}20` }}>{contErr}</div>}
            </div>
          </div>
        ) : !inputMethod ? (
          /* ── Method chooser — action-oriented ── */
          (() => {
            const hasSR = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
            const sel = selectedMethod;
            const isDictate = sel === "dictate";
            return (
            <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "14px 14px 16px" }}>
              {/* Title */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: TX, letterSpacing: "-0.3px", lineHeight: 1.3 }}>Comment voulez-vous créer ce PV ?</div>
                <div style={{ fontSize: 11.5, color: TX3, marginTop: 3, lineHeight: 1.4 }}>Choisissez votre méthode de départ. Vous pourrez changer plus tard.</div>
              </div>

              {/* Option cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {/* Dictate */}
                <button
                  onClick={() => setSelectedMethod("dictate")}
                  disabled={!hasSR}
                  className="method-card-dictate"
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: `2px solid ${isDictate && hasSR ? AC : SBB}`, borderRadius: 12, background: isDictate && hasSR ? ACL : WH, cursor: hasSR ? "pointer" : "not-allowed", fontFamily: "inherit", transition: "all 0.15s", textAlign: "left", opacity: hasSR ? 1 : 0.5, position: "relative" }}
                >
                  <div style={{ width: 42, height: 42, borderRadius: 10, background: isDictate ? `linear-gradient(135deg, ${AC} 0%, #C06A08 100%)` : SB, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s" }}>
                    <Ico name="mic" size={20} color={isDictate ? "#fff" : TX3} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: TX }}>Dicter</span>
                      {hasSR && <span style={{ fontSize: 8.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: AC, background: WH, padding: "1px 6px", borderRadius: 3, border: `1px solid ${ACL2}` }}>Recommandé</span>}
                    </div>
                    <div style={{ fontSize: 11, color: TX3, lineHeight: 1.4, marginTop: 2 }}>Parlez librement, l'IA répartit les remarques automatiquement.</div>
                    <div style={{ display: "flex", gap: 4, marginTop: 5 }}>
                      {["Chantier", "Rapide", "IA"].map((tag, ti) => (
                        <span key={ti} style={{ fontSize: 9, fontWeight: 600, color: isDictate ? AC : TX3, background: isDictate ? WH : SB, border: `1px solid ${isDictate ? ACL2 : SBB}`, padding: "1px 6px", borderRadius: 3 }}>{tag}</span>
                      ))}
                    </div>
                    {!hasSR && <div style={{ fontSize: 10, color: RD, marginTop: 3 }}>Non supporté par ce navigateur</div>}
                  </div>
                  {/* Radio indicator */}
                  <div style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${isDictate && hasSR ? AC : SBB}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s" }}>
                    {isDictate && hasSR && <div style={{ width: 10, height: 10, borderRadius: "50%", background: AC }} />}
                  </div>
                </button>

                {/* Write */}
                <button
                  onClick={() => setSelectedMethod("write")}
                  className="method-card-write"
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: `2px solid ${!isDictate ? AC : SBB}`, borderRadius: 12, background: !isDictate ? ACL : WH, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", textAlign: "left" }}
                >
                  <div style={{ width: 42, height: 42, borderRadius: 10, background: !isDictate ? `linear-gradient(135deg, ${AC} 0%, #C06A08 100%)` : SB, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s" }}>
                    <Ico name="edit" size={20} color={!isDictate ? "#fff" : TX3} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: TX }}>Écrire</span>
                    <div style={{ fontSize: 11, color: TX3, lineHeight: 1.4, marginTop: 2 }}>Ajoutez vos remarques manuellement, poste par poste.</div>
                    <div style={{ display: "flex", gap: 4, marginTop: 5 }}>
                      {["Précis", "Compléments", "Photos"].map((tag, ti) => (
                        <span key={ti} style={{ fontSize: 9, fontWeight: 600, color: !isDictate ? AC : TX3, background: !isDictate ? WH : SB, border: `1px solid ${!isDictate ? ACL2 : SBB}`, padding: "1px 6px", borderRadius: 3 }}>{tag}</span>
                      ))}
                    </div>
                  </div>
                  {/* Radio indicator */}
                  <div style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${!isDictate ? AC : SBB}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s" }}>
                    {!isDictate && <div style={{ width: 10, height: 10, borderRadius: "50%", background: AC }} />}
                  </div>
                </button>

                {/* CTA — inside cards container */}
                <button
                  onClick={() => {
                    if (sel === "dictate" && hasSR) { setInputMethod("dictate"); startContinuous(); }
                    else { setInputMethod("write"); }
                  }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    padding: "13px 20px", border: "none", borderRadius: 10, marginTop: 2,
                    background: `linear-gradient(135deg, ${AC} 0%, #C06A08 100%)`,
                    color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                    boxShadow: "0 3px 14px rgba(217,123,13,0.25)", transition: "all 0.15s",
                  }}
                >
                  {isDictate && hasSR ? (
                    <><Ico name="mic" size={16} color="#fff" />Commencer à dicter</>
                  ) : (
                    <><Ico name="edit" size={16} color="#fff" />Commencer à écrire</>
                  )}
                </button>
              </div>
              {contErr && <div style={{ marginTop: 8, fontSize: 11, color: RD, textAlign: "center", padding: "6px 10px", background: "#FEF2F2", borderRadius: 8, border: `1px solid ${RD}20` }}>{contErr}</div>}
            </div>
            );
          })()
        ) : (
          /* Post list (write mode, or after dictation dispatch) */
          <>
            {/* Method switch bar */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: `1px solid ${SB2}` }}>
              <div style={{ display: "flex", gap: 4, background: SB, borderRadius: 8, padding: 3 }}>
                <button
                  onClick={() => { setInputMethod("dictate"); startContinuous(); }}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", border: "none", borderRadius: 6, background: "transparent", color: TX3, fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}
                >
                  <Ico name="mic" size={12} color={TX3} />Dicter
                </button>
                <button
                  onClick={() => setInputMethod("write")}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", border: "none", borderRadius: 6, background: WH, color: TX, fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
                >
                  <Ico name="edit" size={12} color={TX} />Écrire
                </button>
              </div>
              {totalRemarks > 0 && (
                <span style={{ fontSize: 11, color: TX3 }}>{totalRemarks} remarque{totalRemarks !== 1 ? "s" : ""}</span>
              )}
            </div>

        {/* Post list */}
        <div className="ap-post-list" style={{ padding: "6px 8px 2px" }}>
          {project.posts.map((post, postIdx) => {
            const remarks     = getRemarks(post);
            const openCount   = remarks.filter((r) => r.status === "open").length;
            const progressCount = remarks.filter((r) => r.status === "progress").length;
            const doneCount   = remarks.filter((r) => r.status === "done").length;
            const carriedHere = remarks.filter((r) => r.carriedFrom).length;
            const photoCount  = (post.photos || []).length;
            const markerCount = (project.planMarkers || []).filter((m) => m.postId === post.id).length;
            const hasContent  = remarks.length > 0 || photoCount > 0 || markerCount > 0;
            const hasUrgent   = remarks.some(r => r.urgent && r.status === "open");
            return (
              <button
                key={post.id}
                className="ap-post-row"
                onClick={() => { setActivePost(post.id); setAddText(""); setAddUrgent(false); }}
                style={{ width: "100%", display: "flex", alignItems: "stretch", gap: 0, padding: 0, background: WH, border: `1px solid ${hasUrgent ? REDBRD : hasContent ? ACL2 : SB2}`, borderRadius: 9, cursor: "pointer", textAlign: "left", fontFamily: "inherit", transition: "border-color 0.15s, box-shadow 0.15s", marginBottom: 5, overflow: "hidden", boxShadow: hasContent ? "0 1px 2px rgba(0,0,0,0.03)" : "none" }}
              >
                {/* Left accent strip */}
                <div style={{ width: 3.5, flexShrink: 0, background: hasUrgent ? RD : hasContent ? AC : SB2, borderRadius: "9px 0 0 9px", transition: "background 0.15s" }} />

                {/* Main content area */}
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "9px 12px 9px 10px", minWidth: 0 }}>
                  {/* Post number badge */}
                  <div style={{ width: 30, height: 30, borderRadius: 7, background: hasContent ? ACL : SB, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0, position: "relative" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: hasContent ? AC : TX3, lineHeight: 1, letterSpacing: "-0.3px" }}>{post.id}</span>
                    {hasContent && (
                      <div style={{ position: "absolute", bottom: -2, right: -2, width: 12, height: 12, borderRadius: "50%", background: doneCount === remarks.length && remarks.length > 0 ? GR : AC, display: "flex", alignItems: "center", justifyContent: "center", border: "1.5px solid #fff" }}>
                        <Ico name="check" size={7} color="#fff" />
                      </div>
                    )}
                  </div>

                  {/* Text content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Top line: label */}
                    {renamingPost === post.id ? (
                      <input
                        autoFocus
                        value={renameVal}
                        onChange={(e) => setRenameVal(e.target.value)}
                        onBlur={() => commitRename(post.id)}
                        onKeyDown={(e) => { if (e.key === "Enter") commitRename(post.id); if (e.key === "Escape") setRenamingPost(null); }}
                        onClick={(e) => e.stopPropagation()}
                        style={{ fontSize: 13, fontWeight: 500, color: TX, border: `1px solid ${AC}`, borderRadius: 4, padding: "2px 6px", background: WH, fontFamily: "inherit", outline: "none", width: "90%" }}
                      />
                    ) : (
                      <div
                        style={{ fontSize: 13, fontWeight: hasContent ? 600 : 450, color: hasContent ? TX : TX2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.3 }}
                        onDoubleClick={(e) => { e.stopPropagation(); setRenamingPost(post.id); setRenameVal(post.label); }}
                        title={t("notes.dblRename")}
                      >{post.label}</div>
                    )}

                    {/* Status pills row */}
                    {hasContent && (
                      <div style={{ display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap", alignItems: "center" }}>
                        {hasUrgent && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 700, color: "#fff", background: RD, padding: "2px 8px 2px 5px", borderRadius: 4, lineHeight: "14px", letterSpacing: "0.01em" }}>
                            <span style={{ fontSize: 11, lineHeight: 1 }}>!</span> {t("notes.urgent")}
                          </span>
                        )}
                        {openCount > 0 && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 600, color: "#B91C1C", background: REDBG, border: `1px solid ${REDBRD}`, padding: "1px 7px", borderRadius: 4, lineHeight: "15px" }}>
                            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#EF4444", flexShrink: 0 }} />{openCount} {t("notes.toProcess")}
                          </span>
                        )}
                        {carriedHere > 0 && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 600, color: AC, background: ACL, border: `1px solid ${ACL2}`, padding: "1px 7px", borderRadius: 4, lineHeight: "15px" }}>
                            <Ico name="repeat" size={8} color={AC} />{carriedHere} reportée{carriedHere > 1 ? "s" : ""}
                          </span>
                        )}
                        {progressCount > 0 && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 600, color: "#92400E", background: "#FFFBEB", border: "1px solid #FDE68A", padding: "1px 7px", borderRadius: 4, lineHeight: "15px" }}>
                            <span style={{ width: 5, height: 5, borderRadius: "50%", background: AC, flexShrink: 0 }} />{progressCount} {t("notes.inProgress")}
                          </span>
                        )}
                        {doneCount > 0 && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 500, color: "#166534", background: GRBG, border: "1px solid #C6E9B4", padding: "1px 7px", borderRadius: 4, lineHeight: "15px" }}>
                            <Ico name="check" size={8} color={GR} />{doneCount} résolu{doneCount > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right meta column */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {/* Counters */}
                    {hasContent && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 4 }}>
                        {photoCount > 0 && (
                          <div style={{ display: "flex", alignItems: "center", gap: 3 }} title={`${photoCount} photo${photoCount > 1 ? "s" : ""}`}>
                            <Ico name="camera" size={11} color={TX3} />
                            <span style={{ fontSize: 11, fontWeight: 600, color: TX2 }}>{photoCount}</span>
                          </div>
                        )}
                        {markerCount > 0 && (
                          <div style={{ display: "flex", alignItems: "center", gap: 3 }} title={`${markerCount} marqueur${markerCount > 1 ? "s" : ""}`}>
                            <Ico name="mappin" size={11} color={TX3} />
                            <span style={{ fontSize: 11, fontWeight: 600, color: TX2 }}>{markerCount}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Delete post */}
                    <div
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); if (hasContent && !confirm(`Supprimer le poste "${post.label}" et tout son contenu ?`)) return; deletePost(post.id); }}
                      onPointerDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      style={{ width: 28, height: 28, borderRadius: 6, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer", transition: "background 0.15s" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = hasContent ? "#FEF2F2" : SB; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      title="Supprimer ce poste"
                      role="button"
                    >
                      <Ico name="trash" size={13} color={hasContent ? RD : TX3} />
                    </div>

                    {/* Arrow */}
                    <div style={{ width: 22, height: 22, borderRadius: 5, background: hasContent ? ACL : SB, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Ico name="arrowr" size={11} color={hasContent ? AC : TX3} />
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Add post inside card */}
        <div style={{ padding: "2px 8px 8px" }}>
          <button
            onClick={() => {
              const newId = String(project.posts.length + 1).padStart(2, "0");
              setProjects(prev => prev.map(p => p.id === project.id ? { ...p, posts: [...p.posts, { id: newId, label: t("notes.newPost"), notes: "", remarks: [] }] } : p));
              setTimeout(() => { setRenamingPost(newId); setRenameVal(t("notes.newPost")); }, 100);
            }}
            style={{ width: "100%", padding: "8px 12px", border: `1px dashed ${SBB}`, borderRadius: 7, background: "transparent", cursor: "pointer", fontSize: 11, color: TX3, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}
          >
            <Ico name="plus" size={12} color={TX3} />{t("notes.addPost")}
          </button>
        </div>
          </>
        )}
      </div>

      </div>{/* end ap-note-step-content step 0 */}

      {/* Mobile: go to next step */}
      <div className="ap-note-step-nav">
        <button
          onClick={() => setMobileStep(project.participants.length > 0 ? 1 : 2)}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 20px", border: "none", borderRadius: 10, background: AC, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
        >
          Étape suivante : {project.participants.length > 0 ? "Destinataires" : "Génération"}
          <Ico name="arrowr" size={12} color="#fff" />
        </button>
      </div>

      </div>{/* end step 0 */}

      {/* ── Step 1: Destinataires ── */}
      <div className="ap-note-section-1">

      {/* Scrollable content area for step 1 */}
      <div className="ap-note-step-content">

      {/* ── Section 2 : Destinataires ── */}
      {project.participants.length > 0 && (
        <div style={{ background: WH, borderRadius: 12, border: `1px solid ${SBB}`, overflow: "hidden", marginBottom: 12 }}>
          {/* Section header */}
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "11px 16px", borderBottom: `1px solid ${SBB}`, background: SB }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: SB2, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: TX3 }}>2</span>
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: TX, letterSpacing: "-0.1px" }}>{t("notes.recipients")}</span>
            <span style={{ fontSize: 10.5, color: TX3, fontWeight: 400 }}>
              {recipientFilters === null ? "À définir" : recipientFilters.length === 0 ? t("notes.allRecipients") : `${recipientFilters.length} sélectionné${recipientFilters.length > 1 ? "s" : ""}`}
            </span>
          </div>

          {/* Recipients body */}
          <div style={{ padding: "12px 16px" }}>
            {recipientFilters === null && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, padding: "8px 12px", background: "#FDF4E7", borderRadius: 8, border: `1px solid ${ACL2}` }}>
                <Ico name="alert" size={13} color={AC} />
                <span style={{ fontSize: 11.5, color: TX2, fontWeight: 500 }}>Sélectionnez les destinataires du PV ou choisissez "Tous"</span>
              </div>
            )}
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              <button
                onClick={() => setRecipientFilters([])}
                style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 13px", border: `1.5px solid ${recipientFilters !== null && recipientFilters.length === 0 ? AC : SBB}`, borderRadius: 18, background: recipientFilters !== null && recipientFilters.length === 0 ? ACL : WH, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}
              >
                <span style={{ fontSize: 11, fontWeight: 600, color: recipientFilters !== null && recipientFilters.length === 0 ? AC : TX2 }}>{t("notes.allRecipients")}</span>
              </button>
              {project.participants.map((p, i) => {
                const selected = recipientFilters !== null && recipientFilters.includes(p.name);
                const countForP = project.posts.reduce((acc, post) => {
                  const remarks = getRemarks(post);
                  return acc + remarks.filter(r => !(r.recipients || []).length || (r.recipients || []).includes(p.name)).length;
                }, 0);
                return (
                  <button
                    key={i}
                    onClick={() => setRecipientFilters(prev => {
                      const list = prev || [];
                      return list.includes(p.name) ? list.filter(n => n !== p.name) : [...list, p.name];
                    })}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 11px", border: `1.5px solid ${selected ? AC : SBB}`, borderRadius: 18, background: selected ? ACL : WH, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}
                  >
                    <div style={{ width: 18, height: 18, borderRadius: "50%", background: selected ? AC : SB2, color: selected ? "#fff" : TX3, fontSize: 7.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {initials(p.name)}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: selected ? 600 : 500, color: selected ? AC : TX2 }}>{p.name}</span>
                    <span style={{ fontSize: 9.5, color: TX3 }}>({countForP})</span>
                    {selected && <Ico name="check" size={9} color={AC} />}
                  </button>
                );
              })}
            </div>
            {recipientFilters !== null && recipientFilters.length > 0 && (() => {
              const cnt = project.posts.reduce((acc, post) => {
                const remarks = getRemarks(post);
                return acc + remarks.filter(r => !(r.recipients || []).length || recipientFilters.some(rec => (r.recipients || []).includes(rec))).length;
              }, 0);
              return <div style={{ marginTop: 8, fontSize: 10.5, color: TX3, background: SB, padding: "6px 10px", borderRadius: 6 }}><strong>{cnt}</strong> remarque{cnt !== 1 ? "s" : ""} incluses — <strong>{recipientFilters.join(", ")}</strong> + communes.</div>;
            })()}
          </div>
        </div>
      )}

      </div>{/* end ap-note-step-content step 1 */}

      {/* Mobile: go to next step */}
      <div className="ap-note-step-nav">
        <button
          onClick={() => setMobileStep(2)}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 20px", border: "none", borderRadius: 10, background: AC, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
        >
          Étape suivante : Génération
          <Ico name="arrowr" size={12} color="#fff" />
        </button>
      </div>

      </div>{/* end step 1 */}

      {/* ── Step 2: Générer ── */}
      <div className="ap-note-section-2">

      {/* Scrollable content area for step 2 */}
      <div className="ap-note-step-content">

      {/* ── Section 3 : Zone de génération ── */}
      {readyToGenerate ? (
        <div style={{ borderRadius: 12, overflow: "hidden", border: `1px solid ${ACL2}`, background: WH, boxShadow: "0 2px 10px rgba(217,123,13,0.07)", transition: "all 0.3s" }}>
          {/* Header */}
          <div className="ap-gen-header" style={{ background: `linear-gradient(135deg, ${AC} 0%, #C06A08 100%)`, padding: "14px 20px", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontSize: 14, lineHeight: 1 }}>✦</span>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", letterSpacing: "-0.2px" }}>{t("notes.readyTitle")}</div>
              <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.7)", marginTop: 0, fontWeight: 400 }}>{t("notes.readyDesc")}</div>
            </div>
          </div>

          {/* Stats row */}
          <div className="ap-gen-stats" style={{ display: "flex", borderBottom: `1px solid ${SB2}` }}>
            {[
              { value: filledCount, label: `poste${filledCount > 1 ? "s" : ""}`, icon: "listcheck", color: AC },
              { value: totalRemarks, label: `remarque${totalRemarks > 1 ? "s" : ""}`, icon: "edit", color: TX },
              ...(urgentCount > 0 ? [{ value: urgentCount, label: `urgent${urgentCount > 1 ? "s" : ""}`, icon: "alert", color: RD }] : []),
              ...(totalPhotos > 0 ? [{ value: totalPhotos, label: `photo${totalPhotos > 1 ? "s" : ""}`, icon: "camera", color: TX2 }] : []),
            ].map((stat, i, arr) => (
              <div key={i} style={{ flex: 1, padding: "11px 10px", textAlign: "center", borderRight: i < arr.length - 1 ? `1px solid ${SB2}` : "none" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                  <Ico name={stat.icon} size={12} color={stat.color} />
                  <span style={{ fontSize: 18, fontWeight: 800, color: stat.color, letterSpacing: "-0.5px", lineHeight: 1 }}>{stat.value}</span>
                </div>
                <div style={{ fontSize: 9, color: TX3, fontWeight: 500, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Attendance */}
          <div className="ap-gen-attendance" style={{ padding: "12px 20px 0" }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 8 }}>Présences</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {attendance.map((a, i) => (
                <button key={i} onClick={() => toggleAttendance(i)} style={{
                  display: "flex", alignItems: "center", gap: 5, padding: "5px 10px",
                  border: `1px solid ${a.present ? GR : SBB}`, borderRadius: 20,
                  background: a.present ? "#EAF3DE" : SB, cursor: "pointer", fontFamily: "inherit",
                  transition: "all 0.15s",
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: a.present ? GR : TX3 }} />
                  <span style={{ fontSize: 11, fontWeight: 500, color: a.present ? GR : TX3 }}>{a.name}</span>
                </button>
              ))}
            </div>
            <div style={{ fontSize: 10, color: TX3, marginBottom: 6 }}>
              {attendance.filter(a => a.present).length} présent{attendance.filter(a => a.present).length > 1 ? "s" : ""} · {attendance.filter(a => !a.present).length} absent{attendance.filter(a => !a.present).length > 1 ? "s" : ""}
            </div>
          </div>

          {/* Visit timestamp */}
          <div className="ap-gen-visit" style={{ padding: "6px 20px 12px", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Ico name="clock" size={12} color={TX3} />
              <span style={{ fontSize: 11, color: TX3 }}>Début : <strong style={{ color: TX2 }}>{visitStart}</strong></span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 11, color: TX3 }}>Fin :</span>
              <button onClick={() => setVisitEnd(new Date().toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" }))} style={{ padding: "3px 10px", border: `1px solid ${SBB}`, borderRadius: 6, background: visitEnd ? "#EAF3DE" : WH, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit", color: visitEnd ? GR : AC }}>
                {visitEnd || "Marquer la fin"}
              </button>
            </div>
          </div>

          {/* CTA area */}
          <div className="ap-gen-cta" style={{ padding: "12px 20px 16px" }}>
            {recipientFilters && recipientFilters.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 10, padding: "5px 9px", background: SB, borderRadius: 6, border: `1px solid ${SBB}` }}>
                <Ico name="users" size={11} color={TX2} />
                <span style={{ fontSize: 10.5, color: TX2 }}>{t("notes.filteredVersion")}</span>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: TX }}>{recipientFilters.map(n => n.split(" ")[0]).join(", ")}</span>
              </div>
            )}

            {/* What happens next — hidden on mobile */}
            <div className="ap-gen-next-steps" style={{ display: "flex", gap: 12, marginBottom: 12 }}>
              {[
                { icon: "edit", text: t("notes.redactionStep") },
                { icon: "file", text: t("notes.pdfStep") },
                { icon: "send", text: t("notes.sendStep") },
              ].map((step, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, flex: 1 }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: SB, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Ico name={step.icon} size={9} color={TX3} />
                  </div>
                  <span style={{ fontSize: 10.5, color: TX3, fontWeight: 500, lineHeight: 1.2 }}>{step.text}</span>
                </div>
              ))}
            </div>

            {/* Buttons */}
            {navigator.onLine ? (
              <button
                onClick={() => {
                  if (!visitEnd) setVisitEnd(new Date().toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" }));
                  onGenerate(recipientFilters, pvTitle, { attendance, visitStart, visitEnd: visitEnd || new Date().toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" }) });
                }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
                  padding: "13px 24px", border: "none", borderRadius: 10,
                  background: `linear-gradient(135deg, ${AC} 0%, #C06A08 100%)`,
                  color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  letterSpacing: "-0.1px", transition: "box-shadow 0.3s, transform 0.15s",
                  boxShadow: "0 3px 14px rgba(217,123,13,0.28)",
                }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 5px 20px rgba(217,123,13,0.38)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 3px 14px rgba(217,123,13,0.28)"; e.currentTarget.style.transform = "translateY(0)"; }}
              >
                <span style={{ fontSize: 15, opacity: 0.9 }}>✦</span>
                {t("notes.generateBtn")}
              </button>
            ) : (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, marginBottom: 10, fontSize: 11, color: RD }}>
                  <Ico name="wifioff" size={13} color={RD} />
                  Pas de connexion — la génération IA nécessite internet
                </div>
                <button
                  onClick={() => {
                    const end = visitEnd || new Date().toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" });
                    if (!visitEnd) setVisitEnd(end);
                    savePvDraft({
                      projectId: project.id,
                      projectName: project.name,
                      pvNumber: project.pvHistory.length + 1,
                      pvTitle,
                      recipientFilters,
                      attendance,
                      visitStart,
                      visitEnd: end,
                      posts: project.posts.map(po => ({ id: po.id, label: po.label, remarks: po.remarks || [], photos: (po.photos || []).length })),
                    });
                    onBack();
                  }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
                    padding: "13px 24px", border: "none", borderRadius: 10,
                    background: TX, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer",
                    fontFamily: "inherit", letterSpacing: "-0.1px",
                  }}
                >
                  <Ico name="save" size={15} color="#fff" />
                  Sauvegarder le brouillon (hors-ligne)
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ borderRadius: 12, border: `1px solid ${SBB}`, overflow: "hidden", background: WH }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "11px 16px", borderBottom: `1px solid ${SBB}`, background: SB }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: SB2, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: TX3 }}>3</span>
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: TX2, letterSpacing: "-0.1px" }}>{t("notes.generateAI")}</span>
          </div>
          <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: TX3, lineHeight: 1.5 }}>{t("notes.fillOnePost")}</div>
              <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                {[
                  { icon: "edit", text: t("notes.redactionStep") },
                  { icon: "file", text: t("notes.pdfStep") },
                  { icon: "send", text: t("notes.sendStep") },
                ].map((step, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, opacity: 0.4 }}>
                    <div style={{ width: 16, height: 16, borderRadius: "50%", background: SB2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Ico name={step.icon} size={8} color={TX3} />
                    </div>
                    <span style={{ fontSize: 10, color: TX3, fontWeight: 500 }}>{step.text}</span>
                  </div>
                ))}
              </div>
            </div>
            <button
              disabled
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "12px 22px", border: "none", borderRadius: 10, background: DIS, color: DIST, fontSize: 13, fontWeight: 700, cursor: "not-allowed", fontFamily: "inherit", flexShrink: 0, letterSpacing: "-0.1px" }}
            >
              <span style={{ fontSize: 13, opacity: 0.4 }}>✦</span>
              {t("notes.generateShort")}
            </button>
          </div>
        </div>
      )}

      </div>{/* end ap-note-step-content step 2 */}
      </div>{/* end step 2 */}

    </div>
  );
}

// ── Send PV by Email Modal ─────────────────────────────────
function SendPvModal({ project, pvNumber, pvDate, pvContent, profile, onClose, onSent }) {
  const t = useT();
  const [step, setStep] = useState("recipients"); // "recipients" | "preview" | "sent"
  const [recipients, setRecipients] = useState(
    project.participants.filter(p => p.email).map(p => ({ email: p.email, name: p.name, role: p.role, checked: true }))
  );
  const [extraEmail, setExtraEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [includePdf, setIncludePdf] = useState(true);
  const [subject, setSubject] = useState(`PV n\u00B0${pvNumber} \u2014 ${project.name} (${pvDate})`);
  const signatureHtml = profile.emailSignature?.trim() || `Cordialement,<br>${profile.name}${profile.structure ? `<br>${profile.structure}` : ""}`;
  const [emailBody, setEmailBody] = useState(
    `Bonjour,<br><br>Veuillez trouver ci-${includePdf ? "joint" : "dessous"} le proc\u00E8s-verbal n\u00B0${pvNumber} relatif au chantier \u00AB\u00A0${project.name}\u00A0\u00BB, dress\u00E9 en date du ${pvDate}.<br><br>Merci d'en prendre connaissance et de me faire part de vos \u00E9ventuelles remarques.<br><br>${signatureHtml}`
  );

  const toggleRecipient = (email) => setRecipients(prev => prev.map(r => r.email === email ? { ...r, checked: !r.checked } : r));

  const addExtra = () => {
    const em = extraEmail.trim().toLowerCase();
    if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) return;
    if (recipients.some(r => r.email === em)) return;
    setRecipients(prev => [...prev, { email: em, name: em, role: "", checked: true }]);
    setExtraEmail("");
  };

  const checkedCount = recipients.filter(r => r.checked).length;
  const checkedRecipients = recipients.filter(r => r.checked);

  const handleSend = async () => {
    const to = checkedRecipients.map(r => r.email);
    if (to.length === 0) return;
    setSending(true); setError("");

    let pdfBase64 = null;
    let pdfFileName = null;
    if (includePdf) {
      try {
        await import("jspdf"); // ensure jsPDF is loaded
        const res = await generatePDF(project, pvNumber, pvDate, pvContent, profile, { returnDataUrl: true });
        if (res?.dataUrl) {
          pdfBase64 = res.dataUrl.split(",")[1];
          pdfFileName = res.fileName;
        }
      } catch (e) {
        console.error("PDF generation for email failed:", e);
      }
    }

    const res = await sendPvByEmail({
      to,
      projectName: project.name,
      pvNumber,
      pvDate,
      pvContent,
      authorName: profile.name || profile.email || "L'architecte",
      structureName: profile.structure,
      pdfBase64,
      pdfFileName,
      subject,
      customMessage: emailBody.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "").replace(/\bon\w+\s*=/gi, "data-removed="),
    });

    setSending(false);
    if (res.error) { setError(res.error); return; }
    setStep("sent");
    if (onSent) onSent(to);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500 }} onClick={onClose}>
      <div style={{ background: WH, borderRadius: 16, width: "100%", maxWidth: 520, maxHeight: "85vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)", animation: "modalIn 0.2s ease-out" }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: "20px 24px 14px", borderBottom: `1px solid ${SBB}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Ico name="send" size={16} color={AC} />
            <span style={{ fontSize: 16, fontWeight: 700, color: TX }}>Envoyer le PV n°{pvNumber}</span>
          </div>
          <div style={{ fontSize: 12, color: TX3 }}>{project.name} — {pvDate}</div>
          {/* Step indicator with labels */}
          {step !== "sent" && (
            <div style={{ display: "flex", gap: SP.sm, marginTop: SP.md }}>
              {[
                { id: "recipients", label: "1. Destinataires" },
                { id: "preview", label: "2. Aperçu" },
              ].map((s, i) => {
                const active = step === s.id || (step === "preview" && i === 0);
                return (
                  <div key={s.id} style={{ flex: 1 }}>
                    <div style={{ height: 3, borderRadius: 2, background: active ? AC : SBB, transition: "background 0.3s", marginBottom: SP.xs }} />
                    <span style={{ fontSize: FS.xs, fontWeight: active ? 600 : 400, color: active ? AC : TX3 }}>{s.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Step: Sent confirmation ── */}
        {step === "sent" && (
          <div style={{ padding: "32px 24px", textAlign: "center" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#EAF3DE", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <Ico name="check" size={22} color={GR} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: TX, marginBottom: 6 }}>PV envoyé !</div>
            <div style={{ fontSize: 13, color: TX3, marginBottom: 20 }}>
              Envoyé à {checkedCount} destinataire{checkedCount > 1 ? "s" : ""}
            </div>
            <button onClick={onClose} style={{ padding: "10px 24px", border: "none", borderRadius: 8, background: AC, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Fermer</button>
          </div>
        )}

        {/* ── Step 1: Recipients ── */}
        {step === "recipients" && (
          <>
            <div style={{ padding: "14px 24px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 10 }}>
                Destinataires ({checkedCount} sélectionné{checkedCount > 1 ? "s" : ""})
              </div>
              {recipients.map((r, i) => (
                <label key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${SB}`, cursor: "pointer" }}>
                  <input type="checkbox" checked={r.checked} onChange={() => toggleRecipient(r.email)} style={{ accentColor: AC, width: 16, height: 16 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: TX, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: TX3 }}>{r.email}{r.role ? ` · ${r.role}` : ""}</div>
                  </div>
                </label>
              ))}
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                <input
                  type="email" value={extraEmail} onChange={e => setExtraEmail(e.target.value)}
                  placeholder="Ajouter un email..."
                  onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addExtra())}
                  style={{ flex: 1, padding: "8px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 12, fontFamily: "inherit", background: SB, color: TX }}
                />
                <button onClick={addExtra} style={{ padding: "8px 14px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", fontSize: 12, fontFamily: "inherit", color: TX2 }}>+</button>
              </div>
            </div>

            <div style={{ padding: "0 24px 14px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "8px 0" }}>
                <input type="checkbox" checked={includePdf} onChange={e => setIncludePdf(e.target.checked)} style={{ accentColor: AC, width: 16, height: 16 }} />
                <span style={{ fontSize: 12, color: TX2 }}>Joindre le PV en PDF</span>
              </label>
            </div>

            <div style={{ padding: "0 24px 20px", display: "flex", gap: 8 }}>
              <button onClick={onClose} style={{ flex: 1, padding: 11, border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: TX2 }}>Annuler</button>
              <button onClick={() => setStep("preview")} disabled={checkedCount === 0} style={{ flex: 2, padding: 11, border: "none", borderRadius: 8, background: checkedCount === 0 ? DIS : AC, color: checkedCount === 0 ? DIST : "#fff", fontSize: 13, fontWeight: 600, cursor: checkedCount === 0 ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <Ico name="eye" size={14} color={checkedCount === 0 ? DIST : "#fff"} />Aperçu de l'email
              </button>
            </div>
          </>
        )}

        {/* ── Step 2: Email Preview & Edit ── */}
        {step === "preview" && (
          <>
            <div style={{ padding: "14px 24px 0" }}>
              {/* Recipients summary */}
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 6 }}>À</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 14 }}>
                {checkedRecipients.map((r, i) => (
                  <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", background: SB, borderRadius: 6, fontSize: 11, color: TX2 }}>
                    {r.name || r.email}
                  </span>
                ))}
              </div>

              {/* Subject */}
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 6 }}>Objet</div>
              <input
                value={subject} onChange={e => setSubject(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 13, fontWeight: 600, fontFamily: "inherit", background: WH, color: TX, marginBottom: 14, boxSizing: "border-box" }}
              />

              {/* Email body */}
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 6 }}>Message</div>
              <div
                contentEditable
                suppressContentEditableWarning
                role="textbox" aria-label="Corps du message email" aria-multiline="true"
                onInput={e => setEmailBody(e.currentTarget.innerHTML)}
                dangerouslySetInnerHTML={{ __html: emailBody }}
                style={{ width: "100%", minHeight: 140, padding: "10px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 12, lineHeight: 1.6, fontFamily: "inherit", background: WH, color: TX, marginBottom: 10, boxSizing: "border-box", outline: "none", overflowWrap: "break-word" }}
              />

              {/* Visual preview */}
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 6 }}>Aperçu visuel</div>
              <div style={{ border: `1px solid ${SBB}`, borderRadius: 10, overflow: "hidden", marginBottom: 14, background: "#F7F6F4" }}>
                {/* Mini email header */}
                <div style={{ background: WH, padding: "12px 16px", borderBottom: `1px solid ${SBB}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: AC, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>A</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: TX }}>ArchiPilot</div>
                      <div style={{ fontSize: 10, color: TX3 }}>noreply@archipilot.app</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: TX, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subject || "(sans objet)"}</div>
                </div>
                {/* Email body preview */}
                <div style={{ padding: 16, fontSize: 12, lineHeight: 1.7, color: TX, background: WH, margin: 10, borderRadius: 8 }} dangerouslySetInnerHTML={{ __html: emailBody }} />
                {/* PV excerpt */}
                <div style={{ margin: "0 10px 10px", padding: 12, background: "#F7F6F4", borderRadius: 8, border: `1px solid ${SBB}` }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: AC, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>PV de chantier</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: TX, marginBottom: 2 }}>PV n°{pvNumber} — {project.name}</div>
                  <div style={{ fontSize: 10, color: TX3, marginBottom: 6 }}>{pvDate} · {profile.name}</div>
                  <div style={{ fontSize: 10, color: TX2, lineHeight: 1.5, maxHeight: 60, overflow: "hidden" }}>
                    {(pvContent || "").slice(0, 200)}{(pvContent || "").length > 200 ? "…" : ""}
                  </div>
                </div>
                {includePdf && (
                  <div style={{ margin: "0 10px 10px", padding: "8px 12px", background: WH, borderRadius: 8, border: `1px solid ${SBB}`, display: "flex", alignItems: "center", gap: 8 }}>
                    <Ico name="file" size={14} color={AC} />
                    <span style={{ fontSize: 11, color: TX2 }}>PV-{pvNumber}-{project.name.replace(/[^\w\u00C0-\u024F-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "")}.pdf</span>
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div style={{ margin: "0 24px 14px", padding: "8px 12px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, fontSize: 12, color: RD }}>{error}</div>
            )}

            <div style={{ padding: "0 24px 20px", display: "flex", gap: 8 }}>
              <button onClick={() => setStep("recipients")} style={{ flex: 1, padding: 11, border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: TX2, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <Ico name="chevron-left" size={14} color={TX3} />Retour
              </button>
              <button onClick={handleSend} disabled={sending} style={{ flex: 2, padding: 11, border: "none", borderRadius: 8, background: sending ? DIS : AC, color: sending ? DIST : "#fff", fontSize: 13, fontWeight: 600, cursor: sending ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {sending ? <><div style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "sp .6s linear infinite" }} />Envoi en cours...</> : <><Ico name="send" size={14} color="#fff" />Envoyer</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Stats Dashboard ─────────────────────────────────────────
// ── Export Utilities ─────────────────────────────────────────
function downloadCSV(filename, headers, rows) {
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [headers.map(escape).join(";"), ...rows.map(r => r.map(escape).join(";"))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function exportProjectsCSV(projects) {
  const headers = ["Projet", "Client", "Entreprise", "Adresse", "Phase", "Avancement %", "PV générés", "Actions ouvertes", "Actions urgentes", "Date début", "Prochaine réunion"];
  const rows = projects.filter(p => !p.archived).map(p => {
    const st = getStatus(p.statusId);
    const open = (p.actions || []).filter(a => a.open).length;
    const urgent = (p.actions || []).filter(a => a.open && a.urgent).length;
    return [p.name, p.client, p.contractor, p.address, st.label, p.progress || 0, p.pvHistory?.length || 0, open, urgent, p.startDate, p.nextMeeting];
  });
  downloadCSV("archipilot-projets.csv", headers, rows);
}

function exportActionsCSV(projects) {
  const headers = ["Projet", "Action", "Responsable", "Urgent", "Statut", "Depuis"];
  const rows = [];
  projects.forEach(p => {
    (p.actions || []).forEach(a => {
      rows.push([p.name, a.text, a.who, a.urgent ? "Oui" : "Non", a.open ? "Ouverte" : "Fermée", a.since]);
    });
  });
  downloadCSV("archipilot-actions.csv", headers, rows);
}

function exportRemarksCSV(projects) {
  const headers = ["Projet", "Poste", "Remarque", "Urgent", "Statut", "Destinataires"];
  const rows = [];
  projects.forEach(p => {
    (p.posts || []).forEach(po => {
      (po.remarks || []).forEach(r => {
        rows.push([p.name, `${po.id}. ${po.label}`, r.text, r.urgent ? "Oui" : "Non", r.status, (r.recipients || []).join(", ")]);
      });
    });
  });
  downloadCSV("archipilot-remarques.csv", headers, rows);
}

function exportParticipantsCSV(project) {
  const headers = ["Rôle", "Nom", "Email", "Téléphone"];
  const rows = (project.participants || []).map(p => [p.role, p.name, p.email, p.phone]);
  downloadCSV(`participants-${project.name.replace(/[^\w\u00C0-\u024F-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "")}.csv`, headers, rows);
}

function importParticipantsCSV(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split("\n").filter(l => l.trim());
      if (lines.length < 2) { resolve([]); return; }
      const participants = lines.slice(1).map(line => {
        const cols = line.split(";").map(c => c.replace(/^"|"$/g, "").trim());
        return { role: cols[0] || "", name: cols[1] || "", email: cols[2] || "", phone: cols[3] || "" };
      }).filter(p => p.name);
      resolve(participants);
    };
    reader.readAsText(file);
  });
}

function generateICS(project) {
  if (!project.nextMeeting) return null;
  const parts = project.nextMeeting.split("/");
  let dateStr;
  if (parts.length === 3) {
    dateStr = `${parts[2]}${parts[1]}${parts[0]}`;
  } else {
    return null;
  }
  const uid = `archipilot-${project.id}-${dateStr}@archipilot.app`;
  const summary = `Réunion de chantier — ${project.name}`;
  const location = project.address || "";
  const description = `PV n°${(project.pvHistory?.length || 0) + 1}\\nClient: ${project.client}\\nEntreprise: ${project.contractor}`;
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ArchiPilot//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTART;VALUE=DATE:${dateStr}`,
    `DTEND;VALUE=DATE:${dateStr}`,
    `SUMMARY:${summary}`,
    `LOCATION:${location}`,
    `DESCRIPTION:${description}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  return ics;
}

function downloadICS(project) {
  const ics = generateICS(project);
  if (!ics) return;
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `reunion-${project.name.replace(/[^\w\u00C0-\u024F-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "")}.ics`; a.click();
  URL.revokeObjectURL(url);
}

function getGoogleCalendarUrl(project) {
  if (!project.nextMeeting) return null;
  const parts = project.nextMeeting.split("/");
  if (parts.length !== 3) return null;
  const dateStr = `${parts[2]}${parts[1]}${parts[0]}`;
  const title = encodeURIComponent(`Réunion de chantier — ${project.name}`);
  const location = encodeURIComponent(project.address || "");
  const details = encodeURIComponent(`PV n°${(project.pvHistory?.length || 0) + 1}\nClient: ${project.client}\nEntreprise: ${project.contractor}`);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dateStr}/${dateStr}&location=${location}&details=${details}`;
}

function StatsView({ projects, onBack, onSelectProject, onNewPV, onNewProject }) {
  const t = useT();
  const active = projects.filter(p => !p.archived);
  const [showExport, setShowExport] = useState(false);

  // ── Compute all stats ──
  const openActions = projects.reduce((s, p) => s + (p.actions || []).filter(a => a.open).length, 0);
  const urgentActions = projects.reduce((s, p) => s + (p.actions || []).filter(a => a.open && a.urgent).length, 0);
  const totalLots = projects.reduce((s, p) => s + (p.lots?.length || 0), 0);
  const delayedLots = projects.reduce((s, p) => s + (p.lots || []).filter(l => calcLotStatus(l).id === "delayed").length, 0);

  // Urgent items across all projects
  const allUrgent = [];
  active.forEach(p => {
    (p.actions || []).filter(a => a.open && a.urgent).forEach(a => allUrgent.push({ type: "action", text: a.text, who: a.who, since: a.since, project: p }));
    (p.lots || []).filter(l => calcLotStatus(l).id === "delayed").forEach(l => allUrgent.push({ type: "delay", text: `${l.name} — en retard`, who: l.contractor, project: p }));
  });

  // PV needing action (drafts, not sent)
  const pvToResume = [];
  active.forEach(p => {
    (p.pvHistory || []).forEach(pv => {
      const st = pv.status || "draft";
      if (st === "draft" || st === "review") pvToResume.push({ ...pv, project: p });
    });
  });
  pvToResume.sort((a, b) => (b.date || "").localeCompare(a.date || "")).splice(6);

  // Meetings this week
  const now = new Date();
  const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7);
  const meetingsThisWeek = active.filter(p => {
    if (!p.nextMeeting) return false;
    const parts = p.nextMeeting.split("/");
    if (parts.length !== 3) return false;
    const d = new Date(parts[2], parts[1] - 1, parts[0]);
    return d >= now && d <= weekEnd;
  });

  // Project stats for table
  const projectStats = active.map(p => {
    const open = (p.actions || []).filter(a => a.open).length;
    const urgent = (p.actions || []).filter(a => a.open && a.urgent).length;
    const delayed = (p.lots || []).filter(l => calcLotStatus(l).id === "delayed").length;
    const st = getStatus(p.statusId);
    const lastPV = p.pvHistory?.[0];
    return { ...p, openActions: open, urgentActions: urgent, delayedLots: delayed, status: st, lastPV };
  }).sort((a, b) => b.urgentActions - a.urgentActions || b.openActions - a.openActions);

  // Lots needing attention
  const lotsToWatch = [];
  active.forEach(p => {
    (p.lots || []).forEach(l => {
      const st = calcLotStatus(l);
      if (st.id === "delayed" || st.id === "active") lotsToWatch.push({ ...l, lotStatus: st, project: p });
    });
  });
  lotsToWatch.sort((a, b) => (a.lotStatus.id === "delayed" ? 0 : 1) - (b.lotStatus.id === "delayed" ? 0 : 1)).splice(5);

  // Activity feed
  const activity = [];
  active.forEach(p => {
    (p.pvHistory || []).slice(0, 2).forEach(pv => activity.push({ type: "pv", text: `PV n°${pv.number} ${pv.imported ? "importé" : "rédigé"}`, date: pv.date, project: p }));
    (p.gallery || []).slice(-2).forEach(ph => activity.push({ type: "photo", text: "Photo ajoutée", date: ph.date ? new Date(ph.date).toLocaleDateString("fr-BE") : "", project: p }));
  });
  activity.sort((a, b) => (b.date || "").localeCompare(a.date || "")).splice(6);

  // Contractor performance
  const contractors = {};
  projects.forEach(p => { (p.actions || []).forEach(a => { const who = a.who?.trim(); if (!who) return; if (!contractors[who]) contractors[who] = { total: 0, open: 0, urgent: 0, closed: 0 }; contractors[who].total++; if (a.open) { contractors[who].open++; if (a.urgent) contractors[who].urgent++; } else contractors[who].closed++; }); });
  const contractorList = Object.entries(contractors).map(([name, s]) => ({ name, ...s })).sort((a, b) => b.open - a.open);

  const Bar = ({ value, max, color }) => (
    <div style={{ flex: 1, height: 6, background: SB2, borderRadius: 3, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${max > 0 ? (value / max) * 100 : 0}%`, background: color || AC, borderRadius: 3, transition: "width 0.3s" }} />
    </div>
  );
  const SectionTitle = ({ children, action }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
      <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3 }}>{children}</span>
      {action}
    </div>
  );
  const DashCard = ({ children, style: s = {} }) => (
    <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 14, padding: "16px 18px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", ...s }}>{children}</div>
  );

  // Upcoming meetings sorted by date
  const upcomingMeetings = active.filter(p => p.nextMeeting).map(p => {
    const parts = p.nextMeeting.split("/");
    const d = parts.length === 3 ? new Date(parts[2], parts[1] - 1, parts[0]) : null;
    return { project: p, date: d, dateStr: p.nextMeeting };
  }).filter(m => m.date && m.date >= now).sort((a, b) => a.date - b.date);

  // ═══════════════════════════════════════════════════
  // ══ MOBILE DASHBOARD ══
  // ═══════════════════════════════════════════════════
  if (typeof window !== "undefined" && window.innerWidth < 768) {
    return (
      <div style={{ animation: "fadeIn 0.2s ease", display: "flex", flexDirection: "column", gap: 10 }}>

        {/* 1. Urgences */}
        {allUrgent.length > 0 && (
          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: RD }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: "#B91C1C", flex: 1 }}>À traiter</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: RD }}>{allUrgent.length}</span>
            </div>
            {allUrgent.slice(0, 2).map((item, i) => (
              <div key={i} onClick={() => onSelectProject(item.project.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderTop: i > 0 ? "1px solid #FECACA40" : "none", cursor: "pointer" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#B91C1C", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.text}</div>
                  <div style={{ fontSize: 9, color: "#DC2626" }}>{item.project.name}{item.who ? ` · ${item.who}` : ""}</div>
                </div>
                <Ico name="arrowr" size={9} color="#DC2626" />
              </div>
            ))}
          </div>
        )}

        {/* 2. Prochaine réunion */}
        {upcomingMeetings.length > 0 && (
          <button onClick={() => onSelectProject(upcomingMeetings[0].project.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: ACL, border: `1px solid ${ACL2}`, borderRadius: 10, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: WH, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Ico name="calendar" size={14} color={AC} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: TX }}>{upcomingMeetings[0].dateStr}</div>
              <div style={{ fontSize: 10, color: TX3 }}>{upcomingMeetings[0].project.name}</div>
            </div>
            <Ico name="arrowr" size={10} color={AC} />
          </button>
        )}

        {/* 3. Projets — la vraie vue décisionnelle */}
        {projectStats.length > 0 && (
          <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "9px 12px", borderBottom: `1px solid ${SB2}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: TX }}>Mes projets</span>
              <button onClick={onNewProject} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", border: `1px solid ${SBB}`, borderRadius: 6, background: WH, cursor: "pointer", fontFamily: "inherit" }}>
                <Ico name="plus" size={10} color={TX3} />
                <span style={{ fontSize: 10, fontWeight: 600, color: TX2 }}>Nouveau</span>
              </button>
            </div>
            {projectStats.map((p, i) => {
              const attention = p.urgentActions + p.delayedLots;
              return (
                <div key={p.id} onClick={() => onSelectProject(p.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderBottom: i < projectStats.length - 1 ? `1px solid ${SB2}` : "none", cursor: "pointer" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                      <span style={{ fontSize: 8, fontWeight: 600, color: p.status.color, background: p.status.bg, padding: "1px 5px", borderRadius: 4 }}>{p.status.label}</span>
                      {p.nextMeeting && <span style={{ fontSize: 9, color: TX3 }}>{p.nextMeeting}</span>}
                    </div>
                  </div>
                  {attention > 0 && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 9, fontWeight: 700, color: RD, background: "#FEF2F2", padding: "2px 6px", borderRadius: 8 }}>
                      <span style={{ width: 4, height: 4, borderRadius: "50%", background: RD }} />{attention}
                    </span>
                  )}
                  {pvToResume.some(pv => pv.project.id === p.id) && (
                    <span style={{ fontSize: 8, fontWeight: 600, color: AC, background: ACL, padding: "2px 5px", borderRadius: 4 }}>PV</span>
                  )}
                  <Ico name="arrowr" size={9} color={TX3} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════
  // ══ DESKTOP DASHBOARD ══
  // ═══════════════════════════════════════════════════
  return (
    <div style={{ animation: "fadeIn 0.2s ease" }}>

      {/* ═══ 1. Header ═══ */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 8, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}><Ico name="back" color={TX2} /></button>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: TX, letterSpacing: "-0.3px" }}>Dashboard</div>
            <div style={{ fontSize: 12, color: TX3 }}>{active.length} projet{active.length > 1 ? "s" : ""} actif{active.length > 1 ? "s" : ""}{urgentActions > 0 ? ` · ${urgentActions} urgence${urgentActions > 1 ? "s" : ""}` : ""}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={onNewProject} style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 14px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 500, color: TX2 }}>
            <Ico name="plus" size={12} color={TX3} />Projet
          </button>
          <button onClick={() => setShowExport(p => !p)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 12px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", fontFamily: "inherit", fontSize: 12, color: TX3 }}>
            <Ico name="download" size={12} color={TX3} />
          </button>
        </div>
      </div>
      {showExport && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14, animation: "fadeIn 0.12s ease-out" }}>
          <button onClick={() => { exportProjectsCSV(projects); setShowExport(false); }} style={{ padding: "6px 12px", border: `1px solid ${SBB}`, borderRadius: 6, background: WH, cursor: "pointer", fontSize: 11, fontFamily: "inherit", color: TX2 }}>Projets CSV</button>
          <button onClick={() => { exportActionsCSV(projects); setShowExport(false); }} style={{ padding: "6px 12px", border: `1px solid ${SBB}`, borderRadius: 6, background: WH, cursor: "pointer", fontSize: 11, fontFamily: "inherit", color: TX2 }}>Actions CSV</button>
          <button onClick={() => { exportRemarksCSV(projects); setShowExport(false); }} style={{ padding: "6px 12px", border: `1px solid ${SBB}`, borderRadius: 6, background: WH, cursor: "pointer", fontSize: 11, fontFamily: "inherit", color: TX2 }}>Remarques CSV</button>
        </div>
      )}

      {/* ═══ 2. Urgences (hero) ═══ */}
      {allUrgent.length > 0 && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 14, padding: "16px 20px", marginBottom: 16 }}>
          <SectionTitle action={<span style={{ fontSize: 11, fontWeight: 600, color: RD }}>{allUrgent.length} point{allUrgent.length > 1 ? "s" : ""}</span>}>
            À traiter maintenant
          </SectionTitle>
          {allUrgent.slice(0, 5).map((item, i) => (
            <div key={i} onClick={() => onSelectProject(item.project.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: i > 0 ? "1px solid #FECACA40" : "none", cursor: "pointer" }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: item.type === "action" ? RD : AC, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#B91C1C" }}>{item.text}</div>
                <div style={{ fontSize: 10, color: "#DC2626" }}>{item.project.name}{item.who ? ` · ${item.who}` : ""}</div>
              </div>
              <Ico name="arrowr" size={11} color="#DC2626" />
            </div>
          ))}
        </div>
      )}

      {/* ═══ 3. Two-column layout ═══ */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>

        {/* ── Left: projets (la vraie vue) ── */}
        <div style={{ flex: "1 1 520px", display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>

          {/* Tableau projets */}
          <DashCard>
            <SectionTitle>Portefeuille projets</SectionTitle>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${SBB}` }}>
                    <th style={{ textAlign: "left", padding: "8px 6px", color: TX3, fontWeight: 600 }}>Projet</th>
                    <th style={{ textAlign: "center", padding: "8px 6px", color: TX3, fontWeight: 600 }}>Phase</th>
                    <th style={{ textAlign: "center", padding: "8px 6px", color: TX3, fontWeight: 600 }}>Alertes</th>
                    <th style={{ textAlign: "center", padding: "8px 6px", color: TX3, fontWeight: 600 }}>Réunion</th>
                    <th style={{ textAlign: "center", padding: "8px 6px", color: TX3, fontWeight: 600 }}>PV</th>
                    <th style={{ textAlign: "center", padding: "8px 6px", color: TX3, fontWeight: 600 }}>Avancement</th>
                    <th style={{ padding: "8px 4px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {projectStats.map(p => {
                    const attention = p.urgentActions + p.delayedLots;
                    const hasDraftPV = pvToResume.some(pv => pv.project.id === p.id);
                    return (
                      <tr key={p.id} onClick={() => onSelectProject(p.id)} className="plan-file-row" style={{ borderBottom: `1px solid ${SB}`, cursor: "pointer" }}>
                        <td style={{ padding: "10px 6px" }}>
                          <div style={{ fontWeight: 600, color: TX }}>{p.name}</div>
                          <div style={{ fontSize: 10, color: TX3, marginTop: 1 }}>{p.client || "—"}</div>
                        </td>
                        <td style={{ textAlign: "center", padding: "10px 6px" }}>
                          <span style={{ fontSize: 9, fontWeight: 600, color: p.status.color, background: p.status.bg, padding: "2px 7px", borderRadius: 5 }}>{p.status.label}</span>
                        </td>
                        <td style={{ textAlign: "center", padding: "10px 6px" }}>
                          {attention > 0 ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 700, color: RD, background: "#FEF2F2", padding: "2px 8px", borderRadius: 10 }}>
                              <span style={{ width: 5, height: 5, borderRadius: "50%", background: RD }} />{attention}
                            </span>
                          ) : (
                            <span style={{ fontSize: 10, color: GR, fontWeight: 600 }}>OK</span>
                          )}
                        </td>
                        <td style={{ textAlign: "center", padding: "10px 6px", fontSize: 11, color: p.nextMeeting ? TX : TX3 }}>
                          {p.nextMeeting || "—"}
                        </td>
                        <td style={{ textAlign: "center", padding: "10px 6px" }}>
                          {hasDraftPV ? (
                            <span style={{ fontSize: 9, fontWeight: 600, color: AC, background: ACL, padding: "2px 6px", borderRadius: 4 }}>Brouillon</span>
                          ) : (
                            <span style={{ fontSize: 10, color: TX3 }}>{p.pvHistory?.length || 0}</span>
                          )}
                        </td>
                        <td style={{ padding: "10px 6px", width: 90 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <Bar value={p.progress || 0} max={100} color={p.delayedLots > 0 ? RD : GR} />
                            <span style={{ fontSize: 10, fontWeight: 600, color: TX2, minWidth: 24 }}>{p.progress || 0}%</span>
                          </div>
                        </td>
                        <td style={{ padding: "10px 4px", textAlign: "right" }} onClick={e => e.stopPropagation()}>
                          <button onClick={() => onNewPV(p.id)} title="Nouveau PV" style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${ACL2}`, background: ACL, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Ico name="edit" size={11} color={AC} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </DashCard>

          {/* Lots à surveiller */}
          {lotsToWatch.length > 0 && (
            <DashCard>
              <SectionTitle action={<span style={{ fontSize: 10, color: TX3 }}>{totalLots} lots · {delayedLots} en retard</span>}>Planning chantier</SectionTitle>
              {lotsToWatch.map((l, i) => (
                <div key={i} onClick={() => onSelectProject(l.project.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: i > 0 ? `1px solid ${SB}` : "none", cursor: "pointer" }}>
                  <div style={{ width: 3, height: 24, borderRadius: 2, background: l.lotStatus.id === "delayed" ? RD : AC, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: TX }}>{l.name}</div>
                    <div style={{ fontSize: 10, color: TX3 }}>{l.project.name}{l.contractor ? ` · ${l.contractor}` : ""}</div>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 600, color: l.lotStatus.color, background: l.lotStatus.bg, padding: "2px 7px", borderRadius: 5 }}>{l.lotStatus.label}</span>
                </div>
              ))}
            </DashCard>
          )}
        </div>

        {/* ── Right column ── */}
        <div style={{ flex: "0 1 280px", display: "flex", flexDirection: "column", gap: 14, minWidth: 220 }}>

          {/* Prochaines réunions */}
          {upcomingMeetings.length > 0 && (
            <DashCard style={{ background: ACL, border: `1px solid ${ACL2}` }}>
              <SectionTitle>Réunions à venir</SectionTitle>
              {upcomingMeetings.slice(0, 4).map((m, i) => (
                <div key={i} onClick={() => onSelectProject(m.project.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: i > 0 ? `1px solid ${ACL2}` : "none", cursor: "pointer" }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: WH, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Ico name="calendar" size={12} color={AC} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: TX }}>{m.dateStr}</div>
                    <div style={{ fontSize: 10, color: TX3 }}>{m.project.name}</div>
                  </div>
                </div>
              ))}
            </DashCard>
          )}

          {/* PV à finaliser */}
          {pvToResume.length > 0 && (
            <DashCard>
              <SectionTitle action={<span style={{ fontSize: 10, fontWeight: 600, color: AC }}>{pvToResume.length}</span>}>
                PV à finaliser
              </SectionTitle>
              {pvToResume.slice(0, 4).map((pv, i) => (
                <div key={i} onClick={() => onSelectProject(pv.project.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: i > 0 ? `1px solid ${SB}` : "none", cursor: "pointer" }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: ACL, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Ico name="edit" size={10} color={AC} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>PV n°{pv.number} — {pv.project.name}</div>
                    <div style={{ fontSize: 9, color: TX3 }}>{pv.date}</div>
                  </div>
                  <PvStatusBadge status={pv.status} />
                </div>
              ))}
            </DashCard>
          )}

          {/* Intervenants à suivre */}
          {contractorList.filter(c => c.open > 0).length > 0 && (
            <DashCard>
              <SectionTitle>Intervenants à suivre</SectionTitle>
              {contractorList.filter(c => c.open > 0).slice(0, 6).map(c => (
                <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: `1px solid ${SB}` }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: c.urgent > 0 ? "#FEF2F2" : SB, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 9, fontWeight: 700, color: c.urgent > 0 ? RD : TX3 }}>
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: TX, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                  </div>
                  <span style={{ fontSize: 10, color: TX3 }}>{c.open} ouv.</span>
                  {c.urgent > 0 && <span style={{ fontSize: 9, fontWeight: 700, color: RD, background: "#FEF2F2", padding: "1px 5px", borderRadius: 3 }}>{c.urgent}!</span>}
                </div>
              ))}
            </DashCard>
          )}
        </div>
      </div>
    </div>
  );
}

// ── PLANNING DASHBOARD ──
function PlanningDashboard({ projects, onBack, onSelectProject }) {
  const active = projects.filter(p => !p.archived);
  const [viewMode, setViewMode] = useState("week");
  const [filter, setFilter] = useState("all");
  const [filterProject, setFilterProject] = useState("all");
  const [selected, setSelected] = useState(null);
  const [weekOffset, setWeekOffset] = useState(0);

  // ── Date helpers ──
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const parseDate = (str) => {
    if (!str) return null;
    if (str.includes("/")) { const p = str.split("/"); return p.length === 3 ? new Date(p[2], p[1] - 1, p[0]) : null; }
    const d = new Date(str); return isNaN(d.getTime()) ? null : d;
  };
  const fmtDay = (d) => d.toLocaleDateString("fr-BE", { weekday: "short", day: "numeric", month: "short" });
  const fmtShort = (d) => d.toLocaleDateString("fr-BE", { day: "numeric", month: "short" });
  const isSameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  // ── Week range ──
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1 + weekOffset * 7); // Monday
  const weekDays = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; });

  // ── Month range ──
  const monthStart = new Date(today.getFullYear(), today.getMonth() + (viewMode === "month" ? weekOffset : 0), 1);
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);

  // ── Gather all events ──
  const events = [];
  const src = filterProject === "all" ? active : active.filter(p => String(p.id) === String(filterProject));

  src.forEach(p => {
    // Meetings
    const md = parseDate(p.nextMeeting);
    if (md) events.push({ type: "meeting", title: "Réunion de chantier", project: p, date: md, icon: "calendar", color: BL, bg: BLB });

    // Actions with deadlines (use `since` as context, no explicit deadline field — show open urgent ones)
    (p.actions || []).filter(a => a.open).forEach(a => {
      events.push({ type: "action", title: a.text, project: p, date: md || today, who: a.who, urgent: a.urgent, since: a.since, icon: "alert", color: a.urgent ? RD : AC, bg: a.urgent ? "#FEF2F2" : ACL, actionData: a });
    });

    // Lots
    (p.lots || []).forEach(l => {
      const st = calcLotStatus(l);
      const start = parseDate(l.startDate);
      const end = parseDate(l.endDate);
      if (start || end) {
        events.push({ type: "lot", title: l.name, project: p, date: start || end, endDate: end, startDate: start, contractor: l.contractor, lotStatus: st, progress: l.progress || 0, icon: "gantt", color: st.color, bg: st.bg, lotData: l });
      }
    });

    // Alerts: lot delayed, meeting past without PV
    (p.lots || []).filter(l => calcLotStatus(l).id === "delayed").forEach(l => {
      events.push({ type: "alert", title: `${l.name} — en retard`, project: p, date: parseDate(l.endDate) || today, icon: "alert", color: RD, bg: "#FEF2F2" });
    });
    if (md && md < today && (!p.pvHistory?.length || p.pvHistory[0].status === "draft")) {
      events.push({ type: "alert", title: "Réunion passée sans PV finalisé", project: p, date: md, icon: "file", color: RD, bg: "#FEF2F2" });
    }
  });

  // ── Filter events ──
  const filtered = events.filter(e => {
    if (filter !== "all" && e.type !== filter) return false;
    return true;
  });

  // ── Events for a specific day ──
  const eventsForDay = (day) => filtered.filter(e => {
    if (e.type === "lot" && e.startDate && e.endDate) {
      return day >= e.startDate && day <= e.endDate;
    }
    return e.date && isSameDay(e.date, day);
  });

  // ── Events for today view ──
  const todayEvents = filtered.filter(e => {
    if (e.type === "lot" && e.startDate && e.endDate) return today >= e.startDate && today <= e.endDate;
    return e.date && isSameDay(e.date, today);
  });

  // ── Events for month view ──
  const monthEvents = filtered.filter(e => {
    const d = e.date;
    if (!d) return false;
    return d >= monthStart && d <= monthEnd;
  });

  // ── Summaries ──
  const meetingsWeek = events.filter(e => e.type === "meeting" && e.date >= weekDays[0] && e.date <= weekDays[6]).length;
  const actionsOpen = events.filter(e => e.type === "action").length;
  const lotsRisk = events.filter(e => e.type === "lot" && e.lotStatus?.id === "delayed").length;
  const alerts = events.filter(e => e.type === "alert").length;
  const typeLabel = { meeting: "Reunion", action: "Action", lot: "Lot", alert: "Alerte" };

  const typeIcon = { meeting: "calendar", action: "alert", lot: "gantt", alert: "alert" };
  const EventCard = ({ ev }) => {
    const isSel = selected === ev;
    return (
      <div onClick={() => setSelected(ev)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 6px", background: isSel ? ev.color + "14" : WH, border: `1px solid ${isSel ? ev.color + "50" : SBB + "80"}`, borderRadius: 6, cursor: "pointer", transition: "all 0.1s", marginBottom: 3, borderLeft: `3px solid ${ev.color}` }}>
        <Ico name={typeIcon[ev.type] || "file"} size={10} color={ev.color} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: isSel ? ev.color : TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.3 }}>{ev.title}</div>
          <div style={{ fontSize: 8, color: TX3, lineHeight: 1.2 }}>{ev.project.name}{ev.who ? ` · ${ev.who}` : ""}</div>
        </div>
        {ev.urgent && <div style={{ width: 5, height: 5, borderRadius: "50%", background: RD, flexShrink: 0, animation: "ring 2s ease infinite" }} />}
        {ev.lotStatus && ev.lotStatus.id === "delayed" && <div style={{ width: 5, height: 5, borderRadius: "50%", background: RD, flexShrink: 0 }} />}
      </div>
    );
  };

  const periodLabel = viewMode === "today" ? fmtDay(today) : viewMode === "week" ? `${fmtShort(weekDays[0])} — ${fmtShort(weekDays[6])}` : monthStart.toLocaleDateString("fr-BE", { month: "long", year: "numeric" });

  // ── Detail panel (kept for month view clicks) ──
  const DetailPanel = () => {
    if (!selected) return (
      <div style={{ padding: 20, textAlign: "center", color: TX3, fontSize: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", background: SB, display: "flex", alignItems: "center", justifyContent: "center", margin: "20px auto 10px" }}>
          <Ico name="calendar" size={18} color={TX3} />
        </div>
        Sélectionnez un ��lément pour voir ses détails
      </div>
    );
    const ev = selected;
    return (
      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: ev.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Ico name={ev.icon} size={15} color={ev.color} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: ev.color }}>{ev.type === "meeting" ? "Réunion" : ev.type === "action" ? "Action" : ev.type === "lot" ? "Lot" : "Alerte"}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: TX }}>{ev.title}</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Ico name="building" size={11} color={TX3} /><span style={{ color: TX2 }}>{ev.project.name}</span></div>
          {ev.date && <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Ico name="calendar" size={11} color={TX3} /><span style={{ color: TX2 }}>{fmtDay(ev.date)}{ev.endDate && !isSameDay(ev.date, ev.endDate) ? ` → ${fmtShort(ev.endDate)}` : ""}</span></div>}
          {ev.who && <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Ico name="users" size={11} color={TX3} /><span style={{ color: TX2 }}>{ev.who}</span></div>}
          {ev.since && <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Ico name="file" size={11} color={TX3} /><span style={{ color: TX3 }}>Source : {ev.since}</span></div>}
          {ev.contractor && <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Ico name="users" size={11} color={TX3} /><span style={{ color: TX2 }}>{ev.contractor}</span></div>}
          {ev.lotStatus && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: ev.lotStatus.color, background: ev.lotStatus.bg, padding: "2px 8px", borderRadius: 5 }}>{ev.lotStatus.label}</span>
              {ev.progress > 0 && <span style={{ fontSize: 10, color: TX3 }}>{ev.progress}%</span>}
            </div>
          )}
          {ev.urgent && <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: RD }} /><span style={{ fontSize: 11, fontWeight: 600, color: RD }}>Urgent</span></div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 16 }}>
          <button onClick={() => onSelectProject(ev.project.id)} style={{ width: "100%", padding: "9px 12px", border: "none", borderRadius: 8, background: AC, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Ico name="arrowr" size={11} color="#fff" />Ouvrir le projet
          </button>
        </div>
      </div>
    );
  };

  // ═══ MOBILE PLANNING ═══
  if (typeof window !== "undefined" && window.innerWidth < 768) {
    // Group events by day for agenda view
    const groupByDay = (evts) => {
      const groups = {};
      evts.forEach(ev => {
        if (ev.type === "lot" && ev.startDate && ev.endDate) {
          // Show lot on its start date only for cleaner list
          const key = ev.startDate.toDateString();
          if (!groups[key]) groups[key] = { date: ev.startDate, events: [] };
          groups[key].events.push(ev);
        } else if (ev.date) {
          const key = ev.date.toDateString();
          if (!groups[key]) groups[key] = { date: ev.date, events: [] };
          groups[key].events.push(ev);
        }
      });
      return Object.values(groups).sort((a, b) => a.date - b.date);
    };

    const dayLabel = (d) => {
      if (isSameDay(d, today)) return "Aujourd'hui";
      const tom = new Date(today); tom.setDate(tom.getDate() + 1);
      if (isSameDay(d, tom)) return "Demain";
      return d.toLocaleDateString("fr-BE", { weekday: "long", day: "numeric", month: "long" });
    };

    // Events for the selected period
    const mobileEvents = viewMode === "today" ? todayEvents
      : viewMode === "week" ? filtered.filter(e => { const d = e.date; if (!d) return false; return d >= weekDays[0] && d <= weekDays[6]; })
      : filtered.filter(e => { const d = e.date; if (!d) return false; const futureLimit = new Date(today); futureLimit.setDate(futureLimit.getDate() + 30); return d >= today && d <= futureLimit; });

    const grouped = groupByDay(mobileEvents);
    const [mobileDetail, setMobileDetail] = useState(null);

    // Lot context helper
    const lotContext = (ev) => {
      if (!ev.lotStatus) return "";
      if (ev.lotStatus.id === "delayed") return "En retard";
      if (ev.lotStatus.id === "active") return "En cours";
      if (ev.startDate) {
        const tom = new Date(today); tom.setDate(tom.getDate() + 1);
        if (isSameDay(ev.startDate, today)) return "Demarre aujourd'hui";
        if (isSameDay(ev.startDate, tom)) return "Demarre demain";
      }
      return ev.lotStatus.label;
    };

    return (
      <div style={{ animation: "fadeIn 0.2s ease", display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Period switch — centered, prominent */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <div style={{ display: "flex", background: SB, borderRadius: 10, padding: 3, gap: 3, border: `1px solid ${SBB}` }}>
            {[{ id: "today", label: "Jour" }, { id: "week", label: "Semaine" }, { id: "month", label: "À venir" }].map(v => (
              <button key={v.id} onClick={() => { setViewMode(v.id); setWeekOffset(0); }} style={{ padding: "9px 22px", border: "none", borderRadius: 8, fontSize: 13, fontWeight: viewMode === v.id ? 700 : 500, cursor: "pointer", fontFamily: "inherit", background: viewMode === v.id ? WH : "transparent", color: viewMode === v.id ? AC : TX3, boxShadow: viewMode === v.id ? "0 2px 6px rgba(0,0,0,0.08)" : "none", transition: "all 0.12s" }}>{v.label}</button>
            ))}
          </div>
        </div>

        {/* Filter chips — centered */}
        <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
          {[
            { id: "all", label: "Tous", color: TX },
            { id: "meeting", label: "Réunions", color: BL },
            { id: "action", label: "Actions", color: AC },
            { id: "lot", label: "Lots", color: GR },
            { id: "alert", label: "Alertes", color: RD },
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", border: `1px solid ${filter === f.id ? f.color + "40" : SBB}`, borderRadius: 14, background: filter === f.id ? f.color + "10" : WH, cursor: "pointer", fontFamily: "inherit" }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: f.color, opacity: filter === f.id ? 1 : 0.3 }} />
              <span style={{ fontSize: 11, fontWeight: filter === f.id ? 700 : 500, color: filter === f.id ? f.color : TX3 }}>{f.label}</span>
            </button>
          ))}
        </div>

        {/* Agenda list */}
        {grouped.length === 0 ? (
          <div style={{ padding: "32px 0", textAlign: "center" }}>
            <Ico name="calendar" size={22} color={SBB} />
            <div style={{ fontSize: 12, color: TX3, marginTop: 6 }}>
              {viewMode === "today" ? "Rien de prevu aujourd'hui" : viewMode === "week" ? "Aucun evenement cette semaine" : "Rien a venir pour le moment"}
            </div>
            <div style={{ fontSize: 10, color: TX3, marginTop: 2 }}>
              {filter !== "all" ? "Essayez un autre filtre" : "Vos reunions et actions apparaitront ici"}
            </div>
          </div>
        ) : grouped.map((group, gi) => (
          <div key={gi}>
            {/* Day header */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 0 3px" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: isSameDay(group.date, today) ? AC : TX, textTransform: "capitalize" }}>{dayLabel(group.date)}</span>
              <div style={{ flex: 1, height: 1, background: isSameDay(group.date, today) ? AC + "30" : SBB }} />
              <span style={{ fontSize: 9, color: TX3 }}>{group.events.length} elem.</span>
            </div>
            {/* Events */}
            {group.events.map((ev, ei) => (
              <button key={ei} onClick={() => setMobileDetail(ev)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: WH, border: `1px solid ${SBB}`, borderRadius: 8, cursor: "pointer", fontFamily: "inherit", textAlign: "left", marginBottom: 6, borderLeft: `3px solid ${ev.color}` }}>
                <Ico name={typeIcon[ev.type] || "file"} size={13} color={ev.color} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ev.title}</div>
                  <div style={{ fontSize: 9, color: TX3, marginTop: 1, display: "flex", alignItems: "center", gap: 4 }}>
                    <span>{ev.project.name}</span>
                    {ev.who && <><span style={{ color: SBB }}>·</span><span>{ev.who}</span></>}
                    {ev.type === "lot" && <><span style={{ color: SBB }}>·</span><span style={{ color: ev.lotStatus?.id === "delayed" ? RD : ev.color, fontWeight: 600 }}>{lotContext(ev)}</span></>}
                  </div>
                </div>
                {ev.urgent && <div style={{ width: 5, height: 5, borderRadius: "50%", background: RD, flexShrink: 0 }} />}
                {ev.lotStatus && ev.lotStatus.id === "delayed" && <span style={{ fontSize: 7, fontWeight: 700, color: RD, background: "#FEF2F2", padding: "1px 4px", borderRadius: 3, flexShrink: 0 }}>!</span>}
                <Ico name="arrowr" size={8} color={SBB} />
              </button>
            ))}
          </div>
        ))}

        {/* Detail bottom sheet */}
        {mobileDetail && (
          <div style={{ position: "fixed", inset: 0, zIndex: 250, display: "flex", flexDirection: "column", justifyContent: "flex-end" }} onClick={() => setMobileDetail(null)}>
            <div style={{ background: "rgba(0,0,0,0.3)", position: "absolute", inset: 0 }} />
            <div onClick={e => e.stopPropagation()} style={{ position: "relative", background: WH, borderRadius: "20px 20px 0 0", animation: "sheetUp 0.25s ease-out", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: SBB, margin: `${SP.md}px auto ${SP.sm}px` }} />
              {(() => { const ev = mobileDetail; return (
                <div style={{ padding: `0 ${SP.lg}px ${SP.lg}px` }}>
                  {/* Type + title */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: ev.bg || ev.color + "14", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Ico name={typeIcon[ev.type] || "file"} size={15} color={ev.color} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: ev.color }}>{typeLabel[ev.type]}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: TX }}>{ev.title}</div>
                    </div>
                  </div>
                  {/* Meta */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16, fontSize: 13 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}><Ico name="building" size={13} color={TX3} /><span style={{ color: TX2 }}>{ev.project.name}</span></div>
                    {ev.date && <div style={{ display: "flex", alignItems: "center", gap: 7 }}><Ico name="calendar" size={13} color={TX3} /><span style={{ color: TX2 }}>{fmtDay(ev.date)}{ev.endDate && !isSameDay(ev.date, ev.endDate) ? ` → ${fmtShort(ev.endDate)}` : ""}</span></div>}
                    {ev.who && <div style={{ display: "flex", alignItems: "center", gap: 7 }}><Ico name="users" size={13} color={TX3} /><span style={{ color: TX2 }}>{ev.who}</span></div>}
                    {ev.contractor && <div style={{ display: "flex", alignItems: "center", gap: 7 }}><Ico name="users" size={13} color={TX3} /><span style={{ color: TX2 }}>{ev.contractor}</span></div>}
                    {ev.since && <div style={{ display: "flex", alignItems: "center", gap: 7 }}><Ico name="file" size={13} color={TX3} /><span style={{ color: TX3 }}>{ev.since}</span></div>}
                    {ev.lotStatus && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: ev.lotStatus.color, background: ev.lotStatus.bg, padding: "3px 10px", borderRadius: 6 }}>{ev.lotStatus.label}</span>
                        {ev.progress > 0 && <span style={{ fontSize: 11, color: TX3 }}>{ev.progress}%</span>}
                      </div>
                    )}
                    {ev.urgent && (
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: RD }} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: RD }}>Urgent</span>
                      </div>
                    )}
                  </div>
                  {/* CTA */}
                  <button onClick={() => { setMobileDetail(null); onSelectProject(ev.project.id); }} style={{ width: "100%", padding: "12px 16px", border: "none", borderRadius: 10, background: AC, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    Ouvrir le projet <Ico name="arrowr" size={12} color="#fff" />
                  </button>
                </div>
              ); })()}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═══ DESKTOP PLANNING ═══
  return (
    <div style={{ animation: "fadeIn 0.2s ease" }}>
      {/* Unified top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: 6, display: "flex", alignItems: "center" }}><Ico name="back" color={TX2} size={16} /></button>
          <span style={{ fontSize: 18, fontWeight: 800, color: TX, letterSpacing: "-0.3px" }}>Planning</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ display: "flex", background: SB, borderRadius: 8, padding: 2, gap: 2 }}>
            {[{ id: "today", label: "Jour" }, { id: "week", label: "Semaine" }, { id: "month", label: "Mois" }].map(v => (
              <button key={v.id} onClick={() => { setViewMode(v.id); setWeekOffset(0); }} style={{ padding: "5px 10px", border: "none", borderRadius: 6, fontSize: 11, fontWeight: viewMode === v.id ? 700 : 500, cursor: "pointer", fontFamily: "inherit", background: viewMode === v.id ? WH : "transparent", color: viewMode === v.id ? TX : TX3, boxShadow: viewMode === v.id ? "0 1px 3px rgba(0,0,0,0.06)" : "none", transition: "all 0.12s" }}>{v.label}</button>
            ))}
          </div>
          <div style={{ width: 1, height: 20, background: SBB }} />
          <button onClick={() => setWeekOffset(o => o - 1)} style={{ width: 28, height: 28, border: `1px solid ${SBB}`, borderRadius: 6, background: WH, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Ico name="back" size={11} color={TX3} /></button>
          <span style={{ fontSize: 12, fontWeight: 600, color: TX, minWidth: 130, textAlign: "center" }}>{periodLabel}</span>
          <button onClick={() => setWeekOffset(o => o + 1)} style={{ width: 28, height: 28, border: `1px solid ${SBB}`, borderRadius: 6, background: WH, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Ico name="arrowr" size={11} color={TX3} /></button>
          {weekOffset !== 0 && <button onClick={() => setWeekOffset(0)} style={{ padding: "4px 10px", border: `1px solid ${SBB}`, borderRadius: 6, background: WH, cursor: "pointer", fontFamily: "inherit", fontSize: 10, fontWeight: 600, color: AC }}>Aujourd'hui</button>}
          <div style={{ width: 1, height: 20, background: SBB }} />
          <select value={filterProject} onChange={e => setFilterProject(e.target.value)} style={{ padding: "5px 10px", border: `1px solid ${SBB}`, borderRadius: 6, fontSize: 11, fontFamily: "inherit", background: WH, color: TX, cursor: "pointer" }}>
            <option value="all">Tous les projets</option>
            {active.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      {/* 3-column layout */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>

        {/* ─��� Left column: filters + summary ─�� */}
        <div style={{ width: 150, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Type filters with counts */}
          <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 10, padding: 8 }}>
            {[
              { id: "all", label: "Tous", color: TX, count: filtered.length },
              { id: "meeting", label: "Reunions", color: BL, count: events.filter(e => e.type === "meeting").length },
              { id: "action", label: "Actions", color: AC, count: events.filter(e => e.type === "action").length },
              { id: "lot", label: "Lots", color: GR, count: events.filter(e => e.type === "lot").length },
              { id: "alert", label: "Alertes", color: RD, count: events.filter(e => e.type === "alert").length },
            ].map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", border: "none", borderRadius: 6, background: filter === f.id ? f.color + "10" : "transparent", cursor: "pointer", fontFamily: "inherit", transition: "all 0.1s" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: f.color, flexShrink: 0, opacity: filter === f.id ? 1 : 0.4 }} />
                <span style={{ flex: 1, textAlign: "left", fontSize: 11, fontWeight: filter === f.id ? 600 : 400, color: filter === f.id ? f.color : TX2 }}>{f.label}</span>
                <span style={{ fontSize: 9, fontWeight: 600, color: filter === f.id ? f.color : TX3 }}>{f.count}</span>
              </button>
            ))}
          </div>
          {/* Summary */}
          <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 10, padding: 8 }}>
            <div style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: TX3, marginBottom: 6 }}>Synthese</div>
            {[
              { v: meetingsWeek, label: "reunion", color: BL },
              { v: actionsOpen, label: "action", color: AC },
              { v: lotsRisk, label: "lot a risque", color: lotsRisk > 0 ? RD : GR },
              ...(alerts > 0 ? [{ v: alerts, label: "alerte", color: RD }] : []),
            ].map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, padding: "2px 0" }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: s.color, minWidth: 14, textAlign: "right" }}>{s.v}</span>
                <span style={{ fontSize: 9, color: TX3 }}>{s.label}{s.v !== 1 ? "s" : ""}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Center: main planning view ── */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* ── TODAY VIEW ── */}
          {viewMode === "today" && (
            <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: TX, marginBottom: 10 }}>Aujourd'hui — {fmtDay(today)}</div>
              {todayEvents.length === 0 ? (
                <div style={{ padding: "20px 0", textAlign: "center", color: TX3, fontSize: 12 }}>Aucun événement aujourd'hui</div>
              ) : todayEvents.map((ev, i) => <EventCard key={i} ev={ev} />)}
            </div>
          )}

          {/* ── WEEK VIEW ── */}
          {viewMode === "week" && (
            <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 10, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: `2px solid ${SBB}` }}>
                {weekDays.map((day, di) => { const isT = isSameDay(day, today); const isWe = di >= 5; return (
                  <div key={di} style={{ padding: "10px 4px 8px", textAlign: "center", background: isT ? AC + "08" : isWe ? SB : "transparent", borderRight: di < 6 ? `1px solid ${SB2}` : "none" }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: isT ? AC : isWe ? TX3 : TX2, textTransform: "uppercase", letterSpacing: "0.04em" }}>{day.toLocaleDateString("fr-BE", { weekday: "short" })}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: isT ? AC : isWe ? TX3 : TX, lineHeight: 1.2, marginTop: 1 }}>
                      {isT ? <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "50%", background: AC, color: "#fff" }}>{day.getDate()}</span> : day.getDate()}
                    </div>
                  </div>
                ); })}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", minHeight: 380 }}>
                {weekDays.map((day, di) => { const dayEv = eventsForDay(day); const isT = isSameDay(day, today); const isWe = di >= 5; return (
                  <div key={di} style={{ padding: "6px 4px", borderRight: di < 6 ? `1px solid ${SB2}` : "none", background: isT ? AC + "04" : isWe ? SB + "80" : "transparent" }}>
                    {dayEv.length === 0 && <div style={{ fontSize: 9, color: SBB, textAlign: "center", paddingTop: 20 }}>—</div>}
                    {dayEv.map((ev, i) => <EventCard key={i} ev={ev} />)}
                  </div>
                ); })}
              </div>
            </div>
          )}

          {/* ── MONTH VIEW ── */}
          {viewMode === "month" && (() => {
            const firstDay = new Date(monthStart);
            const startPad = (firstDay.getDay() + 6) % 7;
            const totalDays = monthEnd.getDate();
            const cells = [];
            for (let i = 0; i < startPad; i++) cells.push(null);
            for (let i = 1; i <= totalDays; i++) cells.push(new Date(monthStart.getFullYear(), monthStart.getMonth(), i));
            return (
              <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 10, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: `1px solid ${SBB}` }}>
                  {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map(d => (
                    <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 600, color: TX3, padding: "8px 4px" }}>{d}</div>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
                  {cells.map((day, i) => {
                    if (!day) return <div key={i} style={{ borderRight: `1px solid ${SB2}`, borderBottom: `1px solid ${SB2}` }} />;
                    const dayEv = eventsForDay(day);
                    const isT = isSameDay(day, today);
                    return (
                      <div key={i} onClick={() => dayEv.length > 0 && setSelected(dayEv[0])} style={{ padding: "4px 3px", minHeight: 60, borderRight: `1px solid ${SB2}`, borderBottom: `1px solid ${SB2}`, cursor: dayEv.length > 0 ? "pointer" : "default", background: isT ? AC + "06" : "transparent" }}>
                        <div style={{ fontSize: 10, fontWeight: isT ? 700 : 400, color: isT ? AC : TX2, marginBottom: 2 }}>{day.getDate()}</div>
                        {dayEv.slice(0, 2).map((ev, j) => (
                          <div key={j} style={{ fontSize: 8, fontWeight: 600, color: ev.color, background: ev.bg, padding: "1px 4px", borderRadius: 3, marginBottom: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ev.title}</div>
                        ))}
                        {dayEv.length > 2 && <div style={{ fontSize: 7, color: TX3 }}>+{dayEv.length - 2}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>

        {/* ── Right column: detail panel ── */}
        <div style={{ width: 200, flexShrink: 0, position: "sticky", top: 72 }}>
          <div style={{ background: WH, border: `1px solid ${selected ? selected.color + "30" : SBB}`, borderRadius: 10, transition: "border-color 0.15s" }}>
          {!selected ? (
            <div style={{ padding: "28px 16px", textAlign: "center" }}>
              <Ico name="calendar" size={20} color={SBB} />
              <div style={{ fontSize: 11, color: TX3, marginTop: 8 }}>Cliquez sur un element</div>
            </div>
          ) : (() => { const ev = selected; return (
            <div style={{ padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: ev.color }}>{typeLabel[ev.type]}</span>
                <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}><Ico name="x" size={12} color={TX3} /></button>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: TX, marginBottom: 10, lineHeight: 1.3 }}>{ev.title}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11, marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}><Ico name="building" size={10} color={TX3} /><span style={{ color: TX2 }}>{ev.project.name}</span></div>
                {ev.date && <div style={{ display: "flex", alignItems: "center", gap: 5 }}><Ico name="calendar" size={10} color={TX3} /><span style={{ color: TX2 }}>{fmtShort(ev.date)}{ev.endDate && !isSameDay(ev.date, ev.endDate) ? ` → ${fmtShort(ev.endDate)}` : ""}</span></div>}
                {ev.who && <div style={{ display: "flex", alignItems: "center", gap: 5 }}><Ico name="users" size={10} color={TX3} /><span style={{ color: TX2 }}>{ev.who}</span></div>}
                {ev.contractor && <div style={{ display: "flex", alignItems: "center", gap: 5 }}><Ico name="users" size={10} color={TX3} /><span style={{ color: TX2 }}>{ev.contractor}</span></div>}
                {ev.since && <div style={{ display: "flex", alignItems: "center", gap: 5 }}><Ico name="file" size={10} color={TX3} /><span style={{ color: TX3 }}>{ev.since}</span></div>}
                {ev.lotStatus && <span style={{ alignSelf: "flex-start", fontSize: 9, fontWeight: 600, color: ev.lotStatus.color, background: ev.lotStatus.bg, padding: "2px 7px", borderRadius: 4 }}>{ev.lotStatus.label}{ev.progress > 0 ? ` · ${ev.progress}%` : ""}</span>}
                {ev.urgent && <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 5, height: 5, borderRadius: "50%", background: RD }} /><span style={{ fontSize: 10, fontWeight: 600, color: RD }}>Urgent</span></div>}
              </div>
              <button onClick={() => onSelectProject(ev.project.id)} style={{ width: "100%", padding: "8px 10px", border: "none", borderRadius: 7, background: AC, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>Ouvrir le projet <Ico name="arrowr" size={10} color="#fff" /></button>
            </div>
          ); })()}
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultView({ project, setProjects, onBack, onBackHome, profile, pvRecipients, pvTitle, pvFieldData }) {
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [sec, setSec] = useState(0);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [pdfErr, setPdfErr] = useState("");
  const [showSendModal, setShowSendModal] = useState(false);
  const [savedPvNum, setSavedPvNum] = useState(null);
  const timer = useRef(null);
  const ctrl = useRef(null);
  const pvNum = savedPvNum || project.pvHistory.length + 1;
  const t = useT();

  useEffect(() => { run(); return () => { clearInterval(timer.current); ctrl.current?.abort(); }; }, []);

  const run = async () => {
    setLoading(true);
    setErr("");
    setSec(0);
    timer.current = setInterval(() => setSec((s) => s + 1), 1000);
    ctrl.current = new AbortController();
    const allRemarks  = (p) => (p.remarks || []).length > 0 ? p.remarks : (p.notes?.trim() ? parseNotesToRemarks(p.notes) : []);
    const toRemarks   = (p) => {
      const all = allRemarks(p);
      if (!pvRecipients || pvRecipients.length === 0) return all;
      // keep remarks with no recipients (= common) OR assigned to any chosen recipient
      return all.filter((r) => !(r.recipients || []).length || pvRecipients.some(rec => (r.recipients || []).includes(rec)));
    };
    let globalRemarkIdx = 0;
    const numMode = project.remarkNumbering || "none";
    const notes = project.posts
      .filter((p) => toRemarks(p).length > 0 || (p.photos || []).length > 0 || (project.planMarkers || []).some((m) => m.postId === p.id))
      .map((p) => {
        const remarks = toRemarks(p);
        let postRemarkIdx = 0;
        const byStatus = (id) => remarks.filter((r) => r.status === id);
        const fmtLine  = (r) => {
          globalRemarkIdx++; postRemarkIdx++;
          const prefix = r.urgent ? "> " : "- ";
          const num = numMode === "sequential" ? `${postRemarkIdx}. ` : numMode === "post-seq" ? `${p.id}.${postRemarkIdx} ` : numMode === "global" ? `${globalRemarkIdx}. ` : "";
          return prefix + num + r.text;
        };
        const sections = [];
        if (byStatus("open").length)     sections.push(t("result.toProcess") + "\n" + byStatus("open").map(fmtLine).join("\n"));
        if (byStatus("progress").length) sections.push("En cours :\n" + byStatus("progress").map(fmtLine).join("\n"));
        if (byStatus("done").length)     sections.push(t("result.resolved") + "\n" + byStatus("done").map(fmtLine).join("\n"));
        const postMarkers = (project.planMarkers || []).filter((m) => m.postId === p.id);
        const extra = [
          (p.photos || []).length > 0 ? `[${p.photos.length} photo(s) jointe(s)]` : "",
          postMarkers.length > 0 ? `[Plan : marqueur${postMarkers.length > 1 ? "s" : ""} n°${postMarkers.map((m) => m.number).join(", ")}]` : "",
        ].filter(Boolean).join(" ");
        return `${p.id}. ${p.label}\n${sections.join("\n")}${extra ? "\n" + extra : ""}`;
      })
      .join("\n\n");
    const pvTpl = PV_TEMPLATES.find(t => t.id === project.pvTemplate);
    const SYS = pvTpl?.prompt || t("ai.systemPrompt");
    const recipientCtx = pvRecipients && pvRecipients.length > 0 ? "\n" + t("ai.recipientFilter", { recipients: pvRecipients.join(", ") }) : "";
    const userPrompt = `PROJET: ${project.name}\nCLIENT: ${project.client}\nENTREPRISE: ${project.contractor}\nADRESSE: ${formatAddress(project)}${(project.customFields || []).filter(cf => cf.label && cf.value).map(cf => `\n${cf.label.toUpperCase()}: ${cf.value}`).join("")}\nPV N${pvNum} — ${date}${pvFieldData?.visitStart ? `\nVISITE: ${pvFieldData.visitStart}${pvFieldData.visitEnd ? ` → ${pvFieldData.visitEnd}` : ""}` : ""}${pvFieldData?.attendance ? `\nPRÉSENTS: ${pvFieldData.attendance.filter(a => a.present).map(a => `${a.name} (${a.role})`).join(", ")}` : ""}${pvFieldData?.attendance?.some(a => !a.present) ? `\nABSENTS: ${pvFieldData.attendance.filter(a => !a.present).map(a => `${a.name} (${a.role})`).join(", ")}` : ""}${recipientCtx}\n\nNOTES:\n${notes}\n\nTransforme en PV.`;
    try {
      const { data, error } = await supabase.functions.invoke("generate-pv", {
        body: { systemPrompt: SYS, userPrompt, maxTokens: pvTpl?.id === "detailed" ? 3000 : 2000 },
      });
      if (error) throw new Error(error.message || "Erreur serveur");
      if (data?.error) throw new Error(data.error);
      const txt = data?.content;
      if (txt) setResult(txt); else throw new Error(t("result.emptyResponse"));
    } catch (e) { setErr(e.name === "AbortError" ? t("result.cancelled") : e.message); }
    finally { setLoading(false); clearInterval(timer.current); }
  };

  const date = new Date().toLocaleDateString("fr-BE");
  const parts = project.participants.map((p) => `  ${p.role.padEnd(14)} ${p.name}`).join("\n");
  const displayTitle = pvTitle || `PV n°${pvNum}`;
  const presentList = pvFieldData?.attendance ? pvFieldData.attendance.filter(a => a.present).map(p => `  ${p.role.padEnd(14)} ${p.name}`).join("\n") : parts;
  const absentList = pvFieldData?.attendance?.filter(a => !a.present) || [];
  const visitInfo = pvFieldData?.visitStart ? `\nVisite : ${pvFieldData.visitStart}${pvFieldData.visitEnd ? ` → ${pvFieldData.visitEnd}` : ""}` : "";
  const full = result ? `${displayTitle.toUpperCase()}\nde la REUNION du ${date}${visitInfo}\n\nMaitre d'ouvrage : ${project.client}\nChantier : ${project.name}\n${project.desc}\n\nPrésents :\n${presentList}${absentList.length > 0 ? `\n\nAbsents :\n${absentList.map(p => `  ${p.role.padEnd(14)} ${p.name}`).join("\n")}` : ""}\n\n${"=".repeat(50)}\n\n${result}\n\n${"=".repeat(50)}\nArchitecte, ${project.bureau}` : "";
  const filledCount = project.posts.filter((p) => {
    const remarks = (p.remarks || []).length > 0 ? p.remarks : (p.notes?.trim() ? parseNotesToRemarks(p.notes) : []);
    return remarks.length > 0 || (p.photos || []).length > 0 || (project.planMarkers || []).some((m) => m.postId === p.id);
  }).length;

  const savePV = () => {
    // Snapshot input notes (remarks per post)
    const inputNotes = project.posts.map(po => ({
      id: po.id, label: po.label,
      remarks: (po.remarks || []).map(r => ({ text: r.text, urgent: r.urgent, status: r.status })),
      notes: po.notes || "",
    })).filter(po => po.remarks.length > 0 || po.notes.trim());

    setSavedPvNum(pvNum);
    track("pv_generated", { pv_number: pvNum, project_name: project.name, _page: "result" });
    setProjects((prev) => prev.map((p) => p.id === project.id ? {
      ...p,
      pvHistory: [{ number: pvNum, date, author: profile.name || "Architecte", postsCount: filledCount, excerpt: result.slice(0, 100) + "...", content: result, inputNotes, status: "draft" }, ...p.pvHistory],
      // Carry forward open/progress remarks; remove done ones
      posts: p.posts.map((po) => ({
        ...po,
        notes: "",
        remarks: (po.remarks || [])
          .filter((r) => r.status !== "done")
          .map((r) => ({ ...r, carriedFrom: pvNum })),
      })),
    } : p));
    setSaved(true);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: "8px", minWidth: 40, minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 }}><Ico name="back" color={TX2} /></button>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: TX, letterSpacing: "-0.2px" }}>{pvTitle || `PV n°${pvNum}`}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 3, padding: "2px 7px", background: ACL, border: `1px solid ${ACL2}`, borderRadius: 5 }}>
              <span style={{ fontSize: 9, color: AC }}>✦</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: AC, letterSpacing: "0.04em" }}>IA</span>
            </div>
          </div>
          {pvRecipients && pvRecipients.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
              <Ico name="users" size={11} color={AC} />
              <span style={{ fontSize: 11, color: AC, fontWeight: 600 }}>Pour {pvRecipients.join(", ")}</span>
              <span style={{ fontSize: 11, color: TX3 }}>— version filtrée</span>
            </div>
          )}
        </div>
      </div>
      {loading && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "52px 20px 40px", textAlign: "center" }}>
          {/* Icône IA animée */}
          <div style={{ width: 52, height: 52, borderRadius: 14, background: ACL, border: `1px solid ${ACL2}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18, position: "relative" }}>
            <span style={{ fontSize: 22, color: AC }}>✦</span>
            <div style={{ position: "absolute", inset: -3, borderRadius: 17, border: `2px solid ${AC}`, opacity: 0.2, animation: "ring 1.8s ease infinite" }} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: TX, marginBottom: 4, letterSpacing: "-0.2px" }}>{t("result.generating")}</div>
          <div style={{ fontSize: FS.md, color: TX3, marginBottom: SP.lg }}>{t("result.generatingDesc")}</div>
          {/* Barre de progression estimée */}
          <div style={{ width: "100%", maxWidth: 300, height: 4, background: SB2, borderRadius: 2, marginBottom: SP.xl, overflow: "hidden" }}>
            <div style={{ height: "100%", background: AC, borderRadius: 2, transition: "width 1s ease-out", width: sec < 2 ? "15%" : sec < 4 ? "45%" : sec < 8 ? "70%" : sec < 15 ? "85%" : "92%" }} />
          </div>
          {/* Étapes progressives */}
          <div style={{ width: "100%", maxWidth: 300, textAlign: "left", marginBottom: 28 }}>
            {[
              { label: t("result.stepAnalysis"), delay: 0 },
              { label: t("result.stepDetection"), delay: 2 },
              { label: t("result.stepFormatting"), delay: 4 },
            ].map((step, i) => {
              const done = sec > step.delay;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: done ? AC : SB2, border: `1px solid ${done ? AC : SBB}`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.4s" }}>
                    {done ? <Ico name="check" size={10} color="#fff" /> : <div style={{ width: 5, height: 5, borderRadius: "50%", background: SBB }} />}
                  </div>
                  <span style={{ fontSize: 12, color: done ? TX2 : TX3, fontWeight: done ? 500 : 400, transition: "color 0.4s" }}>{step.label}</span>
                  {i === 2 && !done && <div style={{ width: 12, height: 12, border: `2px solid ${SBB}`, borderTopColor: AC, borderRadius: "50%", animation: "sp .7s linear infinite", flexShrink: 0 }} />}
                </div>
              );
            })}
          </div>
          <button onClick={() => ctrl.current?.abort()} style={{ padding: "7px 18px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, color: TX3, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>{t("cancel")}</button>
        </div>
      )}
      {err && (
        <div>
          <div style={{ padding: 14, background: REDBG, borderRadius: 10, color: RD, fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
            <strong>{t("result.error")}</strong> {err}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onBack} style={{ flex: 1, padding: "10px 20px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: TX2 }}>Retour</button>
            <button onClick={run} style={{ flex: 1, padding: "10px 20px", border: "none", borderRadius: 8, background: AC, cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: "#fff", fontWeight: 600 }}>{t("retry")}</button>
          </div>
        </div>
      )}
      {result && (() => {
        const lines = result.split("\n").filter(l => l.trim());
        const actionLines  = lines.filter(l => l.trim().startsWith("> ")).length;
        const pointLines   = lines.filter(l => l.trim().startsWith("- ")).length;
        const sectionCount = lines.filter(l => /^\d+\./.test(l.trim())).length;
        return (
        <div>
          {/* ── Bandeau IA ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: ACL, border: `1px solid ${ACL2}`, borderRadius: 10, marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", background: AC, borderRadius: 6, flexShrink: 0 }}>
                <span style={{ fontSize: 10, color: "#fff" }}>✦</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", letterSpacing: "0.02em" }}>IA</span>
              </div>
              <span style={{ fontSize: FS.base, color: TX2 }}>Rédigé par <strong>gpt-4o</strong> en {sec}s</span>
              <span style={{ fontSize: FS.sm, color: TX3 }}>· {result.trim().split(/\s+/).length} mots</span>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {sectionCount > 0 && <span style={{ fontSize: FS.sm, color: TX2 }}><strong>{sectionCount}</strong> poste{sectionCount > 1 ? "s" : ""}</span>}
              {actionLines > 0  && <span style={{ fontSize: 11, color: RD,  fontWeight: 600 }}><strong>{actionLines}</strong> point{actionLines > 1 ? "s" : ""} urgent{actionLines > 1 ? "s" : ""}</span>}
              {pointLines > 0   && <span style={{ fontSize: 11, color: TX2 }}><strong>{pointLines}</strong> décision{pointLines > 1 ? "s" : ""}</span>}
              {!saved && <span style={{ fontSize: 11, color: TX3, fontStyle: "italic" }}>Non sauvegardé</span>}
              {saved  && <span style={{ fontSize: 11, color: GR,  fontWeight: 600 }}>✓ Sauvegardé</span>}
            </div>
          </div>

          {/* ── Corps du PV ── */}
          <div style={{ position: "relative" }}>
            <textarea
              value={result}
              onChange={(e) => setResult(e.target.value)}
              style={{ width: "100%", padding: 16, border: `1px solid ${SBB}`, borderRadius: 10, background: WH, fontSize: 13, fontFamily: "monospace", lineHeight: 1.8, color: TX, boxSizing: "border-box", resize: "vertical", minHeight: 300, outline: "none" }}
            />
            <div style={{ position: "absolute", top: 10, right: 12, fontSize: 10, color: TX3, background: WH, padding: "2px 6px", borderRadius: 4, border: `1px solid ${SBB}`, pointerEvents: "none" }}>modifiable</div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button onClick={onBack} style={{ flex: 1, padding: 12, border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: TX2 }}>{t("result.editNotes")}</button>
            <button onClick={() => { navigator.clipboard.writeText(full); setCopied(true); setTimeout(() => setCopied(false), 2000); }} style={{ flex: 1, padding: 12, border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: TX2, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
              <Ico name="copy" size={14} color={TX3} />{copied ? t("copied") : t("copy")}
            </button>
            <button onClick={savePV} disabled={saved} style={{ flex: 1, padding: 12, border: "none", borderRadius: 8, background: saved ? GR : AC, cursor: saved ? "default" : "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
              <Ico name={saved ? "check" : "save"} size={14} color="#fff" />{saved ? t("result.saved") : t("result.saveValidate")}
            </button>
          </div>
          <button
            onClick={async () => {
              setPdfGenerating(true);
              setPdfErr("");
              try {
                await generatePDF(project, pvNum, date, result, profile);
              } catch (e) {
                setPdfErr("Erreur PDF : " + (e.message || "inconnue"));
              }
              setPdfGenerating(false);
            }}
            disabled={pdfGenerating}
            style={{ width: "100%", marginTop: 8, padding: 13, border: "none", borderRadius: 8, background: pdfGenerating ? SB2 : TX, color: pdfGenerating ? TX3 : "#fff", fontSize: 13, fontWeight: 600, cursor: pdfGenerating ? "default" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
          >
            {pdfGenerating
              ? <><div style={{ width: 14, height: 14, border: `2px solid ${TX3}`, borderTopColor: AC, borderRadius: "50%", animation: "sp .7s linear infinite" }} />Préparation du plan…</>
              : <><Ico name="file" size={15} color="#fff" />{(project.planMarkers || []).length > 0 ? t("result.downloadPDFPlan") : t("result.downloadPDF")}</>
            }
          </button>
          {pdfErr && <div style={{ marginTop: 6, padding: 10, background: REDBG, borderRadius: 8, color: RD, fontSize: 12 }}>{pdfErr}</div>}

          {/* Send by email button */}
          {saved && (
            <button
              onClick={() => setShowSendModal(true)}
              style={{ width: "100%", marginTop: 8, padding: 13, border: `1px solid ${AC}`, borderRadius: 8, background: WH, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit", color: AC, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
            >
              <Ico name="send" size={15} color={AC} />Envoyer par email
            </button>
          )}

          {saved && <button onClick={onBackHome} style={{ width: "100%", marginTop: 8, padding: 12, border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: TX2 }}>Retour au projet</button>}

          {/* Send PV Modal */}
          {showSendModal && (
            <SendPvModal
              project={project}
              pvNumber={pvNum}
              pvDate={date}
              pvContent={result}
              profile={profile}
              onClose={() => setShowSendModal(false)}
              onSent={(to) => {
                // Update PV status to "sent"
                setProjects(prev => prev.map(p => p.id === project.id ? {
                  ...p,
                  pvHistory: p.pvHistory.map(pv => String(pv.number) === String(pvNum) ? { ...pv, status: "sent" } : pv),
                } : p));
              }}
            />
          )}
          {project.posts.some((p) => (p.photos || []).length > 0) && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: TX, marginBottom: 12 }}>Photos jointes</div>
              {project.posts.filter((p) => (p.photos || []).length > 0).map((post) => (
                <div key={post.id} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: TX2, marginBottom: 8 }}>{post.id}. {post.label}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {(post.photos || []).map((ph) => (
                      <img key={ph.id} src={getPhotoUrl(ph)} alt="" style={{ width: 120, height: 90, objectFit: "cover", borderRadius: 8, border: `1px solid ${SBB}` }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        );
      })()}
    </div>
  );
}

function DocumentsView({ project, setProjects, onBack }) {
  const [activeCategory, setActiveCategory] = useState("all");
  const [viewDoc, setViewDoc] = useState(null);
  const [uploadCat, setUploadCat] = useState("plans");
  const [versionHistoryDoc, setVersionHistoryDoc] = useState(null);
  const [newVersionDocId, setNewVersionDocId] = useState(null);
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState(null);
  const [docMenuOpen, setDocMenuOpen] = useState(null);
  const uploadRef = useRef(null);
  const newVersionRef = useRef(null);
  const t = useT();

  const docs = project.documents || [];
  const filtered = activeCategory === "all" ? docs : docs.filter((d) => d.category === activeCategory);

  const addDocuments = (files, cat) => {
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setProjects((prev) => prev.map((p) => p.id === project.id ? {
          ...p,
          documents: [...(p.documents || []), {
            id: Date.now() + Math.random(),
            name: file.name,
            category: cat,
            versions: [{
              v: 1,
              dataUrl: ev.target.result,
              size: file.size,
              type: file.type.startsWith("image/") ? "image" : "pdf",
              addedAt: new Date().toLocaleDateString("fr-BE"),
            }],
          }],
        } : p));
      };
      reader.readAsDataURL(file);
    });
  };

  const addVersion = (docId, file) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      setProjects((prev) => prev.map((p) => {
        if (p.id !== project.id) return p;
        return {
          ...p,
          documents: (p.documents || []).map((d) => {
            if (d.id !== docId) return d;
            const existing = d.versions || [{ v: 1, dataUrl: d.dataUrl, size: d.size, type: d.type, addedAt: d.addedAt }];
            return {
              ...d,
              versions: [...existing, {
                v: existing.length + 1,
                dataUrl: ev.target.result,
                size: file.size,
                type: file.type.startsWith("image/") ? "image" : "pdf",
                addedAt: new Date().toLocaleDateString("fr-BE"),
              }],
            };
          }),
        };
      }));
    };
    reader.readAsDataURL(file);
  };

  const removeDoc = (id) => setProjects((prev) => prev.map((p) => p.id === project.id ? {
    ...p, documents: (p.documents || []).filter((d) => d.id !== id),
  } : p));

  const fmt = (b) => b < 1024 ? b + " o" : b < 1048576 ? Math.round(b / 1024) + " Ko" : (b / 1048576).toFixed(1) + " Mo";
  const catInfo = (id) => DOC_CATEGORIES.find((c) => c.id === id) || DOC_CATEGORIES[0];

  return (
    <div>
      {/* Desktop header with back button */}
      <div className="ap-docs-header" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: "8px", minWidth: 40, minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 }}><Ico name="back" color={TX2} /></button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: TX }}>{t("docs.title")}</div>
          <div style={{ fontSize: 12, color: TX3 }}>{project.name} · {docs.length} document{docs.length !== 1 ? "s" : ""}</div>
        </div>
      </div>

      {/* Zone d'upload — desktop only */}
      <div className="ap-docs-upload" style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 160px" }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: TX2, marginBottom: 6 }}>{t("docs.category")}</div>
            <select value={uploadCat} onChange={(e) => setUploadCat(e.target.value)} style={{ width: "100%", padding: "8px 10px", border: `1px solid ${SBB}`, borderRadius: 6, fontSize: 13, background: SB, color: TX, fontFamily: "inherit" }}>
              {DOC_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <button onClick={() => uploadRef.current.click()} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", border: "none", borderRadius: 8, background: AC, color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
            <Ico name="plus" size={14} color="#fff" />{t("docs.addFiles")}
          </button>
          <input ref={uploadRef} type="file" accept=".pdf,image/*" multiple style={{ display: "none" }} onChange={(e) => { addDocuments(e.target.files, uploadCat); e.target.value = ""; }} />
          <input ref={newVersionRef} type="file" accept=".pdf,image/*" style={{ display: "none" }} onChange={(e) => { if (e.target.files[0] && newVersionDocId) addVersion(newVersionDocId, e.target.files[0]); setNewVersionDocId(null); e.target.value = ""; }} />
        </div>
        <div style={{ fontSize: 11, color: TX3, marginTop: 8 }}>{t("docs.formats")}</div>
      </div>

      {/* Mobile title */}
      <div className="ap-docs-mobile-title" style={{ display: "none", alignItems: "center", justifyContent: "space-between", marginBottom: SP.md }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: TX }}>Documents</div>
          <div style={{ fontSize: FS.sm, color: TX3 }}>{docs.length} document{docs.length !== 1 ? "s" : ""}</div>
        </div>
      </div>

      {/* Onglets catégories — scrollable on mobile */}
      <div className="ap-docs-tabs" style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {[{ id: "all", label: t("all"), count: docs.length }, ...DOC_CATEGORIES.map((c) => ({ id: c.id, label: c.label, count: docs.filter((d) => d.category === c.id).length }))].map((tab) => (
          <button key={tab.id} onClick={() => setActiveCategory(tab.id)} style={{ padding: "5px 14px", border: `1px solid ${activeCategory === tab.id ? AC : SBB}`, borderRadius: 20, background: activeCategory === tab.id ? ACL : WH, color: activeCategory === tab.id ? AC : TX2, fontWeight: activeCategory === tab.id ? 600 : 400, fontSize: 12, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
            {tab.label} <span style={{ opacity: 0.65 }}>({tab.count})</span>
          </button>
        ))}
      </div>

      {/* Liste documents */}
      {filtered.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "50px 20px", border: `2px dashed ${SBB}`, borderRadius: 12, background: WH, textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: ACL, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Ico name="folder" size={26} color={AC} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: TX, marginTop: 14, marginBottom: 6 }}>{activeCategory !== "all" ? t("docs.noDocsCat") : t("docs.noDocs")}</div>
          <div style={{ fontSize: FS.md, color: TX3, marginBottom: SP.lg }}>{t("docs.addAbove")}</div>
          <button onClick={() => uploadRef.current.click()} style={{ padding: "9px 20px", border: "none", borderRadius: RAD.md, background: AC, color: "#fff", fontWeight: 600, fontSize: FS.md, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: SP.sm - 2 }}>
            <Ico name="plus" size={13} color="#fff" />Ajouter un document
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {filtered.map((doc) => {
            const cat = catInfo(doc.category);
            const cur = getDocCurrent(doc);
            return (
              <div key={doc.id} className="ap-doc-row" onClick={() => { if (window.innerWidth <= 768) setViewDoc({ name: doc.name, dataUrl: cur.dataUrl, type: cur.type }); }} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: WH, border: `1px solid ${SBB}`, borderRadius: 10, cursor: window.innerWidth <= 768 ? "pointer" : "default" }}>
                {cur.type === "image" ? (
                  <img src={cur.dataUrl} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8, flexShrink: 0, border: `1px solid ${SBB}` }} />
                ) : (
                  <div style={{ width: 44, height: 44, borderRadius: 8, background: REDBG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0, border: `1px solid ${REDBRD}`, gap: 1 }}>
                    <span style={{ fontSize: 8, fontWeight: 700, color: RD, letterSpacing: "0.06em" }}>PDF</span>
                    <Ico name="file" size={13} color={RD} />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{doc.name}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: cat.color, background: cat.bg, padding: "1px 7px", borderRadius: 10 }}>{cat.label}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: BL, background: BLB, padding: "1px 7px", borderRadius: 6 }}>v{cur.version}</span>
                    <span style={{ fontSize: 11, color: TX3 }}>{fmt(cur.size)}</span>
                    <span style={{ fontSize: 11, color: TX3 }}>{cur.addedAt}</span>
                  </div>
                </div>
                {/* Actions — inline desktop, menu mobile */}
                {(() => {
                  const [menuOpen, setMenuOpen] = [doc.id === docMenuOpen, (v) => setDocMenuOpen(v ? doc.id : null)];
                  return (
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    {/* Desktop actions — hidden on mobile */}
                    <div className="ap-doc-actions-desktop" style={{ display: "flex", alignItems: "center", gap: SP.xs }}>
                      <button onClick={() => setViewDoc({ name: doc.name, dataUrl: cur.dataUrl, type: cur.type })} style={{ background: SB, border: "none", borderRadius: RAD.sm, cursor: "pointer", padding: `${SP.sm - 2}px ${SP.sm + 2}px`, display: "flex", alignItems: "center", gap: 3 }}>
                        <Ico name="eye" size={13} color={TX3} /><span style={{ fontSize: FS.sm, color: TX2 }}>{t("view")}</span>
                      </button>
                      <button title={t("docs.newVersion")} onClick={() => { setNewVersionDocId(doc.id); setTimeout(() => newVersionRef.current?.click(), 50); }} style={{ background: ACL, border: `1px solid ${ACL2}`, borderRadius: RAD.sm, cursor: "pointer", padding: `${SP.sm - 2}px ${SP.sm}px`, display: "flex", alignItems: "center", gap: 2 }}>
                        <Ico name="download" size={13} color={AC} /><span style={{ fontSize: FS.sm, color: AC, fontWeight: 700 }}>v+</span>
                      </button>
                      {cur.version > 1 && (
                        <button title={t("docs.versionHistory")} onClick={() => setVersionHistoryDoc(doc)} style={{ background: SB, border: "none", borderRadius: RAD.sm, cursor: "pointer", padding: `${SP.sm - 2}px ${SP.sm}px`, display: "flex", alignItems: "center" }}>
                          <Ico name="history" size={14} color={TX3} />
                        </button>
                      )}
                      {confirmDeleteDoc === doc.id ? (
                        <div style={{ display: "flex", gap: SP.xs, alignItems: "center" }}>
                          <button onClick={() => { removeDoc(doc.id); setConfirmDeleteDoc(null); }} style={{ fontSize: FS.sm, fontWeight: 700, color: WH, background: RD, border: "none", borderRadius: RAD.sm, padding: "3px 8px", cursor: "pointer", fontFamily: "inherit" }}>Suppr.</button>
                          <button onClick={() => setConfirmDeleteDoc(null)} style={{ fontSize: FS.sm, color: TX2, background: SB, border: `1px solid ${SBB}`, borderRadius: RAD.sm, padding: "3px 8px", cursor: "pointer", fontFamily: "inherit" }}>Non</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDeleteDoc(doc.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: SP.sm - 2 }}>
                          <Ico name="trash" size={14} color={TX3} />
                        </button>
                      )}
                    </div>
                    {/* Mobile menu — hidden on desktop */}
                    <div className="ap-doc-actions-mobile" style={{ display: "none" }}>
                      <button onClick={() => setMenuOpen(!menuOpen)} style={{ background: SB, border: `1px solid ${SBB}`, borderRadius: RAD.sm, cursor: "pointer", padding: `${SP.sm - 2}px ${SP.sm}px`, display: "flex", alignItems: "center", justifyContent: "center", minWidth: 36, minHeight: 36 }}>
                        <span style={{ fontSize: 16, color: TX3, fontWeight: 700, lineHeight: 1 }}>⋯</span>
                      </button>
                      {menuOpen && (
                        <div style={{ position: "absolute", right: 0, top: "100%", marginTop: SP.xs, background: WH, border: `1px solid ${SBB}`, borderRadius: RAD.lg, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 50, minWidth: 160, overflow: "hidden", animation: "fadeIn 0.12s ease-out" }}>
                          <button onClick={() => { setViewDoc({ name: doc.name, dataUrl: cur.dataUrl, type: cur.type }); setMenuOpen(false); }} style={{ width: "100%", padding: `${SP.sm + 2}px ${SP.md}px`, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: SP.sm, fontFamily: "inherit", fontSize: FS.md, color: TX }}>
                            <Ico name="eye" size={14} color={TX3} />Voir
                          </button>
                          <button onClick={() => { setNewVersionDocId(doc.id); setTimeout(() => newVersionRef.current?.click(), 50); setMenuOpen(false); }} style={{ width: "100%", padding: `${SP.sm + 2}px ${SP.md}px`, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: SP.sm, fontFamily: "inherit", fontSize: FS.md, color: TX }}>
                            <Ico name="download" size={14} color={AC} />Nouvelle version
                          </button>
                          {cur.version > 1 && (
                            <button onClick={() => { setVersionHistoryDoc(doc); setMenuOpen(false); }} style={{ width: "100%", padding: `${SP.sm + 2}px ${SP.md}px`, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: SP.sm, fontFamily: "inherit", fontSize: FS.md, color: TX }}>
                              <Ico name="history" size={14} color={TX3} />Historique
                            </button>
                          )}
                          <div style={{ height: 1, background: SBB }} />
                          <button onClick={() => { confirmDeleteDoc === doc.id ? (removeDoc(doc.id), setConfirmDeleteDoc(null)) : setConfirmDeleteDoc(doc.id); setMenuOpen(false); }} style={{ width: "100%", padding: `${SP.sm + 2}px ${SP.md}px`, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: SP.sm, fontFamily: "inherit", fontSize: FS.md, color: RD }}>
                            <Ico name="trash" size={14} color={RD} />Supprimer
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}

      {/* Viewer modal */}
      <Modal open={!!viewDoc} onClose={() => setViewDoc(null)} title={viewDoc?.name || ""} wide>
        {viewDoc && (
          viewDoc.type === "image" ? (
            <img src={viewDoc.dataUrl} alt={viewDoc.name} style={{ width: "100%", borderRadius: 8, display: "block" }} />
          ) : (
            <div>
              <iframe src={viewDoc.dataUrl} title={viewDoc.name} style={{ width: "100%", height: "60vh", border: "none", borderRadius: 8 }} />
              <div style={{ marginTop: 12, display: "flex", justifyContent: "center" }}>
                <a href={viewDoc.dataUrl} download={viewDoc.name} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 18px", background: AC, color: "#fff", borderRadius: 8, fontWeight: 600, fontSize: 13, textDecoration: "none" }}>
                  <Ico name="download" size={14} color="#fff" />{t("download")}
                </a>
              </div>
            </div>
          )
        )}
      </Modal>

      {/* Version history modal */}
      <Modal open={!!versionHistoryDoc} onClose={() => setVersionHistoryDoc(null)} title={`Versions — ${versionHistoryDoc?.name || ""}`} wide>
        {versionHistoryDoc && (() => {
          const versions = versionHistoryDoc.versions
            ? [...versionHistoryDoc.versions].reverse()
            : [{ v: 1, dataUrl: versionHistoryDoc.dataUrl, size: versionHistoryDoc.size, type: versionHistoryDoc.type, addedAt: versionHistoryDoc.addedAt }];
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {versions.map((v, i) => (
                <div key={v.v} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: i === 0 ? ACL : SB, border: `1px solid ${i === 0 ? ACL2 : SBB}`, borderRadius: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: i === 0 ? AC : SBB, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: i === 0 ? "#fff" : TX2 }}>v{v.v}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: TX }}>{i === 0 ? "Version actuelle" : `Version ${v.v}`}</div>
                    <div style={{ fontSize: 11, color: TX3, marginTop: 2 }}>{v.addedAt} · {fmt(v.size)}</div>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => setViewDoc({ name: versionHistoryDoc.name, dataUrl: v.dataUrl, type: v.type })} style={{ background: SB, border: `1px solid ${SBB}`, borderRadius: 6, cursor: "pointer", padding: "6px 10px", display: "flex", alignItems: "center", gap: 3 }}>
                      <Ico name="eye" size={13} color={TX3} /><span style={{ fontSize: 11, color: TX2 }}>{t("view")}</span>
                    </button>
                    {i !== 0 && (
                      <button onClick={() => {
                        setProjects((prev) => prev.map((p) => {
                          if (p.id !== project.id) return p;
                          return {
                            ...p,
                            documents: (p.documents || []).map((d) => {
                              if (d.id !== versionHistoryDoc.id) return d;
                              const existing = d.versions || [];
                              return { ...d, versions: [...existing, { ...v, v: existing.length + 1, addedAt: new Date().toLocaleDateString("fr-BE") }] };
                            }),
                          };
                        }));
                        setVersionHistoryDoc(null);
                      }} style={{ background: SB, border: `1px solid ${SBB}`, borderRadius: 6, cursor: "pointer", padding: "6px 10px", display: "flex", alignItems: "center", gap: 3 }}>
                        <Ico name="repeat" size={13} color={TX3} /><span style={{ fontSize: 11, color: TX2 }}>Restaurer</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}

// ── Plan Manager (collapsible tree) ─────────────────────────
// ── Crop Tool (fullscreen overlay) ───────────────────────────
function CropTool({ imageSrc, fileName, onSave, onClose }) {
  const canvasRef = useRef(null);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [dragging, setDragging] = useState(null); // null | "move" | "nw" | "ne" | "sw" | "se"
  const dragStart = useRef({ mx: 0, my: 0, cx: 0, cy: 0, cw: 0, ch: 0 });
  const containerRef = useRef(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const el = containerRef.current;
      if (!el) return;
      const maxW = el.clientWidth - 40;
      const maxH = el.clientHeight - 120;
      const s = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
      setScale(s);
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
      // Default crop: 60% centered
      const cw = Math.round(img.naturalWidth * 0.6);
      const ch = Math.round(img.naturalHeight * 0.6);
      setCrop({ x: Math.round((img.naturalWidth - cw) / 2), y: Math.round((img.naturalHeight - ch) / 2), w: cw, h: ch });
    };
    img.src = imageSrc;
  }, [imageSrc]);

  const toCanvas = (px, py) => {
    const el = containerRef.current?.querySelector("img");
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return { x: Math.round((px - rect.left) / scale), y: Math.round((py - rect.top) / scale) };
  };

  const onMouseDown = (e, type) => {
    e.preventDefault(); e.stopPropagation();
    setDragging(type);
    dragStart.current = { mx: e.clientX, my: e.clientY, cx: crop.x, cy: crop.y, cw: crop.w, ch: crop.h };
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      const dx = Math.round((e.clientX - dragStart.current.mx) / scale);
      const dy = Math.round((e.clientY - dragStart.current.my) / scale);
      const { cx, cy, cw, ch } = dragStart.current;
      if (dragging === "move") {
        setCrop({ x: Math.max(0, Math.min(imgSize.w - cw, cx + dx)), y: Math.max(0, Math.min(imgSize.h - ch, cy + dy)), w: cw, h: ch });
      } else if (dragging === "se") {
        setCrop({ x: cx, y: cy, w: Math.max(20, Math.min(imgSize.w - cx, cw + dx)), h: Math.max(20, Math.min(imgSize.h - cy, ch + dy)) });
      } else if (dragging === "nw") {
        const nw = Math.max(20, cw - dx); const nh = Math.max(20, ch - dy);
        setCrop({ x: cx + cw - nw, y: cy + ch - nh, w: nw, h: nh });
      } else if (dragging === "ne") {
        const nw = Math.max(20, cw + dx); const nh = Math.max(20, ch - dy);
        setCrop({ x: cx, y: cy + ch - nh, w: Math.min(imgSize.w - cx, nw), h: nh });
      } else if (dragging === "sw") {
        const nw = Math.max(20, cw - dx); const nh = Math.max(20, ch + dy);
        setCrop({ x: cx + cw - nw, y: cy, w: nw, h: Math.min(imgSize.h - cy, nh) });
      }
    };
    const onUp = () => setDragging(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [dragging, imgSize, scale]);

  const doCrop = () => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = crop.w; canvas.height = crop.h;
      canvas.getContext("2d").drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
      onSave(canvas.toDataURL("image/png"), `crop-${fileName || "image"}.png`);
    };
    img.src = imageSrc;
  };

  const hs = 10; // handle size
  const Handle = ({ pos, cursor }) => {
    const positions = {
      nw: { left: crop.x * scale - hs / 2, top: crop.y * scale - hs / 2 },
      ne: { left: (crop.x + crop.w) * scale - hs / 2, top: crop.y * scale - hs / 2 },
      sw: { left: crop.x * scale - hs / 2, top: (crop.y + crop.h) * scale - hs / 2 },
      se: { left: (crop.x + crop.w) * scale - hs / 2, top: (crop.y + crop.h) * scale - hs / 2 },
    };
    return (
      <div onMouseDown={e => onMouseDown(e, pos)} style={{
        position: "absolute", ...positions[pos], width: hs, height: hs,
        background: WH, border: `2px solid ${AC}`, borderRadius: 2,
        cursor, zIndex: 3,
      }} />
    );
  };

  return (
    <div ref={containerRef} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 600, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", background: "rgba(0,0,0,0.5)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Ico name="edit" size={16} color="#fff" />
          <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Rogner — {fileName}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ padding: "8px 16px", border: `1px solid rgba(255,255,255,0.3)`, borderRadius: 8, background: "transparent", color: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Annuler</button>
          <button onClick={doCrop} style={{ padding: "8px 20px", border: "none", borderRadius: 8, background: AC, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Rogner et sauvegarder</button>
        </div>
      </div>
      {/* Canvas area */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: 20 }}>
        {imgSize.w > 0 && (
          <div style={{ position: "relative", userSelect: "none" }}>
            <img src={imageSrc} alt="" style={{ display: "block", width: imgSize.w * scale, height: imgSize.h * scale }} draggable={false} />
            {/* Dark overlay outside crop */}
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
              <svg width={imgSize.w * scale} height={imgSize.h * scale} style={{ position: "absolute", inset: 0 }}>
                <defs><mask id="cropMask">
                  <rect width="100%" height="100%" fill="white" />
                  <rect x={crop.x * scale} y={crop.y * scale} width={crop.w * scale} height={crop.h * scale} fill="black" />
                </mask></defs>
                <rect width="100%" height="100%" fill="rgba(0,0,0,0.55)" mask="url(#cropMask)" />
              </svg>
            </div>
            {/* Crop border */}
            <div onMouseDown={e => onMouseDown(e, "move")} style={{
              position: "absolute",
              left: crop.x * scale, top: crop.y * scale,
              width: crop.w * scale, height: crop.h * scale,
              border: `2px solid ${AC}`, cursor: "move", zIndex: 2,
              boxShadow: `0 0 0 1px rgba(255,255,255,0.3)`,
            }}>
              {/* Grid lines */}
              <div style={{ position: "absolute", left: "33.33%", top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.2)", pointerEvents: "none" }} />
              <div style={{ position: "absolute", left: "66.66%", top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.2)", pointerEvents: "none" }} />
              <div style={{ position: "absolute", top: "33.33%", left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.2)", pointerEvents: "none" }} />
              <div style={{ position: "absolute", top: "66.66%", left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.2)", pointerEvents: "none" }} />
            </div>
            {/* Resize handles */}
            <Handle pos="nw" cursor="nw-resize" />
            <Handle pos="ne" cursor="ne-resize" />
            <Handle pos="sw" cursor="sw-resize" />
            <Handle pos="se" cursor="se-resize" />
          </div>
        )}
      </div>
      {/* Info bar */}
      <div style={{ padding: "8px 20px", background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", gap: 16, fontSize: 11, color: "rgba(255,255,255,0.6)", flexShrink: 0 }}>
        <span>Zone : {crop.w} x {crop.h} px</span>
        <span>Position : {crop.x}, {crop.y}</span>
        <span>Original : {imgSize.w} x {imgSize.h} px</span>
      </div>
    </div>
  );
}

function GallerySheet({ photos, onClose, onAdd, onDelete }) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const toggleSelect = (id) => setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const exitSelect = () => { setSelecting(false); setSelected(new Set()); };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 250, display: "flex", flexDirection: "column", justifyContent: "flex-end" }} onClick={() => { if (!selecting) onClose(); }}>
      <div style={{ background: "rgba(0,0,0,0.3)", position: "absolute", inset: 0 }} />
      <div onClick={e => e.stopPropagation()} style={{ position: "relative", background: WH, borderRadius: "20px 20px 0 0", maxHeight: "85vh", display: "flex", flexDirection: "column", animation: "sheetUp 0.25s ease-out", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: SBB, margin: `${SP.md}px auto ${SP.sm}px` }} />

        {/* Header — switches between normal and selection mode */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: `0 ${SP.lg}px ${SP.sm}px`, gap: 8 }}>
          {selecting ? (
            <>
              <button onClick={exitSelect} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}>
                <Ico name="x" size={14} color={TX2} />
                <span style={{ fontSize: 13, fontWeight: 700, color: TX }}>{selected.size} sélectionnée{selected.size !== 1 ? "s" : ""}</span>
              </button>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={selected.size === photos.length ? () => setSelected(new Set()) : () => setSelected(new Set(photos.map(p => p.id)))} style={{ padding: "5px 10px", border: `1px solid ${SBB}`, borderRadius: 6, background: WH, cursor: "pointer", fontFamily: "inherit", fontSize: 10, fontWeight: 600, color: TX2 }}>
                  {selected.size === photos.length ? "Aucun" : "Tous"}
                </button>
                <button onClick={() => { onDelete(selected); exitSelect(); }} disabled={selected.size === 0} style={{ padding: "5px 10px", border: "none", borderRadius: 6, background: selected.size > 0 ? RD : DIS, cursor: selected.size > 0 ? "pointer" : "default", fontFamily: "inherit", fontSize: 10, fontWeight: 600, color: "#fff", display: "flex", alignItems: "center", gap: 4 }}>
                  <Ico name="trash" size={10} color="#fff" />Supprimer{selected.size > 0 ? ` (${selected.size})` : ""}
                </button>
              </div>
            </>
          ) : (
            <>
              <span style={{ fontSize: FS.lg + 1, fontWeight: 700, color: TX }}>Photos du chantier</span>
              <div style={{ display: "flex", gap: 6 }}>
                {photos.length > 0 && (
                  <button onClick={() => setSelecting(true)} style={{ padding: "5px 10px", border: `1px solid ${SBB}`, borderRadius: 6, background: WH, cursor: "pointer", fontFamily: "inherit", fontSize: 10, fontWeight: 600, color: TX2 }}>
                    Sélectionner
                  </button>
                )}
                <button onClick={onAdd} style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", border: "none", borderRadius: 6, background: AC, cursor: "pointer", fontFamily: "inherit" }}>
                  <Ico name="plus" size={11} color="#fff" />
                  <span style={{ fontSize: 10, fontWeight: 600, color: "#fff" }}>Ajouter</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Photo grid */}
        <div style={{ overflowY: "auto", padding: `0 ${SP.lg}px ${SP.lg}px` }}>
          {photos.length === 0 ? (
            <div style={{ padding: "40px 0", textAlign: "center" }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: SB, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                <Ico name="camera" size={22} color={TX3} />
              </div>
              <div style={{ fontSize: 13, color: TX3, marginBottom: 4 }}>Aucune photo</div>
              <div style={{ fontSize: 11, color: TX3 }}>Prenez des photos du chantier avec le bouton ci-dessus</div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 }}>
              {photos.map(ph => {
                const isSel = selected.has(ph.id);
                return (
                  <div key={ph.id} onClick={() => selecting ? toggleSelect(ph.id) : null} style={{ position: "relative", aspectRatio: "1", borderRadius: 8, overflow: "hidden", background: SB, cursor: selecting ? "pointer" : "default", border: `2px solid ${selecting && isSel ? AC : "transparent"}`, transition: "border-color 0.15s" }}>
                    <img src={getPhotoUrl(ph)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: selecting && isSel ? 0.7 : 1, transition: "opacity 0.15s" }} />
                    {selecting && (
                      <div style={{ position: "absolute", top: 4, left: 4, width: 20, height: 20, borderRadius: 5, background: isSel ? AC : "rgba(255,255,255,0.85)", border: `2px solid ${isSel ? AC : "rgba(0,0,0,0.2)"}`, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>
                        {isSel && <Ico name="check" size={10} color="#fff" />}
                      </div>
                    )}
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 6px 3px", background: "linear-gradient(transparent, rgba(0,0,0,0.4))" }}>
                      <span style={{ fontSize: 8, color: "#fff", fontWeight: 500 }}>{new Date(ph.date).toLocaleDateString("fr-BE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GalleryView({ project, setProjects, onBack }) {
  const uploadRef = useRef(null);
  const [lightbox, setLightbox] = useState(null); // photo id
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const photos = (project.gallery || []).slice().reverse();

  const toggleSelect = (id) => setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const selectAll = () => setSelected(new Set(photos.map(p => p.id)));
  const exitSelect = () => { setSelecting(false); setSelected(new Set()); };
  const deleteSelected = () => {
    selected.forEach(id => {
      const photo = photos.find(ph => ph.id === id);
      if (photo?.storagePath) deletePhoto(photo.storagePath);
    });
    setProjects(prev => prev.map(p => p.id === project.id ? { ...p, gallery: (p.gallery || []).filter(ph => !selected.has(ph.id)) } : p));
    exitSelect();
  };

  const addPhotos = (files) => {
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = ev.target.result;
        const photoId = Date.now() + Math.random();
        const photo = { id: photoId, dataUrl, date: new Date().toISOString() };
        setProjects(prev => prev.map(p => p.id === project.id ? { ...p, gallery: [...(p.gallery || []), photo] } : p));
        if (navigator.onLine) {
          const result = await uploadPhoto(dataUrl);
          if (result) {
            setProjects(prev => prev.map(p => p.id === project.id ? { ...p, gallery: (p.gallery || []).map(ph => ph.id === photoId ? { ...ph, url: result.url, storagePath: result.storagePath } : ph) } : p));
          }
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removePhoto = (photoId) => {
    const photo = photos.find(ph => ph.id === photoId);
    if (photo?.storagePath) deletePhoto(photo.storagePath);
    setProjects(prev => prev.map(p => p.id === project.id ? { ...p, gallery: (p.gallery || []).filter(ph => ph.id !== photoId) } : p));
    if (lightbox === photoId) setLightbox(null);
  };

  const lbPhoto = lightbox ? photos.find(ph => ph.id === lightbox) : null;
  const lbIdx = lightbox ? photos.findIndex(ph => ph.id === lightbox) : -1;

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", animation: "fadeIn 0.2s ease" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={selecting ? exitSelect : onBack} style={{ background: SB, border: `1px solid ${SBB}`, cursor: "pointer", padding: 7, minWidth: 36, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, flexShrink: 0 }}>
            <Ico name={selecting ? "x" : "back"} color={TX2} size={16} />
          </button>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: TX, letterSpacing: "-0.3px" }}>
              {selecting ? `${selected.size} sélectionnée${selected.size !== 1 ? "s" : ""}` : "Photos du chantier"}
            </div>
            {!selecting && <div style={{ fontSize: 12, color: TX3 }}>{photos.length} photo{photos.length !== 1 ? "s" : ""}</div>}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {selecting ? (
            <>
              <button onClick={selected.size === photos.length ? () => setSelected(new Set()) : selectAll} style={{ padding: "7px 14px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: TX2 }}>
                {selected.size === photos.length ? "Désélectionner" : "Tout sélectionner"}
              </button>
              <button onClick={deleteSelected} disabled={selected.size === 0} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", border: "none", borderRadius: 8, background: selected.size > 0 ? RD : DIS, cursor: selected.size > 0 ? "pointer" : "default", fontFamily: "inherit" }}>
                <Ico name="trash" size={13} color="#fff" />
                <span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>Supprimer{selected.size > 0 ? ` (${selected.size})` : ""}</span>
              </button>
            </>
          ) : (
            <>
              {photos.length > 0 && (
                <button onClick={() => setSelecting(true)} style={{ padding: "7px 14px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: TX2 }}>
                  Sélectionner
                </button>
              )}
              <button onClick={() => uploadRef.current?.click()} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", border: "none", borderRadius: 8, background: AC, cursor: "pointer", fontFamily: "inherit" }}>
                <Ico name="plus" size={14} color="#fff" />
                <span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>Ajouter</span>
              </button>
            </>
          )}
        </div>
        <input ref={uploadRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
      </div>

      {/* Gallery grid — 4 per row */}
      {photos.length === 0 ? (
        <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 12, padding: "60px 20px", textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: SB, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <Ico name="camera" size={26} color={TX3} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: TX, marginBottom: 4 }}>Aucune photo</div>
          <div style={{ fontSize: 13, color: TX3, marginBottom: 16 }}>Ajoutez des photos de votre chantier pour les retrouver ici</div>
          <button onClick={() => uploadRef.current?.click()} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 20px", border: "none", borderRadius: 8, background: AC, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: "#fff" }}>
            <Ico name="plus" size={14} color="#fff" />Ajouter des photos
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
          {photos.map(ph => {
            const isSel = selected.has(ph.id);
            return (
              <div key={ph.id} style={{ position: "relative", aspectRatio: "1", borderRadius: 10, overflow: "hidden", background: SB, cursor: "pointer", border: `2px solid ${selecting && isSel ? AC : SBB}`, transition: "border-color 0.15s" }} onClick={() => selecting ? toggleSelect(ph.id) : setLightbox(ph.id)}>
                <img src={getPhotoUrl(ph)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: selecting && isSel ? 0.7 : 1, transition: "opacity 0.15s" }} />
                {/* Selection checkbox */}
                {selecting && (
                  <div style={{ position: "absolute", top: 6, left: 6, width: 22, height: 22, borderRadius: 6, background: isSel ? AC : "rgba(255,255,255,0.85)", border: `2px solid ${isSel ? AC : "rgba(0,0,0,0.2)"}`, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>
                    {isSel && <Ico name="check" size={12} color="#fff" />}
                  </div>
                )}
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "16px 8px 6px", background: "linear-gradient(transparent, rgba(0,0,0,0.45))" }}>
                  <span style={{ fontSize: 10, color: "#fff", fontWeight: 500 }}>{new Date(ph.date).toLocaleDateString("fr-BE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox */}
      {lbPhoto && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.85)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }} onClick={() => setLightbox(null)}>
          {/* Top bar */}
          <div onClick={e => e.stopPropagation()} style={{ position: "absolute", top: 0, left: 0, right: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", zIndex: 2 }}>
            <span style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>{lbIdx + 1} / {photos.length} — {new Date(lbPhoto.date).toLocaleDateString("fr-BE", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { removePhoto(lbPhoto.id); }} style={{ padding: "6px 12px", border: "none", borderRadius: 6, background: "rgba(255,255,255,0.15)", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}>
                <Ico name="trash" size={13} color="#fff" />
                <span style={{ fontSize: 11, fontWeight: 600, color: "#fff" }}>Supprimer</span>
              </button>
              <button onClick={() => setLightbox(null)} style={{ width: 36, height: 36, border: "none", borderRadius: 8, background: "rgba(255,255,255,0.15)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Ico name="x" size={16} color="#fff" />
              </button>
            </div>
          </div>
          {/* Prev / Next */}
          {lbIdx > 0 && (
            <button onClick={e => { e.stopPropagation(); setLightbox(photos[lbIdx - 1].id); }} style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>
              <Ico name="back" size={18} color="#fff" />
            </button>
          )}
          {lbIdx < photos.length - 1 && (
            <button onClick={e => { e.stopPropagation(); setLightbox(photos[lbIdx + 1].id); }} style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>
              <Ico name="arrowr" size={18} color="#fff" />
            </button>
          )}
          {/* Image */}
          <img src={getPhotoUrl(lbPhoto)} alt="" onClick={e => e.stopPropagation()} style={{ maxWidth: "90vw", maxHeight: "80vh", objectFit: "contain", borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}

function PlanManager({ project, setProjects, onBack }) {
  const [activePlanId, setActivePlanId] = useState(null);
  const [newFolderParent, setNewFolderParent] = useState(null);
  const [croppingItem, setCroppingItem] = useState(null); // file id being cropped
  const [newFolderName, setNewFolderName] = useState("");
  const [expanded, setExpanded] = useState({});
  const [renaming, setRenaming] = useState(null);
  const [renameVal, setRenameVal] = useState("");
  const [movingItem, setMovingItem] = useState(null); // item id being moved
  const uploadRef = useRef(null);
  const [uploadTarget, setUploadTarget] = useState(null);
  const t = useT();

  const planFiles = project.planFiles || [];
  const updatePlanFiles = (fn) => setProjects(prev => prev.map(p => p.id === project.id ? { ...p, planFiles: fn(p.planFiles || []) } : p));

  const getChildren = (parentId) => planFiles.filter(f => f.parentId === (parentId || null));
  const getFolders = (parentId) => getChildren(parentId).filter(f => f.type === "folder");
  const getFiles = (parentId) => getChildren(parentId).filter(f => f.type !== "folder");

  const toggleExpand = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }));

  const createFolder = (parentId) => {
    if (!newFolderName.trim()) return;
    const newId = Date.now() + Math.random();
    updatePlanFiles(files => [...files, { id: newId, type: "folder", name: newFolderName.trim(), parentId: parentId || null, createdAt: new Date().toISOString() }]);
    setNewFolderName(""); setNewFolderParent(null);
    setExpanded(p => ({ ...p, [newId]: true }));
    if (parentId) setExpanded(p => ({ ...p, [parentId]: true }));
  };

  const handleUpload = (files, parentId) => {
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const ext = file.name.split(".").pop().toLowerCase();
        const imageExts = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "tiff", "tif"];
        const pdfExts = ["pdf"];
        const cadExts = ["dwg", "dxf", "skp", "rvt", "rfa", "ifc", "3dm", "step", "stp"];
        const docExts = ["doc", "docx", "odt", "rtf", "txt"];
        const sheetExts = ["xls", "xlsx", "csv", "ods"];
        const slideExts = ["ppt", "pptx", "odp"];
        const designExts = ["psd", "ai", "indd", "fig", "sketch"];
        let fileType = "other";
        if (imageExts.includes(ext)) fileType = "image";
        else if (pdfExts.includes(ext)) fileType = "pdf";
        else if (cadExts.includes(ext)) fileType = "cad";
        else if (docExts.includes(ext)) fileType = "doc";
        else if (sheetExts.includes(ext)) fileType = "sheet";
        else if (slideExts.includes(ext)) fileType = "slide";
        else if (designExts.includes(ext)) fileType = "design";
        updatePlanFiles(prev => [...prev, {
          id: Date.now() + Math.random(),
          type: fileType,
          name: file.name, parentId: parentId || null,
          dataUrl: ev.target.result, size: file.size,
          ext,
          createdAt: new Date().toISOString(),
        }]);
      };
      reader.readAsDataURL(file);
    });
    if (parentId) setExpanded(p => ({ ...p, [parentId]: true }));
  };

  const deleteItem = (itemId) => {
    const toDelete = new Set([itemId]);
    const findChildren = (pid) => { planFiles.filter(f => f.parentId === pid).forEach(f => { toDelete.add(f.id); if (f.type === "folder") findChildren(f.id); }); };
    findChildren(itemId);
    updatePlanFiles(files => files.filter(f => !toDelete.has(f.id)));
    if (activePlanId === itemId) setActivePlanId(null);
  };

  const renameItem = (itemId) => {
    if (!renameVal.trim()) { setRenaming(null); return; }
    updatePlanFiles(files => files.map(f => f.id === itemId ? { ...f, name: renameVal.trim() } : f));
    setRenaming(null);
  };

  // Move item to a different folder
  const moveItem = (itemId, newParentId) => {
    // Prevent moving folder into its own descendant
    if (newParentId) {
      let parent = newParentId;
      while (parent) { if (parent === itemId) return; const f = planFiles.find(x => x.id === parent); parent = f?.parentId; }
    }
    updatePlanFiles(files => files.map(f => f.id === itemId ? { ...f, parentId: newParentId || null } : f));
    if (newParentId) setExpanded(p => ({ ...p, [newParentId]: true }));
    setMovingItem(null);
  };

  // Build folder options for move picker (flat list with indent)
  const getFolderOptions = (excludeId) => {
    const options = [{ id: null, name: "/ Racine", depth: 0 }];
    const walk = (parentId, depth) => {
      getFolders(parentId).forEach(f => {
        if (f.id === excludeId) return;
        options.push({ id: f.id, name: f.name, depth });
        walk(f.id, depth + 1);
      });
    };
    walk(null, 1);
    return options;
  };

  // If viewing an image or PDF → PlanViewer with per-file markers/strokes
  const activePlan = planFiles.find(f => f.id === activePlanId);
  if (activePlan && (activePlan.type === "image" || activePlan.type === "pdf")) {
    const fileProject = {
      ...project,
      planImage: activePlan.dataUrl,
      planMarkers: activePlan.markers || project.planMarkers || [],
      planStrokes: activePlan.strokes || project.planStrokes || [],
    };
    // Proxy setProjects: intercept changes to planMarkers/planStrokes/planImage and store on the file
    const fileSetProjects = (fn) => {
      setProjects(prev => {
        // Let PlanViewer's updater run on a virtual projects array
        const virtualPrev = prev.map(p => p.id === project.id ? fileProject : p);
        const virtualNext = typeof fn === "function" ? fn(virtualPrev) : virtualPrev;
        const updated = virtualNext.find(p => p.id === project.id);
        if (!updated) return prev;
        // Write back markers/strokes to the planFile
        return prev.map(p => {
          if (p.id !== project.id) return p;
          return {
            ...p,
            planFiles: (p.planFiles || []).map(f => f.id === activePlanId ? {
              ...f,
              markers: updated.planMarkers || [],
              strokes: updated.planStrokes || [],
              dataUrl: updated.planImage || f.dataUrl,
            } : f),
          };
        });
      });
    };
    return <PlanViewer project={fileProject} setProjects={fileSetProjects} onBack={() => setActivePlanId(null)} />;
  }

  const hasLegacy = project.planImage && planFiles.length === 0;
  const fileCount = planFiles.filter(f => f.type !== "folder").length;
  const folderCount = planFiles.filter(f => f.type === "folder").length;

  // File type icons & colors
  const FILE_TYPE_STYLES = {
    image:  { label: "IMG", color: GR, bg: GRBG, icon: "camera" },
    pdf:    { label: "PDF", color: RD, bg: REDBG, icon: "file" },
    cad:    { label: "CAD", color: BL, bg: BLB, icon: "layers" },
    doc:    { label: "DOC", color: BL, bg: BLB, icon: "file" },
    sheet:  { label: "XLS", color: GR, bg: GRBG, icon: "chart" },
    slide:  { label: "PPT", color: AC, bg: ACL, icon: "layers" },
    design: { label: "DSN", color: PU, bg: PUB, icon: "edit" },
    other:  { label: "FILE", color: TX3, bg: SB2, icon: "file" },
  };

  const FileIcon = ({ type, ext, dataUrl }) => {
    const s = FILE_TYPE_STYLES[type] || FILE_TYPE_STYLES.other;
    if (type === "image" && dataUrl) {
      return <img src={dataUrl} alt="" style={{ width: 32, height: 32, borderRadius: 7, objectFit: "cover", border: `1px solid ${SBB}`, flexShrink: 0 }} />;
    }
    return (
      <div style={{ width: 32, height: 32, borderRadius: 7, background: s.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: `1px solid ${s.color}22`, flexShrink: 0 }}>
        <span style={{ fontSize: 7, fontWeight: 700, color: s.color, textTransform: "uppercase" }}>{ext || s.label}</span>
        <Ico name={s.icon} size={10} color={s.color} />
      </div>
    );
  };

  // Action buttons shared component — hidden on mobile
  const ItemActions = ({ item }) => (
    <div className="ap-plan-item-actions" style={{ display: "flex", gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
      {/* Annotate — only for images & PDFs */}
      {(item.type === "image" || item.type === "pdf") && (
        <button onClick={() => setActivePlanId(item.id)} title="Annoter le plan" style={{ height: 28, padding: "0 8px", borderRadius: 6, border: `1px solid ${AC}`, background: ACL, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
          <Ico name="layers" size={11} color={AC} />
          <span style={{ fontSize: 9, fontWeight: 700, color: AC }}>Annoter</span>
        </button>
      )}
      {/* Crop — images & PDFs */}
      {(item.type === "image" || item.type === "pdf") && (
        <button onClick={() => setCroppingItem(item.id)} title="Rogner" style={{ height: 28, padding: "0 8px", borderRadius: 6, border: `1px solid ${SBB}`, background: WH, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
          <Ico name="fit" size={11} color={TX2} />
          <span style={{ fontSize: 9, fontWeight: 600, color: TX2 }}>Rogner</span>
        </button>
      )}
      {/* Download */}
      {item.type !== "image" && item.type !== "folder" && item.dataUrl && (
        <a href={item.dataUrl} download={item.name} title="Télécharger" style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${SBB}`, background: WH, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>
          <Ico name="download" size={11} color={TX3} />
        </a>
      )}
      {/* Move */}
      <button onClick={() => setMovingItem(item.id)} title="Déplacer" style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Ico name="arrowr" size={10} color={TX3} />
      </button>
      {/* Rename */}
      <button onClick={() => { setRenaming(item.id); setRenameVal(item.name); }} title="Renommer" style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Ico name="textT" size={11} color={TX3} />
      </button>
      {/* Delete */}
      <button onClick={() => deleteItem(item.id)} title="Supprimer" style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Ico name="trash" size={10} color={TX3} />
      </button>
    </div>
  );

  // Recursive tree renderer
  const TreeNode = ({ parentId, depth = 0 }) => {
    const folders = getFolders(parentId);
    const files = getFiles(parentId);
    if (folders.length === 0 && files.length === 0) return null;

    return (
      <div style={{ marginLeft: depth > 0 ? 16 : 0, borderLeft: depth > 0 ? `1px solid ${SBB}` : "none", paddingLeft: depth > 0 ? 8 : 0 }}>
        {folders.map(folder => {
          const isOpen = expanded[folder.id];
          const childCount = getChildren(folder.id).length;
          return (
            <div key={folder.id}>
              <div className="plan-folder-row" onClick={() => toggleExpand(folder.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, cursor: "pointer", marginBottom: 2 }}>
                <Ico name={isOpen ? "chevron-up" : "chevron-down"} size={11} color={TX3} />
                <div style={{ width: 32, height: 32, borderRadius: 7, background: ACL, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Ico name="folder" size={16} color={AC} />
                </div>
                {renaming === folder.id ? (
                  <input value={renameVal} onChange={e => setRenameVal(e.target.value)} autoFocus
                    onKeyDown={e => { if (e.key === "Enter") renameItem(folder.id); if (e.key === "Escape") setRenaming(null); }}
                    onBlur={() => renameItem(folder.id)} onClick={e => e.stopPropagation()}
                    style={{ flex: 1, padding: "3px 8px", border: `1px solid ${AC}`, borderRadius: 5, fontSize: 12, fontFamily: "inherit", background: WH, color: TX }}
                  />
                ) : (
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: FS.md, fontWeight: 600, color: TX }}>{folder.name}</span>
                    <span style={{ fontSize: FS.sm, color: TX3, marginLeft: 6 }}>{childCount}</span>
                  </div>
                )}
                <div className="ap-plan-folder-actions" style={{ display: "flex", gap: 1, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => { setUploadTarget(folder.id); uploadRef.current?.click(); }} title="Importer ici" style={{ width: 26, height: 26, borderRadius: 5, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Ico name="plus" size={11} color={TX3} />
                  </button>
                  <button onClick={() => { setNewFolderParent(folder.id); setExpanded(p => ({ ...p, [folder.id]: true })); }} title="Sous-dossier" style={{ width: 26, height: 26, borderRadius: 5, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Ico name="folder" size={10} color={TX3} />
                  </button>
                  <button onClick={() => setMovingItem(folder.id)} title="Déplacer" style={{ width: 26, height: 26, borderRadius: 5, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Ico name="arrowr" size={10} color={TX3} />
                  </button>
                  <button onClick={() => { setRenaming(folder.id); setRenameVal(folder.name); }} title="Renommer" style={{ width: 26, height: 26, borderRadius: 5, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Ico name="textT" size={10} color={TX3} />
                  </button>
                  <button onClick={() => deleteItem(folder.id)} title="Supprimer" style={{ width: 26, height: 26, borderRadius: 5, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Ico name="trash" size={10} color={TX3} />
                  </button>
                </div>
              </div>
              {/* New subfolder inline */}
              {newFolderParent === folder.id && (/* ap-plan-new-folder — hidden on mobile */
                <div style={{ display: "flex", gap: 4, padding: "4px 10px 4px 52px", marginBottom: 4, animation: "fadeIn 0.12s ease-out" }}>
                  <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="Nom du sous-dossier..." autoFocus
                    onKeyDown={e => { if (e.key === "Enter") createFolder(folder.id); if (e.key === "Escape") setNewFolderParent(null); }}
                    style={{ flex: 1, padding: "5px 8px", border: `1px solid ${AC}`, borderRadius: 5, fontSize: 11, fontFamily: "inherit", background: WH, color: TX }}
                  />
                  <button onClick={() => createFolder(folder.id)} style={{ padding: "5px 10px", border: "none", borderRadius: 5, background: AC, color: "#fff", fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>OK</button>
                  <button onClick={() => setNewFolderParent(null)} style={{ padding: "5px 6px", border: `1px solid ${SBB}`, borderRadius: 5, background: WH, cursor: "pointer", display: "flex", alignItems: "center" }}>
                    <Ico name="x" size={9} color={TX3} />
                  </button>
                </div>
              )}
              {isOpen && <TreeNode parentId={folder.id} depth={depth + 1} />}
            </div>
          );
        })}
        {files.map(file => (
          <div key={file.id}
            onClick={() => { if (file.type === "image" || file.type === "pdf") setActivePlanId(file.id); }}
            className="plan-file-row"
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 8, cursor: file.type === "image" || file.type === "pdf" ? "pointer" : "default", marginBottom: 2 }}
          >
            <FileIcon type={file.type} ext={file.ext} dataUrl={file.dataUrl} />
            <div style={{ flex: 1, minWidth: 0 }}>
              {renaming === file.id ? (
                <input value={renameVal} onChange={e => setRenameVal(e.target.value)} autoFocus
                  onKeyDown={e => { if (e.key === "Enter") renameItem(file.id); if (e.key === "Escape") setRenaming(null); }}
                  onBlur={() => renameItem(file.id)} onClick={e => e.stopPropagation()}
                  style={{ width: "100%", padding: "3px 8px", border: `1px solid ${AC}`, borderRadius: 5, fontSize: 12, fontFamily: "inherit", background: WH, color: TX }}
                />
              ) : (
                <>
                  <div style={{ fontSize: 12, fontWeight: 500, color: TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{file.name}</div>
                  <div style={{ fontSize: 10, color: TX3 }}>{file.size ? `${(file.size / 1024).toFixed(0)} KB` : ""}{file.createdAt ? ` · ${new Date(file.createdAt).toLocaleDateString("fr-BE")}` : ""}</div>
                </>
              )}
            </div>
            <ItemActions item={file} />
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      {/* Header — desktop only */}
      <div className="ap-plan-header" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 8, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Ico name="back" color={TX2} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: TX }}>Documents</div>
          <div style={{ fontSize: 12, color: TX3 }}>{fileCount} fichier{fileCount !== 1 ? "s" : ""} · {folderCount} dossier{folderCount !== 1 ? "s" : ""}</div>
        </div>
      </div>

      {/* Actions bar — desktop only */}
      <div className="ap-plan-actions-bar" style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        <button onClick={() => { setUploadTarget(null); uploadRef.current?.click(); }} className="ap-touch-btn" style={{ display: "flex", alignItems: "center", gap: 5, padding: "9px 16px", border: "none", borderRadius: 8, background: AC, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          <Ico name="upload" size={13} color="#fff" />Importer
        </button>
        <button onClick={() => setNewFolderParent("root")} className="ap-touch-btn" style={{ display: "flex", alignItems: "center", gap: 5, padding: "9px 16px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, color: TX2, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
          <Ico name="folder" size={13} color={TX3} />Nouveau dossier
        </button>
        <input ref={uploadRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.dwg,.dxf,.skp,.rvt,.rfa,.ifc,.psd,.ai,.indd,.fig,.sketch,.3dm,.step,.stp,.odt,.ods,.odp,.rtf,.txt" multiple style={{ display: "none" }} onChange={(e) => { handleUpload(e.target.files, uploadTarget); e.target.value = ""; }} />
      </div>
      <div className="ap-plan-formats" style={{ fontSize: 10, color: TX3, marginBottom: 14, lineHeight: 1.6, padding: "0 2px" }}>
        Formats acceptés : <strong>Images</strong> (JPG, PNG, SVG, TIFF) · <strong>PDF</strong> · <strong>CAO</strong> (DWG, DXF, SketchUp, Revit, IFC) · <strong>Documents</strong> (Word, Excel, PowerPoint, CSV) · <strong>Design</strong> (PSD, AI, InDesign, Figma)
      </div>

      {/* New folder at root */}
      {newFolderParent === "root" && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14, animation: "fadeIn 0.12s ease-out" }}>
          <div style={{ width: 32, height: 32, borderRadius: 7, background: ACL, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Ico name="folder" size={14} color={AC} />
          </div>
          <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="Nom du dossier..." autoFocus
            onKeyDown={e => { if (e.key === "Enter") createFolder(null); if (e.key === "Escape") setNewFolderParent(null); }}
            style={{ flex: 1, padding: "7px 12px", border: `1px solid ${AC}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: WH, color: TX, boxShadow: `0 0 0 3px ${AC}1a` }}
          />
          <button onClick={() => createFolder(null)} style={{ padding: "7px 16px", border: "none", borderRadius: 8, background: AC, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Créer</button>
          <button onClick={() => setNewFolderParent(null)} style={{ padding: "7px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Ico name="x" size={12} color={TX3} />
          </button>
        </div>
      )}

      {/* Legacy migration */}
      {hasLegacy && (
        <div style={{ padding: "12px 16px", background: ACL, border: `1px solid ${ACL2}`, borderRadius: 10, marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
          <Ico name="alert" size={14} color={AC} />
          <div style={{ flex: 1, fontSize: 12, color: TX }}>Un plan existant a été détecté.</div>
          <button onClick={() => updatePlanFiles(files => [...files, { id: Date.now(), type: "image", name: "Plan principal", parentId: null, dataUrl: project.planImage, size: 0, createdAt: new Date().toISOString() }])} style={{ padding: "6px 14px", border: "none", borderRadius: 6, background: AC, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Migrer
          </button>
        </div>
      )}

      {/* Move picker modal */}
      {movingItem && (() => {
        const item = planFiles.find(f => f.id === movingItem);
        if (!item) return null;
        const options = getFolderOptions(movingItem);
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setMovingItem(null)}>
            <div onClick={e => e.stopPropagation()} style={{ background: WH, borderRadius: 14, width: "100%", maxWidth: 380, boxShadow: "0 20px 60px rgba(0,0,0,0.15)", animation: "modalIn 0.18s ease", overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: `1px solid ${SBB}` }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: TX }}>Déplacer "{item.name}"</div>
                <div style={{ fontSize: 11, color: TX3, marginTop: 2 }}>Choisissez le dossier de destination</div>
              </div>
              <div style={{ maxHeight: 300, overflowY: "auto", padding: "8px 10px" }}>
                {options.map(opt => {
                  const isCurrent = item.parentId === opt.id || (!item.parentId && !opt.id);
                  return (
                    <button key={opt.id || "__root__"} onClick={() => { if (!isCurrent) moveItem(movingItem, opt.id); }}
                      style={{
                        width: "100%", display: "flex", alignItems: "center", gap: 8,
                        padding: "9px 12px", paddingLeft: 12 + opt.depth * 16,
                        border: "none", borderRadius: 7, cursor: isCurrent ? "default" : "pointer",
                        background: isCurrent ? SB : "transparent",
                        fontFamily: "inherit", textAlign: "left", marginBottom: 2,
                        opacity: isCurrent ? 0.5 : 1,
                      }}
                    >
                      <Ico name="folder" size={12} color={isCurrent ? TX3 : AC} />
                      <span style={{ fontSize: 12, fontWeight: 500, color: isCurrent ? TX3 : TX }}>{opt.name}</span>
                      {isCurrent && <span style={{ fontSize: 10, color: TX3, marginLeft: "auto" }}>actuel</span>}
                    </button>
                  );
                })}
              </div>
              <div style={{ padding: "10px 18px", borderTop: `1px solid ${SBB}` }}>
                <button onClick={() => setMovingItem(null)} style={{ width: "100%", padding: 10, border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", fontSize: 12, fontFamily: "inherit", color: TX2 }}>Annuler</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* File tree */}
      <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 12, padding: "10px 8px", minHeight: 80 }}>
        {planFiles.length === 0 && !hasLegacy && (
          <div style={{ padding: "40px 16px", textAlign: "center" }}>
            <Ico name="upload" size={28} color={SBB} />
            <div style={{ fontSize: 13, fontWeight: 600, color: TX3, marginTop: 8 }}>Aucun plan importé</div>
            <div style={{ fontSize: 11, color: TX3, marginTop: 3 }}>Importez des images ou PDFs de vos plans</div>
          </div>
        )}
        <TreeNode parentId={null} depth={0} />
      </div>

      {/* Crop overlay */}
      {croppingItem && (() => {
        const file = planFiles.find(f => f.id === croppingItem);
        if (!file) return null;
        const isPdf = file.type === "pdf";
        if (isPdf) {
          // Render PDF to image first, then show crop tool
          return <PdfCropBridge file={file} onSave={(dataUrl, name) => {
            updatePlanFiles(prev => [...prev, {
              id: Date.now() + Math.random(), type: "image", name,
              parentId: file.parentId, dataUrl, size: 0, createdAt: new Date().toISOString(),
            }]);
            setCroppingItem(null);
          }} onClose={() => setCroppingItem(null)} />;
        }
        return <CropTool imageSrc={file.dataUrl} fileName={file.name} onSave={(dataUrl, name) => {
          updatePlanFiles(prev => [...prev, {
            id: Date.now() + Math.random(), type: "image", name,
            parentId: file.parentId, dataUrl, size: 0, createdAt: new Date().toISOString(),
          }]);
          setCroppingItem(null);
        }} onClose={() => setCroppingItem(null)} />;
      })()}
    </div>
  );
}

// Helper: render PDF page to image, then open CropTool
function PdfCropBridge({ file, onSave, onClose }) {
  const [imgSrc, setImgSrc] = useState(null);
  useEffect(() => {
    (async () => {
      try {
        const cacheKey = file.dataUrl.slice(0, 100);
        if (_pdfCache[cacheKey]) { setImgSrc(_pdfCache[cacheKey]); return; }
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).href;
        const data = atob(file.dataUrl.split(",")[1]);
        const arr = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) arr[i] = data.charCodeAt(i);
        const pdf = await pdfjsLib.getDocument({ data: arr }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width; canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
        const result = canvas.toDataURL("image/png");
        _pdfCache[cacheKey] = result;
        setImgSrc(result);
      } catch (e) { console.error("PDF crop render error:", e); onClose(); }
    })();
  }, [file.dataUrl]);

  if (!imgSrc) return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", color: "#fff" }}>
        <div style={{ width: 20, height: 20, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "sp .6s linear infinite", margin: "0 auto 12px" }} />
        <div style={{ fontSize: 13 }}>Rendu du PDF...</div>
      </div>
    </div>
  );

  return <CropTool imageSrc={imgSrc} fileName={file.name} onSave={onSave} onClose={onClose} />;
}

// PDF render cache — avoid re-rendering the same PDF
const _pdfCache = {};

function PlanViewer({ project, setProjects, onBack }) {
  const [pdfRendered, setPdfRendered] = useState(null);
  const isPdf = project.planImage?.startsWith("data:application/pdf");

  // Render PDF first page to image (local pdfjs-dist, cached)
  useEffect(() => {
    if (!isPdf || !project.planImage) return;
    // Check cache by dataUrl hash (first 100 chars as key)
    const cacheKey = project.planImage.slice(0, 100);
    if (_pdfCache[cacheKey]) { setPdfRendered(_pdfCache[cacheKey]); return; }
    (async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).href;
        const data = atob(project.planImage.split(",")[1]);
        const arr = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) arr[i] = data.charCodeAt(i);
        const pdf = await pdfjsLib.getDocument({ data: arr }).promise;
        const page = await pdf.getPage(1);
        const scale = 2;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
        const result = canvas.toDataURL("image/png");
        _pdfCache[cacheKey] = result;
        setPdfRendered(result);
      } catch (e) {
        console.error("PDF render error:", e);
      }
    })();
  }, [isPdf, project.planImage]);

  const planImageSrc = isPdf ? pdfRendered : project.planImage;

  const [mode,          setMode]          = useState("view"); // "view" | "marker" | "anno"
  const [pendingMarker, setPendingMarker] = useState(null);
  const [selectedPostId, setSelectedPostId] = useState("");
  const [annoTool,  setAnnoTool]  = useState("select");
  const [annoColor, setAnnoColor] = useState("#EF4444");
  const [drawing,   setDrawing]   = useState(false);
  const [startPt,   setStartPt]   = useState(null);
  const [currentPt, setCurrentPt] = useState(null);
  const [penPoints, setPenPoints] = useState([]);
  const [textPending, setTextPending] = useState(null);
  const [textValue,   setTextValue]   = useState("");
  // Selection & transform
  const [selectedId, setSelectedId] = useState(null);
  const selectedIdRef = useRef(null);
  const selDragRef    = useRef(null);
  const planStrokesRef = useRef([]);
  // Text style options
  const [textFontSize, setTextFontSize] = useState(18);
  const [textBold,     setTextBold]     = useState(false);
  const [textItalic,   setTextItalic]   = useState(false);
  const planRef     = useRef(null);
  const canvasRef   = useRef(null);
  const uploadRef   = useRef(null);
  const textInputRef = useRef(null);
  const planColorPickerRef = useRef(null);
  const canvasSizeRef = useRef({ w: 0, h: 0 }); // internal canvas resolution
  const [savedFlash, setSavedFlash] = useState(false);
  const savedTimerRef = useRef(null);
  const [vp,       setVp]       = useState({ zoom: 1, panX: 0, panY: 0 });
  const [imgBase,  setImgBase]  = useState({ w: 0, h: 0 });
  const [dragging, setDragging] = useState(false);
  const [spaceHeld,setSpaceHeld]= useState(false);
  const vpRef       = useRef({ zoom: 1, panX: 0, panY: 0 });
  const imgBaseRef  = useRef({ w: 0, h: 0 });
  const panningRef  = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const panOriginRef= useRef({ x: 0, y: 0 });
  const spaceHeldRef= useRef(false);
  const planAreaRef = useRef(null);

  const markers     = project.planMarkers || [];
  const planStrokes = project.planStrokes  || [];
  planStrokesRef.current = planStrokes;
  selectedIdRef.current  = selectedId;

  const uploadPlan = (file) => {
    const reader = new FileReader();
    reader.onload = (ev) => setProjects((prev) => prev.map((p) => p.id === project.id ? { ...p, planImage: ev.target.result } : p));
    reader.readAsDataURL(file);
  };

  // Size canvas + draw strokes whenever planImage changes
  useEffect(() => {
    if (!planImageSrc || !canvasRef.current) return;
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const maxW = 1200;
      const scale = img.naturalWidth > maxW ? maxW / img.naturalWidth : 1;
      const bw = Math.round(img.naturalWidth  * scale);
      const bh = Math.round(img.naturalHeight * scale);
      canvas.width  = bw;
      canvas.height = bh;
      canvasSizeRef.current = { w: bw, h: bh };
      imgBaseRef.current    = { w: bw, h: bh };
      setImgBase({ w: bw, h: bh });
      redrawCanvas(planStrokes);
      setTimeout(() => {
        const el = planAreaRef.current;
        if (!el || !bw) return;
        const aw = el.clientWidth, ah = el.clientHeight;
        if (!aw || !ah) return;
        const fz = Math.min(aw / bw, ah / bh) * 0.92;
        const next = { zoom: fz, panX: (aw - bw * fz) / 2, panY: Math.max(16, (ah - bh * fz) / 2) };
        vpRef.current = next; setVp(next);
      }, 60);
    };
    img.src = planImageSrc;
  }, [planImageSrc]);

  // Redraw when persisted strokes change
  useEffect(() => {
    if (canvasSizeRef.current.w) redrawCanvas(planStrokes);
  }, [planStrokes]);

  // ── Geometry helpers ────────────────────────────────────────
  const distToSegment = (px, py, x1, y1, x2, y2) => {
    const A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1;
    const dot = A * C + B * D, lenSq = C * C + D * D;
    const t = lenSq !== 0 ? Math.max(0, Math.min(1, dot / lenSq)) : 0;
    return Math.hypot(px - (x1 + t * C), py - (y1 + t * D));
  };

  const strokeBounds = (s, cw) => {
    if (s.type === "pen") {
      const xs = s.points.map(p => p.x), ys = s.points.map(p => p.y);
      return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
    }
    if (s.type === "text") {
      const fs = s.fontSize || Math.round(cw * 0.04);
      const tw = (s.text?.length || 0) * fs * 0.58;
      return { x1: s.x, y1: s.y, x2: s.x + tw, y2: s.y + fs };
    }
    return { x1: Math.min(s.x1, s.x2), y1: Math.min(s.y1, s.y2), x2: Math.max(s.x1, s.x2), y2: Math.max(s.y1, s.y2) };
  };

  const hitTestStroke = (s, px, py, cw) => {
    const M = 12;
    if (s.type === "text") { const b = strokeBounds(s, cw); return px >= b.x1 - M && px <= b.x2 + M && py >= b.y1 - M && py <= b.y2 + M; }
    if (s.type === "pen") { for (let i = 1; i < s.points.length; i++) { if (distToSegment(px, py, s.points[i-1].x, s.points[i-1].y, s.points[i].x, s.points[i].y) < M) return true; } return false; }
    if (s.type === "arrow") return distToSegment(px, py, s.x1, s.y1, s.x2, s.y2) < M;
    if (s.type === "rect") { const bx1 = Math.min(s.x1,s.x2), bx2 = Math.max(s.x1,s.x2), by1 = Math.min(s.y1,s.y2), by2 = Math.max(s.y1,s.y2); return (px>=bx1-M&&px<=bx2+M&&py>=by1-M&&py<=by2+M) && !(px>=bx1+M&&px<=bx2-M&&py>=by1+M&&py<=by2-M); }
    if (s.type === "circle") { const cx=(s.x1+s.x2)/2, cy=(s.y1+s.y2)/2, rx=Math.abs(s.x2-s.x1)/2||1, ry=Math.abs(s.y2-s.y1)/2||1; return Math.abs(Math.sqrt(((px-cx)/rx)**2+((py-cy)/ry)**2)-1) < M/Math.min(rx,ry); }
    return false;
  };

  const getHandles = (b) => {
    const mx = (b.x1 + b.x2) / 2, my = (b.y1 + b.y2) / 2;
    return [
      { name: "nw", x: b.x1, y: b.y1 }, { name: "n", x: mx, y: b.y1 }, { name: "ne", x: b.x2, y: b.y1 },
      { name: "e",  x: b.x2, y: my   },
      { name: "se", x: b.x2, y: b.y2 }, { name: "s", x: mx, y: b.y2 }, { name: "sw", x: b.x1, y: b.y2 },
      { name: "w",  x: b.x1, y: my   },
    ];
  };

  const hitHandle = (s, px, py, cw) => {
    const b = strokeBounds(s, cw);
    const handles = getHandles({ x1: b.x1 - 8, y1: b.y1 - 8, x2: b.x2 + 8, y2: b.y2 + 8 });
    for (const h of handles) { if (Math.abs(px - h.x) <= 9 && Math.abs(py - h.y) <= 9) return h.name; }
    return null;
  };

  const drawSelectionOverlay = (ctx, s, cw) => {
    const b = strokeBounds(s, cw);
    const PAD = 8, HS = 6;
    ctx.save();
    ctx.strokeStyle = "#3B82F6"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]);
    ctx.strokeRect(b.x1 - PAD, b.y1 - PAD, b.x2 - b.x1 + PAD * 2, b.y2 - b.y1 + PAD * 2);
    ctx.setLineDash([]);
    getHandles({ x1: b.x1 - PAD, y1: b.y1 - PAD, x2: b.x2 + PAD, y2: b.y2 + PAD }).forEach(h => {
      ctx.fillStyle = "#fff"; ctx.fillRect(h.x - HS / 2, h.y - HS / 2, HS, HS);
      ctx.strokeStyle = "#3B82F6"; ctx.lineWidth = 1.5; ctx.strokeRect(h.x - HS / 2, h.y - HS / 2, HS, HS);
    });
    ctx.restore();
  };

  const applyMove = (s, dx, dy) => {
    if (s.type === "pen") return { ...s, points: s.points.map(p => ({ x: p.x + dx, y: p.y + dy })) };
    if (s.type === "text") return { ...s, x: s.x + dx, y: s.y + dy };
    return { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy };
  };

  const applyResize = (s, handle, dx, dy) => {
    if (s.type === "pen") return applyMove(s, dx / 2, dy / 2);
    if (s.type === "text") return { ...s, fontSize: Math.max(8, (s.fontSize || 18) - dy * 0.4) };
    const n = { ...s };
    if (handle.includes("n")) n.y1 = s.y1 + dy;
    if (handle.includes("s")) n.y2 = s.y2 + dy;
    if (handle.includes("w")) n.x1 = s.x1 + dx;
    if (handle.includes("e")) n.x2 = s.x2 + dx;
    return n;
  };

  const updateStroke = (updated) => setProjects(prev => prev.map(p => p.id !== project.id ? p : {
    ...p, planStrokes: (p.planStrokes || []).map(s => s.id === updated.id ? updated : s)
  }));

  const toggleVisibility = (id) => setProjects(prev => prev.map(p => p.id !== project.id ? p : {
    ...p, planStrokes: (p.planStrokes || []).map(s => s.id === id ? { ...s, visible: s.visible === false } : s)
  }));

  const reorderStrokes = (fromIdx, toIdx) => setProjects(prev => prev.map(p => {
    if (p.id !== project.id) return p;
    const arr = [...(p.planStrokes || [])];
    const [item] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, item);
    return { ...p, planStrokes: arr };
  }));

  // ── Drawing helpers ─────────────────────────────────────────
  const redrawCanvas = (list, inProgress = null) => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.width) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    list.forEach((s) => { if (s.visible !== false) paintStroke(ctx, s, canvas.width); });
    if (inProgress) paintStroke(ctx, inProgress, canvas.width);
    // Selection overlay
    const selId = selectedIdRef.current;
    if (selId) {
      const sel = list.find(s => s.id === selId) || (inProgress?.id === selId ? inProgress : null);
      if (sel && sel.visible !== false) drawSelectionOverlay(ctx, sel, canvas.width);
    }
  };

  const paintArrow = (ctx, x1, y1, x2, y2) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const hl  = Math.max(16, len * 0.18);
    const ang = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - hl * Math.cos(ang - Math.PI / 6), y2 - hl * Math.sin(ang - Math.PI / 6));
    ctx.lineTo(x2 - hl * Math.cos(ang + Math.PI / 6), y2 - hl * Math.sin(ang + Math.PI / 6));
    ctx.closePath(); ctx.fill();
  };

  const paintStroke = (ctx, s, cw) => {
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color;
    ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (s.type === "arrow") {
      paintArrow(ctx, s.x1, s.y1, s.x2, s.y2);
    } else if (s.type === "rect") {
      ctx.strokeRect(s.x1, s.y1, s.x2 - s.x1, s.y2 - s.y1);
    } else if (s.type === "circle") {
      const rx = Math.abs(s.x2 - s.x1) / 2, ry = Math.abs(s.y2 - s.y1) / 2;
      ctx.beginPath();
      ctx.ellipse((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2, Math.max(rx, 1), Math.max(ry, 1), 0, 0, 2 * Math.PI);
      ctx.stroke();
    } else if (s.type === "pen") {
      if (s.points.length < 2) return;
      ctx.beginPath();
      s.points.forEach((pt, i) => { if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y); });
      ctx.stroke();
    } else if (s.type === "text") {
      const fs = s.fontSize || Math.round(cw * 0.04);
      const wt = s.bold   ? "bold"   : "normal";
      const st = s.italic ? "italic" : "normal";
      ctx.font = `${st} ${wt} ${fs}px system-ui, -apple-system, sans-serif`;
      ctx.fillText(s.text, s.x, s.y + fs);
    }
  };

  const getCanvasPt = (e) => {
    const canvas = canvasRef.current;
    const rect   = canvas.getBoundingClientRect();
    const sx = canvas.width  / rect.width;
    const sy = canvas.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * sx, y: (src.clientY - rect.top) * sy };
  };

  const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
  const commitStroke = (stroke) => {
    const s = { id: genId(), visible: true, ...stroke };
    setProjects((prev) => prev.map((p) => p.id === project.id ? { ...p, planStrokes: [...(p.planStrokes || []), s] } : p));
    return s.id;
  };

  const undoStroke = () => setProjects((prev) => prev.map((p) => p.id === project.id ? {
    ...p, planStrokes: (p.planStrokes || []).slice(0, -1)
  } : p));

  const clearStrokes = () => setProjects((prev) => prev.map((p) => p.id === project.id ? {
    ...p, planStrokes: []
  } : p));

  const deleteStroke = (idx) => setProjects((prev) => prev.map((p) => p.id === project.id ? {
    ...p, planStrokes: (p.planStrokes || []).filter((_, i) => i !== idx)
  } : p));

  const switchMode = (m) => { setMode(m); setPendingMarker(null); setTextPending(null); setTextValue(""); setSelectedId(null); selectedIdRef.current = null; selDragRef.current = null; redrawCanvas(planStrokesRef.current); };

  // ── Viewport helpers ─────────────────────────────────────────
  const setVpAndRef = (next) => { vpRef.current = next; setVp(next); };

  const fitToScreen = () => {
    const el = planAreaRef.current;
    const { w: iw, h: ih } = imgBaseRef.current;
    if (!el || !iw) return;
    const aw = el.clientWidth, ah = el.clientHeight;
    const fz = Math.min(aw / iw, ah / ih) * 0.92;
    setVpAndRef({ zoom: fz, panX: (aw - iw * fz) / 2, panY: Math.max(16, (ah - ih * fz) / 2) });
  };

  const zoomBy = (factor) => {
    const el = planAreaRef.current;
    if (!el) return;
    const cx = el.clientWidth / 2, cy = el.clientHeight / 2;
    const cur = vpRef.current;
    const nz  = Math.max(0.1, Math.min(10, cur.zoom * factor));
    setVpAndRef({ zoom: nz, panX: cx - (cx - cur.panX) * (nz / cur.zoom), panY: cy - (cy - cur.panY) * (nz / cur.zoom) });
  };

  const getCursor = () => {
    if (dragging) return "grabbing";
    if (spaceHeld || mode === "view") return "grab";
    if (mode === "marker") return "crosshair";
    if (mode === "anno") {
      if (annoTool === "select") return selDragRef.current ? "grabbing" : "default";
      return annoTool === "text" ? "text" : "crosshair";
    }
    return "default";
  };

  const onAreaDown = (e) => {
    if (e.button !== 0 || (!spaceHeldRef.current && mode !== "view")) return;
    e.preventDefault();
    panningRef.current   = true;
    panStartRef.current  = { x: e.clientX, y: e.clientY };
    panOriginRef.current = { x: vpRef.current.panX, y: vpRef.current.panY };
    setDragging(true);
  };
  const onAreaMove = (e) => {
    if (!panningRef.current) return;
    const nxt = { zoom: vpRef.current.zoom, panX: panOriginRef.current.x + e.clientX - panStartRef.current.x, panY: panOriginRef.current.y + e.clientY - panStartRef.current.y };
    vpRef.current = nxt; setVp(nxt);
  };
  const onAreaUp = () => { if (panningRef.current) { panningRef.current = false; setDragging(false); } };

  // ── Space bar → pan override in all modes ───────────────────
  useEffect(() => {
    const dn = (e) => { if (e.code === "Space" && !e.repeat) { e.preventDefault(); spaceHeldRef.current = true;  setSpaceHeld(true);  } };
    const up = (e) => { if (e.code === "Space")               { spaceHeldRef.current = false; setSpaceHeld(false); } };
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup",   up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, []);

  // ── Wheel zoom (non-passive) ─────────────────────────────────
  useEffect(() => {
    const el = planAreaRef.current;
    if (!el || !planImageSrc) return;
    const handler = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const cur = vpRef.current;
      const nz  = Math.max(0.1, Math.min(10, cur.zoom * factor));
      const nxt = { zoom: nz, panX: cx - (cx - cur.panX) * (nz / cur.zoom), panY: cy - (cy - cur.panY) * (nz / cur.zoom) };
      vpRef.current = nxt; setVp({ ...nxt });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [planImageSrc]);

  // ── Flash "Enregistré" à chaque modification ────────────────
  useEffect(() => {
    if (planStrokes.length === 0 && markers.length === 0) return;
    setSavedFlash(true);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSavedFlash(false), 2200);
  }, [planStrokes.length, markers.length]);

  // ── Sync sidebar controls when selecting an existing annotation ─
  useEffect(() => {
    if (annoTool === "select" && selectedId) {
      const sel = planStrokesRef.current.find(s => s.id === selectedId);
      if (sel) {
        setAnnoColor(sel.color);
        if (sel.type === "text") {
          if (sel.fontSize) setTextFontSize(sel.fontSize);
          setTextBold(!!sel.bold);
          setTextItalic(!!sel.italic);
        }
      }
    }
  }, [selectedId, annoTool]);

  // ── Canvas pointer events ───────────────────────────────────
  const onDown = (e) => {
    e.preventDefault();

    // ── Select / Transform tool ──────────────────────────────
    if (annoTool === "select") {
      const pt = getCanvasPt(e);
      const cw = canvasRef.current?.width || 1;
      const strokes = planStrokesRef.current;
      // Check resize handle on already-selected stroke
      if (selectedIdRef.current) {
        const sel = strokes.find(s => s.id === selectedIdRef.current);
        if (sel) {
          const handle = hitHandle(sel, pt.x, pt.y, cw);
          if (handle) {
            selDragRef.current = { action: "resize", handle, origStroke: { ...sel, points: sel.points ? [...sel.points] : undefined }, startPt: pt };
            return;
          }
        }
      }
      // Hit test strokes top-to-bottom
      for (let i = strokes.length - 1; i >= 0; i--) {
        if (strokes[i].visible === false) continue;
        if (hitTestStroke(strokes[i], pt.x, pt.y, cw)) {
          const hit = strokes[i];
          setSelectedId(hit.id); selectedIdRef.current = hit.id;
          if (hit.type === "text") { setTextFontSize(hit.fontSize || 18); setTextBold(!!hit.bold); setTextItalic(!!hit.italic); }
          setAnnoColor(hit.color);
          selDragRef.current = { action: "move", origStroke: { ...hit, points: hit.points ? [...hit.points] : undefined }, startPt: pt };
          redrawCanvas(strokes);
          return;
        }
      }
      // Clicked empty — deselect
      setSelectedId(null); selectedIdRef.current = null; selDragRef.current = null;
      redrawCanvas(strokes);
      return;
    }

    // ── Text tool ────────────────────────────────────────────
    if (annoTool === "text") {
      const canvas = canvasRef.current;
      const rect   = canvas.getBoundingClientRect();
      const src    = e.touches ? e.touches[0] : e;
      const pt     = getCanvasPt(e);
      const areaRect = planAreaRef.current.getBoundingClientRect();
      setTextPending({ x: pt.x, y: pt.y, screenX: src.clientX - areaRect.left, screenY: src.clientY - areaRect.top });
      setTextValue("");
      setTimeout(() => textInputRef.current?.focus(), 60);
      return;
    }

    // ── Draw tools ───────────────────────────────────────────
    const pt = getCanvasPt(e);
    setSelectedId(null); selectedIdRef.current = null;
    setDrawing(true); setStartPt(pt); setCurrentPt(pt);
    if (annoTool === "pen") setPenPoints([pt]);
  };

  const onMove = (e) => {
    e.preventDefault();

    if (annoTool === "select") {
      if (!selDragRef.current) return;
      const pt = getCanvasPt(e);
      const drag = selDragRef.current;
      const dx = pt.x - drag.startPt.x, dy = pt.y - drag.startPt.y;
      const updated = drag.action === "move" ? applyMove(drag.origStroke, dx, dy) : applyResize(drag.origStroke, drag.handle, dx, dy);
      drag.currentStroke = updated;
      redrawCanvas(planStrokesRef.current.map(s => s.id === updated.id ? updated : s));
      return;
    }

    if (!drawing) return;
    const pt = getCanvasPt(e);
    setCurrentPt(pt);
    if (annoTool === "pen") {
      setPenPoints((prev) => {
        const pts = [...prev, pt];
        redrawCanvas(planStrokesRef.current, { type: "pen", color: annoColor, points: pts });
        return pts;
      });
    } else {
      redrawCanvas(planStrokesRef.current, { type: annoTool, color: annoColor, x1: startPt.x, y1: startPt.y, x2: pt.x, y2: pt.y });
    }
  };

  const onUp = (e) => {
    e.preventDefault();

    if (annoTool === "select") {
      const drag = selDragRef.current;
      if (drag?.currentStroke) updateStroke(drag.currentStroke);
      selDragRef.current = null;
      return;
    }

    if (!drawing) return;
    setDrawing(false);
    let stroke;
    if (annoTool === "pen") {
      if (penPoints.length < 2) { setPenPoints([]); return; }
      stroke = { type: "pen", color: annoColor, points: penPoints };
      setPenPoints([]);
    } else {
      const pt = currentPt || startPt;
      if (!pt || (Math.abs(pt.x - startPt.x) < 3 && Math.abs(pt.y - startPt.y) < 3)) { redrawCanvas(planStrokesRef.current); return; }
      stroke = { type: annoTool, color: annoColor, x1: startPt.x, y1: startPt.y, x2: pt.x, y2: pt.y };
    }
    const id = commitStroke(stroke);
    setSelectedId(id); selectedIdRef.current = id;
  };

  const confirmText = () => {
    if (!textPending || !textValue.trim()) { setTextPending(null); setTextValue(""); return; }
    const id = commitStroke({ type: "text", color: annoColor, x: textPending.x, y: textPending.y, text: textValue.trim(), fontSize: textFontSize, bold: textBold, italic: textItalic });
    setSelectedId(id); selectedIdRef.current = id;
    setTextPending(null); setTextValue("");
  };

  // ── Marker helpers ──────────────────────────────────────────
  const handlePlanClick = (e) => {
    if (mode !== "marker" || pendingMarker || spaceHeldRef.current) return;
    const rect = planRef.current.getBoundingClientRect();
    const x = Math.max(1, Math.min(99, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(1, Math.min(99, ((e.clientY - rect.top) / rect.height) * 100));
    setPendingMarker({ x, y });
    setSelectedPostId(project.posts[0]?.id || "");
  };

  const confirmMarker = () => {
    if (!selectedPostId || !pendingMarker) return;
    setProjects((prev) => prev.map((p) => p.id === project.id ? {
      ...p, planMarkers: [...(p.planMarkers || []), {
        id: Date.now(), x: pendingMarker.x, y: pendingMarker.y,
        postId: selectedPostId, number: (p.planMarkers || []).length + 1,
      }]
    } : p));
    setPendingMarker(null); setSelectedPostId("");
  };

  const removeMarker = (markerId) => setProjects((prev) => prev.map((p) => p.id === project.id ? {
    ...p, planMarkers: (p.planMarkers || []).filter((m) => m.id !== markerId).map((m, i) => ({ ...m, number: i + 1 }))
  } : p));

  const pickPlanColor = () => {
    if (window.EyeDropper) {
      const dropper = new window.EyeDropper();
      dropper.open().then(result => {
        setAnnoColor(result.sRGBHex);
        if (annoTool === "select" && selectedId) {
          const sel = planStrokesRef.current.find(s => s.id === selectedId);
          if (sel) updateStroke({ ...sel, color: result.sRGBHex });
        }
      }).catch(() => {});
    } else {
      planColorPickerRef.current?.click();
    }
  };

  return (
    /* Escape le padding + maxWidth du conteneur parent */
    <div style={{ margin: "0 -20px -20px" }}>
      <input ref={uploadRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { if (e.target.files[0]) uploadPlan(e.target.files[0]); e.target.value = ""; }} />

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", background: WH, borderBottom: `1px solid ${SBB}` }}>
        {/* Back ghost */}
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 8, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, flexShrink: 0 }}>
          <Ico name="back" color={TX2} />
        </button>

        {/* Titre + statut */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: TX }}>Plan du chantier</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 1 }}>
            <span style={{ fontSize: 11, color: TX3 }}>{project.name}</span>
            {savedFlash ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 600, color: GR, background: GRBG, padding: "1px 7px 1px 5px", borderRadius: 10, flexShrink: 0 }}>
                <Ico name="check" size={10} color={GR} />Enregistré
              </span>
            ) : (markers.length + planStrokes.length > 0) ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 500, color: TX3, flexShrink: 0 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: GR, display: "inline-block", flexShrink: 0 }} />
                {markers.length + planStrokes.length} élément{markers.length + planStrokes.length !== 1 ? "s" : ""}
              </span>
            ) : (
              <span style={{ fontSize: 10, color: DIST }}>Aucune annotation</span>
            )}
          </div>
        </div>

        {/* Changer de plan (secondaire) */}
        {planImageSrc && (
          <button onClick={() => uploadRef.current.click()} style={{ padding: "7px 12px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", fontSize: 12, color: TX2, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
            <Ico name="upload" size={13} color={TX3} />Changer de plan
          </button>
        )}

        {/* Séparateur */}
        <div style={{ width: 1, height: 22, background: SBB, flexShrink: 0 }} />

        {/* Fermer (action principale de sortie) */}
        <button onClick={onBack} style={{ padding: "7px 18px", border: "none", borderRadius: 8, background: TX, color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          Fermer
        </button>
      </div>

      {isPdf && !pdfRendered ? (
        /* ── Loading PDF ── */
        <div style={{ margin: "0 20px 20px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 20px", background: WH, borderRadius: 14, border: `1px solid ${SBB}`, textAlign: "center" }}>
          <div style={{ width: 14, height: 14, border: `2px solid ${SBB}`, borderTopColor: AC, borderRadius: "50%", animation: "sp .7s linear infinite", marginBottom: 14 }} />
          <div style={{ fontSize: 13, color: TX3 }}>Rendu du PDF en cours...</div>
        </div>
      ) : !planImageSrc ? (
        /* ── Empty state ── */
        <div style={{ margin: "0 20px 20px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 20px", border: `2px dashed ${SBB}`, borderRadius: 14, background: WH, textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: ACL, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
            <Ico name="mappin" size={26} color={AC} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: TX, marginBottom: 6 }}>Aucun plan uploadé</div>
          <div style={{ fontSize: 13, color: TX3, marginBottom: 24, maxWidth: 300, lineHeight: 1.6 }}>Uploadez un fichier image (JPG, PNG) pour localiser vos remarques directement sur le plan.</div>
          <button onClick={() => uploadRef.current.click()} style={{ padding: "11px 28px", border: "none", borderRadius: 10, background: AC, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8 }}>
            <Ico name="upload" size={16} color="#fff" />Choisir un plan
          </button>
        </div>
      ) : (
        /* ── Workspace : sidebar gauche + plan ── */
        <div style={{ display: "flex", height: "calc(100vh - 130px)" }}>

          {/* ═══ Sidebar outils ═══ */}
          <div style={{ width: 210, flexShrink: 0, background: SB, borderRight: `1px solid ${SBB}`, display: "flex", flexDirection: "column", overflowY: "auto" }}>

            {/* ── Sélecteur de mode ── */}
            <div style={{ padding: "10px 10px 0", flexShrink: 0, borderBottom: `1px solid ${SBB}`, paddingBottom: 10 }}>
              <div style={{ display: "flex", background: SB2, borderRadius: 8, padding: 3 }}>
                {[
                  { id: "view",   label: "Vue",      icon: "eye"    },
                  { id: "marker", label: "Marqueur", icon: "mappin" },
                  { id: "anno",   label: "Dessin",   icon: "pen2"   },
                ].map((m) => (
                  <button key={m.id} onClick={() => switchMode(m.id)}
                    style={{ flex: 1, padding: `${SP.sm}px ${SP.xs}px`, border: "none", borderRadius: RAD.sm, background: mode === m.id ? WH : "transparent", color: mode === m.id ? TX : TX3, fontWeight: mode === m.id ? 700 : 400, fontSize: FS.xs, cursor: "pointer", fontFamily: "inherit", boxShadow: mode === m.id ? "0 1px 2px rgba(0,0,0,0.08)" : "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minHeight: 44 }}
                  >
                    <Ico name={m.icon} size={15} color={mode === m.id ? AC : TX3} />
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ────────────────────────────── */}
            {/* MODE VUE */}
            {/* ────────────────────────────── */}
            {mode === "view" && (
              <div style={{ padding: "12px 12px 14px", flex: 1 }}>
                {/* Résumé */}
                <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                  <div style={{ flex: 1, background: WH, border: `1px solid ${SBB}`, borderRadius: 8, padding: "8px 6px", textAlign: "center" }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: AC, lineHeight: 1 }}>{markers.length}</div>
                    <div style={{ fontSize: 9, color: TX3, marginTop: 3, fontWeight: 500 }}>marqueur{markers.length !== 1 ? "s" : ""}</div>
                  </div>
                  <div style={{ flex: 1, background: WH, border: `1px solid ${SBB}`, borderRadius: 8, padding: "8px 6px", textAlign: "center" }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: TX2, lineHeight: 1 }}>{planStrokes.length}</div>
                    <div style={{ fontSize: 9, color: TX3, marginTop: 3, fontWeight: 500 }}>annotation{planStrokes.length !== 1 ? "s" : ""}</div>
                  </div>
                </div>

                {/* Liste marqueurs */}
                {markers.length > 0 && (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: TX3, marginBottom: 8 }}>Marqueurs</div>
                    {markers.map((m) => {
                      const post = project.posts.find((p) => p.id === m.postId);
                      return (
                        <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 0", borderBottom: `1px solid ${SB2}` }}>
                          <div style={{ width: 24, height: 24, borderRadius: "50%", background: AC, color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{m.number}</div>
                          <span style={{ fontSize: 11, color: TX2, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{post ? `${post.id}. ${post.label}` : "—"}</span>
                          <button onClick={() => removeMarker(m.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0, opacity: 0.4 }}><Ico name="trash" size={11} color={TX3} /></button>
                        </div>
                      );
                    })}
                  </>
                )}

                {/* Liste annotations */}
                {planStrokes.length > 0 && (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: TX3, marginBottom: 8, marginTop: markers.length > 0 ? 14 : 0 }}>Annotations</div>
                    {planStrokes.map((s, idx) => {
                      const tool = ANNO_TOOLS.find((t) => t.id === s.type);
                      return (
                        <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 0", borderBottom: `1px solid ${SB2}` }}>
                          <div style={{ width: 7, height: 7, borderRadius: "50%", background: s.color, border: "1px solid rgba(0,0,0,0.08)", flexShrink: 0 }} />
                          <Ico name={tool?.icon || "pen2"} size={11} color={TX3} />
                          <span style={{ fontSize: 11, color: TX2, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {s.type === "text" ? `"${s.text}"` : tool?.label || s.type}
                          </span>
                          <button onClick={() => deleteStroke(idx)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0, opacity: 0.4 }}><Ico name="trash" size={11} color={TX3} /></button>
                        </div>
                      );
                    })}
                  </>
                )}

                {markers.length === 0 && planStrokes.length === 0 && (
                  <div style={{ padding: "14px 6px", textAlign: "center", color: TX3, fontSize: 11, lineHeight: 1.7 }}>Aucune annotation.<br />Utilisez les modes<br />Marqueur ou Dessin.</div>
                )}
              </div>
            )}

            {/* ────────────────────────────── */}
            {/* MODE MARQUEUR */}
            {/* ────────────────────────────── */}
            {mode === "marker" && (
              <div style={{ padding: "12px 12px 14px" }}>
                {!pendingMarker ? (
                  <div style={{ padding: "8px 10px", background: ACL, border: `1px solid ${ACL2}`, borderRadius: 7, fontSize: 11, color: AC, fontWeight: 500, display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
                    <Ico name="mappin" size={12} color={AC} />
                    Cliquez sur le plan pour placer un marqueur
                  </div>
                ) : (
                  <div style={{ padding: "10px 10px", background: ACL, border: `1px solid ${ACL2}`, borderRadius: 8, marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: AC, marginBottom: 6 }}>Lier au poste</div>
                    <select value={selectedPostId} onChange={(e) => setSelectedPostId(e.target.value)} style={{ width: "100%", padding: "6px 8px", border: `1px solid ${ACL2}`, borderRadius: 6, fontSize: 12, background: WH, color: TX, fontFamily: "inherit", marginBottom: 8 }}>
                      {project.posts.map((p) => <option key={p.id} value={p.id}>{p.id}. {p.label}</option>)}
                    </select>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={confirmMarker} style={{ flex: 1, padding: "6px 0", border: "none", borderRadius: 6, background: AC, color: "#fff", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Confirmer</button>
                      <button onClick={() => setPendingMarker(null)} style={{ padding: "6px 10px", border: `1px solid ${ACL2}`, borderRadius: 6, background: WH, color: TX2, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
                    </div>
                  </div>
                )}

                {markers.length > 0 && (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: TX3, marginBottom: 8 }}>Placés · {markers.length}</div>
                    {markers.map((m) => {
                      const post = project.posts.find((p) => p.id === m.postId);
                      return (
                        <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 0", borderBottom: `1px solid ${SB2}` }}>
                          <div style={{ width: 24, height: 24, borderRadius: "50%", background: AC, color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{m.number}</div>
                          <span style={{ fontSize: 11, color: TX2, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{post ? `${post.id}. ${post.label}` : "—"}</span>
                          <button onClick={() => removeMarker(m.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0 }}><Ico name="trash" size={11} color={TX3} /></button>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}

            {/* ────────────────────────────── */}
            {/* MODE DESSIN */}
            {/* ────────────────────────────── */}
            {mode === "anno" && (
              <div style={{ padding: "12px 12px 14px" }}>
                {/* Outils — grille 3 colonnes pour 6 outils */}
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: TX3, marginBottom: 8 }}>Outil</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 3, marginBottom: 14 }}>
                  {ANNO_TOOLS.map((t) => {
                    const active = annoTool === t.id;
                    return (
                      <button key={t.id} title={t.label}
                        onClick={() => { setAnnoTool(t.id); if (t.id !== "select") { setSelectedId(null); selectedIdRef.current = null; redrawCanvas(planStrokesRef.current); } }}
                        style={{ padding: `${SP.sm + 2}px ${SP.xs}px ${SP.sm}px`, border: `1.5px solid ${active ? AC : SBB}`, borderRadius: RAD.md, background: active ? ACL : WH, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: SP.xs, fontFamily: "inherit", boxShadow: active ? "none" : "0 1px 2px rgba(0,0,0,0.04)", minHeight: 44 }}
                      >
                        <Ico name={t.icon} size={16} color={active ? AC : TX2} />
                        <span style={{ fontSize: FS.xs, fontWeight: active ? 700 : 500, color: active ? AC : TX3, letterSpacing: "0.01em", lineHeight: 1 }}>{t.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Couleur (toujours visible, permet de changer couleur d'un objet sélectionné) */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: TX3 }}>Couleur</div>
                  <div style={{ width: 16, height: 16, borderRadius: 4, background: annoColor, border: "1px solid rgba(0,0,0,0.12)", flexShrink: 0 }} />
                </div>
                <div style={{ display: "flex", gap: 5, alignItems: "center", marginBottom: 14 }}>
                  {ANNO_COLORS.map((c) => (
                    <button key={c} title={c}
                      onClick={() => {
                        setAnnoColor(c);
                        if (annoTool === "select" && selectedId) {
                          const sel = planStrokesRef.current.find(s => s.id === selectedId);
                          if (sel) updateStroke({ ...sel, color: c });
                        }
                      }}
                      style={{ width: 22, height: 22, borderRadius: "50%", background: c, border: annoColor === c ? `2.5px solid ${AC}` : "1.5px solid rgba(0,0,0,0.12)", cursor: "pointer", boxShadow: annoColor === c ? `0 0 0 2px ${ACL}` : "none", outline: "none", flexShrink: 0 }}
                    />
                  ))}
                  <button onClick={pickPlanColor} title="Pipette" style={{ width: 22, height: 22, borderRadius: "50%", border: `1.5px solid ${SBB}`, background: WH, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0 }}>
                    <Ico name="pipette" size={12} color={TX2} />
                  </button>
                  <input ref={planColorPickerRef} type="color" value={annoColor}
                    onChange={e => {
                      const c = e.target.value;
                      setAnnoColor(c);
                      if (annoTool === "select" && selectedId) {
                        const sel = planStrokesRef.current.find(s => s.id === selectedId);
                        if (sel) updateStroke({ ...sel, color: c });
                      }
                    }}
                    style={{ width: 0, height: 0, padding: 0, border: "none", opacity: 0, position: "absolute", pointerEvents: "none" }}
                  />
                </div>

                {/* Propriétés texte — visible quand outil texte ou annotation texte sélectionnée */}
                {(annoTool === "text" || (annoTool === "select" && planStrokes.find(s => s.id === selectedId)?.type === "text")) && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: TX3, marginBottom: 7 }}>Taille · Style</div>
                    <div style={{ display: "flex", gap: 3, marginBottom: 6 }}>
                      {[12, 16, 22, 32, 48].map(sz => (
                        <button key={sz}
                          onClick={() => {
                            setTextFontSize(sz);
                            if (annoTool === "select" && selectedId) {
                              const sel = planStrokesRef.current.find(s => s.id === selectedId);
                              if (sel?.type === "text") updateStroke({ ...sel, fontSize: sz });
                            }
                          }}
                          style={{ flex: 1, padding: "4px 1px", border: `1.5px solid ${textFontSize === sz ? AC : SBB}`, borderRadius: 5, background: textFontSize === sz ? ACL : WH, cursor: "pointer", fontSize: Math.max(7, Math.min(11, sz * 0.42)), fontWeight: 600, color: textFontSize === sz ? AC : TX3, fontFamily: "inherit" }}
                        >{sz}</button>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        onClick={() => {
                          const next = !textBold;
                          setTextBold(next);
                          if (annoTool === "select" && selectedId) {
                            const sel = planStrokesRef.current.find(s => s.id === selectedId);
                            if (sel?.type === "text") updateStroke({ ...sel, bold: next });
                          }
                        }}
                        style={{ flex: 1, padding: "6px 0", border: `1.5px solid ${textBold ? AC : SBB}`, borderRadius: 6, background: textBold ? ACL : WH, cursor: "pointer", fontWeight: 800, fontSize: 13, color: textBold ? AC : TX2, fontFamily: "inherit" }}>B</button>
                      <button
                        onClick={() => {
                          const next = !textItalic;
                          setTextItalic(next);
                          if (annoTool === "select" && selectedId) {
                            const sel = planStrokesRef.current.find(s => s.id === selectedId);
                            if (sel?.type === "text") updateStroke({ ...sel, italic: next });
                          }
                        }}
                        style={{ flex: 1, padding: "6px 0", border: `1.5px solid ${textItalic ? AC : SBB}`, borderRadius: 6, background: textItalic ? ACL : WH, cursor: "pointer", fontStyle: "italic", fontWeight: 700, fontSize: 13, color: textItalic ? AC : TX2, fontFamily: "inherit" }}>I</button>
                    </div>
                  </div>
                )}

                {/* Calques — ordre Photoshop (haut = premier) avec drag-to-reorder */}
                <div style={{ height: 1, background: SBB, marginBottom: 10 }} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: planStrokes.length > 0 ? 6 : 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: TX3, display: "flex", alignItems: "center", gap: 5 }}>
                    <Ico name="layers" size={11} color={TX3} />Calques · {planStrokes.length}
                  </div>
                  {planStrokes.length > 0 && (
                    <div style={{ display: "flex", gap: 2 }}>
                      <button onClick={undoStroke} title="Annuler le dernier" style={{ background: "none", border: "none", cursor: "pointer", padding: "3px 5px", borderRadius: 5 }}><Ico name="undo" size={12} color={TX2} /></button>
                      <button onClick={clearStrokes} title="Tout effacer" style={{ background: "none", border: "none", cursor: "pointer", padding: "3px 5px", borderRadius: 5 }}><Ico name="trash" size={12} color={RD} /></button>
                    </div>
                  )}
                </div>
                {planStrokes.length === 0 && (
                  <div style={{ fontSize: 11, color: DIST, padding: "18px 6px 10px", textAlign: "center" }}>Aucun dessin pour l'instant.</div>
                )}
                {/* Affichage inversé : calque du dessus en premier (Photoshop) */}
                {[...planStrokes].reverse().map((s, revIdx) => {
                  const actualIdx = planStrokes.length - 1 - revIdx;
                  const tool = ANNO_TOOLS.find((t) => t.id === s.type);
                  const isSel = s.id === selectedId;
                  const isHidden = s.visible === false;
                  return (
                    <div key={s.id || actualIdx}
                      draggable
                      onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(actualIdx)); e.dataTransfer.effectAllowed = "move"; }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.preventDefault(); const from = parseInt(e.dataTransfer.getData("text/plain")); if (from !== actualIdx) reorderStrokes(from, actualIdx); }}
                      onClick={() => {
                        setAnnoTool("select");
                        setSelectedId(s.id); selectedIdRef.current = s.id;
                        if (s.type === "text") { setTextFontSize(s.fontSize || 18); setTextBold(!!s.bold); setTextItalic(!!s.italic); }
                        setAnnoColor(s.color);
                        redrawCanvas(planStrokesRef.current);
                      }}
                      style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 4px", borderRadius: 5, marginBottom: 1, background: isSel ? ACL : "transparent", border: `1px solid ${isSel ? ACL2 : "transparent"}`, cursor: "pointer", opacity: isHidden ? 0.4 : 1 }}
                    >
                      {/* Drag handle */}
                      <div style={{ cursor: "grab", color: DIST, fontSize: 10, lineHeight: 1, paddingRight: 1, flexShrink: 0 }}>⠿</div>
                      {/* Color dot */}
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: s.color, border: "1px solid rgba(0,0,0,0.1)", flexShrink: 0 }} />
                      {/* Icon + label */}
                      <Ico name={tool?.icon || "pen2"} size={10} color={isSel ? AC : TX3} />
                      <span style={{ fontSize: 10.5, color: isSel ? AC : TX2, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: isSel ? 600 : 400 }}>
                        {s.type === "text" ? `"${s.text}"` : tool?.label || s.type}
                      </span>
                      {/* Visibility toggle */}
                      <button onClick={(e) => { e.stopPropagation(); toggleVisibility(s.id); }} title={isHidden ? "Afficher" : "Masquer"}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0, opacity: isHidden ? 0.4 : 0.6 }}>
                        <Ico name={isHidden ? "eye-off" : "eye"} size={10} color={TX3} />
                      </button>
                      {/* Delete */}
                      <button onClick={(e) => { e.stopPropagation(); if (isSel) { setSelectedId(null); selectedIdRef.current = null; } deleteStroke(actualIdx); }}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0, opacity: 0.4 }}>
                        <Ico name="trash" size={10} color={TX3} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ═══ Zone plan ═══ */}
          <div
            ref={planAreaRef}
            style={{ flex: 1, position: "relative", overflow: "hidden", background: "#ECEAE6", cursor: getCursor() }}
            onMouseDown={onAreaDown}
            onMouseMove={onAreaMove}
            onMouseUp={onAreaUp}
            onMouseLeave={onAreaUp}
          >
            {/* Plan transformé (zoom + pan) */}
            <div
              ref={planRef}
              onClick={handlePlanClick}
              style={{ position: "absolute", top: 0, left: 0, transformOrigin: "0 0", transform: `translate(${vp.panX}px,${vp.panY}px) scale(${vp.zoom})`, boxShadow: "0 4px 24px rgba(0,0,0,0.15)", borderRadius: 6, overflow: "hidden", userSelect: "none" }}
            >
              {imgBase.w > 0 && (
                <img src={planImageSrc} alt="Plan" style={{ display: "block", width: imgBase.w, height: imgBase.h }} />
              )}

              {/* Canvas annotation overlay */}
              <canvas
                ref={canvasRef}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: (mode === "anno" && !textPending && !spaceHeld) ? "auto" : "none", cursor: annoTool === "select" ? "default" : annoTool === "text" ? "text" : "crosshair", touchAction: "none" }}
                onMouseDown={mode === "anno" ? onDown : undefined}
                onMouseMove={mode === "anno" ? onMove : undefined}
                onMouseUp={mode === "anno" ? onUp : undefined}
                onMouseLeave={mode === "anno" ? onUp : undefined}
                onTouchStart={mode === "anno" ? onDown : undefined}
                onTouchMove={mode === "anno" ? onMove : undefined}
                onTouchEnd={mode === "anno" ? onUp : undefined}
              />

              {/* Marqueurs (% sur le plan, scalent avec lui) */}
              {markers.map((m) => {
                const post = project.posts.find((p) => p.id === m.postId);
                return (
                  <div key={m.id} onClick={(e) => e.stopPropagation()} title={post ? `${post.id}. ${post.label}` : ""} style={{ position: "absolute", left: `${m.x}%`, top: `${m.y}%`, transform: "translate(-50%, -100%)", zIndex: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: AC, color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", border: "2.5px solid #fff", boxShadow: "0 2px 10px rgba(0,0,0,0.4)" }}>{m.number}</div>
                    <div style={{ width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: `7px solid ${AC}`, margin: "0 auto" }} />
                  </div>
                );
              })}

              {/* Marqueur en attente */}
              {pendingMarker && (
                <div style={{ position: "absolute", left: `${pendingMarker.x}%`, top: `${pendingMarker.y}%`, transform: "translate(-50%, -100%)", zIndex: 11, pointerEvents: "none" }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: TX3, color: "#fff", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", border: "2.5px solid #fff", boxShadow: "0 2px 10px rgba(0,0,0,0.25)" }}>?</div>
                  <div style={{ width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: `7px solid ${TX3}`, margin: "0 auto" }} />
                </div>
              )}
            </div>

            {/* Saisie texte (taille fixe, indépendante du zoom) */}
            {textPending && (
              <div
                style={{ position: "absolute", left: textPending.screenX, top: textPending.screenY, zIndex: 30, pointerEvents: "auto" }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <input
                  ref={textInputRef}
                  value={textValue}
                  onChange={(e) => {
                    const v = e.target.value;
                    setTextValue(v);
                    redrawCanvas(planStrokesRef.current, v ? { type: "text", color: annoColor, x: textPending.x, y: textPending.y, text: v, fontSize: textFontSize, bold: textBold, italic: textItalic } : null);
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") confirmText(); if (e.key === "Escape") { redrawCanvas(planStrokesRef.current); setTextPending(null); setTextValue(""); } }}
                  placeholder="Texte…"
                  style={{ border: `2px solid ${annoColor}`, borderRadius: 5, background: "rgba(255,255,255,0.93)", color: annoColor, fontSize: textFontSize * vp.zoom, fontWeight: textBold ? 700 : 400, fontStyle: textItalic ? "italic" : "normal", fontFamily: "system-ui,-apple-system,sans-serif", padding: "5px 10px", minWidth: 90, maxWidth: 280, outline: "none", boxShadow: "0 3px 16px rgba(0,0,0,0.22)", backdropFilter: "blur(4px)", display: "block" }}
                />
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.9)", background: "rgba(0,0,0,0.55)", padding: "2px 6px", borderRadius: "0 0 4px 4px", textAlign: "center", backdropFilter: "blur(3px)" }}>↵ Valider · Esc Annuler</div>
              </div>
            )}

            {/* Bannières mode actif (fixes dans planArea) */}
            {mode === "marker" && !pendingMarker && (
              <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", background: "rgba(217,123,13,0.92)", color: "#fff", fontSize: 11, fontWeight: 600, padding: "5px 14px 5px 10px", borderRadius: 20, pointerEvents: "none", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6, backdropFilter: "blur(4px)", zIndex: 20 }}>
                <Ico name="mappin" size={12} color="#fff" />Cliquez pour placer un marqueur
              </div>
            )}
            {mode === "anno" && !textPending && annoTool !== "select" && (
              <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", background: "rgba(29,29,27,0.78)", color: "#fff", fontSize: 11, fontWeight: 600, padding: "5px 14px 5px 10px", borderRadius: 20, pointerEvents: "none", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6, backdropFilter: "blur(4px)", zIndex: 20 }}>
                <Ico name={ANNO_TOOLS.find(t => t.id === annoTool)?.icon || "pen2"} size={12} color="#fff" />
                {ANNO_TOOLS.find(t => t.id === annoTool)?.label}
                {spaceHeld && <span style={{ opacity: 0.65, fontWeight: 400, marginLeft: 2 }}>· Navigation</span>}
              </div>
            )}
            {mode === "anno" && annoTool === "select" && !selectedId && !spaceHeld && (
              <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", background: "rgba(29,29,27,0.55)", color: "#fff", fontSize: 11, fontWeight: 500, padding: "4px 12px", borderRadius: 20, pointerEvents: "none", whiteSpace: "nowrap", backdropFilter: "blur(4px)", zIndex: 20 }}>
                Cliquez sur un élément pour le sélectionner
              </div>
            )}

            {/* Contrôles zoom */}
            <div style={{ position: "absolute", bottom: 16, right: 16, zIndex: 20, display: "flex", alignItems: "center", gap: 2, background: "rgba(255,255,255,0.94)", backdropFilter: "blur(8px)", border: `1px solid ${SBB}`, borderRadius: 22, padding: "4px 6px", boxShadow: "0 2px 12px rgba(0,0,0,0.10)" }}>
              <button onClick={() => zoomBy(1 / 1.4)} title="Zoom arrière" style={{ width: 27, height: 27, border: "none", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 17, fontWeight: 300, color: TX2, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1, fontFamily: "inherit" }}>−</button>
              <span style={{ fontSize: 11, fontWeight: 600, color: TX2, minWidth: 36, textAlign: "center", letterSpacing: "-0.02em" }}>{Math.round(vp.zoom * 100)}%</span>
              <button onClick={() => zoomBy(1.4)} title="Zoom avant" style={{ width: 27, height: 27, border: "none", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 17, fontWeight: 300, color: TX2, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1, fontFamily: "inherit" }}>+</button>
              <div style={{ width: 1, height: 16, background: SBB, margin: "0 2px" }} />
              <button onClick={fitToScreen} title="Ajuster à la fenêtre" style={{ width: 27, height: 27, border: "none", borderRadius: 6, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Ico name="fit" size={13} color={TX2} />
              </button>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

function PlanningView({ project, setProjects, onBack }) {
  const EMPTY_LOT = { name: "", contractor: "", startDate: "", endDate: "", duration: "", progress: 0, color: "amber", steps: [], postId: "" };
  const EMPTY_STEP = { name: "", startDate: "", endDate: "", duration: "", done: false };
  const [modal,     setModal]     = useState(null); // null | "add" | "edit"
  const [editLot,   setEditLot]   = useState(EMPTY_LOT);
  const [editingId, setEditingId] = useState(null);
  const [confirmDeleteLot, setConfirmDeleteLot] = useState(null);
  const importRef = useRef(null);
  const t = useT();

  // Auto-calc endDate from startDate + duration (days)
  const calcEndFromDuration = (start, days) => {
    if (!start || !days) return "";
    const d = new Date(start);
    d.setDate(d.getDate() + parseInt(days));
    return d.toISOString().slice(0, 10);
  };
  const calcDuration = (start, end) => {
    if (!start || !end) return "";
    const diff = Math.round((new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24));
    return diff > 0 ? String(diff) : "";
  };

  // Import CSV — step 1: parse, step 2: mapping UI
  const [importData, setImportData] = useState(null); // { headers: [], rows: [], mapping: {} }

  const handleImportFile = (file) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const lines = text.split("\n").filter(l => l.trim());
      if (lines.length < 2) return;
      const sep = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",";
      const headers = lines[0].split(sep).map(c => c.replace(/^"|"$/g, "").trim());
      const rows = lines.slice(1).map(line => line.split(sep).map(c => c.replace(/^"|"$/g, "").trim()));
      // Auto-detect mapping from header names
      const autoMap = {};
      const fields = [
        { key: "name", labels: ["lot", "nom", "name", "tâche", "tache", "task", "libellé", "libelle", "description"] },
        { key: "contractor", labels: ["responsable", "entreprise", "contractor", "société", "societe", "company", "attribué", "attribue"] },
        { key: "startDate", labels: ["début", "debut", "start", "date début", "date debut", "start date", "begin"] },
        { key: "endDate", labels: ["fin", "end", "date fin", "end date", "échéance", "echeance", "deadline"] },
        { key: "progress", labels: ["avancement", "progress", "%", "progression", "completion"] },
        { key: "duration", labels: ["durée", "duree", "duration", "jours", "days"] },
      ];
      headers.forEach((h, i) => {
        const lower = h.toLowerCase();
        for (const f of fields) {
          if (f.labels.some(l => lower.includes(l)) && !autoMap[f.key]) {
            autoMap[f.key] = i;
            break;
          }
        }
      });
      setImportData({ headers, rows, mapping: autoMap });
    };
    reader.readAsText(file);
  };

  const applyImport = () => {
    if (!importData) return;
    const { rows, mapping } = importData;
    const get = (row, key) => mapping[key] !== undefined ? (row[mapping[key]] || "") : "";
    const newLots = rows.map(row => {
      const name = get(row, "name");
      if (!name) return null;
      const startDate = get(row, "startDate");
      const endDate = get(row, "endDate");
      const dur = get(row, "duration");
      const finalEnd = endDate || (startDate && dur ? calcEndFromDuration(startDate, dur) : "");
      return {
        id: Date.now() + Math.random(), name,
        contractor: get(row, "contractor"),
        startDate, endDate: finalEnd,
        duration: calcDuration(startDate, finalEnd) || dur,
        progress: parseInt(get(row, "progress")) || 0,
        color: "amber", steps: [],
      };
    }).filter(Boolean);
    if (newLots.length > 0) {
      setProjects(prev => prev.map(p => p.id === project.id ? { ...p, lots: [...(p.lots || []), ...newLots] } : p));
    }
    setImportData(null);
  };

  const lots = project.lots || [];

  const saveLot = () => {
    if (!editLot.name.trim()) return;
    if (modal === "add") {
      setProjects((prev) => prev.map((p) => p.id === project.id ? {
        ...p, lots: [...(p.lots || []), { ...editLot, id: Date.now() }]
      } : p));
    } else {
      setProjects((prev) => prev.map((p) => p.id === project.id ? {
        ...p, lots: (p.lots || []).map((l) => l.id === editingId ? { ...editLot, id: editingId } : l)
      } : p));
    }
    setModal(null); setEditLot(EMPTY_LOT); setEditingId(null);
  };

  const deleteLot = (id) => setProjects((prev) => prev.map((p) => p.id === project.id ? {
    ...p, lots: (p.lots || []).filter((l) => l.id !== id)
  } : p));

  const setProgress = (id, val) => setProjects((prev) => prev.map((p) => p.id === project.id ? {
    ...p, lots: (p.lots || []).map((l) => l.id === id ? { ...l, progress: val } : l)
  } : p));

  // ── Gantt helpers ───────────────────────────────────────────
  const datedLots = lots.filter((l) => l.startDate && l.endDate);
  const toMs  = (d) => new Date(d).getTime();
  const minMs = datedLots.length ? Math.min(...datedLots.map((l) => toMs(l.startDate))) : null;
  const maxMs = datedLots.length ? Math.max(...datedLots.map((l) => toMs(l.endDate)))   : null;
  const spanMs = maxMs && minMs ? maxMs - minMs : 0;
  const pct = (ms) => spanMs > 0 ? Math.max(0, Math.min(100, ((ms - minMs) / spanMs) * 100)) : 0;
  const todayMs = (() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); })();
  const todayPct = spanMs > 0 && todayMs >= minMs && todayMs <= maxMs ? pct(todayMs) : null;

  const fmtDate = (d) => { if (!d) return "—"; const dt = new Date(d); return dt.toLocaleDateString("fr-BE", { day: "numeric", month: "short" }); };
  const overallProgress = lots.length ? Math.round(lots.reduce((s, l) => s + (l.progress || 0), 0) / lots.length) : 0;

  const getLotColor = (lot) => LOT_COLORS.find((c) => c.id === (lot.color || "amber")) || LOT_COLORS[0];

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: "8px", minWidth: 40, minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 }}><Ico name="back" color={TX2} /></button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: TX }}>{t("planning.title")}</div>
          <div style={{ fontSize: 12, color: TX3 }}>{project.name}{lots.length > 0 ? ` · ${lots.length} lot${lots.length > 1 ? "s" : ""} · ${overallProgress}% avancement` : ""}</div>
        </div>
        <button onClick={() => importRef.current?.click()} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, color: TX2, fontWeight: 500, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
          <Ico name="upload" size={13} color={TX3} />Importer CSV
        </button>
        <button onClick={() => { setEditLot(EMPTY_LOT); setEditingId(null); setModal("add"); }} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", border: "none", borderRadius: 8, background: AC, color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
          <Ico name="plus" size={14} color="#fff" />{t("planning.lot")}
        </button>
        <input ref={importRef} type="file" accept=".csv,.xlsx,.xls,.tsv" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) handleImportFile(e.target.files[0]); e.target.value = ""; }} />
      </div>
      <div style={{ fontSize: 10, color: TX3, marginBottom: 12, padding: "0 2px" }}>
        Format CSV pour import : <strong>Lot ; Responsable ; Début (YYYY-MM-DD) ; Fin (YYYY-MM-DD) ; Avancement (%)</strong>
      </div>

      {lots.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 20px", border: `2px dashed ${SBB}`, borderRadius: 14, background: WH, textAlign: "center" }}>
          <Ico name="gantt" size={40} color={TX3} />
          <div style={{ fontSize: 15, fontWeight: 600, color: TX, marginTop: 16, marginBottom: 6 }}>{t("planning.noLots")}</div>
          <div style={{ fontSize: 13, color: TX3, marginBottom: 20, maxWidth: 320 }}>{t("planning.noLotsDesc")}</div>
          <button onClick={() => { setEditLot(EMPTY_LOT); setEditingId(null); setModal("add"); }} style={{ padding: "10px 24px", border: "none", borderRadius: 10, background: AC, color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>{t("planning.addLot")}</button>
        </div>
      ) : (
        <div>
          {/* Overall progress */}
          <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 12, padding: "12px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: TX }}>{t("planning.globalProgress")}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: TX }}>{overallProgress}%</span>
              </div>
              <PB value={overallProgress} />
            </div>
            <div style={{ display: "flex", gap: 10, fontSize: 11, color: TX3, flexShrink: 0 }}>
              <span style={{ color: GR, fontWeight: 600 }}>{lots.filter((l) => calcLotStatus(l).id === "done").length} terminé{lots.filter((l) => calcLotStatus(l).id === "done").length > 1 ? "s" : ""}</span>
              <span style={{ color: RD, fontWeight: 600 }}>{lots.filter((l) => calcLotStatus(l).id === "delayed").length} {t("planning.late")}</span>
            </div>
          </div>

          {/* Gantt timeline */}
          {datedLots.length > 0 && (
            <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 12, padding: 16, marginBottom: 14, overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: TX3 }}>{fmtDate(new Date(minMs).toISOString().slice(0,10))}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: TX2 }}>{t("planning.calendar")}</span>
                <span style={{ fontSize: 11, color: TX3 }}>{fmtDate(new Date(maxMs).toISOString().slice(0,10))}</span>
              </div>
              <div style={{ position: "relative" }}>
                {/* Today marker */}
                {todayPct !== null && (
                  <div style={{ position: "absolute", left: `${todayPct}%`, top: 0, bottom: 0, width: 1.5, background: RD, zIndex: 2, pointerEvents: "none" }} />
                )}
                {datedLots.map((lot, i) => {
                  const lc     = getLotColor(lot);
                  const st     = calcLotStatus(lot);
                  const left   = pct(toMs(lot.startDate));
                  const width  = Math.max(1, pct(toMs(lot.endDate)) - left);
                  const steps  = (lot.steps || []).filter(s => s.startDate && s.endDate);
                  return (
                    <div key={lot.id} style={{ marginBottom: i < datedLots.length - 1 ? 2 : 0 }}>
                      {/* Lot bar */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: TX2, width: 90, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={lot.name}>{lot.name}</div>
                        <div style={{ flex: 1, position: "relative", height: 18, background: SB, borderRadius: 4 }}>
                          <div style={{ position: "absolute", left: `${left}%`, width: `${width}%`, height: "100%", background: lc.bg, border: `1px solid ${lc.value}40`, borderRadius: 4 }} />
                          <div style={{ position: "absolute", left: `${left}%`, width: `${width * (lot.progress || 0) / 100}%`, height: "100%", background: st.id === "delayed" ? RD + "80" : lc.value + "80", borderRadius: 4 }} />
                          {(lot.progress || 0) > 0 && (
                            <div style={{ position: "absolute", left: `${left}%`, width: `${width}%`, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: TX, opacity: 0.75 }}>{lot.progress}%</span>
                            </div>
                          )}
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: st.color, background: st.bg, padding: "1px 5px", borderRadius: 4, flexShrink: 0 }}>{st.label}</span>
                      </div>
                      {/* Step bars (indented, smaller) */}
                      {steps.map(step => {
                        const sLeft = pct(toMs(step.startDate));
                        const sWidth = Math.max(0.5, pct(toMs(step.endDate)) - sLeft);
                        return (
                          <div key={step.name + step.startDate} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 1 }}>
                            <div style={{ fontSize: 9, color: TX3, width: 90, flexShrink: 0, paddingLeft: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={step.name}>{step.name}</div>
                            <div style={{ flex: 1, position: "relative", height: 10, borderRadius: 3 }}>
                              <div style={{ position: "absolute", left: `${sLeft}%`, width: `${sWidth}%`, height: "100%", background: step.done ? GR + "60" : lc.value + "40", borderRadius: 3 }} />
                            </div>
                            <div style={{ width: 42 }} />
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
                {/* Today label */}
                {todayPct !== null && (
                  <div style={{ position: "absolute", left: `${todayPct}%`, top: -18, transform: "translateX(-50%)", fontSize: 10, fontWeight: 700, color: RD, background: REDBG, padding: "1px 4px", borderRadius: 3, pointerEvents: "none", whiteSpace: "nowrap" }}>{t("planning.today")}</div>
                )}
              </div>
            </div>
          )}

          {/* Lot list */}
          {lots.map((lot) => {
            const st = calcLotStatus(lot);
            const lc = getLotColor(lot);
            return (
              <div key={lot.id} style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 12, padding: 14, marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: lc.value, marginTop: 4, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: TX }}>{lot.name}</div>
                    {lot.contractor && <span style={{ fontSize: 12, color: TX3 }}>{lot.contractor}</span>}
                    {lot.postId && (() => { const post = (project.posts || []).find(p => p.id === lot.postId); return post ? <span style={{ fontSize: 10, color: BL, background: BLB, padding: "1px 6px", borderRadius: 4, marginLeft: 6 }}>{post.id}. {post.label}</span> : null; })()}
                    <div style={{ display: "flex", gap: 10, marginTop: 3, fontSize: 11, color: TX3 }}>
                      {lot.startDate && <span>{fmtDate(lot.startDate)}</span>}
                      {lot.startDate && lot.endDate && <span>→</span>}
                      {lot.endDate   && <span>{fmtDate(lot.endDate)}</span>}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: st.color, background: st.bg, padding: "2px 7px", borderRadius: 6, flexShrink: 0 }}>{st.label}</span>
                  <button onClick={() => { setEditLot({ name: lot.name, contractor: lot.contractor || "", startDate: lot.startDate || "", endDate: lot.endDate || "", duration: calcDuration(lot.startDate, lot.endDate), progress: lot.progress || 0, color: lot.color || "amber", steps: lot.steps || [], postId: lot.postId || "" }); setEditingId(lot.id); setModal("edit"); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0 }}>
                    <Ico name="edit" size={14} color={TX3} />
                  </button>
                  {confirmDeleteLot === lot.id ? (
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => { deleteLot(lot.id); setConfirmDeleteLot(null); }} style={{ fontSize: 11, fontWeight: 700, color: WH, background: RD, border: "none", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontFamily: "inherit" }}>Supprimer</button>
                      <button onClick={() => setConfirmDeleteLot(null)} style={{ fontSize: 11, color: TX2, background: SB, border: `1px solid ${SBB}`, borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontFamily: "inherit" }}>{t("cancel")}</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDeleteLot(lot.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0 }}>
                      <Ico name="trash" size={14} color={TX3} />
                    </button>
                  )}
                </div>

                {/* Duration */}
                {lot.startDate && lot.endDate && (
                  <div style={{ fontSize: 10, color: TX3, marginTop: 2 }}>
                    Durée : {calcDuration(lot.startDate, lot.endDate)} jours
                  </div>
                )}

                {/* Steps */}
                {(lot.steps || []).length > 0 && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${SB2}` }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: TX3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Étapes ({(lot.steps || []).length})</div>
                    {(lot.steps || []).map((step, si) => (
                      <div key={si} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0" }}>
                        <button onClick={() => {
                          setProjects(prev => prev.map(p => p.id === project.id ? {
                            ...p, lots: (p.lots || []).map(l => l.id === lot.id ? {
                              ...l, steps: l.steps.map((s, j) => j === si ? { ...s, done: !s.done } : s)
                            } : l)
                          } : p));
                        }} style={{ width: 16, height: 16, borderRadius: 3, border: `1.5px solid ${step.done ? GR : SBB}`, background: step.done ? "#F0FDF4" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0 }}>
                          {step.done && <Ico name="check" size={9} color={GR} />}
                        </button>
                        <span style={{ fontSize: 11, color: step.done ? TX3 : TX, textDecoration: step.done ? "line-through" : "none", flex: 1 }}>{step.name}</span>
                        {step.startDate && <span style={{ fontSize: 9, color: TX3 }}>{fmtDate(step.startDate)}{step.endDate ? ` → ${fmtDate(step.endDate)}` : ""}</span>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Progress slider */}
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ fontSize: 11, color: TX3 }}>Avancement</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: lot.progress >= 100 ? GR : TX }}>{lot.progress || 0}%</span>
                  </div>
                  <div style={{ position: "relative", height: 8, background: SB2, borderRadius: 4 }}>
                    <div style={{ height: "100%", width: `${lot.progress || 0}%`, background: lot.progress >= 100 ? GR : (calcLotStatus(lot).id === "delayed" ? RD : lc.value), borderRadius: 4, transition: "width 0.2s" }} />
                    <input
                      type="range" min={0} max={100} value={lot.progress || 0}
                      onChange={(e) => setProgress(lot.id, Number(e.target.value))}
                      style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%", margin: 0 }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Import mapping modal */}
      {importData && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setImportData(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: WH, borderRadius: 14, width: "100%", maxWidth: 600, maxHeight: "85vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)", animation: "modalIn 0.18s ease" }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${SBB}` }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: TX }}>Mapper les colonnes</div>
              <div style={{ fontSize: 12, color: TX3, marginTop: 2 }}>{importData.rows.length} ligne{importData.rows.length > 1 ? "s" : ""} détectée{importData.rows.length > 1 ? "s" : ""} · {importData.headers.length} colonne{importData.headers.length > 1 ? "s" : ""}</div>
            </div>

            <div style={{ padding: "16px 20px" }}>
              {/* Mapping selectors */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                {[
                  { key: "name", label: "Nom du lot *", required: true },
                  { key: "contractor", label: "Responsable" },
                  { key: "startDate", label: "Date de début" },
                  { key: "endDate", label: "Date de fin" },
                  { key: "duration", label: "Durée (jours)" },
                  { key: "progress", label: "Avancement (%)" },
                ].map(field => (
                  <div key={field.key}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: TX2, marginBottom: 3 }}>{field.label}</div>
                    <select
                      value={importData.mapping[field.key] ?? ""}
                      onChange={e => setImportData(prev => ({ ...prev, mapping: { ...prev.mapping, [field.key]: e.target.value === "" ? undefined : Number(e.target.value) } }))}
                      style={{ width: "100%", padding: "7px 10px", border: `1px solid ${importData.mapping[field.key] !== undefined ? AC : SBB}`, borderRadius: 6, fontSize: 12, fontFamily: "inherit", background: importData.mapping[field.key] !== undefined ? ACL : SB, color: TX, cursor: "pointer" }}
                    >
                      <option value="">— Non mappé —</option>
                      {importData.headers.map((h, i) => (
                        <option key={i} value={i}>{h}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* Preview */}
              <div style={{ fontSize: 11, fontWeight: 600, color: TX3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Aperçu ({Math.min(3, importData.rows.length)} premières lignes)</div>
              <div style={{ overflowX: "auto", marginBottom: 16 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${SBB}` }}>
                      {importData.headers.map((h, i) => {
                        const mappedTo = Object.entries(importData.mapping).find(([, v]) => v === i);
                        return (
                          <th key={i} style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600, color: mappedTo ? AC : TX3, background: mappedTo ? ACL : "transparent" }}>
                            {h}
                            {mappedTo && <div style={{ fontSize: 9, fontWeight: 700, color: AC }}>→ {mappedTo[0]}</div>}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {importData.rows.slice(0, 3).map((row, ri) => (
                      <tr key={ri} style={{ borderBottom: `1px solid ${SB}` }}>
                        {row.map((cell, ci) => {
                          const mappedTo = Object.entries(importData.mapping).find(([, v]) => v === ci);
                          return <td key={ci} style={{ padding: "5px 8px", color: mappedTo ? TX : TX3, background: mappedTo ? ACL + "40" : "transparent" }}>{cell}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ padding: "12px 20px", borderTop: `1px solid ${SBB}`, display: "flex", gap: 8 }}>
              <button onClick={() => setImportData(null)} style={{ flex: 1, padding: 11, border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: TX2 }}>Annuler</button>
              <button onClick={applyImport} disabled={importData.mapping.name === undefined} style={{ flex: 2, padding: 11, border: "none", borderRadius: 8, background: importData.mapping.name !== undefined ? AC : DIS, color: importData.mapping.name !== undefined ? "#fff" : DIST, fontSize: 13, fontWeight: 600, cursor: importData.mapping.name !== undefined ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
                Importer {importData.rows.length} lot{importData.rows.length > 1 ? "s" : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit modal */}
      <Modal open={!!modal} onClose={() => { setModal(null); setEditLot(EMPTY_LOT); setEditingId(null); }} title={modal === "add" ? t("planning.newLot") : t("planning.editLot")} wide>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: TX2, marginBottom: 4 }}>{t("planning.lotName")} *</div>
          <input value={editLot.name} onChange={(e) => setEditLot((p) => ({ ...p, name: e.target.value }))} placeholder={t("planning.lotPlaceholder")} style={{ width: "100%", padding: "9px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: SB, color: TX, boxSizing: "border-box" }} autoFocus />
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: TX2, marginBottom: 4 }}>Responsable / Entreprise</div>
            <input value={editLot.contractor || ""} onChange={(e) => setEditLot((p) => ({ ...p, contractor: e.target.value }))} placeholder="ex. Entreprise Dupont" style={{ width: "100%", padding: "9px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: SB, color: TX, boxSizing: "border-box" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: TX2, marginBottom: 4 }}>Poste PV associé</div>
            <select value={editLot.postId || ""} onChange={(e) => setEditLot((p) => ({ ...p, postId: e.target.value }))} style={{ width: "100%", padding: "9px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: SB, color: TX, boxSizing: "border-box", appearance: "auto", cursor: "pointer" }}>
              <option value="">— Aucun poste —</option>
              {(project.posts || []).map(p => (
                <option key={p.id} value={p.id}>{p.id}. {p.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: TX2, marginBottom: 4 }}>{t("planning.start")}</div>
            <input type="date" value={editLot.startDate} onChange={(e) => {
              const start = e.target.value;
              const end = editLot.duration ? calcEndFromDuration(start, editLot.duration) : editLot.endDate;
              setEditLot(p => ({ ...p, startDate: start, endDate: end }));
            }} style={{ width: "100%", padding: "9px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: SB, color: TX, boxSizing: "border-box" }} />
          </div>
          <div style={{ flex: "0 0 90px" }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: TX2, marginBottom: 4 }}>Durée (jours)</div>
            <input type="number" min="1" value={editLot.duration || ""} onChange={(e) => {
              const dur = e.target.value;
              const end = editLot.startDate && dur ? calcEndFromDuration(editLot.startDate, dur) : editLot.endDate;
              setEditLot(p => ({ ...p, duration: dur, endDate: end }));
            }} placeholder="—" style={{ width: "100%", padding: "9px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: SB, color: TX, boxSizing: "border-box" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: TX2, marginBottom: 4 }}>{t("planning.end")}</div>
            <input type="date" value={editLot.endDate} onChange={(e) => {
              const end = e.target.value;
              const dur = editLot.startDate ? calcDuration(editLot.startDate, end) : "";
              setEditLot(p => ({ ...p, endDate: end, duration: dur }));
            }} style={{ width: "100%", padding: "9px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: SB, color: TX, boxSizing: "border-box" }} />
          </div>
        </div>

        {/* Steps */}
        <div style={{ marginBottom: 14, borderTop: `1px solid ${SBB}`, paddingTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: TX2 }}>Étapes</span>
            <button onClick={() => setEditLot(p => ({ ...p, steps: [...(p.steps || []), { ...EMPTY_STEP }] }))} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", fontSize: 11, color: AC, fontWeight: 600, fontFamily: "inherit" }}>
              <Ico name="plus" size={10} color={AC} />Ajouter une étape
            </button>
          </div>
          {(editLot.steps || []).length === 0 && (
            <div style={{ fontSize: 11, color: TX3, fontStyle: "italic", padding: "4px 0" }}>Aucune étape — optionnel, pour détailler le lot</div>
          )}
          {(editLot.steps || []).map((step, si) => (
            <div key={si} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center", padding: "6px 8px", background: SB, borderRadius: 8 }}>
              <input value={step.name} onChange={e => setEditLot(p => ({ ...p, steps: p.steps.map((s, j) => j === si ? { ...s, name: e.target.value } : s) }))} placeholder="Nom de l'étape" style={{ flex: 1, padding: "6px 8px", border: `1px solid ${SBB}`, borderRadius: 6, fontSize: 12, fontFamily: "inherit", background: WH, color: TX, minWidth: 0 }} />
              <input type="date" value={step.startDate || ""} onChange={e => {
                const start = e.target.value;
                const end = step.duration ? calcEndFromDuration(start, step.duration) : step.endDate;
                setEditLot(p => ({ ...p, steps: p.steps.map((s, j) => j === si ? { ...s, startDate: start, endDate: end || "" } : s) }));
              }} style={{ width: 120, padding: "6px 6px", border: `1px solid ${SBB}`, borderRadius: 6, fontSize: 11, fontFamily: "inherit", background: WH, color: TX }} />
              <input type="number" min="1" value={step.duration || ""} onChange={e => {
                const dur = e.target.value;
                const end = step.startDate && dur ? calcEndFromDuration(step.startDate, dur) : step.endDate;
                setEditLot(p => ({ ...p, steps: p.steps.map((s, j) => j === si ? { ...s, duration: dur, endDate: end || "" } : s) }));
              }} placeholder="j" title="Durée en jours" style={{ width: 45, padding: "6px 6px", border: `1px solid ${SBB}`, borderRadius: 6, fontSize: 11, fontFamily: "inherit", background: WH, color: TX, textAlign: "center" }} />
              <input type="date" value={step.endDate || ""} onChange={e => {
                const end = e.target.value;
                const dur = step.startDate ? calcDuration(step.startDate, end) : "";
                setEditLot(p => ({ ...p, steps: p.steps.map((s, j) => j === si ? { ...s, endDate: end, duration: dur } : s) }));
              }} style={{ width: 120, padding: "6px 6px", border: `1px solid ${SBB}`, borderRadius: 6, fontSize: 11, fontFamily: "inherit", background: WH, color: TX }} />
              <button onClick={() => setEditLot(p => ({ ...p, steps: p.steps.filter((_, j) => j !== si) }))} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0 }}>
                <Ico name="x" size={10} color={TX3} />
              </button>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: TX2, marginBottom: 6 }}>{t("planning.progressPct")} — {editLot.progress}%</div>
          <input type="range" min={0} max={100} value={editLot.progress} onChange={(e) => setEditLot((p) => ({ ...p, progress: Number(e.target.value) }))} style={{ width: "100%", accentColor: AC }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: TX2, marginBottom: 6 }}>Couleur</div>
          <div style={{ display: "flex", gap: 8 }}>
            {LOT_COLORS.map((c) => (
              <button key={c.id} onClick={() => setEditLot((p) => ({ ...p, color: c.id }))} style={{ width: 26, height: 26, borderRadius: "50%", background: c.value, border: editLot.color === c.id ? `3px solid ${TX}` : `3px solid transparent`, cursor: "pointer", outline: "none" }} />
            ))}
          </div>
        </div>
        <button onClick={saveLot} disabled={!editLot.name.trim()} style={{ width: "100%", padding: 14, border: "none", borderRadius: 10, background: editLot.name.trim() ? AC : DIS, color: editLot.name.trim() ? "#fff" : DIST, fontSize: 15, fontWeight: 600, cursor: editLot.name.trim() ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
          {modal === "add" ? t("planning.addLotBtn") : t("save")}
        </button>
      </Modal>
    </div>
  );
}

function PDFPreview({ form }) {
  const color = form.pdfColor || "#D97B0D";
  const ff = form.pdfFont === "times" ? "Georgia,'Times New Roman',serif" : "system-ui,-apple-system,sans-serif";
  return (
    <div style={{ border: `1px solid ${SBB}`, borderRadius: 10, overflow: "hidden", background: WH, userSelect: "none" }}>
      {/* Barre couleur */}
      <div style={{ height: 7, background: color }} />
      {/* En-tête */}
      <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", fontFamily: ff }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: TX, fontFamily: ff }}>{form.structure || "Votre bureau d'architecture"}</div>
          <div style={{ fontSize: 10, color: TX3, marginTop: 2, fontFamily: ff }}>
            {[form.phone, form.email].filter(Boolean).join("   ") || "contact@votre-bureau.be"}
          </div>
        </div>
        {form.picture
          ? <img src={form.picture} alt="" style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover" }} />
          : <div style={{ width: 30, height: 30, borderRadius: "50%", background: SB, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: TX3 }}>Logo</div>
        }
      </div>
      <div style={{ height: 1, background: SBB, margin: "0 16px" }} />
      {/* Titre PV */}
      <div style={{ padding: "10px 16px 8px", fontFamily: ff }}>
        <div style={{ fontSize: 17, fontWeight: 700, color, marginBottom: 3, fontFamily: ff }}>PROCÈS-VERBAL N°29</div>
        <div style={{ fontSize: 10, color: TX2, fontFamily: ff }}>Réunion de chantier du 05/04/2026</div>
      </div>
      {/* Bloc projet */}
      <div style={{ margin: "0 16px 12px", background: SB, borderRadius: 6, padding: "8px 10px", display: "flex", gap: 14, fontFamily: ff }}>
        {[["CHANTIER","Votre projet"],["MAÎTRE D'OUVRAGE","Client MO"],["ENTREPRISE","Entreprise"]].map(([k,v]) => (
          <div key={k} style={{ flex: 1 }}>
            <div style={{ fontSize: 7, fontWeight: 600, color: TX3, marginBottom: 2 }}>{k}</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: TX, fontFamily: ff }}>{v}</div>
          </div>
        ))}
      </div>
      {/* Section contenu */}
      <div style={{ margin: "0 16px 8px" }}>
        <div style={{ padding: "4px 6px 4px 8px", background: SB, borderLeft: `2.5px solid ${color}`, marginBottom: 5 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: TX, fontFamily: ff }}>01. Situation du chantier</span>
        </div>
        <div style={{ fontSize: 9, color: TX, paddingLeft: 8, fontFamily: ff }}>• Les travaux avancent conformément au planning.</div>
        <div style={{ fontSize: 9, color: RD, paddingLeft: 8, marginTop: 3, fontWeight: 600, fontFamily: ff }}>! Resserrages coupe-feu toujours en attente.</div>
      </div>
      {/* Pied de page */}
      <div style={{ borderTop: `1px solid ${SBB}`, padding: "6px 16px", display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 8, color: TX3, fontFamily: ff }}>{form.structure || "Votre bureau"}</span>
        <span style={{ fontSize: 8, color: TX3, fontFamily: ff }}>Page 1 / 2</span>
      </div>
    </div>
  );
}

function MfaSection() {
  const t = useT();
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [factorId, setFactorId] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data, error: err }) => {
      if (!err && data?.totp) {
        const verified = data.totp.filter((f) => f.status === "verified");
        setMfaEnabled(verified.length > 0);
        if (verified.length > 0) setFactorId(verified[0].id);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const startEnroll = async () => {
    setError(""); setMsg("");
    const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "ArchiPilot" });
    if (err) { setError(err.message); return; }
    setQrCode(data.totp.qr_code);
    setFactorId(data.id);
    setEnrolling(true);
  };

  const confirmEnroll = async () => {
    setError("");
    if (verifyCode.length !== 6) return;
    const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
    if (chErr) { setError(chErr.message); return; }
    const { error: vErr } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: verifyCode });
    if (vErr) {
      setError(t("mfa.invalidCode"));
      return;
    }
    setMfaEnabled(true);
    setEnrolling(false);
    setVerifyCode("");
    setMsg(t("mfa.activated"));
  };

  const disableMfa = async () => {
    setError(""); setMsg("");
    const { error: err } = await supabase.auth.mfa.unenroll({ factorId });
    if (err) { setError(err.message); return; }
    setMfaEnabled(false);
    setFactorId("");
    setMsg(t("mfa.deactivated"));
  };

  if (loading) return null;

  return (
    <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 14, padding: "20px 20px 16px", marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 4 }}>{t("mfa.title")}</div>
      <div style={{ fontSize: 12, color: TX3, marginBottom: 14, lineHeight: 1.5 }}>{t("mfa.desc")}</div>

      {msg && <div style={{ marginBottom: 12, padding: "8px 12px", background: "#EAF3DE", border: "1px solid #C6E9B4", borderRadius: 6, fontSize: 12, color: GR }}>{msg}</div>}
      {error && <div style={{ marginBottom: 12, padding: "8px 12px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6, fontSize: 12, color: RD }}>{error}</div>}

      {mfaEnabled && !enrolling ? (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: GR }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: GR }}>{t("mfa.enabled")}</span>
          </div>
          <button onClick={disableMfa} style={{ padding: "9px 18px", border: `1px solid #FECACA`, borderRadius: 8, background: "#FEF2F2", color: RD, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            {t("mfa.disable")}
          </button>
        </div>
      ) : enrolling ? (
        <div>
          <div style={{ fontSize: 13, color: TX2, marginBottom: 14, lineHeight: 1.6 }}>{t("mfa.scanQR")}</div>
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <img src={qrCode} alt="QR Code MFA" style={{ width: 180, height: 180, borderRadius: 8, border: `1px solid ${SBB}` }} />
          </div>
          <div style={{ fontSize: 13, color: TX2, marginBottom: 8 }}>{t("mfa.enterCode")}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text" value={verifyCode} onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000" maxLength={6} autoComplete="one-time-code" inputMode="numeric" autoFocus
              style={{ flex: 1, padding: "11px 14px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 18, fontWeight: 700, fontFamily: "inherit", background: SB, color: TX, textAlign: "center", letterSpacing: "0.3em", boxSizing: "border-box" }}
            />
            <button
              onClick={confirmEnroll} disabled={verifyCode.length !== 6}
              style={{ padding: "11px 18px", border: "none", borderRadius: 8, background: verifyCode.length === 6 ? AC : "#D3D1C7", color: "#fff", fontSize: 13, fontWeight: 600, cursor: verifyCode.length === 6 ? "pointer" : "not-allowed", fontFamily: "inherit", whiteSpace: "nowrap" }}
            >
              {t("mfa.verify")}
            </button>
          </div>
          <button onClick={() => { setEnrolling(false); setVerifyCode(""); setError(""); }} style={{ marginTop: 12, background: "none", border: "none", cursor: "pointer", color: TX3, fontSize: 12, fontFamily: "inherit", padding: 0 }}>
            {t("mfa.cancel")}
          </button>
        </div>
      ) : (
        <button onClick={startEnroll} style={{ padding: "9px 18px", border: "none", borderRadius: 8, background: AC, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          {t("mfa.enable")}
        </button>
      )}
    </div>
  );
}

const PROFILE_SECTIONS = [
  { id: "avatar", icon: "users", label: "Profil" },
  { id: "plan", icon: "chart", label: "Abonnement" },
  { id: "account", icon: "mail", label: "Compte" },
  { id: "security", icon: "lock", label: "Sécurité" },
  { id: "info", icon: "file", label: "Informations" },
  { id: "lang", icon: "building", label: "Langue" },
  { id: "appearance", icon: "chart", label: "Apparence PV" },
  { id: "preview", icon: "eye", label: "Aperçu" },
];

function ProfileView({ profile, onSave }) {
  const [form, setForm] = useState({ ...profile });
  const [saved, setSaved] = useState(false);
  const fileRef = useRef();
  const t = useT();
  const [authEmail, setAuthEmail] = useState("");
  const [newAuthEmail, setNewAuthEmail] = useState("");
  const [emailMsg, setEmailMsg] = useState("");
  const [emailErr, setEmailErr] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [activeSection, setActiveSection] = useState("avatar");
  const sectionRefs = useRef({});
  const scrollRef = useRef(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const em = data?.user?.email || "";
      setAuthEmail(em);
      setNewAuthEmail(em);
    });
  }, []);

  // Track active section on scroll
  useEffect(() => {
    const onScroll = () => {
      // If scrolled to bottom, activate the last visible section
      const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 20;
      if (atBottom) {
        // Find last section that has a ref
        for (let i = PROFILE_SECTIONS.length - 1; i >= 0; i--) {
          if (sectionRefs.current[PROFILE_SECTIONS[i].id]) {
            setActiveSection(PROFILE_SECTIONS[i].id);
            return;
          }
        }
      }
      let current = "avatar";
      for (const s of PROFILE_SECTIONS) {
        const el = sectionRefs.current[s.id];
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 120) current = s.id;
        }
      }
      setActiveSection(current);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollTo = (id) => {
    const el = sectionRefs.current[id];
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top, behavior: "smooth" });
    }
  };

  const handleChangeAuthEmail = async () => {
    setEmailErr(""); setEmailMsg("");
    if (!newAuthEmail.trim() || newAuthEmail === authEmail) return;
    setEmailLoading(true);
    const { error } = await supabase.auth.updateUser({ email: newAuthEmail });
    setEmailLoading(false);
    if (error) {
      setEmailErr(error.message);
    } else {
      setEmailMsg("Un email de confirmation a été envoyé à " + newAuthEmail);
    }
  };

  const initials = form.name.trim().split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";

  const handlePicture = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setForm((p) => ({ ...p, picture: ev.target.result }));
    reader.readAsDataURL(file);
  };

  const removePicture = () => setForm((p) => ({ ...p, picture: null }));

  const set = (key) => (v) => setForm((p) => ({ ...p, [key]: v }));

  const refFor = (id) => (el) => { sectionRefs.current[id] = el; };

  const [isMobile, setIsMobile] = useState(window.innerWidth < 700);
  const [mobileSection, setMobileSection] = useState(null); // which section sheet is open
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Mobile profile — completely different layout
  if (isMobile) {
    const MOBILE_SECTIONS = [
      { id: "plan", icon: "chart", label: "Abonnement", desc: `Plan ${PLANS[form.plan || "free"]?.label || "Free"}` },
      { id: "info", icon: "file", label: "Informations personnelles", desc: `${form.name} · ${form.structure}` },
      { id: "account", icon: "mail", label: "Compte & email", desc: authEmail || "Email de connexion" },
      { id: "security", icon: "lock", label: "Sécurité", desc: "Authentification à deux facteurs" },
      { id: "signature", icon: "edit", label: "Signature email", desc: form.emailSignature ? "Configurée" : "Non configurée" },
      { id: "lang", icon: "building", label: "Langue", desc: form.lang === "fr" ? "Français" : "English" },
      { id: "appearance", icon: "chart", label: "Apparence du PV", desc: `${(form.pdfColor || "#D97B0D").toUpperCase()} · ${form.pdfFont || "helvetica"}` },
    ];
    const doSave = () => { onSave(form); setSaved(true); setTimeout(() => setSaved(false), 2500); };
    return (
      <div className="ap-profile-mobile" style={{ maxWidth: "100%", margin: 0, padding: 0, display: "flex", flexDirection: "column", height: "calc(100dvh - 52px - 96px)", justifyContent: "center", overflow: "hidden" }}>
        {/* Avatar + Name — centered */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 12, flexShrink: 0 }}>
          <div style={{ position: "relative", marginBottom: 6 }}>
            {form.picture ? (
              <img src={form.picture} alt="profil" style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", border: `3px solid ${ACL2}` }} />
            ) : (
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: ACL, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: AC, border: `3px solid ${ACL2}` }}>{initials}</div>
            )}
            <button onClick={() => fileRef.current.click()} style={{ position: "absolute", bottom: 0, right: 0, width: 24, height: 24, borderRadius: "50%", background: "none", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
              <Ico name="edit" size={14} color={TX3} />
            </button>
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: TX, lineHeight: LH.tight }}>{form.name || "Votre nom"}</div>
          <div style={{ fontSize: FS.sm, color: TX3, marginTop: 1 }}>{form.structure || "Votre bureau"}</div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePicture} />
        </div>

        {/* Section list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 8, flexShrink: 0 }}>
          {MOBILE_SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setMobileSection(s.id)}
              className="ap-profile-card"
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", border: `1px solid ${SBB}`, borderRadius: RAD.md, background: WH, cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "border-color 0.15s, background 0.15s" }}
            >
              <div style={{ width: 28, height: 28, borderRadius: RAD.sm, background: SB, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Ico name={s.icon} size={13} color={TX2} />
              </div>
              <span style={{ flex: 1, fontSize: FS.base, fontWeight: 600, color: TX, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.label}</span>
              <span style={{ fontSize: FS.xs, color: TX3, maxWidth: 100, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}>{s.desc}</span>
              <Ico name="arrowr" size={10} color={SBB} />
            </button>
          ))}
        </div>

        {/* Logout */}
        <button
          onClick={() => supabase.auth.signOut()}
          className="ap-profile-card"
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", border: `1px solid #FECACA`, borderRadius: RAD.md, background: "#FEF8F8", cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "border-color 0.15s, background 0.15s", flexShrink: 0 }}
        >
          <div style={{ width: 28, height: 28, borderRadius: RAD.sm, background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Ico name="logout" size={13} color={RD} />
          </div>
          <span style={{ fontSize: FS.base, fontWeight: 600, color: RD }}>Se déconnecter</span>
        </button>

        {/* ── Section Sheets ── */}
        {mobileSection && (
          <div style={{ position: "fixed", inset: 0, zIndex: 250, display: "flex", flexDirection: "column", justifyContent: "flex-end" }} onClick={() => setMobileSection(null)}>
            <div style={{ background: "rgba(0,0,0,0.3)", position: "absolute", inset: 0 }} />
            <div onClick={e => e.stopPropagation()} style={{ position: "relative", background: WH, borderRadius: "20px 20px 0 0", maxHeight: "85vh", overflowY: "auto", animation: "sheetUp 0.25s ease-out", padding: `${SP.xl}px ${SP.lg}px`, paddingBottom: `max(${SP.xl}px, env(safe-area-inset-bottom, 20px))` }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: SBB, margin: `0 auto ${SP.lg}px` }} />

              {mobileSection === "plan" && (() => {
                const curPlan = form.plan || "free";
                const planList = [
                  { ...PLANS.free, features: ["1 projet", "3 PV / mois", "3 IA / mois"] },
                  { ...PLANS.pro, popular: true, features: ["Projets illimités", "PV illimités", "IA illimitée", "Envoi email", "Galerie photos", "Planning & Lots", "3 collabs / projet"] },
                  { ...PLANS.team, features: ["Tout le Pro", "Collabs illimités", "Rôles & permissions", "Dashboard complet", "Export CSV", "PDF logo"] },
                ];
                return (
                <div style={{ padding: "0 4px" }}>
                  <div style={{ fontSize: FS.lg + 1, fontWeight: 700, color: TX, marginBottom: 4 }}>Abonnement</div>
                  <div style={{ fontSize: FS.sm, color: TX3, marginBottom: 14 }}>Plan actuel : <strong style={{ color: AC }}>{PLANS[curPlan]?.label}</strong></div>

                  {/* Plan toggle */}
                  <div style={{ display: "flex", background: SB, borderRadius: 10, padding: 3, gap: 3, marginBottom: 14 }}>
                    {planList.map(p => (
                      <button key={p.id} onClick={() => set("plan")(p.id)} style={{ flex: 1, padding: "8px 4px", border: "none", borderRadius: 8, fontSize: 12, fontWeight: curPlan === p.id ? 700 : 500, cursor: "pointer", fontFamily: "inherit", background: curPlan === p.id ? WH : "transparent", color: curPlan === p.id ? AC : TX3, boxShadow: curPlan === p.id ? "0 1px 3px rgba(0,0,0,0.06)" : "none", transition: "all 0.12s" }}>
                        {p.label}
                      </button>
                    ))}
                  </div>

                  {/* Selected plan details */}
                  {(() => { const p = planList.find(pl => pl.id === curPlan) || planList[0]; return (
                    <div style={{ background: WH, border: `1px solid ${p.popular ? AC : SBB}`, borderRadius: 12, padding: "16px 14px" }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 10 }}>
                        <span style={{ fontSize: 28, fontWeight: 800, color: TX }}>{p.price}€</span>
                        <span style={{ fontSize: 12, color: TX3 }}>/mois</span>
                        {p.popular && <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: AC, background: ACL, padding: "2px 8px", borderRadius: 8, marginLeft: 6 }}>Populaire</span>}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                        {p.features.map((f, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: TX2 }}>
                            <Ico name="check" size={11} color={GR} />{f}
                          </div>
                        ))}
                      </div>
                      <button onClick={() => { onSave({ ...form, plan: curPlan }); setSaved(true); setTimeout(() => setSaved(false), 2500); setMobileSection(null); track("plan_selected", { plan: curPlan, _page: "profile" }); }} style={{ width: "100%", padding: "11px 16px", border: "none", borderRadius: 8, background: AC, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                        Confirmer ce plan
                      </button>
                    </div>
                  ); })()}
                </div>
                );
              })()}

              {mobileSection === "info" && (
                <>
                  <div style={{ fontSize: FS.lg + 1, fontWeight: 700, color: TX, marginBottom: SP.lg }}>Informations</div>
                  <Field label={t("profile.fullName")} value={form.name} onChange={set("name")} placeholder="ex: Gaëlle CNOP" required />
                  <Field half={false} label={t("profile.structureName")} value={form.structure} onChange={set("structure")} placeholder="ex: DEWIL architecten" required />
                  <Field label={t("profile.structureType")} value={form.structureType} onChange={set("structureType")} select options={STRUCTURE_TYPES} />
                  <Field label={t("profile.address")} value={form.address} onChange={set("address")} placeholder="ex: Rue de la Loi 12, 1000 Bruxelles" />
                  <Field label={t("profile.phone")} value={form.phone} onChange={set("phone")} placeholder="ex: 0474 50 85 80" type="tel" />
                  <Field label={t("profile.email")} value={form.email} onChange={set("email")} placeholder="ex: contact@cabinet.be" type="email" />
                </>
              )}

              {mobileSection === "account" && (
                <>
                  <div style={{ fontSize: FS.lg + 1, fontWeight: 700, color: TX, marginBottom: SP.sm }}>Compte</div>
                  <div style={{ fontSize: FS.base, color: TX3, marginBottom: SP.lg, lineHeight: LH.relaxed }}>{t("profile.accountDesc")}</div>
                  <label style={{ display: "block", fontSize: FS.base, fontWeight: 600, color: TX2, marginBottom: SP.xs }}>{t("profile.loginEmail")}</label>
                  <input type="email" value={newAuthEmail} onChange={e => setNewAuthEmail(e.target.value)} placeholder={authEmail} style={{ width: "100%", padding: `${SP.sm + 1}px ${SP.md}px`, border: `1px solid ${SBB}`, borderRadius: RAD.md, fontSize: 14, fontFamily: "inherit", background: SB, color: TX, boxSizing: "border-box", marginBottom: SP.md }} />
                  <button onClick={handleChangeAuthEmail} disabled={emailLoading || !newAuthEmail.trim() || newAuthEmail === authEmail} style={{ width: "100%", padding: SP.sm + 2, border: "none", borderRadius: RAD.md, background: newAuthEmail !== authEmail && newAuthEmail.trim() ? AC : DIS, color: "#fff", fontSize: FS.md, fontWeight: 600, cursor: newAuthEmail !== authEmail ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
                    {emailLoading ? "..." : t("profile.changeEmail")}
                  </button>
                  {emailMsg && <div style={{ marginTop: SP.sm, fontSize: FS.sm, color: GR }}>{emailMsg}</div>}
                  {emailErr && <div style={{ marginTop: SP.sm, fontSize: FS.sm, color: RD }}>{emailErr}</div>}
                </>
              )}

              {mobileSection === "security" && (
                <>
                  <div style={{ fontSize: FS.lg + 1, fontWeight: 700, color: TX, marginBottom: SP.lg }}>Sécurité</div>
                  <MfaSection />
                </>
              )}

              {mobileSection === "signature" && (
                <>
                  <div style={{ fontSize: FS.lg + 1, fontWeight: 700, color: TX, marginBottom: SP.sm }}>Signature email</div>
                  <div style={{ fontSize: FS.sm, color: TX3, marginBottom: SP.md }}>Ajoutée automatiquement à la fin de vos emails. Collez une image directement.</div>
                  <div
                    contentEditable suppressContentEditableWarning
                    role="textbox" aria-label="Signature email" aria-multiline="true"
                    onInput={e => set("emailSignature")(e.currentTarget.innerHTML.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "").replace(/\bon\w+\s*=/gi, "data-removed="))}
                    onPaste={e => {
                      const items = e.clipboardData?.items;
                      if (!items) return;
                      for (const item of items) {
                        if (item.type.startsWith("image/")) {
                          e.preventDefault();
                          const file = item.getAsFile();
                          if (!file || file.size > 500000) { if (file?.size > 500000) alert("Image trop lourde (max 500 Ko)"); return; }
                          const reader = new FileReader();
                          reader.onload = (ev) => { document.execCommand("insertImage", false, ev.target.result); set("emailSignature")(e.currentTarget.innerHTML); };
                          reader.readAsDataURL(file);
                          return;
                        }
                      }
                    }}
                    dangerouslySetInnerHTML={{ __html: form.emailSignature || "" }}
                    style={{ width: "100%", minHeight: 120, padding: SP.md, border: `1px solid ${SBB}`, borderRadius: RAD.lg, fontSize: FS.base, lineHeight: LH.relaxed, fontFamily: "inherit", background: SB, color: TX, boxSizing: "border-box", outline: "none" }}
                  />
                  {!form.emailSignature && (
                    <button onClick={() => set("emailSignature")(`Cordialement,<br>${form.name || "Votre nom"}<br>${form.structure || "Votre bureau"}${form.phone ? "<br>Tél : " + form.phone : ""}${form.email ? "<br>" + form.email : ""}`)} style={{ marginTop: SP.sm, padding: `${SP.sm - 1}px ${SP.md}px`, border: `1px solid ${SBB}`, borderRadius: RAD.md, background: WH, cursor: "pointer", fontSize: FS.sm, fontFamily: "inherit", color: AC, fontWeight: 600 }}>
                      Générer depuis mon profil
                    </button>
                  )}
                </>
              )}

              {mobileSection === "lang" && (
                <>
                  <div style={{ fontSize: FS.lg + 1, fontWeight: 700, color: TX, marginBottom: SP.lg }}>Langue</div>
                  <div style={{ display: "flex", gap: SP.sm }}>
                    {[{ id: "fr", label: "Français", flag: "🇫🇷" }, { id: "en", label: "English", flag: "🇬🇧" }].map(l => (
                      <button key={l.id} onClick={() => set("lang")(l.id)} style={{ flex: 1, padding: `${SP.md}px ${SP.lg}px`, border: `2px solid ${form.lang === l.id ? AC : SBB}`, borderRadius: RAD.lg, background: form.lang === l.id ? ACL : WH, cursor: "pointer", textAlign: "center", fontFamily: "inherit" }}>
                        <span style={{ fontSize: 28, display: "block", marginBottom: SP.xs }}>{l.flag}</span>
                        <span style={{ fontSize: FS.md, fontWeight: 700, color: form.lang === l.id ? AC : TX }}>{l.label}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {mobileSection === "appearance" && (
                <>
                  <div style={{ fontSize: FS.lg + 1, fontWeight: 700, color: TX, marginBottom: SP.lg }}>Apparence du PV</div>
                  <div style={{ fontSize: FS.md, fontWeight: 500, color: TX2, marginBottom: SP.sm }}>Couleur principale</div>
                  <div style={{ display: "flex", gap: SP.sm, flexWrap: "wrap", marginBottom: SP.xl }}>
                    {COLOR_PRESETS.map(c => (
                      <button key={c.value} onClick={() => set("pdfColor")(c.value)} style={{ width: 40, height: 40, borderRadius: RAD.md, background: c.value, border: form.pdfColor === c.value ? `3px solid ${TX}` : "3px solid transparent", cursor: "pointer", padding: 0 }} />
                    ))}
                  </div>
                  <div style={{ fontSize: FS.md, fontWeight: 500, color: TX2, marginBottom: SP.sm }}>Police</div>
                  <div style={{ display: "flex", gap: SP.sm }}>
                    {FONT_OPTIONS.map(f => (
                      <button key={f.id} onClick={() => set("pdfFont")(f.id)} style={{ flex: 1, padding: `${SP.sm + 2}px ${SP.md}px`, border: `2px solid ${form.pdfFont === f.id ? AC : SBB}`, borderRadius: RAD.lg, background: form.pdfFont === f.id ? ACL : WH, cursor: "pointer", fontFamily: "inherit", textAlign: "center" }}>
                        <div style={{ fontSize: FS.md, fontWeight: 700, color: form.pdfFont === f.id ? AC : TX, fontFamily: f.id === "times" ? "Georgia,serif" : "inherit" }}>{f.label}</div>
                        <div style={{ fontSize: FS.xs, color: TX3 }}>{f.desc}</div>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Close / Done + auto-save */}
              <button onClick={() => { doSave(); setMobileSection(null); }} style={{ width: "100%", marginTop: SP.xl, padding: SP.md, border: "none", borderRadius: RAD.lg, background: AC, color: "#fff", fontSize: FS.md, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                Enregistrer
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Desktop layout
  return (
    <div style={{ display: "flex", maxWidth: 1100, margin: "0 auto", padding: 0, gap: 0 }}>
      {/* ── Navigation ── */}
      {(
        <nav style={{
          width: 180, flexShrink: 0, alignSelf: "flex-start",
          paddingRight: 20, borderRight: `1px solid ${SBB}`, marginRight: 24,
          position: "sticky", top: 80,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: TX3, marginBottom: 12, paddingLeft: 10 }}>
            {t("profile.title")}
          </div>
          {PROFILE_SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => scrollTo(s.id)}
              className="profile-nav-item"
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8,
                padding: "8px 10px", border: "none", borderRadius: 8,
                background: activeSection === s.id ? ACL : "transparent",
                cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                transition: "all 0.15s", marginBottom: 2,
              }}
            >
              <Ico name={s.icon} size={14} color={activeSection === s.id ? AC : TX3} />
              <span style={{
                fontSize: 12, fontWeight: activeSection === s.id ? 600 : 500,
                color: activeSection === s.id ? AC : TX2,
              }}>{s.label}</span>
            </button>
          ))}
        </nav>
      )}

      {/* ── Content ── */}
      <div ref={scrollRef} style={{ flex: 1, minWidth: 0, padding: isMobile ? "16px 16px 0" : "0 4px 0 0" }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: TX, marginBottom: 4 }}>{t("profile.title")}</div>
        <div style={{ fontSize: 13, color: TX3 }}>{t("profile.subtitle")}</div>
      </div>

      {/* Avatar */}
      <div ref={refFor("avatar")} style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 28, padding: 20, background: WH, border: `1px solid ${SBB}`, borderRadius: 14 }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          {form.picture ? (
            <img src={form.picture} alt="profil" style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", border: `2px solid ${SBB}` }} />
          ) : (
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: ACL, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: AC, border: `2px solid ${ACL2}` }}>{initials}</div>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: TX, marginBottom: 2 }}>{form.name || t("profile.yourName")}</div>
          <div style={{ fontSize: 12, color: TX3, marginBottom: 10 }}>{form.structure || t("profile.yourStructure")}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => fileRef.current.click()} style={{ padding: "6px 14px", border: `1px solid ${SBB}`, borderRadius: 6, background: WH, cursor: "pointer", fontSize: 12, fontWeight: 500, color: TX2, fontFamily: "inherit" }}>
              {form.picture ? t("profile.changePhoto") : t("profile.addPhoto")}
            </button>
            {form.picture && (
              <button onClick={removePicture} style={{ padding: "6px 14px", border: `1px solid ${SBB}`, borderRadius: 6, background: WH, cursor: "pointer", fontSize: 12, color: RD, fontFamily: "inherit" }}>{t("profile.removePhoto")}</button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePicture} />
        </div>
      </div>

      {/* Abonnement */}
      <div ref={refFor("plan")} style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 14, padding: "20px 20px 16px", marginBottom: 16 }}>
        <PricingSection currentPlan={form.plan || "free"} onSelectPlan={(p) => { set("plan")(p); onSave({ ...form, plan: p }); setSaved(true); setTimeout(() => setSaved(false), 2500); }} />
      </div>

      {/* Compte — Email de connexion */}
      <div ref={refFor("account")} style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 14, padding: "20px 20px 16px", marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 14 }}>{t("profile.account")}</div>
        <div style={{ fontSize: 12, color: TX3, marginBottom: 12, lineHeight: 1.5 }}>{t("profile.accountDesc")}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: TX2, marginBottom: 5 }}>{t("profile.loginEmail")}</label>
            <input
              type="email" value={newAuthEmail} onChange={(e) => setNewAuthEmail(e.target.value)}
              placeholder={authEmail} style={{ width: "100%", padding: "11px 14px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: SB, color: TX, boxSizing: "border-box" }}
            />
          </div>
          <button
            onClick={handleChangeAuthEmail}
            disabled={emailLoading || !newAuthEmail.trim() || newAuthEmail === authEmail}
            style={{ padding: "11px 18px", border: "none", borderRadius: 8, background: newAuthEmail !== authEmail && newAuthEmail.trim() ? AC : "#D3D1C7", color: "#fff", fontSize: 13, fontWeight: 600, cursor: newAuthEmail !== authEmail && newAuthEmail.trim() ? "pointer" : "not-allowed", fontFamily: "inherit", whiteSpace: "nowrap" }}
          >
            {emailLoading ? "..." : t("profile.changeEmail")}
          </button>
        </div>
        {emailMsg && <div style={{ marginTop: 10, padding: "8px 12px", background: "#EAF3DE", border: "1px solid #C6E9B4", borderRadius: 6, fontSize: 12, color: GR }}>{emailMsg}</div>}
        {emailErr && <div style={{ marginTop: 10, padding: "8px 12px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6, fontSize: 12, color: RD }}>{emailErr}</div>}
      </div>

      {/* Sécurité — MFA */}
      <div ref={refFor("security")}><MfaSection /></div>

      {/* Form — Informations */}
      <div ref={refFor("info")} style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 14, padding: "20px 20px 8px", marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 14 }}>{t("profile.personalInfo")}</div>
        <Field label={t("profile.fullName")} value={form.name} onChange={set("name")} placeholder="ex: Gaëlle CNOP" required />
        <div style={{ display: "flex", gap: 10 }}>
          <Field half label={t("profile.structureName")} value={form.structure} onChange={set("structure")} placeholder="ex: DEWIL architecten" required />
          <Field half label={t("profile.structureType")} value={form.structureType} onChange={set("structureType")} select options={STRUCTURE_TYPES} />
        </div>
        <Field label={t("profile.address")} value={form.address} onChange={set("address")} placeholder="ex: Rue de la Loi 12, 1000 Bruxelles" />
        <div style={{ display: "flex", gap: 10 }}>
          <Field half label={t("profile.phone")} value={form.phone} onChange={set("phone")} placeholder="ex: 0474 50 85 80" type="tel" />
          <Field half label={t("profile.email")} value={form.email} onChange={set("email")} placeholder="ex: contact@cabinet.be" type="email" />
        </div>
      </div>

      {/* Signature email */}
      <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 14, padding: "20px 20px 16px", marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 6 }}>Signature email</div>
        <div style={{ fontSize: 11, color: TX3, marginBottom: 12 }}>Ajoutée automatiquement à la fin de vos emails. Vous pouvez coller une image (logo) directement dans l'éditeur.</div>
        <div
          contentEditable
          suppressContentEditableWarning
          role="textbox" aria-label="Signature email" aria-multiline="true"
          onInput={e => set("emailSignature")(e.currentTarget.innerHTML.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "").replace(/\bon\w+\s*=/gi, "data-removed="))}
          onPaste={e => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (const item of items) {
              if (item.type.startsWith("image/")) {
                e.preventDefault();
                const file = item.getAsFile();
                if (!file) return;
                if (file.size > 500000) { alert("Image trop lourde (max 500 Ko)"); return; }
                const reader = new FileReader();
                reader.onload = (ev) => {
                  const img = document.createElement("img");
                  img.src = ev.target.result;
                  img.style.maxHeight = "60px";
                  img.style.maxWidth = "200px";
                  img.style.objectFit = "contain";
                  img.style.display = "block";
                  img.style.marginBottom = "4px";
                  const sel = window.getSelection();
                  if (sel.rangeCount) {
                    const range = sel.getRangeAt(0);
                    range.deleteContents();
                    range.insertNode(img);
                    range.setStartAfter(img);
                    range.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(range);
                  }
                  set("emailSignature")(e.currentTarget.innerHTML);
                };
                reader.readAsDataURL(file);
                return;
              }
            }
          }}
          dangerouslySetInnerHTML={{ __html: form.emailSignature || "" }}
          style={{ width: "100%", minHeight: 100, padding: "10px 12px", border: `1px solid ${SBB}`, borderRadius: 10, fontSize: 12, lineHeight: 1.6, fontFamily: "inherit", background: SB, color: TX, boxSizing: "border-box", outline: "none", overflowWrap: "break-word", whiteSpace: "pre-wrap" }}
        />
        {!form.emailSignature && (
          <button
            onClick={() => {
              const html = `Cordialement,<br>${form.name || "Votre nom"}<br>${form.structure || "Votre bureau"}${form.phone ? "<br>Tél : " + form.phone : ""}${form.email ? "<br>" + form.email : ""}`;
              set("emailSignature")(html);
            }}
            style={{ marginTop: 8, padding: "7px 14px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", fontSize: 11, fontFamily: "inherit", color: AC, fontWeight: 600 }}
          >
            Générer depuis mon profil
          </button>
        )}
      </div>

      {/* Langue */}
      <div ref={refFor("lang")} style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 14, padding: "20px 20px 16px", marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 14 }}>Langue / Language</div>
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { id: "fr", label: "Français", flag: "🇫🇷" },
            { id: "en", label: "English", flag: "🇬🇧" },
          ].map(l => (
            <button key={l.id} onClick={() => set("lang")(l.id)}
              style={{ flex: 1, padding: "12px 14px", border: `2px solid ${form.lang === l.id ? AC : SBB}`, borderRadius: 10, background: form.lang === l.id ? ACL : WH, cursor: "pointer", textAlign: "left", fontFamily: "inherit", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 22 }}>{l.flag}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: form.lang === l.id ? AC : TX }}>{l.label}</span>
            </button>
          ))}
        </div>
      </div>


      {/* Templates */}
      {/* Apparence du PV */}
      <div ref={refFor("appearance")} style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 14, padding: "20px 20px 16px", marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 16 }}>{t("profile.pdfAppearance")}</div>

        {/* Couleur principale */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: TX2, marginBottom: 10 }}>{t("profile.mainColor")}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {COLOR_PRESETS.map((c) => (
              <button
                key={c.value}
                title={c.label}
                onClick={() => set("pdfColor")(c.value)}
                style={{ width: 32, height: 32, borderRadius: 8, background: c.value, border: form.pdfColor === c.value ? `3px solid ${TX}` : "3px solid transparent", cursor: "pointer", padding: 0, transition: "border 0.15s", boxShadow: form.pdfColor === c.value ? "0 0 0 1px #fff inset" : "none" }}
              />
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 4 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: form.pdfColor, border: `2px solid ${SBB}`, overflow: "hidden", flexShrink: 0 }}>
                <input type="color" value={form.pdfColor || "#D97B0D"} onChange={(e) => set("pdfColor")(e.target.value)} style={{ width: 48, height: 48, border: "none", padding: 0, cursor: "pointer", marginTop: -8, marginLeft: -8, opacity: 0, position: "absolute" }} />
                <input type="color" value={form.pdfColor || "#D97B0D"} onChange={(e) => set("pdfColor")(e.target.value)} style={{ width: "100%", height: "100%", border: "none", padding: 0, cursor: "pointer", opacity: 0 }} />
              </div>
              <span style={{ fontSize: 12, color: TX3, fontFamily: "monospace" }}>{(form.pdfColor || "#D97B0D").toUpperCase()}</span>
            </div>
          </div>
        </div>

        {/* Police */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: TX2, marginBottom: 10 }}>{t("profile.font")}</div>
          <div style={{ display: "flex", gap: 8 }}>
            {FONT_OPTIONS.map((f) => (
              <button
                key={f.id}
                onClick={() => set("pdfFont")(f.id)}
                style={{ flex: 1, padding: "10px 12px", border: `2px solid ${form.pdfFont === f.id ? AC : SBB}`, borderRadius: 10, background: form.pdfFont === f.id ? ACL : WH, cursor: "pointer", textAlign: "left", fontFamily: "inherit", transition: "all 0.15s" }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, color: form.pdfFont === f.id ? AC : TX, fontFamily: f.id === "times" ? "Georgia,serif" : "inherit", marginBottom: 2 }}>{f.label}</div>
                <div style={{ fontSize: 11, color: form.pdfFont === f.id ? TX2 : TX3 }}>{f.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Aperçu */}
      <div ref={refFor("preview")} style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 14, padding: "20px 20px 16px", marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 10 }}>{t("profile.templatePreview")}</div>
        <PDFPreview form={form} />
      </div>

      <button
        onClick={() => { onSave(form); setSaved(true); setTimeout(() => setSaved(false), 2500); }}
        disabled={!form.name.trim() || !form.structure.trim()}
        style={{ width: "100%", marginTop: 4, padding: 14, border: "none", borderRadius: 10, background: saved ? GR : (form.name.trim() && form.structure.trim() ? AC : DIS), color: form.name.trim() && form.structure.trim() ? "#fff" : DIST, fontSize: 15, fontWeight: 600, cursor: form.name.trim() && form.structure.trim() ? "pointer" : "not-allowed", fontFamily: "inherit", transition: "all 0.3s", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
      >
        {saved ? <><Ico name="check" size={18} color="#fff" />Enregistré !</> : t("profile.saveSettings")}
      </button>
      </div>{/* end scroll container */}
    </div>
  );
}

function ChecklistsView({ project, setProjects, onBack }) {
  const [activeClId, setActiveClId] = useState(null);
  const [newItemText, setNewItemText] = useState("");
  const newItemRef = useRef(null);
  const t = useT();

  const checklists = project.checklists || [];

  const saveChecklists = (updated) =>
    setProjects((prev) => prev.map((p) => p.id === project.id ? { ...p, checklists: updated } : p));

  // Quick create from template — one click, auto-opens
  const quickCreate = (tplId) => {
    const tpl = CHECKLIST_TEMPLATES.find((t) => t.id === tplId);
    const items = (tpl?.items || []).map((item, i) => ({ id: Date.now() + i, text: item.text, section: item.section || "", checked: false }));
    const cl = { id: Date.now(), name: tpl?.label || "Checklist", createdAt: new Date().toLocaleDateString("fr-BE"), visitDate: "", items };
    saveChecklists([...checklists, cl]);
    setActiveClId(cl.id);
  };

  // Create blank
  const createBlank = () => {
    const cl = { id: Date.now(), name: "Checklist", createdAt: new Date().toLocaleDateString("fr-BE"), visitDate: "", items: [] };
    saveChecklists([...checklists, cl]);
    setActiveClId(cl.id);
  };

  const toggleItem = (clId, itemId) => {
    saveChecklists(checklists.map((c) => c.id !== clId ? c : {
      ...c, items: c.items.map((it) => it.id === itemId ? { ...it, checked: !it.checked } : it),
    }));
  };

  const addItem = (clId) => {
    const text = newItemText.trim();
    if (!text) return;
    saveChecklists(checklists.map((c) => c.id !== clId ? c : {
      ...c, items: [...c.items, { id: Date.now(), text, section: "", checked: false }],
    }));
    setNewItemText("");
    setTimeout(() => newItemRef.current?.focus(), 50);
  };

  const removeItem = (clId, itemId) => {
    saveChecklists(checklists.map((c) => c.id !== clId ? c : {
      ...c, items: c.items.filter((it) => it.id !== itemId),
    }));
  };

  const deleteChecklist = (clId) => {
    saveChecklists(checklists.filter((c) => c.id !== clId));
    if (activeClId === clId) setActiveClId(null);
  };

  const totalChecked = (cl) => cl.items.filter((it) => it.checked).length;
  const tplInfo = (id) => CHECKLIST_TEMPLATES.find((t) => t.id === id) || CHECKLIST_TEMPLATES[0];

  // Group items by section
  const groupedItems = (items) => {
    const sections = [];
    const seen = {};
    items.forEach((it) => {
      const sec = it.section || "";
      if (!seen[sec]) { seen[sec] = true; sections.push(sec); }
    });
    return sections.map((sec) => ({ section: sec, items: items.filter((it) => (it.section || "") === sec) }));
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: "8px", minWidth: 40, minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 }}><Ico name="back" color={TX2} /></button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: TX }}>{t("checklists.title")}</div>
          <div style={{ fontSize: 12, color: TX3 }}>{project.name} · {checklists.length} liste{checklists.length !== 1 ? "s" : ""}</div>
        </div>
      </div>

      {/* Quick create */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        <input
          value={newItemText} onChange={e => setNewItemText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && newItemText.trim()) { const cl = { id: Date.now(), name: newItemText.trim(), createdAt: new Date().toLocaleDateString("fr-BE"), visitDate: "", assignee: "", items: [] }; saveChecklists([...checklists, cl]); setActiveClId(cl.id); setNewItemText(""); } }}
          placeholder="Nom de la checklist..."
          style={{ flex: 1, padding: "9px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: SB, color: TX, boxSizing: "border-box" }}
        />
        <button onClick={() => { if (newItemText.trim()) { const cl = { id: Date.now(), name: newItemText.trim(), createdAt: new Date().toLocaleDateString("fr-BE"), visitDate: "", assignee: "", items: [] }; saveChecklists([...checklists, cl]); setActiveClId(cl.id); setNewItemText(""); } }} disabled={!newItemText.trim()} style={{ padding: "9px 16px", border: "none", borderRadius: 8, background: newItemText.trim() ? AC : DIS, color: newItemText.trim() ? "#fff" : DIST, fontWeight: 600, fontSize: 13, cursor: newItemText.trim() ? "pointer" : "not-allowed", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}>
          <Ico name="plus" size={12} color={newItemText.trim() ? "#fff" : DIST} />Créer
        </button>
      </div>

      {/* Liste des checklists */}
      {checklists.length === 0 && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "50px 20px", border: `2px dashed ${SBB}`, borderRadius: 12, background: WH, textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: ACL, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Ico name="listcheck" size={26} color={AC} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: TX, marginTop: 14, marginBottom: 6 }}>{t("checklists.noChecklists")}</div>
          <div style={{ fontSize: FS.md, color: TX3, marginBottom: SP.lg }}>{t("checklists.noChecklistsDesc")}</div>
          <div style={{ fontSize: FS.sm, color: TX3 }}>Utilisez le champ ci-dessus pour créer votre première checklist.</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {checklists.map((cl) => {
          const checked = totalChecked(cl);
          const total = cl.items.length;
          const pct = total > 0 ? Math.round((checked / total) * 100) : 0;
          const isOpen = activeClId === cl.id;
          const groups = groupedItems(cl.items);

          return (
            <div key={cl.id} style={{ background: WH, border: `1px solid ${isOpen ? ACL2 : SBB}`, borderRadius: 12, overflow: "hidden", transition: "border-color 0.15s" }}>
              {/* En-tête checklist */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: "pointer" }} onClick={() => setActiveClId(isOpen ? null : cl.id)}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: pct === 100 ? "#EAF3DE" : SB, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Ico name={pct === 100 ? "check" : "listcheck"} size={16} color={pct === 100 ? GR : TX3} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {isOpen ? (
                    <input
                      value={cl.name}
                      onChange={(e) => saveChecklists(checklists.map(c => c.id !== cl.id ? c : { ...c, name: e.target.value }))}
                      onClick={(e) => e.stopPropagation()}
                      style={{ fontSize: 14, fontWeight: 600, color: TX, border: "none", background: "transparent", padding: 0, width: "100%", fontFamily: "inherit", outline: "none", borderBottom: `1px solid ${SBB}` }}
                    />
                  ) : (
                    <div style={{ fontSize: 14, fontWeight: 600, color: TX }}>{cl.name}</div>
                  )}
                  <div style={{ fontSize: 11, color: TX3, marginTop: 2, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span>{checked}/{total}</span>
                    {pct === 100 && <span style={{ color: GR, fontWeight: 600 }}>{t("checklists.completed")}</span>}
                    <input
                      type="date"
                      value={cl.visitDate || ""}
                      onChange={(e) => saveChecklists(checklists.map(c => c.id !== cl.id ? c : { ...c, visitDate: e.target.value }))}
                      onClick={(e) => e.stopPropagation()}
                      style={{ fontSize: 10, border: `1px solid ${SBB}`, borderRadius: 5, padding: "1px 5px", background: SB, color: TX, fontFamily: "inherit" }}
                    />
                    <select
                      value={cl.assignee || ""}
                      onChange={(e) => saveChecklists(checklists.map(c => c.id !== cl.id ? c : { ...c, assignee: e.target.value }))}
                      onClick={(e) => e.stopPropagation()}
                      style={{ fontSize: 10, border: `1px solid ${SBB}`, borderRadius: 5, padding: "1px 5px", background: cl.assignee ? ACL : SB, color: cl.assignee ? AC : TX, fontFamily: "inherit", cursor: "pointer" }}
                    >
                      <option value="">Non attribué</option>
                      {(project.participants || []).map((p, i) => (
                        <option key={i} value={p.name}>{p.name} ({p.role})</option>
                      ))}
                    </select>
                  </div>
                  {total > 0 && (
                    <div style={{ marginTop: 5, width: "100%", height: 4, borderRadius: 4, background: SB2, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", borderRadius: 4, background: pct === 100 ? GR : AC, transition: "width 0.3s" }} />
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {total > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: pct === 100 ? GR : AC, minWidth: 36, textAlign: "right" }}>{pct}%</span>}
                  <button onClick={(e) => { e.stopPropagation(); const copy = { ...cl, id: Date.now(), name: cl.name + " (copie)", createdAt: new Date().toLocaleDateString("fr-BE"), items: cl.items.map(it => ({ ...it, id: Date.now() + Math.random(), checked: false })) }; saveChecklists([...checklists, copy]); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 6 }} title={t("checklists.duplicateEmpty")}>
                    <Ico name="dup" size={14} color={TX3} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); deleteChecklist(cl.id); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 6 }}>
                    <Ico name="trash" size={14} color={TX3} />
                  </button>
                  <Ico name={isOpen ? "x" : "back"} size={14} color={TX3} />
                </div>
              </div>

              {/* Détail items */}
              {isOpen && (
                <div style={{ borderTop: `1px solid ${SBB}`, padding: "12px 16px 16px" }}>
                  {cl.items.length === 0 && (
                    <div style={{ fontSize: 13, color: TX3, fontStyle: "italic", marginBottom: 12 }}>Aucun point — ajoutez-en ci-dessous.</div>
                  )}

                  {groups.map(({ section, items }) => (
                    <div key={section} style={{ marginBottom: 8 }}>
                      {section && (
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 6, marginTop: 4 }}>{section}</div>
                      )}
                      {items.map((it) => (
                        <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: `1px solid ${SB}` }}>
                          <button
                            onClick={() => toggleItem(cl.id, it.id)}
                            style={{ width: 24, height: 24, borderRadius: RAD.sm, border: `2px solid ${it.checked ? GR : SBB}`, background: it.checked ? GR : WH, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0, transition: "all 0.15s" }}
                          >
                            {it.checked && <Ico name="check" size={12} color="#fff" />}
                          </button>
                          <span style={{ flex: 1, fontSize: 13, color: it.checked ? TX3 : TX, textDecoration: it.checked ? "line-through" : "none", lineHeight: 1.4, transition: "all 0.15s" }}>{it.text}</span>
                          <button onClick={() => removeItem(cl.id, it.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, opacity: 0.4, flexShrink: 0 }}>
                            <Ico name="x" size={12} color={TX3} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ))}

                  {/* Ajouter un point */}
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <input
                      ref={newItemRef}
                      value={newItemText}
                      onChange={(e) => setNewItemText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addItem(cl.id)}
                      placeholder={t("checklists.addPlaceholder")}
                      style={{ flex: 1, padding: "8px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: SB, color: TX, outline: "none" }}
                    />
                    <button onClick={() => addItem(cl.id)} disabled={!newItemText.trim()} style={{ padding: "8px 14px", border: "none", borderRadius: 8, background: newItemText.trim() ? AC : DIS, color: newItemText.trim() ? "#fff" : DIST, fontWeight: 600, fontSize: 13, cursor: newItemText.trim() ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
                      {t("add")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SearchModal({ projects, onClose, onOpen }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50); }, []);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const results = q.length < 2 ? [] : projects.flatMap((proj) =>
    (proj.pvHistory || []).flatMap((pv) => {
      const content = pv.content || "";
      const idx = content.toLowerCase().indexOf(q);
      if (idx === -1) return [];
      const start = Math.max(0, idx - 60);
      const end   = Math.min(content.length, idx + 70);
      let snippet = content.slice(start, end).replace(/\n/g, " ").trim();
      if (start > 0) snippet = "…" + snippet;
      if (end < content.length) snippet += "…";
      return [{ proj, pv, snippet }];
    })
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 300, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "56px 16px 16px" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: WH, borderRadius: 14, width: "100%", maxWidth: 600, maxHeight: "75vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        {/* Barre de recherche */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 16px", borderBottom: `1px solid ${SBB}` }}>
          <Ico name="search" size={18} color={TX3} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher dans les PV…"
            style={{ flex: 1, border: "none", outline: "none", fontSize: 15, color: TX, background: "transparent", fontFamily: "inherit" }}
          />
          {query && (
            <button onClick={() => setQuery("")} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
              <Ico name="x" size={16} color={TX3} />
            </button>
          )}
          <button onClick={onClose} style={{ background: "none", border: `1px solid ${SBB}`, borderRadius: 4, cursor: "pointer", padding: "2px 7px", fontSize: 12, color: TX3, fontFamily: "inherit" }}>Échap</button>
        </div>

        {/* Résultats */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {q.length < 2 ? (
            <div style={{ padding: "40px 20px", textAlign: "center", color: TX3, fontSize: 13 }}>Tapez au moins 2 caractères pour rechercher dans les PV</div>
          ) : results.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center" }}>
              <Ico name="search" size={32} color={TX3} />
              <div style={{ fontSize: 14, color: TX2, marginTop: 12 }}>Aucun résultat pour « {query} »</div>
            </div>
          ) : (
            results.map((r, i) => (
              <button
                key={i}
                onClick={() => { onOpen(r.proj.id, r.pv); onClose(); }}
                style={{ width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: `1px solid ${SBB}`, cursor: "pointer", padding: "12px 16px", fontFamily: "inherit" }}
                onMouseEnter={(e) => e.currentTarget.style.background = SB}
                onMouseLeave={(e) => e.currentTarget.style.background = "none"}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: AC }}>PV n°{r.pv.number}</span>
                  <span style={{ fontSize: 11, color: TX3 }}>{r.pv.date}</span>
                  <span style={{ fontSize: 11, color: TX3, marginLeft: "auto", whiteSpace: "nowrap" }}>{r.proj.name}</span>
                </div>
                <div style={{ fontSize: 12, color: TX2, lineHeight: 1.55 }}>{r.snippet}</div>
              </button>
            ))
          )}
        </div>

        {results.length > 0 && (
          <div style={{ padding: "8px 16px", borderTop: `1px solid ${SBB}`, fontSize: 11, color: TX3 }}>
            {results.length} résultat{results.length > 1 ? "s" : ""} trouvé{results.length > 1 ? "s" : ""}
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [projects, setProjects] = useState(INIT_PROJECTS);
  const [activeId, setActiveId] = useState(1);
  const [dbLoaded, setDbLoaded] = useState(false);
  const [view, _setView] = useState("overview");
  const setView = (v) => { _setView(v); track("page_viewed", { _page: v }); };
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [captureSheet, setCaptureSheet] = useState(false);
  const [gallerySheet, setGallerySheet] = useState(false);
  const [projectPicker, setProjectPicker] = useState(false);
  const [pickerTab, setPickerTab] = useState("projects"); // "projects" | "dashboard"
  const mobilePhotoRef = useRef(null);
  const galleryInputRef = useRef(null);
  const [modal, setModal] = useState(null);
  const [modalData, setModalData] = useState(null);
  const [newP, setNewP] = useState({ name: "", client: "", contractor: "", street: "", number: "", postalCode: "", city: "", country: "Belgique", desc: "", startDate: "", recurrence: "none", statusId: "sketch", postTemplate: "general", pvTemplate: "standard", remarkNumbering: "none" });
  const [editInfo, setEditInfo] = useState({});
  const [editParts, setEditParts] = useState([]);
  const [profile, setProfile] = useState(INIT_PROFILE);
  const [profileSaved, setProfileSaved] = useState(false);
  // Sync newP template defaults when profile loads
  useEffect(() => {
    setNewP(p => ({ ...p, postTemplate: profile.postTemplate || "general", pvTemplate: profile.pvTemplate || "standard", remarkNumbering: profile.remarkNumbering || "none" }));
  }, [profile.postTemplate, profile.pvTemplate, profile.remarkNumbering]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showReconnected, setShowReconnected] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [storageWarning, setStorageWarning] = useState(false);
  const [pvRecipients, setPvRecipients] = useState([]); // [] = tous
  const [pvTitle, setPvTitle] = useState("");
  const [pvFieldData, setPvFieldData] = useState({}); // attendance, visitStart, visitEnd
  const [showSearch, setShowSearch] = useState(false);
  const [importPV, setImportPV] = useState({ number: "", date: "", author: "", pdfDataUrl: null, fileName: "" });
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };
  const importPVRef = useRef(null);
  const t = useT();

  // ── Collaboration state ──
  const [sharedProjects, setSharedProjects] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [invitations, setInvitations] = useState([]);

  // Load data from Supabase on mount
  useEffect(() => {
    (async () => {
      try {
        const [cloudData, cloudProfile] = await Promise.all([
          dbLoadProjects().catch(e => { console.error("loadProjects failed:", e); return null; }),
          dbLoadProfile().catch(e => { console.error("loadProfile failed:", e); return null; }),
        ]);
        if (cloudData) {
          if (cloudData.projects && cloudData.projects.length > 0) setProjects(cloudData.projects);
          if (cloudData.activeId) setActiveId(cloudData.activeId);
        }
        if (cloudProfile) setProfile(cloudProfile);
      } catch (e) { console.error("Initial load error:", e); }
      setDbLoaded(true);
      track("login", { _page: "app" });
      // Load collaboration data (non-blocking)
      loadSharedProjects().then(setSharedProjects).catch(() => {});
      loadNotifications().then(setNotifications).catch(() => {});
      loadMyInvitations().then(setInvitations).catch(() => {});
    })();
  }, []);

  // Subscribe to realtime notifications
  useEffect(() => {
    let unsub;
    try {
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) return;
        unsub = subscribeToNotifications(user.id, (notif) => {
          setNotifications(prev => [notif, ...prev]);
          if (notif.type === "invite") loadMyInvitations().then(setInvitations).catch(() => {});
        });
      }).catch(() => {});
    } catch (e) { console.error("Notification subscription error:", e); }
    return () => { try { unsub?.(); } catch {} };
  }, []);

  // Save projects + activeId to Supabase + localStorage
  useEffect(() => {
    if (!dbLoaded) return;
    try { localStorage.setItem("archipilot_projects", JSON.stringify(projects)); } catch { setStorageWarning(true); setTimeout(() => setStorageWarning(false), 5000); }
    try { localStorage.setItem("archipilot_activeId", String(activeId)); } catch {}
    dbSaveProjects(projects, activeId);
  }, [projects, activeId, dbLoaded]);

  // Détection online/offline + sync au retour
  useEffect(() => {
    const processOfflineQueue = async () => {
      const queue = getOfflineQueue();
      if (queue.length === 0) return;
      let processed = 0;
      for (const item of queue) {
        try {
          if (item.type === "photo_upload") {
            // Photos with dataUrl are already saved in projects via localStorage
            // They'll be synced to Supabase via the normal dbSaveProjects flow
            processed++;
          }
        } catch (e) { console.error("Offline queue process error:", e); }
      }
      if (processed > 0) {
        clearOfflineQueue();
        // Force a full sync
        dbSaveProjects(projects, activeId);
      }
    };

    const goOnline = () => {
      setIsOnline(true);
      setShowReconnected(true);
      setTimeout(() => setShowReconnected(false), 3000);
      // Sync queued items
      processOfflineQueue();
      // Re-sync projects to Supabase
      if (dbLoaded) dbSaveProjects(projects, activeId);
    };
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); };
  }, [projects, activeId, dbLoaded]);

  // Prompt d'installation PWA
  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // Escape key closes modals
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") { setModal(null); setShowSearch(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") setInstallPrompt(null);
  };

  const saveProfile = (data) => {
    setProfile(data);
    try { localStorage.setItem("archipilot_profile", JSON.stringify(data)); } catch {}
    dbSaveProfile(data);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2000);
  };

  const project = projects.find((p) => p.id === activeId) || sharedProjects.find((p) => p.id === activeId);
  const updateProject = (id, u) => setProjects((prev) => prev.map((p) => p.id === id ? { ...p, ...u } : p));
  const canCreate = newP.name.trim() && newP.client.trim() && newP.contractor.trim() && newP.city?.trim() && newP.startDate.trim();

  const createProject = () => {
    const id = Math.max(...projects.map((p) => p.id), 0) + 1;
    const address = formatAddress(newP);
    const tpl = POST_TEMPLATES.find(t => t.id === newP.postTemplate) || POST_TEMPLATES[0];
    const posts = tpl.posts.map(p => ({ id: p.id, label: p.label, notes: "", remarks: [] }));
    setProjects((prev) => [...prev, { id, ...newP, address, progress: 0, bureau: profile.structure, endDate: "", nextMeeting: "", archived: false, participants: [{ role: "Architecte", name: profile.name, email: profile.email, phone: profile.phone }], posts: posts.length > 0 ? posts : [{ id: "01", label: "Situation du chantier", notes: "" }], pvHistory: [], actions: [], planImage: null, planMarkers: [], planStrokes: [], documents: [], lots: [], checklists: [], customFields: [] }]);
    setActiveId(id); setView("overview"); setModal(null);
    setNewP({ name: "", client: "", contractor: "", street: "", number: "", postalCode: "", city: "", country: "Belgique", desc: "", startDate: "", recurrence: "none", statusId: "sketch", postTemplate: profile.postTemplate || "general", pvTemplate: profile.pvTemplate || "standard", remarkNumbering: profile.remarkNumbering || "none" });
    track("project_created", { project_name: newP.name, _page: "overview" });
  };

  const duplicateProject = () => {
    const id = Math.max(...projects.map((p) => p.id), 0) + 1;
    setProjects((prev) => [...prev, { ...project, id, name: project.name + " (copie)", pvHistory: [], actions: [], posts: project.posts.map((po) => ({ ...po, notes: "", photos: [] })), archived: false, planImage: null, planMarkers: [], planStrokes: [], documents: [], lots: [], checklists: [] }]);
    setActiveId(id);
    showToast("Projet dupliqué avec succès");
  };

  const VIEW_LABELS = { overview: "", notes: t("view.notes"), result: t("view.result"), plan: "Documents", planning: t("view.planning"), checklists: t("view.checklists"), profile: t("view.profile"), stats: "Dashboard" };

  // ── Global keyboard shortcuts ──
  useEffect(() => {
    const onKey = (e) => {
      // Don't trigger in inputs/textareas/contenteditable
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.contentEditable === "true") return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === "k") { e.preventDefault(); setShowSearch(true); }
      if (ctrl && e.key === "n") { e.preventDefault(); setModal("new"); }
      if (ctrl && e.key === "b") { e.preventDefault(); setSidebarOpen(v => !v); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <ErrorBoundary>
    <LangContext.Provider value={profile.lang || "fr"}>
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", display: "flex", minHeight: "100vh", background: BG }}>
      <style>{`
        @keyframes sp { to { transform: rotate(360deg) } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes modalIn { from { opacity: 0; transform: scale(0.97) } to { opacity: 1; transform: scale(1) } }
        @keyframes ring { 0% { box-shadow: 0 0 0 0 rgba(196,57,42,0.45) } 70% { box-shadow: 0 0 0 18px rgba(196,57,42,0) } 100% { box-shadow: 0 0 0 0 rgba(196,57,42,0) } }
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes skeleton { 0%, 100% { opacity: 0.4 } 50% { opacity: 0.8 } }
        *:focus-visible { outline: 2px solid ${AC}; outline-offset: 2px }
        *:focus:not(:focus-visible) { outline: none }
        input::placeholder, textarea::placeholder { color: ${TX3} }
        * { scrollbar-width: thin; scrollbar-color: ${SBB} transparent; line-height: ${LH.normal} }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
        }
        button { transition: filter 0.15s, transform 0.1s; }
        button:not([disabled]):not(.sidebar-logout):hover { filter: brightness(0.92); }
        button:not([disabled]):active { transform: scale(0.97); }
        .ap-note-step-nav { display: none; }
        .ap-profile-card:active { background: ${SB} !important; border-color: ${AC}40 !important; }
        .sb-avatar:hover { border-color: ${AC} !important; }
        .sb-profile-text:hover div:first-child { color: ${AC} !important; }
        .sb-logout-icon:hover { background: ${SB2} !important; }
        .sb-logout-icon:active { transform: scale(0.92); }
        .sb-project:hover { background: ${SB2} !important; }
        .sb-client:hover { background: ${SB2} !important; }
        .sb-nav:hover { background: ${SB2} !important; }
        .sb-nav:hover span { color: ${TX} !important; }
        .sb-cta:hover { filter: brightness(1.06) !important; }
        .method-card-dictate:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(217,123,13,0.18); }
        .method-card-write:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(0,0,0,0.06); border-color: ${TX3} !important; }
        .ap-view-enter { animation: fadeIn 0.18s ease-out; }
        .profile-nav-item:hover { background: ${SB} !important; }
        .plan-folder-row:hover { background: ${SB}; }
        .plan-file-row:hover { background: ${SB}; }
        a[href]:hover { opacity: 0.85; }

        /* ── Tablet & Mobile Responsive ── */
        @media (max-width: 1024px) {
          /* Sidebar as overlay on tablet */
          .ap-sidebar-overlay {
            position: fixed; inset: 0; background: rgba(0,0,0,0.3);
            z-index: 99; display: none;
          }
          .ap-sidebar-overlay.open { display: block; }

          /* Main content never offset by sidebar */
          .ap-main { margin-left: 0 !important; }
        }

        /* Tablet landscape — intermediate layout */
        @media (max-width: 900px) {
          .ap-overview-grid { flex-direction: column !important; }
          .ap-overview-grid > div { flex: 1 1 100% !important; min-width: 0 !important; }
          .ap-note-layout { flex-direction: column !important; }
          .ap-note-layout > div { flex: 1 1 100% !important; max-width: 100% !important; width: 100% !important; }
        }

        @media (max-width: 768px) {
          /* Bigger touch targets */
          button, a, select, label { min-height: 44px; }
          input, textarea, select { font-size: 16px !important; } /* prevent iOS zoom */

          /* Header compact */
          .ap-header { padding: 8px 12px !important; gap: 8px !important; }
          .ap-header .ap-search-pill { display: none !important; }
          .ap-header .ap-profile-text { display: none !important; }
          .ap-header .ap-project-name { max-width: 140px !important; font-size: 14px !important; }
          .ap-header .ap-project-meta { max-width: 160px !important; }

          /* Hide header on profile page — profile has its own header */
          body:has(.ap-profile-mobile) .ap-header { display: none !important; }

          /* Overview secondary column — handled by mobile cards */

          /* Documents — mobile: consultation only */
          .ap-docs-header { display: none !important; }
          .ap-docs-upload { display: none !important; }
          .ap-docs-mobile-title { display: flex !important; }
          .ap-docs-tabs { flex-wrap: nowrap !important; overflow-x: auto !important; scrollbar-width: none !important; padding-bottom: 2px !important; }
          .ap-doc-actions-desktop { display: none !important; }
          .ap-doc-actions-mobile { display: none !important; }
          .ap-doc-row { cursor: pointer !important; }
          .ap-doc-row:active { background: ${SB} !important; }

          /* PlanManager — consultation only on mobile */
          .ap-plan-header { display: none !important; }
          .ap-plan-actions-bar { display: none !important; }
          .ap-plan-formats { display: none !important; }
          .ap-plan-item-actions { display: none !important; }
          .ap-plan-folder-actions { display: none !important; }
          .plan-file-row { cursor: pointer !important; }
          .plan-file-row:active { background: ${SB} !important; }

          /* Content area tighter padding */
          .ap-content { padding: 14px 5% 0 !important; max-width: 100% !important; margin: 0 !important; width: 100% !important; box-sizing: border-box !important; }

          /* Overview: single column */
          .ap-overview-grid { flex-direction: column !important; }
          .ap-overview-grid > div { flex: 1 1 100% !important; min-width: 0 !important; }

          /* Stats KPI: 2 columns */
          .ap-kpi-row { flex-wrap: wrap !important; }
          .ap-kpi-row > div { flex: 1 1 45% !important; min-width: 120px !important; }

          /* Modals full-screen on mobile */
          .ap-modal-card {
            max-width: 100% !important; max-height: 100% !important;
            border-radius: 0 !important; height: 100% !important;
          }

          /* NoteEditor: full width post list */
          .ap-note-layout { flex-direction: column !important; }
          .ap-note-layout > div { flex: 1 1 100% !important; max-width: 100% !important; width: 100% !important; }
        }

        @media (max-width: 480px) {
          /* Extra small: KPI 2x2 minimum instead of 1 column */
          .ap-kpi-row > div { flex: 1 1 45% !important; min-width: 0 !important; }
        }

        /* Touch-friendly: larger active area */
        @media (pointer: coarse) {
          button:not([disabled]):active { transform: scale(0.95); }
          .ap-touch-btn { min-height: 48px; padding: 12px 16px !important; }
        }

        /* Safe area insets for notched devices (iPhone X+) */
        @supports (padding: env(safe-area-inset-top)) {
          .ap-header { padding-top: max(10px, env(safe-area-inset-top)) !important; }
          .ap-content { padding-bottom: max(20px, env(safe-area-inset-bottom)) !important; }
          .ap-modal-card { padding-bottom: env(safe-area-inset-bottom) !important; }
        }

        /* Landscape phone — constrained height */
        @media (max-height: 500px) and (orientation: landscape) {
          .ap-header { padding: 4px 12px !important; }
          .ap-modal-card { max-height: 100% !important; height: 100% !important; border-radius: 0 !important; }
        }

        /* ── Mobile: bottom tab bar replaces sidebar ── */
        @media (max-width: 768px) {
          .ap-mobile-bar { display: block !important; }
          .ap-sidebar-desktop { display: none !important; }
          .ap-sidebar-overlay { display: none !important; }
          .ap-hamburger { display: none !important; }
          .ap-back-btn { display: none !important; }

          /* NoteEditor — mobile stepper */
          .ap-note-mobile-stepper { display: block !important; }
          .ap-note-desktop-header { display: none !important; }

          /* Mobile step process — viewport-fit wizard */
          .ap-note-container {
            display: flex !important;
            flex-direction: column !important;
            height: calc(100dvh - 52px - 72px) !important;
            max-height: calc(100dvh - 52px - 72px) !important;
            overflow: hidden !important;
            padding: 0 8px !important;
            margin: 0 !important;
          }
          .ap-note-mobile-stepper {
            flex-shrink: 0 !important;
          }
          .ap-note-section-0,
          .ap-note-section-1,
          .ap-note-section-2 {
            display: none !important;
            flex-direction: column;
            min-height: 0;
          }
          .ap-note-container[data-mobile-step="0"] .ap-note-section-0,
          .ap-note-container[data-mobile-step="1"] .ap-note-section-1,
          .ap-note-container[data-mobile-step="2"] .ap-note-section-2 {
            display: flex !important;
            flex: 1 1 0 !important;
            min-height: 0 !important;
          }
          .ap-note-step-content {
            flex: 1 1 0 !important;
            overflow-y: auto !important;
            min-height: 0 !important;
            display: flex !important;
            flex-direction: column !important;
            -webkit-overflow-scrolling: touch;
          }
          .ap-section-card {
            flex: 0 0 auto !important;
            min-height: 0 !important;
            display: flex !important;
            flex-direction: column !important;
            margin-bottom: 0 !important;
          }
          .ap-carried-reminder { display: none !important; }
          .ap-gen-next-steps { display: none !important; }
          .ap-delete-all-btn { display: none !important; }
          .ap-note-step-nav {
            display: block !important;
            flex-shrink: 0;
            padding: 8px 0 6px;
          }
          /* Method chooser — cards are horizontal on mobile, no need to compact */
          /* Post list — compact rows + scrollable */
          .ap-post-list {
            flex: 1 1 0;
            min-height: 0;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
            padding: 4px 6px 2px !important;
          }
          .ap-post-row { margin-bottom: 3px !important; }
          .ap-post-row > div:last-child { padding: 5px 10px 5px 8px !important; }
          /* Section headers — tighter */
          .ap-note-step-content .ap-section-hdr { padding: 7px 12px !important; }
          /* Step 2 — compact generate card */
          .ap-gen-header { padding: 10px 14px !important; }
          .ap-gen-stats > div { padding: 7px 6px !important; }
          .ap-gen-attendance { padding: 8px 14px 0 !important; }
          .ap-gen-visit { padding: 4px 14px 8px !important; }
          .ap-gen-cta { padding: 8px 14px 10px !important; }
          .ap-main { margin-left: 0 !important; padding-bottom: 72px !important; }
          .ap-project-name-desktop { display: none !important; }
          .ap-project-switcher { display: block !important; }
          .ap-header > div:first-child { flex: 1 1 0 !important; min-width: 0 !important; }

          /* Overview mobile optimizations */
          .ap-context-bar { display: none !important; }
          .ap-quick-tools { display: none !important; }
          .ap-mobile-quickstats { display: none !important; }
          .ap-cta-newpv { padding: 12px 16px !important; font-size: 13px !important; border-radius: 10px !important; }
          .ap-overview-wrap { max-width: 100% !important; margin: 0 !important; width: 100% !important; }
          .ap-mobile-dashboard { width: 100% !important; }
          .ap-cta-newpv { width: 100% !important; box-sizing: border-box !important; }
          .ap-info-grid { grid-template-columns: 1fr !important; gap: ${SP.md}px !important; }
          .ap-admin-actions { flex-direction: column !important; }
          .ap-admin-actions button { width: 100% !important; justify-content: center !important; padding: ${SP.sm + 2}px ${SP.lg}px !important; }

          /* Mobile: flatten both columns into a single flow */
          .ap-col-main { display: contents !important; }
          .ap-overview-side { display: contents !important; }

          /* Mobile: show new dashboard, hide desktop secondary column */
          .ap-mobile-dashboard { display: flex !important; }
          .ap-overview-side { display: none !important; }

          /* Mobile: hide desktop-only sections and old mobile sections */
          .ap-section-pv { display: none !important; }
          .ap-section-actions { display: none !important; }
          .ap-quick-tools { display: none !important; }
          .ap-mobile-shortcuts { display: none !important; }
          .ap-mobile-participants { display: none !important; }
          .ap-mobile-infos { display: none !important; }

          /* Mobile priority order: CTA → Dashboard */
          .ap-cta-newpv { order: 1 !important; }
          .ap-mobile-dashboard { order: 2 !important; }
        }

        @keyframes sheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>
      <div className="ap-sidebar-desktop">
        <Sidebar projects={projects} activeId={activeId} view={view} onSelect={(id) => { setActiveId(id); setView("overview"); }} open={sidebarOpen} onClose={() => setSidebarOpen(false)} profile={profile} onNewProject={() => setModal("new")} onProfile={() => { setView("profile"); }} installable={!!installPrompt} onInstall={handleInstall} sharedProjects={sharedProjects} onSelectShared={(p) => { setActiveId(p.id); setView("overview"); }} onStats={() => { setView("stats"); }} onPlanning={() => { setView("planningDashboard"); }} />
      </div>

      {/* Sidebar overlay for tablet/mobile */}
      {sidebarOpen && <div className="ap-sidebar-overlay open" onClick={() => setSidebarOpen(false)} />}

      <div className="ap-main" style={{ marginLeft: sidebarOpen ? 264 : 0, flex: 1, transition: "margin-left 0.25s", minWidth: 0 }}>
        <div className="ap-header" style={{ padding: "10px 20px", background: WH, borderBottom: `1px solid ${SBB}`, display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 50 }}>
          {/* Gauche — hamburger + retour + contexte projet */}
          <div style={{ display: "flex", alignItems: "center", gap: SP.sm, flex: "0 0 auto", minWidth: 0 }}>
            <button className="ap-hamburger" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label={sidebarOpen ? "Fermer le menu" : "Ouvrir le menu"} style={{ background: "none", border: "none", cursor: "pointer", padding: SP.sm, minWidth: 40, minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: RAD.md }}>
              <Ico name={sidebarOpen ? "x" : "menu"} color={TX2} />
            </button>
            {/* Bouton retour — visible dans les vues profondes */}
            {view !== "overview" && view !== "stats" && view !== "profile" && (
              <button onClick={() => setView("overview")} aria-label="Retour à l'aperçu" className="sb-nav ap-back-btn" style={{ background: "none", border: "none", cursor: "pointer", padding: SP.xs, minWidth: 32, minHeight: 32, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: RAD.sm }}>
                <Ico name="back" size={16} color={TX2} />
              </button>
            )}
            <div style={{ minWidth: 0 }}>
              {view === "profile" ? (
                <div style={{ fontSize: FS.lg, fontWeight: 600, color: TX }}>Mon profil</div>
              ) : view === "stats" ? (
                <>
                <button className="ap-project-switcher" onClick={() => { setPickerTab("dashboard"); setProjectPicker(v => !v); }} style={{ display: "none", background: projectPicker ? SB2 : SB, border: "none", cursor: "pointer", padding: `${SP.sm}px ${SP.md}px`, fontFamily: "inherit", textAlign: "left", minWidth: 0, width: "100%", borderRadius: RAD.lg, transition: "background 0.15s" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: SP.sm }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: TX, lineHeight: LH.tight }}>Dashboard</span>
                    </div>
                    <div style={{ width: 24, height: 24, borderRadius: "50%", background: projectPicker ? ACL : SB2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.2s" }}>
                      <Ico name="chevron-down" size={12} color={projectPicker ? AC : TX3} />
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: SP.xs, marginTop: 3 }}>
                    <span style={{ fontSize: FS.xs, color: TX3 }}>{projects.filter(p => !p.archived).length} projets actifs</span>
                  </div>
                </button>
                <div className="ap-project-name-desktop" style={{ fontSize: FS.lg, fontWeight: 600, color: TX }}>Dashboard</div>
                </>
              ) : (
                <>
                  <button className="ap-project-switcher" onClick={() => { setPickerTab("projects"); setProjectPicker(v => !v); }} style={{ display: "none", background: projectPicker ? SB2 : SB, border: "none", cursor: "pointer", padding: `${SP.sm}px ${SP.md}px`, fontFamily: "inherit", textAlign: "left", minWidth: 0, width: "100%", borderRadius: RAD.lg, transition: "background 0.15s" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: SP.sm }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span role="heading" aria-level="1" style={{ fontSize: 16, fontWeight: 700, color: TX, lineHeight: LH.tight, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{project?.name}</span>
                      </div>
                      <div style={{ width: 24, height: 24, borderRadius: "50%", background: projectPicker ? ACL : SB2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.2s" }}>
                        <Ico name="chevron-down" size={12} color={projectPicker ? AC : TX3} />
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: SP.xs, marginTop: 3, flexWrap: "wrap" }}>
                      {project && <span style={{ fontSize: FS.xs, fontWeight: 600, color: getStatus(project.statusId).color, background: getStatus(project.statusId).bg, padding: "1px 6px", borderRadius: 4 }}>{getStatus(project.statusId).label}</span>}
                      <span style={{ fontSize: FS.xs, color: TX3 }}>{project?.client}</span>
                      {VIEW_LABELS[view] ? <><span style={{ fontSize: FS.xs, color: TX3 }}>·</span><span style={{ fontSize: FS.xs, color: AC, fontWeight: 600 }}>{VIEW_LABELS[view]}</span></> : null}
                    </div>
                  </button>
                  <div className="ap-project-name-desktop" style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: SP.sm }}>
                      <span role="heading" aria-level="1" className="ap-project-name" style={{ fontSize: FS.lg, fontWeight: 600, color: TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }}>{project?.name}</span>
                      {project && <StatusBadge statusId={project.statusId} small />}
                    </div>
                    <div className="ap-project-meta" style={{ fontSize: FS.sm, color: TX3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 }}>
                      {VIEW_LABELS[view] ? <><span style={{ color: AC, fontWeight: 600 }}>{VIEW_LABELS[view]}</span> · </> : ""}{project?.client}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Centre — barre de recherche pilule */}
          <div className="ap-search-pill" style={{ flex: 1, display: "flex", justifyContent: "center" }}>
            <button onClick={() => setShowSearch(true)} aria-label="Rechercher" style={{ display: "flex", alignItems: "center", gap: 8, background: "#F2F2F0", border: "none", borderRadius: 999, padding: "8px 18px", cursor: "text", width: "100%", maxWidth: 400, fontFamily: "inherit" }}>
              <Ico name="search" size={15} color={TX3} />
              <span style={{ fontSize: FS.md, color: TX3, fontWeight: 400 }}>Rechercher...</span>
            </button>
          </div>

          {/* Droite — notifications + profil */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, flex: "0 0 auto" }}>
          {/* Notification bell */}
          <div style={{ position: "relative" }}>
            <button onClick={() => setShowNotifications(p => !p)} aria-label="Notifications" style={{ background: "none", border: "none", cursor: "pointer", padding: SP.sm, borderRadius: RAD.md, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
              <Ico name="bell" size={18} color={TX2} />
              {(() => { const unread = notifications.filter(n => !n.read).length + invitations.length; return unread > 0 ? (
                <span style={{ position: "absolute", top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 8, background: RD, border: "2px solid #fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#fff", padding: "0 3px", lineHeight: 1 }}>{unread > 9 ? "9+" : unread}</span>
              ) : null; })()}
            </button>
            {showNotifications && (
              <div style={{ position: "absolute", top: "100%", right: 0, width: 340, maxHeight: 400, overflowY: "auto", background: WH, border: `1px solid ${SBB}`, borderRadius: 12, boxShadow: "0 8px 30px rgba(0,0,0,0.12)", zIndex: 200, animation: "fadeIn 0.15s ease-out" }}>
                <div style={{ padding: "14px 16px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${SBB}` }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: TX }}>{t("notif.title")}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {notifications.some(n => !n.read) && (
                      <button onClick={() => { markAllNotificationsRead(); setNotifications(prev => prev.map(n => ({ ...n, read: true }))); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: AC, fontWeight: 600, fontFamily: "inherit" }}>{t("notif.markAllRead")}</button>
                    )}
                    {notifications.length > 0 && (
                      <button onClick={() => { deleteAllNotifications(); setNotifications([]); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: RD, fontWeight: 600, fontFamily: "inherit" }}>Tout supprimer</button>
                    )}
                  </div>
                </div>
                {/* Pending invitations */}
                {invitations.length > 0 && invitations.map(inv => (
                  <div key={inv.id} style={{ padding: "12px 16px", borderBottom: `1px solid ${SBB}`, background: ACL }}>
                    <div style={{ fontSize: 12, color: TX, marginBottom: 8 }}>
                      {t("notif.invite", { actor: inv.invited_name || "Quelqu'un", project: inv.project_id })}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={async () => { await respondToInvitation(inv.id, true); setInvitations(prev => prev.filter(i => i.id !== inv.id)); showToast("Invitation acceptée"); track("invite_accepted", { _page: "notifications" }); setTimeout(() => loadSharedProjects().then(sp => { console.log("Shared projects loaded:", sp.length, sp); setSharedProjects(sp); }), 500); }} style={{ padding: "5px 14px", border: "none", borderRadius: 6, background: AC, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{t("collab.accept")}</button>
                      <button onClick={async () => { await respondToInvitation(inv.id, false); setInvitations(prev => prev.filter(i => i.id !== inv.id)); }} style={{ padding: "5px 14px", border: `1px solid ${SBB}`, borderRadius: 6, background: WH, color: TX2, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{t("collab.decline")}</button>
                    </div>
                  </div>
                ))}
                {notifications.length === 0 && invitations.length === 0 && (
                  <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, color: TX3 }}>{t("notif.empty")}</div>
                )}
                {notifications.map(n => (
                  <div key={n.id} onClick={() => { if (!n.read) { markNotificationRead(n.id); setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x)); } }} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 16px", borderBottom: `1px solid ${SBB}`, cursor: "pointer", background: n.read ? "transparent" : "#FAFAF5" }}>
                    {!n.read && <div style={{ width: 6, height: 6, borderRadius: "50%", background: AC, flexShrink: 0, marginTop: 5 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: TX, lineHeight: 1.5 }}>
                        {n.type === "invite" && t("notif.invite", { actor: n.actor_name, project: n.project_name || n.project_id })}
                        {n.type === "invite_accepted" && t("notif.inviteAccepted", { actor: n.actor_name })}
                        {n.type === "comment" && t("notif.comment", { actor: n.actor_name, project: n.project_name || n.project_id })}
                      </div>
                      <div style={{ fontSize: 10, color: TX3, marginTop: 2 }}>{new Date(n.created_at).toLocaleDateString("fr-BE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); deleteNotification(n.id); setNotifications(prev => prev.filter(x => x.id !== n.id)); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, flexShrink: 0, marginTop: 2 }}>
                      <Ico name="x" size={12} color={TX3} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          </div>{/* end right section */}
        </div>
        <div className="ap-content" style={{ padding: "20px 28px", maxWidth: 1200, margin: "0 auto" }}>
          {view === "profile" && (
            <div>
              {profileSaved && <div style={{ padding: "10px 16px", background: "#EAF3DE", borderRadius: 8, color: GR, fontSize: 13, marginBottom: 16, fontWeight: 500 }}>Profil enregistré !</div>}
              <ProfileView profile={profile} onSave={saveProfile} />
            </div>
          )}
          {view !== "profile" && project && view === "overview" && <Overview project={project} setProjects={setProjects} onStartNotes={() => setView("notes")} onEditInfo={() => { const addr = project.street ? { street: project.street, number: project.number || "", postalCode: project.postalCode || "", city: project.city || "", country: project.country || "Belgique" } : parseAddress(project.address); setEditInfo({ name: project.name, client: project.client, contractor: project.contractor, ...addr, statusId: project.statusId, startDate: project.startDate, endDate: project.endDate, progress: project.progress, nextMeeting: project.nextMeeting, recurrence: project.recurrence || "none", pvTemplate: project.pvTemplate || "standard", remarkNumbering: project.remarkNumbering || "none", customFields: project.customFields || [] }); setModal("info"); }} onEditParticipants={() => { setEditParts(project.participants.map((p) => ({ ...p }))); setModal("parts"); }} onViewPV={(pv) => { setModalData(pv); setModal("viewpv"); }} onViewPdf={async (pv) => { if (pv.pdfDataUrl) { setModalData({ ...pv, _tab: "output" }); setModal("viewpv"); return; } if (!pv.content) return; try { const { jsPDF } = await import("jspdf"); const res = await generatePDF(project, pv.number, pv.date, pv.content, profile, { returnDataUrl: true }); setModalData({ ...pv, pdfDataUrl: res.dataUrl, fileName: res.fileName, _tab: "output" }); setModal("viewpv"); } catch (e) { console.error("PDF generation failed:", e); } }} onViewPlan={() => setView("plan")} onViewPlanning={() => setView("planning")} onArchive={() => updateProject(activeId, { archived: !project.archived })} onDuplicate={duplicateProject} onImportPV={() => { setImportPV({ number: String((project.pvHistory.length || 0) + 1), date: new Date().toLocaleDateString("fr-BE"), author: profile.name, pdfDataUrl: null, fileName: "" }); setModal("importpv"); }} onViewChecklists={() => setView("checklists")} onCollab={() => setModal("collab")} onGallery={() => { if (window.innerWidth > 768) setView("gallery"); else setGallerySheet(true); }} />}
          {view !== "profile" && project && view === "notes" && !isReadOnly(project) && <NoteEditor project={project} setProjects={setProjects} profile={profile} onBack={() => setView("overview")} onGenerate={(recipients, title, fieldData) => { setPvRecipients(recipients || []); setPvTitle(title || ""); setPvFieldData(fieldData || {}); setView("result"); }} />}
          {view !== "profile" && project && view === "notes" && isReadOnly(project) && (() => { setView("overview"); return null; })()}
          {view !== "profile" && project && view === "result" && !isReadOnly(project) && <ResultView project={project} setProjects={setProjects} onBack={() => setView("notes")} onBackHome={() => setView("overview")} profile={profile} pvRecipients={pvRecipients} pvTitle={pvTitle} pvFieldData={pvFieldData} />}
          {view !== "profile" && project && view === "gallery" && <GalleryView project={project} setProjects={setProjects} onBack={() => setView("overview")} />}
          {view !== "profile" && project && view === "plan" && <PlanManager project={project} setProjects={setProjects} onBack={() => setView("overview")} />}
          {view !== "profile" && project && view === "planning" && <PlanningView project={project} setProjects={setProjects} onBack={() => setView("overview")} />}
          {view !== "profile" && project && view === "checklists" && <ChecklistsView project={project} setProjects={setProjects} onBack={() => setView("overview")} />}
          {view === "stats" && <StatsView projects={projects} onBack={() => setView("overview")} onSelectProject={(id) => { setActiveId(id); setView("overview"); }} onNewPV={(id) => { setActiveId(id); setView("notes"); }} onNewProject={() => setModal("new")} />}
          {view === "planningDashboard" && <PlanningDashboard projects={projects} onBack={() => setView("overview")} onSelectProject={(id) => { setActiveId(id); setView("overview"); }} />}
        </div>
      </div>

      {/* Collaboration modal */}
      {modal === "collab" && project && (
        <CollabModalWrapper project={project} onClose={() => setModal(null)} showToast={showToast} profile={profile} />
      )}

      <Modal open={modal === "new"} onClose={() => setModal(null)} title="Nouveau projet">
        <Field label="Nom du projet *" value={newP.name} onChange={(v) => setNewP((p) => ({ ...p, name: v }))} placeholder="ex: Rénovation Maison Dupont" />
        <div style={{ display: "flex", gap: 10 }}>
          <Field half label="Maître d'ouvrage *" value={newP.client} onChange={(v) => setNewP((p) => ({ ...p, client: v }))} placeholder="ex: M. Dupont" />
          <Field half label="Entreprise *" value={newP.contractor} onChange={(v) => setNewP((p) => ({ ...p, contractor: v }))} placeholder="ex: BESIX" />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Field half label="Rue" value={newP.street} onChange={(v) => setNewP((p) => ({ ...p, street: v }))} placeholder="ex: Rue de la Loi" />
          <div style={{ flex: "0 0 80px" }}><Field label="N°" value={newP.number} onChange={(v) => setNewP((p) => ({ ...p, number: v }))} placeholder="12" /></div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: "0 0 100px" }}><Field label="Code postal" value={newP.postalCode} onChange={(v) => setNewP((p) => ({ ...p, postalCode: v }))} placeholder="1000" /></div>
          <Field half label="Ville *" value={newP.city} onChange={(v) => setNewP((p) => ({ ...p, city: v }))} placeholder="Bruxelles" />
          <Field half label="Pays" value={newP.country} onChange={(v) => setNewP((p) => ({ ...p, country: v }))} placeholder="Belgique" />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Field half label="Date de début *" value={newP.startDate} onChange={(v) => setNewP((p) => ({ ...p, startDate: v }))} placeholder="ex: 01/04/2026" />
          <Field half label="Récurrence" value={newP.recurrence} onChange={(v) => setNewP((p) => ({ ...p, recurrence: v }))} select options={RECURRENCES} />
        </div>
        <Field label="Phase du projet" value={newP.statusId} onChange={(v) => setNewP((p) => ({ ...p, statusId: v }))} select options={STATUSES} />

        {/* Template summary from profile defaults */}
        <div style={{ padding: "10px 14px", background: SB, borderRadius: 10, border: `1px solid ${SBB}`, marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: TX2, marginBottom: 3 }}>Templates par défaut</div>
            <div style={{ fontSize: 10, color: TX3, lineHeight: 1.5 }}>
              Postes : <strong style={{ color: TX2 }}>{(POST_TEMPLATES.find(t => t.id === newP.postTemplate) || POST_TEMPLATES[0]).label}</strong> ·
              Style PV : <strong style={{ color: TX2 }}>{(PV_TEMPLATES.find(t => t.id === newP.pvTemplate) || PV_TEMPLATES[0]).label}</strong> ·
              Numérotation : <strong style={{ color: TX2 }}>{(REMARK_NUMBERING.find(t => t.id === newP.remarkNumbering) || REMARK_NUMBERING[0]).label}</strong>
            </div>
          </div>
          <span style={{ fontSize: 10, color: TX3, fontStyle: "italic", flexShrink: 0 }}>Configurable dans Mon profil</span>
        </div>

        <Field label="Description (optionnel)" value={newP.desc} onChange={(v) => setNewP((p) => ({ ...p, desc: v }))} placeholder="Rénovation complète..." area />
        <button onClick={createProject} disabled={!canCreate} style={{ width: "100%", padding: 14, border: "none", borderRadius: 10, background: canCreate ? AC : DIS, color: canCreate ? "#fff" : DIST, fontSize: 15, fontWeight: 600, cursor: canCreate ? "pointer" : "not-allowed", fontFamily: "inherit", marginTop: 4, transition: "all 0.2s" }}>Créer le projet</button>
      </Modal>

      <Modal open={modal === "info"} onClose={() => setModal(null)} title="Modifier les informations">
        <Field label="Nom du projet *" value={editInfo.name || ""} onChange={(v) => setEditInfo((p) => ({ ...p, name: v }))} placeholder="ex: Rénovation Maison Dupont" />
        <div style={{ display: "flex", gap: 10 }}>
          <Field half label="Maître d'ouvrage" value={editInfo.client || ""} onChange={(v) => setEditInfo((p) => ({ ...p, client: v }))} />
          <Field half label="Entreprise" value={editInfo.contractor || ""} onChange={(v) => setEditInfo((p) => ({ ...p, contractor: v }))} />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Field half label="Rue" value={editInfo.street || ""} onChange={(v) => setEditInfo((p) => ({ ...p, street: v }))} placeholder="ex: Rue de la Loi" />
          <div style={{ flex: "0 0 80px" }}><Field label="N°" value={editInfo.number || ""} onChange={(v) => setEditInfo((p) => ({ ...p, number: v }))} placeholder="12" /></div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: "0 0 100px" }}><Field label="Code postal" value={editInfo.postalCode || ""} onChange={(v) => setEditInfo((p) => ({ ...p, postalCode: v }))} placeholder="1000" /></div>
          <Field half label="Ville" value={editInfo.city || ""} onChange={(v) => setEditInfo((p) => ({ ...p, city: v }))} placeholder="Bruxelles" />
          <Field half label="Pays" value={editInfo.country || "Belgique"} onChange={(v) => setEditInfo((p) => ({ ...p, country: v }))} placeholder="Belgique" />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Field half label="Phase" value={editInfo.statusId || "sketch"} onChange={(v) => setEditInfo((p) => ({ ...p, statusId: v }))} select options={STATUSES} />
          <Field half label="Avancement (%)" value={String(editInfo.progress || "")} onChange={(v) => setEditInfo((p) => ({ ...p, progress: parseInt(v) || 0 }))} type="number" />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Field half label="Date début" value={editInfo.startDate || ""} onChange={(v) => setEditInfo((p) => ({ ...p, startDate: v }))} />
          <Field half label="Date fin" value={editInfo.endDate || ""} onChange={(v) => setEditInfo((p) => ({ ...p, endDate: v }))} />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Field half label="Prochaine réunion" value={editInfo.nextMeeting || ""} onChange={(v) => setEditInfo((p) => ({ ...p, nextMeeting: v }))} />
          <Field half label="Récurrence" value={editInfo.recurrence || "none"} onChange={(v) => setEditInfo((p) => ({ ...p, recurrence: v }))} select options={RECURRENCES} />
        </div>

        {/* PV template + numbering */}
        <div style={{ borderTop: `1px solid ${SBB}`, marginTop: 12, paddingTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 10 }}>Paramètres PV</div>
          <div style={{ display: "flex", gap: 10 }}>
            <Field half label="Style de PV" value={editInfo.pvTemplate || "standard"} onChange={(v) => setEditInfo(p => ({ ...p, pvTemplate: v }))} select options={PV_TEMPLATES} />
            <Field half label="Numérotation remarques" value={editInfo.remarkNumbering || "none"} onChange={(v) => setEditInfo(p => ({ ...p, remarkNumbering: v }))} select options={REMARK_NUMBERING} />
          </div>
        </div>

        {/* Custom fields */}
        <div style={{ borderTop: `1px solid ${SBB}`, marginTop: 12, paddingTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3 }}>Champs personnalisés</span>
            <button onClick={() => setEditInfo(p => ({ ...p, customFields: [...(p.customFields || []), { id: Date.now(), label: "", value: "" }] }))} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: AC, fontWeight: 600, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 3 }}>
              <Ico name="plus" size={10} color={AC} />Ajouter
            </button>
          </div>
          {(editInfo.customFields || []).map((cf, i) => (
            <div key={cf.id} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
              <input value={cf.label} onChange={e => setEditInfo(p => ({ ...p, customFields: p.customFields.map((f, j) => j === i ? { ...f, label: e.target.value } : f) }))} placeholder="Label" style={{ flex: 1, padding: "8px 10px", border: `1px solid ${SBB}`, borderRadius: 6, fontSize: 12, fontFamily: "inherit", background: SB, color: TX }} />
              <input value={cf.value} onChange={e => setEditInfo(p => ({ ...p, customFields: p.customFields.map((f, j) => j === i ? { ...f, value: e.target.value } : f) }))} placeholder="Valeur" style={{ flex: 1, padding: "8px 10px", border: `1px solid ${SBB}`, borderRadius: 6, fontSize: 12, fontFamily: "inherit", background: SB, color: TX }} />
              <button onClick={() => setEditInfo(p => ({ ...p, customFields: p.customFields.filter((_, j) => j !== i) }))} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                <Ico name="x" size={12} color={TX3} />
              </button>
            </div>
          ))}
          {(!editInfo.customFields || editInfo.customFields.length === 0) && (
            <div style={{ fontSize: 11, color: TX3, fontStyle: "italic" }}>Ex: N° permis, Référence cadastrale, Budget...</div>
          )}
        </div>

        <button onClick={() => { updateProject(activeId, { ...editInfo, address: formatAddress(editInfo) }); setModal(null); }} style={{ width: "100%", padding: 14, border: "none", borderRadius: 10, background: AC, color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginTop: 12 }}>Enregistrer</button>
      </Modal>

      <Modal open={modal === "parts"} onClose={() => setModal(null)} title="Participants">
        {editParts.map((p, i) => (
          <div key={i} style={{ background: SB, borderRadius: 10, padding: "10px 12px", marginBottom: 8, border: `1px solid ${SBB}`, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: ACL, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: AC, flexShrink: 0 }}>
                  {p.name ? p.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() : "?"}
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name || "Nouveau"}</span>
              </div>
              <button onClick={() => setEditParts((prev) => prev.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, flexShrink: 0 }}>
                <Ico name="trash" size={13} color={RD} />
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <input value={p.name} onChange={(e) => { const c = [...editParts]; c[i] = { ...c[i], name: e.target.value }; setEditParts(c); }} placeholder="Nom" style={{ padding: "8px 10px", border: `1px solid ${SBB}`, borderRadius: 6, fontSize: 12, fontFamily: "inherit", background: WH, color: TX, gridColumn: "1 / -1", boxSizing: "border-box", width: "100%", minWidth: 0 }} />
              <input value={p.role} onChange={(e) => { const c = [...editParts]; c[i] = { ...c[i], role: e.target.value }; setEditParts(c); }} placeholder="Rôle" style={{ padding: "8px 10px", border: `1px solid ${SBB}`, borderRadius: 6, fontSize: 12, fontFamily: "inherit", background: WH, color: TX, boxSizing: "border-box", width: "100%", minWidth: 0 }} />
              <input value={p.phone || ""} onChange={(e) => { const c = [...editParts]; c[i] = { ...c[i], phone: e.target.value }; setEditParts(c); }} placeholder="Tél." type="tel" style={{ padding: "8px 10px", border: `1px solid ${SBB}`, borderRadius: 6, fontSize: 12, fontFamily: "inherit", background: WH, color: TX, boxSizing: "border-box", width: "100%", minWidth: 0 }} />
              <input value={p.email || ""} onChange={(e) => { const c = [...editParts]; c[i] = { ...c[i], email: e.target.value }; setEditParts(c); }} placeholder="Email" type="email" style={{ padding: "8px 10px", border: `1px solid ${SBB}`, borderRadius: 6, fontSize: 12, fontFamily: "inherit", background: WH, color: TX, gridColumn: "1 / -1", boxSizing: "border-box", width: "100%", minWidth: 0 }} />
            </div>
          </div>
        ))}
        <button onClick={() => setEditParts((prev) => [...prev, { role: "", name: "", email: "", phone: "" }])} style={{ width: "100%", padding: 10, border: `1px dashed ${SBB}`, borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 12, color: AC, fontFamily: "inherit", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <Ico name="plus" size={13} color={AC} />Ajouter un participant
        </button>
        <button onClick={() => { updateProject(activeId, { participants: editParts.filter((p) => p.name.trim()) }); setModal(null); }} style={{ width: "100%", padding: 13, border: "none", borderRadius: 10, background: AC, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Enregistrer</button>
      </Modal>

      {/* Import PV modal */}
      <Modal open={modal === "importpv"} onClose={() => setModal(null)} title="Importer un ancien PV" wide>
        <input ref={importPVRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={(e) => {
          const file = e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => setImportPV((prev) => ({ ...prev, pdfDataUrl: ev.target.result, fileName: file.name }));
          reader.readAsDataURL(file);
          e.target.value = "";
        }} />

        {/* Sélection du fichier */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: TX2, marginBottom: 8 }}>Fichier PDF</div>
          {importPV.pdfDataUrl ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: ACL, border: `1px solid ${ACL2}`, borderRadius: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: REDBG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: `1px solid ${REDBRD}`, gap: 1, flexShrink: 0 }}>
                <span style={{ fontSize: 7, fontWeight: 700, color: RD }}>PDF</span>
                <Ico name="file" size={11} color={RD} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{importPV.fileName}</div>
                <div style={{ fontSize: 11, color: GR, marginTop: 2 }}>Fichier chargé</div>
              </div>
              <button onClick={() => importPVRef.current?.click()} style={{ background: "none", border: `1px solid ${SBB}`, borderRadius: 6, cursor: "pointer", padding: "5px 10px", fontSize: 12, color: TX2, fontFamily: "inherit" }}>Changer</button>
            </div>
          ) : (
            <button onClick={() => importPVRef.current?.click()} style={{ width: "100%", padding: "22px 16px", border: `2px dashed ${SBB}`, borderRadius: 10, background: SB, cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <Ico name="upload" size={28} color={TX3} />
              <span style={{ fontSize: 13, color: TX2, fontWeight: 500 }}>Cliquer pour sélectionner un PDF</span>
              <span style={{ fontSize: 11, color: TX3 }}>Le fichier sera stocké dans le projet</span>
            </button>
          )}
        </div>

        {/* Métadonnées */}
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: TX2, marginBottom: 6 }}>N° de PV</div>
            <input value={importPV.number} onChange={(e) => setImportPV((p) => ({ ...p, number: e.target.value }))} placeholder="ex: 14" style={{ width: "100%", padding: "9px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: SB, color: TX, boxSizing: "border-box" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: TX2, marginBottom: 6 }}>Date</div>
            <input value={importPV.date} onChange={(e) => setImportPV((p) => ({ ...p, date: e.target.value }))} placeholder="ex: 15/03/2026" style={{ width: "100%", padding: "9px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: SB, color: TX, boxSizing: "border-box" }} />
          </div>
        </div>
        <div style={{ marginTop: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: TX2, marginBottom: 6 }}>Auteur</div>
          <input value={importPV.author} onChange={(e) => setImportPV((p) => ({ ...p, author: e.target.value }))} placeholder="ex: Gaëlle CNOP" style={{ width: "100%", padding: "9px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: SB, color: TX, boxSizing: "border-box" }} />
        </div>

        <button
          disabled={!importPV.pdfDataUrl || !importPV.number.trim() || !importPV.date.trim()}
          onClick={() => {
            const num = parseInt(importPV.number) || importPV.number;
            const entry = {
              number: num,
              date: importPV.date.trim(),
              author: importPV.author.trim() || "—",
              postsCount: 0,
              excerpt: `PV importé — ${importPV.fileName}`,
              content: "",
              pdfDataUrl: importPV.pdfDataUrl,
              fileName: importPV.fileName,
              imported: true,
            };
            setProjects((prev) => prev.map((p) => p.id === activeId ? { ...p, pvHistory: [entry, ...p.pvHistory] } : p));
            setModal(null);
          }}
          style={{ width: "100%", padding: 14, border: "none", borderRadius: 10, background: importPV.pdfDataUrl && importPV.number.trim() && importPV.date.trim() ? AC : DIS, color: importPV.pdfDataUrl && importPV.number.trim() && importPV.date.trim() ? "#fff" : DIST, fontSize: 15, fontWeight: 600, cursor: importPV.pdfDataUrl && importPV.number.trim() && importPV.date.trim() ? "pointer" : "not-allowed", fontFamily: "inherit", transition: "all 0.2s" }}
        >
          Importer le PV
        </button>
      </Modal>

      <Modal open={modal === "viewpv"} onClose={() => { setModal(null); setModalData(d => d ? { ...d, _showSend: false } : d); }} title={modalData ? `PV n°${modalData.number} — ${modalData.date}` : ""} wide>
        {modalData && (() => {
          const hasInput = modalData.inputNotes && modalData.inputNotes.length > 0;
          const pvTab = modalData._tab || "output";
          return (
          <div>
            <div style={{ display: "flex", gap: 12, marginBottom: 10, fontSize: 12, color: TX3, flexWrap: "wrap", alignItems: "center" }}>
              <span>Rédigé par {modalData.author}</span>
              {!modalData.imported && <span>{modalData.postsCount} postes</span>}
              {modalData.imported && <span style={{ fontSize: 10, fontWeight: 600, color: BL, background: BLB, padding: "2px 8px", borderRadius: 6 }}>PV importé</span>}
            </div>

            {/* Tabs: Output IA / Notes brutes */}
            {hasInput && !modalData.pdfDataUrl && (
              <div style={{ display: "flex", gap: 2, marginBottom: 12, background: SB, borderRadius: 8, padding: 3 }}>
                {[
                  { id: "output", label: "PV généré (IA)", icon: "file" },
                  { id: "input", label: "Notes brutes", icon: "edit" },
                ].map(tab => (
                  <button key={tab.id} onClick={() => setModalData(d => ({ ...d, _tab: tab.id }))} style={{
                    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                    padding: "8px 12px", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
                    fontSize: 12, fontWeight: 600,
                    background: pvTab === tab.id ? WH : "transparent",
                    color: pvTab === tab.id ? TX : TX3,
                    boxShadow: pvTab === tab.id ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                  }}>
                    <Ico name={tab.icon} size={12} color={pvTab === tab.id ? AC : TX3} />
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            {/* Output tab */}
            {(pvTab === "output" || !hasInput) && (
              <>
                {modalData.pdfDataUrl ? (
                  <div>
                    <iframe src={modalData.pdfDataUrl} title={modalData.fileName || `PV n°${modalData.number}`} style={{ width: "100%", height: "65vh", border: "none", borderRadius: 10, background: SB }} />
                    <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                      <a href={modalData.pdfDataUrl} download={modalData.fileName || `PV-${modalData.number}.pdf`} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 18px", background: AC, color: "#fff", borderRadius: 8, fontWeight: 600, fontSize: 13, textDecoration: "none" }}>
                        <Ico name="download" size={14} color="#fff" />Télécharger
                      </a>
                      <button onClick={() => setModalData(d => ({ ...d, _showSend: true }))} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 18px", border: `1px solid ${AC}`, background: WH, color: AC, borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                        <Ico name="send" size={14} color={AC} />Envoyer par email
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ padding: 20, background: SB, borderRadius: 10, fontFamily: "system-ui, -apple-system, sans-serif", fontSize: 13, lineHeight: 1.9, whiteSpace: "pre-wrap", color: TX, maxHeight: "55vh", overflowY: "auto", border: `1px solid ${SBB}` }}>{modalData.content}</div>
                    <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                      <button onClick={() => { navigator.clipboard.writeText(modalData.content); }} style={{ padding: "10px 20px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: TX2, display: "flex", alignItems: "center", gap: 4 }}>
                        <Ico name="copy" size={14} color={TX3} />Copier
                      </button>
                      <button onClick={() => setModalData(d => ({ ...d, _showSend: true }))} style={{ padding: "10px 20px", border: `1px solid ${AC}`, borderRadius: 8, background: WH, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit", color: AC, display: "flex", alignItems: "center", gap: 6 }}>
                        <Ico name="send" size={14} color={AC} />Envoyer par email
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Input tab — notes brutes */}
            {pvTab === "input" && hasInput && (
              <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
                {modalData.inputNotes.map((post, i) => (
                  <div key={i} style={{ marginBottom: 12, padding: "12px 14px", background: SB, borderRadius: 10, border: `1px solid ${SBB}` }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: AC, marginBottom: 6 }}>{post.id}. {post.label}</div>
                    {post.notes && <div style={{ fontSize: 12, color: TX, lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: 6 }}>{post.notes}</div>}
                    {(post.remarks || []).map((r, j) => (
                      <div key={j} style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "4px 0" }}>
                        <span style={{ fontSize: 11, color: r.urgent ? RD : TX3, fontWeight: r.urgent ? 700 : 400 }}>{r.urgent ? ">" : "-"}</span>
                        <span style={{ fontSize: 12, color: TX, lineHeight: 1.4 }}>{r.text}</span>
                        <span style={{ fontSize: 9, fontWeight: 600, color: r.status === "done" ? GR : r.status === "progress" ? AC : TX3, background: r.status === "done" ? GRBG : r.status === "progress" ? ACL : SB, padding: "1px 5px", borderRadius: 4, flexShrink: 0, marginLeft: "auto" }}>{r.status}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
          );
        })()}
        {modalData?._showSend && project && (
          <SendPvModal
            project={project}
            pvNumber={modalData.number}
            pvDate={modalData.date}
            pvContent={modalData.content || ""}
            profile={profile}
            onClose={() => setModalData(d => ({ ...d, _showSend: false }))}
            onSent={(to) => {
              setProjects(prev => prev.map(p => p.id === project.id ? {
                ...p,
                pvHistory: p.pvHistory.map(pv => String(pv.number) === String(modalData.number) ? { ...pv, status: "sent" } : pv),
              } : p));
              showToast(`PV envoyé à ${to.length} destinataire${to.length > 1 ? "s" : ""}`);
              track("pv_sent", { recipients: to.length, _page: "viewpv" });
            }}
          />
        )}
      </Modal>

      {/* Bannière offline */}
      {showSearch && (
        <SearchModal
          projects={projects}
          onClose={() => setShowSearch(false)}
          onOpen={(projId, pv) => { setActiveId(projId); setView("overview"); setModalData(pv); setModal("viewpv"); }}
        />
      )}

      {!isOnline && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: TX, color: "#fff", padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontSize: 12, zIndex: 999 }}>
          <Ico name="wifioff" size={14} color="#fff" />
          <span>Mode hors-ligne</span>
          <span style={{ opacity: 0.6 }}>·</span>
          <span style={{ opacity: 0.7 }}>Notes et photos sauvegardées localement</span>
          <span style={{ opacity: 0.6 }}>·</span>
          <span style={{ opacity: 0.7 }}>Sync automatique au retour du réseau</span>
        </div>
      )}

      {/* Toast reconnexion */}
      {showReconnected && (
        <div style={{ position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)", background: GR, color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 999, display: "flex", alignItems: "center", gap: 6 }}>
          <Ico name="check" size={14} color="#fff" />Reconnecté — Données synchronisées
        </div>
      )}

      {/* Avertissement stockage plein */}
      {storageWarning && (
        <div style={{ position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)", background: RD, color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 12, fontWeight: 600, zIndex: 1001, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 20px rgba(0,0,0,0.18)", whiteSpace: "nowrap", animation: "fadeIn .3s ease-out" }}>
          <Ico name="alert" size={14} color="#fff" />Stockage limité — Photos hors-ligne non garanties
        </div>
      )}
      {toast && (
        <div style={{ position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)", background: toast.type === "error" ? RD : GR, color: "#fff", padding: "11px 22px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 1001, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 20px rgba(0,0,0,0.18)", pointerEvents: "none", whiteSpace: "nowrap" }}>
          <Ico name={toast.type === "error" ? "alert" : "check"} size={15} color="#fff" />
          {toast.msg}
        </div>
      )}
      {/* ── Mobile Bottom Bar ── */}
      <MobileBottomBar
        view={view}
        onNavigate={(tab) => { setView(tab); setSidebarOpen(false); }}
        onCapture={() => setCaptureSheet(true)}
      />

      {/* ── Mobile Capture Sheet ── */}
      <CaptureSheet
        open={captureSheet}
        onClose={() => setCaptureSheet(false)}
        photoCount={project ? (project.gallery || []).length : 0}
        onPhoto={() => {
          setCaptureSheet(false);
          setTimeout(() => mobilePhotoRef.current?.click(), 150);
        }}
        onGallery={() => {
          setCaptureSheet(false);
          setGallerySheet(true);
        }}
      />

      {/* ── Mobile Project Picker ── */}
      {projectPicker && (() => {
        const activeProjects = projects.filter(p => !p.archived);
        const [pickerSearch, setPickerSearch] = [window._pickerSearch || "", (v) => { window._pickerSearch = v; setProjectPicker(true); }];
        const filtered = pickerSearch ? activeProjects.filter(p => p.name.toLowerCase().includes(pickerSearch.toLowerCase()) || (p.client || "").toLowerCase().includes(pickerSearch.toLowerCase())) : activeProjects;
        return (
        <div style={{ position: "fixed", inset: 0, zIndex: 250, display: "flex", flexDirection: "column", justifyContent: "flex-end" }} onClick={() => { window._pickerSearch = ""; setProjectPicker(false); }}>
          <div style={{ background: "rgba(0,0,0,0.3)", position: "absolute", inset: 0 }} />
          <div onClick={e => e.stopPropagation()} style={{ position: "relative", background: WH, borderRadius: "20px 20px 0 0", maxHeight: "75vh", display: "flex", flexDirection: "column", animation: "sheetUp 0.25s ease-out", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
            {/* Handle */}
            <div style={{ width: 36, height: 4, borderRadius: 2, background: SBB, margin: `${SP.md}px auto ${SP.sm}px` }} />
            {/* Segmented control */}
            <div style={{ padding: `0 ${SP.lg}px ${SP.md}px` }}>
              <div style={{ display: "flex", background: SB, borderRadius: 10, padding: 3, gap: 3 }}>
                {["projects", "dashboard"].map(tab => {
                  const isActive = pickerTab === tab;
                  const label = tab === "projects" ? "Projets" : "Pilotage";
                  const icon = tab === "projects" ? "building" : "chart";
                  return (
                    <button key={tab} onClick={() => setPickerTab(tab)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "8px 10px", borderRadius: 8, background: isActive ? WH : "transparent", boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.06)" : "none", border: "none", cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
                      <Ico name={icon} size={13} color={isActive ? TX : TX3} />
                      <span style={{ fontSize: 12, fontWeight: isActive ? 700 : 600, color: isActive ? TX : TX3 }}>{label}</span>
                      {tab === "projects" && <span style={{ fontSize: 10, fontWeight: 600, color: TX3, background: isActive ? SB : SB2, padding: "1px 6px", borderRadius: 8 }}>{activeProjects.length}</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tab: Projets */}
            {pickerTab === "projects" && (
              <>
                {/* Search */}
                {activeProjects.length >= 4 && (
                  <div style={{ padding: `0 ${SP.lg}px ${SP.md}px` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: SP.sm, background: SB, border: `1px solid ${SBB}`, borderRadius: RAD.lg, padding: `${SP.sm}px ${SP.md}px` }}>
                      <Ico name="search" size={14} color={TX3} />
                      <input value={pickerSearch} onChange={e => setPickerSearch(e.target.value)} placeholder="Rechercher un projet..." autoFocus style={{ flex: 1, border: "none", background: "transparent", fontSize: FS.md, color: TX, fontFamily: "inherit", outline: "none", padding: 0 }} />
                      {pickerSearch && <button onClick={() => setPickerSearch("")} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}><Ico name="x" size={14} color={TX3} /></button>}
                    </div>
                  </div>
                )}
                {/* Project list */}
                <div style={{ flex: 1, overflowY: "auto", padding: `0 ${SP.sm}px ${SP.lg}px` }}>
                  {filtered.length === 0 && (
                    <div style={{ padding: `${SP.xl}px ${SP.lg}px`, textAlign: "center", color: TX3, fontSize: FS.md }}>Aucun projet trouvé</div>
                  )}
                  {filtered.map(p => {
                    const st = getStatus(p.statusId);
                    const isCurrent = p.id === activeId && view !== "stats";
                    return (
                      <button key={p.id} onClick={() => { window._pickerSearch = ""; setActiveId(p.id); setView("overview"); setProjectPicker(false); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: SP.sm + 2, padding: `${SP.sm + 2}px ${SP.md}px`, border: isCurrent ? `1.5px solid ${AC}` : "1.5px solid transparent", borderRadius: RAD.lg, cursor: "pointer", textAlign: "left", fontFamily: "inherit", background: isCurrent ? ACL : "transparent", marginBottom: 2, transition: "all 0.12s" }}>
                        <div style={{ width: 36, height: 36, borderRadius: RAD.md, background: isCurrent ? st.bg : SB2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Ico name="building" size={16} color={isCurrent ? st.color : TX3} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: FS.md, fontWeight: isCurrent ? 650 : 500, color: isCurrent ? TX : TX2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                          <div style={{ fontSize: FS.sm, color: TX3, display: "flex", alignItems: "center", gap: SP.xs }}>
                            <span style={{ fontSize: FS.xs, fontWeight: 600, color: st.color, background: st.bg, padding: "1px 6px", borderRadius: 4 }}>{st.label}</span>
                            {p.client && <span>{p.client}</span>}
                          </div>
                        </div>
                        {isCurrent && <Ico name="check" size={16} color={AC} />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* Tab: Pilotage */}
            {pickerTab === "dashboard" && (
              <div style={{ padding: `0 ${SP.lg}px ${SP.lg}px`, display: "flex", gap: 8 }}>
                <button onClick={() => { setProjectPicker(false); setView("stats"); }} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "18px 10px", border: `1px solid ${SBB}`, borderRadius: 12, background: WH, cursor: "pointer", fontFamily: "inherit" }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: ACL, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Ico name="chart" size={18} color={AC} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: TX }}>Dashboard</div>
                  <div style={{ fontSize: 10, color: TX3, textAlign: "center", lineHeight: 1.3 }}>Vue globale</div>
                </button>
                <button onClick={() => { setProjectPicker(false); setView("planningDashboard"); }} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "18px 10px", border: `1px solid ${SBB}`, borderRadius: 12, background: WH, cursor: "pointer", fontFamily: "inherit" }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: BLB, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Ico name="calendar" size={18} color={BL} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: TX }}>Planning</div>
                  <div style={{ fontSize: 10, color: TX3, textAlign: "center", lineHeight: 1.3 }}>Coordination</div>
                </button>
              </div>
            )}
          </div>
        </div>
        );
      })()}

      {/* Hidden file input for mobile photo capture → project gallery */}
      <input ref={mobilePhotoRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => {
        const file = e.target.files?.[0];
        if (!file || !activeId) { e.target.value = ""; return; }
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const dataUrl = ev.target.result;
          const photoId = Date.now() + Math.random();
          const photo = { id: photoId, dataUrl, date: new Date().toISOString() };
          setProjects(prev => prev.map(p => p.id === activeId ? { ...p, gallery: [...(p.gallery || []), photo] } : p));
          setGallerySheet(true);
          if (navigator.onLine) {
            const result = await uploadPhoto(dataUrl);
            if (result) {
              setProjects(prev => prev.map(p => p.id === activeId ? { ...p, gallery: (p.gallery || []).map(ph => ph.id === photoId ? { ...ph, url: result.url, storagePath: result.storagePath } : ph) } : p));
            }
          }
        };
        reader.readAsDataURL(file);
        e.target.value = "";
      }} />

      {/* ── Gallery Sheet (mobile) ── */}
      {gallerySheet && project && (() => {
        const photos = (project.gallery || []).slice().reverse();
        return <GallerySheet
          photos={photos}
          onClose={() => setGallerySheet(false)}
          onAdd={() => galleryInputRef.current?.click()}
          onDelete={(ids) => {
            ids.forEach(id => { const ph = photos.find(p => p.id === id); if (ph?.storagePath) deletePhoto(ph.storagePath); });
            setProjects(prev => prev.map(p => p.id === activeId ? { ...p, gallery: (p.gallery || []).filter(ph => !ids.has(ph.id)) } : p));
          }}
        />;
      })()}
      <input ref={galleryInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => {
        Array.from(e.target.files || []).forEach(file => {
          const reader = new FileReader();
          reader.onload = async (ev) => {
            const dataUrl = ev.target.result;
            const photoId = Date.now() + Math.random();
            setProjects(prev => prev.map(p => p.id === activeId ? { ...p, gallery: [...(p.gallery || []), { id: photoId, dataUrl, date: new Date().toISOString() }] } : p));
            track("photo_captured", { _page: "gallery" });
            if (navigator.onLine) {
              const result = await uploadPhoto(dataUrl);
              if (result) {
                setProjects(prev => prev.map(p => p.id === activeId ? { ...p, gallery: (p.gallery || []).map(ph => ph.id === photoId ? { ...ph, url: result.url, storagePath: result.storagePath } : ph) } : p));
              }
            }
          };
          reader.readAsDataURL(file);
        });
        e.target.value = "";
      }} />

    </div>
    </LangContext.Provider>
    </ErrorBoundary>
  );
}
