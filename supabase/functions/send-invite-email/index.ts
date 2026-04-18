import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { authenticateUser } from "../_shared/auth.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const APP_URL = Deno.env.get("APP_URL") || "https://archipilot-delta.vercel.app";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "ArchiPilot <noreply@archi-pilot.com>";

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

    const html = `
<div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 20px;">
  <div style="text-align: center; margin-bottom: 24px;">
    <table role="presentation" style="margin: 0 auto;"><tr><td style="width: 40px; height: 40px; border-radius: 10px; background: #D97B0D; color: #fff; font-size: 18px; font-weight: 800; text-align: center; vertical-align: middle;">A</td></tr></table>
    <div style="font-size: 18px; font-weight: 700; color: #1D1D1B; margin-top: 8px;">ArchiPilot</div>
  </div>
  <h2 style="font-size: 18px; font-weight: 700; color: #1D1D1B; text-align: center; margin: 0 0 4px;">Vous êtes invité</h2>
  <p style="font-size: 13px; color: #767672; text-align: center; margin: 0 0 16px;">You've been invited</p>
  <p style="font-size: 14px; color: #6B6B66; text-align: center; line-height: 1.6; margin: 0 0 4px;">
    <strong style="color: #1D1D1B;">${inviterName || "Un architecte"}</strong> vous invite à collaborer sur le projet
    <strong style="color: #1D1D1B;">${projectName}</strong> en tant que <strong style="color: #D97B0D;">${roleFr[role] || role}</strong>.
  </p>
  <p style="font-size: 12px; color: #767672; text-align: center; line-height: 1.5; margin: 0 0 20px;">
    Click below to accept and access the project.
  </p>
  <div style="text-align: center; margin-bottom: 24px;">
    <a href="${APP_URL}" style="display: inline-block; padding: 12px 32px; background: #D97B0D; color: #fff; font-size: 14px; font-weight: 700; text-decoration: none; border-radius: 8px;">Accepter l'invitation · Accept</a>
  </div>
  <p style="font-size: 11px; color: #767672; text-align: center; word-break: break-all;">${APP_URL}</p>
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
