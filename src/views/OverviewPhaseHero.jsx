import { useState, useEffect, useMemo } from "react";
import {
  AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, RD, GR,
  AM, AMB, ST, STB, BR, BRB, SG, SGB,
  E_PERMIT_BG, E_TX_TAUPE2, E_GRAPHITE_BG, E_TX_DARK,
} from "../constants/tokens";
import { getProjectPhase } from "../utils/phases";
import { getReserveStatus, getReserveSeverity } from "../constants/statuses";
import { Ico } from "../components/ui";
import { loadPermits } from "../db";
import { isEnabled } from "../constants/featureFlags";

// ── OverviewPhaseHero — hero adaptatif par phase du projet ──
//
// Le Résumé du projet est aujourd'hui une liste plate de cards qui
// ne reflète pas l'enjeu spécifique à la phase courante. Ce composant
// rend visible "ce qui compte maintenant" en grand, en tête du Résumé.
//
// 6 variants — un par phase métier (l'Esquisse et l'Avant-projet
// partagent le même variant "program" car le job-to-be-done est
// similaire à ce stade) :
//
//   sketch + preliminary → "Définir le programme"
//   permit               → Suivi du dossier permis
//   execution            → Planning des lots
//   construction         → Tâches à faire maintenant
//   reception            → OPR Summary (réserves)
//   closed               → Projet clôturé + journal d'archivage
//
// Pour éviter les doublons visuels, l'appelant doit masquer les
// éléments dont le contenu est repris par le hero (cf. Overview.jsx).

const PHASE_HERO_VARIANT = {
  sketch:        "program",
  preliminary:   "program",
  permit:        "permit",
  execution:     "planning",
  construction:  "tasks",
  reception:     "opr",
  closed:        "closed",
};

export function OverviewPhaseHero({
  project,
  onAskAiAboutCdc,
  onEditParticipants,
  onPermits,
  onViewPlanning,
  onStartNotes,
  onOpr,
  onJournal,
  onArchive,
  onEditInfo,
  onChantierVisit,
}) {
  let variant = PHASE_HERO_VARIANT[project.statusId];
  if (!variant) return null;

  // POC : les heroes liés à des features différées (permit/planning/opr)
  // retombent sur le TasksHero générique (CTA PV + visite, toujours actifs).
  if (variant === "permit" && !isEnabled("permits")) variant = "tasks";
  if (variant === "planning" && !isEnabled("planning")) variant = "tasks";
  if (variant === "opr" && !isEnabled("opr")) variant = "tasks";

  switch (variant) {
    case "program":  return <ProgramHero project={project} onAskAiAboutCdc={onAskAiAboutCdc} onEditParticipants={onEditParticipants} onEditInfo={onEditInfo} />;
    case "permit":   return <PermitHero project={project} onPermits={onPermits} />;
    case "planning": return <PlanningHero project={project} onViewPlanning={onViewPlanning} />;
    case "tasks":    return <TasksHero project={project} onStartNotes={onStartNotes} onChantierVisit={onChantierVisit} />;
    case "opr":      return <OprHero project={project} onOpr={onOpr} onChantierVisit={onChantierVisit} />;
    case "closed":   return <ClosedHero project={project} onJournal={onJournal} onArchive={onArchive} />;
    default:         return null;
  }
}

// ── Wrapper visuel commun à tous les heroes ──
// Card élargie, accent terracotta léger, padding généreux pour signaler
// que c'est l'élément principal de la page. La couleur de la bordure
// peut être surchargée par chaque variant pour signaler une sévérité.
function HeroCard({ accentColor = AC, accentBg = ACL, children }) {
  return (
    <div
      style={{
        background: WH,
        border: `1px solid ${accentBg}`,
        borderLeft: `4px solid ${accentColor}`,
        borderRadius: 12,
        padding: "16px 18px",
        marginBottom: 14,
      }}
    >
      {children}
    </div>
  );
}

function HeroLabel({ phase }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: phase.color }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: phase.color, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Phase {phase.label}
      </span>
    </div>
  );
}

// ─── 1. Program Hero (Esquisse + Avant-projet) ──────────────
// Job-to-be-done : démarrer en posant les bases (CDC + participants).
// CTA dépendent de ce qui est déjà fait :
//   - Pas de CDC → "Importer un cahier des charges"
//   - Pas de MO renseigné → "Renseigner les participants"
//   - Sinon → "Cadrer les premières esquisses" (action douce)
function ProgramHero({ project, onAskAiAboutCdc, onEditParticipants, onEditInfo }) {
  const phase = getProjectPhase(project, project.statusId);
  const hasCdc = !!project.cahierDesCharges;
  const hasMo = !!project.client?.trim();
  const hasParticipants = (project.participants || []).length > 0;

  // Détermine quel CTA mettre en avant — un seul primary visible.
  let primaryAction = null;
  if (!hasCdc) {
    primaryAction = { label: "Importer le cahier des charges", onClick: () => {
      // Pas de prop dédiée — l'archi va dans la Fiche pour upload.
      // L'objectif : signaler que c'est l'action principale, le clic
      // ouvre l'édition du projet où le CDC est accessible.
      onEditInfo?.();
    } };
  } else if (!hasMo) {
    primaryAction = { label: "Renseigner les participants", onClick: onEditParticipants };
  } else if (!hasParticipants) {
    primaryAction = { label: "Ajouter ingénieurs et coordinateur", onClick: onEditParticipants };
  } else {
    primaryAction = { label: "Interroger l'IA sur le programme", onClick: () => onAskAiAboutCdc?.(project, "summary") };
  }

  return (
    <HeroCard accentColor={phase.color} accentBg={phase.bg}>
      <HeroLabel phase={phase} />
      <div style={{ fontSize: 17, fontWeight: 800, color: TX, marginBottom: 4, lineHeight: 1.25 }}>
        Définir le programme
      </div>
      <div style={{ fontSize: 12, color: TX2, lineHeight: 1.5, marginBottom: 14 }}>
        À cette phase, ArchiPilot t'aide à cadrer les besoins du MO. Importe le cahier des charges pour activer l'analyse IA, et renseigne les participants pour préparer les futurs PV.
      </div>

      {/* Checklist de complétion rapide */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
        <ChecklistRow done={hasCdc}              label="Cahier des charges importé" />
        <ChecklistRow done={hasMo}               label="Maître d'ouvrage renseigné" />
        <ChecklistRow done={hasParticipants}     label="Participants ajoutés (au moins l'archi)" />
      </div>

      <button
        onClick={primaryAction.onClick}
        style={{
          padding: "10px 16px", border: "none", borderRadius: 9,
          background: AC, color: "#fff",
          fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          display: "inline-flex", alignItems: "center", gap: 6,
        }}
      >
        {primaryAction.label}
        <Ico name="arrowr" size={12} color="#fff" />
      </button>
    </HeroCard>
  );
}

function ChecklistRow({ done, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: done ? GR : TX3 }}>
      <div style={{
        width: 16, height: 16, borderRadius: 4,
        background: done ? GR : "transparent",
        border: `1.5px solid ${done ? GR : SBB}`,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        {done && <Ico name="check" size={9} color="#fff" />}
      </div>
      <span style={{ textDecoration: done ? "line-through" : "none", color: done ? GR : TX2 }}>{label}</span>
    </div>
  );
}

// ─── 2. Permit Hero (Phase Permis) ──────────────────────────
// Job-to-be-done : suivre l'échéance légale du dossier permis.
// Charge le permit actif depuis la DB (le projet peut avoir plusieurs
// permis liés ; on prend le plus récent non finalisé).
function PermitHero({ project, onPermits }) {
  const phase = getProjectPhase(project, project.statusId);
  const [permits, setPermits] = useState(null);

  useEffect(() => {
    let cancelled = false;
    loadPermits({ projectId: project.id })
      .then(rows => { if (!cancelled) setPermits(rows); })
      .catch(() => { if (!cancelled) setPermits([]); });
    return () => { cancelled = true; };
  }, [project.id]);

  // Si aucun permit n'est encore créé, on guide l'archi à en créer un.
  if (permits === null) {
    return (
      <HeroCard accentColor={phase.color} accentBg={phase.bg}>
        <HeroLabel phase={phase} />
        <div style={{ fontSize: 17, fontWeight: 800, color: TX, marginBottom: 4 }}>Chargement du dossier permis…</div>
      </HeroCard>
    );
  }

  if (permits.length === 0) {
    return (
      <HeroCard accentColor={phase.color} accentBg={phase.bg}>
        <HeroLabel phase={phase} />
        <div style={{ fontSize: 17, fontWeight: 800, color: TX, marginBottom: 4 }}>Ouvre ton dossier permis</div>
        <div style={{ fontSize: 12, color: TX2, lineHeight: 1.5, marginBottom: 14 }}>
          Crée le dossier de suivi pour traquer le dépôt, l'AR et l'échéance légale.
          ArchiPilot calcule automatiquement la date butoir selon la procédure (30/75/105/230 jours).
        </div>
        <button onClick={onPermits} style={btnPrimaryStyle}>
          Créer le dossier <Ico name="arrowr" size={12} color="#fff" />
        </button>
      </HeroCard>
    );
  }

  // Permit actif = celui non encore "granted/refused/expired" (ou le
  // plus récent). Trie par date de dépôt décroissante.
  const active = permits.find(p => !["granted", "refused", "expired"].includes(p.status)) || permits[0];
  const days = active.deadline_date ? daysUntil(active.deadline_date) : null;

  // Sévérité de l'urgence pour colorer la border et le badge :
  //   <= 7j   → rouge (BR)
  //   <= 30j  → ambre (AM)
  //   sinon   → bleu permis (ST)
  let urgencyColor = ST;
  let urgencyBg = STB;
  if (days !== null) {
    if (days <= 7) { urgencyColor = BR; urgencyBg = BRB; }
    else if (days <= 30) { urgencyColor = AM; urgencyBg = AMB; }
  }

  return (
    <HeroCard accentColor={urgencyColor} accentBg={urgencyBg}>
      <HeroLabel phase={phase} />
      <div style={{ fontSize: 17, fontWeight: 800, color: TX, marginBottom: 4 }}>
        Dossier permis {active.reference ? `· ${active.reference}` : ""}
      </div>
      <div style={{ fontSize: 12, color: TX2, marginBottom: 14 }}>
        {active.commune ? `${active.commune} · ` : ""}
        Procédure {active.procedure}
        {active.status === "deposited" ? " · Déposé" :
         active.status === "in_review" ? " · En instruction" :
         active.status === "complete_request" ? " · Compléments demandés" :
         active.status === "granted" ? " · Octroyé" :
         active.status === "refused" ? " · Refusé" : " · En préparation"}
      </div>

      {/* KPI échéance — gros chiffre + statut */}
      {days !== null && (
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 14px", background: urgencyBg, borderRadius: 10, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: urgencyColor, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Échéance
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: urgencyColor, lineHeight: 1, marginTop: 2 }}>
              {days <= 0 ? `J+${-days}` : `J-${days}`}
            </div>
            <div style={{ fontSize: 11, color: urgencyColor, marginTop: 2 }}>
              {days <= 0 ? "Délai dépassé — silence vaut décision" : `${active.deadline_date}`}
            </div>
          </div>
          <div style={{ flex: 1, fontSize: 11, color: TX2, lineHeight: 1.5 }}>
            {days <= 0
              ? "Le délai légal de traitement est dépassé. Selon la procédure, l'absence de décision vaut octroi ou refus."
              : days <= 7
                ? "Décision attendue dans la semaine. Prévois la communication MO et entreprise."
                : days <= 30
                  ? "Décision proche. Surveille les courriers commune."
                  : "Délai confortable. Continue les études en parallèle."}
          </div>
        </div>
      )}

      <button onClick={onPermits} style={btnPrimaryStyle}>
        Ouvrir le dossier <Ico name="arrowr" size={12} color="#fff" />
      </button>
    </HeroCard>
  );
}

// ─── 3. Planning Hero (Exécution) ───────────────────────────
// Job-to-be-done : visualiser l'avancement des lots et leur séquencement.
// Affiche les 5 prochains lots actifs (dates futures ou en cours).
function PlanningHero({ project, onViewPlanning }) {
  const phase = getProjectPhase(project, project.statusId);
  const lots = project.lots || [];
  const today = new Date(); today.setHours(0, 0, 0, 0);

  // Prochains lots : en cours OU à venir, triés par date de début.
  const upcoming = lots
    .filter(l => l.startDate && (l.progress ?? 0) < 100)
    .map(l => ({ ...l, startMs: new Date(l.startDate).getTime() }))
    .sort((a, b) => a.startMs - b.startMs)
    .slice(0, 5);

  if (lots.length === 0) {
    return (
      <HeroCard accentColor={phase.color} accentBg={phase.bg}>
        <HeroLabel phase={phase} />
        <div style={{ fontSize: 17, fontWeight: 800, color: TX, marginBottom: 4 }}>Planifie tes lots</div>
        <div style={{ fontSize: 12, color: TX2, lineHeight: 1.5, marginBottom: 14 }}>
          Crée les lots du chantier (maçonnerie, électricité, plomberie…) avec leurs dates et leur entreprise responsable.
          Vue Hiérarchie + Gantt disponibles.
        </div>
        <button onClick={onViewPlanning} style={btnPrimaryStyle}>
          Ouvrir le planning <Ico name="arrowr" size={12} color="#fff" />
        </button>
      </HeroCard>
    );
  }

  return (
    <HeroCard accentColor={phase.color} accentBg={phase.bg}>
      <HeroLabel phase={phase} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: TX }}>Planning des lots</div>
        <button onClick={onViewPlanning} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12, color: AC, fontWeight: 700, fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 3 }}>
          Voir tout <Ico name="arrowr" size={10} color={AC} />
        </button>
      </div>

      {upcoming.length === 0 ? (
        <div style={{ fontSize: 12, color: TX3, fontStyle: "italic", padding: "8px 0" }}>
          Aucun lot en cours ou à venir.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {upcoming.map(l => {
            const inProgress = l.startMs <= today.getTime();
            return (
              <div key={l.id} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 10px", background: SB, border: `1px solid ${SBB}`, borderRadius: 8,
              }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: inProgress ? GR : ST, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {l.name}
                  </div>
                  <div style={{ fontSize: 10, color: TX3 }}>
                    {l.contractor ? `${l.contractor} · ` : ""}
                    {fmtShortDate(l.startDate)}{l.endDate ? ` → ${fmtShortDate(l.endDate)}` : ""}
                  </div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: inProgress ? GR : ST, flexShrink: 0 }}>
                  {l.progress ?? 0}%
                </div>
              </div>
            );
          })}
        </div>
      )}
    </HeroCard>
  );
}

// ─── 4. Tasks Hero (Chantier) ───────────────────────────────
// Job-to-be-done : exécuter les tâches du moment, principalement
// rédiger le prochain PV de chantier.
function TasksHero({ project, onStartNotes, onChantierVisit }) {
  const phase = getProjectPhase(project, project.statusId);
  const tasks = project.tasks || [];
  // Tâches actives = non clôturées, non en draft
  const active = tasks.filter(t => !["done", "cancelled", "closed", "created"].includes(t.status));
  const top = active.slice(0, 4);
  const pvCount = (project.pvHistory || []).length;
  const lastPv = (project.pvHistory || [])[0];

  return (
    <HeroCard accentColor={phase.color} accentBg={phase.bg}>
      <HeroLabel phase={phase} />
      <div style={{ fontSize: 17, fontWeight: 800, color: TX, marginBottom: 4 }}>
        Prochain PV à rédiger
      </div>
      <div style={{ fontSize: 12, color: TX2, marginBottom: 14 }}>
        {lastPv
          ? `${pvCount} PV émis · Dernier : n°${lastPv.number} du ${lastPv.date}`
          : "Aucun PV émis pour l'instant. Démarre le premier compte-rendu de chantier."}
      </div>

      {/* Deux CTAs : "Démarrer une visite" (Mode Chantier) en primaire car
          c'est le flux le plus contextualisé sur chantier ; "Préparer le PV"
          en secondaire pour les sessions de bureau. */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {onChantierVisit && (
          <button onClick={onChantierVisit} style={btnPrimaryStyle}>
            <Ico name="alert" size={12} color="#fff" /> Démarrer une visite
          </button>
        )}
        <button onClick={onStartNotes} style={{
          padding: "10px 16px", border: `1px solid ${SBB}`, borderRadius: 9,
          background: WH, color: TX2,
          fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          display: "inline-flex", alignItems: "center", gap: 6,
        }}>
          Préparer le PV n°{pvCount + 1} <Ico name="arrowr" size={12} color={TX2} />
        </button>
      </div>

      {active.length > 0 && (
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${SBB}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: TX3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
            {active.length} action{active.length > 1 ? "s" : ""} ouverte{active.length > 1 ? "s" : ""}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {top.map(t => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: TX2 }}>
                <span style={{ width: 4, height: 4, borderRadius: "50%", background: TX3, flexShrink: 0 }} />
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</span>
              </div>
            ))}
            {active.length > 4 && (
              <div style={{ fontSize: 10, color: TX3, fontStyle: "italic", paddingLeft: 12 }}>
                + {active.length - 4} autre{active.length - 4 > 1 ? "s" : ""}
              </div>
            )}
          </div>
        </div>
      )}
    </HeroCard>
  );
}

// ─── 5. OPR Hero (Réception) ────────────────────────────────
// Job-to-be-done : suivre la levée des réserves et déclencher les
// signatures. C'est la fonctionnalité la plus critique de la phase.
function OprHero({ project, onOpr }) {
  const phase = getProjectPhase(project, project.statusId);
  const reserves = project.reserves || [];
  const total = reserves.length;
  const levees = reserves.filter(r => r.status === "levee").length;
  const partielles = reserves.filter(r => r.status === "partiellement_levee").length;
  const nonLevees = reserves.filter(r => r.status === "non_levee").length;
  const critiques = reserves.filter(r => r.severity === "critical" && r.status !== "levee").length;
  const pct = total > 0 ? Math.round((levees / total) * 100) : 0;

  // Couleur d'urgence selon l'avancement et les critiques
  let accent = phase.color;
  let accentBg = phase.bg;
  if (critiques > 0) { accent = BR; accentBg = BRB; }
  else if (total > 0 && pct < 100) { accent = AM; accentBg = AMB; }
  else if (pct === 100 && total > 0) { accent = SG; accentBg = SGB; }

  return (
    <HeroCard accentColor={accent} accentBg={accentBg}>
      <HeroLabel phase={phase} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: TX }}>
          Réserves OPR
        </div>
        {total > 0 && (
          <div style={{ fontSize: 22, fontWeight: 800, color: accent, lineHeight: 1 }}>{pct}%</div>
        )}
      </div>

      {total === 0 ? (
        <>
          <div style={{ fontSize: 12, color: TX2, lineHeight: 1.5, marginBottom: 14 }}>
            Commence par lister les réserves constatées lors de la visite OPR. ArchiPilot propose une bibliothèque de 52 modèles classiques + signatures à distance par token.
          </div>
          <button onClick={onOpr} style={btnPrimaryStyle}>
            Démarrer l'OPR <Ico name="arrowr" size={12} color="#fff" />
          </button>
        </>
      ) : (
        <>
          <div style={{ fontSize: 12, color: TX2, marginBottom: 12 }}>
            {levees}/{total} levée{total > 1 ? "s" : ""}{critiques > 0 ? ` · ${critiques} critique${critiques > 1 ? "s" : ""} ouverte${critiques > 1 ? "s" : ""}` : ""}
          </div>

          {/* Progression bar */}
          <div style={{ height: 6, background: SB2, borderRadius: 3, marginBottom: 12, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: accent, transition: "width 0.4s" }} />
          </div>

          {/* KPIs détaillés en mini-pills */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            <KpiPill label="Non levées" value={nonLevees} color={BR} bg={BRB} />
            <KpiPill label="En cours"   value={partielles} color={AM} bg={AMB} />
            <KpiPill label="Levées"     value={levees}    color={SG} bg={SGB} />
            {critiques > 0 && <KpiPill label="Critiques" value={critiques} color={BR} bg={BRB} pulse />}
          </div>

          <button onClick={onOpr} style={btnPrimaryStyle}>
            Gérer les réserves <Ico name="arrowr" size={12} color="#fff" />
          </button>
        </>
      )}
    </HeroCard>
  );
}

function KpiPill({ label, value, color, bg, pulse }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 9px", borderRadius: 999,
      background: bg, color, fontSize: 11, fontWeight: 700,
      animation: pulse ? "pulse 2s ease-in-out infinite" : "none",
    }}>
      <strong style={{ fontSize: 12 }}>{value}</strong>
      <span style={{ fontWeight: 600, fontSize: 10 }}>{label}</span>
    </div>
  );
}

// ─── 6. Closed Hero (Clôturé) ───────────────────────────────
// Job-to-be-done : archiver le projet + anticiper la réception
// définitive 12 mois après l'OPR provisoire (obligation belge).
function ClosedHero({ project, onJournal, onArchive }) {
  // Cherche l'OPR provisoire le plus récent pour calculer J+365
  const provs = (project.oprHistory || []).filter(o => o.type === "provisoire" || !o.type);
  const lastProv = provs.length > 0 ? provs[provs.length - 1] : null;
  const provDate = lastProv ? parseDateAny(lastProv.date) : null;
  // J+365 = anniversaire de la provisoire. Calculé dans un useMemo pour
  // satisfaire la règle react-rules-of-hooks/no-impure-in-render — Date.now()
  // est non-déterministe et React veut que les rendus soient purs.
  // Le compiler React 19 considère Date.now() comme impur — c'est volontaire
  // ici (la valeur reflète "maintenant" et doit changer entre re-renders).
  // On override la règle car la lecture du temps est l'intention exacte.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const { definitiveTarget, daysUntilDefinitive } = useMemo(() => {
    if (!provDate) return { definitiveTarget: null, daysUntilDefinitive: null };
    const target = new Date(provDate.getTime() + 365 * 86400000);
    return { definitiveTarget: target, daysUntilDefinitive: Math.round((target - nowMs) / 86400000) };
  }, [provDate, nowMs]);

  return (
    <HeroCard accentColor={E_TX_DARK} accentBg={E_GRAPHITE_BG}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: E_TX_DARK }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: E_TX_DARK, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Projet clôturé
        </span>
      </div>

      <div style={{ fontSize: 17, fontWeight: 800, color: TX, marginBottom: 4 }}>
        {project.archived ? "Projet archivé" : "Projet clôturé"}
      </div>
      <div style={{ fontSize: 12, color: TX2, lineHeight: 1.5, marginBottom: 14 }}>
        Le chantier est terminé. Exporte le journal de chantier consolidé pour archivage légal (RGPT).
        {daysUntilDefinitive !== null && daysUntilDefinitive > 0 && ` La réception définitive est à prévoir dans ${daysUntilDefinitive} jour${daysUntilDefinitive > 1 ? "s" : ""}.`}
      </div>

      {/* J+365 countdown si applicable */}
      {daysUntilDefinitive !== null && daysUntilDefinitive > 0 && daysUntilDefinitive < 365 && (
        <div style={{
          padding: "10px 12px", background: AMB, border: `1px solid ${AM}33`, borderRadius: 8,
          fontSize: 11, color: TX2, marginBottom: 12, lineHeight: 1.5,
        }}>
          <strong style={{ color: AM }}>Réception définitive · J-{daysUntilDefinitive}</strong>
          <div style={{ marginTop: 2 }}>
            Anniversaire de l'OPR provisoire du {lastProv?.date}. Pense à planifier la visite définitive.
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={onJournal} style={btnPrimaryStyle}>
          Exporter le journal <Ico name="arrowr" size={12} color="#fff" />
        </button>
        {!project.archived && (
          <button onClick={onArchive} style={btnSecondaryStyle}>
            Archiver le projet
          </button>
        )}
      </div>
    </HeroCard>
  );
}

// ─── Utils ──────────────────────────────────────────────────

const btnPrimaryStyle = {
  padding: "10px 16px", border: "none", borderRadius: 9,
  background: AC, color: "#fff",
  fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
  display: "inline-flex", alignItems: "center", gap: 6,
};

const btnSecondaryStyle = {
  padding: "10px 16px", border: `1px solid ${SBB}`, borderRadius: 9,
  background: WH, color: TX2,
  fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
};

function daysUntil(iso) {
  if (!iso) return null;
  const target = new Date(iso); target.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

function fmtShortDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString("fr-BE", { day: "numeric", month: "short" });
}

function parseDateAny(s) {
  if (!s) return null;
  if (s instanceof Date) return isNaN(s) ? null : s;
  const iso = new Date(s);
  if (!isNaN(iso)) return iso;
  const m = (s || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const year = y.length === 2 ? 2000 + parseInt(y, 10) : parseInt(y, 10);
    return new Date(year, parseInt(mo, 10) - 1, parseInt(d, 10));
  }
  return null;
}

// Helper exporté — l'appelant (Overview) en a besoin pour savoir
// quels blocs du Résumé doivent être masqués pour éviter les doublons
// avec le hero. Renvoie l'identifiant de variant courant (ou null).
export function getPhaseHeroVariant(statusId) {
  return PHASE_HERO_VARIANT[statusId] || null;
}

export default OverviewPhaseHero;
