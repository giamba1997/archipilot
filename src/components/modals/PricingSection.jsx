import { useState } from "react";
import { useT } from "../../i18n";
import { AC, SB, SBB, TX, TX2, TX3, WH, GR, RD } from "../../constants/tokens";
import { PLANS } from "../../constants/config";
import { Ico } from "../ui";

// TODO: Activer Stripe quand prêt pour la commercialisation
// import { createCheckoutSession, openBillingPortal } from "../../db";
const STRIPE_ENABLED = false;

export function PricingSection({ currentPlan, onSelectPlan }) {
  const t = useT();
  const [loading, setLoading] = useState(null);
  const [period, setPeriod] = useState("month");
  const [error, setError] = useState("");
  const [changed, setChanged] = useState(false);

  const plans = [
    { ...PLANS.free, desc: t("plan.freeDesc"), features: ["1 projet", "3 PV / mois", "3 IA / mois", "PDF avec watermark"] },
    { ...PLANS.pro, desc: t("plan.proDesc"), popular: true, features: ["Projets illimités", "PV illimités", "IA illimitée", "Envoi email PV", "Galerie photos", "Planning & Lots", "3 collaborateurs / projet", "PDF sans watermark"] },
    { ...PLANS.team, desc: t("plan.teamDesc"), features: ["Tout le Pro", "Collaborateurs illimités", "Rôles & permissions", "Dashboard complet", "Planning cross-projets", "Export CSV", "PDF logo personnalisé", "Support prioritaire"] },
  ];

  const handleSelectPlan = async (planId) => {
    setLoading(planId);
    setError("");

    if (STRIPE_ENABLED) {
      // Production: Stripe checkout / portal
      try {
        const { createCheckoutSession, openBillingPortal } = await import("../../db");
        if (planId === "free") {
          await openBillingPortal();
        } else {
          await createCheckoutSession(planId, period);
        }
      } catch (e) {
        setError(e.message);
      }
      setLoading(null);
      return;
    }

    // Mode test: changement direct du plan
    onSelectPlan(planId);
    setChanged(true);
    setTimeout(() => setChanged(false), 2500);
    setLoading(null);
  };

  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 700, color: TX, marginBottom: 4 }}>Votre abonnement</div>
      <div style={{ fontSize: 12, color: TX3, marginBottom: 12 }}>
        Plan actuel : <strong style={{ color: AC }}>{PLANS[currentPlan]?.label || "Free"}</strong>
        {!STRIPE_ENABLED && <span style={{ marginLeft: 8, fontSize: 10, padding: "2px 8px", background: "#FDF4E7", color: AC, borderRadius: 6, fontWeight: 600 }}>Mode test</span>}
      </div>

      {changed && (
        <div style={{ padding: "10px 14px", background: "#EAF3DE", border: "1px solid #C6E9B4", borderRadius: 10, marginBottom: 14, fontSize: 13, color: GR, display: "flex", alignItems: "center", gap: 8 }}>
          <Ico name="check" size={16} color={GR} />
          Plan mis à jour ! Toutes les fonctionnalités sont maintenant accessibles.
        </div>
      )}

      {/* Period toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => setPeriod("month")}
          style={{
            padding: "6px 14px", border: `1px solid ${period === "month" ? AC : SBB}`,
            borderRadius: 8, background: period === "month" ? `${AC}12` : WH,
            color: period === "month" ? AC : TX2, fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Mensuel
        </button>
        <button
          onClick={() => setPeriod("year")}
          style={{
            padding: "6px 14px", border: `1px solid ${period === "year" ? AC : SBB}`,
            borderRadius: 8, background: period === "year" ? `${AC}12` : WH,
            color: period === "year" ? AC : TX2, fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Annuel
          <span style={{ fontSize: 10, color: GR, fontWeight: 700, marginLeft: 4 }}>-17%</span>
        </button>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, marginBottom: 14, fontSize: 13, color: RD }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {plans.map(p => {
          const isCurrent = p.id === currentPlan;
          const isLoading = loading === p.id;
          const displayPrice = period === "year" ? Math.round((p.priceYear || p.price * 12) / 12) : p.price;

          return (
            <div key={p.id} style={{ flex: "1 1 200px", minWidth: 180, background: WH, border: `${p.popular ? "2px" : "1px"} solid ${p.popular ? AC : SBB}`, borderRadius: 14, padding: "18px 16px", position: "relative", display: "flex", flexDirection: "column" }}>
              {p.popular && <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#fff", background: AC, padding: "2px 10px", borderRadius: 10 }}>Populaire</div>}
              <div style={{ fontSize: 16, fontWeight: 700, color: TX }}>{p.label}</div>
              <div style={{ fontSize: 11, color: TX3, marginBottom: 10 }}>{p.desc}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 2, marginBottom: 12 }}>
                <span style={{ fontSize: 28, fontWeight: 800, color: TX }}>{displayPrice}€</span>
                <span style={{ fontSize: 11, color: TX3 }}>/mois</span>
                {period === "year" && p.price > 0 && (
                  <span style={{ fontSize: 10, color: TX3, marginLeft: 4, textDecoration: "line-through" }}>{p.price}€</span>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
                {p.features.map((f, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: TX2 }}>
                    <Ico name="check" size={10} color={GR} />
                    {f}
                  </div>
                ))}
              </div>
              {isCurrent ? (
                <div style={{ width: "100%", padding: "9px 16px", border: `1px solid ${SBB}`, borderRadius: 8, textAlign: "center", fontSize: 12, fontWeight: 600, color: TX3, marginTop: 14 }}>Plan actuel</div>
              ) : (
                <button
                  onClick={() => handleSelectPlan(p.id)}
                  disabled={isLoading}
                  style={{
                    width: "100%", padding: "9px 16px", border: "none", borderRadius: 8,
                    background: isLoading ? "#D3D1C7" : p.popular ? AC : SB,
                    color: p.popular ? "#fff" : TX, fontSize: 12, fontWeight: 600,
                    cursor: isLoading ? "wait" : "pointer", fontFamily: "inherit", marginTop: 14,
                  }}
                >
                  {isLoading ? "Changement..." : p.price === 0 ? "Rétrograder" : `Essayer ${p.label}`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
