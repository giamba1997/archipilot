/**
 * Shared authentication & plan verification for Edge Functions.
 *
 * authenticateUser() verifies the JWT and returns the user + their plan.
 * requirePlan() checks that the user's plan allows a specific feature.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Plan feature limits — mirrors src/constants/config.js */
const PLAN_FEATURES: Record<string, Record<string, boolean | number>> = {
  maxPvPerMonth:    { free: 3,     pro: Infinity, team: Infinity },
  maxAiPerMonth:    { free: 3,     pro: Infinity, team: Infinity },
  maxCollabPerProj: { free: 0,     pro: 3,        team: Infinity },
  sendEmail:        { free: false, pro: true,     team: true },
  gallery:          { free: false, pro: true,     team: true },
  planning:         { free: false, pro: true,     team: true },
  lots:             { free: false, pro: true,     team: true },
  checklists:       { free: false, pro: true,     team: true },
  roles:            { free: false, pro: false,    team: true },
  exportCsv:        { free: false, pro: false,    team: true },
};

export interface AuthenticatedUser {
  id: string;
  email: string;
  plan: string;
}

/** Create a Supabase admin client (service role). */
export function getAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Verify the Bearer token and return the authenticated user with their plan.
 * Throws if unauthorized.
 */
export async function authenticateUser(req: Request): Promise<AuthenticatedUser> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Missing authorization");

  const supabase = getAdminClient();
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw new Error("Unauthorized");

  // Fetch the user's plan from the profiles table (non-blocking — default to free)
  let plan = "free";
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.plan) plan = profile.plan;
  } catch (e) {
    console.error("Failed to fetch profile plan, defaulting to free:", e);
  }

  return {
    id: user.id,
    email: user.email || "",
    plan,
  };
}

/** Check if a plan has access to a specific feature. */
export function hasFeature(plan: string, feature: string): boolean {
  const feat = PLAN_FEATURES[feature];
  if (!feat) return true; // unknown feature = allow
  return !!feat[plan];
}

/** Get the numerical limit for a plan feature. Returns Infinity if no limit. */
export function getLimit(plan: string, feature: string): number {
  const feat = PLAN_FEATURES[feature];
  if (!feat) return Infinity;
  const val = feat[plan];
  return typeof val === "number" ? val : Infinity;
}

/**
 * Throw if the user's plan does not have access to the given feature.
 */
export function requirePlan(user: AuthenticatedUser, feature: string): void {
  if (!hasFeature(user.plan, feature)) {
    throw new Error(`Cette fonctionnalité nécessite un plan supérieur (actuel : ${user.plan}).`);
  }
}
