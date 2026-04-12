import { AC, SB, SBB, TX, TX2, TX3, WH, RD, SP, FS, RAD } from "../constants/tokens";

export function PDFPreview({ form }) {
  const color = form.pdfColor || "#D97B0D";
  const ff = form.pdfFont === "times" ? "Georgia,'Times New Roman',serif" : "system-ui,-apple-system,sans-serif";
  return (
    <div style={{ border: `1px solid ${SBB}`, borderRadius: 10, overflow: "hidden", background: WH, userSelect: "none" }}>
      {/* Barre couleur */}
      <div style={{ height: 7, background: color }} />
      {/* En-tête */}
      <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", fontFamily: ff }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: TX, fontFamily: ff }}>{form.structure || "Votre bureau d'architecture"}</div>
          <div style={{ fontSize: 10, color: TX3, marginTop: 2, fontFamily: ff }}>
            {[form.phone, form.email].filter(Boolean).join("   ") || "contact@votre-bureau.be"}
          </div>
        </div>
        {form.picture
          ? <img src={form.picture} alt="" style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover" }} />
          : <div style={{ width: 30, height: 30, borderRadius: "50%", background: SB, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: TX3 }}>Logo</div>
        }
      </div>
      <div style={{ height: 1, background: SBB, margin: "0 16px" }} />
      {/* Titre PV */}
      <div style={{ padding: "10px 16px 8px", fontFamily: ff }}>
        <div style={{ fontSize: 17, fontWeight: 700, color, marginBottom: 3, fontFamily: ff }}>PROCÈS-VERBAL N°29</div>
        <div style={{ fontSize: 10, color: TX2, fontFamily: ff }}>Réunion de chantier du 05/04/2026</div>
      </div>
      {/* Bloc projet */}
      <div style={{ margin: "0 16px 12px", background: SB, borderRadius: 6, padding: "8px 10px", display: "flex", gap: 14, fontFamily: ff }}>
        {[["CHANTIER","Votre projet"],["MAÎTRE D'OUVRAGE","Client MO"],["ENTREPRISE","Entreprise"]].map(([k,v]) => (
          <div key={k} style={{ flex: 1 }}>
            <div style={{ fontSize: 7, fontWeight: 600, color: TX3, marginBottom: 2 }}>{k}</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: TX, fontFamily: ff }}>{v}</div>
          </div>
        ))}
      </div>
      {/* Section contenu */}
      <div style={{ margin: "0 16px 8px" }}>
        <div style={{ padding: "4px 6px 4px 8px", background: SB, borderLeft: `2.5px solid ${color}`, marginBottom: 5 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: TX, fontFamily: ff }}>01. Situation du chantier</span>
        </div>
        <div style={{ fontSize: 9, color: TX, paddingLeft: 8, fontFamily: ff }}>• Les travaux avancent conformément au planning.</div>
        <div style={{ fontSize: 9, color: RD, paddingLeft: 8, marginTop: 3, fontWeight: 600, fontFamily: ff }}>! Resserrages coupe-feu toujours en attente.</div>
      </div>
      {/* Pied de page */}
      <div style={{ borderTop: `1px solid ${SBB}`, padding: "6px 16px", display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 8, color: TX3, fontFamily: ff }}>{form.structure || "Votre bureau"}</span>
        <span style={{ fontSize: 8, color: TX3, fontFamily: ff }}>Page 1 / 2</span>
      </div>
    </div>
  );
}
