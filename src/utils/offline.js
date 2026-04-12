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
