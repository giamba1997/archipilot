import { useState, useRef, useEffect } from "react";
import { jsPDF } from "jspdf";
import { LangContext, useT, useTP } from "./i18n";
import { supabase } from "./supabase";
import { loadProjects as dbLoadProjects, saveProjects as dbSaveProjects, loadProfile as dbLoadProfile, saveProfile as dbSaveProfile, uploadPhoto, deletePhoto, getPhotoUrl } from "./db";

const AC = "#D97B0D";
const ACL = "#FDF4E7";
const ACL2 = "#FAE9CF";
const SB = "#F7F6F4";
const SB2 = "#EEEDEA";
const SBB = "#E2E1DD";
const TX = "#1D1D1B";
const TX2 = "#6B6B66";
const TX3 = "#767672";
const BG = "#FAFAF9";
const WH = "#FFFFFF";
const RD = "#C4392A";
const GR = "#2D8A4E";

const BL   = "#2B6CB0";   // Bleu (permis, versions)
const BLB  = "#E6F1FB";   // Bleu clair fond
const OR   = "#D85A30";   // Orange (chantier)
const ORB  = "#FAECE7";   // Orange clair fond
const VI   = "#6366F1";   // Violet (indigo)
const VIB  = "#EDEFFD";   // Violet clair fond
const TE   = "#0E7490";   // Teal
const TEB  = "#E0F5F9";   // Teal clair fond
const PU   = "#9F7AEA";   // Pourpre
const PUB  = "#F3EEFB";   // Pourpre clair fond
const GRY  = "#6B6B66";   // Gris fermé
const GRYB = "#F1EFE8";   // Gris fermé clair fond
const REDBG  = "#FEF2F2"; // Fond rouge clair
const REDBRD = "#FECACA"; // Bordure rouge clair
const GRBG   = "#EAF3DE"; // Fond vert clair
const DIS    = "#D3D1C7"; // Désactivé fond
const DIST   = "#A3A39D"; // Désactivé texte

const STATUSES = [
  { id: "sketch",       label: "Esquisse",      color: PU,  bg: PUB  },
  { id: "preliminary",  label: "Avant-projet",  color: VI,  bg: VIB  },
  { id: "permit",       label: "Permis",        color: BL,  bg: BLB  },
  { id: "execution",    label: "Exécution",     color: AC,  bg: ACL  },
  { id: "construction", label: "Chantier",      color: OR,  bg: ORB  },
  { id: "reception",    label: "Réception",     color: GR,  bg: GRBG },
  { id: "closed",       label: "Clôturé",       color: GRY, bg: GRYB },
];

const getStatus = (id) => STATUSES.find((s) => s.id === id) || STATUSES[0];

const RECURRENCES = [
  { id: "none", label: "Pas de récurrence" },
  { id: "weekly", label: "1x par semaine" },
  { id: "biweekly", label: "1x / 2 semaines" },
  { id: "monthly", label: "1x par mois" },
];

const STRUCTURE_TYPES = [
  { id: "architecte", label: "Architecte" },
  { id: "bureau_etudes", label: "Bureau d'études" },
  { id: "promoteur", label: "Promoteur immobilier" },
  { id: "entreprise_construction", label: "Entreprise de construction" },
  { id: "autre", label: "Autre" },
];

const INIT_PROFILE = {
  name: "Gaëlle CNOP",
  structure: "DEWIL architecten",
  structureType: "architecte",
  address: "",
  phone: "0474 50 85 80",
  email: "gaelle@dewil-architect.be",
  picture: null,
  pdfColor: "#D97B0D",
  pdfFont: "helvetica",
  apiKey: "",
  lang: "fr",
};

const COLOR_PRESETS = [
  { value: "#D97B0D", label: "Ambre" },
  { value: "#2B6CB0", label: "Bleu" },
  { value: "#2D8A4E", label: "Vert" },
  { value: "#6366F1", label: "Indigo" },
  { value: "#C4392A", label: "Terre cuite" },
  { value: "#2D2D2A", label: "Anthracite" },
];

const FONT_OPTIONS = [
  { id: "helvetica", label: "Helvetica", desc: "Sans-sérif, moderne" },
  { id: "times",     label: "Times",     desc: "Sérif, classique" },
];

const DOC_CATEGORIES = [
  { id: "plans",  label: "Plans",           color: BL,  bg: BLB  },
  { id: "admin",  label: "Administratif",   color: VI,  bg: VIB  },
  { id: "photos", label: "Photos chantier", color: GR,  bg: GRBG },
];

const CHECKLIST_TEMPLATES = [
  {
    id: "visit",
    label: "Visite de chantier",
    color: BL, bg: BLB,
    items: [
      { text: "EPI disponibles sur chantier",        section: "Sécurité" },
      { text: "Clôture et signalisation en place",   section: "Sécurité" },
      { text: "Panneau de chantier conforme",        section: "Sécurité" },
      { text: "Implantation vérifiée / conforme plans", section: "Gros œuvre" },
      { text: "Fouilles et fondations conformes",    section: "Gros œuvre" },
      { text: "Armatures contrôlées avant coulage",  section: "Gros œuvre" },
      { text: "Réservations réalisées",              section: "Gros œuvre" },
      { text: "Menuiseries : dimensions conformes",  section: "Menuiseries" },
      { text: "Calfeutrement et étanchéité OK",      section: "Menuiseries" },
      { text: "Surfaces sans défauts apparents",     section: "Finitions" },
      { text: "Joints et raccords réalisés",         section: "Finitions" },
      { text: "Nettoyage effectué",                  section: "Finitions" },
    ],
  },
  {
    id: "reception",
    label: "Réception provisoire",
    color: GR, bg: GRBG,
    items: [
      { text: "Plans as-built remis au MO",          section: "Documents" },
      { text: "Carnets d'entretien remis",            section: "Documents" },
      { text: "Attestations techniques remises",      section: "Documents" },
      { text: "Dossier d'intervention ultérieure (DIU)", section: "Documents" },
      { text: "PEB complété et déposé",               section: "Documents" },
      { text: "Essai d'étanchéité à l'air effectué",  section: "Technique" },
      { text: "Installations HVAC testées",            section: "Technique" },
      { text: "Installations électriques vérifiées",   section: "Technique" },
      { text: "Installations sanitaires testées",      section: "Technique" },
      { text: "Défauts de finition répertoriés",       section: "Réception" },
      { text: "Nettoyage final effectué",              section: "Réception" },
      { text: "Débarras du chantier",                  section: "Réception" },
      { text: "Clés et accès remis au MO",             section: "Réception" },
    ],
  },
  {
    id: "structure",
    label: "Contrôle structure",
    color: RD, bg: REDBG,
    items: [
      { text: "Profondeur de fondations conforme",    section: "Fondations" },
      { text: "Sol de fondation contrôlé (portance)", section: "Fondations" },
      { text: "Armatures fondations vérifiées",       section: "Fondations" },
      { text: "Poteaux et poutres conformes aux plans", section: "Structure" },
      { text: "Dalle de plancher conforme",            section: "Structure" },
      { text: "Voiles porteurs conformes",             section: "Structure" },
      { text: "Linteaux et seuils conformes",          section: "Structure" },
      { text: "Structure de toiture conforme",         section: "Toiture" },
      { text: "Étanchéité posée et contrôlée",         section: "Toiture" },
      { text: "Évacuations d'eaux pluviales réalisées", section: "Toiture" },
    ],
  },
  { id: "blank", label: "Liste vide", color: GRY, bg: GRYB, items: [] },
];

const REMARK_STATUSES = [
  { id: "open",     label: "À traiter", color: "#B91C1C", bg: "#FEF2F2", dot: "#EF4444" },
  { id: "progress", label: "En cours",  color: "#92400E", bg: "#FFFBEB", dot: AC },
  { id: "done",     label: "Résolu",    color: "#166534", bg: "#F0FDF4", dot: GR },
];
const nextStatus = (s) => s === "open" ? "progress" : s === "progress" ? "done" : "open";
const getRemarkStatus = (id) => REMARK_STATUSES.find((s) => s.id === id) || REMARK_STATUSES[0];

const PV_STATUSES = [
  { id: "draft",     label: "Brouillon", color: GRY,      bg: GRYB,  dot: "#B0AFA9" },
  { id: "review",    label: "À relire",  color: "#92400E", bg: "#FFFBEB", dot: AC },
  { id: "validated", label: "Validé",    color: "#166534", bg: "#F0FDF4", dot: GR },
  { id: "sent",      label: "Envoyé",    color: BL,       bg: BLB,   dot: BL },
  { id: "late",      label: "En retard", color: "#B91C1C", bg: "#FEF2F2", dot: "#EF4444" },
];
const getPvStatus  = (id) => PV_STATUSES.find((s) => s.id === id) || PV_STATUSES[0];
const nextPvStatus = (id) => { const i = PV_STATUSES.findIndex(s => s.id === id); return PV_STATUSES[(i + 1) % PV_STATUSES.length].id; };

const LOT_COLORS = [
  { id: "amber",  value: AC,  bg: ACL  },
  { id: "blue",   value: BL,  bg: BLB  },
  { id: "green",  value: GR,  bg: GRBG },
  { id: "violet", value: VI,  bg: VIB  },
  { id: "red",    value: RD,  bg: REDBG},
  { id: "teal",   value: TE,  bg: TEB  },
];

const calcLotStatus = (lot) => {
  const now   = new Date(); now.setHours(0,0,0,0);
  const start = lot.startDate ? new Date(lot.startDate) : null;
  const end   = lot.endDate   ? new Date(lot.endDate)   : null;
  if (lot.progress >= 100) return { id: "done",    label: "Terminé",  color: GR,  bg: GRBG  };
  if (end && now > end)    return { id: "delayed", label: "En retard", color: RD,  bg: REDBG };
  if (start && now >= start) return { id: "active", label: "En cours", color: AC,  bg: ACL   };
  return { id: "planned", label: "Planifié", color: BL, bg: BLB };
};

const parseNotesToRemarks = (notes) =>
  notes.split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => ({
      id: Date.now() + Math.random(),
      text: l.replace(/^[-–>]\s*/, ""),
      urgent: l.startsWith(">"),
      status: "open",
    }));

// Backward-compatible getter: supports both legacy flat docs and versioned docs
const getDocCurrent = (doc) => {
  if (doc.versions && doc.versions.length > 0) {
    const v = doc.versions[doc.versions.length - 1];
    return { dataUrl: v.dataUrl, size: v.size, type: v.type, addedAt: v.addedAt, version: doc.versions.length };
  }
  return { dataUrl: doc.dataUrl, size: doc.size, type: doc.type, addedAt: doc.addedAt, version: 1 };
};

const hexToRgb = (hex) => {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
};

// Composite plan image + annotation strokes + markers on an off-screen canvas
const compositePlanImage = (project) => new Promise((resolve) => {
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
      ctx.fillStyle = "#D97B0D";
      ctx.beginPath(); ctx.arc(mx, cy, r, 0, 2 * Math.PI); ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      // White border
      ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(2, r * 0.18);
      ctx.beginPath(); ctx.arc(mx, cy, r, 0, 2 * Math.PI); ctx.stroke();
      // Triangle pointer
      ctx.fillStyle = "#D97B0D";
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

async function generatePDF(project, pvNum, date, result, profile) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, H = 297;
  const ML = 18, MR = 18;
  const CW = W - ML - MR; // 174 mm

  const AMBER  = hexToRgb(profile?.pdfColor || "#D97B0D");
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

  if (profile?.picture) {
    try { doc.addImage(profile.picture, imgFmt(profile.picture), W - MR - 22, 13, 22, 22); } catch (_) {}
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

    const isSec     = /^\d{1,2}[.\-]\s/.test(t) && t.length < 90;
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

  // ── PLAN DU CHANTIER ───────────────────────────────────────
  const markers = project.planMarkers || [];
  if (project.planImage && markers.length > 0) {
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
      try { doc.addImage(composite.dataUrl, "JPEG", ML, y, planW, planH); } catch (_) {}
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
        try { const phUrl = getPhotoUrl(ph); doc.addImage(phUrl, imgFmt(phUrl), ML + col * (imgW + gap), y, imgW, imgH); } catch (_) {}
      });
      y += imgH + 8;
    });
  }

  // ── PIED DE PAGE (toutes les pages) ────────────────────────
  const total = doc.internal.getNumberOfPages();
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
  }

  const safeName = project.name.replace(/[^\w\s]/g, "").replace(/\s+/g, "_");
  const safeDate = date.replace(/\//g, "-");
  doc.save(`PV_${pvNum}_${safeName}_${safeDate}.pdf`);
}

function Ico({ name, size = 18, color = TX3 }) {
  const paths = {
    menu: "M3 12h18 M3 6h18 M3 18h18",
    x: "M18 6L6 18 M6 6l12 12",
    back: "M15 18l-6-6 6-6",
    file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8",
    edit: "M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z",
    check: "M20 6L9 17l-5-5",
    plus: "M12 5v14 M5 12h14",
    send: "M22 2L11 13 M22 2l-7 20-4-9-9-4z",
    users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    clock: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M12 6v6l4 2",
    alert: "M12 9v4 M12 17h.01",
    building: "M3 21h18 M5 21V7l8-4v18 M19 21V11l-6-4",
    copy: "M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2z M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
    calendar: "M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z M16 2v4 M8 2v4 M3 10h18",
    trash: "M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
    save: "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z M17 21v-8H7v8 M7 3v5h8",
    chart: "M18 20V10 M12 20V4 M6 20v-6",
    archive: "M21 8v13H3V8 M1 3h22v5H1z M10 12h4",
    dup: "M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1z M20 5H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z",
    mail: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M22 6l-10 7L2 6",
    phone: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z",
    eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z",
    repeat: "M17 1l4 4-4 4 M3 11V9a4 4 0 0 1 4-4h14 M7 23l-4-4 4-4 M21 13v2a4 4 0 0 1-4 4H3",
    camera: "M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    mappin: "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
    folder: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z",
    download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3",
    wifioff: "M1 1l22 22 M16.72 11.06A10.94 10.94 0 0 1 19 12.55 M5 12.55a10.94 10.94 0 0 1 5.17-2.39 M10.71 5.05A16 16 0 0 1 22.56 9 M1.42 9a15.91 15.91 0 0 1 4.7-2.88 M8.53 16.11a6 6 0 0 1 6.95 0 M12 20h.01",
    install: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M12 8v8 M8 12l4 4 4-4",
    gantt:  "M3 5h4v3H3z M3 10h8v3H3z M3 15h6v3H3z M10 6h11 M10 11h7 M10 16h9",
    upload:    "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12",
    listcheck: "M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
    checksq:   "M9 11l3 3 5-5 M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
    arrowr: "M5 12h14 M12 5l7 7-7 7",
    rectc:  "M3 3h18v18H3z",
    circlec:"M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z",
    pen2:   "M12 20h9 M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z",
    textT:  "M4 7V4h16v3 M9 20h6 M12 4v16",
    search: "M11 17a6 6 0 1 0 0-12 6 6 0 0 0 0 12z M21 21l-4.35-4.35",
    history: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M12 6v6l4 2",
    mic: "M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v4 M8 23h8",
    "chevron-down": "M6 9l6 6 6-6",
    "chevron-up":   "M18 15l-6-6-6 6",
    undo:           "M3 7v6h6 M3 13a9 9 0 1 0 2.64-6.36",
    line:           "M5 19L19 5",
    fit:            "M4 8V4h4M4 4l5 5M20 8V4h-4m4 0l-5 5M4 16v4h4m-4 0l5-5M20 16v4h-4m4 0l-5-5",
    cursor:         "M4 4l7 19 3-7 7-3z",
    "eye-off":      "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94 M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19 M1 1l22 22",
    bold:           "M6 4h8a4 4 0 0 1 0 8H6z M6 12h9a4 4 0 0 1 0 8H6z",
    italic:         "M19 4h-9 M14 20H5 M15 4L9 20",
    move:           "M5 9l-3 3 3 3 M9 5l3-3 3 3 M15 19l-3 3-3-3 M19 9l3 3-3 3 M2 12h20 M12 2v20",
    layers:         "M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5",
    pipette:        "M7 21l-4-4 8.5-8.5 4 4L7 21z M14.5 5.5l4 4 M16.5 3.5a2.12 2.12 0 0 1 3 3l-2 2-4-4 2-2z",
  };
  const d = paths[name] || "";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {d.split(" M").map((seg, i) => (
        <path key={i} d={i === 0 ? seg : "M" + seg} />
      ))}
    </svg>
  );
}

function PB({ value }) {
  return (
    <div style={{ width: "100%", height: 7, borderRadius: 4, background: SB2, overflow: "hidden" }}>
      <div style={{ width: `${value}%`, height: "100%", borderRadius: 4, background: value > 60 ? GR : value > 30 ? AC : RD, transition: "width 0.4s" }} />
    </div>
  );
}

function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: WH, borderRadius: 14, width: "100%", maxWidth: wide ? 640 : 520, maxHeight: "85vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)", animation: "modalIn 0.18s ease" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: `1px solid ${SBB}`, position: "sticky", top: 0, background: WH, borderRadius: "14px 14px 0 0", zIndex: 1 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: TX }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: "8px", minWidth: 36, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6 }}>
            <Ico name="x" color={TX3} />
          </button>
        </div>
        <div style={{ padding: "16px 18px 18px" }}>{children}</div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, area, half, type = "text", placeholder, select, options }) {
  const base = { width: "100%", padding: area ? 12 : "9px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: SB, color: TX, boxSizing: "border-box" };
  return (
    <div style={{ flex: half ? 1 : undefined, marginBottom: 12 }}>
      {label && <div style={{ fontSize: 12, fontWeight: 500, color: TX2, marginBottom: 4 }}>{label}</div>}
      {select ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...base, appearance: "auto" }}>
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      ) : area ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={4} placeholder={placeholder} style={{ ...base, resize: "vertical", lineHeight: 1.6 }} />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={base} />
      )}
    </div>
  );
}

function StatusBadge({ statusId, small }) {
  const s = getStatus(statusId);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: small ? 10 : 11, fontWeight: 600, color: s.color, background: s.bg, padding: small ? "2px 7px 2px 5px" : "3px 10px 3px 7px", borderRadius: 20, whiteSpace: "nowrap", letterSpacing: "0.01em" }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.color, display: "inline-block", flexShrink: 0 }} />
      {s.label}
    </span>
  );
}

function PvStatusBadge({ status, onClick }) {
  const s = getPvStatus(status || "draft");
  return (
    <button
      onClick={onClick}
      title={onClick ? "Cliquer pour changer le statut" : undefined}
      style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px 2px 6px", border: `1px solid ${s.bg}`, borderRadius: 20, background: s.bg, cursor: onClick ? "pointer" : "default", fontFamily: "inherit", outline: "none" }}
    >
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.dot, display: "inline-block", flexShrink: 0 }} />
      <span style={{ fontSize: 10, fontWeight: 600, color: s.color, letterSpacing: "0.01em" }}>{s.label}</span>
    </button>
  );
}

function KpiCard({ iconName, label, value, color = TX, sub, extra }) {
  return (
    <div style={{ flex: "1 1 140px", background: WH, border: `1px solid ${SBB}`, borderRadius: 10, padding: "16px 14px", animation: "fadeIn 0.2s ease" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: SB, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Ico name={iconName} size={14} color={TX3} />
        </div>
        <span style={{ fontSize: 11, color: TX3, fontWeight: 500 }}>{label}</span>
        {extra}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color, letterSpacing: "-0.02em", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: TX3, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

const INIT_PROJECTS = [
  {
    id: 1, name: "SNCB Hall n°6", client: "SNCB sa", contractor: "LAURENTY",
    desc: "Rénovation et aménagement des espaces de travail", address: "Schaerbeek, Bruxelles",
    statusId: "construction", progress: 72, bureau: "DEWIL architecten",
    startDate: "25/09/2025", endDate: "28/09/2026", nextMeeting: "09/04/2026", recurrence: "weekly", archived: false,
    participants: [
      { role: "MO", name: "Giorgio CUOMO", email: "giorgio.cuomo@belgiantrain.be", phone: "0491 99 96 67" },
      { role: "MO", name: "Roselien VANDERHASSELT", email: "roselien.vanderhasselt@belgiantrain.be", phone: "0490 49 20 81" },
      { role: "Entreprise", name: "François HAMACKER", email: "francois.hamacker@laurenty.com", phone: "0471 10 75 12" },
      { role: "Architecte", name: "Gaëlle CNOP", email: "gaelle@dewil-architect.be", phone: "0474 50 85 80" },
    ],
    posts: [
      { id: "01", label: "Situation du chantier", notes: "" }, { id: "02", label: "Généralités", notes: "" },
      { id: "03", label: "Planning", notes: "" }, { id: "04", label: "Documents", notes: "" },
      { id: "12", label: "Démolition", notes: "" }, { id: "23", label: "Maçonnerie intérieure", notes: "" },
      { id: "36", label: "Châssis aluminium", notes: "" }, { id: "45", label: "Carrelage sols", notes: "" },
      { id: "49", label: "Faux-plafonds", notes: "" }, { id: "53", label: "Portes intérieures", notes: "" },
      { id: "59", label: "Cloisons", notes: "" },
      { id: "70-HVAC", label: "HVAC", notes: "" }, { id: "70-SAN", label: "Sanitaire", notes: "" }, { id: "70-ELEC", label: "Électricité", notes: "" },
    ],
    pvHistory: [
      { number: 28, date: "01/04/2026", author: "Gaëlle CNOP", postsCount: 14, excerpt: "Peinture démarrée RDC, resserrages coupe-feu en retard...", content: "01. Situation du chantier\n- Les travaux de peinture ont débuté au rez-de-chaussée.\n> Les resserrages coupe-feu n'ont toujours pas été réalisés.\n\n02. Généralités\n- Le MO rappelle l'obligation du port du gilet et du casque.\n\n03. Planning\n- Réception phase 1 repoussée au 22/04/2026." },
      { number: 27, date: "25/03/2026", author: "Gaëlle CNOP", postsCount: 12, excerpt: "Vitrages cloisons mobiles posés, faux-plafonds en cours...", content: "01. Situation\n- Les vitrages des cloisons mobiles ont été posés.\n- La structure des faux-plafonds est en cours." },
      { number: 26, date: "18/03/2026", author: "Meriam GAALOUL", postsCount: 11, excerpt: "Double porte installée, linteau abaissé...", content: "01. Situation\n- La double porte destinée aux dépanneurs est installée.\n- Le linteau a été abaissé." },
    ],
    actions: [
      { id: 1, text: "Resserrages coupe-feu à réaliser", who: "LAURENTY", urgent: true, open: true, since: "PV 26" },
      { id: 2, text: "FT électricité manquantes", who: "LAURENTY", urgent: true, open: true, since: "PV 27" },
      { id: 3, text: "Évaluer peinture atelier", who: "Architecte", urgent: false, open: true, since: "PV 28" },
    ],
  },
  {
    id: 2, name: "Résidence Parc Léopold", client: "Immo Invest SA", contractor: "BESIX",
    desc: "Construction de 24 appartements", address: "Etterbeek, Bruxelles",
    statusId: "execution", progress: 45, bureau: "DEWIL architecten",
    startDate: "15/01/2026", endDate: "15/03/2027", nextMeeting: "10/04/2026", recurrence: "weekly", archived: false,
    participants: [
      { role: "MO", name: "Philippe RENARD", email: "p.renard@immoinvest.be", phone: "0475 12 34 56" },
      { role: "Entreprise", name: "Marc DUBOIS", email: "m.dubois@besix.com", phone: "0476 78 90 12" },
      { role: "Architecte", name: "Gaëlle CNOP", email: "gaelle@dewil-architect.be", phone: "0474 50 85 80" },
    ],
    posts: [
      { id: "01", label: "Situation du chantier", notes: "" }, { id: "02", label: "Généralités", notes: "" },
      { id: "03", label: "Planning", notes: "" }, { id: "20", label: "Fondations", notes: "" },
      { id: "21", label: "Gros œuvre", notes: "" }, { id: "30", label: "Toiture", notes: "" },
    ],
    pvHistory: [{ number: 15, date: "28/03/2026", author: "Gaëlle CNOP", postsCount: 6, excerpt: "Coffrage étage 2 terminé...", content: "01. Situation\n- Coffrage étage 2 terminé.\n- Béton coulé." }],
    actions: [{ id: 1, text: "Plans étage 3 à valider", who: "Architecte", urgent: true, open: true, since: "PV 15" }],
  },
];

const SAMPLES = { "01": "- peinture démarrée rdc, 1ere couche ok\n- goulottes en cours\n- resserrages coupe-feu TOUJOURS PAS FAITS\n> retard 5 jours ouvrables", "02": "- MO rappelle: gilet fluo + casque obligatoires\n- nettoyage insuffisant", "03": "- réception phase 1 repoussée au 22/04", "45": "- bandes antislip posées, conforme\n- carrelage meeting #6 remplacé", "59": "- film opaque posé ok\n- joints vitrages à reprendre", "70-HVAC": "- flexibles corrigés 6/10\n- radiateur hall commandé", "70-ELEC": "- goulottes 5 locaux ok\n- screens en cours" };

function Sidebar({ projects, activeId, onSelect, open, onClose, profile, onNewProject, onProfile, installable, onInstall }) {
  const [sortBy, setSortBy] = useState("recency");
  const [archivedOpen, setArchivedOpen] = useState(false);
  const t = useT();
  const active = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);
  const sortedActive = [...active].sort((a, b) => {
    if (sortBy === "name") return a.name.localeCompare(b.name, "fr");
    const aDate = a.pvHistory?.[0]?.date || "";
    const bDate = b.pvHistory?.[0]?.date || "";
    return bDate.localeCompare(aDate) || b.id - a.id;
  });

  return (
    <div style={{ position: "fixed", left: 0, top: 0, bottom: 0, width: 264, background: SB, borderRight: `1px solid ${SBB}`, display: "flex", flexDirection: "column", zIndex: 100, transform: open ? "translateX(0)" : "translateX(-264px)", transition: "transform 0.25s ease" }}>

      {/* ── Branding ── */}
      <div style={{ padding: "16px 18px 14px", borderBottom: `1px solid ${SBB}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: AC, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 15, fontWeight: 800, letterSpacing: "-0.5px", flexShrink: 0 }}>A</div>
          <div>
            <div style={{ color: TX, fontSize: 14, fontWeight: 700, letterSpacing: "-0.2px" }}>ArchiPilot</div>
            <div style={{ color: TX3, fontSize: 10, marginTop: 1 }}>{t("app.tagline")}</div>
          </div>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 10px 10px" }}>

        {/* Action principale */}
        <button onClick={onNewProject} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 0", border: "none", borderRadius: 8, background: AC, cursor: "pointer", fontFamily: "inherit", marginBottom: 16 }}>
          <Ico name="plus" size={13} color="#fff" />
          <span style={{ fontSize: 12, fontWeight: 700, color: "#fff", letterSpacing: "0.01em" }}>{t("sidebar.newProject")}</span>
        </button>

        {/* Label section + tri */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px", marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: TX2 }}>{t("sidebar.projects")}</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: AC, background: ACL, padding: "1px 6px", borderRadius: 10, lineHeight: "16px" }}>{active.length}</span>
          </div>
          {/* Tri compact */}
          <div style={{ display: "flex", background: SB2, borderRadius: 6, padding: 2, gap: 1 }}>
            <button onClick={() => setSortBy("recency")} style={{ display: "flex", alignItems: "center", gap: 3, padding: "3px 8px", border: "none", borderRadius: 5, background: sortBy === "recency" ? WH : "transparent", cursor: "pointer", fontFamily: "inherit", boxShadow: sortBy === "recency" ? "0 1px 2px rgba(0,0,0,0.08)" : "none", transition: "all 0.15s" }}>
              <Ico name="clock" size={10} color={sortBy === "recency" ? AC : TX3} />
              <span style={{ fontSize: 10, fontWeight: 600, color: sortBy === "recency" ? AC : TX3 }}>{t("sidebar.recent")}</span>
            </button>
            <button onClick={() => setSortBy("name")} style={{ display: "flex", alignItems: "center", gap: 3, padding: "3px 8px", border: "none", borderRadius: 5, background: sortBy === "name" ? WH : "transparent", cursor: "pointer", fontFamily: "inherit", boxShadow: sortBy === "name" ? "0 1px 2px rgba(0,0,0,0.08)" : "none", transition: "all 0.15s" }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: sortBy === "name" ? AC : TX3 }}>{t("sidebar.az")}</span>
            </button>
          </div>
        </div>

        {/* Liste des projets */}
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {sortedActive.map((p) => {
            const st = getStatus(p.statusId);
            const isActive = activeId === p.id;
            return (
              <button
                key={p.id}
                onClick={() => { onSelect(p.id); onClose(); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 9,
                  padding: isActive ? "9px 10px 9px 10px" : "8px 10px 8px 12px",
                  border: "none",
                  borderLeft: isActive ? `3px solid ${AC}` : "3px solid transparent",
                  borderRadius: 8, cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                  background: isActive ? WH : "transparent",
                  boxShadow: isActive ? "0 1px 5px rgba(0,0,0,0.06)" : "none",
                  transition: "background 0.12s, box-shadow 0.12s",
                }}
              >
                <div style={{ width: 30, height: 30, borderRadius: 7, background: isActive ? st.bg : SB2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.12s" }}>
                  <Ico name="building" size={14} color={isActive ? st.color : TX3} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: isActive ? 650 : 500, color: isActive ? TX : TX2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: "17px" }}>{p.name}</div>
                  <div style={{ fontSize: 10, color: isActive ? TX3 : "#A3A39D", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {p.client}{(p.pvHistory || []).length > 0 ? <span style={{ color: isActive ? AC : "#BBBBB5", fontWeight: 600 }}> · PV{p.pvHistory.length}</span> : ""}
                  </div>
                </div>
                {isActive && (
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: AC, flexShrink: 0, opacity: 0.7 }} />
                )}
              </button>
            );
          })}
        </div>

        {/* Section Archivés */}
        <div style={{ marginTop: 16 }}>
          <button
            onClick={() => setArchivedOpen((v) => !v)}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 4px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: TX2 }}>{t("sidebar.archived")}</span>
              {archived.length > 0 && (
                <span style={{ fontSize: 10, fontWeight: 600, color: TX3, background: SB2, padding: "1px 6px", borderRadius: 10 }}>{archived.length}</span>
              )}
            </div>
            {archived.length > 0 && (
              <Ico name={archivedOpen ? "chevron-up" : "chevron-down"} size={11} color={TX3} />
            )}
          </button>

          {archived.length === 0 && (
            <div style={{ padding: "8px 4px 2px", fontSize: 11, color: "#B0AFA9", fontStyle: "italic" }}>{t("sidebar.noArchived")}</div>
          )}

          {archivedOpen && archived.map((p) => (
            <button key={p.id} onClick={() => { onSelect(p.id); onClose(); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "7px 10px 7px 12px", border: "none", borderLeft: "3px solid transparent", borderRadius: 8, cursor: "pointer", textAlign: "left", fontFamily: "inherit", background: "transparent", marginTop: 1 }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: SB2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: 0.6 }}>
                <Ico name="archive" size={13} color={TX3} />
              </div>
              <span style={{ fontSize: 12, color: TX3, opacity: 0.75, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
            </button>
          ))}
        </div>

      </div>

      {/* ── Installer PWA ── */}
      {installable && (
        <div style={{ padding: "0 10px 10px", flexShrink: 0 }}>
          <button onClick={onInstall} style={{ width: "100%", padding: "9px 12px", border: `1px solid ${ACL2}`, borderRadius: 8, background: ACL, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontFamily: "inherit" }}>
            <Ico name="install" size={14} color={AC} />
            <div style={{ flex: 1, textAlign: "left" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: AC }}>{t("sidebar.install")}</div>
              <div style={{ fontSize: 10, color: TX3, marginTop: 1 }}>{t("sidebar.installDesc")}</div>
            </div>
          </button>
        </div>
      )}

      {/* ── Déconnexion ── */}
      <div style={{ padding: "0 10px 12px", flexShrink: 0 }}>
        <button
          onClick={() => supabase.auth.signOut()}
          style={{ width: "100%", padding: "8px 12px", border: `1px solid ${SBB}`, borderRadius: 8, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontFamily: "inherit" }}
        >
          <Ico name="back" size={13} color={TX3} />
          <span style={{ fontSize: 11, fontWeight: 500, color: TX3 }}>{t("sidebar.logout")}</span>
        </button>
      </div>

    </div>
  );
}

function Overview({ project, onStartNotes, onEditInfo, onEditParticipants, onViewPV, onViewPlan, onViewDocs, onViewPlanning, onViewChecklists, onArchive, onDuplicate, onImportPV, setProjects }) {
  const updatePvStatus = (pvNum, newStatus) => setProjects(prev => prev.map(p => p.id === project.id ? { ...p, pvHistory: p.pvHistory.map(pv => pv.number === pvNum ? { ...pv, status: newStatus } : pv) } : p));
  const urgent = project.actions.filter((a) => a.urgent && a.open);
  const toggleAction = (aid) => setProjects((prev) => prev.map((p) => p.id === project.id ? { ...p, actions: p.actions.map((a) => a.id === aid ? { ...a, open: !a.open } : a) } : p));
  const rec = RECURRENCES.find((r) => r.id === project.recurrence);
  const t = useT();

  const openActions   = project.actions.filter((a) => a.open);
  const closedActions = project.actions.filter((a) => !a.open);
  const lastPV        = project.pvHistory[0] || null;
  const Card = ({ children, style = {} }) => (
    <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 12, padding: "16px 18px", ...style }}>{children}</div>
  );
  const CardHeader = ({ title, action }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: TX, letterSpacing: "-0.1px" }}>{title}</span>
      {action}
    </div>
  );
  const SmallBtn = ({ onClick, icon, label }) => (
    <button onClick={onClick} style={{ background: SB, border: `1px solid ${SBB}`, borderRadius: 7, cursor: "pointer", padding: "5px 10px", display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit" }}>
      <Ico name={icon} size={12} color={TX3} /><span style={{ fontSize: 11, color: TX2, fontWeight: 500 }}>{label}</span>
    </button>
  );

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", animation: "fadeIn 0.2s ease" }}>

      {/* ── Barre contexte projet ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <StatusBadge statusId={project.statusId} />
          {project.client     && <span style={{ fontSize: 12, color: TX3 }}>MO <strong style={{ color: TX2, fontWeight: 600 }}>{project.client}</strong></span>}
          {project.contractor && <><span style={{ color: SBB }}>·</span><span style={{ fontSize: 12, color: TX3 }}>Entr. <strong style={{ color: TX2, fontWeight: 600 }}>{project.contractor}</strong></span></>}
          {project.startDate  && <><span style={{ color: SBB }}>·</span><span style={{ fontSize: 12, color: TX3 }}>{project.startDate}{project.endDate ? ` → ${project.endDate}` : ""}</span></>}
        </div>
      </div>

      {/* ── Bandeau urgences ── */}
      {urgent.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#EF4444", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Ico name="alert" size={14} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#B91C1C" }}>{urgent.length} action{urgent.length > 1 ? "s" : ""} urgente{urgent.length > 1 ? "s" : ""} — </span>
            <span style={{ fontSize: 13, color: "#B91C1C" }}>{urgent.map(a => a.text).join(" · ")}</span>
          </div>
        </div>
      )}

      {/* ── Layout 2 colonnes ── */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>

        {/* ═══ Colonne principale ═══ */}
        <div style={{ flex: "1 1 360px", display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>

          {/* CTA Nouveau PV */}
          <button onClick={onStartNotes} style={{ width: "100%", padding: "15px 20px", border: "none", borderRadius: 12, background: AC, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 2px 10px rgba(217,123,13,0.22)", letterSpacing: "-0.1px" }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Ico name="edit" size={16} color="#fff" />
            </div>
            <div style={{ textAlign: "left" }}>
              <div>{t("project.newPV")} · n°{project.pvHistory.length + 1}</div>
              <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.85, marginTop: 1 }}>
                {project.nextMeeting ? t("project.meetingOn", { date: project.nextMeeting }) : t("project.prepareNextPV")}
              </div>
            </div>
            <Ico name="arrowr" size={16} color="rgba(255,255,255,0.7)" style={{ marginLeft: "auto" }} />
          </button>

          {/* Outils rapides */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              { label: t("project.plan"),      icon: "mappin",    color: BL,  bg: BLB,  count: (project.planMarkers||[]).length, onClick: onViewPlan },
              { label: t("project.planning"),  icon: "gantt",     color: GR,  bg: GRBG, count: (project.lots||[]).length,        onClick: onViewPlanning },
              { label: t("project.documents"), icon: "folder",    color: VI,  bg: VIB,  count: (project.documents||[]).length,   onClick: onViewDocs },
              { label: t("project.lists"),     icon: "listcheck", color: TE,  bg: TEB,  count: (project.checklists||[]).length,  onClick: onViewChecklists },
            ].map((tb) => (
              <button key={tb.label} onClick={tb.onClick} style={{ flex: "1 1 80px", padding: "10px 8px", border: `1px solid ${tb.color}25`, borderRadius: 10, background: tb.bg, cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <Ico name={tb.icon} size={16} color={tb.color} />
                <span style={{ fontSize: 11, fontWeight: 600, color: tb.color }}>{tb.label}</span>
                {tb.count > 0 && <span style={{ fontSize: 10, color: tb.color, opacity: 0.75 }}>{tb.count}</span>}
              </button>
            ))}
          </div>

          {/* Dernier PV */}
          <Card>
            <CardHeader
              title={t("project.pvHistory")}
              action={<SmallBtn onClick={onImportPV} icon="upload" label={t("import")} />}
            />
            {project.pvHistory.length === 0 ? (
              <div style={{ padding: "16px 0", textAlign: "center" }}>
                <div style={{ fontSize: 13, color: TX3, marginBottom: 10 }}>{t("project.noPV")}</div>
                <button onClick={onStartNotes} style={{ padding: "8px 18px", border: "none", borderRadius: 8, background: AC, color: "#fff", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Ico name="edit" size={13} color="#fff" />{t("project.createFirstPV")}
                </button>
              </div>
            ) : (
              <>
                {/* PV le plus récent — mis en avant */}
                {lastPV && (
                  <div style={{ padding: "12px 14px", background: ACL, border: `1px solid ${ACL2}`, borderRadius: 10, marginBottom: project.pvHistory.length > 1 ? 10 : 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: TX }}>{lastPV.title || `PV n°${lastPV.number}`}</span>
                          {lastPV.imported
                            ? <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 600, color: BL, background: BLB, padding: "2px 7px 2px 5px", borderRadius: 20 }}><span style={{ width: 5, height: 5, borderRadius: "50%", background: BL, display: "inline-block" }} />{t("project.imported")}</span>
                            : <PvStatusBadge status={lastPV.status} onClick={() => updatePvStatus(lastPV.number, nextPvStatus(lastPV.status || "draft"))} />
                          }
                        </div>
                        <div style={{ fontSize: 12, color: TX2, lineHeight: 1.5, marginBottom: 6 }}>{lastPV.excerpt}</div>
                        <div style={{ display: "flex", gap: 10, fontSize: 11, color: TX3 }}>
                          <span>{lastPV.date}</span><span>{lastPV.author}</span>
                          {!lastPV.imported && <span>{lastPV.postsCount} poste{lastPV.postsCount > 1 ? "s" : ""}</span>}
                        </div>
                      </div>
                      <button onClick={() => onViewPV(lastPV)} style={{ background: WH, border: `1px solid ${ACL2}`, borderRadius: 7, cursor: "pointer", padding: "6px 12px", display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                        <Ico name="eye" size={12} color={AC} /><span style={{ fontSize: 11, color: AC, fontWeight: 600 }}>{t("view")}</span>
                      </button>
                    </div>
                  </div>
                )}
                {/* Tous les anciens PV */}
                {project.pvHistory.slice(1).map((pv, i) => (
                  <div key={i}
                    onClick={() => onViewPV(pv)}
                    style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderTop: `1px solid ${SB2}`, cursor: "pointer", borderRadius: 8, transition: "background 0.12s", marginTop: 2 }}
                    onMouseEnter={e => e.currentTarget.style.background = SB}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <div style={{ width: 30, height: 30, borderRadius: 7, background: pv.imported ? BLB : SB, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                      <Ico name={pv.imported ? "upload" : "file"} size={13} color={pv.imported ? BL : TX3} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: TX }}>{pv.title || `PV n°${pv.number}`}</span>
                        {pv.imported
                          ? <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9, fontWeight: 600, color: BL, background: BLB, padding: "1px 6px", borderRadius: 10 }}>{t("project.imported")}</span>
                          : <PvStatusBadge status={pv.status} onClick={(e) => { e.stopPropagation(); updatePvStatus(pv.number, nextPvStatus(pv.status || "draft")); }} />
                        }
                      </div>
                      {pv.excerpt && <div style={{ fontSize: 11, color: TX3, lineHeight: 1.4, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pv.excerpt}</div>}
                      <div style={{ display: "flex", gap: 8, fontSize: 10, color: TX3 }}>
                        <span>{pv.date}</span>
                        <span>{pv.author}</span>
                        {!pv.imported && pv.postsCount > 0 && <span>{pv.postsCount} poste{pv.postsCount > 1 ? "s" : ""}</span>}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", background: WH, border: `1px solid ${SBB}`, borderRadius: 6, marginTop: 2 }}>
                      <Ico name="eye" size={11} color={TX2} />
                      <span style={{ fontSize: 10, fontWeight: 600, color: TX2 }}>{t("view")}</span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </Card>

          {/* Actions */}
          <Card>
            <CardHeader
              title={t("project.actions")}
              action={openActions.length > 0
                ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: urgent.length > 0 ? "#B91C1C" : TX3, background: urgent.length > 0 ? "#FEF2F2" : SB2, padding: "2px 9px 2px 6px", borderRadius: 20 }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: urgent.length > 0 ? "#EF4444" : TX3, display: "inline-block" }} />
                    {openActions.length} ouverte{openActions.length > 1 ? "s" : ""}
                    {urgent.length > 0 && ` · ${urgent.length} urgente${urgent.length > 1 ? "s" : ""}`}
                  </span>
                : null}
            />
            {openActions.length === 0 && closedActions.length === 0 && (
              <div style={{ fontSize: 13, color: TX3, padding: "8px 0" }}>{t("project.noActions")}</div>
            )}
            {openActions.length === 0 && closedActions.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0" }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#F0FDF4", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Ico name="check" size={13} color={GR} />
                </div>
                <span style={{ fontSize: 13, color: GR, fontWeight: 500 }}>{t("project.allActionsClosed")}</span>
              </div>
            )}
            {/* Urgentes en premier */}
            {project.actions.filter(a => a.open && a.urgent).map((a) => (
              <div key={a.id} style={{ display: "flex", gap: 10, padding: "9px 10px", marginBottom: 4, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, alignItems: "flex-start" }}>
                <button onClick={() => toggleAction(a.id)} style={{ width: 18, height: 18, borderRadius: 4, border: "1.5px solid #EF4444", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1, padding: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "#B91C1C", fontWeight: 600, lineHeight: 1.3 }}>{a.text}</div>
                  <div style={{ fontSize: 11, color: "#EF4444", marginTop: 2 }}>{a.who} — {a.since}</div>
                </div>
              </div>
            ))}
            {/* Normales */}
            {project.actions.filter(a => a.open && !a.urgent).map((a) => (
              <div key={a.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderTop: `1px solid ${SB2}`, alignItems: "flex-start" }}>
                <button onClick={() => toggleAction(a.id)} style={{ width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${SBB}`, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2, padding: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: TX, lineHeight: 1.3 }}>{a.text}</div>
                  <div style={{ fontSize: 11, color: TX3, marginTop: 1 }}>{a.who} — {a.since}</div>
                </div>
              </div>
            ))}
            {/* Clôturées — discrètes */}
            {closedActions.length > 0 && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${SB2}` }}>
                {closedActions.map((a) => (
                  <div key={a.id} style={{ display: "flex", gap: 10, padding: "6px 0", alignItems: "center", opacity: 0.45 }}>
                    <button onClick={() => toggleAction(a.id)} style={{ width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${GR}`, background: "#F0FDF4", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0 }}>
                      <Ico name="check" size={11} color={GR} />
                    </button>
                    <div style={{ fontSize: 12, color: TX3, textDecoration: "line-through", flex: 1, minWidth: 0 }}>{a.text}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

        </div>

        {/* ═══ Colonne secondaire ═══ */}
        <div style={{ flex: "0 1 272px", display: "flex", flexDirection: "column", gap: 14, minWidth: 220 }}>

          {/* Prochaine réunion */}
          <Card style={{ background: project.nextMeeting ? ACL : WH, border: `1px solid ${project.nextMeeting ? ACL2 : SBB}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: AC, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>{t("project.nextMeeting")}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: TX, letterSpacing: "-0.5px", lineHeight: 1.2 }}>
                  {project.nextMeeting || <span style={{ fontSize: 14, color: TX3, fontWeight: 400 }}>{t("project.notPlanned")}</span>}
                </div>
                {rec && rec.id !== "none" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 5 }}>
                    <Ico name="repeat" size={11} color={TX3} />
                    <span style={{ fontSize: 11, color: TX3 }}>{rec.label}</span>
                  </div>
                )}
              </div>
              <button onClick={onEditInfo} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                <Ico name="edit" size={13} color={AC} />
              </button>
            </div>
          </Card>

          {/* Participants */}
          <Card>
            <CardHeader
              title={`Participants (${project.participants.length})`}
              action={<button onClick={onEditParticipants} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><Ico name="edit" size={13} color={TX3} /></button>}
            />
            {project.participants.length === 0 && <div style={{ fontSize: 13, color: TX3 }}>Aucun participant.</div>}
            {project.participants.map((p, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 0", borderTop: i > 0 ? `1px solid ${SB2}` : "none" }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", background: ACL, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: AC, flexShrink: 0 }}>
                  {p.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: TX3 }}>{p.role}{p.phone ? ` · ${p.phone}` : ""}</div>
                </div>
              </div>
            ))}
          </Card>

          {/* Informations projet */}
          <Card>
            <CardHeader title={t("project.info")} action={<button onClick={onEditInfo} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><Ico name="edit" size={13} color={TX3} /></button>} />
            {[
              [t("project.client"), project.client],
              [t("project.enterprise"),       project.contractor],
              [t("project.address"),          project.address],
              [t("project.startDate"),            project.startDate],
              [t("project.endDate"),       project.endDate || "—"],
            ].filter(([, v]) => v).map(([k, v], i, arr) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 0", borderTop: i > 0 ? `1px solid ${SB2}` : "none" }}>
                <span style={{ fontSize: 11, color: TX3, flexShrink: 0 }}>{k}</span>
                <span style={{ fontSize: 11, color: TX, fontWeight: 500, textAlign: "right" }}>{v}</span>
              </div>
            ))}
          </Card>

          {/* Actions projet */}
          <div style={{ display: "flex", gap: 6 }}>
            <SmallBtn onClick={onEditInfo} icon="edit" label={t("edit")} />
            <SmallBtn onClick={onDuplicate} icon="dup" label={t("duplicate")} />
            <SmallBtn onClick={onArchive} icon="archive" label={project.archived ? t("project.unarchive") : t("project.archive")} />
          </div>

        </div>
      </div>
    </div>
  );
}

const ANNO_TOOLS = [
  { id: "select", label: "Sélect.",   icon: "cursor"  },
  { id: "arrow",  label: "Flèche",    icon: "arrowr"  },
  { id: "rect",   label: "Rectangle", icon: "rectc"   },
  { id: "circle", label: "Cercle",    icon: "circlec" },
  { id: "pen",    label: "Crayon",    icon: "pen2"    },
  { id: "text",   label: "Texte",     icon: "textT"   },
];
const ANNO_COLORS = ["#EF4444", "#F97316", AC, "#3B82F6", "#1D1D1B", "#FFFFFF"];

function AnnotationEditor({ photo, onSave, onClose }) {
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

  // Markers
  const [markers, setMarkers] = useState([]);
  const [markerLabel, setMarkerLabel] = useState("");
  const [pendingMarkerPt, setPendingMarkerPt] = useState(null);

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
    setPendingMarkerPt(null); setMarkerLabel("");
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

  // Handle plan click for markers
  const handlePlanClick = (e) => {
    if (mode !== "marqueur" || spaceHeldRef.current) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setPendingMarkerPt({ x, y });
    setMarkerLabel("");
  };

  const confirmMarker = () => {
    if (!pendingMarkerPt) return;
    const num = markers.length + 1;
    setMarkers(prev => [...prev, { id: genId(), x: pendingMarkerPt.x, y: pendingMarkerPt.y, number: num, label: markerLabel.trim() || `#${num}` }]);
    setPendingMarkerPt(null);
    setMarkerLabel("");
  };

  const removeMarker = (id) => {
    setMarkers(prev => {
      const arr = prev.filter(m => m.id !== id);
      return arr.map((m, i) => ({ ...m, number: i + 1 }));
    });
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

  // ── Save (bake markers into canvas) ──────────────────────────
  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Create a temp canvas to composite markers
    const tmp = document.createElement("canvas");
    tmp.width = canvas.width; tmp.height = canvas.height;
    const ctx = tmp.getContext("2d");
    ctx.drawImage(canvas, 0, 0);
    // Draw markers
    markers.forEach(m => {
      const px = (m.x / 100) * tmp.width;
      const py = (m.y / 100) * tmp.height;
      const r = 14;
      ctx.beginPath(); ctx.arc(px, py - r - 4, r, 0, 2 * Math.PI); ctx.fillStyle = AC; ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.font = "bold 11px system-ui,-apple-system,sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(m.number), px, py - r - 4);
      // Triangle
      ctx.beginPath();
      ctx.moveTo(px - 6, py - 4); ctx.lineTo(px + 6, py - 4); ctx.lineTo(px, py + 3);
      ctx.closePath(); ctx.fillStyle = AC; ctx.fill();
      ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
    });
    onSave(tmp.toDataURL("image/jpeg", 0.92));
  };

  return (
    <div style={{ position:"fixed", inset:0, background:BG, zIndex:300, display:"flex", flexDirection:"column" }}>

      {/* ── Header ── */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 16px", background:WH, borderBottom:`1px solid ${SBB}`, flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:15, fontWeight:700, color:TX }}>{t("photoAnno.title")}</span>
          <span style={{ fontSize:11, color:TX3, fontWeight:500 }}>{strokes.length + markers.length} annotation{(strokes.length + markers.length) !== 1 ? "s" : ""}</span>
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
                  <div style={{ fontSize:20, fontWeight:700, color:AC, lineHeight:1 }}>{markers.length}</div>
                  <div style={{ fontSize:9, color:TX3, marginTop:3, fontWeight:500 }}>marqueur{markers.length !== 1 ? "s" : ""}</div>
                </div>
                <div style={{ flex:1, background:WH, border:`1px solid ${SBB}`, borderRadius:8, padding:"8px 6px", textAlign:"center" }}>
                  <div style={{ fontSize:20, fontWeight:700, color:TX2, lineHeight:1 }}>{strokes.length}</div>
                  <div style={{ fontSize:9, color:TX3, marginTop:3, fontWeight:500 }}>dessin{strokes.length !== 1 ? "s" : ""}</div>
                </div>
              </div>

              {markers.length > 0 && (
                <>
                  <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", color:TX3, marginBottom:8 }}>{t("photoAnno.markers")}</div>
                  {markers.map(m => (
                    <div key={m.id} style={{ display:"flex", alignItems:"center", gap:7, padding:"6px 0", borderBottom:`1px solid ${SB2}` }}>
                      <div style={{ width:20, height:20, borderRadius:"50%", background:AC, color:"#fff", fontSize:10, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{m.number}</div>
                      <span style={{ fontSize:11, color:TX2, flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.label}</span>
                      <button onClick={() => removeMarker(m.id)} style={{ background:"none", border:"none", cursor:"pointer", padding:2, flexShrink:0, opacity:0.4 }}><Ico name="trash" size={11} color={TX3} /></button>
                    </div>
                  ))}
                </>
              )}

              {strokes.length > 0 && (
                <>
                  <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", color:TX3, marginBottom:8, marginTop:markers.length > 0 ? 14 : 0 }}>Annotations</div>
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

              {markers.length === 0 && strokes.length === 0 && (
                <div style={{ padding:"14px 6px", textAlign:"center", color:TX3, fontSize:11, lineHeight:1.7 }}>{t("photoAnno.noAnnotation")}</div>
              )}
            </div>
          )}

          {/* ── MODE MARQUEUR ── */}
          {mode === "marqueur" && (
            <div style={{ padding:"12px 12px 14px" }}>
              {!pendingMarkerPt ? (
                <div style={{ padding:"8px 10px", background:ACL, border:`1px solid ${ACL2}`, borderRadius:7, fontSize:11, color:AC, fontWeight:500, display:"flex", alignItems:"center", gap:6, marginBottom:14 }}>
                  <Ico name="mappin" size={12} color={AC} />
                  {t("photoAnno.clickPhoto")}
                </div>
              ) : (
                <div style={{ padding:"10px 10px", background:ACL, border:`1px solid ${ACL2}`, borderRadius:8, marginBottom:14 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:AC, marginBottom:6 }}>{t("photoAnno.markerLabel")}</div>
                  <input value={markerLabel} onChange={e => setMarkerLabel(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") confirmMarker(); if (e.key === "Escape") { setPendingMarkerPt(null); setMarkerLabel(""); } }}
                    placeholder={`Marqueur #${markers.length + 1}`}
                    style={{ width:"100%", padding:"6px 8px", border:`1px solid ${ACL2}`, borderRadius:6, fontSize:12, background:WH, color:TX, fontFamily:"inherit", marginBottom:8, boxSizing:"border-box" }}
                    autoFocus
                  />
                  <div style={{ display:"flex", gap:6 }}>
                    <button onClick={confirmMarker} style={{ flex:1, padding:"6px 0", border:"none", borderRadius:6, background:AC, color:"#fff", fontWeight:600, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>{t("confirm")}</button>
                    <button onClick={() => { setPendingMarkerPt(null); setMarkerLabel(""); }} style={{ padding:"6px 10px", border:`1px solid ${ACL2}`, borderRadius:6, background:WH, color:TX2, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>✕</button>
                  </div>
                </div>
              )}

              {markers.length > 0 && (
                <>
                  <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", color:TX3, marginBottom:8 }}>{t("photoAnno.placed")} · {markers.length}</div>
                  {markers.map(m => (
                    <div key={m.id} style={{ display:"flex", alignItems:"center", gap:7, padding:"6px 0", borderBottom:`1px solid ${SB2}` }}>
                      <div style={{ width:20, height:20, borderRadius:"50%", background:AC, color:"#fff", fontSize:10, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{m.number}</div>
                      <span style={{ fontSize:11, color:TX2, flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.label}</span>
                      <button onClick={() => removeMarker(m.id)} style={{ background:"none", border:"none", cursor:"pointer", padding:2, flexShrink:0 }}><Ico name="trash" size={11} color={TX3} /></button>
                    </div>
                  ))}
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
                      style={{ padding:"8px 4px 6px", border:`1.5px solid ${active?AC:SBB}`, borderRadius:8, background:active?ACL:WH, cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:4, fontFamily:"inherit", boxShadow:active?"none":"0 1px 2px rgba(0,0,0,0.04)" }}>
                      <Ico name={t.icon} size={14} color={active?AC:TX2} />
                      <span style={{ fontSize:9, fontWeight:active?700:500, color:active?AC:TX3, letterSpacing:"0.01em", lineHeight:1 }}>{t.label}</span>
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

            {/* Marqueurs affichés */}
            {markers.map(m => (
              <div key={m.id} onClick={e => e.stopPropagation()} title={m.label} style={{ position:"absolute", left:`${m.x}%`, top:`${m.y}%`, transform:"translate(-50%, -100%)", zIndex:10 }}>
                <div style={{ width:28, height:28, borderRadius:"50%", background:AC, color:"#fff", fontSize:11, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", border:"2.5px solid #fff", boxShadow:"0 2px 10px rgba(0,0,0,0.4)" }}>{m.number}</div>
                <div style={{ width:0, height:0, borderLeft:"6px solid transparent", borderRight:"6px solid transparent", borderTop:`7px solid ${AC}`, margin:"0 auto" }} />
              </div>
            ))}

            {/* Marqueur en attente */}
            {pendingMarkerPt && (
              <div style={{ position:"absolute", left:`${pendingMarkerPt.x}%`, top:`${pendingMarkerPt.y}%`, transform:"translate(-50%, -100%)", zIndex:11, pointerEvents:"none" }}>
                <div style={{ width:28, height:28, borderRadius:"50%", background:TX3, color:"#fff", fontSize:14, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", border:"2.5px solid #fff", boxShadow:"0 2px 10px rgba(0,0,0,0.25)" }}>?</div>
                <div style={{ width:0, height:0, borderLeft:"6px solid transparent", borderRight:"6px solid transparent", borderTop:`7px solid ${TX3}`, margin:"0 auto" }} />
              </div>
            )}
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
          {mode === "marqueur" && !pendingMarkerPt && (
            <div style={{ position:"absolute", top:14, left:"50%", transform:"translateX(-50%)", background:"rgba(217,123,13,0.92)", color:"#fff", fontSize:11, fontWeight:600, padding:"5px 14px 5px 10px", borderRadius:20, pointerEvents:"none", whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:6, backdropFilter:"blur(4px)", zIndex:20 }}>
              <Ico name="mappin" size={12} color="#fff" />{t("anno.clickToPlaceMarker")}
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
    </div>
  );
}

function NoteEditor({ project, setProjects, onBack, onGenerate }) {
  const [activePost,      setActivePost]      = useState(null);
  const [annotatingPhoto, setAnnotatingPhoto] = useState(null);
  const [addText,    setAddText]    = useState("");
  const [addUrgent,  setAddUrgent]  = useState(false);
  const [recipientFilters, setRecipientFilters] = useState([]); // [] = tous
  const [pvTitle, setPvTitle] = useState(`PV n°${project.pvHistory.length + 1}`);
  const [renamingPost, setRenamingPost] = useState(null);
  const [renameVal,    setRenameVal]    = useState("");
  const [inputMode,    setInputMode]    = useState("write"); // "write" | "voice"
  const [isRecording,  setIsRecording]  = useState(false);
  const [voiceInterim, setVoiceInterim] = useState("");
  const [voiceErr,     setVoiceErr]     = useState("");
  const photoRef       = useRef(null);
  const addInputRef    = useRef(null);
  const recognitionRef = useRef(null);
  const t = useT();
  const tp = useTP();

  // Arrêter la reconnaissance vocale quand on change de poste
  useEffect(() => {
    return () => { recognitionRef.current?.stop(); };
  }, [activePost]);

  const stopVoice = () => {
    recognitionRef.current?.stop();
    setIsRecording(false);
    setVoiceInterim("");
  };

  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setVoiceErr(t("notes.voiceNotSupported"));
      return;
    }
    setVoiceErr("");
    const rec = new SR();
    rec.lang = "fr-FR";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          const text = e.results[i][0].transcript.trim();
          if (text) {
            const post = project.posts.find((p) => p.id === activePost);
            if (post) {
              const current = getRemarks(post);
              setRemarks(post.id, [...current, { id: Date.now() + Math.random(), text, urgent: false, status: "open" }]);
            }
          }
        } else {
          interim += e.results[i][0].transcript;
        }
      }
      setVoiceInterim(interim);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed") setVoiceErr(t("notes.micDenied"));
      else if (e.error !== "no-speech") setVoiceErr("Erreur microphone : " + e.error);
      setIsRecording(false);
      setVoiceInterim("");
    };
    rec.onend = () => { setIsRecording(false); setVoiceInterim(""); };
    recognitionRef.current = rec;
    rec.start();
    setIsRecording(true);
  };

  const initials = (name) => name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  const updatePost = (postId, patch) => setProjects((prev) => prev.map((p) => p.id === project.id ? {
    ...p, posts: p.posts.map((po) => po.id === postId ? { ...po, ...patch } : po)
  } : p));

  const getRemarks = (post) => {
    // Migrate legacy notes on first access
    if ((post.remarks || []).length === 0 && post.notes?.trim()) {
      return parseNotesToRemarks(post.notes);
    }
    return post.remarks || [];
  };

  const setRemarks = (postId, remarks) => updatePost(postId, { remarks, notes: "" });

  const addRemark = (postId) => {
    if (!addText.trim()) return;
    const post = project.posts.find((p) => p.id === postId);
    const current = getRemarks(post);
    const newRemark = { id: Date.now() + Math.random(), text: addText.trim(), urgent: addUrgent, status: "open" };
    setRemarks(postId, [...current, newRemark]);
    setAddText("");
    // keep urgency toggle so rapid entries stay consistent
    setTimeout(() => addInputRef.current?.focus(), 30);
  };

  const removeRemark = (postId, remarkId) => {
    const post = project.posts.find((p) => p.id === postId);
    setRemarks(postId, getRemarks(post).filter((r) => r.id !== remarkId));
  };

  const cycleStatus = (postId, remarkId) => {
    const post = project.posts.find((p) => p.id === postId);
    setRemarks(postId, getRemarks(post).map((r) => r.id === remarkId ? { ...r, status: nextStatus(r.status) } : r));
  };

  const editRemarkText = (postId, remarkId, text) => {
    const post = project.posts.find((p) => p.id === postId);
    setRemarks(postId, getRemarks(post).map((r) => r.id === remarkId ? { ...r, text } : r));
  };

  const toggleRemarkUrgent = (postId, remarkId) => {
    const post = project.posts.find((p) => p.id === postId);
    setRemarks(postId, getRemarks(post).map((r) => r.id === remarkId ? { ...r, urgent: !r.urgent } : r));
  };

  const toggleRemarkRecipient = (postId, remarkId, participantName) => {
    const post = project.posts.find((p) => p.id === postId);
    setRemarks(postId, getRemarks(post).map((r) => {
      if (r.id !== remarkId) return r;
      const cur = r.recipients || [];
      const has = cur.includes(participantName);
      return { ...r, recipients: has ? cur.filter((n) => n !== participantName) : [...cur, participantName] };
    }));
  };

  const addPhotos = (postId, files) => {
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = ev.target.result;
        const photoId = Date.now() + Math.random();
        // Add immediately with dataUrl for instant preview
        setProjects((prev) => prev.map((p) => p.id === project.id ? {
          ...p, posts: p.posts.map((po) => po.id === postId ? {
            ...po, photos: [...(po.photos || []), { id: photoId, dataUrl }]
          } : po)
        } : p));
        // Upload to Storage in background, then replace dataUrl with URL
        const result = await uploadPhoto(dataUrl);
        if (result) {
          setProjects((prev) => prev.map((p) => p.id === project.id ? {
            ...p, posts: p.posts.map((po) => po.id === postId ? {
              ...po, photos: (po.photos || []).map((ph) => ph.id === photoId ? { ...ph, url: result.url, storagePath: result.storagePath, dataUrl: undefined } : ph)
            } : po)
          } : p));
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removePhoto = (postId, photoId) => {
    const post = project.posts.find(po => po.id === postId);
    const photo = (post?.photos || []).find(ph => ph.id === photoId);
    if (photo?.storagePath) deletePhoto(photo.storagePath);
    setProjects((prev) => prev.map((p) => p.id === project.id ? {
      ...p, posts: p.posts.map((po) => po.id === postId ? { ...po, photos: (po.photos || []).filter((ph) => ph.id !== photoId) } : po)
    } : p));
  };

  const saveAnnotation = async (postId, photoId, newDataUrl) => {
    // Update locally immediately
    setProjects((prev) => prev.map((p) => p.id === project.id ? {
      ...p, posts: p.posts.map((po) => po.id === postId ? {
        ...po, photos: (po.photos || []).map((ph) => ph.id === photoId ? { ...ph, dataUrl: newDataUrl, annotated: true } : ph)
      } : po)
    } : p));
    setAnnotatingPhoto(null);
    // Re-upload annotated version to Storage
    const result = await uploadPhoto(newDataUrl);
    if (result) {
      // Delete old file if exists
      const post = project.posts.find(po => po.id === postId);
      const oldPhoto = (post?.photos || []).find(ph => ph.id === photoId);
      if (oldPhoto?.storagePath) deletePhoto(oldPhoto.storagePath);
      // Update with new URL
      setProjects((prev) => prev.map((p) => p.id === project.id ? {
        ...p, posts: p.posts.map((po) => po.id === postId ? {
          ...po, photos: (po.photos || []).map((ph) => ph.id === photoId ? { ...ph, url: result.url, storagePath: result.storagePath, dataUrl: undefined } : ph)
        } : po)
      } : p));
    }
  };

  const loadSamples = () => setProjects((prev) => prev.map((p) => p.id === project.id ? {
    ...p, posts: p.posts.map((po) => ({
      ...po,
      remarks: SAMPLES[po.id] ? parseNotesToRemarks(SAMPLES[po.id]) : (po.remarks || []),
      notes: "",
    }))
  } : p));

  const commitRename = (postId) => {
    if (renameVal.trim()) {
      setProjects(prev => prev.map(p => p.id === project.id ? {
        ...p, posts: p.posts.map(po => po.id === postId ? { ...po, label: renameVal.trim() } : po)
      } : p));
    }
    setRenamingPost(null);
  };

  const deletePost = (postId) => {
    setProjects(prev => prev.map(p => p.id === project.id ? {
      ...p, posts: p.posts.filter(po => po.id !== postId)
    } : p));
  };

  const filledCount = project.posts.filter((p) => {
    const remarks = (p.remarks || []).length > 0 ? p.remarks : (p.notes?.trim() ? parseNotesToRemarks(p.notes) : []);
    return remarks.length > 0 || (p.photos || []).length > 0 || (project.planMarkers || []).some((m) => m.postId === p.id);
  }).length;

  if (annotatingPhoto) {
    return (
      <AnnotationEditor
        photo={annotatingPhoto.photo}
        onSave={(dataUrl) => saveAnnotation(annotatingPhoto.postId, annotatingPhoto.photo.id, dataUrl)}
        onClose={() => setAnnotatingPhoto(null)}
      />
    );
  }

  if (activePost) {
    const post    = project.posts.find((p) => p.id === activePost);
    const photos  = post.photos || [];
    const remarks = getRemarks(post);
    const openCount     = remarks.filter((r) => r.status === "open").length;
    const progressCount = remarks.filter((r) => r.status === "progress").length;
    const doneCount     = remarks.filter((r) => r.status === "done").length;

    return (
      <div>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <button onClick={() => setActivePost(null)} style={{ background: "none", border: "none", cursor: "pointer", padding: "8px", minWidth: 40, minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 }}><Ico name="back" color={TX2} /></button>
          <div style={{ flex: 1 }}>
            {renamingPost === post.id ? (
              <input
                autoFocus
                value={renameVal}
                onChange={(e) => setRenameVal(e.target.value)}
                onBlur={() => commitRename(post.id)}
                onKeyDown={(e) => { if (e.key === "Enter") commitRename(post.id); if (e.key === "Escape") setRenamingPost(null); }}
                style={{ fontSize: 16, fontWeight: 600, color: TX, border: `1px solid ${AC}`, borderRadius: 6, padding: "3px 8px", background: WH, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" }}
              />
            ) : (
              <div
                onClick={() => { setRenamingPost(post.id); setRenameVal(post.label); }}
                style={{ fontSize: 16, fontWeight: 600, color: TX, cursor: "text", display: "flex", alignItems: "center", gap: 6 }}
                title={t("notes.rename")}
              >
                {post.id}. {post.label}
                <Ico name="edit" size={13} color={TX3} />
              </div>
            )}
            {remarks.length > 0 && (
              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                {openCount > 0     && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, color: "#B91C1C", background: "#FEF2F2", padding: "2px 8px 2px 5px", borderRadius: 20 }}><span style={{ width: 5, height: 5, borderRadius: "50%", background: "#EF4444", display: "inline-block" }} />{openCount} {t("notes.toProcess")}</span>}
                {progressCount > 0 && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, color: "#92400E", background: "#FFFBEB", padding: "2px 8px 2px 5px", borderRadius: 20 }}><span style={{ width: 5, height: 5, borderRadius: "50%", background: AC,       display: "inline-block" }} />{progressCount} {t("notes.inProgress")}</span>}
                {doneCount > 0     && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, color: "#166534", background: "#F0FDF4",  padding: "2px 8px 2px 5px", borderRadius: 20 }}><span style={{ width: 5, height: 5, borderRadius: "50%", background: GR,        display: "inline-block" }} />{doneCount} résolu{doneCount > 1 ? "s" : ""}</span>}
              </div>
            )}
          </div>
        </div>

        {/* Mode toggle: Écrire / Dicter */}
        <div style={{ display: "flex", gap: 4, marginBottom: 12, background: SB, borderRadius: 10, padding: 4 }}>
          <button
            onClick={() => { setInputMode("write"); stopVoice(); }}
            style={{ flex: 1, padding: "7px", border: "none", borderRadius: 8, background: inputMode === "write" ? WH : "transparent", color: inputMode === "write" ? TX : TX3, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, boxShadow: inputMode === "write" ? "0 1px 3px rgba(0,0,0,0.08)" : "none", transition: "all 0.15s" }}
          >
            <Ico name="edit" size={14} color={inputMode === "write" ? TX : TX3} />{t("notes.write")}
          </button>
          <button
            onClick={() => { setInputMode("voice"); setAddText(""); setAddUrgent(false); }}
            style={{ flex: 1, padding: "7px", border: "none", borderRadius: 8, background: inputMode === "voice" ? WH : "transparent", color: inputMode === "voice" ? RD : TX3, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, boxShadow: inputMode === "voice" ? "0 1px 3px rgba(0,0,0,0.08)" : "none", transition: "all 0.15s" }}
          >
            <Ico name="mic" size={14} color={inputMode === "voice" ? RD : TX3} />{t("notes.dictate")}
          </button>
        </div>

        {inputMode === "write" ? (
          <>
            {/* Quick-add texte */}
            <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center" }}>
              <button onClick={() => setAddUrgent(false)} style={{ padding: "5px 11px", border: "none", borderRadius: 6, background: !addUrgent ? SB2 : SB, color: !addUrgent ? TX : TX3, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>{t("notes.observation")}</button>
              <button onClick={() => setAddUrgent(true)}  style={{ padding: "5px 11px", border: "none", borderRadius: 6, background: addUrgent ? REDBG : SB, color: addUrgent ? RD : TX3, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>{t("notes.urgentBtn")}</button>
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              <input
                ref={addInputRef}
                value={addText}
                onChange={(e) => setAddText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addRemark(post.id); }}
                placeholder={addUrgent ? t("notes.placeholderUrgent") : t("notes.placeholderNormal")}
                style={{ flex: 1, padding: "9px 12px", border: `1px solid ${addUrgent ? RD + "60" : SBB}`, borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: WH, color: TX }}
                autoFocus
              />
              <button onClick={() => addRemark(post.id)} style={{ padding: "9px 14px", border: "none", borderRadius: 8, background: AC, color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                <Ico name="plus" size={16} color="#fff" />
              </button>
            </div>
          </>
        ) : (
          /* Interface dictée vocale */
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "28px 20px 20px", marginBottom: 12, background: isRecording ? REDBG : SB, borderRadius: 12, border: `1px solid ${isRecording ? RD + "40" : SBB}`, transition: "background 0.3s, border-color 0.3s" }}>
            <button
              onClick={isRecording ? stopVoice : startVoice}
              style={{ width: 76, height: 76, borderRadius: "50%", background: isRecording ? RD : WH, border: `2px solid ${isRecording ? RD : SBB}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, animation: isRecording ? "ring 1.4s ease infinite" : "none", boxShadow: isRecording ? "none" : "0 2px 10px rgba(0,0,0,0.1)", transition: "background 0.2s, border-color 0.2s" }}
            >
              <Ico name="mic" size={30} color={isRecording ? "#fff" : TX2} />
            </button>
            <div style={{ fontSize: 14, fontWeight: 600, color: isRecording ? RD : TX2, marginBottom: 6 }}>
              {isRecording ? t("notes.listening") : t("notes.pressToSpeak")}
            </div>
            {voiceInterim && (
              <div style={{ fontSize: 13, color: TX3, fontStyle: "italic", textAlign: "center", maxWidth: 320, lineHeight: 1.5, marginTop: 4 }}>
                « {voiceInterim} »
              </div>
            )}
            {voiceErr && (
              <div style={{ marginTop: 10, fontSize: 12, color: RD, textAlign: "center", padding: "8px 12px", background: REDBG, borderRadius: 8, border: `1px solid ${RD}20` }}>{voiceErr}</div>
            )}
            {!voiceErr && !isRecording && (
              <div style={{ fontSize: 11, color: TX3, marginTop: 6, textAlign: "center" }}>
                {t("notes.voiceSentence")}
              </div>
            )}
          </div>
        )}

        {/* Remark list */}
        {remarks.length > 0 ? (
          <div style={{ marginBottom: 12 }}>
            {remarks.map((r) => {
              const rs = getRemarkStatus(r.status);
              return (
                <div key={r.id} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 10px", marginBottom: 4, background: WH, border: `1px solid ${SBB}`, borderRadius: 10 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
                    {/* Status pill — click to cycle */}
                    <button onClick={() => cycleStatus(post.id, r.id)} title={`Statut : ${rs.label} — cliquer pour changer`} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px 3px 6px", border: `1px solid ${r.urgent && r.status === "open" ? REDBRD : rs.dot + "40"}`, borderRadius: 20, background: r.urgent && r.status === "open" ? "#FEF2F2" : rs.bg, cursor: "pointer", fontFamily: "inherit", marginTop: 1, whiteSpace: "nowrap", outline: "none", transition: "all 0.15s" }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: r.urgent && r.status === "open" ? "#EF4444" : rs.dot, flexShrink: 0 }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: r.urgent && r.status === "open" ? "#B91C1C" : rs.color }}>
                        {r.urgent && r.status === "open" ? t("notes.urgent") : rs.label}
                      </span>
                      <Ico name="chevron-down" size={9} color={r.urgent && r.status === "open" ? "#B91C1C" : rs.color} />
                    </button>
                    {r.carriedFrom && <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9, fontWeight: 600, color: AC, background: ACL, border: `1px solid ${ACL2}`, padding: "2px 6px", borderRadius: 20, marginTop: 2, whiteSpace: "nowrap" }}>↩ PV{r.carriedFrom}</span>}
                    <input value={r.text} onChange={(e) => editRemarkText(post.id, r.id, e.target.value)} style={{ flex: 1, border: "none", outline: "none", fontSize: 13, color: r.status === "done" ? TX3 : TX, background: "transparent", fontFamily: "inherit", textDecoration: r.status === "done" ? "line-through" : "none", padding: 0, minWidth: 0 }} />
                    <button onClick={() => removeRemark(post.id, r.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0 }}>
                      <Ico name="x" size={13} color={TX3} />
                    </button>
                  </div>
                  {/* Participant assignment chips */}
                  {project.participants.length > 0 && (
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", paddingLeft: 2 }}>
                      {project.participants.map((p, pi) => {
                        const assigned = (r.recipients || []).includes(p.name);
                        return (
                          <button key={pi} onClick={() => toggleRemarkRecipient(post.id, r.id, p.name)} title={`${assigned ? "Retirer" : "Assigner à"} ${p.name}`} style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 7px", border: `1px solid ${assigned ? AC : SBB}`, borderRadius: 20, background: assigned ? ACL : "transparent", cursor: "pointer", fontFamily: "inherit" }}>
                            <div style={{ width: 16, height: 16, borderRadius: "50%", background: assigned ? AC : SB2, color: assigned ? "#fff" : TX3, fontSize: 8, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              {initials(p.name)}
                            </div>
                            <span style={{ fontSize: 10, color: assigned ? AC : TX3, fontWeight: assigned ? 600 : 400 }}>{p.name.split(" ")[0]}</span>
                          </button>
                        );
                      })}
                      {(r.recipients || []).length === 0 && <span style={{ fontSize: 10, color: TX3, fontStyle: "italic", alignSelf: "center" }}>{t("notes.allRecipientsList")}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: TX3, padding: "12px 0", textAlign: "center" }}>{t("notes.noRemarks")}</div>
        )}

        {/* Photos */}
        <div style={{ padding: "12px 14px", background: SB, borderRadius: 10, border: `1px solid ${SBB}`, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: photos.length > 0 ? 10 : 0 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: TX2 }}>{t("notes.photos")}{photos.length > 0 ? ` (${photos.length})` : ""}</span>
            <button onClick={() => photoRef.current.click()} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", border: "none", borderRadius: 6, background: ACL, cursor: "pointer", fontFamily: "inherit" }}>
              <Ico name="camera" size={13} color={AC} />
              <span style={{ fontSize: 12, fontWeight: 600, color: AC }}>{t("notes.addPhotos")}</span>
            </button>
            <input ref={photoRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => { addPhotos(post.id, e.target.files); e.target.value = ""; }} />
          </div>
          {photos.length > 0 ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {photos.map((ph) => (
                <div key={ph.id} style={{ position: "relative", width: 80, height: 80, flexShrink: 0 }}>
                  <img src={getPhotoUrl(ph)} alt="" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: `2px solid ${ph.annotated ? AC : SBB}` }} />
                  <button onClick={() => setAnnotatingPhoto({ postId: post.id, photo: ph })} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0)", borderRadius: 8, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0, transition: "opacity 0.15s" }} onMouseEnter={(e) => e.currentTarget.style.opacity="1"} onMouseLeave={(e) => e.currentTarget.style.opacity="0"} onFocus={(e) => e.currentTarget.style.opacity="1"} onBlur={(e) => e.currentTarget.style.opacity="0"} title={t("notes.annotate")}>
                    <div style={{ background: "rgba(0,0,0,0.55)", borderRadius: 6, padding: "4px 6px" }}><Ico name="pen2" size={12} color="#fff" /></div>
                  </button>
                  {ph.annotated && <div style={{ position: "absolute", bottom: 3, left: 3, background: AC, borderRadius: 4, padding: "1px 4px" }}><Ico name="pen2" size={9} color="#fff" /></div>}
                  <button onClick={() => removePhoto(post.id, ph.id)} style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: RD, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                    <Ico name="x" size={10} color="#fff" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: TX3, marginTop: 4 }}>{t("notes.noPhotos")}</div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: TX3 }}>{remarks.length} remarque{remarks.length !== 1 ? "s" : ""} · {photos.length} photo{photos.length !== 1 ? "s" : ""}</span>
          <button onClick={() => setActivePost(null)} style={{ padding: "8px 20px", border: "none", borderRadius: 8, background: AC, color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>{t("validate")}</button>
        </div>
      </div>
    );
  }

  // Compute carried-over remarks summary
  const allCarried = project.posts.flatMap((p) => (p.remarks || []).filter((r) => r.carriedFrom));
  const carriedCount = allCarried.length;
  const carriedFromPV = carriedCount > 0 ? Math.max(...allCarried.map((r) => r.carriedFrom)) : null;

  // Stats pour le résumé
  const totalRemarks = project.posts.reduce((acc, p) => acc + getRemarks(p).length, 0);
  const urgentCount  = project.posts.reduce((acc, p) => acc + getRemarks(p).filter(r => r.urgent).length, 0);
  const totalPhotos  = project.posts.reduce((acc, p) => acc + (p.photos || []).length, 0);
  const readyToGenerate = filledCount > 0;

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", paddingBottom: 32 }}>

      {/* ── Header ── */}
      <div style={{ background: WH, borderRadius: 12, padding: "16px 20px 14px", marginBottom: 14, border: `1px solid ${SBB}`, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <button onClick={onBack} style={{ background: SB, border: `1px solid ${SBB}`, cursor: "pointer", padding: 7, minWidth: 36, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, flexShrink: 0, marginTop: 1 }}>
            <Ico name="back" color={TX2} size={16} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 1 }}>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: AC, background: ACL, padding: "2px 7px", borderRadius: 3 }}>{t("notes.redaction")}</div>
            </div>
            <input
              value={pvTitle}
              onChange={(e) => setPvTitle(e.target.value)}
              style={{ fontSize: 20, fontWeight: 800, color: TX, border: "none", background: "transparent", outline: "none", padding: 0, fontFamily: "inherit", width: "100%", letterSpacing: "-0.4px", lineHeight: 1.25 }}
              title="Cliquez pour renommer"
            />
            <div style={{ fontSize: 11, color: TX3, marginTop: 2, display: "flex", alignItems: "center", gap: 5 }}>
              <span>{project.name}</span>
              <span style={{ width: 2.5, height: 2.5, borderRadius: "50%", background: TX3, opacity: 0.5 }} />
              <span>{new Date().toLocaleDateString("fr-BE", { day: "numeric", month: "long", year: "numeric" })}</span>
            </div>
          </div>
          <button onClick={loadSamples} style={{ padding: "6px 12px", border: `1px solid ${SBB}`, borderRadius: 7, background: WH, cursor: "pointer", fontSize: 10, color: TX3, fontFamily: "inherit", flexShrink: 0, fontWeight: 500 }}>{t("examples")}</button>
        </div>

        {/* Barre de progression intégrée au header */}
        {(() => {
          const steps = [
            { step: 1, label: t("notes.stepPosts"), sub: `${filledCount}/${project.posts.length}`, icon: "listcheck", done: filledCount > 0 },
            { step: 2, label: t("notes.stepRecipients"), sub: recipientFilters.length === 0 ? t("notes.allRecipients") : `${recipientFilters.length} filtrés`, icon: "users", done: true },
            { step: 3, label: t("notes.stepGeneration"), sub: readyToGenerate ? t("notes.stepReady") : t("notes.stepWaiting"), icon: "send", done: false },
          ];
          const activeIdx = steps.findIndex(s => !s.done);
          const activeStep = activeIdx === -1 ? steps.length - 1 : activeIdx;
          return (
            <div style={{ marginTop: 14, background: SB, borderRadius: 10, padding: "4px 4px", display: "flex", alignItems: "stretch", gap: 3 }}>
              {steps.map((s, i) => {
                const isDone = s.done;
                const isActive = i === activeStep;
                return (
                  <div key={s.step} style={{ flex: 1, display: "flex", alignItems: "center", gap: 0, minWidth: 0 }}>
                    <div style={{
                      flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                      background: isActive ? WH : "transparent",
                      borderRadius: 8,
                      boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                      transition: "all 0.25s",
                    }}>
                      <div style={{
                        width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                        background: isDone ? AC : isActive ? AC + "14" : SB2,
                        border: isActive ? `2px solid ${AC}` : "2px solid transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: isDone ? "0 1px 3px rgba(217,123,13,0.25)" : "none",
                        transition: "all 0.3s",
                      }}>
                        {isDone
                          ? <Ico name="check" size={11} color="#fff" />
                          : <Ico name={s.icon} size={11} color={isActive ? AC : TX3} />
                        }
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: isDone || isActive ? 700 : 500, color: isDone ? TX : isActive ? TX : TX3, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {s.label}
                        </div>
                        <div style={{ fontSize: 9.5, color: isDone ? GR : isActive ? AC : DIST, fontWeight: 500, marginTop: 0, whiteSpace: "nowrap" }}>
                          {isDone ? t("notes.stepCompleted") : s.sub}
                        </div>
                      </div>
                    </div>
                    {i < steps.length - 1 && (
                      <div style={{ width: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Ico name="arrowr" size={9} color={isDone ? AC : SBB} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* ── Rappel remarques non clôturées ── */}
      {carriedCount > 0 && (
        <div style={{ display: "flex", alignItems: "stretch", borderRadius: 10, marginBottom: 12, overflow: "hidden", border: `1px solid ${ACL2}`, background: WH }}>
          <div style={{ width: 4, background: AC, flexShrink: 0 }} />
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: ACL }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: WH, border: `1px solid ${ACL2}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Ico name="repeat" size={14} color={AC} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TX, lineHeight: 1.3 }}>
                {carriedCount} remarque{carriedCount > 1 ? "s" : ""} reportée{carriedCount > 1 ? "s" : ""}
                <span style={{ fontWeight: 500, color: TX2 }}> depuis le PV n°{carriedFromPV}</span>
              </div>
              <div style={{ fontSize: 10.5, color: TX3, marginTop: 2, lineHeight: 1.3 }}>{t("notes.carried.desc")}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0, background: WH, border: `1px solid ${ACL2}`, borderRadius: 6, padding: "4px 8px" }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: AC, lineHeight: 1 }}>{carriedCount}</span>
              <span style={{ fontSize: 9, color: TX3, fontWeight: 500, lineHeight: 1.1 }}>à<br/>suivre</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Section 1 : Postes ── */}
      <div style={{ background: WH, borderRadius: 12, border: `1px solid ${SBB}`, overflow: "hidden", marginBottom: 12 }}>
        {/* Section header */}
        <div style={{ padding: "11px 16px", borderBottom: `1px solid ${SBB}`, background: SB }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: filledCount > 0 ? AC : SB2, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: filledCount > 0 ? "0 1px 3px rgba(217,123,13,0.25)" : "none" }}>
                {filledCount > 0 ? <Ico name="check" size={11} color="#fff" /> : <span style={{ fontSize: 9, fontWeight: 700, color: TX3 }}>1</span>}
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: TX, letterSpacing: "-0.1px" }}>{t("notes.posts")}</span>
              <span style={{ fontSize: 10.5, color: TX3, fontWeight: 400 }}>{filledCount}/{project.posts.length}</span>
            </div>
            {/* Inline stat chips */}
            {(totalRemarks > 0 || totalPhotos > 0) && (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: WH, border: `1px solid ${SBB}`, borderRadius: 6, padding: "3px 8px" }}>
                  <Ico name="edit" size={10} color={TX3} />
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: TX2 }}>{totalRemarks}</span>
                </div>
                {urgentCount > 0 && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: REDBG, border: `1px solid ${REDBRD}`, borderRadius: 6, padding: "3px 8px" }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: RD, flexShrink: 0 }} />
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: RD }}>{urgentCount}</span>
                  </div>
                )}
                {carriedCount > 0 && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: ACL, border: `1px solid ${ACL2}`, borderRadius: 6, padding: "3px 8px" }}>
                    <Ico name="repeat" size={9} color={AC} />
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: AC }}>{carriedCount}</span>
                  </div>
                )}
                {totalPhotos > 0 && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: WH, border: `1px solid ${SBB}`, borderRadius: 6, padding: "3px 8px" }}>
                    <Ico name="camera" size={10} color={TX3} />
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: TX2 }}>{totalPhotos}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Post list */}
        <div style={{ padding: "6px 8px 2px" }}>
          {project.posts.map((post, postIdx) => {
            const remarks     = getRemarks(post);
            const openCount   = remarks.filter((r) => r.status === "open").length;
            const progressCount = remarks.filter((r) => r.status === "progress").length;
            const doneCount   = remarks.filter((r) => r.status === "done").length;
            const carriedHere = remarks.filter((r) => r.carriedFrom).length;
            const photoCount  = (post.photos || []).length;
            const markerCount = (project.planMarkers || []).filter((m) => m.postId === post.id).length;
            const hasContent  = remarks.length > 0 || photoCount > 0 || markerCount > 0;
            const hasUrgent   = remarks.some(r => r.urgent && r.status === "open");
            return (
              <button
                key={post.id}
                onClick={() => { setActivePost(post.id); setAddText(""); setAddUrgent(false); }}
                style={{ width: "100%", display: "flex", alignItems: "stretch", gap: 0, padding: 0, background: WH, border: `1px solid ${hasUrgent ? REDBRD : hasContent ? ACL2 : SB2}`, borderRadius: 9, cursor: "pointer", textAlign: "left", fontFamily: "inherit", transition: "border-color 0.15s, box-shadow 0.15s", marginBottom: 5, overflow: "hidden", boxShadow: hasContent ? "0 1px 2px rgba(0,0,0,0.03)" : "none" }}
              >
                {/* Left accent strip */}
                <div style={{ width: 3.5, flexShrink: 0, background: hasUrgent ? RD : hasContent ? AC : SB2, borderRadius: "9px 0 0 9px", transition: "background 0.15s" }} />

                {/* Main content area */}
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "9px 12px 9px 10px", minWidth: 0 }}>
                  {/* Post number badge */}
                  <div style={{ width: 30, height: 30, borderRadius: 7, background: hasContent ? ACL : SB, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0, position: "relative" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: hasContent ? AC : TX3, lineHeight: 1, letterSpacing: "-0.3px" }}>{post.id}</span>
                    {hasContent && (
                      <div style={{ position: "absolute", bottom: -2, right: -2, width: 12, height: 12, borderRadius: "50%", background: doneCount === remarks.length && remarks.length > 0 ? GR : AC, display: "flex", alignItems: "center", justifyContent: "center", border: "1.5px solid #fff" }}>
                        <Ico name="check" size={7} color="#fff" />
                      </div>
                    )}
                  </div>

                  {/* Text content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Top line: label */}
                    {renamingPost === post.id ? (
                      <input
                        autoFocus
                        value={renameVal}
                        onChange={(e) => setRenameVal(e.target.value)}
                        onBlur={() => commitRename(post.id)}
                        onKeyDown={(e) => { if (e.key === "Enter") commitRename(post.id); if (e.key === "Escape") setRenamingPost(null); }}
                        onClick={(e) => e.stopPropagation()}
                        style={{ fontSize: 13, fontWeight: 500, color: TX, border: `1px solid ${AC}`, borderRadius: 4, padding: "2px 6px", background: WH, fontFamily: "inherit", outline: "none", width: "90%" }}
                      />
                    ) : (
                      <div
                        style={{ fontSize: 13, fontWeight: hasContent ? 600 : 450, color: hasContent ? TX : TX2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.3 }}
                        onDoubleClick={(e) => { e.stopPropagation(); setRenamingPost(post.id); setRenameVal(post.label); }}
                        title={t("notes.dblRename")}
                      >{post.label}</div>
                    )}

                    {/* Status pills row */}
                    {hasContent && (
                      <div style={{ display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap", alignItems: "center" }}>
                        {hasUrgent && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 700, color: "#fff", background: RD, padding: "2px 8px 2px 5px", borderRadius: 4, lineHeight: "14px", letterSpacing: "0.01em" }}>
                            <span style={{ fontSize: 11, lineHeight: 1 }}>!</span> {t("notes.urgent")}
                          </span>
                        )}
                        {openCount > 0 && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 600, color: "#B91C1C", background: REDBG, border: `1px solid ${REDBRD}`, padding: "1px 7px", borderRadius: 4, lineHeight: "15px" }}>
                            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#EF4444", flexShrink: 0 }} />{openCount} {t("notes.toProcess")}
                          </span>
                        )}
                        {carriedHere > 0 && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 600, color: AC, background: ACL, border: `1px solid ${ACL2}`, padding: "1px 7px", borderRadius: 4, lineHeight: "15px" }}>
                            <Ico name="repeat" size={8} color={AC} />{carriedHere} reportée{carriedHere > 1 ? "s" : ""}
                          </span>
                        )}
                        {progressCount > 0 && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 600, color: "#92400E", background: "#FFFBEB", border: "1px solid #FDE68A", padding: "1px 7px", borderRadius: 4, lineHeight: "15px" }}>
                            <span style={{ width: 5, height: 5, borderRadius: "50%", background: AC, flexShrink: 0 }} />{progressCount} {t("notes.inProgress")}
                          </span>
                        )}
                        {doneCount > 0 && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 500, color: "#166534", background: GRBG, border: "1px solid #C6E9B4", padding: "1px 7px", borderRadius: 4, lineHeight: "15px" }}>
                            <Ico name="check" size={8} color={GR} />{doneCount} résolu{doneCount > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right meta column */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {/* Counters */}
                    {hasContent && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 4 }}>
                        {remarks.length > 0 && (
                          <div style={{ display: "flex", alignItems: "center", gap: 3 }} title={`${remarks.length} remarque${remarks.length > 1 ? "s" : ""}`}>
                            <Ico name="edit" size={11} color={TX3} />
                            <span style={{ fontSize: 11, fontWeight: 600, color: TX2 }}>{remarks.length}</span>
                          </div>
                        )}
                        {photoCount > 0 && (
                          <div style={{ display: "flex", alignItems: "center", gap: 3 }} title={`${photoCount} photo${photoCount > 1 ? "s" : ""}`}>
                            <Ico name="camera" size={11} color={TX3} />
                            <span style={{ fontSize: 11, fontWeight: 600, color: TX2 }}>{photoCount}</span>
                          </div>
                        )}
                        {markerCount > 0 && (
                          <div style={{ display: "flex", alignItems: "center", gap: 3 }} title={`${markerCount} marqueur${markerCount > 1 ? "s" : ""}`}>
                            <Ico name="mappin" size={11} color={TX3} />
                            <span style={{ fontSize: 11, fontWeight: 600, color: TX2 }}>{markerCount}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Delete (empty posts only) */}
                    {!hasContent && (
                      <button onClick={(e) => { e.stopPropagation(); deletePost(post.id); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, flexShrink: 0, opacity: 0.4 }} title={t("notes.deleteEmptyPost")}>
                        <Ico name="trash" size={12} color={TX3} />
                      </button>
                    )}

                    {/* Arrow */}
                    <div style={{ width: 22, height: 22, borderRadius: 5, background: hasContent ? ACL : SB, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Ico name="arrowr" size={11} color={hasContent ? AC : TX3} />
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Add post inside card */}
        <div style={{ padding: "2px 8px 8px" }}>
          <button
            onClick={() => {
              const newId = String(project.posts.length + 1).padStart(2, "0");
              setProjects(prev => prev.map(p => p.id === project.id ? { ...p, posts: [...p.posts, { id: newId, label: t("notes.newPost"), notes: "", remarks: [] }] } : p));
              setTimeout(() => { setRenamingPost(newId); setRenameVal(t("notes.newPost")); }, 100);
            }}
            style={{ width: "100%", padding: "8px 12px", border: `1px dashed ${SBB}`, borderRadius: 7, background: "transparent", cursor: "pointer", fontSize: 11, color: TX3, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}
          >
            <Ico name="plus" size={12} color={TX3} />{t("notes.addPost")}
          </button>
        </div>
      </div>

      {/* ── Section 2 : Destinataires ── */}
      {project.participants.length > 0 && (
        <div style={{ background: WH, borderRadius: 12, border: `1px solid ${SBB}`, overflow: "hidden", marginBottom: 12 }}>
          {/* Section header */}
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "11px 16px", borderBottom: `1px solid ${SBB}`, background: SB }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: SB2, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: TX3 }}>2</span>
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: TX, letterSpacing: "-0.1px" }}>{t("notes.recipients")}</span>
            <span style={{ fontSize: 10.5, color: TX3, fontWeight: 400 }}>
              {recipientFilters.length === 0 ? t("notes.allRecipients") : `${recipientFilters.length} sélectionné${recipientFilters.length > 1 ? "s" : ""}`}
            </span>
          </div>

          {/* Recipients body */}
          <div style={{ padding: "12px 16px" }}>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              <button
                onClick={() => setRecipientFilters([])}
                style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 13px", border: `1.5px solid ${recipientFilters.length === 0 ? AC : SBB}`, borderRadius: 18, background: recipientFilters.length === 0 ? ACL : WH, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}
              >
                <span style={{ fontSize: 11, fontWeight: 600, color: recipientFilters.length === 0 ? AC : TX2 }}>{t("notes.allRecipients")}</span>
              </button>
              {project.participants.map((p, i) => {
                const selected = recipientFilters.includes(p.name);
                const countForP = project.posts.reduce((acc, post) => {
                  const remarks = getRemarks(post);
                  return acc + remarks.filter(r => !(r.recipients || []).length || (r.recipients || []).includes(p.name)).length;
                }, 0);
                return (
                  <button
                    key={i}
                    onClick={() => setRecipientFilters(prev => prev.includes(p.name) ? prev.filter(n => n !== p.name) : [...prev, p.name])}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 11px", border: `1.5px solid ${selected ? AC : SBB}`, borderRadius: 18, background: selected ? ACL : WH, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}
                  >
                    <div style={{ width: 18, height: 18, borderRadius: "50%", background: selected ? AC : SB2, color: selected ? "#fff" : TX3, fontSize: 7.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {initials(p.name)}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: selected ? 600 : 500, color: selected ? AC : TX2 }}>{p.name}</span>
                    <span style={{ fontSize: 9.5, color: TX3 }}>({countForP})</span>
                    {selected && <Ico name="check" size={9} color={AC} />}
                  </button>
                );
              })}
            </div>
            {recipientFilters.length > 0 && (() => {
              const cnt = project.posts.reduce((acc, post) => {
                const remarks = getRemarks(post);
                return acc + remarks.filter(r => !(r.recipients || []).length || recipientFilters.some(rec => (r.recipients || []).includes(rec))).length;
              }, 0);
              return <div style={{ marginTop: 8, fontSize: 10.5, color: TX3, background: SB, padding: "6px 10px", borderRadius: 6 }}><strong>{cnt}</strong> remarque{cnt !== 1 ? "s" : ""} incluses — <strong>{recipientFilters.join(", ")}</strong> + communes.</div>;
            })()}
          </div>
        </div>
      )}

      {/* ── Section 3 : Zone de génération ── */}
      {readyToGenerate ? (
        <div style={{ borderRadius: 12, overflow: "hidden", border: `1px solid ${ACL2}`, background: WH, boxShadow: "0 2px 10px rgba(217,123,13,0.07)", transition: "all 0.3s" }}>
          {/* Header */}
          <div style={{ background: `linear-gradient(135deg, ${AC} 0%, #C06A08 100%)`, padding: "14px 20px", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontSize: 14, lineHeight: 1 }}>✦</span>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", letterSpacing: "-0.2px" }}>{t("notes.readyTitle")}</div>
              <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.7)", marginTop: 0, fontWeight: 400 }}>{t("notes.readyDesc")}</div>
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: "flex", borderBottom: `1px solid ${SB2}` }}>
            {[
              { value: filledCount, label: `poste${filledCount > 1 ? "s" : ""}`, icon: "listcheck", color: AC },
              { value: totalRemarks, label: `remarque${totalRemarks > 1 ? "s" : ""}`, icon: "edit", color: TX },
              ...(urgentCount > 0 ? [{ value: urgentCount, label: `urgent${urgentCount > 1 ? "s" : ""}`, icon: "alert", color: RD }] : []),
              ...(totalPhotos > 0 ? [{ value: totalPhotos, label: `photo${totalPhotos > 1 ? "s" : ""}`, icon: "camera", color: TX2 }] : []),
            ].map((stat, i, arr) => (
              <div key={i} style={{ flex: 1, padding: "11px 10px", textAlign: "center", borderRight: i < arr.length - 1 ? `1px solid ${SB2}` : "none" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                  <Ico name={stat.icon} size={12} color={stat.color} />
                  <span style={{ fontSize: 18, fontWeight: 800, color: stat.color, letterSpacing: "-0.5px", lineHeight: 1 }}>{stat.value}</span>
                </div>
                <div style={{ fontSize: 9, color: TX3, fontWeight: 500, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>{stat.label}</div>
              </div>
            ))}
          </div>

          {/* CTA area */}
          <div style={{ padding: "12px 20px 16px" }}>
            {recipientFilters.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 10, padding: "5px 9px", background: SB, borderRadius: 6, border: `1px solid ${SBB}` }}>
                <Ico name="users" size={11} color={TX2} />
                <span style={{ fontSize: 10.5, color: TX2 }}>{t("notes.filteredVersion")}</span>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: TX }}>{recipientFilters.map(n => n.split(" ")[0]).join(", ")}</span>
              </div>
            )}

            {/* What happens next */}
            <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
              {[
                { icon: "edit", text: t("notes.redactionStep") },
                { icon: "file", text: t("notes.pdfStep") },
                { icon: "send", text: t("notes.sendStep") },
              ].map((step, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, flex: 1 }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: SB, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Ico name={step.icon} size={9} color={TX3} />
                  </div>
                  <span style={{ fontSize: 10.5, color: TX3, fontWeight: 500, lineHeight: 1.2 }}>{step.text}</span>
                </div>
              ))}
            </div>

            {/* Button */}
            <button
              onClick={() => onGenerate(recipientFilters, pvTitle)}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
                padding: "13px 24px", border: "none", borderRadius: 10,
                background: `linear-gradient(135deg, ${AC} 0%, #C06A08 100%)`,
                color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                letterSpacing: "-0.1px", transition: "box-shadow 0.3s, transform 0.15s",
                boxShadow: "0 3px 14px rgba(217,123,13,0.28)",
              }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 5px 20px rgba(217,123,13,0.38)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 3px 14px rgba(217,123,13,0.28)"; e.currentTarget.style.transform = "translateY(0)"; }}
            >
              <span style={{ fontSize: 15, opacity: 0.9 }}>✦</span>
              {t("notes.generateBtn")}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ borderRadius: 12, border: `1px solid ${SBB}`, overflow: "hidden", background: WH }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "11px 16px", borderBottom: `1px solid ${SBB}`, background: SB }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: SB2, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: TX3 }}>3</span>
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: TX2, letterSpacing: "-0.1px" }}>{t("notes.generateAI")}</span>
          </div>
          <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: TX3, lineHeight: 1.5 }}>{t("notes.fillOnePost")}</div>
              <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                {[
                  { icon: "edit", text: t("notes.redactionStep") },
                  { icon: "file", text: t("notes.pdfStep") },
                  { icon: "send", text: t("notes.sendStep") },
                ].map((step, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, opacity: 0.4 }}>
                    <div style={{ width: 16, height: 16, borderRadius: "50%", background: SB2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Ico name={step.icon} size={8} color={TX3} />
                    </div>
                    <span style={{ fontSize: 10, color: TX3, fontWeight: 500 }}>{step.text}</span>
                  </div>
                ))}
              </div>
            </div>
            <button
              disabled
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "12px 22px", border: "none", borderRadius: 10, background: DIS, color: DIST, fontSize: 13, fontWeight: 700, cursor: "not-allowed", fontFamily: "inherit", flexShrink: 0, letterSpacing: "-0.1px" }}
            >
              <span style={{ fontSize: 13, opacity: 0.4 }}>✦</span>
              {t("notes.generateShort")}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

function ResultView({ project, setProjects, onBack, onBackHome, profile, pvRecipients, pvTitle }) {
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [sec, setSec] = useState(0);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [pdfErr, setPdfErr] = useState("");
  const timer = useRef(null);
  const ctrl = useRef(null);
  const pvNum = project.pvHistory.length + 1;
  const t = useT();

  useEffect(() => { run(); return () => { clearInterval(timer.current); ctrl.current?.abort(); }; }, []);

  const run = async () => {
    setLoading(true);
    setErr("");
    setSec(0);
    timer.current = setInterval(() => setSec((s) => s + 1), 1000);
    ctrl.current = new AbortController();
    if (!profile?.apiKey?.trim()) {
      setErr(t("result.apiKeyMissing"));
      setLoading(false);
      clearInterval(timer.current);
      return;
    }
    const allRemarks  = (p) => (p.remarks || []).length > 0 ? p.remarks : (p.notes?.trim() ? parseNotesToRemarks(p.notes) : []);
    const toRemarks   = (p) => {
      const all = allRemarks(p);
      if (!pvRecipients || pvRecipients.length === 0) return all;
      // keep remarks with no recipients (= common) OR assigned to any chosen recipient
      return all.filter((r) => !(r.recipients || []).length || pvRecipients.some(rec => (r.recipients || []).includes(rec)));
    };
    const notes = project.posts
      .filter((p) => toRemarks(p).length > 0 || (p.photos || []).length > 0 || (project.planMarkers || []).some((m) => m.postId === p.id))
      .map((p) => {
        const remarks = toRemarks(p);
        const byStatus = (id) => remarks.filter((r) => r.status === id);
        const fmtLine  = (r) => (r.urgent ? "> " : "- ") + r.text;
        const sections = [];
        if (byStatus("open").length)     sections.push(t("result.toProcess") + "\n" + byStatus("open").map(fmtLine).join("\n"));
        if (byStatus("progress").length) sections.push("En cours :\n" + byStatus("progress").map(fmtLine).join("\n"));
        if (byStatus("done").length)     sections.push(t("result.resolved") + "\n" + byStatus("done").map(fmtLine).join("\n"));
        const postMarkers = (project.planMarkers || []).filter((m) => m.postId === p.id);
        const extra = [
          (p.photos || []).length > 0 ? `[${p.photos.length} photo(s) jointe(s)]` : "",
          postMarkers.length > 0 ? `[Plan : marqueur${postMarkers.length > 1 ? "s" : ""} n°${postMarkers.map((m) => m.number).join(", ")}]` : "",
        ].filter(Boolean).join(" ");
        return `${p.id}. ${p.label}\n${sections.join("\n")}${extra ? "\n" + extra : ""}`;
      })
      .join("\n\n");
    const SYS = t("ai.systemPrompt");
    const recipientCtx = pvRecipients && pvRecipients.length > 0 ? "\n" + t("ai.recipientFilter", { recipients: pvRecipients.join(", ") }) : "";
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${profile.apiKey}` }, signal: ctrl.current.signal,
        body: JSON.stringify({ model: "gpt-4o", max_tokens: 2000, messages: [{ role: "system", content: SYS }, { role: "user", content: `PROJET: ${project.name}\nCLIENT: ${project.client}\nENTREPRISE: ${project.contractor}\nPV N${pvNum}${recipientCtx}\n\nNOTES:\n${notes}\n\nTransforme en PV.` }] }),
      });
      if (!r.ok) throw new Error("Erreur " + r.status);
      const d = await r.json();
      const txt = d.choices?.[0]?.message?.content;
      if (txt) setResult(txt); else throw new Error(t("result.emptyResponse"));
    } catch (e) { setErr(e.name === "AbortError" ? t("result.cancelled") : e.message); }
    finally { setLoading(false); clearInterval(timer.current); }
  };

  const date = new Date().toLocaleDateString("fr-BE");
  const parts = project.participants.map((p) => `  ${p.role.padEnd(14)} ${p.name}`).join("\n");
  const displayTitle = pvTitle || `PV n°${pvNum}`;
  const full = result ? `${displayTitle.toUpperCase()}\nde la REUNION du ${date}\n\nMaitre d'ouvrage : ${project.client}\nChantier : ${project.name}\n${project.desc}\n\nPresents :\n${parts}\n\n${"=".repeat(50)}\n\n${result}\n\n${"=".repeat(50)}\nArchitecte, ${project.bureau}` : "";
  const filledCount = project.posts.filter((p) => {
    const remarks = (p.remarks || []).length > 0 ? p.remarks : (p.notes?.trim() ? parseNotesToRemarks(p.notes) : []);
    return remarks.length > 0 || (p.photos || []).length > 0 || (project.planMarkers || []).some((m) => m.postId === p.id);
  }).length;

  const savePV = () => {
    setProjects((prev) => prev.map((p) => p.id === project.id ? {
      ...p,
      pvHistory: [{ number: pvNum, date, author: profile.name || "Architecte", postsCount: filledCount, excerpt: result.slice(0, 100) + "...", content: result, status: "draft" }, ...p.pvHistory],
      // Carry forward open/progress remarks; remove done ones
      posts: p.posts.map((po) => ({
        ...po,
        notes: "",
        remarks: (po.remarks || [])
          .filter((r) => r.status !== "done")
          .map((r) => ({ ...r, carriedFrom: pvNum })),
      })),
    } : p));
    setSaved(true);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: "8px", minWidth: 40, minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 }}><Ico name="back" color={TX2} /></button>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: TX, letterSpacing: "-0.2px" }}>{pvTitle || `PV n°${pvNum}`}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 3, padding: "2px 7px", background: ACL, border: `1px solid ${ACL2}`, borderRadius: 5 }}>
              <span style={{ fontSize: 9, color: AC }}>✦</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: AC, letterSpacing: "0.04em" }}>IA</span>
            </div>
          </div>
          {pvRecipients && pvRecipients.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
              <Ico name="users" size={11} color={AC} />
              <span style={{ fontSize: 11, color: AC, fontWeight: 600 }}>Pour {pvRecipients.join(", ")}</span>
              <span style={{ fontSize: 11, color: TX3 }}>— version filtrée</span>
            </div>
          )}
        </div>
      </div>
      {loading && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "52px 20px 40px", textAlign: "center" }}>
          {/* Icône IA animée */}
          <div style={{ width: 52, height: 52, borderRadius: 14, background: ACL, border: `1px solid ${ACL2}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18, position: "relative" }}>
            <span style={{ fontSize: 22, color: AC }}>✦</span>
            <div style={{ position: "absolute", inset: -3, borderRadius: 17, border: `2px solid ${AC}`, opacity: 0.2, animation: "ring 1.8s ease infinite" }} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: TX, marginBottom: 4, letterSpacing: "-0.2px" }}>{t("result.generating")}</div>
          <div style={{ fontSize: 13, color: TX3, marginBottom: 28 }}>{t("result.generatingDesc")}</div>
          {/* Étapes progressives */}
          <div style={{ width: "100%", maxWidth: 300, textAlign: "left", marginBottom: 28 }}>
            {[
              { label: t("result.stepAnalysis"), delay: 0 },
              { label: t("result.stepDetection"), delay: 2 },
              { label: t("result.stepFormatting"), delay: 4 },
            ].map((step, i) => {
              const done = sec > step.delay;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: done ? AC : SB2, border: `1px solid ${done ? AC : SBB}`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.4s" }}>
                    {done ? <Ico name="check" size={10} color="#fff" /> : <div style={{ width: 5, height: 5, borderRadius: "50%", background: SBB }} />}
                  </div>
                  <span style={{ fontSize: 12, color: done ? TX2 : TX3, fontWeight: done ? 500 : 400, transition: "color 0.4s" }}>{step.label}</span>
                  {i === 2 && !done && <div style={{ width: 12, height: 12, border: `2px solid ${SBB}`, borderTopColor: AC, borderRadius: "50%", animation: "sp .7s linear infinite", flexShrink: 0 }} />}
                </div>
              );
            })}
          </div>
          <button onClick={() => ctrl.current?.abort()} style={{ padding: "7px 18px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, color: TX3, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>{t("cancel")}</button>
        </div>
      )}
      {err && (
        <div>
          <div style={{ padding: 14, background: REDBG, borderRadius: 10, color: RD, fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
            <strong>{t("result.error")}</strong> {err}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onBack} style={{ flex: 1, padding: "10px 20px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: TX2 }}>Retour</button>
            <button onClick={run} style={{ flex: 1, padding: "10px 20px", border: "none", borderRadius: 8, background: AC, cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: "#fff", fontWeight: 600 }}>{t("retry")}</button>
          </div>
        </div>
      )}
      {result && (() => {
        const lines = result.split("\n").filter(l => l.trim());
        const actionLines  = lines.filter(l => l.trim().startsWith("> ")).length;
        const pointLines   = lines.filter(l => l.trim().startsWith("- ")).length;
        const sectionCount = lines.filter(l => /^\d+\./.test(l.trim())).length;
        return (
        <div>
          {/* ── Bandeau IA ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: ACL, border: `1px solid ${ACL2}`, borderRadius: 10, marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", background: AC, borderRadius: 6, flexShrink: 0 }}>
                <span style={{ fontSize: 10, color: "#fff" }}>✦</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", letterSpacing: "0.02em" }}>IA</span>
              </div>
              <span style={{ fontSize: 12, color: TX2 }}>Rédigé par <strong>gpt-4o</strong> en {sec}s</span>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {sectionCount > 0 && <span style={{ fontSize: 11, color: TX2 }}><strong>{sectionCount}</strong> poste{sectionCount > 1 ? "s" : ""}</span>}
              {actionLines > 0  && <span style={{ fontSize: 11, color: RD,  fontWeight: 600 }}><strong>{actionLines}</strong> point{actionLines > 1 ? "s" : ""} urgent{actionLines > 1 ? "s" : ""}</span>}
              {pointLines > 0   && <span style={{ fontSize: 11, color: TX2 }}><strong>{pointLines}</strong> décision{pointLines > 1 ? "s" : ""}</span>}
              {!saved && <span style={{ fontSize: 11, color: TX3, fontStyle: "italic" }}>Non sauvegardé</span>}
              {saved  && <span style={{ fontSize: 11, color: GR,  fontWeight: 600 }}>✓ Sauvegardé</span>}
            </div>
          </div>

          {/* ── Corps du PV ── */}
          <div style={{ position: "relative" }}>
            <textarea
              value={result}
              onChange={(e) => setResult(e.target.value)}
              style={{ width: "100%", padding: 16, border: `1px solid ${SBB}`, borderRadius: 10, background: WH, fontSize: 13, fontFamily: "monospace", lineHeight: 1.8, color: TX, boxSizing: "border-box", resize: "vertical", minHeight: 300, outline: "none" }}
            />
            <div style={{ position: "absolute", top: 10, right: 12, fontSize: 10, color: TX3, background: WH, padding: "2px 6px", borderRadius: 4, border: `1px solid ${SBB}`, pointerEvents: "none" }}>modifiable</div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button onClick={onBack} style={{ flex: 1, padding: 12, border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: TX2 }}>{t("result.editNotes")}</button>
            <button onClick={() => { navigator.clipboard.writeText(full); setCopied(true); setTimeout(() => setCopied(false), 2000); }} style={{ flex: 1, padding: 12, border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: TX2, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
              <Ico name="copy" size={14} color={TX3} />{copied ? t("copied") : t("copy")}
            </button>
            <button onClick={savePV} disabled={saved} style={{ flex: 1, padding: 12, border: "none", borderRadius: 8, background: saved ? GR : AC, cursor: saved ? "default" : "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
              <Ico name={saved ? "check" : "save"} size={14} color="#fff" />{saved ? t("result.saved") : t("result.saveValidate")}
            </button>
          </div>
          <button
            onClick={async () => {
              setPdfGenerating(true);
              setPdfErr("");
              try {
                await generatePDF(project, pvNum, date, result, profile);
              } catch (e) {
                setPdfErr("Erreur PDF : " + (e.message || "inconnue"));
              }
              setPdfGenerating(false);
            }}
            disabled={pdfGenerating}
            style={{ width: "100%", marginTop: 8, padding: 13, border: "none", borderRadius: 8, background: pdfGenerating ? SB2 : TX, color: pdfGenerating ? TX3 : "#fff", fontSize: 13, fontWeight: 600, cursor: pdfGenerating ? "default" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
          >
            {pdfGenerating
              ? <><div style={{ width: 14, height: 14, border: `2px solid ${TX3}`, borderTopColor: AC, borderRadius: "50%", animation: "sp .7s linear infinite" }} />Préparation du plan…</>
              : <><Ico name="file" size={15} color="#fff" />{(project.planMarkers || []).length > 0 ? t("result.downloadPDFPlan") : t("result.downloadPDF")}</>
            }
          </button>
          {pdfErr && <div style={{ marginTop: 6, padding: 10, background: REDBG, borderRadius: 8, color: RD, fontSize: 12 }}>{pdfErr}</div>}
          {saved && <button onClick={onBackHome} style={{ width: "100%", marginTop: 8, padding: 12, border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: TX2 }}>Retour au projet</button>}
          {project.posts.some((p) => (p.photos || []).length > 0) && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: TX, marginBottom: 12 }}>Photos jointes</div>
              {project.posts.filter((p) => (p.photos || []).length > 0).map((post) => (
                <div key={post.id} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: TX2, marginBottom: 8 }}>{post.id}. {post.label}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {(post.photos || []).map((ph) => (
                      <img key={ph.id} src={getPhotoUrl(ph)} alt="" style={{ width: 120, height: 90, objectFit: "cover", borderRadius: 8, border: `1px solid ${SBB}` }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        );
      })()}
    </div>
  );
}

function DocumentsView({ project, setProjects, onBack }) {
  const [activeCategory, setActiveCategory] = useState("all");
  const [viewDoc, setViewDoc] = useState(null);
  const [uploadCat, setUploadCat] = useState("plans");
  const [versionHistoryDoc, setVersionHistoryDoc] = useState(null);
  const [newVersionDocId, setNewVersionDocId] = useState(null);
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState(null);
  const uploadRef = useRef(null);
  const newVersionRef = useRef(null);
  const t = useT();

  const docs = project.documents || [];
  const filtered = activeCategory === "all" ? docs : docs.filter((d) => d.category === activeCategory);

  const addDocuments = (files, cat) => {
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setProjects((prev) => prev.map((p) => p.id === project.id ? {
          ...p,
          documents: [...(p.documents || []), {
            id: Date.now() + Math.random(),
            name: file.name,
            category: cat,
            versions: [{
              v: 1,
              dataUrl: ev.target.result,
              size: file.size,
              type: file.type.startsWith("image/") ? "image" : "pdf",
              addedAt: new Date().toLocaleDateString("fr-BE"),
            }],
          }],
        } : p));
      };
      reader.readAsDataURL(file);
    });
  };

  const addVersion = (docId, file) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      setProjects((prev) => prev.map((p) => {
        if (p.id !== project.id) return p;
        return {
          ...p,
          documents: (p.documents || []).map((d) => {
            if (d.id !== docId) return d;
            const existing = d.versions || [{ v: 1, dataUrl: d.dataUrl, size: d.size, type: d.type, addedAt: d.addedAt }];
            return {
              ...d,
              versions: [...existing, {
                v: existing.length + 1,
                dataUrl: ev.target.result,
                size: file.size,
                type: file.type.startsWith("image/") ? "image" : "pdf",
                addedAt: new Date().toLocaleDateString("fr-BE"),
              }],
            };
          }),
        };
      }));
    };
    reader.readAsDataURL(file);
  };

  const removeDoc = (id) => setProjects((prev) => prev.map((p) => p.id === project.id ? {
    ...p, documents: (p.documents || []).filter((d) => d.id !== id),
  } : p));

  const fmt = (b) => b < 1024 ? b + " o" : b < 1048576 ? Math.round(b / 1024) + " Ko" : (b / 1048576).toFixed(1) + " Mo";
  const catInfo = (id) => DOC_CATEGORIES.find((c) => c.id === id) || DOC_CATEGORIES[0];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: "8px", minWidth: 40, minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 }}><Ico name="back" color={TX2} /></button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: TX }}>{t("docs.title")}</div>
          <div style={{ fontSize: 12, color: TX3 }}>{project.name} · {docs.length} document{docs.length !== 1 ? "s" : ""}</div>
        </div>
      </div>

      {/* Zone d'upload */}
      <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 160px" }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: TX2, marginBottom: 6 }}>{t("docs.category")}</div>
            <select value={uploadCat} onChange={(e) => setUploadCat(e.target.value)} style={{ width: "100%", padding: "8px 10px", border: `1px solid ${SBB}`, borderRadius: 6, fontSize: 13, background: SB, color: TX, fontFamily: "inherit" }}>
              {DOC_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <button onClick={() => uploadRef.current.click()} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", border: "none", borderRadius: 8, background: AC, color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
            <Ico name="plus" size={14} color="#fff" />{t("docs.addFiles")}
          </button>
          <input ref={uploadRef} type="file" accept=".pdf,image/*" multiple style={{ display: "none" }} onChange={(e) => { addDocuments(e.target.files, uploadCat); e.target.value = ""; }} />
          <input ref={newVersionRef} type="file" accept=".pdf,image/*" style={{ display: "none" }} onChange={(e) => { if (e.target.files[0] && newVersionDocId) addVersion(newVersionDocId, e.target.files[0]); setNewVersionDocId(null); e.target.value = ""; }} />
        </div>
        <div style={{ fontSize: 11, color: TX3, marginTop: 8 }}>{t("docs.formats")}</div>
      </div>

      {/* Onglets catégories */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {[{ id: "all", label: t("all"), count: docs.length }, ...DOC_CATEGORIES.map((c) => ({ id: c.id, label: c.label, count: docs.filter((d) => d.category === c.id).length }))].map((tab) => (
          <button key={tab.id} onClick={() => setActiveCategory(tab.id)} style={{ padding: "5px 14px", border: `1px solid ${activeCategory === tab.id ? AC : SBB}`, borderRadius: 20, background: activeCategory === tab.id ? ACL : WH, color: activeCategory === tab.id ? AC : TX2, fontWeight: activeCategory === tab.id ? 600 : 400, fontSize: 12, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
            {tab.label} <span style={{ opacity: 0.65 }}>({tab.count})</span>
          </button>
        ))}
      </div>

      {/* Liste documents */}
      {filtered.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "50px 20px", border: `2px dashed ${SBB}`, borderRadius: 12, background: WH, textAlign: "center" }}>
          <Ico name="folder" size={38} color={TX3} />
          <div style={{ fontSize: 14, fontWeight: 600, color: TX, marginTop: 14, marginBottom: 6 }}>{activeCategory !== "all" ? t("docs.noDocsCat") : t("docs.noDocs")}</div>
          <div style={{ fontSize: 13, color: TX3 }}>{t("docs.addAbove")}</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {filtered.map((doc) => {
            const cat = catInfo(doc.category);
            const cur = getDocCurrent(doc);
            return (
              <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: WH, border: `1px solid ${SBB}`, borderRadius: 10 }}>
                {cur.type === "image" ? (
                  <img src={cur.dataUrl} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8, flexShrink: 0, border: `1px solid ${SBB}` }} />
                ) : (
                  <div style={{ width: 44, height: 44, borderRadius: 8, background: REDBG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0, border: `1px solid ${REDBRD}`, gap: 1 }}>
                    <span style={{ fontSize: 8, fontWeight: 700, color: RD, letterSpacing: "0.06em" }}>PDF</span>
                    <Ico name="file" size={13} color={RD} />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{doc.name}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: cat.color, background: cat.bg, padding: "1px 7px", borderRadius: 10 }}>{cat.label}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: BL, background: BLB, padding: "1px 7px", borderRadius: 6 }}>v{cur.version}</span>
                    <span style={{ fontSize: 11, color: TX3 }}>{fmt(cur.size)}</span>
                    <span style={{ fontSize: 11, color: TX3 }}>{cur.addedAt}</span>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                  <button onClick={() => setViewDoc({ name: doc.name, dataUrl: cur.dataUrl, type: cur.type })} style={{ background: SB, border: "none", borderRadius: 6, cursor: "pointer", padding: "6px 10px", display: "flex", alignItems: "center", gap: 3 }}>
                    <Ico name="eye" size={13} color={TX3} /><span style={{ fontSize: 11, color: TX2 }}>{t("view")}</span>
                  </button>
                  <button title={t("docs.newVersion")} onClick={() => { setNewVersionDocId(doc.id); setTimeout(() => newVersionRef.current?.click(), 50); }} style={{ background: ACL, border: `1px solid ${ACL2}`, borderRadius: 6, cursor: "pointer", padding: "6px 8px", display: "flex", alignItems: "center", gap: 2 }}>
                    <Ico name="download" size={13} color={AC} /><span style={{ fontSize: 11, color: AC, fontWeight: 700 }}>v+</span>
                  </button>
                  {cur.version > 1 && (
                    <button title={t("docs.versionHistory")} onClick={() => setVersionHistoryDoc(doc)} style={{ background: SB, border: "none", borderRadius: 6, cursor: "pointer", padding: "6px 8px", display: "flex", alignItems: "center" }}>
                      <Ico name="history" size={14} color={TX3} />
                    </button>
                  )}
                  {confirmDeleteDoc === doc.id ? (
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <button onClick={() => { removeDoc(doc.id); setConfirmDeleteDoc(null); }} style={{ fontSize: 11, fontWeight: 700, color: WH, background: RD, border: "none", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontFamily: "inherit" }}>Suppr.</button>
                      <button onClick={() => setConfirmDeleteDoc(null)} style={{ fontSize: 11, color: TX2, background: SB, border: `1px solid ${SBB}`, borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontFamily: "inherit" }}>Non</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDeleteDoc(doc.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 6 }}>
                      <Ico name="trash" size={14} color={TX3} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Viewer modal */}
      <Modal open={!!viewDoc} onClose={() => setViewDoc(null)} title={viewDoc?.name || ""} wide>
        {viewDoc && (
          viewDoc.type === "image" ? (
            <img src={viewDoc.dataUrl} alt={viewDoc.name} style={{ width: "100%", borderRadius: 8, display: "block" }} />
          ) : (
            <div>
              <iframe src={viewDoc.dataUrl} title={viewDoc.name} style={{ width: "100%", height: "60vh", border: "none", borderRadius: 8 }} />
              <div style={{ marginTop: 12, display: "flex", justifyContent: "center" }}>
                <a href={viewDoc.dataUrl} download={viewDoc.name} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 18px", background: AC, color: "#fff", borderRadius: 8, fontWeight: 600, fontSize: 13, textDecoration: "none" }}>
                  <Ico name="download" size={14} color="#fff" />{t("download")}
                </a>
              </div>
            </div>
          )
        )}
      </Modal>

      {/* Version history modal */}
      <Modal open={!!versionHistoryDoc} onClose={() => setVersionHistoryDoc(null)} title={`Versions — ${versionHistoryDoc?.name || ""}`} wide>
        {versionHistoryDoc && (() => {
          const versions = versionHistoryDoc.versions
            ? [...versionHistoryDoc.versions].reverse()
            : [{ v: 1, dataUrl: versionHistoryDoc.dataUrl, size: versionHistoryDoc.size, type: versionHistoryDoc.type, addedAt: versionHistoryDoc.addedAt }];
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {versions.map((v, i) => (
                <div key={v.v} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: i === 0 ? ACL : SB, border: `1px solid ${i === 0 ? ACL2 : SBB}`, borderRadius: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: i === 0 ? AC : SBB, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: i === 0 ? "#fff" : TX2 }}>v{v.v}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: TX }}>{i === 0 ? "Version actuelle" : `Version ${v.v}`}</div>
                    <div style={{ fontSize: 11, color: TX3, marginTop: 2 }}>{v.addedAt} · {fmt(v.size)}</div>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => setViewDoc({ name: versionHistoryDoc.name, dataUrl: v.dataUrl, type: v.type })} style={{ background: SB, border: `1px solid ${SBB}`, borderRadius: 6, cursor: "pointer", padding: "6px 10px", display: "flex", alignItems: "center", gap: 3 }}>
                      <Ico name="eye" size={13} color={TX3} /><span style={{ fontSize: 11, color: TX2 }}>{t("view")}</span>
                    </button>
                    {i !== 0 && (
                      <button onClick={() => {
                        setProjects((prev) => prev.map((p) => {
                          if (p.id !== project.id) return p;
                          return {
                            ...p,
                            documents: (p.documents || []).map((d) => {
                              if (d.id !== versionHistoryDoc.id) return d;
                              const existing = d.versions || [];
                              return { ...d, versions: [...existing, { ...v, v: existing.length + 1, addedAt: new Date().toLocaleDateString("fr-BE") }] };
                            }),
                          };
                        }));
                        setVersionHistoryDoc(null);
                      }} style={{ background: SB, border: `1px solid ${SBB}`, borderRadius: 6, cursor: "pointer", padding: "6px 10px", display: "flex", alignItems: "center", gap: 3 }}>
                        <Ico name="repeat" size={13} color={TX3} /><span style={{ fontSize: 11, color: TX2 }}>Restaurer</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}

function PlanViewer({ project, setProjects, onBack }) {
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
    if (!project.planImage || !canvasRef.current) return;
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
    img.src = project.planImage;
  }, [project.planImage]);

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
    if (!el || !project.planImage) return;
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
  }, [project.planImage]);

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

        {/* Changer de plan (secondaire) */}
        {project.planImage && (
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

      {!project.planImage ? (
        /* ── Empty state ── */
        <div style={{ margin: "0 20px 20px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 20px", border: `2px dashed ${SBB}`, borderRadius: 14, background: WH, textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: SB, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
            <Ico name="mappin" size={26} color={TX3} />
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
                    style={{ flex: 1, padding: "6px 2px", border: "none", borderRadius: 6, background: mode === m.id ? WH : "transparent", color: mode === m.id ? TX : TX3, fontWeight: mode === m.id ? 700 : 400, fontSize: 10, cursor: "pointer", fontFamily: "inherit", boxShadow: mode === m.id ? "0 1px 2px rgba(0,0,0,0.08)" : "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}
                  >
                    <Ico name={m.icon} size={13} color={mode === m.id ? AC : TX3} />
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
                          <div style={{ width: 20, height: 20, borderRadius: "50%", background: AC, color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{m.number}</div>
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
                          <div style={{ width: 20, height: 20, borderRadius: "50%", background: AC, color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{m.number}</div>
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
                        style={{ padding: "8px 4px 6px", border: `1.5px solid ${active ? AC : SBB}`, borderRadius: 8, background: active ? ACL : WH, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, fontFamily: "inherit", boxShadow: active ? "none" : "0 1px 2px rgba(0,0,0,0.04)" }}
                      >
                        <Ico name={t.icon} size={14} color={active ? AC : TX2} />
                        <span style={{ fontSize: 9, fontWeight: active ? 700 : 500, color: active ? AC : TX3, letterSpacing: "0.01em", lineHeight: 1 }}>{t.label}</span>
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
                <img src={project.planImage} alt="Plan" style={{ display: "block", width: imgBase.w, height: imgBase.h }} />
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

function PlanningView({ project, setProjects, onBack }) {
  const EMPTY_LOT = { name: "", contractor: "", startDate: "", endDate: "", progress: 0, color: "amber" };
  const [modal,     setModal]     = useState(null); // null | "add" | "edit"
  const [editLot,   setEditLot]   = useState(EMPTY_LOT);
  const [editingId, setEditingId] = useState(null);
  const [confirmDeleteLot, setConfirmDeleteLot] = useState(null);
  const t = useT();

  const lots = project.lots || [];

  const saveLot = () => {
    if (!editLot.name.trim()) return;
    if (modal === "add") {
      setProjects((prev) => prev.map((p) => p.id === project.id ? {
        ...p, lots: [...(p.lots || []), { ...editLot, id: Date.now() }]
      } : p));
    } else {
      setProjects((prev) => prev.map((p) => p.id === project.id ? {
        ...p, lots: (p.lots || []).map((l) => l.id === editingId ? { ...editLot, id: editingId } : l)
      } : p));
    }
    setModal(null); setEditLot(EMPTY_LOT); setEditingId(null);
  };

  const deleteLot = (id) => setProjects((prev) => prev.map((p) => p.id === project.id ? {
    ...p, lots: (p.lots || []).filter((l) => l.id !== id)
  } : p));

  const setProgress = (id, val) => setProjects((prev) => prev.map((p) => p.id === project.id ? {
    ...p, lots: (p.lots || []).map((l) => l.id === id ? { ...l, progress: val } : l)
  } : p));

  // ── Gantt helpers ───────────────────────────────────────────
  const datedLots = lots.filter((l) => l.startDate && l.endDate);
  const toMs  = (d) => new Date(d).getTime();
  const minMs = datedLots.length ? Math.min(...datedLots.map((l) => toMs(l.startDate))) : null;
  const maxMs = datedLots.length ? Math.max(...datedLots.map((l) => toMs(l.endDate)))   : null;
  const spanMs = maxMs && minMs ? maxMs - minMs : 0;
  const pct = (ms) => spanMs > 0 ? Math.max(0, Math.min(100, ((ms - minMs) / spanMs) * 100)) : 0;
  const todayMs = (() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); })();
  const todayPct = spanMs > 0 && todayMs >= minMs && todayMs <= maxMs ? pct(todayMs) : null;

  const fmtDate = (d) => { if (!d) return "—"; const dt = new Date(d); return dt.toLocaleDateString("fr-BE", { day: "numeric", month: "short" }); };
  const overallProgress = lots.length ? Math.round(lots.reduce((s, l) => s + (l.progress || 0), 0) / lots.length) : 0;

  const getLotColor = (lot) => LOT_COLORS.find((c) => c.id === (lot.color || "amber")) || LOT_COLORS[0];

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: "8px", minWidth: 40, minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 }}><Ico name="back" color={TX2} /></button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: TX }}>{t("planning.title")}</div>
          <div style={{ fontSize: 12, color: TX3 }}>{project.name}{lots.length > 0 ? ` · ${lots.length} lot${lots.length > 1 ? "s" : ""} · ${overallProgress}% avancement` : ""}</div>
        </div>
        <button onClick={() => { setEditLot(EMPTY_LOT); setEditingId(null); setModal("add"); }} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", border: "none", borderRadius: 8, background: AC, color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
          <Ico name="plus" size={14} color="#fff" />{t("planning.lot")}
        </button>
      </div>

      {lots.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 20px", border: `2px dashed ${SBB}`, borderRadius: 14, background: WH, textAlign: "center" }}>
          <Ico name="gantt" size={40} color={TX3} />
          <div style={{ fontSize: 15, fontWeight: 600, color: TX, marginTop: 16, marginBottom: 6 }}>{t("planning.noLots")}</div>
          <div style={{ fontSize: 13, color: TX3, marginBottom: 20, maxWidth: 320 }}>{t("planning.noLotsDesc")}</div>
          <button onClick={() => { setEditLot(EMPTY_LOT); setEditingId(null); setModal("add"); }} style={{ padding: "10px 24px", border: "none", borderRadius: 10, background: AC, color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>{t("planning.addLot")}</button>
        </div>
      ) : (
        <div>
          {/* Overall progress */}
          <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 12, padding: "12px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: TX }}>{t("planning.globalProgress")}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: TX }}>{overallProgress}%</span>
              </div>
              <PB value={overallProgress} />
            </div>
            <div style={{ display: "flex", gap: 10, fontSize: 11, color: TX3, flexShrink: 0 }}>
              <span style={{ color: GR, fontWeight: 600 }}>{lots.filter((l) => calcLotStatus(l).id === "done").length} terminé{lots.filter((l) => calcLotStatus(l).id === "done").length > 1 ? "s" : ""}</span>
              <span style={{ color: RD, fontWeight: 600 }}>{lots.filter((l) => calcLotStatus(l).id === "delayed").length} {t("planning.late")}</span>
            </div>
          </div>

          {/* Gantt timeline */}
          {datedLots.length > 0 && (
            <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 12, padding: 16, marginBottom: 14, overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: TX3 }}>{fmtDate(new Date(minMs).toISOString().slice(0,10))}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: TX2 }}>{t("planning.calendar")}</span>
                <span style={{ fontSize: 11, color: TX3 }}>{fmtDate(new Date(maxMs).toISOString().slice(0,10))}</span>
              </div>
              <div style={{ position: "relative" }}>
                {/* Today marker */}
                {todayPct !== null && (
                  <div style={{ position: "absolute", left: `${todayPct}%`, top: 0, bottom: 0, width: 1.5, background: RD, zIndex: 2, pointerEvents: "none" }} />
                )}
                {datedLots.map((lot, i) => {
                  const lc     = getLotColor(lot);
                  const st     = calcLotStatus(lot);
                  const left   = pct(toMs(lot.startDate));
                  const width  = Math.max(1, pct(toMs(lot.endDate)) - left);
                  return (
                    <div key={lot.id} style={{ marginBottom: i < datedLots.length - 1 ? 6 : 0, display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ fontSize: 11, color: TX2, width: 90, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={lot.name}>{lot.name}</div>
                      <div style={{ flex: 1, position: "relative", height: 18, background: SB, borderRadius: 4 }}>
                        {/* Full bar */}
                        <div style={{ position: "absolute", left: `${left}%`, width: `${width}%`, height: "100%", background: lc.bg, border: `1px solid ${lc.value}40`, borderRadius: 4 }} />
                        {/* Progress fill */}
                        <div style={{ position: "absolute", left: `${left}%`, width: `${width * (lot.progress || 0) / 100}%`, height: "100%", background: st.id === "delayed" ? RD + "80" : lc.value + "80", borderRadius: 4 }} />
                        {(lot.progress || 0) > 0 && (
                          <div style={{ position: "absolute", left: `${left}%`, width: `${width}%`, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: TX, opacity: 0.75 }}>{lot.progress}%</span>
                          </div>
                        )}
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: st.color, background: st.bg, padding: "1px 5px", borderRadius: 4, flexShrink: 0 }}>{st.label}</span>
                    </div>
                  );
                })}
                {/* Today label */}
                {todayPct !== null && (
                  <div style={{ position: "absolute", left: `${todayPct}%`, top: -18, transform: "translateX(-50%)", fontSize: 10, fontWeight: 700, color: RD, background: REDBG, padding: "1px 4px", borderRadius: 3, pointerEvents: "none", whiteSpace: "nowrap" }}>{t("planning.today")}</div>
                )}
              </div>
            </div>
          )}

          {/* Lot list */}
          {lots.map((lot) => {
            const st = calcLotStatus(lot);
            const lc = getLotColor(lot);
            return (
              <div key={lot.id} style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 12, padding: 14, marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: lc.value, marginTop: 4, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: TX }}>{lot.name}</div>
                    {lot.contractor && <div style={{ fontSize: 12, color: TX3, marginTop: 1 }}>{lot.contractor}</div>}
                    <div style={{ display: "flex", gap: 10, marginTop: 3, fontSize: 11, color: TX3 }}>
                      {lot.startDate && <span>{fmtDate(lot.startDate)}</span>}
                      {lot.startDate && lot.endDate && <span>→</span>}
                      {lot.endDate   && <span>{fmtDate(lot.endDate)}</span>}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: st.color, background: st.bg, padding: "2px 7px", borderRadius: 6, flexShrink: 0 }}>{st.label}</span>
                  <button onClick={() => { setEditLot({ name: lot.name, contractor: lot.contractor || "", startDate: lot.startDate || "", endDate: lot.endDate || "", progress: lot.progress || 0, color: lot.color || "amber" }); setEditingId(lot.id); setModal("edit"); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0 }}>
                    <Ico name="edit" size={14} color={TX3} />
                  </button>
                  {confirmDeleteLot === lot.id ? (
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => { deleteLot(lot.id); setConfirmDeleteLot(null); }} style={{ fontSize: 11, fontWeight: 700, color: WH, background: RD, border: "none", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontFamily: "inherit" }}>Supprimer</button>
                      <button onClick={() => setConfirmDeleteLot(null)} style={{ fontSize: 11, color: TX2, background: SB, border: `1px solid ${SBB}`, borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontFamily: "inherit" }}>{t("cancel")}</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDeleteLot(lot.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0 }}>
                      <Ico name="trash" size={14} color={TX3} />
                    </button>
                  )}
                </div>

                {/* Progress slider */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ fontSize: 11, color: TX3 }}>Avancement</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: lot.progress >= 100 ? GR : TX }}>{lot.progress || 0}%</span>
                  </div>
                  <div style={{ position: "relative", height: 8, background: SB2, borderRadius: 4 }}>
                    <div style={{ height: "100%", width: `${lot.progress || 0}%`, background: lot.progress >= 100 ? GR : (calcLotStatus(lot).id === "delayed" ? RD : lc.value), borderRadius: 4, transition: "width 0.2s" }} />
                    <input
                      type="range" min={0} max={100} value={lot.progress || 0}
                      onChange={(e) => setProgress(lot.id, Number(e.target.value))}
                      style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%", margin: 0 }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit modal */}
      <Modal open={!!modal} onClose={() => { setModal(null); setEditLot(EMPTY_LOT); setEditingId(null); }} title={modal === "add" ? t("planning.newLot") : t("planning.editLot")}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: TX2, marginBottom: 4 }}>{t("planning.lotName")} *</div>
          <input value={editLot.name} onChange={(e) => setEditLot((p) => ({ ...p, name: e.target.value }))} placeholder={t("planning.lotPlaceholder")} style={{ width: "100%", padding: "9px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: SB, color: TX, boxSizing: "border-box" }} autoFocus />
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: TX2, marginBottom: 4 }}>Responsable / Entreprise</div>
          <input value={editLot.contractor} onChange={(e) => setEditLot((p) => ({ ...p, contractor: e.target.value }))} placeholder="ex. Entreprise Dupont" style={{ width: "100%", padding: "9px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: SB, color: TX, boxSizing: "border-box" }} />
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: TX2, marginBottom: 4 }}>{t("planning.start")}</div>
            <input type="date" value={editLot.startDate} onChange={(e) => setEditLot((p) => ({ ...p, startDate: e.target.value }))} style={{ width: "100%", padding: "9px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: SB, color: TX, boxSizing: "border-box" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: TX2, marginBottom: 4 }}>{t("planning.end")}</div>
            <input type="date" value={editLot.endDate} onChange={(e) => setEditLot((p) => ({ ...p, endDate: e.target.value }))} style={{ width: "100%", padding: "9px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: SB, color: TX, boxSizing: "border-box" }} />
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: TX2, marginBottom: 6 }}>{t("planning.progressPct")} — {editLot.progress}%</div>
          <input type="range" min={0} max={100} value={editLot.progress} onChange={(e) => setEditLot((p) => ({ ...p, progress: Number(e.target.value) }))} style={{ width: "100%", accentColor: AC }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: TX2, marginBottom: 6 }}>Couleur</div>
          <div style={{ display: "flex", gap: 8 }}>
            {LOT_COLORS.map((c) => (
              <button key={c.id} onClick={() => setEditLot((p) => ({ ...p, color: c.id }))} style={{ width: 26, height: 26, borderRadius: "50%", background: c.value, border: editLot.color === c.id ? `3px solid ${TX}` : `3px solid transparent`, cursor: "pointer", outline: "none" }} />
            ))}
          </div>
        </div>
        <button onClick={saveLot} disabled={!editLot.name.trim()} style={{ width: "100%", padding: 14, border: "none", borderRadius: 10, background: editLot.name.trim() ? AC : DIS, color: editLot.name.trim() ? "#fff" : DIST, fontSize: 15, fontWeight: 600, cursor: editLot.name.trim() ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
          {modal === "add" ? t("planning.addLotBtn") : t("save")}
        </button>
      </Modal>
    </div>
  );
}

function PDFPreview({ form }) {
  const color = form.pdfColor || "#D97B0D";
  const ff = form.pdfFont === "times" ? "Georgia,'Times New Roman',serif" : "system-ui,-apple-system,sans-serif";
  return (
    <div style={{ border: `1px solid ${SBB}`, borderRadius: 10, overflow: "hidden", background: WH, userSelect: "none" }}>
      {/* Barre couleur */}
      <div style={{ height: 7, background: color }} />
      {/* En-tête */}
      <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", fontFamily: ff }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: TX, fontFamily: ff }}>{form.structure || "Votre bureau d'architecture"}</div>
          <div style={{ fontSize: 10, color: TX3, marginTop: 2, fontFamily: ff }}>
            {[form.phone, form.email].filter(Boolean).join("   ") || "contact@votre-bureau.be"}
          </div>
        </div>
        {form.picture
          ? <img src={form.picture} alt="" style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover" }} />
          : <div style={{ width: 30, height: 30, borderRadius: "50%", background: SB, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: TX3 }}>Logo</div>
        }
      </div>
      <div style={{ height: 1, background: SBB, margin: "0 16px" }} />
      {/* Titre PV */}
      <div style={{ padding: "10px 16px 8px", fontFamily: ff }}>
        <div style={{ fontSize: 17, fontWeight: 700, color, marginBottom: 3, fontFamily: ff }}>PROCÈS-VERBAL N°29</div>
        <div style={{ fontSize: 10, color: TX2, fontFamily: ff }}>Réunion de chantier du 05/04/2026</div>
      </div>
      {/* Bloc projet */}
      <div style={{ margin: "0 16px 12px", background: SB, borderRadius: 6, padding: "8px 10px", display: "flex", gap: 14, fontFamily: ff }}>
        {[["CHANTIER","Votre projet"],["MAÎTRE D'OUVRAGE","Client MO"],["ENTREPRISE","Entreprise"]].map(([k,v]) => (
          <div key={k} style={{ flex: 1 }}>
            <div style={{ fontSize: 7, fontWeight: 600, color: TX3, marginBottom: 2 }}>{k}</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: TX, fontFamily: ff }}>{v}</div>
          </div>
        ))}
      </div>
      {/* Section contenu */}
      <div style={{ margin: "0 16px 8px" }}>
        <div style={{ padding: "4px 6px 4px 8px", background: SB, borderLeft: `2.5px solid ${color}`, marginBottom: 5 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: TX, fontFamily: ff }}>01. Situation du chantier</span>
        </div>
        <div style={{ fontSize: 9, color: TX, paddingLeft: 8, fontFamily: ff }}>• Les travaux avancent conformément au planning.</div>
        <div style={{ fontSize: 9, color: RD, paddingLeft: 8, marginTop: 3, fontWeight: 600, fontFamily: ff }}>! Resserrages coupe-feu toujours en attente.</div>
      </div>
      {/* Pied de page */}
      <div style={{ borderTop: `1px solid ${SBB}`, padding: "6px 16px", display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 8, color: TX3, fontFamily: ff }}>{form.structure || "Votre bureau"}</span>
        <span style={{ fontSize: 8, color: TX3, fontFamily: ff }}>Page 1 / 2</span>
      </div>
    </div>
  );
}

function ProfileView({ profile, onSave }) {
  const [form, setForm] = useState({ ...profile });
  const fileRef = useRef();
  const t = useT();

  const initials = form.name.trim().split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";

  const handlePicture = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setForm((p) => ({ ...p, picture: ev.target.result }));
    reader.readAsDataURL(file);
  };

  const removePicture = () => setForm((p) => ({ ...p, picture: null }));

  const set = (key) => (v) => setForm((p) => ({ ...p, [key]: v }));

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 0" }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: TX, marginBottom: 4 }}>{t("profile.title")}</div>
        <div style={{ fontSize: 13, color: TX3 }}>{t("profile.subtitle")}</div>
      </div>

      {/* Avatar */}
      <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 28, padding: 20, background: WH, border: `1px solid ${SBB}`, borderRadius: 14 }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          {form.picture ? (
            <img src={form.picture} alt="profil" style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", border: `2px solid ${SBB}` }} />
          ) : (
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: ACL, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: AC, border: `2px solid ${ACL2}` }}>{initials}</div>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: TX, marginBottom: 2 }}>{form.name || t("profile.yourName")}</div>
          <div style={{ fontSize: 12, color: TX3, marginBottom: 10 }}>{form.structure || t("profile.yourStructure")}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => fileRef.current.click()} style={{ padding: "6px 14px", border: `1px solid ${SBB}`, borderRadius: 6, background: WH, cursor: "pointer", fontSize: 12, fontWeight: 500, color: TX2, fontFamily: "inherit" }}>
              {form.picture ? t("profile.changePhoto") : t("profile.addPhoto")}
            </button>
            {form.picture && (
              <button onClick={removePicture} style={{ padding: "6px 14px", border: `1px solid ${SBB}`, borderRadius: 6, background: WH, cursor: "pointer", fontSize: 12, color: RD, fontFamily: "inherit" }}>{t("profile.removePhoto")}</button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePicture} />
        </div>
      </div>

      {/* Form — Informations */}
      <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 14, padding: "20px 20px 8px", marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 14 }}>{t("profile.personalInfo")}</div>
        <Field label={t("profile.fullName")} value={form.name} onChange={set("name")} placeholder="ex: Gaëlle CNOP" />
        <div style={{ display: "flex", gap: 10 }}>
          <Field half label={t("profile.structureName")} value={form.structure} onChange={set("structure")} placeholder="ex: DEWIL architecten" />
          <Field half label={t("profile.structureType")} value={form.structureType} onChange={set("structureType")} select options={STRUCTURE_TYPES} />
        </div>
        <Field label={t("profile.address")} value={form.address} onChange={set("address")} placeholder="ex: Rue de la Loi 12, 1000 Bruxelles" />
        <div style={{ display: "flex", gap: 10 }}>
          <Field half label={t("profile.phone")} value={form.phone} onChange={set("phone")} placeholder="ex: 0474 50 85 80" type="tel" />
          <Field half label={t("profile.email")} value={form.email} onChange={set("email")} placeholder="ex: contact@cabinet.be" type="email" />
        </div>
      </div>

      {/* Langue */}
      <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 14, padding: "20px 20px 16px", marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 14 }}>Langue / Language</div>
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { id: "fr", label: "Français", flag: "🇫🇷" },
            { id: "en", label: "English", flag: "🇬🇧" },
          ].map(l => (
            <button key={l.id} onClick={() => set("lang")(l.id)}
              style={{ flex: 1, padding: "12px 14px", border: `2px solid ${form.lang === l.id ? TX : SBB}`, borderRadius: 10, background: form.lang === l.id ? TX : WH, cursor: "pointer", textAlign: "left", fontFamily: "inherit", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 22 }}>{l.flag}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: form.lang === l.id ? WH : TX }}>{l.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Clé API Claude */}
      <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 14, padding: "20px 20px 8px", marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 4 }}>{t("profile.apiTitle")}</div>
        <div style={{ fontSize: 12, color: TX3, marginBottom: 14, lineHeight: 1.5 }}>
          {t("profile.apiDesc")}
        </div>
        <Field label={t("profile.apiKey")} value={form.apiKey || ""} onChange={set("apiKey")} placeholder="sk-..." type="password" />
        {form.apiKey && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, marginTop: -4 }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, background: GR }} />
            <span style={{ fontSize: 11, color: GR }}>{t("profile.apiConfigured")}</span>
          </div>
        )}
      </div>

      {/* Apparence du PV */}
      <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 14, padding: "20px 20px 16px", marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 16 }}>{t("profile.pdfAppearance")}</div>

        {/* Couleur principale */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: TX2, marginBottom: 10 }}>{t("profile.mainColor")}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {COLOR_PRESETS.map((c) => (
              <button
                key={c.value}
                title={c.label}
                onClick={() => set("pdfColor")(c.value)}
                style={{ width: 32, height: 32, borderRadius: 8, background: c.value, border: form.pdfColor === c.value ? `3px solid ${TX}` : "3px solid transparent", cursor: "pointer", padding: 0, transition: "border 0.15s", boxShadow: form.pdfColor === c.value ? "0 0 0 1px #fff inset" : "none" }}
              />
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 4 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: form.pdfColor, border: `2px solid ${SBB}`, overflow: "hidden", flexShrink: 0 }}>
                <input type="color" value={form.pdfColor || "#D97B0D"} onChange={(e) => set("pdfColor")(e.target.value)} style={{ width: 48, height: 48, border: "none", padding: 0, cursor: "pointer", marginTop: -8, marginLeft: -8, opacity: 0, position: "absolute" }} />
                <input type="color" value={form.pdfColor || "#D97B0D"} onChange={(e) => set("pdfColor")(e.target.value)} style={{ width: "100%", height: "100%", border: "none", padding: 0, cursor: "pointer", opacity: 0 }} />
              </div>
              <span style={{ fontSize: 12, color: TX3, fontFamily: "monospace" }}>{(form.pdfColor || "#D97B0D").toUpperCase()}</span>
            </div>
          </div>
        </div>

        {/* Police */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: TX2, marginBottom: 10 }}>{t("profile.font")}</div>
          <div style={{ display: "flex", gap: 8 }}>
            {FONT_OPTIONS.map((f) => (
              <button
                key={f.id}
                onClick={() => set("pdfFont")(f.id)}
                style={{ flex: 1, padding: "10px 12px", border: `2px solid ${form.pdfFont === f.id ? TX : SBB}`, borderRadius: 10, background: form.pdfFont === f.id ? TX : WH, cursor: "pointer", textAlign: "left", fontFamily: "inherit", transition: "all 0.15s" }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, color: form.pdfFont === f.id ? WH : TX, fontFamily: f.id === "times" ? "Georgia,serif" : "inherit", marginBottom: 2 }}>{f.label}</div>
                <div style={{ fontSize: 11, color: form.pdfFont === f.id ? "#ccc" : TX3 }}>{f.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Aperçu */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 10 }}>{t("profile.templatePreview")}</div>
        <PDFPreview form={form} />
      </div>

      <button
        onClick={() => onSave(form)}
        disabled={!form.name.trim() || !form.structure.trim()}
        style={{ width: "100%", marginTop: 4, padding: 14, border: "none", borderRadius: 10, background: form.name.trim() && form.structure.trim() ? AC : DIS, color: form.name.trim() && form.structure.trim() ? "#fff" : DIST, fontSize: 15, fontWeight: 600, cursor: form.name.trim() && form.structure.trim() ? "pointer" : "not-allowed", fontFamily: "inherit", transition: "all 0.2s" }}
      >
        {t("profile.saveSettings")}
      </button>
    </div>
  );
}

function ChecklistsView({ project, setProjects, onBack }) {
  const [activeClId, setActiveClId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTemplate, setNewTemplate] = useState("visit");
  const [newItemText, setNewItemText] = useState("");
  const newItemRef = useRef(null);
  const t = useT();

  const checklists = project.checklists || [];
  const activeCl = checklists.find((c) => c.id === activeClId) || null;

  const saveChecklists = (updated) =>
    setProjects((prev) => prev.map((p) => p.id === project.id ? { ...p, checklists: updated } : p));

  const createChecklist = () => {
    const tpl = CHECKLIST_TEMPLATES.find((t) => t.id === newTemplate);
    const items = (tpl?.items || []).map((item, i) => ({ id: Date.now() + i, text: item.text, section: item.section || "", checked: false }));
    const cl = { id: Date.now(), name: newName.trim() || tpl?.label || "Checklist", createdAt: new Date().toLocaleDateString("fr-BE"), visitDate: "", items };
    const updated = [...checklists, cl];
    saveChecklists(updated);
    setCreating(false);
    setNewName("");
    setActiveClId(cl.id);
  };

  const toggleItem = (clId, itemId) => {
    saveChecklists(checklists.map((c) => c.id !== clId ? c : {
      ...c, items: c.items.map((it) => it.id === itemId ? { ...it, checked: !it.checked } : it),
    }));
  };

  const addItem = (clId) => {
    const text = newItemText.trim();
    if (!text) return;
    saveChecklists(checklists.map((c) => c.id !== clId ? c : {
      ...c, items: [...c.items, { id: Date.now(), text, section: "", checked: false }],
    }));
    setNewItemText("");
    setTimeout(() => newItemRef.current?.focus(), 50);
  };

  const removeItem = (clId, itemId) => {
    saveChecklists(checklists.map((c) => c.id !== clId ? c : {
      ...c, items: c.items.filter((it) => it.id !== itemId),
    }));
  };

  const deleteChecklist = (clId) => {
    saveChecklists(checklists.filter((c) => c.id !== clId));
    if (activeClId === clId) setActiveClId(null);
  };

  const totalChecked = (cl) => cl.items.filter((it) => it.checked).length;
  const tplInfo = (id) => CHECKLIST_TEMPLATES.find((t) => t.id === id) || CHECKLIST_TEMPLATES[0];

  // Group items by section
  const groupedItems = (items) => {
    const sections = [];
    const seen = {};
    items.forEach((it) => {
      const sec = it.section || "";
      if (!seen[sec]) { seen[sec] = true; sections.push(sec); }
    });
    return sections.map((sec) => ({ section: sec, items: items.filter((it) => (it.section || "") === sec) }));
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: "8px", minWidth: 40, minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 }}><Ico name="back" color={TX2} /></button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: TX }}>{t("checklists.title")}</div>
          <div style={{ fontSize: 12, color: TX3 }}>{project.name} · {checklists.length} liste{checklists.length !== 1 ? "s" : ""}</div>
        </div>
        {!creating && (
          <button onClick={() => { setCreating(true); setNewName(""); setNewTemplate("visit"); }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: AC, color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
            <Ico name="plus" size={14} color="#fff" />{t("checklists.new")}
          </button>
        )}
      </div>

      {/* Formulaire de création */}
      {creating && (
        <div style={{ background: WH, border: `1px solid ${ACL2}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: TX, marginBottom: 14 }}>{t("checklists.newChecklist")}</div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: TX2, marginBottom: 8 }}>{t("checklists.template")}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {CHECKLIST_TEMPLATES.map((tpl) => (
                <button key={tpl.id} onClick={() => setNewTemplate(tpl.id)} style={{ padding: "7px 14px", border: `2px solid ${newTemplate === tpl.id ? tpl.color : SBB}`, borderRadius: 20, background: newTemplate === tpl.id ? tpl.bg : WH, color: newTemplate === tpl.id ? tpl.color : TX2, fontWeight: newTemplate === tpl.id ? 600 : 400, fontSize: 12, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
                  {tpl.label}
                  {tpl.items.length > 0 && <span style={{ opacity: 0.6, marginLeft: 4 }}>({tpl.items.length})</span>}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: TX2, marginBottom: 6 }}>{t("checklists.nameOpt")}</div>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={tplInfo(newTemplate).label}
              onKeyDown={(e) => e.key === "Enter" && createChecklist()}
              style={{ width: "100%", padding: "9px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: SB, color: TX, boxSizing: "border-box" }}
            />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={createChecklist} style={{ flex: 1, padding: 12, border: "none", borderRadius: 8, background: AC, color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>{t("create")}</button>
            <button onClick={() => setCreating(false)} style={{ padding: "12px 16px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, color: TX2, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>{t("cancel")}</button>
          </div>
        </div>
      )}

      {/* Liste des checklists */}
      {checklists.length === 0 && !creating && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "50px 20px", border: `2px dashed ${SBB}`, borderRadius: 12, background: WH, textAlign: "center" }}>
          <Ico name="listcheck" size={38} color={TX3} />
          <div style={{ fontSize: 14, fontWeight: 600, color: TX, marginTop: 14, marginBottom: 6 }}>{t("checklists.noChecklists")}</div>
          <div style={{ fontSize: 13, color: TX3 }}>{t("checklists.noChecklistsDesc")}</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {checklists.map((cl) => {
          const checked = totalChecked(cl);
          const total = cl.items.length;
          const pct = total > 0 ? Math.round((checked / total) * 100) : 0;
          const isOpen = activeClId === cl.id;
          const groups = groupedItems(cl.items);

          return (
            <div key={cl.id} style={{ background: WH, border: `1px solid ${isOpen ? ACL2 : SBB}`, borderRadius: 12, overflow: "hidden", transition: "border-color 0.15s" }}>
              {/* En-tête checklist */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: "pointer" }} onClick={() => setActiveClId(isOpen ? null : cl.id)}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: pct === 100 ? "#EAF3DE" : SB, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Ico name={pct === 100 ? "check" : "listcheck"} size={16} color={pct === 100 ? GR : TX3} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: TX }}>{cl.name}</div>
                  <div style={{ fontSize: 11, color: TX3, marginTop: 2 }}>
                    {checked}/{total} point{total !== 1 ? "s" : ""} · {cl.createdAt}
                    {pct === 100 && <span style={{ marginLeft: 8, color: GR, fontWeight: 600 }}>{t("checklists.completed")}</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                    <span style={{ fontSize: 11, color: TX3 }}>{t("checklists.visitDate")}</span>
                    <input
                      type="date"
                      value={cl.visitDate || ""}
                      onChange={(e) => saveChecklists(checklists.map(c => c.id !== cl.id ? c : { ...c, visitDate: e.target.value }))}
                      onClick={(e) => e.stopPropagation()}
                      style={{ fontSize: 11, border: `1px solid ${SBB}`, borderRadius: 6, padding: "2px 6px", background: SB, color: TX, fontFamily: "inherit" }}
                    />
                  </div>
                  {total > 0 && (
                    <div style={{ marginTop: 5, width: "100%", height: 4, borderRadius: 4, background: SB2, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", borderRadius: 4, background: pct === 100 ? GR : AC, transition: "width 0.3s" }} />
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {total > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: pct === 100 ? GR : AC, minWidth: 36, textAlign: "right" }}>{pct}%</span>}
                  <button onClick={(e) => { e.stopPropagation(); const copy = { ...cl, id: Date.now(), name: cl.name + " (copie)", createdAt: new Date().toLocaleDateString("fr-BE"), items: cl.items.map(it => ({ ...it, id: Date.now() + Math.random(), checked: false })) }; saveChecklists([...checklists, copy]); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 6 }} title={t("checklists.duplicateEmpty")}>
                    <Ico name="dup" size={14} color={TX3} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); deleteChecklist(cl.id); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 6 }}>
                    <Ico name="trash" size={14} color={TX3} />
                  </button>
                  <Ico name={isOpen ? "x" : "back"} size={14} color={TX3} />
                </div>
              </div>

              {/* Détail items */}
              {isOpen && (
                <div style={{ borderTop: `1px solid ${SBB}`, padding: "12px 16px 16px" }}>
                  {cl.items.length === 0 && (
                    <div style={{ fontSize: 13, color: TX3, fontStyle: "italic", marginBottom: 12 }}>Aucun point — ajoutez-en ci-dessous.</div>
                  )}

                  {groups.map(({ section, items }) => (
                    <div key={section} style={{ marginBottom: 8 }}>
                      {section && (
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 6, marginTop: 4 }}>{section}</div>
                      )}
                      {items.map((it) => (
                        <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: `1px solid ${SB}` }}>
                          <button
                            onClick={() => toggleItem(cl.id, it.id)}
                            style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${it.checked ? GR : SBB}`, background: it.checked ? GR : WH, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0, transition: "all 0.15s" }}
                          >
                            {it.checked && <Ico name="check" size={12} color="#fff" />}
                          </button>
                          <span style={{ flex: 1, fontSize: 13, color: it.checked ? TX3 : TX, textDecoration: it.checked ? "line-through" : "none", lineHeight: 1.4, transition: "all 0.15s" }}>{it.text}</span>
                          <button onClick={() => removeItem(cl.id, it.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, opacity: 0.4, flexShrink: 0 }}>
                            <Ico name="x" size={12} color={TX3} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ))}

                  {/* Ajouter un point */}
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <input
                      ref={newItemRef}
                      value={newItemText}
                      onChange={(e) => setNewItemText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addItem(cl.id)}
                      placeholder={t("checklists.addPlaceholder")}
                      style={{ flex: 1, padding: "8px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: SB, color: TX, outline: "none" }}
                    />
                    <button onClick={() => addItem(cl.id)} disabled={!newItemText.trim()} style={{ padding: "8px 14px", border: "none", borderRadius: 8, background: newItemText.trim() ? AC : DIS, color: newItemText.trim() ? "#fff" : DIST, fontWeight: 600, fontSize: 13, cursor: newItemText.trim() ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
                      {t("add")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SearchModal({ projects, onClose, onOpen }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50); }, []);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const results = q.length < 2 ? [] : projects.flatMap((proj) =>
    (proj.pvHistory || []).flatMap((pv) => {
      const content = pv.content || "";
      const idx = content.toLowerCase().indexOf(q);
      if (idx === -1) return [];
      const start = Math.max(0, idx - 60);
      const end   = Math.min(content.length, idx + 70);
      let snippet = content.slice(start, end).replace(/\n/g, " ").trim();
      if (start > 0) snippet = "…" + snippet;
      if (end < content.length) snippet += "…";
      return [{ proj, pv, snippet }];
    })
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 300, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "56px 16px 16px" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: WH, borderRadius: 14, width: "100%", maxWidth: 600, maxHeight: "75vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        {/* Barre de recherche */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 16px", borderBottom: `1px solid ${SBB}` }}>
          <Ico name="search" size={18} color={TX3} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher dans les PV…"
            style={{ flex: 1, border: "none", outline: "none", fontSize: 15, color: TX, background: "transparent", fontFamily: "inherit" }}
          />
          {query && (
            <button onClick={() => setQuery("")} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
              <Ico name="x" size={16} color={TX3} />
            </button>
          )}
          <button onClick={onClose} style={{ background: "none", border: `1px solid ${SBB}`, borderRadius: 4, cursor: "pointer", padding: "2px 7px", fontSize: 12, color: TX3, fontFamily: "inherit" }}>Échap</button>
        </div>

        {/* Résultats */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {q.length < 2 ? (
            <div style={{ padding: "40px 20px", textAlign: "center", color: TX3, fontSize: 13 }}>Tapez au moins 2 caractères pour rechercher dans les PV</div>
          ) : results.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center" }}>
              <Ico name="search" size={32} color={TX3} />
              <div style={{ fontSize: 14, color: TX2, marginTop: 12 }}>Aucun résultat pour « {query} »</div>
            </div>
          ) : (
            results.map((r, i) => (
              <button
                key={i}
                onClick={() => { onOpen(r.proj.id, r.pv); onClose(); }}
                style={{ width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: `1px solid ${SBB}`, cursor: "pointer", padding: "12px 16px", fontFamily: "inherit" }}
                onMouseEnter={(e) => e.currentTarget.style.background = SB}
                onMouseLeave={(e) => e.currentTarget.style.background = "none"}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: AC }}>PV n°{r.pv.number}</span>
                  <span style={{ fontSize: 11, color: TX3 }}>{r.pv.date}</span>
                  <span style={{ fontSize: 11, color: TX3, marginLeft: "auto", whiteSpace: "nowrap" }}>{r.proj.name}</span>
                </div>
                <div style={{ fontSize: 12, color: TX2, lineHeight: 1.55 }}>{r.snippet}</div>
              </button>
            ))
          )}
        </div>

        {results.length > 0 && (
          <div style={{ padding: "8px 16px", borderTop: `1px solid ${SBB}`, fontSize: 11, color: TX3 }}>
            {results.length} résultat{results.length > 1 ? "s" : ""} trouvé{results.length > 1 ? "s" : ""}
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [projects, setProjects] = useState(INIT_PROJECTS);
  const [activeId, setActiveId] = useState(1);
  const [dbLoaded, setDbLoaded] = useState(false);
  const [view, setView] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [modal, setModal] = useState(null);
  const [modalData, setModalData] = useState(null);
  const [newP, setNewP] = useState({ name: "", client: "", contractor: "", address: "", desc: "", startDate: "", recurrence: "none", statusId: "sketch" });
  const [editInfo, setEditInfo] = useState({});
  const [editParts, setEditParts] = useState([]);
  const [profile, setProfile] = useState(INIT_PROFILE);
  const [profileSaved, setProfileSaved] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showReconnected, setShowReconnected] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [storageWarning, setStorageWarning] = useState(false);
  const [pvRecipients, setPvRecipients] = useState([]); // [] = tous
  const [pvTitle, setPvTitle] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [importPV, setImportPV] = useState({ number: "", date: "", author: "", pdfDataUrl: null, fileName: "" });
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };
  const importPVRef = useRef(null);
  const t = useT();

  // Load data from Supabase on mount
  useEffect(() => {
    (async () => {
      const [cloudData, cloudProfile] = await Promise.all([dbLoadProjects(), dbLoadProfile()]);
      if (cloudData) {
        if (cloudData.projects && cloudData.projects.length > 0) setProjects(cloudData.projects);
        if (cloudData.activeId) setActiveId(cloudData.activeId);
      }
      if (cloudProfile) setProfile(cloudProfile);
      setDbLoaded(true);
    })();
  }, []);

  // Save projects to Supabase (debounced) + localStorage fallback
  useEffect(() => {
    if (!dbLoaded) return;
    try { localStorage.setItem("archipilot_projects", JSON.stringify(projects)); } catch { setStorageWarning(true); }
    dbSaveProjects(projects, activeId);
  }, [projects, dbLoaded]);

  // Save activeId
  useEffect(() => {
    if (!dbLoaded) return;
    try { localStorage.setItem("archipilot_activeId", String(activeId)); } catch {}
    dbSaveProjects(projects, activeId);
  }, [activeId, dbLoaded]);

  // Détection online/offline
  useEffect(() => {
    const goOnline = () => { setIsOnline(true); setShowReconnected(true); setTimeout(() => setShowReconnected(false), 3000); };
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); };
  }, []);

  // Prompt d'installation PWA
  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // Escape key closes modals
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") { setModal(null); setShowSearch(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") setInstallPrompt(null);
  };

  const saveProfile = (data) => {
    setProfile(data);
    try { localStorage.setItem("archipilot_profile", JSON.stringify(data)); } catch {}
    dbSaveProfile(data);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2000);
  };

  const project = projects.find((p) => p.id === activeId);
  const updateProject = (id, u) => setProjects((prev) => prev.map((p) => p.id === id ? { ...p, ...u } : p));
  const canCreate = newP.name.trim() && newP.client.trim() && newP.contractor.trim() && newP.address.trim() && newP.startDate.trim();

  const createProject = () => {
    const id = Math.max(...projects.map((p) => p.id), 0) + 1;
    setProjects((prev) => [...prev, { id, ...newP, progress: 0, bureau: profile.structure, endDate: "", nextMeeting: "", archived: false, participants: [{ role: "Architecte", name: profile.name, email: profile.email, phone: profile.phone }], posts: [{ id: "01", label: "Situation du chantier", notes: "" }, { id: "02", label: "Généralités", notes: "" }, { id: "03", label: "Planning", notes: "" }], pvHistory: [], actions: [], planImage: null, planMarkers: [], planStrokes: [], documents: [], lots: [], checklists: [] }]);
    setActiveId(id); setView("overview"); setModal(null);
    setNewP({ name: "", client: "", contractor: "", address: "", desc: "", startDate: "", recurrence: "none", statusId: "sketch" });
  };

  const duplicateProject = () => {
    const id = Math.max(...projects.map((p) => p.id), 0) + 1;
    setProjects((prev) => [...prev, { ...project, id, name: project.name + " (copie)", pvHistory: [], actions: [], posts: project.posts.map((po) => ({ ...po, notes: "", photos: [] })), archived: false, planImage: null, planMarkers: [], planStrokes: [], documents: [], lots: [], checklists: [] }]);
    setActiveId(id);
    showToast("Projet dupliqué avec succès");
  };

  const VIEW_LABELS = { overview: "", notes: t("view.notes"), result: t("view.result"), plan: t("view.plan"), docs: t("view.docs"), planning: t("view.planning"), checklists: t("view.checklists"), profile: t("view.profile") };

  return (
    <LangContext.Provider value={profile.lang || "fr"}>
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", display: "flex", minHeight: "100vh", background: BG }}>
      <style>{`
        @keyframes sp { to { transform: rotate(360deg) } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes modalIn { from { opacity: 0; transform: scale(0.97) } to { opacity: 1; transform: scale(1) } }
        @keyframes ring { 0% { box-shadow: 0 0 0 0 rgba(196,57,42,0.45) } 70% { box-shadow: 0 0 0 18px rgba(196,57,42,0) } 100% { box-shadow: 0 0 0 0 rgba(196,57,42,0) } }
        *:focus-visible { outline: 2px solid #D97B0D; outline-offset: 2px }
        *:focus:not(:focus-visible) { outline: none }
        input::placeholder, textarea::placeholder { color: #767672 }
        * { scrollbar-width: thin; scrollbar-color: #E2E1DD transparent }
        button { transition: filter 0.15s, transform 0.1s; }
        button:not([disabled]):hover { filter: brightness(0.92); }
        button:not([disabled]):active { transform: scale(0.97); }
        a[href]:hover { opacity: 0.85; }
      `}</style>
      <Sidebar projects={projects} activeId={activeId} onSelect={(id) => { setActiveId(id); setView("overview"); }} open={sidebarOpen} onClose={() => setSidebarOpen(false)} profile={profile} onNewProject={() => setModal("new")} onProfile={() => { setView("profile"); setSidebarOpen(false); }} installable={!!installPrompt} onInstall={handleInstall} />

      <div style={{ marginLeft: sidebarOpen ? 264 : 0, flex: 1, transition: "margin-left 0.25s", minWidth: 0 }}>
        <div style={{ padding: "10px 20px", background: WH, borderBottom: `1px solid ${SBB}`, display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 50 }}>
          {/* Gauche — hamburger + contexte projet */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "0 0 auto", minWidth: 0 }}>
            <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background: "none", border: "none", cursor: "pointer", padding: 8, minWidth: 40, minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 }}>
              <Ico name={sidebarOpen ? "x" : "menu"} color={TX2} />
            </button>
            <div style={{ minWidth: 0 }}>
              {view === "profile" ? (
                <div style={{ fontSize: 15, fontWeight: 600, color: TX }}>Mon profil</div>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }}>{project?.name}</span>
                    {project && <StatusBadge statusId={project.statusId} small />}
                  </div>
                  <div style={{ fontSize: 11, color: TX3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 }}>
                    {VIEW_LABELS[view] ? <><span style={{ color: AC, fontWeight: 600 }}>{VIEW_LABELS[view]}</span> · </> : ""}{project?.client}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Centre — barre de recherche pilule */}
          <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
            <button onClick={() => setShowSearch(true)} style={{ display: "flex", alignItems: "center", gap: 8, background: "#F2F2F0", border: "none", borderRadius: 999, padding: "8px 18px", cursor: "text", width: "100%", maxWidth: 400, fontFamily: "inherit" }}>
              <Ico name="search" size={15} color="#A3A39D" />
              <span style={{ fontSize: 13, color: "#A3A39D", fontWeight: 400 }}>Search for anything here...</span>
            </button>
          </div>

          {/* Droite — profil */}
          <button onClick={() => { setView("profile"); setSidebarOpen(false); }} title="Mon profil" style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 6px", borderRadius: 10, display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto" }}>
            {profile.picture ? (
              <img src={profile.picture} alt="profil" style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
            ) : (
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: ACL, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: AC, flexShrink: 0 }}>
                {profile.name.trim().split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?"}
              </div>
            )}
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 120 }}>{profile.name}</div>
              <div style={{ fontSize: 9, color: TX3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 120 }}>{profile.structure}</div>
            </div>
          </button>
        </div>
        <div style={{ padding: 20, maxWidth: 920, margin: "0 auto" }}>
          {view === "profile" && (
            <div>
              <button onClick={() => setView("overview")} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 13, color: TX3, padding: "8px 0 16px", fontFamily: "inherit", minHeight: 40 }}>
                <Ico name="back" size={16} color={TX3} />Retour
              </button>
              {profileSaved && <div style={{ padding: "10px 16px", background: "#EAF3DE", borderRadius: 8, color: GR, fontSize: 13, marginBottom: 16, fontWeight: 500 }}>Profil enregistré !</div>}
              <ProfileView profile={profile} onSave={saveProfile} />
            </div>
          )}
          {view !== "profile" && project && view === "overview" && <Overview project={project} setProjects={setProjects} onStartNotes={() => setView("notes")} onEditInfo={() => { setEditInfo({ name: project.name, client: project.client, contractor: project.contractor, address: project.address, statusId: project.statusId, startDate: project.startDate, endDate: project.endDate, progress: project.progress, nextMeeting: project.nextMeeting, recurrence: project.recurrence || "none" }); setModal("info"); }} onEditParticipants={() => { setEditParts(project.participants.map((p) => ({ ...p }))); setModal("parts"); }} onViewPV={(pv) => { setModalData(pv); setModal("viewpv"); }} onViewPlan={() => setView("plan")} onViewDocs={() => setView("docs")} onViewPlanning={() => setView("planning")} onArchive={() => updateProject(activeId, { archived: !project.archived })} onDuplicate={duplicateProject} onImportPV={() => { setImportPV({ number: String((project.pvHistory.length || 0) + 1), date: new Date().toLocaleDateString("fr-BE"), author: profile.name, pdfDataUrl: null, fileName: "" }); setModal("importpv"); }} onViewChecklists={() => setView("checklists")} />}
          {view !== "profile" && project && view === "notes" && <NoteEditor project={project} setProjects={setProjects} onBack={() => setView("overview")} onGenerate={(recipients, title) => { setPvRecipients(recipients || []); setPvTitle(title || ""); setView("result"); }} />}
          {view !== "profile" && project && view === "result" && <ResultView project={project} setProjects={setProjects} onBack={() => setView("notes")} onBackHome={() => setView("overview")} profile={profile} pvRecipients={pvRecipients} pvTitle={pvTitle} />}
          {view !== "profile" && project && view === "plan" && <PlanViewer project={project} setProjects={setProjects} onBack={() => setView("overview")} />}
          {view !== "profile" && project && view === "docs" && <DocumentsView project={project} setProjects={setProjects} onBack={() => setView("overview")} />}
          {view !== "profile" && project && view === "planning" && <PlanningView project={project} setProjects={setProjects} onBack={() => setView("overview")} />}
          {view !== "profile" && project && view === "checklists" && <ChecklistsView project={project} setProjects={setProjects} onBack={() => setView("overview")} />}
        </div>
      </div>

      <Modal open={modal === "new"} onClose={() => setModal(null)} title="Nouveau projet">
        <Field label="Nom du projet *" value={newP.name} onChange={(v) => setNewP((p) => ({ ...p, name: v }))} placeholder="ex: Rénovation Maison Dupont" />
        <div style={{ display: "flex", gap: 10 }}>
          <Field half label="Maître d'ouvrage *" value={newP.client} onChange={(v) => setNewP((p) => ({ ...p, client: v }))} placeholder="ex: M. Dupont" />
          <Field half label="Entreprise *" value={newP.contractor} onChange={(v) => setNewP((p) => ({ ...p, contractor: v }))} placeholder="ex: BESIX" />
        </div>
        <Field label="Adresse *" value={newP.address} onChange={(v) => setNewP((p) => ({ ...p, address: v }))} placeholder="ex: Ixelles, Bruxelles" />
        <div style={{ display: "flex", gap: 10 }}>
          <Field half label="Date de début *" value={newP.startDate} onChange={(v) => setNewP((p) => ({ ...p, startDate: v }))} placeholder="ex: 01/04/2026" />
          <Field half label="Récurrence" value={newP.recurrence} onChange={(v) => setNewP((p) => ({ ...p, recurrence: v }))} select options={RECURRENCES} />
        </div>
        <Field label="Phase du projet" value={newP.statusId} onChange={(v) => setNewP((p) => ({ ...p, statusId: v }))} select options={STATUSES} />
        <Field label="Description (optionnel)" value={newP.desc} onChange={(v) => setNewP((p) => ({ ...p, desc: v }))} placeholder="Rénovation complète..." area />
        <button onClick={createProject} disabled={!canCreate} style={{ width: "100%", padding: 14, border: "none", borderRadius: 10, background: canCreate ? AC : DIS, color: canCreate ? "#fff" : DIST, fontSize: 15, fontWeight: 600, cursor: canCreate ? "pointer" : "not-allowed", fontFamily: "inherit", marginTop: 4, transition: "all 0.2s" }}>Créer le projet</button>
      </Modal>

      <Modal open={modal === "info"} onClose={() => setModal(null)} title="Modifier les informations">
        <Field label="Nom du projet *" value={editInfo.name || ""} onChange={(v) => setEditInfo((p) => ({ ...p, name: v }))} placeholder="ex: Rénovation Maison Dupont" />
        <div style={{ display: "flex", gap: 10 }}>
          <Field half label="Maître d'ouvrage" value={editInfo.client || ""} onChange={(v) => setEditInfo((p) => ({ ...p, client: v }))} />
          <Field half label="Entreprise" value={editInfo.contractor || ""} onChange={(v) => setEditInfo((p) => ({ ...p, contractor: v }))} />
        </div>
        <Field label="Adresse" value={editInfo.address || ""} onChange={(v) => setEditInfo((p) => ({ ...p, address: v }))} />
        <div style={{ display: "flex", gap: 10 }}>
          <Field half label="Phase" value={editInfo.statusId || "sketch"} onChange={(v) => setEditInfo((p) => ({ ...p, statusId: v }))} select options={STATUSES} />
          <Field half label="Avancement (%)" value={editInfo.progress || ""} onChange={(v) => setEditInfo((p) => ({ ...p, progress: parseInt(v) || 0 }))} type="number" />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Field half label="Date début" value={editInfo.startDate || ""} onChange={(v) => setEditInfo((p) => ({ ...p, startDate: v }))} />
          <Field half label="Date fin" value={editInfo.endDate || ""} onChange={(v) => setEditInfo((p) => ({ ...p, endDate: v }))} />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Field half label="Prochaine réunion" value={editInfo.nextMeeting || ""} onChange={(v) => setEditInfo((p) => ({ ...p, nextMeeting: v }))} />
          <Field half label="Récurrence" value={editInfo.recurrence || "none"} onChange={(v) => setEditInfo((p) => ({ ...p, recurrence: v }))} select options={RECURRENCES} />
        </div>
        <button onClick={() => { updateProject(activeId, editInfo); setModal(null); }} style={{ width: "100%", padding: 14, border: "none", borderRadius: 10, background: AC, color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginTop: 4 }}>Enregistrer</button>
      </Modal>

      <Modal open={modal === "parts"} onClose={() => setModal(null)} title="Modifier les participants" wide>
        {editParts.map((p, i) => (
          <div key={i} style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input value={p.role} onChange={(e) => { const c = [...editParts]; c[i] = { ...c[i], role: e.target.value }; setEditParts(c); }} placeholder="Rôle" style={{ width: 90, padding: "8px 10px", border: `1px solid ${SBB}`, borderRadius: 6, fontSize: 13, fontFamily: "inherit", background: SB, color: TX }} />
            <input value={p.name} onChange={(e) => { const c = [...editParts]; c[i] = { ...c[i], name: e.target.value }; setEditParts(c); }} placeholder="Nom" style={{ flex: "1 1 120px", padding: "8px 10px", border: `1px solid ${SBB}`, borderRadius: 6, fontSize: 13, fontFamily: "inherit", background: SB, color: TX }} />
            <input value={p.email || ""} onChange={(e) => { const c = [...editParts]; c[i] = { ...c[i], email: e.target.value }; setEditParts(c); }} placeholder="Email" style={{ flex: "1 1 160px", padding: "8px 10px", border: `1px solid ${SBB}`, borderRadius: 6, fontSize: 13, fontFamily: "inherit", background: SB, color: TX }} />
            <input value={p.phone || ""} onChange={(e) => { const c = [...editParts]; c[i] = { ...c[i], phone: e.target.value }; setEditParts(c); }} placeholder="Téléphone" style={{ width: 130, padding: "8px 10px", border: `1px solid ${SBB}`, borderRadius: 6, fontSize: 13, fontFamily: "inherit", background: SB, color: TX }} />
            <button onClick={() => setEditParts((prev) => prev.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
              <Ico name="trash" size={15} color={RD} />
            </button>
          </div>
        ))}
        <button onClick={() => setEditParts((prev) => [...prev, { role: "", name: "", email: "", phone: "" }])} style={{ width: "100%", padding: 10, border: `1px dashed ${SBB}`, borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13, color: TX3, fontFamily: "inherit", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <Ico name="plus" size={14} color={TX3} />Ajouter un participant
        </button>
        <button onClick={() => { updateProject(activeId, { participants: editParts.filter((p) => p.name.trim()) }); setModal(null); }} style={{ width: "100%", padding: 14, border: "none", borderRadius: 10, background: AC, color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Enregistrer</button>
      </Modal>

      {/* Import PV modal */}
      <Modal open={modal === "importpv"} onClose={() => setModal(null)} title="Importer un ancien PV" wide>
        <input ref={importPVRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={(e) => {
          const file = e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => setImportPV((prev) => ({ ...prev, pdfDataUrl: ev.target.result, fileName: file.name }));
          reader.readAsDataURL(file);
          e.target.value = "";
        }} />

        {/* Sélection du fichier */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: TX2, marginBottom: 8 }}>Fichier PDF</div>
          {importPV.pdfDataUrl ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: ACL, border: `1px solid ${ACL2}`, borderRadius: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: REDBG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: `1px solid ${REDBRD}`, gap: 1, flexShrink: 0 }}>
                <span style={{ fontSize: 7, fontWeight: 700, color: RD }}>PDF</span>
                <Ico name="file" size={11} color={RD} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{importPV.fileName}</div>
                <div style={{ fontSize: 11, color: GR, marginTop: 2 }}>Fichier chargé</div>
              </div>
              <button onClick={() => importPVRef.current?.click()} style={{ background: "none", border: `1px solid ${SBB}`, borderRadius: 6, cursor: "pointer", padding: "5px 10px", fontSize: 12, color: TX2, fontFamily: "inherit" }}>Changer</button>
            </div>
          ) : (
            <button onClick={() => importPVRef.current?.click()} style={{ width: "100%", padding: "22px 16px", border: `2px dashed ${SBB}`, borderRadius: 10, background: SB, cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <Ico name="upload" size={28} color={TX3} />
              <span style={{ fontSize: 13, color: TX2, fontWeight: 500 }}>Cliquer pour sélectionner un PDF</span>
              <span style={{ fontSize: 11, color: TX3 }}>Le fichier sera stocké dans le projet</span>
            </button>
          )}
        </div>

        {/* Métadonnées */}
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: TX2, marginBottom: 6 }}>N° de PV</div>
            <input value={importPV.number} onChange={(e) => setImportPV((p) => ({ ...p, number: e.target.value }))} placeholder="ex: 14" style={{ width: "100%", padding: "9px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: SB, color: TX, boxSizing: "border-box" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: TX2, marginBottom: 6 }}>Date</div>
            <input value={importPV.date} onChange={(e) => setImportPV((p) => ({ ...p, date: e.target.value }))} placeholder="ex: 15/03/2026" style={{ width: "100%", padding: "9px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: SB, color: TX, boxSizing: "border-box" }} />
          </div>
        </div>
        <div style={{ marginTop: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: TX2, marginBottom: 6 }}>Auteur</div>
          <input value={importPV.author} onChange={(e) => setImportPV((p) => ({ ...p, author: e.target.value }))} placeholder="ex: Gaëlle CNOP" style={{ width: "100%", padding: "9px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: SB, color: TX, boxSizing: "border-box" }} />
        </div>

        <button
          disabled={!importPV.pdfDataUrl || !importPV.number.trim() || !importPV.date.trim()}
          onClick={() => {
            const num = parseInt(importPV.number) || importPV.number;
            const entry = {
              number: num,
              date: importPV.date.trim(),
              author: importPV.author.trim() || "—",
              postsCount: 0,
              excerpt: `PV importé — ${importPV.fileName}`,
              content: "",
              pdfDataUrl: importPV.pdfDataUrl,
              fileName: importPV.fileName,
              imported: true,
            };
            setProjects((prev) => prev.map((p) => p.id === activeId ? { ...p, pvHistory: [entry, ...p.pvHistory] } : p));
            setModal(null);
          }}
          style={{ width: "100%", padding: 14, border: "none", borderRadius: 10, background: importPV.pdfDataUrl && importPV.number.trim() && importPV.date.trim() ? AC : DIS, color: importPV.pdfDataUrl && importPV.number.trim() && importPV.date.trim() ? "#fff" : DIST, fontSize: 15, fontWeight: 600, cursor: importPV.pdfDataUrl && importPV.number.trim() && importPV.date.trim() ? "pointer" : "not-allowed", fontFamily: "inherit", transition: "all 0.2s" }}
        >
          Importer le PV
        </button>
      </Modal>

      <Modal open={modal === "viewpv"} onClose={() => setModal(null)} title={modalData ? `PV n°${modalData.number} — ${modalData.date}` : ""} wide>
        {modalData && (
          <div>
            <div style={{ display: "flex", gap: 12, marginBottom: 14, fontSize: 12, color: TX3, flexWrap: "wrap", alignItems: "center" }}>
              <span>Rédigé par {modalData.author}</span>
              {!modalData.imported && <span>{modalData.postsCount} postes</span>}
              {modalData.imported && <span style={{ fontSize: 10, fontWeight: 600, color: BL, background: BLB, padding: "2px 8px", borderRadius: 6 }}>PV importé</span>}
            </div>
            {modalData.pdfDataUrl ? (
              <div>
                <iframe src={modalData.pdfDataUrl} title={modalData.fileName || `PV n°${modalData.number}`} style={{ width: "100%", height: "65vh", border: "none", borderRadius: 10, background: SB }} />
                <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                  <a href={modalData.pdfDataUrl} download={modalData.fileName || `PV-${modalData.number}.pdf`} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 18px", background: AC, color: "#fff", borderRadius: 8, fontWeight: 600, fontSize: 13, textDecoration: "none" }}>
                    <Ico name="download" size={14} color="#fff" />Télécharger
                  </a>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ padding: 20, background: SB, borderRadius: 10, fontFamily: "system-ui, -apple-system, sans-serif", fontSize: 13, lineHeight: 1.9, whiteSpace: "pre-wrap", color: TX, maxHeight: "60vh", overflowY: "auto", border: `1px solid ${SBB}` }}>{modalData.content}</div>
                <button onClick={() => { navigator.clipboard.writeText(modalData.content); }} style={{ marginTop: 12, padding: "10px 20px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: TX2, display: "flex", alignItems: "center", gap: 4 }}>
                  <Ico name="copy" size={14} color={TX3} />Copier le contenu
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Bannière offline */}
      {showSearch && (
        <SearchModal
          projects={projects}
          onClose={() => setShowSearch(false)}
          onOpen={(projId, pv) => { setActiveId(projId); setView("overview"); setModalData(pv); setModal("viewpv"); }}
        />
      )}

      {!isOnline && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: TX, color: "#fff", padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 13, zIndex: 999 }}>
          <Ico name="wifioff" size={15} color="#fff" />
          Mode hors-ligne — Vos données sont sauvegardées localement
        </div>
      )}

      {/* Toast reconnexion */}
      {showReconnected && (
        <div style={{ position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)", background: GR, color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 999, display: "flex", alignItems: "center", gap: 6 }}>
          <Ico name="check" size={14} color="#fff" />Reconnecté — Données synchronisées
        </div>
      )}

      {/* Avertissement stockage plein */}
      {storageWarning && (
        <div style={{ position: "fixed", top: 60, right: 16, background: REDBG, border: `1px solid ${REDBRD}`, color: RD, padding: "10px 14px", borderRadius: 10, fontSize: 12, maxWidth: 260, zIndex: 999 }}>
          Espace de stockage limité. Les photos volumineuses peuvent ne pas être conservées hors-ligne.
        </div>
      )}
      {toast && (
        <div style={{ position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)", background: toast.type === "error" ? RD : GR, color: "#fff", padding: "11px 22px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 1001, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 20px rgba(0,0,0,0.18)", pointerEvents: "none", whiteSpace: "nowrap" }}>
          <Ico name={toast.type === "error" ? "alert" : "check"} size={15} color="#fff" />
          {toast.msg}
        </div>
      )}
    </div>
    </LangContext.Provider>
  );
}
