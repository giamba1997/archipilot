import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const APP_URL = Deno.env.get("APP_URL") || "https://archipilot.app";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "ArchiPilot <noreply@archipilot.app>";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  try {
    const {
      to,              // string[] — list of recipient emails
      projectName,
      pvNumber,
      pvDate,
      pvContent,       // text content of the PV
      authorName,
      structureName,
      pdfBase64,       // optional — base64 encoded PDF
      pdfFileName,     // optional — file name for the PDF
      pvId,            // for read tracking
      subject: customSubject,   // optional — user-edited subject line
      customMessage,            // optional — user-edited email body HTML
    } = await req.json();

    if (!to?.length || !projectName || !pvNumber) {
      throw new Error("Missing required fields: to, projectName, pvNumber");
    }

    // Build tracking pixel URL (if pvId provided)
    const trackingPixel = pvId
      ? `<img src="${SUPABASE_URL}/functions/v1/track-pv-read?pvId=${pvId}&t=${Date.now()}" width="1" height="1" style="display:none;" />`
      : "";

    // Build a clean preview of the PV content (first 500 chars)
    const preview = (pvContent || "").slice(0, 500).replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>");

    // Custom message is already HTML from the rich editor
    const messageHtml = customMessage || "";

    const html = `
<div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
  <div style="text-align: center; margin-bottom: 28px;">
    <div style="width: 44px; height: 44px; border-radius: 11px; background: #D97B0D; display: inline-flex; align-items: center; justify-content: center; color: #fff; font-size: 18px; font-weight: 800;">A</div>
    <div style="font-size: 16px; font-weight: 700; color: #1D1D1B; margin-top: 10px;">ArchiPilot</div>
  </div>

  <div style="background: #fff; border-radius: 16px; border: 1px solid #E2E1DD; padding: 24px; box-shadow: 0 2px 12px rgba(0,0,0,0.06);">
    ${messageHtml ? `<div style="font-size: 13px; line-height: 1.7; color: #1D1D1B; margin-bottom: 20px;">${messageHtml}</div><hr style="border: none; border-top: 1px solid #E2E1DD; margin-bottom: 20px;" />` : ""}

    <div style="text-align: center; margin-bottom: 20px;">
      <div style="display: inline-block; padding: 4px 12px; background: #FDF4E7; border-radius: 6px; font-size: 11px; font-weight: 700; color: #D97B0D; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">
        PV de chantier
      </div>
      <h2 style="font-size: 20px; font-weight: 700; color: #1D1D1B; margin: 0 0 4px;">PV n°${pvNumber}</h2>
      <div style="font-size: 13px; color: #767672;">${projectName} — ${pvDate}</div>
    </div>

    <div style="background: #F7F6F4; border-radius: 10px; padding: 16px; margin-bottom: 20px; font-size: 12px; line-height: 1.7; color: #1D1D1B; max-height: 300px; overflow: hidden;">
      ${preview}${(pvContent || "").length > 500 ? '<div style="text-align: center; padding-top: 8px; font-size: 11px; color: #767672;">…</div>' : ""}
    </div>

    <div style="text-align: center; font-size: 12px; color: #6B6B66; margin-bottom: 16px;">
      Rédigé par <strong>${authorName || "l'architecte"}</strong>${structureName ? ` — ${structureName}` : ""}
    </div>

    ${pdfBase64 ? '<div style="text-align: center; padding: 10px 0 4px; font-size: 12px; color: #767672;">📎 Le PV complet est joint en pièce jointe (PDF)</div>' : ""}
  </div>

  <div style="text-align: center; margin-top: 20px; font-size: 11px; color: #767672;">
    Envoyé via <strong>ArchiPilot</strong> — Gestion de chantier pour architectes<br/>
    &copy; ${new Date().getFullYear()} DEWIL architecten
  </div>
  ${trackingPixel}
</div>`;

    // Build attachments array
    const attachments: Array<{ filename: string; content: string }> = [];
    if (pdfBase64) {
      attachments.push({
        filename: pdfFileName || `PV-${pvNumber}-${projectName.replace(/[^\w\u00C0-\u024F-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "")}.pdf`,
        content: pdfBase64,
      });
    }

    // Send via Resend
    const resendPayload: Record<string, unknown> = {
      from: FROM_EMAIL,
      to,
      subject: customSubject || `PV n°${pvNumber} — ${projectName} (${pvDate})`,
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

    return new Response(JSON.stringify({ success: true, id: result.id, sentTo: to }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    console.error("send-pv-email error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
