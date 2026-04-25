import { useState, useRef, useEffect } from "react";
import { useT } from "../i18n";
import { AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, RD, GR, SP, FS, RAD, BL, BLB, PU, PUB, REDBG, GRBG } from "../constants/tokens";
import { Ico } from "../components/ui";
import { uploadPhoto, deletePhoto, getPhotoUrl } from "../db";
import { makeProxyPlanSetProjects } from "../utils/proxySetProjects";
import { CropTool } from "./CropTool";
import { PlanViewer } from "./PlanViewer";

export function PlanManager({ project, setProjects, onBack }) {
  const [activePlanId, setActivePlanId] = useState(null);
  const [newFolderParent, setNewFolderParent] = useState(null);
  const [croppingItem, setCroppingItem] = useState(null); // file id being cropped
  const [newFolderName, setNewFolderName] = useState("");
  const [expanded, setExpanded] = useState({});
  const [renaming, setRenaming] = useState(null);
  const [renameVal, setRenameVal] = useState("");
  const [movingItem, setMovingItem] = useState(null); // item id being moved
  const uploadRef = useRef(null);
  const [uploadTarget, setUploadTarget] = useState(null);
  const t = useT();

  const planFiles = project.planFiles || [];
  const updatePlanFiles = (fn) => setProjects(prev => prev.map(p => p.id === project.id ? { ...p, planFiles: fn(p.planFiles || []) } : p));

  const getChildren = (parentId) => planFiles.filter(f => f.parentId === (parentId || null));
  const getFolders = (parentId) => getChildren(parentId).filter(f => f.type === "folder");
  const getFiles = (parentId) => getChildren(parentId).filter(f => f.type !== "folder");

  const toggleExpand = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }));

  const createFolder = (parentId) => {
    if (!newFolderName.trim()) return;
    const newId = Date.now() + Math.random();
    updatePlanFiles(files => [...files, { id: newId, type: "folder", name: newFolderName.trim(), parentId: parentId || null, createdAt: new Date().toISOString() }]);
    setNewFolderName(""); setNewFolderParent(null);
    setExpanded(p => ({ ...p, [newId]: true }));
    if (parentId) setExpanded(p => ({ ...p, [parentId]: true }));
  };

  const handleUpload = (files, parentId) => {
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const ext = file.name.split(".").pop().toLowerCase();
        const imageExts = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "tiff", "tif"];
        const pdfExts = ["pdf"];
        const cadExts = ["dwg", "dxf", "skp", "rvt", "rfa", "ifc", "3dm", "step", "stp"];
        const docExts = ["doc", "docx", "odt", "rtf", "txt"];
        const sheetExts = ["xls", "xlsx", "csv", "ods"];
        const slideExts = ["ppt", "pptx", "odp"];
        const designExts = ["psd", "ai", "indd", "fig", "sketch"];
        let fileType = "other";
        if (imageExts.includes(ext)) fileType = "image";
        else if (pdfExts.includes(ext)) fileType = "pdf";
        else if (cadExts.includes(ext)) fileType = "cad";
        else if (docExts.includes(ext)) fileType = "doc";
        else if (sheetExts.includes(ext)) fileType = "sheet";
        else if (slideExts.includes(ext)) fileType = "slide";
        else if (designExts.includes(ext)) fileType = "design";
        updatePlanFiles(prev => [...prev, {
          id: Date.now() + Math.random(),
          type: fileType,
          name: file.name, parentId: parentId || null,
          dataUrl: ev.target.result, size: file.size,
          ext,
          createdAt: new Date().toISOString(),
        }]);
      };
      reader.readAsDataURL(file);
    });
    if (parentId) setExpanded(p => ({ ...p, [parentId]: true }));
  };

  const deleteItem = (itemId) => {
    const toDelete = new Set([itemId]);
    const findChildren = (pid) => { planFiles.filter(f => f.parentId === pid).forEach(f => { toDelete.add(f.id); if (f.type === "folder") findChildren(f.id); }); };
    findChildren(itemId);
    updatePlanFiles(files => files.filter(f => !toDelete.has(f.id)));
    if (activePlanId === itemId) setActivePlanId(null);
  };

  const renameItem = (itemId) => {
    if (!renameVal.trim()) { setRenaming(null); return; }
    updatePlanFiles(files => files.map(f => f.id === itemId ? { ...f, name: renameVal.trim() } : f));
    setRenaming(null);
  };

  // Move item to a different folder
  const moveItem = (itemId, newParentId) => {
    // Prevent moving folder into its own descendant
    if (newParentId) {
      let parent = newParentId;
      while (parent) { if (parent === itemId) return; const f = planFiles.find(x => x.id === parent); parent = f?.parentId; }
    }
    updatePlanFiles(files => files.map(f => f.id === itemId ? { ...f, parentId: newParentId || null } : f));
    if (newParentId) setExpanded(p => ({ ...p, [newParentId]: true }));
    setMovingItem(null);
  };

  // Build folder options for move picker (flat list with indent)
  const getFolderOptions = (excludeId) => {
    const options = [{ id: null, name: "/ Racine", depth: 0 }];
    const walk = (parentId, depth) => {
      getFolders(parentId).forEach(f => {
        if (f.id === excludeId) return;
        options.push({ id: f.id, name: f.name, depth });
        walk(f.id, depth + 1);
      });
    };
    walk(null, 1);
    return options;
  };

  // If viewing an image or PDF → PlanViewer with per-file markers/strokes/remarks
  const activePlan = planFiles.find(f => f.id === activePlanId);
  if (activePlan && (activePlan.type === "image" || activePlan.type === "pdf")) {
    const fileProject = {
      ...project,
      planImage: activePlan.dataUrl,
      planMarkers: activePlan.markers || project.planMarkers || [],
      planStrokes: activePlan.strokes || project.planStrokes || [],
    };
    // Proxy setProjects: intercept planMarkers/planStrokes/planImage and
    // store them on the active plan file. Plan remarks live per-file on
    // planFiles[i].remarks (handled via onPlanRemarksChange below), fully
    // decoupled from post.remarks and photo.pins.
    const fileSetProjects = makeProxyPlanSetProjects(setProjects, project.id, fileProject, (p, updated) => ({
      ...p,
      planFiles: (p.planFiles || []).map(f => f.id !== activePlanId ? f : {
        ...f,
        markers: updated.planMarkers || [],
        strokes: updated.planStrokes || [],
        dataUrl: updated.planImage || f.dataUrl,
      }),
    }));
    // Located remarks for this plan file — self-contained, not shared with
    // post.remarks. Updates go directly to planFiles[i].remarks.
    const planRemarks = activePlan.remarks || [];
    const onPlanRemarksChange = (updater) => setProjects(prev => prev.map(p => {
      if (p.id !== project.id) return p;
      return {
        ...p,
        planFiles: (p.planFiles || []).map(f => f.id !== activePlanId ? f : {
          ...f, remarks: typeof updater === "function" ? updater(f.remarks || []) : updater,
        }),
      };
    }));
    return (
      <PlanViewer
        project={fileProject}
        setProjects={fileSetProjects}
        planRemarks={planRemarks}
        onPlanRemarksChange={onPlanRemarksChange}
        onBack={() => setActivePlanId(null)}
      />
    );
  }

  const hasLegacy = project.planImage && planFiles.length === 0;
  const fileCount = planFiles.filter(f => f.type !== "folder").length;
  const folderCount = planFiles.filter(f => f.type === "folder").length;

  // File type icons & colors
  const FILE_TYPE_STYLES = {
    image:  { label: "IMG", color: GR, bg: GRBG, icon: "camera" },
    pdf:    { label: "PDF", color: RD, bg: REDBG, icon: "file" },
    cad:    { label: "CAD", color: BL, bg: BLB, icon: "layers" },
    doc:    { label: "DOC", color: BL, bg: BLB, icon: "file" },
    sheet:  { label: "XLS", color: GR, bg: GRBG, icon: "chart" },
    slide:  { label: "PPT", color: AC, bg: ACL, icon: "layers" },
    design: { label: "DSN", color: PU, bg: PUB, icon: "edit" },
    other:  { label: "FILE", color: TX3, bg: SB2, icon: "file" },
  };

  const FileIcon = ({ type, ext, dataUrl }) => {
    const s = FILE_TYPE_STYLES[type] || FILE_TYPE_STYLES.other;
    if (type === "image" && dataUrl) {
      return <img src={dataUrl} alt="" style={{ width: 32, height: 32, borderRadius: 7, objectFit: "cover", border: `1px solid ${SBB}`, flexShrink: 0 }} />;
    }
    return (
      <div style={{ width: 32, height: 32, borderRadius: 7, background: s.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: `1px solid ${s.color}22`, flexShrink: 0 }}>
        <span style={{ fontSize: 7, fontWeight: 700, color: s.color, textTransform: "uppercase" }}>{ext || s.label}</span>
        <Ico name={s.icon} size={10} color={s.color} />
      </div>
    );
  };

  // Action buttons shared component — hidden on mobile
  const ItemActions = ({ item }) => (
    <div className="ap-plan-item-actions" style={{ display: "flex", gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
      {/* Annotate — only for images & PDFs */}
      {(item.type === "image" || item.type === "pdf") && (
        <button onClick={() => setActivePlanId(item.id)} title="Annoter le plan" style={{ height: 28, padding: "0 8px", borderRadius: 6, border: `1px solid ${AC}`, background: ACL, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
          <Ico name="layers" size={11} color={AC} />
          <span style={{ fontSize: 9, fontWeight: 700, color: AC }}>Annoter</span>
        </button>
      )}
      {/* Crop — images & PDFs */}
      {(item.type === "image" || item.type === "pdf") && (
        <button onClick={() => setCroppingItem(item.id)} title="Rogner" style={{ height: 28, padding: "0 8px", borderRadius: 6, border: `1px solid ${SBB}`, background: WH, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
          <Ico name="fit" size={11} color={TX2} />
          <span style={{ fontSize: 9, fontWeight: 600, color: TX2 }}>Rogner</span>
        </button>
      )}
      {/* Download */}
      {item.type !== "image" && item.type !== "folder" && item.dataUrl && (
        <a href={item.dataUrl} download={item.name} title="Télécharger" style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${SBB}`, background: WH, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>
          <Ico name="download" size={11} color={TX3} />
        </a>
      )}
      {/* Move */}
      <button onClick={() => setMovingItem(item.id)} title="Déplacer" style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Ico name="arrowr" size={10} color={TX3} />
      </button>
      {/* Rename */}
      <button onClick={() => { setRenaming(item.id); setRenameVal(item.name); }} title="Renommer" style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Ico name="textT" size={11} color={TX3} />
      </button>
      {/* Delete */}
      <button onClick={() => deleteItem(item.id)} title="Supprimer" style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Ico name="trash" size={10} color={TX3} />
      </button>
    </div>
  );

  // Recursive tree renderer
  const TreeNode = ({ parentId, depth = 0 }) => {
    const folders = getFolders(parentId);
    const files = getFiles(parentId);
    if (folders.length === 0 && files.length === 0) return null;

    return (
      <div style={{ marginLeft: depth > 0 ? 16 : 0, borderLeft: depth > 0 ? `1px solid ${SBB}` : "none", paddingLeft: depth > 0 ? 8 : 0 }}>
        {folders.map(folder => {
          const isOpen = expanded[folder.id];
          const childCount = getChildren(folder.id).length;
          return (
            <div key={folder.id}>
              <div className="plan-folder-row" onClick={() => toggleExpand(folder.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, cursor: "pointer", marginBottom: 2 }}>
                <Ico name={isOpen ? "chevron-up" : "chevron-down"} size={11} color={TX3} />
                <div style={{ width: 32, height: 32, borderRadius: 7, background: ACL, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Ico name="folder" size={16} color={AC} />
                </div>
                {renaming === folder.id ? (
                  <input value={renameVal} onChange={e => setRenameVal(e.target.value)} autoFocus
                    onKeyDown={e => { if (e.key === "Enter") renameItem(folder.id); if (e.key === "Escape") setRenaming(null); }}
                    onBlur={() => renameItem(folder.id)} onClick={e => e.stopPropagation()}
                    style={{ flex: 1, padding: "3px 8px", border: `1px solid ${AC}`, borderRadius: 5, fontSize: 12, fontFamily: "inherit", background: WH, color: TX }}
                  />
                ) : (
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: FS.md, fontWeight: 600, color: TX }}>{folder.name}</span>
                    <span style={{ fontSize: FS.sm, color: TX3, marginLeft: 6 }}>{childCount}</span>
                  </div>
                )}
                <div className="ap-plan-folder-actions" style={{ display: "flex", gap: 1, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => { setUploadTarget(folder.id); uploadRef.current?.click(); }} title="Importer ici" style={{ width: 26, height: 26, borderRadius: 5, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Ico name="plus" size={11} color={TX3} />
                  </button>
                  <button onClick={() => { setNewFolderParent(folder.id); setExpanded(p => ({ ...p, [folder.id]: true })); }} title="Sous-dossier" style={{ width: 26, height: 26, borderRadius: 5, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Ico name="folder" size={10} color={TX3} />
                  </button>
                  <button onClick={() => setMovingItem(folder.id)} title="Déplacer" style={{ width: 26, height: 26, borderRadius: 5, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Ico name="arrowr" size={10} color={TX3} />
                  </button>
                  <button onClick={() => { setRenaming(folder.id); setRenameVal(folder.name); }} title="Renommer" style={{ width: 26, height: 26, borderRadius: 5, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Ico name="textT" size={10} color={TX3} />
                  </button>
                  <button onClick={() => deleteItem(folder.id)} title="Supprimer" style={{ width: 26, height: 26, borderRadius: 5, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Ico name="trash" size={10} color={TX3} />
                  </button>
                </div>
              </div>
              {/* New subfolder inline */}
              {newFolderParent === folder.id && (/* ap-plan-new-folder — hidden on mobile */
                <div style={{ display: "flex", gap: 4, padding: "4px 10px 4px 52px", marginBottom: 4, animation: "fadeIn 0.12s ease-out" }}>
                  <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="Nom du sous-dossier..." autoFocus
                    onKeyDown={e => { if (e.key === "Enter") createFolder(folder.id); if (e.key === "Escape") setNewFolderParent(null); }}
                    style={{ flex: 1, padding: "5px 8px", border: `1px solid ${AC}`, borderRadius: 5, fontSize: 11, fontFamily: "inherit", background: WH, color: TX }}
                  />
                  <button onClick={() => createFolder(folder.id)} style={{ padding: "5px 10px", border: "none", borderRadius: 5, background: AC, color: "#fff", fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>OK</button>
                  <button onClick={() => setNewFolderParent(null)} style={{ padding: "5px 6px", border: `1px solid ${SBB}`, borderRadius: 5, background: WH, cursor: "pointer", display: "flex", alignItems: "center" }}>
                    <Ico name="x" size={9} color={TX3} />
                  </button>
                </div>
              )}
              {isOpen && <TreeNode parentId={folder.id} depth={depth + 1} />}
            </div>
          );
        })}
        {files.map(file => (
          <div key={file.id}
            onClick={() => { if (file.type === "image" || file.type === "pdf") setActivePlanId(file.id); }}
            className="plan-file-row"
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 8, cursor: file.type === "image" || file.type === "pdf" ? "pointer" : "default", marginBottom: 2 }}
          >
            <FileIcon type={file.type} ext={file.ext} dataUrl={file.dataUrl} />
            <div style={{ flex: 1, minWidth: 0 }}>
              {renaming === file.id ? (
                <input value={renameVal} onChange={e => setRenameVal(e.target.value)} autoFocus
                  onKeyDown={e => { if (e.key === "Enter") renameItem(file.id); if (e.key === "Escape") setRenaming(null); }}
                  onBlur={() => renameItem(file.id)} onClick={e => e.stopPropagation()}
                  style={{ width: "100%", padding: "3px 8px", border: `1px solid ${AC}`, borderRadius: 5, fontSize: 12, fontFamily: "inherit", background: WH, color: TX }}
                />
              ) : (
                <>
                  <div style={{ fontSize: 12, fontWeight: 500, color: TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{file.name}</div>
                  <div style={{ fontSize: 10, color: TX3 }}>{file.size ? `${(file.size / 1024).toFixed(0)} KB` : ""}{file.createdAt ? ` · ${new Date(file.createdAt).toLocaleDateString("fr-BE")}` : ""}</div>
                </>
              )}
            </div>
            <ItemActions item={file} />
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      {/* Header — desktop only */}
      <div className="ap-plan-header" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 8, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Ico name="back" color={TX2} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: TX }}>Documents</div>
          <div style={{ fontSize: 12, color: TX3 }}>{fileCount} fichier{fileCount !== 1 ? "s" : ""} · {folderCount} dossier{folderCount !== 1 ? "s" : ""}</div>
        </div>
      </div>

      {/* Actions bar — desktop only */}
      <div className="ap-plan-actions-bar" style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        <button onClick={() => { setUploadTarget(null); uploadRef.current?.click(); }} className="ap-touch-btn" style={{ display: "flex", alignItems: "center", gap: 5, padding: "9px 16px", border: "none", borderRadius: 8, background: AC, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          <Ico name="upload" size={13} color="#fff" />Importer
        </button>
        <button onClick={() => setNewFolderParent("root")} className="ap-touch-btn" style={{ display: "flex", alignItems: "center", gap: 5, padding: "9px 16px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, color: TX2, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
          <Ico name="folder" size={13} color={TX3} />Nouveau dossier
        </button>
        <input ref={uploadRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.dwg,.dxf,.skp,.rvt,.rfa,.ifc,.psd,.ai,.indd,.fig,.sketch,.3dm,.step,.stp,.odt,.ods,.odp,.rtf,.txt" multiple style={{ display: "none" }} onChange={(e) => { handleUpload(e.target.files, uploadTarget); e.target.value = ""; }} />
      </div>
      <div className="ap-plan-formats" style={{ fontSize: 10, color: TX3, marginBottom: 14, lineHeight: 1.6, padding: "0 2px" }}>
        Formats acceptés : <strong>Images</strong> (JPG, PNG, SVG, TIFF) · <strong>PDF</strong> · <strong>CAO</strong> (DWG, DXF, SketchUp, Revit, IFC) · <strong>Documents</strong> (Word, Excel, PowerPoint, CSV) · <strong>Design</strong> (PSD, AI, InDesign, Figma)
      </div>

      {/* New folder at root */}
      {newFolderParent === "root" && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14, animation: "fadeIn 0.12s ease-out" }}>
          <div style={{ width: 32, height: 32, borderRadius: 7, background: ACL, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Ico name="folder" size={14} color={AC} />
          </div>
          <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="Nom du dossier..." autoFocus
            onKeyDown={e => { if (e.key === "Enter") createFolder(null); if (e.key === "Escape") setNewFolderParent(null); }}
            style={{ flex: 1, padding: "7px 12px", border: `1px solid ${AC}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: WH, color: TX, boxShadow: `0 0 0 3px ${AC}1a` }}
          />
          <button onClick={() => createFolder(null)} style={{ padding: "7px 16px", border: "none", borderRadius: 8, background: AC, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Créer</button>
          <button onClick={() => setNewFolderParent(null)} style={{ padding: "7px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Ico name="x" size={12} color={TX3} />
          </button>
        </div>
      )}

      {/* Legacy migration */}
      {hasLegacy && (
        <div style={{ padding: "12px 16px", background: ACL, border: `1px solid ${ACL2}`, borderRadius: 10, marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
          <Ico name="alert" size={14} color={AC} />
          <div style={{ flex: 1, fontSize: 12, color: TX }}>Un plan existant a été détecté.</div>
          <button onClick={() => updatePlanFiles(files => [...files, { id: Date.now(), type: "image", name: "Plan principal", parentId: null, dataUrl: project.planImage, size: 0, createdAt: new Date().toISOString() }])} style={{ padding: "6px 14px", border: "none", borderRadius: 6, background: AC, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Migrer
          </button>
        </div>
      )}

      {/* Move picker modal */}
      {movingItem && (() => {
        const item = planFiles.find(f => f.id === movingItem);
        if (!item) return null;
        const options = getFolderOptions(movingItem);
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setMovingItem(null)}>
            <div onClick={e => e.stopPropagation()} style={{ background: WH, borderRadius: 14, width: "100%", maxWidth: 380, boxShadow: "0 20px 60px rgba(0,0,0,0.15)", animation: "modalIn 0.18s ease", overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: `1px solid ${SBB}` }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: TX }}>Déplacer "{item.name}"</div>
                <div style={{ fontSize: 11, color: TX3, marginTop: 2 }}>Choisissez le dossier de destination</div>
              </div>
              <div style={{ maxHeight: 300, overflowY: "auto", padding: "8px 10px" }}>
                {options.map(opt => {
                  const isCurrent = item.parentId === opt.id || (!item.parentId && !opt.id);
                  return (
                    <button key={opt.id || "__root__"} onClick={() => { if (!isCurrent) moveItem(movingItem, opt.id); }}
                      style={{
                        width: "100%", display: "flex", alignItems: "center", gap: 8,
                        padding: "9px 12px", paddingLeft: 12 + opt.depth * 16,
                        border: "none", borderRadius: 7, cursor: isCurrent ? "default" : "pointer",
                        background: isCurrent ? SB : "transparent",
                        fontFamily: "inherit", textAlign: "left", marginBottom: 2,
                        opacity: isCurrent ? 0.5 : 1,
                      }}
                    >
                      <Ico name="folder" size={12} color={isCurrent ? TX3 : AC} />
                      <span style={{ fontSize: 12, fontWeight: 500, color: isCurrent ? TX3 : TX }}>{opt.name}</span>
                      {isCurrent && <span style={{ fontSize: 10, color: TX3, marginLeft: "auto" }}>actuel</span>}
                    </button>
                  );
                })}
              </div>
              <div style={{ padding: "10px 18px", borderTop: `1px solid ${SBB}` }}>
                <button onClick={() => setMovingItem(null)} style={{ width: "100%", padding: 10, border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", fontSize: 12, fontFamily: "inherit", color: TX2 }}>Annuler</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* File tree */}
      <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 12, padding: "10px 8px", minHeight: 80 }}>
        {planFiles.length === 0 && !hasLegacy && (
          <div style={{ padding: "40px 16px", textAlign: "center" }}>
            <Ico name="upload" size={28} color={SBB} />
            <div style={{ fontSize: 13, fontWeight: 600, color: TX3, marginTop: 8 }}>Aucun plan importé</div>
            <div style={{ fontSize: 11, color: TX3, marginTop: 3 }}>Importez des images ou PDFs de vos plans</div>
          </div>
        )}
        <TreeNode parentId={null} depth={0} />
      </div>

      {/* Crop overlay */}
      {croppingItem && (() => {
        const file = planFiles.find(f => f.id === croppingItem);
        if (!file) return null;
        const isPdf = file.type === "pdf";
        if (isPdf) {
          // Render PDF to image first, then show crop tool
          return <PdfCropBridge file={file} onSave={(dataUrl, name) => {
            updatePlanFiles(prev => [...prev, {
              id: Date.now() + Math.random(), type: "image", name,
              parentId: file.parentId, dataUrl, size: 0, createdAt: new Date().toISOString(),
            }]);
            setCroppingItem(null);
          }} onClose={() => setCroppingItem(null)} />;
        }
        return <CropTool imageSrc={file.dataUrl} fileName={file.name} onSave={(dataUrl, name) => {
          updatePlanFiles(prev => [...prev, {
            id: Date.now() + Math.random(), type: "image", name,
            parentId: file.parentId, dataUrl, size: 0, createdAt: new Date().toISOString(),
          }]);
          setCroppingItem(null);
        }} onClose={() => setCroppingItem(null)} />;
      })()}
    </div>
  );
}

// Helper: render PDF page to image, then open CropTool
const _pdfCache = {};
export function PdfCropBridge({ file, onSave, onClose }) {
  const [imgSrc, setImgSrc] = useState(null);
  useEffect(() => {
    (async () => {
      try {
        const cacheKey = file.dataUrl.slice(0, 100);
        if (_pdfCache[cacheKey]) { setImgSrc(_pdfCache[cacheKey]); return; }
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).href;
        const data = atob(file.dataUrl.split(",")[1]);
        const arr = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) arr[i] = data.charCodeAt(i);
        const pdf = await pdfjsLib.getDocument({ data: arr }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width; canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
        const result = canvas.toDataURL("image/png");
        _pdfCache[cacheKey] = result;
        setImgSrc(result);
      } catch (e) { console.error("PDF crop render error:", e); onClose(); }
    })();
  }, [file.dataUrl]);

  if (!imgSrc) return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", color: "#fff" }}>
        <div style={{ width: 20, height: 20, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "sp .6s linear infinite", margin: "0 auto 12px" }} />
        <div style={{ fontSize: 13 }}>Rendu du PDF...</div>
      </div>
    </div>
  );

  return <CropTool imageSrc={imgSrc} fileName={file.name} onSave={onSave} onClose={onClose} />;
}
