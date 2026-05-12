import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { authenticateUser, PlanUpgradeError } from "../_shared/auth.ts";
import { checkAiUsage, incrementAiUsage } from "../_shared/ai-usage.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

// Prompt d'extraction de tâches — appelé en second temps (sur le PV déjà
// généré) pour déterminer s'il y a des actions concrètes à faire suite à ce
// PV. Anti-bruit STRICT : zéro suggestion est préférable à des suggestions
// vagues. Le modèle peut renvoyer un tableau vide.
const TASK_EXTRACTION_SYSTEM = `Tu détectes les actions concrètes à faire suite à un procès-verbal de chantier.

Tu retournes EXACTEMENT cet objet JSON (aucun champ supplémentaire, aucun texte hors JSON) :
{
  "tasks": [
    {
      "title": "Verbe d'action + livrable précis (max 80 caractères)",
      "priority": "low" | "medium" | "high" | "urgent",
      "dueDate": "yyyy-mm-dd" ou "" si non précisé,
      "assigneeName": "Personne ou rôle si mentionné, sinon ''",
      "postId": "id du poste lié si évident, sinon ''",
      "sourceExcerpt": "Extrait court du PV (max 120 caractères) qui justifie cette tâche"
    }
  ]
}

# Règles strictes (à respecter absolument)
1. **Anti-bruit prioritaire** : si rien ne ressort comme action concrète, retourne {"tasks": []}. Une réponse vide est PRÉFÉRABLE à des suggestions creuses.
2. **Critères d'une tâche valide** : verbe d'action concret + livrable identifiable + idéalement un responsable. Exemples valides :
   - "Faire les resserrages coupe-feu RDC"
   - "Fournir les fiches techniques électricité"
   - "Vérifier l'étanchéité toiture étage 2"
3. **À REJETER absolument** : "informer", "discuter", "continuer", "surveiller", "voir avec X" sans livrable précis, et toute paraphrase du contenu du PV qui n'engage pas une action.
4. **Priorité** : "urgent" si signalé urgent ou critique sécurité ; "high" si retard ou impact MO ; "medium" par défaut ; "low" si point de vigilance secondaire.
5. **Échéance** : ne mets une date QUE si elle est explicitement écrite ou déductible (« avant la prochaine réunion », « pour le 15/04 »). Sinon "".
6. **Maximum 8 tâches** — au-delà c'est du bruit. Privilégie la qualité.
7. **Le sourceExcerpt** doit être copié-collé du PV (pas reformulé).`;

serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const user = await authenticateUser(req);

    // Hard cap anti-abus — applique même sur plans Pro/Team (qui ont
    // checkAiUsage = Infinity). Protège contre compte compromis qui
    // tenterait de spammer OpenAI.
    const rl = await checkRateLimit(user.id, { action: "generate_pv", maxCalls: 50, windowSeconds: 3600 });
    if (!rl.allowed) {
      return jsonResponse(req, {
        error: "Limite anti-abus atteinte (50 PV/heure). Réessayez plus tard ou contactez le support.",
        code: "rate_limited",
        resetAt: rl.resetAt,
      }, 429);
    }

    await checkAiUsage(user);

    let body = await req.json();
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { /* keep raw */ } }
    const { systemPrompt, userPrompt, maxTokens, extractTasks } = body;
    if (!userPrompt?.trim()) throw new Error("Missing required field: userPrompt");

    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt?.trim()) messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: userPrompt });

    // ── 1. Génération du PV (inchangé) ─────────────────────────
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: body.model || "gpt-4o-mini",
        // Hard cap côté serveur : un client malveillant pourrait sinon
        // demander 100k tokens et exploser la facture OpenAI.
        max_tokens: Math.min(Number(maxTokens) || 2000, 4000),
        temperature: 0.3,
        messages,
      }),
    });

    if (!openaiRes.ok) {
      const err = await openaiRes.text();
      console.error("OpenAI error:", err);
      throw new Error(`OpenAI API error: ${openaiRes.status}`);
    }

    const data = await openaiRes.json();
    const content = data.choices?.[0]?.message?.content || "";
    if (!content.trim()) throw new Error("Empty response from AI");

    // ── 2. Extraction de tâches potentielles (opt-in via extractTasks) ──
    // On fait un second appel sur le PV déjà généré. Coût supplémentaire
    // côté infra (1 appel OpenAI), mais ai_usage n'est incrémenté qu'une
    // seule fois — c'est un service inclus dans la génération de PV.
    let suggestedTasks: unknown[] = [];
    if (extractTasks !== false) {
      try {
        const taskRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            max_tokens: 1500,
            temperature: 0.1,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: TASK_EXTRACTION_SYSTEM },
              { role: "user", content: `Voici le PV à analyser :\n\n${content}` },
            ],
          }),
        });
        if (taskRes.ok) {
          const taskData = await taskRes.json();
          const raw = taskData.choices?.[0]?.message?.content || "{}";
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed?.tasks)) {
              suggestedTasks = parsed.tasks
                .slice(0, 8)
                .filter((t: { title?: unknown }) => t && typeof t.title === "string" && t.title.trim().length >= 6)
                .map((t: { title: string; priority?: string; dueDate?: string; assigneeName?: string; postId?: string; sourceExcerpt?: string }) => ({
                  title: String(t.title).slice(0, 200).trim(),
                  priority: ["low", "medium", "high", "urgent"].includes(t.priority || "") ? t.priority : "medium",
                  dueDate: t.dueDate ? String(t.dueDate).slice(0, 12) : "",
                  assigneeName: t.assigneeName ? String(t.assigneeName).slice(0, 100) : "",
                  postId: t.postId ? String(t.postId).slice(0, 12) : "",
                  sourceExcerpt: t.sourceExcerpt ? String(t.sourceExcerpt).slice(0, 240) : "",
                }));
            }
          } catch (parseErr) {
            console.warn("Task extraction JSON parse failed:", parseErr);
          }
        } else {
          console.warn("Task extraction OpenAI call failed (non-blocking):", taskRes.status);
        }
      } catch (taskErr) {
        // L'extraction de tâches est non-bloquante : on n'échoue pas la
        // génération du PV si elle plante.
        console.warn("Task extraction failed (non-blocking):", taskErr);
      }
    }

    // Bump usage only after a successful AI response — failed calls don't count.
    await incrementAiUsage(user);

    return jsonResponse(req, { content, suggestedTasks });
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
