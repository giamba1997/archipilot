import { AC, WH, SBB, BR } from "../../constants/tokens";
import { Ico } from "../ui";

// Gris des tabs inactives : assombri vs l'ancien #B5B5B0 (sous le seuil AA
// sur fond blanc) pour rester lisible à 10px.
const TAB_MUTED = "#6F6F69";

// Tab — un bouton de nav avec badge optionnel sur l'icône.
// `badge` : nombre à afficher (ne s'affiche pas si <= 0).
function Tab({ id, icon, label, active, onNavigate, badge }) {
  return (
    <button onClick={() => onNavigate(id)} aria-label={label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 3, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", padding: "0 0 5px", borderRadius: 0, transition: "color 0.15s", minHeight: 48, position: "relative" }}>
      {active && <div style={{ position: "absolute", top: 4, left: "50%", transform: "translateX(-50%)", width: 20, height: 3, borderRadius: 2, background: AC }} />}
      <div style={{ position: "relative", display: "inline-flex" }}>
        <Ico name={icon} size={23} color={active ? AC : TAB_MUTED} />
        {badge > 0 && (
          <span aria-label={`${badge} non lues`} style={{
            position: "absolute", top: -4, right: -7,
            minWidth: 16, height: 16, padding: "0 4px",
            borderRadius: 999,
            background: BR, color: "#fff",
            fontSize: 9, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center",
            border: `1.5px solid ${WH}`,
            fontFamily: "ui-monospace, monospace",
            lineHeight: 1,
          }}>
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </div>
      <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, color: active ? AC : TAB_MUTED, lineHeight: 1, textAlign: "center", width: "100%" }}>{label}</span>
    </button>
  );
}

// MobileBottomBar — v3 (job-to-be-done driven)
// [Accueil] [Chantiers] [🏗 Visite FAB] [Notifs] [Moi]
//
// Refonte qui place le Mode Chantier au centre comme différenciateur PWA
// mobile. Le FAB ne déclenche plus la QuickCaptureSheet (capture out-of-
// context) mais entre directement dans une visite :
//   - Si un projet est actif → setView("chantier")
//   - Sinon → fallback mobileHome (l'archi sélectionne d'abord un projet)
//
// Slot 2 "Chantiers" = navigation cross-projects (liste + search à venir).
// Pour l'instant aliasée sur mobileHome qui liste déjà les chantiers
// actifs — sera enrichie dans une étape ultérieure.
//
// Slot 5 "Moi" = profil utilisateur (renommé pour ton plus personnel,
// même destination que l'ancien "Profil").
//
// `visitActive` : si une visite Mode Chantier est en cours (non terminée),
// le FAB Visite affiche un ring pulsé pour rappeler à l'archi qu'il peut
// reprendre. Visible sur toutes les pages — réutilise le FAB comme
// indicateur global plutôt que d'ajouter une banner dupliquée.
// v4 — Tab bar = destinations uniquement (handoff_mobile) :
// [Accueil] [Chantiers] [Notifs]. La visite est devenue le CTA héros de
// l'accueil ; le profil passe par l'avatar ; l'assistant a son FAB ✦ dédié.
export function MobileBottomBar({ view, onNavigate, onNotifs, notifsOpen, unreadCount = 0 }) {
  const isActive = (id) =>
    view === id
    || (id === "overview"  && (view === "overview" || view === "mobileHome"))
    || (id === "chantiers" && view === "chantiersList")
    || (id === "notifs"    && notifsOpen);
  return (
    <nav className="ap-mobile-bar" style={{ display: "none", position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200, height: 84, paddingTop: 10, paddingBottom: "env(safe-area-inset-bottom, 0px)", background: "rgba(255,255,255,0.92)", backdropFilter: "blur(12px)", borderTop: "1px solid #EFEDEB" }}>
      <div style={{ display: "flex", alignItems: "flex-start", height: 60 }}>
        <Tab id="overview"  icon="home"     label="Accueil"   active={isActive("overview")}  onNavigate={onNavigate} />
        <Tab id="chantiers" icon="building" label="Chantiers" active={isActive("chantiers")} onNavigate={onNavigate} />
        <Tab id="notifs"    icon="bell"     label="Notifs"    active={isActive("notifs")}    onNavigate={onNotifs} badge={unreadCount} />
      </div>
    </nav>
  );
}
