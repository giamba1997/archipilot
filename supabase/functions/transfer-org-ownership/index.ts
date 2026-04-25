import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { authenticateUser, getAdminClient } from "../_shared/auth.ts";

/**
 * transfer-org-ownership — promote an existing member to owner.
 *
 * Body: { org_id: string, new_owner_user_id: string }
 *
 * The current owner becomes 'admin'. The target user must already be
 * a member (admin / member / viewer) — owners cannot promote outsiders.
 *
 * Allowed only when the caller is the current owner.
 */
serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const user = await authenticateUser(req);
    const body = await req.json().catch(() => ({}));
    const orgId = String(body.org_id || "").trim();
    const newOwnerId = String(body.new_owner_user_id || "").trim();
    if (!orgId || !newOwnerId) return jsonResponse(req, { error: "org_id et new_owner_user_id requis" }, 400);
    if (newOwnerId === user.id) return jsonResponse(req, { error: "Vous êtes déjà propriétaire." }, 400);

    const admin = getAdminClient();

    // Caller must be current owner
    const { data: org } = await admin
      .from("organizations")
      .select("owner_user_id")
      .eq("id", orgId)
      .single();
    if (!org) return jsonResponse(req, { error: "Agence introuvable" }, 404);
    if (org.owner_user_id !== user.id) {
      return jsonResponse(req, { error: "Seul le propriétaire peut transférer la propriété." }, 403);
    }

    // New owner must already be a member of the org
    const { data: targetMember } = await admin
      .from("organization_members")
      .select("user_id, role")
      .eq("org_id", orgId)
      .eq("user_id", newOwnerId)
      .maybeSingle();
    if (!targetMember) {
      return jsonResponse(req, { error: "Le nouvel propriétaire doit déjà être membre de l'agence." }, 400);
    }

    // Apply the swap. Two updates: organizations.owner_user_id, and
    // both members' roles. No transactional API in supabase-js, so we
    // do them sequentially and roll back manually if anything fails.
    const { error: orgErr } = await admin
      .from("organizations")
      .update({ owner_user_id: newOwnerId })
      .eq("id", orgId);
    if (orgErr) {
      console.error("transfer-org-ownership: update org failed", orgErr);
      return jsonResponse(req, { error: "Transfert impossible" }, 500);
    }

    const { error: oldOwnerErr } = await admin
      .from("organization_members")
      .update({ role: "admin" })
      .eq("org_id", orgId)
      .eq("user_id", user.id);
    if (oldOwnerErr) {
      // Best-effort rollback
      await admin.from("organizations").update({ owner_user_id: user.id }).eq("id", orgId);
      console.error("transfer-org-ownership: demote old owner failed", oldOwnerErr);
      return jsonResponse(req, { error: "Transfert impossible" }, 500);
    }

    const { error: newOwnerErr } = await admin
      .from("organization_members")
      .update({ role: "owner" })
      .eq("org_id", orgId)
      .eq("user_id", newOwnerId);
    if (newOwnerErr) {
      // Roll back the previous two
      await admin.from("organization_members").update({ role: "owner" }).eq("org_id", orgId).eq("user_id", user.id);
      await admin.from("organizations").update({ owner_user_id: user.id }).eq("id", orgId);
      console.error("transfer-org-ownership: promote new owner failed", newOwnerErr);
      return jsonResponse(req, { error: "Transfert impossible" }, 500);
    }

    return jsonResponse(req, { success: true }, 200);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    const status = message === "Unauthorized" || message === "Missing authorization" ? 401 : 500;
    return jsonResponse(req, { error: message }, status);
  }
});
