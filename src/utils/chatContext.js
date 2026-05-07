// chatContext — sérialise les data utilisateur en markdown pour le chatbot.
//
// Stratégie : "stuff context with focus".
//   — Tous les projets actifs sont résumés (1 bloc / projet)
//   — Le projet ACTIF (si défini) reçoit en plus :
//       · texte intégral du cahier des charges (cap PV_FULL_CDC_CHARS)
//       · contenu intégral du dernier PV
//       · réserves OPR détaillées
//   — Les autres projets mentionnent l'existence du CdC mais pas son texte
//     (sinon ça explose les tokens — un CdC fait souvent 50 pages)
//
// Cap volumes pour éviter de dépasser le budget tokens du modèle :
import { totalSecondsFor, formatDuration } from "./timer";
import { stripMarkdown } from "./helpers";

const PV_FULL_CDC_CHARS = 30000;   // texte du CdC pour projet actif
const PV_FULL_PV_CHARS  = 8000;    // contenu du dernier PV (pleine longueur)
const PV_EXCERPT_CHARS  = 120;     // excerpts pour PV non-actifs

const startOfWeek = (d = new Date()) => {
  const day = new Date(d);
  const dow = (day.getDay() + 6) % 7; // Monday = 0
  day.setDate(day.getDate() - dow);
  day.setHours(0, 0, 0, 0);
  return day;
};
const startOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);

const fmtList = (xs) => xs.filter(Boolean).join(" · ");

const projectSummary = (p, { detailed = false } = {}) => {
  const lines = [];
  lines.push(`## ${p.name}${detailed ? " (projet actif — celui consulté actuellement)" : ""}`);
  const meta = [];
  if (p.statusId) meta.push(`Phase : ${p.statusId}`);
  if (p.client) meta.push(`Maître d'ouvrage : ${p.client}`);
  if (p.contractor) meta.push(`Entreprise : ${p.contractor}`);
  if (p.city || p.address) meta.push(`Lieu : ${p.city || p.address}`);
  if (p.startDate) meta.push(`Début : ${p.startDate}`);
  if (p.endDate) meta.push(`Fin prévue : ${p.endDate}`);
  if (p.nextMeeting) meta.push(`Prochaine réunion : ${p.nextMeeting}`);
  if (meta.length) lines.push(meta.join("\n"));

  // Actions
  const actions = p.actions || [];
  const open = actions.filter(a => a.open);
  const urgent = open.filter(a => a.urgent);
  const closed = actions.filter(a => !a.open);
  if (actions.length) {
    lines.push(`\n### Actions`);
    lines.push(`${open.length} ouverte${open.length > 1 ? "s" : ""}, dont ${urgent.length} urgente${urgent.length > 1 ? "s" : ""}. ${closed.length} clôturée${closed.length > 1 ? "s" : ""}.`);
    if (urgent.length > 0) {
      lines.push(`Urgentes :`);
      for (const a of urgent.slice(0, 8)) {
        lines.push(`- ${a.text}${a.who ? ` (${a.who})` : ""}${a.since ? ` — depuis ${a.since}` : ""}`);
      }
    }
    const otherOpen = open.filter(a => !a.urgent).slice(0, 8);
    if (otherOpen.length > 0) {
      lines.push(`Autres ouvertes :`);
      for (const a of otherOpen) {
        lines.push(`- ${a.text}${a.who ? ` (${a.who})` : ""}`);
      }
    }
  }

  // Cahier des charges — toujours mentionné (l'IA doit savoir s'il existe).
  // Le texte intégral n'est inclus QUE pour le projet actif (sinon explosion
  // tokens — un CdC fait souvent 50+ pages).
  const cdc = p.cahierDesCharges || null;
  if (cdc) {
    lines.push(`\n### Cahier des charges`);
    lines.push(`Document : ${cdc.fileName || "cahier des charges"}${cdc.uploadedAt ? ` (uploadé le ${new Date(cdc.uploadedAt).toLocaleDateString("fr-BE")})` : ""}.`);
    if (detailed && cdc.extractedText) {
      const txt = String(cdc.extractedText).slice(0, PV_FULL_CDC_CHARS);
      lines.push(`Texte intégral du cahier des charges :\n"""\n${txt}\n"""`);
      if (cdc.extractedText.length > PV_FULL_CDC_CHARS) {
        lines.push(`(Texte tronqué — ${cdc.extractedText.length - PV_FULL_CDC_CHARS} caractères supplémentaires non inclus.)`);
      }
    } else if (cdc.extractedText) {
      lines.push(`Le texte est disponible mais non inclus ici (volumineux). Si une question porte sur ce cahier des charges, dis-le et je le fournirai dans une prochaine requête.`);
    } else {
      lines.push(`(Texte non extrait — peut-être un PDF scanné non OCR.)`);
    }
  }

  // PV history (en plain text condensé pour les autres, full content pour
  // le dernier PV du projet actif)
  const pvs = p.pvHistory || [];
  if (pvs.length) {
    lines.push(`\n### PV (${pvs.length} au total)`);
    if (detailed && pvs[0]) {
      const last = pvs[0];
      const status = last.status || "draft";
      lines.push(`Dernier PV (n°${last.number}, ${status}, ${last.date})${last.author ? ` par ${last.author}` : ""} — contenu intégral :`);
      const body = stripMarkdown(last.content || last.excerpt || "").slice(0, PV_FULL_PV_CHARS);
      lines.push(`"""\n${body}\n"""`);
      // Liste compacte des PV plus anciens
      const olderShown = pvs.slice(1, 5);
      if (olderShown.length) {
        lines.push(`PV antérieurs :`);
        for (const pv of olderShown) {
          const st = pv.status || "draft";
          const ex = stripMarkdown(pv.excerpt || "").slice(0, PV_EXCERPT_CHARS);
          lines.push(`- PV n°${pv.number} (${st}) — ${pv.date}${ex ? ` : ${ex}` : ""}`);
        }
      }
      if (pvs.length > 5) lines.push(`… ${pvs.length - 5} PV plus anciens non détaillés`);
    } else {
      for (const pv of pvs.slice(0, 5)) {
        const status = pv.status || "draft";
        const excerpt = stripMarkdown(pv.excerpt || "").slice(0, PV_EXCERPT_CHARS);
        lines.push(`- PV n°${pv.number} (${status}) — ${pv.date}${excerpt ? ` : ${excerpt}` : ""}`);
      }
      if (pvs.length > 5) lines.push(`… ${pvs.length - 5} PV plus anciens non détaillés`);
    }
  }

  // Réserves (OPR) — détaillées si projet actif, juste comptées sinon
  const reserves = p.reserves || [];
  if (reserves.length) {
    const open = reserves.filter(r => r.status !== "levee");
    lines.push(`\n### Réserves (OPR)`);
    lines.push(`${reserves.length} au total, ${open.length} non levées.`);
    if (detailed) {
      for (const r of reserves.slice(0, 15)) {
        const st = r.status || "non_levee";
        const sev = r.severity || "minor";
        lines.push(`- [${sev}/${st}] ${r.text || r.label || "—"}${r.location ? ` (${r.location})` : ""}`);
      }
      if (reserves.length > 15) lines.push(`… ${reserves.length - 15} autres réserves non détaillées`);
    }
  }

  // Module checklists supprimé — bloc retiré du contexte chat.

  // Lots / phases techniques
  const lots = p.lots || [];
  if (lots.length) {
    lines.push(`\n### Lots`);
    for (const lot of lots.slice(0, 12)) {
      const dates = lot.startDate || lot.endDate
        ? ` (${lot.startDate || "?"} → ${lot.endDate || "?"})`
        : "";
      lines.push(`- ${lot.name}${dates}${lot.contractor ? ` — ${lot.contractor}` : ""}${typeof lot.progress === "number" ? ` — ${lot.progress}%` : ""}`);
    }
  }

  // Postes & remarques (juste les compteurs, contenu trop verbeux)
  const posts = p.posts || [];
  const totalRemarks = posts.reduce((s, post) => s + ((post.remarks || []).length), 0);
  const openRemarks = posts.reduce((s, post) =>
    s + ((post.remarks || []).filter(r => r.status === "open").length), 0);
  if (totalRemarks > 0) {
    lines.push(`\n### Remarques sur visite en cours`);
    lines.push(`${totalRemarks} remarques (${openRemarks} ouvertes) sur ${posts.length} poste${posts.length > 1 ? "s" : ""}.`);
  }

  // Time tracking — agrégé par périodes
  const sessions = p.timeSessions || [];
  if (sessions.length) {
    const now = new Date();
    const weekStart = startOfWeek(now);
    const monthStart = startOfMonth(now);
    const inWeek = sessions.filter(s => new Date(s.startedAt) >= weekStart);
    const inMonth = sessions.filter(s => new Date(s.startedAt) >= monthStart);
    lines.push(`\n### Temps passé`);
    lines.push(fmtList([
      `Total ${formatDuration(totalSecondsFor(sessions))}`,
      `Ce mois ${formatDuration(totalSecondsFor(inMonth))}`,
      `Cette semaine ${formatDuration(totalSecondsFor(inWeek))}`,
      `${sessions.length} session${sessions.length > 1 ? "s" : ""}`,
    ]));
  }

  // Participants externes
  const parts = p.participants || [];
  if (parts.length) {
    lines.push(`\n### Participants`);
    lines.push(parts.map(pp => `${pp.role} ${pp.name}`).join(", "));
  }

  return lines.join("\n");
};

export const buildChatContext = ({ projects = [], profile = null, activeContext = null, activeProjectId = null } = {}) => {
  const active = projects.filter(p => !p.archived);
  const archived = projects.filter(p => p.archived);
  const activeProject = activeProjectId != null ? active.find(p => p.id === activeProjectId) : null;

  const blocks = [];

  // En-tête utilisateur
  const header = [];
  if (profile?.name) header.push(`Utilisateur : ${profile.name}`);
  if (profile?.structure) header.push(`Structure : ${profile.structure}`);
  if (activeContext) header.push(`Espace de travail : ${activeContext === "personal" ? "personnel" : `agence (${activeContext})`}`);
  header.push(`Date : ${new Date().toLocaleDateString("fr-BE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`);
  blocks.push(`# Contexte utilisateur\n${header.join("\n")}`);

  // Synthèse cross-projets
  if (active.length === 0) {
    blocks.push(`# Projets\nL'utilisateur n'a aucun projet actif pour le moment.`);
  } else {
    const totalActions = active.reduce((s, p) => s + ((p.actions || []).filter(a => a.open).length), 0);
    const totalUrgent = active.reduce((s, p) => s + ((p.actions || []).filter(a => a.open && a.urgent).length), 0);
    const totalPvs = active.reduce((s, p) => s + ((p.pvHistory || []).length), 0);
    const totalSessions = active.reduce((s, p) => s + ((p.timeSessions || []).length), 0);
    const totalSecondsAll = active.reduce((s, p) => s + totalSecondsFor(p.timeSessions || []), 0);
    blocks.push(`# Synthèse globale\n${active.length} projet${active.length > 1 ? "s actifs" : " actif"}${archived.length ? `, ${archived.length} archivé${archived.length > 1 ? "s" : ""}` : ""}.\n${totalActions} actions ouvertes (dont ${totalUrgent} urgentes), ${totalPvs} PV au total.\n${totalSessions} sessions de temps enregistrées · ${formatDuration(totalSecondsAll) || "0min"} cumulées.`);
  }

  // Projet actif d'abord (en détail), puis les autres en synthèse.
  // Si pas de projet actif (vue globale type Vue d'ensemble), tous en
  // synthèse simple — l'utilisateur peut basculer sur un projet pour
  // approfondir.
  if (activeProject) {
    blocks.push(`# Projet en cours de consultation`);
    blocks.push(projectSummary(activeProject, { detailed: true }));
    const others = active.filter(p => p.id !== activeProject.id);
    if (others.length > 0) {
      blocks.push(`# Autres projets actifs`);
      for (const p of others) {
        blocks.push(projectSummary(p));
      }
    }
  } else if (active.length > 0) {
    blocks.push(`# Projets actifs`);
    for (const p of active) {
      blocks.push(projectSummary(p));
    }
  }

  // Archivés (juste la liste)
  if (archived.length > 0) {
    blocks.push(`# Projets archivés (référence seulement)\n${archived.map(p => `- ${p.name}${p.client ? ` (${p.client})` : ""}`).join("\n")}`);
  }

  return blocks.join("\n\n---\n\n");
};
