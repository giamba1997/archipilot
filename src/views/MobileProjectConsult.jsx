import { useState } from "react";
import { AC, ACL, SB, SB2, SBB, TX, TX2, TX3, WH, BG, AM, AMB, BR, BRB, ST, STB, GR } from "../constants/tokens";
import { getStatus, STATUS_TOTAL_STEPS, getPvStatus } from "../constants/statuses";
import { Ico } from "../components/ui";

// ── Consultation projet (mobile, lecture seule) — handoff_mobile ──
// Sur téléphone : lire vite (PV, réserves, photos, plans) + démarrer une
// visite. L'édition lourde (PV, facturation, planning) reste sur desktop.

export function MobileProjectConsult({ project, onBack, onOpr, onGallery, onDocuments, onStartVisit, onViewPV }) {
  const [pvOpen, setPvOpen] = useState(false);
  const st = getStatus(project.statusId);
  const pvs = [...(project.pvHistory || [])].reverse();
  const reserves = project.reserves || [];
  const openRes = reserves.filter(r => r.status !== "levee").length;
  const photos = (project.gallery || []).length;
  const docs = (project.planFiles || []).filter(f => f.type !== "folder").length;
  const lastPv = (project.pvHistory || []).slice(-1)[0];

  const Row = ({ icon, bg, fg, title, sub, onClick, open }) => (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 13, padding: "14px", width: "100%", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
      <span style={{ width: 36, height: 36, borderRadius: 10, background: bg, color: fg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Ico name={icon} size={18} color={fg} /></span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 15, fontWeight: 600, color: TX }}>{title}</span>
        <span style={{ display: "block", fontSize: 12, color: TX3 }}>{sub}</span>
      </span>
      <span style={{ color: "#C7C2BD", display: "inline-flex", transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}><Ico name="chevron-right" size={18} color="#C7C2BD" /></span>
    </button>
  );
  const Sep = () => <div style={{ height: 1, background: "#F5F2EF", margin: "0 14px" }} />;

  return (
    <div style={{ minHeight: "100%", background: BG, paddingBottom: 40 }}>
      {/* Nav */}
      <div style={{ display: "flex", alignItems: "center", padding: "6px 16px 14px" }}>
        <button onClick={onBack} aria-label="Retour" style={{ width: 40, height: 40, minWidth: 40, minHeight: 40, flexShrink: 0, borderRadius: "50%", background: WH, border: "1px solid #EFEDEB", display: "flex", alignItems: "center", justifyContent: "center", color: TX2, cursor: "pointer" }}><Ico name="back" size={18} color={TX2} /></button>
      </div>

      {/* En-tête phase + jauge */}
      <div style={{ padding: "0 20px 16px" }}>
        <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#A04C20", marginBottom: 6 }}>{st.label} · phase {st.step}/{STATUS_TOTAL_STEPS}</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: TX, letterSpacing: "-0.5px", lineHeight: 1.1, marginBottom: 10 }}>{project.name}</div>
        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
          {Array.from({ length: STATUS_TOTAL_STEPS }, (_, i) => <div key={i} style={{ flex: 1, height: 4, borderRadius: 999, background: i < st.step ? st.color : SBB }} />)}
        </div>
        <div style={{ fontSize: 13, color: TX3 }}>{[project.city, project.client].filter(Boolean).join(" · ") || "—"}</div>
      </div>

      {/* KPIs */}
      <div style={{ padding: "0 16px 18px", display: "flex", gap: 8 }}>
        {[
          { v: (project.pvHistory || []).length, l: "PV" },
          { v: openRes, l: "réserves", warn: openRes > 0 },
          { v: photos, l: "photos" },
        ].map((k, i) => (
          <div key={i} style={{ flex: 1, background: WH, border: `1px solid ${k.warn ? "#FDE68A" : "#EFEDEB"}`, borderRadius: 13, padding: 12, textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: k.warn ? AM : TX, letterSpacing: "-0.5px" }}>{k.v}</div>
            <div style={{ fontSize: 11, color: TX3, marginTop: 2 }}>{k.l}</div>
          </div>
        ))}
      </div>

      {/* Consulter */}
      <div style={{ fontSize: 12, fontWeight: 700, color: TX3, textTransform: "uppercase", letterSpacing: "0.05em", padding: "0 20px 10px" }}>Consulter</div>
      <div style={{ margin: "0 16px", background: WH, border: "1px solid #EFEDEB", borderRadius: 14, overflow: "hidden" }}>
        <Row icon="file" bg={AMB} fg={AM} title="PV de chantier" sub={`${(project.pvHistory || []).length} PV${lastPv?.date ? ` · dernier le ${lastPv.date}` : ""}`} onClick={() => setPvOpen(o => !o)} open={pvOpen} />
        {pvOpen && (
          <div style={{ background: "#FCFBFA", borderTop: "1px solid #F5F2EF" }}>
            {pvs.length === 0 ? (
              <div style={{ padding: "12px 16px 12px 56px", fontSize: 13, color: TX3 }}>Aucun PV.</div>
            ) : pvs.map((pv, i) => { const ps = getPvStatus(pv.status); return (
              <button key={i} onClick={() => onViewPV?.(pv)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "11px 16px 11px 56px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left", borderTop: i ? "1px solid #F5F2EF" : "none" }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: TX }}>PV n°{pv.number}</span>
                  <span style={{ display: "block", fontSize: 12, color: TX3 }}>{pv.date}</span>
                </span>
                <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: ps.bg, color: ps.color }}>{ps.label}</span>
              </button>
            ); })}
          </div>
        )}
        <Sep />
        <Row icon="alert" bg={BRB} fg={BR} title="Réserves OPR" sub={`${openRes} ouverte${openRes > 1 ? "s" : ""} · ${reserves.length - openRes}/${reserves.length} levées`} onClick={onOpr} />
        <Sep />
        <Row icon="image" bg={STB} fg={ST} title="Photos" sub={`${photos} photo${photos > 1 ? "s" : ""}`} onClick={onGallery} />
        <Sep />
        <Row icon="file" bg={SB} fg={TX2} title="Plans & documents" sub={`${docs} fichier${docs > 1 ? "s" : ""}`} onClick={onDocuments} />
      </div>

      {/* Note lecture seule */}
      <div style={{ margin: "18px 16px 0", display: "flex", alignItems: "center", gap: 9, background: "#F7F5F3", borderRadius: 11, padding: "11px 13px" }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={TX3} strokeWidth="1.7" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></svg>
        <span style={{ fontSize: 12, color: TX3, lineHeight: 1.45 }}>Édition des PV, facturation et planning : sur ordinateur.</span>
      </div>

      {/* CTA visite */}
      <div style={{ margin: "18px 16px 0" }}>
        <button onClick={onStartVisit} style={{ width: "100%", height: 50, background: AC, color: "#fff", border: "none", borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 8px 20px rgba(184,92,44,0.25)" }}>
          <Ico name="mappin" size={18} color="#fff" /> Démarrer une visite
        </button>
      </div>
    </div>
  );
}
