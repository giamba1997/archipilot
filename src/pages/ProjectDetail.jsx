import { useEffect, useMemo, useState } from "react";
import { tokens } from "../design/tokens";
import { Button } from "../components/ui/v2/Button";
import { Badge } from "../components/ui/v2/Badge";
import { Card } from "../components/ui/v2/Card";
import { Tabs } from "../components/ui/v2/Tabs";
import { SectionHeader } from "../components/ui/v2/SectionHeader";
import { loadInvoices, loadQuotes } from "../db";
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
  nextMeeting: "", recurrence: "weekly",
  participants: [
    { name: "Ville de Nivelles", role: "MO" },
    { name: "Maître d'ouvrage", role: "MO" },
    { name: "Entreprise Générale", role: "ENT" },
  ],
  posts: [], pvHistory: [], reserves: [], gallery: [], planFiles: [],
  lots: [], customFields: [], actions: [], journalEntries: [], timeSessions: [],
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
    {
      value: String(open), suffix: total > 0 ? `/${total}` : null, label: "réserves ouvertes",
      tone: open > 0 ? "warning" : "neutral", dot: open > 0,
    },
    { value: fmtEur(overdueTtc), label: "à relancer", tone: overdueTtc > 0 ? "danger" : "neutral" },
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
  if (phase === "reception" && openReserves.length > 0) {
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
  if (phase === "permit") {
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
    { id: "planning", label: "Planning",  count: (project.lots || []).length,                                     showZero: false },
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

  const handlerMap = { onStartNotes, onEditInfo, onInvoices, onQuotes, onJournal, onOpr, onPermits, onReports, onPlanning, onCdc, onNewAction, onAddAction, onOpenAction, onEditMeeting };

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
        <ActionsTab project={project} handlerMap={handlerMap} />
      )}
      {!["summary", "sheet", "actions"].includes(activeTab) && (
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
        <ReservesCard reserves={reserves} onClick={handlerMap.onOpr} />
        <BillingCard billing={billing} onClick={handlerMap.onInvoices} />
        <MeetingCard meeting={meeting} participants={project.participants} onClick={handlerMap.onEditMeeting} />
        <PlanningCard planning={planning} onClick={handlerMap.onPlanning} />
        <JournalCard journal={journal} onClick={handlerMap.onJournal} />
        <QuotesCard count={quotesCount} onClick={handlerMap.onQuotes} />
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

function ActionsTab({ project, handlerMap }) {
  const [view, setView] = useState("board");
  const [adding, setAdding] = useState(false);
  const cols = useMemo(() => deriveActions(project), [project]);

  // Lookup nom → style d'avatar (couleur de rôle de l'intervenant).
  const avatarStyleFor = useMemo(() => {
    const map = new Map();
    (project?.participants || []).forEach(p => map.set((p.name || "").toLowerCase(), ROLE_STYLE[roleCategory(p.role || "")]));
    return (name) => map.get((name || "").toLowerCase()) || ROLE_STYLE.neutral;
  }, [project]);

  // L'ajout passe par un composer inline si App fournit onAddAction ;
  // sinon on retombe sur l'éventuel onNewAction (ouverture d'une vue dédiée).
  const canAdd = !!handlerMap.onAddAction;
  const onPrimary = canAdd ? () => setAdding(v => !v) : (handlerMap.onNewAction || undefined);

  return (
    <div>
      {/* Toolbar : toggle vue · filtre · action primaire unique */}
      <div style={{ display: "flex", alignItems: "center", gap: tokens.space[3], marginBottom: tokens.space[4], flexWrap: "wrap" }}>
        <SegToggle value={view} onChange={setView} options={[{ id: "board", label: "Tableau" }, { id: "list", label: "Liste" }]} />
        <Button variant="secondary" size="md" rightIcon={<Svg size={14} sw={2}><polyline points="6 9 12 15 18 9" /></Svg>}>Tous les intervenants</Button>
        <div style={{ marginLeft: "auto" }}>
          <Button variant="primary" size="md" leftIcon={<Icons.plus size={15} />} onClick={onPrimary} disabled={!canAdd && !handlerMap.onNewAction}>
            Nouvelle action
          </Button>
        </div>
      </div>

      {/* Composer inline — n'apparaît que sur demande, ne charge pas l'écran. */}
      {adding && canAdd && (
        <ActionComposer
          participants={project?.participants || []}
          onCancel={() => setAdding(false)}
          onAdd={(draft) => { handlerMap.onAddAction(draft); setAdding(false); }}
        />
      )}

      {view === "board" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: tokens.space[4], alignItems: "start" }}>
          {ACTION_COLS.map(col => (
            <ActionColumn key={col.key} col={col} cards={cols[col.key]} avatarStyleFor={avatarStyleFor} onOpen={handlerMap.onOpenAction} />
          ))}
        </div>
      ) : (
        <ActionList cols={cols} avatarStyleFor={avatarStyleFor} onOpen={handlerMap.onOpenAction} />
      )}
    </div>
  );
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
  const [urgent, setUrgent] = useState(false);
  const [focused, setFocused] = useState(false);

  const submit = () => {
    if (!text.trim()) return;
    onAdd({ text: text.trim(), who, urgent });
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

function ActionColumn({ col, cards, avatarStyleFor, onOpen }) {
  return (
    <div style={{ background: tokens.color.neutral[100], borderRadius: tokens.radius.lg, padding: tokens.space[3] }}>
      <div style={{ display: "flex", alignItems: "center", gap: tokens.space[2], padding: `2px ${tokens.space[1]} ${tokens.space[3]}` }}>
        <span style={{ width: 8, height: 8, borderRadius: tokens.radius.full, background: col.dot }} />
        <span style={{ fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[900] }}>{col.label}</span>
        <span style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[500] }}>{cards.length}</span>
      </div>
      {cards.length === 0 ? (
        <div style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[500], padding: `${tokens.space[2]} ${tokens.space[1]}` }}>Aucune action</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: tokens.space[2] }}>
          {cards.map((a, i) => (
            <ActionCard key={i} a={a} done={col.done} avatarStyle={avatarStyleFor(a.assignee)} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
}

function ActionCard({ a, done, avatarStyle, onOpen }) {
  const isUrgent = a.priority === "urgent" && !done;
  const due = formatDue(a.due, done);
  return (
    <Card
      onClick={onOpen ? () => onOpen(a) : undefined}
      ariaLabel={`Action ${a.code} — ${a.title}`}
      padding={3}
      style={{
        borderRadius: tokens.radius.lg,
        opacity: done ? 0.72 : 1,
        ...(isUrgent ? { borderLeft: `3px solid ${tokens.color.semantic.danger.fg}` } : null),
      }}
    >
      {/* Ligne haute : code + priorité (ou check si résolu) + source */}
      <div style={{ display: "flex", alignItems: "center", gap: tokens.space[2], marginBottom: tokens.space[2] }}>
        <span style={{ fontSize: 10, fontFamily: "ui-monospace, monospace", color: tokens.color.neutral[300] }}>{a.code}</span>
        {done ? (
          <span style={{ color: tokens.color.semantic.success.fg, display: "inline-flex" }}><Icons.check size={13} /></span>
        ) : (
          <PriorityTag priority={a.priority} />
        )}
        {!done && a.source && (
          <span style={{ marginLeft: "auto", fontSize: 10, padding: "1px 7px", borderRadius: tokens.radius.full, background: tokens.color.neutral[100], color: tokens.color.neutral[500] }}>{a.source}</span>
        )}
      </div>

      {/* Titre */}
      <div style={{
        fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.medium, lineHeight: 1.4,
        color: done ? tokens.color.neutral[700] : tokens.color.neutral[900],
        textDecoration: done ? "line-through" : "none",
        textDecorationColor: done ? tokens.color.neutral[300] : undefined,
        marginBottom: done ? 0 : tokens.space[2],
      }}>
        {a.title}
      </div>

      {/* Pied : assigné + échéance */}
      {!done && (
        <div style={{ display: "flex", alignItems: "center", gap: tokens.space[2] }}>
          {a.assignee && (
            <div title={a.assignee} style={{ width: 24, height: 24, borderRadius: tokens.radius.full, background: avatarStyle.avBg, color: avatarStyle.avFg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: tokens.font.weight.semibold, fontSize: 10, flexShrink: 0 }}>
              {initials(a.assignee)}
            </div>
          )}
          {due && (
            <span style={{ marginLeft: "auto", fontSize: tokens.font.size.xs, fontWeight: due.overdue ? tokens.font.weight.semibold : tokens.font.weight.regular, color: due.overdue ? tokens.color.semantic.danger.fg : tokens.color.neutral[500] }}>
              {due.text}
            </span>
          )}
        </div>
      )}
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
function ActionList({ cols, avatarStyleFor, onOpen }) {
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
              {cols[col.key].map((a, i) => (
                <ActionCard key={i} a={a} done={col.done} avatarStyle={avatarStyleFor(a.assignee)} onOpen={onOpen} />
              ))}
            </div>
          </div>
        )
      ))}
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
