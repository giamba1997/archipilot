import { SB, SBB, TX, TX3 } from "../../constants/tokens";
import { PLANS, PLAN_FEATURES, hasFeature } from "../../constants/config";
import { Ico } from "../ui";

export function UpgradeGate({ plan, feature, children, fallback }) {
  if (hasFeature(plan, feature)) return children;
  if (fallback) return fallback;
  const minPlan = PLAN_FEATURES[feature]?.pro ? "pro" : "team";
  return (
    <div style={{ padding: "16px", background: SB, borderRadius: 10, border: `1px solid ${SBB}`, textAlign: "center" }}>
      <Ico name="lock" size={20} color={TX3} />
      <div style={{ fontSize: 12, fontWeight: 600, color: TX, marginTop: 6 }}>Fonctionnalité {PLANS[minPlan]?.label}</div>
      <div style={{ fontSize: 11, color: TX3, marginTop: 2 }}>Passez au plan {PLANS[minPlan]?.label} pour débloquer</div>
    </div>
  );
}
