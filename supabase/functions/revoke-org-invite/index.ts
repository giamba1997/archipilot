import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { authenticateUser, getAdminClient } from "../_shared/auth.ts";

/**
 * revoke-org-invite — admin cancels a pending invitation.
 *
 * Body: { invitation_id: string }
 *
 * Only an admin/owner of the matching org can revoke. Already-accepted
 * invitations cannot be revoked (use remove-org-member instead).
 */
serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const user = await authenticateUser(req);
    const body = await req.json().catch(() => ({}));
    const invitationId = String(body.invitation_id || "").trim();
    if (!invitationId) return jsonResponse(req, { error: "invitation_id manquant" }, 400);

    const admin = getAdminClient();

    const { data: invite } = await admin
      .from("organization_invitations")
      .select("id, org_id, status")
      .eq("id", invitationId)
      .maybeSingle();

    if (!invite) return jsonResponse(req, { error: "Invitation introuvable" }, 404);
    if (invite.status !== "pending") {
      return jsonResponse(req, { error: "Cette invitation n'est plus en attente" }, 409);
    }

    const { data: caller } = await admin
      .from("organization_members")
      .select("role")
      .eq("org_id", invite.org_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!caller || !["owner", "admin"].includes(caller.role)) {
      return jsonResponse(req, { error: "Vous n'avez pas les droits sur cette agence" }, 403);
    }

    const { error } = await admin
      .from("organization_invitations")
      .update({ status: "revoked" })
      .eq("id", invitationId);

    if (error) {
      console.error("revoke-org-invite: update failed", error);
      return jsonResponse(req, { error: "Révocation impossible" }, 500);
    }

    return jsonResponse(req, { success: true }, 200);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    const status = message === "Unauthorized" || message === "Missing authorization" ? 401 : 500;
    return jsonResponse(req, { error: message }, status);
  }
});
