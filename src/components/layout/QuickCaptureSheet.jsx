import { useState, useRef, useEffect } from "react";
import {
  AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, RD, GR, SP, FS, RAD, LH,
  BR, BRB, ST, STB, AM, AMB, SG, SGB,
} from "../../constants/tokens";
import { Ico } from "../ui";
import { useWhisperRecorder } from "../../hooks/useWhisperRecorder";

// ── QuickCaptureSheet — 4 actions capture rapides ──────────────
//
// Remplace l'ancien CaptureSheet (qui n'avait que Photo) par 4 actions
// équivalentes pour la phase mobile :
//
//   📷 Photo          — capture caméra → galerie projet
//   🎤 Note vocale    — Whisper → texte avec disposition choisie
//   ⚠ Nouvelle réserve — formulaire compact OPR rapide
//   💬 PV (dictée)    — démarre le NoteEditor en mode dictée
//
// Toutes les actions nécessitent qu'un projet soit sélectionné. Si
// aucun projet n'est actif, le sheet affiche un état "Sélectionne d'abord
// un projet" plutôt que de planter.
//
// Note technique : pour Photo, l'ouverture du file input se fait via
// un ref externe (mobilePhotoRef d'App.jsx) parce que le `<input>` doit
// rester monté en permanence pour que le click programmatique fonctionne
// sur iOS Safari. On garde donc le pattern existant.

export function QuickCaptureSheet({
  open,
  onClose,
  project,             // projet courant (peut être null)
  onPhoto,             // déclenche le file input caméra
  onStartPvDictation,  // démarre le NoteEditor en dictée
  onNewReserve,        // ouvre OprView avec form ouvert
  onSaveVoiceMemo,     // (text) => void — l'archi choisit la disposition après
}) {
  const [activeAction, setActiveAction] = useState(null); // null | "voice"

  if (!open) return null;

  // État sans projet — on ne peut rien capturer si l'archi n'a pas de
  // projet sélectionné. Plutôt qu'un bouton "Choisir un projet" (qui
  // forcerait un wizard supplémentaire), on l'invite à fermer + sélectionner.
  if (!project) {
    return (
      <div onClick={onClose} style={overlayStyle}>
        <div onClick={e => e.stopPropagation()} style={sheetStyle}>
          <div style={handleStyle} />
          <div style={{ padding: 24, textAlign: "center" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: SB, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
              <Ico name="alert" size={22} color={TX3} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: TX, marginBottom: 4 }}>Aucun projet sélectionné</div>
            <div style={{ fontSize: 12, color: TX3, lineHeight: 1.5, marginBottom: 16 }}>
              Sélectionne un projet dans la sidebar pour pouvoir capturer photos, notes vocales ou réserves.
            </div>
            <button onClick={onClose} style={{ padding: "10px 20px", border: "none", borderRadius: 10, background: AC, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              Compris
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Sub-sheet : enregistrement vocal en cours
  if (activeAction === "voice") {
    return (
      <VoiceCaptureSheet
        onClose={() => { setActiveAction(null); onClose?.(); }}
        onCancel={() => setActiveAction(null)}
        onSave={(text) => {
          onSaveVoiceMemo?.(text);
          setActiveAction(null);
          onClose?.();
        }}
      />
    );
  }

  return (
    <div onClick={onClose} style={overlayStyle}>
      <div onClick={e => e.stopPropagation()} style={sheetStyle}>
        <div style={handleStyle} />

        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: TX, marginBottom: 2 }}>Capture rapide</div>
          <div style={{ fontSize: 11, color: TX3 }}>
            sur <strong style={{ color: TX2 }}>{project.name}</strong>
          </div>
        </div>

        {/* 4 boutons en grille 2×2 — taille tactile généreuse */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <CaptureButton
            icon="camera"
            label="Photo"
            description="Caméra → galerie"
            color={AC}
            bg={ACL}
            onClick={() => { onClose(); onPhoto?.(); }}
          />
          <CaptureButton
            icon="mic"
            label="Note vocale"
            description="Whisper → texte"
            color={ST}
            bg={STB}
            onClick={() => setActiveAction("voice")}
          />
          <CaptureButton
            icon="alert"
            label="Réserve"
            description="OPR nouvelle"
            color={BR}
            bg={BRB}
            onClick={() => { onClose(); onNewReserve?.(); }}
          />
          <CaptureButton
            icon="file"
            label="PV dicté"
            description="Démarrer un PV"
            color={SG}
            bg={SGB}
            onClick={() => { onClose(); onStartPvDictation?.(); }}
          />
        </div>

        <button onClick={onClose} style={{ width: "100%", padding: "11px", border: `1px solid ${SBB}`, borderRadius: 10, background: WH, cursor: "pointer", fontSize: 13, color: TX3, fontFamily: "inherit", fontWeight: 600 }}>
          Annuler
        </button>
      </div>
    </div>
  );
}

// ── CaptureButton — bouton tactile pour les 4 actions ──
function CaptureButton({ icon, label, description, color, bg, onClick }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
        padding: "18px 12px",
        border: `1px solid ${SBB}`,
        background: WH,
        borderRadius: 14,
        cursor: "pointer", fontFamily: "inherit",
        transition: "transform 0.1s, border-color 0.15s",
        transform: pressed ? "scale(0.97)" : "scale(1)",
        minHeight: 110,
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: bg, color,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}>
        <Ico name={icon} size={22} color={color} />
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: TX }}>{label}</div>
      <div style={{ fontSize: 10, color: TX3, textAlign: "center", lineHeight: 1.3 }}>{description}</div>
    </button>
  );
}

// ── Sub-sheet : enregistrement vocal ──
// Bouton micro circulaire + transcription Whisper + bouton "Enregistrer".
// La transcription apparaît en édit pour permettre une correction rapide
// avant de la soumettre.
function VoiceCaptureSheet({ onClose, onCancel, onSave }) {
  const [transcript, setTranscript] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const recorder = useWhisperRecorder({
    onResult: (text) => setTranscript(t => (t ? t + " " : "") + text),
    onError: (code) => {
      if (code === "micDenied") setErrorMsg("Accès microphone refusé.");
      else if (code === "noMic") setErrorMsg("Aucun microphone détecté.");
      else setErrorMsg("Erreur enregistrement.");
    },
  });

  // Auto-démarrage de l'enregistrement à l'ouverture — l'archi a tap
  // "Note vocale", on suppose qu'il veut commencer à parler tout de suite.
  useEffect(() => {
    if (!recorder.isRecording && !recorder.isTranscribing && !transcript && !errorMsg) {
      // Petit délai pour laisser le sheet s'animer en place avant de
      // demander la permission micro (sinon l'animation s'arrête).
      const t = setTimeout(() => recorder.start(), 250);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = () => {
    if (!transcript.trim()) return;
    onSave(transcript);
  };

  return (
    <div onClick={onClose} style={overlayStyle}>
      <div onClick={e => e.stopPropagation()} style={sheetStyle}>
        <div style={handleStyle} />

        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: TX }}>Note vocale</div>
        </div>

        {/* Bouton micro central */}
        <div style={{ textAlign: "center", padding: "16px 0 20px" }}>
          <button
            onClick={recorder.isRecording ? recorder.stop : recorder.start}
            style={{
              width: 86, height: 86, borderRadius: "50%",
              border: "none",
              background: recorder.isRecording ? RD : AC,
              color: "#fff",
              cursor: "pointer", fontFamily: "inherit",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              boxShadow: recorder.isRecording
                ? `0 0 0 8px ${RD}22`
                : `0 6px 18px rgba(0,0,0,0.18)`,
              transition: "all 0.25s",
              animation: recorder.isRecording ? "pulseRec 1.5s ease-in-out infinite" : "none",
            }}
          >
            <Ico name="mic" size={36} color="#fff" />
          </button>
          <div style={{ fontSize: 12, color: TX2, marginTop: 12, fontWeight: 600 }}>
            {recorder.isTranscribing ? "Transcription…"
              : recorder.isRecording ? "Tap pour arrêter"
              : transcript ? "Tap pour reprendre"
              : "Démarrage…"}
          </div>
        </div>

        {/* Transcription éditable */}
        {transcript && (
          <textarea
            value={transcript}
            onChange={e => setTranscript(e.target.value)}
            rows={4}
            style={{
              width: "100%", padding: "10px 12px",
              border: `1px solid ${SBB}`, borderRadius: 10,
              fontSize: 13, fontFamily: "inherit",
              background: SB, color: TX, lineHeight: 1.5,
              outline: "none", boxSizing: "border-box",
              resize: "vertical",
              marginBottom: 12,
            }}
          />
        )}

        {errorMsg && (
          <div style={{ padding: "8px 12px", background: BRB, color: BR, borderRadius: 8, fontSize: 12, marginBottom: 12 }}>
            {errorMsg}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "11px", border: `1px solid ${SBB}`, borderRadius: 10, background: WH, color: TX2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Annuler
          </button>
          <button
            onClick={submit}
            disabled={!transcript.trim()}
            style={{
              flex: 2, padding: "11px", border: "none", borderRadius: 10,
              background: transcript.trim() ? AC : SBB,
              color: transcript.trim() ? "#fff" : TX3,
              fontSize: 13, fontWeight: 700,
              cursor: transcript.trim() ? "pointer" : "not-allowed",
              fontFamily: "inherit",
            }}
          >
            Enregistrer la note
          </button>
        </div>

        <style>{`
          @keyframes pulseRec {
            0%, 100% { box-shadow: 0 0 0 8px rgba(220, 38, 38, 0.13); }
            50% { box-shadow: 0 0 0 16px rgba(220, 38, 38, 0.05); }
          }
        `}</style>
      </div>
    </div>
  );
}

// ── Styles partagés ──
const overlayStyle = {
  position: "fixed", inset: 0, zIndex: 250,
  display: "flex", flexDirection: "column", justifyContent: "flex-end",
  background: "rgba(0, 0, 0, 0.4)",
};

const sheetStyle = {
  position: "relative",
  background: WH,
  borderRadius: "20px 20px 0 0",
  padding: `${SP.xl}px ${SP.lg}px`,
  paddingBottom: `max(${SP.xl}px, env(safe-area-inset-bottom, 20px))`,
  animation: "sheetUp 0.25s ease-out",
  maxHeight: "85vh",
  overflowY: "auto",
};

const handleStyle = {
  width: 36, height: 4, borderRadius: 2,
  background: SBB, margin: "0 auto 16px",
};
