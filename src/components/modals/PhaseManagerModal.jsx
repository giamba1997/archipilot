import { useEffect, useMemo, useState } from "react";
import {
  AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, BR, GR, RD, SP, FS, RAD, DIS, DIST,
} from "../../constants/tokens";
import { Modal, Field, Ico } from "../ui";
import {
  PHASE_COLORS, getPhaseColor, getProjectPhases, newPhase, seedPhasesFromDefaults,
} from "../../utils/phases";

// Modal de gestion des phases custom du projet.
//
// État :
//   - project.phases absent → on propose un seed depuis STATUSES (les 7 phases
//     canoniques) pour que l'utilisateur parte d'une base, puis édite.
//   - project.phases présent → on affiche la liste éditable.
//
// Actions :
//   - Renommer une phase (label éditable inline)
//   - Changer la couleur (clic sur la pastille → palette)
//   - Réordonner (flèches ↑↓)
//   - Supprimer (avec confirmation si phase active ou si lots assignés)
//   - Ajouter une phase
//   - Réinitialiser aux phases par défaut
//
// Tous les changements sont locaux (state) et n'affectent le projet qu'au
// clic « Enregistrer ». Annuler abandonne tout.

export function PhaseManagerModal({ open, onClose, project, onSave }) {
  const [phases, setPhases] = useState(() => getProjectPhases(project));
  const [statusId, setStatusId] = useState(project?.statusId || "");
  const [colorPickerFor, setColorPickerFor] = useState(null); // phaseId | null

  // Re-init à chaque ouverture
  useEffect(() => {
    if (!open) return;
    setPhases(getProjectPhases(project));
    setStatusId(project?.statusId || "");
    setColorPickerFor(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project?.id]);

  const lotsByPhase = useMemo(() => {
    const map = {};
    for (const l of (project?.lots || [])) {
      const k = l.phaseId || "_none";
      if (!map[k]) map[k] = 0;
      map[k]++;
    }
    return map;
  }, [project?.lots]);

  const isCustomized = Array.isArray(project?.phases) && project.phases.length > 0;

  const handleAdd = () => setPhases(arr => [...arr, newPhase({ label: `Phase ${arr.length + 1}` })]);

  const handleRename = (id, label) => setPhases(arr => arr.map(p => p.id === id ? { ...p, label } : p));

  const handleColor = (id, colorId) => {
    const c = getPhaseColor(colorId);
    setPhases(arr => arr.map(p => p.id === id ? { ...p, color: c.color, bg: c.bg, colorId } : p));
    setColorPickerFor(null);
  };

  const handleMove = (id, dir) => setPhases(arr => {
    const i = arr.findIndex(p => p.id === id);
    if (i < 0) return arr;
    const j = dir === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= arr.length) return arr;
    const next = [...arr];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  const handleRemove = (id) => {
    const lotsCount = lotsByPhase[id] || 0;
    const isActive = statusId === id;
    let warn = "";
    if (isActive) warn += "C'est la phase active du projet — elle sera réassignée à la première phase restante. ";
    if (lotsCount > 0) warn += `${lotsCount} lot${lotsCount > 1 ? "s" : ""} assigné${lotsCount > 1 ? "s" : ""} à cette phase deviendr${lotsCount > 1 ? "ont" : "a"} transverse${lotsCount > 1 ? "s" : ""}.`;
    if (warn && !window.confirm(`Supprimer cette phase ? ${warn}`)) return;

    setPhases(arr => {
      const next = arr.filter(p => p.id !== id);
      if (statusId === id) setStatusId(next[0]?.id || "");
      return next;
    });
  };

  const handleResetDefaults = () => {
    if (!window.confirm("Réinitialiser aux 7 phases par défaut ? Tes phases personnalisées seront perdues.")) return;
    const seed = seedPhasesFromDefaults();
    setPhases(seed);
    if (!seed.find(p => p.id === statusId)) setStatusId(seed[0]?.id || "");
  };

  const handleSave = () => {
    // Sécurité : on évite de sauvegarder une liste vide (au moins 1 phase requise).
    if (phases.length === 0) {
      alert("Au moins une phase est requise.");
      return;
    }
    // Si statusId pointe vers une phase qui n'existe plus, on bascule sur la 1ère.
    const finalStatusId = phases.find(p => p.id === statusId) ? statusId : phases[0].id;
    // Les lots dont la phaseId n'existe plus deviennent transverses.
    const validIds = new Set(phases.map(p => p.id));
    const lots = (project.lots || []).map(l => validIds.has(l.phaseId) ? l : { ...l, phaseId: l.phaseId ? "" : l.phaseId });
    onSave({
      ...project,
      phases,
      statusId: finalStatusId,
      lots,
    });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Gérer les phases du projet" wide>
      <div style={{ fontSize: FS.sm, color: TX3, lineHeight: 1.5, marginBottom: SP.md }}>
        Personnalise les phases de ton projet. Chaque chantier peut avoir sa propre découpe — études, démolition, gros œuvre par bâtiment, etc.
        {!isCustomized && (
          <span style={{ display: "block", marginTop: 4, fontStyle: "italic" }}>
            Tu pars des 7 phases canoniques. Modifie-les ou ajoute-en de nouvelles.
          </span>
        )}
      </div>

      {/* Liste éditable */}
      <div style={{ border: `1px solid ${SBB}`, borderRadius: RAD.md, overflow: "hidden", marginBottom: SP.md }}>
        {phases.map((phase, i) => {
          const lotsCount = lotsByPhase[phase.id] || 0;
          const isActive = statusId === phase.id;
          return (
            <div key={phase.id} style={{
              display: "flex", alignItems: "center", gap: SP.sm,
              padding: "8px 10px",
              borderBottom: i < phases.length - 1 ? `1px solid ${SBB}` : "none",
              background: isActive ? ACL : WH,
              position: "relative",
            }}>
              {/* Ordre + flèches */}
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <button onClick={() => handleMove(phase.id, "up")} disabled={i === 0}
                  style={iconBtn(i === 0)}><Ico name="chevron-up" size={10} color={i === 0 ? DIS : TX3} /></button>
                <button onClick={() => handleMove(phase.id, "down")} disabled={i === phases.length - 1}
                  style={iconBtn(i === phases.length - 1)}><Ico name="chevron-down" size={10} color={i === phases.length - 1 ? DIS : TX3} /></button>
              </div>

              {/* Pastille couleur — clic = ouvre picker */}
              <div style={{ position: "relative" }}>
                <button onClick={() => setColorPickerFor(p => p === phase.id ? null : phase.id)}
                  title="Changer la couleur"
                  style={{ width: 22, height: 22, borderRadius: 6, background: phase.bg, border: `2px solid ${phase.color}`, cursor: "pointer", padding: 0 }} />
                {colorPickerFor === phase.id && (
                  <>
                    <div onClick={() => setColorPickerFor(null)} style={{ position: "fixed", inset: 0, zIndex: 50 }} />
                    <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: WH, border: `1px solid ${SBB}`, borderRadius: 8, padding: 6, boxShadow: "0 8px 20px rgba(0,0,0,0.1)", display: "grid", gridTemplateColumns: "repeat(4, 26px)", gap: 4, zIndex: 51 }}>
                      {PHASE_COLORS.map(c => (
                        <button key={c.id} onClick={() => handleColor(phase.id, c.id)} title={c.label}
                          style={{ width: 26, height: 26, borderRadius: 6, background: c.bg, border: `2px solid ${c.color}`, cursor: "pointer", padding: 0 }} />
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Label éditable */}
              <input
                value={phase.label}
                onChange={(e) => handleRename(phase.id, e.target.value)}
                placeholder="Nom de la phase"
                style={{ flex: 1, padding: "6px 8px", border: `1px solid transparent`, borderRadius: 6, fontSize: FS.sm, fontFamily: "inherit", background: "transparent", color: TX, fontWeight: isActive ? 700 : 500 }}
                onFocus={(e) => e.target.style.background = SB}
                onBlur={(e) => e.target.style.background = "transparent"}
              />

              {/* Marqueurs : phase active + nb lots assignés */}
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                {isActive && <span style={{ fontSize: 9, fontWeight: 700, color: AC, background: WH, border: `1px solid ${ACL2}`, padding: "1px 7px", borderRadius: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Active</span>}
                {lotsCount > 0 && <span style={{ fontSize: 9, color: TX3, background: SB, padding: "1px 7px", borderRadius: 10 }}>{lotsCount} lot{lotsCount > 1 ? "s" : ""}</span>}
              </div>

              {/* Bouton "Activer" si pas active */}
              {!isActive && (
                <button onClick={() => setStatusId(phase.id)} title="Définir comme phase active"
                  style={{ padding: "4px 10px", border: `1px solid ${SBB}`, borderRadius: 6, background: WH, color: TX2, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  Activer
                </button>
              )}

              {/* Suppression */}
              <button onClick={() => handleRemove(phase.id)}
                title="Supprimer la phase"
                style={{ width: 26, height: 26, padding: 0, border: "none", borderRadius: 6, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                onMouseEnter={(e) => e.currentTarget.style.background = "#FEE"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                <Ico name="trash" size={11} color={RD} />
              </button>
            </div>
          );
        })}

        {/* Add row */}
        <button onClick={handleAdd}
          style={{ width: "100%", padding: "10px 12px", border: "none", borderTop: `1px dashed ${SBB}`, background: SB, color: AC, fontSize: FS.sm, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <Ico name="plus" size={11} color={AC} />Ajouter une phase
        </button>
      </div>

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", gap: SP.sm, paddingTop: SP.md, borderTop: `1px solid ${SBB}` }}>
        <button onClick={handleResetDefaults}
          style={{ padding: "8px 12px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, color: TX3, fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
          Réinitialiser aux phases par défaut
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={onClose}
          style={{ padding: "9px 14px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, color: TX2, fontSize: FS.sm, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          Annuler
        </button>
        <button onClick={handleSave}
          style={{ padding: "9px 18px", border: "none", borderRadius: 8, background: AC, color: WH, fontSize: FS.sm, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          Enregistrer
        </button>
      </div>
    </Modal>
  );
}

const iconBtn = (disabled) => ({
  width: 18, height: 14, padding: 0, border: "none", borderRadius: 3,
  background: "transparent", cursor: disabled ? "not-allowed" : "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
  opacity: disabled ? 0.4 : 1,
});
