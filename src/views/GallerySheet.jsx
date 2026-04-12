import { useState } from "react";
import { AC, SB, SBB, TX, TX2, TX3, WH, RD, SP, FS, RAD, DIS } from "../constants/tokens";
import { Ico } from "../components/ui";
import { getPhotoUrl } from "../db";

export function GallerySheet({ photos, onClose, onAdd, onDelete }) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const toggleSelect = (id) => setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const exitSelect = () => { setSelecting(false); setSelected(new Set()); };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 250, display: "flex", flexDirection: "column", justifyContent: "flex-end" }} onClick={() => { if (!selecting) onClose(); }}>
      <div style={{ background: "rgba(0,0,0,0.3)", position: "absolute", inset: 0 }} />
      <div onClick={e => e.stopPropagation()} style={{ position: "relative", background: WH, borderRadius: "20px 20px 0 0", maxHeight: "85vh", display: "flex", flexDirection: "column", animation: "sheetUp 0.25s ease-out", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: SBB, margin: `${SP.md}px auto ${SP.sm}px` }} />

        {/* Header — switches between normal and selection mode */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: `0 ${SP.lg}px ${SP.sm}px`, gap: 8 }}>
          {selecting ? (
            <>
              <button onClick={exitSelect} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}>
                <Ico name="x" size={14} color={TX2} />
                <span style={{ fontSize: 13, fontWeight: 700, color: TX }}>{selected.size} sélectionnée{selected.size !== 1 ? "s" : ""}</span>
              </button>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={selected.size === photos.length ? () => setSelected(new Set()) : () => setSelected(new Set(photos.map(p => p.id)))} style={{ padding: "5px 10px", border: `1px solid ${SBB}`, borderRadius: 6, background: WH, cursor: "pointer", fontFamily: "inherit", fontSize: 10, fontWeight: 600, color: TX2 }}>
                  {selected.size === photos.length ? "Aucun" : "Tous"}
                </button>
                <button onClick={() => { onDelete(selected); exitSelect(); }} disabled={selected.size === 0} style={{ padding: "5px 10px", border: "none", borderRadius: 6, background: selected.size > 0 ? RD : DIS, cursor: selected.size > 0 ? "pointer" : "default", fontFamily: "inherit", fontSize: 10, fontWeight: 600, color: "#fff", display: "flex", alignItems: "center", gap: 4 }}>
                  <Ico name="trash" size={10} color="#fff" />Supprimer{selected.size > 0 ? ` (${selected.size})` : ""}
                </button>
              </div>
            </>
          ) : (
            <>
              <span style={{ fontSize: FS.lg + 1, fontWeight: 700, color: TX }}>Photos du chantier</span>
              <div style={{ display: "flex", gap: 6 }}>
                {photos.length > 0 && (
                  <button onClick={() => setSelecting(true)} style={{ padding: "5px 10px", border: `1px solid ${SBB}`, borderRadius: 6, background: WH, cursor: "pointer", fontFamily: "inherit", fontSize: 10, fontWeight: 600, color: TX2 }}>
                    Sélectionner
                  </button>
                )}
                <button onClick={onAdd} style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", border: "none", borderRadius: 6, background: AC, cursor: "pointer", fontFamily: "inherit" }}>
                  <Ico name="plus" size={11} color="#fff" />
                  <span style={{ fontSize: 10, fontWeight: 600, color: "#fff" }}>Ajouter</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Photo grid */}
        <div style={{ overflowY: "auto", padding: `0 ${SP.lg}px ${SP.lg}px` }}>
          {photos.length === 0 ? (
            <div style={{ padding: "40px 0", textAlign: "center" }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: SB, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                <Ico name="camera" size={22} color={TX3} />
              </div>
              <div style={{ fontSize: 13, color: TX3, marginBottom: 4 }}>Aucune photo</div>
              <div style={{ fontSize: 11, color: TX3 }}>Prenez des photos du chantier avec le bouton ci-dessus</div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 }}>
              {photos.map(ph => {
                const isSel = selected.has(ph.id);
                return (
                  <div key={ph.id} onClick={() => selecting ? toggleSelect(ph.id) : null} style={{ position: "relative", aspectRatio: "1", borderRadius: 8, overflow: "hidden", background: SB, cursor: selecting ? "pointer" : "default", border: `2px solid ${selecting && isSel ? AC : "transparent"}`, transition: "border-color 0.15s" }}>
                    <img src={getPhotoUrl(ph)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: selecting && isSel ? 0.7 : 1, transition: "opacity 0.15s" }} />
                    {selecting && (
                      <div style={{ position: "absolute", top: 4, left: 4, width: 20, height: 20, borderRadius: 5, background: isSel ? AC : "rgba(255,255,255,0.85)", border: `2px solid ${isSel ? AC : "rgba(0,0,0,0.2)"}`, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>
                        {isSel && <Ico name="check" size={10} color="#fff" />}
                      </div>
                    )}
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 6px 3px", background: "linear-gradient(transparent, rgba(0,0,0,0.4))" }}>
                      <span style={{ fontSize: 8, color: "#fff", fontWeight: 500 }}>{new Date(ph.date).toLocaleDateString("fr-BE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
