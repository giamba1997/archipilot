import { useMemo, useState } from "react";
import { tokens } from "../design/tokens";
import { Button } from "../components/ui/v2/Button";
import { parseDateFR } from "../utils/dates";

// ── PvComposer (v2) — composer plein écran « Direction D » ──────
//
// Flux : Choix de la méthode → 1·Saisie → 2·Rédaction → 3·Diffusion.
// Plein écran, hors du chrome habituel (sidebar/topbar). Porté depuis le
// prototype `design_handoff_archipilot_refonte`, sur le design system v2.
//
// État porté à ce jet : shell (top-bar + stepper) + écran « Choix de la
// méthode ». Les étapes Saisie / Rédaction / Diffusion sont des placeholders
// stylés, portées dans les itérations suivantes.

const Svg = ({ children, size = 24, sw = 1.5 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

const I = {
  back:    (p) => <Svg {...p} sw={2}><polyline points="15 18 9 12 15 6" /></Svg>,
  close:   (p) => <Svg {...p} sw={1.8}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></Svg>,
  check:   (p) => <Svg {...p} sw={3}><polyline points="20 6 9 17 4 12" /></Svg>,
  chevron: (p) => <Svg {...p} sw={2}><polyline points="9 6 15 12 9 18" /></Svg>,
  pen:     (p) => <Svg {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z" /></Svg>,
  mic:     (p) => <Svg {...p} sw={1.6}><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></Svg>,
  upload:  (p) => <Svg {...p} sw={1.7}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></Svg>,
  redo:    (p) => <Svg {...p} sw={1.7}><path d="M3 12a9 9 0 1 0 9-9 9.7 9.7 0 0 0-6.7 2.8L3 8" /><path d="M3 3v5h5" /></Svg>,
  cal:     (p) => <Svg {...p} sw={1.7}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></Svg>,
  cloud:   (p) => <Svg {...p} sw={1.7}><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" /></Svg>,
  image:   (p) => <Svg {...p} sw={1.7}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></Svg>,
  plus:    (p) => <Svg {...p} sw={2}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></Svg>,
  chevDown:(p) => <Svg {...p} sw={2}><polyline points="6 9 12 15 18 9" /></Svg>,
  spark:   (p) => <Svg {...p}><path d="M12 3l1.9 6.1L20 11l-6.1 1.9L12 19l-1.9-6.1L4 11l6.1-1.9z" /></Svg>,
  clipboard:(p) => <Svg {...p} sw={1.7}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></Svg>,
};

const DEFAULT_PROJECT = {
  name: "Hôtel de Ville — Nivelles",
  nextMeeting: "30/06/2026",
  pvHistory: [{ number: 1 }, { number: 2 }, { number: 11 }],
  reserves: [{ status: "open" }, { status: "open" }, { status: "open" }, { status: "open" }, { status: "open" }, { status: "levee" }],
};

const STEPS = [{ n: 1, label: "Saisie" }, { n: 2, label: "Rédaction" }, { n: 3, label: "Diffusion" }];

export function PvComposer({ project = DEFAULT_PROJECT, onClose, onStartReal }) {
  // "choice" est un pré-écran de l'étape 1 (Saisie) — le stepper montre donc
  // déjà "Saisie" actif pendant le choix.
  const [step, setStep] = useState("choice");

  const meta = useMemo(() => {
    const pvs = project?.pvHistory || [];
    const num = (pvs.reduce((m, p) => Math.max(m, p.number || 0), 0) || pvs.length) + 1;
    const openReserves = (project?.reserves || []).filter(r => r.status !== "levee").length;
    const d = project?.nextMeeting ? (parseDateFR(project.nextMeeting) || new Date(project.nextMeeting)) : null;
    const meetingLabel = d && !isNaN(+d) ? d.toLocaleDateString("fr-BE", { weekday: "short", day: "numeric", month: "long" }) : null;
    return { num, openReserves, meetingLabel };
  }, [project]);

  const stepIndex = step === "redaction" ? 2 : step === "diffusion" ? 3 : 1;
  const stepCta =
    step === "saisie" ? { label: "Continuer vers la rédaction", onClick: () => setStep("redaction") }
    : step === "redaction" ? { label: "Continuer vers la diffusion", onClick: () => setStep("diffusion") }
    : step === "diffusion" ? { label: "Envoyer le PV", onClick: onClose }
    : null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", flexDirection: "column", background: tokens.color.neutral[50], fontFamily: tokens.font.family, color: tokens.color.neutral[900] }}>
      {/* ── Top bar ── */}
      <div style={{ height: 58, flexShrink: 0, background: tokens.color.neutral[0], borderBottom: `1px solid ${tokens.color.neutral[200]}`, display: "flex", alignItems: "center", padding: `0 ${tokens.space[5]}`, gap: tokens.space[4] }}>
        <NaviButton onClick={step === "choice" ? onClose : () => setStep(step === "diffusion" ? "redaction" : step === "redaction" ? "saisie" : "choice")} icon={<I.back size={18} />} label={step === "choice" ? "Espace projet" : "Retour"} />
        <div style={{ width: 1, height: 24, background: tokens.color.neutral[200] }} />
        <div>
          <div style={{ fontSize: tokens.font.size.base, fontWeight: tokens.font.weight.bold, letterSpacing: "-0.2px" }}>Nouveau PV n°{meta.num}</div>
          <div style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[500] }}>{project?.name}</div>
        </div>

        {/* Stepper */}
        <div style={{ margin: "0 auto", display: "flex", alignItems: "center", gap: tokens.space[2] }}>
          {STEPS.map((s, i) => (
            <div key={s.n} style={{ display: "flex", alignItems: "center", gap: tokens.space[2] }}>
              {i > 0 && <div style={{ width: 34, height: 2, borderRadius: tokens.radius.full, background: tokens.color.neutral[200] }} />}
              <div style={{ display: "flex", alignItems: "center", gap: tokens.space[2] }}>
                <div style={{
                  width: 24, height: 24, borderRadius: tokens.radius.full,
                  background: s.n <= stepIndex ? tokens.color.brand[500] : tokens.color.neutral[100],
                  color: s.n <= stepIndex ? tokens.color.neutral[0] : tokens.color.neutral[500],
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.bold,
                }}>
                  {s.n < stepIndex ? <I.check size={13} /> : s.n}
                </div>
                <span style={{ fontSize: tokens.font.size.sm, fontWeight: s.n === stepIndex ? tokens.font.weight.semibold : tokens.font.weight.medium, color: s.n === stepIndex ? tokens.color.neutral[900] : tokens.color.neutral[500] }}>{s.label}</span>
              </div>
            </div>
          ))}
        </div>

        {stepCta
          ? <Button variant="primary" size="md" rightIcon={<I.chevron size={15} />} onClick={stepCta.onClick}>{stepCta.label}</Button>
          : <NaviButton onClick={onClose} icon={<I.close size={18} />} square />}
      </div>

      {/* ── Contenu ── */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {step === "choice" && <ChoiceStep meta={meta} onChoose={() => setStep("saisie")} onStartReal={onStartReal} />}
        {step === "saisie" && <SaisieStep project={project} meta={meta} />}
        {step === "redaction" && <RedactionStep meta={meta} project={project} />}
        {step === "diffusion" && <StepPlaceholder n={3} label="Diffusion" />}
      </div>
    </div>
  );
}

function NaviButton({ onClick, icon, label, square }) {
  const [hover, setHover] = useState(false);
  return (
    <button type="button" onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex", alignItems: "center", gap: tokens.space[2],
        height: 34, width: square ? 34 : undefined, padding: square ? 0 : `0 ${tokens.space[2]} 0 ${tokens.space[1]}`,
        justifyContent: "center", borderRadius: tokens.radius.md, border: "none", cursor: "pointer", fontFamily: "inherit",
        background: hover ? tokens.color.neutral[100] : "transparent", color: tokens.color.neutral[700],
        fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.medium, transition: tokens.transition.base,
      }}>
      {icon}
      {label && <span>{label}</span>}
    </button>
  );
}

// ── Écran Choix de la méthode ──
function ChoiceStep({ meta, onChoose, onStartReal }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: `${tokens.space[10]} ${tokens.space[10]}`, minHeight: "100%", boxSizing: "border-box" }}>
      <div style={{ width: "100%", maxWidth: 760 }}>
        <div style={{ textAlign: "center", marginBottom: tokens.space[8] }}>
          {meta.meetingLabel && (
            <div style={{ fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.semibold, letterSpacing: "0.06em", textTransform: "uppercase", color: tokens.color.brand[600], marginBottom: tokens.space[2] }}>
              Réunion du {meta.meetingLabel}
            </div>
          )}
          <h1 style={{ margin: `0 0 ${tokens.space[2]}`, fontSize: tokens.font.size["3xl"], fontWeight: tokens.font.weight.bold, letterSpacing: "-0.6px", lineHeight: 1.1 }}>
            Comment veux-tu composer le PV n°{meta.num} ?
          </h1>
          <div style={{ fontSize: tokens.font.size.md, color: tokens.color.neutral[700], lineHeight: tokens.font.leading.normal }}>
            {meta.openReserves > 0
              ? <>Les <b style={{ color: tokens.color.brand[600], fontWeight: tokens.font.weight.semibold }}>{meta.openReserves} réserves non levées</b> du PV précédent sont déjà reportées. Choisis comment ajouter le reste.</>
              : <>Choisis comment saisir tes observations.</>}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: tokens.space[4], marginBottom: tokens.space[5] }}>
          <ChoiceCard
            icon={<I.pen size={26} />}
            title="Rédaction manuelle"
            desc="Saisis tes remarques poste par poste, au clavier. Idéal au bureau, au calme, avec le dernier PV sous les yeux."
            cta="Ouvrir la saisie"
            onClick={onChoose}
          />
          <ChoiceCard
            emphasized
            badge="✦ Assisté par l'IA"
            icon={<I.mic size={26} />}
            title="Enregistrement audio"
            desc="Dicte tes observations ou dépose l'enregistrement de la réunion. L'IA transcrit, découpe en remarques atomiques et les répartit par poste."
            cta="Démarrer l'enregistrement"
            onClick={onChoose}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: tokens.space[4] }}>
          <NaviButton onClick={onChoose} icon={<I.upload size={15} />} label="Importer des notes (.txt)" />
          <div style={{ width: 1, height: 18, background: tokens.color.neutral[200] }} />
          <NaviButton onClick={onChoose} icon={<I.redo size={15} />} label="Reprendre un brouillon" />
        </div>
      </div>
    </div>
  );
}

function ChoiceCard({ icon, title, desc, cta, onClick, emphasized, badge }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative", overflow: "hidden", cursor: "pointer",
        background: emphasized ? tokens.color.brand[50] : tokens.color.neutral[0],
        border: `${emphasized ? 1.5 : 1}px solid ${emphasized ? tokens.color.brand[200] : (hover ? tokens.color.brand[200] : tokens.color.neutral[200])}`,
        borderRadius: tokens.radius.xl, padding: tokens.space[6],
        display: "flex", flexDirection: "column",
        boxShadow: hover ? tokens.shadow.md : "none", transition: tokens.transition.base,
      }}
    >
      {badge && (
        <div style={{ position: "absolute", top: 0, right: 0, background: tokens.color.brand[500], color: tokens.color.neutral[0], fontSize: 10, fontWeight: tokens.font.weight.bold, letterSpacing: "0.04em", padding: "5px 12px", borderBottomLeftRadius: 12, textTransform: "uppercase" }}>{badge}</div>
      )}
      <div style={{
        width: 52, height: 52, borderRadius: 14, marginBottom: tokens.space[4],
        background: emphasized ? tokens.color.brand[500] : tokens.color.neutral[100],
        color: emphasized ? tokens.color.neutral[0] : tokens.color.neutral[700],
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: emphasized ? tokens.shadow.priority : "none",
      }}>{icon}</div>
      <div style={{ fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.bold, letterSpacing: "-0.3px", marginBottom: tokens.space[2] }}>{title}</div>
      <div style={{ fontSize: tokens.font.size.base, color: emphasized ? "#8B5A3C" : tokens.color.neutral[700], lineHeight: tokens.font.leading.normal, flex: 1 }}>{desc}</div>
      <div style={{ display: "flex", alignItems: "center", gap: tokens.space[1], marginTop: tokens.space[4], fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.semibold, color: emphasized ? tokens.color.brand[600] : tokens.color.neutral[700] }}>
        {cta} <I.chevron size={15} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Étape 1 — Saisie des remarques (contexte + postes + remarques)
// ─────────────────────────────────────────────────────────────

// Données de démo de la saisie (postes + remarques du poste actif).
const SAISIE_POSTES = [
  { code: "01", name: "Situation générale", count: 2 },
  { code: "02", name: "Gros œuvre", count: 1 },
  { code: "03", name: "Électricité", count: 4, contractor: "Elek & Co" },
  { code: "04", name: "HVAC", count: 2, alert: true },
  { code: "05", name: "Menuiseries ext.", count: 3 },
  { code: "06", name: "Finitions", count: 0 },
];
const SAISIE_REMARKS = {
  "03": [
    { id: 1, text: "Reprendre le tirage des câbles dans la gaine technique du 2e étage — section sous-dimensionnée constatée.", status: "reported", recipient: { ini: "EG", name: "Entreprise Genin" }, photos: 2 },
    { id: 2, text: "Tableau électrique principal non conforme : absence de différentiel 30 mA sur le circuit prises du rez. À corriger avant mise sous tension.", status: "urgent", recipient: { ini: "EC", name: "Elek & Co" }, canConvert: true },
    { id: 3, text: "Appareillage du hall principal validé sur site — pose conforme au plan d'exécution rév. C.", status: "observation" },
  ],
};
const REMARK_STATUS = {
  reported:    { label: "↩ Reporté", bg: tokens.color.brand[50], fg: tokens.color.brand[600], border: tokens.color.brand[100] },
  urgent:      { label: "Urgent", bg: tokens.color.semantic.danger.bg, fg: tokens.color.semantic.danger.fg, border: tokens.color.semantic.danger.border },
  observation: { label: "Observation", bg: tokens.color.semantic.info.bg, fg: tokens.color.semantic.info.fg, border: tokens.color.semantic.info.border },
};

function SaisieStep({ project, meta }) {
  const [activePoste, setActivePoste] = useState("03");
  const [remarksByPoste, setRemarksByPoste] = useState(SAISIE_REMARKS);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState("write");
  const [status, setStatus] = useState("observation");

  const postes = SAISIE_POSTES;
  const poste = postes.find(p => p.code === activePoste) || postes[0];
  const remarks = remarksByPoste[activePoste] || [];
  const totalRemarks = postes.reduce((s, p) => s + p.count, 0);

  const addRemark = () => {
    if (!draft.trim()) return;
    setRemarksByPoste(prev => ({ ...prev, [activePoste]: [...(prev[activePoste] || []), { id: Date.now(), text: draft.trim(), status }] }));
    setDraft("");
  };

  return (
    <>
      {/* Bandeau de contexte : date, météo, présents */}
      <div style={{ height: 52, flexShrink: 0, background: tokens.color.neutral[0], borderBottom: `1px solid ${tokens.color.neutral[200]}`, display: "flex", alignItems: "center", padding: `0 ${tokens.space[5]}`, gap: tokens.space[3], overflowX: "auto" }}>
        <CtxItem icon={<I.cal size={15} />}>{meta.meetingLabel || "Réunion"} · 09:00</CtxItem>
        <Divider />
        <CtxItem icon={<I.cloud size={15} />} muted>12°C · couvert</CtxItem>
        <Divider />
        <span style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[500] }}>Présents</span>
        <PresentChip ini="GD" name="Gaëlle D." present />
        <PresentChip ini="MG" name="M. Genin" present />
        <PresentChip ini="PM" name="P. Mertens" />
        <button style={{ height: 28, padding: `0 ${tokens.space[2]}`, background: tokens.color.neutral[0], border: `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.full, fontFamily: "inherit", fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.medium, color: tokens.color.neutral[500], cursor: "pointer", whiteSpace: "nowrap" }}>+ Gérer</button>
      </div>

      {/* Deux panneaux : rail de postes + remarques */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Rail des postes */}
        <div style={{ width: 256, flexShrink: 0, background: tokens.color.neutral[0], borderRight: `1px solid ${tokens.color.neutral[200]}`, display: "flex", flexDirection: "column" }}>
          <div style={{ height: 42, display: "flex", alignItems: "center", padding: `0 ${tokens.space[4]}`, borderBottom: `1px solid ${tokens.color.neutral[200]}` }}>
            <span style={{ fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[500], textTransform: "uppercase", letterSpacing: "0.05em" }}>Postes</span>
            <span style={{ marginLeft: tokens.space[2], fontSize: tokens.font.size.xs, color: tokens.color.neutral[300] }}>{postes.length}</span>
            <button style={{ marginLeft: "auto", width: 26, height: 26, borderRadius: tokens.radius.sm, border: "none", background: "transparent", color: tokens.color.neutral[500], cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><I.plus size={15} /></button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: tokens.space[2] }}>
            {postes.map(p => {
              const active = p.code === activePoste;
              return (
                <button key={p.code} onClick={() => setActivePoste(p.code)} style={{
                  width: "100%", display: "flex", alignItems: "center", gap: tokens.space[2], padding: `${tokens.space[2]} ${tokens.space[2]}`,
                  borderRadius: tokens.radius.md, cursor: "pointer", fontFamily: "inherit", textAlign: "left", marginBottom: 2,
                  background: active ? tokens.color.brand[50] : "transparent",
                  border: "none", borderLeft: active ? `3px solid ${tokens.color.brand[500]}` : "3px solid transparent",
                }}>
                  <span style={{ fontSize: 11, fontFamily: "ui-monospace, monospace", color: active ? tokens.color.brand[600] : tokens.color.neutral[300] }}>{p.code}</span>
                  <span style={{ flex: 1, fontSize: tokens.font.size.sm, color: active ? tokens.color.neutral[900] : tokens.color.neutral[700], fontWeight: active ? tokens.font.weight.semibold : tokens.font.weight.regular }}>{p.name}</span>
                  {p.alert && <span style={{ width: 6, height: 6, borderRadius: tokens.radius.full, background: tokens.color.semantic.danger.fg }} />}
                  <span style={{ fontSize: tokens.font.size.xs, color: active ? tokens.color.brand[600] : tokens.color.neutral[500], fontWeight: active ? tokens.font.weight.semibold : tokens.font.weight.regular }}>{p.count}</span>
                </button>
              );
            })}
          </div>
          <div style={{ padding: tokens.space[3], borderTop: `1px solid ${tokens.color.neutral[200]}`, fontSize: tokens.font.size.xs, color: tokens.color.neutral[500], textAlign: "center" }}>
            {totalRemarks} remarques · {meta.openReserves} reportées
          </div>
        </div>

        {/* Panneau des remarques */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {meta.openReserves > 0 && (
            <div style={{ margin: `${tokens.space[4]} ${tokens.space[6]} 0`, background: tokens.color.brand[50], border: `1px solid ${tokens.color.brand[100]}`, borderRadius: tokens.radius.lg, padding: `${tokens.space[3]} ${tokens.space[4]}`, display: "flex", alignItems: "center", gap: tokens.space[3] }}>
              <span style={{ color: tokens.color.brand[600], display: "inline-flex" }}><I.redo size={16} /></span>
              <span style={{ fontSize: tokens.font.size.sm, color: tokens.color.brand[700] }}><b>{meta.openReserves} remarques non levées</b> ont été reportées automatiquement du PV précédent.</span>
              <button style={{ marginLeft: "auto", height: 28, padding: `0 ${tokens.space[3]}`, background: tokens.color.neutral[0], border: `1px solid ${tokens.color.brand[100]}`, borderRadius: tokens.radius.md, fontFamily: "inherit", fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.medium, color: tokens.color.brand[600], cursor: "pointer" }}>Voir tout</button>
            </div>
          )}

          {/* En-tête du poste */}
          <div style={{ display: "flex", alignItems: "center", gap: tokens.space[2], padding: `${tokens.space[4]} ${tokens.space[6]} ${tokens.space[3]}` }}>
            <span style={{ fontSize: 11, fontFamily: "ui-monospace, monospace", color: tokens.color.neutral[300] }}>{poste.code}</span>
            <h2 style={{ margin: 0, fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.bold, color: tokens.color.neutral[900], letterSpacing: "-0.3px" }}>{poste.name}</h2>
            <span style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[500] }}>{remarks.length} remarque{remarks.length > 1 ? "s" : ""}</span>
            {poste.contractor && <span style={{ fontSize: tokens.font.size.xs, padding: "2px 9px", borderRadius: tokens.radius.full, background: tokens.color.neutral[100], color: tokens.color.neutral[700], border: `1px solid ${tokens.color.neutral[200]}`, fontWeight: tokens.font.weight.medium }}>{poste.contractor}</span>}
          </div>

          {/* Liste des remarques */}
          <div style={{ flex: 1, overflowY: "auto", padding: `0 ${tokens.space[6]}`, display: "flex", flexDirection: "column", gap: tokens.space[2] }}>
            {remarks.length === 0
              ? <div style={{ padding: tokens.space[8], textAlign: "center", color: tokens.color.neutral[500], fontSize: tokens.font.size.sm }}>Aucune remarque sur ce poste — ajoute-en une ci-dessous.</div>
              : remarks.map(r => <RemarkCard key={r.id} r={r} />)}
          </div>

          {/* Barre de capture */}
          <div style={{ flexShrink: 0, padding: `${tokens.space[3]} ${tokens.space[6]} ${tokens.space[4]}` }}>
            <div style={{ background: tokens.color.neutral[0], border: `1.5px solid ${tokens.color.brand[200]}`, borderRadius: tokens.radius.lg, padding: `${tokens.space[2]} ${tokens.space[2]} ${tokens.space[2]} ${tokens.space[3]}`, boxShadow: tokens.shadow.priority, display: "flex", alignItems: "center", gap: tokens.space[2] }}>
              <div style={{ display: "inline-flex", gap: 3, background: tokens.color.neutral[100], borderRadius: tokens.radius.md, padding: 3, flexShrink: 0 }}>
                {[{ id: "write", label: "Écrire" }, { id: "dictate", label: "Dicter" }].map(m => {
                  const a = m.id === mode;
                  return <button key={m.id} onClick={() => setMode(m.id)} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: tokens.radius.sm, border: "none", background: a ? tokens.color.neutral[0] : "transparent", boxShadow: a ? tokens.shadow.sm : "none", color: a ? tokens.color.neutral[900] : tokens.color.neutral[500], fontFamily: "inherit", fontSize: tokens.font.size.xs, fontWeight: a ? tokens.font.weight.semibold : tokens.font.weight.medium, cursor: "pointer" }}>{m.id === "dictate" && <I.mic size={12} />}{m.label}</button>;
                })}
              </div>
              <input
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addRemark(); }}
                placeholder={`Ajouter une remarque au poste ${poste.name}…`}
                style={{ flex: 1, minWidth: 0, height: 34, border: "none", outline: "none", background: "transparent", fontFamily: "inherit", fontSize: tokens.font.size.base, color: tokens.color.neutral[900] }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: tokens.space[1], flexShrink: 0 }}>
                {["observation", "urgent"].map(s => {
                  const a = s === status;
                  const sc = REMARK_STATUS[s];
                  return <button key={s} onClick={() => setStatus(s)} style={{ height: 30, padding: `0 ${tokens.space[2]}`, background: a ? sc.bg : tokens.color.neutral[0], border: `1px solid ${a ? sc.border : tokens.color.neutral[200]}`, borderRadius: tokens.radius.md, fontFamily: "inherit", fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.medium, color: a ? sc.fg : tokens.color.neutral[500], cursor: "pointer", textTransform: "capitalize" }}>{s === "observation" ? "Observation" : "Urgent"}</button>;
                })}
              </div>
              <Button variant="primary" size="md" onClick={addRemark} disabled={!draft.trim()}>Ajouter</Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function CtxItem({ icon, children, muted }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: tokens.space[1], fontSize: tokens.font.size.sm, color: muted ? tokens.color.neutral[500] : tokens.color.neutral[700], whiteSpace: "nowrap" }}>
      <span style={{ color: tokens.color.neutral[500], display: "inline-flex" }}>{icon}</span>{children}
    </div>
  );
}
function Divider() { return <div style={{ width: 1, height: 20, background: tokens.color.neutral[200], flexShrink: 0 }} />; }

function PresentChip({ ini, name, present }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: tokens.space[1], height: 28, padding: "0 10px 0 4px", borderRadius: tokens.radius.full, background: present ? tokens.color.semantic.success.bg : tokens.color.neutral[50], border: `1px solid ${present ? tokens.color.semantic.success.border : tokens.color.neutral[200]}`, whiteSpace: "nowrap" }}>
      <span style={{ width: 20, height: 20, borderRadius: tokens.radius.full, background: present ? "#DCFCE7" : tokens.color.neutral[100], color: present ? tokens.color.semantic.success.fg : tokens.color.neutral[500], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: tokens.font.weight.bold }}>{ini}</span>
      <span style={{ fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.medium, color: present ? tokens.color.semantic.success.fg : tokens.color.neutral[500], textDecoration: present ? "none" : "line-through" }}>{name}</span>
    </div>
  );
}

function RemarkCard({ r }) {
  const sc = REMARK_STATUS[r.status] || REMARK_STATUS.observation;
  const checked = r.status === "reported";
  return (
    <div style={{ background: tokens.color.neutral[0], border: `1px solid ${tokens.color.neutral[200]}`, borderLeft: r.status === "urgent" ? `3px solid ${tokens.color.semantic.danger.fg}` : `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.lg, padding: tokens.space[3], display: "flex", gap: tokens.space[3] }}>
      <span style={{ width: 20, height: 20, borderRadius: tokens.radius.full, border: `2px solid ${checked ? "#D97706" : tokens.color.neutral[300]}`, background: tokens.color.neutral[0], flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: tokens.font.size.base, color: tokens.color.neutral[900], lineHeight: 1.45, marginBottom: tokens.space[2] }}>{r.text}</div>
        <div style={{ display: "flex", alignItems: "center", gap: tokens.space[2], flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: tokens.radius.full, background: sc.bg, color: sc.fg, border: `1px solid ${sc.border}`, fontWeight: r.status === "urgent" ? tokens.font.weight.semibold : tokens.font.weight.medium }}>{r.status === "reported" ? "↩ Reporté" : sc.label}</span>
          {r.recipient && (
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, padding: "2px 8px", borderRadius: tokens.radius.full, background: tokens.color.neutral[100], color: tokens.color.neutral[700], border: `1px solid ${tokens.color.neutral[200]}` }}>
              <span style={{ width: 14, height: 14, borderRadius: tokens.radius.full, background: "#DCFCE7", color: tokens.color.semantic.success.fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: tokens.font.weight.bold }}>{r.recipient.ini}</span>
              {r.recipient.name}
            </span>
          )}
          {r.photos > 0 && <span style={{ marginLeft: "auto", fontSize: 11, color: tokens.color.neutral[500], display: "flex", alignItems: "center", gap: 4 }}><I.image size={13} />{r.photos} photo{r.photos > 1 ? "s" : ""}</span>}
          {r.canConvert && <button style={{ marginLeft: "auto", height: 26, padding: `0 ${tokens.space[2]}`, background: tokens.color.neutral[0], border: `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.sm, fontFamily: "inherit", fontSize: 11, fontWeight: tokens.font.weight.medium, color: tokens.color.neutral[500], cursor: "pointer" }}>→ Convertir en réserve</button>}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Étape 2 — Rédaction (PV éditable + remarques source, traçabilité)
// ─────────────────────────────────────────────────────────────

const REDACTION_DOC = {
  meta: "Réunion du 30 juin 2026 · 09:00 · sur site — Présents : G. Dupont (architecte), M. Genin (entreprise). Excusé : P. Mertens (MO). Météo : 12°C, couvert.",
  sections: [
    { code: "00", title: "Évolutions depuis le PV précédent", brand: true, paras: [{ text: "La dalle du R+1 a été réceptionnée ; le démarrage des cloisons est confirmé. Trois réserves du précédent procès-verbal ont été levées." }] },
    { code: "03", title: "Électricité", paras: [
      { num: "03.1", text: "Le tirage des câbles dans la gaine technique du 2e étage doit être repris : la section constatée est sous-dimensionnée au regard du cahier des charges." },
      { num: "03.2", text: "Le tableau électrique principal ne comporte pas de dispositif différentiel 30 mA sur le circuit prises du rez-de-chaussée. ", highlight: "Correction requise avant toute mise sous tension." },
      { num: "03.3", text: "L'appareillage du hall principal a été validé sur site, conforme au plan d'exécution révision C." },
    ] },
    { code: "04", title: "HVAC", paras: [
      { num: "04.1", text: "La centrale de traitement d'air est en cours d'installation ; la mise en service reste conditionnée à l'achèvement du lot électrique.", cursor: true },
    ] },
  ],
};
const REDACTION_SOURCES = [
  { poste: "03 · ÉLECTRICITÉ", items: [
    { text: "Reprendre le tirage des câbles — gaine 2e sous-dimensionnée.", ref: "03.1" },
    { text: "Tableau principal sans différentiel prises rez.", ref: "03.2", urgent: true },
    { text: "Appareillage hall conforme plan rév. C.", ref: "03.3" },
  ] },
  { poste: "04 · HVAC", items: [
    { text: "Centrale de traitement d'air en cours d'installation.", ref: "04.1" },
  ] },
];

function SegToggle({ value, onChange, options, label }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: tokens.space[2] }}>
      {label && <span style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[500] }}>{label}</span>}
      <div style={{ display: "inline-flex", gap: 3, background: tokens.color.neutral[100], borderRadius: tokens.radius.md, padding: 3 }}>
        {options.map(o => {
          const a = o.id === value;
          return <button key={o.id} onClick={() => onChange(o.id)} style={{ padding: "5px 12px", borderRadius: tokens.radius.sm, border: "none", background: a ? tokens.color.neutral[0] : "transparent", boxShadow: a ? tokens.shadow.sm : "none", color: a ? tokens.color.neutral[900] : tokens.color.neutral[500], fontFamily: "inherit", fontSize: tokens.font.size.xs, fontWeight: a ? tokens.font.weight.semibold : tokens.font.weight.medium, cursor: "pointer" }}>{o.label}</button>;
        })}
      </div>
    </div>
  );
}

function DropBtn({ children, icon }) {
  const [hover, setHover] = useState(false);
  return (
    <button onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: "inline-flex", alignItems: "center", gap: tokens.space[2], height: 32, padding: `0 ${tokens.space[3]}`, background: hover ? tokens.color.neutral[50] : tokens.color.neutral[0], border: `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.md, fontFamily: "inherit", fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.medium, color: tokens.color.neutral[700], cursor: "pointer", transition: tokens.transition.base }}>
      {icon}{children}{!icon && <I.chevDown size={13} />}
    </button>
  );
}

function RedactionStep({ meta, project }) {
  const [style, setStyle] = useState("standard");
  return (
    <>
      {/* Toolbar options */}
      <div style={{ height: 50, flexShrink: 0, background: tokens.color.neutral[0], borderBottom: `1px solid ${tokens.color.neutral[200]}`, display: "flex", alignItems: "center", padding: `0 ${tokens.space[6]}`, gap: tokens.space[3], overflowX: "auto" }}>
        <SegToggle label="Style" value={style} onChange={setStyle} options={[{ id: "standard", label: "Standard" }, { id: "detailed", label: "Détaillé" }, { id: "concise", label: "Concis" }]} />
        <Divider />
        <DropBtn>Numérotation : par poste <I.chevDown size={13} /></DropBtn>
        <DropBtn>Destinataire : tous <I.chevDown size={13} /></DropBtn>
        <div style={{ marginLeft: "auto" }}><DropBtn icon={<I.redo size={13} />}>Régénérer</DropBtn></div>
      </div>

      {/* Deux panneaux */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Doc PV éditable */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ margin: `${tokens.space[4]} ${tokens.space[6]} 0`, background: tokens.color.brand[50], border: `1px solid ${tokens.color.brand[100]}`, borderRadius: tokens.radius.lg, padding: `${tokens.space[2]} ${tokens.space[4]}`, display: "flex", alignItems: "center", gap: tokens.space[2] }}>
            <span style={{ color: tokens.color.brand[600], display: "inline-flex" }}><I.spark size={16} /></span>
            <span style={{ fontSize: tokens.font.size.sm, color: tokens.color.brand[700] }}>Rédigé par l'IA à partir de <b>{meta.totalRemarks || 12} remarques</b>. Le texte est <b>éditable</b> — clique pour ajuster.</span>
            <span style={{ marginLeft: "auto", fontSize: tokens.font.size.xs, color: "#16A34A", display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 6, height: 6, borderRadius: tokens.radius.full, background: "#16A34A" }} />Enregistré</span>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: `${tokens.space[4]} ${tokens.space[6]}` }}>
            <div style={{ background: tokens.color.neutral[0], border: `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.xl, padding: `${tokens.space[8]} ${tokens.space[10]}`, maxWidth: 720, margin: "0 auto" }}>
              <div style={{ fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.semibold, letterSpacing: "0.08em", textTransform: "uppercase", color: tokens.color.neutral[500], marginBottom: tokens.space[1] }}>Procès-verbal de chantier n°{meta.num}</div>
              <div style={{ fontSize: tokens.font.size.xl, fontWeight: tokens.font.weight.bold, color: tokens.color.neutral[900], letterSpacing: "-0.3px", marginBottom: 3 }}>{project?.name}</div>
              <div style={{ fontSize: tokens.font.size.sm, color: tokens.color.neutral[700], marginBottom: tokens.space[5], paddingBottom: tokens.space[4], borderBottom: `1px solid ${tokens.color.neutral[200]}`, lineHeight: tokens.font.leading.normal }}>{REDACTION_DOC.meta}</div>
              {REDACTION_DOC.sections.map((s, i) => (
                <div key={i}>
                  <div style={{ fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.bold, color: s.brand ? tokens.color.brand[600] : tokens.color.neutral[900], marginBottom: tokens.space[2] }}>{s.code}. {s.title}</div>
                  {s.paras.map((p, j) => (
                    <p key={j} style={{ margin: `0 0 ${j === s.paras.length - 1 ? tokens.space[5] : tokens.space[2]}`, fontSize: tokens.font.size.base, lineHeight: 1.65, color: tokens.color.neutral[700] }}>
                      {p.num && <b style={{ color: tokens.color.neutral[900] }}>{p.num}</b>} {p.text}
                      {p.highlight && <span style={{ background: tokens.color.semantic.danger.bg, color: tokens.color.semantic.danger.fg, borderRadius: 3, padding: "0 3px", fontWeight: tokens.font.weight.medium }}>{p.highlight}</span>}
                      {p.cursor && <span style={{ display: "inline-block", width: 2, height: 15, background: tokens.color.brand[500], verticalAlign: "text-bottom", marginLeft: 1 }} />}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Remarques source */}
        <div style={{ width: 340, flexShrink: 0, display: "flex", flexDirection: "column", background: tokens.color.neutral[0], borderLeft: `1px solid ${tokens.color.neutral[200]}` }}>
          <div style={{ height: 42, display: "flex", alignItems: "center", gap: tokens.space[2], padding: `0 ${tokens.space[4]}`, borderBottom: `1px solid ${tokens.color.neutral[200]}` }}>
            <span style={{ color: tokens.color.neutral[500], display: "inline-flex" }}><I.clipboard size={14} /></span>
            <span style={{ fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[500], textTransform: "uppercase", letterSpacing: "0.05em" }}>Remarques source</span>
            <span style={{ marginLeft: "auto", fontSize: tokens.font.size.xs, color: tokens.color.neutral[300] }}>{meta.totalRemarks || 12}</span>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: tokens.space[3], display: "flex", flexDirection: "column", gap: tokens.space[2] }}>
            {REDACTION_SOURCES.map((grp, gi) => (
              <div key={gi}>
                <div style={{ fontSize: 10, fontFamily: "ui-monospace, monospace", color: tokens.color.neutral[500], margin: `${gi > 0 ? tokens.space[2] : 0} 0 ${tokens.space[2]}` }}>{grp.poste}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: tokens.space[2] }}>
                  {grp.items.map((it, ii) => (
                    <div key={ii} style={{ background: tokens.color.neutral[50], border: `1px solid ${tokens.color.neutral[200]}`, borderLeft: it.urgent ? `3px solid ${tokens.color.semantic.danger.fg}` : `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.md, padding: `${tokens.space[2]} ${tokens.space[3]}`, fontSize: tokens.font.size.xs, color: tokens.color.neutral[700], lineHeight: 1.45 }}>
                      {it.text} <span style={{ color: tokens.color.brand[600], fontWeight: tokens.font.weight.medium }}>→ {it.ref}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: `${tokens.space[3]} ${tokens.space[3]}`, borderTop: `1px solid ${tokens.color.neutral[200]}`, fontSize: tokens.font.size.xs, color: tokens.color.neutral[500], textAlign: "center", lineHeight: 1.4 }}>
            Chaque ligne du PV renvoie à sa remarque — la traçabilité reste visible.
          </div>
        </div>
      </div>
    </>
  );
}

// ── Placeholder d'étape (Diffusion) — à porter ──
function StepPlaceholder({ n, label }) {
  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: tokens.space[10], width: "100%", boxSizing: "border-box" }}>
      <div style={{ padding: tokens.space[12], background: tokens.color.neutral[0], border: `1px dashed ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.xl, textAlign: "center" }}>
        <div style={{ fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.semibold, color: tokens.color.brand[600], textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: tokens.space[2] }}>Étape {n}</div>
        <div style={{ fontSize: tokens.font.size.xl, fontWeight: tokens.font.weight.bold, color: tokens.color.neutral[900], marginBottom: tokens.space[2] }}>{label}</div>
        <div style={{ fontSize: tokens.font.size.sm, color: tokens.color.neutral[500] }}>Cet écran arrive dans la prochaine itération — utilise le bouton en haut à droite pour avancer.</div>
      </div>
    </div>
  );
}

export default PvComposer;
