import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";

// ─────────────────────────────────────────────────────────────
// Public OPR signing endpoint — sans auth JWT.
//
// Authentification = token aléatoire dans le payload.
// Bypass RLS via service-role : la table opr_signature_requests a RLS
// stricte (architecte voit ses propres lignes), seule cette fonction
// peut lire/écrire au nom du signataire anonyme.
//
// Actions :
//   { action: "load",   token }                     → infos OPR pour la page de signature
//   { action: "submit", token, signatureDataUrl }   → stocke la signature
//   { action: "decline",token, reason }             → refuse de signer
// ─────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function isExpired(row: Record<string, unknown>): boolean {
  const exp = row.expires_at as string | null;
  if (!exp) return false;
  return new Date(exp).getTime() < Date.now();
}

// Crée les notifications cloche pour l'architecte propriétaire :
//   - opr_signed | opr_declined : notif individuelle pour chaque action
//   - opr_completed : déclenchée si TOUTES les demandes liées à cet OPR
//                     sont passées à "signed" — débloque l'export consolidé
async function notifyOnStatusChange(
  sb: ReturnType<typeof createClient>,
  row: Record<string, unknown>,
  newStatus: "signed" | "declined",
): Promise<void> {
  try {
    // Notif individuelle
    await sb.from("notifications").insert({
      user_id: row.owner_user_id,
      type: newStatus === "signed" ? "opr_signed" : "opr_declined",
      project_id: String(row.project_id || ""),
      project_name: row.project_name,
      actor_id: null,
      actor_name: row.signatory_name,
      data: {
        opr_id: row.opr_id,
        opr_number: row.opr_number,
        signatory_role: row.signatory_role,
        signatory_email: row.signatory_email,
        request_id: row.id,
      },
    });

    // Si la nouvelle signature termine la liste, notif "completed"
    if (newStatus === "signed") {
      const { data: siblings } = await sb
        .from("opr_signature_requests")
        .select("status")
        .eq("opr_id", row.opr_id)
        .eq("owner_user_id", row.owner_user_id);
      const all = siblings || [];
      const allSigned = all.length > 0 && all.every((s: { status: string }) => s.status === "signed");
      if (allSigned) {
        await sb.from("notifications").insert({
          user_id: row.owner_user_id,
          type: "opr_completed",
          project_id: String(row.project_id || ""),
          project_name: row.project_name,
          actor_id: null,
          actor_name: "",
          data: {
            opr_id: row.opr_id,
            opr_number: row.opr_number,
            signatures_count: all.length,
          },
        });
      }
    }
  } catch (e) {
    // Non bloquant : la signature est déjà enregistrée
    console.error("notifyOnStatusChange error:", e);
  }
}

function publicShape(row: Record<string, unknown>) {
  // Ne jamais exposer owner_user_id ni le token réel dans la réponse.
  return {
    id: row.id,
    project_name: row.project_name,
    opr_number: row.opr_number,
    opr_date: row.opr_date,
    opr_type: row.opr_type,
    reserves: row.reserves_snapshot,
    reserves_hash: row.reserves_hash,
    signatory_name: row.signatory_name,
    signatory_role: row.signatory_role,
    signatory_email: row.signatory_email,
    status: isExpired(row) ? "expired" : row.status,
    expires_at: row.expires_at,
    signed_at: row.signed_at,
    signature_data_url: row.signature_data_url,
  };
}

serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json();
    const action = body.action as string;
    const token = body.token as string;

    if (!token || typeof token !== "string" || token.length < 16) {
      return jsonResponse(req, { error: "Token invalide" }, 400);
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Lecture commune
    const { data: row, error: readErr } = await sb
      .from("opr_signature_requests")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (readErr) {
      console.error("opr-signing read error:", readErr);
      return jsonResponse(req, { error: "Erreur serveur" }, 500);
    }
    if (!row) {
      return jsonResponse(req, { error: "Lien introuvable" }, 404);
    }

    // ── action: load ───────────────────────────────────
    if (action === "load") {
      // Auto-marque expiré si dépassé
      if (row.status === "pending" && isExpired(row)) {
        await sb.from("opr_signature_requests")
          .update({ status: "expired" })
          .eq("id", row.id);
        row.status = "expired";
      }
      return jsonResponse(req, { request: publicShape(row) });
    }

    // ── action: submit ─────────────────────────────────
    if (action === "submit") {
      if (row.status !== "pending") {
        return jsonResponse(req, { error: `Lien déjà ${row.status === "signed" ? "signé" : row.status}` }, 409);
      }
      if (isExpired(row)) {
        await sb.from("opr_signature_requests")
          .update({ status: "expired" })
          .eq("id", row.id);
        return jsonResponse(req, { error: "Lien expiré" }, 410);
      }
      const dataUrl = body.signatureDataUrl as string;
      if (!dataUrl || !dataUrl.startsWith("data:image/")) {
        return jsonResponse(req, { error: "Signature invalide" }, 400);
      }
      // Limite taille pour éviter abuse — 2 MB max pour une signature PNG canvas.
      if (dataUrl.length > 2 * 1024 * 1024) {
        return jsonResponse(req, { error: "Signature trop volumineuse" }, 413);
      }

      const ip = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || null;
      const ua = req.headers.get("user-agent") || null;

      const { error: updErr } = await sb
        .from("opr_signature_requests")
        .update({
          status: "signed",
          signature_data_url: dataUrl,
          signed_at: new Date().toISOString(),
          signed_ip: ip,
          signed_user_agent: ua,
        })
        .eq("id", row.id);

      if (updErr) {
        console.error("opr-signing submit error:", updErr);
        return jsonResponse(req, { error: "Échec de l'enregistrement" }, 500);
      }

      // Notifications cloche pour l'architecte (non bloquantes)
      await notifyOnStatusChange(sb, row, "signed");
      return jsonResponse(req, { success: true });
    }

    // ── action: decline ────────────────────────────────
    if (action === "decline") {
      if (row.status !== "pending") {
        return jsonResponse(req, { error: `Lien déjà ${row.status}` }, 409);
      }
      const reason = (body.reason as string || "").slice(0, 500);
      const { error: updErr } = await sb
        .from("opr_signature_requests")
        .update({ status: "declined", decline_reason: reason })
        .eq("id", row.id);
      if (updErr) {
        console.error("opr-signing decline error:", updErr);
        return jsonResponse(req, { error: "Échec" }, 500);
      }

      await notifyOnStatusChange(sb, row, "declined");
      return jsonResponse(req, { success: true });
    }

    return jsonResponse(req, { error: "Action inconnue" }, 400);
  } catch (err) {
    console.error("opr-signing error:", err);
    return jsonResponse(req, { error: (err as Error).message }, 500);
  }
});
