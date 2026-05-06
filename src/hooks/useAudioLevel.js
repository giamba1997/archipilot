import { useEffect, useRef, useState } from "react";

// useAudioLevel — exposes the live RMS level (0-100) of the user's microphone
// while `active` is true. Used to drive a VU meter so the user can see
// whether the mic actually picks up their voice.
//
// Two modes :
//   - active=true, no externalStream → opens its own getUserMedia
//   - active=true, externalStream provided → re-uses that stream (avoids
//     opening the mic twice when used alongside useWhisperRecorder)
export function useAudioLevel(active, externalStream = null) {
  const [level, setLevel] = useState(0);
  const [error, setError] = useState(null);
  const streamRef = useRef(null);
  const ownsStreamRef = useRef(false);
  const ctxRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!active) return undefined;

    let cancelled = false;

    const start = async () => {
      try {
        let stream = externalStream;
        let owns = false;
        if (!stream) {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              autoGainControl: true,
              noiseSuppression: true,
              echoCancellation: true,
            },
          });
          owns = true;
        }
        if (cancelled) {
          if (owns) stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        ownsStreamRef.current = owns;
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
        // Ne stoppe les tracks QUE si c'est notre propre stream — sinon on
        // couperait le mic du recorder Whisper qui partage le flux.
        if (ownsStreamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
        }
        streamRef.current = null;
        ownsStreamRef.current = false;
      }
      if (ctxRef.current) {
        try { ctxRef.current.close(); } catch { /* ignore */ }
        ctxRef.current = null;
      }
      setLevel(0);
      setError(null);
    };
  }, [active, externalStream]);

  return { level, error };
}
