import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";

// useWhisperRecorder — enregistre le micro avec un pipeline Web Audio
// (compresseur dynamique + gain) puis envoie le blob à l'Edge Function
// transcribe-audio (qui appelle Whisper côté serveur).
//
// Pourquoi un pipeline custom : la Web Speech API ne permettait pas de
// booster le signal. Avec MediaRecorder on contrôle la chaîne audio
// complète. Le compresseur réduit la dynamique (les voix faibles
// remontent, les pics se calment) et le gain ajoute un boost final.
// Résultat : meilleure qualité de transcription pour des voix de loin.
//
// Modes :
//   - "perPost"   : enregistrement court, transcript envoyé via onResult
//                   à la fin (un seul résultat)
//   - "continuous": même comportement, mais l'archi peut enregistrer
//                   longtemps. Whisper accepte jusqu'à ~25 Mo / 30 min.
//
// L'API en sortie :
//   start()         — démarre micro + recorder
//   stop()          — stoppe + envoie à Whisper, déclenche onResult
//   isRecording     — true pendant l'enregistrement actif
//   isTranscribing  — true pendant l'appel Whisper
//   error           — code d'erreur stable (micDenied, noMic, transcribe…)
//   stream          — MediaStream RAW (pour brancher un VU meter)
export function useWhisperRecorder({ onResult, onError } = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState(null);
  const [stream, setStream] = useState(null);

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const ctxRef = useRef(null);
  const rawStreamRef = useRef(null);
  const startedAtRef = useRef(0);

  // Cleanup à l'unmount — assure qu'on libère le mic même si le composant
  // disparaît brutalement (navigation, modal fermé).
  useEffect(() => {
    return () => {
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const teardown = useCallback(() => {
    try {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
    } catch { /* already stopped */ }
    recorderRef.current = null;

    if (rawStreamRef.current) {
      rawStreamRef.current.getTracks().forEach(t => t.stop());
      rawStreamRef.current = null;
    }
    if (ctxRef.current) {
      try { ctxRef.current.close(); } catch { /* ignore */ }
      ctxRef.current = null;
    }
    setStream(null);
  }, []);

  const transcribe = useCallback(async (blob) => {
    setIsTranscribing(true);
    try {
      const fd = new FormData();
      // Whisper identifie le format via le filename — on précise webm.
      fd.append("file", blob, "dictation.webm");
      fd.append("language", "fr");
      const { data, error: fnErr } = await supabase.functions.invoke("transcribe-audio", {
        body: fd,
      });
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);
      const text = (data?.text || "").trim();
      if (text) onResult?.(text);
      return text;
    } catch (err) {
      console.error("Whisper transcription failed:", err);
      setError("transcribe");
      onError?.("transcribe", err);
      return "";
    } finally {
      setIsTranscribing(false);
    }
  }, [onResult, onError]);

  const start = useCallback(async () => {
    setError(null);
    if (isRecording) return;

    try {
      const rawStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          noiseSuppression: true,
          echoCancellation: true,
          sampleRate: 48000,
          channelCount: 1,
        },
      });
      rawStreamRef.current = rawStream;
      setStream(rawStream);

      // Pipeline : source → compresseur dynamique → gain → destination
      // On ne pousse pas trop le gain (1.4 ≈ +3 dB) parce que le compresseur
      // fait déjà la plus grosse partie du boulot en ramenant les voix
      // faibles vers le centre. Gain trop fort = saturation pour les voix
      // déjà fortes.
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      ctxRef.current = ctx;

      const source = ctx.createMediaStreamSource(rawStream);
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -45;  // dès -45 dB on commence à compresser
      compressor.knee.value = 30;
      compressor.ratio.value = 8;        // ratio 8:1 — agressif, c'est voulu
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;
      const gain = ctx.createGain();
      gain.gain.value = 1.4;
      const dest = ctx.createMediaStreamDestination();
      source.connect(compressor);
      compressor.connect(gain);
      gain.connect(dest);

      // MediaRecorder consume the destination stream (post-pipeline).
      // audio/webm;codecs=opus est dispo partout (Chrome, Firefox, Edge,
      // Safari récents). Bitrate 32 kbps suffit pour la voix et reste léger.
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(dest.stream, {
        mimeType,
        audioBitsPerSecond: 32000,
      });
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onerror = (e) => {
        console.error("MediaRecorder error:", e);
        setError("recorder");
        onError?.("recorder", e);
      };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        // Stop tracks + close ctx APRÈS avoir capturé le blob — évite la perte
        // des dernières millisecondes audio.
        teardown();
        if (blob.size === 0) return;
        await transcribe(blob);
      };

      // timeslice 1000 ms = on collecte des chunks réguliers, ce qui rend
      // le blob final plus robuste si le recorder est interrompu (navigation,
      // crash). Le blob final est cohérent sans cette option mais on évite
      // les corruptions partielles.
      recorder.start(1000);
      startedAtRef.current = Date.now();
      setIsRecording(true);
    } catch (err) {
      teardown();
      if (err?.name === "NotAllowedError") {
        setError("micDenied");
        onError?.("micDenied", err);
      } else if (err?.name === "NotFoundError") {
        setError("noMic");
        onError?.("noMic", err);
      } else {
        console.error("useWhisperRecorder start failed:", err);
        setError("unknown");
        onError?.("unknown", err);
      }
    }
  }, [isRecording, onError, teardown, transcribe]);

  const stop = useCallback(() => {
    if (!recorderRef.current || !isRecording) return;
    setIsRecording(false);
    try {
      // .stop() déclenche ondataavailable puis onstop ; on transcrit dans onstop.
      recorderRef.current.stop();
    } catch (err) {
      console.error("MediaRecorder stop failed:", err);
      teardown();
    }
  }, [isRecording, teardown]);

  return { start, stop, isRecording, isTranscribing, error, stream };
}
