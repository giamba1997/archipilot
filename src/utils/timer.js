// Time tracking — pure helpers + active timer persistence (localStorage).
//
// Sessions are stored on each project as `project.timeSessions[]` (consistent
// with the rest of the project shape). The "active timer" — the one that's
// currently running across the whole app — lives in localStorage so it
// survives reloads and stays visible on every view.

const ACTIVE_KEY = "archipilot_active_timer";

// Active timer shape:
//   { projectId, projectName, contextKey, segments: [{ startedAt, endedAt | null }] }
// `endedAt = null` on the last segment means it's currently running.
// Pause closes the current segment. Resume opens a new one.

export const getActiveTimer = () => {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const setActiveTimer = (t) => {
  try {
    if (t === null) localStorage.removeItem(ACTIVE_KEY);
    else localStorage.setItem(ACTIVE_KEY, JSON.stringify(t));
  } catch { /* ignore */ }
};

// Sum the duration (in seconds) of an active timer, including any past
// segments. The currently-running segment counts up to `now`.
export const elapsedSeconds = (timer, now = Date.now()) => {
  if (!timer || !Array.isArray(timer.segments)) return 0;
  let total = 0;
  for (const seg of timer.segments) {
    const start = new Date(seg.startedAt).getTime();
    const end = seg.endedAt ? new Date(seg.endedAt).getTime() : now;
    total += Math.max(0, Math.round((end - start) / 1000));
  }
  return total;
};

export const isPaused = (timer) => {
  if (!timer || !timer.segments?.length) return false;
  return timer.segments[timer.segments.length - 1].endedAt !== null;
};

// Format seconds → "1h 23min" (or "23min" if <1h, or "45s" if <1min)
export const formatDuration = (seconds, opts = {}) => {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60 && opts.allowSeconds) return `${s}s`;
  const m = Math.round(s / 60);
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${rem}min`;
  if (rem === 0) return `${h}h`;
  return `${h}h ${String(rem).padStart(2, "0")}min`;
};

// Format seconds → "01:23:45" (HH:MM:SS) for the live timer display.
export const formatTimer = (seconds) => {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

// Convert active-timer segments into a single closed session record. Used
// when the user presses Stop. Returns null if no time was tracked.
export const buildSessionFromTimer = (timer, note = "", user = null) => {
  if (!timer || !timer.segments?.length) return null;
  const total = elapsedSeconds(timer, Date.now());
  if (total <= 0) return null;
  const startedAt = timer.segments[0].startedAt;
  const lastSeg = timer.segments[timer.segments.length - 1];
  const endedAt = lastSeg.endedAt || new Date().toISOString();
  return {
    id: Date.now() + Math.random(),
    startedAt,
    endedAt,
    durationSeconds: total,
    note: note || "",
    isManual: false,
    userId: user?.id || timer.userId || null,
    userName: user?.name || timer.userName || null,
  };
};

// Validate + build a manual session from form input. Accepts either:
//   { date, durationMinutes, note }   → derives startedAt = date 09:00, endedAt = +duration
//   { startedAt, endedAt, note }       → ISO timestamps
// Returns the session record, or throws Error with a French message.
export const buildManualSession = ({ date, durationMinutes, startedAt, endedAt, note, user }) => {
  const userMeta = { userId: user?.id || null, userName: user?.name || null };
  if (durationMinutes !== undefined) {
    const d = parseInt(durationMinutes, 10);
    if (!Number.isFinite(d) || d <= 0) throw new Error("La durée doit être supérieure à 0.");
    if (d > 24 * 60) throw new Error("La durée ne peut pas dépasser 24 heures.");
    const day = new Date(date);
    if (Number.isNaN(day.getTime())) throw new Error("Date invalide.");
    day.setHours(9, 0, 0, 0);
    const end = new Date(day.getTime() + d * 60 * 1000);
    return {
      id: Date.now() + Math.random(),
      startedAt: day.toISOString(),
      endedAt: end.toISOString(),
      durationSeconds: d * 60,
      note: note || "",
      isManual: true,
      ...userMeta,
    };
  }
  if (startedAt && endedAt) {
    const s = new Date(startedAt).getTime();
    const e = new Date(endedAt).getTime();
    if (!Number.isFinite(s) || !Number.isFinite(e)) throw new Error("Heures invalides.");
    if (e <= s) throw new Error("L'heure de fin doit être après l'heure de début.");
    const dur = Math.round((e - s) / 1000);
    if (dur > 24 * 3600) throw new Error("La durée ne peut pas dépasser 24 heures.");
    return {
      id: Date.now() + Math.random(),
      startedAt: new Date(s).toISOString(),
      endedAt: new Date(e).toISOString(),
      durationSeconds: dur,
      note: note || "",
      isManual: true,
      ...userMeta,
    };
  }
  throw new Error("Données de session insuffisantes.");
};

// Group sessions by user for the team admin view. Returns [{ userName,
// userId, sessions, totalSeconds }] sorted by total descending.
export const groupSessionsByUser = (sessions = []) => {
  const map = new Map();
  for (const s of sessions) {
    const key = s.userId || s.userName || "—";
    const existing = map.get(key) || { userId: s.userId || null, userName: s.userName || "Anonyme", sessions: [], totalSeconds: 0 };
    existing.sessions.push(s);
    existing.totalSeconds += s.durationSeconds || 0;
    map.set(key, existing);
  }
  return [...map.values()].sort((a, b) => b.totalSeconds - a.totalSeconds);
};

export const totalSecondsFor = (sessions = []) =>
  sessions.reduce((acc, s) => acc + (s.durationSeconds || 0), 0);
