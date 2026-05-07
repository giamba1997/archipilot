// Modèles de projet — point de départ structuré pour la création.
//
// Principe : un modèle pré-remplit les champs *existants* du formulaire
// (postTemplate, pvTemplate, recurrence, participants…) et complète le projet
// créé avec des lots/checklists/customFields typés métier. L'utilisateur garde
// la main sur tout — un modèle est une *suggestion*, jamais une contrainte.
//
// Référence : POST_TEMPLATES (postes du cahier des charges) reste la source
// de vérité pour la liste des postes ; un modèle de projet est un *bundle*
// qui complète avec lots, participants types, custom fields, etc.

export const PROJECT_TEMPLATES = [
  // ── Modèle "Vide" ────────────────────────────────────────
  // Conserve le flow actuel : formulaire vierge avec les défauts du profil.
  // Toujours en première position pour ne pas forcer le choix d'un modèle.
  {
    id: "blank",
    label: "Vide",
    description: "Formulaire vierge — je configure tout moi-même.",
    icon: "file",
    postTemplate: null,           // null = utilise le défaut du profil
    pvTemplate: null,
    remarkNumbering: null,
    recurrence: null,
    participantsRoles: [],
    defaultLots: [],
    customFields: [],
    expectedReserves: [],
  },

  // ── Rénovation (résidentiel + tertiaire) ─────────────────
  {
    id: "renovation_be",
    label: "Rénovation",
    description: "Rénovation lourde — démolition partielle, gros œuvre, parachèvements, techniques.",
    icon: "edit",
    postTemplate: "renovation",
    pvTemplate: "standard",
    remarkNumbering: "post-seq",
    recurrence: "weekly",
    participantsRoles: [
      { role: "MO" },
      { role: "Architecte" },
      { role: "Entreprise" },
      { role: "Coordinateur sécurité-santé" },
      { role: "Ingénieur stabilité" },
    ],
    defaultLots: [
      { name: "Démolition",        color: "amber",  duration: "10", progress: 0 },
      { name: "Gros œuvre",        color: "blue",   duration: "25", progress: 0 },
      { name: "Toiture",           color: "violet", duration: "12", progress: 0 },
      { name: "Châssis & vitrages", color: "teal",   duration: "10", progress: 0 },
      { name: "Techniques (HVAC/élec/sani)", color: "green",  duration: "20", progress: 0 },
      { name: "Parachèvements",    color: "red",    duration: "20", progress: 0 },
    ],
    customFields: [
      { id: "permis", label: "N° permis d'urbanisme", value: "" },
      { id: "cadastre", label: "Référence cadastrale", value: "" },
    ],
    expectedReserves: [
      "Resserrages coupe-feu",
      "Étanchéité raccords toiture / châssis",
      "Conformité PEB",
      "Acoustique cloisons (si logement collectif)",
    ],
  },

  // ── Construction neuve ───────────────────────────────────
  {
    id: "newbuild_be",
    label: "Construction neuve",
    description: "Construction depuis le terrassement — fondations, gros œuvre, enveloppe, finitions.",
    icon: "building",
    postTemplate: "newbuild",
    pvTemplate: "standard",
    remarkNumbering: "post-seq",
    recurrence: "weekly",
    participantsRoles: [
      { role: "MO" },
      { role: "Architecte" },
      { role: "Entreprise gros œuvre" },
      { role: "Coordinateur sécurité-santé" },
      { role: "Ingénieur stabilité" },
      { role: "Bureau PEB" },
      { role: "Géomètre" },
    ],
    defaultLots: [
      { name: "Terrassement",      color: "amber",  duration: "8",  progress: 0 },
      { name: "Fondations",        color: "blue",   duration: "12", progress: 0 },
      { name: "Gros œuvre",        color: "violet", duration: "40", progress: 0 },
      { name: "Toiture & étanchéité", color: "teal",   duration: "15", progress: 0 },
      { name: "Façades",           color: "green",  duration: "20", progress: 0 },
      { name: "Châssis & vitrages", color: "red",    duration: "12", progress: 0 },
      { name: "Techniques",        color: "amber",  duration: "30", progress: 0 },
      { name: "Parachèvements",    color: "blue",   duration: "30", progress: 0 },
      { name: "Abords",            color: "green",  duration: "10", progress: 0 },
    ],
    customFields: [
      { id: "permis", label: "N° permis d'urbanisme", value: "" },
      { id: "cadastre", label: "Référence cadastrale", value: "" },
      { id: "peb", label: "Référence PEB", value: "" },
    ],
    expectedReserves: [
      "Implantation conforme aux plans",
      "Étanchéité fondations / cuvelage",
      "Performances PEB atteintes",
      "Acoustique entre logements",
      "Sécurité incendie compartiments",
    ],
  },

  // ── Aménagement intérieur (tertiaire / résidentiel) ──────
  {
    id: "interior_be",
    label: "Aménagement intérieur",
    description: "Aménagement bureau, commerce ou habitation — cloisons, sols, plafonds, éclairage.",
    icon: "edit",
    postTemplate: "interior",
    pvTemplate: "standard",
    remarkNumbering: "sequential",
    recurrence: "biweekly",
    participantsRoles: [
      { role: "MO" },
      { role: "Architecte" },
      { role: "Entreprise" },
    ],
    defaultLots: [
      { name: "Démolition légère", color: "amber",  duration: "5",  progress: 0 },
      { name: "Cloisons",          color: "blue",   duration: "10", progress: 0 },
      { name: "Faux-plafonds",     color: "violet", duration: "8",  progress: 0 },
      { name: "Sols",              color: "teal",   duration: "8",  progress: 0 },
      { name: "Peinture",          color: "green",  duration: "10", progress: 0 },
      { name: "Électricité & éclairage", color: "red", duration: "12", progress: 0 },
      { name: "HVAC",              color: "amber",  duration: "10", progress: 0 },
      { name: "Mobilier fixe",     color: "blue",   duration: "8",  progress: 0 },
    ],
    customFields: [],
    expectedReserves: [
      "Alignement cloisons / faux-plafonds",
      "Niveaux et planéité des sols",
      "Joints peinture",
      "Conformité électrique (RGIE)",
    ],
  },
];

export const getProjectTemplate = (id) =>
  PROJECT_TEMPLATES.find(t => t.id === id) || PROJECT_TEMPLATES[0];
