import { useEffect, useMemo, useState, useRef } from "react";
import { tokens } from "../design/tokens";
import { isEnabled } from "../constants/featureFlags";
import { Button } from "../components/ui/v2/Button";
import { Badge } from "../components/ui/v2/Badge";
import { Card } from "../components/ui/v2/Card";
import { Tabs } from "../components/ui/v2/Tabs";
import { IconButton } from "../components/ui/v2/IconButton";
import { SectionHeader } from "../components/ui/v2/SectionHeader";
import { loadInvoices, loadQuotes, getPhotoUrl, uploadPhoto } from "../db";
import { formatAddress } from "../utils/address";
import { parseDateFR } from "../utils/dates";

// ── ProjectDetail (v2) — onglet Résumé « Direction D » ─────────
//
// Porté depuis le prototype `design_handoff_archipilot_refonte`. La
// page projet partage un EN-TÊTE ÉDITORIAL CONSTANT sur les 7 onglets :
//   overline phase (uppercase, brand.600)
//   + titre (32px, bold)
//   + jauge de phase fine (7 segments, remplis jusqu'à l'étape courante)
//   + bande de chiffres-clés glanceable (PV émis · réserves · à relancer · temps).
// Seul le contenu sous la barre d'onglets change.
//
// Discipline couleur (cf. src/design/tokens.js) : 90% neutre, brand.500
// rare (logo, jauge, onglet actif, UNE action focale). Le rouge/ambre/vert
// ne servent qu'aux signaux sémantiques réels (retard, gravité).
//
// Le contenu fictif (MOCK_PROJECT) sert de fallback en preview isolée ;
// en production App.jsx passe le projet réel + les fetches async.

// ─────────────────────────────────────────────────────────────
// SVG inline — pas de lib. 24×24, strokeWidth 1.5, currentColor.
// ─────────────────────────────────────────────────────────────

const Svg = ({ children, size = 24, sw = 1.5 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={sw}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const Icons = {
  file:     ({ size }) => <Svg size={size}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></Svg>,
  chart:    ({ size }) => <Svg size={size}><line x1="6" y1="20" x2="6" y2="13" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="18" y1="20" x2="18" y2="9" /></Svg>,
  clock:    ({ size }) => <Svg size={size}><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 16 14" /></Svg>,
  alert:    ({ size }) => <Svg size={size}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></Svg>,
  chevronR: ({ size }) => <Svg size={size} sw={2}><polyline points="9 6 15 12 9 18" /></Svg>,
  sparkle:  ({ size }) => <Svg size={size}><path d="M12 3l1.9 6.1L20 11l-6.1 1.9L12 19l-1.9-6.1L4 11l6.1-1.9z" /></Svg>,
  calendar: ({ size }) => <Svg size={size}><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></Svg>,
  edit:     ({ size }) => <Svg size={size}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z" /></Svg>,
  plus:     ({ size }) => <Svg size={size} sw={2}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></Svg>,
  check:    ({ size }) => <Svg size={size} sw={2.2}><polyline points="20 6 9 17 4 12" /></Svg>,
  send:     ({ size }) => <Svg size={size} sw={1.6}><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" /></Svg>,
  mic:      ({ size }) => <Svg size={size} sw={2}><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /></Svg>,
};

// ─────────────────────────────────────────────────────────────
// Mock minimal — fallback preview. En prod, tout est dérivé du projet
// réel + des fetches async (factures, devis).
// ─────────────────────────────────────────────────────────────

const MOCK_PROJECT = {
  id: "mock",
  name: "Hôtel de Ville — Nivelles",
  statusId: "construction",
  client: "Ville de Nivelles",
  contractor: "Entreprise Générale Dupont",
  street: "Grand-Place", number: "1", postalCode: "1400", city: "Nivelles", country: "Belgique",
  missionType: "Mission complète", surface: 2400, worksAmount: 4200000,
  startDate: "12/02/2026", receptionDate: "déc. 2026",
  nextMeeting: "30/06/2026", recurrence: "weekly",
  participants: [
    { name: "Paul Mertens", role: "Maître d'ouvrage", company: "Ville de Nivelles", phone: "+32 67 88 22 00" },
    { name: "Gaëlle Dupont", role: "Architecte mandataire", company: "Atelier GD", phone: "+32 478 12 34 56" },
    { name: "Marc Genin", role: "Entreprise · conducteur", company: "Entreprise Genin", phone: "+32 71 45 67 89" },
    { name: "Bureau Stab+", role: "Ingénieur stabilité", company: "Stab+", phone: "+32 81 22 33 44" },
  ],
  pvHistory: [
    { number: 3, status: "sent", date: "26/06/2026", title: "Réunion du 26 juin — avancement lots techniques", posts: Array(8).fill({}), summary: "Électricité 2e étage en cours, étanchéité angle N-E à reprendre" },
    { number: 2, status: "sent", date: "20/06/2026", title: "Réunion du 20 juin — réception gros œuvre", posts: Array(7).fill({}), summary: "Dalle R+1 réceptionnée, démarrage des cloisons" },
    { number: 1, status: "validated", date: "10/05/2026", title: "Réunion du 10 mai — coordination lots", posts: Array(6).fill({}), summary: "Validation des réservations techniques planchers" },
  ],
  reserves: [
    { id: 1, status: "levee" },
    { id: 2, status: "open", severity: "critique" },
    { id: 3, status: "open" },
  ],
  lots: [
    { id: 1, name: "Gros œuvre", contractor: "Entreprise Genin" },
    { id: 2, name: "Toiture & étanchéité", contractor: "Toitures Lurquin" },
    { id: 3, name: "Électricité", contractor: "Elek & Co" },
    { id: 4, name: "HVAC", contractor: "ClimaTech" },
    { id: 5, name: "Menuiserie ext.", contractor: "Bois & Cie" },
    { id: 6, name: "Finitions", contractor: "" },
  ],
  tasks: [
    { id: 11, lotId: 1, title: "Fondations", status: "closed", dueDate: "2026-02-20" },
    { id: 12, lotId: 1, title: "Élévation", status: "closed", dueDate: "2026-03-25" },
    { id: 21, lotId: 2, title: "Charpente", status: "closed", dueDate: "2026-04-15" },
    { id: 22, lotId: 2, title: "Étanchéité", status: "closed", dueDate: "2026-05-05" },
    { id: 31, lotId: 3, title: "Tirage des câbles", status: "closed", dueDate: "2026-05-20" },
    { id: 32, lotId: 3, title: "Tableaux & appareillage", status: "in_progress", dueDate: "2026-07-10" },
    { id: 41, lotId: 4, title: "Réseau de gaines", status: "in_progress", dueDate: "2026-07-20" },
    { id: 42, lotId: 4, title: "Centrale de traitement", status: "open", dueDate: "2026-08-15" },
    { id: 51, lotId: 5, title: "Pose des châssis", status: "open", dueDate: "2026-06-20" },
    { id: 61, lotId: 6, title: "Peinture", status: "open", dueDate: "2026-10-10" },
    { id: 62, lotId: 6, title: "Sols souples", status: "open", dueDate: "2026-11-05" },
  ],
  planFiles: [
    { type: "folder", name: "Plans", count: 24 },
    { type: "folder", name: "Permis", count: 8 },
    { type: "folder", name: "Devis & marchés", count: 15 },
    { type: "folder", name: "PV de chantier", count: 11 },
    { type: "folder", name: "Administratif", count: 6 },
    { name: "Plan d'exécution — Niveau R+2 — rév. C.pdf", category: "Plan", size: 4404019, modified: "hier · 16:40" },
    { name: "Coupe AA — façade principale.dwg", category: "Plan", size: 1887436, modified: "23 juin" },
    { name: "Devis Elek & Co — lot électricité.pdf", category: "Devis", size: 839680, modified: "19 juin" },
    { name: "Métré général — version 4.xlsx", category: "Tableur", size: 348160, modified: "14 juin" },
  ],
  gallery: [
    { id: 1, caption: "façade nord", date: "24/06/2026", voiceNote: true, reserves: [{}, {}] },
    { id: 2, caption: "gaines R+2", date: "24/06/2026", note: "à recouper" },
    { id: 3, caption: "étanchéité N-E", date: "24/06/2026", reserves: [{}] },
    { id: 4, caption: "hall principal", date: "24/06/2026" },
    { id: 5, caption: "cage escalier", date: "24/06/2026", voiceNote: true },
    { id: 6, caption: "menuiserie ext.", date: "24/06/2026" },
    { id: 7, caption: "toiture", date: "24/06/2026" },
    { id: 8, caption: "local technique", date: "24/06/2026" },
    { id: 9, caption: "dalle R+1", date: "23/06/2026" },
    { id: 10, caption: "cloisons", date: "23/06/2026" },
    { id: 11, caption: "réseau CVC", date: "23/06/2026" },
    { id: 12, caption: "façade sud", date: "23/06/2026" },
  ],
  posts: [], customFields: [], actions: [], journalEntries: [], timeSessions: [],
};

// statusId → label + variant Badge sémantique + ordre de phase (1..7).
// L'ordre définit le remplissage de la jauge. Découplé de constants/statuses.js.
const PHASE_ORDER = ["sketch", "preliminary", "permit", "execution", "construction", "reception", "closed"];
const STATUS_MAP = {
  sketch:       { label: "Esquisse",     variant: "info"    },
  preliminary:  { label: "Avant-projet", variant: "info"    },
  permit:       { label: "Permis",       variant: "warning" },
  execution:    { label: "Exécution",    variant: "info"    },
  construction: { label: "Chantier",     variant: "info"    },
  reception:    { label: "Réception",    variant: "warning" },
  closed:       { label: "Clôturé",      variant: "neutral" },
};

// ─────────────────────────────────────────────────────────────
// Dérivations
// ─────────────────────────────────────────────────────────────

function deriveStatus(project) {
  return STATUS_MAP[project?.statusId] || { label: "Inconnu", variant: "neutral" };
}

// Phase courante → { label, index (1..7), total }. index 0 si inconnu.
function derivePhase(project) {
  const i = PHASE_ORDER.indexOf(project?.statusId);
  const index = i === -1 ? 0 : i + 1;
  return { label: (STATUS_MAP[project?.statusId] || {}).label || "Projet", index, total: 7 };
}

function fmtEur(n) {
  return `${Math.round(n || 0).toLocaleString("fr-BE")} €`;
}

function fmtDuration(totalMinutes) {
  if (!totalMinutes) return "0 min";
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  return `${h}h${m > 0 ? m.toString().padStart(2, "0") : ""}`;
}

// Bande de chiffres-clés. Couleur sémantique uniquement quand il y a un
// vrai signal (réserves ouvertes → ambre, montant à relancer → rouge).
function deriveKpis(project, invoiceSummary, totalMinutes) {
  const pv = (project.pvHistory || []).length;
  const reserves = project.reserves || [];
  const total = reserves.length;
  const open = reserves.filter(r => r.status !== "levee").length;
  const overdueTtc = invoiceSummary?.overdueTtc || 0;
  return [
    { value: String(pv), label: "PV émis" },
    // KPIs de features deferred masqués (réserves → opr, à relancer → invoices).
    ...(isEnabled("opr") ? [{
      value: String(open), suffix: total > 0 ? `/${total}` : null, label: "réserves ouvertes",
      tone: open > 0 ? "warning" : "neutral", dot: open > 0,
    }] : []),
    ...(isEnabled("invoices") ? [{ value: fmtEur(overdueTtc), label: "à relancer", tone: overdueTtc > 0 ? "danger" : "neutral" }] : []),
    { value: fmtDuration(totalMinutes), label: "temps suivi" },
  ];
}

// Action focale ("Ta prochaine action"). Réutilise la logique de priorité
// d'OverviewPhaseHero. null → état "sous contrôle".
function deriveTodo(project) {
  const reserves = project.reserves || [];
  const openReserves = reserves.filter(r => r.status !== "levee");
  const pvs = project.pvHistory || [];
  const lastPv = pvs[0];
  const phase = project.statusId;

  if (lastPv && lastPv.status === "draft") {
    return { cta: "onStartNotes", title: `Finir le PV n°${lastPv.number}`, subtitle: "Brouillon en attente — finalise et envoie.", buttonLabel: "Reprendre" };
  }
  if (phase === "reception" && openReserves.length > 0 && isEnabled("opr")) {
    return { cta: "onOpr", title: `Lever ${openReserves.length} réserve${openReserves.length > 1 ? "s" : ""}`, subtitle: "Avancer l'OPR vers la réception définitive.", buttonLabel: "Gérer" };
  }
  if (["execution", "construction", "reception"].includes(phase)) {
    const nextNum = (pvs.length || 0) + 1;
    return {
      cta: "onStartNotes",
      title: `Préparer le PV n°${nextNum}`,
      subtitle: `L'IA reprend le dernier PV${openReserves.length ? `, les ${openReserves.length} réserves ouvertes` : ""} et tes notes de visite pour rédiger un brouillon prêt à valider.`,
      buttonLabel: "Démarrer le PV",
    };
  }
  if (phase === "permit" && isEnabled("permits")) {
    return { cta: "onPermits", title: "Suivre le dossier permis", subtitle: "Tracker dépôt, AR et échéance de décision.", buttonLabel: "Ouvrir" };
  }
  return null;
}

function deriveTabs(project) {
  const openActions = (project.actions || []).filter(a => a.open).length;
  return [
    { id: "summary",  label: "Résumé" },
    { id: "sheet",    label: "Fiche" },
    { id: "actions",  label: "Actions",   count: openActions,                                                      showZero: true  },
    // Onglet Planning masqué tant que la feature est deferred (flag off).
    ...(isEnabled("planning") ? [{ id: "planning", label: "Planning", count: (project.lots || []).length, showZero: false }] : []),
    { id: "pv",       label: "PV",        count: (project.pvHistory || []).length,                                showZero: false },
    { id: "docs",     label: "Documents", count: (project.planFiles || []).filter(f => f.type !== "folder").length, showZero: false },
    { id: "photos",   label: "Photos",    count: (project.gallery || []).length,                                  showZero: false },
  ];
}

// Réserves OPR pour la card bento.
function deriveReserves(project) {
  const reserves = project.reserves || [];
  const total = reserves.length;
  const levees = reserves.filter(r => r.status === "levee").length;
  const open = total - levees;
  const critiques = reserves.filter(r => r.status !== "levee" && (r.severity === "critique" || r.severity === "critical" || r.severity === "major")).length;
  const pct = total > 0 ? Math.round((levees / total) * 100) : 0;
  return { total, levees, open, critiques, pct };
}

// Honoraires pour la card bento (à partir du résumé factures async).
function deriveBilling(invoiceSummary) {
  if (!invoiceSummary || invoiceSummary.total === 0) {
    return { tone: "neutral", amount: null, line: "Émettre une facture conforme TVA" };
  }
  if (invoiceSummary.overdueCount > 0) {
    return { tone: "danger", amount: fmtEur(invoiceSummary.overdueTtc), line: `${invoiceSummary.overdueCount} facture${invoiceSummary.overdueCount > 1 ? "s" : ""} en retard à relancer` };
  }
  if (invoiceSummary.pendingCount > 0) {
    return { tone: "neutral", amount: fmtEur(invoiceSummary.pendingTtc), line: `${invoiceSummary.pendingCount} facture${invoiceSummary.pendingCount > 1 ? "s" : ""} en attente` };
  }
  return { tone: "success", amount: null, line: `${invoiceSummary.total} facture${invoiceSummary.total > 1 ? "s" : ""} · à jour` };
}

// Prochaine réunion (string dd/mm/yyyy → libellé humain + jours d'écart).
function deriveNextMeeting(project) {
  if (!project?.nextMeeting) return null;
  const d = parseDateFR(project.nextMeeting);
  if (!d) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.floor((today - d) / (1000 * 60 * 60 * 24));
  const label = d.toLocaleDateString("fr-BE", { weekday: "short", day: "numeric", month: "short" });
  const recurrence = project.recurrence === "weekly" ? "hebdo"
    : project.recurrence === "biweekly" ? "bimensuel"
    : project.recurrence === "monthly" ? "mensuel" : "ponctuel";
  return { label, date: project.nextMeeting, overdueDays: diff > 0 ? diff : 0, recurrence };
}

// Lots de planning (top 3) pour la card bento.
function derivePlanning(project) {
  const lots = (project.lots || []).map(l => ({
    name: l.name || l.label || "Lot",
    pct: Math.max(0, Math.min(100, Math.round(Number(l.progress ?? l.completion ?? 0)))),
  }));
  return { count: lots.length, top: lots.slice(0, 3) };
}

// Journal de chantier (3 événements récents) pour la card bento.
function deriveJournal(project) {
  const events = [];
  (project.pvHistory || []).forEach(pv => {
    const t = +new Date(pv.createdAt || pv.date || 0);
    if (pv.status !== "draft") events.push({ t, tone: "brand", text: `PV n°${pv.number} validé` });
  });
  (project.reserves || []).filter(r => r.status === "levee").forEach(r => {
    const t = +new Date(r.leveeAt || r.lastUpdatedAt || 0);
    events.push({ t, tone: "success", text: "Réserve levée" });
  });
  (project.gallery || []).forEach(p => {
    const t = +new Date(p.date || p.createdAt || 0);
    events.push({ t, tone: "neutral", text: "Photo ajoutée" });
  });
  return events.filter(e => e.t).sort((a, b) => b.t - a.t).slice(0, 3);
}

// ── Fiche : infos générales (grille label/valeur) ──
// Champs avec fallback "—" : la card invite à compléter via "Modifier".
function deriveInfoFields(project) {
  const addr = formatAddress(project);
  const v = (x) => (x && String(x).trim()) ? String(x).trim() : "—";
  return [
    { label: "Maître d'ouvrage",   value: v(project?.client) },
    { label: "Entreprise générale", value: v(project?.contractor) },
    { label: "Adresse du chantier", value: addr || "—" },
    { label: "Type de mission",     value: v(project?.missionType || project?.mission) },
    { label: "Début du chantier",   value: v(project?.startDate || project?.worksStart) },
    { label: "Réception prévue",    value: v(project?.receptionDate || project?.expectedReception) },
    { label: "Surface",             value: project?.surface ? `${project.surface} m²` : "—" },
    { label: "Montant des travaux", value: project?.worksAmount ? `${Number(project.worksAmount).toLocaleString("fr-BE")} € HTVA` : "—" },
  ];
}

// Catégorie de rôle → libellé court + couleurs (avatar + pill). MOA=info,
// MOE=brand soft (accent subtil autorisé), Exécution=success, sinon neutre.
function roleCategory(role = "") {
  const r = role.toLowerCase();
  if (/(ouvrage|moa|client|mo\b)/.test(r)) return "moa";
  if (/(entrepr|exécut|execut|entreprise|chantier|conduct)/.test(r)) return "exec";
  if (/(archi|moe|ingéni|ingeni|bureau|stab|étude|etude|maîtrise|maitrise)/.test(r)) return "moe";
  return "neutral";
}

const ROLE_STYLE = {
  moa:     { label: "MOA",       avBg: "#DBEAFE", avFg: "#1E40AF", pillBg: "#EFF6FF", pillFg: "#1E40AF", pillBorder: "#BFDBFE" },
  moe:     { label: "MOE",       avBg: "#F5DCC9", avFg: "#8B3A14", pillBg: "#FDF6F1", pillFg: "#A04C20", pillBorder: "#F0DCCB" },
  exec:    { label: "Exécution", avBg: "#DCFCE7", avFg: "#166534", pillBg: "#F0FDF4", pillFg: "#166534", pillBorder: "#BBF7D0" },
  neutral: { label: "Autre",     avBg: "#F5F5F4", avFg: "#78716C", pillBg: "#F5F5F4", pillFg: "#78716C", pillBorder: "#E7E5E4" },
};

function deriveIntervenants(project) {
  return (project?.participants || []).map(p => {
    const cat = roleCategory(p.role || p.title || "");
    return {
      name: p.name || "—",
      sub: p.company || p.org || p.role || "",
      phone: p.phone || p.tel || "",
      style: ROLE_STYLE[cat],
    };
  });
}

// Liste des 7 phases avec état (faite / en cours / à venir) pour le rail droit.
function derivePhasesList(project) {
  const idx = PHASE_ORDER.indexOf(project?.statusId);
  return PHASE_ORDER.map((id, i) => ({
    label: (STATUS_MAP[id] || {}).label || id,
    state: idx === -1 ? "upcoming" : i < idx ? "done" : i === idx ? "active" : "upcoming",
  }));
}

// ── Actions : normalisation vers un board 3 colonnes ──
function normActionColumn(a) {
  const s = String(a.status || "").toLowerCase();
  // Modèle réel : `open` booléen (open:false = clôturée).
  if (a.done || a.resolved || a.open === false || /done|résolu|resolu|resolved|closed|terminé|fait/.test(s)) return "done";
  if (a.inProgress || /cours|doing|progress|wip|en_cours/.test(s)) return "doing";
  return "todo";
}
function normActionPriority(p) {
  const x = String(p || "").toLowerCase();
  if (/urgent|critiq|critical|bloqu/.test(x)) return "urgent";
  if (/haut|high|élev|eleve/.test(x)) return "high";
  if (/bas|low|faible/.test(x)) return "low";
  return "medium";
}
function deriveActions(project) {
  const cols = { todo: [], doing: [], done: [] };
  (project?.actions || []).forEach((a, i) => {
    cols[normActionColumn(a)].push({
      id: a.id ?? i,
      code: a.code || `A-${a.id ?? i + 1}`,
      title: a.title || a.text || a.label || "Sans titre",
      priority: a.urgent ? "urgent" : normActionPriority(a.priority || a.severity),
      assignee: a.who || a.assignee || a.owner || a.assignedTo || "",
      due: a.dueDate || a.due || a.deadline || a.echeance || "",
      source: a.source || a.since || (a.pvNumber ? `PV n°${a.pvNumber}` : ""),
      description: a.description || a.notes || "",
      created: a.createdAt || "",
      attachments: a.attachments || [],
    });
  });
  return cols;
}

// Échéance → libellé + ton (rouge si dépassée et non résolue).
function formatDue(due, done) {
  if (!due) return null;
  const d = parseDateFR(due) || new Date(due);
  if (isNaN(+d)) return { text: String(due), overdue: false };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dd = new Date(d); dd.setHours(0, 0, 0, 0);
  const diff = Math.round((today - dd) / 86400000);
  if (!done && diff > 0) return { text: diff === 1 ? "Échéance hier" : `En retard (${diff}j)`, overdue: true };
  if (diff === 0) return { text: "Aujourd'hui", overdue: false };
  return { text: dd.toLocaleDateString("fr-BE", { day: "numeric", month: "short" }), overdue: false };
}

// ── PV : focale + historique ──
const PV_STATUS = {
  draft:     { variant: "warning", label: "Brouillon" },
  validated: { variant: "success", label: "Validé" },
  sent:      { variant: "info",    label: "Envoyé" },
};

function pvDateShort(date) {
  if (!date) return "";
  const d = parseDateFR(date) || new Date(date);
  return isNaN(+d) ? String(date) : d.toLocaleDateString("fr-BE", { day: "numeric", month: "short" });
}

function pvExcerpt(pv) {
  const n = (pv.posts || []).length;
  const parts = [];
  if (n) parts.push(`${n} poste${n > 1 ? "s" : ""}`);
  const raw = (pv.summary || pv.content || "").replace(/[#*_>`\-]/g, "").replace(/\s+/g, " ").trim();
  if (raw) parts.push(`« ${raw.slice(0, 80)}${raw.length > 80 ? "…" : ""} »`);
  return parts.join(" · ");
}

function derivePvFocal(project) {
  const pvs = project?.pvHistory || [];
  const draft = pvs.find(p => p.status === "draft");
  const nextNum = draft ? draft.number : pvs.length + 1;
  const openReserves = (project?.reserves || []).filter(r => r.status !== "levee").length;
  const meeting = deriveNextMeeting(project);
  let subtitle;
  if (draft) subtitle = "Brouillon en attente — finalise-le et envoie-le aux intervenants.";
  else if (meeting) subtitle = `Réunion de chantier du ${meeting.label}${openReserves ? ` — ${openReserves} réserve${openReserves > 1 ? "s" : ""} ouverte${openReserves > 1 ? "s" : ""} à reporter` : ""}.`;
  else subtitle = "L'IA reprend le dernier PV et tes notes de visite pour rédiger un brouillon prêt à valider.";
  return { title: `${draft ? "Finir" : "Préparer"} le PV n°${nextNum}`, subtitle };
}

function derivePvList(project) {
  return (project?.pvHistory || [])
    .slice()
    .sort((a, b) => (b.number || 0) - (a.number || 0))
    .map(pv => ({
      number: pv.number,
      title: pv.title || `Réunion${pv.date ? ` du ${pvDateShort(pv.date)}` : ""}`,
      excerpt: pvExcerpt(pv),
      date: pvDateShort(pv.date),
      status: PV_STATUS[pv.status] || { variant: "neutral", label: pv.status || "—" },
      raw: pv,
    }));
}

// ── Documents : dossiers + fichiers récents ──
function fileExt(name) {
  const m = String(name || "").match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : "";
}
// Type → badge carré (couleur sémantique douce) + libellé de colonne "Type".
const FILE_KIND = {
  pdf:  { label: "PDF", variant: "danger",  type: "Document" },
  dwg:  { label: "DWG", variant: "info",    type: "Plan" },
  dxf:  { label: "DXF", variant: "info",    type: "Plan" },
  xls:  { label: "XLS", variant: "success", type: "Tableur" },
  xlsx: { label: "XLS", variant: "success", type: "Tableur" },
  doc:  { label: "DOC", variant: "info",    type: "Document" },
  docx: { label: "DOC", variant: "info",    type: "Document" },
  jpg:  { label: "IMG", variant: "neutral", type: "Image" },
  jpeg: { label: "IMG", variant: "neutral", type: "Image" },
  png:  { label: "IMG", variant: "neutral", type: "Image" },
};
function fileKind(name) {
  return FILE_KIND[fileExt(name)] || { label: (fileExt(name) || "?").toUpperCase().slice(0, 3), variant: "neutral", type: "Fichier" };
}
function fmtSize(s) {
  if (typeof s === "string") return s;
  if (!s || isNaN(s)) return "—";
  if (s < 1024) return `${s} o`;
  if (s < 1048576) return `${Math.round(s / 1024)} Ko`;
  return `${(s / 1048576).toFixed(1)} Mo`;
}
function deriveDocuments(project) {
  const all = (project?.planFiles && project.planFiles.length ? project.planFiles : project?.documents) || [];
  const folders = all.filter(f => f.type === "folder").map(f => ({ name: f.name, count: f.count ?? (f.children || []).length }));
  const files = all.filter(f => f.type !== "folder").map(f => {
    const kind = fileKind(f.name);
    return { name: f.name || "Sans nom", kind, typeLabel: f.category || kind.type, size: fmtSize(f.size), modified: f.modified || (f.date ? pvDateShort(f.date) : ""), raw: f };
  });
  return { folders, files };
}

// ── Photos : groupées par visite, badges annotation / réserve ──
function photoDateLabel(d) {
  if (!d) return "Sans date";
  const x = parseDateFR(d) || new Date(d);
  if (isNaN(+x)) return String(d);
  return `Visite du ${x.toLocaleDateString("fr-BE", { day: "numeric", month: "long" })}`;
}
function derivePhotos(project) {
  const photos = (project?.gallery || []).map((p, i) => ({
    id: p.id ?? i,
    url: p.url || p.dataUrl || p.src || null,
    caption: p.caption || p.label || p.title || "",
    hasVoice: !!(p.voiceNote || p.audio || (p.annotations || []).some(a => a?.type === "voice")),
    hasText: !!(p.note || p.text || (p.annotations || []).some(a => a?.type === "text" || a?.type === "annotation")),
    reserveCount: (p.reserves || p.linkedReserves || []).length || p.reserveCount || 0,
    date: p.visitDate || p.date || "",
    raw: p,
  }));
  const map = new Map(), order = [];
  photos.forEach(p => { const k = p.date || "—"; if (!map.has(k)) { map.set(k, []); order.push(k); } map.get(k).push(p); });
  order.sort((a, b) => (+(parseDateFR(b) || new Date(b)) || 0) - (+(parseDateFR(a) || new Date(a)) || 0));
  return { total: photos.length, groups: order.map(k => ({ key: k, label: photoDateLabel(k), photos: map.get(k) })) };
}

function deriveUpdatedAt(project) {
  let latest = 0;
  const consider = (v) => {
    if (!v) return;
    const t = typeof v === "number" ? v : +new Date(v);
    if (!isNaN(t) && t > latest) latest = t;
  };
  (project.pvHistory || []).forEach(pv => consider(pv.createdAt) || consider(pv.date));
  (project.reserves || []).forEach(r => consider(r.lastUpdatedAt) || consider(r.createdAt));
  (project.gallery || []).forEach(p => consider(p.date) || consider(p.createdAt));
  if (latest === 0) return null;
  const days = Math.floor((Date.now() - latest) / 86400000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "il y a 1 jour";
  if (days < 30) return `il y a ${days} jours`;
  return new Date(latest).toLocaleDateString("fr-BE");
}

// ─────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────

export function ProjectDetail({
  project = MOCK_PROJECT,
  profile,
  onStartNotes,
  onEditInfo,
  onInvoices,
  onQuotes,
  onJournal,
  onOpr,
  onPermits,
  onReports,
  onPlanning,
  onCdc,
  onNewAction,
  onAddAction,
  onOpenAction,
  onMoveAction,
  onAssignAction,
  onSetActionDue,
  onUpdateAction,
  onDeleteAction,
  onViewPV,
  onViewPdf,
  onSendPv,
  onDocuments,
  onImportDoc,
  onGallery,
  onImportPhoto,
  activeTimer,
  onStartTimer,
  onOpenSessions,
  onEditMeeting,
}) {
  const [activeTab, setActiveTab] = useState("summary");

  const [invoiceSummary, setInvoiceSummary] = useState(null);
  const [quotesCount, setQuotesCount] = useState(0);

  useEffect(() => {
    if (!project?.id || project.id === "mock") return;
    let cancelled = false;
    loadInvoices({ projectId: project.id })
      .then(invs => {
        if (cancelled) return;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const overdue = invs.filter(i => i.status === "overdue" || (i.status === "sent" && i.due_date && new Date(i.due_date) < today));
        const pending = invs.filter(i => i.status === "sent" && !overdue.includes(i));
        setInvoiceSummary({
          total: invs.length,
          overdueCount: overdue.length,
          overdueTtc: overdue.reduce((s, i) => s + Number(i.amount_ttc || 0), 0),
          pendingCount: pending.length,
          pendingTtc: pending.reduce((s, i) => s + Number(i.amount_ttc || 0), 0),
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [project?.id]);

  useEffect(() => {
    if (!project?.id || project.id === "mock") return;
    let cancelled = false;
    loadQuotes({ projectId: project.id })
      .then(qs => { if (!cancelled) setQuotesCount((qs || []).length); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [project?.id]);

  // Temps suivi total (minutes).
  const totalMinutes = useMemo(() => {
    const sessions = project?.timeSessions || [];
    return sessions.reduce((sum, s) => {
      const ms = (s.segments || []).reduce((a, seg) => {
        if (!seg.startedAt || !seg.endedAt) return a;
        return a + (+new Date(seg.endedAt) - +new Date(seg.startedAt));
      }, 0);
      return sum + Math.floor(ms / 60000);
    }, 0);
  }, [project?.timeSessions]);

  const status      = useMemo(() => deriveStatus(project), [project]);
  const phase       = useMemo(() => derivePhase(project), [project]);
  const tabs        = useMemo(() => deriveTabs(project), [project]);
  const updatedAt   = useMemo(() => deriveUpdatedAt(project), [project]);
  const todo        = useMemo(() => deriveTodo(project), [project]);
  const kpis        = useMemo(() => deriveKpis(project, invoiceSummary, totalMinutes), [project, invoiceSummary, totalMinutes]);
  const reserves    = useMemo(() => deriveReserves(project), [project]);
  const billing     = useMemo(() => deriveBilling(invoiceSummary), [invoiceSummary]);
  const meeting     = useMemo(() => deriveNextMeeting(project), [project]);
  const planning    = useMemo(() => derivePlanning(project), [project]);
  const journal     = useMemo(() => deriveJournal(project), [project]);

  const handlerMap = { onStartNotes, onEditInfo, onInvoices, onQuotes, onJournal, onOpr, onPermits, onReports, onPlanning, onCdc, onNewAction, onAddAction, onOpenAction, onMoveAction, onAssignAction, onSetActionDue, onUpdateAction, onDeleteAction, onViewPV, onViewPdf, onSendPv, onDocuments, onImportDoc, onGallery, onImportPhoto, onEditMeeting };

  return (
    <div
      style={{
        maxWidth: 1180,
        margin: "0 auto",
        fontFamily: tokens.font.family,
        color: tokens.color.neutral[900],
      }}
    >
      <ProjectHeader
        project={project}
        status={status}
        phase={phase}
        kpis={kpis}
        updatedAt={updatedAt}
        onEditInfo={onEditInfo}
      />

      <Tabs items={tabs} activeId={activeTab} onChange={setActiveTab} />

      {activeTab === "summary" && (
        <SummaryTab
          todo={todo}
          reserves={reserves}
          billing={billing}
          meeting={meeting}
          planning={planning}
          journal={journal}
          quotesCount={quotesCount}
          project={project}
          handlerMap={handlerMap}
        />
      )}
      {activeTab === "sheet" && (
        <SheetTab project={project} handlerMap={handlerMap} />
      )}
      {activeTab === "actions" && (
        <ActionsTab project={project} handlerMap={handlerMap} profile={profile} />
      )}
      {activeTab === "planning" && (
        <PlanningTab project={project} phase={phase} handlerMap={handlerMap} />
      )}
      {activeTab === "pv" && (
        <PvTab project={project} handlerMap={handlerMap} />
      )}
      {activeTab === "docs" && (
        <DocumentsTab project={project} handlerMap={handlerMap} />
      )}
      {activeTab === "photos" && (
        <PhotosTab project={project} handlerMap={handlerMap} />
      )}
      {!["summary", "sheet", "actions", "planning", "pv", "docs", "photos"].includes(activeTab) && (
        <TabPlaceholder label={tabs.find(t => t.id === activeTab)?.label} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// En-tête éditorial constant (overline + titre + jauge + KPI)
// ─────────────────────────────────────────────────────────────

function ProjectHeader({ project, status, phase, kpis, updatedAt, onEditInfo }) {
  const address = formatAddress(project);
  const missing = !project?.client?.trim()
    || !project?.contractor?.trim()
    || (!project?.street?.trim() && !project?.address?.trim());

  const metaParts = [];
  if (project?.client?.trim()) metaParts.push(project.client.trim());
  if (address) metaParts.push(address);
  if (updatedAt) metaParts.push(`mise à jour ${updatedAt}`);

  return (
    <header style={{ display: "flex", alignItems: "flex-start", gap: tokens.space[6], marginBottom: tokens.space[5], flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 280 }}>
        {/* Overline phase — uppercase brand.600 (un des rares usages de brand). */}
        {phase.index > 0 && (
          <div
            style={{
              fontSize: tokens.font.size.xs,
              fontWeight: tokens.font.weight.semibold,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: tokens.color.brand[600],
              marginBottom: tokens.space[2],
            }}
          >
            {phase.label} · phase {phase.index} sur {phase.total}
          </div>
        )}

        <h1
          style={{
            margin: `0 0 ${tokens.space[3]}`,
            fontSize: tokens.font.size["3xl"],
            fontWeight: tokens.font.weight.bold,
            letterSpacing: "-0.8px",
            color: tokens.color.neutral[900],
            lineHeight: 1.08,
          }}
        >
          {project.name}
        </h1>

        <PhaseGauge index={phase.index} total={phase.total} />

        <div style={{ display: "flex", alignItems: "center", gap: tokens.space[2], fontSize: tokens.font.size.sm, color: tokens.color.neutral[500], flexWrap: "wrap" }}>
          {metaParts.map((part, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: tokens.space[2] }}>
              {i > 0 && <span aria-hidden="true" style={{ color: tokens.color.neutral[300] }}>·</span>}
              {part}
            </span>
          ))}
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>

        {missing && <CompleteLink onClick={onEditInfo} />}
      </div>

      <KpiStrip kpis={kpis} />
    </header>
  );
}

// Jauge de phase — 7 segments fins, remplis jusqu'à l'étape courante.
function PhaseGauge({ index, total }) {
  return (
    <div style={{ display: "flex", gap: 5, maxWidth: 520, marginBottom: tokens.space[3] }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: 4,
            borderRadius: tokens.radius.full,
            background: i < index ? tokens.color.brand[500] : tokens.color.neutral[200],
          }}
        />
      ))}
    </div>
  );
}

// Bande de chiffres-clés glanceable, alignée à droite, cellules séparées
// par un filet neutre. Couleur sémantique seulement sur signal réel.
function KpiStrip({ kpis }) {
  const TONE_COLOR = {
    neutral: tokens.color.neutral[900],
    warning: tokens.color.semantic.warning.fg,
    danger:  tokens.color.semantic.danger.fg,
    success: tokens.color.semantic.success.fg,
  };
  const TONE_DOT = {
    warning: "#D97706",
    danger:  tokens.color.semantic.danger.fg,
  };
  return (
    <div style={{ display: "flex", flexShrink: 0, paddingTop: tokens.space[1] }}>
      {kpis.map((k, i) => (
        <div
          key={i}
          style={{
            padding: `0 ${tokens.space[5]}`,
            textAlign: "right",
            borderLeft: i > 0 ? `1px solid ${tokens.color.neutral[200]}` : "none",
          }}
        >
          <div
            style={{
              fontSize: tokens.font.size["2xl"],
              fontWeight: tokens.font.weight.bold,
              letterSpacing: "-0.5px",
              lineHeight: 1.1,
              color: TONE_COLOR[k.tone] || TONE_COLOR.neutral,
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: tokens.space[1],
            }}
          >
            {k.dot && TONE_DOT[k.tone] && (
              <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: tokens.radius.full, background: TONE_DOT[k.tone] }} />
            )}
            {k.value}
            {k.suffix && <span style={{ fontSize: tokens.font.size.sm, color: tokens.color.neutral[300], fontWeight: tokens.font.weight.medium }}>{k.suffix}</span>}
          </div>
          <div style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[500], marginTop: 2 }}>{k.label}</div>
        </div>
      ))}
    </div>
  );
}

function CompleteLink({ onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: tokens.space[1],
        marginTop: tokens.space[2],
        padding: 0,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        color: tokens.color.neutral[700],
        fontSize: tokens.font.size.sm,
        fontWeight: tokens.font.weight.medium,
        fontFamily: tokens.font.family,
        textDecoration: hover ? "underline" : "none",
        textUnderlineOffset: 3,
      }}
    >
      <span style={{ display: "inline-flex" }}><Icons.edit size={14} /></span>
      Quelques champs manquent — 2 minutes pour tout boucler
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Onglet Résumé : action focale + grille bento
// ─────────────────────────────────────────────────────────────

function SummaryTab({ todo, reserves, billing, meeting, planning, journal, quotesCount, project, handlerMap }) {
  return (
    <div>
      <FocalAction todo={todo} handlerMap={handlerMap} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: tokens.space[4],
        }}
      >
        {/* Cartes métier masquées tant que la feature est deferred (flag off) —
            évite les boutons « morts » qui mènent à une vue gated/redirigée. */}
        {isEnabled("opr") && <ReservesCard reserves={reserves} onClick={handlerMap.onOpr} />}
        {isEnabled("invoices") && <BillingCard billing={billing} onClick={handlerMap.onInvoices} />}
        <MeetingCard meeting={meeting} participants={project.participants} onClick={handlerMap.onEditMeeting} />
        {isEnabled("planning") && <PlanningCard planning={planning} onClick={handlerMap.onPlanning} />}
        <JournalCard journal={journal} onClick={handlerMap.onJournal} />
        {isEnabled("quotes") && <QuotesCard count={quotesCount} onClick={handlerMap.onQuotes} />}
      </div>
    </div>
  );
}

// Action focale — surface TINTÉE (brand.50), pas un fond brand plein.
// Seul endroit de la page avec un bouton primaire + l'icône brand.500.
function FocalAction({ todo, handlerMap }) {
  const cb = todo ? handlerMap?.[todo.cta] : null;

  // État "sous contrôle" — surface neutre, ton humain, pas de CTA primaire.
  if (!todo) {
    return (
      <Card padding={5} style={{ background: tokens.color.neutral[100], border: "none", borderRadius: tokens.radius.xl, marginBottom: tokens.space[5] }}>
        <div style={{ display: "flex", alignItems: "center", gap: tokens.space[4] }}>
          <div style={{ width: 46, height: 46, borderRadius: 13, background: tokens.color.neutral[0], color: tokens.color.semantic.success.fg, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Svg size={22}><polyline points="20 6 9 17 4 12" /></Svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[900], marginBottom: 2 }}>
              Tout est sous contrôle pour ce projet.
            </div>
            <div style={{ fontSize: tokens.font.size.sm, color: tokens.color.neutral[700] }}>
              Rien d'urgent à traiter — tu peux respirer (ou rattraper de l'admin).
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div
      style={{
        background: tokens.color.brand[50],
        border: `1px solid ${tokens.color.brand[100]}`,
        borderRadius: tokens.radius.xl,
        padding: `${tokens.space[5]} ${tokens.space[6]}`,
        marginBottom: tokens.space[5],
        display: "flex",
        alignItems: "center",
        gap: tokens.space[4],
        flexWrap: "wrap",
      }}
    >
      <div
        style={{
          width: 46, height: 46, borderRadius: 13,
          background: tokens.color.brand[500], color: tokens.color.neutral[0],
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, boxShadow: tokens.shadow.priority,
        }}
      >
        <Icons.sparkle size={23} />
      </div>

      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.semibold, letterSpacing: "0.05em", textTransform: "uppercase", color: tokens.color.brand[600], marginBottom: tokens.space[1] }}>
          Ta prochaine action
        </div>
        <div style={{ fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[900], letterSpacing: "-0.3px", marginBottom: 3 }}>
          {todo.title}
        </div>
        <div style={{ fontSize: tokens.font.size.sm, color: tokens.color.neutral[700], lineHeight: tokens.font.leading.normal }}>
          {todo.subtitle}
        </div>
      </div>

      <div style={{ display: "flex", gap: tokens.space[2], flexShrink: 0 }}>
        <Button variant="primary" size="lg" rightIcon={<Icons.chevronR size={16} />} onClick={cb || undefined} disabled={!cb}>
          {todo.buttonLabel || "Démarrer"}
        </Button>
        <Button variant="secondary" size="lg" onClick={handlerMap.onReports || undefined} disabled={!handlerMap.onReports}>
          Dernier PV
        </Button>
      </div>
    </div>
  );
}

// ── Atomes internes de bento ──

// En-tête de card bento : pastille d'icône neutre 32×32 + titre.
function BentoHead({ icon: IconComp, title }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: tokens.space[2], marginBottom: tokens.space[4] }}>
      <div style={{ width: 32, height: 32, borderRadius: tokens.radius.md, background: tokens.color.neutral[100], color: tokens.color.neutral[500], display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <IconComp size={17} />
      </div>
      <span style={{ fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[900] }}>{title}</span>
    </div>
  );
}

// Barre de progression fine réutilisable.
function ProgressBar({ pct, color, height = 7 }) {
  return (
    <div style={{ height, borderRadius: tokens.radius.full, background: tokens.color.neutral[100], overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: tokens.radius.full }} />
    </div>
  );
}

// Wrapper bento — Card cliquable, radius xl, padding cohérent.
function Bento({ onClick, ariaLabel, borderLeft, children, column }) {
  return (
    <Card
      onClick={onClick || undefined}
      ariaLabel={ariaLabel}
      padding={4}
      style={{
        borderRadius: tokens.radius.xl,
        ...(borderLeft ? { borderLeft: `3px solid ${borderLeft}` } : null),
        ...(column ? { display: "flex", flexDirection: "column" } : null),
      }}
    >
      {children}
    </Card>
  );
}

// 1. Réserves OPR — % levées + barre + pills de gravité (sémantique seule).
function ReservesCard({ reserves, onClick }) {
  return (
    <Bento onClick={onClick} ariaLabel="Réserves OPR — gérer">
      <BentoHead icon={Icons.alert} title="Réserves OPR" />
      {reserves.total === 0 ? (
        <div style={{ fontSize: tokens.font.size.sm, color: tokens.color.neutral[500] }}>Aucune réserve · démarrer l'OPR</div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: tokens.space[1], marginBottom: tokens.space[3] }}>
            <span style={{ fontSize: tokens.font.size["2xl"], fontWeight: tokens.font.weight.bold, color: tokens.color.neutral[900], letterSpacing: "-0.8px" }}>{reserves.pct}</span>
            <span style={{ fontSize: tokens.font.size.base, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[500] }}>% levées</span>
          </div>
          <div style={{ marginBottom: tokens.space[3] }}>
            <ProgressBar pct={reserves.pct} color={tokens.color.semantic.success.fg} />
          </div>
          <div style={{ display: "flex", gap: tokens.space[2], flexWrap: "wrap" }}>
            {reserves.critiques > 0 && <Badge variant="danger">{reserves.critiques} critique{reserves.critiques > 1 ? "s" : ""}</Badge>}
            {reserves.open > 0 && <Badge variant="warning">{reserves.open} ouverte{reserves.open > 1 ? "s" : ""}</Badge>}
            {reserves.open === 0 && <Badge variant="success">Toutes levées</Badge>}
          </div>
        </>
      )}
    </Bento>
  );
}

// 2. Honoraires — signal danger = filet latéral + montant rouge, fond clair.
function BillingCard({ billing, onClick }) {
  const TONE = {
    danger:  tokens.color.semantic.danger.fg,
    warning: tokens.color.semantic.warning.fg,
    success: tokens.color.semantic.success.fg,
    neutral: tokens.color.neutral[500],
  };
  return (
    <Bento onClick={onClick} ariaLabel="Honoraires — ouvrir" borderLeft={billing.tone === "danger" ? tokens.color.semantic.danger.fg : null}>
      <BentoHead icon={Icons.file} title="Honoraires" />
      {billing.amount && (
        <div style={{ fontSize: tokens.font.size["2xl"], fontWeight: tokens.font.weight.bold, letterSpacing: "-0.6px", color: billing.tone === "danger" ? tokens.color.semantic.danger.fg : tokens.color.neutral[900], marginBottom: 3 }}>
          {billing.amount}
        </div>
      )}
      <div style={{ fontSize: tokens.font.size.sm, color: TONE[billing.tone] || TONE.neutral, fontWeight: billing.tone === "neutral" ? tokens.font.weight.regular : tokens.font.weight.medium }}>
        {billing.line}
      </div>
    </Bento>
  );
}

// 3. Prochaine réunion — date + meta + pile d'avatars (initiales).
function MeetingCard({ meeting, participants, onClick }) {
  if (!meeting) {
    return (
      <Bento onClick={onClick} ariaLabel="Planifier une réunion">
        <BentoHead icon={Icons.calendar} title="Prochaine réunion" />
        <div style={{ fontSize: tokens.font.size.sm, color: tokens.color.neutral[500] }}>Aucune réunion planifiée</div>
      </Bento>
    );
  }
  const people = (participants || []).slice(0, 4);
  const overflow = Math.max(0, (participants || []).length - 4);
  const AV_BG = [tokens.color.brand[100], tokens.color.semantic.info.bg, tokens.color.semantic.success.bg, tokens.color.neutral[100]];
  const AV_FG = [tokens.color.brand[700], tokens.color.semantic.info.fg, tokens.color.semantic.success.fg, tokens.color.neutral[500]];
  return (
    <Bento onClick={onClick} ariaLabel="Prochaine réunion — modifier">
      <BentoHead icon={Icons.calendar} title="Prochaine réunion" />
      <div style={{ fontSize: tokens.font.size.xl, fontWeight: tokens.font.weight.bold, color: tokens.color.neutral[900], letterSpacing: "-0.4px" }}>{meeting.label}</div>
      <div style={{ fontSize: tokens.font.size.sm, color: tokens.color.neutral[500], marginTop: 2 }}>
        {meeting.overdueDays > 0
          ? <span style={{ color: tokens.color.semantic.warning.fg, fontWeight: tokens.font.weight.medium }}>Passée ({meeting.overdueDays}j) · {meeting.recurrence}</span>
          : `sur site · ${meeting.recurrence}`}
      </div>
      {people.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", marginTop: tokens.space[3] }}>
          {people.map((p, i) => (
            <div key={i} title={p.name} style={{ width: 28, height: 28, borderRadius: tokens.radius.full, background: AV_BG[i % 4], color: AV_FG[i % 4], display: "flex", alignItems: "center", justifyContent: "center", fontWeight: tokens.font.weight.semibold, fontSize: 11, border: `2px solid ${tokens.color.neutral[0]}`, marginLeft: i === 0 ? 0 : -7 }}>
              {initials(p.role || p.name)}
            </div>
          ))}
          {overflow > 0 && (
            <div style={{ width: 28, height: 28, borderRadius: tokens.radius.full, background: tokens.color.neutral[100], color: tokens.color.neutral[500], display: "flex", alignItems: "center", justifyContent: "center", fontWeight: tokens.font.weight.semibold, fontSize: 11, border: `2px solid ${tokens.color.neutral[0]}`, marginLeft: -7 }}>
              +{overflow}
            </div>
          )}
        </div>
      )}
    </Bento>
  );
}

function initials(s) {
  if (!s) return "?";
  const parts = String(s).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// 4. Planning — barres de lots neutres (pas de couleur : c'est de l'avancement).
function PlanningCard({ planning, onClick }) {
  return (
    <Bento onClick={onClick} ariaLabel={`Planning — ${planning.count} lots`}>
      <BentoHead icon={Icons.chart} title={`Planning · ${planning.count} lot${planning.count > 1 ? "s" : ""}`} />
      {planning.top.length === 0 ? (
        <div style={{ fontSize: tokens.font.size.sm, color: tokens.color.neutral[500] }}>Aucun lot · planifier les travaux</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: tokens.space[2] }}>
          {planning.top.map((lot, i) => (
            <div key={i}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: tokens.font.size.xs, color: tokens.color.neutral[700], marginBottom: 4 }}>
                <span>{lot.name}</span>
                <span style={{ color: tokens.color.neutral[500] }}>{lot.pct}%</span>
              </div>
              <ProgressBar pct={lot.pct} color={tokens.color.neutral[500]} height={5} />
            </div>
          ))}
        </div>
      )}
    </Bento>
  );
}

// 5. Journal de chantier — timeline de 3 événements récents.
function JournalCard({ journal, onClick }) {
  const DOT = {
    brand:   tokens.color.brand[500],
    success: tokens.color.semantic.success.fg,
    neutral: tokens.color.neutral[300],
  };
  return (
    <Bento onClick={onClick} ariaLabel="Journal de chantier — ouvrir">
      <BentoHead icon={Icons.clock} title="Journal de chantier" />
      {journal.length === 0 ? (
        <div style={{ fontSize: tokens.font.size.sm, color: tokens.color.neutral[500] }}>Timeline auto des PV, photos et OPR</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: tokens.space[2] }}>
          {journal.map((e, i) => (
            <div key={i} style={{ display: "flex", gap: tokens.space[2], alignItems: "center" }}>
              <span style={{ width: 6, height: 6, borderRadius: tokens.radius.full, background: DOT[e.tone], flexShrink: 0 }} />
              <span style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[700] }}>{e.text} · {relAge(e.t)}</span>
            </div>
          ))}
        </div>
      )}
    </Bento>
  );
}

function relAge(t) {
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days <= 0) return "auj.";
  if (days === 1) return "hier";
  return `${days} j`;
}

// 6. Devis & soumissions — compteur + CTA secondaire "Comparer avec l'IA".
function QuotesCard({ count, onClick }) {
  return (
    <Bento onClick={onClick} ariaLabel="Devis & soumissions — comparer" column>
      <BentoHead icon={Icons.chart} title="Devis & soumissions" />
      <div style={{ fontSize: tokens.font.size.xl, fontWeight: tokens.font.weight.bold, color: tokens.color.neutral[900], letterSpacing: "-0.4px" }}>
        {count > 0 ? `${count} devis` : "Aucun devis"}
      </div>
      <div style={{ fontSize: tokens.font.size.sm, color: tokens.color.neutral[500], marginTop: 2, marginBottom: tokens.space[4] }}>
        {count > 0 ? "à comparer côte à côte" : "upload + comparaison IA"}
      </div>
      <div style={{ marginTop: "auto" }}>
        <Button
          variant="secondary"
          size="sm"
          onClick={onClick ? (e) => { e.stopPropagation(); onClick(); } : undefined}
          disabled={!onClick}
        >
          Comparer avec l'IA
        </Button>
      </div>
    </Bento>
  );
}

// ─────────────────────────────────────────────────────────────
// Onglet Fiche : infos + intervenants (gauche) · CdC + phases (rail droit)
// ─────────────────────────────────────────────────────────────

function SheetTab({ project, handlerMap }) {
  const fields = deriveInfoFields(project);
  const intervenants = deriveIntervenants(project);
  const phases = derivePhasesList(project);

  return (
    <div style={{ display: "flex", gap: tokens.space[5], alignItems: "flex-start", flexWrap: "wrap" }}>
      {/* Colonne principale */}
      <div style={{ flex: 1, minWidth: 320, display: "flex", flexDirection: "column", gap: tokens.space[4] }}>
        <InfoCard fields={fields} onEdit={handlerMap.onEditInfo} />
        <IntervenantsCard intervenants={intervenants} onAdd={handlerMap.onEditInfo} />
      </div>

      {/* Rail droit */}
      <div style={{ width: 280, flexShrink: 0, display: "flex", flexDirection: "column", gap: tokens.space[3] }}>
        <CdcCard project={project} onOpen={handlerMap.onCdc} />
        <PhasesCard phases={phases} onManage={handlerMap.onEditInfo} />
      </div>
    </div>
  );
}

// En-tête de card Fiche : titre + (count) + action à droite.
function CardHead({ title, count, action }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: tokens.space[2], marginBottom: tokens.space[4] }}>
      <span style={{ fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[900] }}>{title}</span>
      {typeof count === "number" && <span style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[500] }}>{count}</span>}
      {action && <div style={{ marginLeft: "auto" }}>{action}</div>}
    </div>
  );
}

// Informations générales — grille label/valeur 2 colonnes.
function InfoCard({ fields, onEdit }) {
  return (
    <Card padding={5} style={{ borderRadius: tokens.radius.xl }}>
      <CardHead
        title="Informations générales"
        action={<Button variant="secondary" size="sm" leftIcon={<Icons.edit size={13} />} onClick={onEdit || undefined} disabled={!onEdit}>Modifier</Button>}
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: `${tokens.space[4]} ${tokens.space[8]}` }}>
        {fields.map((f, i) => (
          <div key={i}>
            <div style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[500], marginBottom: 3 }}>{f.label}</div>
            <div style={{ fontSize: tokens.font.size.base, color: f.value === "—" ? tokens.color.neutral[300] : tokens.color.neutral[900], fontWeight: tokens.font.weight.medium }}>{f.value}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// Intervenants — liste avatar + nom + rôle (pill) + téléphone.
function IntervenantsCard({ intervenants, onAdd }) {
  return (
    <Card padding={5} style={{ borderRadius: tokens.radius.xl }}>
      <CardHead
        title="Intervenants"
        count={intervenants.length}
        action={<Button variant="secondary" size="sm" leftIcon={<Icons.plus size={13} />} onClick={onAdd || undefined} disabled={!onAdd}>Ajouter</Button>}
      />
      {intervenants.length === 0 ? (
        <div style={{ fontSize: tokens.font.size.sm, color: tokens.color.neutral[500] }}>Aucun intervenant — ajoute le MO, les entreprises et les bureaux d'études.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {intervenants.map((p, i) => <IntervenantRow key={i} p={p} />)}
        </div>
      )}
    </Card>
  );
}

function IntervenantRow({ p }) {
  const [hover, setHover] = useState(false);
  const s = p.style;
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: tokens.space[3],
        padding: `${tokens.space[2]} ${tokens.space[2]}`,
        borderRadius: tokens.radius.md,
        background: hover ? tokens.color.neutral[50] : "transparent",
        transition: tokens.transition.base,
      }}
    >
      <div style={{ width: 34, height: 34, borderRadius: tokens.radius.full, background: s.avBg, color: s.avFg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: tokens.font.weight.semibold, fontSize: tokens.font.size.xs, flexShrink: 0 }}>
        {initials(p.name)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[900] }}>{p.name}</div>
        {p.sub && <div style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[500] }}>{p.sub}</div>}
      </div>
      <span style={{ fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.medium, padding: "2px 9px", borderRadius: tokens.radius.full, background: s.pillBg, color: s.pillFg, border: `1px solid ${s.pillBorder}`, whiteSpace: "nowrap" }}>{s.label}</span>
      {p.phone && <span style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[500], width: 120, textAlign: "right" }}>{p.phone}</span>}
    </div>
  );
}

// Cahier des charges — card tintée brand (accent subtil autorisé).
function CdcCard({ project, onOpen }) {
  const posts = (project?.cdcPosts || project?.cahierCharges?.posts || []).length;
  const analysed = posts > 0 || !!project?.cdcAnalysis;
  return (
    <Card padding={4} style={{ borderRadius: tokens.radius.xl, background: tokens.color.brand[50], border: `1px solid ${tokens.color.brand[100]}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: tokens.space[2], marginBottom: tokens.space[2] }}>
        <span style={{ color: tokens.color.brand[600], display: "inline-flex" }}><Icons.file size={17} /></span>
        <span style={{ fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.semibold, color: tokens.color.brand[600] }}>Cahier des charges</span>
      </div>
      <div style={{ fontSize: tokens.font.size.sm, color: tokens.color.neutral[700], lineHeight: tokens.font.leading.normal, marginBottom: tokens.space[3] }}>
        {analysed
          ? `CdC analysé · ${posts} poste${posts > 1 ? "s" : ""} extraits par l'IA.`
          : "Importe le cahier des charges pour que l'IA en extraie les postes et obligations."}
      </div>
      <BrandGhostButton onClick={onOpen} label={analysed ? "Voir la structure" : "Importer le CdC"} />
    </Card>
  );
}

// Bouton ghost teinté brand (fond blanc, texte + bordure brand). Réservé
// au contexte de la card CdC tintée — pas un CTA primaire concurrent.
function BrandGhostButton({ onClick, label }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick || undefined}
      disabled={!onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: "100%", height: 34,
        background: hover && onClick ? tokens.color.brand[100] : tokens.color.neutral[0],
        border: `1px solid ${tokens.color.brand[100]}`,
        borderRadius: tokens.radius.md,
        color: tokens.color.brand[600],
        fontFamily: tokens.font.family,
        fontSize: tokens.font.size.xs,
        fontWeight: tokens.font.weight.semibold,
        cursor: onClick ? "pointer" : "not-allowed",
        opacity: onClick ? 1 : 0.6,
        transition: tokens.transition.base,
      }}
    >
      {label}
    </button>
  );
}

// Phases du projet — liste d'états (faite ✓ / en cours / à venir).
function PhasesCard({ phases, onManage }) {
  const DOT = { done: tokens.color.semantic.success.fg, active: tokens.color.brand[500], upcoming: tokens.color.neutral[200] };
  return (
    <Card padding={4} style={{ borderRadius: tokens.radius.xl }}>
      <div style={{ fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[500], textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: tokens.space[3] }}>
        Phases du projet
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: tokens.space[2] }}>
        {phases.map((ph, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: tokens.space[2], fontSize: tokens.font.size.sm }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: DOT[ph.state], flexShrink: 0 }} />
            <span style={{
              color: ph.state === "active" ? tokens.color.neutral[900] : ph.state === "upcoming" ? tokens.color.neutral[300] : tokens.color.neutral[500],
              fontWeight: ph.state === "active" ? tokens.font.weight.semibold : tokens.font.weight.regular,
            }}>
              {ph.label}
            </span>
            {ph.state === "done" && <span style={{ marginLeft: "auto", color: tokens.color.semantic.success.fg, display: "inline-flex" }}><Icons.check size={14} /></span>}
            {ph.state === "active" && <span style={{ marginLeft: "auto", fontSize: tokens.font.size.xs, color: tokens.color.brand[600], fontWeight: tokens.font.weight.semibold }}>en cours</span>}
          </div>
        ))}
      </div>
      <div style={{ marginTop: tokens.space[3] }}>
        <Button variant="secondary" size="sm" fullWidth onClick={onManage || undefined} disabled={!onManage}>Gérer les phases</Button>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Onglet Actions : toolbar + board kanban (À traiter / En cours / Résolu)
// ─────────────────────────────────────────────────────────────

const ACTION_COLS = [
  { key: "todo",  label: "À traiter", dot: "#D97706" },                       // amber décoratif
  { key: "doing", label: "En cours",  dot: tokens.color.brand[400] },          // accent décoratif autorisé
  { key: "done",  label: "Résolu",    dot: tokens.color.semantic.success.fg, done: true },
];

// ── Sélecteurs réutilisables (assigné · échéance) ─────────────
const ACT_MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const ACT_DOW = ["L", "M", "M", "J", "V", "S", "D"];
const isoCell = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const dueShort = (due) => {
  if (!due) return "";
  const d = parseDateFR(due) || new Date(due);
  if (isNaN(+d)) return String(due);
  return d.toLocaleDateString("fr-BE", { day: "numeric", month: "short" });
};
function MiniDatePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const base = value ? (parseDateFR(value) || new Date(value)) : new Date();
  const safe = isNaN(+base) ? new Date() : base;
  const [view, setView] = useState({ y: safe.getFullYear(), m: safe.getMonth() });
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const t = new Date(); const todayIso = isoCell(t.getFullYear(), t.getMonth(), t.getDate());
  const firstDow = (new Date(view.y, view.m, 1).getDay() + 6) % 7;
  const nDays = new Date(view.y, view.m + 1, 0).getDate();
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: nDays }, (_, i) => i + 1)];
  const shift = (n) => setView(v => { const d = new Date(v.y, v.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const curIso = value ? (() => { const d = parseDateFR(value) || new Date(value); return isNaN(+d) ? "" : isoCell(d.getFullYear(), d.getMonth(), d.getDate()); })() : "";
  return (
    <div ref={ref} style={{ position: "relative" }} onClick={e => e.stopPropagation()}>
      <button onClick={() => setOpen(o => !o)} style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 24, padding: "0 8px", borderRadius: tokens.radius.full, border: `1px ${value ? "solid" : "dashed"} ${tokens.color.neutral[200]}`, background: tokens.color.neutral[0], color: value ? tokens.color.neutral[700] : tokens.color.neutral[500], cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: tokens.font.weight.medium }}>
        <Svg size={11}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></Svg>{value ? dueShort(value) : "Échéance"}
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 70, width: 230, background: tokens.color.neutral[0], border: `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.lg, boxShadow: "0 12px 32px rgba(28,25,23,0.16)", padding: tokens.space[3] }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: tokens.space[2] }}>
            <button onClick={() => shift(-1)} style={{ width: 24, height: 24, border: "none", background: "transparent", color: tokens.color.neutral[500], cursor: "pointer" }}><Svg size={14} sw={2}><polyline points="15 18 9 12 15 6" /></Svg></button>
            <span style={{ fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.semibold, textTransform: "capitalize" }}>{ACT_MONTHS[view.m]} {view.y}</span>
            <button onClick={() => shift(1)} style={{ width: 24, height: 24, border: "none", background: "transparent", color: tokens.color.neutral[500], cursor: "pointer" }}><Svg size={14} sw={2}><polyline points="9 6 15 12 9 18" /></Svg></button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 2 }}>{ACT_DOW.map((d, i) => <span key={i} style={{ textAlign: "center", fontSize: 10, color: tokens.color.neutral[400] }}>{d}</span>)}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {cells.map((d, i) => {
              if (d === null) return <span key={i} />;
              const iso = isoCell(view.y, view.m, d), sel = iso === curIso, isToday = iso === todayIso;
              return <button key={i} onClick={() => { onChange(iso); setOpen(false); }} style={{ height: 26, borderRadius: tokens.radius.full, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: sel ? tokens.font.weight.bold : tokens.font.weight.medium, background: sel ? tokens.color.brand[500] : isToday ? tokens.color.brand[50] : "transparent", color: sel ? "#fff" : tokens.color.neutral[900] }}>{d}</button>;
            })}
          </div>
          {value && <button onClick={() => { onChange(""); setOpen(false); }} style={{ marginTop: tokens.space[2], width: "100%", height: 26, borderRadius: tokens.radius.md, border: `1px solid ${tokens.color.neutral[200]}`, background: tokens.color.neutral[0], color: tokens.color.neutral[500], cursor: "pointer", fontFamily: "inherit", fontSize: 11 }}>Effacer</button>}
        </div>
      )}
    </div>
  );
}
function AssignMenu({ participants, value, onChange, avatarStyleFor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const st = avatarStyleFor(value);
  return (
    <div ref={ref} style={{ position: "relative" }} onClick={e => e.stopPropagation()}>
      <button onClick={() => setOpen(o => !o)} title={value || "Assigner"} style={value
        ? { display: "inline-flex", alignItems: "center", gap: 5, height: 24, padding: "0 8px 0 3px", borderRadius: tokens.radius.full, border: `1px solid ${tokens.color.neutral[200]}`, background: tokens.color.neutral[0], cursor: "pointer", fontFamily: "inherit", fontSize: 11, color: tokens.color.neutral[700] }
        : { display: "inline-flex", alignItems: "center", gap: 4, height: 24, padding: "0 8px", borderRadius: tokens.radius.full, border: `1px dashed ${tokens.color.neutral[300]}`, background: tokens.color.neutral[0], cursor: "pointer", fontFamily: "inherit", fontSize: 11, color: tokens.color.neutral[500] }}>
        {value ? <><span style={{ width: 18, height: 18, borderRadius: tokens.radius.full, background: st.avBg, color: st.avFg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: tokens.font.weight.bold, fontSize: 9 }}>{initials(value)}</span>{value.split(" ")[0]}</> : <><Svg size={11}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Svg>Assigner</>}
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 70, minWidth: 180, background: tokens.color.neutral[0], border: `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.lg, boxShadow: "0 12px 32px rgba(28,25,23,0.16)", padding: 4, maxHeight: 240, overflowY: "auto" }}>
          {(participants || []).filter(p => p.name).map((p, i) => {
            const sel = p.name === value, ps = avatarStyleFor(p.name);
            return <button key={i} onClick={() => { onChange(sel ? "" : p.name); setOpen(false); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: tokens.space[2], padding: `${tokens.space[2]}`, border: "none", borderRadius: tokens.radius.md, background: sel ? tokens.color.brand[50] : "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
              <span style={{ width: 22, height: 22, borderRadius: tokens.radius.full, background: ps.avBg, color: ps.avFg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: tokens.font.weight.bold, flexShrink: 0 }}>{initials(p.name)}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: tokens.font.size.sm, color: tokens.color.neutral[900], whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
              {sel && <span style={{ color: tokens.color.brand[600], display: "inline-flex" }}><Icons.check size={13} /></span>}
            </button>;
          })}
          {value && <button onClick={() => { onChange(""); setOpen(false); }} style={{ width: "100%", textAlign: "left", padding: tokens.space[2], border: "none", borderTop: `1px solid ${tokens.color.neutral[100]}`, marginTop: 2, background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 11, color: tokens.color.neutral[500] }}>Retirer</button>}
        </div>
      )}
    </div>
  );
}

const PRIO_RANK = { urgent: 0, high: 1, medium: 2, low: 3 };
function ActionsTab({ project, handlerMap, profile }) {
  const [view, setView] = useState("board");
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [who, setWho] = useState("all");      // all | me | <nom>
  const [sort, setSort] = useState("due");    // due | priority | recent
  const [openId, setOpenId] = useState(null);
  const cols = useMemo(() => deriveActions(project), [project]);
  const participants = project?.participants || [];
  const me = (profile?.name || "").toLowerCase();

  const avatarStyleFor = useMemo(() => {
    const map = new Map();
    participants.forEach(p => map.set((p.name || "").toLowerCase(), ROLE_STYLE[roleCategory(p.role || "")]));
    return (name) => map.get((name || "").toLowerCase()) || ROLE_STYLE.neutral;
  }, [project]);

  // Filtre (recherche + assigné) + tri appliqués à chaque colonne.
  const fcols = useMemo(() => {
    const dueVal = (d) => { if (!d) return Infinity; const dt = parseDateFR(d) || new Date(d); return isNaN(+dt) ? Infinity : +dt; };
    const apply = (arr) => {
      let r = (arr || []).filter(a => {
        if (q && !(a.title || "").toLowerCase().includes(q.toLowerCase())) return false;
        if (who === "me") return (a.assignee || "").toLowerCase() === me;
        if (who !== "all") return a.assignee === who;
        return true;
      });
      return [...r].sort((a, b) =>
        sort === "priority" ? (PRIO_RANK[a.priority] ?? 9) - (PRIO_RANK[b.priority] ?? 9)
          : sort === "recent" ? String(b.created).localeCompare(String(a.created))
            : dueVal(a.due) - dueVal(b.due));
    };
    return { todo: apply(cols.todo), doing: apply(cols.doing), done: apply(cols.done) };
  }, [cols, q, who, sort, me]);

  const totalShown = fcols.todo.length + fcols.doing.length + fcols.done.length;
  const canAdd = !!handlerMap.onAddAction;
  const onPrimary = canAdd ? () => setAdding(v => !v) : (handlerMap.onNewAction || undefined);
  const openAction = openId != null ? (project.actions || []).find(x => String(x.id) === String(openId)) : null;
  const selStyle = { height: 36, borderRadius: tokens.radius.md, border: `1px solid ${tokens.color.neutral[200]}`, background: tokens.color.neutral[0], color: tokens.color.neutral[700], fontFamily: "inherit", fontSize: tokens.font.size.sm, cursor: "pointer", padding: "0 8px" };

  return (
    <div>
      {/* Toolbar : vue · recherche · assigné · tri · ajout */}
      <div style={{ display: "flex", alignItems: "center", gap: tokens.space[2], marginBottom: tokens.space[4], flexWrap: "wrap" }}>
        <SegToggle value={view} onChange={setView} options={[{ id: "board", label: "Tableau" }, { id: "list", label: "Liste" }]} />
        <div style={{ display: "flex", alignItems: "center", gap: tokens.space[2], height: 36, padding: `0 ${tokens.space[3]}`, border: `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.md, background: tokens.color.neutral[0], minWidth: 180 }}>
          <span style={{ color: tokens.color.neutral[400], display: "inline-flex" }}><Svg size={14}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></Svg></span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher une action…" style={{ border: "none", outline: "none", background: "transparent", fontFamily: "inherit", fontSize: tokens.font.size.sm, color: tokens.color.neutral[900], width: 150 }} />
        </div>
        <select value={who} onChange={e => setWho(e.target.value)} style={selStyle} title="Filtrer par intervenant">
          <option value="all">Tous les intervenants</option>
          {me && <option value="me">Mes tâches</option>}
          {participants.filter(p => p.name).map((p, i) => <option key={i} value={p.name}>{p.name}</option>)}
        </select>
        <select value={sort} onChange={e => setSort(e.target.value)} style={selStyle} title="Trier">
          <option value="due">Tri : échéance</option>
          <option value="priority">Tri : priorité</option>
          <option value="recent">Tri : récent</option>
        </select>
        <div style={{ marginLeft: "auto" }}>
          <Button variant="primary" size="md" leftIcon={<Icons.plus size={15} />} onClick={onPrimary} disabled={!canAdd && !handlerMap.onNewAction}>Nouvelle action</Button>
        </div>
      </div>

      {adding && canAdd && (
        <ActionComposer
          participants={participants}
          onCancel={() => setAdding(false)}
          onAdd={(draft) => { handlerMap.onAddAction(draft); setAdding(false); }}
        />
      )}

      {totalShown === 0 && (q || who !== "all") ? (
        <div style={{ padding: tokens.space[8], textAlign: "center", color: tokens.color.neutral[500], fontSize: tokens.font.size.sm }}>Aucune action ne correspond à ce filtre.</div>
      ) : view === "board" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: tokens.space[4], alignItems: "start" }}>
          {ACTION_COLS.map(col => (
            <ActionColumn key={col.key} col={col} cards={fcols[col.key]} participants={participants} avatarStyleFor={avatarStyleFor} onOpen={(a) => setOpenId(a.id)} onMove={handlerMap.onMoveAction} onAssign={handlerMap.onAssignAction} onDue={handlerMap.onSetActionDue} />
          ))}
        </div>
      ) : (
        <ActionList cols={fcols} participants={participants} avatarStyleFor={avatarStyleFor} onOpen={(a) => setOpenId(a.id)} onAssign={handlerMap.onAssignAction} onDue={handlerMap.onSetActionDue} />
      )}

      {openAction && (
        <ActionDrawer
          action={openAction}
          project={project}
          participants={participants}
          avatarStyleFor={avatarStyleFor}
          onClose={() => setOpenId(null)}
          onUpdate={handlerMap.onUpdateAction}
          onMove={handlerMap.onMoveAction}
          onDelete={handlerMap.onDeleteAction ? (id) => { handlerMap.onDeleteAction(id); setOpenId(null); } : undefined}
        />
      )}
    </div>
  );
}

// ── Drawer de détail d'une action (clic sur une carte) ────────
const DRAWER_PRIOS = [{ id: "urgent", label: "Urgent" }, { id: "high", label: "Haute" }, { id: "medium", label: "Normale" }, { id: "low", label: "Basse" }];
function ActionDrawer({ action, project, participants, avatarStyleFor, onClose, onUpdate, onMove, onDelete }) {
  const a = action;
  const prio = a.urgent ? "urgent" : normActionPriority(a.priority);
  const curCol = normActionColumn(a);
  const attachments = a.attachments || [];
  const [pickerOpen, setPickerOpen] = useState(false);
  const upd = (patch) => onUpdate?.(a.id, patch);
  return (
    <>
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(28,25,23,0.28)", display: "flex", justifyContent: "flex-end" }}>
      <div onMouseDown={e => e.stopPropagation()} style={{ width: 440, maxWidth: "100%", height: "100%", background: tokens.color.neutral[0], boxShadow: "-12px 0 40px rgba(28,25,23,0.18)", display: "flex", flexDirection: "column", fontFamily: tokens.font.family }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: tokens.space[2], padding: `${tokens.space[4]} ${tokens.space[5]}`, borderBottom: `1px solid ${tokens.color.neutral[200]}` }}>
          <span style={{ fontSize: 11, fontFamily: "ui-monospace, monospace", color: tokens.color.neutral[400] }}>{a.code || `A-${a.id}`}</span>
          {a.since && <span style={{ fontSize: 11, padding: "1px 8px", borderRadius: tokens.radius.full, background: tokens.color.neutral[100], color: tokens.color.neutral[500] }}>{a.since}</span>}
          <button onClick={onClose} aria-label="Fermer" style={{ marginLeft: "auto", width: 30, height: 30, borderRadius: tokens.radius.md, border: "none", background: "transparent", color: tokens.color.neutral[500], cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Svg size={17} sw={1.8}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></Svg></button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: tokens.space[5], display: "flex", flexDirection: "column", gap: tokens.space[5] }}>
          {/* Titre */}
          <textarea defaultValue={a.text || a.title || ""} onBlur={e => { const v = e.target.value.trim(); if (v && v !== (a.text || a.title)) upd({ text: v }); }} rows={2}
            style={{ width: "100%", boxSizing: "border-box", border: "none", outline: "none", resize: "none", fontFamily: "inherit", fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[900], lineHeight: 1.3 }} />

          {/* Statut (colonnes) */}
          <Field label="Statut">
            <div style={{ display: "inline-flex", gap: 3, background: tokens.color.neutral[100], borderRadius: tokens.radius.md, padding: 3 }}>
              {ACTION_COLS.map(c => { const act = c.key === curCol; return <button key={c.key} onClick={() => onMove?.(a.id, c.key)} style={{ padding: "6px 12px", borderRadius: tokens.radius.sm, border: "none", background: act ? tokens.color.neutral[0] : "transparent", boxShadow: act ? tokens.shadow.sm : "none", color: act ? tokens.color.neutral[900] : tokens.color.neutral[500], fontFamily: "inherit", fontSize: tokens.font.size.xs, fontWeight: act ? tokens.font.weight.semibold : tokens.font.weight.medium, cursor: "pointer" }}>{c.label}</button>; })}
            </div>
          </Field>

          {/* Priorité */}
          <Field label="Priorité">
            <div style={{ display: "inline-flex", gap: 3, background: tokens.color.neutral[100], borderRadius: tokens.radius.md, padding: 3 }}>
              {DRAWER_PRIOS.map(o => { const act = prio === o.id; const fg = o.id === "urgent" ? tokens.color.semantic.danger.fg : o.id === "high" ? "#B45309" : tokens.color.neutral[900]; return <button key={o.id} onClick={() => upd({ priority: o.id })} style={{ padding: "6px 11px", borderRadius: tokens.radius.sm, border: "none", background: act ? tokens.color.neutral[0] : "transparent", boxShadow: act ? tokens.shadow.sm : "none", color: act ? fg : tokens.color.neutral[500], fontFamily: "inherit", fontSize: tokens.font.size.xs, fontWeight: act ? tokens.font.weight.semibold : tokens.font.weight.medium, cursor: "pointer" }}>{o.label}</button>; })}
            </div>
          </Field>

          {/* Assigné + échéance */}
          <div style={{ display: "flex", gap: tokens.space[6], flexWrap: "wrap" }}>
            <Field label="Assigné à"><AssignMenu participants={participants} value={a.who || ""} onChange={(name) => upd({ who: name })} avatarStyleFor={avatarStyleFor} /></Field>
            <Field label="Échéance"><MiniDatePicker value={a.due || ""} onChange={(v) => upd({ due: v })} /></Field>
          </div>

          {/* Description */}
          <Field label="Description">
            <textarea defaultValue={a.description || a.notes || ""} onBlur={e => upd({ description: e.target.value })} placeholder="Ajoute des détails, un contexte, des étapes…" rows={5}
              style={{ width: "100%", boxSizing: "border-box", padding: tokens.space[3], border: `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.md, fontFamily: "inherit", fontSize: tokens.font.size.sm, lineHeight: 1.5, color: tokens.color.neutral[900], outline: "none", resize: "vertical" }} />
          </Field>

          {/* Pièces jointes */}
          <Field label="Pièces jointes">
            <div style={{ display: "flex", flexWrap: "wrap", gap: tokens.space[2] }}>
              {attachments.map((att, i) => <AttachmentChip key={i} att={att} onRemove={() => upd({ attachments: attachments.filter((_, j) => j !== i) })} />)}
              <button onClick={() => setPickerOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: `0 ${tokens.space[3]}`, border: `1px dashed ${tokens.color.brand[200]}`, borderRadius: tokens.radius.md, background: tokens.color.neutral[0], color: tokens.color.brand[600], cursor: "pointer", fontFamily: "inherit", fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.medium }}><Svg size={14} sw={2}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></Svg>Ajouter</button>
            </div>
          </Field>
        </div>

        {/* Footer */}
        {onDelete && (
          <div style={{ padding: `${tokens.space[3]} ${tokens.space[5]}`, borderTop: `1px solid ${tokens.color.neutral[200]}`, display: "flex" }}>
            <button onClick={() => { if (confirm("Supprimer cette action ?")) onDelete(a.id); }} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: `0 ${tokens.space[3]}`, border: `1px solid ${tokens.color.semantic.danger.border}`, borderRadius: tokens.radius.md, background: tokens.color.neutral[0], color: tokens.color.semantic.danger.fg, cursor: "pointer", fontFamily: "inherit", fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.medium }}><Svg size={14}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></Svg>Supprimer</button>
          </div>
        )}
      </div>
    </div>
    {pickerOpen && <AttachmentPicker project={project} onClose={() => setPickerOpen(false)} onPick={(att) => { upd({ attachments: [...attachments, att] }); setPickerOpen(false); }} />}
    </>
  );
}

// Chip d'une pièce jointe (photo = vignette, doc = icône + nom).
function AttachmentChip({ att, onRemove }) {
  const src = att.url || att.dataUrl;
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 7, height: 34, padding: att.type === "image" ? "3px 8px 3px 3px" : `0 ${tokens.space[2]} 0 ${tokens.space[3]}`, border: `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.md, background: tokens.color.neutral[0], maxWidth: 200 }}>
      {att.type === "image" && src
        ? <img src={src} alt="" style={{ width: 28, height: 28, borderRadius: 5, objectFit: "cover" }} />
        : <span style={{ color: tokens.color.neutral[500], display: "inline-flex" }}><Svg size={15}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></Svg></span>}
      <span style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[700], whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{att.name || "Fichier"}</span>
      {onRemove && <button onClick={onRemove} aria-label="Retirer" style={{ width: 18, height: 18, borderRadius: tokens.radius.full, border: "none", background: "transparent", color: tokens.color.neutral[400], cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Svg size={11} sw={2}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></Svg></button>}
    </div>
  );
}

// Sélecteur de pièce jointe : galerie projet · documents projet · appareil.
function AttachmentPicker({ project, onClose, onPick }) {
  const [tab, setTab] = useState("gallery");
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);
  const gallery = project?.gallery || [];
  const docs = ((project?.planFiles && project.planFiles.length ? project.planFiles : project?.documents) || []).filter(f => f.type !== "folder");
  const onLocal = (file) => {
    if (!file) return;
    const isImg = file.type?.startsWith("image/");
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = String(e.target.result || "");
      if (isImg) {
        setUploading(true);
        try { const res = await uploadPhoto(dataUrl); onPick({ type: "image", name: file.name, url: res?.url || dataUrl, from: "local" }); }
        catch { onPick({ type: "image", name: file.name, dataUrl, from: "local" }); }
        finally { setUploading(false); }
      } else {
        onPick({ type: "file", name: file.name, dataUrl, from: "local" });
      }
    };
    reader.readAsDataURL(file);
  };
  const TABS = [{ id: "gallery", label: `Galerie · ${gallery.length}` }, { id: "docs", label: `Documents · ${docs.length}` }, { id: "local", label: "Appareil" }];
  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(28,25,23,0.32)", display: "flex", alignItems: "center", justifyContent: "center", padding: tokens.space[5], fontFamily: tokens.font.family }}>
      <div onMouseDown={e => e.stopPropagation()} style={{ width: 560, maxWidth: "100%", maxHeight: "80vh", background: tokens.color.neutral[0], borderRadius: tokens.radius.xl, boxShadow: "0 24px 60px rgba(28,25,23,0.28)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: tokens.space[3], padding: `${tokens.space[4]} ${tokens.space[5]} ${tokens.space[3]}` }}>
          <div style={{ fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.bold, color: tokens.color.neutral[900], flex: 1 }}>Joindre une pièce</div>
          <button onClick={onClose} aria-label="Fermer" style={{ width: 30, height: 30, borderRadius: tokens.radius.md, border: "none", background: "transparent", color: tokens.color.neutral[500], cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Svg size={17} sw={1.8}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></Svg></button>
        </div>
        <div style={{ padding: `0 ${tokens.space[5]} ${tokens.space[3]}` }}>
          <div style={{ display: "inline-flex", gap: 3, background: tokens.color.neutral[100], borderRadius: tokens.radius.md, padding: 3 }}>
            {TABS.map(t => { const act = t.id === tab; return <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "6px 12px", borderRadius: tokens.radius.sm, border: "none", background: act ? tokens.color.neutral[0] : "transparent", boxShadow: act ? tokens.shadow.sm : "none", color: act ? tokens.color.neutral[900] : tokens.color.neutral[500], fontFamily: "inherit", fontSize: tokens.font.size.xs, fontWeight: act ? tokens.font.weight.semibold : tokens.font.weight.medium, cursor: "pointer" }}>{t.label}</button>; })}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: `0 ${tokens.space[5]} ${tokens.space[5]}` }}>
          {tab === "gallery" && (
            gallery.length === 0 ? <Empty text="Aucune photo dans la galerie." /> : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: tokens.space[2] }}>
                {gallery.map((ph, i) => { const src = getPhotoUrl(ph); return (
                  <button key={ph.id ?? i} onClick={() => onPick({ type: "image", name: ph.caption || "Photo", url: src, id: ph.id, from: "gallery" })} style={{ aspectRatio: "1/1", borderRadius: tokens.radius.md, overflow: "hidden", border: `1px solid ${tokens.color.neutral[200]}`, background: tokens.color.neutral[100], cursor: "pointer", padding: 0 }}>
                    {src ? <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <span style={{ fontSize: 10, color: tokens.color.neutral[400] }}>photo</span>}
                  </button>); })}
              </div>
            )
          )}
          {tab === "docs" && (
            docs.length === 0 ? <Empty text="Aucun document dans le projet." /> : (
              <div style={{ display: "flex", flexDirection: "column", gap: tokens.space[2] }}>
                {docs.map((f, i) => (
                  <button key={i} onClick={() => onPick({ type: "file", name: f.name || "Document", url: f.url || f.dataUrl || f.src || "", from: "doc" })} style={{ display: "flex", alignItems: "center", gap: tokens.space[3], padding: tokens.space[3], border: `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.md, background: tokens.color.neutral[0], cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                    <span style={{ color: tokens.color.neutral[500], display: "inline-flex" }}><Svg size={18}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></Svg></span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: tokens.font.size.sm, color: tokens.color.neutral[900], whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name || "Document"}</span>
                  </button>
                ))}
              </div>
            )
          )}
          {tab === "local" && (
            <div style={{ padding: `${tokens.space[4]} 0` }}>
              <button onClick={() => inputRef.current?.click()} disabled={uploading} style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: tokens.space[2], padding: `${tokens.space[8]} ${tokens.space[5]}`, border: `1.5px dashed ${tokens.color.brand[200]}`, borderRadius: tokens.radius.lg, background: tokens.color.brand[50], color: tokens.color.brand[600], cursor: uploading ? "wait" : "pointer", fontFamily: "inherit" }}>
                <Svg size={24} sw={1.5}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" /></Svg>
                <span style={{ fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.semibold }}>{uploading ? "Envoi…" : "Choisir un fichier (photo, PDF…)"}</span>
                <span style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[500] }}>Image, PDF ou document</span>
              </button>
              <input ref={inputRef} type="file" accept="image/*,.pdf,.doc,.docx,.txt" style={{ display: "none" }} onChange={e => onLocal(e.target.files?.[0])} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
function Empty({ text }) {
  return <div style={{ padding: tokens.space[8], textAlign: "center", color: tokens.color.neutral[500], fontSize: tokens.font.size.sm }}>{text}</div>;
}
function Field({ label, children }) {
  return <div><div style={{ fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[500], textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: tokens.space[2] }}>{label}</div>{children}</div>;
}

// Toggle segmenté (Tableau / Liste).
function SegToggle({ value, onChange, options }) {
  return (
    <div style={{ display: "inline-flex", gap: 3, background: tokens.color.neutral[100], borderRadius: tokens.radius.md, padding: 3 }}>
      {options.map(o => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            style={{
              padding: `6px ${tokens.space[3]}`,
              borderRadius: tokens.radius.sm,
              border: "none",
              background: active ? tokens.color.neutral[0] : "transparent",
              boxShadow: active ? tokens.shadow.sm : "none",
              color: active ? tokens.color.neutral[900] : tokens.color.neutral[500],
              fontFamily: tokens.font.family,
              fontSize: tokens.font.size.sm,
              fontWeight: active ? tokens.font.weight.semibold : tokens.font.weight.medium,
              cursor: "pointer",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Composer inline d'ajout d'action : titre + assigné + urgent.
function ActionComposer({ participants, onAdd, onCancel }) {
  const [text, setText] = useState("");
  const [who, setWho] = useState("");
  const [due, setDue] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [focused, setFocused] = useState(false);

  const submit = () => {
    if (!text.trim()) return;
    onAdd({ text: text.trim(), who, urgent, due });
  };

  return (
    <Card padding={4} style={{ borderRadius: tokens.radius.xl, marginBottom: tokens.space[4] }}>
      <div style={{ display: "flex", flexDirection: "column", gap: tokens.space[3] }}>
        <input
          autoFocus
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") submit(); if (e.key === "Escape") onCancel(); }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Décris l'action à suivre…"
          style={{
            width: "100%", boxSizing: "border-box",
            height: 40, padding: `0 ${tokens.space[3]}`,
            border: `1px solid ${focused ? tokens.color.brand[200] : tokens.color.neutral[200]}`,
            borderRadius: tokens.radius.md,
            background: tokens.color.neutral[0],
            color: tokens.color.neutral[900],
            fontFamily: tokens.font.family,
            fontSize: tokens.font.size.base,
            outline: "none",
            boxShadow: focused ? tokens.shadow.focus : "none",
            transition: tokens.transition.base,
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: tokens.space[3], flexWrap: "wrap" }}>
          {/* Assigné — select natif (intervenants du projet). */}
          <select
            value={who}
            onChange={e => setWho(e.target.value)}
            style={{
              height: 34, padding: `0 ${tokens.space[2]}`,
              border: `1px solid ${tokens.color.neutral[200]}`,
              borderRadius: tokens.radius.md,
              background: tokens.color.neutral[0],
              color: who ? tokens.color.neutral[900] : tokens.color.neutral[500],
              fontFamily: tokens.font.family,
              fontSize: tokens.font.size.sm,
              cursor: "pointer",
            }}
          >
            <option value="">Assigner à…</option>
            {participants.map((p, i) => (
              <option key={i} value={p.name}>{p.name}{p.role ? ` · ${p.role}` : ""}</option>
            ))}
          </select>

          {/* Échéance (date limite). */}
          <MiniDatePicker value={due} onChange={setDue} />

          {/* Toggle Urgent. */}
          <button
            type="button"
            onClick={() => setUrgent(u => !u)}
            style={{
              display: "inline-flex", alignItems: "center", gap: tokens.space[1],
              height: 34, padding: `0 ${tokens.space[3]}`,
              border: `1px solid ${urgent ? tokens.color.semantic.danger.border : tokens.color.neutral[200]}`,
              borderRadius: tokens.radius.md,
              background: urgent ? tokens.color.semantic.danger.bg : tokens.color.neutral[0],
              color: urgent ? tokens.color.semantic.danger.fg : tokens.color.neutral[500],
              fontFamily: tokens.font.family, fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.medium,
              cursor: "pointer", transition: tokens.transition.base,
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: tokens.radius.full, background: urgent ? tokens.color.semantic.danger.fg : tokens.color.neutral[300] }} />
            Urgent
          </button>

          <div style={{ marginLeft: "auto", display: "flex", gap: tokens.space[2] }}>
            <Button variant="ghost" size="md" onClick={onCancel}>Annuler</Button>
            <Button variant="primary" size="md" onClick={submit} disabled={!text.trim()}>Ajouter</Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function ActionColumn({ col, cards, participants, avatarStyleFor, onOpen, onMove, onAssign, onDue }) {
  const [over, setOver] = useState(false);
  const canDrop = !!onMove;
  return (
    <div
      onDragOver={canDrop ? (e) => { e.preventDefault(); if (!over) setOver(true); } : undefined}
      onDragLeave={canDrop ? (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false); } : undefined}
      onDrop={canDrop ? (e) => { e.preventDefault(); setOver(false); const id = e.dataTransfer.getData("text/plain"); if (id) onMove(id, col.key); } : undefined}
      style={{ background: over ? tokens.color.brand[50] : tokens.color.neutral[100], borderRadius: tokens.radius.lg, padding: tokens.space[3], outline: over ? `2px dashed ${tokens.color.brand[400]}` : "2px solid transparent", outlineOffset: -2, transition: tokens.transition.base, minHeight: 90 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: tokens.space[2], padding: `2px ${tokens.space[1]} ${tokens.space[3]}` }}>
        <span style={{ width: 8, height: 8, borderRadius: tokens.radius.full, background: col.dot }} />
        <span style={{ fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[900] }}>{col.label}</span>
        <span style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[500] }}>{cards.length}</span>
      </div>
      {cards.length === 0 ? (
        <div style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[400], padding: `${tokens.space[3]} ${tokens.space[1]}`, textAlign: "center" }}>{canDrop ? "Glisse une action ici" : "Aucune action"}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: tokens.space[2] }}>
          {cards.map((a) => (
            <ActionCard key={a.id} a={a} col={col.key} done={col.done} participants={participants} avatarStyleFor={avatarStyleFor} onOpen={onOpen} onAssign={onAssign} onDue={onDue} draggable={canDrop} />
          ))}
        </div>
      )}
    </div>
  );
}

function ActionCard({ a, done, participants, avatarStyleFor, avatarStyle, onOpen, onAssign, onDue, draggable }) {
  const isUrgent = a.priority === "urgent" && !done;
  const styleFor = avatarStyleFor || (() => avatarStyle || ROLE_STYLE.neutral);
  return (
    <Card
      draggable={draggable || undefined}
      onDragStart={draggable ? (e) => { e.dataTransfer.setData("text/plain", String(a.id)); e.dataTransfer.effectAllowed = "move"; } : undefined}
      onClick={onOpen ? () => onOpen(a) : undefined}
      ariaLabel={`Action ${a.code} — ${a.title}`}
      padding={3}
      style={{
        borderRadius: tokens.radius.lg,
        opacity: done ? 0.78 : 1,
        cursor: draggable ? "grab" : (onOpen ? "pointer" : "default"),
        ...(isUrgent ? { borderLeft: `3px solid ${tokens.color.semantic.danger.fg}` } : null),
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: tokens.space[2], marginBottom: tokens.space[2] }}>
        <span style={{ fontSize: 10, fontFamily: "ui-monospace, monospace", color: tokens.color.neutral[300] }}>{a.code}</span>
        {done ? (
          <span style={{ color: tokens.color.semantic.success.fg, display: "inline-flex" }}><Icons.check size={13} /></span>
        ) : (
          <PriorityTag priority={a.priority} />
        )}
        {a.source && (
          <span style={{ marginLeft: "auto", fontSize: 10, padding: "1px 7px", borderRadius: tokens.radius.full, background: tokens.color.neutral[100], color: tokens.color.neutral[500] }}>{a.source}</span>
        )}
      </div>

      <div style={{
        fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.medium, lineHeight: 1.4,
        color: done ? tokens.color.neutral[700] : tokens.color.neutral[900],
        textDecoration: done ? "line-through" : "none",
        textDecorationColor: done ? tokens.color.neutral[300] : undefined,
        marginBottom: tokens.space[2],
      }}>
        {a.title}
      </div>

      {/* Pied éditable : assigné + échéance */}
      <div style={{ display: "flex", alignItems: "center", gap: tokens.space[2], flexWrap: "wrap" }}>
        {onAssign
          ? <AssignMenu participants={participants} value={a.assignee} onChange={(name) => onAssign(a.id, name)} avatarStyleFor={styleFor} />
          : a.assignee && <span style={{ width: 24, height: 24, borderRadius: tokens.radius.full, background: styleFor(a.assignee).avBg, color: styleFor(a.assignee).avFg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: tokens.font.weight.semibold, fontSize: 10 }}>{initials(a.assignee)}</span>}
        {a.attachments && a.attachments.length > 0 && (
          <span title={`${a.attachments.length} pièce(s) jointe(s)`} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, color: tokens.color.neutral[500] }}>
            <Svg size={12}><path d="M21.4 11.05 12.25 20.2a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 0 1 4.24 4.24l-9.2 9.19a1 1 0 0 1-1.41-1.41l8.49-8.49" /></Svg>{a.attachments.length}
          </span>
        )}
        <span style={{ marginLeft: "auto" }}>
          {onDue
            ? <MiniDatePicker value={a.due} onChange={(v) => onDue(a.id, v)} />
            : (() => { const d = formatDue(a.due, done); return d ? <span style={{ fontSize: tokens.font.size.xs, fontWeight: d.overdue ? tokens.font.weight.semibold : tokens.font.weight.regular, color: d.overdue ? tokens.color.semantic.danger.fg : tokens.color.neutral[500] }}>{d.text}</span> : null; })()}
        </span>
      </div>
    </Card>
  );
}

// Tag de priorité : "Urgent" en pill danger, sinon dot + label.
function PriorityTag({ priority }) {
  if (priority === "urgent") {
    return <span style={{ fontSize: 10, fontWeight: tokens.font.weight.semibold, padding: "1px 7px", borderRadius: tokens.radius.full, background: tokens.color.semantic.danger.bg, color: tokens.color.semantic.danger.fg }}>Urgent</span>;
  }
  const cfg = priority === "high"
    ? { dot: "#D97706", fg: tokens.color.semantic.warning.fg, label: "Haute" }
    : priority === "low"
      ? { dot: tokens.color.neutral[300], fg: tokens.color.neutral[500], label: "Basse" }
      : { dot: tokens.color.neutral[300], fg: tokens.color.neutral[500], label: "Moyenne" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: cfg.fg }}>
      <span style={{ width: 6, height: 6, borderRadius: tokens.radius.full, background: cfg.dot }} />
      {cfg.label}
    </span>
  );
}

// Vue Liste — alternative compacte au board, regroupée par colonne.
function ActionList({ cols, participants, avatarStyleFor, onOpen, onAssign, onDue }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: tokens.space[5] }}>
      {ACTION_COLS.map(col => (
        cols[col.key].length > 0 && (
          <div key={col.key}>
            <div style={{ display: "flex", alignItems: "center", gap: tokens.space[2], marginBottom: tokens.space[2] }}>
              <span style={{ width: 8, height: 8, borderRadius: tokens.radius.full, background: col.dot }} />
              <span style={{ fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[900] }}>{col.label}</span>
              <span style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[500] }}>{cols[col.key].length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: tokens.space[2] }}>
              {cols[col.key].map((a) => (
                <ActionCard key={a.id} a={a} col={col.key} done={col.done} participants={participants} avatarStyleFor={avatarStyleFor} onOpen={onOpen} onAssign={onAssign} onDue={onDue} />
              ))}
            </div>
          </div>
        )
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Onglet Planning : Gantt Phase → Lot → Tâche + repère "Aujourd'hui"
// ─────────────────────────────────────────────────────────────

const GANTT_ROW_H = { phase: 30, lot: 50, task: 34 };
const GANTT_HEADER_H = 38;
// Couleurs de barres — sémantique pure (décoratif Gantt). Vert/taupe/rouge/gris.
const GANTT_BAR = {
  done:    { track: "#EAF6EF", fill: "#16A34A", text: tokens.color.semantic.success.fg },
  doing:   { track: "#F2EAE3", fill: "#B58A6F", text: "#8A6F5C" },
  overdue: { track: tokens.color.semantic.danger.bg, border: tokens.color.semantic.danger.border, fill: "#DC2626", text: tokens.color.semantic.danger.fg },
  planned: { track: tokens.color.neutral[100], border: tokens.color.neutral[300], text: tokens.color.neutral[500] },
};

function planTaskClosed(t) {
  const s = String(t.status || "").toLowerCase();
  return t.done || t.open === false || /clos|done|terminé|validated|closed|résolu|resolu|levée/.test(s);
}
function planMs(d) {
  if (!d) return null;
  const x = parseDateFR(d) || new Date(d);
  const t = +x;
  return isNaN(t) ? null : t;
}

function buildPlanning(project) {
  const lots = project?.lots || [];
  const tasks = project?.tasks || [];
  const byLot = new Map();
  tasks.forEach(t => { const k = String(t.lotId ?? t.lot ?? ""); if (!byLot.has(k)) byLot.set(k, []); byLot.get(k).push(t); });

  const today = +new Date(new Date().setHours(0, 0, 0, 0));
  const dates = [];
  const push = (d) => { const m = planMs(d); if (m) dates.push(m); };
  push(project?.startDate); push(project?.endDate);
  tasks.forEach(t => { push(t.dueDate); push(t.startDate); });

  let start, end;
  if (dates.length >= 2) { start = Math.min(...dates); end = Math.max(...dates); }
  else { start = today - 30 * 86400000; end = today + 150 * 86400000; }
  const sd = new Date(start); start = +new Date(sd.getFullYear(), sd.getMonth(), 1);
  const ed = new Date(end); end = +new Date(ed.getFullYear(), ed.getMonth() + 1, 0);
  const span = Math.max(1, end - start);
  const pct = (ms) => ((ms - start) / span) * 100;

  const months = [];
  let cur = new Date(start);
  const now = new Date(today);
  while (+cur <= end && months.length < 14) {
    months.push({ label: cur.toLocaleDateString("fr-BE", { month: "short" }), current: cur.getMonth() === now.getMonth() && cur.getFullYear() === now.getFullYear() });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  const todayPct = Math.max(0, Math.min(100, pct(today)));

  let doneCount = 0, totalCount = 0;
  const outLots = lots.map((lot, i) => {
    const lt = byLot.get(String(lot.id ?? i)) || [];
    const lotDates = lt.map(t => planMs(t.dueDate)).filter(Boolean);
    const closed = lt.filter(planTaskClosed).length;
    totalCount += lt.length; doneCount += closed;
    const progress = typeof lot.progress === "number" ? lot.progress : (lt.length ? Math.round(closed / lt.length * 100) : 0);
    const overdue = lt.some(t => !planTaskClosed(t) && planMs(t.dueDate) && planMs(t.dueDate) < today);
    const status = lt.length === 0 ? "planned" : closed === lt.length ? "done" : overdue ? "overdue" : progress > 0 ? "doing" : "planned";
    let lStart = lotDates.length ? Math.min(...lotDates) : start;
    let lEnd = lotDates.length ? Math.max(...lotDates) : lStart + 30 * 86400000;
    if (lEnd <= lStart) lEnd = lStart + 20 * 86400000;
    const leftPct = Math.max(0, pct(lStart));
    const widthPct = Math.max(5, Math.min(100 - leftPct, pct(lEnd) - pct(lStart)));
    const tasksOut = lt.map((t, j) => {
      const d = planMs(t.dueDate);
      const tClosed = planTaskClosed(t);
      const tOver = !tClosed && d && d < today;
      const tStart = d ? d - 12 * 86400000 : lStart;
      const tEnd = d || lEnd;
      return {
        id: t.id ?? `${i}-${j}`, code: `${i + 1}.${j + 1}`, title: t.title || t.text || "Tâche",
        status: tClosed ? "done" : tOver ? "overdue" : "doing",
        statusLabel: tClosed ? "Terminé" : tOver ? "En retard" : "En cours",
        progress: tClosed ? 100 : 50,
        leftPct: Math.max(0, pct(tStart)), widthPct: Math.max(4, Math.min(100 - Math.max(0, pct(tStart)), pct(tEnd) - pct(tStart))),
      };
    });
    return { id: lot.id ?? i, name: lot.name || lot.label || "Lot", contractor: lot.contractor || lot.responsable || "", count: lt.length, progress, status, overdue, leftPct, widthPct, tasks: tasksOut };
  });
  const globalProgress = totalCount ? Math.round(doneCount / totalCount * 100) : 0;
  return { lots: outLots, months, todayPct, globalProgress };
}

function PlanningTab({ project, phase, handlerMap }) {
  const [view, setView] = useState("gantt");
  const [expanded, setExpanded] = useState(() => new Set());
  const data = useMemo(() => buildPlanning(project), [project]);
  const onNewLot = handlerMap.onNewLot || handlerMap.onPlanning;
  const toggle = (id) => setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toolbar = (
    <div style={{ display: "flex", alignItems: "center", gap: tokens.space[3], marginBottom: tokens.space[4], flexWrap: "wrap" }}>
      <SegToggle value={view} onChange={setView} options={[{ id: "hierarchy", label: "Hiérarchie" }, { id: "gantt", label: "Gantt" }]} />
      <Button variant="secondary" size="md" rightIcon={<Svg size={14} sw={2}><polyline points="6 9 12 15 18 9" /></Svg>}>Toutes les phases</Button>
      <div style={{ marginLeft: "auto" }}>
        <Button variant="primary" size="md" leftIcon={<Icons.plus size={15} />} onClick={onNewLot || undefined} disabled={!onNewLot}>Nouveau lot</Button>
      </div>
    </div>
  );

  if (data.lots.length === 0) {
    return (
      <div>
        {toolbar}
        <div style={{ padding: tokens.space[10], background: tokens.color.neutral[50], border: `1px dashed ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.xl, textAlign: "center" }}>
          <div style={{ fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[700], marginBottom: tokens.space[1] }}>Aucun lot planifié</div>
          <div style={{ fontSize: tokens.font.size.sm, color: tokens.color.neutral[500] }}>Crée des lots et leurs tâches pour suivre l'avancement du chantier dans le temps.</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {toolbar}
      {view === "gantt"
        ? <GanttCard data={data} phaseLabel={phase?.label || "Chantier"} expanded={expanded} onToggle={toggle} />
        : <HierarchyList data={data} expanded={expanded} onToggle={toggle} />}
    </div>
  );
}

// Couleur du % d'avancement d'un lot selon son état.
function lotProgressColor(status) {
  return status === "done" ? "#16A34A"
    : status === "overdue" ? tokens.color.semantic.danger.fg
    : status === "doing" ? "#8A6F5C"
    : tokens.color.neutral[500];
}

// Construit la liste de lignes (phase / lot / task) partagée gauche+droite.
function ganttRows(data, expanded) {
  const rows = [{ type: "phase", label: `${data._phaseLabel} · ${data.lots.length} lot${data.lots.length > 1 ? "s" : ""}` }];
  data.lots.forEach(lot => {
    rows.push({ type: "lot", lot });
    if (expanded.has(lot.id)) lot.tasks.forEach(task => rows.push({ type: "task", task }));
  });
  return rows;
}

function GanttCard({ data, phaseLabel, expanded, onToggle }) {
  data._phaseLabel = phaseLabel;
  const rows = ganttRows(data, expanded);
  return (
    <Card padding={0} style={{ borderRadius: tokens.radius.xl, overflow: "hidden" }}>
      <div style={{ display: "flex" }}>
        {/* Colonne gauche — labels Lot · responsable */}
        <div style={{ width: 300, flexShrink: 0, borderRight: `1px solid ${tokens.color.neutral[200]}` }}>
          <div style={{ height: GANTT_HEADER_H, display: "flex", alignItems: "center", padding: `0 ${tokens.space[4]}`, fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.semibold, letterSpacing: "0.05em", textTransform: "uppercase", color: tokens.color.neutral[500], borderBottom: `1px solid ${tokens.color.neutral[200]}` }}>
            Lot · responsable
          </div>
          {rows.map((r, i) => <GanttLeftRow key={i} row={r} onToggle={onToggle} expanded={expanded} />)}
        </div>

        {/* Colonne droite — timeline */}
        <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
          {/* Repère Aujourd'hui */}
          <div style={{ position: "absolute", top: GANTT_HEADER_H, bottom: 0, left: `${data.todayPct}%`, width: 2, background: tokens.color.brand[500], zIndex: 3 }}>
            <div style={{ position: "absolute", top: -2, left: -15, background: tokens.color.brand[500], color: "#fff", fontSize: 9, fontWeight: tokens.font.weight.bold, padding: "1px 6px", borderRadius: 4, whiteSpace: "nowrap" }}>AUJ.</div>
          </div>
          {/* En-tête mois */}
          <div style={{ height: GANTT_HEADER_H, display: "flex", borderBottom: `1px solid ${tokens.color.neutral[200]}` }}>
            {data.months.map((m, i) => (
              <div key={i} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: tokens.font.size.xs, fontWeight: m.current ? tokens.font.weight.semibold : tokens.font.weight.medium, color: m.current ? tokens.color.brand[600] : tokens.color.neutral[500], borderRight: i < data.months.length - 1 ? `1px solid ${tokens.color.neutral[100]}` : "none" }}>
                {m.label}
              </div>
            ))}
          </div>
          {/* Pistes */}
          <div style={{ backgroundImage: `repeating-linear-gradient(90deg, transparent, transparent calc(${100 / data.months.length}% - 1px), ${tokens.color.neutral[100]} calc(${100 / data.months.length}% - 1px), ${tokens.color.neutral[100]} ${100 / data.months.length}%)` }}>
            {rows.map((r, i) => <GanttRightRow key={i} row={r} />)}
          </div>
        </div>
      </div>

      {/* Légende */}
      <div style={{ display: "flex", alignItems: "center", gap: tokens.space[5], padding: `${tokens.space[3]} ${tokens.space[4]}`, borderTop: `1px solid ${tokens.color.neutral[200]}`, background: tokens.color.neutral[50], flexWrap: "wrap" }}>
        <LegendDot color="#16A34A" label="Terminé" />
        <LegendDot color="#B58A6F" label="En cours" />
        <LegendDot color="#DC2626" label="En retard" />
        <LegendDot color={tokens.color.neutral[100]} border={tokens.color.neutral[300]} label="À venir" />
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: tokens.space[1], fontSize: tokens.font.size.xs, color: tokens.color.neutral[500] }}>
          <span style={{ width: 2, height: 13, background: tokens.color.brand[500] }} /> Aujourd'hui · avancement global
          <b style={{ color: tokens.color.neutral[900], marginLeft: 2 }}>{data.globalProgress}%</b>
        </div>
      </div>
    </Card>
  );
}

function LegendDot({ color, border, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: tokens.space[1], fontSize: tokens.font.size.xs, color: tokens.color.neutral[500] }}>
      <span style={{ width: 12, height: 12, borderRadius: 3, background: color, border: border ? `1px dashed ${border}` : "none" }} />
      {label}
    </div>
  );
}

function GanttLeftRow({ row, onToggle, expanded }) {
  if (row.type === "phase") {
    return <div style={{ height: GANTT_ROW_H.phase, display: "flex", alignItems: "center", padding: `0 ${tokens.space[4]}`, background: tokens.color.brand[50], fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.bold, letterSpacing: "0.05em", textTransform: "uppercase", color: tokens.color.brand[600], borderBottom: `1px solid ${tokens.color.neutral[100]}` }}>{row.label}</div>;
  }
  if (row.type === "task") {
    const t = row.task;
    const st = GANTT_BAR[t.status];
    return (
      <div style={{ height: GANTT_ROW_H.task, display: "flex", alignItems: "center", gap: tokens.space[2], padding: `0 ${tokens.space[4]} 0 38px`, borderBottom: `1px solid ${tokens.color.neutral[100]}`, background: "#FDFBF9" }}>
        <span style={{ fontSize: 11, fontFamily: "ui-monospace, monospace", color: tokens.color.neutral[300] }}>{t.code}</span>
        <span style={{ fontSize: tokens.font.size.sm, color: tokens.color.neutral[700], overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
        <span style={{ marginLeft: "auto", fontSize: 10, padding: "1px 7px", borderRadius: tokens.radius.full, background: st.track, color: st.text, fontWeight: tokens.font.weight.medium, whiteSpace: "nowrap" }}>{t.statusLabel}</span>
      </div>
    );
  }
  // lot
  const lot = row.lot;
  const isOpen = expanded.has(lot.id);
  return (
    <button
      type="button"
      onClick={() => lot.tasks.length && onToggle(lot.id)}
      style={{ width: "100%", height: GANTT_ROW_H.lot, display: "flex", alignItems: "center", gap: tokens.space[2], padding: `0 ${tokens.space[4]}`, borderBottom: `1px solid ${tokens.color.neutral[100]}`, background: isOpen ? "#FDFBF9" : "transparent", border: "none", borderBottomWidth: 1, cursor: lot.tasks.length ? "pointer" : "default", fontFamily: "inherit", textAlign: "left" }}
    >
      <span style={{ display: "inline-flex", color: isOpen ? tokens.color.brand[500] : tokens.color.neutral[300], transform: isOpen ? "rotate(90deg)" : "none", transition: tokens.transition.base }}>
        <Svg size={13} sw={2.2}><polyline points="9 6 15 12 9 18" /></Svg>
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[900], whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lot.name}</div>
        <div style={{ fontSize: tokens.font.size.xs, color: lot.overdue ? tokens.color.semantic.danger.fg : tokens.color.neutral[500], fontWeight: lot.overdue ? tokens.font.weight.medium : tokens.font.weight.regular }}>
          {lot.contractor || "À planifier"} · {lot.count} tâche{lot.count > 1 ? "s" : ""}
        </div>
      </div>
      <span style={{ fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.semibold, color: lotProgressColor(lot.status) }}>{lot.progress}%</span>
    </button>
  );
}

function GanttRightRow({ row }) {
  if (row.type === "phase") {
    return <div style={{ height: GANTT_ROW_H.phase, borderBottom: `1px solid ${tokens.color.neutral[100]}`, background: tokens.color.brand[50] }} />;
  }
  if (row.type === "task") {
    const t = row.task;
    const st = GANTT_BAR[t.status];
    return (
      <div style={{ height: GANTT_ROW_H.task, borderBottom: `1px solid ${tokens.color.neutral[100]}`, position: "relative", background: "#FDFBF9" }}>
        <div style={{ position: "absolute", top: 9, height: 16, left: `${t.leftPct}%`, width: `${t.widthPct}%`, background: st.track, borderRadius: 4, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${t.progress}%`, background: st.fill, opacity: t.status === "done" ? 0.7 : 1 }} />
        </div>
      </div>
    );
  }
  // lot
  const lot = row.lot;
  const st = GANTT_BAR[lot.status];
  return (
    <div style={{ height: GANTT_ROW_H.lot, borderBottom: `1px solid ${tokens.color.neutral[100]}`, position: "relative" }}>
      <div style={{ position: "absolute", top: 13, height: 24, left: `${lot.leftPct}%`, width: `${lot.widthPct}%`, background: st.track, border: st.border ? `1px ${lot.status === "planned" ? "dashed" : "solid"} ${st.border}` : "none", borderRadius: 6, overflow: "hidden", display: "flex", alignItems: "center" }}>
        {lot.status !== "planned" && (
          <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${lot.status === "done" ? 100 : lot.progress}%`, background: st.fill, opacity: lot.status === "done" ? 0.85 : 1 }} />
        )}
        {lot.status !== "done" && lot.status !== "planned" && (
          <span style={{ position: "relative", marginLeft: 8, fontSize: 11, fontWeight: tokens.font.weight.semibold, color: lot.status === "overdue" ? tokens.color.semantic.danger.fg : "#fff", zIndex: 1, whiteSpace: "nowrap" }}>
            {lot.status === "overdue" ? "En retard" : lot.name}
          </span>
        )}
      </div>
    </div>
  );
}

// Vue Hiérarchie — alternative repliable au Gantt (Lot → Tâches).
function HierarchyList({ data, expanded, onToggle }) {
  return (
    <Card padding={0} style={{ borderRadius: tokens.radius.xl, overflow: "hidden" }}>
      {data.lots.map((lot, i) => {
        const isOpen = expanded.has(lot.id);
        return (
          <div key={lot.id} style={{ borderBottom: i < data.lots.length - 1 ? `1px solid ${tokens.color.neutral[100]}` : "none" }}>
            <button type="button" onClick={() => lot.tasks.length && onToggle(lot.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: tokens.space[2], padding: `${tokens.space[3]} ${tokens.space[4]}`, background: "transparent", border: "none", cursor: lot.tasks.length ? "pointer" : "default", fontFamily: "inherit", textAlign: "left" }}>
              <span style={{ display: "inline-flex", color: isOpen ? tokens.color.brand[500] : tokens.color.neutral[300], transform: isOpen ? "rotate(90deg)" : "none" }}><Svg size={13} sw={2.2}><polyline points="9 6 15 12 9 18" /></Svg></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[900] }}>{lot.name}</div>
                <div style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[500] }}>{lot.contractor || "À planifier"} · {lot.count} tâche{lot.count > 1 ? "s" : ""}</div>
              </div>
              <span style={{ fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.semibold, color: lotProgressColor(lot.status) }}>{lot.progress}%</span>
            </button>
            {isOpen && lot.tasks.map(t => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: tokens.space[2], padding: `${tokens.space[2]} ${tokens.space[4]} ${tokens.space[2]} 42px`, borderTop: `1px solid ${tokens.color.neutral[100]}` }}>
                <span style={{ fontSize: 11, fontFamily: "ui-monospace, monospace", color: tokens.color.neutral[300] }}>{t.code}</span>
                <span style={{ flex: 1, fontSize: tokens.font.size.sm, color: tokens.color.neutral[700] }}>{t.title}</span>
                <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: tokens.radius.full, background: GANTT_BAR[t.status].track, color: GANTT_BAR[t.status].text, fontWeight: tokens.font.weight.medium }}>{t.statusLabel}</span>
              </div>
            ))}
          </div>
        );
      })}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Onglet PV : action focale "Préparer le prochain PV" + historique
// ─────────────────────────────────────────────────────────────

function PvTab({ project, handlerMap }) {
  const focal = useMemo(() => derivePvFocal(project), [project]);
  const list = useMemo(() => derivePvList(project), [project]);
  const [showAll, setShowAll] = useState(false);
  const VISIBLE = 6;
  const shown = showAll ? list : list.slice(0, VISIBLE);
  const hidden = list.length - shown.length;

  return (
    <div>
      {/* Action focale — surface tintée, unique CTA primaire. */}
      <div style={{ background: tokens.color.brand[50], border: `1px solid ${tokens.color.brand[100]}`, borderRadius: tokens.radius.xl, padding: `${tokens.space[4]} ${tokens.space[5]}`, marginBottom: tokens.space[5], display: "flex", alignItems: "center", gap: tokens.space[4], flexWrap: "wrap" }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: tokens.color.brand[500], color: tokens.color.neutral[0], display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: tokens.shadow.priority }}>
          <Icons.sparkle size={21} />
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[900] }}>{focal.title}</div>
          <div style={{ fontSize: tokens.font.size.sm, color: tokens.color.neutral[700], marginTop: 2, lineHeight: tokens.font.leading.normal }}>{focal.subtitle}</div>
        </div>
        <Button variant="primary" size="lg" rightIcon={<Icons.chevronR size={16} />} onClick={handlerMap.onStartNotes || undefined} disabled={!handlerMap.onStartNotes}>
          Démarrer
        </Button>
      </div>

      {/* Historique */}
      <div style={{ display: "flex", alignItems: "center", gap: tokens.space[2], marginBottom: tokens.space[3] }}>
        <span style={{ fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[500], textTransform: "uppercase", letterSpacing: "0.05em" }}>Historique des PV</span>
        <span style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[500] }}>{list.length}</span>
      </div>

      {list.length === 0 ? (
        <div style={{ padding: tokens.space[8], background: tokens.color.neutral[50], border: `1px dashed ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.xl, textAlign: "center", color: tokens.color.neutral[500], fontSize: tokens.font.size.sm }}>
          Aucun PV émis pour l'instant — démarre le premier ci-dessus.
        </div>
      ) : (
        <>
          <Card padding={0} style={{ borderRadius: tokens.radius.xl, overflow: "hidden" }}>
            {shown.map((item, i) => (
              <PvRow
                key={item.number}
                item={item}
                isLast={i === shown.length - 1}
                onView={handlerMap.onViewPV}
                onPdf={handlerMap.onViewPdf}
                onSend={handlerMap.onSendPv || handlerMap.onViewPV}
              />
            ))}
          </Card>
          {hidden > 0 && (
            <div style={{ textAlign: "center", marginTop: tokens.space[3] }}>
              <Button variant="secondary" size="sm" onClick={() => setShowAll(true)}>Voir les {hidden} PV précédents</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PvRow({ item, isLast, onView, onPdf, onSend }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onView ? () => onView(item.raw) : undefined}
      style={{
        display: "flex", alignItems: "center", gap: tokens.space[4],
        padding: `${tokens.space[3]} ${tokens.space[4]}`,
        borderBottom: isLast ? "none" : `1px solid ${tokens.color.neutral[100]}`,
        background: hover ? tokens.color.neutral[50] : "transparent",
        cursor: onView ? "pointer" : "default",
        transition: tokens.transition.base,
      }}
    >
      <span style={{ fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.bold, color: tokens.color.neutral[900], fontFamily: "ui-monospace, monospace", width: 46, flexShrink: 0 }}>N°{item.number}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.medium, color: tokens.color.neutral[900], marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.title}</div>
        {item.excerpt && <div style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[500], whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.excerpt}</div>}
      </div>
      <span style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[700], width: 64, flexShrink: 0, whiteSpace: "nowrap" }}>{item.date}</span>
      <div style={{ width: 72, flexShrink: 0, display: "flex", justifyContent: "center" }}>
        <Badge variant={item.status.variant}>{item.status.label}</Badge>
      </div>
      <div style={{ display: "flex", gap: tokens.space[1], flexShrink: 0 }} onClick={e => e.stopPropagation()}>
        <IconButton variant="ghost" size="sm" label="Voir le PDF" onClick={onPdf ? () => onPdf(item.raw) : undefined} disabled={!onPdf}>
          <Icons.file size={16} />
        </IconButton>
        <IconButton variant="ghost" size="sm" label="Envoyer le PV" onClick={onSend ? () => onSend(item.raw) : undefined} disabled={!onSend}>
          <Icons.send size={16} />
        </IconButton>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Onglet Documents : dossiers (grille) + fichiers récents (table)
// ─────────────────────────────────────────────────────────────

function docKindColors(variant) {
  if (variant === "neutral") return { bg: tokens.color.neutral[100], fg: tokens.color.neutral[700] };
  const s = tokens.color.semantic[variant];
  return { bg: s.bg, fg: s.fg };
}

function DocumentsTab({ project, handlerMap }) {
  const { folders, files } = useMemo(() => deriveDocuments(project), [project]);
  const openDocs = handlerMap.onDocuments;
  const onImport = handlerMap.onImportDoc || handlerMap.onDocuments;

  return (
    <div>
      {/* Toolbar : fil d'ariane + import */}
      <div style={{ display: "flex", alignItems: "center", gap: tokens.space[3], marginBottom: tokens.space[5] }}>
        <div style={{ fontSize: tokens.font.size.sm, color: tokens.color.neutral[500] }}>
          Tous les fichiers <span style={{ color: tokens.color.neutral[300] }}>/</span> <span style={{ color: tokens.color.neutral[900], fontWeight: tokens.font.weight.medium }}>{project?.name || "Projet"}</span>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <Button variant="primary" size="md" leftIcon={<Svg size={15} sw={1.8}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></Svg>} onClick={onImport || undefined} disabled={!onImport}>
            Importer
          </Button>
        </div>
      </div>

      {folders.length === 0 && files.length === 0 ? (
        <div style={{ padding: tokens.space[10], background: tokens.color.neutral[50], border: `1px dashed ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.xl, textAlign: "center" }}>
          <div style={{ fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[700], marginBottom: tokens.space[1] }}>Aucun document</div>
          <div style={{ fontSize: tokens.font.size.sm, color: tokens.color.neutral[500] }}>Importe plans, permis, devis et pièces administratives pour les retrouver ici.</div>
        </div>
      ) : (
        <>
          {folders.length > 0 && (
            <>
              <div style={{ fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[500], textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: tokens.space[3] }}>Dossiers</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: tokens.space[3], marginBottom: tokens.space[6] }}>
                {folders.map((f, i) => <FolderCard key={i} folder={f} onClick={openDocs} />)}
              </div>
            </>
          )}

          {files.length > 0 && (
            <>
              <div style={{ fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[500], textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: tokens.space[3] }}>Fichiers récents</div>
              <Card padding={0} style={{ borderRadius: tokens.radius.xl, overflow: "hidden" }}>
                {/* En-tête de table */}
                <div style={{ display: "flex", alignItems: "center", gap: tokens.space[4], padding: `${tokens.space[2]} ${tokens.space[4]}`, borderBottom: `1px solid ${tokens.color.neutral[200]}`, fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[500], textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  <span style={{ flex: 1 }}>Nom</span>
                  <span style={{ width: 90 }}>Type</span>
                  <span style={{ width: 80 }}>Taille</span>
                  <span style={{ width: 110 }}>Modifié</span>
                  <span style={{ width: 32 }} />
                </div>
                {files.map((file, i) => <FileRow key={i} file={file} isLast={i === files.length - 1} onOpen={openDocs} />)}
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}

function FolderCard({ folder, onClick }) {
  return (
    <Card onClick={onClick || undefined} ariaLabel={`Dossier ${folder.name}`} padding={4} style={{ borderRadius: tokens.radius.lg }}>
      <svg width="26" height="26" viewBox="0 0 24 24" fill={tokens.color.brand[100]} stroke="#B58A6F" strokeWidth="1.4" aria-hidden="true">
        <path d="M4 7a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      </svg>
      <div style={{ fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[900], marginTop: tokens.space[2] }}>{folder.name}</div>
      <div style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[500] }}>{folder.count} fichier{folder.count > 1 ? "s" : ""}</div>
    </Card>
  );
}

function FileRow({ file, isLast, onOpen }) {
  const [hover, setHover] = useState(false);
  const c = docKindColors(file.kind.variant);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onOpen ? () => onOpen(file.raw) : undefined}
      style={{ display: "flex", alignItems: "center", gap: tokens.space[4], padding: `${tokens.space[3]} ${tokens.space[4]}`, borderBottom: isLast ? "none" : `1px solid ${tokens.color.neutral[100]}`, background: hover ? tokens.color.neutral[50] : "transparent", cursor: onOpen ? "pointer" : "default", transition: tokens.transition.base }}
    >
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: tokens.space[3], minWidth: 0 }}>
        <div style={{ width: 32, height: 32, borderRadius: tokens.radius.md, background: c.bg, color: c.fg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 9, fontWeight: tokens.font.weight.bold }}>{file.kind.label}</div>
        <span style={{ fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.medium, color: tokens.color.neutral[900], whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{file.name}</span>
      </div>
      <span style={{ width: 90, fontSize: tokens.font.size.xs, color: tokens.color.neutral[700] }}>{file.typeLabel}</span>
      <span style={{ width: 80, fontSize: tokens.font.size.xs, color: tokens.color.neutral[700] }}>{file.size}</span>
      <span style={{ width: 110, fontSize: tokens.font.size.xs, color: tokens.color.neutral[700] }}>{file.modified || "—"}</span>
      <div style={{ width: 32, flexShrink: 0, display: "flex", justifyContent: "center" }} onClick={e => e.stopPropagation()}>
        <IconButton variant="ghost" size="sm" label="Plus d'actions" onClick={onOpen ? () => onOpen(file.raw) : undefined} disabled={!onOpen}>
          <Svg size={16}><circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" /></Svg>
        </IconButton>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Onglet Photos : grilles par visite, tuiles avec badges annotation/réserve
// ─────────────────────────────────────────────────────────────

function PhotosTab({ project, handlerMap }) {
  const data = useMemo(() => derivePhotos(project), [project]);
  const [filter, setFilter] = useState("all");
  const onGallery = handlerMap.onGallery;
  const onImport = handlerMap.onImportPhoto || handlerMap.onGallery;

  const groups = data.groups
    .map(g => ({ ...g, photos: g.photos.filter(p => filter === "all" ? true : filter === "annotated" ? (p.hasVoice || p.hasText) : p.reserveCount > 0) }))
    .filter(g => g.photos.length);
  const shown = groups.reduce((s, g) => s + g.photos.length, 0);

  return (
    <div>
      {/* Toolbar : filtres + compteur + sélection + import */}
      <div style={{ display: "flex", alignItems: "center", gap: tokens.space[3], marginBottom: tokens.space[4], flexWrap: "wrap" }}>
        <SegToggle value={filter} onChange={setFilter} options={[{ id: "all", label: "Toutes" }, { id: "annotated", label: "Annotées" }, { id: "reserve", label: "Liées à réserve" }]} />
        <span style={{ fontSize: tokens.font.size.sm, color: tokens.color.neutral[500] }}>{shown} photo{shown > 1 ? "s" : ""}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: tokens.space[2] }}>
          <Button variant="secondary" size="md" onClick={onGallery || undefined} disabled={!onGallery}>Sélectionner</Button>
          <Button variant="primary" size="md" leftIcon={<Svg size={15} sw={1.8}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></Svg>} onClick={onImport || undefined} disabled={!onImport}>Importer</Button>
        </div>
      </div>

      {data.total === 0 ? (
        <div style={{ padding: tokens.space[10], background: tokens.color.neutral[50], border: `1px dashed ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.xl, textAlign: "center" }}>
          <div style={{ fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[700], marginBottom: tokens.space[1] }}>Aucune photo</div>
          <div style={{ fontSize: tokens.font.size.sm, color: tokens.color.neutral[500] }}>Prends des photos en visite de chantier — elles s'organisent ici par visite.</div>
        </div>
      ) : groups.length === 0 ? (
        <div style={{ padding: tokens.space[8], color: tokens.color.neutral[500], fontSize: tokens.font.size.sm, textAlign: "center" }}>Aucune photo ne correspond à ce filtre.</div>
      ) : (
        groups.map((g, gi) => (
          <div key={g.key} style={{ marginBottom: gi < groups.length - 1 ? tokens.space[6] : 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: tokens.space[2], marginBottom: tokens.space[3] }}>
              <span style={{ fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[900] }}>{g.label}</span>
              <span style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[500] }}>· {g.photos.length} photo{g.photos.length > 1 ? "s" : ""}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: tokens.space[3] }}>
              {g.photos.map(p => <PhotoTile key={p.id} p={p} onOpen={onGallery} />)}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function PhotoTile({ p, onOpen }) {
  const [hover, setHover] = useState(false);
  const warm = "repeating-linear-gradient(45deg, #EDE4DA, #EDE4DA 11px, #E5D9CC 11px, #E5D9CC 22px)";
  const neutral = `repeating-linear-gradient(45deg, ${tokens.color.neutral[200]}, ${tokens.color.neutral[200]} 11px, #DEDCDA 11px, #DEDCDA 22px)`;
  const badge = (icon, key) => (
    <span key={key} style={{ width: 22, height: 22, borderRadius: 7, background: "rgba(28,25,23,0.7)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</span>
  );
  return (
    <div
      onClick={onOpen ? () => onOpen(p.raw) : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative", aspectRatio: "4 / 3", borderRadius: tokens.radius.lg, overflow: "hidden",
        cursor: onOpen ? "pointer" : "default",
        background: p.url ? tokens.color.neutral[100] : (p.reserveCount > 0 ? warm : neutral),
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: hover ? tokens.shadow.md : "none",
        transition: tokens.transition.base,
      }}
    >
      {p.url
        ? <img src={p.url} alt={p.caption} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        : <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: p.reserveCount > 0 ? "#B58A6F" : tokens.color.neutral[500], padding: "0 8px", textAlign: "center" }}>{p.caption || "photo"}</span>}

      {/* Badges d'annotation (haut-gauche) */}
      {(p.hasVoice || p.hasText) && (
        <div style={{ position: "absolute", top: 8, left: 8, display: "flex", gap: 5 }}>
          {p.hasVoice && badge(<Icons.mic size={12} />, "v")}
          {p.hasText && badge(<Icons.edit size={11} />, "t")}
        </div>
      )}

      {/* Badge réserve (haut-droite) */}
      {p.reserveCount > 0 && (
        <div style={{ position: "absolute", top: 8, right: 8 }}>
          <span style={{ fontSize: 10, fontWeight: tokens.font.weight.semibold, padding: "2px 7px", borderRadius: tokens.radius.full, background: tokens.color.semantic.danger.bg, color: tokens.color.semantic.danger.fg }}>{p.reserveCount} rés.</span>
        </div>
      )}
    </div>
  );
}

// Placeholder pour les onglets non encore portés.
function TabPlaceholder({ label }) {
  return (
    <div
      style={{
        padding: tokens.space[10],
        background: tokens.color.neutral[50],
        border: `1px dashed ${tokens.color.neutral[200]}`,
        borderRadius: tokens.radius.lg,
        textAlign: "center",
        color: tokens.color.neutral[500],
        fontSize: tokens.font.size.sm,
        lineHeight: tokens.font.leading.relaxed,
      }}
    >
      <div style={{ fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[700], marginBottom: tokens.space[1] }}>
        Onglet « {label || "—"} »
      </div>
      On y travaille — cette vue arrive bientôt avec les mêmes composants.
    </div>
  );
}

export default ProjectDetail;
