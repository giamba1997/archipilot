const OFFLINE_QUEUE_KEY = "archipilot_offline_queue";
const OFFLINE_DRAFTS_KEY = "archipilot_pv_drafts";

export function getOfflineQueue() {
  try { return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]"); } catch { return []; }
}
export function addToOfflineQueue(item) {
  const queue = getOfflineQueue();
  queue.push({ ...item, id: Date.now() + Math.random(), createdAt: new Date().toISOString() });
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}
export function clearOfflineQueue() {
  localStorage.setItem(OFFLINE_QUEUE_KEY, "[]");
}

export function getPvDrafts() {
  try { return JSON.parse(localStorage.getItem(OFFLINE_DRAFTS_KEY) || "[]"); } catch { return []; }
}
export function savePvDraft(draft) {
  const drafts = getPvDrafts();
  drafts.push({ ...draft, id: Date.now(), savedAt: new Date().toISOString() });
  localStorage.setItem(OFFLINE_DRAFTS_KEY, JSON.stringify(drafts));
}
export function removePvDraft(draftId) {
  const drafts = getPvDrafts().filter(d => d.id !== draftId);
  localStorage.setItem(OFFLINE_DRAFTS_KEY, JSON.stringify(drafts));
}

// ── F7 — État de synchronisation visible ────────────────────
// Persisté en localStorage à chaque dirty / clean pour que le badge
// puisse refléter "non synchronisé" même après un reload tab offline.
const SYNC_STATE_KEY = "archipilot_sync_state";

export function getSyncState() {
  try {
    return JSON.parse(localStorage.getItem(SYNC_STATE_KEY) || '{"dirty":false,"lastSyncedAt":null,"changedAt":null}');
  } catch {
    return { dirty: false, lastSyncedAt: null, changedAt: null };
  }
}

export function markDirty() {
  const s = getSyncState();
  s.dirty = true;
  s.changedAt = new Date().toISOString();
  try { localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function markSynced() {
  const s = { dirty: false, lastSyncedAt: new Date().toISOString(), changedAt: null };
  try { localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

// ── File de synchro photos ──────────────────────────────────
// Au retour du réseau, les photos de réserves capturées hors-ligne (stockées
// en dataURL base64 dans le projet) sont ré-uploadées vers le storage et
// remplacées par leur URL publique. `uploadFn` (= uploadPhoto) est injecté
// pour garder ce module pur (pas de dépendance Supabase ici).
//
// Garde-fous : on ne touche QUE les chaînes commençant par `data:` ; tout
// échec laisse le dataURL en place (la photo n'est jamais perdue — elle reste
// persistée dans le projet et resynchronisée tel quel). Retourne le nouveau
// tableau de projets si au moins une photo a été migrée, sinon `null` (pas de
// changement → pas de re-render / re-save inutile).
export async function syncReservePhotosToStorage(projects, uploadFn) {
  if (!Array.isArray(projects) || typeof uploadFn !== "function") return null;
  const isData = (ph) => typeof ph === "string" && ph.startsWith("data:");
  const hasData = projects.some(p => (p.reserves || []).some(r => (r.photos || []).some(isData)));
  if (!hasData) return null;
  let changed = false;
  const next = [];
  for (const p of projects) {
    if (!(p.reserves || []).some(r => (r.photos || []).some(isData))) { next.push(p); continue; }
    const reserves = [];
    for (const r of p.reserves) {
      if (!(r.photos || []).some(isData)) { reserves.push(r); continue; }
      const photos = [];
      for (const ph of r.photos) {
        if (isData(ph)) {
          try { const res = await uploadFn(ph); if (res && res.url) { photos.push(res.url); changed = true; continue; } } catch { /* garde le dataURL */ }
        }
        photos.push(ph);
      }
      reserves.push({ ...r, photos });
    }
    next.push({ ...p, reserves });
  }
  return changed ? next : null;
}
