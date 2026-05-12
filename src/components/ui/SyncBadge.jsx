import { useState, useEffect } from "react";
import { SB, SBB, TX, TX2, TX3, GR, AM, RD, SG, BR, SP, FS, RAD } from "../../constants/tokens";
import { getSyncState } from "../../utils/offline";
import { Ico } from "./Ico";

// ── F7 — Badge état de synchronisation ──────────────────────
// Discret en haut à droite (à côté de la cloche). Affiche :
//   • point vert "À jour" quand tout est sync'd
//   • point ambré "Sauvegarde…" pendant les 1,5s de debounce
//   • point rouge "Hors ligne" + tooltip rassurant
// Tooltip explique au user qu'en mode offline, son travail est
// préservé en local et sera re-synchronisé au retour en ligne.

export function SyncBadge({ isOnline }) {
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(() => getSyncState());

  // Refresh d'état toutes les 1,5s — pas besoin de plus précis
  // (le marquage dirty/synced est piloté par localStorage events).
  useEffect(() => {
    const t = setInterval(() => {
      setState(getSyncState());
      setTick(x => x + 1);
    }, 1500);
    // Écoute aussi les changements de localStorage entre tabs
    const onStorage = (e) => {
      if (e.key === "archipilot_sync_state") setState(getSyncState());
    };
    window.addEventListener("storage", onStorage);
    return () => { clearInterval(t); window.removeEventListener("storage", onStorage); };
  }, []);

  // Détermine le statut visible
  let mode, color, label, tooltip;
  if (!isOnline) {
    mode = "offline";
    color = RD;
    label = "Hors ligne";
    tooltip = "Mode hors-ligne. Tes modifications sont sauvegardées en local et seront re-synchronisées automatiquement au retour en ligne.";
  } else if (state.dirty) {
    mode = "syncing";
    color = AM;
    label = "Sauvegarde…";
    tooltip = "Synchronisation en cours avec le serveur.";
  } else {
    mode = "synced";
    color = GR;
    label = "À jour";
    tooltip = state.lastSyncedAt
      ? `Dernière sauvegarde : ${new Date(state.lastSyncedAt).toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" })}`
      : "Rien à synchroniser.";
  }

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}
         onMouseEnter={() => setOpen(true)}
         onMouseLeave={() => setOpen(false)}>
      <button
        aria-label={`Synchronisation — ${label}`}
        style={{
          background: "none", border: "none", cursor: "default",
          padding: 6, display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <span style={{
          width: 8, height: 8, borderRadius: "50%",
          background: color,
          boxShadow: mode === "syncing" ? `0 0 0 3px ${color}33` : "none",
          animation: mode === "syncing" ? "ap-pulse 1.2s ease-in-out infinite" : "none",
        }} />
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "100%", right: 0, marginTop: 6,
          background: TX, color: "#fff",
          fontSize: 11, fontWeight: 500, lineHeight: 1.4,
          padding: "8px 10px", borderRadius: 8,
          maxWidth: 240, minWidth: 160, zIndex: 300,
          boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
        }}>
          <div style={{ fontWeight: 700, marginBottom: 3 }}>{label}</div>
          <div style={{ opacity: 0.85 }}>{tooltip}</div>
        </div>
      )}
      <style>{`@keyframes ap-pulse { 0%,100%{transform:scale(1);} 50%{transform:scale(1.4);} }`}</style>
    </div>
  );
}
