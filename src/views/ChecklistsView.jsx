import { useState, useRef } from "react";
import { useT } from "../i18n";
import { AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, RD, GR, SP, FS, RAD, DIS, DIST } from "../constants/tokens";
import { CHECKLIST_TEMPLATES } from "../constants/templates";
import { Ico } from "../components/ui";

export function ChecklistsView({ project, setProjects, onBack }) {
  const [activeClId, setActiveClId] = useState(null);
  const [newItemText, setNewItemText] = useState("");
  const newItemRef = useRef(null);
  const t = useT();

  const checklists = project.checklists || [];

  const saveChecklists = (updated) =>
    setProjects((prev) => prev.map((p) => p.id === project.id ? { ...p, checklists: updated } : p));

  // Quick create from template — one click, auto-opens
  const quickCreate = (tplId) => {
    const tpl = CHECKLIST_TEMPLATES.find((t) => t.id === tplId);
    const items = (tpl?.items || []).map((item, i) => ({ id: Date.now() + i, text: item.text, section: item.section || "", checked: false }));
    const cl = { id: Date.now(), name: tpl?.label || "Checklist", createdAt: new Date().toLocaleDateString("fr-BE"), visitDate: "", items };
    saveChecklists([...checklists, cl]);
    setActiveClId(cl.id);
  };

  // Create blank
  const createBlank = () => {
    const cl = { id: Date.now(), name: "Checklist", createdAt: new Date().toLocaleDateString("fr-BE"), visitDate: "", items: [] };
    saveChecklists([...checklists, cl]);
    setActiveClId(cl.id);
  };

  const toggleItem = (clId, itemId) => {
    saveChecklists(checklists.map((c) => c.id !== clId ? c : {
      ...c, items: c.items.map((it) => it.id === itemId ? { ...it, checked: !it.checked } : it),
    }));
  };

  const addItem = (clId) => {
    const text = newItemText.trim();
    if (!text) return;
    saveChecklists(checklists.map((c) => c.id !== clId ? c : {
      ...c, items: [...c.items, { id: Date.now(), text, section: "", checked: false }],
    }));
    setNewItemText("");
    setTimeout(() => newItemRef.current?.focus(), 50);
  };

  const removeItem = (clId, itemId) => {
    saveChecklists(checklists.map((c) => c.id !== clId ? c : {
      ...c, items: c.items.filter((it) => it.id !== itemId),
    }));
  };

  const deleteChecklist = (clId) => {
    saveChecklists(checklists.filter((c) => c.id !== clId));
    if (activeClId === clId) setActiveClId(null);
  };

  const totalChecked = (cl) => cl.items.filter((it) => it.checked).length;
  const tplInfo = (id) => CHECKLIST_TEMPLATES.find((t) => t.id === id) || CHECKLIST_TEMPLATES[0];

  // Group items by section
  const groupedItems = (items) => {
    const sections = [];
    const seen = {};
    items.forEach((it) => {
      const sec = it.section || "";
      if (!seen[sec]) { seen[sec] = true; sections.push(sec); }
    });
    return sections.map((sec) => ({ section: sec, items: items.filter((it) => (it.section || "") === sec) }));
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: "8px", minWidth: 40, minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 }}><Ico name="back" color={TX2} /></button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: TX }}>{t("checklists.title")}</div>
          <div style={{ fontSize: 12, color: TX3 }}>{project.name} · {checklists.length} liste{checklists.length !== 1 ? "s" : ""}</div>
        </div>
      </div>

      {/* Quick create */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        <input
          value={newItemText} onChange={e => setNewItemText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && newItemText.trim()) { const cl = { id: Date.now(), name: newItemText.trim(), createdAt: new Date().toLocaleDateString("fr-BE"), visitDate: "", assignee: "", items: [] }; saveChecklists([...checklists, cl]); setActiveClId(cl.id); setNewItemText(""); } }}
          placeholder="Nom de la checklist..."
          style={{ flex: 1, padding: "9px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: SB, color: TX, boxSizing: "border-box" }}
        />
        <button onClick={() => { if (newItemText.trim()) { const cl = { id: Date.now(), name: newItemText.trim(), createdAt: new Date().toLocaleDateString("fr-BE"), visitDate: "", assignee: "", items: [] }; saveChecklists([...checklists, cl]); setActiveClId(cl.id); setNewItemText(""); } }} disabled={!newItemText.trim()} style={{ padding: "9px 16px", border: "none", borderRadius: 8, background: newItemText.trim() ? AC : DIS, color: newItemText.trim() ? "#fff" : DIST, fontWeight: 600, fontSize: 13, cursor: newItemText.trim() ? "pointer" : "not-allowed", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}>
          <Ico name="plus" size={12} color={newItemText.trim() ? "#fff" : DIST} />Créer
        </button>
      </div>

      {/* Liste des checklists */}
      {checklists.length === 0 && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "50px 20px", border: `2px dashed ${SBB}`, borderRadius: 12, background: WH, textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: ACL, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Ico name="listcheck" size={26} color={AC} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: TX, marginTop: 14, marginBottom: 6 }}>{t("checklists.noChecklists")}</div>
          <div style={{ fontSize: FS.md, color: TX3, marginBottom: SP.lg }}>{t("checklists.noChecklistsDesc")}</div>
          <div style={{ fontSize: FS.sm, color: TX3 }}>Utilisez le champ ci-dessus pour créer votre première checklist.</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {checklists.map((cl) => {
          const checked = totalChecked(cl);
          const total = cl.items.length;
          const pct = total > 0 ? Math.round((checked / total) * 100) : 0;
          const isOpen = activeClId === cl.id;
          const groups = groupedItems(cl.items);

          return (
            <div key={cl.id} style={{ background: WH, border: `1px solid ${isOpen ? ACL2 : SBB}`, borderRadius: 12, overflow: "hidden", transition: "border-color 0.15s" }}>
              {/* En-tête checklist */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: "pointer" }} onClick={() => setActiveClId(isOpen ? null : cl.id)}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: pct === 100 ? "#EAF3DE" : SB, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Ico name={pct === 100 ? "check" : "listcheck"} size={16} color={pct === 100 ? GR : TX3} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {isOpen ? (
                    <input
                      value={cl.name}
                      onChange={(e) => saveChecklists(checklists.map(c => c.id !== cl.id ? c : { ...c, name: e.target.value }))}
                      onClick={(e) => e.stopPropagation()}
                      style={{ fontSize: 14, fontWeight: 600, color: TX, border: "none", background: "transparent", padding: 0, width: "100%", fontFamily: "inherit", outline: "none", borderBottom: `1px solid ${SBB}` }}
                    />
                  ) : (
                    <div style={{ fontSize: 14, fontWeight: 600, color: TX }}>{cl.name}</div>
                  )}
                  <div style={{ fontSize: 11, color: TX3, marginTop: 2, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span>{checked}/{total}</span>
                    {pct === 100 && <span style={{ color: GR, fontWeight: 600 }}>{t("checklists.completed")}</span>}
                    <input
                      type="date"
                      value={cl.visitDate || ""}
                      onChange={(e) => saveChecklists(checklists.map(c => c.id !== cl.id ? c : { ...c, visitDate: e.target.value }))}
                      onClick={(e) => e.stopPropagation()}
                      style={{ fontSize: 10, border: `1px solid ${SBB}`, borderRadius: 5, padding: "1px 5px", background: SB, color: TX, fontFamily: "inherit" }}
                    />
                    <select
                      value={cl.assignee || ""}
                      onChange={(e) => saveChecklists(checklists.map(c => c.id !== cl.id ? c : { ...c, assignee: e.target.value }))}
                      onClick={(e) => e.stopPropagation()}
                      style={{ fontSize: 10, border: `1px solid ${SBB}`, borderRadius: 5, padding: "1px 5px", background: cl.assignee ? ACL : SB, color: cl.assignee ? AC : TX, fontFamily: "inherit", cursor: "pointer" }}
                    >
                      <option value="">Non attribué</option>
                      {(project.participants || []).map((p, i) => (
                        <option key={i} value={p.name}>{p.name} ({p.role})</option>
                      ))}
                    </select>
                  </div>
                  {total > 0 && (
                    <div style={{ marginTop: 5, width: "100%", height: 4, borderRadius: 4, background: SB2, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", borderRadius: 4, background: pct === 100 ? GR : AC, transition: "width 0.3s" }} />
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {total > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: pct === 100 ? GR : AC, minWidth: 36, textAlign: "right" }}>{pct}%</span>}
                  <button onClick={(e) => { e.stopPropagation(); const copy = { ...cl, id: Date.now(), name: cl.name + " (copie)", createdAt: new Date().toLocaleDateString("fr-BE"), items: cl.items.map(it => ({ ...it, id: Date.now() + Math.random(), checked: false })) }; saveChecklists([...checklists, copy]); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 6 }} title={t("checklists.duplicateEmpty")}>
                    <Ico name="dup" size={14} color={TX3} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); deleteChecklist(cl.id); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 6 }}>
                    <Ico name="trash" size={14} color={TX3} />
                  </button>
                  <Ico name={isOpen ? "x" : "back"} size={14} color={TX3} />
                </div>
              </div>

              {/* Détail items */}
              {isOpen && (
                <div style={{ borderTop: `1px solid ${SBB}`, padding: "12px 16px 16px" }}>
                  {cl.items.length === 0 && (
                    <div style={{ fontSize: 13, color: TX3, fontStyle: "italic", marginBottom: 12 }}>Aucun point — ajoutez-en ci-dessous.</div>
                  )}

                  {groups.map(({ section, items }) => (
                    <div key={section} style={{ marginBottom: 8 }}>
                      {section && (
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 6, marginTop: 4 }}>{section}</div>
                      )}
                      {items.map((it) => (
                        <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: `1px solid ${SB}` }}>
                          <button
                            onClick={() => toggleItem(cl.id, it.id)}
                            style={{ width: 24, height: 24, borderRadius: RAD.sm, border: `2px solid ${it.checked ? GR : SBB}`, background: it.checked ? GR : WH, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0, transition: "all 0.15s" }}
                          >
                            {it.checked && <Ico name="check" size={12} color="#fff" />}
                          </button>
                          <span style={{ flex: 1, fontSize: 13, color: it.checked ? TX3 : TX, textDecoration: it.checked ? "line-through" : "none", lineHeight: 1.4, transition: "all 0.15s" }}>{it.text}</span>
                          <button onClick={() => removeItem(cl.id, it.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, opacity: 0.4, flexShrink: 0 }}>
                            <Ico name="x" size={12} color={TX3} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ))}

                  {/* Ajouter un point */}
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <input
                      ref={newItemRef}
                      value={newItemText}
                      onChange={(e) => setNewItemText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addItem(cl.id)}
                      placeholder={t("checklists.addPlaceholder")}
                      style={{ flex: 1, padding: "8px 12px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: SB, color: TX, outline: "none" }}
                    />
                    <button onClick={() => addItem(cl.id)} disabled={!newItemText.trim()} style={{ padding: "8px 14px", border: "none", borderRadius: 8, background: newItemText.trim() ? AC : DIS, color: newItemText.trim() ? "#fff" : DIST, fontWeight: 600, fontSize: 13, cursor: newItemText.trim() ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
                      {t("add")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
