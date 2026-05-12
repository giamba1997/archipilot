// ── F5 — Calcul des alertes en temps réel ──────────────────
// Agrège les échéances depuis projects (JSONB) + permits + invoices.
// Tournant 100% client-side : pas de cron, pas de mutation, juste un
// re-calcul à chaque ouverture du drawer.
//
// Sortie : liste d'alertes triées par urgence DESC.
// Chaque alerte : { id, type, severity, title, subtitle, daysUntil, projectId, projectName, raw }
//
// severity :
//   "critical" → dépassé / aujourd'hui
//   "high"     → ≤ 7 jours
//   "medium"   → ≤ 30 jours
//   "low"      → > 30 jours (informational)

const DEFAULT_SETTINGS = {
  reception_definitive: true,
  reserve_overdue:      true,
  permit_deadline:      true,
  task_overdue:         true,
  invoice_overdue:      true,
  no_pv_30d:            false,
};

function parseDateAny(input) {
  if (!input) return null;
  if (input instanceof Date) return isNaN(input) ? null : input;
  if (typeof input !== "string") return null;
  const iso = new Date(input);
  if (!isNaN(iso)) return iso;
  const m = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const year = y.length === 2 ? 2000 + parseInt(y, 10) : parseInt(y, 10);
    return new Date(year, parseInt(mo, 10) - 1, parseInt(d, 10));
  }
  return null;
}

function daysBetween(target) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const t = new Date(target); t.setHours(0, 0, 0, 0);
  return Math.round((t - today) / 86400000);
}

function severityFromDays(d) {
  if (d == null) return "low";
  if (d <= 0) return "critical";
  if (d <= 7) return "high";
  if (d <= 30) return "medium";
  return "low";
}

export function computeAlerts({ projects = [], permits = [], invoices = [], settings = {} }) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const alerts = [];

  // ── R1 : Réception définitive J-365 ──
  // Si un OPR provisoire date d'il y a 11-13 mois, l'archi devrait
  // planifier la réception définitive. On regarde oprHistory.
  if (s.reception_definitive) {
    for (const p of projects) {
      if (p.archived) continue;
      const provs = (p.oprHistory || []).filter(o => o.type === "provisoire" || !o.type);
      const lastProv = provs.length > 0 ? provs[provs.length - 1] : null;
      if (!lastProv) continue;
      const d = parseDateAny(lastProv.date);
      if (!d) continue;
      const days = daysBetween(d);
      // J-365 = il y a 365 jours → days = -365
      // On alerte entre -335 et -395 (fenêtre 30j)
      if (days >= -395 && days <= -335) {
        const daysUntilAnniversary = 365 + days;  // positif = jours restants jusqu'à l'anniversaire
        alerts.push({
          id: `recep-${p.id}`,
          type: "reception_definitive",
          severity: severityFromDays(daysUntilAnniversary),
          title: "Planifier la réception définitive",
          subtitle: `OPR provisoire du ${lastProv.date} — anniversaire dans ~${daysUntilAnniversary}j`,
          daysUntil: daysUntilAnniversary,
          projectId: p.id,
          projectName: p.name,
        });
      }
    }
  }

  // ── R2 : Réserves overdue ──
  if (s.reserve_overdue) {
    for (const p of projects) {
      if (p.archived) continue;
      for (const r of (p.reserves || [])) {
        if (r.status === "levee") continue;
        if (!r.deadline) continue;
        const days = daysBetween(r.deadline);
        if (days > 30) continue;  // pas encore urgent
        alerts.push({
          id: `reserve-${r.id}`,
          type: "reserve_overdue",
          severity: severityFromDays(days),
          title: `Réserve ${r.code || "sans code"} — échéance ${days <= 0 ? `dépassée de ${-days}j` : `J-${days}`}`,
          subtitle: r.description?.slice(0, 100) || "",
          daysUntil: days,
          projectId: p.id,
          projectName: p.name,
        });
      }
    }
  }

  // ── R3 : Permis silence vaut quoi ──
  if (s.permit_deadline) {
    for (const perm of permits) {
      if (!["deposited", "complete_request", "in_review"].includes(perm.status)) continue;
      if (!perm.deadline_date) continue;
      const days = daysBetween(perm.deadline_date);
      if (days > 30) continue;
      const proj = projects.find(p => String(p.id) === String(perm.project_id));
      alerts.push({
        id: `permit-${perm.id}`,
        type: "permit_deadline",
        severity: severityFromDays(days),
        title: `Permis ${perm.reference || "sans réf."} — décision ${days <= 0 ? `dépassée de ${-days}j (silence vaut décision)` : `J-${days}`}`,
        subtitle: `${perm.commune || ""} · ${perm.procedure || ""}`,
        daysUntil: days,
        projectId: perm.project_id,
        projectName: proj?.name || perm.project_name || "Projet",
      });
    }
  }

  // ── R4 : Tâches overdue ──
  if (s.task_overdue) {
    for (const p of projects) {
      if (p.archived) continue;
      for (const tk of (p.tasks || [])) {
        if (!tk.dueDate) continue;
        if (["done", "cancelled", "closed"].includes(tk.status)) continue;
        const days = daysBetween(tk.dueDate);
        if (days > 7) continue;  // tasks plus permissif que permits
        alerts.push({
          id: `task-${tk.id}`,
          type: "task_overdue",
          severity: severityFromDays(days),
          title: tk.title || "Tâche",
          subtitle: `Échéance ${days <= 0 ? `dépassée de ${-days}j` : `J-${days}`}${tk.assignee ? ` · ${tk.assignee}` : ""}`,
          daysUntil: days,
          projectId: p.id,
          projectName: p.name,
        });
      }
    }
  }

  // ── R5 : Factures impayées ──
  if (s.invoice_overdue) {
    for (const inv of invoices) {
      if (!["sent", "overdue"].includes(inv.status)) continue;
      if (!inv.due_date) continue;
      const days = daysBetween(inv.due_date);
      if (days > 0) continue;  // pas encore en retard
      const proj = projects.find(p => String(p.id) === String(inv.project_id));
      alerts.push({
        id: `invoice-${inv.id}`,
        type: "invoice_overdue",
        severity: "critical",
        title: `Facture ${inv.number} en retard de ${-days}j`,
        subtitle: `${inv.client_name} · ${Number(inv.amount_ttc || 0).toLocaleString("fr-BE")} € TTC`,
        daysUntil: days,
        projectId: inv.project_id,
        projectName: proj?.name || inv.project_name || "Projet",
      });
    }
  }

  // ── R6 : Pas de PV depuis X jours ──
  if (s.no_pv_30d) {
    for (const p of projects) {
      if (p.archived) continue;
      if (p.statusId !== "construction" && p.statusId !== "execution") continue;
      const pvs = p.pvHistory || [];
      const lastPv = pvs.length > 0 ? pvs[0] : null;
      const lastDate = lastPv ? parseDateAny(lastPv.date) : null;
      if (!lastDate) continue;
      const days = daysBetween(lastDate);
      // -30 ou moins (30+ jours sans PV)
      if (days > -30) continue;
      alerts.push({
        id: `nopv-${p.id}`,
        type: "no_pv_30d",
        severity: "medium",
        title: "Pas de PV depuis 30+ jours",
        subtitle: `Dernier PV : ${lastPv.date}`,
        daysUntil: days,
        projectId: p.id,
        projectName: p.name,
      });
    }
  }

  // Tri : critical → high → medium → low, puis daysUntil ascendant
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  alerts.sort((a, b) => {
    const so = (severityOrder[a.severity] - severityOrder[b.severity]);
    if (so !== 0) return so;
    return (a.daysUntil ?? 0) - (b.daysUntil ?? 0);
  });

  return alerts;
}
