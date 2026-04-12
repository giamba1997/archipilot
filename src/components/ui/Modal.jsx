import { useRef, useEffect } from "react";
import { SP, WH, SBB, RAD, FS, TX, TX3, LH } from "../../constants/tokens";
import { Ico } from "./Ico";

export function Modal({ open, onClose, title, children, wide }) {
  const modalRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !modalRef.current) return;
    const el = modalRef.current;
    const focusable = el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable.length) focusable[0].focus();
    const trap = (e) => {
      if (e.key !== "Tab" || !focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
      else { if (document.activeElement === last) { e.preventDefault(); first.focus(); } }
    };
    el.addEventListener("keydown", trap);
    return () => el.removeEventListener("keydown", trap);
  }, [open]);

  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: SP.lg }} onClick={onClose}>
      <div ref={modalRef} className="ap-modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title} style={{ background: WH, borderRadius: RAD.xxl, width: "100%", maxWidth: wide ? 640 : 520, maxHeight: "85vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)", animation: "modalIn 0.18s ease" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: `${SP.md}px ${SP.lg + 2}px`, borderBottom: `1px solid ${SBB}`, position: "sticky", top: 0, background: WH, borderRadius: `${RAD.xxl}px ${RAD.xxl}px 0 0`, zIndex: 1 }}>
          <span style={{ fontSize: FS.lg + 1, fontWeight: 600, color: TX, lineHeight: LH.tight }}>{title}</span>
          <button onClick={onClose} aria-label="Fermer" style={{ background: "none", border: "none", cursor: "pointer", padding: SP.sm, minWidth: 36, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: RAD.sm }}>
            <Ico name="x" color={TX3} />
          </button>
        </div>
        <div style={{ padding: `${SP.lg}px ${SP.lg + 2}px ${SP.lg + 2}px` }}>{children}</div>
      </div>
    </div>
  );
}
