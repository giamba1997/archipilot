// ─────────────────────────────────────────────────────────────
// Mobile Étape 4 — Edge Function `send-push-notification`
//
// Envoie une notification Web Push à tous les appareils abonnés d'un user.
//
// Deux modes d'invocation :
//   1. CLIENT (Authorization Bearer) → l'archi envoie une push à
//      LUI-MÊME (test, ou patterns client-triggered). target_user_id est
//      forcé à user.id, peu importe ce que le client envoie.
//   2. SERVICE ROLE (Authorization Bearer = service role key) → appel
//      inter-fonctions (depuis opr-signing par exemple) pour envoyer à
//      un user arbitraire. target_user_id est respecté.
//
// Payload accepté :
//   {
//     target_user_id?: string  (ignoré sauf si appelé avec service role)
//     category: "opr" | "permits" | "reserves" | "invoices" | "collab" | "reception"
//     title: string            (titre de la notif, max ~50 char)
//     body: string             (corps, max ~120 char)
//     deep_link?: string       (URL relative vers le projet/section)
//     icon?: string            (URL absolue, defaults to /icon-512.png)
//     data?: Record<string, unknown>  (passé tel quel au SW)
//   }
//
// Respecte les push_settings du destinataire :
//   - Si push_settings.enabled === false → no-op (success silencieux)
//   - Si push_settings[category] === false → no-op
//
// Retourne :
//   { sent: n, skipped: "disabled" | "category_off" | null, errors: [...] }
// ─────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import webpush from "npm:web-push@3.6.7";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { getAdminClient } from "../_shared/auth.ts";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:hello@archipilot.app";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  } catch (e) {
    console.error("setVapidDetails failed:", e);
  }
}

type Category = "opr" | "permits" | "reserves" | "invoices" | "collab" | "reception";
const VALID_CATEGORIES: Category[] = ["opr", "permits", "reserves", "invoices", "collab", "reception"];

interface PushPayload {
  target_user_id?: string;
  category: Category;
  title: string;
  body: string;
  deep_link?: string;
  icon?: string;
  data?: Record<string, unknown>;
}

// Resolve which user we're pushing to.
//   - Service role key → trust target_user_id from body (server-to-server)
//   - User JWT         → ignore target_user_id, push to self only
async function resolveTargetUser(req: Request, body: PushPayload): Promise<string | null> {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return null;

  // Service role short-circuit: caller is another edge function or trusted backend
  if (token === SUPABASE_SERVICE_ROLE_KEY) {
    return typeof body.target_user_id === "string" ? body.target_user_id : null;
  }

  // Otherwise verify JWT and force target = self
  const sb = getAdminClient();
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) return null;
  return user.id;
}

serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return jsonResponse(req, {
      error: "VAPID keys not configured. Set VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY in Supabase secrets.",
    }, 503);
  }

  try {
    const body = (await req.json()) as PushPayload;

    // Basic validation
    if (!body.title || !body.body) {
      return jsonResponse(req, { error: "Missing title or body" }, 400);
    }
    if (!body.category || !VALID_CATEGORIES.includes(body.category)) {
      return jsonResponse(req, { error: "Missing or invalid category" }, 400);
    }
    if (body.title.length > 100 || body.body.length > 250) {
      return jsonResponse(req, { error: "Title or body too long" }, 400);
    }

    const targetUserId = await resolveTargetUser(req, body);
    if (!targetUserId) {
      return jsonResponse(req, { error: "Unauthorized" }, 401);
    }

    const sb = getAdminClient();

    // Check user's push_settings — global kill-switch + per-category toggle
    const { data: profile, error: pErr } = await sb
      .from("profiles")
      .select("push_settings")
      .eq("id", targetUserId)
      .maybeSingle();
    if (pErr) {
      console.error("profile fetch error:", pErr);
      return jsonResponse(req, { error: "Failed to load preferences" }, 500);
    }
    const settings = (profile?.push_settings as Record<string, unknown>) || {};
    if (settings.enabled === false) {
      return jsonResponse(req, { sent: 0, skipped: "disabled", errors: [] });
    }
    if (settings[body.category] === false) {
      return jsonResponse(req, { sent: 0, skipped: "category_off", errors: [] });
    }

    // Load active subscriptions
    const { data: subs, error: sErr } = await sb
      .from("web_push_subscriptions")
      .select("*")
      .eq("user_id", targetUserId);
    if (sErr) {
      console.error("subs fetch error:", sErr);
      return jsonResponse(req, { error: "Failed to load subscriptions" }, 500);
    }
    if (!subs || subs.length === 0) {
      return jsonResponse(req, { sent: 0, skipped: null, errors: [] });
    }

    // Build the payload delivered to the SW
    const swPayload = JSON.stringify({
      title: body.title,
      body: body.body,
      icon: body.icon || "/icon-512.png",
      deep_link: body.deep_link || "/",
      category: body.category,
      data: body.data || {},
    });

    // Send to each subscription in parallel — collect failures so we can
    // purge dead endpoints (HTTP 404 / 410) and surface other issues
    const results = await Promise.all(subs.map(async (s) => {
      const subscription = {
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh_key, auth: s.auth_key },
      };
      try {
        await webpush.sendNotification(subscription, swPayload, { TTL: 60 * 60 * 24 });
        // Touch last_used_at — fire and forget
        sb.from("web_push_subscriptions")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", s.id)
          .then(() => {});
        return { id: s.id, ok: true as const };
      } catch (err) {
        const e = err as { statusCode?: number; message?: string };
        // 404/410 = subscription is gone for good (user revoked, browser data
        // cleared). Purge from DB to keep the table clean and avoid retrying.
        if (e.statusCode === 404 || e.statusCode === 410) {
          await sb.from("web_push_subscriptions").delete().eq("id", s.id);
          return { id: s.id, ok: false as const, gone: true, error: e.message };
        }
        console.error(`push send failed (sub ${s.id}):`, e);
        return { id: s.id, ok: false as const, error: e.message };
      }
    }));

    const sent = results.filter(r => r.ok).length;
    const errors = results.filter(r => !r.ok).map(r => ({ id: r.id, error: r.error }));

    return jsonResponse(req, { sent, skipped: null, errors });
  } catch (e) {
    console.error("send-push-notification fatal:", e);
    return jsonResponse(req, { error: (e as Error).message || "Internal error" }, 500);
  }
});
