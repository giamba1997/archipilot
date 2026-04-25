import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { authenticateUser, getAdminClient } from "../_shared/auth.ts";

/**
 * remove-org-member — admin removes a member from the org.
 *
 * Body: { org_id: string, user_id: string }
 *
 * Rules:
 *  - Only an admin/owner can remove someone.
 *  - The owner cannot be removed (they must transfer ownership first).
 *  - Removing yourself is allowed only via the leave-org endpoint, not here.
 */
serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const user = await authenticateUser(req);
    const body = await req.json().catch(() => ({}));
    const orgId = String(body.org_id || "").trim();
    const targetUserId = String(body.user_id || "").trim();

    if (!orgId || !targetUserId) {
      return jsonResponse(req, { error: "org_id et user_id requis" }, 400);
    }
    if (targetUserId === user.id) {
      return jsonResponse(req, {
        error: "Pour quitter l'agence, utilisez « Quitter l'agence » dans votre profil.",
      }, 400);
    }

    const admin = getAdminClient();

    const { data: caller } = await admin
      .from("organization_members")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!caller || !["owner", "admin"].includes(caller.role)) {
      return jsonResponse(req, { error: "Vous n'avez pas les droits sur cette agence" }, 403);
    }

    const { data: target } = await admin
      .from("organization_members")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (!target) return jsonResponse(req, { error: "Membre introuvable" }, 404);
    if (target.role === "owner") {
      return jsonResponse(req, {
        error: "Le propriétaire ne peut pas être retiré. Transférez d'abord la propriété.",
      }, 403);
    }
    // An admin cannot remove another admin (only owner can)
    if (target.role === "admin" && caller.role !== "owner") {
      return jsonResponse(req, {
        error: "Seul le propriétaire peut retirer un administrateur.",
      }, 403);
    }

    const { error } = await admin
      .from("organization_members")
      .delete()
      .eq("org_id", orgId)
      .eq("user_id", targetUserId);

    if (error) {
      console.error("remove-org-member: delete failed", error);
      return jsonResponse(req, { error: "Suppression impossible" }, 500);
    }

    return jsonResponse(req, { success: true }, 200);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    const status = message === "Unauthorized" || message === "Missing authorization" ? 401 : 500;
    return jsonResponse(req, { error: message }, status);
  }
});
