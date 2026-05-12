import { useState, useEffect, useMemo } from "react";
import {
  AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, RD, GR,
  AM, AMB, ST, STB, BR, BRB, SG, SGB,
  DIS, DIST, REDBRD,
} from "../constants/tokens";
import { Ico } from "../components/ui";
import { loadInvoices, saveInvoice, deleteInvoice, nextInvoiceNumber } from "../db";
import { generateInvoicePdf } from "../utils/pdf";
import { getProjectPhases } from "../utils/phases";

// ── F1 — Honoraires & facturation par phases ────────────────
// Vue plein écran par projet. Affiche les factures émises + KPIs CA +
// formulaire création/édition. Le PDF est généré client-side (jsPDF)
// comme PV et OPR — pas d'edge function en v1.
//
// Statuts :
//   draft     → brouillon, modifiable, filigrane "BROUILLON" sur PDF
//   sent      → envoyée, date `sent_at` posée
//   paid      → payée, date `paid_at` posée
//   overdue   → dépassée (statut posé manuellement ou par cron F5 plus tard)
//   cancelled → annulée (garde le numéro pour traçabilité TVA)

const INVOICE_STATUSES = [
  { id: "draft",     label: "Brouillon",  color: TX2, bg: SB,   dot: TX3 },
  { id: "sent",      label: "Envoyée",    color: ST,  bg: STB,  dot: ST  },
  { id: "paid",      label: "Payée",      color: GR,  bg: SGB,  dot: GR  },
  { id: "overdue",   label: "En retard",  color: BR,  bg: BRB,  dot: BR  },
  { id: "cancelled", label: "Annulée",    color: TX3, bg: SB2,  dot: TX3 },
];
const getStatus = (id) => INVOICE_STATUSES.find(s => s.id === id) || INVOICE_STATUSES[0];

export function InvoicesView({ project, profile, showToast, onBack }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [editing, setEditing] = useState(null); // invoice object ou "new"
  const [downloadingId, setDownloadingId] = useState(null);

  // Charge au montage + à chaque changement de projet
  useEffect(() => {
    let cancelled = false;
    loadInvoices({ projectId: project.id })
      .then(rows => { if (!cancelled) { setInvoices(rows); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [project.id]);

  const refresh = async () => {
    const rows = await loadInvoices({ projectId: project.id });
    setInvoices(rows);
  };

  // KPIs : on calcule sur TOUTES les factures, pas seulement le filtre actif
  const kpis = useMemo(() => {
    const totalHt  = invoices.reduce((s, i) => s + Number(i.amount_ht || 0), 0);
    const totalTtc = invoices.reduce((s, i) => s + Number(i.amount_ttc || 0), 0);
    const paidTtc  = invoices.filter(i => i.status === "paid").reduce((s, i) => s + Number(i.amount_ttc || 0), 0);
    const pendingTtc = invoices.filter(i => i.status === "sent").reduce((s, i) => s + Number(i.amount_ttc || 0), 0);
    // overdue = sent + due_date dépassé OU status="overdue"
    const today = new Date(); today.setHours(0,0,0,0);
    const overdue = invoices.filter(i =>
      (i.status === "overdue" || (i.status === "sent" && new Date(i.due_date) < today))
    );
    const overdueTtc = overdue.reduce((s, i) => s + Number(i.amount_ttc || 0), 0);
    return { totalHt, totalTtc, paidTtc, pendingTtc, overdueTtc, overdueCount: overdue.length };
  }, [invoices]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return invoices;
    if (statusFilter === "overdue") {
      const today = new Date(); today.setHours(0,0,0,0);
      return invoices.filter(i =>
        i.status === "overdue" || (i.status === "sent" && new Date(i.due_date) < today)
      );
    }
    return invoices.filter(i => i.status === statusFilter);
  }, [invoices, statusFilter]);

  const handleSave = async (draft) => {
    const saved = await saveInvoice(draft);
    if (saved) {
      setEditing(null);
      await refresh();
      showToast?.(draft.id ? "Facture mise à jour" : `Facture ${saved.number} créée`);
    } else {
      showToast?.("Échec de la sauvegarde", "error");
    }
  };

  const handleDelete = async (inv) => {
    if (!confirm(`Supprimer la facture ${inv.number} ?\n\nLa suppression est définitive — pour la TVA, préfère le statut "Annulée" qui conserve le numéro.`)) return;
    const ok = await deleteInvoice(inv.id);
    if (ok) {
      setInvoices(prev => prev.filter(x => x.id !== inv.id));
      showToast?.("Facture supprimée");
    }
  };

  const handleStatus = async (inv, newStatus) => {
    const payload = { ...inv, status: newStatus, _wasSent: !!inv.sent_at, _wasPaid: !!inv.paid_at };
    const saved = await saveInvoice(payload);
    if (saved) {
      setInvoices(prev => prev.map(x => x.id === saved.id ? saved : x));
    }
  };

  const handleDownload = async (inv) => {
    setDownloadingId(inv.id);
    try {
      await generateInvoicePdf(inv, profile);
    } catch (e) {
      console.error("Invoice PDF error:", e);
      showToast?.(`Erreur PDF : ${e?.message || e}`, "error");
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", animation: "fadeIn 0.2s ease" }}>
      {/* Header — pattern identique à OprView/JournalView */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onBack} style={{ background: SB, border: `1px solid ${SBB}`, cursor: "pointer", padding: 7, minWidth: 36, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 }}>
            <Ico name="back" color={TX2} size={16} />
          </button>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: TX }}>Honoraires & facturation</div>
            <div style={{ fontSize: 12, color: TX3 }}>{project.name} — Factures émises pour ce projet</div>
          </div>
        </div>
        <button
          onClick={() => setEditing("new")}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 10, border: "none", background: AC, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
        >
          <Ico name="plus" size={13} color="#fff" /> Nouvelle facture
        </button>
      </div>

      {/* KPIs */}
      {invoices.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 14 }}>
          <KpiBox label="CA TTC total" value={fmtEur(kpis.totalTtc)} color={TX} />
          <KpiBox label="Payé" value={fmtEur(kpis.paidTtc)} color={GR} bg={SGB} />
          <KpiBox label="En attente" value={fmtEur(kpis.pendingTtc)} color={ST} bg={STB} />
          <KpiBox label="En retard" value={fmtEur(kpis.overdueTtc)} color={BR} bg={BRB} sub={kpis.overdueCount > 0 ? `${kpis.overdueCount} facture${kpis.overdueCount > 1 ? "s" : ""}` : null} />
        </div>
      )}

      {/* Filtres status */}
      {invoices.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
          <FilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")} label={`Toutes (${invoices.length})`} />
          {INVOICE_STATUSES.map(s => {
            const count = invoices.filter(i => i.status === s.id).length;
            if (count === 0) return null;
            return (
              <FilterChip
                key={s.id}
                active={statusFilter === s.id}
                onClick={() => setStatusFilter(s.id)}
                label={`${s.label} (${count})`}
                dot={s.dot}
              />
            );
          })}
        </div>
      )}

      {/* Liste */}
      {loading ? (
        <div style={{ padding: "30px 0", textAlign: "center", color: TX3, fontSize: 13 }}>Chargement…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: "32px 20px", textAlign: "center", background: WH, border: `1px dashed ${SBB}`, borderRadius: 14, color: TX3, fontSize: 13 }}>
          {invoices.length === 0
            ? "Aucune facture émise pour ce projet. Crée la première — le numéro TVA est attribué automatiquement."
            : "Aucune facture ne correspond à ce filtre."}
        </div>
      ) : (
        <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 14, overflow: "hidden" }}>
          {filtered.map((inv, idx) => {
            const s = getStatus(inv.status);
            const today = new Date(); today.setHours(0,0,0,0);
            const isLate = inv.status === "sent" && new Date(inv.due_date) < today;
            return (
              <div key={inv.id} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 16px",
                borderTop: idx === 0 ? "none" : `1px solid ${SBB}`,
              }}>
                <div style={{ width: 6, height: 36, borderRadius: 3, background: s.dot, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: TX, fontFamily: "ui-monospace, monospace" }}>{inv.number}</span>
                    <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 999, background: s.bg, color: s.color, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      {isLate && inv.status === "sent" ? "EN RETARD" : s.label}
                    </span>
                    {inv.phase_label && (
                      <span style={{ fontSize: 10, color: TX3, padding: "1px 6px", background: SB, borderRadius: 4 }}>{inv.phase_label}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: TX2, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {inv.description}
                  </div>
                  <div style={{ fontSize: 11, color: TX3 }}>
                    {inv.client_name} · Émise {fmtDate(inv.issue_date)} · Échéance {fmtDate(inv.due_date)}
                  </div>
                </div>
                <div style={{ textAlign: "right", fontSize: 14, fontWeight: 700, color: TX, flexShrink: 0, minWidth: 100 }}>
                  {fmtEur(inv.amount_ttc)}
                  <div style={{ fontSize: 10, color: TX3, fontWeight: 500 }}>{fmtEur(inv.amount_ht)} HT</div>
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <IconBtn icon="download" title="Télécharger PDF" loading={downloadingId === inv.id} onClick={() => handleDownload(inv)} />
                  {inv.status === "draft" && (
                    <IconBtn icon="send" title="Marquer comme envoyée" onClick={() => handleStatus(inv, "sent")} color={ST} />
                  )}
                  {(inv.status === "sent" || inv.status === "overdue") && (
                    <IconBtn icon="check" title="Marquer comme payée" onClick={() => handleStatus(inv, "paid")} color={GR} />
                  )}
                  <IconBtn icon="edit" title="Modifier" onClick={() => setEditing(inv)} />
                  <IconBtn icon="trash" title="Supprimer" onClick={() => handleDelete(inv)} color={RD} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal édition / création */}
      {editing && (
        <InvoiceFormModal
          invoice={editing === "new" ? null : editing}
          project={project}
          profile={profile}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Formulaire facture (modal)
// ─────────────────────────────────────────────────────────────
function InvoiceFormModal({ invoice, project, profile, onCancel, onSave }) {
  const phases = getProjectPhases(project);
  const todayISO = new Date().toISOString().slice(0, 10);
  const dueDefault = (() => {
    const d = new Date();
    d.setDate(d.getDate() + (profile?.invoicePaymentTermsDays || 30));
    return d.toISOString().slice(0, 10);
  })();

  // MO depuis participants si dispo
  const moDefault = (project.participants || []).find(p => p.role === "MO") || null;

  const [form, setForm] = useState(() => ({
    id: invoice?.id || null,
    number: invoice?.number || "",   // si vide → réservé à la création
    phase_id: invoice?.phase_id || (phases[0]?.id || ""),
    phase_label: invoice?.phase_label || (phases[0]?.label || ""),
    client_name: invoice?.client_name || project.client || moDefault?.name || "",
    client_address: invoice?.client_address || project.address || "",
    client_vat: invoice?.client_vat || "",
    description: invoice?.description || "",
    amount_ht: invoice?.amount_ht ?? "",
    vat_rate: invoice?.vat_rate ?? 21,
    issue_date: invoice?.issue_date || todayISO,
    due_date: invoice?.due_date || dueDefault,
    status: invoice?.status || "draft",
    payment_method: invoice?.payment_method || "virement",
    payment_ref: invoice?.payment_ref || "",
    notes: invoice?.notes || "",
    project_id: project.id,
    project_name: project.name,
    _wasSent: !!invoice?.sent_at,
    _wasPaid: !!invoice?.paid_at,
  }));

  const [reserving, setReserving] = useState(false);

  // Sync phase_label quand phase_id change
  const setPhase = (id) => {
    const ph = phases.find(p => p.id === id);
    setForm(f => ({ ...f, phase_id: id, phase_label: ph?.label || "" }));
  };

  const reserveNumber = async () => {
    setReserving(true);
    const year = new Date(form.issue_date).getFullYear();
    const num = await nextInvoiceNumber(year);
    setReserving(false);
    if (num) setForm(f => ({ ...f, number: num }));
  };

  // Recalcul HT/TVA/TTC pour aperçu
  const ht  = Number(form.amount_ht) || 0;
  const vat = Math.round(ht * Number(form.vat_rate)) / 100;
  const ttc = Math.round(ht * (100 + Number(form.vat_rate))) / 100;

  const canSave = form.client_name.trim() && form.description.trim() && ht > 0 && form.issue_date && form.due_date;

  return (
    <div
      onClick={onCancel}
      style={{ position: "fixed", inset: 0, zIndex: 250, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: WH, borderRadius: 14, width: "100%", maxWidth: 640, padding: 22, maxHeight: "92vh", overflowY: "auto", fontFamily: "inherit" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: TX }}>{invoice ? `Modifier ${invoice.number}` : "Nouvelle facture"}</div>
            <div style={{ fontSize: 12, color: TX3, marginTop: 2 }}>
              {invoice ? "Les modifications sont enregistrées au prochain clic sur Enregistrer." : "Le numéro TVA sera attribué automatiquement à la création."}
            </div>
          </div>
          <button onClick={onCancel} style={{ background: SB, border: `1px solid ${SBB}`, cursor: "pointer", padding: 6, borderRadius: 8, display: "flex" }}>
            <Ico name="x" size={14} color={TX2} />
          </button>
        </div>

        {/* Phase + numéro */}
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          {phases.length > 0 && (
            <div style={{ flex: 2 }}>
              <Label>Phase</Label>
              <select value={form.phase_id} onChange={e => setPhase(e.target.value)} style={inputStyle}>
                <option value="">— Aucune phase —</option>
                {phases.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
          )}
          <div style={{ flex: 1 }}>
            <Label>Numéro</Label>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={form.number}
                onChange={e => setForm(f => ({ ...f, number: e.target.value }))}
                placeholder={invoice ? "" : "Auto à la création"}
                style={{ ...inputStyle, fontFamily: "ui-monospace, monospace" }}
                disabled={!!invoice}
              />
              {!invoice && (
                <button
                  type="button"
                  onClick={reserveNumber}
                  disabled={reserving}
                  title="Réserver le prochain numéro disponible"
                  style={{ padding: "0 10px", border: `1px solid ${SBB}`, borderRadius: 8, background: SB, color: TX2, fontSize: 11, fontWeight: 600, cursor: reserving ? "default" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
                >
                  {reserving ? "…" : "Auto"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Client */}
        <Label>Client *</Label>
        <input value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} placeholder="Nom du maître d'ouvrage" style={inputStyle} />
        <div style={{ display: "flex", gap: 10, marginTop: 10, marginBottom: 10 }}>
          <div style={{ flex: 2 }}>
            <Label>Adresse client</Label>
            <input value={form.client_address} onChange={e => setForm(f => ({ ...f, client_address: e.target.value }))} placeholder="Rue, n°, code postal, ville" style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <Label>N° TVA client</Label>
            <input value={form.client_vat} onChange={e => setForm(f => ({ ...f, client_vat: e.target.value }))} placeholder="BE0XXX.XXX.XXX" style={inputStyle} />
          </div>
        </div>

        {/* Description */}
        <Label>Description *</Label>
        <textarea
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="ex : Honoraires phase Permis — 25% du forfait total (8 000 € HT)"
          rows={3}
          style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
        />

        {/* Montants */}
        <div style={{ display: "flex", gap: 10, marginTop: 12, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <Label>Montant HT (€) *</Label>
            <input
              type="number" step="0.01" min="0"
              value={form.amount_ht}
              onChange={e => setForm(f => ({ ...f, amount_ht: e.target.value }))}
              placeholder="0.00"
              style={{ ...inputStyle, textAlign: "right", fontFamily: "ui-monospace, monospace" }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <Label>TVA (%)</Label>
            <select value={form.vat_rate} onChange={e => setForm(f => ({ ...f, vat_rate: Number(e.target.value) }))} style={inputStyle}>
              <option value={21}>21 % (standard)</option>
              <option value={6}>6 % (rénovation/logement)</option>
              <option value={12}>12 % (logement social)</option>
              <option value={0}>0 % (cocontractant)</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <Label>Total TTC</Label>
            <div style={{ ...inputStyle, background: SB, color: TX, fontWeight: 700, fontFamily: "ui-monospace, monospace", textAlign: "right", padding: "10px 12px" }}>
              {fmtEur(ttc)}
            </div>
          </div>
        </div>

        {/* Dates */}
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <Label>Date d'émission *</Label>
            <input type="date" value={form.issue_date} onChange={e => setForm(f => ({ ...f, issue_date: e.target.value }))} style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <Label>Échéance *</Label>
            <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} style={inputStyle} />
          </div>
        </div>

        {/* Communication bancaire */}
        <Label>Communication bancaire (optionnel)</Label>
        <input value={form.payment_ref} onChange={e => setForm(f => ({ ...f, payment_ref: e.target.value }))} placeholder="ex : +++123/4567/89012+++" style={{ ...inputStyle, fontFamily: "ui-monospace, monospace" }} />

        {/* Notes */}
        <div style={{ marginTop: 10 }}>
          <Label>Notes internes (n'apparaissent pas sur le PDF)</Label>
          <textarea
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder=""
            rows={2}
            style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
          />
        </div>

        {/* Statut (modifiable seulement en édition) */}
        {invoice && (
          <div style={{ marginTop: 12 }}>
            <Label>Statut</Label>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {INVOICE_STATUSES.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, status: s.id }))}
                  style={{
                    padding: "6px 12px",
                    border: `1.5px solid ${form.status === s.id ? s.color : SBB}`,
                    borderRadius: 8,
                    background: form.status === s.id ? s.bg : WH,
                    color: form.status === s.id ? s.color : TX3,
                    fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Profil incomplet — avertissement */}
        {(!profile?.iban || !profile?.vatNumber) && (
          <div style={{ marginTop: 14, padding: "10px 12px", background: AMB, border: `1px solid ${AM}33`, borderRadius: 8, fontSize: 11, color: TX2, lineHeight: 1.5 }}>
            <strong style={{ color: TX }}>Profil émetteur incomplet.</strong> Pour un PDF conforme TVA belge, complète {!profile?.iban && "IBAN"}{!profile?.iban && !profile?.vatNumber ? " et " : ""}{!profile?.vatNumber && "n° de TVA"} dans ton profil.
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <button
            onClick={onCancel}
            style={{ flex: 1, padding: "11px 16px", border: `1px solid ${SBB}`, borderRadius: 10, background: WH, color: TX2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
          >
            Annuler
          </button>
          <button
            onClick={() => canSave && onSave(form)}
            disabled={!canSave}
            style={{
              flex: 2, padding: "11px 16px", border: "none", borderRadius: 10,
              background: canSave ? AC : DIS,
              color: canSave ? "#fff" : DIST,
              fontSize: 13, fontWeight: 700,
              cursor: canSave ? "pointer" : "not-allowed", fontFamily: "inherit",
            }}
          >
            {invoice ? "Enregistrer" : "Créer la facture"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers UI ────────────────────────────────────────────────
function Label({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: TX2, marginBottom: 5 }}>{children}</div>;
}

function FilterChip({ active, onClick, label, dot }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "5px 11px",
        border: `1px solid ${active ? ACL2 : SBB}`,
        borderRadius: 999,
        background: active ? ACL : WH,
        color: active ? AC : TX2,
        fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
      }}
    >
      {dot && <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot }} />}
      {label}
    </button>
  );
}

function KpiBox({ label, value, color = TX, bg = SB, sub = null }) {
  return (
    <div style={{ background: bg, border: `1px solid ${SBB}`, borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: TX3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color, fontFamily: "ui-monospace, monospace", letterSpacing: "-0.5px" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: TX3, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function IconBtn({ icon, title, onClick, color = TX2, loading = false }) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={loading}
      style={{ background: "transparent", border: "none", cursor: loading ? "default" : "pointer", padding: 6, display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <Ico name={loading ? "clock" : icon} size={14} color={color} />
    </button>
  );
}

// ── Formatters ───────────────────────────────────────────────
function fmtEur(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("fr-BE", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " €";
}
function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const inputStyle = {
  width: "100%", padding: "10px 12px", border: `1px solid ${SBB}`, borderRadius: 8,
  fontSize: 13, fontFamily: "inherit", background: WH, color: TX,
  outline: "none", boxSizing: "border-box", transition: "border-color 0.15s",
};
