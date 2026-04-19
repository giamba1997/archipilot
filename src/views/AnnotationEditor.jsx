import { useState, useRef, useEffect, useMemo } from "react";
import { useT } from "../i18n";
import { AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, RD, GR, SP, FS, RAD, BG, DIST } from "../constants/tokens";
import { Ico } from "../components/ui";
import { getPhotoUrl } from "../db";
import { REMARK_STATUSES, getRemarkStatus } from "../constants/statuses";
import { RemarkEditModal } from "../components/modals/RemarkEditModal";

export const ANNO_TOOLS = [
  { id: "select", label: "Sélect.",   icon: "cursor"  },
  { id: "arrow",  label: "Flèche",    icon: "arrowr"  },
  { id: "rect",   label: "Rectangle", icon: "rectc"   },
  { id: "circle", label: "Cercle",    icon: "circlec" },
  { id: "pen",    label: "Crayon",    icon: "pen2"    },
  { id: "text",   label: "Texte",     icon: "textT"   },
];
export const ANNO_COLORS = ["#EF4444", "#F97316", AC, "#3B82F6", "#1D1D1B", "#FFFFFF"];

export function AnnotationEditor({ photo, project, setProjects, postId, onSave, onClose }) {
  const canvasRef      = useRef(null);
  const imgRef         = useRef(null);
  const containerRef   = useRef(null);
  const textInputRef   = useRef(null);
  const colorPickerRef = useRef(null);
  const planAreaRef    = useRef(null);

  // Mode: vue | marqueur | dessin
  const [mode, setMode] = useState("dessin");

  // Drawing state
  const [tool,        setTool]        = useState("select");
  const [color,       setColor]       = useState("#EF4444");
  const [strokes,     setStrokes]     = useState([]);
  const [drawing,     setDrawing]     = useState(false);
  const [startPt,     setStartPt]     = useState(null);
  const [currentPt,   setCurrentPt]   = useState(null);
  const [penPoints,   setPenPoints]   = useState([]);
  const [textPending, setTextPending] = useState(null);
  const [textValue,   setTextValue]   = useState("");

  // Remark pins — persisted on photo.remarks via setProjects.
  // Flatten the live photo remarks for rendering.
  const photoRemarks = useMemo(() => {
    if (!project || !postId) return [];
    const post = project.posts?.find((p) => p.id === postId);
    const ph = post?.photos?.find((x) => x.id === photo.id);
    return (ph?.remarks || []).filter((r) => r.x != null && r.y != null);
  }, [project, postId, photo.id]);

  const [editingRemark, setEditingRemark] = useState(null);
  const [hoverPinId, setHoverPinId] = useState(null);
  const dragPinRef = useRef(null);

  const updatePhotoRemarks = (fn) => {
    if (!setProjects || !project || !postId) return;
    setProjects((prev) => prev.map((p) => {
      if (p.id !== project.id) return p;
      return {
        ...p,
        posts: (p.posts || []).map((post) => post.id !== postId ? post : {
          ...post,
          photos: (post.photos || []).map((ph) => ph.id !== photo.id ? ph : {
            ...ph,
            remarks: fn(ph.remarks || []),
          }),
        }),
      };
    }));
  };

  const saveRemark = (r) => {
    updatePhotoRemarks((list) => {
      const without = list.filter((x) => x.id !== r.id);
      return [...without, r];
    });
    setEditingRemark(null);
  };

  const deleteRemark = (id) => {
    updatePhotoRemarks((list) => list.filter((x) => x.id !== id));
    setEditingRemark(null);
  };

  const moveRemark = (id, x, y) => {
    updatePhotoRemarks((list) => list.map((r) => r.id === id ? { ...r, x, y } : r));
  };

  // Selection & transform
  const [selectedId,   setSelectedId]   = useState(null);
  const selectedIdRef  = useRef(null);
  const selDragRef     = useRef(null);
  const strokesRef     = useRef([]);

  // Text style
  const [textFontSize, setTextFontSize] = useState(18);
  const [textBold,     setTextBold]     = useState(false);
  const [textItalic,   setTextItalic]   = useState(false);

  // Viewport (zoom + pan)
  const [vp, setVp]             = useState({ zoom: 1, panX: 0, panY: 0 });
  const [imgBase, setImgBase]   = useState({ w: 0, h: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const vpRef       = useRef({ zoom: 1, panX: 0, panY: 0 });
  const imgBaseRef  = useRef({ w: 0, h: 0 });
  const panningRef  = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const panOriginRef= useRef({ x: 0, y: 0 });
  const spaceHeldRef= useRef(false);
  const t = useT();

  // Keep refs in sync
  strokesRef.current    = strokes;
  selectedIdRef.current = selectedId;

  const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

  const switchMode = (m) => {
    setMode(m); setTextPending(null); setTextValue(""); setSelectedId(null);
    selectedIdRef.current = null; selDragRef.current = null;
    redrawCanvas(strokesRef.current);
  };

  // Load image
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const maxW = 1200;
      const scale = img.naturalWidth > maxW ? maxW / img.naturalWidth : 1;
      const bw = Math.round(img.naturalWidth  * scale);
      const bh = Math.round(img.naturalHeight * scale);
      canvas.width  = bw;
      canvas.height = bh;
      imgBaseRef.current = { w: bw, h: bh };
      setImgBase({ w: bw, h: bh });
      redrawCanvas([]);
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
    img.src = getPhotoUrl(photo);
  }, []);

  // Auto-redraw when strokes state changes
  useEffect(() => { redrawCanvas(strokes); }, [strokes]);

  // Sync sidebar controls when selecting existing annotation
  useEffect(() => {
    if (tool === "select" && selectedId) {
      const sel = strokesRef.current.find(s => s.id === selectedId);
      if (sel) {
        setColor(sel.color);
        if (sel.type === "text") { setTextFontSize(sel.fontSize || 18); setTextBold(!!sel.bold); setTextItalic(!!sel.italic); }
      }
    }
  }, [selectedId, tool]);

  // Space key for pan
  useEffect(() => {
    const down = (e) => { if (e.code === "Space" && !e.repeat) { e.preventDefault(); spaceHeldRef.current = true; setSpaceHeld(true); } };
    const up   = (e) => { if (e.code === "Space") { spaceHeldRef.current = false; setSpaceHeld(false); } };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  // Zoom with mouse wheel
  useEffect(() => {
    const el = planAreaRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const prev = vpRef.current;
      const nz = Math.min(10, Math.max(0.1, prev.zoom * factor));
      const next = { zoom: nz, panX: mx - (mx - prev.panX) * (nz / prev.zoom), panY: my - (my - prev.panY) * (nz / prev.zoom) };
      vpRef.current = next; setVp(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Zoom buttons
  const zoomBy = (factor) => {
    const el = planAreaRef.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
    const prev = vpRef.current;
    const nz = Math.min(10, Math.max(0.1, prev.zoom * factor));
    const next = { zoom: nz, panX: cx - (cx - prev.panX) * (nz / prev.zoom), panY: cy - (cy - prev.panY) * (nz / prev.zoom) };
    vpRef.current = next; setVp(next);
  };

  // Pan area events
  const onAreaDown = (e) => {
    if (spaceHeldRef.current || (mode !== "dessin" && mode !== "marqueur")) {
      panningRef.current = true;
      panStartRef.current = { x: e.clientX, y: e.clientY };
      panOriginRef.current = { x: vpRef.current.panX, y: vpRef.current.panY };
    }
  };
  const onAreaMove = (e) => {
    if (!panningRef.current) return;
    const dx = e.clientX - panStartRef.current.x, dy = e.clientY - panStartRef.current.y;
    const next = { ...vpRef.current, panX: panOriginRef.current.x + dx, panY: panOriginRef.current.y + dy };
    vpRef.current = next; setVp(next);
  };
  const onAreaUp = () => { panningRef.current = false; };

  const getCursor = () => {
    if (spaceHeldRef.current || panningRef.current) return "grab";
    if (mode === "vue") return "default";
    if (mode === "marqueur") return "crosshair";
    return "default";
  };

  // Click on the photo in "marqueur" mode → open the remark modal at that position.
  const handlePlanClick = (e) => {
    if (mode !== "marqueur" || spaceHeldRef.current) return;
    if (dragPinRef.current?.moved) { dragPinRef.current = null; return; }
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = Math.max(1, Math.min(99, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(1, Math.min(99, ((e.clientY - rect.top) / rect.height) * 100));
    setEditingRemark({ x, y, postId });
  };

  // Pipette (eyedropper)
  const pickColorFromImage = () => {
    if (window.EyeDropper) {
      const dropper = new window.EyeDropper();
      dropper.open().then(result => {
        setColor(result.sRGBHex);
        if (tool === "select" && selectedId) {
          setStrokes(prev => prev.map(s => s.id === selectedId ? { ...s, color: result.sRGBHex } : s));
        }
      }).catch(() => {});
    } else {
      colorPickerRef.current?.click();
    }
  };

  // ── Geometry helpers ─────────────────────────────────────────
  const aeDistToSeg = (px, py, x1, y1, x2, y2) => {
    const A = px-x1, B = py-y1, C = x2-x1, D = y2-y1;
    const t = (C*C+D*D) !== 0 ? Math.max(0, Math.min(1, (A*C+B*D)/(C*C+D*D))) : 0;
    return Math.hypot(px-(x1+t*C), py-(y1+t*D));
  };

  const aeStrokeBounds = (s, cw) => {
    if (s.type === "pen") { const xs=s.points.map(p=>p.x), ys=s.points.map(p=>p.y); return { x1:Math.min(...xs), y1:Math.min(...ys), x2:Math.max(...xs), y2:Math.max(...ys) }; }
    if (s.type === "text") { const fs=s.fontSize||Math.round(cw*0.04); const tw=(s.text?.length||0)*fs*0.58; return { x1:s.x, y1:s.y, x2:s.x+tw, y2:s.y+fs }; }
    return { x1:Math.min(s.x1,s.x2), y1:Math.min(s.y1,s.y2), x2:Math.max(s.x1,s.x2), y2:Math.max(s.y1,s.y2) };
  };

  const aeHitTest = (s, px, py, cw) => {
    const M = 12;
    if (s.type === "text") { const b=aeStrokeBounds(s,cw); return px>=b.x1-M&&px<=b.x2+M&&py>=b.y1-M&&py<=b.y2+M; }
    if (s.type === "pen") { for (let i=1;i<s.points.length;i++) { if (aeDistToSeg(px,py,s.points[i-1].x,s.points[i-1].y,s.points[i].x,s.points[i].y)<M) return true; } return false; }
    if (s.type === "arrow") return aeDistToSeg(px,py,s.x1,s.y1,s.x2,s.y2)<M;
    if (s.type === "rect") { const bx1=Math.min(s.x1,s.x2),bx2=Math.max(s.x1,s.x2),by1=Math.min(s.y1,s.y2),by2=Math.max(s.y1,s.y2); return (px>=bx1-M&&px<=bx2+M&&py>=by1-M&&py<=by2+M)&&!(px>=bx1+M&&px<=bx2-M&&py>=by1+M&&py<=by2-M); }
    if (s.type === "circle") { const cx=(s.x1+s.x2)/2,cy=(s.y1+s.y2)/2,rx=Math.abs(s.x2-s.x1)/2||1,ry=Math.abs(s.y2-s.y1)/2||1; return Math.abs(Math.sqrt(((px-cx)/rx)**2+((py-cy)/ry)**2)-1)<M/Math.min(rx,ry); }
    return false;
  };

  const aeGetHandles = (b) => {
    const mx=(b.x1+b.x2)/2, my=(b.y1+b.y2)/2;
    return [
      {name:"nw",x:b.x1,y:b.y1},{name:"n",x:mx,y:b.y1},{name:"ne",x:b.x2,y:b.y1},
      {name:"e",x:b.x2,y:my},
      {name:"se",x:b.x2,y:b.y2},{name:"s",x:mx,y:b.y2},{name:"sw",x:b.x1,y:b.y2},
      {name:"w",x:b.x1,y:my},
    ];
  };

  const aeHitHandle = (s, px, py, cw) => {
    const b = aeStrokeBounds(s, cw);
    for (const h of aeGetHandles({x1:b.x1-8,y1:b.y1-8,x2:b.x2+8,y2:b.y2+8})) { if (Math.abs(px-h.x)<=9&&Math.abs(py-h.y)<=9) return h.name; }
    return null;
  };

  const aeDrawSelection = (ctx, s, cw) => {
    const b = aeStrokeBounds(s, cw);
    const PAD=8, HS=6;
    ctx.save();
    ctx.strokeStyle="#3B82F6"; ctx.lineWidth=1.5; ctx.setLineDash([5,3]);
    ctx.strokeRect(b.x1-PAD,b.y1-PAD,b.x2-b.x1+PAD*2,b.y2-b.y1+PAD*2);
    ctx.setLineDash([]);
    aeGetHandles({x1:b.x1-PAD,y1:b.y1-PAD,x2:b.x2+PAD,y2:b.y2+PAD}).forEach(h => {
      ctx.fillStyle="#fff"; ctx.fillRect(h.x-HS/2,h.y-HS/2,HS,HS);
      ctx.strokeStyle="#3B82F6"; ctx.lineWidth=1.5; ctx.strokeRect(h.x-HS/2,h.y-HS/2,HS,HS);
    });
    ctx.restore();
  };

  const aeApplyMove = (s, dx, dy) => {
    if (s.type==="pen") return {...s, points:s.points.map(p=>({x:p.x+dx,y:p.y+dy}))};
    if (s.type==="text") return {...s, x:s.x+dx, y:s.y+dy};
    return {...s, x1:s.x1+dx, y1:s.y1+dy, x2:s.x2+dx, y2:s.y2+dy};
  };

  const aeApplyResize = (s, handle, dx, dy) => {
    if (s.type==="pen") return aeApplyMove(s, dx/2, dy/2);
    if (s.type==="text") return {...s, fontSize:Math.max(8,(s.fontSize||18)-dy*0.4)};
    const n={...s};
    if (handle.includes("n")) n.y1=s.y1+dy;
    if (handle.includes("s")) n.y2=s.y2+dy;
    if (handle.includes("w")) n.x1=s.x1+dx;
    if (handle.includes("e")) n.x2=s.x2+dx;
    return n;
  };

  // ── Canvas rendering ─────────────────────────────────────────
  const redrawCanvas = (list, inProgress = null) => {
    const canvas = canvasRef.current;
    if (!canvas || !imgRef.current) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imgRef.current, 0, 0, canvas.width, canvas.height);
    list.forEach(s => { if (s.visible !== false) paintStroke(ctx, s, canvas.width); });
    if (inProgress) paintStroke(ctx, inProgress, canvas.width);
    const selId = selectedIdRef.current;
    if (selId) {
      const sel = list.find(s => s.id === selId) || (inProgress?.id === selId ? inProgress : null);
      if (sel && sel.visible !== false) aeDrawSelection(ctx, sel, canvas.width);
    }
  };

  const paintArrow = (ctx, x1, y1, x2, y2) => {
    const len = Math.hypot(x2-x1, y2-y1);
    const headLen = Math.max(14, len * 0.18);
    const angle = Math.atan2(y2-y1, x2-x1);
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2,y2);
    ctx.lineTo(x2-headLen*Math.cos(angle-Math.PI/6), y2-headLen*Math.sin(angle-Math.PI/6));
    ctx.lineTo(x2-headLen*Math.cos(angle+Math.PI/6), y2-headLen*Math.sin(angle+Math.PI/6));
    ctx.closePath(); ctx.fill();
  };

  const paintStroke = (ctx, s, cw) => {
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color;
    ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (s.type === "arrow") { paintArrow(ctx, s.x1, s.y1, s.x2, s.y2); }
    else if (s.type === "rect") { ctx.strokeRect(s.x1, s.y1, s.x2-s.x1, s.y2-s.y1); }
    else if (s.type === "circle") {
      const rx=Math.abs(s.x2-s.x1)/2, ry=Math.abs(s.y2-s.y1)/2;
      ctx.beginPath(); ctx.ellipse((s.x1+s.x2)/2,(s.y1+s.y2)/2,Math.max(rx,1),Math.max(ry,1),0,0,2*Math.PI); ctx.stroke();
    } else if (s.type === "pen") {
      if (s.points.length < 2) return;
      ctx.beginPath(); s.points.forEach((pt,i) => { if (i===0) ctx.moveTo(pt.x,pt.y); else ctx.lineTo(pt.x,pt.y); }); ctx.stroke();
    } else if (s.type === "text") {
      const fs = s.fontSize || Math.round(cw * 0.05);
      const wt = s.bold ? "bold" : "normal", st = s.italic ? "italic" : "normal";
      ctx.font = `${st} ${wt} ${fs}px system-ui,-apple-system,sans-serif`;
      ctx.fillText(s.text, s.x, s.y + fs);
    }
  };

  const getCanvasPt = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX-rect.left)*sx, y: (src.clientY-rect.top)*sy };
  };

  // ── Pointer events ───────────────────────────────────────────
  const onDown = (e) => {
    if (spaceHeldRef.current) return;
    e.preventDefault();
    const cw = canvasRef.current?.width || 1;

    if (tool === "select") {
      const pt = getCanvasPt(e);
      const list = strokesRef.current;
      if (selectedIdRef.current) {
        const sel = list.find(s => s.id === selectedIdRef.current);
        if (sel) {
          const handle = aeHitHandle(sel, pt.x, pt.y, cw);
          if (handle) { selDragRef.current = { action:"resize", handle, origStroke:{...sel, points:sel.points?[...sel.points]:undefined}, startPt:pt }; return; }
        }
      }
      for (let i = list.length-1; i >= 0; i--) {
        if (list[i].visible === false) continue;
        if (aeHitTest(list[i], pt.x, pt.y, cw)) {
          const hit = list[i];
          setSelectedId(hit.id); selectedIdRef.current = hit.id;
          if (hit.type === "text") { setTextFontSize(hit.fontSize||18); setTextBold(!!hit.bold); setTextItalic(!!hit.italic); }
          setColor(hit.color);
          selDragRef.current = { action:"move", origStroke:{...hit, points:hit.points?[...hit.points]:undefined}, startPt:pt };
          redrawCanvas(list);
          return;
        }
      }
      setSelectedId(null); selectedIdRef.current = null; selDragRef.current = null;
      redrawCanvas(list);
      return;
    }

    if (tool === "text") {
      const pt = getCanvasPt(e);
      const src = e.touches ? e.touches[0] : e;
      const areaRect = planAreaRef.current.getBoundingClientRect();
      setTextPending({ x: pt.x, y: pt.y, screenX: src.clientX - areaRect.left, screenY: src.clientY - areaRect.top });
      setTextValue("");
      setTimeout(() => textInputRef.current?.focus(), 60);
      return;
    }

    const pt = getCanvasPt(e);
    setSelectedId(null); selectedIdRef.current = null;
    setDrawing(true); setStartPt(pt); setCurrentPt(pt);
    if (tool === "pen") setPenPoints([pt]);
  };

  const onMove = (e) => {
    if (spaceHeldRef.current) return;
    e.preventDefault();
    if (tool === "select") {
      if (!selDragRef.current) return;
      const pt = getCanvasPt(e);
      const drag = selDragRef.current;
      const dx = pt.x-drag.startPt.x, dy = pt.y-drag.startPt.y;
      const updated = drag.action==="move" ? aeApplyMove(drag.origStroke,dx,dy) : aeApplyResize(drag.origStroke,drag.handle,dx,dy);
      drag.currentStroke = updated;
      redrawCanvas(strokesRef.current.map(s => s.id===updated.id ? updated : s));
      return;
    }
    if (!drawing) return;
    const pt = getCanvasPt(e);
    setCurrentPt(pt);
    if (tool === "pen") {
      setPenPoints(prev => { const pts=[...prev,pt]; redrawCanvas(strokesRef.current, {type:"pen",color,points:pts}); return pts; });
    } else {
      redrawCanvas(strokesRef.current, {type:tool,color,x1:startPt.x,y1:startPt.y,x2:pt.x,y2:pt.y});
    }
  };

  const onUp = (e) => {
    if (spaceHeldRef.current) return;
    e.preventDefault();
    if (tool === "select") {
      const drag = selDragRef.current;
      if (drag?.currentStroke) {
        const updated = drag.currentStroke;
        setStrokes(prev => prev.map(s => s.id===updated.id ? updated : s));
      }
      selDragRef.current = null;
      return;
    }
    if (!drawing) return;
    setDrawing(false);
    let stroke;
    if (tool === "pen") {
      if (penPoints.length < 2) { setPenPoints([]); return; }
      stroke = { id:genId(), visible:true, type:"pen", color, points:penPoints };
      setPenPoints([]);
    } else {
      const pt = currentPt || startPt;
      if (!pt || (Math.abs(pt.x-startPt.x)<3 && Math.abs(pt.y-startPt.y)<3)) { redrawCanvas(strokesRef.current); return; }
      stroke = { id:genId(), visible:true, type:tool, color, x1:startPt.x, y1:startPt.y, x2:pt.x, y2:pt.y };
    }
    const id = stroke.id;
    setStrokes(prev => [...prev, stroke]);
    setSelectedId(id); selectedIdRef.current = id;
  };

  const confirmText = () => {
    if (!textPending || !textValue.trim()) { setTextPending(null); setTextValue(""); return; }
    const stroke = { id:genId(), visible:true, type:"text", color, x:textPending.x, y:textPending.y, text:textValue.trim(), fontSize:textFontSize, bold:textBold, italic:textItalic };
    const id = stroke.id;
    setStrokes(prev => [...prev, stroke]);
    setSelectedId(id); selectedIdRef.current = id;
    setTextPending(null); setTextValue("");
  };

  // ── Layer helpers ────────────────────────────────────────────
  const undoStroke = () => { setStrokes(prev => prev.slice(0,-1)); setSelectedId(null); selectedIdRef.current = null; };
  const clearStrokes = () => { setStrokes([]); setSelectedId(null); selectedIdRef.current = null; };
  const deleteLayerStroke = (idx) => { if (strokes[idx]?.id===selectedId) { setSelectedId(null); selectedIdRef.current=null; } setStrokes(prev => prev.filter((_,i)=>i!==idx)); };
  const toggleLayerVisibility = (id) => setStrokes(prev => prev.map(s => s.id===id ? {...s, visible:s.visible===false} : s));
  const reorderLayerStrokes = (from, to) => setStrokes(prev => { const arr=[...prev]; const [item]=arr.splice(from,1); arr.splice(to,0,item); return arr; });

  // Save: bake drawing strokes into the image (remarks persist as live data,
  // so we never burn them into the pixels).
  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSave(canvas.toDataURL("image/jpeg", 0.92));
  };

  return (
    <div style={{ position:"fixed", inset:0, background:BG, zIndex:300, display:"flex", flexDirection:"column" }}>

      {/* ── Header ── */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 16px", background:WH, borderBottom:`1px solid ${SBB}`, flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:15, fontWeight:700, color:TX }}>{t("photoAnno.title")}</span>
          <span style={{ fontSize:11, color:TX3, fontWeight:500 }}>{strokes.length + photoRemarks.length} annotation{(strokes.length + photoRemarks.length) !== 1 ? "s" : ""}</span>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <button onClick={handleSave}
            style={{ padding:"7px 16px", border:"none", borderRadius:7, background:AC, color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", gap:6 }}>
            <Ico name="check" size={14} color="#fff" />{t("save")}
          </button>
          <button onClick={onClose} style={{ padding:"7px 18px", border:"none", borderRadius:8, background:TX, color:"#fff", fontWeight:600, fontSize:13, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
            {t("close")}
          </button>
        </div>
      </div>

      {/* ── Body : sidebar + image ── */}
      <div style={{ flex:1, display:"flex", overflow:"hidden" }}>

        {/* ── Sidebar ── */}
        <div style={{ width:210, flexShrink:0, background:SB, borderRight:`1px solid ${SBB}`, display:"flex", flexDirection:"column", overflowY:"auto" }}>

          {/* Sélecteur de mode */}
          <div style={{ padding:"10px 10px 0", flexShrink:0, borderBottom:`1px solid ${SBB}`, paddingBottom:10 }}>
            <div style={{ display:"flex", background:SB2, borderRadius:8, padding:3 }}>
              {[
                { id:"vue",      label:t("photoAnno.modeView"),   icon:"eye"    },
                { id:"marqueur", label:t("photoAnno.modeMarker"), icon:"mappin" },
                { id:"dessin",   label:t("photoAnno.modeDraw"),   icon:"pen2"   },
              ].map(m => (
                <button key={m.id} onClick={() => switchMode(m.id)}
                  style={{ flex:1, padding:"6px 2px", border:"none", borderRadius:6, background:mode===m.id?WH:"transparent", color:mode===m.id?TX:TX3, fontWeight:mode===m.id?700:400, fontSize:10, cursor:"pointer", fontFamily:"inherit", boxShadow:mode===m.id?"0 1px 2px rgba(0,0,0,0.08)":"none", display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                  <Ico name={m.icon} size={13} color={mode===m.id?AC:TX3} />
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── MODE VUE ── */}
          {mode === "vue" && (
            <div style={{ padding:"12px 12px 14px", flex:1 }}>
              <div style={{ display:"flex", gap:6, marginBottom:14 }}>
                <div style={{ flex:1, background:WH, border:`1px solid ${SBB}`, borderRadius:8, padding:"8px 6px", textAlign:"center" }}>
                  <div style={{ fontSize:20, fontWeight:700, color:AC, lineHeight:1 }}>{photoRemarks.length}</div>
                  <div style={{ fontSize:9, color:TX3, marginTop:3, fontWeight:500 }}>remarque{photoRemarks.length !== 1 ? "s" : ""}</div>
                </div>
                <div style={{ flex:1, background:WH, border:`1px solid ${SBB}`, borderRadius:8, padding:"8px 6px", textAlign:"center" }}>
                  <div style={{ fontSize:20, fontWeight:700, color:TX2, lineHeight:1 }}>{strokes.length}</div>
                  <div style={{ fontSize:9, color:TX3, marginTop:3, fontWeight:500 }}>dessin{strokes.length !== 1 ? "s" : ""}</div>
                </div>
              </div>

              {photoRemarks.length > 0 && (
                <>
                  <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", color:TX3, marginBottom:8 }}>Remarques</div>
                  {photoRemarks.map((r, i) => {
                    const st = getRemarkStatus(r.status);
                    return (
                      <div key={r.id}
                        onClick={() => setEditingRemark(r)}
                        style={{ display:"flex", alignItems:"center", gap:7, padding:"6px 0", borderBottom:`1px solid ${SB2}`, cursor:"pointer" }}>
                        <div style={{ width:22, height:22, borderRadius:"50%", background:st.dot, color:"#fff", fontSize:10, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{i + 1}</div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:11, color:TX, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontWeight:500 }}>{r.text || "(sans texte)"}</div>
                          <div style={{ fontSize:10, color:TX3 }}>{r.date || "—"}</div>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); deleteRemark(r.id); }} style={{ background:"none", border:"none", cursor:"pointer", padding:2, flexShrink:0, opacity:0.4 }}><Ico name="trash" size={11} color={TX3} /></button>
                      </div>
                    );
                  })}
                </>
              )}

              {strokes.length > 0 && (
                <>
                  <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", color:TX3, marginBottom:8, marginTop:photoRemarks.length > 0 ? 14 : 0 }}>Annotations</div>
                  {strokes.map((s, idx) => {
                    const toolDef = ANNO_TOOLS.find(t => t.id === s.type);
                    return (
                      <div key={idx} style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 0", borderBottom:`1px solid ${SB2}` }}>
                        <div style={{ width:7, height:7, borderRadius:"50%", background:s.color, border:"1px solid rgba(0,0,0,0.08)", flexShrink:0 }} />
                        <Ico name={toolDef?.icon || "pen2"} size={11} color={TX3} />
                        <span style={{ fontSize:11, color:TX2, flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          {s.type === "text" ? `"${s.text}"` : toolDef?.label || s.type}
                        </span>
                        <button onClick={() => deleteLayerStroke(idx)} style={{ background:"none", border:"none", cursor:"pointer", padding:2, flexShrink:0, opacity:0.4 }}><Ico name="trash" size={11} color={TX3} /></button>
                      </div>
                    );
                  })}
                </>
              )}

              {photoRemarks.length === 0 && strokes.length === 0 && (
                <div style={{ padding:"14px 6px", textAlign:"center", color:TX3, fontSize:11, lineHeight:1.7 }}>{t("photoAnno.noAnnotation")}</div>
              )}
            </div>
          )}

          {/* ── MODE MARQUEUR (remarques localisées sur la photo) ── */}
          {mode === "marqueur" && (
            <div style={{ padding:"12px 12px 14px" }}>
              <div style={{ padding:"8px 10px", background:ACL, border:`1px solid ${ACL2}`, borderRadius:7, fontSize:11, color:AC, fontWeight:500, display:"flex", alignItems:"center", gap:6, marginBottom:14 }}>
                <Ico name="mappin" size={12} color={AC} />
                Cliquez sur la photo pour ajouter une remarque
              </div>

              {photoRemarks.length > 0 && (
                <>
                  <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", color:TX3, marginBottom:8 }}>Remarques · {photoRemarks.length}</div>
                  {photoRemarks.map((r, i) => {
                    const st = getRemarkStatus(r.status);
                    return (
                      <div key={r.id}
                        onClick={() => setEditingRemark(r)}
                        style={{ display:"flex", alignItems:"center", gap:7, padding:"6px 0", borderBottom:`1px solid ${SB2}`, cursor:"pointer" }}>
                        <div style={{ width:22, height:22, borderRadius:"50%", background:st.dot, color:"#fff", fontSize:10, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{i + 1}</div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:11, color:TX, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontWeight:500 }}>{r.text || "(sans texte)"}</div>
                          <div style={{ fontSize:10, color:TX3 }}>{r.date || "—"}</div>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); deleteRemark(r.id); }} style={{ background:"none", border:"none", cursor:"pointer", padding:2, flexShrink:0 }}><Ico name="trash" size={11} color={TX3} /></button>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {/* ── MODE DESSIN ── */}
          {mode === "dessin" && (
            <div style={{ padding:"12px 12px 14px" }}>
              {/* Outils */}
              <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", color:TX3, marginBottom:8 }}>{t("anno.tool")}</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:3, marginBottom:14 }}>
                {ANNO_TOOLS.map(t => {
                  const active = tool === t.id;
                  return (
                    <button key={t.id} title={t.label}
                      onClick={() => { setTool(t.id); if (t.id!=="select") { setSelectedId(null); selectedIdRef.current=null; redrawCanvas(strokesRef.current); } }}
                      style={{ padding:`${SP.sm+2}px ${SP.xs}px ${SP.sm}px`, border:`1.5px solid ${active?AC:SBB}`, borderRadius:RAD.md, background:active?ACL:WH, cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:SP.xs, fontFamily:"inherit", boxShadow:active?"none":"0 1px 2px rgba(0,0,0,0.04)", minHeight:44 }}>
                      <Ico name={t.icon} size={16} color={active?AC:TX2} />
                      <span style={{ fontSize:FS.xs, fontWeight:active?700:500, color:active?AC:TX3, letterSpacing:"0.01em", lineHeight:1 }}>{t.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Couleur */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", color:TX3 }}>{t("anno.color")}</div>
                <div style={{ width:16, height:16, borderRadius:4, background:color, border:"1px solid rgba(0,0,0,0.12)", flexShrink:0 }} />
              </div>
              <div style={{ display:"flex", gap:5, alignItems:"center", marginBottom:14 }}>
                {ANNO_COLORS.map(c => (
                  <button key={c} title={c}
                    onClick={() => {
                      setColor(c);
                      if (tool==="select" && selectedId) {
                        const sel = strokesRef.current.find(s=>s.id===selectedId);
                        if (sel) setStrokes(prev=>prev.map(s=>s.id===selectedId?{...s,color:c}:s));
                      }
                    }}
                    style={{ width:22, height:22, borderRadius:"50%", background:c, border:color===c?`2.5px solid ${AC}`:"1.5px solid rgba(0,0,0,0.12)", cursor:"pointer", boxShadow:color===c?`0 0 0 2px ${ACL}`:"none", outline:"none", flexShrink:0 }}
                  />
                ))}
                {/* Pipette / color picker */}
                <button onClick={pickColorFromImage} title={t("anno.pipette")} style={{ width:22, height:22, borderRadius:"50%", border:`1.5px solid ${SBB}`, background:WH, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, padding:0 }}>
                  <Ico name="pipette" size={12} color={TX2} />
                </button>
                <input ref={colorPickerRef} type="color" value={color}
                  onChange={e => {
                    const c = e.target.value;
                    setColor(c);
                    if (tool==="select" && selectedId) {
                      setStrokes(prev => prev.map(s => s.id===selectedId ? {...s, color:c} : s));
                    }
                  }}
                  style={{ width:0, height:0, padding:0, border:"none", opacity:0, position:"absolute", pointerEvents:"none" }}
                />
              </div>

              {/* Propriétés texte */}
              {(tool==="text" || (tool==="select" && strokes.find(s=>s.id===selectedId)?.type==="text")) && (
                <div style={{ marginBottom:14 }}>
                  <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", color:TX3, marginBottom:7 }}>{t("anno.sizeStyle")}</div>
                  <div style={{ display:"flex", gap:3, marginBottom:6 }}>
                    {[12,16,22,32,48].map(sz => (
                      <button key={sz}
                        onClick={() => {
                          setTextFontSize(sz);
                          if (tool==="select" && selectedId) {
                            const sel = strokesRef.current.find(s=>s.id===selectedId);
                            if (sel?.type==="text") setStrokes(prev=>prev.map(s=>s.id===selectedId?{...s,fontSize:sz}:s));
                          }
                        }}
                        style={{ flex:1, padding:"4px 1px", border:`1.5px solid ${textFontSize===sz?AC:SBB}`, borderRadius:5, background:textFontSize===sz?ACL:WH, cursor:"pointer", fontSize:Math.max(7,Math.min(11,sz*0.42)), fontWeight:600, color:textFontSize===sz?AC:TX3, fontFamily:"inherit" }}
                      >{sz}</button>
                    ))}
                  </div>
                  <div style={{ display:"flex", gap:4 }}>
                    <button
                      onClick={() => {
                        const next=!textBold;
                        setTextBold(next);
                        if (tool==="select" && selectedId) { const sel=strokesRef.current.find(s=>s.id===selectedId); if (sel?.type==="text") setStrokes(prev=>prev.map(s=>s.id===selectedId?{...s,bold:next}:s)); }
                      }}
                      style={{ flex:1, padding:"6px 0", border:`1.5px solid ${textBold?AC:SBB}`, borderRadius:6, background:textBold?ACL:WH, cursor:"pointer", fontWeight:800, fontSize:13, color:textBold?AC:TX2, fontFamily:"inherit" }}>B</button>
                    <button
                      onClick={() => {
                        const next=!textItalic;
                        setTextItalic(next);
                        if (tool==="select" && selectedId) { const sel=strokesRef.current.find(s=>s.id===selectedId); if (sel?.type==="text") setStrokes(prev=>prev.map(s=>s.id===selectedId?{...s,italic:next}:s)); }
                      }}
                      style={{ flex:1, padding:"6px 0", border:`1.5px solid ${textItalic?AC:SBB}`, borderRadius:6, background:textItalic?ACL:WH, cursor:"pointer", fontStyle:"italic", fontWeight:700, fontSize:13, color:textItalic?AC:TX2, fontFamily:"inherit" }}>I</button>
                  </div>
                </div>
              )}

              {/* Calques */}
              <div style={{ height:1, background:SBB, marginBottom:10 }} />
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:strokes.length>0?6:0 }}>
                <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", color:TX3, display:"flex", alignItems:"center", gap:5 }}>
                  <Ico name="layers" size={11} color={TX3} />{t("anno.layers")} · {strokes.length}
                </div>
                {strokes.length > 0 && (
                  <div style={{ display:"flex", gap:2 }}>
                    <button onClick={undoStroke} title={t("anno.undoLast")} style={{ background:"none", border:"none", cursor:"pointer", padding:"3px 5px", borderRadius:5 }}><Ico name="undo" size={12} color={TX2} /></button>
                    <button onClick={clearStrokes} title={t("anno.clearAll")} style={{ background:"none", border:"none", cursor:"pointer", padding:"3px 5px", borderRadius:5 }}><Ico name="trash" size={12} color={RD} /></button>
                  </div>
                )}
              </div>
              {strokes.length===0 && (
                <div style={{ fontSize:11, color:DIST, padding:"18px 6px 10px", textAlign:"center" }}>{t("anno.noDrawing")}</div>
              )}
              {[...strokes].reverse().map((s, revIdx) => {
                const actualIdx = strokes.length-1-revIdx;
                const toolDef = ANNO_TOOLS.find(t=>t.id===s.type);
                const isSel = s.id === selectedId;
                const isHidden = s.visible === false;
                return (
                  <div key={s.id||actualIdx}
                    draggable
                    onDragStart={e=>{ e.dataTransfer.setData("text/plain",String(actualIdx)); e.dataTransfer.effectAllowed="move"; }}
                    onDragOver={e=>e.preventDefault()}
                    onDrop={e=>{ e.preventDefault(); const from=parseInt(e.dataTransfer.getData("text/plain")); if (from!==actualIdx) reorderLayerStrokes(from,actualIdx); }}
                    onClick={() => {
                      setTool("select");
                      setSelectedId(s.id); selectedIdRef.current=s.id;
                      if (s.type==="text") { setTextFontSize(s.fontSize||18); setTextBold(!!s.bold); setTextItalic(!!s.italic); }
                      setColor(s.color);
                      redrawCanvas(strokesRef.current);
                    }}
                    style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 4px", borderRadius:5, marginBottom:1, background:isSel?ACL:"transparent", border:`1px solid ${isSel?ACL2:"transparent"}`, cursor:"pointer", opacity:isHidden?0.4:1 }}
                  >
                    <div style={{ cursor:"grab", color:DIST, fontSize:10, lineHeight:1, paddingRight:1, flexShrink:0 }}>⠿</div>
                    <div style={{ width:7, height:7, borderRadius:"50%", background:s.color, border:"1px solid rgba(0,0,0,0.1)", flexShrink:0 }} />
                    <Ico name={toolDef?.icon||"pen2"} size={10} color={isSel?AC:TX3} />
                    <span style={{ fontSize:10.5, color:isSel?AC:TX2, flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontWeight:isSel?600:400 }}>
                      {s.type==="text"?`"${s.text}"`:toolDef?.label||s.type}
                    </span>
                    <button onClick={e=>{ e.stopPropagation(); toggleLayerVisibility(s.id); }} title={isHidden?t("anno.show"):t("anno.hide")}
                      style={{ background:"none", border:"none", cursor:"pointer", padding:2, flexShrink:0, opacity:isHidden?0.4:0.6 }}>
                      <Ico name={isHidden?"eye-off":"eye"} size={10} color={TX3} />
                    </button>
                    <button onClick={e=>{ e.stopPropagation(); if (isSel) { setSelectedId(null); selectedIdRef.current=null; } deleteLayerStroke(actualIdx); }}
                      style={{ background:"none", border:"none", cursor:"pointer", padding:2, flexShrink:0, opacity:0.4 }}>
                      <Ico name="trash" size={10} color={TX3} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Image area (zoomable + pannable) ── */}
        <div
          ref={planAreaRef}
          style={{ flex:1, position:"relative", overflow:"hidden", background:"#ECEAE6", cursor:getCursor() }}
          onMouseDown={onAreaDown}
          onMouseMove={onAreaMove}
          onMouseUp={onAreaUp}
          onMouseLeave={onAreaUp}
        >
          {/* Image transformée (zoom + pan) */}
          <div
            ref={containerRef}
            onClick={handlePlanClick}
            style={{ position:"absolute", top:0, left:0, transformOrigin:"0 0", transform:`translate(${vp.panX}px,${vp.panY}px) scale(${vp.zoom})`, boxShadow:"0 4px 24px rgba(0,0,0,0.15)", borderRadius:6, overflow:"hidden", userSelect:"none" }}
          >
            {imgBase.w > 0 && (
              <img src={getPhotoUrl(photo)} alt="Photo" style={{ display:"block", width:imgBase.w, height:imgBase.h }} />
            )}

            {/* Canvas annotation overlay */}
            <canvas
              ref={canvasRef}
              style={{ position:"absolute", inset:0, width:"100%", height:"100%", pointerEvents:(mode==="dessin" && !textPending && !spaceHeld)?"auto":"none", cursor:tool==="select"?"default":tool==="text"?"text":"crosshair", touchAction:"none" }}
              onMouseDown={mode==="dessin"?onDown:undefined}
              onMouseMove={mode==="dessin"?onMove:undefined}
              onMouseUp={mode==="dessin"?onUp:undefined}
              onMouseLeave={mode==="dessin"?onUp:undefined}
              onTouchStart={mode==="dessin"?onDown:undefined}
              onTouchMove={mode==="dessin"?onMove:undefined}
              onTouchEnd={mode==="dessin"?onUp:undefined}
            />

            {/* Remarques localisées — pins interactifs (drag / hover / click) */}
            {photoRemarks.map((r, idx) => {
              const st = getRemarkStatus(r.status);
              const isHover = hoverPinId === r.id;
              const onPinDown = (e) => {
                if (mode !== "marqueur" || spaceHeldRef.current) return;
                e.stopPropagation(); e.preventDefault();
                const parent = e.currentTarget.parentElement; // the plan area
                const rect = parent.getBoundingClientRect();
                dragPinRef.current = { id: r.id, moved: false, rect };
                const startX = e.touches?.[0]?.clientX ?? e.clientX;
                const startY = e.touches?.[0]?.clientY ?? e.clientY;
                const onMoveEv = (ev) => {
                  const t = ev.touches?.[0] || ev;
                  if (Math.abs(t.clientX - startX) + Math.abs(t.clientY - startY) > 3) dragPinRef.current.moved = true;
                  const nx = Math.max(1, Math.min(99, ((t.clientX - rect.left) / rect.width) * 100));
                  const ny = Math.max(1, Math.min(99, ((t.clientY - rect.top) / rect.height) * 100));
                  moveRemark(r.id, nx, ny);
                };
                const onUpEv = () => {
                  window.removeEventListener("mousemove", onMoveEv);
                  window.removeEventListener("mouseup", onUpEv);
                  window.removeEventListener("touchmove", onMoveEv);
                  window.removeEventListener("touchend", onUpEv);
                };
                window.addEventListener("mousemove", onMoveEv);
                window.addEventListener("mouseup", onUpEv);
                window.addEventListener("touchmove", onMoveEv, { passive: false });
                window.addEventListener("touchend", onUpEv);
              };
              const onPinClick = (e) => {
                e.stopPropagation();
                if (dragPinRef.current?.moved) { dragPinRef.current = null; return; }
                setEditingRemark(r);
              };
              return (
                <div key={r.id}
                  onMouseDown={onPinDown} onTouchStart={onPinDown}
                  onClick={onPinClick}
                  onMouseEnter={() => setHoverPinId(r.id)}
                  onMouseLeave={() => setHoverPinId((c) => c === r.id ? null : c)}
                  style={{
                    position: "absolute", left: `${r.x}%`, top: `${r.y}%`,
                    transform: "translate(-50%, -100%)", zIndex: isHover ? 15 : 10,
                    cursor: mode === "marqueur" ? "grab" : "pointer", touchAction: "none",
                  }}
                >
                  <div style={{
                    width: 30, height: 30, borderRadius: "50%",
                    background: st.dot, color: "#fff", fontSize: 11, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    border: `2.5px solid ${WH}`,
                    boxShadow: isHover ? "0 4px 16px rgba(0,0,0,0.35)" : "0 2px 10px rgba(0,0,0,0.35)",
                    transition: "box-shadow 0.15s ease", position: "relative",
                  }}>
                    {idx + 1}
                    {r.urgent && (
                      <div style={{ position: "absolute", top: -3, right: -3, width: 10, height: 10, borderRadius: "50%", background: RD, border: `2px solid ${WH}` }} />
                    )}
                  </div>
                  <div style={{ width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: `7px solid ${st.dot}`, margin: "0 auto" }} />

                  {isHover && !dragPinRef.current?.moved && (
                    <div onMouseDown={(e) => e.stopPropagation()}
                      style={{
                        position: "absolute", bottom: "calc(100% + 12px)", left: "50%",
                        transform: "translateX(-50%)", zIndex: 20,
                        background: WH, border: `1px solid ${SBB}`, borderRadius: RAD.lg,
                        padding: "10px 12px", minWidth: 200, maxWidth: 280,
                        boxShadow: "0 8px 24px rgba(0,0,0,0.15)", pointerEvents: "none",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <div style={{ padding: "2px 8px", background: st.bg, borderRadius: RAD.sm, fontSize: 10, fontWeight: 700, color: st.color, textTransform: "uppercase", letterSpacing: "0.05em" }}>{st.label}</div>
                        {r.urgent && <div style={{ padding: "2px 8px", background: "#FEF2F2", color: RD, fontSize: 10, fontWeight: 700, borderRadius: RAD.sm, textTransform: "uppercase", letterSpacing: "0.05em" }}>Urgent</div>}
                      </div>
                      <div style={{ fontSize: FS.sm, color: TX, fontWeight: 500, lineHeight: 1.4, marginBottom: 4 }}>
                        {r.text ? (r.text.length > 120 ? r.text.slice(0, 120) + "…" : r.text) : <span style={{ fontStyle: "italic", color: TX3 }}>(sans texte)</span>}
                      </div>
                      <div style={{ fontSize: FS.xs, color: TX3 }}>{r.date || "—"}</div>
                      {r.photos?.length > 0 && (
                        <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                          {r.photos.slice(0, 4).map((ph, i) => (
                            <img key={i} src={getPhotoUrl(ph)} alt="" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 4, border: `1px solid ${SBB}` }} />
                          ))}
                          {r.photos.length > 4 && (
                            <div style={{ width: 36, height: 36, borderRadius: 4, background: SB, border: `1px solid ${SBB}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: TX3, fontWeight: 600 }}>+{r.photos.length - 4}</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Saisie texte */}
          {textPending && (
            <div style={{ position:"absolute", left:textPending.screenX, top:textPending.screenY, zIndex:30, pointerEvents:"auto" }}
              onMouseDown={e => e.stopPropagation()}>
              <input
                ref={textInputRef}
                value={textValue}
                onChange={e => {
                  const v=e.target.value; setTextValue(v);
                  redrawCanvas(strokesRef.current, v?{type:"text",color,x:textPending.x,y:textPending.y,text:v,fontSize:textFontSize,bold:textBold,italic:textItalic}:null);
                }}
                onKeyDown={e=>{ if (e.key==="Enter") confirmText(); if (e.key==="Escape") { redrawCanvas(strokesRef.current); setTextPending(null); setTextValue(""); } }}
                placeholder="Texte…"
                style={{ border:`2px solid ${color}`, borderRadius:5, background:"rgba(255,255,255,0.93)", color, fontSize:textFontSize*vp.zoom, fontWeight:textBold?700:400, fontStyle:textItalic?"italic":"normal", fontFamily:"system-ui,-apple-system,sans-serif", padding:"5px 10px", minWidth:90, maxWidth:280, outline:"none", boxShadow:"0 3px 16px rgba(0,0,0,0.22)", backdropFilter:"blur(4px)", display:"block" }}
              />
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.9)", background:"rgba(0,0,0,0.55)", padding:"2px 6px", borderRadius:"0 0 4px 4px", textAlign:"center", backdropFilter:"blur(3px)" }}>↵ Valider · Esc Annuler</div>
            </div>
          )}

          {/* Bannières mode actif */}
          {mode === "marqueur" && (
            <div style={{ position:"absolute", top:14, left:"50%", transform:"translateX(-50%)", background:"rgba(217,123,13,0.92)", color:"#fff", fontSize:11, fontWeight:600, padding:"5px 14px 5px 10px", borderRadius:20, pointerEvents:"none", whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:6, backdropFilter:"blur(4px)", zIndex:20 }}>
              <Ico name="mappin" size={12} color="#fff" />Cliquez pour ajouter une remarque
            </div>
          )}
          {mode === "dessin" && !textPending && tool !== "select" && (
            <div style={{ position:"absolute", top:14, left:"50%", transform:"translateX(-50%)", background:"rgba(29,29,27,0.78)", color:"#fff", fontSize:11, fontWeight:600, padding:"5px 14px 5px 10px", borderRadius:20, pointerEvents:"none", whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:6, backdropFilter:"blur(4px)", zIndex:20 }}>
              <Ico name={ANNO_TOOLS.find(at => at.id === tool)?.icon || "pen2"} size={12} color="#fff" />
              {ANNO_TOOLS.find(at => at.id === tool)?.label}
              {spaceHeld && <span style={{ opacity:0.65, fontWeight:400, marginLeft:2 }}>· Navigation</span>}
            </div>
          )}
          {mode === "dessin" && tool === "select" && !selectedId && !spaceHeld && strokes.length > 0 && (
            <div style={{ position:"absolute", top:14, left:"50%", transform:"translateX(-50%)", background:"rgba(29,29,27,0.55)", color:"#fff", fontSize:11, fontWeight:500, padding:"4px 12px", borderRadius:20, pointerEvents:"none", whiteSpace:"nowrap", backdropFilter:"blur(4px)", zIndex:20 }}>
              {t("anno.clickToSelect")}
            </div>
          )}

          {/* Contrôles zoom */}
          <div style={{ position:"absolute", bottom:16, right:16, zIndex:20, display:"flex", alignItems:"center", gap:2, background:"rgba(255,255,255,0.94)", backdropFilter:"blur(8px)", border:`1px solid ${SBB}`, borderRadius:22, padding:"4px 6px", boxShadow:"0 2px 12px rgba(0,0,0,0.10)" }}>
            <button onClick={() => zoomBy(1/1.4)} title="Zoom arrière" style={{ width:27, height:27, border:"none", borderRadius:6, background:"transparent", cursor:"pointer", fontSize:17, fontWeight:300, color:TX2, display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1, fontFamily:"inherit" }}>−</button>
            <span style={{ fontSize:10, color:TX3, fontWeight:600, minWidth:36, textAlign:"center" }}>{Math.round(vp.zoom * 100)}%</span>
            <button onClick={() => zoomBy(1.4)} title="Zoom avant" style={{ width:27, height:27, border:"none", borderRadius:6, background:"transparent", cursor:"pointer", fontSize:17, fontWeight:300, color:TX2, display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1, fontFamily:"inherit" }}>+</button>
          </div>
        </div>
      </div>

      {/* Remark create / edit modal — opens from photo click or pin click */}
      {editingRemark && (
        <RemarkEditModal
          initial={editingRemark.id ? editingRemark : null}
          posts={project?.posts || [{ id: postId, label: "Photo" }]}
          defaultPostId={postId}
          onSave={(r) => saveRemark({ ...r, x: r.x ?? editingRemark.x, y: r.y ?? editingRemark.y })}
          onDelete={editingRemark.id ? () => deleteRemark(editingRemark.id) : undefined}
          onClose={() => setEditingRemark(null)}
        />
      )}
    </div>
  );
}
