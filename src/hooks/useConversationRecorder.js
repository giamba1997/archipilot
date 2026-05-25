import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";

// useConversationRecorder — enregistrement long format (Phase 2 du Mode
// Chantier, "le téléphone posé sur la table"). Diffère de
// useWhisperRecorder sur trois points clés :
//
//   1. Pause / Resume natif du MediaRecorder (conversation hors sujet,
//      appel téléphonique reçu, pause café).
//   2. Wake Lock API pour empêcher l'écran de se verrouiller — iOS
//      Safari coupe l'audio sinon. Best-effort, ne bloque pas si non
//      supporté (Firefox Android, vieux Safari).
//   3. Pas de transcription automatique : la conversation peut durer
//      plusieurs heures, on transcrit UNE fois à la fin via la
//      fonction transcribeAudioBlob exportée. Le composant peut afficher
//      "Transcription en cours…" pendant l'appel.
//
// Pas de pipeline compresseur custom : la voix de conversation autour
// d'une table est plus forte que les dictées de loin, et le compresseur
// ajoute un risque de saturation sur les rires/exclamations. Whisper
// gère très bien sans aide.
//
// L'API en sortie :
//   start()          — démarre micro + recorder + wake lock
//   pause() / resume() — bascule MediaRecorder pause/resume
//   stop()           — Promise<Blob | null> : retourne le blob final
//                       et libère toutes les ressources
//   isRecording      — true entre start() et stop()
//   isPaused         — true entre pause() et resume()
//   duration         — secondes d'enregistrement effectif (hors pause)
//   audioLevel       — 0-100, niveau RMS courant (pour le VU meter)
//   estimatedSize    — bytes accumulés (chunks)
//   error            — code stable (micDenied | noMic | recorder | unknown)
export function useConversationRecorder({ onError } = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [estimatedSize, setEstimatedSize] = useState(0);
  const [error, setError] = useState(null);

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const ctxRef = useRef(null);
  const analyserRef = useRef(null);
  const wakeLockRef = useRef(null);
  const timerRef = useRef(null);
  const meterRafRef = useRef(null);
  const startedAtRef = useRef(0);
  const pausedDurationRef = useRef(0);
  const pauseStartRef = useRef(0);

  const teardown = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (meterRafRef.current) { cancelAnimationFrame(meterRafRef.current); meterRafRef.current = null; }
    try {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
    } catch { /* already stopped */ }
    recorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (ctxRef.current) {
      try { ctxRef.current.close(); } catch { /* ignore */ }
      ctxRef.current = null;
    }
    analyserRef.current = null;
    if (wakeLockRef.current) {
      try { wakeLockRef.current.release(); } catch { /* ignore */ }
      wakeLockRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  // Cleanup à l'unmount du composant qui possède le hook (typiquement
  // ChantierModeView). Garantit qu'on libère le mic + wake lock même si
  // l'archi navigue ailleurs en plein enregistrement.
  useEffect(() => {
    return () => teardown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tente de réacquérir le wake lock après une perte (changement
  // d'onglet → revient). Recommandation MDN.
  useEffect(() => {
    if (!isRecording) return;
    const handler = async () => {
      if (document.visibilityState !== "visible") return;
      if (wakeLockRef.current || !("wakeLock" in navigator)) return;
      try {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      } catch { /* best-effort */ }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [isRecording]);

  const start = useCallback(async () => {
    setError(null);
    if (isRecording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          noiseSuppression: true,
          echoCancellation: true,
          sampleRate: 48000,
          channelCount: 1,
        },
      });
      streamRef.current = stream;

      // AnalyserNode pour le VU meter — branché en parallèle, ne touche
      // pas au signal enregistré (analyse only).
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArr = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(dataArr);
        let sum = 0;
        for (let i = 0; i < dataArr.length; i++) {
          const v = (dataArr[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / dataArr.length);
        setAudioLevel(Math.min(100, Math.round(rms * 220)));
        meterRafRef.current = requestAnimationFrame(tick);
      };
      tick();

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 32000,
      });
      recorderRef.current = recorder;
      chunksRef.current = [];
      setEstimatedSize(0);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
          const total = chunksRef.current.reduce((acc, c) => acc + c.size, 0);
          setEstimatedSize(total);
        }
      };
      recorder.onerror = (e) => {
        console.error("MediaRecorder error:", e);
        setError("recorder");
        onError?.("recorder", e);
      };

      // timeslice 2000 ms — chunks réguliers pour survivre à interruption
      recorder.start(2000);

      // Wake lock (best-effort)
      try {
        if ("wakeLock" in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request("screen");
        }
      } catch { /* non bloquant */ }

      startedAtRef.current = Date.now();
      pausedDurationRef.current = 0;
      pauseStartRef.current = 0;
      setDuration(0);
      timerRef.current = setInterval(() => {
        const elapsed = (Date.now() - startedAtRef.current - pausedDurationRef.current) / 1000;
        setDuration(Math.floor(elapsed));
      }, 250);

      setIsRecording(true);
      setIsPaused(false);
    } catch (err) {
      teardown();
      if (err?.name === "NotAllowedError") {
        setError("micDenied");
        onError?.("micDenied", err);
      } else if (err?.name === "NotFoundError") {
        setError("noMic");
        onError?.("noMic", err);
      } else {
        console.error("useConversationRecorder start failed:", err);
        setError("unknown");
        onError?.("unknown", err);
      }
    }
  }, [isRecording, onError, teardown]);

  const pause = useCallback(() => {
    if (!recorderRef.current || !isRecording || isPaused) return;
    try {
      recorderRef.current.pause();
      pauseStartRef.current = Date.now();
      setIsPaused(true);
    } catch (err) { console.warn("Pause failed:", err); }
  }, [isRecording, isPaused]);

  const resume = useCallback(() => {
    if (!recorderRef.current || !isRecording || !isPaused) return;
    try {
      recorderRef.current.resume();
      if (pauseStartRef.current) {
        pausedDurationRef.current += Date.now() - pauseStartRef.current;
        pauseStartRef.current = 0;
      }
      setIsPaused(false);
    } catch (err) { console.warn("Resume failed:", err); }
  }, [isRecording, isPaused]);

  // stop() retourne une Promise<Blob | null>. Le composant qui consomme
  // peut await stop() pour récupérer le blob final et le passer à
  // transcribeAudioBlob avant de fermer la visite.
  const stop = useCallback(() => {
    return new Promise((resolve) => {
      if (!recorderRef.current || !isRecording) {
        resolve(null);
        return;
      }
      const recorder = recorderRef.current;
      const mimeType = recorder.mimeType || "audio/webm";
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        teardown();
        setIsRecording(false);
        setIsPaused(false);
        resolve(blob.size > 0 ? blob : null);
      };
      try {
        // Si on est en pause, le navigateur peut refuser stop() sur certains
        // implém — on resume() d'abord par sécurité.
        if (recorder.state === "paused") recorder.resume();
        recorder.stop();
      } catch (err) {
        console.error("MediaRecorder stop failed:", err);
        teardown();
        setIsRecording(false);
        setIsPaused(false);
        resolve(null);
      }
    });
  }, [isRecording, teardown]);

  return {
    start, stop, pause, resume,
    isRecording, isPaused,
    duration, audioLevel, estimatedSize,
    error,
  };
}

// Envoie un blob audio à l'edge function transcribe-audio (réutilise
// l'infra Whisper déjà déployée). Retourne le texte transcrit ou ""
// en cas d'erreur — c'est à l'appelant de gérer le fallback (proposer
// de réessayer, sauvegarder l'audio brut, etc.).
//
// Coût Whisper : ~0,006 $/min. Une réunion de 1h ≈ 0,36 €. Rate limit
// à prévoir côté backend si l'usage explose.
export async function transcribeAudioBlob(blob) {
  if (!blob || blob.size === 0) return "";
  const fd = new FormData();
  fd.append("file", blob, "conversation.webm");
  fd.append("language", "fr");
  const { data, error: fnErr } = await supabase.functions.invoke("transcribe-audio", {
    body: fd,
  });
  if (fnErr) throw fnErr;
  if (data?.error) throw new Error(data.error);
  return (data?.text || "").trim();
}
