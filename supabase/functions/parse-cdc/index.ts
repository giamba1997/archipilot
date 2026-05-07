// parse-cdc — Extrait la structure d'un cahier des charges en JSON.
//
// Input  : { extractedText, projectName?, projectType? }
// Output : { posts: [{id, label, summary?}], obligations: [{type, text, postId?}], attendus: [{label, category}] }
//
// L'utilisateur déclenche manuellement (opt-in via le CDC banner). Le résultat
// est ensuite affiché dans une modal de relecture où l'utilisateur valide ce
// qu'il veut appliquer au projet. Aucune mutation côté serveur.
//
// Modèle : gpt-4o-mini en mode JSON. Quota partagé via ai_usage.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { authenticateUser, PlanUpgradeError } from "../_shared/auth.ts";
import { checkAiUsage, incrementAiUsage } from "../_shared/ai-usage.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const MAX_INPUT_CHARS = 60_000;     // cap pour rester sous l'enveloppe tokens
const MAX_POSTS = 25;
const MAX_OBLIGATIONS = 30;
const MAX_ATTENDUS = 20;

const SYSTEM_PROMPT = `Tu es un assistant qui analyse des cahiers des charges (CdC) de chantier pour architectes belges francophones.

Ta mission : extraire la structure factuelle du document en JSON strict. Tu n'inventes RIEN — si une information n'est pas dans le texte, tu ne la mets pas.

Tu retournes EXACTEMENT cette structure JSON (aucun champ supplémentaire, aucun texte hors du JSON) :

{
  "posts": [
    { "id": "01", "label": "Situation du chantier", "summary": "Court rappel des travaux concernés" }
  ],
  "obligations": [
    { "type": "matériau" | "marque" | "performance" | "norme" | "délai" | "autre", "text": "Description courte de l'obligation", "postId": "01" }
  ],
  "attendus": [
    { "label": "Document/test/livrable attendu", "category": "documents" | "tests" | "essais" | "autre" }
  ]
}

# Règles strictes
- "posts" : numérotation à 2 chiffres (01, 02, 10, 11, 23…). Suis les sections du CdC s'il y a une numérotation officielle ; sinon utilise une numérotation décimale standard métier (général 01-09, gros œuvre 10-29, enveloppe 30-49, finitions 50-69, techniques 70-89, abords 90-99). Maximum ${MAX_POSTS} postes. Le label est court (1-4 mots). Le summary est UNE phrase factuelle (max 100 caractères).
- "obligations" : exigences précises imposées par le CdC (marque imposée, performance minimale, norme à respecter, délai d'exécution, matériau spécifique). Le "postId" pointe vers un id de "posts" si évident, sinon laisse-le vide. Maximum ${MAX_OBLIGATIONS} obligations. Le "text" est factuel et court (max 150 caractères).
- "attendus" : documents, certificats, essais ou livrables EXIGÉS à la livraison/réception. Maximum ${MAX_ATTENDUS} attendus.
- Si une catégorie n'a aucun élément, renvoie un tableau vide ([]). NE jamais omettre une clé.
- Terminologie belge (PEB, RGPT, CCT, RGIE, CSTC). Vouvoyer dans les valeurs si jamais tu cites le CdC, mais reste factuel.
- Si le texte fourni est trop court ou non-pertinent (pas un CdC), retourne tous les tableaux vides.`;

serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const user = await authenticateUser(req);
    await checkAiUsage(user);

    let body = await req.json();
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { /* keep raw */ } }
    const { extractedText, projectName, projectType } = body;
    if (!extractedText?.trim()) throw new Error("Missing required field: extractedText");

    const trimmed = String(extractedText).slice(0, MAX_INPUT_CHARS);
    const userPrompt = `${projectName ? `Projet : ${projectName}\n` : ""}${projectType ? `Type : ${projectType}\n` : ""}\n[CAHIER DES CHARGES À ANALYSER]\n${trimmed}`;

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 4000,
        temperature: 0.1,            // déterministe — c'est de l'extraction, pas de la rédaction
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!openaiRes.ok) {
      const err = await openaiRes.text();
      console.error("OpenAI error (parse-cdc):", err);
      throw new Error(`OpenAI API error: ${openaiRes.status}`);
    }

    const data = await openaiRes.json();
    const raw = data.choices?.[0]?.message?.content || "";
    if (!raw.trim()) throw new Error("Empty response from AI");

    let parsed: { posts?: unknown; obligations?: unknown; attendus?: unknown };
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error("parse-cdc: invalid JSON from model:", raw.slice(0, 500));
      throw new Error("La réponse de l'IA n'est pas un JSON valide.");
    }

    // Sanitize & cap — défensif au cas où le modèle ignore les limites.
    const posts = Array.isArray(parsed.posts) ? parsed.posts : [];
    const obligations = Array.isArray(parsed.obligations) ? parsed.obligations : [];
    const attendus = Array.isArray(parsed.attendus) ? parsed.attendus : [];

    const cleanPosts = posts
      .slice(0, MAX_POSTS)
      .map((p: { id?: unknown; label?: unknown; summary?: unknown }) => ({
        id: String(p.id || "").slice(0, 12).trim(),
        label: String(p.label || "").slice(0, 80).trim(),
        summary: p.summary ? String(p.summary).slice(0, 200).trim() : "",
      }))
      .filter(p => p.id && p.label);

    const cleanObligations = obligations
      .slice(0, MAX_OBLIGATIONS)
      .map((o: { type?: unknown; text?: unknown; postId?: unknown }) => ({
        type: String(o.type || "autre").slice(0, 30),
        text: String(o.text || "").slice(0, 300).trim(),
        postId: o.postId ? String(o.postId).slice(0, 12) : "",
      }))
      .filter(o => o.text);

    const cleanAttendus = attendus
      .slice(0, MAX_ATTENDUS)
      .map((a: { label?: unknown; category?: unknown }) => ({
        label: String(a.label || "").slice(0, 200).trim(),
        category: String(a.category || "autre").slice(0, 30),
      }))
      .filter(a => a.label);

    await incrementAiUsage(user);

    return jsonResponse(req, {
      posts: cleanPosts,
      obligations: cleanObligations,
      attendus: cleanAttendus,
      parsedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    console.error("parse-cdc error:", err);
    if (err instanceof PlanUpgradeError) {
      return jsonResponse(req, {
        error: err.message,
        code: err.code,
        feature: err.feature,
      }, 403);
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse(req, { error: message }, 400);
  }
});
