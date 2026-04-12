import { useT } from "../../i18n";
import { AC, SB, SBB, TX, TX2, TX3, WH, GR } from "../../constants/tokens";
import { PLANS } from "../../constants/config";
import { Ico } from "../ui";

export function PricingSection({ currentPlan, onSelectPlan }) {
  const t = useT();
  const plans = [
    { ...PLANS.free, desc: t("plan.freeDesc"), features: ["1 projet", "3 PV / mois", "3 IA / mois", "PDF avec watermark"] },
    { ...PLANS.pro, desc: t("plan.proDesc"), popular: true, features: ["Projets illimités", "PV illimités", "IA illimitée", "Envoi email PV", "Galerie photos", "Planning & Lots", "3 collaborateurs / projet", "PDF sans watermark"] },
    { ...PLANS.team, desc: t("plan.teamDesc"), features: ["Tout le Pro", "Collaborateurs illimités", "Rôles & permissions", "Dashboard complet", "Planning cross-projets", "Export CSV", "PDF logo personnalisé", "Support prioritaire"] },
  ];
  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 700, color: TX, marginBottom: 4 }}>Votre abonnement</div>
      <div style={{ fontSize: 12, color: TX3, marginBottom: 16 }}>Plan actuel : <strong style={{ color: AC }}>{PLANS[currentPlan]?.label || "Free"}</strong></div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {plans.map(p => {
          const isCurrent = p.id === currentPlan;
          return (
            <div key={p.id} style={{ flex: "1 1 200px", minWidth: 180, background: WH, border: `${p.popular ? "2px" : "1px"} solid ${p.popular ? AC : SBB}`, borderRadius: 14, padding: "18px 16px", position: "relative", display: "flex", flexDirection: "column" }}>
              {p.popular && <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#fff", background: AC, padding: "2px 10px", borderRadius: 10 }}>Populaire</div>}
              <div style={{ fontSize: 16, fontWeight: 700, color: TX }}>{p.label}</div>
              <div style={{ fontSize: 11, color: TX3, marginBottom: 10 }}>{p.desc}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 2, marginBottom: 12 }}>
                <span style={{ fontSize: 28, fontWeight: 800, color: TX }}>{p.price === 0 ? "0" : p.price}€</span>
                <span style={{ fontSize: 11, color: TX3 }}>/mois</span>
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
                <button onClick={() => onSelectPlan(p.id)} style={{ width: "100%", padding: "9px 16px", border: "none", borderRadius: 8, background: p.popular ? AC : SB, color: p.popular ? "#fff" : TX, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginTop: 14 }}>
                  {p.price === 0 ? "Rétrograder" : `Passer au ${p.label}`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
