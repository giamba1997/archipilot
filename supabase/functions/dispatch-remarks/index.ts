import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Simple in-memory rate limiter (resets on cold start)
const rateMap = new Map<string, { count: number; reset: number }>();
const RATE_LIMIT = 20; // max calls per hour
const RATE_WINDOW = 3600_000; // 1 hour in ms

function checkRate(userId: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(userId);
  if (!entry || now > entry.reset) {
    rateMap.set(userId, { count: 1, reset: now + RATE_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

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
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    // Rate limit
    if (!checkRate(user.id)) {
      return new Response(JSON.stringify({ error: "Trop de requêtes. Réessayez dans quelques minutes." }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const { transcript, posts } = await req.json();
    if (!transcript?.trim() || !posts?.length) {
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

    // Strip markdown fences if present
    if (raw.startsWith("```")) {
      raw = raw.replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "").trim();
    }

    const items = JSON.parse(raw);
    if (!Array.isArray(items)) throw new Error("Invalid AI response");

    return new Response(JSON.stringify({ items }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    console.error("dispatch-remarks error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
