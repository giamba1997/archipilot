import { useState, useEffect, useCallback } from "react";
import { AC, ACL, TX, TX2, TX3, SB, SBB, WH, GR } from "../../constants/tokens";
import { Ico } from "../ui";

/**
 * Guided Tour — shows tooltip bubbles pointing to real UI elements.
 * Each step targets a CSS selector and shows a message.
 */

const TOUR_STEPS = [
  {
    title: "Votre projet",
    message: "Voici la vue d'ensemble de votre projet. Vous y trouverez les infos clés, les participants, et l'historique des PV.",
    selector: ".ap-content",
    position: "center",
    icon: "building",
  },
  {
    title: "La barre latérale",
    message: "Naviguez entre vos projets depuis le menu. Vous pouvez en créer de nouveaux avec le bouton \"+\".",
    selector: ".ap-sidebar-desktop",
    position: "right",
    icon: "menu",
  },
  {
    title: "Rédiger un PV",
    message: "Cliquez sur \"Rédiger\" dans la vue projet pour commencer un procès-verbal. Ajoutez vos remarques poste par poste, puis générez le PV par IA.",
    selector: ".ap-header",
    position: "bottom",
    icon: "edit",
  },
  {
    title: "Navigation du projet",
    message: "Depuis la vue projet, accédez à la Galerie photos, aux Documents, au Planning et aux Checklists via les onglets en haut.",
    selector: ".ap-header",
    position: "bottom",
    icon: "file",
  },
  {
    title: "Collaboration",
    message: "Invitez vos collaborateurs sur un projet via le bouton de partage. Ils pourront contribuer ou consulter selon leur rôle.",
    selector: ".ap-header",
    position: "bottom",
    icon: "users",
  },
  {
    title: "Votre profil",
    message: "Configurez vos informations dans le Profil : nom, structure, apparence du PDF, langue, et abonnement. C'est aussi là que vous retrouverez vos données.",
    selector: ".ap-sidebar-desktop",
    position: "right",
    icon: "user",
  },
  {
    title: "Vous êtes prêt !",
    message: "Commencez par rédiger votre premier PV. ArchiPilot vous guide tout au long du processus avec l'aide de l'IA.",
    selector: null,
    position: "center",
    icon: "check",
    final: true,
  },
];

function TourTooltip({ step, total, currentStep, onNext, onPrev, onSkip }) {
  const [rect, setRect] = useState(null);

  const updatePosition = useCallback(() => {
    if (!currentStep.selector) {
      setRect(null);
      return;
    }
    const el = document.querySelector(currentStep.selector);
    if (el) {
      setRect(el.getBoundingClientRect());
    }
  }, [currentStep.selector]);

  useEffect(() => {
    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [updatePosition]);

  // Calculate tooltip position
  let tooltipStyle = {};
  if (currentStep.position === "center" || !rect) {
    tooltipStyle = { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  } else if (currentStep.position === "right") {
    tooltipStyle = { top: Math.max(80, rect.top + 20), left: rect.right + 16 };
  } else if (currentStep.position === "bottom") {
    tooltipStyle = { top: rect.bottom + 16, left: Math.max(280, rect.left + rect.width / 2 - 180) };
  }

  return (
    <>
      {/* Scrim */}
      <div style={{ position: "fixed", inset: 0, background: "rgba(31,41,55,0.50)", backdropFilter: "blur(2px)", zIndex: 10003 }} />

      {/* Highlight target element */}
      {rect && !currentStep.final && (
        <div style={{
          position: "fixed", top: rect.top - 4, left: rect.left - 4,
          width: rect.width + 8, height: rect.height + 8,
          borderRadius: 12, border: `2px solid ${AC}`,
          boxShadow: `0 0 0 9999px rgba(31,41,55,0.50)`,
          zIndex: 10004, pointerEvents: "none",
          transition: "all .4s cubic-bezier(.5,.1,.25,1)",
        }} />
      )}

      {/* Tooltip card */}
      <div style={{
        position: "fixed", ...tooltipStyle,
        maxWidth: 380, width: "90%",
        background: WH, borderRadius: 16, padding: "24px 24px 20px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        zIndex: 10005,
        animation: "onbFadeUp .3s ease both",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}>
        <style>{`@keyframes onbFadeUp { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }`}</style>

        {/* Icon + title */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: currentStep.final ? `${GR}18` : `${AC}15`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Ico name={currentStep.icon} size={16} color={currentStep.final ? GR : AC} />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: AC, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              {currentStep.final ? "C'est parti" : `${step + 1} / ${total}`}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: TX }}>{currentStep.title}</div>
          </div>
        </div>

        {/* Message */}
        <div style={{ fontSize: 13, color: TX2, lineHeight: 1.6, marginBottom: 20 }}>
          {currentStep.message}
        </div>

        {/* Navigation */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {!currentStep.final ? (
            <button onClick={onSkip}
              style={{ border: "none", background: "transparent", color: TX3, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", padding: "6px 0" }}>
              Passer le tour
            </button>
          ) : <div />}
          <div style={{ display: "flex", gap: 8 }}>
            {step > 0 && !currentStep.final && (
              <button onClick={onPrev}
                style={{ padding: "8px 14px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, color: TX2, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                Précédent
              </button>
            )}
            <button onClick={onNext}
              style={{ padding: "8px 18px", border: "none", borderRadius: 8, background: currentStep.final ? GR : AC, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
              {currentStep.final ? "Commencer" : "Suivant"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export function GuidedTour({ onComplete }) {
  const [step, setStep] = useState(0);

  const handleNext = () => {
    if (step >= TOUR_STEPS.length - 1) {
      onComplete();
    } else {
      setStep(s => s + 1);
    }
  };

  return (
    <TourTooltip
      step={step}
      total={TOUR_STEPS.length}
      currentStep={TOUR_STEPS[step]}
      onNext={handleNext}
      onPrev={() => setStep(s => Math.max(0, s - 1))}
      onSkip={onComplete}
    />
  );
}
