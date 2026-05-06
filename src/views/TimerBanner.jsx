import { useState, useEffect } from "react";
import { AC, ACL, ACL2, SB, SBB, TX, TX2, TX3, WH, BR, BRB, REDBRD } from "../constants/tokens";
import { Ico } from "../components/ui";
import { elapsedSeconds, isPaused, formatTimer } from "../utils/timer";

// Strip ultra-thin (~24px) qui n'apparaît que sur les vues NON-projet
// (Vue d'ensemble, Profile, Agency...) où le TimerPill du header projet
// n'est pas visible. Sur les vues projet, le pill suffit, on cache la strip.
export function TimerBanner({ activeTimer, onPauseResume, onStop, onJumpToProject }) {
  const paused = activeTimer ? isPaused(activeTimer) : false;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!activeTimer || paused) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [activeTimer, paused]);
  if (!activeTimer) return null;
  const sec = elapsedSeconds(activeTimer, now);
  return (
    <div className="ap-timer-banner" style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "3px 14px",
      background: paused ? SB : ACL,
      borderBottom: `1px solid ${paused ? SBB : ACL2}`,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: paused ? TX3 : AC,
        animation: paused ? "none" : "pulseDot 1.5s ease-in-out infinite",
      }} />
      <button
        onClick={onJumpToProject}
        title="Aller au projet"
        style={{
          background: "transparent", border: "none", padding: 0, cursor: "pointer",
          fontFamily: "inherit", fontSize: 11, fontWeight: 600,
          color: paused ? TX2 : TX,
        }}
      >
        {paused ? "Pause · " : "Suivi · "}<u style={{ textUnderlineOffset: 2 }}>{activeTimer.projectName}</u>
      </button>
      <span style={{
        fontSize: 11, fontWeight: 700, color: paused ? TX2 : AC,
        fontVariantNumeric: "tabular-nums", marginLeft: "auto",
      }}>
        {formatTimer(sec)}
      </span>
      <button
        onClick={onPauseResume}
        aria-label={paused ? "Reprendre" : "Pause"}
        title={paused ? "Reprendre" : "Pause"}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 22, height: 22, border: `1px solid ${SBB}`, borderRadius: 5,
          background: WH, cursor: "pointer",
        }}
      >
        <Ico name={paused ? "clock" : "stop"} size={9} color={TX2} />
      </button>
      <button
        onClick={onStop}
        aria-label="Arrêter"
        title="Arrêter le suivi"
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 22, height: 22, border: `1px solid ${REDBRD}`, borderRadius: 5,
          background: WH, cursor: "pointer",
        }}
      >
        <Ico name="stop" size={9} color={BR} />
      </button>
    </div>
  );
}
