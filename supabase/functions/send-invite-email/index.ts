import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = Deno.env.get("APP_URL") || "https://archipilot.app";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "ArchiPilot <noreply@archipilot.app>";

serve(async (req) => {
  // CORS
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
    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get requesting user from JWT
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    const { email, projectName, inviterName, role } = await req.json();
    if (!email || !projectName) throw new Error("Missing required fields");

    const roleFr: Record<string, string> = {
      admin: "Administrateur",
      contributor: "Contributeur",
      reader: "Lecteur",
    };

    const html = `
<div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <div style="width: 48px; height: 48px; border-radius: 12px; background: #D97B0D; display: inline-flex; align-items: center; justify-content: center; color: #fff; font-size: 20px; font-weight: 800; letter-spacing: -0.5px;">A</div>
    <div style="font-size: 18px; font-weight: 700; color: #1D1D1B; margin-top: 12px;">ArchiPilot</div>
    <div style="font-size: 12px; color: #767672; margin-top: 2px;">Gestion de chantier</div>
  </div>

  <div style="background: #fff; border-radius: 16px; border: 1px solid #E2E1DD; padding: 28px; box-shadow: 0 2px 12px rgba(0,0,0,0.06);">
    <h2 style="font-size: 20px; font-weight: 700; color: #1D1D1B; text-align: center; margin: 0 0 8px;">Vous êtes invité !</h2>
    <p style="font-size: 14px; color: #6B6B66; text-align: center; line-height: 1.6; margin: 0 0 24px;">
      <strong style="color: #1D1D1B;">${inviterName || "Un architecte"}</strong> vous invite à collaborer sur le projet
      <strong style="color: #1D1D1B;">${projectName}</strong> en tant que <strong style="color: #D97B0D;">${roleFr[role] || role}</strong>.
    </p>
    <a href="${APP_URL}" style="display: block; text-align: center; padding: 13px 20px; border-radius: 10px; background: linear-gradient(135deg, #D97B0D 0%, #C06A08 100%); color: #fff; font-size: 15px; font-weight: 700; text-decoration: none; box-shadow: 0 3px 12px rgba(217,123,13,0.25);">
      Ouvrir ArchiPilot
    </a>
    <p style="font-size: 12px; color: #767672; text-align: center; margin-top: 20px;">
      Connectez-vous pour accepter l'invitation et accéder au projet.
    </p>
  </div>

  <div style="text-align: center; margin-top: 20px; font-size: 11px; color: #767672;">
    &copy; ${new Date().getFullYear()} ArchiPilot &middot; DEWIL architecten
  </div>
</div>`;

    // Send email via Resend
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

    return new Response(JSON.stringify({ success: true, id: result.id }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("send-invite-email error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
});
