import { create } from "zustand";
import { loadProjects as dbLoadProjects, saveProjects as dbSaveProjects } from "../db";
import { track } from "../db";
import { formatAddress } from "../utils/address";
import { POST_TEMPLATES } from "../constants/templates";

let saveTimer = null;

const useProjectStore = create((set, get) => ({
  projects: (() => { try { const s = localStorage.getItem("archipilot_projects"); return s ? JSON.parse(s) : []; } catch { return []; } })(),
  activeId: (() => { try { const s = localStorage.getItem("archipilot_activeId"); return s ? Number(s) || 1 : 1; } catch { return 1; } })(),
  dbLoaded: false,

  // Derived
  get project() {
    const { projects, activeId } = get();
    return projects.find(p => p.id === activeId);
  },

  setProjects: (updater) => {
    set(state => ({
      projects: typeof updater === "function" ? updater(state.projects) : updater,
    }));
  },

  setActiveId: (id) => set({ activeId: id }),

  updateProject: (id, updates) => {
    set(state => ({
      projects: state.projects.map(p => p.id === id ? { ...p, ...updates } : p),
    }));
  },

  createProject: (newP, profile) => {
    const { projects } = get();
    const id = Math.max(...projects.map(p => p.id), 0) + 1;
    const address = formatAddress(newP);
    const tpl = POST_TEMPLATES.find(t => t.id === newP.postTemplate) || POST_TEMPLATES[0];
    const posts = tpl.posts.map(p => ({ id: p.id, label: p.label, notes: "", remarks: [] }));
    set(state => ({
      projects: [...state.projects, {
        id, ...newP, address, progress: 0, bureau: profile.structure,
        endDate: "", nextMeeting: "", archived: false,
        participants: [{ role: "Architecte", name: profile.name, email: profile.email, phone: profile.phone }],
        posts: posts.length > 0 ? posts : [{ id: "01", label: "Situation du chantier", notes: "" }],
        pvHistory: [], actions: [], planImage: null, planMarkers: [], planStrokes: [],
        documents: [], lots: [], checklists: [], customFields: [],
      }],
      activeId: id,
    }));
    track("project_created", { project_name: newP.name, _page: "overview" });
    return id;
  },

  duplicateProject: (projectId) => {
    const { projects } = get();
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    const id = Math.max(...projects.map(p => p.id), 0) + 1;
    set(state => ({
      projects: [...state.projects, {
        ...project, id, name: project.name + " (copie)",
        pvHistory: [], actions: [],
        posts: project.posts.map(po => ({ ...po, notes: "", photos: [] })),
        archived: false, planImage: null, planMarkers: [], planStrokes: [],
        documents: [], lots: [], checklists: [],
      }],
      activeId: id,
    }));
  },

  // Load from Supabase
  loadFromDB: async () => {
    try {
      const [cloudData, cloudProfile] = await Promise.all([
        dbLoadProjects().catch(e => { console.error("loadProjects failed:", e); return null; }),
      ]);
      if (cloudData?.[0]) {
        const data = cloudData[0];
        if (data.projects?.length > 0) set({ projects: data.projects });
        if (data.activeId) set({ activeId: data.activeId });
      }
    } catch (e) { console.error("Project load error:", e); }
    set({ dbLoaded: true });
  },

  // Persist to localStorage + Supabase (debounced)
  persist: () => {
    const { projects, activeId, dbLoaded } = get();
    if (!dbLoaded) return;
    try { localStorage.setItem("archipilot_projects", JSON.stringify(projects)); } catch { /* ignore */ }
    try { localStorage.setItem("archipilot_activeId", String(activeId)); } catch { /* ignore */ }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => dbSaveProjects(projects, activeId), 1500);
  },
}));

// Auto-persist on state changes
useProjectStore.subscribe(
  (state) => ({ projects: state.projects, activeId: state.activeId, dbLoaded: state.dbLoaded }),
  () => useProjectStore.getState().persist(),
  { equalityFn: (a, b) => a.projects === b.projects && a.activeId === b.activeId }
);

export default useProjectStore;
