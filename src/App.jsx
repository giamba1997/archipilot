import { useState, useRef, useEffect, useMemo, useCallback, Component } from "react";
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#FAFAF9", fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif" }}>
          <div style={{ textAlign: "center", maxWidth: 400, padding: 32 }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#C4392A" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4 M12 17h.01 M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /></svg>
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1D1D1B", marginBottom: 8 }}>Quelque chose s'est mal passé</h2>
            <p style={{ fontSize: 13, color: "#6B6B66", lineHeight: 1.6, marginBottom: 24 }}>
              Une erreur inattendue est survenue. Vos données sont en sécurité. Rechargez la page pour continuer.
            </p>
            <button onClick={() => window.location.reload()} style={{ padding: "10px 24px", border: "none", borderRadius: 8, background: "#B85C2C", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
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
import { loadProjects as dbLoadProjects, saveProjects as dbSaveProjects, loadProfile as dbLoadProfile, saveProfile as dbSaveProfile, uploadPhoto, deletePhoto, getPhotoUrl, inviteMember, loadProjectMembers, updateMemberRole, removeMember, loadMyInvitations, respondToInvitation, loadSharedProjects, loadNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification, deleteAllNotifications, subscribeToNotifications, sendPvByEmail, loadPvSends, track, parseFunctionError, loadOrgProjects, saveOrgProjects, loadMyOrganizations, loadPendingInvitationForMe, savePermit } from "./db";
import { useInviteToken } from "./hooks/useInviteToken";
import { useWorkspaceContext } from "./hooks/useWorkspaceContext";
import { useIsMobile } from "./hooks/useIsMobile";
import useUIStore from "./stores/useUIStore";

import { AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, BG, WH, RD, GR, SP, FS, LH, RAD, BL, BLB, OR, ORB, VI, VIB, TE, TEB, PU, PUB, GRY, GRYB, REDBG, REDBRD, GRBG, DIS, DIST, BR, BRB } from "./constants/tokens";
import { STATUSES, getStatus, REMARK_STATUSES, nextStatus, getRemarkStatus, PV_STATUSES, getPvStatus, nextPvStatus, LOT_COLORS, calcLotStatus } from "./constants/statuses";
import { RECURRENCES, POST_TEMPLATES, PV_TEMPLATES, REMARK_NUMBERING } from "./constants/templates";
import { STRUCTURE_TYPES, PLANS, PLAN_FEATURES, hasFeature, getLimit, INIT_PROFILE, COLOR_PRESETS, FONT_OPTIONS, DOC_CATEGORIES } from "./constants/config";
import { isEnabled } from "./constants/featureFlags";
import { PROJECT_TEMPLATES, getProjectTemplate } from "./constants/projectTemplates";
import { PARTICIPANT_ROLES } from "./constants/participantRoles";
import { getProjectPhases, getProjectPhase } from "./utils/phases";

import { getOfflineQueue, addToOfflineQueue, clearOfflineQueue, getPvDrafts, savePvDraft, removePvDraft } from "./utils/offline";
import { relativeDate, parseDateFR, formatDateFR, calcNextMeeting, daysUntil } from "./utils/dates";
import { formatAddress, parseAddress } from "./utils/address";
import { parseNotesToRemarks, getDocCurrent } from "./utils/helpers";
import { getActiveVisit } from "./utils/chantierVisit";
import { getActiveTimer, setActiveTimer as persistActiveTimer, elapsedSeconds, isPaused as timerIsPaused, formatTimer, formatDuration, buildSessionFromTimer, totalSecondsFor } from "./utils/timer";
import { generatePDF } from "./utils/pdf";
import { downloadCSV, exportProjectsCSV, exportActionsCSV, exportRemarksCSV, exportParticipantsCSV, importParticipantsCSV, generateICS, downloadICS, getGoogleCalendarUrl } from "./utils/csv";
import { Ico, PB, Modal, Field, StatusBadge, PvStatusBadge, KpiCard, AskAiButton, SyncBadge } from "./components/ui";

// ── Extracted Components ──────────────────────────────────────
import { MobileBottomBar, MobilePvDictateSheet, Sidebar } from "./components/layout";
import { AppRail } from "./components/layout/AppRail";
import { CollabModalWrapper, UpgradeGate, UpgradeRequiredModal, PricingSection, SendPvModal, SearchModal, PhaseManagerModal, PhaseWizardModal, isReadOnly, canEdit, canManageMembers, canManageSettings, getProjectRole } from "./components/modals";
import { hasSeenWizard, PHASE_WIZARDS } from "./constants/phaseWizards";
import { UPGRADE_MESSAGES, getRequiredPlan } from "./constants/upgradeMessages";
import { OnboardingWizard } from "./components/modals/OnboardingWizard";
import { GuidedTour } from "./components/modals/GuidedTour";
import { MeetingCard, MEETING_MODES, PvRow, SmallBtn, Overview, NoteEditor, PlanningDashboard, ResultView, CropTool, GallerySheet, GalleryView, PlanManager, PdfCropBridge, PlanViewer, PlanningView, PDFPreview, MfaSection, ProfileView, LegalPage, CookieBanner, LegalLinks, OprView, JournalView, InvoicesView, PermitsView, QuotesView, MapDashboardView, AlertsDrawer, ProgressReportsView, ChantierModeView, MobileHome, MobileChantiersList, MobileNotifs, TimerBanner, SessionsModal, TimesheetView, StopSessionPrompt, ChatModal, ChatLauncher, ImportProjectWizard, TasksView } from "./views";
import { DashboardHome } from "./views/DashboardHome";
import { CommandPalette } from "./components/CommandPalette";
import { ProjectDetail } from "./pages/ProjectDetail";
import { PvComposer } from "./pages/PvComposer";
import { Account } from "./pages/Account";

// ── Détection v2 ────────────────────────────────────────────
// La nouvelle page projet (`src/pages/ProjectDetail.jsx`) cohabite avec
// l'Overview historique. Activation via pathname `/p/:id` — pas de
// react-router setup à ce stade (cf. brief : intégration minimale).
// Calcul module-scope car le pathname ne change pas sans reload en SPA.
const v2ProjectIdFromUrl = (() => {
  try {
    const m = window.location.pathname.match(/^\/p\/([\w-]+)$/);
    return m ? m[1] : null;
  } catch { return null; }
})();

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


export default function App() {
  // ── Workspace context (extracted hook) ──────────────────────
  const ws = useWorkspaceContext();
  const {
    activeContext, setActiveContext,
    projects, setProjects,
    activeId, setActiveId,
    dbLoaded, setDbLoaded,
    myOrgs, setMyOrgs,
    contextLoading,
    storageWarning,
    switchContext,
    refreshMyOrgs,
    validateOrgContext,
  } = ws;
  const isMobile = useIsMobile();
  const [view, _setView] = useState("overview");
  const setView = (v) => { _setView(v); track("page_viewed", { _page: v }); };
  // ── Routage initial mobile (Étape 3) ──
  // Au premier rendu sur mobile, on bascule sur la home mobile dédiée
  // plutôt que sur l'Overview du dernier projet ouvert. La home agrège
  // les infos urgentes du jour et laisse l'archi choisir son projet.
  // On ne le fait qu'une fois (initialMobileViewRef.current) pour ne
  // pas re-router quand la viewport passe sous 768px en cours d'usage.
  const initialMobileViewRef = useRef(false);
  useEffect(() => {
    if (initialMobileViewRef.current) return;
    if (!dbLoaded) return;
    if (!isMobile) {
      initialMobileViewRef.current = true;
      // Atterrissage desktop : dashboard multi-projets « Mes chantiers »,
      // sauf si un deep-link cible un projet/une vue précise.
      const hasDeepLink = window.location.search.includes("view=") || window.location.search.includes("project=") || /^\/p\//.test(window.location.pathname);
      if (view === "overview" && !hasDeepLink) _setView("home");
      return;
    }
    initialMobileViewRef.current = true;
    _setView("mobileHome");
  }, [dbLoaded, isMobile]);

  // ── Indicateur global "visite en cours" sur le FAB Visite ──
  // Lit getActiveVisit() à chaque changement de view : les démarrages
  // et fins de visite passent toujours par un setView (entrée chantier
  // ou retour overview), donc on capture les transitions sans poll.
  // visitActive = true → MobileBottomBar pulse le FAB Visite sur toutes
  // les pages (review UX P1, remplace une banner dupliquée).
  const [activeVisitState, setActiveVisitState] = useState(() => {
    const v = getActiveVisit();
    return v && !v.endedAt ? v : null;
  });
  useEffect(() => {
    const v = getActiveVisit();
    setActiveVisitState(v && !v.endedAt ? v : null);
  }, [view]);

  // ── Deep-link push (Mobile Étape 4) ──
  // Quand l'archi clique sur une notification push, le SW poste un
  // message `archipilot:deep-link` à toute fenêtre ouverte. On parse
  // l'URL (?project=ID&view=opr) et on route vers la bonne vue. Pour
  // les ouvertures à froid (app fermée → SW openWindow), le query
  // string est lu une seule fois au mount.
  useEffect(() => {
    function applyDeepLink(url) {
      try {
        const u = new URL(url, window.location.origin);
        const pid = u.searchParams.get("project");
        const v = u.searchParams.get("view");
        if (pid) setActiveId(isNaN(+pid) ? pid : +pid);
        if (v) _setView(v);
      } catch { /* malformed URL — ignore */ }
    }
    // 1. Cold start : query string présent
    if (window.location.search.includes("project=") || window.location.search.includes("view=")) {
      applyDeepLink(window.location.href);
    }
    // 2. Warm : SW poste un message
    if (!("serviceWorker" in navigator)) return;
    const onMsg = (e) => {
      if (e.data?.type === "archipilot:deep-link" && e.data.url) {
        applyDeepLink(e.data.url);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Garde : vues 100% bureau interdites sur mobile ──
  // Planning Gantt, Devis (compare PDFs), Facturation (édition + PDF)
  // sont des UIs admin qui n'ont pas leur place sur un écran 6". Si l'archi
  // arrive sur ces views via deep-link ou état persistant, on redirige.
  const MOBILE_FORBIDDEN_VIEWS = ["planning", "invoices", "quotes"];
  useEffect(() => {
    if (isMobile && MOBILE_FORBIDDEN_VIEWS.includes(view)) {
      _setView("overview");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, view]);

  // ── Garde POC : vues différées derrière feature-flag ──
  // Filet de sécurité : si une feature DEFER est atteinte via état persistant,
  // deep-link ou point d'entrée oublié, on rabat sur l'overview. Les points
  // d'entrée (boutons/onglets/CTA) sont par ailleurs masqués individuellement.
  const DEFERRED_VIEWS = {
    invoices: "invoices", opr: "opr", permits: "permits", quotes: "quotes",
    reports: "progressReports", planning: "planning", planningDashboard: "planning",
    timesheet: "timesheets", mapDashboard: "map",
  };
  useEffect(() => {
    const flag = DEFERRED_VIEWS[view];
    if (flag && !isEnabled(flag)) {
      _setView(isMobile ? "mobileHome" : "overview");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);
  // Desktop : nav latérale ouverte par défaut. Mobile : drawer fermé (sinon il
  // couvre l'accueil au 1er chargement).
  const [sidebarOpen, setSidebarOpen] = useState(() => (typeof window !== "undefined" ? window.innerWidth > 768 : true));
  const [mobilePvDictateOpen, setMobilePvDictateOpen] = useState(false);
  const [gallerySheet, setGallerySheet] = useState(false);
  const [projectPicker, setProjectPicker] = useState(false);
  const [phaseMenuOpen, setPhaseMenuOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState("projects"); // "projects" | "dashboard"
  const mobilePhotoRef = useRef(null);
  const galleryInputRef = useRef(null);
  const [modal, setModal] = useState(null);
  const [modalData, setModalData] = useState(null);
  const [upgradeFeature, setUpgradeFeature] = useState(null);
  const [newP, setNewP] = useState({ name: "", client: "", contractor: "", street: "", number: "", postalCode: "", city: "", country: "Belgique", desc: "", startDate: "", endDate: "", nextMeeting: "", recurrence: "none", statusId: "sketch", postTemplate: "general", pvTemplate: "standard", remarkNumbering: "none", projectTemplate: "blank",
    // Brouillon de dossier permis — créé en DB seulement si statusId === "permit"
    // et qu'au moins la commune est renseignée. Permet d'ouvrir un dossier
    // permis directement à la création du projet, sans aller dans PermitsView.
    _permit: { commune: "", reference: "", procedure: "75j", depot_date: "", ar_date: "" },
  });
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
  // Intention « démarrer une visite » : depuis l'accueil mobile, on choisit
  // d'abord un chantier (liste) puis on entre directement en Mode Chantier.
  const [pendingVisit, setPendingVisit] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [pvStartMode, setPvStartMode] = useState(null); // "write" | "dictate" — passed to NoteEditor
  const [pvRecipients, setPvRecipients] = useState([]); // [] = tous
  const [pvTitle, setPvTitle] = useState("");
  const [pvFieldData, setPvFieldData] = useState({}); // attendance, visitStart, visitEnd
  const [showSearch, setShowSearch] = useState(false);
  const [importPV, setImportPV] = useState({ number: "", date: "", author: "", pdfDataUrl: null, fileName: "" });
  const [legalPage, setLegalPage] = useState(null); // "privacy" | "terms" | null
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showGuidedTour, setShowGuidedTour] = useState(false);
  const [toast, setToast] = useState(null);
  // Wizard d'onboarding contextuel — déclenché au passage à une phase
  // non encore vue par l'utilisateur. `null` = pas de wizard ouvert,
  // sinon contient l'id de la phase à afficher.
  const [phaseWizard, setPhaseWizard] = useState(null);
  const { inviteToken, setInviteToken, clearPendingInvite } = useInviteToken();

  // ── Time tracking ──────────────────────────────────────────
  // The active timer lives in localStorage so it survives reloads and stays
  // visible across views via the global TimerBanner. `tick` increments every
  // second when the timer is running, just to force re-renders for the
  // live display — the source of truth is always derived from segments.
  const [activeTimer, setActiveTimerState] = useState(() => getActiveTimer());
  const [tick, setTick] = useState(0);
  const [showSessionsModal, setShowSessionsModal] = useState(null); // projectId or null
  const [stopPromptTimer, setStopPromptTimer] = useState(null); // snapshot of timer awaiting description
  const chatOpen = useUIStore(s => s.chatOpen);
  const chatPrefill = useUIStore(s => s.chatPrefill);
  const askAi = useUIStore(s => s.askAi);
  const closeChat = useUIStore(s => s.closeChat);
  const toggleChat = useUIStore(s => s.toggleChat);
  const clearChatPrefill = useUIStore(s => s.clearChatPrefill);
  const [importWizardOpen, setImportWizardOpen] = useState(false);
  const [phaseManagerProjectId, setPhaseManagerProjectId] = useState(null); // ouvre la modal de gestion phases pour ce projet
  // Pré-sélection d'un fichier à ouvrir en plein écran depuis l'onglet
  // Documents (annotation ou rogner). Consommé par PlanManager standalone.
  const [planAutoAction, setPlanAutoAction] = useState(null); // { itemId, mode: "annotate"|"crop" } | null
  // Pré-sélection d'une photo à annoter en plein écran depuis l'onglet Photos.
  const [galleryAutoAction, setGalleryAutoAction] = useState(null); // { photoId } | null

  const updateActiveTimer = useCallback((next) => {
    setActiveTimerState(next);
    persistActiveTimer(next);
  }, []);

  // Tick once a second only when the timer is actively running (not paused).
  useEffect(() => {
    if (!activeTimer || timerIsPaused(activeTimer)) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [activeTimer]);

  const startTimer = useCallback((proj) => {
    if (!proj) return;
    // If a timer is already running on a different project, stop it first
    // and append its session before switching.
    if (activeTimer && activeTimer.projectId !== proj.id) {
      const prev = buildSessionFromTimer(activeTimer);
      if (prev) {
        setProjects(ps => ps.map(p => p.id === activeTimer.projectId
          ? { ...p, timeSessions: [...(p.timeSessions || []), prev] }
          : p));
      }
    }
    updateActiveTimer({
      projectId: proj.id,
      projectName: proj.name,
      contextKey: activeContext,
      userId: profile?.id || null,
      userName: profile?.name || null,
      segments: [{ startedAt: new Date().toISOString(), endedAt: null }],
    });
  }, [activeTimer, activeContext, profile, updateActiveTimer]);

  const pauseResumeTimer = useCallback(() => {
    if (!activeTimer) return;
    const segs = [...activeTimer.segments];
    const last = segs[segs.length - 1];
    if (last.endedAt === null) {
      // Pause: close the current segment.
      segs[segs.length - 1] = { ...last, endedAt: new Date().toISOString() };
    } else {
      // Resume: open a new segment.
      segs.push({ startedAt: new Date().toISOString(), endedAt: null });
    }
    updateActiveTimer({ ...activeTimer, segments: segs });
  }, [activeTimer, updateActiveTimer]);

  // Request stop — pauses the timer (closes the running segment) and opens
  // the description prompt. The session is only persisted once the user
  // confirms with a description (ce qui force à documenter le temps).
  const requestStopTimer = useCallback(() => {
    if (!activeTimer) return;
    let snapshot = activeTimer;
    if (!timerIsPaused(activeTimer)) {
      // Pause first: close the running segment so the duration is frozen
      const segs = [...activeTimer.segments];
      const last = segs[segs.length - 1];
      segs[segs.length - 1] = { ...last, endedAt: new Date().toISOString() };
      snapshot = { ...activeTimer, segments: segs };
      updateActiveTimer(snapshot);
    }
    setStopPromptTimer(snapshot);
  }, [activeTimer, updateActiveTimer]);

  const confirmStopWithNote = useCallback((note, taskId = "") => {
    if (!stopPromptTimer) return;
    const session = buildSessionFromTimer(stopPromptTimer, note, { id: profile?.id, name: profile?.name }, taskId);
    if (session) {
      const targetId = stopPromptTimer.projectId;
      setProjects(ps => ps.map(p => p.id === targetId
        ? { ...p, timeSessions: [...(p.timeSessions || []), session] }
        : p));
    }
    setStopPromptTimer(null);
    updateActiveTimer(null);
  }, [stopPromptTimer, profile, updateActiveTimer]);

  const cancelStopPrompt = useCallback(() => {
    // Le timer est resté en pause (segment fermé). L'utilisateur peut
    // reprendre via le bouton Pause/Resume de la card si besoin.
    setStopPromptTimer(null);
  }, []);

  // Supprime le suivi en cours sans sauvegarder de session — utilisé quand
  // l'utilisateur s'est trompé de projet, ou pour abandonner un essai. Demande
  // confirmation pour éviter les pertes accidentelles. Vide aussi un éventuel
  // stopPromptTimer (cas où l'utilisateur a déjà cliqué Arrêter).
  const discardActiveTimer = useCallback(() => {
    if (!activeTimer && !stopPromptTimer) return;
    if (!window.confirm("Supprimer le suivi en cours ? Le temps déjà compté ne sera pas sauvegardé.")) return;
    setStopPromptTimer(null);
    updateActiveTimer(null);
  }, [activeTimer, stopPromptTimer, updateActiveTimer]);

  const addManualSession = useCallback((projectId, session) => {
    setProjects(ps => ps.map(p => p.id === projectId
      ? { ...p, timeSessions: [...(p.timeSessions || []), session] }
      : p));
  }, []);

  const editSession = useCallback((projectId, sessionId, patch) => {
    setProjects(ps => ps.map(p => p.id === projectId
      ? { ...p, timeSessions: (p.timeSessions || []).map(s => s.id === sessionId ? { ...s, ...patch } : s) }
      : p));
  }, []);

  const deleteSession = useCallback((projectId, sessionId) => {
    setProjects(ps => ps.map(p => p.id === projectId
      ? { ...p, timeSessions: (p.timeSessions || []).filter(s => s.id !== sessionId) }
      : p));
  }, []);
  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };
  const importPVRef = useRef(null);
  const t = useT();

  // Expose legal page navigation for CookieBanner
  useEffect(() => { window.__showLegal = setLegalPage; return () => { delete window.__showLegal; }; }, []);

  // ── Collaboration state ──
  const [sharedProjects, setSharedProjects] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [invitations, setInvitations] = useState([]);

  // Load data from Supabase on mount. The data source depends on the active
  // context: "personal" reads user_data, "org:<id>" reads organization_data.
  useEffect(() => {
    (async () => {
      try {
        // Detect a user change on this browser (e.g. someone signed in with
        // a different account). Wipe the cached projects/active-context so
        // we don't show the previous account's data while the cloud loads.
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const lastUserId = localStorage.getItem("archipilot_last_user_id");
            if (lastUserId && lastUserId !== user.id) {
              Object.keys(localStorage).forEach(k => {
                if (k.startsWith("archipilot_projects:")
                  || k.startsWith("archipilot_activeId:")
                  || k === "archipilot_active_context"
                  || k === "archipilot_profile") {
                  localStorage.removeItem(k);
                }
              });
              setProjects([]); setActiveId(1); setActiveContext("personal");
            }
            localStorage.setItem("archipilot_last_user_id", user.id);
          }
        } catch { /* ignore */ }

        const projectsLoader = activeContext === "personal"
          ? dbLoadProjects().catch(e => { console.error("loadProjects failed:", e); return null; })
          : loadOrgProjects(activeContext.slice(4)).catch(e => { console.error("loadOrgProjects failed:", e); return null; });

        const [cloudData, cloudProfile, orgsList] = await Promise.all([
          projectsLoader,
          dbLoadProfile().catch(e => { console.error("loadProfile failed:", e); return null; }),
          loadMyOrganizations().catch(() => []),
        ]);

        // Always overwrite from cloud when it loaded, even if empty —
        // otherwise the stale localStorage cache wins for any new account.
        if (cloudData) {
          setProjects(cloudData.projects || []);
          setActiveId(cloudData.activeId || 1);
        }
        if (cloudProfile) setProfile(cloudProfile);
        if (orgsList) setMyOrgs(orgsList);

        // If the persisted org context no longer corresponds to a current
        // membership (kicked out, org deleted), fall back to personal.
        validateOrgContext(orgsList);

        // Show onboarding when the profile hasn't been marked complete yet.
        // The flag now lives on profiles.onboarding_completed_at so it can't
        // bleed across accounts on the same browser.
        if (!cloudProfile?.onboardingCompletedAt) {
          setShowOnboarding(true);
        }

        // Server-side fallback for invite tokens lost in transit (cross-
        // device signup, cleared cache, email confirmation redirect). If we
        // don't already have a token from URL/localStorage, look for any
        // pending invitation addressed to the user's email and surface it.
        if (!inviteToken) {
          try {
            const pendingInv = await loadPendingInvitationForMe();
            if (pendingInv?.token) setInviteToken(pendingInv.token);
          } catch (e) { console.error("Pending invitation lookup failed:", e); }
        }
      } catch (e) { console.error("Initial load error:", e); }
      setDbLoaded(true);
      track("login", { _page: "app" });
      // Load collaboration data (non-blocking)
      loadSharedProjects().then(setSharedProjects).catch(() => {});
      loadNotifications().then(setNotifications).catch(() => {});
      loadMyInvitations().then(setInvitations).catch(() => {});
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wrap switchContext from the hook so it also resets the route.
  const switchWorkspace = useCallback(async (newContext) => {
    await switchContext(newContext);
    setView("overview");
  }, [switchContext]);

  // Subscribe to realtime notifications
  useEffect(() => {
    let unsub;
    try {
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) return;
        unsub = subscribeToNotifications(user.id, (notif) => {
          setNotifications(prev => [notif, ...prev]);
          if (notif.type === "invite") loadMyInvitations().then(setInvitations).catch(() => {});
          // Toast immédiat pour les notifs OPR — l'archi sait tout de suite quand une signature arrive
          if (notif.type === "opr_signed") {
            showToast(`✦ ${notif.actor_name || "Un signataire"} a signé l'OPR n°${notif.data?.opr_number}`);
          } else if (notif.type === "opr_declined") {
            showToast(`${notif.actor_name || "Un signataire"} a refusé l'OPR n°${notif.data?.opr_number}`, "error");
          } else if (notif.type === "opr_completed") {
            showToast(`✓ OPR n°${notif.data?.opr_number} entièrement signé — prêt à diffuser`);
          }
        });
      }).catch(() => {});
    } catch (e) { console.error("Notification subscription error:", e); }
    return () => { try { unsub?.(); } catch { /* ignore */ } };
  }, []);

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
        if (activeContext === "personal") dbSaveProjects(projects, activeId);
        else saveOrgProjects(activeContext.slice(4), projects, activeId);
      }
    };

    const goOnline = () => {
      setIsOnline(true);
      setShowReconnected(true);
      setTimeout(() => setShowReconnected(false), 3000);
      // Sync queued items
      processOfflineQueue();
      // Re-sync projects to Supabase
      if (dbLoaded) {
        if (activeContext === "personal") dbSaveProjects(projects, activeId);
        else saveOrgProjects(activeContext.slice(4), projects, activeId);
      }
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
    try { localStorage.setItem("archipilot_profile", JSON.stringify(data)); } catch { /* ignore */ }
    dbSaveProfile(data);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2000);
  };

  const project = projects.find((p) => p.id === activeId) || sharedProjects.find((p) => p.id === activeId);
  // Déclenche le wizard d'onboarding pour une phase si :
  //   - du contenu existe pour cette phase dans PHASE_WIZARDS
  //   - l'utilisateur ne l'a pas déjà vu (localStorage)
  // Sinon, no-op silencieux — pas d'alerte ni log.
  const maybeShowPhaseWizard = (phaseId) => {
    if (!phaseId || !PHASE_WIZARDS[phaseId]) return;
    if (hasSeenWizard(phaseId)) return;
    setPhaseWizard(phaseId);
  };

  const updateProject = (id, u) => {
    // Détection de changement de phase pour déclencher le wizard
    // d'onboarding contextuel (si la phase n'a pas encore été vue).
    if (u && Object.prototype.hasOwnProperty.call(u, "statusId")) {
      const prev = projects.find(p => p.id === id);
      if (prev && prev.statusId !== u.statusId) {
        maybeShowPhaseWizard(u.statusId);
      }
    }
    setProjects((prev) => prev.map((p) => p.id === id ? { ...p, ...u } : p));
  };
  // Création projet allégée : on n'exige que Nom + Ville. Les autres champs
  // (MO, entreprise, dates) sont souvent inconnus en phase Esquisse — ils
  // se complètent plus tard via les chips de la Fiche. Empêcher la création
  // à cause d'eux pollue tous les projets précoces avec des "À définir".
  const canCreate = newP.name.trim() && newP.city?.trim();

  // Gate the "Nouveau projet" entry: open upgrade modal if plan limit reached.
  const tryOpenNewProject = () => {
    const limit = getLimit(profile.plan, "maxProjects");
    if (projects.length >= limit) { setUpgradeFeature("maxProjects"); return; }
    setModal("new");
  };

  // Count PVs created in the current calendar month across all owned projects.
  // PV dates are stored as fr-BE (dd/mm/yyyy) strings in pvHistory[].date.
  const countPvThisMonth = () => {
    const now = new Date();
    const m = now.getMonth(), y = now.getFullYear();
    let count = 0;
    for (const p of projects) {
      for (const pv of (p.pvHistory || [])) {
        if (!pv.date) continue;
        const parts = String(pv.date).split("/");
        if (parts.length !== 3) continue;
        const pvDate = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
        if (pvDate.getMonth() === m && pvDate.getFullYear() === y) count++;
      }
    }
    return count;
  };

  // Gate starting a new PV: open upgrade modal if monthly limit reached.
  const tryStartNewPv = () => {
    const limit = getLimit(profile.plan, "maxPvPerMonth");
    if (countPvThisMonth() >= limit) { setUpgradeFeature("maxPvPerMonth"); return; }
    setPvStartMode(null); setView("notes");
  };

  // Ouvre la modal d'édition des informations projet pré-remplie. Factorisé
  // ici car appelé depuis Overview (carte header) ET depuis la topbar projet
  // (bouton "Planifier une réunion"). Évite la duplication du setup editInfo.
  const openEditInfo = () => {
    if (!project) return;
    const addr = project.street
      ? { street: project.street, number: project.number || "", postalCode: project.postalCode || "", city: project.city || "", country: project.country || "Belgique" }
      : parseAddress(project.address);
    setEditInfo({
      name: project.name, client: project.client, contractor: project.contractor,
      ...addr,
      statusId: project.statusId, startDate: project.startDate, endDate: project.endDate,
      progress: project.progress, nextMeeting: project.nextMeeting,
      recurrence: project.recurrence || "none",
      pvTemplate: project.pvTemplate || "standard",
      remarkNumbering: project.remarkNumbering || "none",
      customFields: project.customFields || [],
    });
    setModal("info");
  };

  const createProject = () => {
    const id = Math.max(...projects.map((p) => p.id), 0) + 1;
    const address = formatAddress(newP);
    const tpl = POST_TEMPLATES.find(t => t.id === newP.postTemplate) || POST_TEMPLATES[0];
    const posts = tpl.posts.map(p => ({ id: p.id, label: p.label, notes: "", remarks: [] }));

    // Modèle de projet — bundle métier qui complète le projet créé. "blank"
    // ne fournit aucun extra → comportement identique à avant cette feature.
    const projTpl = getProjectTemplate(newP.projectTemplate);

    // Participants : l'archi (toujours), puis les rôles types du modèle
    // (nom vide — l'utilisateur les complétera dans la modal participants).
    const participants = [
      { role: "Architecte", name: profile.name, email: profile.email, phone: profile.phone },
      ...(projTpl.participantsRoles || [])
        .filter(r => r.role !== "Architecte") // évite le doublon
        .map(r => ({ role: r.role, name: "", email: "", phone: "" })),
    ];

    // Lots planning : ajoutés sans dates (l'utilisateur les place sur la timeline)
    const lots = (projTpl.defaultLots || []).map((l, i) => ({
      id: Date.now() + i,
      name: l.name,
      contractor: "",
      startDate: "",
      endDate: "",
      duration: l.duration || "",
      progress: l.progress ?? 0,
      color: l.color || "amber",
      steps: [],
      postId: "",
    }));

    // Module checklists supprimé du produit (les modèles n'instancient plus de
     // checklists). Les "tâches à faire" passent par project.tasks[].
    const customFields = (projTpl.customFields || []).map((f, i) => ({
      id: f.id || Date.now() + i,
      label: f.label,
      value: f.value || "",
    }));

    // On extrait _permit pour ne PAS le sérialiser dans le JSONB du projet
    // (c'est un brouillon de saisie, pas une donnée du projet). On le persiste
    // en parallèle comme dossier dans la table permits si statusId === "permit"
    // et commune renseignée.
    const { _permit: permitDraft, ...projectFields } = newP;

    setProjects((prev) => [...prev, {
      id, ...projectFields, address,
      progress: 0, bureau: profile.structure,
      // endDate et nextMeeting peuvent venir du formulaire phase-aware
      endDate: projectFields.endDate || "",
      nextMeeting: projectFields.nextMeeting || "",
      archived: false,
      participants,
      posts: posts.length > 0 ? posts : [{ id: "01", label: "Situation du chantier", notes: "" }],
      pvHistory: [], actions: [],
      planImage: null, planMarkers: [], planStrokes: [],
      documents: [],
      lots,
      customFields,
      reserves: [], oprHistory: [],
      tasks: [],
      cahierDesCharges: null,
      // Mémorise le modèle utilisé pour de futures features (ex : OPR
      // peut suggérer les expectedReserves du modèle, axe D du plan).
      _projectTemplateId: newP.projectTemplate,
    }]);

    // Side-effect : si phase Permis et commune renseignée, on crée le dossier
    // de suivi en DB. Async non-bloquant (fire-and-forget) — si la migration
    // 012 n'est pas appliquée, savePermit retourne null et on continue.
    if (newP.statusId === "permit" && permitDraft.commune?.trim()) {
      savePermit({
        project_id: id,
        project_name: newP.name,
        permit_type: "urbanisme",
        procedure: permitDraft.procedure || "75j",
        reference: permitDraft.reference || null,
        commune: permitDraft.commune,
        depot_date: permitDraft.depot_date || null,
        ar_date: permitDraft.ar_date || null,
        status: permitDraft.depot_date ? (permitDraft.ar_date ? "in_review" : "deposited") : "preparation",
      }).then(saved => {
        if (saved) {
          showToast(`Projet "${newP.name}" créé · Dossier permis ouvert`);
        }
      }).catch(() => { /* table peut ne pas exister, silencieux */ });
    } else {
      showToast(`Projet "${newP.name}" créé`);
    }

    setActiveId(id); setView("overview"); setModal(null);
    // Wizard d'onboarding contextuel — si l'archi crée directement en
    // phase ≠ esquisse (par défaut), on lui présente les nouvelles
    // options. L'esquisse n'a pas de wizard (c'est le point de départ).
    if (newP.statusId && newP.statusId !== "sketch") {
      maybeShowPhaseWizard(newP.statusId);
    }
    setNewP({ name: "", client: "", contractor: "", street: "", number: "", postalCode: "", city: "", country: "Belgique", desc: "", startDate: "", endDate: "", nextMeeting: "", recurrence: "none", statusId: "sketch", postTemplate: profile.postTemplate || "general", pvTemplate: profile.pvTemplate || "standard", remarkNumbering: profile.remarkNumbering || "none", projectTemplate: "blank", _permit: { commune: "", reference: "", procedure: "75j", depot_date: "", ar_date: "" } });
    track("project_created", { project_name: newP.name, _page: "overview", _template: projTpl.id });
  };

  // Import depuis un dossier — appelé par ImportProjectWizard avec les
  // fichiers déjà classés et lus (cahierDesCharges, pvHistory, documents).
  const importProjectFromFolder = ({ meta, cahierDesCharges, pvHistory, planFiles, gallery }) => {
    const id = Math.max(...projects.map((p) => p.id), 0) + 1;
    const tpl = POST_TEMPLATES.find(t => t.id === (profile.postTemplate || "general")) || POST_TEMPLATES[0];
    const posts = tpl.posts.map(p => ({ id: p.id, label: p.label, notes: "", remarks: [] }));
    setProjects((prev) => [...prev, {
      id,
      name: meta.name,
      client: meta.client || "",
      contractor: meta.contractor || "",
      city: meta.city || "",
      address: meta.city || "",
      startDate: meta.startDate || "",
      endDate: "",
      progress: 0,
      bureau: profile.structure,
      statusId: "construction",
      recurrence: "none",
      archived: false,
      nextMeeting: "",
      participants: [{ role: "Architecte", name: profile.name, email: profile.email, phone: profile.phone }],
      posts: posts.length > 0 ? posts : [{ id: "01", label: "Situation du chantier", notes: "" }],
      pvHistory: pvHistory || [],
      actions: [],
      planImage: null, planMarkers: [], planStrokes: [],
      // Documents importés directement au format planFiles[] (consommé par
      // l'onglet Documents = PlanManager). gallery[] pour les photos.
      planFiles: planFiles || [],
      gallery: gallery || [],
      lots: [], customFields: [],
      reserves: [], oprHistory: [],
      cahierDesCharges: cahierDesCharges || null,
      pvTemplate: profile.pvTemplate || "standard",
      remarkNumbering: profile.remarkNumbering || "none",
      postTemplate: profile.postTemplate || "general",
    }]);
    setActiveId(id);
    setView("overview");
    setImportWizardOpen(false);
    track("project_imported", {
      project_name: meta.name,
      pv_count: (pvHistory || []).length,
      planfile_count: (planFiles || []).length,
      photo_count: (gallery || []).length,
      has_cdc: !!cahierDesCharges,
    });
  };

  const duplicateProject = () => {
    const id = Math.max(...projects.map((p) => p.id), 0) + 1;
    setProjects((prev) => [...prev, { ...project, id, name: project.name + " (copie)", pvHistory: [], actions: [], posts: project.posts.map((po) => ({ ...po, notes: "", photos: [] })), archived: false, planImage: null, planMarkers: [], planStrokes: [], documents: [], lots: [], cahierDesCharges: null }]);
    setActiveId(id);
    showToast("Projet dupliqué avec succès");
  };

  const VIEW_LABELS = { overview: "", notes: t("view.notes"), result: t("view.result"), plan: "Documents", planning: t("view.planning"), tasks: "Tâches", profile: t("view.profile"), stats: "Vue d'ensemble", planningDashboard: "Vue d'ensemble", timesheet: "Vue d'ensemble", gallery: "Photos" };

  // ── Global keyboard shortcuts ──
  useEffect(() => {
    const onKey = (e) => {
      // Don't trigger in inputs/textareas/contenteditable
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.contentEditable === "true") return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === "k") { e.preventDefault(); setShowSearch(true); }
      if (ctrl && e.key === "n") { e.preventDefault(); tryOpenNewProject(); }
      if (ctrl && e.key === "b") { e.preventDefault(); setSidebarOpen(v => !v); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Loading screen only if no cached data (first use)
  if (!dbLoaded && projects.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: BG, fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <img src="/icon-512.png" alt="ArchiPilot" style={{ width: 42, height: 42, margin: "0 auto 12px" }} />
          <div style={{ fontSize: 15, fontWeight: 800, color: "#1C1917", marginBottom: 8, fontFamily: "'Manrope', 'Inter', sans-serif", textTransform: "uppercase", letterSpacing: "0.5px" }}>ArchiPilot</div>
          <div style={{ width: 20, height: 20, border: `2.5px solid ${SBB}`, borderTopColor: AC, borderRadius: "50%", animation: "sp 0.6s linear infinite", margin: "0 auto" }} />
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
    <LangContext.Provider value={profile.lang || "fr"}>
    <div style={{ fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif", display: "flex", minHeight: "100vh", background: BG }}>
      {/* Skip to content link (accessibility — clavier desktop uniquement).
          Caché sur mobile via la classe `ap-skip-link` : pas de navigation
          clavier sur touch, et un tap accidentel laissait l'inline style
          top:0 persister (l'onBlur ne fire pas systématiquement sur
          mobile), créant une bande orange visible en haut. */}
      <a href="#main-content" className="ap-skip-link" style={{
        position: "absolute", top: -40, left: 0, padding: "8px 16px",
        background: AC, color: "#fff", fontSize: 14, fontWeight: 600,
        zIndex: 100000, textDecoration: "none", borderRadius: "0 0 8px 0",
        transition: "top 0.2s",
      }} onFocus={(e) => { e.target.style.top = "0"; }} onBlur={(e) => { e.target.style.top = "-40px"; }}>
        Aller au contenu principal
      </a>
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
        .method-card-dictate:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(184,92,44,0.18); }
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
          /* Skip link inutile sans clavier — masque sur mobile */
          .ap-skip-link { display: none !important; }

          /* NoteEditor — stepper is now universal, hide old mobile-only stepper */
          .ap-note-mobile-stepper { display: none !important; }

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
          /* Sections visibility is now controlled by JS inline styles */
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
        @keyframes pulseDot { 0%, 100% { box-shadow: 0 0 0 0 rgba(184,92,44,0.55); } 50% { box-shadow: 0 0 0 5px rgba(184,92,44,0); } }
        @keyframes chatPopIn { from { opacity: 0; transform: translateY(10px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes chatTyping { 0%, 60%, 100% { opacity: 0.3; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-3px); } }
      `}</style>
      {/* Desktop : rail fin « Direction D ». Mobile : ancienne sidebar en drawer (hamburger). */}
      {!isMobile ? (
        <AppRail projects={projects} activeId={activeId} view={view} project={project} onSelectProject={(id) => { setActiveId(id); setView("overview"); }} onNewProject={tryOpenNewProject} onHome={() => setView("home")} onOverview={() => { if (!hasFeature(profile.plan, "planningCross")) return setUpgradeFeature("planningCross"); setView("planningDashboard"); }} onProfile={() => setView("profile")} profile={profile} />
      ) : (
        <Sidebar projects={projects} activeId={activeId} view={view} onSelect={(id) => { setActiveId(id); setView("overview"); }} open={sidebarOpen} onClose={() => setSidebarOpen(false)} profile={profile} onNewProject={tryOpenNewProject} onImportProject={() => setImportWizardOpen(true)} onProfile={() => { setView("profile"); }} installable={!!installPrompt} onInstall={handleInstall} sharedProjects={sharedProjects} onSelectShared={(p) => { setActiveId(p.id); setView("overview"); }} onStats={() => { if (!hasFeature(profile.plan, "planningCross")) return setUpgradeFeature("planningCross"); setView("planningDashboard"); }} onPlanning={() => { if (!hasFeature(profile.plan, "planningCross")) return setUpgradeFeature("planningCross"); setView("planningDashboard"); }} />
      )}

      {/* Sidebar overlay for tablet/mobile */}
      {sidebarOpen && <div className="ap-sidebar-overlay open" onClick={() => setSidebarOpen(false)} />}

      <main id="main-content" className="ap-main" role="main" style={{ marginLeft: isMobile ? 0 : 62, flex: 1, transition: "margin-left 0.25s", minWidth: 0 }}>
        {/* Banner timer — n'apparaît que quand on N'EST PAS sur le projet en cours
            de suivi (le TimerPill du header projet suffit alors). Très thin (24px). */}
        {activeTimer && (activeTimer.projectId !== activeId || view === "stats" || view === "planningDashboard" || view === "timesheet" || view === "profile") && (
          <div style={{ position: "sticky", top: 0, zIndex: 60 }}>
            <TimerBanner
              activeTimer={activeTimer}
              onPauseResume={pauseResumeTimer}
              onStop={requestStopTimer} onDiscard={discardActiveTimer}
              onJumpToProject={() => { setActiveId(activeTimer.projectId); setView("overview"); }}
            />
          </div>
        )}
        <div className="ap-header" style={{ padding: "10px 20px", background: WH, borderBottom: `1px solid ${SBB}`, display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 50 }}>
          {/* Gauche — hamburger + retour + contexte projet */}
          <div style={{ display: "flex", alignItems: "center", gap: SP.sm, flex: "0 0 auto", minWidth: 0 }}>
            {isMobile && (
              <button className="ap-hamburger" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label={sidebarOpen ? "Fermer le menu" : "Ouvrir le menu"} style={{ background: "none", border: "none", cursor: "pointer", padding: SP.sm, minWidth: 40, minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: RAD.md }}>
                <Ico name={sidebarOpen ? "x" : "menu"} color={TX2} />
              </button>
            )}
            {/* Bouton retour — visible dans les vues profondes */}
            {view !== "overview" && view !== "stats" && view !== "planningDashboard" && view !== "profile" && view !== "home" && (
              <button onClick={() => setView("overview")} aria-label="Retour à l'aperçu" className="sb-nav ap-back-btn" style={{ background: "none", border: "none", cursor: "pointer", padding: SP.xs, minWidth: 32, minHeight: 32, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: RAD.sm }}>
                <Ico name="back" size={16} color={TX2} />
              </button>
            )}
            <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 7, fontSize: 14 }}>
              {view === "home" ? (
                <span style={{ fontWeight: 600, color: TX }}>Mes chantiers</span>
              ) : view === "profile" ? (
                <span style={{ fontWeight: 600, color: TX }}>Mon profil</span>
              ) : (view === "stats" || view === "planningDashboard" || view === "timesheet") ? (
                <span style={{ fontWeight: 600, color: TX }}>Vue d'ensemble</span>
              ) : !project ? (
                <span style={{ fontWeight: 600, color: TX }}>Projets</span>
              ) : (
                <>
                  <button onClick={() => setView("overview")} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, color: TX3, padding: 0 }}>Projets</button>
                  <span style={{ color: SBB }}>/</span>
                  <span style={{ fontWeight: 600, color: TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 380 }}>{project.name}</span>
                  {VIEW_LABELS[view] && (<><span style={{ color: SBB }}>/</span><span style={{ color: TX2, whiteSpace: "nowrap" }}>{VIEW_LABELS[view]}</span></>)}
                </>
              )}
              {false && (() => {
                // Project header v2 — Variant A: 2-line compact
                if (!project) return null;
                const st = getProjectPhase(project, project.statusId);
                const projectPhases = getProjectPhases(project);
                const meetingDays = daysUntil(project.nextMeeting);
                const meetingState = meetingDays === null ? null
                  : meetingDays === 0 ? "today"
                  : meetingDays > 0 ? "upcoming"
                  : "past";
                const meetingLabel = meetingState === "today" ? "Aujourd'hui"
                  : meetingState === "upcoming" ? `Dans ${meetingDays}j`
                  : meetingState === "past" ? `Passée ${Math.abs(meetingDays)}j`
                  : null;
                const urgentCount = (project.actions || []).filter(a => a.open && a.urgent).length;
                const hasContext = !!(project.client || project.contractor || project.city || project.address || project.startDate);
                const subView = VIEW_LABELS[view];
                return (
                  <>
                    {/* Mobile : project switcher pill (inchangé) */}
                    <button className="ap-project-switcher" onClick={() => { setPickerTab("projects"); setProjectPicker(v => !v); }} style={{ display: "none", background: projectPicker ? SB2 : SB, border: "none", cursor: "pointer", padding: `${SP.sm}px ${SP.md}px`, fontFamily: "inherit", textAlign: "left", minWidth: 0, width: "100%", borderRadius: RAD.lg, transition: "background 0.15s" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: SP.sm }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span role="heading" aria-level="1" style={{ fontSize: 16, fontWeight: 700, color: TX, lineHeight: LH.tight, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{project.name}</span>
                        </div>
                        <div style={{ width: 24, height: 24, borderRadius: "50%", background: projectPicker ? ACL : SB2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.2s" }}>
                          <Ico name="chevron-down" size={12} color={projectPicker ? AC : TX3} />
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: SP.xs, marginTop: 3, flexWrap: "wrap" }}>
                        <span style={{ fontSize: FS.xs, fontWeight: 600, color: st.color, background: st.bg, padding: "1px 6px", borderRadius: 4 }}>{st.label}</span>
                        <span style={{ fontSize: FS.xs, color: TX3 }}>{project.client}</span>
                        {subView ? <><span style={{ fontSize: FS.xs, color: TX3 }}>·</span><span style={{ fontSize: FS.xs, color: AC, fontWeight: 600 }}>{subView}</span></> : null}
                      </div>
                    </button>

                    {/* Desktop : 2-line compact header */}
                    <div className="ap-project-name-desktop" style={{ minWidth: 0, flex: 1 }}>
                      {/* Line 1 — name + phase + meeting + urgent */}
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <h1 role="heading" aria-level="1" className="ap-project-name" style={{ fontSize: 18, fontWeight: 700, color: TX, margin: 0, letterSpacing: "-0.2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 280, lineHeight: 1.2 }}>{project.name}</h1>
                        {/* Phase pill — clickable dropdown (déduplique le ProjectStatusSelector d'Overview) */}
                        <div style={{ position: "relative" }}>
                          <button onClick={() => setPhaseMenuOpen(o => !o)} aria-label={`Phase : ${st.label}`} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, color: st.color, background: st.bg, padding: "4px 9px 4px 8px", borderRadius: 14, border: "none", cursor: "pointer", fontFamily: "inherit", minHeight: 26 }}>
                            <span style={{ width: 5, height: 5, borderRadius: "50%", background: st.color }} />
                            {st.label}
                            <Ico name="chevron-down" size={9} color={st.color} />
                          </button>
                          {phaseMenuOpen && (
                            <>
                              <div onClick={() => setPhaseMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 99 }} />
                              <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, background: WH, border: `1px solid ${SBB}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 100, minWidth: 220, padding: 4, animation: "fadeIn 0.15s ease" }}>
                                {projectPhases.map(s => (
                                  <button key={s.id} onClick={() => { updateProject(project.id, { statusId: s.id }); setPhaseMenuOpen(false); }}
                                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: "none", borderRadius: 7, background: s.id === project.statusId ? s.bg : "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "background 0.1s" }}
                                    onMouseEnter={e => { if (s.id !== project.statusId) e.currentTarget.style.background = SB; }}
                                    onMouseLeave={e => { if (s.id !== project.statusId) e.currentTarget.style.background = "transparent"; }}>
                                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                                    <span style={{ fontSize: 12, fontWeight: s.id === project.statusId ? 700 : 500, color: s.id === project.statusId ? s.color : TX, flex: 1 }}>{s.label}</span>
                                    {s.id === project.statusId && <Ico name="check" size={11} color={s.color} />}
                                  </button>
                                ))}
                                {/* Bouton "Personnaliser" — accès à la gestion des phases custom du projet. */}
                                <button onClick={() => { setPhaseMenuOpen(false); setPhaseManagerProjectId(project.id); }}
                                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: "none", borderRadius: 7, background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left", borderTop: `1px solid ${SBB}`, marginTop: 4 }}
                                  onMouseEnter={e => e.currentTarget.style.background = SB}
                                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                                  <Ico name="edit" size={11} color={AC} />
                                  <span style={{ fontSize: 11, fontWeight: 600, color: AC, flex: 1 }}>Personnaliser les phases…</span>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                        {/* Meeting pill — only if a meeting exists */}
                        {meetingLabel && (
                          <button onClick={() => { setActiveId(project.id); setView("overview"); }} aria-label={`Réunion ${meetingLabel}`}
                            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600,
                              color: meetingState === "past" ? BR : meetingState === "today" ? AC : TX2,
                              background: meetingState === "past" ? BRB : meetingState === "today" ? ACL : SB,
                              border: `1px solid ${meetingState === "past" ? REDBRD : meetingState === "today" ? ACL2 : SBB}`,
                              padding: "3px 9px 3px 7px", borderRadius: 14, cursor: "pointer", fontFamily: "inherit", minHeight: 26 }}>
                            <Ico name="calendar" size={10} color={meetingState === "past" ? BR : meetingState === "today" ? AC : TX2} />
                            {meetingLabel}
                          </button>
                        )}
                        {/* Urgent badge — only if any urgent open */}
                        {urgentCount > 0 && (
                          <button onClick={() => { setActiveId(project.id); setView("overview"); setTimeout(() => { document.querySelector(".ap-section-actions")?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 100); }} aria-label={`${urgentCount} action${urgentCount > 1 ? "s" : ""} urgente${urgentCount > 1 ? "s" : ""}`}
                            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: BR, background: BRB, border: `1px solid ${REDBRD}`, padding: "3px 9px 3px 7px", borderRadius: 14, cursor: "pointer", fontFamily: "inherit", minHeight: 26 }}>
                            <Ico name="alert" size={10} color={BR} />
                            {urgentCount} urgent{urgentCount > 1 ? "s" : ""}
                          </button>
                        )}
                        {/* Sub-view label (e.g. "Documents", "Prise de notes") — small accent text */}
                        {subView && (
                          <span style={{ fontSize: FS.xs, color: TX3, fontWeight: 500 }}>·</span>
                        )}
                        {subView && (
                          <span style={{ fontSize: FS.sm, color: AC, fontWeight: 600 }}>{subView}</span>
                        )}
                      </div>
                      {/* Line 2 — métadonnées projet enrichies (depuis la fusion topbar+header).
                          Affiche client, adresse et dernière mise à jour ; complète les valeurs
                          manquantes par un libellé sobre. Badge cliquable « Compléter les
                          informations » si certaines données ne sont pas renseignées. */}
                      {(() => {
                        const hasClient = !!project.client?.trim();
                        const hasAddress = !!(project.address?.trim() || project.city?.trim());
                        const incomplete = !hasClient || !hasAddress || !project.startDate;
                        const lastPv = (project.pvHistory || [])[0];
                        const updatedRaw = lastPv?.date || project.startDate;
                        const updatedLabel = updatedRaw ? `Mis à jour le ${updatedRaw}` : null;
                        return (
                          <div className="ap-project-meta" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3, fontSize: 12, color: TX2, flexWrap: "wrap" }}>
                            <span>{hasClient ? project.client : "Client non renseigné"}</span>
                            <span style={{ color: SBB }}>·</span>
                            <span>{hasAddress ? (project.address || project.city) : "Adresse non renseignée"}</span>
                            {updatedLabel && <>
                              <span style={{ color: SBB }}>·</span>
                              <span>{updatedLabel}</span>
                            </>}
                            {incomplete && (
                              <button onClick={openEditInfo} type="button"
                                title="Ouvrir l'édition des informations projet"
                                style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 10px", borderRadius: 999, background: "#FBE9D5", color: "#8B5A1A", fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                                <Ico name="edit" size={9} color="#8B5A1A" />
                                Compléter les informations
                                <Ico name="chevron-right" size={9} color="#8B5A1A" />
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          {/* Droite — recherche compacte + notifications */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "0 0 auto", marginLeft: "auto" }}>
          {/* Recherche : bouton compact ⌘K plutôt que champ permanent */}
          <button
            onClick={() => setShowSearch(true)}
            aria-label="Rechercher (Ctrl+K)"
            title="Rechercher (Ctrl+K)"
            className="ap-search-pill"
            style={{ display: "flex", alignItems: "center", gap: 8, background: SB, border: `1px solid ${SBB}`, borderRadius: 8, padding: "6px 10px 6px 10px", cursor: "pointer", fontFamily: "inherit", height: 32 }}
          >
            <Ico name="search" size={14} color={TX3} />
            <span style={{ fontSize: 12, color: TX2, fontWeight: 500 }}>Rechercher</span>
            <kbd style={{ fontSize: 10, color: TX3, background: WH, border: `1px solid ${SBB}`, borderRadius: 4, padding: "1px 5px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", lineHeight: 1.4 }}>⌘K</kbd>
          </button>
          {/* F7 — Indicateur de synchronisation */}
          <SyncBadge isOnline={isOnline} />

          {/* F5 — Bouton "Prochaines échéances" (alertes calculées en local).
              Masqué sur mobile : MobileHome agrège déjà les mêmes urgences
              dans son bloc "Aujourd'hui" (réunions du jour, permis J-7,
              factures en retard, notifs non lues) — ce bouton ferait
              double emploi côté mobile. */}
          {!isMobile && (
            <button
              onClick={() => setShowAlerts(true)}
              aria-label="Prochaines échéances"
              title="Prochaines échéances"
              style={{ background: "none", border: "none", cursor: "pointer", padding: SP.sm, borderRadius: RAD.md, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <Ico name="clock" size={18} color={TX2} />
            </button>
          )}

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
                {notifications.map(n => {
                  const isOpr = n.type === "opr_signed" || n.type === "opr_declined" || n.type === "opr_completed";
                  const handleClick = () => {
                    if (!n.read) { markNotificationRead(n.id); setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x)); }
                    // Navigation pour les notifs OPR : ouvrir le projet concerné en vue OPR
                    if (isOpr && n.project_id) {
                      const projId = parseInt(n.project_id) || n.project_id;
                      const target = (projects || []).find(p => String(p.id) === String(projId)) || (sharedProjects || []).find(p => String(p.id) === String(projId));
                      if (target) {
                        setActiveId(target.id);
                        setView("opr");
                        setShowNotifications(false);
                      }
                    }
                  };
                  return (
                    <div key={n.id} onClick={handleClick} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 16px", borderBottom: `1px solid ${SBB}`, cursor: "pointer", background: n.read ? "transparent" : "#FAFAF5" }}>
                      {!n.read && <div style={{ width: 6, height: 6, borderRadius: "50%", background: AC, flexShrink: 0, marginTop: 5 }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: TX, lineHeight: 1.5 }}>
                          {n.type === "invite" && t("notif.invite", { actor: n.actor_name, project: n.project_name || n.project_id })}
                          {n.type === "invite_accepted" && t("notif.inviteAccepted", { actor: n.actor_name })}
                          {n.type === "comment" && t("notif.comment", { actor: n.actor_name, project: n.project_name || n.project_id })}
                          {n.type === "opr_signed" && (
                            <>
                              <strong>{n.actor_name || "Un signataire"}</strong> a signé l'OPR n°{n.data?.opr_number} <span style={{ color: TX3 }}>· {n.project_name}</span>
                            </>
                          )}
                          {n.type === "opr_declined" && (
                            <>
                              <strong>{n.actor_name || "Un signataire"}</strong> a refusé de signer l'OPR n°{n.data?.opr_number} <span style={{ color: TX3 }}>· {n.project_name}</span>
                            </>
                          )}
                          {n.type === "opr_completed" && (
                            <>
                              <strong style={{ color: GR }}>OPR n°{n.data?.opr_number} entièrement signé</strong> — prêt à diffuser <span style={{ color: TX3 }}>· {n.project_name}</span>
                            </>
                          )}
                        </div>
                        <div style={{ fontSize: 10, color: TX3, marginTop: 2 }}>{new Date(n.created_at).toLocaleDateString("fr-BE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); deleteNotification(n.id); setNotifications(prev => prev.filter(x => x.id !== n.id)); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, flexShrink: 0, marginTop: 2 }}>
                        <Ico name="x" size={12} color={TX3} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          </div>{/* end right section */}
        </div>
        <div className="ap-content" style={view === "profile" && !isMobile ? { padding: 0, maxWidth: "none", margin: 0 } : { padding: "20px 28px", maxWidth: 1200, margin: "0 auto" }}>
          {view === "home" && !isMobile && (
            <DashboardHome
              projects={projects}
              setProjects={setProjects}
              profile={profile}
              onOpenProject={(id) => { setActiveId(id); setView("overview"); }}
              onNewProject={tryOpenNewProject}
            />
          )}
          {view === "profile" && (
            isMobile ? (
              <div style={{ padding: "20px 28px" }}>
                {profileSaved && <div style={{ padding: "10px 16px", background: "#EAF3DE", borderRadius: 8, color: GR, fontSize: 13, marginBottom: 16, fontWeight: 500 }}>Profil enregistré !</div>}
                <ProfileView profile={profile} onSave={saveProfile} />
              </div>
            ) : (
              <Account profile={profile} onSave={saveProfile} />
            )
          )}
          {/* v2 — Mode preview : si l'URL est /p/:id, on bascule sur la nouvelle
              ProjectDetail. Le projet rendu = le projet actuellement sélectionné
              (pas forcément celui de l'URL — l'URL sert d'opt-in au mode v2,
              pas de routing strict pour ce premier jet). */}
          {view !== "profile" && project && view === "overview" && v2ProjectIdFromUrl && (
            <ProjectDetail
              project={v2ProjectIdFromUrl === "demo" ? undefined : project}
              profile={profile}
              onStartNotes={tryStartNewPv}
              onPlanning={() => { if (!hasFeature(profile.plan, "planning")) return setUpgradeFeature("planning"); setView("planning"); }}
              onEditInfo={() => {
                const addr = project.street
                  ? { street: project.street, number: project.number || "", postalCode: project.postalCode || "", city: project.city || "", country: project.country || "Belgique" }
                  : parseAddress(project.address);
                setEditInfo({
                  name: project.name, client: project.client, contractor: project.contractor,
                  ...addr,
                  statusId: project.statusId, startDate: project.startDate, endDate: project.endDate,
                  progress: project.progress, nextMeeting: project.nextMeeting,
                  recurrence: project.recurrence || "none",
                  pvTemplate: project.pvTemplate || "standard",
                  remarkNumbering: project.remarkNumbering || "none",
                  customFields: project.customFields || [],
                });
                setModal("info");
              }}
              onInvoices={() => setView("invoices")}
              onQuotes={() => setView("quotes")}
              onJournal={() => setView("journal")}
              onOpr={() => {
                if (!hasFeature(profile.plan, "opr")) return setUpgradeFeature("opr");
                setView("opr");
              }}
              onPermits={() => setView("permits")}
              onReports={() => setView("reports")}
              onAddAction={({ text, who, urgent, due }) => {
                setProjects(prev => prev.map(p => {
                  if (p.id !== activeId) return p;
                  const id = Math.max(0, ...(p.actions || []).map(a => a.id || 0)) + 1;
                  const newAction = {
                    id, text, who: who || "", urgent: !!urgent, due: due || "", open: true, status: "todo", since: "",
                    createdAt: new Date().toISOString(), createdBy: profile?.name || "—",
                  };
                  return { ...p, actions: [...(p.actions || []), newAction] };
                }));
                showToast("Action ajoutée");
              }}
              onOpenAction={(a) => {
                // Bascule rapide résolu / à traiter depuis le board v2.
                setProjects(prev => prev.map(p =>
                  p.id !== activeId ? p : { ...p, actions: (p.actions || []).map(x => x.id === a.id ? { ...x, open: x.open === false ? true : false } : x) }
                ));
              }}
              onMoveAction={(id, col) => {
                // Drag & drop entre colonnes : todo / doing / done.
                const patch = col === "done" ? { open: false, inProgress: false, status: "done" }
                  : col === "doing" ? { open: true, inProgress: true, status: "doing" }
                  : { open: true, inProgress: false, status: "todo" };
                setProjects(prev => prev.map(p =>
                  p.id !== activeId ? p : { ...p, actions: (p.actions || []).map(x => String(x.id) === String(id) ? { ...x, ...patch } : x) }
                ));
              }}
              onAssignAction={(id, who) => {
                setProjects(prev => prev.map(p =>
                  p.id !== activeId ? p : { ...p, actions: (p.actions || []).map(x => String(x.id) === String(id) ? { ...x, who: who || "" } : x) }
                ));
              }}
              onSetActionDue={(id, due) => {
                setProjects(prev => prev.map(p =>
                  p.id !== activeId ? p : { ...p, actions: (p.actions || []).map(x => String(x.id) === String(id) ? { ...x, due: due || "" } : x) }
                ));
              }}
              onUpdateAction={(id, patch) => {
                setProjects(prev => prev.map(p => p.id !== activeId ? p : { ...p, actions: (p.actions || []).map(x => {
                  if (String(x.id) !== String(id)) return x;
                  const next = { ...x, ...patch };
                  if (patch.priority !== undefined) next.urgent = patch.priority === "urgent";
                  return next;
                }) }));
              }}
              onDeleteAction={(id) => {
                setProjects(prev => prev.map(p => p.id !== activeId ? p : { ...p, actions: (p.actions || []).filter(x => String(x.id) !== String(id)) }));
                showToast("Action supprimée");
              }}
              onViewPV={(pv) => { setModalData(pv); setModal("viewpv"); }}
              onViewPdf={async (pv) => {
                if (pv.pdfDataUrl) { setModalData({ ...pv, _tab: "output" }); setModal("viewpv"); return; }
                if (!pv.content) { setModalData(pv); setModal("viewpv"); return; }
                try {
                  const res = await generatePDF(project, pv.number, pv.date, pv.content, profile, { returnDataUrl: true });
                  setModalData({ ...pv, pdfDataUrl: res.dataUrl, fileName: res.fileName, _tab: "output" });
                  setModal("viewpv");
                } catch (e) { console.error("PDF generation failed:", e); }
              }}
              onDocuments={() => setView("plan")}
              onImportDoc={() => setView("plan")}
              onGallery={() => { if (!hasFeature(profile.plan, "gallery")) return setUpgradeFeature("gallery"); if (window.innerWidth > 768) setView("gallery"); else setGallerySheet(true); }}
              onImportPhoto={() => { if (!hasFeature(profile.plan, "gallery")) return setUpgradeFeature("gallery"); setView("gallery"); }}
              activeTimer={activeTimer}
              onStartTimer={startTimer}
              onOpenSessions={(pid) => setShowSessionsModal(pid)}
              onEditMeeting={() => {
                // Réutilise la modal `info` qui contient le champ nextMeeting.
                // Pas de modal dédiée à ce stade — l'archi y édite le projet,
                // le champ "Prochaine réunion" y est présent.
                const addr = project.street
                  ? { street: project.street, number: project.number || "", postalCode: project.postalCode || "", city: project.city || "", country: project.country || "Belgique" }
                  : parseAddress(project.address);
                setEditInfo({
                  name: project.name, client: project.client, contractor: project.contractor,
                  ...addr,
                  statusId: project.statusId, startDate: project.startDate, endDate: project.endDate,
                  progress: project.progress, nextMeeting: project.nextMeeting,
                  recurrence: project.recurrence || "none",
                  pvTemplate: project.pvTemplate || "standard",
                  remarkNumbering: project.remarkNumbering || "none",
                  customFields: project.customFields || [],
                });
                setModal("info");
              }}
            />
          )}
          {view !== "profile" && project && view === "overview" && !v2ProjectIdFromUrl && <Overview project={project} setProjects={setProjects} onStartNotes={tryStartNewPv} onEditInfo={() => { const addr = project.street ? { street: project.street, number: project.number || "", postalCode: project.postalCode || "", city: project.city || "", country: project.country || "Belgique" } : parseAddress(project.address); setEditInfo({ name: project.name, client: project.client, contractor: project.contractor, ...addr, statusId: project.statusId, startDate: project.startDate, endDate: project.endDate, progress: project.progress, nextMeeting: project.nextMeeting, recurrence: project.recurrence || "none", pvTemplate: project.pvTemplate || "standard", remarkNumbering: project.remarkNumbering || "none", customFields: project.customFields || [] }); setModal("info"); }} onEditParticipants={() => { setEditParts(project.participants.map((p) => ({ ...p }))); setModal("parts"); }} onViewPV={(pv) => { setModalData(pv); setModal("viewpv"); }} onViewPdf={async (pv) => { if (pv.pdfDataUrl) { setModalData({ ...pv, _tab: "output" }); setModal("viewpv"); return; } if (!pv.content) return; try { const { jsPDF } = await import("jspdf"); const res = await generatePDF(project, pv.number, pv.date, pv.content, profile, { returnDataUrl: true }); setModalData({ ...pv, pdfDataUrl: res.dataUrl, fileName: res.fileName, _tab: "output" }); setModal("viewpv"); } catch (e) { console.error("PDF generation failed:", e); } }} onViewPlan={() => setView("plan")} onViewPlanning={() => { if (!hasFeature(profile.plan, "planning")) return setUpgradeFeature("planning"); setView("planning"); }} onArchive={() => updateProject(activeId, { archived: !project.archived })} onDuplicate={duplicateProject} onImportPV={() => { setImportPV({ number: String((project.pvHistory.length || 0) + 1), date: new Date().toLocaleDateString("fr-BE"), author: profile.name, pdfDataUrl: null, fileName: "" }); setModal("importpv"); }} onViewTasks={() => setView("planning")} onAnnotatePlan={(itemId) => { setPlanAutoAction({ itemId, mode: "annotate" }); setView("plan"); }} onCropPlan={(itemId) => { setPlanAutoAction({ itemId, mode: "crop" }); setView("plan"); }} onAnnotatePhoto={(photoId) => { setGalleryAutoAction({ photoId }); setView("gallery"); }} onOpr={() => { if (!hasFeature(profile.plan, "opr")) return setUpgradeFeature("opr"); setView("opr"); }} onJournal={() => setView("journal")} onInvoices={() => setView("invoices")} onPermits={() => setView("permits")} onQuotes={() => setView("quotes")} onReports={() => setView("reports")} onChantierVisit={() => setView("chantier")} onCollab={() => setModal("collab")} showToast={showToast} onGallery={() => { if (!hasFeature(profile.plan, "gallery")) return setUpgradeFeature("gallery"); if (window.innerWidth > 768) setView("gallery"); else setGallerySheet(true); }} activeContext={activeContext} profile={profile} activeTimer={activeTimer} onStartTimer={startTimer} onPauseResumeTimer={pauseResumeTimer} onStopTimer={requestStopTimer} onDiscardTimer={discardActiveTimer} onOpenSessions={() => setShowSessionsModal(project.id)} onAskAiAboutCdc={(p, intent = "compare_ft") => {
  const cdc = p.cahierDesCharges;
  if (!cdc) return;
  // Pièces jointes selon le mode d'extraction (texte intégral / pages images / rien).
  const attachments = [];
  let extractMode = "context_only";
  if (cdc.extractedText) {
    attachments.push({
      type: "text",
      name: cdc.fileName || "Document de référence",
      mimeType: cdc.mimeType || "application/pdf",
      content: cdc.extractedText,
      sourceTag: `Document de référence — ${p.name}`,
    });
    extractMode = "text";
  } else if (cdc.imagePages && cdc.imagePages.length > 0) {
    for (const page of cdc.imagePages) {
      attachments.push({
        type: "image",
        name: `${cdc.fileName || "Document"} — page ${page.pageNumber}`,
        mimeType: "image/jpeg",
        dataUrl: page.dataUrl,
        sourceTag: `Document de référence — ${p.name}`,
      });
    }
    extractMode = "vision";
  }

  // Message d'amorce selon l'intent utilisateur (3 entry points dans le banner).
  // On garde une note brève en fin de message si l'extraction a échoué pour
  // que l'IA n'invente rien à partir du contenu manquant.
  const fallbackNote = extractMode === "context_only"
    ? "\n\n(⚠ le contenu du document n'a pas pu être lu automatiquement — je peux te décrire un point précis si tu en as besoin.)"
    : "";
  const messages = {
    compare_ft: `Je vais comparer une **fiche technique** reçue avec ce document de référence du projet **${p.name}**. Joins la FT avec 📎 et précise ce qu'il faut vérifier (marque imposée, performance, dimensions, certifications…). Réponds avec un verdict clair par caractéristique : conforme / non conforme / point ambigu.${fallbackNote}`,
    summary: `Résume-moi le document de référence du projet **${p.name}** en points clés : matériaux et marques imposés, performances exigées, normes citées, délais, documents/livrables attendus à la réception.${fallbackNote}`,
    question: `J'ai une question sur le document de référence du projet **${p.name}**. ${fallbackNote}`,
  };
  const message = messages[intent] || messages.compare_ft;
  askAi({ attachments, message, sourceTag: `cdc_banner_${intent}` });
}} />}
          {view !== "profile" && project && view === "notes" && !isReadOnly(project) && <PvComposer project={project} setProjects={setProjects} profile={profile} onBack={() => { setView("overview"); setPvStartMode(null); }} onRequireUpgrade={(feature) => setUpgradeFeature(feature || "maxAiPerMonth")} pvRecipients={pvRecipients} pvTitle={pvTitle} pvFieldData={pvFieldData} />}
          {view !== "profile" && project && view === "notes" && isReadOnly(project) && (() => { setView("overview"); return null; })()}
          {view !== "profile" && project && view === "result" && !isReadOnly(project) && <ResultView project={project} setProjects={setProjects} onBack={() => setView("notes")} onBackHome={() => setView("overview")} onOpenPlans={() => setView("profile")} onRequireUpgrade={(feature) => setUpgradeFeature(feature || "maxAiPerMonth")} profile={profile} pvRecipients={pvRecipients} pvTitle={pvTitle} pvFieldData={pvFieldData} />}
          {view !== "profile" && project && view === "gallery" && <GalleryView
            project={project}
            setProjects={setProjects}
            onBack={() => { setView("overview"); setGalleryAutoAction(null); }}
            autoAction={galleryAutoAction}
            showToast={showToast}
          />}
          {view !== "profile" && project && view === "plan" && <PlanManager
            project={project}
            setProjects={setProjects}
            onBack={() => { setView("overview"); setPlanAutoAction(null); }}
            autoAction={planAutoAction}
          />}
          {view !== "profile" && project && view === "planning" && isEnabled("planning") && <PlanningView project={project} setProjects={setProjects} profile={profile} showToast={showToast} onBack={() => setView("overview")} />}
          {view !== "profile" && project && view === "tasks" && <TasksView project={project} setProjects={setProjects} profile={profile} onBack={() => setView("overview")} />}
          {view !== "profile" && project && view === "opr" && isEnabled("opr") && <OprView project={project} setProjects={setProjects} profile={profile} showToast={showToast} onBack={() => setView("overview")} />}
          {view !== "profile" && project && view === "journal" && <JournalView project={project} setProjects={setProjects} profile={profile} showToast={showToast} onBack={() => setView("overview")} />}
          {view !== "profile" && project && view === "invoices" && isEnabled("invoices") && <InvoicesView project={project} profile={profile} showToast={showToast} onBack={() => setView("overview")} />}
          {view !== "profile" && project && view === "permits" && isEnabled("permits") && <PermitsView project={project} profile={profile} showToast={showToast} onBack={() => setView("overview")} />}
          {view !== "profile" && project && view === "quotes" && isEnabled("quotes") && <QuotesView project={project} profile={profile} showToast={showToast} onBack={() => setView("overview")} />}
          {view !== "profile" && project && view === "reports" && isEnabled("progressReports") && <ProgressReportsView project={project} profile={profile} showToast={showToast} onBack={() => setView("overview")} />}
          {view !== "profile" && project && view === "chantier" && <ChantierModeView project={project} setProjects={setProjects} profile={profile} showToast={showToast} onBack={() => setView("overview")} />}
          {view === "planningDashboard" && isEnabled("planning") && <PlanningDashboard projects={projects} onBack={() => setView("overview")} onSelectProject={(id) => { setActiveId(id); setView("overview"); }} onSwitchToTimesheet={() => setView("timesheet")} />}
          {view === "mapDashboard" && isEnabled("map") && <MapDashboardView projects={projects} setProjects={setProjects} onBack={() => setView("overview")} onSelectProject={(id) => { setActiveId(id); setView("overview"); }} />}
          {view === "mobileHome" && (
            <MobileHome
              projects={projects}
              notifications={notifications}
              profile={profile}
              onSelectProject={(id) => { setActiveId(id); setView("overview"); }}
              onOpenAllProjects={() => setView("chantiersList")}
              onOpenMap={() => setView("mapDashboard")}
              onOpenNotifications={() => setShowNotifications(true)}
              onOpenNewProject={() => setModal("new")}
              onResumeChantier={(id) => { setActiveId(id); setView("chantier"); }}
              onStartVisit={() => { setPendingVisit(true); setView("chantiersList"); }}
            />
          )}
          {view === "chantiersList" && (
            <MobileChantiersList
              projects={projects}
              pickToVisit={pendingVisit}
              onSelectProject={(id) => { setActiveId(id); if (pendingVisit) { setPendingVisit(false); setView("chantier"); } else { setView("overview"); } }}
              onBack={() => { setPendingVisit(false); setView(isMobile ? "mobileHome" : "overview"); }}
              onOpenNewProject={() => setModal("new")}
            />
          )}
          {view === "notifs" && (
            <MobileNotifs
              projects={projects}
              notifications={notifications}
              invitations={invitations}
              onSelectProject={(id, targetView) => {
                const projId = parseInt(id) || id;
                const exists = (projects || []).find(p => String(p.id) === String(projId)) || (sharedProjects || []).find(p => String(p.id) === String(projId));
                if (!exists) return;
                setActiveId(exists.id);
                setView(targetView || "overview");
              }}
              onMarkRead={(id) => {
                markNotificationRead(id);
                setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
              }}
              onMarkAllRead={() => {
                markAllNotificationsRead();
                setNotifications(prev => prev.map(n => ({ ...n, read: true })));
              }}
              onDelete={(id) => {
                deleteNotification(id);
                setNotifications(prev => prev.filter(n => n.id !== id));
              }}
              onDeleteAll={() => {
                deleteAllNotifications();
                setNotifications([]);
              }}
              onAcceptInvite={async (id) => {
                await respondToInvitation(id, true);
                setInvitations(prev => prev.filter(i => i.id !== id));
                showToast("Invitation acceptée");
                track("invite_accepted", { _page: "notifs" });
                setTimeout(() => loadSharedProjects().then(sp => setSharedProjects(sp)), 500);
              }}
              onDeclineInvite={async (id) => {
                await respondToInvitation(id, false);
                setInvitations(prev => prev.filter(i => i.id !== id));
              }}
              onBack={() => setView(isMobile ? "mobileHome" : "overview")}
            />
          )}
          {view === "timesheet" && isEnabled("timesheets") && (() => {
            const orgId = activeContext?.startsWith?.("org:") ? activeContext.slice(4) : null;
            const myOrg = orgId ? (myOrgs || []).find(o => o.id === orgId) : null;
            const isOrgAdmin = !!(myOrg && (myOrg._myRole === "owner" || myOrg._myRole === "admin"));
            return <TimesheetView
              projects={projects}
              profile={profile}
              isOrgAdmin={isOrgAdmin}
              activeContext={activeContext}
              onBack={() => setView("overview")}
              onSelectProject={(id) => { setActiveId(id); setView("overview"); }}
              onSwitchToCalendar={() => { if (!hasFeature(profile.plan, "planningCross")) return setUpgradeFeature("planningCross"); setView("planningDashboard"); }}
            />;
          })()}
        </div>
      </main>

      {/* Collaboration modal */}
      {modal === "collab" && project && isEnabled("collaboration") && (
        <CollabModalWrapper project={project} onClose={() => setModal(null)} showToast={showToast} profile={profile} onUpgrade={(feature) => { setModal(null); setUpgradeFeature(feature || "maxCollabPerProj"); }} activeContext={activeContext} />
      )}

      {/* PV method chooser modal */}
      <Modal open={modal === "new"} onClose={() => setModal(null)} title="Nouveau projet">
        {/* ── Modèle de projet (optionnel) ──
            Pré-remplit les champs ci-dessous avec des défauts métier (postes,
            style PV, lots, checklists, rôles types). L'utilisateur peut tout
            modifier avant de créer. "Vide" = comportement actuel inchangé. */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 8 }}>
            Modèle de projet <span style={{ fontWeight: 500, color: TX3, textTransform: "none", letterSpacing: 0 }}>— pré-remplit le formulaire (modifiable)</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
            {PROJECT_TEMPLATES.map(tpl => {
              const selected = newP.projectTemplate === tpl.id;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => {
                    // Sélectionne le modèle. Pour "blank" on remet juste les défauts profil.
                    setNewP(p => {
                      const next = { ...p, projectTemplate: tpl.id };
                      // Champs du formulaire : appliquer SEULEMENT si le modèle en propose,
                      // sinon revenir au défaut profil (cas "blank").
                      next.postTemplate = tpl.postTemplate || profile.postTemplate || "general";
                      next.pvTemplate = tpl.pvTemplate || profile.pvTemplate || "standard";
                      next.remarkNumbering = tpl.remarkNumbering || profile.remarkNumbering || "none";
                      next.recurrence = tpl.recurrence || "none";
                      // Description : remplit seulement si l'utilisateur n'a rien tapé.
                      if (!p.desc?.trim() && tpl.id !== "blank") next.desc = tpl.description;
                      return next;
                    });
                  }}
                  style={{
                    textAlign: "left", padding: "10px 12px", border: `1px solid ${selected ? AC : SBB}`,
                    borderRadius: 10, background: selected ? ACL : WH, cursor: "pointer", fontFamily: "inherit",
                    transition: "all 0.15s", minHeight: 64,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <div style={{ width: 22, height: 22, borderRadius: 5, background: selected ? AC : SB2, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Ico name={tpl.icon || "file"} size={11} color={selected ? WH : TX3} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: selected ? AC : TX }}>{tpl.label}</span>
                  </div>
                  <div style={{ fontSize: 10, color: TX3, lineHeight: 1.4 }}>{tpl.description}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Bloc Essentiel — 2 champs obligatoires (Nom + Ville) + Phase
            qui a une valeur par défaut. Tout le reste se complète plus
            tard via les chips "À compléter" affichés dans la Fiche projet. */}
        <Field label="Nom du projet *" value={newP.name} onChange={(v) => setNewP((p) => ({ ...p, name: v }))} placeholder="ex: Rénovation Maison Dupont" />
        <div style={{ display: "flex", gap: 10 }}>
          <Field half label="Ville *" value={newP.city} onChange={(v) => setNewP((p) => ({ ...p, city: v }))} placeholder="Bruxelles" />
          <Field half label="Phase du projet" value={newP.statusId} onChange={(v) => setNewP((p) => ({ ...p, statusId: v }))} select options={STATUSES} />
        </div>

        {/* Bloc phase-adaptatif — les champs proposés dépendent de la phase
            choisie. Pour la phase "Permis", on collecte aussi les infos du
            dossier urbanisme qui seront créées en DB en parallèle du projet
            (un dossier de suivi prêt à recevoir l'AR). */}
        {(() => {
          const set = (key, v) => setNewP(p => ({ ...p, [key]: v }));
          const setPermit = (key, v) => setNewP(p => ({ ...p, _permit: { ...p._permit, [key]: v } }));

          // Bandeau d'intro + champs spécifiques à la phase. Le statusId
          // est garanti d'avoir une valeur (défaut "sketch") donc on tape
          // toujours dans une branche.
          const PHASE_INTRO = {
            sketch:       { label: "Esquisse",   desc: "Tu démarres en esquisse. L'essentiel suffit — tu compléteras au fil du projet." },
            preliminary:  { label: "Avant-projet", desc: "Avant-projet : tu connais le client et le programme général." },
            permit:       { label: "Permis",     desc: "Permis d'urbanisme : un dossier de suivi sera créé en parallèle pour traquer dépôt, AR et échéance." },
            execution:    { label: "Exécution",  desc: "Phase d'exécution / études techniques. Renseigne ce qui est déjà cadré." },
            construction: { label: "Chantier",   desc: "Chantier en cours. Configure le rythme des PV et les acteurs principaux." },
            reception:    { label: "Réception",  desc: "Phase de réception (OPR). Le MO et l'entreprise sont nécessaires pour signer les PV de réception." },
            closed:       { label: "Clôturé",    desc: "Projet clôturé — création pour archivage." },
          };
          const intro = PHASE_INTRO[newP.statusId] || PHASE_INTRO.sketch;
          const phase = STATUSES.find(s => s.id === newP.statusId) || STATUSES[0];

          return (
            <div style={{ marginBottom: 14, border: `1px solid ${SBB}`, borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "10px 14px", background: phase.bg, borderBottom: `1px solid ${SBB}`, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: phase.color }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: phase.color, textTransform: "uppercase", letterSpacing: "0.05em" }}>Phase {intro.label}</div>
                  <div style={{ fontSize: 11, color: TX2, marginTop: 2, lineHeight: 1.4 }}>{intro.desc}</div>
                </div>
              </div>
              <div style={{ padding: "12px 14px" }}>
                {/* MO — utile dès la phase Esquisse (souvent l'archi a déjà
                    le contact même sans contrat). Caché en phase Esquisse seulement
                    si l'archi le veut vraiment. */}
                {newP.statusId !== "sketch" && (
                  <Field label="Maître d'ouvrage" value={newP.client} onChange={(v) => set("client", v)} placeholder="ex: M. Dupont" />
                )}

                {/* Entreprise — visible à partir de Permis (avant elle n'est
                    en général pas désignée). */}
                {["permit","execution","construction","reception","closed"].includes(newP.statusId) && (
                  <Field label={newP.statusId === "construction" || newP.statusId === "reception" ? "Entreprise *" : "Entreprise"} value={newP.contractor} onChange={(v) => set("contractor", v)} placeholder="ex: BESIX" />
                )}

                {/* Bloc Permis — déclenche la création d'un dossier permis
                    en DB si commune renseignée. */}
                {newP.statusId === "permit" && (
                  <div style={{ marginTop: 6, padding: 12, background: SB, borderRadius: 8, border: `1px dashed ${SBB}` }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: TX3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                      Dossier permis d'urbanisme
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <Field half label="Commune" value={newP._permit.commune} onChange={(v) => setPermit("commune", v)} placeholder="ex: Schaerbeek" />
                      <Field half label="Référence dossier (si connue)" value={newP._permit.reference} onChange={(v) => setPermit("reference", v)} placeholder="ex: URB/2026/0123" />
                    </div>
                    <Field label="Procédure" value={newP._permit.procedure} onChange={(v) => setPermit("procedure", v)} select options={[
                      { id: "30j",  label: "30 jours (modif mineure)" },
                      { id: "75j",  label: "75 jours (permis simple)" },
                      { id: "105j", label: "105 jours (avec consultation)" },
                      { id: "230j", label: "230 jours (avec EIE)" },
                      { id: "autres", label: "Autres" },
                    ]} />
                    <div style={{ display: "flex", gap: 10 }}>
                      <Field half label="Date de dépôt (si déjà déposé)" value={newP._permit.depot_date} onChange={(v) => setPermit("depot_date", v)} type="date" />
                      <Field half label="Date d'AR (si reçu)" value={newP._permit.ar_date} onChange={(v) => setPermit("ar_date", v)} type="date" />
                    </div>
                    <div style={{ fontSize: 10, color: TX3, marginTop: 4, lineHeight: 1.4, fontStyle: "italic" }}>
                      Si tu renseignes au moins la commune, un dossier de suivi sera créé automatiquement et accessible depuis la carte « Permis d'urbanisme » du projet.
                    </div>
                  </div>
                )}

                {/* Dates — pertinentes dès Permis (date de dépôt prévue),
                    indispensables en construction/réception. */}
                {["execution","construction","reception","closed"].includes(newP.statusId) && (
                  <div style={{ display: "flex", gap: 10 }}>
                    <Field half label={newP.statusId === "closed" ? "Date de début (passée)" : "Date de début prévue"} value={newP.startDate} onChange={(v) => set("startDate", v)} placeholder="ex: 01/04/2026" />
                    {["construction","reception","closed"].includes(newP.statusId) && (
                      <Field half label="Date de fin prévue" value={newP.endDate} onChange={(v) => set("endDate", v)} placeholder="ex: 28/09/2026" />
                    )}
                  </div>
                )}

                {/* Réunions — pertinentes seulement en construction. */}
                {newP.statusId === "construction" && (
                  <div style={{ display: "flex", gap: 10 }}>
                    <Field half label="Prochaine réunion" value={newP.nextMeeting} onChange={(v) => set("nextMeeting", v)} placeholder="ex: 09/04/2026" />
                    <Field half label="Récurrence" value={newP.recurrence} onChange={(v) => set("recurrence", v)} select options={RECURRENCES} />
                  </div>
                )}

                {/* Description — disponible partout, utile surtout en amont. */}
                {["sketch","preliminary"].includes(newP.statusId) && (
                  <Field label="Description du projet (optionnel)" value={newP.desc} onChange={(v) => set("desc", v)} placeholder="ex: Maison unifamiliale 4 façades, 240 m²..." area />
                )}
              </div>
            </div>
          );
        })()}

        {/* Adresse précise (optionnelle) — toujours dans un repliable car
            non liée à la phase mais utile pour la géolocalisation / les PDF. */}
        <details style={{ marginBottom: 10 }}>
          <summary style={{ cursor: "pointer", fontSize: 11, color: TX3, fontWeight: 600, padding: "8px 0", userSelect: "none", display: "flex", alignItems: "center", gap: 6 }}>
            <span>Adresse précise du chantier (optionnel)</span>
            <span style={{ flex: 1, height: 1, background: SBB }} />
          </summary>
          <div style={{ paddingTop: 8 }}>
            <div style={{ display: "flex", gap: 10 }}>
              <Field half label="Rue" value={newP.street} onChange={(v) => setNewP((p) => ({ ...p, street: v }))} placeholder="ex: Rue de la Loi" />
              <div style={{ flex: "0 0 80px" }}><Field label="N°" value={newP.number} onChange={(v) => setNewP((p) => ({ ...p, number: v }))} placeholder="12" /></div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: "0 0 100px" }}><Field label="Code postal" value={newP.postalCode} onChange={(v) => setNewP((p) => ({ ...p, postalCode: v }))} placeholder="1000" /></div>
              <Field half label="Pays" value={newP.country} onChange={(v) => setNewP((p) => ({ ...p, country: v }))} placeholder="Belgique" />
            </div>
          </div>
        </details>

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
          <Field half label="Phase" value={editInfo.statusId || "sketch"} onChange={(v) => setEditInfo((p) => ({ ...p, statusId: v }))} select options={getProjectPhases(project)} />
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

        <button onClick={() => { updateProject(activeId, { ...editInfo, address: formatAddress(editInfo) }); setModal(null); showToast("Infos projet mises à jour"); }} style={{ width: "100%", padding: 14, border: "none", borderRadius: 10, background: AC, color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginTop: 12 }}>Enregistrer</button>
      </Modal>

      <Modal open={modal === "parts"} onClose={() => setModal(null)} title="Participants">
        {/* Datalist de suggestions de rôles. Le navigateur affiche les options
            quand l'archi clique dans le champ Rôle. Liste non-fermée — l'archi
            peut toujours saisir un rôle libre (rétro-compat avec les données
            existantes). Définie au niveau modale pour être partagée entre tous
            les inputs role[i] des participants. */}
        <datalist id="participant-roles-list">
          {PARTICIPANT_ROLES.map(r => <option key={r} value={r} />)}
        </datalist>
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
              <input list="participant-roles-list" value={p.role} onChange={(e) => { const c = [...editParts]; c[i] = { ...c[i], role: e.target.value }; setEditParts(c); }} placeholder="Rôle (MO, Architecte, Entreprise…)" style={{ padding: "8px 10px", border: `1px solid ${SBB}`, borderRadius: 6, fontSize: 12, fontFamily: "inherit", background: WH, color: TX, boxSizing: "border-box", width: "100%", minWidth: 0 }} />
              <input value={p.phone || ""} onChange={(e) => { const c = [...editParts]; c[i] = { ...c[i], phone: e.target.value }; setEditParts(c); }} placeholder="Tél." type="tel" style={{ padding: "8px 10px", border: `1px solid ${SBB}`, borderRadius: 6, fontSize: 12, fontFamily: "inherit", background: WH, color: TX, boxSizing: "border-box", width: "100%", minWidth: 0 }} />
              <input value={p.email || ""} onChange={(e) => { const c = [...editParts]; c[i] = { ...c[i], email: e.target.value }; setEditParts(c); }} placeholder="Email" type="email" style={{ padding: "8px 10px", border: `1px solid ${SBB}`, borderRadius: 6, fontSize: 12, fontFamily: "inherit", background: WH, color: TX, gridColumn: "1 / -1", boxSizing: "border-box", width: "100%", minWidth: 0 }} />
            </div>
          </div>
        ))}
        <button onClick={() => setEditParts((prev) => [...prev, { role: "", name: "", email: "", phone: "" }])} style={{ width: "100%", padding: 10, border: `1px dashed ${SBB}`, borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 12, color: AC, fontFamily: "inherit", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <Ico name="plus" size={13} color={AC} />Ajouter un participant
        </button>
        {/* Aide IA — opt-in. Repère les rôles manquants typiques pour ce type de chantier
            (MO, archi, entreprise, ingénieur stabilité, PEB, coordinateur sécurité, etc.). */}
        {project && (
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
            <AskAiButton
              size="compact"
              label="Rôles manquants pour ce chantier ?"
              sourceTag="participants_modal"
              contextHint="L'IA reçoit la liste des participants actuels et le type de chantier. Elle suggère les rôles typiques manquants."
              message={`Voici les participants actuels du chantier **${project.name}** (${project.client ? `MO ${project.client}` : "MO inconnu"}, ${project.contractor ? `entreprise ${project.contractor}` : "entreprise inconnue"}) :\n${editParts.length === 0 ? "(aucun pour le moment)" : editParts.map(p => `- ${p.role || "(rôle ?)"} : ${p.name || "(nom ?)"}`).join("\n")}\n\nQuels rôles essentiels sont manquants pour ce type de chantier en Belgique ? Choisis tes suggestions dans cette liste de rôles standards :\n${PARTICIPANT_ROLES.map(r => `- ${r}`).join("\n")}\n\nSi un rôle critique manque vraiment (ex : coordinateur sécurité-santé pour un chantier avec plusieurs entreprises), signale-le. Donne-moi une liste courte (max 4) avec une justification d'une ligne par rôle.`}
            />
          </div>
        )}
        <button onClick={() => { const cleanParts = editParts.filter((p) => p.name.trim()); updateProject(activeId, { participants: cleanParts }); setModal(null); showToast(`${cleanParts.length} participant${cleanParts.length > 1 ? "s" : ""} enregistré${cleanParts.length > 1 ? "s" : ""}`); }} style={{ width: "100%", padding: 13, border: "none", borderRadius: 10, background: AC, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Enregistrer</button>
      </Modal>

      {/* Import PV modal */}
      <Modal open={modal === "importpv"} onClose={() => setModal(null)} title="Importer un ancien PV" wide>
        {(() => {
          const [extractedText, setExtractedText] = [importPV._extractedText || "", (v) => setImportPV(p => ({ ...p, _extractedText: v }))];
          const [aiResult, setAiResult] = [importPV._aiResult || null, (v) => setImportPV(p => ({ ...p, _aiResult: v }))];
          const [aiLoading, setAiLoading] = [importPV._aiLoading || false, (v) => setImportPV(p => ({ ...p, _aiLoading: v }))];
          const [aiError, setAiError] = [importPV._aiError || "", (v) => setImportPV(p => ({ ...p, _aiError: v }))];

          const extractTextFromPdf = async (dataUrl) => {
            try {
              const pdfjsLib = await import("pdfjs-dist");
              pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).href;
              const arr = Uint8Array.from(atob(dataUrl.split(",")[1]), c => c.charCodeAt(0));
              const pdf = await pdfjsLib.getDocument({ data: arr }).promise;
              let text = "";
              for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                text += content.items.map(item => item.str).join(" ") + "\n";
              }
              return text.trim();
            } catch (e) { console.error("PDF text extraction failed:", e); return ""; }
          };

          const analyzeWithAI = async () => {
            if (!extractedText) return;
            setAiLoading(true);
            setAiError("");
            try {
              const { data, error } = await supabase.functions.invoke("generate-pv", {
                body: {
                  systemPrompt: `Tu es un assistant qui analyse des procès-verbaux de chantier existants. À partir du texte brut d'un PV, extrais la structure en JSON strict.

Retourne UNIQUEMENT un objet JSON valide (pas de markdown, pas de commentaire) avec cette structure :
{
  "number": <numéro du PV (entier)>,
  "date": "<date au format dd/mm/yyyy>",
  "author": "<auteur si trouvé>",
  "posts": [
    { "id": "<numéro du poste>", "label": "<intitulé du poste>", "remarks": [
      { "text": "<texte de la remarque>", "urgent": <true/false>, "status": "open" }
    ]}
  ],
  "actions": [
    { "text": "<description de l'action>", "who": "<responsable>", "urgent": <true/false>, "open": true }
  ],
  "excerpt": "<résumé en 1 ligne du PV>"
}

Règles :
- Identifie les postes/sections numérotés (01. Situation, 02. Généralités, etc.)
- Les lignes commençant par ">" ou marquées comme urgentes → urgent: true
- Les lignes commençant par "-" sont des remarques normales
- Les actions sont souvent à la fin ou mentionnées comme "action", "à faire", "à réaliser"
- Si le numéro de PV ou la date ne sont pas trouvés, mets des valeurs vides
- Retourne UNIQUEMENT le JSON, rien d'autre`,
                  userPrompt: `Analyse ce procès-verbal de chantier et extrais la structure :\n\n${extractedText.slice(0, 8000)}`,
                  maxTokens: 3000,
                },
              });
              if (error) {
                const body = await parseFunctionError(error);
                if (body.code === "plan_upgrade_required") {
                  setUpgradeFeature(body.feature || "maxAiPerMonth");
                  setAiLoading(false);
                  return;
                }
                throw new Error(body.error || error.message);
              }
              if (data?.error) throw new Error(data.error);
              const content = data?.content || "";
              // Parse JSON from response (might be wrapped in ```json)
              const jsonStr = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
              const parsed = JSON.parse(jsonStr);
              setAiResult(parsed);
              // Auto-fill metadata from AI result
              if (parsed.number) setImportPV(p => ({ ...p, number: String(parsed.number), _aiResult: parsed }));
              if (parsed.date) setImportPV(p => ({ ...p, date: parsed.date, _aiResult: parsed }));
              if (parsed.author) setImportPV(p => ({ ...p, author: parsed.author, _aiResult: parsed }));
            } catch (e) {
              console.error("AI analysis failed:", e);
              setAiError(e.message || "Erreur lors de l'analyse");
            }
            setAiLoading(false);
          };

          return (
            <>
        <input ref={importPVRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = async (ev) => {
            const dataUrl = ev.target.result;
            setImportPV((prev) => ({ ...prev, pdfDataUrl: dataUrl, fileName: file.name, _extractedText: "", _aiResult: null, _aiError: "" }));
            // Auto-extract text
            const text = await extractTextFromPdf(dataUrl);
            setImportPV(p => ({ ...p, _extractedText: text }));
          };
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
                <div style={{ fontSize: 11, color: GR, marginTop: 2 }}>
                  {extractedText ? `${extractedText.split(/\s+/).length} mots extraits` : "Extraction du texte..."}
                </div>
              </div>
              <button onClick={() => importPVRef.current?.click()} style={{ background: "none", border: `1px solid ${SBB}`, borderRadius: 6, cursor: "pointer", padding: "5px 10px", fontSize: 12, color: TX2, fontFamily: "inherit" }}>Changer</button>
            </div>
          ) : (
            <button onClick={() => importPVRef.current?.click()} style={{ width: "100%", padding: "22px 16px", border: `2px dashed ${SBB}`, borderRadius: 10, background: SB, cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <Ico name="upload" size={28} color={TX3} />
              <span style={{ fontSize: 13, color: TX2, fontWeight: 500 }}>Cliquer pour sélectionner un PDF</span>
              <span style={{ fontSize: 11, color: TX3 }}>Le fichier sera analysé par l'IA pour extraire la structure</span>
            </button>
          )}
        </div>

        {/* Bouton Analyse IA */}
        {extractedText && !aiResult && (
          <button
            onClick={analyzeWithAI}
            disabled={aiLoading}
            style={{ width: "100%", padding: 14, border: "none", borderRadius: 10, background: aiLoading ? DIS : AC, color: "#fff", fontSize: 14, fontWeight: 600, cursor: aiLoading ? "default" : "pointer", fontFamily: "inherit", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.2s" }}
          >
            {aiLoading ? (
              <><div style={{ width: 16, height: 16, border: `2px solid rgba(255,255,255,0.3)`, borderTopColor: "#fff", borderRadius: "50%", animation: "sp 0.6s linear infinite" }} />Analyse en cours...</>
            ) : (
              <><Ico name="send" size={16} color="#fff" />Analyser avec l'IA</>
            )}
          </button>
        )}
        {aiError && <div style={{ padding: "10px 14px", background: REDBG, border: `1px solid ${REDBRD}`, borderRadius: 8, color: RD, fontSize: 12, marginBottom: 16 }}>{aiError}</div>}

        {/* Résultat IA : aperçu structuré */}
        {aiResult && (
          <div style={{ marginBottom: 16, padding: "12px 14px", background: GRBG, border: `1px solid #c6e6a8`, borderRadius: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <Ico name="check" size={14} color={GR} />
              <span style={{ fontSize: 13, fontWeight: 700, color: GR }}>Structure extraite par l'IA</span>
            </div>
            <div style={{ fontSize: 12, color: TX2, lineHeight: 1.6 }}>
              <div><strong>{(aiResult.posts || []).length}</strong> postes · <strong>{(aiResult.posts || []).reduce((s, p) => s + (p.remarks || []).length, 0)}</strong> remarques · <strong>{(aiResult.actions || []).length}</strong> actions</div>
              {(aiResult.posts || []).map((p, i) => (
                <div key={i} style={{ marginTop: 4, padding: "4px 8px", background: "rgba(255,255,255,0.6)", borderRadius: 4 }}>
                  <span style={{ fontWeight: 600 }}>{p.id}. {p.label}</span>
                  <span style={{ color: TX3 }}> — {(p.remarks || []).length} remarque{(p.remarks || []).length !== 1 ? "s" : ""}</span>
                </div>
              ))}
            </div>
          </div>
        )}

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
            const content = aiResult ? (aiResult.posts || []).map(p =>
              `${p.id}. ${p.label}\n${(p.remarks || []).map(r => `${r.urgent ? "> " : "- "}${r.text}`).join("\n")}`
            ).join("\n\n") : "";
            const excerpt = aiResult?.excerpt || `PV importé — ${importPV.fileName}`;
            const entry = {
              number: num,
              date: importPV.date.trim(),
              author: importPV.author.trim() || "—",
              postsCount: aiResult ? (aiResult.posts || []).length : 0,
              excerpt,
              content,
              pdfDataUrl: importPV.pdfDataUrl,
              fileName: importPV.fileName,
              imported: true,
            };
            // Update project: add PV to history + merge posts/remarks if AI extracted them
            setProjects((prev) => prev.map((p) => {
              if (p.id !== activeId) return p;
              let updatedProject = { ...p, pvHistory: [entry, ...p.pvHistory] };
              // If AI extracted posts, merge remarks into existing posts
              if (aiResult?.posts) {
                const updatedPosts = [...p.posts];
                aiResult.posts.forEach(aiPost => {
                  const existing = updatedPosts.find(ep => ep.id === aiPost.id);
                  if (existing) {
                    // Add AI remarks to existing post (with carriedFrom tag)
                    const newRemarks = (aiPost.remarks || []).map(r => ({
                      id: Date.now() + Math.random(),
                      text: r.text,
                      urgent: r.urgent || false,
                      status: r.status || "open",
                      carriedFrom: num,
                    }));
                    existing.remarks = [...(existing.remarks || []), ...newRemarks];
                  } else {
                    // Create new post
                    updatedPosts.push({
                      id: aiPost.id,
                      label: aiPost.label,
                      notes: "",
                      remarks: (aiPost.remarks || []).map(r => ({
                        id: Date.now() + Math.random(),
                        text: r.text,
                        urgent: r.urgent || false,
                        status: r.status || "open",
                        carriedFrom: num,
                      })),
                    });
                  }
                });
                updatedProject.posts = updatedPosts;
              }
              // If AI extracted actions, add them
              if (aiResult?.actions) {
                const newActions = aiResult.actions.map(a => ({
                  id: Date.now() + Math.random(),
                  text: a.text,
                  who: a.who || "",
                  urgent: a.urgent || false,
                  open: true,
                  since: `PV ${num}`,
                }));
                updatedProject.actions = [...(p.actions || []), ...newActions];
              }
              return updatedProject;
            }));
            setModal(null);
            showToast(aiResult ? `PV importé — ${(aiResult.posts || []).length} postes et ${(aiResult.actions || []).length} actions extraits` : "PV importé");
            track("pv_imported", { ai_extracted: !!aiResult, _page: "importpv" });
          }}
          style={{ width: "100%", padding: 14, border: "none", borderRadius: 10, background: importPV.pdfDataUrl && importPV.number.trim() && importPV.date.trim() ? AC : DIS, color: importPV.pdfDataUrl && importPV.number.trim() && importPV.date.trim() ? "#fff" : DIST, fontSize: 15, fontWeight: 600, cursor: importPV.pdfDataUrl && importPV.number.trim() && importPV.date.trim() ? "pointer" : "not-allowed", fontFamily: "inherit", transition: "all 0.2s" }}
        >
          {aiResult ? "Importer avec structure IA" : "Importer le PV"}
        </button>
            </>
          );
        })()}
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
                    <div style={{ padding: 20, background: SB, borderRadius: 10, fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif", fontSize: 13, lineHeight: 1.9, whiteSpace: "pre-wrap", color: TX, maxHeight: "55vh", overflowY: "auto", border: `1px solid ${SBB}` }}>{modalData.content}</div>
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
            onUpdateSignature={(html) => { const next = { ...profile, emailSignature: html }; saveProfile(next); showToast("Signature mise à jour pour tes prochains emails"); }}
            onUpgrade={() => { setModalData(d => ({ ...d, _showSend: false })); setView("profile"); }}
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
        <CommandPalette
          projects={projects}
          onClose={() => setShowSearch(false)}
          onOpenProject={(id) => { setActiveId(id); setView("overview"); }}
          onOpenPv={(projId, pv) => { setActiveId(projId); setView("overview"); setModalData(pv); setModal("viewpv"); }}
          onNewPv={() => { setShowSearch(false); tryStartNewPv(); }}
          onNewProject={() => { setShowSearch(false); tryOpenNewProject(); }}
        />
      )}

      {/* Wizard d'onboarding contextuel par phase. Le CTA mappe une chaîne
          d'action (cf. constants/phaseWizards.js) vers une navigation
          interne. Toute action non reconnue est un no-op silencieux. */}
      {phaseWizard && (
        <PhaseWizardModal
          phaseId={phaseWizard}
          onClose={() => setPhaseWizard(null)}
          onAction={(action) => {
            // Routing des CTAs vers les sous-vues du projet courant.
            // Utilise les mêmes setView() que les cartes d'Overview pour
            // garantir un comportement identique (gates de plan inclus).
            switch (action) {
              case "permits": setView("permits"); break;
              case "quotes":  setView("quotes"); break;
              case "planning":
                if (!hasFeature(profile.plan, "planning")) { setUpgradeFeature("planning"); break; }
                setView("planning"); break;
              case "notes":   tryStartNewPv(); break;
              case "opr":
                if (!hasFeature(profile.plan, "opr")) { setUpgradeFeature("opr"); break; }
                setView("opr"); break;
              case "journal": setView("journal"); break;
              case "reports": setView("reports"); break;
              default: /* no-op */ break;
            }
          }}
        />
      )}

      {/* F5 — Drawer "Prochaines échéances". Inaccessible sur mobile :
          le bloc Aujourd'hui de MobileHome remplace cette fonctionnalité. */}
      {showAlerts && !isMobile && (
        <AlertsDrawer
          projects={projects}
          profile={profile}
          onClose={() => setShowAlerts(false)}
          onSelectProject={(id) => { setActiveId(id); setView("overview"); }}
        />
      )}

      {!isOnline && (
        // Sur mobile, on remonte la barre offline au-dessus de la
        // MobileBottomBar (60px nav + safe-area) — sinon le banner masque
        // la nav et l'archi ne peut plus naviguer. On condense aussi le
        // texte (un écran 6" ne tient pas les 3 segments séparés par "·").
        <div style={{
          position: "fixed",
          bottom: isMobile ? `calc(60px + env(safe-area-inset-bottom, 0px))` : 0,
          left: 0, right: 0,
          background: TX, color: "#fff",
          padding: isMobile ? "8px 14px" : "10px 20px",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          fontSize: 12, zIndex: 999,
        }}>
          <Ico name="wifioff" size={14} color="#fff" />
          <span>Hors-ligne</span>
          <span style={{ opacity: 0.6 }}>·</span>
          <span style={{ opacity: 0.7 }}>
            {isMobile ? "sync au retour" : "Notes et photos sauvegardées localement"}
          </span>
          {!isMobile && (
            <>
              <span style={{ opacity: 0.6 }}>·</span>
              <span style={{ opacity: 0.7 }}>Sync automatique au retour du réseau</span>
            </>
          )}
        </div>
      )}

      {/* Toast reconnexion — repositionné au-dessus du bottom bar sur mobile
          pour la même raison (sinon il chevauche la nav). */}
      {showReconnected && (
        <div style={{
          position: "fixed",
          bottom: isMobile ? `calc(76px + env(safe-area-inset-bottom, 0px))` : 16,
          left: "50%", transform: "translateX(-50%)",
          background: GR, color: "#fff",
          padding: "10px 20px", borderRadius: 10,
          fontSize: 13, fontWeight: 600, zIndex: 999,
          display: "flex", alignItems: "center", gap: 6,
          whiteSpace: "nowrap",
        }}>
          <Ico name="check" size={14} color="#fff" />
          {isMobile ? "Reconnecté · synchronisé" : "Reconnecté — Données synchronisées"}
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
      {/* ── Mobile Bottom Bar ──
          Bottom bar v3 : [Accueil] [Chantiers] [🏗 Visite FAB] [Notifs] [Moi].
          Le FAB central lance directement le Mode Chantier (différenciateur
          PWA mobile) au lieu d'ouvrir QuickCaptureSheet — la capture passe
          désormais par les phases de la visite. */}
      {/* Masquée sur les vues plein écran focalisées (capture/rédaction) :
          sinon elle recouvre leurs footers d'action (Terminer / Générer). */}
      {!["chantier", "notes", "result"].includes(view) && <MobileBottomBar
        view={view}
        notifsOpen={showNotifications}
        unreadCount={(notifications || []).filter(n => !n.read).length}
        visitActive={!!activeVisitState}
        onNavigate={(tab) => {
          // Sur mobile, l'onglet "Accueil" route vers la home mobile dédiée
          // (agrégateur d'urgences + sélecteur de projet) plutôt que vers
          // l'Overview d'un projet auto-sélectionné.
          if (tab === "overview" && isMobile) tab = "mobileHome";
          // L'onglet "Chantiers" route vers la liste cross-projects dédiée
          // (search + filtres). MobileHome reste pour les 5 plus récents
          // + urgences ; chantiersList expose tout le portfolio.
          if (tab === "chantiers") tab = "chantiersList";
          setView(tab);
          setSidebarOpen(false);
        }}
        onStartChantier={() => {
          setSidebarOpen(false);
          // Priorité 1 : visite en cours (peut être sur un projet différent
          // de celui actuellement ouvert). On rebascule sur le projet de la
          // visite et on entre directement dans Mode Chantier — c'est l'usage
          // "tap FAB pour reprendre" depuis n'importe quelle page.
          if (activeVisitState) {
            const visitProjId = activeVisitState.projectId;
            if (String(visitProjId) !== String(activeId)) {
              setActiveId(visitProjId);
            }
            setView("chantier");
            return;
          }
          // Priorité 2 : projet déjà sélectionné → démarrer une nouvelle visite.
          if (project) {
            setView("chantier");
            return;
          }
          // Sinon : pas de contexte → renvoie sur la home pour sélectionner.
          setView(isMobile ? "mobileHome" : "overview");
          showToast({ msg: "Sélectionne un chantier pour démarrer la visite", type: "info" });
        }}
        onNotifs={() => {
          setSidebarOpen(false);
          // Mobile : page Notifs consolidée plein écran (sections
          // Invitations / Échéances / Non lues / Historique).
          // Re-tap = destination (pas de toggle vers mobileHome) — cohérence
          // avec les 4 autres slots qui sont tous des destinations. Évite
          // que l'archi qui veut "rafraîchir" la page en re-tappant Notifs
          // soit bouncé vers Accueil (cf. review UX P2).
          // Desktop : drawer dropdown classique sous la cloche header.
          if (isMobile) {
            setView("notifs");
          } else {
            setShowNotifications(v => !v);
          }
        }}
      />}

      {/* QuickCaptureSheet retirée : code mort — le FAB central de la bottom
          bar v3 entre directement en Mode Chantier (cf. MobileBottomBar),
          `setCaptureSheet(true)` n'était plus appelé nulle part. */}

      {/* ── Mobile PV vocal one-shot — sheet ──
          Dicter → IA structure → revoir → envoyer en 2-3 taps. Réutilise
          useWhisperRecorder + generate-pv + generatePDF + sendPvByEmail. */}
      <MobilePvDictateSheet
        open={mobilePvDictateOpen}
        onClose={() => setMobilePvDictateOpen(false)}
        project={project}
        profile={profile}
        setProjects={setProjects}
        showToast={showToast}
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
                {(isEnabled("planning") || isEnabled("map") ? ["projects", "dashboard"] : ["projects"]).map(tab => {
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
            {pickerTab === "dashboard" && (isEnabled("planning") || isEnabled("map")) && (
              <div style={{ padding: `0 ${SP.lg}px ${SP.lg}px`, display: "flex", gap: 8 }}>
                {isEnabled("planning") && <button onClick={() => { setProjectPicker(false); if (!hasFeature(profile.plan, "planningCross")) return setUpgradeFeature("planningCross"); setView("planningDashboard"); }} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "18px 10px", border: `1px solid ${SBB}`, borderRadius: 12, background: WH, cursor: "pointer", fontFamily: "inherit" }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: BLB, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Ico name="calendar" size={18} color={BL} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: TX }}>Planning</div>
                  <div style={{ fontSize: 10, color: TX3, textAlign: "center", lineHeight: 1.3 }}>Coordination</div>
                </button>}
                {isEnabled("map") && <button onClick={() => { setProjectPicker(false); setView("mapDashboard"); }} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "18px 10px", border: `1px solid ${SBB}`, borderRadius: 12, background: WH, cursor: "pointer", fontFamily: "inherit" }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: "#D5E4C5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Ico name="mappin" size={18} color="#4D8030" />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: TX }}>Carte</div>
                  <div style={{ fontSize: 10, color: TX3, textAlign: "center", lineHeight: 1.3 }}>Chantiers géolocalisés</div>
                </button>}
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

      {/* Onboarding wizard for new users — wait until any pending invite
          modal has been processed so we know whether the user joined an
          org (compact flow) or signs up solo (full flow). */}
      {showOnboarding && !inviteToken && (
        <OnboardingWizard
          compact={myOrgs.length > 0}
          joinedOrgName={myOrgs[0]?.name || null}
          profile={profile}
          onUpdateProfile={(p) => { setProfile(p); saveProfile(p); }}
          onCreateProject={(proj) => {
            const id = Math.max(...projects.map((p) => p.id), 0) + 1;
            const tpl = POST_TEMPLATES.find(t => t.id === (profile.postTemplate || "general")) || POST_TEMPLATES[0];
            const posts = tpl.posts.map(p => ({ id: p.id, label: p.label, notes: "", remarks: [] }));
            const address = [proj.city].filter(Boolean).join(", ");
            setProjects((prev) => [...prev, { id, name: proj.name, client: proj.client || "", contractor: proj.contractor || "", address, city: proj.city || "", startDate: proj.startDate || "", endDate: proj.endDate || "", progress: 0, bureau: profile.structure, statusId: "sketch", recurrence: "none", archived: false, participants: [{ role: "Architecte", name: profile.name, email: profile.email, phone: profile.phone }], posts: posts.length > 0 ? posts : [{ id: "01", label: "Situation du chantier", notes: "" }], pvHistory: [], actions: [], planImage: null, planMarkers: [], planStrokes: [], documents: [], lots: [], checklists: [], customFields: [], pvTemplate: profile.pvTemplate || "standard", remarkNumbering: profile.remarkNumbering || "none", postTemplate: profile.postTemplate || "general", cahierDesCharges: null }]);
            setActiveId(id);
            track("project_created", { project_name: proj.name, _page: "onboarding" });
          }}
          onComplete={() => {
            setShowOnboarding(false);
            setView("overview");
            // Persist completion on the profile so it can't leak across
            // accounts on the same browser. saveProfile() handles both
            // the local state update and the cloud upsert. Drop the
            // legacy localStorage flag now that the profile is authoritative.
            saveProfile({ ...profile, onboardingCompletedAt: new Date().toISOString() });
            try { localStorage.removeItem("archipilot_onboarding_done"); } catch { /* ignore */ }
            // Start guided tour after a short delay to let the UI render
            setTimeout(() => {
              if (!localStorage.getItem("archipilot_tour_done")) setShowGuidedTour(true);
            }, 600);
          }}
        />
      )}

      {/* Guided tour — shown after onboarding on real UI */}
      {showGuidedTour && (
        <GuidedTour onComplete={() => { setShowGuidedTour(false); try { localStorage.setItem("archipilot_tour_done", "1"); } catch { /* ignore */ } }} />
      )}

      {/* Org invitation & agency management — retirés (POC solo, étage agence CUT). */}

      {/* Chatbot — bouton flottant + modal. Read-only v1, ouvert à tous, persisté localStorage. */}
      <ImportProjectWizard
        open={importWizardOpen}
        onClose={() => setImportWizardOpen(false)}
        profile={profile}
        onImport={importProjectFromFolder}
      />
      {/* FAB IA masqué sur les vues plein écran focalisées (composition PV +
          Mode Chantier) : il chevauchait les footers et l'IA est ailleurs. */}
      {!["notes", "result", "chantier"].includes(view) && <ChatLauncher open={chatOpen} onToggle={toggleChat} isMobile={isMobile} />}
      <ChatModal
        open={chatOpen}
        onClose={closeChat}
        projects={projects}
        profile={profile}
        activeContext={activeContext}
        activeProjectId={activeId}
        prefill={chatPrefill}
        onPrefillConsumed={clearChatPrefill}
        isMobile={isMobile}
      />

      {/* Modal de gestion des phases personnalisées du projet. Ouverte depuis
          le menu phase du header (bouton "Personnaliser…") ou plus tard depuis
          la modal d'édition projet. Le user peut ajouter/supprimer/renommer
          des phases pour adapter le cycle de vie à ce chantier précis. */}
      {(() => {
        const target = phaseManagerProjectId ? projects.find(p => p.id === phaseManagerProjectId) : null;
        if (!target) return null;
        return (
          <PhaseManagerModal
            open={!!phaseManagerProjectId}
            onClose={() => setPhaseManagerProjectId(null)}
            project={target}
            onSave={(updatedProject) => {
              setProjects(prev => prev.map(p => p.id === updatedProject.id ? updatedProject : p));
              showToast("Phases mises à jour");
              track("phases_customized", { _page: "project", phase_count: (updatedProject.phases || []).length });
            }}
          />
        );
      })()}

      {/* Legal pages overlay */}
      {/* Stop session prompt — modal qui force la saisie d'une description avant
          de valider la session. Le timer est en pause pendant l'affichage. */}
      <StopSessionPrompt
        open={!!stopPromptTimer}
        capturedTimer={stopPromptTimer}
        projectName={stopPromptTimer?.projectName}
        projectTasks={(() => {
          // Tâches du projet auquel le timer est rattaché — pas forcément
          // celui actif côté UI, donc on lookup via le timer capturé.
          const tp = stopPromptTimer ? projects.find(p => p.id === stopPromptTimer.projectId) : null;
          return tp?.tasks || [];
        })()}
        onConfirm={confirmStopWithNote}
        onCancel={cancelStopPrompt}
        onDiscard={discardActiveTimer}
      />

      {/* Sessions modal — montée globalement, pilotée par showSessionsModal=projectId */}
      {showSessionsModal !== null && (() => {
        const target = projects.find(p => p.id === showSessionsModal);
        if (!target) return null;
        // Admin/owner d'agence peut voir le breakdown par membre.
        const orgId = activeContext?.startsWith?.("org:") ? activeContext.slice(4) : null;
        const myOrg = orgId ? (myOrgs || []).find(o => o.id === orgId) : null;
        const isOrgAdmin = myOrg && (myOrg._myRole === "owner" || myOrg._myRole === "admin");
        return (
          <SessionsModal
            open={true}
            onClose={() => setShowSessionsModal(null)}
            project={target}
            currentUser={{ id: profile?.id || null, name: profile?.name || null }}
            isOrgAdmin={!!isOrgAdmin}
            onAddManual={(s) => addManualSession(target.id, s)}
            onEdit={(sid, patch) => editSession(target.id, sid, patch)}
            onDelete={(sid) => deleteSession(target.id, sid)}
          />
        );
      })()}

      {legalPage && (
        <div style={{ position: "fixed", inset: 0, zIndex: 10001, background: BG, overflow: "auto" }}>
          <LegalPage page={legalPage} onBack={() => setLegalPage(null)} />
        </div>
      )}

      {/* Global upgrade modal — triggered by feature gates anywhere in the app */}
      {upgradeFeature && (
        <UpgradeRequiredModal
          feature={upgradeFeature}
          message={UPGRADE_MESSAGES[upgradeFeature]}
          currentPlan={profile.plan || "free"}
          requiredPlan={getRequiredPlan(upgradeFeature, profile.plan || "free")}
          onClose={() => setUpgradeFeature(null)}
          onUpgrade={() => { setUpgradeFeature(null); setView("profile"); }}
        />
      )}

    </div>
    </LangContext.Provider>
    </ErrorBoundary>
  );
}
