import { useState, useEffect } from "react";
import { AC, SB, SBB, TX, TX2, TX3, WH, BG, GR, BR, BRB } from "../constants/tokens";
import { PLANS } from "../constants/config";
import { supabase } from "../supabase";

// ── Mon profil (mobile) — handoff_mobile ─────────────────────
// Écran réglages : identité, abonnement, préférences (push, proximité,
// synchro), compte (sécurité, aide), déconnexion. L'édition détaillée
// (facturation, signature, abonnement) reste sur desktop — assumé.

const PREF_PUSH = "ap_pref_push";
const PREF_NEARBY = "ap_pref_nearby";
const lsBool = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v === "1"; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v ? "1" : "0"); } catch { /* ignore */ } };

function Toggle({ on, onChange }) {
  return (
    <button onClick={() => onChange(!on)} aria-pressed={on} aria-label="Activer/désactiver" style={{ width: 44, height: 26, minHeight: 26, borderRadius: 999, background: on ? AC : "#D6D3D1", border: "none", position: "relative", cursor: "pointer", flexShrink: 0, transition: "background 0.18s", padding: 0 }}>
      <span style={{ position: "absolute", top: 2, left: on ? 20 : 2, width: 22, height: 22, borderRadius: 999, background: "#fff", transition: "left 0.18s", boxShadow: "0 1px 3px rgba(0,0,0,0.25)" }} />
    </button>
  );
}

export function MobileProfile({ profile, onManage, onLogout }) {
  const [push, setPush] = useState(() => lsBool(PREF_PUSH, true));
  const [nearby, setNearby] = useState(() => lsBool(PREF_NEARBY, true));
  const [online, setOnline] = useState(() => (typeof navigator !== "undefined" ? navigator.onLine : true));
  useEffect(() => {
    const up = () => setOnline(true), down = () => setOnline(false);
    window.addEventListener("online", up); window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);

  const name = profile?.name || "Mon compte";
  const initials = name.split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase() || "?";
  const role = profile?.role || "Architecte";
  const structure = profile?.structure || profile?.company || "";
  const planLabel = PLANS?.[profile?.plan]?.label || "Free";

  const logout = async () => {
    if (onLogout) return onLogout();
    try { await supabase.auth.signOut(); } catch (e) { console.error("signOut error", e); }
  };

  const ICON = {
    bell: <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />,
    pin: <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></>,
    sync: <><path d="M21 12a9 9 0 1 1-6.2-8.6" /><polyline points="21 4 12 14 9 11" /></>,
    lock: <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
    help: <><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></>,
  };
  const Svg = ({ d, color }) => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
  const Chevron = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C7C2BD" strokeWidth="2"><polyline points="9 6 15 12 9 18" /></svg>;
  const Sep = () => <div style={{ height: 1, background: "#F5F2EF", margin: "0 14px" }} />;
  const GroupLabel = ({ children }) => <div style={{ fontSize: 12, fontWeight: 700, color: TX3, textTransform: "uppercase", letterSpacing: "0.05em", padding: "0 20px 7px" }}>{children}</div>;
  const rowIcon = (icon, bg, fg) => <span style={{ width: 30, height: 30, borderRadius: 8, background: bg, color: fg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Svg d={ICON[icon]} color={fg} /></span>;

  return (
    <div style={{ minHeight: "100%", background: BG, paddingBottom: 20 }}>
      {/* Header */}
      <div style={{ padding: "6px 20px 12px" }}>
        <div style={{ fontSize: 26, fontWeight: 700, color: TX, letterSpacing: "-0.5px" }}>Profil</div>
      </div>

      {/* Identité */}
      <button onClick={onManage} style={{ width: "100%", textAlign: "left", margin: "0 0 13px", padding: "0 16px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit" }}>
        <div style={{ background: WH, border: "1px solid #EFEDEB", borderRadius: 16, padding: 15, display: "flex", alignItems: "center", gap: 13 }}>
          <div style={{ width: 50, height: 50, borderRadius: 999, background: "linear-gradient(135deg,#F5DCC9,#E8B58E)", color: "#8B3A14", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, fontWeight: 700, flexShrink: 0 }}>{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: TX, letterSpacing: "-0.3px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
            <div style={{ fontSize: 13, color: TX2 }}>{[role, structure].filter(Boolean).join(" · ")}</div>
          </div>
          <Chevron />
        </div>
      </button>

      {/* Abonnement */}
      <button onClick={onManage} style={{ width: "100%", textAlign: "left", margin: "0 0 13px", padding: "0 16px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit" }}>
        <div style={{ background: "linear-gradient(135deg,#B85C2C,#A04C20)", borderRadius: 16, padding: "13px 16px", color: "#fff", display: "flex", alignItems: "center", gap: 12, position: "relative", overflow: "hidden" }}>
          <span style={{ position: "absolute", right: -20, top: -20, width: 110, height: 110, borderRadius: 999, background: "rgba(255,255,255,0.08)" }} />
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.6" style={{ flexShrink: 0, position: "relative" }}><path d="M12 3l1.9 6.1L20 11l-6.1 1.9L12 19l-1.9-6.1L4 11l6.1-1.9z" /></svg>
          <div style={{ flex: 1, position: "relative" }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Plan {planLabel}</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>{profile?.plan === "pro" ? "Abonnement actif" : "Passe à Pro pour tout débloquer"}</div>
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, background: "rgba(255,255,255,0.2)", borderRadius: 999, padding: "4px 11px", position: "relative" }}>Gérer</span>
        </div>
      </button>

      {/* Préférences */}
      <GroupLabel>Préférences</GroupLabel>
      <div style={{ margin: "0 16px 13px", background: WH, border: "1px solid #EFEDEB", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px" }}>
          {rowIcon("bell", "#FEF2F2", "#991B1B")}
          <span style={{ flex: 1, fontSize: 15, color: TX, fontWeight: 500 }}>Notifications push</span>
          <Toggle on={push} onChange={(v) => { setPush(v); lsSet(PREF_PUSH, v); }} />
        </div>
        <Sep />
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px" }}>
          {rowIcon("pin", "#F0FDF4", "#166534")}
          <span style={{ flex: 1, fontSize: 15, color: TX, fontWeight: 500 }}>Chantiers à proximité</span>
          <Toggle on={nearby} onChange={(v) => { setNearby(v); lsSet(PREF_NEARBY, v); }} />
        </div>
        <Sep />
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px" }}>
          {rowIcon("sync", "#EFF6FF", "#1E40AF")}
          <span style={{ flex: 1, fontSize: 15, color: TX, fontWeight: 500 }}>Synchro hors-ligne</span>
          <span style={{ fontSize: 12, color: online ? "#16A34A" : TX3, fontWeight: 500 }}>{online ? "À jour" : "En attente"}</span>
        </div>
      </div>

      {/* Compte */}
      <GroupLabel>Compte</GroupLabel>
      <div style={{ margin: "0 16px 13px", background: WH, border: "1px solid #EFEDEB", borderRadius: 14, overflow: "hidden" }}>
        <button onClick={onManage} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", width: "100%", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
          {rowIcon("lock", "#F5F5F4", TX2)}
          <span style={{ flex: 1, fontSize: 15, color: TX, fontWeight: 500 }}>Sécurité</span>
          <Chevron />
        </button>
        <Sep />
        <button onClick={() => { window.location.href = "mailto:support@archipilot.app"; }} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", width: "100%", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
          {rowIcon("help", "#F5F5F4", TX2)}
          <span style={{ flex: 1, fontSize: 15, color: TX, fontWeight: 500 }}>Aide & support</span>
          <Chevron />
        </button>
      </div>

      {/* Note desktop */}
      <div style={{ margin: "0 16px 12px", display: "flex", alignItems: "center", gap: 9, background: "#F7F5F3", borderRadius: 11, padding: "10px 12px" }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={TX3} strokeWidth="1.7" style={{ flexShrink: 0 }}><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8" /></svg>
        <span style={{ fontSize: 12, color: TX3, lineHeight: 1.45 }}>Facturation, signature et abonnement détaillé : sur ordinateur.</span>
      </div>

      {/* Déconnexion */}
      <div style={{ margin: "0 16px" }}>
        <button onClick={logout} style={{ width: "100%", height: 46, background: WH, border: "1px solid #FECACA", borderRadius: 13, color: "#991B1B", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Se déconnecter</button>
      </div>
    </div>
  );
}
