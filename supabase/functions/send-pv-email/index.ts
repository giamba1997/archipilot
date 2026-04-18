import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { authenticateUser, requirePlan } from "../_shared/auth.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const APP_URL = Deno.env.get("APP_URL") || "https://archipilot-delta.vercel.app";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "ArchiPilot <noreply@archi-pilot.com>";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    // Auth + plan check — email sending requires Pro+
    const user = await authenticateUser(req);
    requirePlan(user, "sendEmail");

    // Rate limiting: max 50 emails per hour
    const rateResult = await checkRateLimit(user.id, {
      action: "send_email",
      maxCalls: 50,
      windowSeconds: 3600,
    });

    if (!rateResult.allowed) {
      return jsonResponse(req, {
        error: "Limite d'envoi d'emails atteinte. Réessayez plus tard.",
        resetAt: rateResult.resetAt,
      }, 429);
    }

    const {
      to,
      projectName,
      pvNumber,
      pvDate,
      pvContent,
      authorName,
      structureName,
      pdfBase64,
      pdfFileName,
      pvId,
      subject: customSubject,
      customMessage,
    } = await req.json();

    if (!to?.length || !projectName || !pvNumber) {
      throw new Error("Missing required fields: to, projectName, pvNumber");
    }

    // Build tracking pixel URL (if pvId provided)
    const trackingPixel = pvId
      ? `<img src="${SUPABASE_URL}/functions/v1/track-pv-read?pvId=${pvId}&t=${Date.now()}" width="1" height="1" style="display:none;" />`
      : "";

    const fullContent = (pvContent || "").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>");
    const messageHtml = customMessage || "";

    const html = `
<div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 20px;">
  <div style="text-align: center; margin-bottom: 24px;">
    <table role="presentation" style="margin: 0 auto;"><tr><td style="width: 40px; height: 40px; border-radius: 10px; background: #C05A2C; color: #fff; font-size: 18px; font-weight: 800; text-align: center; vertical-align: middle;">A</td></tr></table>
    <div style="font-size: 18px; font-weight: 700; color: #1D1D1B; margin-top: 8px;">ArchiPilot</div>
  </div>

  <div style="background: #fff; border-radius: 16px; border: 1px solid #E2E1DD; padding: 24px;">
    ${messageHtml ? `<div style="font-size: 13px; line-height: 1.7; color: #1D1D1B; margin-bottom: 20px;">${messageHtml}</div><hr style="border: none; border-top: 1px solid #E2E1DD; margin-bottom: 20px;" />` : ""}

    <div style="text-align: center; margin-bottom: 20px;">
      <div style="display: inline-block; padding: 4px 12px; background: #FDF4E7; border-radius: 6px; font-size: 11px; font-weight: 700; color: #C05A2C; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">
        PV de chantier
      </div>
      <h2 style="font-size: 20px; font-weight: 700; color: #1D1D1B; margin: 0 0 4px;">PV n\u00b0${pvNumber}</h2>
      <div style="font-size: 13px; color: #767672;">${projectName} — ${pvDate}</div>
    </div>

    <div style="background: #F7F6F4; border-radius: 10px; padding: 16px; margin-bottom: 20px; font-size: 12px; line-height: 1.8; color: #1D1D1B;">
      ${fullContent}
    </div>

    <div style="text-align: center; font-size: 12px; color: #6B6B66; margin-bottom: 16px;">
      Rédigé par <strong>${authorName || "l'architecte"}</strong>${structureName ? ` — ${structureName}` : ""}
    </div>

    ${pdfBase64 ? '<div style="text-align: center; padding: 10px 0 4px; font-size: 12px; color: #767672;">Le PV complet est joint en pièce jointe (PDF)</div>' : ""}
  </div>

  <div style="text-align: center; margin-top: 20px; font-size: 11px; color: #767672;">
    Envoyé via <strong>ArchiPilot</strong><br/>
    &copy; ${new Date().getFullYear()} ArchiPilot
  </div>
  ${trackingPixel}
</div>`;

    const attachments: Array<{ filename: string; content: string }> = [];
    if (pdfBase64) {
      attachments.push({
        filename: pdfFileName || `PV-${pvNumber}-${projectName.replace(/[^\w\u00C0-\u024F-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "")}.pdf`,
        content: pdfBase64,
      });
    }

    const resendPayload: Record<string, unknown> = {
      from: FROM_EMAIL,
      to,
      subject: customSubject || `PV n\u00b0${pvNumber} — ${projectName} (${pvDate})`,
      html,
    };
    if (attachments.length > 0) {
      resendPayload.attachments = attachments;
    }

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify(resendPayload),
    });

    if (!resendRes.ok) {
      const err = await resendRes.text();
      console.error("Resend error:", err);
      throw new Error(`Resend API error: ${resendRes.status}`);
    }

    const result = await resendRes.json();

    return jsonResponse(req, { success: true, id: result.id, sentTo: to });
  } catch (err) {
    console.error("send-pv-email error:", err);
    return jsonResponse(req, { error: err.message }, 400);
  }
});
