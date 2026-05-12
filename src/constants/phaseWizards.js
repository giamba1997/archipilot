// ── Phase Wizards — onboarding contextuel par phase ──────────
//
// À chaque transition de phase d'un projet, on déclenche un wizard
// (modale) qui explique les nouvelles fonctionnalités disponibles. Le
// but : faire découvrir au moment où c'est PERTINENT plutôt que de
// noyer l'utilisateur avec une visite globale au démarrage.
//
// Le contenu est volontairement court (1 intro + 3-5 features max).
// Pas de chemin "Suivant / Précédent" — une seule slide par phase.
// Si une phase mérite vraiment un parcours en étapes, on l'éclatera
// plus tard ; la simplicité d'un seul écran est préférable par défaut.
//
// Mémorisation : les phases déjà vues sont stockées en localStorage
// sous la clé `archipilot_phase_wizards_seen` (array d'ids). Pas de
// migration DB — ce sont des notifications éducatives, leur perte sur
// un nouvel appareil est acceptable.
//
// Convention `cta.action` : chaîne identifiant la destination que
// l'app sait traiter (cf. App.jsx → handlePhaseWizardCta) :
//   "permits" | "quotes" | "planning" | "notes" | "opr" | "journal" | "reports" | null

export const PHASE_WIZARDS = {
  preliminary: {
    title: "Bienvenue en phase Avant-projet",
    intro: "Tu commences à structurer le programme avec ton MO. C'est le moment de cadrer les contraintes (budget, surface, intentions) avant l'esquisse définitive.",
    features: [
      {
        icon: "file",
        title: "Cahier des charges",
        description: "Uploade le CDC du client — l'IA peut l'interroger en langage naturel pour comparer les exigences avec tes fiches techniques.",
      },
      {
        icon: "users",
        title: "Participants",
        description: "Ajoute MO, ingénieurs et coordinateur sécurité — leurs rôles standardisés alimentent les futurs PV et OPR.",
      },
      {
        icon: "edit",
        title: "Description du programme",
        description: "La description sert de contexte permanent au chatbot IA pour t'aider plus pertinemment.",
      },
    ],
    cta: null,
  },

  permit: {
    title: "Bienvenue en phase Permis",
    intro: "Le permis d'urbanisme est l'étape la plus stressante d'un projet — délais légaux, courriers commune, recours possibles. ArchiPilot t'aide à ne rien rater.",
    features: [
      {
        icon: "file",
        title: "Suivi de dossier permis",
        description: "Tracker dépôt, AR, échéance avec calcul automatique selon la procédure (30/75/105/230 jours).",
      },
      {
        icon: "alert",
        title: "Alertes d'échéance",
        description: "Notifications J-30, J-7, J-1 avant la date butoir — silence vaut acceptation / refus selon la procédure.",
      },
      {
        icon: "history",
        title: "Historique des étapes",
        description: "Garde la trace de chaque demande de compléments, chaque décision et chaque document associé.",
      },
    ],
    cta: { label: "Ouvrir le suivi permis", action: "permits" },
  },

  execution: {
    title: "Bienvenue en phase Exécution",
    intro: "Le permis est obtenu (ou en bonne voie), place aux études techniques et à la consultation des entreprises.",
    features: [
      {
        icon: "chart",
        title: "Comparaison de devis IA",
        description: "Upload de PDF de devis → extraction automatique des postes → comparaison matricielle avec mise en évidence des écarts.",
      },
      {
        icon: "gantt",
        title: "Planning et lots",
        description: "Crée les lots de ton chantier (maçonnerie, électricité…) avec dates, contractor et phasage. Vue hiérarchie + Gantt.",
      },
      {
        icon: "file",
        title: "Honoraires par tranches",
        description: "Émets des factures conformes TVA avec numérotation automatique YYYY-NNN, liées aux phases du projet.",
      },
    ],
    cta: { label: "Voir le planning", action: "planning" },
  },

  construction: {
    title: "Bienvenue en phase Chantier",
    intro: "Le chantier démarre. Les fonctionnalités quotidiennes s'activent — PV, journal, photos, suivi des actions et du temps passé.",
    features: [
      {
        icon: "mic",
        title: "PV avec dictée vocale",
        description: "Dicte tes remarques poste par poste via Whisper — l'IA structure et carry-over automatique des réserves non résolues.",
      },
      {
        icon: "history",
        title: "Journal de chantier",
        description: "Pendant légal de tes PV — timeline auto qui agrège PV, photos, OPR et visites libres. Export PDF conforme RGPT à tout moment.",
      },
      {
        icon: "camera",
        title: "Photos et plans annotés",
        description: "Photos géolocalisées sur les plans, annotations directement sur l'image, liens vers les réserves OPR.",
      },
      {
        icon: "listcheck",
        title: "Tâches et actions",
        description: "Convertis les remarques de PV en tâches actionnables avec priorité, échéance et assigné.",
      },
      {
        icon: "sparkle",
        title: "Rapports d'avancement MO",
        description: "Génère un rapport synthétique pour le maître d'ouvrage à partir des PV récents et des photos de la période.",
      },
    ],
    cta: { label: "Commencer un PV", action: "notes" },
  },

  reception: {
    title: "Bienvenue en phase Réception",
    intro: "Tu entres dans la phase la plus critique légalement. ArchiPilot a une fonctionnalité majeure dédiée : l'OPR (Opérations Préalables à Réception).",
    features: [
      {
        icon: "checksq",
        title: "Réserves OPR",
        description: "Liste exhaustive des défauts avec sévérité (critique/majeure/mineure/cosmétique), statut (non levée/partielle/levée) et entreprise responsable.",
      },
      {
        icon: "copy",
        title: "Bibliothèque de modèles",
        description: "52 réserves classiques pré-remplies (joint silicone, peinture éclatée, etc.) — autocomplete dès que tu tapes une description.",
      },
      {
        icon: "send",
        title: "Signatures à distance",
        description: "Génère un PDF d'OPR et envoie un lien sécurisé à chaque signataire — pas besoin que tout le monde soit présent.",
      },
      {
        icon: "bell",
        title: "Notifications temps réel",
        description: "Tu es notifié instantanément quand un signataire signe, refuse ou demande des modifications.",
      },
    ],
    cta: { label: "Ouvrir l'OPR", action: "opr" },
  },

  closed: {
    title: "Projet clôturé",
    intro: "Le projet est terminé. Reste à archiver proprement et à anticiper l'éventuelle réception définitive (J-365 après la provisoire).",
    features: [
      {
        icon: "file",
        title: "Journal de chantier consolidé",
        description: "Exporte un PDF chronologique complet (PV, photos, OPR, réserves) pour archivage légal et éventuel audit Cnac.",
      },
      {
        icon: "alert",
        title: "Réception définitive J-365",
        description: "Une alerte automatique te rappellera 12 mois après l'OPR provisoire de planifier la réception définitive.",
      },
      {
        icon: "archive",
        title: "Archivage",
        description: "Le projet reste accessible en lecture, retiré de la liste principale mais consultable via l'onglet « Archivés ».",
      },
    ],
    cta: { label: "Voir le journal", action: "journal" },
  },
};

// ── Persistance localStorage ────────────────────────────────
// Les phases vues sont stockées en local pour éviter de re-spam
// l'utilisateur. La donnée est légère (array de ~6 strings max) et
// per-device — c'est acceptable pour ce cas d'usage éducatif.

const STORAGE_KEY = "archipilot_phase_wizards_seen";

export function getSeenWizards() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function markWizardSeen(phaseId) {
  try {
    const seen = getSeenWizards();
    if (!seen.includes(phaseId)) {
      seen.push(phaseId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seen));
    }
  } catch { /* quota / disabled — non bloquant */ }
}

export function hasSeenWizard(phaseId) {
  return getSeenWizards().includes(phaseId);
}

// Reset pour debug / re-test — exposé pour pouvoir l'appeler depuis la
// console navigateur si besoin (window.__resetPhaseWizards()).
export function resetSeenWizards() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}
if (typeof window !== "undefined") {
  window.__resetPhaseWizards = resetSeenWizards;
}
