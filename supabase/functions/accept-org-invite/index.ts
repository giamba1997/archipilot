import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { authenticateUser, getAdminClient } from "../_shared/auth.ts";

/**
 * accept-org-invite — invitee accepts an invitation via the email link.
 *
 * Body: { token: string }
 *
 * Validations:
 *  - token exists, status='pending', not expired
 *  - the caller's email matches the invitation email (case-insensitive)
 *  - seat is still available (could have been filled since the invite)
 *  - the caller isn't already a member
 *
 * On success: insert into organization_members, mark invitation accepted.
 */
serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const user = await authenticateUser(req);

    const body = await req.json().catch(() => ({}));
    const token = String(body.token || "").trim();
    if (!token) return jsonResponse(req, { error: "Token manquant" }, 400);

    const admin = getAdminClient();

    // 1. Load the invitation
    const { data: invite, error: invErr } = await admin
      .from("organization_invitations")
      .select("id, org_id, email, role, status, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (invErr || !invite) {
      return jsonResponse(req, { error: "Invitation introuvable" }, 404);
    }
    if (invite.status !== "pending") {
      return jsonResponse(req, {
        error: invite.status === "accepted"
          ? "Cette invitation a déjà été acceptée"
          : "Cette invitation n'est plus valide",
      }, 410);
    }
    if (new Date(invite.expires_at) < new Date()) {
      // Mark expired for cleanliness
      await admin.from("organization_invitations")
        .update({ status: "expired" })
        .eq("id", invite.id);
      return jsonResponse(req, { error: "Cette invitation a expiré" }, 410);
    }

    // 2. Check email match (case-insensitive)
    if ((user.email || "").toLowerCase() !== invite.email.toLowerCase()) {
      return jsonResponse(req, {
        error: `Cette invitation est destinée à ${invite.email}. Connectez-vous avec ce compte pour l'accepter.`,
        code: "email_mismatch",
      }, 403);
    }

    // 3. Already a member? (idempotent: if yes, mark invite accepted and succeed)
    const { data: existing } = await admin
      .from("organization_members")
      .select("user_id")
      .eq("org_id", invite.org_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      await admin.from("organization_invitations")
        .update({ status: "accepted", accepted_at: new Date().toISOString() })
        .eq("id", invite.id);
      return jsonResponse(req, { org_id: invite.org_id, alreadyMember: true }, 200);
    }

    // 4. Recheck seat availability
    const { data: org } = await admin
      .from("organizations")
      .select("seat_limit, name, status")
      .eq("id", invite.org_id)
      .single();

    if (!org) return jsonResponse(req, { error: "Agence introuvable" }, 404);
    if (org.status !== "active") {
      return jsonResponse(req, { error: "Agence inactive — contactez l'administrateur" }, 403);
    }

    const { count: memberCount } = await admin
      .from("organization_members")
      .select("*", { count: "exact", head: true })
      .eq("org_id", invite.org_id);

    if ((memberCount || 0) >= org.seat_limit) {
      return jsonResponse(req, {
        error: "Aucun siège disponible — l'administrateur doit en libérer ou en ajouter.",
        code: "seat_limit_reached",
      }, 403);
    }

    // 5. Insert member
    const { error: memberErr } = await admin
      .from("organization_members")
      .insert({
        org_id: invite.org_id,
        user_id: user.id,
        role: invite.role,
        invited_by: invite.id ? null : null, // not tracking inviter from invitation here
      });

    if (memberErr) {
      console.error("accept-org-invite: insert member failed", memberErr);
      return jsonResponse(req, { error: "Impossible de rejoindre l'agence" }, 500);
    }

    // 6. Mark invitation accepted
    await admin.from("organization_invitations")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", invite.id);

    return jsonResponse(req, {
      org_id: invite.org_id,
      org_name: org.name,
      role: invite.role,
    }, 200);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    const status = message === "Unauthorized" || message === "Missing authorization" ? 401 : 500;
    return jsonResponse(req, { error: message }, status);
  }
});
