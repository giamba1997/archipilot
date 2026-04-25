import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { authenticateUser, getAdminClient } from "../_shared/auth.ts";

/**
 * leave-org — a member voluntarily leaves the organization.
 *
 * Body: { org_id: string }
 *
 * Refused for the owner (must transfer ownership first). Past
 * contributions (PVs, photos, remarks) stay in the org under the
 * user's name — only access is revoked.
 */
serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const user = await authenticateUser(req);
    const body = await req.json().catch(() => ({}));
    const orgId = String(body.org_id || "").trim();
    if (!orgId) return jsonResponse(req, { error: "org_id requis" }, 400);

    const admin = getAdminClient();

    const { data: member } = await admin
      .from("organization_members")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!member) return jsonResponse(req, { error: "Vous n'êtes pas membre de cette agence." }, 404);

    if (member.role === "owner") {
      return jsonResponse(req, {
        error: "En tant que propriétaire, vous devez d'abord transférer la propriété ou supprimer l'agence.",
        code: "owner_must_transfer",
      }, 403);
    }

    const { error } = await admin
      .from("organization_members")
      .delete()
      .eq("org_id", orgId)
      .eq("user_id", user.id);
    if (error) {
      console.error("leave-org: delete failed", error);
      return jsonResponse(req, { error: "Sortie impossible" }, 500);
    }

    return jsonResponse(req, { success: true }, 200);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    const status = message === "Unauthorized" || message === "Missing authorization" ? 401 : 500;
    return jsonResponse(req, { error: message }, status);
  }
});
