import { useState, useEffect } from "react";
import { AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, BR, BRB, REDBRD } from "../constants/tokens";
import { Ico } from "../components/ui";
import { elapsedSeconds, isPaused, formatTimer } from "../utils/timer";

// Pill compacte pour le header projet — version low-key de TimerCard.
// 3 états sobres : idle (outline taupe), running (pulse terracotta), paused.
//
// Le clic sur le chrono ouvre les sessions. Pause / Stop intégrés inline.
export function TimerPill({ project, activeTimer, onStart, onPauseResume, onStop, onOpenSessions }) {
  const isThisProjectActive = activeTimer && activeTimer.projectId === project?.id;
  const isAnotherProjectActive = activeTimer && activeTimer.projectId !== project?.id;
  const paused = isThisProjectActive ? isPaused(activeTimer) : false;

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isThisProjectActive || paused) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isThisProjectActive, paused]);
  const liveSec = isThisProjectActive ? elapsedSeconds(activeTimer, now) : 0;

  // ── Idle — minimal ▶ Suivi pill, terracotta outline ──
  if (!isThisProjectActive) {
    return (
      <button
        onClick={() => onStart(project)}
        disabled={isAnotherProjectActive}
        title={isAnotherProjectActive
          ? `Suivi en cours sur ${activeTimer.projectName}`
          : "Démarrer le suivi du temps"}
        aria-label="Démarrer le suivi du temps"
        style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          fontSize: 11, fontWeight: 600,
          color: isAnotherProjectActive ? TX3 : AC,
          background: isAnotherProjectActive ? SB : "transparent",
          border: `1px solid ${isAnotherProjectActive ? SBB : ACL2}`,
          padding: "3px 9px 3px 7px", borderRadius: 14,
          cursor: isAnotherProjectActive ? "not-allowed" : "pointer",
          fontFamily: "inherit", minHeight: 26,
          opacity: isAnotherProjectActive ? 0.7 : 1,
          transition: "all 0.15s",
        }}
      >
        <Ico name="clock" size={11} color={isAnotherProjectActive ? TX3 : AC} />
        Suivi
      </button>
    );
  }

  // ── Running / paused — compact pill avec chrono live + actions inline ──
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: paused ? SB : ACL,
      border: `1px solid ${paused ? SBB : ACL2}`,
      borderRadius: 14, padding: "2px 4px 2px 8px", minHeight: 26,
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: "50%",
        background: paused ? TX3 : AC,
        animation: paused ? "none" : "pulseDot 1.5s ease-in-out infinite",
      }} />
      <button
        onClick={onOpenSessions}
        title="Voir les sessions"
        aria-label="Voir les sessions"
        style={{
          fontSize: 11, fontWeight: 700,
          color: paused ? TX2 : AC,
          background: "transparent", border: "none", padding: "0 4px",
          cursor: "pointer", fontFamily: "inherit",
          fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em",
        }}
      >
        {formatTimer(liveSec)}
      </button>
      <button
        onClick={onPauseResume}
        aria-label={paused ? "Reprendre" : "Pause"}
        title={paused ? "Reprendre" : "Pause"}
        style={{
          width: 22, height: 22, borderRadius: "50%",
          background: WH, border: `1px solid ${SBB}`, cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0,
        }}
      >
        <Ico name={paused ? "clock" : "stop"} size={9} color={paused ? AC : TX2} />
      </button>
      <button
        onClick={onStop}
        aria-label="Arrêter"
        title="Arrêter le suivi"
        style={{
          width: 22, height: 22, borderRadius: "50%",
          background: WH, border: `1px solid ${REDBRD}`, cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0,
        }}
      >
        <Ico name="stop" size={9} color={BR} />
      </button>
    </span>
  );
}
