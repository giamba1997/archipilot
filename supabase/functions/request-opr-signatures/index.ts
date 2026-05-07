import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { authenticateUser, requirePlan, PlanUpgradeError, getAdminClient } from "../_shared/auth.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";

// ─────────────────────────────────────────────────────────────
// Crée N demandes de signature OPR à distance.
//
// Pour chaque signataire reçu, on :
//   1. Génère un token cryptographiquement aléatoire (32 chars hex)
//   2. INSERT dans opr_signature_requests (snapshot des réserves)
//   3. Envoie un email Resend personnalisé avec le lien public et le PDF
//
// Le PDF est généré côté client (jsPDF) puis envoyé en base64 — la même
// version est attachée à TOUS les emails (snapshot avant signatures).
// ─────────────────────────────────────────────────────────────

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const APP_URL = Deno.env.get("APP_URL") || "https://archipilot-delta.vercel.app";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "ArchiPilot <noreply@archipilot.app>";

// Génère un token URL-safe de 32 octets → 64 chars hex
function genToken(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

interface Signatory {
  name: string;
  role?: string;
  email: string;
}

serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const user = await authenticateUser(req);
    requirePlan(user, "sendEmail");

    // Rate limit : max 50 signature requests / heure
    const rateResult = await checkRateLimit(user.id, {
      action: "request_opr_signatures",
      maxCalls: 50,
      windowSeconds: 3600,
    });
    if (!rateResult.allowed) {
      return jsonResponse(req, {
        error: "Limite atteinte. Réessayez plus tard.",
        resetAt: rateResult.resetAt,
      }, 429);
    }

    const body = await req.json();
    const {
      projectId,
      projectName,
      opr,                  // { id, number, date, type, reserves, reservesHash }
      signatories,          // [{ name, role, email }]
      pdfBase64,            // PDF non signé (preview en pièce jointe)
      pdfFileName,
      authorName,
      structureName,
      customMessage,        // HTML personnalisé optionnel
    } = body;

    if (!projectId || !projectName || !opr?.id || !Array.isArray(signatories) || signatories.length === 0) {
      throw new Error("Champs requis manquants");
    }
    if (signatories.length > 20) {
      throw new Error("Maximum 20 signataires par demande");
    }

    const sb = getAdminClient();

    // 1) Insert les demandes (transaction implicite via array insert)
    const rows = signatories.map((s: Signatory) => ({
      owner_user_id: user.id,
      project_id: String(projectId),
      project_name: String(projectName),
      opr_id: String(opr.id),
      opr_number: opr.number,
      opr_date: String(opr.date),
      opr_type: opr.type === "definitive" ? "definitive" : "provisoire",
      reserves_snapshot: opr.reserves || [],
      reserves_hash: opr.reservesHash || null,
      signatory_name: s.name,
      signatory_role: s.role || "",
      signatory_email: s.email,
      token: genToken(),
      status: "pending",
    }));

    const { data: inserted, error: insErr } = await sb
      .from("opr_signature_requests")
      .insert(rows)
      .select();

    if (insErr) {
      console.error("insert sigreqs error:", insErr);
      throw new Error("Erreur d'enregistrement");
    }

    // 2) Envoi emails — un par signataire, avec lien et PDF preview
    const logoUrl = `${APP_URL}/icon-512.png`;
    const sentResults: Array<{ id: string; email: string; sent: boolean; error?: string }> = [];

    for (const row of inserted) {
      const signUrl = `${APP_URL}/sign/${row.token}`;
      const messageHtml = customMessage || "";
      const docTypeLabel = row.opr_type === "definitive" ? "définitive" : "provisoire";

      const html = `
<div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 20px; background: #FAFAF8;">
  <div style="text-align: center; margin-bottom: 24px;">
    <img src="${logoUrl}" alt="ArchiPilot" width="40" height="40" style="display: inline-block; border-radius: 10px;" />
    <div style="font-family: 'Manrope', 'Inter', system-ui, sans-serif; font-size: 16px; font-weight: 800; color: #4A3428; margin-top: 8px; text-transform: uppercase; letter-spacing: 0.5px;">ArchiPilot</div>
  </div>

  <div style="background: #fff; border-radius: 16px; border: 1px solid #E2E0DB; padding: 24px;">
    <div style="text-align: center; margin-bottom: 20px;">
      <div style="display: inline-block; padding: 4px 12px; background: #FAF0EA; border-radius: 6px; font-size: 11px; font-weight: 700; color: #C05A2C; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">
        Signature requise
      </div>
      <h2 style="font-size: 20px; font-weight: 700; color: #2C2926; margin: 0 0 4px;">OPR n°${row.opr_number}</h2>
      <div style="font-size: 13px; color: #A09D96;">${row.project_name} — ${row.opr_date}</div>
    </div>

    <div style="font-size: 13px; line-height: 1.7; color: #2C2926; margin-bottom: 20px;">
      Bonjour <strong>${row.signatory_name}</strong>,<br><br>
      ${messageHtml || `Vous trouverez ci-joint le procès-verbal de réception ${docTypeLabel} n°${row.opr_number} relatif au chantier «&nbsp;${row.project_name}&nbsp;».<br><br>Merci d'en prendre connaissance et de signer en cliquant sur le bouton ci-dessous.`}
    </div>

    <!-- Bouton principal — table-based pour compat email clients (Outlook etc.) -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin: 28px auto;">
      <tr>
        <td style="background: #C95A1B; border-radius: 10px;">
          <a href="${signUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 15px; font-family: Arial, sans-serif;">
            ✦ Signer le document
          </a>
        </td>
      </tr>
    </table>

    <!-- Lien en clair — toujours cliquable, jamais filtré -->
    <div style="text-align: center; padding: 14px; background: #F8F7F4; border-radius: 8px; margin-bottom: 12px;">
      <div style="font-size: 12px; color: #2C2926; margin-bottom: 6px; font-weight: 600;">
        Lien direct (copier-coller dans votre navigateur si besoin) :
      </div>
      <a href="${signUrl}" target="_blank" style="color: #C05A2C; word-break: break-all; font-size: 12px; font-family: monospace;">${signUrl}</a>
    </div>

    <div style="text-align: center; font-size: 11px; color: #A09D96; margin-bottom: 8px;">
      Ce lien est personnel et expire dans 14 jours.
    </div>

    <div style="border-top: 1px solid #E2E0DB; margin: 20px 0; padding-top: 16px; text-align: center; font-size: 12px; color: #6B6862;">
      Demandé par <strong>${authorName || "l'architecte"}</strong>${structureName ? ` — ${structureName}` : ""}
    </div>

    <div style="text-align: center; padding: 6px 0; font-size: 12px; color: #A09D96;">
      Le rapport OPR (PDF non signé) est joint en pièce jointe pour relecture.
    </div>
  </div>

  <div style="text-align: center; margin-top: 20px; font-size: 11px; color: #A09D96;">
    Envoyé via <strong style="color: #6B6862;">ArchiPilot</strong><br>
    &copy; ${new Date().getFullYear()} ArchiPilot
  </div>
</div>`;

      const attachments: Array<{ filename: string; content: string }> = [];
      if (pdfBase64) {
        attachments.push({
          filename: pdfFileName || `OPR-${row.opr_number}.pdf`,
          content: pdfBase64,
        });
      }

      const resendPayload: Record<string, unknown> = {
        from: FROM_EMAIL,
        to: [row.signatory_email],
        subject: `Signature requise — OPR n°${row.opr_number} — ${row.project_name}`,
        html,
      };
      // Resend tolère pas toujours un tableau attachments vide — on l'omet si absent.
      if (attachments.length > 0) resendPayload.attachments = attachments;

      try {
        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify(resendPayload),
        });

        if (resendRes.ok) {
          const r = await resendRes.json();
          await sb.from("opr_signature_requests")
            .update({ resend_id: r.id || "" })
            .eq("id", row.id);
          sentResults.push({ id: row.id, email: row.signatory_email, sent: true });
        } else {
          const txt = await resendRes.text();
          console.error("resend error:", txt);
          sentResults.push({ id: row.id, email: row.signatory_email, sent: false, error: `Resend ${resendRes.status}` });
        }
      } catch (e) {
        console.error("send mail error:", e);
        sentResults.push({ id: row.id, email: row.signatory_email, sent: false, error: (e as Error).message });
      }
    }

    return jsonResponse(req, {
      success: true,
      requests: inserted.map((r: Record<string, unknown>) => ({
        id: r.id,
        signatory_name: r.signatory_name,
        signatory_email: r.signatory_email,
        signatory_role: r.signatory_role,
        status: r.status,
        expires_at: r.expires_at,
        sent_at: r.sent_at,
      })),
      delivery: sentResults,
    });
  } catch (err) {
    console.error("request-opr-signatures error:", err);
    if (err instanceof PlanUpgradeError) {
      return jsonResponse(req, {
        error: err.message,
        code: err.code,
        feature: err.feature,
        currentPlan: err.currentPlan,
        requiredPlan: err.requiredPlan,
      }, 403);
    }
    return jsonResponse(req, { error: (err as Error).message }, 400);
  }
});
