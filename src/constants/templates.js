import { BL, BLB, GR, GRBG, GRY, GRYB, RD, REDBG } from "./tokens";

export const RECURRENCES = [
  { id: "none", label: "Ponctuel (pas de récurrence)", days: 0 },
  { id: "2x_week", label: "2x par semaine", days: 3 },
  { id: "3x_week", label: "3x par semaine", days: 2 },
  { id: "weekly", label: "1x par semaine", days: 7 },
  { id: "biweekly", label: "1x / 2 semaines", days: 14 },
  { id: "monthly", label: "1x par mois", days: 30 },
  { id: "6weeks", label: "1x / 6 semaines", days: 42 },
];

// ── Post Templates by project type ──────────────────────────
export const POST_TEMPLATES = [
  {
    id: "general",
    label: "Réunion de chantier (standard)",
    icon: "building",
    posts: [
      { id: "01", label: "Situation du chantier" }, { id: "02", label: "Généralités" },
      { id: "03", label: "Planning" },
    ],
  },
  {
    id: "renovation",
    label: "Rénovation",
    icon: "edit",
    posts: [
      { id: "01", label: "Situation du chantier" }, { id: "02", label: "Généralités" },
      { id: "03", label: "Planning" }, { id: "10", label: "Démolition" },
      { id: "20", label: "Gros œuvre" }, { id: "30", label: "Toiture" },
      { id: "40", label: "Menuiseries extérieures" }, { id: "50", label: "Parachèvements" },
      { id: "60", label: "HVAC" }, { id: "70", label: "Électricité" },
      { id: "80", label: "Sanitaire" },
    ],
  },
  {
    id: "newbuild",
    label: "Construction neuve",
    icon: "building",
    posts: [
      { id: "01", label: "Situation du chantier" }, { id: "02", label: "Généralités" },
      { id: "03", label: "Planning" }, { id: "10", label: "Terrassement" },
      { id: "20", label: "Fondations" }, { id: "21", label: "Gros œuvre" },
      { id: "30", label: "Toiture & étanchéité" }, { id: "35", label: "Façades" },
      { id: "40", label: "Châssis & vitrages" }, { id: "45", label: "Portes intérieures" },
      { id: "50", label: "Chapes & sols" }, { id: "55", label: "Peinture & finitions" },
      { id: "60", label: "HVAC" }, { id: "65", label: "Électricité" },
      { id: "70", label: "Sanitaire" }, { id: "80", label: "Abords" },
    ],
  },
  {
    id: "interior",
    label: "Aménagement intérieur",
    icon: "edit",
    posts: [
      { id: "01", label: "Situation du chantier" }, { id: "02", label: "Généralités" },
      { id: "03", label: "Planning" }, { id: "10", label: "Cloisons" },
      { id: "20", label: "Faux-plafonds" }, { id: "30", label: "Menuiseries intérieures" },
      { id: "40", label: "Revêtements sols" }, { id: "50", label: "Peinture" },
      { id: "60", label: "Mobilier fixe" }, { id: "70", label: "Électricité & éclairage" },
      { id: "80", label: "HVAC & ventilation" },
    ],
  },
  {
    id: "public",
    label: "Bâtiment public / tertiaire",
    icon: "building",
    posts: [
      { id: "01", label: "Situation du chantier" }, { id: "02", label: "Généralités" },
      { id: "03", label: "Planning" }, { id: "04", label: "Documents & conformité" },
      { id: "10", label: "Gros œuvre" }, { id: "20", label: "Façades & isolation" },
      { id: "30", label: "Toiture" }, { id: "40", label: "Menuiseries" },
      { id: "50", label: "Parachèvements" }, { id: "60", label: "HVAC" },
      { id: "65", label: "Électricité HT/BT" }, { id: "70", label: "Sanitaire" },
      { id: "75", label: "Détection incendie" }, { id: "80", label: "Ascenseurs" },
      { id: "90", label: "Abords & signalétique" },
    ],
  },
  {
    id: "custom",
    label: "Personnalisé (vide)",
    icon: "plus",
    posts: [],
  },
];

// ── PV Structure Templates ──────────────────────────────────
export const PV_TEMPLATES = [
  {
    id: "standard",
    label: "Standard (belge)",
    desc: "3ème personne, factuel, terminologie belge",
    prompt: "Tu es un assistant pour rédiger des PV de chantier pour architectes belges. Notes en PV professionnel. 3ème personne, factuel. '- ' points, '> ' importants. 'Le MO demande...', 'Il est demandé de...'. Terminologie belge. Garde la numérotation. Max 1200 mots. Corps uniquement.",
  },
  {
    id: "detailed",
    label: "Détaillé",
    desc: "Plus long, avec actions et échéances",
    prompt: "Tu es un assistant pour rédiger des PV de chantier détaillés pour architectes belges. Notes en PV professionnel. 3ème personne, factuel. '- ' pour les constats, '> ' pour les points urgents. Ajoute des ACTIONS REQUISES à la fin de chaque section avec responsable et échéance. Terminologie belge. Garde la numérotation. Max 2000 mots. Corps uniquement.",
  },
  {
    id: "concise",
    label: "Concis",
    desc: "Court et synthétique, points clés uniquement",
    prompt: "Tu es un assistant pour rédiger des PV de chantier concis pour architectes belges. Notes en PV synthétique. 3ème personne, factuel. Seulement les points essentiels. '- ' pour les points, '> ' pour les urgences. Max 600 mots. Corps uniquement.",
  },
  {
    id: "french",
    label: "Français (France)",
    desc: "Terminologie française, vouvoiement",
    prompt: "Tu es un assistant pour rédiger des comptes-rendus de chantier pour architectes français. Notes en CR professionnel. 3ème personne, factuel, vouvoiement. '- ' pour les observations, '> ' pour les points importants. Terminologie française. Garde la numérotation. Max 1200 mots. Corps uniquement.",
  },
];

// ── Remark Numbering Modes ──────────────────────────────────
export const REMARK_NUMBERING = [
  { id: "none", label: "Sans numérotation" },
  { id: "sequential", label: "Séquentielle (1, 2, 3...)" },
  { id: "post-seq", label: "Par poste (01.1, 01.2, 02.1...)" },
  { id: "global", label: "Globale continue (1, 2, ... tous postes)" },
];

// Module checklists supprimé. Les "tâches à vérifier" sont remplacées par
// le système Tasks (project.tasks[]) avec statuts/priorités/parents.
