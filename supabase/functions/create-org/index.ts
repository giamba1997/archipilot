import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { authenticateUser, getAdminClient } from "../_shared/auth.ts";

/**
 * create-org — provision a new Team organization.
 *
 * Body: { name: string }
 *
 * Inserts into organizations (owner = caller, seat_limit = 3 by default),
 * registers the caller as 'owner' in organization_members, and seeds an
 * empty organization_data row so the client can write projects right away.
 *
 * Plan check is intentionally lax for now: any authenticated user can
 * create an org. When Stripe goes live, this function should refuse
 * unless the caller has paid the Team subscription (and the subscription
 * webhook will be the one calling this path on first payment).
 */
serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const user = await authenticateUser(req);

    let body: { name?: string } = {};
    try { body = await req.json(); } catch { /* tolerate empty */ }

    const name = (body.name || "").trim();
    if (!name) {
      return jsonResponse(req, { error: "Le nom de l'agence est requis." }, 400);
    }
    if (name.length > 120) {
      return jsonResponse(req, { error: "Nom trop long (120 caractères max)." }, 400);
    }

    const admin = getAdminClient();

    // 1. Insert the organization
    const { data: org, error: orgErr } = await admin
      .from("organizations")
      .insert({
        name,
        owner_user_id: user.id,
        plan: "team",
        seat_limit: 3,
        status: "active",
      })
      .select()
      .single();

    if (orgErr || !org) {
      console.error("create-org: insert organizations failed", orgErr);
      return jsonResponse(req, { error: "Création de l'agence impossible." }, 500);
    }

    // 2. Register the caller as owner. Compensate by deleting the org if
    //    this fails (no real transaction across Supabase calls).
    const { error: memberErr } = await admin
      .from("organization_members")
      .insert({
        org_id: org.id,
        user_id: user.id,
        role: "owner",
        invited_by: user.id,
      });

    if (memberErr) {
      console.error("create-org: insert members failed, rolling back", memberErr);
      await admin.from("organizations").delete().eq("id", org.id);
      return jsonResponse(req, { error: "Création de l'agence impossible." }, 500);
    }

    // 3. Seed an empty data row. Non-fatal — the client write path will
    //    upsert on first save anyway.
    const { error: dataErr } = await admin
      .from("organization_data")
      .insert({ org_id: org.id, projects: [], active_id: null });

    if (dataErr) {
      console.warn("create-org: seed organization_data failed (non-fatal)", dataErr);
    }

    return jsonResponse(req, { organization: org }, 200);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    const status = message === "Unauthorized" || message === "Missing authorization" ? 401 : 500;
    return jsonResponse(req, { error: message }, status);
  }
});
