// ── Mode Chantier — gestion de l'état de visite ──────────────
//
// Une "visite" est une session pendant laquelle l'archi est physiquement
// sur un chantier et collecte des informations (réserves levées,
// nouvelles réserves, photos, décisions, présents). À la fin de la
// visite, ces données composent un brouillon de PV.
//
// Persistance : localStorage. Une seule visite active à la fois (par
// device) — si l'archi tente d'en démarrer une autre alors qu'une est
// en cours, on lui demande quoi faire de l'ancienne.
//
// Design : la visite est un LOG d'actions. Les mutations métier
// (changement statut réserve, création de réserve, upload photo) sont
// appliquées immédiatement à `project.reserves` / `project.gallery` —
// la visite ne sert qu'à reconstituer ce qui s'est passé pour composer
// le PV final. Cette séparation évite le risque de "tout perdre si
// crash" et profite du sync Supabase automatique pour les mutations.

const ACTIVE_VISIT_KEY = "archipilot_active_visit";

// ── Structure d'une visite ──
// {
//   projectId: number,
//   startedAt: ISO string,
//   endedAt: ISO string | null,
//   presents: [{ name, role, present: boolean }],
//   reserveActions: [{ reserveId, action: 'lifted' | 'still_present' | 'created', timestamp }],
//   newReserveIds: [reserveId, ...],   // refs vers project.reserves créées pendant la visite
//   decisions: [{ id, text, timestamp, source: 'text' | 'voice' }],
//   photoIds: [photoId, ...],          // refs vers project.gallery prises pendant la visite
// }

export function getActiveVisit() {
  try {
    const raw = localStorage.getItem(ACTIVE_VISIT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function isVisitActive(projectId) {
  const v = getActiveVisit();
  return v != null && !v.endedAt && String(v.projectId) === String(projectId);
}

export function hasActiveVisitOnOtherProject(projectId) {
  const v = getActiveVisit();
  return v != null && !v.endedAt && String(v.projectId) !== String(projectId);
}

// Démarre une nouvelle visite. Si une visite est déjà active sur un
// AUTRE projet, elle doit être terminée avant — on retourne false sans
// rien faire pour que l'appelant puisse demander quoi faire à l'archi.
export function startVisit(projectId, participants = []) {
  const existing = getActiveVisit();
  if (existing && !existing.endedAt && String(existing.projectId) !== String(projectId)) {
    return null;
  }
  // Si une visite est déjà active sur CE projet, on la reprend telle quelle.
  if (existing && !existing.endedAt && String(existing.projectId) === String(projectId)) {
    return existing;
  }

  const visit = {
    projectId,
    startedAt: new Date().toISOString(),
    endedAt: null,
    presents: participants.map(p => ({ name: p.name, role: p.role, present: true })),
    reserveActions: [],
    newReserveIds: [],
    decisions: [],
    photoIds: [],
  };
  persistVisit(visit);
  return visit;
}

export function persistVisit(visit) {
  if (!visit) return;
  try {
    localStorage.setItem(ACTIVE_VISIT_KEY, JSON.stringify(visit));
  } catch { /* quota — non bloquant */ }
}

export function endVisit() {
  const v = getActiveVisit();
  if (!v) return null;
  v.endedAt = new Date().toISOString();
  persistVisit(v);
  return v;
}

export function clearVisit() {
  try { localStorage.removeItem(ACTIVE_VISIT_KEY); } catch { /* ignore */ }
}

// Helpers de mutation de la visite (immutable-style sur l'objet, puis
// persistance). Renvoient la nouvelle visite pour faciliter le chaînage.

export function togglePresent(visit, name) {
  if (!visit) return visit;
  const next = {
    ...visit,
    presents: visit.presents.map(p => p.name === name ? { ...p, present: !p.present } : p),
  };
  persistVisit(next);
  return next;
}

export function logReserveAction(visit, reserveId, action) {
  if (!visit) return visit;
  // Si une action a déjà été loguée pour cette réserve à cette visite,
  // on remplace (l'archi a changé d'avis). Évite le doublon en fin de visite.
  const filtered = visit.reserveActions.filter(a => String(a.reserveId) !== String(reserveId));
  const next = {
    ...visit,
    reserveActions: [...filtered, { reserveId, action, timestamp: new Date().toISOString() }],
  };
  persistVisit(next);
  return next;
}

export function addNewReserve(visit, reserveId) {
  if (!visit) return visit;
  const next = {
    ...visit,
    newReserveIds: [...visit.newReserveIds, reserveId],
    // On loggue aussi en reserveActions pour avoir une trace temporelle
    reserveActions: [...visit.reserveActions, { reserveId, action: "created", timestamp: new Date().toISOString() }],
  };
  persistVisit(next);
  return next;
}

export function addPhoto(visit, photoId) {
  if (!visit) return visit;
  const next = { ...visit, photoIds: [...visit.photoIds, photoId] };
  persistVisit(next);
  return next;
}

export function addDecision(visit, text, source = "text") {
  if (!visit) return visit;
  if (!text || !text.trim()) return visit;
  const decision = {
    id: `dec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    text: text.trim(),
    timestamp: new Date().toISOString(),
    source,
  };
  const next = { ...visit, decisions: [...visit.decisions, decision] };
  persistVisit(next);
  return next;
}

export function removeDecision(visit, decisionId) {
  if (!visit) return visit;
  const next = { ...visit, decisions: visit.decisions.filter(d => d.id !== decisionId) };
  persistVisit(next);
  return next;
}

// ── Composition du brouillon de PV depuis la visite ──
// Génère le contenu d'un PV à partir des données collectées pendant la
// visite. Utilise les posts du projet pour structurer le rendu. Le PV
// est ensuite sauvegardé via savePvDraft (offline-safe).
//
// Pour les réserves : on fait des sous-listes "Levées", "Toujours
// présentes", "Nouvelles" pour la clarté du compte-rendu.
export function composeDraftPvFromVisit(visit, project) {
  if (!visit || !project) return null;

  const reserves = project.reserves || [];
  const liftedIds = new Set(visit.reserveActions.filter(a => a.action === "lifted").map(a => a.reserveId));
  const stillIds = new Set(visit.reserveActions.filter(a => a.action === "still_present").map(a => a.reserveId));
  const createdIds = new Set(visit.newReserveIds);

  const liftedReserves = reserves.filter(r => liftedIds.has(r.id));
  const stillReserves = reserves.filter(r => stillIds.has(r.id));
  const newReserves = reserves.filter(r => createdIds.has(r.id));

  const startTime = visit.startedAt ? new Date(visit.startedAt) : null;
  const endTime = visit.endedAt ? new Date(visit.endedAt) : new Date();
  const durationMin = startTime ? Math.round((endTime - startTime) / 60000) : 0;
  const dateStr = startTime ? startTime.toLocaleDateString("fr-BE") : new Date().toLocaleDateString("fr-BE");

  // Sections en markdown light (compatible avec le rendu PV existant).
  const sections = [];

  sections.push(`Visite réalisée le ${dateStr} (durée ${durationMin} min).`);
  sections.push("");

  // Présents
  const presents = visit.presents.filter(p => p.present);
  const absents = visit.presents.filter(p => !p.present);
  sections.push("**Présents**");
  if (presents.length > 0) {
    presents.forEach(p => sections.push(`- ${p.role ? `${p.role} : ` : ""}${p.name}`));
  } else {
    sections.push("- (non renseignés)");
  }
  if (absents.length > 0) {
    sections.push("");
    sections.push("**Absents**");
    absents.forEach(p => sections.push(`- ${p.role ? `${p.role} : ` : ""}${p.name}`));
  }
  sections.push("");

  // Décisions et observations
  if (visit.decisions.length > 0) {
    sections.push("**Décisions / Observations**");
    visit.decisions.forEach(d => sections.push(`- ${d.text}`));
    sections.push("");
  }

  // Réserves nouvelles
  if (newReserves.length > 0) {
    sections.push(`**Nouvelles réserves (${newReserves.length})**`);
    newReserves.forEach(r => sections.push(`- ${r.code || "R-?"} · ${r.description}${r.contractor ? ` — ${r.contractor}` : ""}`));
    sections.push("");
  }

  // Réserves levées
  if (liftedReserves.length > 0) {
    sections.push(`**Réserves levées à cette visite (${liftedReserves.length})**`);
    liftedReserves.forEach(r => sections.push(`- ${r.code || "R-?"} · ${r.description}`));
    sections.push("");
  }

  // Réserves toujours présentes
  if (stillReserves.length > 0) {
    sections.push(`**Réserves toujours présentes (${stillReserves.length})**`);
    stillReserves.forEach(r => sections.push(`- ${r.code || "R-?"} · ${r.description}${r.contractor ? ` — ${r.contractor}` : ""}`));
    sections.push("");
  }

  // Photos
  if (visit.photoIds.length > 0) {
    sections.push(`**Photos prises** : ${visit.photoIds.length} (consultables dans la galerie)`);
  }

  return sections.join("\n").trim();
}

// Statistiques live de la visite — affiche un récap "ce qu'il s'est passé"
// pour donner du feedback à l'archi pendant qu'il travaille.
export function getVisitStats(visit) {
  if (!visit) return { duration: 0, lifted: 0, still: 0, created: 0, decisions: 0, photos: 0 };
  const start = visit.startedAt ? new Date(visit.startedAt) : null;
  const duration = start ? Math.floor((Date.now() - start.getTime()) / 60000) : 0;
  return {
    duration,
    lifted: visit.reserveActions.filter(a => a.action === "lifted").length,
    still: visit.reserveActions.filter(a => a.action === "still_present").length,
    created: visit.newReserveIds.length,
    decisions: visit.decisions.length,
    photos: visit.photoIds.length,
  };
}
