// ── Rôles standardisés pour les intervenants d'un chantier (Belgique) ──
//
// Sert de suggestions dans le datalist du formulaire Participants — l'archi
// peut toujours saisir un rôle libre, le datalist ne ferme pas la liste.
//
// Conventions :
// - Les 3 rôles principaux gardent leur forme courte ("MO", "Architecte",
//   "Entreprise") car le code filtre déjà par ces libellés exacts (OprView
//   exclut les "Architecte" des contractors ; InvoicesView pré-remplit
//   client_name avec p.role === "MO"). Changer leur forme casserait ces
//   filtres + désynchroniserait les données existantes.
// - Les rôles spécialisés utilisent leur forme complète pour être clairs
//   sans glossaire (un nouvel utilisateur comprend "Coordinateur sécurité-
//   santé" mieux qu'une abréviation).
//
// Ordre logique : MOA → MOE → Exécution → support. Permet à l'archi de
// scroller la datalist du haut vers le bas dans l'ordre métier naturel.

export const PARTICIPANT_ROLES = [
  // Maîtrise d'ouvrage
  "MO",
  "Promoteur",
  // Maîtrise d'œuvre
  "Architecte",
  "Bureau d'études",
  "Ingénieur stabilité",
  "Ingénieur PEB",
  "Ingénieur techniques",
  "Géomètre-expert",
  "Contrôleur technique",
  // Exécution
  "Entreprise",
  "Sous-traitant",
  "Coordinateur sécurité-santé",
];

// Groupé par catégorie — utile pour un futur picker visuel (modale sheet
// mobile par exemple). Non utilisé en v1 mais préparé pour réutilisation.
export const PARTICIPANT_ROLE_GROUPS = [
  {
    label: "Maîtrise d'ouvrage",
    roles: ["MO", "Promoteur"],
  },
  {
    label: "Maîtrise d'œuvre",
    roles: ["Architecte", "Bureau d'études", "Ingénieur stabilité", "Ingénieur PEB", "Ingénieur techniques", "Géomètre-expert", "Contrôleur technique"],
  },
  {
    label: "Exécution",
    roles: ["Entreprise", "Sous-traitant", "Coordinateur sécurité-santé"],
  },
];

// Helper : détecte si un rôle saisi correspond exactement à un rôle standard.
// Pratique pour afficher un badge "standard" vs "libre" dans une future UI.
export const isStandardRole = (role) =>
  !!role && PARTICIPANT_ROLES.includes(role.trim());
