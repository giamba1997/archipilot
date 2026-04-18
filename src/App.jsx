import { useState, useRef, useEffect, useMemo, Component } from "react";
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#FAFAF9", fontFamily: "'Inter', system-ui, sans-serif" }}>
          <div style={{ textAlign: "center", maxWidth: 400, padding: 32 }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#C4392A" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4 M12 17h.01 M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /></svg>
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1D1D1B", marginBottom: 8 }}>Quelque chose s'est mal passé</h2>
            <p style={{ fontSize: 13, color: "#6B6B66", lineHeight: 1.6, marginBottom: 24 }}>
              Une erreur inattendue est survenue. Vos données sont en sécurité. Rechargez la page pour continuer.
            </p>
            <button onClick={() => window.location.reload()} style={{ padding: "10px 24px", border: "none", borderRadius: 8, background: "#C95A1B", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
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

import { AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, BG, WH, RD, GR, SP, FS, LH, RAD, BL, BLB, OR, ORB, VI, VIB, TE, TEB, PU, PUB, GRY, GRYB, REDBG, REDBRD, GRBG, DIS, DIST } from "./constants/tokens";
import { STATUSES, getStatus, REMARK_STATUSES, nextStatus, getRemarkStatus, PV_STATUSES, getPvStatus, nextPvStatus, LOT_COLORS, calcLotStatus } from "./constants/statuses";
import { RECURRENCES, POST_TEMPLATES, PV_TEMPLATES, REMARK_NUMBERING, CHECKLIST_TEMPLATES } from "./constants/templates";
import { STRUCTURE_TYPES, PLANS, PLAN_FEATURES, hasFeature, getLimit, INIT_PROFILE, COLOR_PRESETS, FONT_OPTIONS, DOC_CATEGORIES } from "./constants/config";

import { getOfflineQueue, addToOfflineQueue, clearOfflineQueue, getPvDrafts, savePvDraft, removePvDraft } from "./utils/offline";
import { relativeDate, parseDateFR, formatDateFR, calcNextMeeting, daysUntil } from "./utils/dates";
import { formatAddress, parseAddress } from "./utils/address";
import { parseNotesToRemarks, getDocCurrent } from "./utils/helpers";
import { generatePDF } from "./utils/pdf";
import { downloadCSV, exportProjectsCSV, exportActionsCSV, exportRemarksCSV, exportParticipantsCSV, importParticipantsCSV, generateICS, downloadICS, getGoogleCalendarUrl } from "./utils/csv";
import { Ico, Skeleton, PB, Modal, Field, StatusBadge, PvStatusBadge, KpiCard } from "./components/ui";

// ── Extracted Components ──────────────────────────────────────
import { MobileBottomBar, CaptureSheet, Sidebar } from "./components/layout";
import { CollabModalWrapper, UpgradeGate, PricingSection, SendPvModal, SearchModal, isReadOnly, canEdit, canManageMembers, canManageSettings, getProjectRole } from "./components/modals";
import { OnboardingWizard } from "./components/modals/OnboardingWizard";
import { GuidedTour } from "./components/modals/GuidedTour";
import { WeatherWidget, MeetingCard, MEETING_MODES, PvRow, SmallBtn, Overview, AnnotationEditor, ANNO_TOOLS, ANNO_COLORS, NoteEditor, StatsView, PlanningDashboard, ResultView, DocumentsView, CropTool, GallerySheet, GalleryView, PlanManager, PdfCropBridge, PlanViewer, PlanningView, PDFPreview, MfaSection, ProfileView, ChecklistsView, LegalPage, CookieBanner, LegalLinks } from "./views";

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
  const [projects, setProjects] = useState(() => { try { const s = localStorage.getItem("archipilot_projects"); return s ? JSON.parse(s) : []; } catch { return []; } });
  const [activeId, setActiveId] = useState(() => { try { const s = localStorage.getItem("archipilot_activeId"); return s ? Number(s) || 1 : 1; } catch { return 1; } });
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
  const [legalPage, setLegalPage] = useState(null); // "privacy" | "terms" | null
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showGuidedTour, setShowGuidedTour] = useState(false);
  const [toast, setToast] = useState(null);
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
        if (cloudProfile) {
          setProfile(cloudProfile);
        }
        // Show onboarding for new users who haven't completed it yet
        if (!localStorage.getItem("archipilot_onboarding_done")) {
          const isNewUser = !cloudProfile || !cloudProfile.name || !cloudProfile.structure;
          if (isNewUser) setShowOnboarding(true);
        }
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

  // Loading screen only if no cached data (first use)
  if (!dbLoaded && projects.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: BG, fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <img src="/icon-512.png" alt="ArchiPilot" style={{ width: 42, height: 42, margin: "0 auto 12px" }} />
          <div style={{ fontSize: 15, fontWeight: 800, color: "#4A3428", marginBottom: 8, fontFamily: "'Manrope', 'Inter', sans-serif", textTransform: "uppercase", letterSpacing: "0.5px" }}>ArchiPilot</div>
          <div style={{ width: 20, height: 20, border: `2.5px solid ${SBB}`, borderTopColor: AC, borderRadius: "50%", animation: "sp 0.6s linear infinite", margin: "0 auto" }} />
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
    <LangContext.Provider value={profile.lang || "fr"}>
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", display: "flex", minHeight: "100vh", background: BG }}>
      {/* Skip to content link (accessibility) */}
      <a href="#main-content" style={{
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
        .method-card-dictate:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(201,90,27,0.18); }
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
      <nav className="ap-sidebar-desktop" role="navigation" aria-label="Menu principal">
        <Sidebar projects={projects} activeId={activeId} view={view} onSelect={(id) => { setActiveId(id); setView("overview"); }} open={sidebarOpen} onClose={() => setSidebarOpen(false)} profile={profile} onNewProject={() => setModal("new")} onProfile={() => { setView("profile"); }} installable={!!installPrompt} onInstall={handleInstall} sharedProjects={sharedProjects} onSelectShared={(p) => { setActiveId(p.id); setView("overview"); }} onStats={() => { setView("stats"); }} onPlanning={() => { setView("planningDashboard"); }} />
      </nav>

      {/* Sidebar overlay for tablet/mobile */}
      {sidebarOpen && <div className="ap-sidebar-overlay open" onClick={() => setSidebarOpen(false)} />}

      <main id="main-content" className="ap-main" role="main" style={{ marginLeft: sidebarOpen ? 264 : 0, flex: 1, transition: "margin-left 0.25s", minWidth: 0 }}>
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
      </main>

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
              if (error) throw new Error(error.message);
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
                    <div style={{ padding: 20, background: SB, borderRadius: 10, fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13, lineHeight: 1.9, whiteSpace: "pre-wrap", color: TX, maxHeight: "55vh", overflowY: "auto", border: `1px solid ${SBB}` }}>{modalData.content}</div>
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

      {/* Onboarding wizard for new users */}
      {showOnboarding && (
        <OnboardingWizard
          profile={profile}
          onUpdateProfile={(p) => { setProfile(p); saveProfile(p); }}
          onCreateProject={(proj) => {
            const id = Math.max(...projects.map((p) => p.id), 0) + 1;
            const tpl = POST_TEMPLATES.find(t => t.id === (profile.postTemplate || "general")) || POST_TEMPLATES[0];
            const posts = tpl.posts.map(p => ({ id: p.id, label: p.label, notes: "", remarks: [] }));
            const address = [proj.city].filter(Boolean).join(", ");
            setProjects((prev) => [...prev, { id, name: proj.name, client: proj.client || "", contractor: proj.contractor || "", address, city: proj.city || "", startDate: proj.startDate || "", endDate: proj.endDate || "", progress: 0, bureau: profile.structure, statusId: "sketch", recurrence: "none", archived: false, participants: [{ role: "Architecte", name: profile.name, email: profile.email, phone: profile.phone }], posts: posts.length > 0 ? posts : [{ id: "01", label: "Situation du chantier", notes: "" }], pvHistory: [], actions: [], planImage: null, planMarkers: [], planStrokes: [], documents: [], lots: [], checklists: [], customFields: [], pvTemplate: profile.pvTemplate || "standard", remarkNumbering: profile.remarkNumbering || "none", postTemplate: profile.postTemplate || "general" }]);
            setActiveId(id);
            track("project_created", { project_name: proj.name, _page: "onboarding" });
          }}
          onComplete={() => {
            setShowOnboarding(false);
            setView("overview");
            try { localStorage.setItem("archipilot_onboarding_done", "1"); } catch {}
            // Start guided tour after a short delay to let the UI render
            setTimeout(() => {
              if (!localStorage.getItem("archipilot_tour_done")) setShowGuidedTour(true);
            }, 600);
          }}
        />
      )}

      {/* Guided tour — shown after onboarding on real UI */}
      {showGuidedTour && (
        <GuidedTour onComplete={() => { setShowGuidedTour(false); try { localStorage.setItem("archipilot_tour_done", "1"); } catch {} }} />
      )}

      {/* Cookie consent banner — only show after onboarding & tour are done */}
      {!showOnboarding && !showGuidedTour && <CookieBanner />}

      {/* Legal pages overlay */}
      {legalPage && (
        <div style={{ position: "fixed", inset: 0, zIndex: 10001, background: BG, overflow: "auto" }}>
          <LegalPage page={legalPage} onBack={() => setLegalPage(null)} />
        </div>
      )}

    </div>
    </LangContext.Provider>
    </ErrorBoundary>
  );
}
