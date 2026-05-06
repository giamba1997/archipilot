import { useState, useRef, useEffect } from "react";
import { AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, BR, BRB, REDBRD } from "../constants/tokens";
import { Modal, Ico } from "../components/ui";
import { formatDuration, elapsedSeconds } from "../utils/timer";

// Modal qui s'ouvre quand l'utilisateur clique Stop. Le timer est pausé en
// arrière-plan, et la durée capturée est figée. L'utilisateur doit saisir
// une description avant de pouvoir valider la session. "Annuler" garde le
// timer en pause (on peut reprendre avec Pause/Resume sur la card).
export function StopSessionPrompt({ open, capturedTimer, projectName, onConfirm, onCancel }) {
  const [note, setNote] = useState("");
  const inputRef = useRef(null);
  const totalSec = capturedTimer ? elapsedSeconds(capturedTimer, Date.now()) : 0;
  // Reset à chaque ouverture
  useEffect(() => {
    if (open) {
      setNote("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const noteClean = note.trim();
  const canSubmit = noteClean.length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onConfirm(noteClean);
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canSubmit) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Modal open={open} onClose={onCancel} title="Enregistrer la session">
      {/* Récap durée + projet */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 14px", background: ACL, border: `1px solid ${ACL2}`,
        borderRadius: 10, marginBottom: 14,
      }}>
        <div style={{
          width: 38, height: 38, borderRadius: "50%", background: WH,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <Ico name="clock" size={16} color={AC} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: AC, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Durée travaillée
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: TX, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
            {totalSec > 0 ? formatDuration(totalSec) : "—"}
          </div>
          {projectName && (
            <div style={{ fontSize: 11, color: TX3, marginTop: 2 }}>
              sur <strong style={{ color: TX2 }}>{projectName}</strong>
            </div>
          )}
        </div>
      </div>

      {/* Champ description requis */}
      <div style={{ marginBottom: 14 }}>
        <label htmlFor="session-note" style={{ display: "block", fontSize: 12, fontWeight: 600, color: TX2, marginBottom: 6 }}>
          Que viens-tu de faire ?
          <span style={{ color: BR, marginLeft: 4 }}>*</span>
        </label>
        <textarea
          id="session-note"
          ref={inputRef}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={handleKey}
          rows={3}
          placeholder="Ex: Plans niveau 2, réunion chantier, coordination MO, dossier permis…"
          style={{
            width: "100%", padding: "10px 12px",
            border: `1px solid ${SBB}`, borderRadius: 8,
            fontSize: 13, fontFamily: "inherit", lineHeight: 1.5,
            background: WH, color: TX, boxSizing: "border-box",
            resize: "vertical", outline: "none",
          }}
        />
        <div style={{ fontSize: 10, color: TX3, marginTop: 4, fontStyle: "italic" }}>
          Indispensable pour retrouver le contexte plus tard. <kbd style={{ fontSize: 9, padding: "1px 4px", borderRadius: 3, border: `1px solid ${SBB}`, background: SB }}>⌘ ↵</kbd> pour valider.
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button
          onClick={onCancel}
          style={{
            padding: "9px 16px", border: `1px solid ${SBB}`, borderRadius: 8,
            background: WH, color: TX2, fontSize: 12, fontWeight: 500,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Annuler
        </button>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{
            padding: "9px 18px", border: "none", borderRadius: 8,
            background: canSubmit ? AC : SB2,
            color: canSubmit ? "#fff" : TX3,
            fontSize: 12, fontWeight: 600,
            cursor: canSubmit ? "pointer" : "not-allowed",
            fontFamily: "inherit", opacity: canSubmit ? 1 : 0.7,
          }}
        >
          Enregistrer la session
        </button>
      </div>
    </Modal>
  );
}
