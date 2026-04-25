import { useState, useEffect, useCallback } from "react";
import {
  loadProjects as dbLoadProjects,
  saveProjects as dbSaveProjects,
  loadOrgProjects,
  saveOrgProjects,
  loadMyOrganizations,
} from "../db";

const CTX_KEY = "archipilot_active_context";
const cacheKey = (ctx) => `archipilot_projects:${ctx}`;
const activeIdKey = (ctx) => `archipilot_activeId:${ctx}`;

/**
 * Workspace context — owns the "personal" vs "org:<id>" state, the
 * projects/activeId tied to that context, and the cloud sync routing.
 *
 * Returns enough surface for App.jsx to drive the rest of the UI:
 *   activeContext, switchContext, myOrgs, refreshMyOrgs, contextLoading
 *   projects, setProjects, activeId, setActiveId
 *   dbLoaded — true once the initial cloud load has completed
 *   isOrgContextStale(orgsList) — checks if the persisted org context
 *     no longer maps to a current membership; returns true when the
 *     caller should fall back to "personal".
 *
 * The hook does NOT do its own initial load — App.jsx still owns that
 * to coordinate with profile + invite token + onboarding flags. The
 * caller calls setDbLoaded(true) once the initial load completes;
 * after that the save effect persists every change.
 */
export function useWorkspaceContext() {
  const [activeContext, setActiveContext] = useState(() => {
    try { return localStorage.getItem(CTX_KEY) || "personal"; }
    catch { return "personal"; }
  });
  const [projects, setProjects] = useState(() => {
    try {
      const ctx = localStorage.getItem(CTX_KEY) || "personal";
      const s = localStorage.getItem(cacheKey(ctx));
      return s ? JSON.parse(s) : [];
    } catch { return []; }
  });
  const [activeId, setActiveId] = useState(() => {
    try {
      const ctx = localStorage.getItem(CTX_KEY) || "personal";
      const s = localStorage.getItem(activeIdKey(ctx));
      return s ? Number(s) || 1 : 1;
    } catch { return 1; }
  });
  const [dbLoaded, setDbLoaded] = useState(false);
  const [myOrgs, setMyOrgs] = useState([]);
  const [contextLoading, setContextLoading] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);

  // Save effect — routes to user_data or organization_data based on context.
  useEffect(() => {
    if (!dbLoaded || contextLoading) return;
    const lite = JSON.stringify(projects, (key, value) => {
      if (key === "dataUrl") return undefined;
      // Drop heavy inline base64 (Supabase is authoritative anyway).
      if (typeof value === "string" && value.length > 2000 && value.startsWith("data:")) return undefined;
      return value;
    });
    try {
      localStorage.setItem(cacheKey(activeContext), lite);
    } catch {
      try { localStorage.removeItem(cacheKey(activeContext)); } catch { /* ignore */ }
      setStorageWarning(true);
      setTimeout(() => setStorageWarning(false), 5000);
    }
    try { localStorage.setItem(activeIdKey(activeContext), String(activeId)); } catch { /* ignore */ }
    if (activeContext === "personal") {
      dbSaveProjects(projects, activeId);
    } else {
      saveOrgProjects(activeContext.slice(4), projects, activeId);
    }
  }, [projects, activeId, dbLoaded, activeContext, contextLoading]);

  const refreshMyOrgs = useCallback(
    () => loadMyOrganizations().then(setMyOrgs).catch(() => {}),
    [],
  );

  const switchContext = useCallback(async (newContext) => {
    if (newContext === activeContext || contextLoading) return;
    setContextLoading(true);
    try {
      const data = newContext === "personal"
        ? await dbLoadProjects()
        : await loadOrgProjects(newContext.slice(4));
      setProjects(data?.projects || []);
      setActiveId(data?.activeId || (data?.projects?.[0]?.id ?? 1));
      setActiveContext(newContext);
      try { localStorage.setItem(CTX_KEY, newContext); } catch { /* ignore */ }
    } catch (e) {
      console.error("Context switch error:", e);
    } finally {
      setContextLoading(false);
    }
  }, [activeContext, contextLoading]);

  // Falls back to "personal" if the current org context isn't in the list
  // (kicked, deleted, etc.). Caller invokes this once orgs are loaded.
  const validateOrgContext = useCallback((orgsList) => {
    if (!activeContext.startsWith("org:")) return;
    const orgId = activeContext.slice(4);
    const stillMember = (orgsList || []).some(o => o.id === orgId);
    if (!stillMember) {
      setActiveContext("personal");
      try { localStorage.setItem(CTX_KEY, "personal"); } catch { /* ignore */ }
    }
  }, [activeContext]);

  return {
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
  };
}
