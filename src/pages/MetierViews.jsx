import { useState } from "react";
import { tokens } from "../design/tokens";

// ─────────────────────────────────────────────────────────────
// Vues métier (v2 · Direction D) — Réserves OPR · Honoraires · Devis
// Conçues pour s'insérer dans l'espace projet (zone contenu). Mode démo
// autonome via /metier/demo (onglets).
// ─────────────────────────────────────────────────────────────

const Svg = ({ d, size = 16, sw = 1.7, fill = "none" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d.split("|").map((p, i) => <path key={i} d={p} />)}
  </svg>
);
const I = {
  plus: "M12 5v14|M5 12h14",
  back: "M15 18l-6-6 6-6",
  chevDown: "M6 9l6 6 6-6",
  check: "M20 6 9 17l-5-5",
  upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4|M17 8l-5-5-5 5|M12 3v12",
  spark: "M12 3l1.9 6.1L20 11l-6.1 1.9L12 19l-1.9-6.1L4 11l6.1-1.9z",
  send: "M22 2 11 13|M22 2l-7 20-4-9-9-4z",
};
const fmtEUR = (n) => new Intl.NumberFormat("fr-BE", { maximumFractionDigits: 0 }).format(n) + " €";

// ── Primitives ────────────────────────────────────────────────
function Header({ overline, title, actions }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", marginBottom: tokens.space[5] }}>
      <div>
        <div style={{ fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.semibold, letterSpacing: "0.06em", textTransform: "uppercase", color: tokens.color.brand[600], marginBottom: 6 }}>{overline}</div>
        <h1 style={{ margin: 0, fontSize: tokens.font.size["2xl"], fontWeight: tokens.font.weight.bold, letterSpacing: "-0.5px", color: tokens.color.neutral[900] }}>{title}</h1>
      </div>
      <div style={{ marginLeft: "auto", display: "flex", gap: tokens.space[2] }}>{actions}</div>
    </div>
  );
}
function Btn({ children, variant = "secondary", onClick, leftIcon }) {
  const v = variant === "primary"
    ? { background: tokens.color.brand[500], border: "none", color: "#fff", fontWeight: tokens.font.weight.semibold }
    : { background: tokens.color.neutral[0], border: `1px solid ${tokens.color.neutral[200]}`, color: tokens.color.neutral[700], fontWeight: tokens.font.weight.medium };
  return <button onClick={onClick} style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 38, padding: `0 ${tokens.space[4]}`, borderRadius: tokens.radius.md, fontFamily: "inherit", fontSize: tokens.font.size.sm, cursor: "pointer", ...v }}>{leftIcon}{children}</button>;
}
function Kpi({ label, value, sub, tone }) {
  const map = {
    warning: { border: "#FDE68A", label: "#92400E", value: "#92400E" },
    success: { border: "#BBF7D0", label: tokens.color.semantic.success.fg, value: tokens.color.semantic.success.fg },
    danger: { border: "#FECACA", label: "#991B1B", value: "#991B1B" },
  };
  const c = map[tone] || { border: tokens.color.neutral[200], label: tokens.color.neutral[500], value: tokens.color.neutral[900] };
  return (
    <div style={{ background: tokens.color.neutral[0], border: `1px solid ${c.border}`, borderRadius: tokens.radius.lg, padding: `${tokens.space[3]} ${tokens.space[4]}` }}>
      <div style={{ fontSize: tokens.font.size.xs, color: c.label, marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: tokens.font.size["2xl"], fontWeight: tokens.font.weight.bold, color: c.value, letterSpacing: "-0.5px" }}>{value}{sub && <span style={{ fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.medium, color: tokens.color.neutral[400] }}> {sub}</span>}</div>
    </div>
  );
}
function Tabs({ items, active, onChange }) {
  return (
    <div style={{ display: "inline-flex", gap: 3, background: tokens.color.neutral[100], borderRadius: tokens.radius.md, padding: 3 }}>
      {items.map(t => {
        const a = t === active;
        return <button key={t} onClick={() => onChange(t)} style={{ padding: "5px 12px", borderRadius: tokens.radius.sm, border: "none", background: a ? tokens.color.neutral[0] : "transparent", boxShadow: a ? tokens.shadow.sm : "none", color: a ? tokens.color.neutral[900] : tokens.color.neutral[500], fontFamily: "inherit", fontSize: tokens.font.size.xs, fontWeight: a ? tokens.font.weight.semibold : tokens.font.weight.medium, cursor: "pointer" }}>{t}</button>;
      })}
    </div>
  );
}
function pill(text, tone) {
  const map = {
    danger: { bg: tokens.color.semantic.danger.bg, fg: tokens.color.semantic.danger.fg, bd: tokens.color.semantic.danger.border },
    warning: { bg: "#FFFBEB", fg: "#92400E", bd: "#FDE68A" },
    success: { bg: tokens.color.semantic.success.bg, fg: tokens.color.semantic.success.fg, bd: tokens.color.semantic.success.border },
    info: { bg: "#EFF6FF", fg: "#1E40AF", bd: "#BFDBFE" },
    neutral: { bg: tokens.color.neutral[100], fg: tokens.color.neutral[500], bd: tokens.color.neutral[200] },
  };
  const c = map[tone] || map.neutral;
  return <span style={{ fontSize: 11, padding: "2px 9px", borderRadius: tokens.radius.full, background: c.bg, color: c.fg, border: `1px solid ${c.bd}`, fontWeight: tokens.font.weight.semibold, whiteSpace: "nowrap" }}>{text}</span>;
}
const ListCard = ({ children }) => <div style={{ background: tokens.color.neutral[0], border: `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.lg, overflow: "hidden" }}>{children}</div>;

// ── Données mock (démo) ───────────────────────────────────────
const MOCK_RESERVES = [
  { ref: "R-012", sev: "Critique", text: "Absence de différentiel 30 mA sur le tableau du rez-de-chaussée", who: "Elek & Co", loc: "Niveau 0, local technique", due: "Échéance 4 juil.", overdue: true, status: "Non levée" },
  { ref: "R-011", sev: "Critique", text: "Étanchéité défectueuse à l'angle nord-est — infiltration constatée", who: "Toitures Lurquin", loc: "Toiture, angle N-E", due: "Échéance 8 juil.", status: "En cours" },
  { ref: "R-009", sev: "Majeure", text: "Tirage des câbles sous-dimensionné, gaine technique 2e étage", who: "Elek & Co", loc: "Niveau 2", due: "Échéance 10 juil.", status: "Non levée" },
  { ref: "R-007", sev: "Mineure", text: "Reprise de peinture dans la cage d'escalier principale", who: "Entreprise Genin", loc: "Niveau 1", due: "Échéance 15 juil.", status: "Levée" },
  { ref: "R-006", sev: "Esthét.", text: "Alignement des joints de carrelage hall d'entrée", who: "Entreprise Genin", loc: "Niveau 0", due: "Échéance 15 juil.", status: "Levée" },
];
const MOCK_INVOICES = [
  { num: "2026-011", title: "Phase Chantier — état d'avancement n°4", meta: "Ville de Nivelles · émise 12/05 · échéance 11/06", status: "En retard", ttc: 8400, ht: 6942, overdue: true },
  { num: "2026-012", title: "Phase Chantier — état d'avancement n°5", meta: "Ville de Nivelles · émise 18/06 · échéance 18/07", status: "Envoyée", ttc: 16000, ht: 13223 },
  { num: "2026-009", title: "Phase Exécution — solde mission", meta: "Ville de Nivelles · émise 02/04 · payée 28/04", status: "Payée", ttc: 42350, ht: 35000 },
  { num: "2026-006", title: "Phase Permis — dépôt du dossier", meta: "Ville de Nivelles · émise 14/02 · payée 03/03", status: "Payée", ttc: 38720, ht: 32000 },
  { num: "2026-013", title: "Frais de reproduction et tirages", meta: "Ville de Nivelles · brouillon", status: "Brouillon", ttc: 1330, ht: 1100 },
];
const MOCK_QUOTES = {
  lots: [{ id: "elec", label: "Électricité", n: 3 }, { id: "hvac", label: "HVAC", n: 2 }, { id: "menui", label: "Menuiseries", n: 2 }],
  cards: [
    { name: "ElectroPro", meta: "6 postes · validité 60 j", total: 37500, best: true },
    { name: "Elek & Co", meta: "6 postes · validité 90 j", total: 38200 },
    { name: "Volt+", meta: "5 postes · validité 30 j", total: 41800, flag: "Incomplet", worst: true },
  ],
  rows: [
    { poste: "Tableau général", v: [5900, 6400, 7200] },
    { poste: "Câblage courants forts", v: [12100, 12800, 13500] },
    { poste: "Courants faibles", v: [4600, 4200, null] },
    { poste: "Appareillage", v: [5400, 5800, 6100] },
    { poste: "Éclairage", v: [7600, 7200, 8000] },
    { poste: "Mise à la terre", v: [1900, 1800, 2100] },
  ],
};

// ── Réserves OPR ──────────────────────────────────────────────
const SEV_TONE = { "Critique": "danger", "Majeure": "warning", "Mineure": "neutral", "Esthét.": "neutral" };
export function ReservesView({ reserves = MOCK_RESERVES, onBack, onNew, onSign }) {
  const [filter, setFilter] = useState("Toutes");
  const total = reserves.length;
  const open = reserves.filter(r => r.status === "Non levée").length;
  const prog = reserves.filter(r => r.status === "En cours").length;
  const done = reserves.filter(r => r.status === "Levée").length;
  const crit = reserves.filter(r => r.sev === "Critique").length;
  const shown = reserves.filter(r => filter === "Toutes" || r.status === filter);
  const statusPill = (r) => r.status === "Levée"
    ? <span style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 28, padding: "0 11px", borderRadius: tokens.radius.full, background: tokens.color.semantic.success.bg, border: `1px solid ${tokens.color.semantic.success.border}`, color: tokens.color.semantic.success.fg, fontSize: 11, fontWeight: tokens.font.weight.semibold }}><Svg d={I.check} size={11} sw={3} />Levée</span>
    : r.status === "En cours"
    ? <span style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 28, padding: "0 11px", borderRadius: tokens.radius.full, background: tokens.color.brand[50], border: `1px solid ${tokens.color.brand[100]}`, color: tokens.color.brand[700], fontSize: 11, fontWeight: tokens.font.weight.semibold }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: tokens.color.brand[400] }} />En cours</span>
    : <span style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 28, padding: "0 11px", borderRadius: tokens.radius.full, background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E", fontSize: 11, fontWeight: tokens.font.weight.semibold }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "#D97706" }} />Non levée</span>;
  return (
    <div>
      <Header overline="Opérations préalables à la réception" title="Réserves OPR" actions={<>
        <Btn onClick={onSign}>Envoyer pour signature</Btn>
        <Btn variant="primary" leftIcon={<Svg d={I.plus} size={15} sw={2} />} onClick={onNew}>Nouvelle réserve</Btn>
      </>} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: tokens.space[3], marginBottom: tokens.space[4] }}>
        <Kpi label="Total" value={total} />
        <Kpi label="Non levées" value={open} tone="warning" />
        <Kpi label="En cours" value={prog} />
        <Kpi label="Levées" value={done} sub={total ? `· ${Math.round(done / total * 100)}%` : ""} tone="success" />
        <Kpi label="Critiques" value={crit} tone="danger" />
      </div>
      <div style={{ marginBottom: tokens.space[4] }}><Tabs items={["Toutes", "Non levée", "En cours", "Levée"]} active={filter} onChange={setFilter} /></div>
      <ListCard>
        {shown.map((r, i) => (
          <div key={r.ref} style={{ display: "flex", alignItems: "center", gap: tokens.space[4], padding: `${tokens.space[3]} ${tokens.space[5]}`, borderBottom: i < shown.length - 1 ? `1px solid ${tokens.color.neutral[100]}` : "none", cursor: "pointer" }}>
            <span style={{ fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.bold, color: tokens.color.neutral[900], fontFamily: "ui-monospace, monospace", width: 54, flexShrink: 0 }}>{r.ref}</span>
            <span style={{ width: 70, flexShrink: 0, textAlign: "center" }}>{pill(r.sev, SEV_TONE[r.sev])}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.medium, color: tokens.color.neutral[900], whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.text}</div>
              <div style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[400] }}>{r.who} · {r.loc}</div>
            </div>
            <span style={{ fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.semibold, color: r.overdue ? tokens.color.semantic.danger.fg : tokens.color.neutral[500], width: 96, flexShrink: 0 }}>{r.due}</span>
            <span style={{ flexShrink: 0 }}>{statusPill(r)}</span>
          </div>
        ))}
        {shown.length === 0 && <div style={{ padding: tokens.space[8], textAlign: "center", color: tokens.color.neutral[500], fontSize: tokens.font.size.sm }}>Aucune réserve dans ce filtre.</div>}
      </ListCard>
    </div>
  );
}

// ── Honoraires & facturation ──────────────────────────────────
const INV_TONE = { "En retard": "danger", "Envoyée": "info", "Payée": "success", "Brouillon": "neutral" };
export function HonorairesView({ invoices = MOCK_INVOICES, onNew }) {
  const [filter, setFilter] = useState("Toutes");
  const sum = (pred) => invoices.filter(pred).reduce((s, x) => s + x.ttc, 0);
  const emis = sum(x => x.status !== "Brouillon");
  const paye = sum(x => x.status === "Payée");
  const attente = sum(x => x.status === "Envoyée");
  const retard = sum(x => x.status === "En retard");
  const retardN = invoices.filter(x => x.status === "En retard").length;
  const fmap = { "Toutes": () => true, "Payées": x => x.status === "Payée", "En attente": x => x.status === "Envoyée", "En retard": x => x.status === "En retard" };
  const shown = invoices.filter(fmap[filter]);
  return (
    <div>
      <Header overline="Facturation par phase · TVA conforme" title="Honoraires & facturation" actions={
        <Btn variant="primary" leftIcon={<Svg d={I.plus} size={15} sw={2} />} onClick={onNew}>Nouvelle facture</Btn>
      } />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: tokens.space[3], marginBottom: tokens.space[4] }}>
        <Kpi label="CA TTC émis" value={fmtEUR(emis)} />
        <Kpi label="Payé" value={fmtEUR(paye)} tone="success" />
        <Kpi label="En attente" value={fmtEUR(attente)} />
        <Kpi label={`En retard · ${retardN}`} value={fmtEUR(retard)} tone="danger" />
      </div>
      <div style={{ marginBottom: tokens.space[4] }}><Tabs items={["Toutes", "Payées", "En attente", "En retard"]} active={filter} onChange={setFilter} /></div>
      <div style={{ display: "flex", flexDirection: "column", gap: tokens.space[3] }}>
        {shown.map(inv => (
          <div key={inv.num} style={{ display: "flex", alignItems: "center", gap: tokens.space[4], background: tokens.color.neutral[0], border: `1px solid ${tokens.color.neutral[200]}`, borderLeft: inv.overdue ? `3px solid ${tokens.color.semantic.danger.fg}` : `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.lg, padding: `${tokens.space[4]} ${tokens.space[4]}`, cursor: "pointer" }}>
            <span style={{ fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.bold, color: tokens.color.neutral[900], fontFamily: "ui-monospace, monospace", width: 84, flexShrink: 0 }}>{inv.num}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: tokens.font.size.base, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[900], marginBottom: 2 }}>{inv.title}</div>
              <div style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[400] }}>{inv.meta}</div>
            </div>
            {pill(inv.status, INV_TONE[inv.status])}
            <div style={{ textAlign: "right", width: 120, flexShrink: 0 }}>
              <div style={{ fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.bold, color: tokens.color.neutral[900] }}>{fmtEUR(inv.ttc)}</div>
              <div style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[400] }}>{fmtEUR(inv.ht)} HT</div>
            </div>
          </div>
        ))}
        {shown.length === 0 && <div style={{ padding: tokens.space[8], textAlign: "center", color: tokens.color.neutral[500], fontSize: tokens.font.size.sm }}>Aucune facture dans ce filtre.</div>}
      </div>
    </div>
  );
}

// ── Devis & comparaison ───────────────────────────────────────
export function DevisView({ data = MOCK_QUOTES, onImport, onAward }) {
  const [lot, setLot] = useState(data.lots[0]?.id);
  const cards = data.cards;
  const rows = data.rows;
  // Total HT = total annoncé du devis (un devis incomplet reste plus cher,
  // pas artificiellement moins cher par somme des postes présents).
  const totals = cards.map(c => c.total);
  const minOf = (vals) => Math.min(...vals.filter(v => v != null));
  const maxOf = (vals) => Math.max(...vals.filter(v => v != null));
  const cellColor = (val, vals) => val == null ? tokens.color.neutral[300] : val === minOf(vals) ? tokens.color.semantic.success.fg : val === maxOf(vals) ? "#991B1B" : tokens.color.neutral[700];
  return (
    <div>
      <Header overline="Comparaison assistée par l'IA" title="Devis & soumissions" actions={
        <Btn variant="primary" leftIcon={<Svg d={I.upload} size={15} />} onClick={onImport}>Importer un devis</Btn>
      } />
      <div style={{ display: "flex", alignItems: "center", gap: tokens.space[2], marginBottom: tokens.space[4] }}>
        <span style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[400] }}>Lot</span>
        {data.lots.map(l => {
          const a = l.id === lot;
          return <button key={l.id} onClick={() => setLot(l.id)} style={{ height: 30, padding: "0 13px", borderRadius: tokens.radius.full, border: a ? "none" : `1px solid ${tokens.color.neutral[200]}`, background: a ? tokens.color.brand[500] : tokens.color.neutral[0], color: a ? "#fff" : tokens.color.neutral[500], fontSize: tokens.font.size.xs, fontWeight: a ? tokens.font.weight.semibold : tokens.font.weight.medium, cursor: "pointer", fontFamily: "inherit" }}>{l.label} · {l.n}</button>;
        })}
      </div>
      {/* 3 cartes */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: tokens.space[3], marginBottom: tokens.space[5] }}>
        {cards.map((c, i) => (
          <div key={i} style={{ position: "relative", background: tokens.color.neutral[0], border: c.best ? `1.5px solid ${tokens.color.semantic.success.border}` : `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.lg, padding: tokens.space[4] }}>
            {c.best && <span style={{ position: "absolute", top: 12, right: 12, fontSize: 10, fontWeight: tokens.font.weight.bold, color: tokens.color.semantic.success.fg, background: tokens.color.semantic.success.bg, border: `1px solid ${tokens.color.semantic.success.border}`, borderRadius: tokens.radius.full, padding: "2px 8px" }}>★ Mieux-disant</span>}
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2 }}>
              <span style={{ fontSize: tokens.font.size.base, fontWeight: tokens.font.weight.bold, color: tokens.color.neutral[900] }}>{c.name}</span>
              {c.flag && pill(c.flag, "warning")}
            </div>
            <div style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[400], marginBottom: tokens.space[3] }}>{c.meta}</div>
            <div style={{ fontSize: tokens.font.size["2xl"], fontWeight: tokens.font.weight.bold, letterSpacing: "-0.5px", color: c.best ? tokens.color.semantic.success.fg : c.worst ? "#991B1B" : tokens.color.neutral[900] }}>{fmtEUR(c.total)}<span style={{ fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.medium, color: tokens.color.neutral[400] }}> HT</span></div>
          </div>
        ))}
      </div>
      {/* Matrice */}
      <div style={{ display: "flex", alignItems: "center", gap: tokens.space[2], marginBottom: tokens.space[2] }}>
        <span style={{ fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[500], textTransform: "uppercase", letterSpacing: "0.05em" }}>Matrice des écarts par poste</span>
        <span style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[400] }}>· vert = mieux-disant · rouge = plus cher · — = absent</span>
      </div>
      <ListCard>
        <div style={{ display: "flex", alignItems: "center", padding: `${tokens.space[3]} ${tokens.space[5]}`, borderBottom: `1px solid ${tokens.color.neutral[200]}`, background: "#FCFBFA" }}>
          <span style={{ flex: 1, fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[500], textTransform: "uppercase", letterSpacing: "0.04em" }}>Poste</span>
          {cards.map((c, i) => <span key={i} style={{ width: 140, textAlign: "right", fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.semibold, color: c.best ? tokens.color.semantic.success.fg : tokens.color.neutral[900] }}>{c.name}</span>)}
        </div>
        {rows.map((r, ri) => (
          <div key={ri} style={{ display: "flex", alignItems: "center", padding: `${tokens.space[3]} ${tokens.space[5]}`, borderBottom: `1px solid ${tokens.color.neutral[100]}` }}>
            <span style={{ flex: 1, fontSize: tokens.font.size.sm, color: tokens.color.neutral[900] }}>{r.poste}</span>
            {r.v.map((val, ci) => <span key={ci} style={{ width: 140, textAlign: "right", fontSize: tokens.font.size.sm, fontWeight: (val === minOf(r.v) || val === maxOf(r.v)) ? tokens.font.weight.semibold : tokens.font.weight.regular, color: cellColor(val, r.v) }}>{val == null ? "—" : fmtEUR(val)}</span>)}
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", padding: `${tokens.space[4]} ${tokens.space[5]}`, background: "#FCFBFA" }}>
          <span style={{ flex: 1, fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.bold, color: tokens.color.neutral[900] }}>Total HT</span>
          {totals.map((t, i) => <span key={i} style={{ width: 140, textAlign: "right", fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.bold, color: t === minOf(totals) ? tokens.color.semantic.success.fg : t === maxOf(totals) ? "#991B1B" : tokens.color.neutral[900] }}>{fmtEUR(t)}</span>)}
        </div>
      </ListCard>
      {/* Award */}
      <div style={{ display: "flex", alignItems: "center", gap: tokens.space[3], marginTop: tokens.space[4], background: tokens.color.brand[50], border: `1px solid ${tokens.color.brand[100]}`, borderRadius: tokens.radius.lg, padding: `${tokens.space[3]} ${tokens.space[4]}` }}>
        <span style={{ color: tokens.color.brand[600], flexShrink: 0 }}><Svg d={I.spark} size={18} /></span>
        <span style={{ flex: 1, fontSize: tokens.font.size.sm, color: tokens.color.brand[700], lineHeight: 1.5 }}><b>{cards[0]?.name}</b> est le mieux-disant, mais {cards[1]?.name} offre une validité plus longue et un devis complet.</span>
        <Btn variant="primary" onClick={onAward}>Attribuer le lot</Btn>
      </div>
    </div>
  );
}

// ── Démo autonome (/metier/demo) ──────────────────────────────
export function MetierDemo() {
  const [tab, setTab] = useState("reserves");
  const TABS = [{ id: "reserves", label: "Réserves OPR" }, { id: "honoraires", label: "Honoraires" }, { id: "devis", label: "Devis" }];
  return (
    <div style={{ minHeight: "100vh", background: "#FCFBFA", fontFamily: tokens.font.family, color: tokens.color.neutral[900] }}>
      <div style={{ height: 54, display: "flex", alignItems: "center", gap: tokens.space[4], padding: `0 ${tokens.space[6]}`, background: tokens.color.neutral[0], borderBottom: `1px solid ${tokens.color.neutral[200]}` }}>
        <span style={{ fontSize: tokens.font.size.sm, color: tokens.color.neutral[500] }}>Hôtel de Ville — Nivelles <span style={{ color: tokens.color.neutral[300] }}>/</span> <span style={{ color: tokens.color.neutral[900], fontWeight: tokens.font.weight.semibold }}>Vues métier</span></span>
        <div style={{ marginLeft: "auto" }}>
          <div style={{ display: "inline-flex", gap: 3, background: tokens.color.neutral[100], borderRadius: tokens.radius.md, padding: 3 }}>
            {TABS.map(t => { const a = t.id === tab; return <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "6px 14px", borderRadius: tokens.radius.sm, border: "none", background: a ? tokens.color.neutral[0] : "transparent", boxShadow: a ? tokens.shadow.sm : "none", color: a ? tokens.color.neutral[900] : tokens.color.neutral[500], fontFamily: "inherit", fontSize: tokens.font.size.sm, fontWeight: a ? tokens.font.weight.semibold : tokens.font.weight.medium, cursor: "pointer" }}>{t.label}</button>; })}
          </div>
        </div>
      </div>
      <div style={{ padding: `${tokens.space[6]} ${tokens.space[8]}`, maxWidth: 1100, margin: "0 auto" }}>
        {tab === "reserves" && <ReservesView />}
        {tab === "honoraires" && <HonorairesView />}
        {tab === "devis" && <DevisView />}
      </div>
    </div>
  );
}

export default MetierDemo;
