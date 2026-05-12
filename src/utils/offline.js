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
