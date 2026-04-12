import { useState, useRef } from "react";
import { useT } from "../i18n";
import { AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, RD, GR, SP, FS, RAD, BL, BLB, REDBG, REDBRD } from "../constants/tokens";
import { DOC_CATEGORIES } from "../constants/config";
import { Ico, Modal } from "../components/ui";
import { uploadPhoto, deletePhoto, getPhotoUrl } from "../db";
import { getDocCurrent } from "../utils/helpers";

export function DocumentsView({ project, setProjects, onBack }) {
  const [activeCategory, setActiveCategory] = useState("all");
  const [viewDoc, setViewDoc] = useState(null);
  const [uploadCat, setUploadCat] = useState("plans");
  const [versionHistoryDoc, setVersionHistoryDoc] = useState(null);
  const [newVersionDocId, setNewVersionDocId] = useState(null);
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState(null);
  const [docMenuOpen, setDocMenuOpen] = useState(null);
  const uploadRef = useRef(null);
  const newVersionRef = useRef(null);
  const t = useT();

  const docs = project.documents || [];
  const filtered = activeCategory === "all" ? docs : docs.filter((d) => d.category === activeCategory);

  const addDocuments = (files, cat) => {
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setProjects((prev) => prev.map((p) => p.id === project.id ? {
          ...p,
          documents: [...(p.documents || []), {
            id: Date.now() + Math.random(),
            name: file.name,
            category: cat,
            versions: [{
              v: 1,
              dataUrl: ev.target.result,
              size: file.size,
              type: file.type.startsWith("image/") ? "image" : "pdf",
              addedAt: new Date().toLocaleDateString("fr-BE"),
            }],
          }],
        } : p));
      };
      reader.readAsDataURL(file);
    });
  };

  const addVersion = (docId, file) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      setProjects((prev) => prev.map((p) => {
        if (p.id !== project.id) return p;
        return {
          ...p,
          documents: (p.documents || []).map((d) => {
            if (d.id !== docId) return d;
            const existing = d.versions || [{ v: 1, dataUrl: d.dataUrl, size: d.size, type: d.type, addedAt: d.addedAt }];
            return {
              ...d,
              versions: [...existing, {
                v: existing.length + 1,
                dataUrl: ev.target.result,
                size: file.size,
                type: file.type.startsWith("image/") ? "image" : "pdf",
                addedAt: new Date().toLocaleDateString("fr-BE"),
              }],
            };
          }),
        };
      }));
    };
    reader.readAsDataURL(file);
  };

  const removeDoc = (id) => setProjects((prev) => prev.map((p) => p.id === project.id ? {
    ...p, documents: (p.documents || []).filter((d) => d.id !== id),
  } : p));

  const fmt = (b) => b < 1024 ? b + " o" : b < 1048576 ? Math.round(b / 1024) + " Ko" : (b / 1048576).toFixed(1) + " Mo";
  const catInfo = (id) => DOC_CATEGORIES.find((c) => c.id === id) || DOC_CATEGORIES[0];

  return (
    <div>
      {/* Desktop header with back button */}
      <div className="ap-docs-header" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: "8px", minWidth: 40, minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 }}><Ico name="back" color={TX2} /></button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: TX }}>{t("docs.title")}</div>
          <div style={{ fontSize: 12, color: TX3 }}>{project.name} · {docs.length} document{docs.length !== 1 ? "s" : ""}</div>
        </div>
      </div>

      {/* Zone d'upload — desktop only */}
      <div className="ap-docs-upload" style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 160px" }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: TX2, marginBottom: 6 }}>{t("docs.category")}</div>
            <select value={uploadCat} onChange={(e) => setUploadCat(e.target.value)} style={{ width: "100%", padding: "8px 10px", border: `1px solid ${SBB}`, borderRadius: 6, fontSize: 13, background: SB, color: TX, fontFamily: "inherit" }}>
              {DOC_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <button onClick={() => uploadRef.current.click()} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", border: "none", borderRadius: 8, background: AC, color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
            <Ico name="plus" size={14} color="#fff" />{t("docs.addFiles")}
          </button>
          <input ref={uploadRef} type="file" accept=".pdf,image/*" multiple style={{ display: "none" }} onChange={(e) => { addDocuments(e.target.files, uploadCat); e.target.value = ""; }} />
          <input ref={newVersionRef} type="file" accept=".pdf,image/*" style={{ display: "none" }} onChange={(e) => { if (e.target.files[0] && newVersionDocId) addVersion(newVersionDocId, e.target.files[0]); setNewVersionDocId(null); e.target.value = ""; }} />
        </div>
        <div style={{ fontSize: 11, color: TX3, marginTop: 8 }}>{t("docs.formats")}</div>
      </div>

      {/* Mobile title */}
      <div className="ap-docs-mobile-title" style={{ display: "none", alignItems: "center", justifyContent: "space-between", marginBottom: SP.md }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: TX }}>Documents</div>
          <div style={{ fontSize: FS.sm, color: TX3 }}>{docs.length} document{docs.length !== 1 ? "s" : ""}</div>
        </div>
      </div>

      {/* Onglets catégories — scrollable on mobile */}
      <div className="ap-docs-tabs" style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {[{ id: "all", label: t("all"), count: docs.length }, ...DOC_CATEGORIES.map((c) => ({ id: c.id, label: c.label, count: docs.filter((d) => d.category === c.id).length }))].map((tab) => (
          <button key={tab.id} onClick={() => setActiveCategory(tab.id)} style={{ padding: "5px 14px", border: `1px solid ${activeCategory === tab.id ? AC : SBB}`, borderRadius: 20, background: activeCategory === tab.id ? ACL : WH, color: activeCategory === tab.id ? AC : TX2, fontWeight: activeCategory === tab.id ? 600 : 400, fontSize: 12, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
            {tab.label} <span style={{ opacity: 0.65 }}>({tab.count})</span>
          </button>
        ))}
      </div>

      {/* Liste documents */}
      {filtered.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "50px 20px", border: `2px dashed ${SBB}`, borderRadius: 12, background: WH, textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: ACL, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Ico name="folder" size={26} color={AC} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: TX, marginTop: 14, marginBottom: 6 }}>{activeCategory !== "all" ? t("docs.noDocsCat") : t("docs.noDocs")}</div>
          <div style={{ fontSize: FS.md, color: TX3, marginBottom: SP.lg }}>{t("docs.addAbove")}</div>
          <button onClick={() => uploadRef.current.click()} style={{ padding: "9px 20px", border: "none", borderRadius: RAD.md, background: AC, color: "#fff", fontWeight: 600, fontSize: FS.md, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: SP.sm - 2 }}>
            <Ico name="plus" size={13} color="#fff" />Ajouter un document
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {filtered.map((doc) => {
            const cat = catInfo(doc.category);
            const cur = getDocCurrent(doc);
            return (
              <div key={doc.id} className="ap-doc-row" onClick={() => { if (window.innerWidth <= 768) setViewDoc({ name: doc.name, dataUrl: cur.dataUrl, type: cur.type }); }} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: WH, border: `1px solid ${SBB}`, borderRadius: 10, cursor: window.innerWidth <= 768 ? "pointer" : "default" }}>
                {cur.type === "image" ? (
                  <img src={cur.dataUrl} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8, flexShrink: 0, border: `1px solid ${SBB}` }} />
                ) : (
                  <div style={{ width: 44, height: 44, borderRadius: 8, background: REDBG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0, border: `1px solid ${REDBRD}`, gap: 1 }}>
                    <span style={{ fontSize: 8, fontWeight: 700, color: RD, letterSpacing: "0.06em" }}>PDF</span>
                    <Ico name="file" size={13} color={RD} />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{doc.name}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: cat.color, background: cat.bg, padding: "1px 7px", borderRadius: 10 }}>{cat.label}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: BL, background: BLB, padding: "1px 7px", borderRadius: 6 }}>v{cur.version}</span>
                    <span style={{ fontSize: 11, color: TX3 }}>{fmt(cur.size)}</span>
                    <span style={{ fontSize: 11, color: TX3 }}>{cur.addedAt}</span>
                  </div>
                </div>
                {/* Actions — inline desktop, menu mobile */}
                {(() => {
                  const [menuOpen, setMenuOpen] = [doc.id === docMenuOpen, (v) => setDocMenuOpen(v ? doc.id : null)];
                  return (
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    {/* Desktop actions — hidden on mobile */}
                    <div className="ap-doc-actions-desktop" style={{ display: "flex", alignItems: "center", gap: SP.xs }}>
                      <button onClick={() => setViewDoc({ name: doc.name, dataUrl: cur.dataUrl, type: cur.type })} style={{ background: SB, border: "none", borderRadius: RAD.sm, cursor: "pointer", padding: `${SP.sm - 2}px ${SP.sm + 2}px`, display: "flex", alignItems: "center", gap: 3 }}>
                        <Ico name="eye" size={13} color={TX3} /><span style={{ fontSize: FS.sm, color: TX2 }}>{t("view")}</span>
                      </button>
                      <button title={t("docs.newVersion")} onClick={() => { setNewVersionDocId(doc.id); setTimeout(() => newVersionRef.current?.click(), 50); }} style={{ background: ACL, border: `1px solid ${ACL2}`, borderRadius: RAD.sm, cursor: "pointer", padding: `${SP.sm - 2}px ${SP.sm}px`, display: "flex", alignItems: "center", gap: 2 }}>
                        <Ico name="download" size={13} color={AC} /><span style={{ fontSize: FS.sm, color: AC, fontWeight: 700 }}>v+</span>
                      </button>
                      {cur.version > 1 && (
                        <button title={t("docs.versionHistory")} onClick={() => setVersionHistoryDoc(doc)} style={{ background: SB, border: "none", borderRadius: RAD.sm, cursor: "pointer", padding: `${SP.sm - 2}px ${SP.sm}px`, display: "flex", alignItems: "center" }}>
                          <Ico name="history" size={14} color={TX3} />
                        </button>
                      )}
                      {confirmDeleteDoc === doc.id ? (
                        <div style={{ display: "flex", gap: SP.xs, alignItems: "center" }}>
                          <button onClick={() => { removeDoc(doc.id); setConfirmDeleteDoc(null); }} style={{ fontSize: FS.sm, fontWeight: 700, color: WH, background: RD, border: "none", borderRadius: RAD.sm, padding: "3px 8px", cursor: "pointer", fontFamily: "inherit" }}>Suppr.</button>
                          <button onClick={() => setConfirmDeleteDoc(null)} style={{ fontSize: FS.sm, color: TX2, background: SB, border: `1px solid ${SBB}`, borderRadius: RAD.sm, padding: "3px 8px", cursor: "pointer", fontFamily: "inherit" }}>Non</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDeleteDoc(doc.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: SP.sm - 2 }}>
                          <Ico name="trash" size={14} color={TX3} />
                        </button>
                      )}
                    </div>
                    {/* Mobile menu — hidden on desktop */}
                    <div className="ap-doc-actions-mobile" style={{ display: "none" }}>
                      <button onClick={() => setMenuOpen(!menuOpen)} style={{ background: SB, border: `1px solid ${SBB}`, borderRadius: RAD.sm, cursor: "pointer", padding: `${SP.sm - 2}px ${SP.sm}px`, display: "flex", alignItems: "center", justifyContent: "center", minWidth: 36, minHeight: 36 }}>
                        <span style={{ fontSize: 16, color: TX3, fontWeight: 700, lineHeight: 1 }}>⋯</span>
                      </button>
                      {menuOpen && (
                        <div style={{ position: "absolute", right: 0, top: "100%", marginTop: SP.xs, background: WH, border: `1px solid ${SBB}`, borderRadius: RAD.lg, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 50, minWidth: 160, overflow: "hidden", animation: "fadeIn 0.12s ease-out" }}>
                          <button onClick={() => { setViewDoc({ name: doc.name, dataUrl: cur.dataUrl, type: cur.type }); setMenuOpen(false); }} style={{ width: "100%", padding: `${SP.sm + 2}px ${SP.md}px`, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: SP.sm, fontFamily: "inherit", fontSize: FS.md, color: TX }}>
                            <Ico name="eye" size={14} color={TX3} />Voir
                          </button>
                          <button onClick={() => { setNewVersionDocId(doc.id); setTimeout(() => newVersionRef.current?.click(), 50); setMenuOpen(false); }} style={{ width: "100%", padding: `${SP.sm + 2}px ${SP.md}px`, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: SP.sm, fontFamily: "inherit", fontSize: FS.md, color: TX }}>
                            <Ico name="download" size={14} color={AC} />Nouvelle version
                          </button>
                          {cur.version > 1 && (
                            <button onClick={() => { setVersionHistoryDoc(doc); setMenuOpen(false); }} style={{ width: "100%", padding: `${SP.sm + 2}px ${SP.md}px`, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: SP.sm, fontFamily: "inherit", fontSize: FS.md, color: TX }}>
                              <Ico name="history" size={14} color={TX3} />Historique
                            </button>
                          )}
                          <div style={{ height: 1, background: SBB }} />
                          <button onClick={() => { confirmDeleteDoc === doc.id ? (removeDoc(doc.id), setConfirmDeleteDoc(null)) : setConfirmDeleteDoc(doc.id); setMenuOpen(false); }} style={{ width: "100%", padding: `${SP.sm + 2}px ${SP.md}px`, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: SP.sm, fontFamily: "inherit", fontSize: FS.md, color: RD }}>
                            <Ico name="trash" size={14} color={RD} />Supprimer
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}

      {/* Viewer modal */}
      <Modal open={!!viewDoc} onClose={() => setViewDoc(null)} title={viewDoc?.name || ""} wide>
        {viewDoc && (
          viewDoc.type === "image" ? (
            <img src={viewDoc.dataUrl} alt={viewDoc.name} style={{ width: "100%", borderRadius: 8, display: "block" }} />
          ) : (
            <div>
              <iframe src={viewDoc.dataUrl} title={viewDoc.name} style={{ width: "100%", height: "60vh", border: "none", borderRadius: 8 }} />
              <div style={{ marginTop: 12, display: "flex", justifyContent: "center" }}>
                <a href={viewDoc.dataUrl} download={viewDoc.name} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 18px", background: AC, color: "#fff", borderRadius: 8, fontWeight: 600, fontSize: 13, textDecoration: "none" }}>
                  <Ico name="download" size={14} color="#fff" />{t("download")}
                </a>
              </div>
            </div>
          )
        )}
      </Modal>

      {/* Version history modal */}
      <Modal open={!!versionHistoryDoc} onClose={() => setVersionHistoryDoc(null)} title={`Versions — ${versionHistoryDoc?.name || ""}`} wide>
        {versionHistoryDoc && (() => {
          const versions = versionHistoryDoc.versions
            ? [...versionHistoryDoc.versions].reverse()
            : [{ v: 1, dataUrl: versionHistoryDoc.dataUrl, size: versionHistoryDoc.size, type: versionHistoryDoc.type, addedAt: versionHistoryDoc.addedAt }];
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {versions.map((v, i) => (
                <div key={v.v} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: i === 0 ? ACL : SB, border: `1px solid ${i === 0 ? ACL2 : SBB}`, borderRadius: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: i === 0 ? AC : SBB, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: i === 0 ? "#fff" : TX2 }}>v{v.v}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: TX }}>{i === 0 ? "Version actuelle" : `Version ${v.v}`}</div>
                    <div style={{ fontSize: 11, color: TX3, marginTop: 2 }}>{v.addedAt} · {fmt(v.size)}</div>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => setViewDoc({ name: versionHistoryDoc.name, dataUrl: v.dataUrl, type: v.type })} style={{ background: SB, border: `1px solid ${SBB}`, borderRadius: 6, cursor: "pointer", padding: "6px 10px", display: "flex", alignItems: "center", gap: 3 }}>
                      <Ico name="eye" size={13} color={TX3} /><span style={{ fontSize: 11, color: TX2 }}>{t("view")}</span>
                    </button>
                    {i !== 0 && (
                      <button onClick={() => {
                        setProjects((prev) => prev.map((p) => {
                          if (p.id !== project.id) return p;
                          return {
                            ...p,
                            documents: (p.documents || []).map((d) => {
                              if (d.id !== versionHistoryDoc.id) return d;
                              const existing = d.versions || [];
                              return { ...d, versions: [...existing, { ...v, v: existing.length + 1, addedAt: new Date().toLocaleDateString("fr-BE") }] };
                            }),
                          };
                        }));
                        setVersionHistoryDoc(null);
                      }} style={{ background: SB, border: `1px solid ${SBB}`, borderRadius: 6, cursor: "pointer", padding: "6px 10px", display: "flex", alignItems: "center", gap: 3 }}>
                        <Ico name="repeat" size={13} color={TX3} /><span style={{ fontSize: 11, color: TX2 }}>Restaurer</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}

// ── Plan Manager (collapsible tree) ─────────────────────────
// ── Crop Tool (fullscreen overlay) ───────────────────────────
