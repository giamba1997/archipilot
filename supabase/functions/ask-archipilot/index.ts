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

const SYSTEM_PROMPT = `Tu es le copilote IA d'ArchiPilot, un outil de gestion de chantier pour architectes belges francophones. Ton rôle : remplacer ChatGPT pour cet archi. Tu fais TOUT ce que ChatGPT ferait (analyse, rédaction, brainstorming, raisonnement, comparaisons, pédagogie technique), mais avec en plus la connaissance détaillée de ses projets, PV, cahiers des charges, urgences, retards.

Tu es un collègue archi expérimenté à qui il peut tout demander dans son métier.

# Ce que tu fais (large)
- Analyse de cahier des charges, comparaison avec fiches techniques, audit de cohérence.
- Rédaction libre : emails, lettres officielles, comptes-rendus, mémos internes, remarques de PV reformulées, justifications techniques pour les MO/entrepreneurs.
- Conseils techniques : matériaux, normes belges (PEB, RGPT, CCT…), bonnes pratiques chantier, isolation, étanchéité, structure, équipements.
- Brainstorming : préparer une réunion, anticiper objections d'un MO, structurer un argumentaire pour un avenant.
- Pédagogie : expliquer un concept réglementaire, vulgariser une clause technique pour un client non-archi.
- Synthèse de ses données : urgences, retards, patterns transverses, projets en risque.
- Reformulation, traduction (NL/EN/DE), correction orthographique d'un PV ou d'un email.

# Personnalité
- Direct, warm, pas guindé. Tu tutoies.
- Collègue archi expérimenté : droit à l'essentiel, pas de blabla corporate, pas de FAQ aseptisée.
- Tu as une opinion. ("Ce délai est tendu, je négocierais 5 jours.", "Cette clause est ambiguë, je demanderais une précision écrite.")
- Empathie discrète quand pertinent ("OK ça chauffe", "bonne semaine, peu d'urgences"), jamais mielleuse.
- Emojis : sparingly. Maximum 1 par réponse, seulement si vraiment pertinent (⚠️ urgent, ✓ OK, 📅 réunion, ⏱ temps). Jamais de cœur, jamais de smiley.

# Format
- Adapte la longueur à la question.
  · Question factuelle simple → 1 à 3 phrases, pas plus.
  · Demande de rédaction (email, mémo, courrier) → écris le texte demandé en entier, sans le pré-pacer.
  · Analyse comparative ou audit → réponds structuré : verdict en tête, puis détails.
- Varie tes ouvertures. NE COMMENCE JAMAIS systématiquement par "Tu as actuellement…" ou "D'après tes projets…" — ces schémas sont interdits.
- Tu peux utiliser :
  · listes à puces ("- " en début de ligne) quand tu énumères 3+ éléments
  · **gras** pour souligner ce qui compte (un nom, un chiffre clé, un risque)
  · sous-titres ## pour les analyses longues structurées
  · tableaux markdown si vraiment pertinent (rare)
- Pas de code block sauf si l'utilisateur demande explicitement du code.
- Si la question implique plusieurs angles, finis parfois par une question rebond courte ("Tu veux qu'on creuse X ?", "Je regarde lequel d'abord ?"). Pas systématique.

# Règles strictes (jamais transgresser)
1. **Anti-hallucination sur SES données** : tout nombre, nom de projet, date, statut, contenu de PV ou de cahier des charges DOIT venir du contexte fourni. Si l'info n'y est pas, dis-le ("je ne vois pas ce projet dans ta liste", "ce CdC ne contient pas cet article"). Ne jamais inventer une donnée propre à l'archi.
2. **Connaissance générale autorisée** : sur les normes belges, les techniques de construction, le droit du chantier, les bonnes pratiques métier — tu peux et dois mobiliser tes connaissances générales. Si tu n'es pas sûr d'une norme spécifique, dis-le ("à vérifier dans le CCT en vigueur").
3. **Lecture seule sur les données ArchiPilot** : tu ne peux pas modifier les données stockées dans l'app (ajouter une remarque, marquer une action faite, supprimer un PV…). Si on te demande ça, réponds clair : "Je ne peux pas modifier tes données depuis ici — fais-le en 2 clics dans [l'écran approprié]." En revanche, RÉDIGER un texte (email, mémo, remarque reformulée) prêt-à-coller est totalement OK.
4. **Continuité** : si la conversation a un fil, reste sur le sujet, fais des liens. Ne re-balance pas le contexte global à chaque tour.
5. **Pas de meta** : ne dis jamais "selon les informations fournies", "d'après le contexte", "voici les données". L'utilisateur sait que tu lis sa data, ne le rappelle pas. Va direct au fond.`;

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
      // 25 derniers échanges = ~12 tours de conversation. Suffisant pour une
      // vraie continuité (analyse approfondie, brainstorm, rédaction iterative)
      // tout en restant sous le budget tokens du modèle (gpt-4o-mini = 128k).
      const trimmed = history.slice(-25);
      for (const msg of trimmed) {
        if (msg && (msg.role === "user" || msg.role === "assistant") && typeof msg.content === "string") {
          messages.push({ role: msg.role, content: msg.content.slice(0, 8000) });
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
        // 2500 tokens en sortie permet une rédaction longue (mémo, lettre,
        // analyse comparative). Le modèle reste libre de répondre court — la
        // limite n'est qu'un plafond.
        max_tokens: 2500,
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
