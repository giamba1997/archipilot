// ─────────────────────────────────────────────────────────────
// F10 — Edge Function `generate-progress-report`
//
// Reçoit le contexte d'un projet sur une période et demande à OpenAI
// de générer un rapport d'avancement en markdown — synthèse claire pour
// le MO, sans jargon technique.
// ─────────────────────────────────────────────────────────────
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { authenticateUser, PlanUpgradeError } from "../_shared/auth.ts";
import { checkAiUsage, incrementAiUsage } from "../_shared/ai-usage.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const SYSTEM_PROMPT = `Tu es un assistant qui rédige des rapports d'avancement de chantier pour un MO (maître d'ouvrage). Style :
- Clair, neutre, factuel — comme un compte-rendu d'archi à son client.
- Pas de jargon technique inutile (le MO n'est pas du métier).
- Phrases courtes. Pas de superlatifs marketing.
- Structure attendue (markdown) :

# Avancement du chantier
*Période du {period_start} au {period_end}*

## Faits marquants
- 3-5 points concrets qui ont avancé pendant la période (depuis les PV).

## État du chantier
Un paragraphe de 4-6 phrases qui résume où en est le chantier.

## Points de vigilance
- Liste des réserves ouvertes critiques OU des retards/blocages observés. Si rien à signaler, mets une phrase rassurante.

## Prochaines étapes
- 3-5 actions prévues pour la période suivante (depuis les tâches ouvertes / la prochaine réunion).

Règles strictes :
- Si la donnée pour une section est vide, mets explicitement "Aucun point à signaler pour cette période."
- N'invente AUCUNE donnée. Toute affirmation doit être traçable au contexte fourni.
- Pas de formules de politesse ("Cher Monsieur..."), pas de signature — c'est l'archi qui les ajoutera.
- Maximum 400 mots au total.`;

serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const user = await authenticateUser(req);

    // Hard cap : 10/h pour les rapports d'avancement (cher en tokens, peu
    // de raisons légitimes d'en générer beaucoup plus d'1/projet/jour).
    const rl = await checkRateLimit(user.id, { action: "progress_report", maxCalls: 10, windowSeconds: 3600 });
    if (!rl.allowed) {
      return jsonResponse(req, {
        error: "Limite anti-abus atteinte (10 rapports/heure). Réessayez plus tard.",
        code: "rate_limited",
        resetAt: rl.resetAt,
      }, 429);
    }

    await checkAiUsage(user);

    const body = await req.json();
    const { period_start, period_end, project_name, status_label, pvs, tasks, reserves, photos_count, permits } = body;

    if (!period_start || !period_end) {
      return jsonResponse(req, { error: "Missing period dates" }, 400);
    }

    // Compose le contexte utilisateur — concis, structuré, prêt à digérer
    const ctx: string[] = [];
    ctx.push(`# Contexte projet`);
    ctx.push(`- Nom : ${project_name || "—"}`);
    ctx.push(`- Statut actuel : ${status_label || "—"}`);
    ctx.push(`- Période : du ${period_start} au ${period_end}`);
    ctx.push(`- Photos prises durant la période : ${photos_count || 0}`);

    if (Array.isArray(pvs) && pvs.length > 0) {
      ctx.push(`\n# PV de la période`);
      for (const pv of pvs.slice(0, 6)) {
        ctx.push(`## PV n°${pv.number} — ${pv.date}`);
        ctx.push((pv.content || pv.excerpt || "").slice(0, 1200));
      }
    }

    if (Array.isArray(reserves) && reserves.length > 0) {
      ctx.push(`\n# Réserves ouvertes (${reserves.length})`);
      for (const r of reserves.slice(0, 10)) {
        ctx.push(`- ${r.code || "—"} [${r.severity || ""}] : ${r.description || ""} ${r.contractor ? `(${r.contractor})` : ""}`);
      }
    }

    if (Array.isArray(tasks) && tasks.length > 0) {
      ctx.push(`\n# Tâches ouvertes / à faire (${tasks.length})`);
      for (const t of tasks.slice(0, 10)) {
        ctx.push(`- ${t.title || ""} ${t.dueDate ? `(échéance ${t.dueDate})` : ""}`);
      }
    }

    if (Array.isArray(permits) && permits.length > 0) {
      ctx.push(`\n# Permis en cours`);
      for (const p of permits.slice(0, 5)) {
        ctx.push(`- ${p.reference || "Permis"} — ${p.status} — échéance ${p.deadline_date || "?"}`);
      }
    }

    const userPrompt = ctx.join("\n");

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 1200,
        temperature: 0.3,
        messages: [
          { role: "system", content: SYSTEM_PROMPT.replace("{period_start}", period_start).replace("{period_end}", period_end) },
          { role: "user",   content: userPrompt },
        ],
      }),
    });

    if (!openaiRes.ok) {
      const err = await openaiRes.text();
      console.error("OpenAI generate-progress-report error:", err);
      return jsonResponse(req, { error: `OpenAI API error: ${openaiRes.status}` }, 500);
    }

    const data = await openaiRes.json();
    const content = data.choices?.[0]?.message?.content || "";
    if (!content.trim()) return jsonResponse(req, { error: "Empty response from AI" }, 500);

    await incrementAiUsage(user);

    return jsonResponse(req, { content_md: content });
  } catch (err) {
    console.error("generate-progress-report error:", err);
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
