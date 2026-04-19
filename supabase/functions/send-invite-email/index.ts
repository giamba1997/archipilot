import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { authenticateUser } from "../_shared/auth.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const APP_URL = Deno.env.get("APP_URL") || "https://archipilot-delta.vercel.app";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "ArchiPilot <noreply@archipilot.app>";

serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    // Auth check
    const user = await authenticateUser(req);

    // Rate limiting: max 20 invites per hour
    const rateResult = await checkRateLimit(user.id, {
      action: "send_invite",
      maxCalls: 20,
      windowSeconds: 3600,
    });

    if (!rateResult.allowed) {
      return jsonResponse(req, {
        error: "Trop d'invitations envoyées. Réessayez plus tard.",
        resetAt: rateResult.resetAt,
      }, 429);
    }

    const { email, projectName, inviterName, role } = await req.json();
    if (!email || !projectName) throw new Error("Missing required fields");

    const roleFr: Record<string, string> = {
      admin: "Administrateur",
      contributor: "Contributeur",
      reader: "Lecteur",
    };

    const logoUrl = `${APP_URL}/icon-512.png`;

    const html = `
<div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 20px; background: #FAFAF8;">
  <!-- Header with logo -->
  <div style="text-align: center; margin-bottom: 24px;">
    <img src="${logoUrl}" alt="ArchiPilot" width="40" height="40" style="display: inline-block; border-radius: 10px;" />
    <div style="font-family: 'Manrope', 'Inter', system-ui, sans-serif; font-size: 16px; font-weight: 800; color: #4A3428; margin-top: 8px; text-transform: uppercase; letter-spacing: 0.5px;">ArchiPilot</div>
  </div>

  <div style="background: #fff; border-radius: 16px; border: 1px solid #E2E0DB; padding: 28px 24px;">
    <h2 style="font-size: 18px; font-weight: 700; color: #2C2926; text-align: center; margin: 0 0 4px;">Vous êtes invité</h2>
    <p style="font-size: 13px; color: #A09D96; text-align: center; margin: 0 0 16px;">You've been invited</p>
    <p style="font-size: 14px; color: #6B6862; text-align: center; line-height: 1.6; margin: 0 0 4px;">
      <strong style="color: #2C2926;">${inviterName || "Un architecte"}</strong> vous invite à collaborer sur le projet
      <strong style="color: #2C2926;">${projectName}</strong> en tant que <strong style="color: #C05A2C;">${roleFr[role] || role}</strong>.
    </p>
    <p style="font-size: 12px; color: #A09D96; text-align: center; line-height: 1.5; margin: 0 0 20px;">
      Cliquez ci-dessous pour accepter et accéder au projet.
    </p>
    <div style="text-align: center; margin-bottom: 8px;">
      <a href="${APP_URL}" style="display: inline-block; padding: 12px 32px; background: #C05A2C; color: #fff; font-size: 14px; font-weight: 700; text-decoration: none; border-radius: 10px;">Accepter l'invitation</a>
    </div>
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
        subject: `ArchiPilot — ${inviterName || "Quelqu'un"} vous invite sur "${projectName}"`,
        html,
      }),
    });

    if (!resendRes.ok) {
      const err = await resendRes.text();
      console.error("Resend error:", err);
      throw new Error(`Resend API error: ${resendRes.status}`);
    }

    const result = await resendRes.json();

    return jsonResponse(req, { success: true, id: result.id });
  } catch (err) {
    console.error("send-invite-email error:", err);
    return jsonResponse(req, { error: err.message }, 400);
  }
});
