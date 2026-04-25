import { useState, useRef, useEffect } from "react";
import { AC, SB, SBB, TX, TX2, TX3, WH, RD, SP, FS, RAD } from "../constants/tokens";
import { Ico } from "../components/ui";

const HANDLE_SIZE = 10;

function Handle({ pos, cursor, crop, scale, onMouseDown }) {
  const positions = {
    nw: { left: crop.x * scale - HANDLE_SIZE / 2, top: crop.y * scale - HANDLE_SIZE / 2 },
    ne: { left: (crop.x + crop.w) * scale - HANDLE_SIZE / 2, top: crop.y * scale - HANDLE_SIZE / 2 },
    sw: { left: crop.x * scale - HANDLE_SIZE / 2, top: (crop.y + crop.h) * scale - HANDLE_SIZE / 2 },
    se: { left: (crop.x + crop.w) * scale - HANDLE_SIZE / 2, top: (crop.y + crop.h) * scale - HANDLE_SIZE / 2 },
  };
  return (
    <div onMouseDown={e => onMouseDown(e, pos)} style={{
      position: "absolute", ...positions[pos], width: HANDLE_SIZE, height: HANDLE_SIZE,
      background: WH, border: `2px solid ${AC}`, borderRadius: 2,
      cursor, zIndex: 3,
    }} />
  );
}

export function CropTool({ imageSrc, fileName, onSave, onClose }) {
  const canvasRef = useRef(null);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [dragging, setDragging] = useState(null); // null | "move" | "nw" | "ne" | "sw" | "se"
  const dragStart = useRef({ mx: 0, my: 0, cx: 0, cy: 0, cw: 0, ch: 0 });
  const containerRef = useRef(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const el = containerRef.current;
      if (!el) return;
      const maxW = el.clientWidth - 40;
      const maxH = el.clientHeight - 120;
      const s = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
      setScale(s);
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
      // Default crop: 60% centered
      const cw = Math.round(img.naturalWidth * 0.6);
      const ch = Math.round(img.naturalHeight * 0.6);
      setCrop({ x: Math.round((img.naturalWidth - cw) / 2), y: Math.round((img.naturalHeight - ch) / 2), w: cw, h: ch });
    };
    img.src = imageSrc;
  }, [imageSrc]);

  const toCanvas = (px, py) => {
    const el = containerRef.current?.querySelector("img");
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return { x: Math.round((px - rect.left) / scale), y: Math.round((py - rect.top) / scale) };
  };

  const onMouseDown = (e, type) => {
    e.preventDefault(); e.stopPropagation();
    setDragging(type);
    dragStart.current = { mx: e.clientX, my: e.clientY, cx: crop.x, cy: crop.y, cw: crop.w, ch: crop.h };
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      const dx = Math.round((e.clientX - dragStart.current.mx) / scale);
      const dy = Math.round((e.clientY - dragStart.current.my) / scale);
      const { cx, cy, cw, ch } = dragStart.current;
      if (dragging === "move") {
        setCrop({ x: Math.max(0, Math.min(imgSize.w - cw, cx + dx)), y: Math.max(0, Math.min(imgSize.h - ch, cy + dy)), w: cw, h: ch });
      } else if (dragging === "se") {
        setCrop({ x: cx, y: cy, w: Math.max(20, Math.min(imgSize.w - cx, cw + dx)), h: Math.max(20, Math.min(imgSize.h - cy, ch + dy)) });
      } else if (dragging === "nw") {
        const nw = Math.max(20, cw - dx); const nh = Math.max(20, ch - dy);
        setCrop({ x: cx + cw - nw, y: cy + ch - nh, w: nw, h: nh });
      } else if (dragging === "ne") {
        const nw = Math.max(20, cw + dx); const nh = Math.max(20, ch - dy);
        setCrop({ x: cx, y: cy + ch - nh, w: Math.min(imgSize.w - cx, nw), h: nh });
      } else if (dragging === "sw") {
        const nw = Math.max(20, cw - dx); const nh = Math.max(20, ch + dy);
        setCrop({ x: cx + cw - nw, y: cy, w: nw, h: Math.min(imgSize.h - cy, nh) });
      }
    };
    const onUp = () => setDragging(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [dragging, imgSize, scale]);

  const doCrop = () => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = crop.w; canvas.height = crop.h;
      canvas.getContext("2d").drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
      onSave(canvas.toDataURL("image/png"), `crop-${fileName || "image"}.png`);
    };
    img.src = imageSrc;
  };

  return (
    <div ref={containerRef} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 600, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", background: "rgba(0,0,0,0.5)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Ico name="edit" size={16} color="#fff" />
          <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Rogner — {fileName}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ padding: "8px 16px", border: `1px solid rgba(255,255,255,0.3)`, borderRadius: 8, background: "transparent", color: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Annuler</button>
          <button onClick={doCrop} style={{ padding: "8px 20px", border: "none", borderRadius: 8, background: AC, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Rogner et sauvegarder</button>
        </div>
      </div>
      {/* Canvas area */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: 20 }}>
        {imgSize.w > 0 && (
          <div style={{ position: "relative", userSelect: "none" }}>
            <img src={imageSrc} alt="" style={{ display: "block", width: imgSize.w * scale, height: imgSize.h * scale }} draggable={false} />
            {/* Dark overlay outside crop */}
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
              <svg width={imgSize.w * scale} height={imgSize.h * scale} style={{ position: "absolute", inset: 0 }}>
                <defs><mask id="cropMask">
                  <rect width="100%" height="100%" fill="white" />
                  <rect x={crop.x * scale} y={crop.y * scale} width={crop.w * scale} height={crop.h * scale} fill="black" />
                </mask></defs>
                <rect width="100%" height="100%" fill="rgba(0,0,0,0.55)" mask="url(#cropMask)" />
              </svg>
            </div>
            {/* Crop border */}
            <div onMouseDown={e => onMouseDown(e, "move")} style={{
              position: "absolute",
              left: crop.x * scale, top: crop.y * scale,
              width: crop.w * scale, height: crop.h * scale,
              border: `2px solid ${AC}`, cursor: "move", zIndex: 2,
              boxShadow: `0 0 0 1px rgba(255,255,255,0.3)`,
            }}>
              {/* Grid lines */}
              <div style={{ position: "absolute", left: "33.33%", top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.2)", pointerEvents: "none" }} />
              <div style={{ position: "absolute", left: "66.66%", top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.2)", pointerEvents: "none" }} />
              <div style={{ position: "absolute", top: "33.33%", left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.2)", pointerEvents: "none" }} />
              <div style={{ position: "absolute", top: "66.66%", left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.2)", pointerEvents: "none" }} />
            </div>
            {/* Resize handles */}
            <Handle pos="nw" cursor="nw-resize" crop={crop} scale={scale} onMouseDown={onMouseDown} />
            <Handle pos="ne" cursor="ne-resize" crop={crop} scale={scale} onMouseDown={onMouseDown} />
            <Handle pos="sw" cursor="sw-resize" crop={crop} scale={scale} onMouseDown={onMouseDown} />
            <Handle pos="se" cursor="se-resize" crop={crop} scale={scale} onMouseDown={onMouseDown} />
          </div>
        )}
      </div>
      {/* Info bar */}
      <div style={{ padding: "8px 20px", background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", gap: 16, fontSize: 11, color: "rgba(255,255,255,0.6)", flexShrink: 0 }}>
        <span>Zone : {crop.w} x {crop.h} px</span>
        <span>Position : {crop.x}, {crop.y}</span>
        <span>Original : {imgSize.w} x {imgSize.h} px</span>
      </div>
    </div>
  );
}
