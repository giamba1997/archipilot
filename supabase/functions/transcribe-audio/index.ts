// transcribe-audio — Whisper transcription for PV voice dictation.
//
// Le frontend envoie un blob audio (webm/opus typiquement) en
// multipart/form-data. On le transmet à OpenAI /v1/audio/transcriptions
// avec model whisper-1 et lang fr, puis on retourne { text }.
//
// Usage volontairement restreint : cette fonction sert uniquement la
// dictée des PV dans NoteEditor. Le chatbot et les autres features ne
// l'utilisent pas.
//
// Coût : ~$0.006/min. Une visite chantier de 30 min coûte ~0,18 €.
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { authenticateUser, PlanUpgradeError } from "../_shared/auth.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

// 25 MB — limite OpenAI pour /v1/audio/transcriptions. Au-delà, la requête
// échoue côté OpenAI. On rejette tôt pour donner un message clair.
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    await authenticateUser(req);

    // multipart/form-data attendu : `file` (Blob audio) + `language` (optionnel)
    const formData = await req.formData();
    const file = formData.get("file");
    const language = (formData.get("language") as string) || "fr";

    if (!(file instanceof File)) {
      return jsonResponse(req, { error: "Missing audio file in 'file' field" }, 400);
    }
    if (file.size === 0) {
      return jsonResponse(req, { error: "Empty audio file" }, 400);
    }
    if (file.size > MAX_AUDIO_BYTES) {
      return jsonResponse(req, {
        error: `Audio trop lourd (${Math.round(file.size / 1024 / 1024)} Mo). Limite : 25 Mo.`,
      }, 413);
    }

    // Forward to OpenAI. On préserve le Content-Type du blob (audio/webm
    // typiquement) — Whisper l'identifie via le filename.
    const upstream = new FormData();
    upstream.append("file", file, file.name || "audio.webm");
    upstream.append("model", "whisper-1");
    upstream.append("language", language);
    // response_format=json donne { text } simple. Possible d'utiliser
    // verbose_json pour avoir des timings, mais on n'en a pas besoin v1.
    upstream.append("response_format", "json");
    // temperature 0 = transcription la plus fidèle. Pas de "créativité".
    upstream.append("temperature", "0");

    const openaiRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: upstream,
    });

    if (!openaiRes.ok) {
      const errBody = await openaiRes.text();
      console.error("Whisper error:", openaiRes.status, errBody);
      return jsonResponse(req, {
        error: `Erreur transcription (${openaiRes.status})`,
      }, 502);
    }

    const data = await openaiRes.json();
    const text = String(data.text || "").trim();

    return jsonResponse(req, { text });
  } catch (err: unknown) {
    console.error("transcribe-audio error:", err);
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
