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
      ctx.fillStyle = "#C95A1B";
      ctx.beginPath(); ctx.arc(mx, cy, r, 0, 2 * Math.PI); ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      // White border
      ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(2, r * 0.18);
      ctx.beginPath(); ctx.arc(mx, cy, r, 0, 2 * Math.PI); ctx.stroke();
      // Triangle pointer
      ctx.fillStyle = "#C95A1B";
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

  const AMBER  = hexToRgb(profile?.pdfColor || "#C95A1B");
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
