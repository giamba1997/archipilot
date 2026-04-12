import { getStatus } from "../constants/statuses";

export function downloadCSV(filename, headers, rows) {
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [headers.map(escape).join(";"), ...rows.map(r => r.map(escape).join(";"))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function exportProjectsCSV(projects) {
  const headers = ["Projet", "Client", "Entreprise", "Adresse", "Phase", "Avancement %", "PV générés", "Actions ouvertes", "Actions urgentes", "Date début", "Prochaine réunion"];
  const rows = projects.filter(p => !p.archived).map(p => {
    const st = getStatus(p.statusId);
    const open = (p.actions || []).filter(a => a.open).length;
    const urgent = (p.actions || []).filter(a => a.open && a.urgent).length;
    return [p.name, p.client, p.contractor, p.address, st.label, p.progress || 0, p.pvHistory?.length || 0, open, urgent, p.startDate, p.nextMeeting];
  });
  downloadCSV("archipilot-projets.csv", headers, rows);
}

export function exportActionsCSV(projects) {
  const headers = ["Projet", "Action", "Responsable", "Urgent", "Statut", "Depuis"];
  const rows = [];
  projects.forEach(p => {
    (p.actions || []).forEach(a => {
      rows.push([p.name, a.text, a.who, a.urgent ? "Oui" : "Non", a.open ? "Ouverte" : "Fermée", a.since]);
    });
  });
  downloadCSV("archipilot-actions.csv", headers, rows);
}

export function exportRemarksCSV(projects) {
  const headers = ["Projet", "Poste", "Remarque", "Urgent", "Statut", "Destinataires"];
  const rows = [];
  projects.forEach(p => {
    (p.posts || []).forEach(po => {
      (po.remarks || []).forEach(r => {
        rows.push([p.name, `${po.id}. ${po.label}`, r.text, r.urgent ? "Oui" : "Non", r.status, (r.recipients || []).join(", ")]);
      });
    });
  });
  downloadCSV("archipilot-remarques.csv", headers, rows);
}

export function exportParticipantsCSV(project) {
  const headers = ["Rôle", "Nom", "Email", "Téléphone"];
  const rows = (project.participants || []).map(p => [p.role, p.name, p.email, p.phone]);
  downloadCSV(`participants-${project.name.replace(/[^\w\u00C0-\u024F-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "")}.csv`, headers, rows);
}

export function importParticipantsCSV(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split("\n").filter(l => l.trim());
      if (lines.length < 2) { resolve([]); return; }
      const participants = lines.slice(1).map(line => {
        const cols = line.split(";").map(c => c.replace(/^"|"$/g, "").trim());
        return { role: cols[0] || "", name: cols[1] || "", email: cols[2] || "", phone: cols[3] || "" };
      }).filter(p => p.name);
      resolve(participants);
    };
    reader.readAsText(file);
  });
}

export function generateICS(project) {
  if (!project.nextMeeting) return null;
  const parts = project.nextMeeting.split("/");
  let dateStr;
  if (parts.length === 3) {
    dateStr = `${parts[2]}${parts[1]}${parts[0]}`;
  } else {
    return null;
  }
  const uid = `archipilot-${project.id}-${dateStr}@archipilot.app`;
  const summary = `Réunion de chantier — ${project.name}`;
  const location = project.address || "";
  const description = `PV n°${(project.pvHistory?.length || 0) + 1}\\nClient: ${project.client}\\nEntreprise: ${project.contractor}`;
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ArchiPilot//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTART;VALUE=DATE:${dateStr}`,
    `DTEND;VALUE=DATE:${dateStr}`,
    `SUMMARY:${summary}`,
    `LOCATION:${location}`,
    `DESCRIPTION:${description}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  return ics;
}

export function downloadICS(project) {
  const ics = generateICS(project);
  if (!ics) return;
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `reunion-${project.name.replace(/[^\w\u00C0-\u024F-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "")}.ics`; a.click();
  URL.revokeObjectURL(url);
}

export function getGoogleCalendarUrl(project) {
  if (!project.nextMeeting) return null;
  const parts = project.nextMeeting.split("/");
  if (parts.length !== 3) return null;
  const dateStr = `${parts[2]}${parts[1]}${parts[0]}`;
  const title = encodeURIComponent(`Réunion de chantier — ${project.name}`);
  const location = encodeURIComponent(project.address || "");
  const details = encodeURIComponent(`PV n°${(project.pvHistory?.length || 0) + 1}\nClient: ${project.client}\nEntreprise: ${project.contractor}`);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dateStr}/${dateStr}&location=${location}&details=${details}`;
}
