import { AC, WH, SBB, BR } from "../../constants/tokens";
import { Ico } from "../ui";

const TAB_MUTED = "#B5B5B0";

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
export function MobileBottomBar({ view, onNavigate, onStartChantier, onNotifs, notifsOpen, unreadCount = 0, visitActive = false }) {
  const isActive = (id) =>
    view === id
    || (id === "overview"  && (view === "overview" || view === "mobileHome"))
    || (id === "chantiers" && view === "chantiersList")
    || (id === "notifs"    && notifsOpen)
    || (id === "chantier"  && view === "chantier");
  return (
    <nav className="ap-mobile-bar" style={{ display: "none", position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200, paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      {/* Background shape — full width, deep bump hugging the 56px circle */}
      <svg style={{ position: "absolute", top: -36, left: 0, width: "100%", height: "calc(100% + 36px)", pointerEvents: "none", filter: "drop-shadow(0 -1px 3px rgba(0,0,0,0.06))" }} viewBox="0 0 400 98" preserveAspectRatio="none">
        <path d="M0,36 L140,36 C150,36 155,35 160,30 C168,20 177,2 200,2 C223,2 232,20 240,30 C245,35 250,36 260,36 L400,36 L400,98 L0,98 Z" fill={WH} />
        <path d="M0,36 L140,36 C150,36 155,35 160,30 C168,20 177,2 200,2 C223,2 232,20 240,30 C245,35 250,36 260,36 L400,36" fill="none" stroke={SBB} strokeWidth="0.7" />
      </svg>
      <div style={{ position: "relative", display: "flex", alignItems: "flex-end", height: 60, padding: "0 4px" }}>
        {/* Left tabs */}
        <Tab id="overview"  icon="home"   label="Accueil"   active={isActive("overview")}  onNavigate={onNavigate} />
        <Tab id="chantiers" icon="folder" label="Chantiers" active={isActive("chantiers")} onNavigate={onNavigate} />
        {/* Center FAB — démarre une visite Mode Chantier. L'icône `building`
            évoque le chantier ; le libellé "Visite" lève l'ambiguïté.
            Si une visite est en cours, un ring pulsé entoure le FAB pour
            rappeler à l'archi qu'il peut reprendre (indicateur global,
            visible sur toutes les pages). */}
        <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", position: "relative" }}>
          <button onClick={onStartChantier} aria-label={visitActive ? "Reprendre la visite en cours" : "Démarrer une visite chantier"} style={{ width: 62, height: 62, borderRadius: "50%", background: `linear-gradient(145deg, ${AC} 0%, #A54814 100%)`, border: "none", boxShadow: `0 0 20px rgba(201,90,27,0.4), 0 0 40px rgba(201,90,27,0.15)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, cursor: "pointer", padding: 0, fontFamily: "inherit", position: "absolute", bottom: 14 }}>
            {visitActive && (
              <>
                <span style={{ position: "absolute", inset: -4, borderRadius: "50%", border: `2.5px solid ${WH}`, boxShadow: `0 0 0 2px ${AC}`, animation: "fabVisitePulse 1.8s ease-in-out infinite", pointerEvents: "none" }} />
                <span style={{ position: "absolute", top: 4, right: 4, width: 9, height: 9, borderRadius: "50%", background: "#fff", border: `2px solid ${AC}`, animation: "fabVisiteDot 1.8s ease-in-out infinite", pointerEvents: "none" }} />
              </>
            )}
            <Ico name="building" size={28} color="#fff" />
            <span style={{ fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.9)", textAlign: "center", width: "100%" }}>{visitActive ? "Reprendre" : "Visite"}</span>
          </button>
        </div>
        <style>{`
          @keyframes fabVisitePulse {
            0%, 100% { transform: scale(1); opacity: 0.85; }
            50% { transform: scale(1.08); opacity: 0.4; }
          }
          @keyframes fabVisiteDot {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.25); }
          }
        `}</style>
        {/* Right tabs */}
        <Tab id="notifs"  icon="bell" label="Notifs" active={isActive("notifs")}  onNavigate={onNotifs}  badge={unreadCount} />
        <Tab id="profile" icon="user" label="Moi"    active={isActive("profile")} onNavigate={onNavigate} />
      </div>
    </nav>
  );
}
