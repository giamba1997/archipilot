import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { authenticateUser, PlanUpgradeError } from "../_shared/auth.ts";
import { checkAiUsage, incrementAiUsage } from "../_shared/ai-usage.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const user = await authenticateUser(req);
    // Enforce monthly AI cap (throws PlanUpgradeError for Free users at limit).
    await checkAiUsage(user);

    let body = await req.json();
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { /* keep raw */ } }
    const { systemPrompt, userPrompt, maxTokens } = body;
    if (!userPrompt?.trim()) throw new Error("Missing required field: userPrompt");

    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt?.trim()) messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: userPrompt });

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model: "gpt-4o", max_tokens: maxTokens || 2000, messages }),
    });

    if (!openaiRes.ok) {
      const err = await openaiRes.text();
      console.error("OpenAI error:", err);
      throw new Error(`OpenAI API error: ${openaiRes.status}`);
    }

    const data = await openaiRes.json();
    const content = data.choices?.[0]?.message?.content || "";
    if (!content.trim()) throw new Error("Empty response from AI");

    // Bump usage only after a successful AI response — failed calls don't count.
    await incrementAiUsage(user);

    return jsonResponse(req, { content });
  } catch (err) {
    console.error("generate-pv error:", err);
    if (err instanceof PlanUpgradeError) {
      return jsonResponse(req, {
        error: err.message,
        code: err.code,
        feature: err.feature,
        currentPlan: err.currentPlan,
        requiredPlan: err.requiredPlan,
      }, 403);
    }
    return jsonResponse(req, { error: err.message }, 400);
  }
});
