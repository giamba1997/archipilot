/**
 * Monthly AI usage tracking — enforces maxAiPerMonth per plan.
 *
 * checkAiUsage() throws PlanUpgradeError when the user is at their limit.
 * incrementAiUsage() bumps the counter after a successful AI call.
 *
 * The ai_usage table is keyed on (user_id, year_month="YYYY-MM").
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PlanUpgradeError, type AuthenticatedUser } from "./auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Per-plan monthly cap. Infinity = no limit. Mirrors src/constants/config.js. */
const MAX_AI_PER_MONTH: Record<string, number> = {
  free: 3,
  pro: Infinity,
  team: Infinity,
};

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Throws PlanUpgradeError if the user has reached their monthly AI cap.
 * Returns the current count otherwise (for display purposes).
 */
export async function checkAiUsage(user: AuthenticatedUser): Promise<number> {
  const cap = MAX_AI_PER_MONTH[user.plan] ?? MAX_AI_PER_MONTH.free;
  if (!isFinite(cap)) return 0; // No limit for this plan

  const supabase = adminClient();
  const ym = currentYearMonth();
  const { data } = await supabase
    .from("ai_usage")
    .select("count")
    .eq("user_id", user.id)
    .eq("year_month", ym)
    .maybeSingle();

  const current = data?.count ?? 0;
  if (current >= cap) {
    throw new PlanUpgradeError(
      "maxAiPerMonth",
      user.plan,
      "pro",
      `Vous avez atteint la limite de ${cap} générations IA ce mois-ci sur le plan ${user.plan}. Passez à Pro pour une IA illimitée.`,
    );
  }
  return current;
}

/**
 * Bump the monthly counter. Call after a successful AI response so failed
 * calls don't burn the user's quota. Safe to call for unlimited plans (no-op).
 */
export async function incrementAiUsage(user: AuthenticatedUser): Promise<void> {
  const cap = MAX_AI_PER_MONTH[user.plan] ?? MAX_AI_PER_MONTH.free;
  if (!isFinite(cap)) return;

  const supabase = adminClient();
  const ym = currentYearMonth();

  // Upsert with increment: insert new row or bump count atomically.
  // Supabase JS doesn't support atomic UPDATE+INCREMENT in one call, so we
  // do a read-modify-write. Good enough given free-plan volume (≤3/month).
  const { data } = await supabase
    .from("ai_usage")
    .select("count")
    .eq("user_id", user.id)
    .eq("year_month", ym)
    .maybeSingle();

  const next = (data?.count ?? 0) + 1;
  await supabase
    .from("ai_usage")
    .upsert({ user_id: user.id, year_month: ym, count: next, updated_at: new Date().toISOString() });
}
