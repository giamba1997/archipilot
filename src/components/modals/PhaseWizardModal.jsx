import { useEffect } from "react";
import { AC, SB, SBB, TX, TX2, WH } from "../../constants/tokens";
import { STATUSES } from "../../constants/statuses";
import { Ico } from "../ui";
import { PHASE_WIZARDS, markWizardSeen } from "../../constants/phaseWizards";

// ── PhaseWizardModal ───────────────────────────────────────
//
// Modale d'onboarding contextuel déclenchée au passage d'un projet
// vers une nouvelle phase. Une seule slide, ton calme et informatif —
// pas un blocker, mais une attention bienveillante sur les options
// qui viennent de devenir pertinentes.
//
// La modale se ferme :
//   - via "OK, c'est noté" (marque le wizard comme vu)
//   - via le CTA principal si présent (marque vu + déclenche `onAction`)
//   - via Escape (marque vu)
//   - via clic sur le backdrop (marque vu)
//
// Le marquage "vu" est systématique à toute fermeture pour respecter
// le principe "jamais intrusive" — si l'archi a vu la modale une fois,
// même brièvement, il ne la reverra pas pour cette phase.
//
// Props :
//   phaseId  id de la phase ("permit", "construction", "reception"…)
//            doit correspondre à une clé de PHASE_WIZARDS
//   onClose  () => void  — appelé à la fermeture (toute cause)
//   onAction (actionId) => void  — appelé au clic sur le CTA principal
//                                  avant onClose

export function PhaseWizardModal({ phaseId, onClose, onAction }) {
  const wizard = PHASE_WIZARDS[phaseId];
  const phase = STATUSES.find(s => s.id === phaseId) || STATUSES[0];

  // Marque comme vu et ferme. Centralisé pour garantir que toutes
  // les voies de fermeture (Escape, backdrop, boutons) appellent
  // le même handler.
  const dismiss = () => {
    markWizardSeen(phaseId);
    onClose?.();
  };

  // Escape pour fermer — pattern modal standard.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") dismiss(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!wizard) return null;

  const handleCta = () => {
    markWizardSeen(phaseId);
    if (wizard.cta?.action) onAction?.(wizard.cta.action);
    onClose?.();
  };

  return (
    <div
      onClick={dismiss}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 260,
        background: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        animation: "fadeIn 0.2s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="phase-wizard-title"
        style={{
          background: WH,
          borderRadius: 16,
          width: "100%",
          maxWidth: 540,
          maxHeight: "90vh",
          overflowY: "auto",
          fontFamily: "inherit",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.2)",
          animation: "scaleIn 0.22s ease",
        }}
      >
        {/* Bande colorée en tête — couleur de la phase pour ancrer
            visuellement le contexte. */}
        <div
          style={{
            background: phase.bg,
            padding: "20px 24px 18px",
            position: "relative",
            borderRadius: "16px 16px 0 0",
          }}
        >
          <button
            onClick={dismiss}
            aria-label="Fermer"
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              background: "rgba(255,255,255,0.6)",
              border: "none",
              borderRadius: 8,
              width: 30,
              height: 30,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.95)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.6)"; }}
          >
            <Ico name="x" size={14} color={phase.color} />
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: phase.color }} />
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              color: phase.color,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}>
              Phase {phase.label}
            </span>
          </div>

          <h2
            id="phase-wizard-title"
            style={{
              fontSize: 19,
              fontWeight: 800,
              color: TX,
              margin: 0,
              lineHeight: 1.25,
              letterSpacing: "-0.3px",
            }}
          >
            {wizard.title}
          </h2>
        </div>

        {/* Corps : intro + features */}
        <div style={{ padding: "18px 24px 20px" }}>
          <p
            style={{
              margin: "0 0 18px",
              fontSize: 13,
              color: TX2,
              lineHeight: 1.55,
            }}
          >
            {wizard.intro}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(wizard.features || []).map((f, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  padding: "10px 12px",
                  background: SB,
                  border: `1px solid ${SBB}`,
                  borderRadius: 10,
                }}
              >
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    background: WH,
                    border: `1px solid ${SBB}`,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Ico name={f.icon} size={14} color={phase.color} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: TX,
                    marginBottom: 2,
                  }}>
                    {f.title}
                  </div>
                  <div style={{
                    fontSize: 12,
                    color: TX2,
                    lineHeight: 1.5,
                  }}>
                    {f.description}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer actions */}
          <div
            style={{
              display: "flex",
              gap: 8,
              marginTop: 20,
              justifyContent: "flex-end",
            }}
          >
            <button
              onClick={dismiss}
              style={{
                padding: "10px 16px",
                border: `1px solid ${SBB}`,
                borderRadius: 9,
                background: WH,
                color: TX2,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {wizard.cta ? "Plus tard" : "OK, c'est noté"}
            </button>
            {wizard.cta && (
              <button
                onClick={handleCta}
                style={{
                  padding: "10px 18px",
                  border: "none",
                  borderRadius: 9,
                  background: AC,
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {wizard.cta.label}
                <Ico name="arrowr" size={12} color="#fff" />
              </button>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes scaleIn {
          from { transform: scale(0.96); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export default PhaseWizardModal;
