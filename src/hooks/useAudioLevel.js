import { useEffect, useRef, useState } from "react";

// useAudioLevel — exposes the live RMS level (0-100) of the user's microphone
// while `active` is true. Used to drive a VU meter so the user can see
// whether the mic actually picks up their voice.
//
// IMPORTANT — Web Speech API limitation : we cannot inject a custom-gained
// MediaStream into SpeechRecognition. SpeechRecognition opens its own audio
// pipeline. So this hook runs IN PARALLEL with SpeechRecognition : we open a
// second getUserMedia connection just for visualization. The browser handles
// concurrent mic access fine in practice (Chrome, Edge, Safari).
//
// We request `autoGainControl: true` on our stream — the browser already
// applies this to SpeechRecognition's pipeline so the level we display
// matches what the recognizer actually receives, post-AGC.
export function useAudioLevel(active) {
  const [level, setLevel] = useState(0);
  const [error, setError] = useState(null);
  const streamRef = useRef(null);
  const ctxRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!active) return undefined;

    let cancelled = false;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            autoGainControl: true,
            noiseSuppression: true,
            echoCancellation: true,
          },
        });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const ctx = new Ctx();
        ctxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.4;
        source.connect(analyser);
        const buf = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          if (cancelled) return;
          analyser.getByteFrequencyData(buf);
          // RMS over the frequency bins. Multiplied a bit so a normal speaking
          // voice lands around 40-70 (perceived "good") rather than 15-25.
          let sum = 0;
          for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
          const rms = Math.sqrt(sum / buf.length);
          const scaled = Math.min(100, Math.round(rms * 1.6));
          setLevel(scaled);
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch (err) {
        if (cancelled) return;
        if (err?.name === "NotAllowedError") {
          setError("micDenied");
        } else if (err?.name === "NotFoundError") {
          setError("noMic");
        } else {
          setError("unknown");
        }
      }
    };

    start();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      if (ctxRef.current) {
        try { ctxRef.current.close(); } catch { /* ignore */ }
        ctxRef.current = null;
      }
      setLevel(0);
      setError(null);
    };
  }, [active]);

  return { level, error };
}
