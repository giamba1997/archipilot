import { AC, ACL, ACL2, SB, SBB, TX, TX2, TX3, WH, GR, FS, SP, RAD } from "../../constants/tokens";
import { PLANS } from "../../constants/config";
import { Ico } from "../ui";

const PLAN_HIGHLIGHTS = {
  pro: [
    "Projets & PV illimités",
    "IA illimitée",
    "Envoi des PV par email",
    "Galerie photos",
    "Planning & gestion des lots",
    "3 collaborateurs par projet",
    "PDF sans watermark",
  ],
  team: [
    "Tout le plan Pro",
    "Collaborateurs illimités",
    "Rôles & permissions avancés",
    "Dashboard complet",
    "Export CSV",
    "PDF avec logo personnalisé",
    "Support prioritaire",
  ],
};

export function UpgradeRequiredModal({
  feature,
  message,
  currentPlan = "free",
  requiredPlan = "pro",
  onClose,
  onUpgrade,
}) {
  const plan = PLANS[requiredPlan] || PLANS.pro;
  const highlights = PLAN_HIGHLIGHTS[requiredPlan] || PLAN_HIGHLIGHTS.pro;

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(28, 23, 20, 0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 700, padding: SP.lg, backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: WH, borderRadius: RAD.xxl, width: "100%", maxWidth: 460,
          maxHeight: "90vh", overflow: "auto",
          boxShadow: "0 24px 60px rgba(44, 41, 38, 0.25)",
          animation: "modalIn 0.22s ease-out", position: "relative",
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Fermer"
          style={{
            position: "absolute", top: SP.md, right: SP.md, width: 30, height: 30,
            border: "none", borderRadius: RAD.full, background: SB, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2,
          }}
        >
          <Ico name="x" size={14} color={TX2} />
        </button>

        {/* Hero — warm gradient backdrop with lock */}
        <div
          style={{
            padding: `${SP.xxxl}px ${SP.xxl}px ${SP.xl}px`,
            background: `linear-gradient(180deg, ${ACL} 0%, ${WH} 100%)`,
            borderTopLeftRadius: RAD.xxl, borderTopRightRadius: RAD.xxl,
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 64, height: 64, borderRadius: RAD.full, background: WH,
              border: `1px solid ${ACL2}`,
              boxShadow: "0 8px 24px rgba(192, 90, 44, 0.15)",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              marginBottom: SP.lg,
            }}
          >
            <Ico name="lock" size={26} color={AC} />
          </div>
          <div
            style={{
              display: "inline-block", padding: "4px 12px", background: AC, color: WH,
              borderRadius: RAD.md, fontSize: FS.xs, fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: SP.md,
            }}
          >
            Fonctionnalité {plan.label}
          </div>
          <div style={{ fontSize: FS.xl, fontWeight: 700, color: TX, lineHeight: 1.3, marginBottom: SP.sm }}>
            Débloquez tout le potentiel d'ArchiPilot
          </div>
          <div style={{ fontSize: FS.md, color: TX2, lineHeight: 1.5 }}>
            {message || `Cette fonctionnalité est réservée au plan ${plan.label}.`}
          </div>
        </div>

        {/* Plan card */}
        <div style={{ padding: `${SP.lg}px ${SP.xxl}px ${SP.xxl}px` }}>
          <div
            style={{
              border: `2px solid ${AC}`, borderRadius: RAD.xl, padding: SP.xl,
              background: WH, position: "relative",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: SP.md }}>
              <div style={{ fontSize: FS.lg, fontWeight: 700, color: TX }}>{plan.label}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
                <span style={{ fontSize: 26, fontWeight: 800, color: TX }}>{plan.price}€</span>
                <span style={{ fontSize: FS.sm, color: TX3 }}>/mois</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: SP.sm }}>
              {highlights.map((h, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: SP.sm, fontSize: FS.md, color: TX }}>
                  <div
                    style={{
                      width: 18, height: 18, borderRadius: RAD.full, background: ACL,
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}
                  >
                    <Ico name="check" size={10} color={AC} />
                  </div>
                  <span>{h}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Current plan note */}
          <div style={{ marginTop: SP.md, fontSize: FS.sm, color: TX3, textAlign: "center" }}>
            Plan actuel&nbsp;:&nbsp;<strong style={{ color: TX2 }}>{PLANS[currentPlan]?.label || "Free"}</strong>
          </div>

          {/* CTAs */}
          <div style={{ display: "flex", flexDirection: "column", gap: SP.sm, marginTop: SP.xl }}>
            <button
              onClick={onUpgrade}
              style={{
                width: "100%", padding: "13px 20px", border: "none", borderRadius: RAD.lg,
                background: AC, color: WH, fontSize: FS.md, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit",
                display: "flex", alignItems: "center", justifyContent: "center", gap: SP.sm,
                transition: "transform 0.15s ease, box-shadow 0.15s ease",
                boxShadow: "0 4px 14px rgba(192, 90, 44, 0.3)",
              }}
              onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
              onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              Passer à {plan.label}
              <Ico name="arrowr" size={14} color={WH} />
            </button>
            <button
              onClick={onClose}
              style={{
                width: "100%", padding: "11px 20px", border: "none", borderRadius: RAD.lg,
                background: "transparent", color: TX3, fontSize: FS.sm, fontWeight: 500,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Peut-être plus tard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
