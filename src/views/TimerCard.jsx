import { useState, useEffect } from "react";
import { AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, BR, BRB, REDBRD, SP, FS, RAD } from "../constants/tokens";
import { Ico } from "../components/ui";
import { elapsedSeconds, isPaused, formatDuration, formatTimer, totalSecondsFor } from "../utils/timer";

// Card dans la colonne droite de l'Overview, sous MeetingCard. Format vertical
// compact pour s'intégrer avec les autres cards (Participants, Informations).
// 3 états : repos / running / paused. Cohérent visuellement avec MeetingCard.
export function TimerCard({ project, activeTimer, onStart, onPauseResume, onStop, onDiscard, onOpenSessions }) {
  const isThisProjectActive = activeTimer && activeTimer.projectId === project?.id;
  const isAnotherProjectActive = activeTimer && activeTimer.projectId !== project?.id;
  const paused = isThisProjectActive ? isPaused(activeTimer) : false;
  const sessions = project?.timeSessions || [];
  const totalSec = totalSecondsFor(sessions);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isThisProjectActive || paused) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isThisProjectActive, paused]);

  const liveSec = isThisProjectActive ? elapsedSeconds(activeTimer, now) : 0;
  const grandTotal = totalSec + (isThisProjectActive ? liveSec : 0);

  return (
    <div style={{
      background: WH,
      border: `1px solid ${isThisProjectActive ? ACL2 : SBB}`,
      borderRadius: 12,
      padding: "16px 18px",
      transition: "border-color 0.2s, box-shadow 0.2s",
      boxShadow: isThisProjectActive ? `0 1px 3px ${AC}1c` : "none",
    }}>
      {/* Header — label uppercase comme MeetingCard */}
      <div style={{ fontSize: 11, fontWeight: 600, color: AC, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
        Suivi du temps
      </div>

      {/* Body — chrono ou bouton */}
      {isThisProjectActive ? (
        <>
          {/* Live chrono */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: paused ? TX3 : AC,
              animation: paused ? "none" : "pulseDot 1.5s ease-in-out infinite",
              flexShrink: 0,
            }} />
            <span style={{
              fontSize: 24, fontWeight: 700, color: TX,
              fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em",
              lineHeight: 1,
            }}>
              {formatTimer(liveSec)}
            </span>
            {paused && (
              <span style={{ fontSize: 11, color: TX3, fontWeight: 500, fontStyle: "italic" }}>
                en pause
              </span>
            )}
          </div>
          {/* Actions Pause / Arrêter / Supprimer.
              "Arrêter" = sauvegarder la session avec description.
              "Supprimer" = abandonner sans sauvegarder (icône poubelle, demande confirmation). */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <button
              onClick={onPauseResume}
              aria-label={paused ? "Reprendre" : "Pause"}
              style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                padding: "7px 10px", border: `1px solid ${SBB}`, borderRadius: 7,
                background: WH, cursor: "pointer", fontFamily: "inherit", minHeight: 32,
              }}
            >
              <Ico name={paused ? "clock" : "stop"} size={11} color={TX2} />
              <span style={{ fontSize: 11, fontWeight: 600, color: TX2 }}>
                {paused ? "Reprendre" : "Pause"}
              </span>
            </button>
            <button
              onClick={onStop}
              aria-label="Arrêter"
              style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                padding: "7px 10px", border: `1px solid ${REDBRD}`, borderRadius: 7,
                background: BRB, cursor: "pointer", fontFamily: "inherit", minHeight: 32,
              }}
            >
              <Ico name="stop" size={11} color={BR} />
              <span style={{ fontSize: 11, fontWeight: 600, color: BR }}>Arrêter</span>
            </button>
            {onDiscard && (
              <button
                onClick={onDiscard}
                aria-label="Supprimer le suivi sans sauvegarder"
                title="Supprimer le suivi sans sauvegarder"
                style={{
                  width: 32, padding: 0, display: "flex", alignItems: "center", justifyContent: "center",
                  border: `1px solid ${SBB}`, borderRadius: 7,
                  background: WH, cursor: "pointer", fontFamily: "inherit", minHeight: 32,
                  flexShrink: 0,
                }}
              >
                <Ico name="trash" size={11} color={TX3} />
              </button>
            )}
          </div>
        </>
      ) : (
        <button
          onClick={() => onStart(project)}
          disabled={isAnotherProjectActive}
          title={isAnotherProjectActive
            ? `Suivi en cours sur ${activeTimer.projectName}`
            : "Démarrer le suivi du temps"}
          style={{
            width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
            padding: "10px 12px", border: "none", borderRadius: 8,
            background: isAnotherProjectActive ? SB : AC,
            color: isAnotherProjectActive ? TX3 : "#fff",
            fontSize: 13, fontWeight: 600, fontFamily: "inherit",
            minHeight: 38, marginBottom: 10,
            cursor: isAnotherProjectActive ? "not-allowed" : "pointer",
            opacity: isAnotherProjectActive ? 0.7 : 1,
            boxShadow: isAnotherProjectActive ? "none" : "0 1px 2px rgba(184,92,44,0.20)",
            transition: "filter 0.15s",
          }}
        >
          <Ico name="clock" size={13} color={isAnotherProjectActive ? TX3 : "#fff"} />
          Démarrer le suivi
        </button>
      )}

      {/* Total cumulé */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        paddingTop: 10, borderTop: `1px solid ${SB2}`,
        fontSize: 11, color: TX3, marginBottom: 8,
      }}>
        <span>Total cumulé</span>
        <span style={{ fontWeight: 700, color: TX2, fontVariantNumeric: "tabular-nums" }}>
          {grandTotal > 0 ? formatDuration(grandTotal) : "—"}
        </span>
      </div>

      {/* CTA Voir sessions — row cliquable explicite avec chevron + hover */}
      <button
        onClick={onOpenSessions}
        aria-label={`Voir les ${sessions.length} session${sessions.length > 1 ? "s" : ""}`}
        className="ap-timer-sessions-cta"
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "9px 12px", border: `1px solid ${SBB}`, borderRadius: 8,
          background: SB, cursor: "pointer", fontFamily: "inherit",
          minHeight: 36, transition: "background 0.15s, border-color 0.15s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = ACL;
          e.currentTarget.style.borderColor = ACL2;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = SB;
          e.currentTarget.style.borderColor = SBB;
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <Ico name="history" size={13} color={AC} />
          <span style={{ fontSize: 12, fontWeight: 600, color: TX }}>
            {sessions.length === 0 ? "Voir les sessions" : `Voir les ${sessions.length} session${sessions.length > 1 ? "s" : ""}`}
          </span>
        </span>
        <Ico name="chevron-right" size={11} color={TX3} />
      </button>
    </div>
  );
}
