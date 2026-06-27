import { jsPDF } from "jspdf";
import { getPhotoUrl } from "../db";
import { hasFeature } from "../constants/config";

export const hexToRgb = (hex) => {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
};

// Composite plan image + annotation strokes + markers on an off-screen canvas
export const compositePlanImage = (project) => new Promise((resolve) => {
  if (!project.planImage) return resolve(null);
  const img = new Image();
  img.onload = () => {
    const maxW  = 1200;
    const scale = img.naturalWidth > maxW ? maxW / img.naturalWidth : 1;
    const cw    = Math.round(img.naturalWidth  * scale);
    const ch    = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext("2d");

    // Draw base plan
    ctx.drawImage(img, 0, 0, cw, ch);

    // Draw annotation strokes
    (project.planStrokes || []).forEach((s) => {
      ctx.strokeStyle = s.color; ctx.fillStyle = s.color;
      ctx.lineWidth = Math.max(3, cw * 0.003);
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      if (s.type === "arrow") {
        const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
        const hl  = Math.max(16, len * 0.18);
        const ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
        ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(s.x2, s.y2);
        ctx.lineTo(s.x2 - hl * Math.cos(ang - Math.PI / 6), s.y2 - hl * Math.sin(ang - Math.PI / 6));
        ctx.lineTo(s.x2 - hl * Math.cos(ang + Math.PI / 6), s.y2 - hl * Math.sin(ang + Math.PI / 6));
        ctx.closePath(); ctx.fill();
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
        const fs = Math.round(cw * 0.04);
        ctx.font = `bold ${fs}px system-ui, -apple-system, sans-serif`;
        ctx.fillText(s.text, s.x, s.y + fs);
      }
    });

    // Draw markers (pin = circle + triangle + number)
    const r = Math.max(14, cw * 0.018);
    (project.planMarkers || []).forEach((m) => {
      const mx = (m.x / 100) * cw;
      const my = (m.y / 100) * ch;
      const cy = my - r * 1.4;
      // Shadow
      ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
      // Circle fill
      ctx.fillStyle = "#B85C2C";
      ctx.beginPath(); ctx.arc(mx, cy, r, 0, 2 * Math.PI); ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      // White border
      ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(2, r * 0.18);
      ctx.beginPath(); ctx.arc(mx, cy, r, 0, 2 * Math.PI); ctx.stroke();
      // Triangle pointer
      ctx.fillStyle = "#B85C2C";
      ctx.beginPath();
      ctx.moveTo(mx - r * 0.45, cy + r * 0.55);
      ctx.lineTo(mx + r * 0.45, cy + r * 0.55);
      ctx.lineTo(mx, my - r * 0.05);
      ctx.closePath(); ctx.fill();
      // Number
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${Math.round(r * 1.15)}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(m.number), mx, cy);
    });

    resolve({ dataUrl: canvas.toDataURL("image/jpeg", 0.92), w: cw, h: ch });
  };
  img.onerror = () => resolve(null);
  img.src = project.planImage;
});

export async function generatePDF(project, pvNum, date, result, profile, options) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, H = 297;
  const ML = 18, MR = 18;
  const CW = W - ML - MR; // 174 mm

  const AMBER  = hexToRgb(profile?.pdfColor || "#B85C2C");
  const font   = profile?.pdfFont || "helvetica";
  const DARK   = [29, 29, 27];
  const GRAY   = [107, 107, 102];
  const LGRAY  = [226, 225, 221];
  const BGGRAY = [247, 246, 244];
  const RED    = [196, 57, 42];
  const REDBG  = [254, 242, 242];

  let y = 0;

  const checkY = (needed = 12) => {
    if (y + needed > H - 20) {
      doc.addPage();
      y = 22;
    }
  };

  const imgFmt = (dataUrl) => {
    if (dataUrl.startsWith("data:image/png")) return "PNG";
    if (dataUrl.startsWith("data:image/webp")) return "WEBP";
    return "JPEG";
  };

  // ── HEADER PAGE 1 ──────────────────────────────────────────
  doc.setFillColor(...AMBER);
  doc.rect(0, 0, W, 11, "F");

  y = 19;

  // Custom logo is a Team feature — Pro/Free PDFs skip the logo image
  // and lean on the structure name in the header instead.
  if (profile?.picture && hasFeature(profile?.plan, "pdfCustomLogo")) {
    try { doc.addImage(profile.picture, imgFmt(profile.picture), W - MR - 22, 13, 22, 22); } catch (_) { /* ignore */ }
  }

  const bureauName = profile?.structure || "ArchiPilot";
  doc.setFont(font, "bold");
  doc.setFontSize(14);
  doc.setTextColor(...DARK);
  doc.text(bureauName, ML, y);
  y += 5.5;

  doc.setFont(font, "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY);
  const contactParts = [profile?.phone, profile?.email].filter(Boolean).join("   ");
  if (profile?.address) { doc.text(profile.address, ML, y); y += 4.5; }
  if (contactParts)      { doc.text(contactParts, ML, y);   y += 4.5; }

  y = Math.max(y, 40);
  doc.setDrawColor(...LGRAY);
  doc.setLineWidth(0.4);
  doc.line(ML, y, W - MR, y);
  y += 9;

  // ── PV TITRE ───────────────────────────────────────────────
  doc.setFont(font, "bold");
  doc.setFontSize(22);
  doc.setTextColor(...AMBER);
  doc.text(`PROCE\u0300S-VERBAL N\u00B0${pvNum}`, ML, y);
  y += 7;

  doc.setFont(font, "normal");
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text(`Re\u0301union de chantier du ${date}`, ML, y);
  y += 9;

  // ── FICHE PROJET ───────────────────────────────────────────
  doc.setFillColor(...BGGRAY);
  doc.rect(ML, y, CW, 28, "F");

  const bY = y + 5;
  const c1 = ML + 5, c2 = ML + 62, c3 = ML + 120;

  doc.setFont(font, "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY);
  doc.text("CHANTIER", c1, bY);
  doc.text("MA\u00CETRE D'OUVRAGE", c2, bY);
  doc.text("ENTREPRISE", c3, bY);

  doc.setFont(font, "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...DARK);
  const splitProject = doc.splitTextToSize(project.name, 54);
  doc.text(splitProject, c1, bY + 5);
  doc.text(doc.splitTextToSize(project.client, 54), c2, bY + 5);
  doc.text(doc.splitTextToSize(project.contractor, 46), c3, bY + 5);

  doc.setFont(font, "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY);
  if (project.address) doc.text(project.address, c1, bY + 13);
  y += 36;

  // ── PRÉSENTS ───────────────────────────────────────────────
  if (project.participants.length > 0) {
    doc.setFont(font, "bold");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text("PRE\u0301SENTS", ML, y);
    y += 4.5;

    project.participants.forEach((p, i) => {
      if (i % 2 === 0) { doc.setFillColor(...BGGRAY); doc.rect(ML, y - 3.5, CW, 6.5, "F"); }
      doc.setFont(font, "bold");   doc.setFontSize(9);   doc.setTextColor(...DARK);
      doc.text(p.name, ML + 3, y);
      doc.setFont(font, "normal"); doc.setFontSize(8.5); doc.setTextColor(...GRAY);
      doc.text(p.role, ML + 82, y);
      if (p.email) doc.text(p.email, ML + 110, y);
      y += 6.5;
    });
    y += 3;
  }

  // ── SÉPARATEUR AMBRE ───────────────────────────────────────
  doc.setFillColor(...AMBER);
  doc.rect(ML, y, CW, 0.8, "F");
  y += 9;

  // ── CONTENU (résultat Claude) ──────────────────────────────
  const lines = result.split("\n");
  for (const line of lines) {
    const t = line.trim();
    if (!t) { y += 2; continue; }

    const isSec     = /^\d{1,2}[.-]\s/.test(t) && t.length < 90;
    const isUrgent  = t.startsWith(">");
    const isPoint   = t.startsWith("-");

    if (isSec) {
      checkY(16);
      doc.setFillColor(...BGGRAY);
      doc.rect(ML, y - 4.5, CW, 9, "F");
      doc.setFillColor(...AMBER);
      doc.rect(ML, y - 4.5, 2.5, 9, "F");
      doc.setFont(font, "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(...DARK);
      doc.text(t, ML + 6, y);
      y += 9;
    } else if (isUrgent) {
      const content = t.slice(1).trim();
      const wrapped = doc.splitTextToSize("! " + content, CW - 12);
      checkY(wrapped.length * 5 + 5);
      doc.setFillColor(...REDBG);
      doc.rect(ML, y - 3.5, CW, wrapped.length * 5 + 3, "F");
      doc.setFillColor(...RED);
      doc.rect(ML, y - 3.5, 2, wrapped.length * 5 + 3, "F");
      doc.setFont(font, "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...RED);
      wrapped.forEach((wl, wi) => doc.text(wl, ML + 6, y + wi * 5));
      y += wrapped.length * 5 + 5;
    } else if (isPoint) {
      const content = t.slice(1).trim();
      const wrapped = doc.splitTextToSize(content, CW - 10);
      checkY(wrapped.length * 5 + 2);
      doc.setFillColor(...GRAY);
      doc.circle(ML + 3, y - 1.5, 0.8, "F");
      doc.setFont(font, "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(...DARK);
      wrapped.forEach((wl, wi) => doc.text(wl, ML + 8, y + wi * 5));
      y += wrapped.length * 5 + 2;
    } else {
      const wrapped = doc.splitTextToSize(t, CW);
      checkY(wrapped.length * 5 + 2);
      doc.setFont(font, "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(...DARK);
      wrapped.forEach((wl, wi) => doc.text(wl, ML, y + wi * 5));
      y += wrapped.length * 5 + 2;
    }
  }

  // ── ACTIONS OUVERTES ────────────────────────────────────────
  const openActions = (project.actions || []).filter(a => a.open);
  if (openActions.length > 0) {
    checkY(20);
    y += 4;
    doc.setFillColor(...AMBER);
    doc.rect(ML, y, CW, 0.8, "F");
    y += 9;
    doc.setFont(font, "bold");
    doc.setFontSize(11);
    doc.setTextColor(...DARK);
    doc.text("ACTIONS OUVERTES", ML, y);
    y += 8;

    openActions.forEach((a, i) => {
      checkY(10);
      if (i % 2 === 0) { doc.setFillColor(...BGGRAY); doc.rect(ML, y - 3.5, CW, 7, "F"); }
      if (a.urgent) { doc.setFillColor(...RED); doc.rect(ML, y - 3.5, 2, 7, "F"); }
      doc.setFont(font, a.urgent ? "bold" : "normal");
      doc.setFontSize(9);
      doc.setTextColor(...(a.urgent ? RED : DARK));
      const actionText = doc.splitTextToSize(a.text, CW - 65);
      doc.text(actionText[0], ML + 5, y);
      doc.setFont(font, "normal");
      doc.setFontSize(8);
      doc.setTextColor(...GRAY);
      if (a.who) doc.text(a.who, ML + CW - 55, y);
      if (a.since) doc.text(a.since, ML + CW - 15, y);
      y += 7;
    });
    y += 4;
  }

  // ── PLAN DU CHANTIER ───────────────────────────────────────
  const markers = project.planMarkers || [];
  const hasStrokes = (project.planStrokes || []).length > 0;
  if (project.planImage && (markers.length > 0 || hasStrokes)) {
    const composite = await compositePlanImage(project);
    if (composite) {
      checkY(20);
      y += 4;
      doc.setFillColor(...AMBER);
      doc.rect(ML, y, CW, 0.8, "F");
      y += 9;
      doc.setFont(font, "bold");
      doc.setFontSize(11);
      doc.setTextColor(...DARK);
      doc.text("LOCALISATION SUR PLAN", ML, y);
      y += 8;

      // Place image, keeping aspect ratio, max height 110mm
      const aspect = composite.w / composite.h;
      const planW  = CW;
      const planH  = Math.min(planW / aspect, 110);
      checkY(planH + 5);
      try { doc.addImage(composite.dataUrl, "JPEG", ML, y, planW, planH); } catch (_) { /* ignore */ }
      y += planH + 8;

      // Legend
      if (markers.length > 0) {
        checkY(markers.length * 7 + 14);
        doc.setFont(font, "bold");
        doc.setFontSize(8);
        doc.setTextColor(...GRAY);
        doc.text("LÉGENDE", ML, y);
        y += 5;
        markers.forEach((m, i) => {
          checkY(7);
          if (i % 2 === 0) { doc.setFillColor(...BGGRAY); doc.rect(ML, y - 3.5, CW, 6.5, "F"); }
          // Amber circle with number
          doc.setFillColor(...AMBER);
          doc.circle(ML + 4, y - 1.2, 3.2, "F");
          doc.setFont(font, "bold");
          doc.setFontSize(7);
          doc.setTextColor(255, 255, 255);
          doc.text(String(m.number), ML + 4, y - 1.2, { align: "center", baseline: "middle" });
          // Post label
          const post = project.posts.find((p) => p.id === m.postId);
          doc.setFont(font, "normal");
          doc.setFontSize(9);
          doc.setTextColor(...DARK);
          doc.text(post ? `${post.id}. ${post.label}` : "(poste supprimé)", ML + 11, y);
          y += 6.5;
        });
        y += 4;
      }
    }
  }

  // ── PHOTOS ─────────────────────────────────────────────────
  const postsWithPhotos = project.posts.filter((p) => (p.photos || []).length > 0);
  if (postsWithPhotos.length > 0) {
    checkY(20);
    y += 4;
    doc.setFillColor(...AMBER);
    doc.rect(ML, y, CW, 0.8, "F");
    y += 9;
    doc.setFont(font, "bold");
    doc.setFontSize(11);
    doc.setTextColor(...DARK);
    doc.text("PHOTOS JOINTES", ML, y);
    y += 8;

    postsWithPhotos.forEach((post) => {
      checkY(12);
      doc.setFont(font, "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...GRAY);
      doc.text(`${post.id}. ${post.label}`, ML, y);
      y += 5;

      const photos = post.photos;
      const cols = Math.min(photos.length, 3);
      const gap = 3;
      const imgW = (CW - gap * (cols - 1)) / cols;
      const imgH = imgW * 0.65;

      checkY(imgH + 6);
      photos.forEach((ph, idx) => {
        const col = idx % cols;
        if (col === 0 && idx > 0) { y += imgH + gap; checkY(imgH + gap); }
        try { const phUrl = getPhotoUrl(ph); doc.addImage(phUrl, imgFmt(phUrl), ML + col * (imgW + gap), y, imgW, imgH); } catch (_) { /* ignore */ }
      });
      y += imgH + 8;
    });
  }

  // ── PHOTOS DE CHANTIER (galerie) ────────────────────────────
  const galleryPhotos = (project.gallery || []).filter(ph => ph.dataUrl || ph.url);
  if (galleryPhotos.length > 0) {
    checkY(20);
    y += 4;
    doc.setFillColor(...AMBER);
    doc.rect(ML, y, CW, 0.8, "F");
    y += 9;
    doc.setFont(font, "bold");
    doc.setFontSize(11);
    doc.setTextColor(...DARK);
    doc.text(`PHOTOS DE CHANTIER (${galleryPhotos.length})`, ML, y);
    y += 8;

    const cols = 3;
    const gap = 3;
    const imgW = (CW - gap * (cols - 1)) / cols;
    const imgH = imgW * 0.65;

    galleryPhotos.forEach((ph, idx) => {
      const col = idx % cols;
      if (col === 0 && idx > 0) { y += imgH + gap; }
      if (col === 0) checkY(imgH + gap);
      try {
        const phUrl = ph.dataUrl || ph.url;
        doc.addImage(phUrl, imgFmt(phUrl), ML + col * (imgW + gap), y, imgW, imgH);
      } catch (_) { /* ignore */ }
      // Date caption
      if (ph.date) {
        doc.setFont(font, "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(...GRAY);
        doc.text(new Date(ph.date).toLocaleDateString("fr-BE", { day: "numeric", month: "short" }), ML + col * (imgW + gap) + 1, y + imgH - 1);
      }
    });
    y += imgH + 8;
  }

  // ── PIED DE PAGE (toutes les pages) ────────────────────────
  const total = doc.internal.getNumberOfPages();
  const showWatermark = !hasFeature(profile?.plan, "pdfNoWatermark");
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LGRAY);
    doc.setLineWidth(0.3);
    doc.line(ML, H - 15, W - MR, H - 15);
    doc.setFont(font, "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY);
    doc.text(bureauName, ML, H - 10);
    if (contactParts) doc.text(contactParts, ML, H - 6);
    doc.text(`PV n\u00B0${pvNum}  \u2014  ${date}`, W - MR, H - 10, { align: "right" });
    doc.text(`Page ${i} / ${total}`, W - MR, H - 6, { align: "right" });

    // Free plan: diagonal watermark + footer CTA line on every page.
    if (showWatermark) {
      try {
        if (typeof doc.saveGraphicsState === "function" && typeof doc.GState === "function") {
          doc.saveGraphicsState();
          doc.setGState(new doc.GState({ opacity: 0.08 }));
          doc.setFont(font, "bold");
          doc.setFontSize(64);
          doc.setTextColor(...AMBER);
          doc.text("ArchiPilot Free", W / 2, H / 2, { align: "center", angle: 45 });
          doc.restoreGraphicsState();
        } else {
          // Fallback: light gray diagonal text (no opacity control)
          doc.setFont(font, "bold");
          doc.setFontSize(64);
          doc.setTextColor(230, 225, 220);
          doc.text("ArchiPilot Free", W / 2, H / 2, { align: "center", angle: 45 });
        }
      } catch (_) { /* watermark failed, continue without */ }
      doc.setFont(font, "italic");
      doc.setFontSize(7);
      doc.setTextColor(...GRAY);
      doc.text("Généré avec ArchiPilot — Passez à Pro pour supprimer ce filigrane (archipilot.app)", W / 2, H - 3, { align: "center" });
    }
  }

  const safeName = project.name.replace(/[^\w\s\u00C0-\u024F]/g, "").replace(/\s+/g, "_");
  const safeDate = date.replace(/\//g, "-");
  if (options?.returnDataUrl) {
    return { dataUrl: doc.output("datauristring"), fileName: `PV_${pvNum}_${safeName}_${safeDate}.pdf` };
  }
  doc.save(`PV_${pvNum}_${safeName}_${safeDate}.pdf`);
}

// \u2500\u2500 OPR PDF \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Proc\u00E8s-verbal de r\u00E9ception. Liste des r\u00E9serves constat\u00E9es + signatures
// des parties (canvas dataURL embarqu\u00E9es en bas).
//
// `opr` contient { number, date, type, reserves, signatures } \u2014 la snapshot
// fig\u00E9e au moment de la signature pour avoir un document immuable.
export async function generateOprPdf(project, opr, profile, options) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, H = 297;
  const ML = 18, MR = 18;
  const CW = W - ML - MR;

  const AMBER  = hexToRgb(profile?.pdfColor || "#B85C2C");
  const font   = profile?.pdfFont || "helvetica";
  const DARK   = [29, 29, 27];
  const GRAY   = [107, 107, 102];
  const LGRAY  = [226, 225, 221];
  const BGGRAY = [247, 246, 244];
  const RED    = [196, 57, 42];
  const REDBG  = [254, 242, 242];
  const GREEN  = [78, 142, 90];
  const GREENBG = [234, 243, 222];
  const AMBERBG = [253, 244, 235];

  const reserves = opr.reserves || project.reserves || [];
  const signatures = opr.signatures || [];
  const oprNum = opr.number || 1;
  const oprDate = opr.date || new Date().toLocaleDateString("fr-BE");
  const oprType = opr.type === "definitive" ? "D\u00C9FINITIVE" : "PROVISOIRE";

  let y = 0;

  const checkY = (needed = 12) => {
    if (y + needed > H - 22) {
      doc.addPage();
      y = 22;
    }
  };

  const imgFmt = (dataUrl) => {
    if (dataUrl.startsWith("data:image/png")) return "PNG";
    if (dataUrl.startsWith("data:image/webp")) return "WEBP";
    return "JPEG";
  };

  // \u2500\u2500 HEADER \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  doc.setFillColor(...AMBER);
  doc.rect(0, 0, W, 11, "F");

  y = 19;

  if (profile?.picture && hasFeature(profile?.plan, "pdfCustomLogo")) {
    try { doc.addImage(profile.picture, imgFmt(profile.picture), W - MR - 22, 13, 22, 22); } catch (_) { /* ignore */ }
  }

  const bureauName = profile?.structure || "ArchiPilot";
  doc.setFont(font, "bold");
  doc.setFontSize(14);
  doc.setTextColor(...DARK);
  doc.text(bureauName, ML, y);
  y += 5.5;

  doc.setFont(font, "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY);
  const contactParts = [profile?.phone, profile?.email].filter(Boolean).join("   ");
  if (profile?.address) { doc.text(profile.address, ML, y); y += 4.5; }
  if (contactParts)      { doc.text(contactParts, ML, y);   y += 4.5; }

  y = Math.max(y, 40);
  doc.setDrawColor(...LGRAY);
  doc.setLineWidth(0.4);
  doc.line(ML, y, W - MR, y);
  y += 9;

  // \u2500\u2500 TITRE \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  doc.setFont(font, "bold");
  doc.setFontSize(20);
  doc.setTextColor(...AMBER);
  doc.text(`OPR n\u00B0${oprNum} \u2014 RE\u0301CEPTION ${oprType}`, ML, y);
  y += 7;

  doc.setFont(font, "normal");
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text(`Visite de re\u0301ception du ${oprDate}`, ML, y);
  y += 9;

  // \u2500\u2500 FICHE PROJET \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  doc.setFillColor(...BGGRAY);
  doc.rect(ML, y, CW, 28, "F");

  const bY = y + 5;
  const c1 = ML + 5, c2 = ML + 62, c3 = ML + 120;

  doc.setFont(font, "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY);
  doc.text("CHANTIER", c1, bY);
  doc.text("MA\u00CETRE D'OUVRAGE", c2, bY);
  doc.text("ENTREPRISE", c3, bY);

  doc.setFont(font, "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...DARK);
  doc.text(doc.splitTextToSize(project.name || "", 54), c1, bY + 5);
  doc.text(doc.splitTextToSize(project.client || "", 54), c2, bY + 5);
  doc.text(doc.splitTextToSize(project.contractor || "", 46), c3, bY + 5);

  doc.setFont(font, "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY);
  if (project.address) doc.text(project.address, c1, bY + 13);
  y += 36;

  // \u2500\u2500 KPI R\u00C9SERVES \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const total = reserves.length;
  const levees = reserves.filter(r => r.status === "levee").length;
  const partielles = reserves.filter(r => r.status === "partiellement_levee").length;
  const nonLevees = reserves.filter(r => r.status === "non_levee").length;
  const critiques = reserves.filter(r => r.severity === "critical" && r.status !== "levee").length;
  const pctLevees = total > 0 ? Math.round((levees / total) * 100) : 0;

  if (total > 0) {
    const kpiBoxes = [
      { label: "Total",      value: total,      color: DARK,  bg: BGGRAY },
      { label: "Non leve\u0301es", value: nonLevees, color: RED,   bg: REDBG },
      { label: "En cours",   value: partielles, color: [217, 119, 6], bg: AMBERBG },
      { label: "Leve\u0301es",     value: levees,    color: GREEN, bg: GREENBG },
    ];
    if (critiques > 0) kpiBoxes.push({ label: "Critiques", value: critiques, color: RED, bg: REDBG });
    const kpiW = (CW - (kpiBoxes.length - 1) * 3) / kpiBoxes.length;
    kpiBoxes.forEach((k, i) => {
      const kx = ML + i * (kpiW + 3);
      doc.setFillColor(...k.bg);
      doc.rect(kx, y, kpiW, 18, "F");
      doc.setFont(font, "bold");
      doc.setFontSize(16);
      doc.setTextColor(...k.color);
      doc.text(String(k.value), kx + kpiW / 2, y + 9, { align: "center" });
      doc.setFont(font, "normal");
      doc.setFontSize(7);
      doc.setTextColor(...GRAY);
      doc.text(k.label.toUpperCase(), kx + kpiW / 2, y + 14.5, { align: "center" });
    });
    y += 22;

    // Progress bar
    doc.setFont(font, "bold");
    doc.setFontSize(8);
    doc.setTextColor(...DARK);
    doc.text(`Progression : ${pctLevees}%`, ML, y);
    y += 2.5;
    doc.setFillColor(...LGRAY);
    doc.rect(ML, y, CW, 2.5, "F");
    doc.setFillColor(...(pctLevees === 100 ? GREEN : AMBER));
    doc.rect(ML, y, CW * (pctLevees / 100), 2.5, "F");
    y += 9;
  }

  // \u2500\u2500 PR\u00C9SENTS \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  if ((project.participants || []).length > 0) {
    doc.setFont(font, "bold");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text("PRE\u0301SENTS \u00C0 LA RE\u0301CEPTION", ML, y);
    y += 4.5;

    project.participants.forEach((p, i) => {
      checkY(7);
      if (i % 2 === 0) { doc.setFillColor(...BGGRAY); doc.rect(ML, y - 3.5, CW, 6.5, "F"); }
      doc.setFont(font, "bold");   doc.setFontSize(9);   doc.setTextColor(...DARK);
      doc.text(p.name || "", ML + 3, y);
      doc.setFont(font, "normal"); doc.setFontSize(8.5); doc.setTextColor(...GRAY);
      doc.text(p.role || "", ML + 82, y);
      if (p.email) doc.text(p.email, ML + 110, y);
      y += 6.5;
    });
    y += 3;
  }

  // \u2500\u2500 S\u00C9PARATEUR AMBRE \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  doc.setFillColor(...AMBER);
  doc.rect(ML, y, CW, 0.8, "F");
  y += 9;

  // \u2500\u2500 LISTE R\u00C9SERVES (group\u00E9es par entreprise) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  if (total === 0) {
    doc.setFillColor(...GREENBG);
    doc.rect(ML, y, CW, 16, "F");
    doc.setFont(font, "bold");
    doc.setFontSize(11);
    doc.setTextColor(...GREEN);
    doc.text("Aucune re\u0301serve constate\u0301e \u2014 re\u0301ception sans re\u0301serve.", ML + 5, y + 10);
    y += 22;
  } else {
    doc.setFont(font, "bold");
    doc.setFontSize(11);
    doc.setTextColor(...DARK);
    doc.text(`RE\u0301SERVES (${total})`, ML, y);
    y += 8;

    const contractors = [...new Set(reserves.map(r => r.contractor || "Non assigne\u0301e"))];
    for (const contractor of contractors) {
      const cReserves = reserves.filter(r => (r.contractor || "Non assigne\u0301e") === contractor);
      checkY(12);
      doc.setFillColor(...BGGRAY);
      doc.rect(ML, y - 3.5, CW, 7, "F");
      doc.setFont(font, "bold");
      doc.setFontSize(9);
      doc.setTextColor(...DARK);
      doc.text(`\u2022 ${contractor}  (${cReserves.length})`, ML + 3, y);
      y += 8;

      for (const r of cReserves) {
        const sev = r.severity === "critical" ? { label: "CRITIQUE", color: RED }
                  : r.severity === "major"    ? { label: "MAJEURE",  color: [217, 119, 6] }
                  : r.severity === "minor"    ? { label: "MINEURE",  color: GRAY }
                  :                              { label: "ESTHE\u0301TIQUE", color: GRAY };
        const stat = r.status === "levee" ? { label: "Leve\u0301e", color: GREEN }
                   : r.status === "partiellement_levee" ? { label: "En cours", color: [217, 119, 6] }
                   : { label: "Non leve\u0301e", color: RED };

        const wrapped = doc.splitTextToSize(r.description || "", CW - 12);
        const rowH = 9 + wrapped.length * 5 + 4;
        checkY(rowH + 4);

        // Box (red bg if critical+open, else white)
        const isHotReserve = r.severity === "critical" && r.status !== "levee";
        if (isHotReserve) doc.setFillColor(...REDBG); else doc.setFillColor(255, 255, 255);
        doc.setDrawColor(...LGRAY);
        doc.setLineWidth(0.3);
        doc.rect(ML, y - 3, CW, rowH, "FD");

        // Code + sev + status pill
        doc.setFont(font, "bold");
        doc.setFontSize(9);
        doc.setTextColor(...DARK);
        doc.text(r.code || "\u2014", ML + 3, y + 1);
        doc.setFont(font, "bold");
        doc.setFontSize(7);
        doc.setTextColor(...sev.color);
        doc.text(sev.label, ML + 22, y + 1);
        doc.setTextColor(...stat.color);
        doc.text(stat.label.toUpperCase(), ML + 50, y + 1);

        // Meta (location / deadline) on right
        const metaParts = [];
        if (r.location) metaParts.push(r.location);
        if (r.deadline) metaParts.push(`\u00C9ch\u00E9ance ${r.deadline}`);
        if (metaParts.length) {
          doc.setFont(font, "normal");
          doc.setFontSize(7.5);
          doc.setTextColor(...GRAY);
          doc.text(metaParts.join("  \u2022  "), ML + CW - 3, y + 1, { align: "right" });
        }

        // Description
        doc.setFont(font, "normal");
        doc.setFontSize(9);
        doc.setTextColor(...DARK);
        wrapped.forEach((wl, wi) => doc.text(wl, ML + 3, y + 7 + wi * 5));

        y += rowH;
      }
      y += 3;
    }
  }

  // \u2500\u2500 SIGNATURES \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  // Toujours sur la derni\u00E8re page si possible \u2014 sinon on saute.
  checkY(60);
  y += 4;
  doc.setFillColor(...AMBER);
  doc.rect(ML, y, CW, 0.8, "F");
  y += 9;
  doc.setFont(font, "bold");
  doc.setFontSize(11);
  doc.setTextColor(...DARK);
  doc.text("SIGNATURES", ML, y);
  y += 7;

  doc.setFont(font, "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY);
  doc.text("Les soussigne\u0301s certifient avoir pris connaissance des re\u0301serves ci-dessus.", ML, y);
  y += 7;

  // Grid de cases signatures (2 par ligne)
  const signSlots = signatures.length > 0
    ? signatures
    : (project.participants || []).map(p => ({ name: p.name, role: p.role, email: p.email, dataUrl: null }));

  if (signSlots.length === 0) {
    // Cases vides \u00E0 imprimer/signer
    const fallbackRoles = ["Ma\u00EEtre d'Ouvrage", "Architecte", "Entreprise"];
    fallbackRoles.forEach(r => signSlots.push({ name: "", role: r, dataUrl: null }));
  }

  const sigW = (CW - 6) / 2;
  const sigH = 32;
  signSlots.forEach((s, i) => {
    const col = i % 2;
    const sx = ML + col * (sigW + 6);
    if (col === 0 && i > 0) y += sigH + 6;
    checkY(sigH + 4);

    // Box
    doc.setDrawColor(...LGRAY);
    doc.setLineWidth(0.3);
    doc.rect(sx, y, sigW, sigH);

    // Signature image embed
    if (s.dataUrl) {
      try {
        doc.addImage(s.dataUrl, imgFmt(s.dataUrl), sx + 3, y + 3, sigW - 6, sigH - 12);
      } catch (_) { /* ignore */ }
    }

    // Footer band: name + role
    doc.setFillColor(...BGGRAY);
    doc.rect(sx, y + sigH - 8, sigW, 8, "F");
    doc.setFont(font, "bold");
    doc.setFontSize(8);
    doc.setTextColor(...DARK);
    doc.text((s.name || "\u00C0 compl\u00E9ter").slice(0, 38), sx + 3, y + sigH - 3.5);
    doc.setFont(font, "normal");
    doc.setFontSize(7);
    doc.setTextColor(...GRAY);
    if (s.role) doc.text(s.role, sx + sigW - 3, y + sigH - 3.5, { align: "right" });

    // Trace metadata (small italic line above the box)
    if (s.signedAt) {
      doc.setFont(font, "italic");
      doc.setFontSize(6.5);
      doc.setTextColor(...GRAY);
      const stamp = new Date(s.signedAt).toLocaleString("fr-BE", { dateStyle: "short", timeStyle: "short" });
      doc.text(`Signe\u0301 le ${stamp}`, sx + 3, y - 1);
    }
  });
  y += sigH + 4;

  // \u2500\u2500 PIED DE PAGE \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const totalPages = doc.internal.getNumberOfPages();
  const showWatermark = !hasFeature(profile?.plan, "pdfNoWatermark");
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LGRAY);
    doc.setLineWidth(0.3);
    doc.line(ML, H - 15, W - MR, H - 15);
    doc.setFont(font, "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY);
    doc.text(bureauName, ML, H - 10);
    if (contactParts) doc.text(contactParts, ML, H - 6);
    doc.text(`OPR n\u00B0${oprNum}  \u2014  ${oprDate}`, W - MR, H - 10, { align: "right" });
    doc.text(`Page ${i} / ${totalPages}`, W - MR, H - 6, { align: "right" });

    if (showWatermark) {
      try {
        if (typeof doc.saveGraphicsState === "function" && typeof doc.GState === "function") {
          doc.saveGraphicsState();
          doc.setGState(new doc.GState({ opacity: 0.08 }));
          doc.setFont(font, "bold");
          doc.setFontSize(64);
          doc.setTextColor(...AMBER);
          doc.text("ArchiPilot Free", W / 2, H / 2, { align: "center", angle: 45 });
          doc.restoreGraphicsState();
        } else {
          doc.setFont(font, "bold");
          doc.setFontSize(64);
          doc.setTextColor(230, 225, 220);
          doc.text("ArchiPilot Free", W / 2, H / 2, { align: "center", angle: 45 });
        }
      } catch (_) { /* ignore */ }
      doc.setFont(font, "italic");
      doc.setFontSize(7);
      doc.setTextColor(...GRAY);
      doc.text("Ge\u0301ne\u0301re\u0301 avec ArchiPilot \u2014 Passez a\u0300 Pro pour supprimer ce filigrane (archipilot.app)", W / 2, H - 3, { align: "center" });
    }
  }

  const safeName = (project.name || "projet").replace(/[^\w\s\u00C0-\u024F]/g, "").replace(/\s+/g, "_");
  const safeDate = oprDate.replace(/\//g, "-");
  const fileName = `OPR_${oprNum}_${safeName}_${safeDate}.pdf`;
  if (options?.returnDataUrl) {
    return { dataUrl: doc.output("datauristring"), fileName };
  }
  doc.save(fileName);
}

// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// F2 \u2014 Journal de chantier
//
// G\u00E9n\u00E8re un PDF chronologique consolidant les \u00E9v\u00E9nements du chantier :
// PV / OPR / r\u00E9serves / photos / actions / visites libres. Destin\u00E9 \u00E0
// l'archivage et aux audits Cnac (le journal est l\u00E9galement obligatoire
// pour les chantiers soumis au RGPT en Belgique).
//
// Input :
//   timeline = liste d\u00E9j\u00E0 tri\u00E9e DESC par date, sortie de buildTimeline()
//   profile  = pour le header cabinet et le footer signature
//   options.draft = true \u2192 filigrane "BROUILLON" pour distinguer une
//                          copie de travail d'une copie sign\u00E9e
// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
export async function generateChantierJournalPdf(project, timeline, profile, options = {}) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, H = 297;
  const ML = 18, MR = 18;
  const CW = W - ML - MR;

  const AMBER  = hexToRgb(profile?.pdfColor || "#B85C2C");
  const font   = profile?.pdfFont || "helvetica";
  const DARK   = [29, 29, 27];
  const GRAY   = [107, 107, 102];
  const LGRAY  = [226, 225, 221];
  const BGGRAY = [247, 246, 244];

  // Couleurs de dot par type \u2014 align\u00E9es sur JournalView (coh\u00E9rence UX)
  const TYPE_COLORS = {
    pv:      [196, 121, 26],   // amber
    opr:     [192, 90, 44],    // terracotta
    reserve: [192, 69, 37],    // brick red
    action:  [126, 109, 138],  // violet
    photo:   [58, 115, 150],   // blueprint
    manual:  [107, 107, 102],  // gray
  };
  const TYPE_LABELS = {
    pv: "PV", opr: "OPR", reserve: "R\u00E9serve",
    action: "Action", photo: "Photos", manual: "Visite",
  };

  let y = 0;

  const checkY = (needed = 14) => {
    if (y + needed > H - 22) {
      doc.addPage();
      y = 22;
    }
  };

  // \u2500\u2500 HEADER \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  doc.setFillColor(...AMBER);
  doc.rect(0, 0, W, 11, "F");
  y = 19;

  if (profile?.picture && hasFeature(profile?.plan, "pdfCustomLogo")) {
    try { doc.addImage(profile.picture, "JPEG", W - MR - 22, 13, 22, 22); } catch (_) { /* ignore */ }
  }

  const bureauName = profile?.structure || "ArchiPilot";
  doc.setFont(font, "bold"); doc.setFontSize(14); doc.setTextColor(...DARK);
  doc.text(bureauName, ML, y); y += 5.5;

  doc.setFont(font, "normal"); doc.setFontSize(8.5); doc.setTextColor(...GRAY);
  const contactParts = [profile?.phone, profile?.email].filter(Boolean).join("   ");
  if (profile?.address) { doc.text(profile.address, ML, y); y += 4.5; }
  if (contactParts)      { doc.text(contactParts, ML, y);   y += 4.5; }

  y = Math.max(y, 40);
  doc.setDrawColor(...LGRAY); doc.setLineWidth(0.4);
  doc.line(ML, y, W - MR, y); y += 9;

  // \u2500\u2500 TITRE \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const todayStr = new Date().toLocaleDateString("fr-BE");
  doc.setFont(font, "bold"); doc.setFontSize(20); doc.setTextColor(...AMBER);
  doc.text("JOURNAL DE CHANTIER", ML, y); y += 7;

  doc.setFont(font, "normal"); doc.setFontSize(10); doc.setTextColor(...DARK);
  doc.text(`E\u0301dition du ${todayStr}`, ML, y); y += 9;

  // \u2500\u2500 FICHE PROJET \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  doc.setFillColor(...BGGRAY);
  doc.rect(ML, y, CW, 22, "F");

  const bY = y + 5;
  const c1 = ML + 5, c2 = ML + 90;

  doc.setFont(font, "bold"); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
  doc.text("CHANTIER", c1, bY);
  doc.text("MA\u00CETRE D'OUVRAGE", c2, bY);

  doc.setFont(font, "bold"); doc.setFontSize(9.5); doc.setTextColor(...DARK);
  doc.text(doc.splitTextToSize(project.name || "", 82), c1, bY + 5);
  doc.text(doc.splitTextToSize(project.client || "", 82), c2, bY + 5);

  if (project.address) {
    doc.setFont(font, "normal"); doc.setFontSize(8.5); doc.setTextColor(...GRAY);
    doc.text(project.address, c1, bY + 13);
  }
  y += 30;

  // \u2500\u2500 STATS RAPIDES \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  if (timeline.length > 0) {
    const counts = {};
    for (const e of timeline) counts[e.type] = (counts[e.type] || 0) + 1;
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const items = sorted.map(([type, n]) => `${TYPE_LABELS[type] || type} : ${n}`);
    doc.setFont(font, "normal"); doc.setFontSize(8.5); doc.setTextColor(...GRAY);
    doc.text(`${timeline.length} entr\u00E9e${timeline.length > 1 ? "s" : ""} \u2014 ${items.join("   \u00B7   ")}`, ML, y);
    y += 7;
  }

  // \u2500\u2500 S\u00C9PARATEUR \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  doc.setFillColor(...AMBER);
  doc.rect(ML, y, CW, 0.8, "F");
  y += 9;

  // \u2500\u2500 TIMELINE \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  if (timeline.length === 0) {
    doc.setFont(font, "italic"); doc.setFontSize(10); doc.setTextColor(...GRAY);
    doc.text("Aucune entr\u00E9e dans le journal.", ML, y);
  } else {
    for (const e of timeline) {
      const photos = (e.photos || []).slice(0, 4);
      const hasPhotos = photos.length > 0;
      // Estimation hauteur : titre + sous-titre + corps wrap + photos
      const bodyLines = e.body ? doc.splitTextToSize(e.body, CW - 12) : [];
      const bodyH = Math.min(bodyLines.length, 4) * 4;
      const photoH = hasPhotos ? 22 : 0;
      const entryH = 14 + bodyH + photoH + 4;
      checkY(entryH);

      // Dot type (\u00E0 gauche)
      const dotColor = TYPE_COLORS[e.type] || GRAY;
      doc.setFillColor(...dotColor);
      doc.circle(ML + 2, y + 3.5, 1.8, "F");

      // Date \u00E0 droite + chip type
      const dateStr = e.date.toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit", year: "numeric" });
      doc.setFont(font, "bold"); doc.setFontSize(9); doc.setTextColor(...DARK);
      doc.text(e.title, ML + 7, y + 4.5);

      doc.setFont(font, "normal"); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
      const dateW = doc.getTextWidth(dateStr);
      doc.text(dateStr, ML + CW - dateW, y + 4.5);

      // Chip type
      const lbl = TYPE_LABELS[e.type] || e.type;
      doc.setFontSize(6.5); doc.setTextColor(...dotColor);
      doc.text(lbl.toUpperCase(), ML + 7, y + 8.5);

      // Sous-titre (pr\u00E9sents / contractor / etc.)
      if (e.subtitle) {
        doc.setFont(font, "normal"); doc.setFontSize(8); doc.setTextColor(...GRAY);
        const subLines = doc.splitTextToSize(e.subtitle, CW - 30);
        doc.text(subLines[0] || "", ML + 7 + 14, y + 8.5);
      }

      let by = y + 13;

      // Corps (4 lignes max)
      if (bodyLines.length > 0) {
        doc.setFont(font, "normal"); doc.setFontSize(8.5); doc.setTextColor(...DARK);
        const lines = bodyLines.slice(0, 4);
        for (const line of lines) {
          doc.text(line, ML + 7, by);
          by += 4;
        }
        if (bodyLines.length > 4) {
          doc.setFontSize(7); doc.setTextColor(...GRAY);
          doc.text("\u2026 (\u00E9lid\u00E9)", ML + 7, by);
          by += 4;
        }
      }

      // Photos (max 4 vignettes 18\u00D718)
      if (hasPhotos) {
        by += 1;
        const thumbSize = 18;
        for (let i = 0; i < photos.length; i++) {
          try {
            doc.addImage(photos[i], "JPEG", ML + 7 + i * (thumbSize + 2), by, thumbSize, thumbSize);
          } catch (_) { /* ignore broken photos */ }
        }
        by += thumbSize + 2;
      }

      // Trait fin s\u00E9parateur entre entr\u00E9es
      doc.setDrawColor(...LGRAY); doc.setLineWidth(0.2);
      doc.line(ML + 7, by + 1, W - MR, by + 1);
      y = by + 4;
    }
  }

  // \u2500\u2500 FOOTER : pagination + signature \u00E9lectronique archi \u2500\u2500
  const pageCount = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFont(font, "normal"); doc.setFontSize(7); doc.setTextColor(...GRAY);
    // Pagination
    doc.text(`Page ${p} / ${pageCount}`, W - MR, H - 8, { align: "right" });
    // Mention archi (= signature \u00E9lectronique au sens o\u00F9 l'archi atteste
    // de la v\u00E9racit\u00E9 par son nom + sa structure et la date d'\u00E9dition)
    const signLine = `Document attest\u00E9 par ${profile?.name || "l'architecte"} (${bureauName}) le ${todayStr}`;
    doc.text(signLine, ML, H - 8);

    // Filigrane "BROUILLON" si demand\u00E9
    if (options.draft) {
      try {
        doc.saveGraphicsState();
        doc.setGState(new doc.GState({ opacity: 0.08 }));
        doc.setFont(font, "bold"); doc.setFontSize(96); doc.setTextColor(...GRAY);
        doc.text("BROUILLON", W / 2, H / 2, { align: "center", angle: 45 });
        doc.restoreGraphicsState();
      } catch (_) {
        doc.setFont(font, "bold"); doc.setFontSize(96); doc.setTextColor(230, 225, 220);
        doc.text("BROUILLON", W / 2, H / 2, { align: "center", angle: 45 });
      }
    }

    // Filigrane plan Free (coh\u00E9rence avec OPR/PV)
    if (profile?.plan === "free") {
      try {
        doc.saveGraphicsState();
        doc.setGState(new doc.GState({ opacity: 0.1 }));
        doc.setFont(font, "bold"); doc.setFontSize(64); doc.setTextColor(...GRAY);
        doc.text("ArchiPilot Free", W / 2, H * 0.78, { align: "center", angle: 45 });
        doc.restoreGraphicsState();
      } catch (_) { /* ignore */ }
    }
  }

  const safeName = (project.name || "projet").replace(/[^\w\s\u00C0-\u024F]/g, "").replace(/\s+/g, "_");
  const safeDate = todayStr.replace(/\//g, "-");
  const fileName = `Journal_${safeName}_${safeDate}.pdf`;
  if (options.returnDataUrl) {
    return { dataUrl: doc.output("datauristring"), fileName };
  }
  doc.save(fileName);
  return { fileName };
}

// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// F1 \u2014 PDF facture (conforme TVA belge)
//
// Mentions obligatoires d'une facture en Belgique (Code TVA art 53\u00A72) :
//   \u2022 mention "Facture" + num\u00E9ro s\u00E9quentiel + date d'\u00E9mission
//   \u2022 identification compl\u00E8te \u00E9metteur (nom, adresse, n\u00B0 TVA)
//   \u2022 identification compl\u00E8te client (nom, adresse, n\u00B0 TVA si pro)
//   \u2022 description, qt\u00E9, prix HT, taux TVA, montant TVA, total TTC
//   \u2022 date d'\u00E9ch\u00E9ance + conditions de paiement
//
// IBAN n'est pas l\u00E9galement obligatoire mais indispensable en pratique.
// Communication structur\u00E9e bancaire (XXX/XXXX/XXXXX) recommand\u00E9e si on
// veut un matching automatique \u00E0 la r\u00E9ception du virement.
// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
export async function generateInvoicePdf(invoice, profile, options = {}) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, H = 297;
  const ML = 18, MR = 18;
  const CW = W - ML - MR;

  const AMBER  = hexToRgb(profile?.pdfColor || "#B85C2C");
  const font   = profile?.pdfFont || "helvetica";
  const DARK   = [29, 29, 27];
  const GRAY   = [107, 107, 102];
  const LGRAY  = [226, 225, 221];
  const BGGRAY = [247, 246, 244];

  const fmtMoney = (n) => {
    const v = Number(n) || 0;
    return v.toLocaleString("fr-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " \u20AC";
  };
  const fmtDateBE = (iso) => {
    if (!iso) return "\u2014";
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString("fr-BE");
  };

  // Recalcule TTC c\u00F4t\u00E9 client (les colonnes g\u00E9n\u00E9r\u00E9es en DB ne sont visibles
  // qu'apr\u00E8s reload \u2014 pour les brouillons non encore sauv\u00E9s, on calcule ici).
  const amountHt  = Number(invoice.amount_ht) || 0;
  const vatRate   = Number(invoice.vat_rate) || 21;
  const amountVat = invoice.amount_vat != null ? Number(invoice.amount_vat) : Math.round(amountHt * vatRate) / 100;
  const amountTtc = invoice.amount_ttc != null ? Number(invoice.amount_ttc) : Math.round(amountHt * (100 + vatRate)) / 100;

  let y = 0;

  // \u2500\u2500 HEADER bande ambr\u00E9e \u2500\u2500
  doc.setFillColor(...AMBER);
  doc.rect(0, 0, W, 11, "F");
  y = 19;

  if (profile?.picture && hasFeature(profile?.plan, "pdfCustomLogo")) {
    try { doc.addImage(profile.picture, "JPEG", W - MR - 22, 13, 22, 22); } catch (_) { /* ignore */ }
  }

  // \u2500\u2500 Bloc \u00E9metteur (haut gauche) \u2500\u2500
  doc.setFont(font, "bold"); doc.setFontSize(14); doc.setTextColor(...DARK);
  doc.text(profile?.structure || "ArchiPilot", ML, y); y += 5.5;

  doc.setFont(font, "normal"); doc.setFontSize(8.5); doc.setTextColor(...GRAY);
  if (profile?.address)    { doc.text(profile.address, ML, y); y += 4.5; }
  const contact = [profile?.phone, profile?.email].filter(Boolean).join("   ");
  if (contact)              { doc.text(contact, ML, y); y += 4.5; }
  if (profile?.vatNumber)   { doc.text(`N\u00B0 TVA : ${profile.vatNumber}`, ML, y); y += 4.5; }

  y = Math.max(y, 42);
  doc.setDrawColor(...LGRAY); doc.setLineWidth(0.4);
  doc.line(ML, y, W - MR, y); y += 9;

  // \u2500\u2500 Titre + num\u00E9ro \u2500\u2500
  doc.setFont(font, "bold"); doc.setFontSize(22); doc.setTextColor(...AMBER);
  doc.text("FACTURE", ML, y);

  doc.setFontSize(11); doc.setTextColor(...DARK);
  const numLabel = `N\u00B0 ${invoice.number || "\u2014"}`;
  const numW = doc.getTextWidth(numLabel);
  doc.text(numLabel, W - MR - numW, y);
  y += 7;

  // Dates \u00E9mission / \u00E9ch\u00E9ance \u2014 align\u00E9es droite
  doc.setFont(font, "normal"); doc.setFontSize(9); doc.setTextColor(...GRAY);
  const dEmission = `Date d'\u00E9mission : ${fmtDateBE(invoice.issue_date)}`;
  const dDue      = `\u00C9ch\u00E9ance : ${fmtDateBE(invoice.due_date)}`;
  doc.text(dEmission, W - MR - doc.getTextWidth(dEmission), y); y += 4;
  doc.text(dDue,      W - MR - doc.getTextWidth(dDue), y); y += 8;

  // \u2500\u2500 Bloc CLIENT (encadr\u00E9) \u2500\u2500
  doc.setFillColor(...BGGRAY);
  const clientH = 28;
  doc.rect(ML, y, CW, clientH, "F");

  doc.setFont(font, "bold"); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
  doc.text("FACTURE ADRESS\u00C9E \u00C0", ML + 5, y + 5);

  doc.setFont(font, "bold"); doc.setFontSize(10); doc.setTextColor(...DARK);
  doc.text(invoice.client_name || "\u2014", ML + 5, y + 11);

  doc.setFont(font, "normal"); doc.setFontSize(9); doc.setTextColor(...GRAY);
  if (invoice.client_address) {
    const lines = doc.splitTextToSize(invoice.client_address, CW - 70);
    let cy = y + 16;
    for (const l of lines.slice(0, 2)) { doc.text(l, ML + 5, cy); cy += 4; }
  }
  if (invoice.client_vat) {
    doc.text(`N\u00B0 TVA : ${invoice.client_vat}`, ML + 5, y + clientH - 4);
  }

  // R\u00E9f\u00E9rence projet \u00E0 droite du bloc
  doc.setFont(font, "bold"); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
  doc.text("PROJET", ML + CW - 55, y + 5);
  doc.setFont(font, "bold"); doc.setFontSize(9.5); doc.setTextColor(...DARK);
  doc.text(doc.splitTextToSize(invoice.project_name || invoice.project_id || "\u2014", 50), ML + CW - 55, y + 11);
  if (invoice.phase_label) {
    doc.setFont(font, "normal"); doc.setFontSize(8.5); doc.setTextColor(...GRAY);
    doc.text(`Phase : ${invoice.phase_label}`, ML + CW - 55, y + clientH - 4);
  }
  y += clientH + 10;

  // \u2500\u2500 Tableau lignes \u2500\u2500
  // En-t\u00EAte
  doc.setFillColor(...AMBER);
  doc.rect(ML, y, CW, 7, "F");
  doc.setFont(font, "bold"); doc.setFontSize(8.5); doc.setTextColor(255, 255, 255);
  doc.text("DESCRIPTION", ML + 4, y + 4.7);
  doc.text("TVA",        ML + CW - 55, y + 4.7);
  doc.text("MONTANT HT", ML + CW - 4 - doc.getTextWidth("MONTANT HT"), y + 4.7);
  y += 7;

  // Ligne (une seule en v1, description multilignes possible)
  const descLines = doc.splitTextToSize(invoice.description || "", CW - 70);
  const lineH = Math.max(10, descLines.length * 4 + 4);

  doc.setFillColor(255, 255, 255);
  doc.rect(ML, y, CW, lineH, "F");
  doc.setDrawColor(...LGRAY); doc.setLineWidth(0.2);
  doc.rect(ML, y, CW, lineH, "S");

  doc.setFont(font, "normal"); doc.setFontSize(9.5); doc.setTextColor(...DARK);
  let dy = y + 5;
  for (const line of descLines) { doc.text(line, ML + 4, dy); dy += 4; }
  doc.text(`${vatRate}%`, ML + CW - 55, y + 5);
  const htStr = fmtMoney(amountHt);
  doc.text(htStr, ML + CW - 4 - doc.getTextWidth(htStr), y + 5);
  y += lineH + 4;

  // \u2500\u2500 R\u00E9cap totaux (align\u00E9s droite) \u2500\u2500
  const recapX = ML + CW - 70;
  const valX   = ML + CW;
  const recapRows = [
    { label: "Total HT",           value: fmtMoney(amountHt),  bold: false },
    { label: `TVA (${vatRate}%)`,  value: fmtMoney(amountVat), bold: false },
    { label: "Total TTC",          value: fmtMoney(amountTtc), bold: true  },
  ];
  for (const r of recapRows) {
    doc.setFont(font, r.bold ? "bold" : "normal");
    doc.setFontSize(r.bold ? 12 : 9.5);
    doc.setTextColor(...(r.bold ? DARK : GRAY));
    if (r.bold) {
      // Bandeau ambr\u00E9 pour le TTC
      doc.setFillColor(...AMBER);
      doc.rect(recapX, y - 4, CW - (recapX - ML), 8, "F");
      doc.setTextColor(255, 255, 255);
    }
    doc.text(r.label, recapX + 2, y + (r.bold ? 1 : 0));
    const valStr = r.value;
    doc.text(valStr, valX - doc.getTextWidth(valStr), y + (r.bold ? 1 : 0));
    y += r.bold ? 10 : 5;
  }
  y += 4;

  // \u2500\u2500 Conditions de paiement \u2500\u2500
  doc.setFont(font, "bold"); doc.setFontSize(8.5); doc.setTextColor(...GRAY);
  doc.text("CONDITIONS DE PAIEMENT", ML, y); y += 5;

  doc.setFont(font, "normal"); doc.setFontSize(9.5); doc.setTextColor(...DARK);
  const payNote = profile?.invoicePaymentNote
    || `Paiement \u00E0 l'\u00E9ch\u00E9ance du ${fmtDateBE(invoice.due_date)} par virement bancaire.`;
  const payLines = doc.splitTextToSize(payNote, CW);
  for (const l of payLines.slice(0, 3)) { doc.text(l, ML, y); y += 4; }
  y += 2;

  if (profile?.iban) {
    doc.setFont(font, "bold"); doc.setFontSize(9.5); doc.setTextColor(...DARK);
    doc.text(`IBAN : ${profile.iban}`, ML, y); y += 5;
  }
  if (invoice.payment_ref) {
    doc.setFont(font, "normal"); doc.setFontSize(9.5); doc.setTextColor(...DARK);
    doc.text(`Communication : ${invoice.payment_ref}`, ML, y); y += 5;
  }

  if (invoice.notes) {
    y += 4;
    doc.setFont(font, "bold"); doc.setFontSize(8.5); doc.setTextColor(...GRAY);
    doc.text("NOTES", ML, y); y += 5;
    doc.setFont(font, "normal"); doc.setFontSize(9); doc.setTextColor(...DARK);
    const nl = doc.splitTextToSize(invoice.notes, CW);
    for (const l of nl.slice(0, 6)) { doc.text(l, ML, y); y += 4; }
  }

  // \u2500\u2500 Footer \u2500\u2500
  doc.setFont(font, "normal"); doc.setFontSize(7); doc.setTextColor(...GRAY);
  const footer = profile?.vatNumber
    ? `Facture \u00E9mise par ${profile?.structure || profile?.name || "ArchiPilot"} \u2014 TVA ${profile.vatNumber}`
    : `Facture \u00E9mise par ${profile?.structure || profile?.name || "ArchiPilot"}`;
  doc.text(footer, W / 2, H - 8, { align: "center" });

  // Filigrane si brouillon (status 'draft' ou option explicite)
  if (invoice.status === "draft" || options.draft) {
    try {
      doc.saveGraphicsState();
      doc.setGState(new doc.GState({ opacity: 0.08 }));
      doc.setFont(font, "bold"); doc.setFontSize(96); doc.setTextColor(...GRAY);
      doc.text("BROUILLON", W / 2, H / 2, { align: "center", angle: 45 });
      doc.restoreGraphicsState();
    } catch (_) {
      doc.setFont(font, "bold"); doc.setFontSize(96); doc.setTextColor(230, 225, 220);
      doc.text("BROUILLON", W / 2, H / 2, { align: "center", angle: 45 });
    }
  }

  // Filigrane Free
  if (profile?.plan === "free") {
    try {
      doc.saveGraphicsState();
      doc.setGState(new doc.GState({ opacity: 0.1 }));
      doc.setFont(font, "bold"); doc.setFontSize(64); doc.setTextColor(...GRAY);
      doc.text("ArchiPilot Free", W / 2, H * 0.78, { align: "center", angle: 45 });
      doc.restoreGraphicsState();
    } catch (_) { /* ignore */ }
  }

  const safeNum = (invoice.number || "DRAFT").replace(/[^\w-]/g, "_");
  const safeClient = (invoice.client_name || "client").replace(/[^\w\s\u00C0-\u024F]/g, "").replace(/\s+/g, "_");
  const fileName = `Facture_${safeNum}_${safeClient}.pdf`;
  if (options.returnDataUrl) {
    return { dataUrl: doc.output("datauristring"), fileName };
  }
  doc.save(fileName);
  return { fileName };
}
