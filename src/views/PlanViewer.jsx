import { useState, useRef, useEffect, useMemo } from "react";
import { useT } from "../i18n";
import { AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, RD, GR, SP, FS, RAD, BL, DIST, GRBG } from "../constants/tokens";
import { Ico } from "../components/ui";
import { getPhotoUrl } from "../db";
import { ANNO_TOOLS, ANNO_COLORS } from "./AnnotationEditor";


// PDF render cache — avoid re-rendering the same PDF
const _pdfCache = {};

export function PlanViewer({ project, setProjects, onBack }) {
  const [pdfRendered, setPdfRendered] = useState(null);
  const isPdf = project.planImage?.startsWith("data:application/pdf");

  // Render PDF first page to image (local pdfjs-dist, cached)
  useEffect(() => {
    if (!isPdf || !project.planImage) return;
    // Check cache by dataUrl hash (first 100 chars as key)
    const cacheKey = project.planImage.slice(0, 100);
    if (_pdfCache[cacheKey]) { setPdfRendered(_pdfCache[cacheKey]); return; }
    (async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).href;
        const data = atob(project.planImage.split(",")[1]);
        const arr = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) arr[i] = data.charCodeAt(i);
        const pdf = await pdfjsLib.getDocument({ data: arr }).promise;
        const page = await pdf.getPage(1);
        const scale = 2;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
        const result = canvas.toDataURL("image/png");
        _pdfCache[cacheKey] = result;
        setPdfRendered(result);
      } catch (e) {
        console.error("PDF render error:", e);
      }
    })();
  }, [isPdf, project.planImage]);

  const planImageSrc = isPdf ? pdfRendered : project.planImage;

  const [mode,          setMode]          = useState("view"); // "view" | "marker" | "anno"
  const [pendingMarker, setPendingMarker] = useState(null);
  const [selectedPostId, setSelectedPostId] = useState("");
  const [annoTool,  setAnnoTool]  = useState("select");
  const [annoColor, setAnnoColor] = useState("#EF4444");
  const [drawing,   setDrawing]   = useState(false);
  const [startPt,   setStartPt]   = useState(null);
  const [currentPt, setCurrentPt] = useState(null);
  const [penPoints, setPenPoints] = useState([]);
  const [textPending, setTextPending] = useState(null);
  const [textValue,   setTextValue]   = useState("");
  // Selection & transform
  const [selectedId, setSelectedId] = useState(null);
  const selectedIdRef = useRef(null);
  const selDragRef    = useRef(null);
  const planStrokesRef = useRef([]);
  // Text style options
  const [textFontSize, setTextFontSize] = useState(18);
  const [textBold,     setTextBold]     = useState(false);
  const [textItalic,   setTextItalic]   = useState(false);
  const planRef     = useRef(null);
  const canvasRef   = useRef(null);
  const uploadRef   = useRef(null);
  const textInputRef = useRef(null);
  const planColorPickerRef = useRef(null);
  const canvasSizeRef = useRef({ w: 0, h: 0 }); // internal canvas resolution
  const [savedFlash, setSavedFlash] = useState(false);
  const savedTimerRef = useRef(null);
  const [vp,       setVp]       = useState({ zoom: 1, panX: 0, panY: 0 });
  const [imgBase,  setImgBase]  = useState({ w: 0, h: 0 });
  const [dragging, setDragging] = useState(false);
  const [spaceHeld,setSpaceHeld]= useState(false);
  const vpRef       = useRef({ zoom: 1, panX: 0, panY: 0 });
  const imgBaseRef  = useRef({ w: 0, h: 0 });
  const panningRef  = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const panOriginRef= useRef({ x: 0, y: 0 });
  const spaceHeldRef= useRef(false);
  const planAreaRef = useRef(null);

  const markers     = project.planMarkers || [];
  const planStrokes = project.planStrokes  || [];
  planStrokesRef.current = planStrokes;
  selectedIdRef.current  = selectedId;

  const uploadPlan = (file) => {
    const reader = new FileReader();
    reader.onload = (ev) => setProjects((prev) => prev.map((p) => p.id === project.id ? { ...p, planImage: ev.target.result } : p));
    reader.readAsDataURL(file);
  };

  // Size canvas + draw strokes whenever planImage changes
  useEffect(() => {
    if (!planImageSrc || !canvasRef.current) return;
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const maxW = 1200;
      const scale = img.naturalWidth > maxW ? maxW / img.naturalWidth : 1;
      const bw = Math.round(img.naturalWidth  * scale);
      const bh = Math.round(img.naturalHeight * scale);
      canvas.width  = bw;
      canvas.height = bh;
      canvasSizeRef.current = { w: bw, h: bh };
      imgBaseRef.current    = { w: bw, h: bh };
      setImgBase({ w: bw, h: bh });
      redrawCanvas(planStrokes);
      setTimeout(() => {
        const el = planAreaRef.current;
        if (!el || !bw) return;
        const aw = el.clientWidth, ah = el.clientHeight;
        if (!aw || !ah) return;
        const fz = Math.min(aw / bw, ah / bh) * 0.92;
        const next = { zoom: fz, panX: (aw - bw * fz) / 2, panY: Math.max(16, (ah - bh * fz) / 2) };
        vpRef.current = next; setVp(next);
      }, 60);
    };
    img.src = planImageSrc;
  }, [planImageSrc]);

  // Redraw when persisted strokes change
  useEffect(() => {
    if (canvasSizeRef.current.w) redrawCanvas(planStrokes);
  }, [planStrokes]);

  // ── Geometry helpers ────────────────────────────────────────
  const distToSegment = (px, py, x1, y1, x2, y2) => {
    const A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1;
    const dot = A * C + B * D, lenSq = C * C + D * D;
    const t = lenSq !== 0 ? Math.max(0, Math.min(1, dot / lenSq)) : 0;
    return Math.hypot(px - (x1 + t * C), py - (y1 + t * D));
  };

  const strokeBounds = (s, cw) => {
    if (s.type === "pen") {
      const xs = s.points.map(p => p.x), ys = s.points.map(p => p.y);
      return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
    }
    if (s.type === "text") {
      const fs = s.fontSize || Math.round(cw * 0.04);
      const tw = (s.text?.length || 0) * fs * 0.58;
      return { x1: s.x, y1: s.y, x2: s.x + tw, y2: s.y + fs };
    }
    return { x1: Math.min(s.x1, s.x2), y1: Math.min(s.y1, s.y2), x2: Math.max(s.x1, s.x2), y2: Math.max(s.y1, s.y2) };
  };

  const hitTestStroke = (s, px, py, cw) => {
    const M = 12;
    if (s.type === "text") { const b = strokeBounds(s, cw); return px >= b.x1 - M && px <= b.x2 + M && py >= b.y1 - M && py <= b.y2 + M; }
    if (s.type === "pen") { for (let i = 1; i < s.points.length; i++) { if (distToSegment(px, py, s.points[i-1].x, s.points[i-1].y, s.points[i].x, s.points[i].y) < M) return true; } return false; }
    if (s.type === "arrow") return distToSegment(px, py, s.x1, s.y1, s.x2, s.y2) < M;
    if (s.type === "rect") { const bx1 = Math.min(s.x1,s.x2), bx2 = Math.max(s.x1,s.x2), by1 = Math.min(s.y1,s.y2), by2 = Math.max(s.y1,s.y2); return (px>=bx1-M&&px<=bx2+M&&py>=by1-M&&py<=by2+M) && !(px>=bx1+M&&px<=bx2-M&&py>=by1+M&&py<=by2-M); }
    if (s.type === "circle") { const cx=(s.x1+s.x2)/2, cy=(s.y1+s.y2)/2, rx=Math.abs(s.x2-s.x1)/2||1, ry=Math.abs(s.y2-s.y1)/2||1; return Math.abs(Math.sqrt(((px-cx)/rx)**2+((py-cy)/ry)**2)-1) < M/Math.min(rx,ry); }
    return false;
  };

  const getHandles = (b) => {
    const mx = (b.x1 + b.x2) / 2, my = (b.y1 + b.y2) / 2;
    return [
      { name: "nw", x: b.x1, y: b.y1 }, { name: "n", x: mx, y: b.y1 }, { name: "ne", x: b.x2, y: b.y1 },
      { name: "e",  x: b.x2, y: my   },
      { name: "se", x: b.x2, y: b.y2 }, { name: "s", x: mx, y: b.y2 }, { name: "sw", x: b.x1, y: b.y2 },
      { name: "w",  x: b.x1, y: my   },
    ];
  };

  const hitHandle = (s, px, py, cw) => {
    const b = strokeBounds(s, cw);
    const handles = getHandles({ x1: b.x1 - 8, y1: b.y1 - 8, x2: b.x2 + 8, y2: b.y2 + 8 });
    for (const h of handles) { if (Math.abs(px - h.x) <= 9 && Math.abs(py - h.y) <= 9) return h.name; }
    return null;
  };

  const drawSelectionOverlay = (ctx, s, cw) => {
    const b = strokeBounds(s, cw);
    const PAD = 8, HS = 6;
    ctx.save();
    ctx.strokeStyle = "#3B82F6"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]);
    ctx.strokeRect(b.x1 - PAD, b.y1 - PAD, b.x2 - b.x1 + PAD * 2, b.y2 - b.y1 + PAD * 2);
    ctx.setLineDash([]);
    getHandles({ x1: b.x1 - PAD, y1: b.y1 - PAD, x2: b.x2 + PAD, y2: b.y2 + PAD }).forEach(h => {
      ctx.fillStyle = "#fff"; ctx.fillRect(h.x - HS / 2, h.y - HS / 2, HS, HS);
      ctx.strokeStyle = "#3B82F6"; ctx.lineWidth = 1.5; ctx.strokeRect(h.x - HS / 2, h.y - HS / 2, HS, HS);
    });
    ctx.restore();
  };

  const applyMove = (s, dx, dy) => {
    if (s.type === "pen") return { ...s, points: s.points.map(p => ({ x: p.x + dx, y: p.y + dy })) };
    if (s.type === "text") return { ...s, x: s.x + dx, y: s.y + dy };
    return { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy };
  };

  const applyResize = (s, handle, dx, dy) => {
    if (s.type === "pen") return applyMove(s, dx / 2, dy / 2);
    if (s.type === "text") return { ...s, fontSize: Math.max(8, (s.fontSize || 18) - dy * 0.4) };
    const n = { ...s };
    if (handle.includes("n")) n.y1 = s.y1 + dy;
    if (handle.includes("s")) n.y2 = s.y2 + dy;
    if (handle.includes("w")) n.x1 = s.x1 + dx;
    if (handle.includes("e")) n.x2 = s.x2 + dx;
    return n;
  };

  const updateStroke = (updated) => setProjects(prev => prev.map(p => p.id !== project.id ? p : {
    ...p, planStrokes: (p.planStrokes || []).map(s => s.id === updated.id ? updated : s)
  }));

  const toggleVisibility = (id) => setProjects(prev => prev.map(p => p.id !== project.id ? p : {
    ...p, planStrokes: (p.planStrokes || []).map(s => s.id === id ? { ...s, visible: s.visible === false } : s)
  }));

  const reorderStrokes = (fromIdx, toIdx) => setProjects(prev => prev.map(p => {
    if (p.id !== project.id) return p;
    const arr = [...(p.planStrokes || [])];
    const [item] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, item);
    return { ...p, planStrokes: arr };
  }));

  // ── Drawing helpers ─────────────────────────────────────────
  const redrawCanvas = (list, inProgress = null) => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.width) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    list.forEach((s) => { if (s.visible !== false) paintStroke(ctx, s, canvas.width); });
    if (inProgress) paintStroke(ctx, inProgress, canvas.width);
    // Selection overlay
    const selId = selectedIdRef.current;
    if (selId) {
      const sel = list.find(s => s.id === selId) || (inProgress?.id === selId ? inProgress : null);
      if (sel && sel.visible !== false) drawSelectionOverlay(ctx, sel, canvas.width);
    }
  };

  const paintArrow = (ctx, x1, y1, x2, y2) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const hl  = Math.max(16, len * 0.18);
    const ang = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - hl * Math.cos(ang - Math.PI / 6), y2 - hl * Math.sin(ang - Math.PI / 6));
    ctx.lineTo(x2 - hl * Math.cos(ang + Math.PI / 6), y2 - hl * Math.sin(ang + Math.PI / 6));
    ctx.closePath(); ctx.fill();
  };

  const paintStroke = (ctx, s, cw) => {
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color;
    ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (s.type === "arrow") {
      paintArrow(ctx, s.x1, s.y1, s.x2, s.y2);
    } else if (s.type === "rect") {
      ctx.strokeRect(s.x1, s.y1, s.x2 - s.x1, s.y2 - s.y1);
    } else if (s.type === "circle") {
      const rx = Math.abs(s.x2 - s.x1) / 2, ry = Math.abs(s.y2 - s.y1) / 2;
      ctx.beginPath();
      ctx.ellipse((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2, Math.max(rx, 1), Math.max(ry, 1), 0, 0, 2 * Math.PI);
      ctx.stroke();
    } else if (s.type === "pen") {
      if (s.points.length < 2) return;
      ctx.beginPath();
      s.points.forEach((pt, i) => { if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y); });
      ctx.stroke();
    } else if (s.type === "text") {
      const fs = s.fontSize || Math.round(cw * 0.04);
      const wt = s.bold   ? "bold"   : "normal";
      const st = s.italic ? "italic" : "normal";
      ctx.font = `${st} ${wt} ${fs}px system-ui, -apple-system, sans-serif`;
      ctx.fillText(s.text, s.x, s.y + fs);
    }
  };

  const getCanvasPt = (e) => {
    const canvas = canvasRef.current;
    const rect   = canvas.getBoundingClientRect();
    const sx = canvas.width  / rect.width;
    const sy = canvas.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * sx, y: (src.clientY - rect.top) * sy };
  };

  const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
  const commitStroke = (stroke) => {
    const s = { id: genId(), visible: true, ...stroke };
    setProjects((prev) => prev.map((p) => p.id === project.id ? { ...p, planStrokes: [...(p.planStrokes || []), s] } : p));
    return s.id;
  };

  const undoStroke = () => setProjects((prev) => prev.map((p) => p.id === project.id ? {
    ...p, planStrokes: (p.planStrokes || []).slice(0, -1)
  } : p));

  const clearStrokes = () => setProjects((prev) => prev.map((p) => p.id === project.id ? {
    ...p, planStrokes: []
  } : p));

  const deleteStroke = (idx) => setProjects((prev) => prev.map((p) => p.id === project.id ? {
    ...p, planStrokes: (p.planStrokes || []).filter((_, i) => i !== idx)
  } : p));

  const switchMode = (m) => { setMode(m); setPendingMarker(null); setTextPending(null); setTextValue(""); setSelectedId(null); selectedIdRef.current = null; selDragRef.current = null; redrawCanvas(planStrokesRef.current); };

  // ── Viewport helpers ─────────────────────────────────────────
  const setVpAndRef = (next) => { vpRef.current = next; setVp(next); };

  const fitToScreen = () => {
    const el = planAreaRef.current;
    const { w: iw, h: ih } = imgBaseRef.current;
    if (!el || !iw) return;
    const aw = el.clientWidth, ah = el.clientHeight;
    const fz = Math.min(aw / iw, ah / ih) * 0.92;
    setVpAndRef({ zoom: fz, panX: (aw - iw * fz) / 2, panY: Math.max(16, (ah - ih * fz) / 2) });
  };

  const zoomBy = (factor) => {
    const el = planAreaRef.current;
    if (!el) return;
    const cx = el.clientWidth / 2, cy = el.clientHeight / 2;
    const cur = vpRef.current;
    const nz  = Math.max(0.1, Math.min(10, cur.zoom * factor));
    setVpAndRef({ zoom: nz, panX: cx - (cx - cur.panX) * (nz / cur.zoom), panY: cy - (cy - cur.panY) * (nz / cur.zoom) });
  };

  const getCursor = () => {
    if (dragging) return "grabbing";
    if (spaceHeld || mode === "view") return "grab";
    if (mode === "marker") return "crosshair";
    if (mode === "anno") {
      if (annoTool === "select") return selDragRef.current ? "grabbing" : "default";
      return annoTool === "text" ? "text" : "crosshair";
    }
    return "default";
  };

  const onAreaDown = (e) => {
    if (e.button !== 0 || (!spaceHeldRef.current && mode !== "view")) return;
    e.preventDefault();
    panningRef.current   = true;
    panStartRef.current  = { x: e.clientX, y: e.clientY };
    panOriginRef.current = { x: vpRef.current.panX, y: vpRef.current.panY };
    setDragging(true);
  };
  const onAreaMove = (e) => {
    if (!panningRef.current) return;
    const nxt = { zoom: vpRef.current.zoom, panX: panOriginRef.current.x + e.clientX - panStartRef.current.x, panY: panOriginRef.current.y + e.clientY - panStartRef.current.y };
    vpRef.current = nxt; setVp(nxt);
  };
  const onAreaUp = () => { if (panningRef.current) { panningRef.current = false; setDragging(false); } };

  // ── Space bar → pan override in all modes ───────────────────
  useEffect(() => {
    const dn = (e) => { if (e.code === "Space" && !e.repeat) { e.preventDefault(); spaceHeldRef.current = true;  setSpaceHeld(true);  } };
    const up = (e) => { if (e.code === "Space")               { spaceHeldRef.current = false; setSpaceHeld(false); } };
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup",   up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, []);

  // ── Wheel zoom (non-passive) ─────────────────────────────────
  useEffect(() => {
    const el = planAreaRef.current;
    if (!el || !planImageSrc) return;
    const handler = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const cur = vpRef.current;
      const nz  = Math.max(0.1, Math.min(10, cur.zoom * factor));
      const nxt = { zoom: nz, panX: cx - (cx - cur.panX) * (nz / cur.zoom), panY: cy - (cy - cur.panY) * (nz / cur.zoom) };
      vpRef.current = nxt; setVp({ ...nxt });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [planImageSrc]);

  // ── Flash "Enregistré" à chaque modification ────────────────
  useEffect(() => {
    if (planStrokes.length === 0 && markers.length === 0) return;
    setSavedFlash(true);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSavedFlash(false), 2200);
  }, [planStrokes.length, markers.length]);

  // ── Sync sidebar controls when selecting an existing annotation ─
  useEffect(() => {
    if (annoTool === "select" && selectedId) {
      const sel = planStrokesRef.current.find(s => s.id === selectedId);
      if (sel) {
        setAnnoColor(sel.color);
        if (sel.type === "text") {
          if (sel.fontSize) setTextFontSize(sel.fontSize);
          setTextBold(!!sel.bold);
          setTextItalic(!!sel.italic);
        }
      }
    }
  }, [selectedId, annoTool]);

  // ── Canvas pointer events ───────────────────────────────────
  const onDown = (e) => {
    e.preventDefault();

    // ── Select / Transform tool ──────────────────────────────
    if (annoTool === "select") {
      const pt = getCanvasPt(e);
      const cw = canvasRef.current?.width || 1;
      const strokes = planStrokesRef.current;
      // Check resize handle on already-selected stroke
      if (selectedIdRef.current) {
        const sel = strokes.find(s => s.id === selectedIdRef.current);
        if (sel) {
          const handle = hitHandle(sel, pt.x, pt.y, cw);
          if (handle) {
            selDragRef.current = { action: "resize", handle, origStroke: { ...sel, points: sel.points ? [...sel.points] : undefined }, startPt: pt };
            return;
          }
        }
      }
      // Hit test strokes top-to-bottom
      for (let i = strokes.length - 1; i >= 0; i--) {
        if (strokes[i].visible === false) continue;
        if (hitTestStroke(strokes[i], pt.x, pt.y, cw)) {
          const hit = strokes[i];
          setSelectedId(hit.id); selectedIdRef.current = hit.id;
          if (hit.type === "text") { setTextFontSize(hit.fontSize || 18); setTextBold(!!hit.bold); setTextItalic(!!hit.italic); }
          setAnnoColor(hit.color);
          selDragRef.current = { action: "move", origStroke: { ...hit, points: hit.points ? [...hit.points] : undefined }, startPt: pt };
          redrawCanvas(strokes);
          return;
        }
      }
      // Clicked empty — deselect
      setSelectedId(null); selectedIdRef.current = null; selDragRef.current = null;
      redrawCanvas(strokes);
      return;
    }

    // ── Text tool ────────────────────────────────────────────
    if (annoTool === "text") {
      const canvas = canvasRef.current;
      const rect   = canvas.getBoundingClientRect();
      const src    = e.touches ? e.touches[0] : e;
      const pt     = getCanvasPt(e);
      const areaRect = planAreaRef.current.getBoundingClientRect();
      setTextPending({ x: pt.x, y: pt.y, screenX: src.clientX - areaRect.left, screenY: src.clientY - areaRect.top });
      setTextValue("");
      setTimeout(() => textInputRef.current?.focus(), 60);
      return;
    }

    // ── Draw tools ───────────────────────────────────────────
    const pt = getCanvasPt(e);
    setSelectedId(null); selectedIdRef.current = null;
    setDrawing(true); setStartPt(pt); setCurrentPt(pt);
    if (annoTool === "pen") setPenPoints([pt]);
  };

  const onMove = (e) => {
    e.preventDefault();

    if (annoTool === "select") {
      if (!selDragRef.current) return;
      const pt = getCanvasPt(e);
      const drag = selDragRef.current;
      const dx = pt.x - drag.startPt.x, dy = pt.y - drag.startPt.y;
      const updated = drag.action === "move" ? applyMove(drag.origStroke, dx, dy) : applyResize(drag.origStroke, drag.handle, dx, dy);
      drag.currentStroke = updated;
      redrawCanvas(planStrokesRef.current.map(s => s.id === updated.id ? updated : s));
      return;
    }

    if (!drawing) return;
    const pt = getCanvasPt(e);
    setCurrentPt(pt);
    if (annoTool === "pen") {
      setPenPoints((prev) => {
        const pts = [...prev, pt];
        redrawCanvas(planStrokesRef.current, { type: "pen", color: annoColor, points: pts });
        return pts;
      });
    } else {
      redrawCanvas(planStrokesRef.current, { type: annoTool, color: annoColor, x1: startPt.x, y1: startPt.y, x2: pt.x, y2: pt.y });
    }
  };

  const onUp = (e) => {
    e.preventDefault();

    if (annoTool === "select") {
      const drag = selDragRef.current;
      if (drag?.currentStroke) updateStroke(drag.currentStroke);
      selDragRef.current = null;
      return;
    }

    if (!drawing) return;
    setDrawing(false);
    let stroke;
    if (annoTool === "pen") {
      if (penPoints.length < 2) { setPenPoints([]); return; }
      stroke = { type: "pen", color: annoColor, points: penPoints };
      setPenPoints([]);
    } else {
      const pt = currentPt || startPt;
      if (!pt || (Math.abs(pt.x - startPt.x) < 3 && Math.abs(pt.y - startPt.y) < 3)) { redrawCanvas(planStrokesRef.current); return; }
      stroke = { type: annoTool, color: annoColor, x1: startPt.x, y1: startPt.y, x2: pt.x, y2: pt.y };
    }
    const id = commitStroke(stroke);
    setSelectedId(id); selectedIdRef.current = id;
  };

  const confirmText = () => {
    if (!textPending || !textValue.trim()) { setTextPending(null); setTextValue(""); return; }
    const id = commitStroke({ type: "text", color: annoColor, x: textPending.x, y: textPending.y, text: textValue.trim(), fontSize: textFontSize, bold: textBold, italic: textItalic });
    setSelectedId(id); selectedIdRef.current = id;
    setTextPending(null); setTextValue("");
  };

  // ── Marker helpers ──────────────────────────────────────────
  const handlePlanClick = (e) => {
    if (mode !== "marker" || pendingMarker || spaceHeldRef.current) return;
    const rect = planRef.current.getBoundingClientRect();
    const x = Math.max(1, Math.min(99, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(1, Math.min(99, ((e.clientY - rect.top) / rect.height) * 100));
    setPendingMarker({ x, y });
    setSelectedPostId(project.posts[0]?.id || "");
  };

  const confirmMarker = () => {
    if (!selectedPostId || !pendingMarker) return;
    setProjects((prev) => prev.map((p) => p.id === project.id ? {
      ...p, planMarkers: [...(p.planMarkers || []), {
        id: Date.now(), x: pendingMarker.x, y: pendingMarker.y,
        postId: selectedPostId, number: (p.planMarkers || []).length + 1,
      }]
    } : p));
    setPendingMarker(null); setSelectedPostId("");
  };

  const removeMarker = (markerId) => setProjects((prev) => prev.map((p) => p.id === project.id ? {
    ...p, planMarkers: (p.planMarkers || []).filter((m) => m.id !== markerId).map((m, i) => ({ ...m, number: i + 1 }))
  } : p));

  const pickPlanColor = () => {
    if (window.EyeDropper) {
      const dropper = new window.EyeDropper();
      dropper.open().then(result => {
        setAnnoColor(result.sRGBHex);
        if (annoTool === "select" && selectedId) {
          const sel = planStrokesRef.current.find(s => s.id === selectedId);
          if (sel) updateStroke({ ...sel, color: result.sRGBHex });
        }
      }).catch(() => {});
    } else {
      planColorPickerRef.current?.click();
    }
  };

  return (
    /* Escape le padding + maxWidth du conteneur parent */
    <div style={{ margin: "0 -20px -20px" }}>
      <input ref={uploadRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { if (e.target.files[0]) uploadPlan(e.target.files[0]); e.target.value = ""; }} />

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", background: WH, borderBottom: `1px solid ${SBB}` }}>
        {/* Back ghost */}
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 8, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, flexShrink: 0 }}>
          <Ico name="back" color={TX2} />
        </button>

        {/* Titre + statut */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: TX }}>Plan du chantier</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 1 }}>
            <span style={{ fontSize: 11, color: TX3 }}>{project.name}</span>
            {savedFlash ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 600, color: GR, background: GRBG, padding: "1px 7px 1px 5px", borderRadius: 10, flexShrink: 0 }}>
                <Ico name="check" size={10} color={GR} />Enregistré
              </span>
            ) : (markers.length + planStrokes.length > 0) ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 500, color: TX3, flexShrink: 0 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: GR, display: "inline-block", flexShrink: 0 }} />
                {markers.length + planStrokes.length} élément{markers.length + planStrokes.length !== 1 ? "s" : ""}
              </span>
            ) : (
              <span style={{ fontSize: 10, color: DIST }}>Aucune annotation</span>
            )}
          </div>
        </div>

        {/* Sauvegarder */}
        {(markers.length + planStrokes.length > 0) && (
          <button onClick={() => { setSavedFlash(true); if (savedTimerRef.current) clearTimeout(savedTimerRef.current); savedTimerRef.current = setTimeout(() => setSavedFlash(false), 2200); }} style={{ padding: "7px 16px", border: "none", borderRadius: 8, background: savedFlash ? GR : AC, color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, flexShrink: 0, transition: "background 0.2s" }}>
            <Ico name={savedFlash ? "check" : "save"} size={14} color="#fff" />
            {savedFlash ? "Enregistré !" : "Sauvegarder"}
          </button>
        )}

        {/* Changer de plan (secondaire) */}
        {planImageSrc && (
          <button onClick={() => uploadRef.current.click()} style={{ padding: "7px 12px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", fontSize: 12, color: TX2, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
            <Ico name="upload" size={13} color={TX3} />Changer de plan
          </button>
        )}

        {/* Séparateur */}
        <div style={{ width: 1, height: 22, background: SBB, flexShrink: 0 }} />

        {/* Fermer (action principale de sortie) */}
        <button onClick={onBack} style={{ padding: "7px 18px", border: "none", borderRadius: 8, background: TX, color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          Fermer
        </button>
      </div>

      {isPdf && !pdfRendered ? (
        /* ── Loading PDF ── */
        <div style={{ margin: "0 20px 20px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 20px", background: WH, borderRadius: 14, border: `1px solid ${SBB}`, textAlign: "center" }}>
          <div style={{ width: 14, height: 14, border: `2px solid ${SBB}`, borderTopColor: AC, borderRadius: "50%", animation: "sp .7s linear infinite", marginBottom: 14 }} />
          <div style={{ fontSize: 13, color: TX3 }}>Rendu du PDF en cours...</div>
        </div>
      ) : !planImageSrc ? (
        /* ── Empty state ── */
        <div style={{ margin: "0 20px 20px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 20px", border: `2px dashed ${SBB}`, borderRadius: 14, background: WH, textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: ACL, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
            <Ico name="mappin" size={26} color={AC} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: TX, marginBottom: 6 }}>Aucun plan uploadé</div>
          <div style={{ fontSize: 13, color: TX3, marginBottom: 24, maxWidth: 300, lineHeight: 1.6 }}>Uploadez un fichier image (JPG, PNG) pour localiser vos remarques directement sur le plan.</div>
          <button onClick={() => uploadRef.current.click()} style={{ padding: "11px 28px", border: "none", borderRadius: 10, background: AC, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8 }}>
            <Ico name="upload" size={16} color="#fff" />Choisir un plan
          </button>
        </div>
      ) : (
        /* ── Workspace : sidebar gauche + plan ── */
        <div style={{ display: "flex", height: "calc(100vh - 130px)" }}>

          {/* ═══ Sidebar outils ═══ */}
          <div style={{ width: 210, flexShrink: 0, background: SB, borderRight: `1px solid ${SBB}`, display: "flex", flexDirection: "column", overflowY: "auto" }}>

            {/* ── Sélecteur de mode ── */}
            <div style={{ padding: "10px 10px 0", flexShrink: 0, borderBottom: `1px solid ${SBB}`, paddingBottom: 10 }}>
              <div style={{ display: "flex", background: SB2, borderRadius: 8, padding: 3 }}>
                {[
                  { id: "view",   label: "Vue",      icon: "eye"    },
                  { id: "marker", label: "Marqueur", icon: "mappin" },
                  { id: "anno",   label: "Dessin",   icon: "pen2"   },
                ].map((m) => (
                  <button key={m.id} onClick={() => switchMode(m.id)}
                    style={{ flex: 1, padding: `${SP.sm}px ${SP.xs}px`, border: "none", borderRadius: RAD.sm, background: mode === m.id ? WH : "transparent", color: mode === m.id ? TX : TX3, fontWeight: mode === m.id ? 700 : 400, fontSize: FS.xs, cursor: "pointer", fontFamily: "inherit", boxShadow: mode === m.id ? "0 1px 2px rgba(0,0,0,0.08)" : "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minHeight: 44 }}
                  >
                    <Ico name={m.icon} size={15} color={mode === m.id ? AC : TX3} />
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ────────────────────────────── */}
            {/* MODE VUE */}
            {/* ────────────────────────────── */}
            {mode === "view" && (
              <div style={{ padding: "12px 12px 14px", flex: 1 }}>
                {/* Résumé */}
                <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                  <div style={{ flex: 1, background: WH, border: `1px solid ${SBB}`, borderRadius: 8, padding: "8px 6px", textAlign: "center" }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: AC, lineHeight: 1 }}>{markers.length}</div>
                    <div style={{ fontSize: 9, color: TX3, marginTop: 3, fontWeight: 500 }}>marqueur{markers.length !== 1 ? "s" : ""}</div>
                  </div>
                  <div style={{ flex: 1, background: WH, border: `1px solid ${SBB}`, borderRadius: 8, padding: "8px 6px", textAlign: "center" }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: TX2, lineHeight: 1 }}>{planStrokes.length}</div>
                    <div style={{ fontSize: 9, color: TX3, marginTop: 3, fontWeight: 500 }}>annotation{planStrokes.length !== 1 ? "s" : ""}</div>
                  </div>
                </div>

                {/* Liste marqueurs */}
                {markers.length > 0 && (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: TX3, marginBottom: 8 }}>Marqueurs</div>
                    {markers.map((m) => {
                      const post = project.posts.find((p) => p.id === m.postId);
                      return (
                        <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 0", borderBottom: `1px solid ${SB2}` }}>
                          <div style={{ width: 24, height: 24, borderRadius: "50%", background: AC, color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{m.number}</div>
                          <span style={{ fontSize: 11, color: TX2, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{post ? `${post.id}. ${post.label}` : "—"}</span>
                          <button onClick={() => removeMarker(m.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0, opacity: 0.4 }}><Ico name="trash" size={11} color={TX3} /></button>
                        </div>
                      );
                    })}
                  </>
                )}

                {/* Liste annotations */}
                {planStrokes.length > 0 && (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: TX3, marginBottom: 8, marginTop: markers.length > 0 ? 14 : 0 }}>Annotations</div>
                    {planStrokes.map((s, idx) => {
                      const tool = ANNO_TOOLS.find((t) => t.id === s.type);
                      return (
                        <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 0", borderBottom: `1px solid ${SB2}` }}>
                          <div style={{ width: 7, height: 7, borderRadius: "50%", background: s.color, border: "1px solid rgba(0,0,0,0.08)", flexShrink: 0 }} />
                          <Ico name={tool?.icon || "pen2"} size={11} color={TX3} />
                          <span style={{ fontSize: 11, color: TX2, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {s.type === "text" ? `"${s.text}"` : tool?.label || s.type}
                          </span>
                          <button onClick={() => deleteStroke(idx)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0, opacity: 0.4 }}><Ico name="trash" size={11} color={TX3} /></button>
                        </div>
                      );
                    })}
                  </>
                )}

                {markers.length === 0 && planStrokes.length === 0 && (
                  <div style={{ padding: "14px 6px", textAlign: "center", color: TX3, fontSize: 11, lineHeight: 1.7 }}>Aucune annotation.<br />Utilisez les modes<br />Marqueur ou Dessin.</div>
                )}
              </div>
            )}

            {/* ────────────────────────────── */}
            {/* MODE MARQUEUR */}
            {/* ────────────────────────────── */}
            {mode === "marker" && (
              <div style={{ padding: "12px 12px 14px" }}>
                {!pendingMarker ? (
                  <div style={{ padding: "8px 10px", background: ACL, border: `1px solid ${ACL2}`, borderRadius: 7, fontSize: 11, color: AC, fontWeight: 500, display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
                    <Ico name="mappin" size={12} color={AC} />
                    Cliquez sur le plan pour placer un marqueur
                  </div>
                ) : (
                  <div style={{ padding: "10px 10px", background: ACL, border: `1px solid ${ACL2}`, borderRadius: 8, marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: AC, marginBottom: 6 }}>Lier au poste</div>
                    <select value={selectedPostId} onChange={(e) => setSelectedPostId(e.target.value)} style={{ width: "100%", padding: "6px 8px", border: `1px solid ${ACL2}`, borderRadius: 6, fontSize: 12, background: WH, color: TX, fontFamily: "inherit", marginBottom: 8 }}>
                      {project.posts.map((p) => <option key={p.id} value={p.id}>{p.id}. {p.label}</option>)}
                    </select>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={confirmMarker} style={{ flex: 1, padding: "6px 0", border: "none", borderRadius: 6, background: AC, color: "#fff", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Confirmer</button>
                      <button onClick={() => setPendingMarker(null)} style={{ padding: "6px 10px", border: `1px solid ${ACL2}`, borderRadius: 6, background: WH, color: TX2, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
                    </div>
                  </div>
                )}

                {markers.length > 0 && (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: TX3, marginBottom: 8 }}>Placés · {markers.length}</div>
                    {markers.map((m) => {
                      const post = project.posts.find((p) => p.id === m.postId);
                      return (
                        <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 0", borderBottom: `1px solid ${SB2}` }}>
                          <div style={{ width: 24, height: 24, borderRadius: "50%", background: AC, color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{m.number}</div>
                          <span style={{ fontSize: 11, color: TX2, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{post ? `${post.id}. ${post.label}` : "—"}</span>
                          <button onClick={() => removeMarker(m.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0 }}><Ico name="trash" size={11} color={TX3} /></button>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}

            {/* ────────────────────────────── */}
            {/* MODE DESSIN */}
            {/* ────────────────────────────── */}
            {mode === "anno" && (
              <div style={{ padding: "12px 12px 14px" }}>
                {/* Outils — grille 3 colonnes pour 6 outils */}
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: TX3, marginBottom: 8 }}>Outil</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 3, marginBottom: 14 }}>
                  {ANNO_TOOLS.map((t) => {
                    const active = annoTool === t.id;
                    return (
                      <button key={t.id} title={t.label}
                        onClick={() => { setAnnoTool(t.id); if (t.id !== "select") { setSelectedId(null); selectedIdRef.current = null; redrawCanvas(planStrokesRef.current); } }}
                        style={{ padding: `${SP.sm + 2}px ${SP.xs}px ${SP.sm}px`, border: `1.5px solid ${active ? AC : SBB}`, borderRadius: RAD.md, background: active ? ACL : WH, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: SP.xs, fontFamily: "inherit", boxShadow: active ? "none" : "0 1px 2px rgba(0,0,0,0.04)", minHeight: 44 }}
                      >
                        <Ico name={t.icon} size={16} color={active ? AC : TX2} />
                        <span style={{ fontSize: FS.xs, fontWeight: active ? 700 : 500, color: active ? AC : TX3, letterSpacing: "0.01em", lineHeight: 1 }}>{t.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Couleur (toujours visible, permet de changer couleur d'un objet sélectionné) */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: TX3 }}>Couleur</div>
                  <div style={{ width: 16, height: 16, borderRadius: 4, background: annoColor, border: "1px solid rgba(0,0,0,0.12)", flexShrink: 0 }} />
                </div>
                <div style={{ display: "flex", gap: 5, alignItems: "center", marginBottom: 14 }}>
                  {ANNO_COLORS.map((c) => (
                    <button key={c} title={c}
                      onClick={() => {
                        setAnnoColor(c);
                        if (annoTool === "select" && selectedId) {
                          const sel = planStrokesRef.current.find(s => s.id === selectedId);
                          if (sel) updateStroke({ ...sel, color: c });
                        }
                      }}
                      style={{ width: 22, height: 22, borderRadius: "50%", background: c, border: annoColor === c ? `2.5px solid ${AC}` : "1.5px solid rgba(0,0,0,0.12)", cursor: "pointer", boxShadow: annoColor === c ? `0 0 0 2px ${ACL}` : "none", outline: "none", flexShrink: 0 }}
                    />
                  ))}
                  <button onClick={pickPlanColor} title="Pipette" style={{ width: 22, height: 22, borderRadius: "50%", border: `1.5px solid ${SBB}`, background: WH, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0 }}>
                    <Ico name="pipette" size={12} color={TX2} />
                  </button>
                  <input ref={planColorPickerRef} type="color" value={annoColor}
                    onChange={e => {
                      const c = e.target.value;
                      setAnnoColor(c);
                      if (annoTool === "select" && selectedId) {
                        const sel = planStrokesRef.current.find(s => s.id === selectedId);
                        if (sel) updateStroke({ ...sel, color: c });
                      }
                    }}
                    style={{ width: 0, height: 0, padding: 0, border: "none", opacity: 0, position: "absolute", pointerEvents: "none" }}
                  />
                </div>

                {/* Propriétés texte — visible quand outil texte ou annotation texte sélectionnée */}
                {(annoTool === "text" || (annoTool === "select" && planStrokes.find(s => s.id === selectedId)?.type === "text")) && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: TX3, marginBottom: 7 }}>Taille · Style</div>
                    <div style={{ display: "flex", gap: 3, marginBottom: 6 }}>
                      {[12, 16, 22, 32, 48].map(sz => (
                        <button key={sz}
                          onClick={() => {
                            setTextFontSize(sz);
                            if (annoTool === "select" && selectedId) {
                              const sel = planStrokesRef.current.find(s => s.id === selectedId);
                              if (sel?.type === "text") updateStroke({ ...sel, fontSize: sz });
                            }
                          }}
                          style={{ flex: 1, padding: "4px 1px", border: `1.5px solid ${textFontSize === sz ? AC : SBB}`, borderRadius: 5, background: textFontSize === sz ? ACL : WH, cursor: "pointer", fontSize: Math.max(7, Math.min(11, sz * 0.42)), fontWeight: 600, color: textFontSize === sz ? AC : TX3, fontFamily: "inherit" }}
                        >{sz}</button>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        onClick={() => {
                          const next = !textBold;
                          setTextBold(next);
                          if (annoTool === "select" && selectedId) {
                            const sel = planStrokesRef.current.find(s => s.id === selectedId);
                            if (sel?.type === "text") updateStroke({ ...sel, bold: next });
                          }
                        }}
                        style={{ flex: 1, padding: "6px 0", border: `1.5px solid ${textBold ? AC : SBB}`, borderRadius: 6, background: textBold ? ACL : WH, cursor: "pointer", fontWeight: 800, fontSize: 13, color: textBold ? AC : TX2, fontFamily: "inherit" }}>B</button>
                      <button
                        onClick={() => {
                          const next = !textItalic;
                          setTextItalic(next);
                          if (annoTool === "select" && selectedId) {
                            const sel = planStrokesRef.current.find(s => s.id === selectedId);
                            if (sel?.type === "text") updateStroke({ ...sel, italic: next });
                          }
                        }}
                        style={{ flex: 1, padding: "6px 0", border: `1.5px solid ${textItalic ? AC : SBB}`, borderRadius: 6, background: textItalic ? ACL : WH, cursor: "pointer", fontStyle: "italic", fontWeight: 700, fontSize: 13, color: textItalic ? AC : TX2, fontFamily: "inherit" }}>I</button>
                    </div>
                  </div>
                )}

                {/* Calques — ordre Photoshop (haut = premier) avec drag-to-reorder */}
                <div style={{ height: 1, background: SBB, marginBottom: 10 }} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: planStrokes.length > 0 ? 6 : 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: TX3, display: "flex", alignItems: "center", gap: 5 }}>
                    <Ico name="layers" size={11} color={TX3} />Calques · {planStrokes.length}
                  </div>
                  {planStrokes.length > 0 && (
                    <div style={{ display: "flex", gap: 2 }}>
                      <button onClick={undoStroke} title="Annuler le dernier" style={{ background: "none", border: "none", cursor: "pointer", padding: "3px 5px", borderRadius: 5 }}><Ico name="undo" size={12} color={TX2} /></button>
                      <button onClick={clearStrokes} title="Tout effacer" style={{ background: "none", border: "none", cursor: "pointer", padding: "3px 5px", borderRadius: 5 }}><Ico name="trash" size={12} color={RD} /></button>
                    </div>
                  )}
                </div>
                {planStrokes.length === 0 && (
                  <div style={{ fontSize: 11, color: DIST, padding: "18px 6px 10px", textAlign: "center" }}>Aucun dessin pour l'instant.</div>
                )}
                {/* Affichage inversé : calque du dessus en premier (Photoshop) */}
                {[...planStrokes].reverse().map((s, revIdx) => {
                  const actualIdx = planStrokes.length - 1 - revIdx;
                  const tool = ANNO_TOOLS.find((t) => t.id === s.type);
                  const isSel = s.id === selectedId;
                  const isHidden = s.visible === false;
                  return (
                    <div key={s.id || actualIdx}
                      draggable
                      onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(actualIdx)); e.dataTransfer.effectAllowed = "move"; }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.preventDefault(); const from = parseInt(e.dataTransfer.getData("text/plain")); if (from !== actualIdx) reorderStrokes(from, actualIdx); }}
                      onClick={() => {
                        setAnnoTool("select");
                        setSelectedId(s.id); selectedIdRef.current = s.id;
                        if (s.type === "text") { setTextFontSize(s.fontSize || 18); setTextBold(!!s.bold); setTextItalic(!!s.italic); }
                        setAnnoColor(s.color);
                        redrawCanvas(planStrokesRef.current);
                      }}
                      style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 4px", borderRadius: 5, marginBottom: 1, background: isSel ? ACL : "transparent", border: `1px solid ${isSel ? ACL2 : "transparent"}`, cursor: "pointer", opacity: isHidden ? 0.4 : 1 }}
                    >
                      {/* Drag handle */}
                      <div style={{ cursor: "grab", color: DIST, fontSize: 10, lineHeight: 1, paddingRight: 1, flexShrink: 0 }}>⠿</div>
                      {/* Color dot */}
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: s.color, border: "1px solid rgba(0,0,0,0.1)", flexShrink: 0 }} />
                      {/* Icon + label */}
                      <Ico name={tool?.icon || "pen2"} size={10} color={isSel ? AC : TX3} />
                      <span style={{ fontSize: 10.5, color: isSel ? AC : TX2, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: isSel ? 600 : 400 }}>
                        {s.type === "text" ? `"${s.text}"` : tool?.label || s.type}
                      </span>
                      {/* Visibility toggle */}
                      <button onClick={(e) => { e.stopPropagation(); toggleVisibility(s.id); }} title={isHidden ? "Afficher" : "Masquer"}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0, opacity: isHidden ? 0.4 : 0.6 }}>
                        <Ico name={isHidden ? "eye-off" : "eye"} size={10} color={TX3} />
                      </button>
                      {/* Delete */}
                      <button onClick={(e) => { e.stopPropagation(); if (isSel) { setSelectedId(null); selectedIdRef.current = null; } deleteStroke(actualIdx); }}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0, opacity: 0.4 }}>
                        <Ico name="trash" size={10} color={TX3} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ═══ Zone plan ═══ */}
          <div
            ref={planAreaRef}
            style={{ flex: 1, position: "relative", overflow: "hidden", background: "#ECEAE6", cursor: getCursor() }}
            onMouseDown={onAreaDown}
            onMouseMove={onAreaMove}
            onMouseUp={onAreaUp}
            onMouseLeave={onAreaUp}
          >
            {/* Plan transformé (zoom + pan) */}
            <div
              ref={planRef}
              onClick={handlePlanClick}
              style={{ position: "absolute", top: 0, left: 0, transformOrigin: "0 0", transform: `translate(${vp.panX}px,${vp.panY}px) scale(${vp.zoom})`, boxShadow: "0 4px 24px rgba(0,0,0,0.15)", borderRadius: 6, overflow: "hidden", userSelect: "none" }}
            >
              {imgBase.w > 0 && (
                <img src={planImageSrc} alt="Plan" style={{ display: "block", width: imgBase.w, height: imgBase.h }} />
              )}

              {/* Canvas annotation overlay */}
              <canvas
                ref={canvasRef}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: (mode === "anno" && !textPending && !spaceHeld) ? "auto" : "none", cursor: annoTool === "select" ? "default" : annoTool === "text" ? "text" : "crosshair", touchAction: "none" }}
                onMouseDown={mode === "anno" ? onDown : undefined}
                onMouseMove={mode === "anno" ? onMove : undefined}
                onMouseUp={mode === "anno" ? onUp : undefined}
                onMouseLeave={mode === "anno" ? onUp : undefined}
                onTouchStart={mode === "anno" ? onDown : undefined}
                onTouchMove={mode === "anno" ? onMove : undefined}
                onTouchEnd={mode === "anno" ? onUp : undefined}
              />

              {/* Marqueurs (% sur le plan, scalent avec lui) */}
              {markers.map((m) => {
                const post = project.posts.find((p) => p.id === m.postId);
                return (
                  <div key={m.id} onClick={(e) => e.stopPropagation()} title={post ? `${post.id}. ${post.label}` : ""} style={{ position: "absolute", left: `${m.x}%`, top: `${m.y}%`, transform: "translate(-50%, -100%)", zIndex: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: AC, color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", border: "2.5px solid #fff", boxShadow: "0 2px 10px rgba(0,0,0,0.4)" }}>{m.number}</div>
                    <div style={{ width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: `7px solid ${AC}`, margin: "0 auto" }} />
                  </div>
                );
              })}

              {/* Marqueur en attente */}
              {pendingMarker && (
                <div style={{ position: "absolute", left: `${pendingMarker.x}%`, top: `${pendingMarker.y}%`, transform: "translate(-50%, -100%)", zIndex: 11, pointerEvents: "none" }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: TX3, color: "#fff", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", border: "2.5px solid #fff", boxShadow: "0 2px 10px rgba(0,0,0,0.25)" }}>?</div>
                  <div style={{ width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: `7px solid ${TX3}`, margin: "0 auto" }} />
                </div>
              )}
            </div>

            {/* Saisie texte (taille fixe, indépendante du zoom) */}
            {textPending && (
              <div
                style={{ position: "absolute", left: textPending.screenX, top: textPending.screenY, zIndex: 30, pointerEvents: "auto" }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <input
                  ref={textInputRef}
                  value={textValue}
                  onChange={(e) => {
                    const v = e.target.value;
                    setTextValue(v);
                    redrawCanvas(planStrokesRef.current, v ? { type: "text", color: annoColor, x: textPending.x, y: textPending.y, text: v, fontSize: textFontSize, bold: textBold, italic: textItalic } : null);
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") confirmText(); if (e.key === "Escape") { redrawCanvas(planStrokesRef.current); setTextPending(null); setTextValue(""); } }}
                  placeholder="Texte…"
                  style={{ border: `2px solid ${annoColor}`, borderRadius: 5, background: "rgba(255,255,255,0.93)", color: annoColor, fontSize: textFontSize * vp.zoom, fontWeight: textBold ? 700 : 400, fontStyle: textItalic ? "italic" : "normal", fontFamily: "system-ui,-apple-system,sans-serif", padding: "5px 10px", minWidth: 90, maxWidth: 280, outline: "none", boxShadow: "0 3px 16px rgba(0,0,0,0.22)", backdropFilter: "blur(4px)", display: "block" }}
                />
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.9)", background: "rgba(0,0,0,0.55)", padding: "2px 6px", borderRadius: "0 0 4px 4px", textAlign: "center", backdropFilter: "blur(3px)" }}>↵ Valider · Esc Annuler</div>
              </div>
            )}

            {/* Bannières mode actif (fixes dans planArea) */}
            {mode === "marker" && !pendingMarker && (
              <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", background: "rgba(217,123,13,0.92)", color: "#fff", fontSize: 11, fontWeight: 600, padding: "5px 14px 5px 10px", borderRadius: 20, pointerEvents: "none", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6, backdropFilter: "blur(4px)", zIndex: 20 }}>
                <Ico name="mappin" size={12} color="#fff" />Cliquez pour placer un marqueur
              </div>
            )}
            {mode === "anno" && !textPending && annoTool !== "select" && (
              <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", background: "rgba(29,29,27,0.78)", color: "#fff", fontSize: 11, fontWeight: 600, padding: "5px 14px 5px 10px", borderRadius: 20, pointerEvents: "none", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6, backdropFilter: "blur(4px)", zIndex: 20 }}>
                <Ico name={ANNO_TOOLS.find(t => t.id === annoTool)?.icon || "pen2"} size={12} color="#fff" />
                {ANNO_TOOLS.find(t => t.id === annoTool)?.label}
                {spaceHeld && <span style={{ opacity: 0.65, fontWeight: 400, marginLeft: 2 }}>· Navigation</span>}
              </div>
            )}
            {mode === "anno" && annoTool === "select" && !selectedId && !spaceHeld && (
              <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", background: "rgba(29,29,27,0.55)", color: "#fff", fontSize: 11, fontWeight: 500, padding: "4px 12px", borderRadius: 20, pointerEvents: "none", whiteSpace: "nowrap", backdropFilter: "blur(4px)", zIndex: 20 }}>
                Cliquez sur un élément pour le sélectionner
              </div>
            )}

            {/* Contrôles zoom */}
            <div style={{ position: "absolute", bottom: 16, right: 16, zIndex: 20, display: "flex", alignItems: "center", gap: 2, background: "rgba(255,255,255,0.94)", backdropFilter: "blur(8px)", border: `1px solid ${SBB}`, borderRadius: 22, padding: "4px 6px", boxShadow: "0 2px 12px rgba(0,0,0,0.10)" }}>
              <button onClick={() => zoomBy(1 / 1.4)} title="Zoom arrière" style={{ width: 27, height: 27, border: "none", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 17, fontWeight: 300, color: TX2, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1, fontFamily: "inherit" }}>−</button>
              <span style={{ fontSize: 11, fontWeight: 600, color: TX2, minWidth: 36, textAlign: "center", letterSpacing: "-0.02em" }}>{Math.round(vp.zoom * 100)}%</span>
              <button onClick={() => zoomBy(1.4)} title="Zoom avant" style={{ width: 27, height: 27, border: "none", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 17, fontWeight: 300, color: TX2, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1, fontFamily: "inherit" }}>+</button>
              <div style={{ width: 1, height: 16, background: SBB, margin: "0 2px" }} />
              <button onClick={fitToScreen} title="Ajuster à la fenêtre" style={{ width: 27, height: 27, border: "none", borderRadius: 6, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Ico name="fit" size={13} color={TX2} />
              </button>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

