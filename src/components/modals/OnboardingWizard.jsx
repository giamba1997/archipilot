import { useState } from "react";
import { AC, TX, TX2, TX3, SB, SBB, WH, BG, GR } from "../../constants/tokens";
import { STRUCTURE_TYPES } from "../../constants/config";

const STEPS = [
  {
    id: "welcome",
    title: "Bienvenue sur ArchiPilot",
    subtitle: "Votre assistant de suivi de chantier",
    icon: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10",
  },
  {
    id: "profile",
    title: "Configurez votre profil",
    subtitle: "Ces informations apparaîtront sur vos PV",
    icon: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  },
  {
    id: "discover",
    title: "Découvrez les fonctionnalités",
    subtitle: "Tout ce dont vous avez besoin pour gérer vos chantiers",
    icon: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2 M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z M9 14l2 2 4-4",
  },
];

const FEATURES = [
  { icon: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7", label: "Suivi de chantier", desc: "Gérez vos postes, remarques et actions" },
  { icon: "M12 20V10 M18 20V4 M6 20v-4", label: "Génération de PV", desc: "PV rédigés par IA en un clic" },
  { icon: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M22 6l-10 7L2 6", label: "Envoi par email", desc: "Distribuez vos PV aux participants" },
  { icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75", label: "Collaboration", desc: "Travaillez en équipe sur vos projets" },
];

export function OnboardingWizard({ profile, onUpdateProfile, onComplete }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: profile.name || "",
    structure: profile.structure || "",
    structureType: profile.structureType || "architecte",
  });

  const currentStep = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const handleNext = () => {
    if (step === 1) {
      // Save profile on step 2
      onUpdateProfile({ ...profile, ...form });
    }
    if (isLast) {
      onComplete();
    } else {
      setStep(step + 1);
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 10002,
      background: "rgba(0,0,0,0.5)", display: "flex",
      alignItems: "center", justifyContent: "center",
      padding: 20, fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{
        background: WH, borderRadius: 20, width: "100%", maxWidth: 480,
        boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        animation: "modalIn 0.25s ease-out",
        overflow: "hidden",
      }}>
        {/* Progress bar */}
        <div style={{ display: "flex", gap: 4, padding: "16px 24px 0" }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 3, borderRadius: 2,
              background: i <= step ? AC : SBB,
              transition: "background 0.3s",
            }} />
          ))}
        </div>

        <div style={{ padding: "24px 28px 28px" }}>
          {/* Icon */}
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: `${AC}15`, display: "flex",
            alignItems: "center", justifyContent: "center",
            margin: "0 auto 16px",
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={AC} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d={currentStep.icon} />
            </svg>
          </div>

          {/* Title */}
          <h2 style={{ fontSize: 22, fontWeight: 700, color: TX, textAlign: "center", margin: "0 0 6px" }}>
            {currentStep.title}
          </h2>
          <p style={{ fontSize: 14, color: TX2, textAlign: "center", margin: "0 0 24px", lineHeight: 1.5 }}>
            {currentStep.subtitle}
          </p>

          {/* Step content */}
          {step === 0 && (
            <div style={{ textAlign: "center" }}>
              <div style={{
                background: SB, borderRadius: 12, padding: 16,
                fontSize: 14, color: TX2, lineHeight: 1.7,
              }}>
                ArchiPilot vous aide à générer vos procès-verbaux de chantier,
                suivre les remarques et actions, et collaborer avec votre équipe.
                <br /><br />
                <strong style={{ color: TX }}>Commencez en 2 minutes.</strong>
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: TX2, marginBottom: 5 }}>
                  Votre nom
                </label>
                <input
                  type="text" value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="ex: Jean Dupont"
                  style={{
                    width: "100%", padding: "11px 14px", border: `1px solid ${SBB}`,
                    borderRadius: 8, fontSize: 14, fontFamily: "inherit",
                    background: SB, color: TX, boxSizing: "border-box", outline: "none",
                  }}
                />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: TX2, marginBottom: 5 }}>
                  Nom du bureau
                </label>
                <input
                  type="text" value={form.structure}
                  onChange={(e) => setForm(f => ({ ...f, structure: e.target.value }))}
                  placeholder="ex: Dupont Architectes"
                  style={{
                    width: "100%", padding: "11px 14px", border: `1px solid ${SBB}`,
                    borderRadius: 8, fontSize: 14, fontFamily: "inherit",
                    background: SB, color: TX, boxSizing: "border-box", outline: "none",
                  }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: TX2, marginBottom: 5 }}>
                  Type de structure
                </label>
                <select
                  value={form.structureType}
                  onChange={(e) => setForm(f => ({ ...f, structureType: e.target.value }))}
                  style={{
                    width: "100%", padding: "11px 14px", border: `1px solid ${SBB}`,
                    borderRadius: 8, fontSize: 14, fontFamily: "inherit",
                    background: SB, color: TX, boxSizing: "border-box", outline: "none",
                  }}
                >
                  {STRUCTURE_TYPES.map(st => (
                    <option key={st.id} value={st.id}>{st.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {step === 2 && (
            <div style={{ display: "grid", gap: 10 }}>
              {FEATURES.map((f, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: 14, background: SB, borderRadius: 12,
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                    background: `${AC}12`, display: "flex",
                    alignItems: "center", justifyContent: "center",
                  }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={AC} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      <path d={f.icon} />
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: TX }}>{f.label}</div>
                    <div style={{ fontSize: 12, color: TX2, marginTop: 2 }}>{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
            <button
              onClick={handleSkip}
              style={{
                flex: "0 0 auto", padding: "11px 18px", border: `1px solid ${SBB}`,
                borderRadius: 10, background: WH, color: TX2, fontSize: 14,
                fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Passer
            </button>
            <button
              onClick={handleNext}
              disabled={step === 1 && (!form.name.trim() || !form.structure.trim())}
              style={{
                flex: 1, padding: "11px 18px", border: "none", borderRadius: 10,
                background: step === 1 && (!form.name.trim() || !form.structure.trim()) ? "#D3D1C7" : AC,
                color: "#fff", fontSize: 14, fontWeight: 600,
                cursor: step === 1 && (!form.name.trim() || !form.structure.trim()) ? "not-allowed" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {isLast ? "Commencer" : "Suivant"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
