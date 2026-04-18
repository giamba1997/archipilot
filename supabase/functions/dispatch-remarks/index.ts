import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { authenticateUser, getLimit } from "../_shared/auth.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    // Auth + plan check
    const user = await authenticateUser(req);
    const aiLimit = getLimit(user.plan, "maxAiPerMonth");

    // Persistent rate limiting
    const rateResult = await checkRateLimit(user.id, {
      action: "dispatch_remarks",
      maxCalls: Math.min(aiLimit === Infinity ? 60 : aiLimit, 60),
      windowSeconds: 3600,
    });

    if (!rateResult.allowed) {
      return jsonResponse(req, {
        error: "Trop de requêtes. Réessayez dans quelques minutes.",
        resetAt: rateResult.resetAt,
      }, 429);
    }

    let body = await req.json();
    if (typeof body === "string") { try { body = JSON.parse(body); } catch {} }
    const { transcript, posts } = body;
    if (!transcript?.trim() || !posts?.length) {
      console.error("dispatch-remarks: invalid body", { hasTranscript: !!transcript, postsLength: posts?.length, bodyType: typeof body });
      throw new Error("Missing required fields: transcript, posts");
    }

    const postsInfo = posts.map((p: { id: string; label: string }) => `${p.id}: ${p.label}`).join("\n");

    const prompt = `Tu es un assistant pour architectes belges. Voici les postes d'un chantier :
${postsInfo}

Voici la transcription d'une visite de chantier :
"${transcript}"

Répartis les remarques dans les postes appropriés. Retourne un JSON (tableau) :
[{ "postId": "01", "text": "remarque reformulée clairement", "urgent": false }, ...]

Règles :
- Reformule chaque remarque de manière concise et professionnelle.
- Si une remarque ne correspond à aucun poste existant, utilise le poste le plus proche.
- Marque urgent: true uniquement si le contenu indique clairement une urgence ou un danger.
- Retourne UNIQUEMENT le JSON, sans backticks, sans markdown, sans explication.`;

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!openaiRes.ok) {
      const err = await openaiRes.text();
      console.error("OpenAI error:", err);
      throw new Error(`OpenAI API error: ${openaiRes.status}`);
    }

    const data = await openaiRes.json();
    let raw = (data.choices?.[0]?.message?.content || "").trim();

    if (raw.startsWith("```")) {
      raw = raw.replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "").trim();
    }

    const items = JSON.parse(raw);
    if (!Array.isArray(items)) throw new Error("Invalid AI response");

    return jsonResponse(req, { items });
  } catch (err) {
    console.error("dispatch-remarks error:", err);
    return jsonResponse(req, { error: err.message }, 400);
  }
});
