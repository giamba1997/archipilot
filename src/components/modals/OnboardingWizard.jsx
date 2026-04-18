import { useState, useEffect } from "react";
import { AC, TX, TX2, TX3, SB, SBB, WH, BG, GR, RD, BL, OR } from "../../constants/tokens";
import { STRUCTURE_TYPES } from "../../constants/config";

// ── Icon paths ──
const PATHS = {
  check: "M20 6L9 17l-5-5",
  arrowr: "M5 12h14 M12 5l7 7-7 7",
  arrowl: "M19 12H5 M12 19l-7-7 7-7",
  building: "M3 21h18 M5 21V7l8-4v18 M19 21V11l-6-4",
  users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  hardhat: "M3 18h18 M4 18a8 8 0 0 1 16 0 M8 18V9 M16 18V9 M10 9V6h4v3",
  briefcase: "M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2",
  home: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10",
  calendar: "M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z M16 2v4 M8 2v4 M3 10h18",
  mappin: "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12",
  sparkle: "M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z",
  dashboard: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  gantt: "M3 5h4v3H3z M3 10h8v3H3z M3 15h6v3H3z M10 6h11 M10 11h7 M10 16h9",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6",
};

function Icon({ n, s = 16, c = TX2, sw = 1.7 }) {
  const d = PATHS[n] || "";
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      {d.split(" M").map((seg, i) => <path key={i} d={i === 0 ? seg : "M" + seg} />)}
    </svg>
  );
}

// ── Logo mark ──
function LogoMark({ size = 36 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: 10, background: AC, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 20l9-16 9 16" /><path d="M7 20l5-9 5 9" />
      </svg>
    </div>
  );
}

// ── Roles ──
const ROLES = [
  { id: "architecte", label: "Architecte", desc: "Je conçois et coordonne des projets", icon: "building" },
  { id: "conducteur", label: "Conducteur de travaux", desc: "Je pilote l'exécution sur chantier", icon: "hardhat" },
  { id: "maitre_ouvrage", label: "Maître d'ouvrage", desc: "Je suis le projet en tant que client", icon: "home" },
  { id: "entrepreneur", label: "Entrepreneur", desc: "Je réalise les travaux", icon: "briefcase" },
];

// ── Backdrop with dashboard preview ──
function Backdrop({ spotlight }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: BG, overflow: "hidden" }}>
      {/* Sidebar */}
      <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 220, background: WH, borderRight: `1px solid ${SBB}`, padding: "18px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <LogoMark size={28} />
          <div style={{ fontSize: 14, fontWeight: 800, color: TX, letterSpacing: "-0.3px" }}>ArchiPilot</div>
        </div>
        {[
          { n: "dashboard", l: "Tableau de bord", act: true },
          { n: "building", l: "Projets" }, { n: "calendar", l: "Planning" },
          { n: "file", l: "Documents" }, { n: "users", l: "Équipe" },
        ].map((it, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, background: it.act ? `${AC}18` : "transparent", color: it.act ? AC : TX2, marginBottom: 2 }}>
            <Icon n={it.n} s={14} c={it.act ? AC : TX2} />
            <span style={{ fontSize: 12, fontWeight: it.act ? 600 : 500 }}>{it.l}</span>
          </div>
        ))}
      </div>
      {/* Main area */}
      <div style={{ position: "absolute", top: 0, left: 220, right: 0, bottom: 0, padding: "24px 32px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: AC, textTransform: "uppercase", letterSpacing: "0.12em" }}>Portfolio</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: TX, letterSpacing: "-0.7px", marginTop: 4 }}>Tableau de bord</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginTop: 20 }}>
          {[
            { l: "Projets actifs", v: "6", c: TX },
            { l: "PV à finaliser", v: "3", c: AC },
            { l: "Actions urgentes", v: "6", c: RD },
            { l: "Lots à risque", v: "3", c: OR },
          ].map((k, i) => (
            <div key={i} style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: TX3, textTransform: "uppercase", letterSpacing: "0.08em" }}>{k.l}</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: k.c, letterSpacing: "-1px", marginTop: 6, lineHeight: 1 }}>{k.v}</div>
            </div>
          ))}
        </div>
        <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 12, marginTop: 14, padding: "16px 20px" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: TX }}>Santé des projets</div>
          {["Résidence Les Cèdres", "Clinique Sainte-Marie — Aile B", "Bureaux Helios", "Villa Marquise"].map((n, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: i > 0 ? `1px solid ${SB}` : "none" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: i < 2 ? RD : i === 2 ? OR : GR }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: TX, flex: 1 }}>{n}</span>
              <div style={{ width: 120, height: 4, background: SB, borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${[82, 44, 64, 38][i]}%`, height: "100%", background: AC }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Scrim */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(31,41,55,0.72)", backdropFilter: "blur(2px)" }} />
      {/* Spotlight */}
      {spotlight && (
        <div style={{ position: "absolute", ...spotlight, borderRadius: 14, boxShadow: `0 0 0 9999px rgba(31,41,55,0.72), 0 0 0 3px ${AC}`, pointerEvents: "none", transition: "all .4s cubic-bezier(.5,.1,.25,1)" }} />
      )}
    </div>
  );
}

// ── Field ──
function OField({ label, value, onChange, placeholder, type = "text", half, required, icon }) {
  return (
    <div style={{ flex: half ? 1 : undefined, marginBottom: 14 }}>
      {label && <div style={{ fontSize: 11, fontWeight: 600, color: TX2, marginBottom: 6, letterSpacing: "0.01em" }}>{label}{required && <span style={{ color: RD, marginLeft: 3 }}>*</span>}</div>}
      <div style={{ position: "relative" }}>
        {icon && <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}><Icon n={icon} s={14} c={TX3} /></div>}
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          style={{ width: "100%", padding: `11px 14px 11px ${icon ? 36 : 14}px`, border: `1px solid ${SBB}`, borderRadius: 9, fontSize: 13.5, background: WH, color: TX, outline: "none", transition: "all .15s", boxSizing: "border-box", fontFamily: "inherit" }}
          onFocus={e => { e.target.style.borderColor = AC; e.target.style.boxShadow = `0 0 0 3px ${AC}20`; }}
          onBlur={e => { e.target.style.borderColor = SBB; e.target.style.boxShadow = "none"; }}
        />
      </div>
    </div>
  );
}

// ── Step Card ──
function StepCard({ children, width = 560 }) {
  return (
    <div className="step-enter" style={{ width: "100%", maxWidth: width, background: WH, borderRadius: 20, padding: "36px 40px", boxShadow: "0 20px 60px rgba(31,41,55,0.25), 0 2px 8px rgba(0,0,0,0.08)" }}>
      {children}
    </div>
  );
}

function StepTitle({ eyebrow, title, subtitle }) {
  return (
    <div style={{ marginBottom: 24 }}>
      {eyebrow && <div style={{ fontSize: 10, fontWeight: 700, color: AC, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8 }}>{eyebrow}</div>}
      <div style={{ fontSize: 26, fontWeight: 800, color: TX, letterSpacing: "-0.7px", lineHeight: 1.15 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 14, color: TX2, marginTop: 8, lineHeight: 1.5 }}>{subtitle}</div>}
    </div>
  );
}

// ── Step 1: Welcome + Role ──
function Step1({ data, set }) {
  return (
    <StepCard>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <LogoMark size={44} />
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: TX3, textTransform: "uppercase", letterSpacing: "0.1em" }}>Bienvenue sur</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: TX, letterSpacing: "-0.4px" }}>ArchiPilot</div>
        </div>
      </div>
      <StepTitle title="Votre chantier, sous contrôle." subtitle="Prenons 2 minutes pour personnaliser votre espace. On commence par votre métier." />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
        {ROLES.map(r => {
          const sel = data.role === r.id;
          return (
            <button key={r.id} onClick={() => set({ ...data, role: r.id, structureType: r.id })} style={{ textAlign: "left", padding: "16px 16px", border: `1.5px solid ${sel ? AC : SBB}`, background: sel ? `${AC}14` : WH, borderRadius: 12, cursor: "pointer", transition: "all .15s", display: "flex", gap: 12, alignItems: "flex-start", fontFamily: "inherit" }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: sel ? AC : SB, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .15s" }}>
                <Icon n={r.icon} s={18} c={sel ? WH : TX2} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: sel ? AC : TX }}>{r.label}</div>
                <div style={{ fontSize: 11.5, color: TX2, marginTop: 2, lineHeight: 1.35 }}>{r.desc}</div>
              </div>
              {sel && <div style={{ width: 20, height: 20, borderRadius: "50%", background: AC, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon n="check" s={12} c={WH} sw={3} /></div>}
            </button>
          );
        })}
      </div>
    </StepCard>
  );
}

// ── Step 2: Structure ──
function Step2({ data, set }) {
  return (
    <StepCard>
      <StepTitle eyebrow="Étape 2 · Votre structure" title="Parlez-nous de votre agence." subtitle="Ces infos apparaîtront sur vos PV et documents générés." />
      <OField label="Nom de l'agence" value={data.agency || ""} onChange={v => set({ ...data, agency: v })} placeholder="Atelier Moreau Architecture" icon="building" required />
      <OField label="Votre nom" value={data.name || ""} onChange={v => set({ ...data, name: v })} placeholder="Jean Dupont" icon="user" required />
      <OField label="Adresse du siège" value={data.address || ""} onChange={v => set({ ...data, address: v })} placeholder="Rue de la Régence 42, 1000 Bruxelles" icon="mappin" />
    </StepCard>
  );
}

// ── Step 3: First Project ──
function Step3({ data, set }) {
  return (
    <StepCard width={640}>
      <StepTitle eyebrow="Étape 3 · Premier projet" title="Créons votre premier chantier." subtitle="Vous pourrez ajuster ces informations à tout moment." />
      <OField label="Nom du projet" value={data.pName || ""} onChange={v => set({ ...data, pName: v })} placeholder="Résidence Les Cèdres" icon="building" required />
      <div style={{ display: "flex", gap: 12 }}>
        <OField half label="Maître d'ouvrage (client)" value={data.pClient || ""} onChange={v => set({ ...data, pClient: v })} placeholder="SCI Belvédère" icon="user" />
        <OField half label="Entreprise générale" value={data.pContractor || ""} onChange={v => set({ ...data, pContractor: v })} placeholder="Entr. Lemaire SA" icon="users" />
      </div>
      <OField label="Ville / Localisation" value={data.pCity || ""} onChange={v => set({ ...data, pCity: v })} placeholder="Uccle, Bruxelles" icon="mappin" />
      <div style={{ display: "flex", gap: 12 }}>
        <OField half type="date" label="Date de début" value={data.pStart || ""} onChange={v => set({ ...data, pStart: v })} />
        <OField half type="date" label="Livraison prévue" value={data.pEnd || ""} onChange={v => set({ ...data, pEnd: v })} />
      </div>
    </StepCard>
  );
}

// ── Step 4: Tour ──
function Step4() {
  return (
    <div style={{ position: "absolute", bottom: 100, right: 60, maxWidth: 360, background: WH, borderRadius: 14, padding: "20px 22px", boxShadow: "0 20px 60px rgba(31,41,55,0.3)", animation: "fadeIn .4s ease both" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ width: 26, height: 26, borderRadius: "50%", background: AC, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon n="sparkle" s={14} c={WH} />
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, color: AC, textTransform: "uppercase", letterSpacing: "0.1em" }}>Étape 4 · Découvrez</div>
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: TX, letterSpacing: "-0.4px", lineHeight: 1.25 }}>Voici votre tableau de bord.</div>
      <div style={{ fontSize: 13, color: TX2, marginTop: 8, lineHeight: 1.5 }}>Retrouvez d'un coup d'œil la santé de tous vos chantiers, triés par niveau de risque. Les alertes critiques remontent en haut automatiquement.</div>
      <div style={{ display: "flex", gap: 14, marginTop: 14, paddingTop: 14, borderTop: `1px solid ${SB}` }}>
        {[
          { k: "KPI", v: "4 chiffres-clés" },
          { k: "Risque", v: "Tri auto" },
          { k: "Alertes", v: "Temps réel" },
        ].map((x, i) => (
          <div key={i}>
            <div style={{ fontSize: 9, fontWeight: 700, color: TX3, textTransform: "uppercase", letterSpacing: "0.06em" }}>{x.k}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: TX, marginTop: 2 }}>{x.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Step 5: Done ──
function Step5({ data, onAction }) {
  return (
    <StepCard width={500}>
      <div style={{ width: 64, height: 64, borderRadius: 16, background: `${GR}18`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", position: "relative" }}>
        <Icon n="check" s={32} c={GR} sw={2.4} />
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: GR, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>Tout est prêt</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: TX, letterSpacing: "-0.7px" }}>Bienvenue{data.agency ? `, ${data.agency.split(" ")[0]}` : ""}.</div>
        <div style={{ fontSize: 14, color: TX2, marginTop: 10, lineHeight: 1.5 }}>
          Votre espace est configuré{data.pName ? <> et <strong style={{ color: TX, fontWeight: 600 }}>{data.pName}</strong> a été créé</> : ""}. Vous pouvez maintenant rédiger votre premier PV.
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 24 }}>
        {[
          { l: "Rédiger un PV", i: "sparkle", primary: true, action: "pv" },
          { l: "Voir le tableau de bord", i: "dashboard", action: "dashboard" },
          { l: "Inviter mon équipe", i: "users", action: "collab" },
          { l: "Importer un plan", i: "upload", action: "plan" },
        ].map((a, i) => (
          <button key={i} onClick={() => onAction(a.action)} style={{ padding: "12px 14px", border: `1px solid ${a.primary ? AC : SBB}`, borderRadius: 10, background: a.primary ? AC : WH, color: a.primary ? WH : TX, fontSize: 12.5, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, textAlign: "left", fontFamily: "inherit" }}>
            <Icon n={a.i} s={14} c={a.primary ? WH : TX2} />
            {a.l}
          </button>
        ))}
      </div>
    </StepCard>
  );
}

// ── Progress bar ──
function ProgressBar({ step, total }) {
  return (
    <div style={{ position: "absolute", top: 24, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.1)", backdropFilter: "blur(8px)", padding: "10px 16px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.15)", zIndex: 10 }}>
      <LogoMark size={22} />
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {Array.from({ length: total }).map((_, i) => {
          const done = i < step, active = i === step;
          return <div key={i} style={{ width: active ? 28 : 8, height: 8, borderRadius: 999, background: done ? AC : active ? AC : "rgba(255,255,255,0.3)", transition: "all .3s" }} />;
        })}
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.85)", letterSpacing: "0.02em" }}>
        {step + 1} / {total}
      </div>
    </div>
  );
}

// ── Footer ──
function Footer({ step, total, onBack, onNext, onSkip, nextLabel, canNext }) {
  const isLast = step === total - 1;
  return (
    <div style={{ position: "absolute", bottom: 24, left: 0, right: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 32px", zIndex: 10 }}>
      <button onClick={onSkip} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 500, cursor: "pointer", padding: "8px 12px", fontFamily: "inherit" }}>Passer l'introduction</button>
      <div style={{ display: "flex", gap: 8 }}>
        {step > 0 && !isLast && (
          <button onClick={onBack} style={{ padding: "10px 18px", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 9, background: "rgba(255,255,255,0.08)", color: "#fff", fontSize: 12.5, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, backdropFilter: "blur(8px)", fontFamily: "inherit" }}>
            <Icon n="arrowl" s={13} c="#fff" />Retour
          </button>
        )}
        {!isLast && (
          <button onClick={onNext} disabled={!canNext} style={{ padding: "10px 22px", border: "none", borderRadius: 9, background: canNext ? AC : "rgba(255,255,255,0.15)", color: "#fff", fontSize: 12.5, fontWeight: 600, cursor: canNext ? "pointer" : "not-allowed", display: "flex", alignItems: "center", gap: 6, boxShadow: canNext ? "0 4px 12px rgba(201,90,27,0.35)" : "none", opacity: canNext ? 1 : 0.6, fontFamily: "inherit" }}>
            {nextLabel || "Continuer"}<Icon n="arrowr" s={13} c="#fff" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Onboarding Wizard ──
export function OnboardingWizard({ profile, onUpdateProfile, onComplete, onCreateProject, onNavigate }) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState({
    role: profile.structureType || "",
    name: profile.name || "",
    agency: profile.structure || "",
    address: profile.address || "",
    structureType: profile.structureType || "architecte",
    pName: "",
    pClient: "",
    pContractor: "",
    pCity: "",
    pStart: "",
    pEnd: "",
  });

  const total = 5;

  const canNext = (
    step === 0 ? !!data.role :
    step === 1 ? !!(data.agency && data.agency.trim() && data.name && data.name.trim()) :
    step === 2 ? !!(data.pName && data.pName.trim()) :
    true
  );

  const nextLabels = ["Continuer", "Continuer", "Créer le projet", "Terminer la visite", "Accéder à mon espace"];

  const handleNext = () => {
    if (step === 1) {
      // Save profile
      onUpdateProfile({
        ...profile,
        name: data.name,
        structure: data.agency,
        structureType: data.structureType || data.role,
        address: data.address,
      });
    }
    if (step === 2 && data.pName && onCreateProject) {
      // Create first project
      onCreateProject({
        name: data.pName,
        client: data.pClient,
        contractor: data.pContractor,
        city: data.pCity,
        startDate: data.pStart,
        endDate: data.pEnd,
      });
    }
    setStep(s => Math.min(total - 1, s + 1));
  };

  const handleAction = (action) => {
    onComplete();
    if (onNavigate) onNavigate(action);
  };

  const spotlight = step === 3 ? { top: 200, left: 252, right: "60%", height: 240 } : null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10002, overflow: "hidden", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        .step-enter { animation: fadeUp .35s ease both; }
      `}</style>

      <Backdrop spotlight={spotlight} />
      <ProgressBar step={step} total={total} />

      {/* Content layer */}
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 40px 100px", pointerEvents: "none" }}>
        <div style={{ pointerEvents: "auto", width: "100%", display: "flex", justifyContent: step === 3 ? "flex-start" : "center", alignItems: "center" }}>
          {step === 0 && <Step1 data={data} set={setData} />}
          {step === 1 && <Step2 data={data} set={setData} />}
          {step === 2 && <Step3 data={data} set={setData} />}
          {step === 3 && <Step4 />}
          {step === 4 && <Step5 data={data} onAction={handleAction} />}
        </div>
      </div>

      <Footer
        step={step} total={total} canNext={canNext}
        nextLabel={nextLabels[step]}
        onBack={() => setStep(s => Math.max(0, s - 1))}
        onNext={handleNext}
        onSkip={onComplete}
      />
    </div>
  );
}
