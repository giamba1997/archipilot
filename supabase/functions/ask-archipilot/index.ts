// ask-archipilot — Chatbot Edge Function.
//
// Le client envoie : { context, history, question }
// — context : markdown structuré construit côté client à partir des projets
//   chargés en mémoire (l'utilisateur a déjà toute sa data, on évite un round
//   trip Supabase RLS pour reconstruire ce qu'on a déjà).
// — history : derniers messages [{ role: "user"|"assistant", content }]
// — question : nouvelle question utilisateur
//
// Le serveur authentifie le user, ajoute un system prompt strict (read-only,
// honnêteté en cas de doute, pas d'invention), et appelle OpenAI gpt-4o-mini.
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { authenticateUser, PlanUpgradeError } from "../_shared/auth.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const SYSTEM_PROMPT = `Tu es le copilote d'ArchiPilot, un outil de gestion de chantier pour architectes belges francophones. Tu accompagnes l'archi dans sa journée — pas un assistant FAQ, plutôt un collègue qui connaît ses dossiers.

# Personnalité
- Direct, warm, pas guindé. Tu tutoies.
- Tu parles comme un collègue archi expérimenté : tu vas droit à l'essentiel, tu ne fais pas de blabla corporate.
- Tu n'as pas peur d'avoir une opinion ("ce projet a l'air en retard", "je regarderais d'abord X").
- Tu reconnais l'effort ou la galère ("OK ça chauffe", "bonne semaine, peu d'urgences"). Empathie discrète, pas mielleuse.
- Tu peux utiliser un emoji discret (1 max par réponse, et seulement quand pertinent : ⚠️ urgent, ✓ OK, 📅 réunion, ⏱ temps). Jamais de cœur, jamais de smiley.

# Format
- TRÈS concis : 1 à 3 phrases dans 80% des cas. Pas de pavé.
- Varie tes ouvertures. NE COMMENCE JAMAIS systématiquement par "Tu as actuellement…" — ce schéma est interdit.
- Quand tu énumères 3+ éléments, utilise une liste à puces simple ("- " en début de ligne).
- Tu peux mettre **un mot ou deux en gras** (markdown **) pour souligner ce qui compte (un nom de projet, un retard, un chiffre clé). Sparingly.
- Si la question implique plusieurs angles, finis parfois par une question rebond courte ("Tu veux qu'on creuse X ?", "Je regarde lequel d'abord ?").
- Pas de titre markdown (#, ##), pas de tableau, pas de code block.

# Ce que tu fais
- Identifier urgences, retards, patterns, anomalies dans la data fournie.
- Faire des liens entre projets (un retard récurrent, un client lent, etc.) si c'est dans le contexte.
- Quand l'utilisateur a l'air vague ou stressé, propose une action concrète ("Commence par le PV n°9 du projet X, c'est le plus chaud").

# Règles strictes (jamais transgresser)
1. **Anti-hallucination** : tu ne dois JAMAIS inventer un fait. Si l'info manque, dis-le honnêtement avec une formule chaleureuse — "je ne vois pas ça dans tes données", "tu n'as pas encore renseigné cette info", "il faudrait jeter un œil à X côté de l'app".
2. **Lecture seule** : tu ne peux pas modifier de données. Si on te demande "ajoute…", "marque…", "supprime…" → réponds direct : "Je ne peux pas encore toucher à tes données — tu peux le faire en 2 clics depuis [l'écran X]." Ne promets JAMAIS qu'une modif arrive sans qualification.
3. **Précision chiffrée** : tout nombre (heures, jours, comptes) vient EXACTEMENT du contexte. Pas d'approximation.
4. **Continuité** : si la conversation a un fil (l'utilisateur creuse un projet), reste sur le sujet, fais des liens. Ne re-balance pas le contexte global à chaque tour.
5. **Pas de meta** : ne dis jamais "selon les informations fournies", "d'après le contexte", "voici les données". L'utilisateur sait que tu lis sa data, ne le rappelle pas.`;

serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    await authenticateUser(req);

    let body = await req.json();
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { /* keep raw */ }
    }
    const { context, history, question, attachments } = body;
    if (!question?.trim()) throw new Error("Missing required field: question");

    // OpenAI accepte un message user soit comme string, soit comme array de
    // content blocks (text + image_url) quand on utilise la vision.
    type ContentBlock =
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };

    const messages: Array<{ role: string; content: string | ContentBlock[] }> = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "system",
        content: `Voici le contexte de l'utilisateur (ses projets et données actuelles) :\n\n${context || "(aucun projet pour le moment)"}`,
      },
    ];

    // Inclure l'historique récent (cap à 10 derniers échanges pour rester
    // dans l'enveloppe budget tokens et éviter de dériver).
    if (Array.isArray(history)) {
      const trimmed = history.slice(-10);
      for (const msg of trimmed) {
        if (msg && (msg.role === "user" || msg.role === "assistant") && typeof msg.content === "string") {
          messages.push({ role: msg.role, content: msg.content.slice(0, 4000) });
        }
      }
    }

    // Construire le message user — texte simple si pas de pièces jointes,
    // sinon array vision-compatible (text + image_url) avec textes des PDF
    // déjà extraits côté client et passés en `attachments[*].text`.
    const imageAttachments = (attachments || []).filter((a: { type: string }) => a?.type === "image");
    const textAttachments = (attachments || []).filter((a: { type: string }) => a?.type === "text");

    let userContent: string | ContentBlock[];
    if (imageAttachments.length === 0 && textAttachments.length === 0) {
      userContent = question;
    } else {
      const blocks: ContentBlock[] = [];
      // Préfixer le texte de la question avec le contenu textuel des PDF/docs
      // joints — l'IA voit explicitement de quel fichier vient quel texte.
      let combined = question;
      for (const att of textAttachments) {
        if (att?.content) {
          combined += `\n\n[Pièce jointe : ${att.name || "document"}]\n${String(att.content).slice(0, 30000)}`;
        }
      }
      blocks.push({ type: "text", text: combined });
      // Puis les images en mode vision low-detail (suffit pour photos chantier
      // et PV scannés ; high-detail double le coût pour ce cas peu utile).
      for (const att of imageAttachments) {
        if (att?.dataUrl) {
          blocks.push({
            type: "image_url",
            image_url: { url: att.dataUrl, detail: "low" },
          });
        }
      }
      userContent = blocks;
    }

    messages.push({ role: "user", content: userContent });

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 600,
        temperature: 0.4,
        messages,
      }),
    });

    if (!openaiRes.ok) {
      const err = await openaiRes.text();
      console.error("OpenAI error (ask-archipilot):", err);
      throw new Error(`OpenAI API error: ${openaiRes.status}`);
    }

    const data = await openaiRes.json();
    const content = data.choices?.[0]?.message?.content || "";
    if (!content.trim()) throw new Error("Empty response from AI");

    return jsonResponse(req, { content });
  } catch (err: unknown) {
    console.error("ask-archipilot error:", err);
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
