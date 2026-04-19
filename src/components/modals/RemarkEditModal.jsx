import { useState, useRef } from "react";
import { AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, RD, GR, SP, FS, RAD } from "../../constants/tokens";
import { REMARK_STATUSES, getRemarkStatus } from "../../constants/statuses";
import { Ico } from "../ui";
import { uploadPhoto, deletePhoto, getPhotoUrl } from "../../db";

/** Today's date in fr-BE (dd/mm/yyyy). */
function todayStr() {
  return new Date().toLocaleDateString("fr-BE");
}

/**
 * Modal for creating or editing a located remark (pin on plan).
 *
 * Props:
 * - initial: existing remark to edit (or null/undefined to create a new one)
 * - posts: [{id, label}] for the post selector
 * - defaultPostId: preselected post when creating
 * - onSave(remark): called with the full remark object
 * - onDelete(): optional — shown only when editing an existing remark
 * - onClose(): dismiss without saving
 */
export function RemarkEditModal({ initial, posts, defaultPostId, onSave, onDelete, onClose }) {
  const isEdit = !!initial?.id;
  const [text, setText]       = useState(initial?.text || "");
  const [status, setStatus]   = useState(initial?.status || "open");
  const [postId, setPostId]   = useState(initial?.postId || defaultPostId || posts?.[0]?.id || "");
  const [date, setDate]       = useState(initial?.date || todayStr());
  const [urgent, setUrgent]   = useState(!!initial?.urgent);
  const [photos, setPhotos]   = useState(initial?.photos || []);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const handlePhotoAdd = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    const added = [];
    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) continue; // 5 MB cap
      const dataUrl = await new Promise((res) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.readAsDataURL(file);
      });
      const up = await uploadPhoto(dataUrl);
      if (up) added.push({ ...up, dataUrl });
      else added.push({ dataUrl });
    }
    setPhotos((prev) => [...prev, ...added]);
    setUploading(false);
    e.target.value = "";
  };

  const handlePhotoRemove = (i) => {
    const ph = photos[i];
    if (ph?.storagePath) deletePhoto(ph.storagePath).catch(() => {});
    setPhotos((prev) => prev.filter((_, j) => j !== i));
  };

  const handleSubmit = () => {
    if (!text.trim()) return;
    onSave({
      ...(initial || {}),
      id: initial?.id || Date.now(),
      text: text.trim(),
      status,
      postId,
      date,
      urgent,
      photos,
      // Preserve position if editing; creator passes x/y via initial
      x: initial?.x,
      y: initial?.y,
    });
  };

  const canSave = text.trim() && postId;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 600, padding: SP.lg,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: WH, borderRadius: RAD.xxl, width: "100%", maxWidth: 480,
          maxHeight: "90vh", overflow: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
          animation: "modalIn 0.2s ease-out",
        }}
      >
        {/* Header */}
        <div style={{ padding: "18px 22px 14px", borderBottom: `1px solid ${SBB}`, display: "flex", alignItems: "center", gap: SP.sm }}>
          <div
            style={{
              width: 32, height: 32, borderRadius: RAD.full,
              background: getRemarkStatus(status).bg,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <Ico name="mappin" size={15} color={getRemarkStatus(status).color} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: FS.md, fontWeight: 700, color: TX }}>
              {isEdit ? "Modifier la remarque" : "Nouvelle remarque"}
            </div>
            <div style={{ fontSize: FS.xs, color: TX3 }}>
              Localisée sur le plan
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: RAD.full }}
          >
            <Ico name="x" size={16} color={TX3} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "16px 22px" }}>
          {/* Text */}
          <label style={{ display: "block", fontSize: FS.xs, fontWeight: 600, color: TX2, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Remarque
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Décrivez la remarque…"
            rows={3}
            autoFocus
            style={{
              width: "100%", padding: "10px 12px",
              border: `1px solid ${SBB}`, borderRadius: RAD.md,
              fontSize: FS.md, fontFamily: "inherit", background: SB, color: TX,
              resize: "vertical", minHeight: 70, boxSizing: "border-box",
            }}
          />

          {/* Status pills */}
          <div style={{ display: "flex", gap: 6, marginTop: SP.md, flexWrap: "wrap" }}>
            {REMARK_STATUSES.map((s) => {
              const active = status === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setStatus(s.id)}
                  style={{
                    padding: "6px 12px", border: `1px solid ${active ? s.color : SBB}`,
                    borderRadius: RAD.md, background: active ? s.bg : WH,
                    color: active ? s.color : TX2,
                    fontSize: FS.sm, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                    display: "flex", alignItems: "center", gap: 5,
                  }}
                >
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot }} />
                  {s.label}
                </button>
              );
            })}
          </div>

          {/* Post + date */}
          <div style={{ display: "flex", gap: SP.sm, marginTop: SP.md }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: FS.xs, fontWeight: 600, color: TX2, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Poste
              </label>
              <select
                value={postId}
                onChange={(e) => setPostId(e.target.value)}
                style={{
                  width: "100%", padding: "9px 12px", border: `1px solid ${SBB}`, borderRadius: RAD.md,
                  fontSize: FS.md, fontFamily: "inherit", background: SB, color: TX, cursor: "pointer",
                }}
              >
                {posts.map((p) => (
                  <option key={p.id} value={p.id}>{p.id}. {p.label}</option>
                ))}
              </select>
            </div>
            <div style={{ width: 130 }}>
              <label style={{ display: "block", fontSize: FS.xs, fontWeight: 600, color: TX2, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Date
              </label>
              <input
                type="text"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                placeholder="dd/mm/yyyy"
                style={{
                  width: "100%", padding: "9px 12px", border: `1px solid ${SBB}`, borderRadius: RAD.md,
                  fontSize: FS.md, fontFamily: "inherit", background: SB, color: TX, boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          {/* Urgent toggle */}
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: SP.md, cursor: "pointer", fontSize: FS.md, color: TX }}>
            <input
              type="checkbox"
              checked={urgent}
              onChange={(e) => setUrgent(e.target.checked)}
              style={{ accentColor: RD, width: 15, height: 15 }}
            />
            Marquer comme urgent
          </label>

          {/* Photos */}
          <div style={{ marginTop: SP.md }}>
            <label style={{ display: "block", fontSize: FS.xs, fontWeight: 600, color: TX2, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Photos ({photos.length})
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {photos.map((p, i) => (
                <div key={i} style={{ position: "relative", width: 72, height: 72 }}>
                  <img
                    src={getPhotoUrl(p)}
                    alt=""
                    style={{ width: 72, height: 72, objectFit: "cover", borderRadius: RAD.md, border: `1px solid ${SBB}` }}
                  />
                  <button
                    onClick={() => handlePhotoRemove(i)}
                    aria-label="Retirer la photo"
                    style={{
                      position: "absolute", top: -6, right: -6, width: 22, height: 22,
                      borderRadius: RAD.full, border: "none", background: RD, color: WH,
                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
                    }}
                  >
                    <Ico name="x" size={11} color={WH} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                style={{
                  width: 72, height: 72, border: `1.5px dashed ${SBB}`, borderRadius: RAD.md,
                  background: SB, cursor: uploading ? "wait" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexDirection: "column", gap: 3, color: TX3, fontFamily: "inherit", fontSize: FS.xs,
                }}
              >
                <Ico name="camera" size={18} color={TX3} />
                {uploading ? "…" : "Ajouter"}
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoAdd}
              style={{ display: "none" }}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 22px 18px", borderTop: `1px solid ${SBB}`, display: "flex", gap: SP.sm, alignItems: "center" }}>
          {isEdit && onDelete && (
            <button
              onClick={onDelete}
              style={{
                padding: "9px 14px", border: `1px solid ${SBB}`, borderRadius: RAD.md,
                background: WH, cursor: "pointer", color: RD, fontSize: FS.sm, fontWeight: 600, fontFamily: "inherit",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <Ico name="trash" size={13} color={RD} />
              Supprimer
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={onClose}
            style={{
              padding: "9px 16px", border: `1px solid ${SBB}`, borderRadius: RAD.md,
              background: WH, cursor: "pointer", color: TX2, fontSize: FS.sm, fontWeight: 600, fontFamily: "inherit",
            }}
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSave}
            style={{
              padding: "9px 20px", border: "none", borderRadius: RAD.md,
              background: canSave ? AC : SBB, color: canSave ? WH : TX3,
              cursor: canSave ? "pointer" : "not-allowed",
              fontSize: FS.sm, fontWeight: 700, fontFamily: "inherit",
            }}
          >
            {isEdit ? "Enregistrer" : "Créer"}
          </button>
        </div>
      </div>
    </div>
  );
}
