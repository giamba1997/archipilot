import { AC, WH, SBB, SP, FS, TX, TX2, TX3, ACL, RAD, LH, SB } from "../../constants/tokens";
import { Ico } from "../ui";

export function CaptureSheet({ open, onClose, onPhoto, onGallery, photoCount }) {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 250, display: "flex", flexDirection: "column", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ background: "rgba(0,0,0,0.3)", position: "absolute", inset: 0 }} />
      <div onClick={e => e.stopPropagation()} style={{ position: "relative", background: WH, borderRadius: "20px 20px 0 0", padding: `${SP.xl}px ${SP.lg}px`, paddingBottom: `max(${SP.xl}px, env(safe-area-inset-bottom, 20px))`, animation: "sheetUp 0.25s ease-out" }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: SBB, margin: "0 auto 20px" }} />
        <div style={{ fontSize: FS.lg + 1, fontWeight: 700, color: TX, marginBottom: SP.xs, textAlign: "center" }}>Photos</div>
        <div style={{ fontSize: FS.base, color: TX3, marginBottom: SP.xl, textAlign: "center" }}>Capturez ou consultez les photos du chantier</div>
        <div style={{ display: "flex", gap: SP.md }}>
          {/* Prendre une photo */}
          <button onClick={onPhoto} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: SP.sm, padding: `${SP.xl}px ${SP.md}px`, border: `2px solid ${AC}`, borderRadius: RAD.xxl, background: `linear-gradient(180deg, ${ACL} 0%, #FFF8F0 100%)`, cursor: "pointer", fontFamily: "inherit" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: `linear-gradient(135deg, ${AC} 0%, #C06A08 100%)`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(217,123,13,0.3)" }}>
              <Ico name="camera" size={24} color="#fff" />
            </div>
            <div style={{ fontSize: FS.md + 1, fontWeight: 700, color: TX }}>Prendre</div>
            <div style={{ fontSize: FS.sm, color: TX2, lineHeight: LH.relaxed }}>Ouvrir la caméra</div>
          </button>
          {/* Voir les photos */}
          <button onClick={onGallery} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: SP.sm, padding: `${SP.xl}px ${SP.md}px`, border: `1.5px solid ${SBB}`, borderRadius: RAD.xxl, background: WH, cursor: "pointer", fontFamily: "inherit" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: SB, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Ico name="image" size={24} color={TX2} />
            </div>
            <div style={{ fontSize: FS.md + 1, fontWeight: 700, color: TX }}>Galerie</div>
            <div style={{ fontSize: FS.sm, color: TX3, lineHeight: LH.relaxed }}>{photoCount > 0 ? `${photoCount} photo${photoCount > 1 ? "s" : ""}` : "Aucune photo"}</div>
          </button>
        </div>
        <button onClick={onClose} style={{ width: "100%", marginTop: SP.lg, padding: `${SP.sm + 2}px`, border: `1px solid ${SBB}`, borderRadius: RAD.lg, background: WH, cursor: "pointer", fontSize: FS.md, color: TX3, fontFamily: "inherit" }}>Annuler</button>
      </div>
    </div>
  );
}
