import { RECURRENCES } from "../constants/templates";

export const relativeDate = (dateStr) => {
  if (!dateStr) return "";
  const parts = dateStr.split("/");
  if (parts.length !== 3) return dateStr;
  const d = new Date(parts[2], parts[1] - 1, parts[0]);
  if (isNaN(d)) return dateStr;
  const diff = Math.floor((Date.now() - d) / 86400000);
  if (diff < 0) return `dans ${-diff}j`;
  if (diff === 0) return "aujourd'hui";
  if (diff === 1) return "hier";
  if (diff < 7) return `il y a ${diff}j`;
  if (diff < 30) return `il y a ${Math.floor(diff / 7)} sem.`;
  if (diff < 365) return `il y a ${Math.floor(diff / 30)} mois`;
  return `il y a ${Math.floor(diff / 365)} an${Math.floor(diff / 365) > 1 ? "s" : ""}`;
};

export function parseDateFR(str) {
  if (!str) return null;
  const p = str.split("/");
  if (p.length !== 3) return null;
  return new Date(+p[2], +p[1] - 1, +p[0]);
}

export function formatDateFR(d) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export function calcNextMeeting(lastDate, recurrenceId) {
  const rec = RECURRENCES.find(r => r.id === recurrenceId);
  if (!rec || rec.days === 0 || !lastDate) return null;
  const d = parseDateFR(lastDate);
  if (!d) return null;
  d.setDate(d.getDate() + rec.days);
  return formatDateFR(d);
}

export function daysUntil(dateStr) {
  const d = parseDateFR(dateStr);
  if (!d) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.ceil((d - now) / (1000 * 60 * 60 * 24));
}
