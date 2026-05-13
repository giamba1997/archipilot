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

// MobileBottomBar — Option A
// [Accueil] [Notifs] [+ Capture] [Docs] [Profil]
//
// Le tab "PV" historique a sauté : sur mobile, la création de PV passe
// désormais par QuickCaptureSheet → MobilePvDictateSheet (dictée IA en
// 2-3 taps), et la consultation par le switcher de l'Overview. Pointer
// vers NoteEditor depuis le bottom bar envoyait l'archi dans une UI
// desktop-heavy qu'on cherche justement à éviter.
//
// Remplacé par "Notifs" qui consomme `unreadCount` et déclenche `onNotifs`
// (ouvre le drawer notif). Badge BR si non lues.
export function MobileBottomBar({ view, onNavigate, onCapture, onNotifs, notifsOpen, unreadCount = 0 }) {
  const isActive = (id) =>
    view === id
    || (id === "overview" && (view === "overview" || view === "mobileHome"))
    || (id === "plan" && (view === "plan" || view === "planning" || view === "checklists"))
    || (id === "notifs" && notifsOpen);
  return (
    <nav className="ap-mobile-bar" style={{ display: "none", position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200, paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      {/* Background shape — full width, deep bump hugging the 56px circle */}
      <svg style={{ position: "absolute", top: -36, left: 0, width: "100%", height: "calc(100% + 36px)", pointerEvents: "none", filter: "drop-shadow(0 -1px 3px rgba(0,0,0,0.06))" }} viewBox="0 0 400 98" preserveAspectRatio="none">
        <path d="M0,36 L140,36 C150,36 155,35 160,30 C168,20 177,2 200,2 C223,2 232,20 240,30 C245,35 250,36 260,36 L400,36 L400,98 L0,98 Z" fill={WH} />
        <path d="M0,36 L140,36 C150,36 155,35 160,30 C168,20 177,2 200,2 C223,2 232,20 240,30 C245,35 250,36 260,36 L400,36" fill="none" stroke={SBB} strokeWidth="0.7" />
      </svg>
      <div style={{ position: "relative", display: "flex", alignItems: "flex-end", height: 60, padding: "0 4px" }}>
        {/* Left tabs */}
        <Tab id="overview" icon="building" label="Accueil" active={isActive("overview")} onNavigate={onNavigate} />
        <Tab id="notifs"   icon="bell"     label="Notifs"  active={isActive("notifs")}   onNavigate={onNotifs}  badge={unreadCount} />
        {/* Center FAB — ouvre QuickCaptureSheet avec 4 actions capture.
            L'icône passe de "camera" à "plus" pour signifier que c'est
            un menu et pas une action unique. Le label "Capture" couvre
            les 4 sous-actions (photo / voix / réserve / PV). */}
        <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", position: "relative" }}>
          <button onClick={onCapture} aria-label="Capture rapide" style={{ width: 62, height: 62, borderRadius: "50%", background: `linear-gradient(145deg, ${AC} 0%, #A54814 100%)`, border: "none", boxShadow: `0 0 20px rgba(201,90,27,0.4), 0 0 40px rgba(201,90,27,0.15)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, cursor: "pointer", padding: 0, fontFamily: "inherit", position: "absolute", bottom: 14 }}>
            <Ico name="plus" size={28} color="#fff" />
            <span style={{ fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.9)", textAlign: "center", width: "100%" }}>Capture</span>
          </button>
        </div>
        {/* Right tabs */}
        <Tab id="plan"    icon="folder" label="Docs"   active={isActive("plan")}    onNavigate={onNavigate} />
        <Tab id="profile" icon="user"   label="Profil" active={isActive("profile")} onNavigate={onNavigate} />
      </div>
    </nav>
  );
}
