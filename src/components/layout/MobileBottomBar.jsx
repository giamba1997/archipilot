import { AC, WH, SBB } from "../../constants/tokens";
import { Ico } from "../ui";

export function MobileBottomBar({ view, onNavigate, onCapture }) {
  const isActive = (id) => view === id || (id === "overview" && view === "overview") || (id === "notes" && (view === "notes" || view === "result")) || (id === "plan" && (view === "plan" || view === "planning" || view === "checklists"));
  const TAB_MUTED = "#B5B5B0";
  const Tab = ({ id, icon, label }) => {
    const active = isActive(id);
    return (
      <button onClick={() => onNavigate(id)} aria-label={label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 3, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", padding: "0 0 5px", borderRadius: 0, transition: "color 0.15s", minHeight: 48, position: "relative" }}>
        {active && <div style={{ position: "absolute", top: 4, left: "50%", transform: "translateX(-50%)", width: 20, height: 3, borderRadius: 2, background: AC }} />}
        <Ico name={icon} size={23} color={active ? AC : TAB_MUTED} />
        <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, color: active ? AC : TAB_MUTED, lineHeight: 1, textAlign: "center", width: "100%" }}>{label}</span>
      </button>
    );
  };
  return (
    <nav className="ap-mobile-bar" style={{ display: "none", position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200, paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      {/* Background shape — full width, deep bump hugging the 56px circle */}
      <svg style={{ position: "absolute", top: -36, left: 0, width: "100%", height: "calc(100% + 36px)", pointerEvents: "none", filter: "drop-shadow(0 -1px 3px rgba(0,0,0,0.06))" }} viewBox="0 0 400 98" preserveAspectRatio="none">
        <path d="M0,36 L140,36 C150,36 155,35 160,30 C168,20 177,2 200,2 C223,2 232,20 240,30 C245,35 250,36 260,36 L400,36 L400,98 L0,98 Z" fill={WH} />
        <path d="M0,36 L140,36 C150,36 155,35 160,30 C168,20 177,2 200,2 C223,2 232,20 240,30 C245,35 250,36 260,36 L400,36" fill="none" stroke={SBB} strokeWidth="0.7" />
      </svg>
      <div style={{ position: "relative", display: "flex", alignItems: "flex-end", height: 60, padding: "0 4px" }}>
        {/* Left tabs */}
        <Tab id="overview" icon="building" label="Projet" />
        <Tab id="notes" icon="file" label="PV" />
        {/* Center FAB — raised into the bump */}
        <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", position: "relative" }}>
          <button onClick={onCapture} aria-label="Photo" style={{ width: 62, height: 62, borderRadius: "50%", background: `linear-gradient(145deg, ${AC} 0%, #A54814 100%)`, border: "none", boxShadow: `0 0 20px rgba(201,90,27,0.4), 0 0 40px rgba(201,90,27,0.15)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, cursor: "pointer", padding: 0, fontFamily: "inherit", position: "absolute", bottom: 14 }}>
            <Ico name="camera" size={26} color="#fff" />
            <span style={{ fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.9)", textAlign: "center", width: "100%" }}>Photo</span>
          </button>
        </div>
        {/* Right tabs */}
        <Tab id="plan" icon="folder" label="Docs" />
        <Tab id="profile" icon="user" label="Profil" />
      </div>
    </nav>
  );
}
