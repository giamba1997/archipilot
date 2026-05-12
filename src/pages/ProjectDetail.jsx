import { useState } from "react";
import { tokens } from "../design/tokens";
import { Button } from "../components/ui/v2/Button";
import { Badge } from "../components/ui/v2/Badge";
import { Card } from "../components/ui/v2/Card";
import { Tabs } from "../components/ui/v2/Tabs";
import { IconButton } from "../components/ui/v2/IconButton";

// ── ProjectDetail (v2) ─────────────────────────────────────
//
// Refonte de la page projet. Se rend à l'intérieur du layout existant
// (sidebar + topbar inchangées dans App.jsx). Cohabite avec la version
// historique `src/views/Overview.jsx` — accessible via la route /p/:id.
//
// État de ce premier jet :
//   ✓ Onglet Résumé construit en détail
//   ✗ Autres onglets (Fiche, Actions, Planning, PV, Documents, Photos)
//     affichent un placeholder — leur contenu sera porté dans des
//     prompts ultérieurs avec les nouveaux atomes.
//
// Le contenu fictif est intégré au composant pour permettre une
// validation visuelle isolée. Pour wirer un vrai projet, passer
// `project` en prop — le mock sert de fallback.

// ─────────────────────────────────────────────────────────────
// SVG inline — pas de lucide-react ni autre lib (cf. brief).
// Convention : 24×24, strokeWidth 1.5, currentColor, fill none.
// ─────────────────────────────────────────────────────────────

const Svg = ({ children, size = 24 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const Icons = {
  // Document avec un coin replié — métaphore facture / PV
  file:     ({ size }) => <Svg size={size}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></Svg>,
  // Barres montantes — métaphore analytics / comparaison de devis
  chart:    ({ size }) => <Svg size={size}><line x1="6"  y1="20" x2="6"  y2="13" /><line x1="12" y1="20" x2="12" y2="4"  /><line x1="18" y1="20" x2="18" y2="9"  /></Svg>,
  // Horloge — métaphore chronologie / journal
  clock:    ({ size }) => <Svg size={size}><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 16 14" /></Svg>,
  // Triangle d'alerte — métaphore réserve / vigilance
  alert:    ({ size }) => <Svg size={size}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></Svg>,
  // Flèche droite — chevron d'action sur une card
  chevronR: ({ size }) => <Svg size={size}><polyline points="9 18 15 12 9 6" /></Svg>,
  // Étincelle — bloc À faire (action centrale)
  sparkle:  ({ size }) => <Svg size={size}><path d="M12 3v3M12 18v3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M3 12h3M18 12h3M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /></Svg>,
  // Crayon d'édition — "Compléter les informations"
  edit:     ({ size }) => <Svg size={size}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z" /></Svg>,
  // Calendrier — bloc prochaine réunion
  calendar: ({ size }) => <Svg size={size}><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></Svg>,
  // 3 points horizontaux — menu kebab pour actions secondaires
  more:     ({ size }) => <Svg size={size}><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></Svg>,
  // Triangle play — démarrage suivi du temps
  play:     ({ size }) => <Svg size={size}><polygon points="6 4 20 12 6 20 6 4" /></Svg>,
  // Croix — fermeture / suppression
  close:    ({ size }) => <Svg size={size}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></Svg>,
};

// ─────────────────────────────────────────────────────────────
// Données fictives — alignées sur le brief.
// Sert de preview tant que le wiring sur l'état réel n'est pas fait.
// ─────────────────────────────────────────────────────────────

const MOCK_PROJECT = {
  name: "SNCB",
  status: "Clôturé",
  address: "Rue Neuve Cour 80, 1480 Tubize",
  updatedAt: "07/05/2026",
  nextMeeting: {
    date: "09/05/2026",
    overdueDays: 3,
    type: "Sur site",
    recurrence: "Ponctuel",
  },
  todo: {
    type: "now",
    title: "Préparer le PV n°11",
    subtitle: "À partir du dernier PV validé et des éléments du projet.",
  },
  modules: [
    { id: "billing",  title: "Honoraires & facturation", subtitle: "Émettre une facture conforme TVA · numérotation auto", iconKey: "file",  action: "Ouvrir" },
    { id: "quotes",   title: "Devis & soumissions",      subtitle: "Upload + extraction IA + comparaison automatique",   iconKey: "chart", action: "Ouvrir" },
    { id: "journal",  title: "Journal de chantier",      subtitle: "17 entrées chronologiques",                            iconKey: "clock", action: "Ouvrir" },
    { id: "reserves", title: "Réserves OPR",             subtitle: "0/2 levées",                                           iconKey: "alert", action: "Gérer"  },
  ],
  tabs: [
    { id: "summary",  label: "Résumé" },
    { id: "sheet",    label: "Fiche" },
    { id: "actions",  label: "Actions",   count: 0, showZero: true },
    { id: "planning", label: "Planning",  count: 3 },
    { id: "pv",       label: "PV",        count: 10 },
    { id: "docs",     label: "Documents", count: 2 },
    { id: "photos",   label: "Photos",    count: 1 },
  ],
  timeTracking: { totalMinutes: 0, sessionCount: 7 },
};

// ─────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────

export function ProjectDetail({ project = MOCK_PROJECT }) {
  const [activeTab, setActiveTab] = useState("summary");

  return (
    <div
      style={{
        display: "flex",
        gap: tokens.space[5],
        alignItems: "flex-start",
        maxWidth: 1280,
        margin: "0 auto",
        fontFamily: tokens.font.family,
        color: tokens.color.neutral[900],
      }}
    >
      {/* ── Colonne principale (flex 1) ── */}
      <main style={{ flex: 1, minWidth: 0 }}>
        <ProjectHeader project={project} />
        <Tabs items={project.tabs} activeId={activeTab} onChange={setActiveTab} />

        {/* Le seul onglet construit en détail pour ce jet est "Résumé".
            Les autres sont des placeholders explicites — l'utilisateur
            sait qu'ils existent mais que le contenu sera porté plus tard. */}
        {activeTab === "summary" && <SummaryTab project={project} />}
        {activeTab !== "summary" && <TabPlaceholder label={project.tabs.find(t => t.id === activeTab)?.label} />}
      </main>

      {/* ── Panneau droit (320px fixe) ── */}
      <aside
        style={{
          width: 320,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: tokens.space[3],
        }}
      >
        <NextMeetingPanel meeting={project.nextMeeting} />
        <TimeTrackingPanel tracking={project.timeTracking} />
      </aside>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sous-composants
// ─────────────────────────────────────────────────────────────

// Header projet : titre, badges, adresse + date de MAJ, lien "Compléter"
function ProjectHeader({ project }) {
  return (
    <header style={{ marginBottom: tokens.space[5] }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: tokens.space[3],
          marginBottom: tokens.space[2],
          flexWrap: "wrap",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: tokens.font.size["2xl"],
            fontWeight: tokens.font.weight.bold,
            lineHeight: tokens.font.leading.tight,
            color: tokens.color.neutral[900],
            letterSpacing: "-0.5px",
          }}
        >
          {project.name}
        </h1>

        {/* Statut projet — neutral parce que "Clôturé" est un état
            terminal sans urgence. Si la phase devient "Esquisse", on
            passe en info ; "En retard" → warning ou danger. */}
        <Badge variant="neutral">{project.status}</Badge>

        {/* Échéance dépassée — warning (ambre), pas terracotta.
            On dérive le libellé du nombre de jours pour rester
            humain (3 jours = "Passée 3j"). */}
        {project.nextMeeting?.overdueDays > 0 && (
          <Badge variant="warning" dot>
            Passée {project.nextMeeting.overdueDays}j
          </Badge>
        )}
      </div>

      {/* Métadonnées sur une ligne, séparées par un point médian. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: tokens.space[2],
          fontSize: tokens.font.size.sm,
          color: tokens.color.neutral[500],
          marginBottom: tokens.space[2],
        }}
      >
        <span>{project.address}</span>
        <span aria-hidden="true">·</span>
        <span>MAJ {project.updatedAt}</span>
      </div>

      {/* Lien discret pour compléter — texte neutral.700 + souligné au
          hover (géré via state interne pour rester en CSS-in-JS). */}
      <CompleteLink />
    </header>
  );
}

function CompleteLink() {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: tokens.space[1],
        padding: 0,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        color: tokens.color.neutral[700],
        fontSize: tokens.font.size.sm,
        fontWeight: tokens.font.weight.medium,
        fontFamily: tokens.font.family,
        textDecoration: hover ? "underline" : "none",
        textUnderlineOffset: 3,
      }}
    >
      <span style={{ display: "inline-flex" }}>
        <Icons.edit size={14} />
      </span>
      Compléter les informations
    </button>
  );
}

// Onglet Résumé : bloc "À faire" + cards de modules. C'est le seul
// onglet où `brand.500` apparaît (sur le CTA "À faire").
function SummaryTab({ project }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: tokens.space[3] }}>
      <TodoCard todo={project.todo} />
      {project.modules.map(m => (
        <ModuleCard key={m.id} module={m} />
      ))}
    </div>
  );
}

// Bloc "À faire maintenant" — le seul CTA primaire visible de la page.
// Card légèrement tintée (brand.50) pour signaler l'importance sans
// crier. Bouton primaire `brand.500` qui contient l'action principale.
function TodoCard({ todo }) {
  if (!todo) return null;
  return (
    <Card
      padding={4}
      style={{
        background: tokens.color.brand[50],
        border: `1px solid ${tokens.color.brand[200]}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: tokens.space[3] }}>
        {/* Carré d'icône à gauche — brand.500 plein parce qu'on est dans
            le contexte exclusif du CTA primaire de la page. */}
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: tokens.radius.md,
            background: tokens.color.brand[500],
            color: tokens.color.neutral[0],
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icons.sparkle size={20} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: tokens.font.size.xs,
              fontWeight: tokens.font.weight.semibold,
              color: tokens.color.brand[700],
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 2,
            }}
          >
            À faire maintenant
          </div>
          <div
            style={{
              fontSize: tokens.font.size.md,
              fontWeight: tokens.font.weight.semibold,
              color: tokens.color.neutral[900],
              marginBottom: 2,
            }}
          >
            {todo.title}
          </div>
          <div
            style={{
              fontSize: tokens.font.size.sm,
              color: tokens.color.neutral[700],
              lineHeight: tokens.font.leading.normal,
            }}
          >
            {todo.subtitle}
          </div>
        </div>

        <Button
          variant="primary"
          size="md"
          rightIcon={<Icons.chevronR size={16} />}
          onClick={() => { /* hook à venir : déclenche la création du PV */ }}
        >
          Démarrer
        </Button>
      </div>
    </Card>
  );
}

// Card module — clickable, ouvre la sous-vue correspondante.
// Toute la card est interactive (Card variant="interactive") pour
// élargir la zone de clic ; le bouton "Ouvrir" reste visible pour
// renforcer l'affordance.
function ModuleCard({ module: m }) {
  const IconComp = Icons[m.iconKey] || Icons.file;
  return (
    <Card
      onClick={() => { /* hook à venir : navigation vers la sous-vue */ }}
      ariaLabel={`${m.title} — ${m.action}`}
      padding={4}
    >
      <div style={{ display: "flex", alignItems: "center", gap: tokens.space[3] }}>
        {/* Bloc d'icône neutre — 40×40, fond neutral.100, icône en
            neutral.500. C'est volontairement sobre : chaque module ne
            cherche PAS à se distinguer par la couleur (vu dans le diag
            UX précédent — la palette arc-en-ciel fatiguait l'œil). */}
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: tokens.radius.md,
            background: tokens.color.neutral[100],
            color: tokens.color.neutral[500],
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <IconComp size={20} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: tokens.font.size.md,
              fontWeight: tokens.font.weight.semibold,
              color: tokens.color.neutral[900],
              marginBottom: 2,
            }}
          >
            {m.title}
          </div>
          <div
            style={{
              fontSize: tokens.font.size.sm,
              color: tokens.color.neutral[500],
              lineHeight: tokens.font.leading.normal,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {m.subtitle}
          </div>
        </div>

        {/* Bouton secondaire — fond blanc, bordure neutral.200. Ne PAS
            mettre en primaire, sinon on duplique le signal "à faire"
            de la TodoCard et on dilue l'identité. */}
        <Button
          variant="secondary"
          size="sm"
          rightIcon={<Icons.chevronR size={14} />}
          onClick={(e) => { e.stopPropagation(); /* hook à venir */ }}
        >
          {m.action}
        </Button>
      </div>
    </Card>
  );
}

// Placeholder pour les onglets non encore portés. Évite que l'archi
// tombe sur une zone vide silencieuse — message explicite.
function TabPlaceholder({ label }) {
  return (
    <div
      style={{
        padding: tokens.space[8],
        background: tokens.color.neutral[50],
        border: `1px dashed ${tokens.color.neutral[200]}`,
        borderRadius: tokens.radius.lg,
        textAlign: "center",
        color: tokens.color.neutral[500],
        fontSize: tokens.font.size.sm,
        lineHeight: tokens.font.leading.relaxed,
      }}
    >
      <div style={{ fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[700], marginBottom: tokens.space[1] }}>
        Onglet « {label || "—"} »
      </div>
      Cet onglet sera construit dans un prompt ultérieur avec les nouveaux composants atomiques.
    </div>
  );
}

// Panneau droit — Prochaine réunion. Fond neutral.100, pas brand.
// UN seul bouton "Modifier" visible ; les actions Cal/.ics passent
// dans un menu kebab (atome IconButton + popover à venir).
function NextMeetingPanel({ meeting }) {
  if (!meeting) return null;
  return (
    <Card padding={4} style={{ background: tokens.color.neutral[100] }}>
      {/* En-tête du panneau */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: tokens.space[2],
          marginBottom: tokens.space[3],
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: tokens.space[2],
            fontSize: tokens.font.size.xs,
            fontWeight: tokens.font.weight.semibold,
            color: tokens.color.neutral[500],
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          <Icons.calendar size={14} />
          Prochaine réunion
        </div>
        <IconButton
          variant="ghost"
          size="sm"
          label="Plus d'actions (calendrier, .ics)"
          onClick={() => { /* hook à venir : popover Cal / .ics */ }}
        >
          <Icons.more size={14} />
        </IconButton>
      </div>

      {/* Date en grand, suivie du badge overdue éventuel. */}
      <div
        style={{
          fontSize: tokens.font.size.xl,
          fontWeight: tokens.font.weight.semibold,
          color: tokens.color.neutral[900],
          lineHeight: tokens.font.leading.tight,
          marginBottom: tokens.space[1],
        }}
      >
        {meeting.date}
      </div>

      {meeting.overdueDays > 0 && (
        <div
          style={{
            fontSize: tokens.font.size.sm,
            color: tokens.color.semantic.warning.fg,
            fontWeight: tokens.font.weight.medium,
            marginBottom: tokens.space[3],
          }}
        >
          Passée ({meeting.overdueDays}j)
        </div>
      )}

      {/* Métadonnées : type + récurrence. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          fontSize: tokens.font.size.sm,
          color: tokens.color.neutral[700],
          marginBottom: tokens.space[3],
        }}
      >
        <div>
          <span style={{ color: tokens.color.neutral[500] }}>Type :</span> {meeting.type}
        </div>
        <div>
          <span style={{ color: tokens.color.neutral[500] }}>Récurrence :</span> {meeting.recurrence}
        </div>
      </div>

      <Button variant="secondary" size="sm" fullWidth>
        Modifier
      </Button>
    </Card>
  );
}

// Panneau Suivi du temps — démarrage de la session courante.
// Le bouton "Démarrer" est secondary (pas primary) : il y a déjà
// un primary visible (TodoCard "Démarrer"), on ne duplique pas.
function TimeTrackingPanel({ tracking }) {
  if (!tracking) return null;
  const { totalMinutes = 0, sessionCount = 0 } = tracking;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const formatted = totalMinutes === 0 ? "0 min" : hours > 0 ? `${hours}h${mins > 0 ? mins.toString().padStart(2, "0") : ""}` : `${mins} min`;

  return (
    <Card padding={4} style={{ background: tokens.color.neutral[100] }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: tokens.space[2],
          fontSize: tokens.font.size.xs,
          fontWeight: tokens.font.weight.semibold,
          color: tokens.color.neutral[500],
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: tokens.space[3],
        }}
      >
        <Icons.clock size={14} />
        Suivi du temps
      </div>

      <div
        style={{
          fontSize: tokens.font.size.xl,
          fontWeight: tokens.font.weight.semibold,
          color: tokens.color.neutral[900],
          lineHeight: tokens.font.leading.tight,
          marginBottom: tokens.space[1],
        }}
      >
        {formatted}
      </div>
      <div
        style={{
          fontSize: tokens.font.size.sm,
          color: tokens.color.neutral[500],
          marginBottom: tokens.space[3],
        }}
      >
        {sessionCount} session{sessionCount > 1 ? "s" : ""} enregistrée{sessionCount > 1 ? "s" : ""}
      </div>

      <Button
        variant="secondary"
        size="sm"
        fullWidth
        leftIcon={<Icons.play size={12} />}
        onClick={() => { /* hook à venir : démarre une session de tracking */ }}
      >
        Démarrer une session
      </Button>
    </Card>
  );
}

export default ProjectDetail;
