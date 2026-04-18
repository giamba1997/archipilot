import { useState, useEffect, useCallback } from "react";
import { AC, ACL, TX, TX2, TX3, SB, SBB, WH, GR } from "../../constants/tokens";
import { Ico } from "../ui";

/**
 * Guided Tour — tooltip bubbles pointing to real UI elements.
 * Uses an SVG overlay with a cutout to keep the highlighted area sharp (no blur).
 */

const TOUR_STEPS = [
  {
    title: "Vue d'ensemble du projet",
    message: "Voici la page principale de votre projet. Vous y trouverez les infos clés, les participants, l'historique des PV et les actions en cours.",
    selector: ".ap-overview-wrap",
    fallback: ".ap-content",
    align: "center",
    icon: "building",
  },
  {
    title: "Menu de navigation",
    message: "Le menu latéral vous permet de basculer entre vos projets. Cliquez sur \"+\" pour en créer un nouveau.",
    selector: ".ap-sidebar-desktop > div",
    fallback: ".ap-sidebar-desktop",
    align: "right",
    icon: "menu",
  },
  {
    title: "Barre d'outils",
    message: "La barre en haut contient la recherche, les notifications et l'accès rapide à votre profil. Le nom de la vue active s'affiche à gauche.",
    selector: ".ap-header",
    align: "bottom",
    icon: "edit",
  },
  {
    title: "Rédiger un PV",
    message: "Ce bouton lance la rédaction d'un procès-verbal. Ajoutez vos remarques poste par poste, puis laissez l'IA générer le PV complet.",
    selector: ".ap-cta-newpv",
    fallback: ".ap-overview-wrap",
    align: "bottom",
    icon: "file",
  },
  {
    title: "Collaboration",
    message: "Invitez des collaborateurs sur vos projets via ce bouton. Vous pouvez leur attribuer un rôle : administrateur, contributeur ou lecteur.",
    selector: ".ap-cta-collab",
    fallback: ".ap-overview-wrap",
    align: "bottom",
    icon: "users",
  },
  {
    title: "Paramètres du profil",
    message: "Cliquez sur votre avatar pour accéder au Profil. Configurez vos informations, l'apparence de vos PDF, la langue, votre abonnement et l'export de vos données.",
    selector: ".sb-avatar",
    fallback: ".ap-sidebar-desktop > div",
    align: "right",
    icon: "user",
  },
  {
    title: "Vous êtes prêt !",
    message: "Vous avez toutes les clés en main. Commencez par rédiger votre premier PV — ArchiPilot vous accompagne à chaque étape.",
    selector: null,
    align: "center",
    icon: "check",
    final: true,
  },
];

function TourOverlay({ rect }) {
  // SVG overlay with a rectangular cutout for the highlighted element
  // This keeps the target element fully visible and sharp (no blur)
  if (!rect) {
    return <div style={{ position: "fixed", inset: 0, background: "rgba(31,41,55,0.55)", zIndex: 10003 }} />;
  }

  const pad = 6;
  const r = 12;
  const x = rect.left - pad;
  const y = rect.top - pad;
  const w = rect.width + pad * 2;
  const h = rect.height + pad * 2;

  return (
    <svg style={{ position: "fixed", inset: 0, width: "100%", height: "100%", zIndex: 10003, pointerEvents: "none" }}>
      <defs>
        <mask id="tour-mask">
          <rect width="100%" height="100%" fill="white" />
          <rect x={x} y={y} width={w} height={h} rx={r} ry={r} fill="black" />
        </mask>
      </defs>
      <rect width="100%" height="100%" fill="rgba(31,41,55,0.55)" mask="url(#tour-mask)" />
      <rect x={x} y={y} width={w} height={h} rx={r} ry={r}
        fill="none" stroke={AC} strokeWidth="2"
        style={{ transition: "all .4s cubic-bezier(.5,.1,.25,1)" }} />
    </svg>
  );
}

function TourTooltip({ step, total, currentStep, onNext, onPrev, onSkip }) {
  const [rect, setRect] = useState(null);

  const updatePosition = useCallback(() => {
    if (!currentStep.selector) {
      setRect(null);
      return;
    }
    let el = document.querySelector(currentStep.selector);
    if (!el && currentStep.fallback) {
      el = document.querySelector(currentStep.fallback);
    }
    if (el) {
      setRect(el.getBoundingClientRect());
    } else {
      setRect(null);
    }
  }, [currentStep.selector, currentStep.fallback]);

  useEffect(() => {
    updatePosition();
    window.addEventListener("resize", updatePosition);
    // Re-measure after a small delay (DOM may still be rendering)
    const t = setTimeout(updatePosition, 100);
    return () => { window.removeEventListener("resize", updatePosition); clearTimeout(t); };
  }, [updatePosition, step]);

  // Position the tooltip card relative to the highlighted element
  // Account for the sidebar (264px) when centering in the main content area
  const sidebarWidth = document.querySelector(".ap-sidebar-desktop > div")?.getBoundingClientRect().width || 0;
  let tooltipStyle = {};
  if (currentStep.align === "center" || !rect) {
    const centerX = sidebarWidth + (window.innerWidth - sidebarWidth) / 2;
    tooltipStyle = { top: "50%", left: centerX, transform: "translate(-50%, -50%)" };
  } else if (currentStep.align === "right") {
    const top = Math.min(Math.max(80, rect.top + rect.height / 2 - 100), window.innerHeight - 320);
    const left = Math.min(rect.right + 20, window.innerWidth - 400);
    tooltipStyle = { top, left };
  } else if (currentStep.align === "bottom") {
    const top = Math.min(rect.bottom + 16, window.innerHeight - 280);
    const left = Math.max(20, Math.min(rect.left + rect.width / 2 - 190, window.innerWidth - 400));
    tooltipStyle = { top, left };
  }

  return (
    <>
      {/* Overlay with cutout */}
      <TourOverlay rect={currentStep.final ? null : rect} />

      {/* Click blocker (allows clicking "next" but blocks the rest) */}
      <div style={{ position: "fixed", inset: 0, zIndex: 10004 }} />

      {/* Tooltip card */}
      <div key={step} style={{
        position: "fixed", ...tooltipStyle,
        maxWidth: 380, width: "calc(100% - 40px)",
        background: WH, borderRadius: 16, padding: "24px 24px 20px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        zIndex: 10005,
        animation: "tourFadeUp .3s ease both",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}>
        <style>{`@keyframes tourFadeUp { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }`}</style>

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
            <div style={{ fontSize: 10, fontWeight: 700, color: currentStep.final ? GR : AC, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              {currentStep.final ? "C'est parti" : `${step + 1} / ${total}`}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: TX }}>{currentStep.title}</div>
          </div>
        </div>

        {/* Message */}
        <div style={{ fontSize: 13, color: TX2, lineHeight: 1.6, marginBottom: 20 }}>
          {currentStep.message}
        </div>

        {/* Progress dots */}
        <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
          {Array.from({ length: total }).map((_, i) => (
            <div key={i} style={{ width: i === step ? 20 : 6, height: 6, borderRadius: 3, background: i <= step ? AC : SBB, transition: "all .3s" }} />
          ))}
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
