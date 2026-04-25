import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { authenticateUser, getAdminClient } from "../_shared/auth.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const APP_URL = Deno.env.get("APP_URL") || "https://app.archipilot.app";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "ArchiPilot <noreply@archipilot.app>";

const ROLES_FR: Record<string, string> = {
  admin: "Administrateur",
  member: "Membre",
  viewer: "Lecteur",
};

/**
 * invite-org-member — admin invites someone to the organization by email.
 *
 * Body: { org_id: string, email: string, role: 'admin'|'member'|'viewer' }
 *
 * Steps:
 *  1. Auth + verify caller is admin/owner of the org.
 *  2. Refuse if seat cap reached (active members + pending invites >= seat_limit).
 *  3. Refuse if the email is already a member or already invited.
 *  4. Generate a unique token, persist the invitation (14-day expiry).
 *  5. Send an email via Resend with a link back to the app.
 */
serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const user = await authenticateUser(req);

    const rateResult = await checkRateLimit(user.id, {
      action: "invite_org_member",
      maxCalls: 20,
      windowSeconds: 3600,
    });
    if (!rateResult.allowed) {
      return jsonResponse(req, {
        error: "Trop d'invitations envoyées. Réessayez plus tard.",
        resetAt: rateResult.resetAt,
      }, 429);
    }

    const body = await req.json().catch(() => ({}));
    const orgId = String(body.org_id || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const role = String(body.role || "").trim();

    if (!orgId) return jsonResponse(req, { error: "org_id manquant" }, 400);
    if (!email || !email.includes("@")) return jsonResponse(req, { error: "Email invalide" }, 400);
    if (!["admin", "member", "viewer"].includes(role)) {
      return jsonResponse(req, { error: "Rôle invalide" }, 400);
    }

    const admin = getAdminClient();

    // 1. Verify caller is admin/owner of the org
    const { data: caller, error: callerErr } = await admin
      .from("organization_members")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (callerErr) {
      console.error("invite-org-member: caller lookup failed", callerErr);
      return jsonResponse(req, { error: "Erreur serveur" }, 500);
    }
    if (!caller || !["owner", "admin"].includes(caller.role)) {
      return jsonResponse(req, { error: "Vous n'avez pas les droits sur cette agence" }, 403);
    }

    // 2. Load org for seat_limit and name
    const { data: org, error: orgErr } = await admin
      .from("organizations")
      .select("name, seat_limit, status")
      .eq("id", orgId)
      .single();

    if (orgErr || !org) {
      return jsonResponse(req, { error: "Agence introuvable" }, 404);
    }
    if (org.status !== "active") {
      return jsonResponse(req, { error: "Agence inactive (abonnement à régulariser)" }, 403);
    }

    // 3. Seat check
    const [{ count: activeMembers }, { count: pendingInvites }] = await Promise.all([
      admin.from("organization_members").select("*", { count: "exact", head: true }).eq("org_id", orgId),
      admin.from("organization_invitations").select("*", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "pending"),
    ]);

    const used = (activeMembers || 0) + (pendingInvites || 0);
    if (used >= org.seat_limit) {
      return jsonResponse(req, {
        error: `Tous les sièges sont utilisés (${used}/${org.seat_limit}). Augmentez la limite avant d'inviter.`,
        code: "seat_limit_reached",
      }, 403);
    }

    // 4. Check the email isn't already a member.
    //    Two-step lookup (no PostgREST join) — find the profile by email,
    //    then look it up in this org's members.
    const { data: profileForEmail } = await admin
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    if (profileForEmail) {
      const { data: alreadyMember } = await admin
        .from("organization_members")
        .select("user_id")
        .eq("org_id", orgId)
        .eq("user_id", profileForEmail.id)
        .maybeSingle();
      if (alreadyMember) {
        return jsonResponse(req, { error: "Cette personne est déjà membre" }, 409);
      }
    }

    const { data: existingInvite } = await admin
      .from("organization_invitations")
      .select("id")
      .eq("org_id", orgId)
      .eq("status", "pending")
      .ilike("email", email)
      .maybeSingle();
    if (existingInvite) {
      return jsonResponse(req, { error: "Une invitation est déjà en attente pour cet email" }, 409);
    }

    // 5. Generate token + persist invitation
    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    const token = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, "0")).join("");

    const { data: invitation, error: invErr } = await admin
      .from("organization_invitations")
      .insert({
        org_id: orgId,
        email,
        role,
        invited_by: user.id,
        token,
      })
      .select()
      .single();

    if (invErr || !invitation) {
      console.error("invite-org-member: insert failed", invErr);
      return jsonResponse(req, { error: "Création de l'invitation impossible" }, 500);
    }

    // 6. Fetch the inviter's display name for the email
    const { data: inviterProfile } = await admin
      .from("profiles")
      .select("name")
      .eq("id", user.id)
      .maybeSingle();
    const inviterName = inviterProfile?.name?.trim() || user.email;

    // 7. Send email
    const inviteUrl = `${APP_URL}/?invite=${encodeURIComponent(token)}`;
    const logoUrl = `${APP_URL}/icon-512.png`;
    const roleLabel = ROLES_FR[role] || role;

    const html = `
<div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 20px; background: #FAFAF8;">
  <div style="text-align: center; margin-bottom: 24px;">
    <img src="${logoUrl}" alt="ArchiPilot" width="40" height="40" style="display: inline-block; border-radius: 10px;" />
    <div style="font-family: 'Manrope', 'Inter', system-ui, sans-serif; font-size: 16px; font-weight: 800; color: #4A3428; margin-top: 8px; text-transform: uppercase; letter-spacing: 0.5px;">ArchiPilot</div>
  </div>
  <div style="background: #fff; border-radius: 16px; border: 1px solid #E2E0DB; padding: 28px 24px;">
    <h2 style="font-size: 18px; font-weight: 700; color: #2C2926; text-align: center; margin: 0 0 4px;">Vous êtes invité</h2>
    <p style="font-size: 13px; color: #A09D96; text-align: center; margin: 0 0 16px;">à rejoindre une agence</p>
    <p style="font-size: 14px; color: #6B6862; text-align: center; line-height: 1.6; margin: 0 0 8px;">
      <strong style="color: #2C2926;">${escapeHtml(inviterName)}</strong> vous invite à rejoindre l'agence
      <strong style="color: #2C2926;">${escapeHtml(org.name)}</strong> sur ArchiPilot
      en tant que <strong style="color: #C05A2C;">${roleLabel}</strong>.
    </p>
    <p style="font-size: 12px; color: #A09D96; text-align: center; line-height: 1.5; margin: 0 0 20px;">
      Cliquez ci-dessous pour accepter. L'invitation expire dans 14 jours.
    </p>
    <div style="text-align: center; margin-bottom: 8px;">
      <a href="${inviteUrl}" style="display: inline-block; padding: 12px 32px; background: #C05A2C; color: #fff; font-size: 14px; font-weight: 700; text-decoration: none; border-radius: 10px;">Accepter l'invitation</a>
    </div>
    <p style="font-size: 11px; color: #A09D96; text-align: center; line-height: 1.5; margin: 16px 0 0;">
      Si le bouton ne fonctionne pas, copiez ce lien :<br>
      <span style="color: #6B6862; word-break: break-all;">${inviteUrl}</span>
    </p>
  </div>
  <div style="text-align: center; margin-top: 16px; font-size: 11px; color: #A09D96;">
    &copy; ${new Date().getFullYear()} ArchiPilot
  </div>
</div>`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        subject: `ArchiPilot — ${inviterName} vous invite à rejoindre ${org.name}`,
        html,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error("Resend error (invite still saved):", errText);
      // Don't roll back — the invite link works even if email failed.
      // Admin can resend.
      return jsonResponse(req, {
        invitation,
        warning: "Invitation créée mais l'email n'a pas pu être envoyé. Vous pouvez relancer.",
      }, 200);
    }

    return jsonResponse(req, { invitation }, 200);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    const status = message === "Unauthorized" || message === "Missing authorization" ? 401 : 500;
    return jsonResponse(req, { error: message }, status);
  }
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
