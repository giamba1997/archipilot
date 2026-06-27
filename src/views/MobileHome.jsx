import { useEffect, useMemo, useState } from "react";
import {
  AC, ACL, SB, SBB, TX, TX2, TX3, WH, SP, RAD,
  BR, AM, AMB, ST, STB,
} from "../constants/tokens";
import { Ico } from "../components/ui";
import { getStatus } from "../constants/statuses";
import { isEnabled } from "../constants/featureFlags";
import { loadPermits } from "../db";
import { parseDateFR, relativeDate } from "../utils/dates";
import { buildMapsUrl } from "../utils/address";
import { useGeolocation, haversineKm } from "../hooks/useGeolocation";
import { getActiveVisit } from "../utils/chantierVisit";

// ── MobileHome — vue d'accueil mobile dédiée ──────────────
//
// Cette vue répond à la question « qu'est-ce que je fais maintenant ? »
// au démarrage de l'app sur téléphone. Elle est délibérément verticale,
// compacte, et agrège des sources hétérogènes pour exposer 4 blocs :
//
//   1. Aujourd'hui — items urgents (réunion du jour, permis J-7,
//      notifs non lues)
//   2. Mes chantiers — 5 plus récents avec hint d'action
//   3. Chantiers proches — opt-in géoloc, 3 plus proches avec distance
//   4. Stats hebdo — 1 ligne motivationnelle
//
// Les factures en retard ont été retirées du bloc Aujourd'hui : l'écran
// Facturation est forbidden sur mobile (édition + génération PDF), donc
// proposer cette urgence ici menait à un fallback overview sans livrer
// la promesse. La gestion des relances reste 100% desktop.
//
// Routage : App.jsx route vers MobileHome quand `view === "mobileHome"`,
// défini par défaut au boot si `useIsMobile()` est vrai. L'archi sélectionne
// un projet → `onSelectProject(id)` switche vers Overview du projet.

const TODAY_TS = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return +d; })();

// ── Helpers d'agrégation ─────────────────────────────────
function getProjectActivityTs(p) {
  // Approximation de updatedAt : max des timestamps trouvés dans les
  // entrées du projet. Si rien → 0.
  let m = 0;
  const considerTs = (v) => {
    if (!v) return;
    const t = typeof v === "number" ? v : +new Date(v);
    if (!isNaN(t) && t > m) m = t;
  };
  (p.pvHistory || []).forEach(x => considerTs(x.createdAt) || considerTs(x.date));
  (p.posts || []).forEach(x => considerTs(x.createdAt));
  (p.reserves || []).forEach(x => considerTs(x.createdAt) || considerTs(x.lastUpdatedAt));
  (p.actions || []).forEach(x => considerTs(x.createdAt));
  return m;
}

function isMeetingToday(p) {
  if (!p.nextMeeting) return false;
  const d = parseDateFR(p.nextMeeting);
  if (!d) return false;
  d.setHours(0, 0, 0, 0);
  return +d === TODAY_TS;
}

function reservesOpen(p) {
  return (p.reserves || []).filter(r => r.status !== "levee").length;
}

function pvDraftsHint(p) {
  // Brouillon de PV directement attaché au projet (status === "draft").
  return (p.pvHistory || []).filter(x => x.status === "draft").length;
}

function describeNextAction(p) {
  // Hint compact à afficher sous le nom du projet. Priorité :
  //   1. réunion aujourd'hui
  //   2. PV brouillon à finir
  //   3. réserves ouvertes
  //   4. fallback : nb de PV
  if (isMeetingToday(p)) return { txt: "Réunion aujourd'hui", color: AC };
  const drafts = pvDraftsHint(p);
  if (drafts > 0) return { txt: `${drafts} PV à finir`, color: AM };
  const opens = reservesOpen(p);
  if (opens > 0) return { txt: `${opens} réserve${opens > 1 ? "s" : ""} ouverte${opens > 1 ? "s" : ""}`, color: BR };
  const total = (p.pvHistory || []).length;
  return { txt: total > 0 ? `${total} PV au total` : "Pas encore de PV", color: TX3 };
}

// ── Vue principale ────────────────────────────────────────
export function MobileHome({
  projects = [],
  notifications = [],
  profile,
  onSelectProject,
  onOpenAllProjects,
  onOpenMap,
  onOpenNotifications,
  onOpenNewProject,
  onResumeChantier,
}) {
  const [permits, setPermits] = useState([]);
  const [loadingExtras, setLoadingExtras] = useState(true);
  // Cap visuel du bloc "Aujourd'hui" — révèle les items en surplus en
  // place via un expander, sans toggle persisté. Reset au remount.
  const [todayExpanded, setTodayExpanded] = useState(false);
  const geo = useGeolocation();

  // Tier 1 : détection d'une visite Mode Chantier en cours pour
  // proposer un raccourci "Reprendre". Évite à l'archi d'avoir à
  // naviguer vers le projet + relancer une visite quand il avait
  // juste fermé l'app pour répondre à un appel.
  const activeVisit = useMemo(() => {
    const v = getActiveVisit();
    if (!v || v.endedAt) return null;
    const proj = (projects || []).find(p => String(p.id) === String(v.projectId));
    if (!proj) return null;
    const start = v.startedAt ? new Date(v.startedAt) : null;
    const ageMin = start ? Math.floor((Date.now() - start.getTime()) / 60000) : 0;
    return { visit: v, project: proj, ageMin };
  }, [projects]);

  // Charge les permis globaux (RLS-filtered) — 1 fois au mount, pour
  // détecter les échéances proches dans le bloc Aujourd'hui.
  useEffect(() => {
    if (!isEnabled("permits")) { setLoadingExtras(false); return; } // POC : permis différés
    let cancelled = false;
    (async () => {
      try {
        const pe = await loadPermits().catch(() => []);
        if (cancelled) return;
        setPermits(pe || []);
      } finally {
        if (!cancelled) setLoadingExtras(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Bloc Aujourd'hui ──
  const activeProjects = useMemo(
    () => (projects || []).filter(p => !p.archived),
    [projects]
  );

  const meetingsToday = useMemo(
    () => activeProjects.filter(isMeetingToday),
    [activeProjects]
  );

  const permitsSoon = useMemo(() => {
    if (!isEnabled("permits")) return []; // POC : permis différés
    return (permits || []).filter(pe => {
      if (!pe.deadline_date) return false;
      const d = new Date(pe.deadline_date);
      if (isNaN(d)) return false;
      const days = Math.ceil((d - TODAY_TS) / (1000 * 60 * 60 * 24));
      return days >= 0 && days <= 7;
    });
  }, [permits]);

  const unreadNotifs = useMemo(
    () => (notifications || []).filter(n => !n.read),
    [notifications]
  );

  const todayHasItems =
    meetingsToday.length + permitsSoon.length + unreadNotifs.length > 0;

  // ── Mes chantiers : 5 plus récents ──
  const recentProjects = useMemo(() => {
    return activeProjects
      .map(p => ({ p, ts: getProjectActivityTs(p) }))
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 5)
      .map(x => x.p);
  }, [activeProjects]);

  // ── Chantiers proches : opt-in géoloc ──
  const nearbyProjects = useMemo(() => {
    if (!geo.coords) return [];
    return activeProjects
      .filter(p => p.geo?.lat && p.geo?.lng)
      .map(p => ({ p, km: haversineKm(geo.coords, p.geo) }))
      .filter(x => isFinite(x.km))
      .sort((a, b) => a.km - b.km)
      .slice(0, 3);
  }, [activeProjects, geo.coords]);

  // ── Stats hebdo ──
  const weekStats = useMemo(() => {
    const WEEK_AGO = TODAY_TS - 7 * 86400000;
    let pvs = 0, reservesLevees = 0, visites = 0;
    activeProjects.forEach(p => {
      (p.pvHistory || []).forEach(x => {
        const t = +new Date(x.createdAt || x.date);
        if (!isNaN(t) && t >= WEEK_AGO) pvs++;
      });
      (p.reserves || []).forEach(r => {
        if (r.status !== "levee") return;
        const t = +new Date(r.leveeAt || r.lastUpdatedAt || 0);
        if (!isNaN(t) && t >= WEEK_AGO) reservesLevees++;
      });
      (p.journalEntries || []).forEach(j => {
        const t = +new Date(j.date || j.createdAt);
        if (!isNaN(t) && t >= WEEK_AGO) visites++;
      });
    });
    return { pvs, reservesLevees, visites };
  }, [activeProjects]);

  const hasAnyStat = weekStats.pvs + weekStats.reservesLevees + weekStats.visites > 0;

  // ── Salutation ──
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 6) return "Bonne nuit";
    if (h < 12) return "Bonjour";
    if (h < 18) return "Bon après-midi";
    return "Bonsoir";
  }, []);

  return (
    <div style={{ padding: `${SP.lg}px ${SP.md}px ${SP.xl * 4}px`, maxWidth: 640, margin: "0 auto" }}>
      {/* Banner "Visite en cours" (Tier 1) — apparait si l'archi a quitté
          le Mode Chantier sans terminer la visite (appel reçu, lock écran,
          fermeture app). Tap reprend la visite exactement où elle était. */}
      {activeVisit && (
        <button
          onClick={() => onResumeChantier?.(activeVisit.project.id)}
          style={{
            display: "flex", alignItems: "center", gap: 12, width: "100%",
            padding: "12px 14px", marginBottom: SP.md,
            background: ACL, border: `1px solid ${AC}`,
            borderRadius: RAD.md, cursor: "pointer",
            fontFamily: "inherit", textAlign: "left",
            boxShadow: "0 2px 8px rgba(192,90,44,0.12)",
          }}
        >
          <div style={{
            width: 36, height: 36, borderRadius: "50%",
            background: AC, display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, position: "relative",
          }}>
            <Ico name="building" size={18} color="#fff" />
            <span style={{
              position: "absolute", inset: -3, borderRadius: "50%",
              border: `2px solid ${AC}`, opacity: 0.4,
              animation: "pulseDot 1.6s ease-in-out infinite",
            }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: AC, textTransform: "uppercase", letterSpacing: 0.6 }}>
              Visite en cours · {activeVisit.ageMin < 60 ? `${activeVisit.ageMin} min` : `${Math.floor(activeVisit.ageMin / 60)}h${String(activeVisit.ageMin % 60).padStart(2, "0")}`}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>
              {activeVisit.project.name}
            </div>
          </div>
          <span style={{ fontSize: 11, color: AC, fontWeight: 700 }}>Reprendre →</span>
        </button>
      )}

      {/* Header simple — pas de logo, le SidebarHeader le fait déjà */}
      <header style={{ marginBottom: SP.lg }}>
        <div style={{ fontSize: 13, color: TX3, fontWeight: 600, marginBottom: 2 }}>
          {greeting}{profile?.name ? `, ${profile.name.split(" ")[0]}` : ""}
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: TX, lineHeight: 1.2 }}>
          {todayHasItems ? "Voici ta journée" : "Tout est calme aujourd'hui"}
        </div>
      </header>

      {/* ── Aujourd'hui ──
          Cap automatique à TODAY_CAP items pour les archis chargés.
          On flatten meetings + permits + notifs dans une liste triée par
          score d'urgence (réunion today domine, puis permis J- décroissant,
          puis notifs). "+ N autres" expand en place. Pas de toggle global
          compact mode (rejeté en review).  */}
      {(() => {
        const TODAY_CAP = 3;
        const items = [];
        meetingsToday.forEach(p => {
          const mapsUrl = buildMapsUrl(p);
          items.push({
            key: `m-${p.id}`,
            priority: 100,
            node: (
              <UrgencyRow
                key={`m-${p.id}`}
                icon="calendar"
                color={AC}
                bg={ACL}
                title={p.name}
                sub="Réunion prévue aujourd'hui"
                onClick={() => onSelectProject?.(p.id)}
                extraAction={mapsUrl ? { href: mapsUrl, label: "Y aller", icon: "mappin" } : null}
              />
            ),
          });
        });
        permitsSoon.forEach(pe => {
          const days = Math.ceil((new Date(pe.deadline_date) - TODAY_TS) / 86400000);
          const proj = activeProjects.find(p => String(p.id) === String(pe.project_id));
          items.push({
            key: `pe-${pe.id}`,
            // J-0 = 80, J-7 = 59 — les échéances les plus proches passent en tête
            priority: 80 - days * 3,
            node: (
              <UrgencyRow
                key={`pe-${pe.id}`}
                icon="file"
                color={AM}
                bg={AMB}
                title={proj?.name || pe.project_name || "Permis"}
                sub={`Permis : échéance dans ${days} jour${days > 1 ? "s" : ""}`}
                onClick={() => proj && onSelectProject?.(proj.id)}
              />
            ),
          });
        });
        if (unreadNotifs.length > 0) {
          items.push({
            key: "notifs",
            priority: 30,
            node: (
              <UrgencyRow
                key="notifs"
                icon="bell"
                color={ST}
                bg={STB}
                title={`${unreadNotifs.length} notification${unreadNotifs.length > 1 ? "s" : ""} non lue${unreadNotifs.length > 1 ? "s" : ""}`}
                sub="Tap pour ouvrir le centre de notifications"
                onClick={() => onOpenNotifications?.()}
              />
            ),
          });
        }
        items.sort((a, b) => b.priority - a.priority);
        const visible = todayExpanded ? items : items.slice(0, TODAY_CAP);
        const hidden = items.length - visible.length;
        return (
          <Section title="Aujourd'hui" iconName="alert">
            {!todayHasItems && (
              <EmptyHint
                icon="check"
                text="Aucune échéance urgente."
                sub="Tu peux respirer (ou rattraper de l'admin)."
              />
            )}
            {visible.map(it => it.node)}
            {hidden > 0 && (
              <button
                onClick={() => setTodayExpanded(true)}
                style={{
                  width: "100%", marginTop: 4,
                  padding: "10px 12px",
                  border: `1px dashed ${SBB}`, background: "transparent",
                  borderRadius: RAD.md, color: AC,
                  fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}
              >
                <Ico name="chevron-down" size={12} color={AC} />
                + {hidden} autre{hidden > 1 ? "s" : ""}
              </button>
            )}
            {todayExpanded && items.length > TODAY_CAP && (
              <button
                onClick={() => setTodayExpanded(false)}
                style={{
                  width: "100%", marginTop: 4,
                  padding: "8px 12px",
                  border: "none", background: "transparent",
                  color: TX3,
                  fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4,
                }}
              >
                <Ico name="chevron-up" size={11} color={TX3} />
                Réduire
              </button>
            )}
          </Section>
        );
      })()}

      {/* ── Mes chantiers ── */}
      <Section
        title="Mes chantiers"
        iconName="building"
        right={
          activeProjects.length > 5 ? (
            <button
              onClick={() => onOpenAllProjects?.()}
              style={{ background: "none", border: "none", color: AC, fontWeight: 700, fontSize: 12, fontFamily: "inherit", cursor: "pointer", padding: 0 }}
            >
              Voir tous ({activeProjects.length})
            </button>
          ) : null
        }
      >
        {recentProjects.length === 0 && (
          <EmptyHint
            icon="building"
            text="Aucun projet pour le moment."
            cta="Créer un projet"
            onCta={onOpenNewProject}
          />
        )}
        {recentProjects.map(p => {
          const status = getStatus(p.statusId);
          const hint = describeNextAction(p);
          const lastTs = getProjectActivityTs(p);
          return (
            <ProjectCard
              key={p.id}
              project={p}
              statusLabel={status?.label || ""}
              statusColor={status?.color || TX3}
              hint={hint}
              lastSeen={lastTs ? relativeDate(new Date(lastTs).toLocaleDateString("fr-BE")) : ""}
              onClick={() => onSelectProject?.(p.id)}
            />
          );
        })}
      </Section>

      {/* ── Chantiers proches ── (POC : dépend de la carte, différée) */}
      {isEnabled("map") && <Section title="Chantiers proches" iconName="mappin">
        {geo.status === "idle" && (
          <GeoPrompt onClick={geo.request} />
        )}
        {geo.status === "requesting" && (
          <div style={{ padding: SP.md, fontSize: 12, color: TX3, textAlign: "center" }}>
            Localisation en cours…
          </div>
        )}
        {(geo.status === "denied" || geo.status === "unavailable") && (
          <div style={{ padding: SP.md, fontSize: 12, color: TX3, background: SB, borderRadius: RAD.md, lineHeight: 1.5 }}>
            {geo.error}
            <button
              onClick={() => onOpenMap?.()}
              style={{ display: "block", marginTop: 8, background: "none", border: "none", color: AC, fontWeight: 700, fontSize: 12, fontFamily: "inherit", cursor: "pointer", padding: 0 }}
            >
              Voir la carte complète →
            </button>
          </div>
        )}
        {geo.status === "granted" && nearbyProjects.length === 0 && (
          <EmptyHint
            icon="mappin"
            text="Aucun chantier géolocalisé pour l'instant."
            sub="Ouvre la carte pour géocoder tes projets."
            cta="Ouvrir la carte"
            onCta={onOpenMap}
          />
        )}
        {geo.status === "granted" && nearbyProjects.length > 0 && (
          <>
            {nearbyProjects.map(({ p, km }) => (
              <UrgencyRow
                key={`np-${p.id}`}
                icon="mappin"
                color={ST}
                bg={STB}
                title={p.name}
                sub={km < 1 ? `À ${Math.round(km * 1000)} m` : `À ${km.toFixed(1)} km`}
                onClick={() => onSelectProject?.(p.id)}
              />
            ))}
            <button
              onClick={() => onOpenMap?.()}
              style={{ width: "100%", marginTop: 6, padding: 10, border: `1px solid ${SBB}`, borderRadius: RAD.md, background: WH, fontSize: 12, color: AC, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
            >
              Voir tout sur la carte →
            </button>
          </>
        )}
      </Section>}

      {/* ── Stats hebdo (1 ligne) ── */}
      {hasAnyStat && (
        <div style={{ padding: SP.md, background: ACL, borderRadius: RAD.md, marginBottom: SP.lg, fontSize: 12, color: TX2, lineHeight: 1.5 }}>
          Cette semaine :{" "}
          <strong style={{ color: TX }}>{weekStats.pvs}</strong>&nbsp;PV ·{" "}
          <strong style={{ color: TX }}>{weekStats.reservesLevees}</strong>&nbsp;réserve{weekStats.reservesLevees > 1 ? "s" : ""} levée{weekStats.reservesLevees > 1 ? "s" : ""} ·{" "}
          <strong style={{ color: TX }}>{weekStats.visites}</strong>&nbsp;visite{weekStats.visites > 1 ? "s" : ""}
        </div>
      )}

      {/* ── Footer : actions globales ── */}
      <div style={{ display: "flex", gap: 8, marginTop: SP.lg }}>
        <button
          onClick={() => onOpenAllProjects?.()}
          style={{ flex: 1, padding: "12px 14px", border: `1px solid ${SBB}`, borderRadius: RAD.md, background: WH, color: TX, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
        >
          Tous les projets
        </button>
        <button
          onClick={() => onOpenNewProject?.()}
          style={{ flex: 1, padding: "12px 14px", border: "none", borderRadius: RAD.md, background: AC, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
        >
          Nouveau projet
        </button>
      </div>

      {loadingExtras && (
        <div style={{ marginTop: SP.md, fontSize: 11, color: TX3, textAlign: "center" }}>
          Chargement des permis…
        </div>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────
function Section({ title, iconName, right, children }) {
  return (
    <section style={{ marginBottom: SP.lg }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, padding: "0 2px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {iconName && <Ico name={iconName} size={14} color={TX3} />}
          <h2 style={{ fontSize: 12, fontWeight: 700, color: TX3, margin: 0, textTransform: "uppercase", letterSpacing: 0.6 }}>{title}</h2>
        </div>
        {right}
      </header>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {children}
      </div>
    </section>
  );
}

function UrgencyRow({ icon, color, bg, title, sub, onClick, extraAction }) {
  // Compose : tap sur la ligne → action principale (ouvre projet).
  // Si `extraAction` est fourni, on rend un lien à droite qui ne propage
  // pas le click (ex: "Y aller" → Google Maps, sans ouvrir le projet).
  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: 0, border: `1px solid ${SBB}`, borderRadius: RAD.md, background: WH, overflow: "hidden" }}>
      <button
        onClick={onClick}
        style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 14px", textAlign: "left",
          border: "none", background: "transparent",
          cursor: "pointer", fontFamily: "inherit", flex: 1, minWidth: 0,
        }}
      >
        <div style={{ width: 36, height: 36, borderRadius: 10, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Ico name={icon} size={18} color={color} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
          <div style={{ fontSize: 11, color: TX3, marginTop: 1 }}>{sub}</div>
        </div>
        {!extraAction && <Ico name="chevron-right" size={16} color={TX3} />}
      </button>
      {extraAction && (
        <a
          href={extraAction.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "0 14px",
            borderLeft: `1px solid ${SBB}`,
            color: AC, textDecoration: "none",
            fontSize: 12, fontWeight: 700, fontFamily: "inherit",
            flexShrink: 0,
          }}
        >
          <Ico name={extraAction.icon || "mappin"} size={14} color={AC} />
          {extraAction.label}
        </a>
      )}
    </div>
  );
}

function ProjectCard({ project, statusLabel, statusColor, hint, lastSeen, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", flexDirection: "column", gap: 4,
        padding: "12px 14px", textAlign: "left",
        border: `1px solid ${SBB}`, background: WH,
        borderRadius: RAD.md, cursor: "pointer",
        fontFamily: "inherit", width: "100%",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: TX, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {project.name}
        </div>
        <div style={{ fontSize: 10, color: statusColor, background: `${statusColor}1a`, padding: "2px 8px", borderRadius: 999, fontWeight: 700, whiteSpace: "nowrap" }}>
          {statusLabel}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
        <div style={{ fontSize: 11, color: hint.color, fontWeight: 600 }}>{hint.txt}</div>
        {lastSeen && <div style={{ fontSize: 10, color: TX3 }}>{lastSeen}</div>}
      </div>
    </button>
  );
}

function GeoPrompt({ onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%",
        padding: "14px", border: `1px dashed ${SBB}`, background: SB,
        borderRadius: RAD.md, cursor: "pointer", fontFamily: "inherit",
        textAlign: "left",
      }}
    >
      <div style={{ width: 36, height: 36, borderRadius: 10, background: WH, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Ico name="map" size={18} color={AC} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TX }}>Voir les chantiers proches</div>
        <div style={{ fontSize: 11, color: TX3, marginTop: 1 }}>Active la géolocalisation pour les trier par distance</div>
      </div>
    </button>
  );
}

function EmptyHint({ icon, text, sub, cta, onCta }) {
  return (
    <div style={{ padding: SP.md, textAlign: "center", background: SB, borderRadius: RAD.md }}>
      {icon && (
        <div style={{ width: 40, height: 40, borderRadius: "50%", background: WH, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
          <Ico name={icon} size={18} color={TX3} />
        </div>
      )}
      <div style={{ fontSize: 13, fontWeight: 600, color: TX2 }}>{text}</div>
      {sub && <div style={{ fontSize: 11, color: TX3, marginTop: 3 }}>{sub}</div>}
      {cta && (
        <button
          onClick={onCta}
          style={{ marginTop: 10, padding: "8px 14px", border: `1px solid ${SBB}`, background: WH, borderRadius: RAD.sm, color: AC, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
        >
          {cta}
        </button>
      )}
    </div>
  );
}
