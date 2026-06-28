import { useState } from "react";
import { AC, ACL, ACL2, TX, TX2, TX3, SB, SBB, WH, GR, RD } from "../../constants/tokens";
import { Ico } from "../ui";

// ── Wizard de première connexion (Direction D) — 5 étapes, jamais bloquant :
//   Rôle → Structure → Formule (aucun paiement) → 1er projet → Bienvenue.
//   `compact` : flux court pour les membres invités d'une agence (rôle → nom →
//   bienvenue) — la structure/formule/projet existent déjà côté org.

const ROLES = [
  { id: "architecte", label: "Architecte", icon: "building" },
  { id: "conducteur", label: "Conducteur", icon: "edit" },
  { id: "maitre_ouvrage", label: "Maître d'ouvrage", icon: "user" },
  { id: "entrepreneur", label: "Entrepreneur", icon: "users" },
];

const ONB_PLANS = [
  { id: "free", label: "Free", price: "0 €", feats: ["1 projet", "3 PV / mois", "3 requêtes IA / mois"] },
  { id: "pro", label: "Pro", price: "39 €", per: "/mois", popular: true, feats: ["Projets & PV illimités", "OPR · planning · galerie", "3 collaborateurs"] },
  { id: "team", label: "Team", price: "89 €", per: "/mois", soon: true, feats: ["Tout Pro, +", "Collab. illimités", "Cross-projets · CSV"] },
];

function Overline({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: AC, marginBottom: 8 }}>{children}</div>;
}
function Title({ children }) {
  return <h1 style={{ margin: "0 0 6px", fontSize: 25, fontWeight: 700, color: TX, letterSpacing: "-0.5px", lineHeight: 1.15 }}>{children}</h1>;
}
function Sub({ children }) {
  return <div style={{ fontSize: 14, color: TX2, marginBottom: 24, lineHeight: 1.5 }}>{children}</div>;
}
function OField({ label, value, onChange, placeholder, type = "text", half, required }) {
  return (
    <div style={{ flex: half ? 1 : undefined }}>
      {label && <div style={{ fontSize: 12, fontWeight: 600, color: TX2, marginBottom: 6 }}>{label}{required && <span style={{ color: RD, marginLeft: 3 }}>*</span>}</div>}
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: "100%", height: 46, padding: "0 14px", border: `1px solid ${SBB}`, borderRadius: 11, fontSize: 14, background: WH, color: TX, outline: "none", boxSizing: "border-box", fontFamily: "inherit", transition: "all .15s" }}
        onFocus={e => { e.target.style.borderColor = AC; e.target.style.boxShadow = `0 0 0 3px ${ACL}`; }}
        onBlur={e => { e.target.style.borderColor = SBB; e.target.style.boxShadow = "none"; }} />
    </div>
  );
}

function StepRole({ data, set }) {
  return (
    <>
      <Overline>Étape 1 sur 5</Overline>
      <Title>Bienvenue ! Tu es… ?</Title>
      <Sub>On adapte ArchiPilot à ton métier.</Sub>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {ROLES.map(r => {
          const sel = data.role === r.id;
          return (
            <button key={r.id} onClick={() => set({ ...data, role: r.id, structureType: r.id })}
              style={{ display: "flex", alignItems: "center", gap: 13, padding: 16, border: `1.5px solid ${sel ? AC : SBB}`, background: sel ? ACL : WH, borderRadius: 14, cursor: "pointer", transition: "all .15s", fontFamily: "inherit", textAlign: "left" }}>
              <span style={{ width: 40, height: 40, borderRadius: 11, background: sel ? AC : SB, color: sel ? WH : TX2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Ico name={r.icon} size={20} color={sel ? WH : TX2} /></span>
              <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: TX }}>{r.label}</span>
              {sel && <Ico name="check" size={18} color={AC} />}
            </button>
          );
        })}
      </div>
    </>
  );
}

function StepStructure({ data, set }) {
  return (
    <>
      <Overline>Étape 2 sur 5</Overline>
      <Title>Ta structure</Title>
      <Sub>Ces infos apparaîtront sur tes PV et factures. Modifiables à tout moment.</Sub>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <OField label="Ton nom" value={data.name || ""} onChange={v => set({ ...data, name: v })} placeholder="Gaëlle Dupont" required />
        <OField label="Nom de l'agence" value={data.agency || ""} onChange={v => set({ ...data, agency: v })} placeholder="Atelier d'architecture GD" required />
        <OField label="Adresse du siège" value={data.address || ""} onChange={v => set({ ...data, address: v })} placeholder="Rue, n°, code postal, ville" />
      </div>
    </>
  );
}

function StepPlan({ data, set }) {
  return (
    <>
      <Overline>Étape 3 sur 5</Overline>
      <Title>Choisis ta formule</Title>
      <Sub>Tu peux démarrer gratuitement et changer plus tard. Aucun paiement maintenant.</Sub>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {ONB_PLANS.map(p => {
          const sel = data.plan === p.id;
          const selectable = !p.soon;
          return (
            <div key={p.id} onClick={() => selectable && set({ ...data, plan: p.id })}
              style={{ position: "relative", border: `${sel ? 1.5 : 1}px solid ${sel ? AC : SBB}`, background: sel ? ACL : WH, borderRadius: 14, padding: 18, cursor: selectable ? "pointer" : "default", opacity: p.soon ? 0.85 : 1, transition: "all .15s" }}>
              {p.popular && <div style={{ position: "absolute", top: -9, left: "50%", transform: "translateX(-50%)", fontSize: 10, fontWeight: 700, color: "#fff", background: AC, borderRadius: 999, padding: "2px 10px", whiteSpace: "nowrap" }}>RECOMMANDÉ</div>}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: TX }}>{p.label}</span>
                {p.soon && <span style={{ fontSize: 9, fontWeight: 600, color: TX3, background: SB, border: `1px solid ${SBB}`, borderRadius: 999, padding: "1px 7px" }}>Bientôt</span>}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: sel ? AC : TX, letterSpacing: "-0.5px", marginBottom: 12 }}>{p.price}{p.per && <span style={{ fontSize: 11, fontWeight: 500, color: TX3 }}>{p.per}</span>}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: TX2 }}>{p.feats.map((f, i) => <div key={i}>{f}</div>)}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function StepProject({ data, set }) {
  return (
    <>
      <Overline>Étape 4 sur 5</Overline>
      <Title>Ton premier projet</Title>
      <Sub>Juste le nom suffit pour démarrer — tu compléteras le reste plus tard.</Sub>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <OField label="Nom du projet" value={data.pName || ""} onChange={v => set({ ...data, pName: v })} placeholder="Rénovation de l'Hôtel de Ville" required />
        <div style={{ display: "flex", gap: 14 }}>
          <OField half label="Client" value={data.pClient || ""} onChange={v => set({ ...data, pClient: v })} placeholder="Ville de Nivelles" />
          <OField half label="Ville" value={data.pCity || ""} onChange={v => set({ ...data, pCity: v })} placeholder="Nivelles" />
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          <OField half type="date" label="Date de début" value={data.pStart || ""} onChange={v => set({ ...data, pStart: v })} />
          <OField half type="date" label="Réception prévue" value={data.pEnd || ""} onChange={v => set({ ...data, pEnd: v })} />
        </div>
      </div>
    </>
  );
}

function StepNameLight({ data, set, joinedOrgName }) {
  return (
    <>
      <Overline>Étape 2 · Ton profil</Overline>
      <Title>Comment tu t'appelles ?</Title>
      <Sub>C'est le nom qui apparaîtra sur les PV que tu rédiges{joinedOrgName ? ` au sein de ${joinedOrgName}` : ""}.</Sub>
      <OField label="Ton nom" value={data.name || ""} onChange={v => set({ ...data, name: v })} placeholder="Marie Dupont" required />
    </>
  );
}

// Écran final — Bienvenue (checklist + visite guidée). CTAs propres (pas de footer).
function StepDone({ data, joinedOrgName, onComplete }) {
  const firstName = data.name ? data.name.split(" ")[0] : "";
  return (
    <div style={{ textAlign: "center", padding: "8px 4px 4px" }}>
      <div style={{ width: 78, height: 78, borderRadius: 999, background: `linear-gradient(135deg, #D17A47, ${AC})`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 22px", boxShadow: `0 10px 30px ${AC}55` }}><Ico name="check" size={36} color="#fff" /></div>
      <h1 style={{ margin: "0 0 10px", fontSize: 27, fontWeight: 700, color: TX, letterSpacing: "-0.6px" }}>Bienvenue{firstName ? `, ${firstName}` : ""} 🎉</h1>
      <div style={{ fontSize: 15, color: TX2, lineHeight: 1.6, marginBottom: 24 }}>
        {joinedOrgName
          ? <>Tu as rejoint <b style={{ color: TX }}>{joinedOrgName}</b>. Tu peux maintenant accéder aux projets partagés.</>
          : <>Ton espace est prêt{data.pName ? <> et ton projet <b style={{ color: TX }}>{data.pName}</b> est créé</> : ""}. On t'a préparé une courte visite pour démarrer.</>}
      </div>
      {!joinedOrgName && (
        <div style={{ background: SB, border: `1px solid ${SBB}`, borderRadius: 14, padding: 16, marginBottom: 24, textAlign: "left" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: TX3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Pour bien démarrer</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {["Importer ton cahier des charges", "Ajouter les intervenants", "Préparer ton premier PV"].map((t, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: TX2 }}><Ico name="check" size={15} color={AC} />{t}</div>
            ))}
          </div>
        </div>
      )}
      <button onClick={onComplete} style={{ width: "100%", height: 50, background: AC, color: "#fff", border: "none", borderRadius: 12, fontFamily: "inherit", fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 12, boxShadow: `0 8px 24px ${AC}40` }}>{joinedOrgName ? "Accéder à l'agence" : "Commencer la visite guidée"}</button>
      {!joinedOrgName && <div onClick={onComplete} style={{ fontSize: 14, color: TX3, cursor: "pointer" }}>Explorer par moi-même</div>}
    </div>
  );
}

const FULL_STEPS = ["role", "structure", "plan", "project", "done"];
const LIGHT_STEPS = ["role", "name", "done"];

export function OnboardingWizard({ profile, onUpdateProfile, onComplete, onCreateProject, compact, joinedOrgName, initialStep = 0 }) {
  const [stepNames] = useState(compact ? LIGHT_STEPS : FULL_STEPS);
  const [step, setStep] = useState(Math.min(initialStep, (compact ? LIGHT_STEPS : FULL_STEPS).length - 1));
  const [data, setData] = useState({
    role: profile.structureType || "",
    name: profile.name || "",
    agency: profile.structure || "",
    address: profile.address || "",
    structureType: profile.structureType || "architecte",
    plan: profile.plan || "free",
    pName: "", pClient: "", pCity: "", pStart: "", pEnd: "",
  });

  const total = stepNames.length;
  const currentStep = stepNames[step];
  const isDone = currentStep === "done";

  const canNext = (() => {
    if (currentStep === "role") return !!data.role;
    if (currentStep === "structure") return !!(data.agency?.trim() && data.name?.trim());
    if (currentStep === "name") return !!data.name?.trim();
    if (currentStep === "project") return !!data.pName?.trim();
    return true;
  })();

  const handleNext = () => {
    if (currentStep === "structure") onUpdateProfile({ ...profile, name: data.name, structure: data.agency, structureType: data.structureType || data.role, address: data.address });
    if (currentStep === "name") onUpdateProfile({ ...profile, name: data.name, structureType: data.structureType || data.role });
    if (currentStep === "plan") onUpdateProfile({ ...profile, plan: data.plan });
    if (currentStep === "project" && data.pName && onCreateProject) onCreateProject({ name: data.pName, client: data.pClient, city: data.pCity, startDate: data.pStart, endDate: data.pEnd });
    setStep(s => s + 1);
  };
  const skipPlan = () => { setStep(s => s + 1); };

  const cardWidth = currentStep === "plan" ? 720 : currentStep === "project" ? 620 : 560;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10002, background: "rgba(28,25,23,0.55)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`@keyframes onbUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}.onb-card{animation:onbUp .3s ease both}`}</style>
      <div className="onb-card" style={{ width: "100%", maxWidth: cardWidth, background: WH, borderRadius: 22, boxShadow: "0 24px 60px rgba(28,25,23,0.22)", overflow: "hidden" }}>
        {/* Header : logo A + dots */}
        <div style={{ padding: "22px 32px 0", display: "flex", alignItems: "center" }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: AC, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16, fontFamily: "'Manrope','Inter',sans-serif" }}>A</div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            {Array.from({ length: total }).map((_, i) => (
              <span key={i} style={{ width: i === step ? 22 : 6, height: 6, borderRadius: 999, background: i <= step ? AC : SBB, transition: "all .3s" }} />
            ))}
          </div>
        </div>

        {/* Contenu */}
        <div key={step} className="onb-card" style={{ padding: "24px 32px 28px" }}>
          {currentStep === "role" && <StepRole data={data} set={setData} />}
          {currentStep === "structure" && <StepStructure data={data} set={setData} />}
          {currentStep === "plan" && <StepPlan data={data} set={setData} />}
          {currentStep === "project" && <StepProject data={data} set={setData} />}
          {currentStep === "name" && <StepNameLight data={data} set={setData} joinedOrgName={joinedOrgName} />}
          {currentStep === "done" && <StepDone data={data} joinedOrgName={joinedOrgName} onComplete={onComplete} />}
        </div>

        {/* Footer (sauf écran final) */}
        {!isDone && (
          <div style={{ padding: "0 32px 26px", display: "flex", alignItems: "center", gap: 12 }}>
            {step > 0 && (
              <button onClick={() => setStep(s => s - 1)} style={{ height: 48, padding: "0 18px", border: `1px solid ${SBB}`, borderRadius: 12, background: WH, color: TX2, fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}><Ico name="back" size={14} color={TX2} />Retour</button>
            )}
            {step === 0 && (
              <button onClick={onComplete} style={{ height: 48, padding: "0 14px", border: "none", borderRadius: 12, background: "transparent", color: TX3, fontFamily: "inherit", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Passer l'introduction</button>
            )}
            {currentStep === "plan" && <button onClick={skipPlan} style={{ border: "none", background: "transparent", color: TX3, fontFamily: "inherit", fontSize: 13, cursor: "pointer" }}>Décider plus tard</button>}
            <button onClick={handleNext} disabled={!canNext} style={{ marginLeft: "auto", height: 48, padding: "0 22px", border: "none", borderRadius: 12, background: canNext ? AC : SBB, color: canNext ? "#fff" : TX3, fontFamily: "inherit", fontSize: 15, fontWeight: 700, cursor: canNext ? "pointer" : "not-allowed", display: "flex", alignItems: "center", gap: 8, boxShadow: canNext ? `0 6px 18px ${AC}38` : "none", transition: "all .2s" }}>
              {currentStep === "project" ? "Créer le projet" : "Continuer"}
              <Ico name="chevron-right" size={15} color={canNext ? "#fff" : TX3} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
