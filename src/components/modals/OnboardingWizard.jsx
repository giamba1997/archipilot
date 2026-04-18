import { useState } from "react";
import { AC, ACL, TX, TX2, TX3, SB, SBB, WH, BG, GR, RD } from "../../constants/tokens";
import { STRUCTURE_TYPES } from "../../constants/config";
import { Ico } from "../ui";

// ── Roles ──
const ROLES = [
  { id: "architecte", label: "Architecte", desc: "Je conçois et coordonne des projets", icon: "building" },
  { id: "conducteur", label: "Conducteur de travaux", desc: "Je pilote l'exécution sur chantier", icon: "edit" },
  { id: "maitre_ouvrage", label: "Maître d'ouvrage", desc: "Je suis le projet en tant que client", icon: "user" },
  { id: "entrepreneur", label: "Entrepreneur", desc: "Je réalise les travaux", icon: "users" },
];

// ── Field ──
function OField({ label, value, onChange, placeholder, type = "text", half, required, iconName }) {
  return (
    <div style={{ flex: half ? 1 : undefined, marginBottom: 14 }}>
      {label && (
        <div style={{ fontSize: 11, fontWeight: 600, color: TX2, marginBottom: 6 }}>
          {label}{required && <span style={{ color: RD, marginLeft: 3 }}>*</span>}
        </div>
      )}
      <div style={{ position: "relative" }}>
        {iconName && <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}><Ico name={iconName} size={14} color={TX3} /></div>}
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          style={{ width: "100%", padding: `11px 14px 11px ${iconName ? 36 : 14}px`, border: `1px solid ${SBB}`, borderRadius: 9, fontSize: 13.5, background: WH, color: TX, outline: "none", transition: "all .15s", boxSizing: "border-box", fontFamily: "inherit" }}
          onFocus={e => { e.target.style.borderColor = AC; e.target.style.boxShadow = `0 0 0 3px ${ACL}`; }}
          onBlur={e => { e.target.style.borderColor = SBB; e.target.style.boxShadow = "none"; }}
        />
      </div>
    </div>
  );
}

// ── Step 1: Welcome + Role ──
function Step1({ data, set }) {
  return (
    <>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: AC, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8 }}>Bienvenue</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: TX, letterSpacing: "-0.5px", lineHeight: 1.15 }}>Votre chantier, sous contrôle.</div>
        <div style={{ fontSize: 14, color: TX2, marginTop: 8, lineHeight: 1.5 }}>Prenons 2 minutes pour personnaliser votre espace.<br />On commence par votre métier.</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {ROLES.map(r => {
          const sel = data.role === r.id;
          return (
            <button key={r.id} onClick={() => set({ ...data, role: r.id, structureType: r.id })}
              style={{ textAlign: "left", padding: 16, border: `1.5px solid ${sel ? AC : SBB}`, background: sel ? `${ACL}` : WH, borderRadius: 12, cursor: "pointer", transition: "all .15s", display: "flex", gap: 12, alignItems: "flex-start", fontFamily: "inherit" }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: sel ? AC : SB, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .15s" }}>
                <Ico name={r.icon} size={18} color={sel ? WH : TX2} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: sel ? AC : TX }}>{r.label}</div>
                <div style={{ fontSize: 11, color: TX2, marginTop: 2, lineHeight: 1.35 }}>{r.desc}</div>
              </div>
              {sel && <div style={{ width: 20, height: 20, borderRadius: "50%", background: AC, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Ico name="check" size={12} color={WH} /></div>}
            </button>
          );
        })}
      </div>
    </>
  );
}

// ── Step 2: Structure ──
function Step2({ data, set }) {
  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: AC, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8 }}>Étape 2 · Votre structure</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: TX, letterSpacing: "-0.5px", lineHeight: 1.15 }}>Parlez-nous de votre agence.</div>
        <div style={{ fontSize: 14, color: TX2, marginTop: 8, lineHeight: 1.5 }}>Ces infos apparaîtront sur vos PV et documents.</div>
      </div>
      <OField label="Votre nom" value={data.name || ""} onChange={v => set({ ...data, name: v })} placeholder="Jean Dupont" iconName="user" required />
      <OField label="Nom du bureau / entreprise" value={data.agency || ""} onChange={v => set({ ...data, agency: v })} placeholder="Atelier Moreau Architecture" iconName="building" required />
      <OField label="Adresse du siège" value={data.address || ""} onChange={v => set({ ...data, address: v })} placeholder="Rue de la Régence 42, 1000 Bruxelles" />
    </>
  );
}

// ── Step 3: First Project ──
function Step3({ data, set }) {
  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: AC, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8 }}>Étape 3 · Premier projet</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: TX, letterSpacing: "-0.5px", lineHeight: 1.15 }}>Créons votre premier chantier.</div>
        <div style={{ fontSize: 14, color: TX2, marginTop: 8, lineHeight: 1.5 }}>Vous pourrez ajuster ces informations à tout moment.</div>
      </div>
      <OField label="Nom du projet" value={data.pName || ""} onChange={v => set({ ...data, pName: v })} placeholder="Résidence Les Cèdres" iconName="building" required />
      <div style={{ display: "flex", gap: 12 }}>
        <OField half label="Maître d'ouvrage (client)" value={data.pClient || ""} onChange={v => set({ ...data, pClient: v })} placeholder="SCI Belvédère" iconName="user" />
        <OField half label="Entreprise générale" value={data.pContractor || ""} onChange={v => set({ ...data, pContractor: v })} placeholder="Entr. Lemaire SA" iconName="users" />
      </div>
      <OField label="Ville / Localisation" value={data.pCity || ""} onChange={v => set({ ...data, pCity: v })} placeholder="Uccle, Bruxelles" />
      <div style={{ display: "flex", gap: 12 }}>
        <OField half type="date" label="Date de début" value={data.pStart || ""} onChange={v => set({ ...data, pStart: v })} />
        <OField half type="date" label="Livraison prévue" value={data.pEnd || ""} onChange={v => set({ ...data, pEnd: v })} />
      </div>
    </>
  );
}

// ── Step 4: Done ──
function Step4({ data }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ width: 64, height: 64, borderRadius: 16, background: `${GR}18`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
        <Ico name="check" size={32} color={GR} />
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: GR, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>Tout est prêt</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: TX, letterSpacing: "-0.5px" }}>
        Bienvenue{data.name ? `, ${data.name.split(" ")[0]}` : ""}.
      </div>
      <div style={{ fontSize: 14, color: TX2, marginTop: 10, lineHeight: 1.6 }}>
        Votre espace est configuré{data.pName ? <> et <strong style={{ color: TX, fontWeight: 600 }}>{data.pName}</strong> a été créé</> : ""}.
        <br />Vous allez être redirigé vers votre projet.
      </div>
    </div>
  );
}

// ── Main Onboarding Wizard ──
export function OnboardingWizard({ profile, onUpdateProfile, onComplete, onCreateProject }) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState({
    role: profile.structureType || "",
    name: profile.name || "",
    agency: profile.structure || "",
    address: profile.address || "",
    structureType: profile.structureType || "architecte",
    pName: "", pClient: "", pContractor: "", pCity: "", pStart: "", pEnd: "",
  });

  const total = 4;

  const canNext = (
    step === 0 ? !!data.role :
    step === 1 ? !!(data.agency?.trim() && data.name?.trim()) :
    step === 2 ? !!(data.pName?.trim()) :
    true
  );

  const nextLabels = ["Continuer", "Continuer", "Créer le projet", "Accéder à mon projet"];

  const handleNext = () => {
    if (step === 1) {
      onUpdateProfile({
        ...profile,
        name: data.name,
        structure: data.agency,
        structureType: data.structureType || data.role,
        address: data.address,
      });
    }
    if (step === 2 && data.pName && onCreateProject) {
      onCreateProject({
        name: data.pName, client: data.pClient, contractor: data.pContractor,
        city: data.pCity, startDate: data.pStart, endDate: data.pEnd,
      });
    }
    if (step === total - 1) {
      onComplete();
      return;
    }
    setStep(s => s + 1);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10002, background: "rgba(31,41,55,0.60)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        @keyframes onbFadeUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
        .onb-card { animation: onbFadeUp .35s ease both; }
      `}</style>

      <div className="onb-card" style={{ width: "100%", maxWidth: step === 2 ? 600 : 520, background: WH, borderRadius: 20, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", overflow: "hidden" }}>
        {/* Header with logo + progress */}
        <div style={{ padding: "20px 28px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src="/icon-512.png" alt="ArchiPilot" style={{ width: 32, height: 32 }} />
            <span style={{ fontSize: 14, fontWeight: 800, color: "#4A3428", letterSpacing: "0.5px", fontFamily: "'Manrope', 'Inter', sans-serif", textTransform: "uppercase" }}>ArchiPilot</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {Array.from({ length: total }).map((_, i) => (
              <div key={i} style={{ width: i === step ? 24 : 8, height: 8, borderRadius: 999, background: i <= step ? AC : SBB, transition: "all .3s" }} />
            ))}
            <span style={{ fontSize: 11, fontWeight: 600, color: TX3, marginLeft: 4 }}>{step + 1}/{total}</span>
          </div>
        </div>

        {/* Content */}
        <div key={step} className="onb-card" style={{ padding: "24px 28px 28px" }}>
          {step === 0 && <Step1 data={data} set={setData} />}
          {step === 1 && <Step2 data={data} set={setData} />}
          {step === 2 && <Step3 data={data} set={setData} />}
          {step === 3 && <Step4 data={data} />}
        </div>

        {/* Footer */}
        <div style={{ padding: "0 28px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            {step > 0 && step < total - 1 && (
              <button onClick={() => setStep(s => s - 1)}
                style={{ padding: "10px 16px", border: `1px solid ${SBB}`, borderRadius: 9, background: WH, color: TX2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
                <Ico name="back" size={14} color={TX2} /> Retour
              </button>
            )}
            {step === 0 && (
              <button onClick={onComplete}
                style={{ padding: "10px 16px", border: "none", borderRadius: 9, background: "transparent", color: TX3, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                Passer l'introduction
              </button>
            )}
          </div>
          <button onClick={handleNext} disabled={!canNext}
            style={{ padding: "10px 22px", border: "none", borderRadius: 9, background: canNext ? AC : SBB, color: canNext ? "#fff" : TX3, fontSize: 13, fontWeight: 600, cursor: canNext ? "pointer" : "not-allowed", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, boxShadow: canNext ? "0 4px 12px rgba(201,90,27,0.25)" : "none", transition: "all .2s" }}>
            {nextLabels[step]}
            {step < total - 1 && <Ico name="send" size={13} color="#fff" />}
          </button>
        </div>
      </div>
    </div>
  );
}
