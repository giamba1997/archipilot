/**
 * Persistent rate limiting using Supabase.
 *
 * Uses a `rate_limits` table to track usage per user per action.
 * Unlike in-memory rate limiting, this survives function restarts.
 *
 * Required table:
 *   CREATE TABLE IF NOT EXISTS rate_limits (
 *     id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *     user_id uuid NOT NULL,
 *     action text NOT NULL,
 *     window_start timestamptz NOT NULL DEFAULT now(),
 *     count integer NOT NULL DEFAULT 1,
 *     UNIQUE(user_id, action)
 *   );
 */

import { getAdminClient } from "./auth.ts";

export interface RateLimitConfig {
  /** Identifier for the action (e.g. "generate_pv", "send_email") */
  action: string;
  /** Maximum number of calls allowed in the window */
  maxCalls: number;
  /** Window duration in seconds (default: 3600 = 1 hour) */
  windowSeconds?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  current: number;
  limit: number;
  resetAt: string;
}

/**
 * Check and increment the rate limit for a user + action.
 * Returns whether the request is allowed.
 */
export async function checkRateLimit(
  userId: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const { action, maxCalls, windowSeconds = 3600 } = config;
  const supabase = getAdminClient();
  const now = new Date();

  // Try to get existing rate limit entry
  const { data: existing } = await supabase
    .from("rate_limits")
    .select("*")
    .eq("user_id", userId)
    .eq("action", action)
    .single();

  if (existing) {
    const windowStart = new Date(existing.window_start);
    const windowEnd = new Date(windowStart.getTime() + windowSeconds * 1000);

    // Window expired — reset
    if (now > windowEnd) {
      await supabase
        .from("rate_limits")
        .update({ count: 1, window_start: now.toISOString() })
        .eq("user_id", userId)
        .eq("action", action);

      return {
        allowed: true,
        current: 1,
        limit: maxCalls,
        resetAt: new Date(now.getTime() + windowSeconds * 1000).toISOString(),
      };
    }

    // Within window — check limit
    if (existing.count >= maxCalls) {
      return {
        allowed: false,
        current: existing.count,
        limit: maxCalls,
        resetAt: windowEnd.toISOString(),
      };
    }

    // Increment
    await supabase
      .from("rate_limits")
      .update({ count: existing.count + 1 })
      .eq("user_id", userId)
      .eq("action", action);

    return {
      allowed: true,
      current: existing.count + 1,
      limit: maxCalls,
      resetAt: windowEnd.toISOString(),
    };
  }

  // No entry — create one
  await supabase.from("rate_limits").insert({
    user_id: userId,
    action,
    count: 1,
    window_start: now.toISOString(),
  });

  return {
    allowed: true,
    current: 1,
    limit: maxCalls,
    resetAt: new Date(now.getTime() + windowSeconds * 1000).toISOString(),
  };
}
