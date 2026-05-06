import { AC } from "./tokens";

// Outils + palette pour l'annotation des plans dans PlanViewer.
// Anciennement dans src/views/AnnotationEditor.jsx — extrait quand le composant
// AnnotationEditor (annotation des photos) a été abandonné.
export const ANNO_TOOLS = [
  { id: "select", label: "Sélect.",   icon: "cursor"  },
  { id: "arrow",  label: "Flèche",    icon: "arrowr"  },
  { id: "rect",   label: "Rectangle", icon: "rectc"   },
  { id: "circle", label: "Cercle",    icon: "circlec" },
  { id: "pen",    label: "Crayon",    icon: "pen2"    },
  { id: "text",   label: "Texte",     icon: "textT"   },
];

export const ANNO_COLORS = ["#EF4444", "#F97316", AC, "#3B82F6", "#1D1D1B", "#FFFFFF"];
