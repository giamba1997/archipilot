import { useMemo, useState } from "react";
import { DatePicker } from "../components/DatePicker";
import { AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, BR, BRB, BL, BLB, GR, GRBG, VI, VIB, PU, PUB, REDBRD, SP, FS, RAD } from "../constants/tokens";
import { Ico, Modal } from "../components/ui";
import { extractPdfText } from "../utils/chatAttachments";

// Wizard "Importer un projet depuis un dossier".
//
// L'archi sélectionne un dossier de son PC (input webkitdirectory),
// ArchiPilot scanne tous les fichiers et propose un classement basé
// sur le nom du fichier (heuristiques simples) :
//   - cahier des charges       → cahierDesCharges (slot unique)
//   - PV (procès-verbal)       → pvHistory[] avec imported: true
//   - plans                    → documents[] catégorie "plans"
//   - photos                   → documents[] catégorie "photos"
//   - autres docs              → documents[] catégorie "admin"
//
// L'archi voit le récap, peut switcher des fichiers de catégorie,
// confirme, l'import se fait. Pour les PV, on garde juste le PDF — pas
// d'extraction IA structurée à ce stade ; l'archi peut le faire en
// individuel via le bouton "Importer un PV" si voulu.

const PV_RE = /(?:^|[\s_-])pv[\s_-]?n?[\s_-]?(\d+)|proc[eè]s[\s_-]?verbal|compte[\s_-]?rendu/i;
const CDC_RE = /cahier.{0,3}charges|clauses.{0,3}techniques|\bcct\b|\bccg\b|\bcsc\b/i;
const PLAN_RE = /plan|implantation|coupe|fa[çc]ade|[eé]l[eé]vation|architectural/i;
const IMG_EXT_RE = /\.(jpe?g|png|webp|heic|heif|gif|svg|tiff?)$/i;
const PDF_EXT_RE = /\.pdf$/i;
const CAD_EXT_RE = /\.(dwg|dxf|skp|rvt|rfa|ifc|3dm|step|stp)$/i;
const DOC_EXT_RE = /\.(docx?|odt|rtf|txt)$/i;
const SHEET_EXT_RE = /\.(xlsx?|csv|ods)$/i;
const SLIDE_EXT_RE = /\.(pptx?|odp)$/i;
const DESIGN_EXT_RE = /\.(psd|ai|indd|fig|sketch)$/i;

// Mêmes formats que PlanManager — la liste est volontairement large pour
// que tout document professionnel d'un cabinet d'archi puisse atterrir
// dans Documents sans être ignoré.
const ACCEPTED_RE = /\.(pdf|jpe?g|png|webp|heic|heif|gif|svg|tiff?|docx?|odt|rtf|txt|xlsx?|csv|ods|pptx?|odp|dwg|dxf|skp|rvt|rfa|ifc|3dm|step|stp|psd|ai|indd|fig|sketch)$/i;

const KIND_META = {
  cdc:    { label: "Cahier des charges",  color: AC, bg: ACL,  icon: "file"   },
  pv:     { label: "PV / compte-rendu",   color: AC, bg: ACL,  icon: "file"   },
  plan:   { label: "Plan",                color: BL, bg: BLB,  icon: "file"   },
  photo:  { label: "Photo chantier",      color: GR, bg: GRBG, icon: "image"  },
  doc:    { label: "Document",            color: VI, bg: VIB,  icon: "folder" },
  cad:    { label: "Plan CAO",            color: BL, bg: BLB,  icon: "layers" },
  sheet:  { label: "Tableur",             color: GR, bg: GRBG, icon: "chart"  },
  slide:  { label: "Présentation",        color: PU, bg: PUB,  icon: "image"  },
  design: { label: "Design",              color: PU, bg: PUB,  icon: "image"  },
  skip:   { label: "Ignoré",              color: TX3, bg: SB,  icon: "x"      },
};

const KIND_OPTIONS = ["cdc", "pv", "plan", "photo", "cad", "sheet", "slide", "design", "doc", "skip"];

// Mappe un kind vers le type planFile correspondant pour PlanManager.
const KIND_TO_PLANFILE_TYPE = {
  cdc: "pdf", pv: "pdf", plan: "pdf",
  photo: "image", cad: "cad",
  sheet: "sheet", slide: "slide", design: "design",
  doc: "doc",
};

const classifyFile = (file) => {
  const name = (file.name || "").toLowerCase();
  // Images en premier — peuvent devenir des photos chantier OU des plans selon le nom.
  if (file.type?.startsWith("image/") || IMG_EXT_RE.test(name)) {
    if (PLAN_RE.test(name)) return { kind: "plan" };
    return { kind: "photo" };
  }
  const isPdf = file.type === "application/pdf" || PDF_EXT_RE.test(name);
  if (isPdf) {
    if (CDC_RE.test(name)) return { kind: "cdc" };
    const pvMatch = name.match(PV_RE);
    if (pvMatch) {
      const num = pvMatch[1] ? parseInt(pvMatch[1], 10) : null;
      return { kind: "pv", number: num };
    }
    if (PLAN_RE.test(name)) return { kind: "plan" };
    return { kind: "doc" };
  }
  // Formats spécialisés — vont directement dans la bonne catégorie planFile.
  if (CAD_EXT_RE.test(name)) return { kind: "cad" };
  if (SHEET_EXT_RE.test(name)) return { kind: "sheet" };
  if (SLIDE_EXT_RE.test(name)) return { kind: "slide" };
  if (DESIGN_EXT_RE.test(name)) return { kind: "design" };
  if (DOC_EXT_RE.test(name)) return { kind: "doc" };
  // Format inconnu (bytes, exe, etc.) — on garde dans "doc" mais on prévient.
  if (ACCEPTED_RE.test(name)) return { kind: "doc" };
  return { kind: "skip", reason: "format non supporté" };
};

const fmtBytes = (b) => {
  if (b < 1024) return `${b} o`;
  if (b < 1048576) return `${Math.round(b / 1024)} Ko`;
  return `${(b / 1048576).toFixed(1)} Mo`;
};

const readAsDataURL = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = reject;
  r.readAsDataURL(file);
});

export function ImportProjectWizard({ open, onClose, profile, onImport }) {
  const [step, setStep] = useState("pick"); // pick | review | meta | creating
  const [items, setItems] = useState([]);   // [{ file, kind, number?, included, suggested }]
  const [folderName, setFolderName] = useState("");
  const [meta, setMeta] = useState({ name: "", client: "", contractor: "", city: "", startDate: "" });
  const [progress, setProgress] = useState(""); // texte affiché pendant la création
  const [err, setErr] = useState("");
  // Picker dossier créé dynamiquement à chaque clic — React filtre les
  // attributs HTML non-standard sur les inputs JSX. En créant l'input en
  // JS pur au moment du clic, les attributs webkitdirectory/directory
  // sont garantis présents avant que le picker s'ouvre.
  const openFolderPicker = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
    input.setAttribute("mozdirectory", "");
    input.style.display = "none";
    input.onchange = (e) => {
      const files = e.target.files;
      if (files && files.length > 0) handlePickDir(files);
      document.body.removeChild(input);
    };
    document.body.appendChild(input);
    input.click();
  };

  // Picker ZIP — un seul fichier .zip contenant l'arborescence du projet.
  // jszip extrait en mémoire ; on transforme chaque entrée en File pour
  // réutiliser le même classement que pour un dossier.
  const openZipPicker = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".zip,application/zip";
    input.style.display = "none";
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      document.body.removeChild(input);
      if (!file) return;
      try {
        setStep("creating");
        setProgress("Extraction du ZIP…");
        const JSZip = (await import("jszip")).default;
        const zip = await JSZip.loadAsync(file);
        const baseName = (file.name || "projet.zip").replace(/\.zip$/i, "");
        // Entrées non-dossier uniquement, on préserve le path relatif
        const entries = Object.values(zip.files).filter(z => !z.dir);
        const fakeFiles = [];
        for (let i = 0; i < entries.length; i++) {
          const z = entries[i];
          setProgress(`Extraction ${i + 1}/${entries.length} — ${z.name}…`);
          const blob = await z.async("blob");
          // On reconstruit un File avec un webkitRelativePath pour réutiliser
          // la logique du picker dossier. Le 1er segment du path prend le nom
          // du ZIP (sans extension) si pas déjà présent.
          const cleanPath = z.name.startsWith(baseName + "/") ? z.name : `${baseName}/${z.name}`;
          const f = new File([blob], z.name.split("/").pop(), { type: blob.type });
          Object.defineProperty(f, "webkitRelativePath", { value: cleanPath });
          fakeFiles.push(f);
        }
        if (fakeFiles.length === 0) {
          setErr("L'archive ZIP est vide.");
          setStep("pick");
          return;
        }
        setProgress("");
        handlePickDir(fakeFiles);
      } catch (zipErr) {
        console.error("ZIP extract failed:", zipErr);
        setErr("Impossible de lire ce ZIP. Vérifie qu'il n'est pas protégé par mot de passe.");
        setStep("pick");
      }
    };
    document.body.appendChild(input);
    input.click();
  };

  const reset = () => {
    setStep("pick");
    setItems([]);
    setFolderName("");
    setMeta({ name: "", client: "", contractor: "", city: "", startDate: "" });
    setProgress("");
    setErr("");
  };

  const close = () => { reset(); onClose?.(); };

  const handlePickDir = (fileList) => {
    if (!fileList || fileList.length === 0) return;
    // Le 1er segment du webkitRelativePath est le nom du dossier
    const firstPath = fileList[0]?.webkitRelativePath || "";
    const folder = firstPath.split("/")[0] || "";
    setFolderName(folder);
    const classified = Array.from(fileList).map(file => {
      const c = classifyFile(file);
      return { file, kind: c.kind, number: c.number || null, included: c.kind !== "skip", suggested: c.kind };
    });
    // CdC : on garde le PLUS GROS PDF classé "cdc" (cas où plusieurs matchent)
    // Tous les autres "cdc" sont rétrogradés en "doc".
    const cdcCandidates = classified.filter(c => c.kind === "cdc");
    if (cdcCandidates.length > 1) {
      cdcCandidates.sort((a, b) => b.file.size - a.file.size);
      cdcCandidates.slice(1).forEach(c => { c.kind = "doc"; c.suggested = "doc"; });
    }
    setItems(classified);
    setMeta(m => ({ ...m, name: folder.replace(/[_-]+/g, " ").trim() || m.name }));
    setStep("review");
  };

  const updateKind = (idx, newKind) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, kind: newKind, included: newKind !== "skip" } : it));
  };

  const counts = useMemo(() => {
    const acc = { cdc: 0, pv: 0, plan: 0, photo: 0, doc: 0, skip: 0 };
    for (const it of items) {
      const k = it.included ? it.kind : "skip";
      if (acc[k] !== undefined) acc[k]++;
    }
    return acc;
  }, [items]);

  const totalIncludedBytes = useMemo(() =>
    items.filter(it => it.included).reduce((s, it) => s + it.file.size, 0),
  [items]);

  const goCreate = () => {
    if (!meta.name.trim()) {
      setErr("Donne un nom au projet pour continuer.");
      return;
    }
    if (counts.cdc > 1) {
      setErr("Un seul cahier des charges par projet — vérifie les classements.");
      return;
    }
    setErr("");
    setStep("creating");
    runImport();
  };

  const runImport = async () => {
    try {
      setProgress("Préparation…");

      // CdC : lire en dataUrl + extraire le texte (pour le chatbot)
      const cdcItem = items.find(it => it.included && it.kind === "cdc");
      let cahierDesCharges = null;
      if (cdcItem) {
        setProgress("Lecture du cahier des charges…");
        const dataUrl = await readAsDataURL(cdcItem.file);
        let extractedText = "";
        try {
          extractedText = await extractPdfText(cdcItem.file);
        } catch (extractErr) {
          console.warn("CdC extraction failed:", extractErr);
        }
        cahierDesCharges = {
          fileName: cdcItem.file.name,
          size: cdcItem.file.size,
          mimeType: "application/pdf",
          dataUrl,
          extractedText,
          uploadedAt: new Date().toISOString(),
          uploadedBy: profile?.name || profile?.email || "—",
        };
      }

      // PV : on garde juste le PDF + le numéro détecté ; pas d'extraction IA
      // ici (l'archi peut le faire individuellement via "Importer un PV").
      const pvItems = items.filter(it => it.included && it.kind === "pv");
      // Tri par numéro détecté (les plus grands en premier = plus récents
      // en convention archi). Ceux sans numéro vont à la fin.
      pvItems.sort((a, b) => (b.number || 0) - (a.number || 0));
      const pvHistory = [];
      for (let i = 0; i < pvItems.length; i++) {
        const it = pvItems[i];
        setProgress(`Lecture des PV (${i + 1}/${pvItems.length})…`);
        const dataUrl = await readAsDataURL(it.file);
        // Numérotation : si pas détectée, on génère depuis la fin
        const number = it.number ?? (pvItems.length - i);
        pvHistory.push({
          number,
          date: new Date().toLocaleDateString("fr-BE"),
          author: profile?.name || "—",
          postsCount: 0,
          excerpt: `PV importé — ${it.file.name}`,
          content: "",
          pdfDataUrl: dataUrl,
          fileName: it.file.name,
          imported: true,
          status: "sent",
        });
      }

      // Documents — convertis directement au format planFiles[] pour qu'ils
      // soient visibles dans l'onglet Documents (PlanManager) sans migration.
      // Chaque kind est mappé vers le type planFile correspondant. Les photos
      // partent dans gallery[] (hors planFiles, géré par GalleryView).
      const planFiles = [];
      const gallery = [];
      const docItems = items.filter(it => it.included && it.kind !== "cdc" && it.kind !== "pv");
      for (let i = 0; i < docItems.length; i++) {
        const it = docItems[i];
        setProgress(`Lecture des documents (${i + 1}/${docItems.length})…`);
        const dataUrl = await readAsDataURL(it.file);
        const ext = (it.file.name.split(".").pop() || "").toLowerCase();
        if (it.kind === "photo") {
          gallery.push({
            id: Date.now() + Math.random(),
            dataUrl,
            date: new Date().toISOString(),
          });
        } else {
          planFiles.push({
            id: Date.now() + Math.random(),
            type: KIND_TO_PLANFILE_TYPE[it.kind] || "other",
            name: it.file.name,
            parentId: null,
            dataUrl,
            size: it.file.size,
            ext,
            createdAt: new Date().toISOString(),
          });
        }
      }

      setProgress("Création du projet…");
      onImport?.({
        meta,
        cahierDesCharges,
        pvHistory,
        planFiles,
        gallery,
      });
      // La modale est fermée par le parent quand le projet est créé,
      // ici on laisse le state sur "creating" — l'utilisateur ne reverra
      // pas la modale puisqu'elle se ferme.
    } catch (importErr) {
      console.error("Import failed:", importErr);
      setErr("Échec de l'import. Réessaie.");
      setStep("review");
    }
  };

  return (
    <Modal open={open} onClose={close} title="Importer un projet depuis un dossier" wide>
      {step === "pick" && (
        <div style={{ display: "flex", flexDirection: "column", gap: SP.md }}>
          <p style={{ fontSize: FS.sm, color: TX2, lineHeight: 1.6, margin: 0 }}>
            Sélectionne un dossier de ton ordinateur. ArchiPilot va scanner tous les fichiers et
            les classer automatiquement (cahier des charges, anciens PV, plans, photos, documents).
            Tu pourras ajuster le classement avant de confirmer.
          </p>
          <div style={{ padding: `${SP.md}px ${SP.md + 2}px`, background: SB, border: `1px dashed ${SBB}`, borderRadius: RAD.lg, fontSize: FS.sm, color: TX3, lineHeight: 1.6 }}>
            <strong style={{ color: TX2 }}>Formats supportés :</strong> PDF, images (JPG/PNG/WEBP/HEIC/TIFF/SVG), Word (.docx/.doc), Excel (.xlsx/.csv), PowerPoint, CAO (DWG/DXF/SketchUp/Revit/IFC), Design (PSD/AI/Figma).
          </div>
          <div style={{ display: "flex", gap: SP.sm, flexWrap: "wrap" }}>
            <button
              onClick={openFolderPicker}
              style={{ padding: "10px 18px", border: "none", borderRadius: 8, background: AC, color: "#fff", fontSize: FS.sm, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              <Ico name="folder" size={14} color="#fff" />Sélectionner un dossier
            </button>
            <button
              onClick={openZipPicker}
              style={{ padding: "10px 18px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, color: TX2, fontSize: FS.sm, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              <Ico name="upload" size={14} color={TX2} />Importer un ZIP
            </button>
          </div>
        </div>
      )}

      {step === "review" && (
        <div style={{ display: "flex", flexDirection: "column", gap: SP.md }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: SP.sm, fontSize: FS.sm, color: TX2 }}>
            <span><strong>{folderName}</strong> · {items.length} fichiers · {fmtBytes(totalIncludedBytes)}</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: SP.xs }}>
            {Object.entries(counts).filter(([, n]) => n > 0).map(([k, n]) => (
              <span key={k} style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "4px 10px", borderRadius: 999,
                background: KIND_META[k].bg,
                color: KIND_META[k].color,
                fontSize: FS.xs, fontWeight: 600,
              }}>
                {n} {KIND_META[k].label}{n > 1 ? "s" : ""}
              </span>
            ))}
          </div>
          {totalIncludedBytes > 80 * 1024 * 1024 && (
            <div role="alert" style={{ padding: "10px 12px", background: BRB, border: `1px solid ${REDBRD}`, borderRadius: 8, fontSize: FS.sm, color: BR }}>
              Volume important ({fmtBytes(totalIncludedBytes)}). Pense à exclure les photos haute résolution si possible.
            </div>
          )}
          <div style={{ maxHeight: 360, overflowY: "auto", border: `1px solid ${SBB}`, borderRadius: 8 }}>
            {items.map((it, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 12px",
                borderBottom: i < items.length - 1 ? `1px solid ${SB2}` : "none",
                opacity: it.included ? 1 : 0.5,
              }}>
                <Ico name={KIND_META[it.kind].icon} size={12} color={KIND_META[it.kind].color} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: FS.sm, color: TX, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={it.file.name}>
                    {it.file.name}
                  </div>
                  <div style={{ fontSize: FS.xs, color: TX3 }}>
                    {fmtBytes(it.file.size)}
                    {it.kind === "pv" && it.number ? ` · n°${it.number} détecté` : ""}
                  </div>
                </div>
                <select
                  value={it.kind}
                  onChange={(e) => updateKind(i, e.target.value)}
                  style={{ padding: "4px 8px", border: `1px solid ${SBB}`, borderRadius: 6, fontSize: FS.xs, background: WH, color: TX2, fontFamily: "inherit" }}
                >
                  {KIND_OPTIONS.map(k => (
                    <option key={k} value={k}>{KIND_META[k].label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {err && <div role="alert" style={{ color: BR, fontSize: FS.sm }}>{err}</div>}
          <div style={{ display: "flex", justifyContent: "space-between", gap: SP.sm }}>
            <button onClick={() => setStep("pick")} style={{ padding: "8px 16px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, color: TX2, fontSize: FS.sm, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
              Re-sélectionner un dossier
            </button>
            <button onClick={() => setStep("meta")} style={{ padding: "8px 18px", border: "none", borderRadius: 8, background: AC, color: "#fff", fontSize: FS.sm, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Suivant — meta du projet
            </button>
          </div>
        </div>
      )}

      {step === "meta" && (
        <div style={{ display: "flex", flexDirection: "column", gap: SP.md }}>
          <p style={{ fontSize: FS.sm, color: TX2, margin: 0 }}>
            Quelques infos pour créer le projet. Tu pourras tout modifier ensuite depuis l'écran Informations.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: SP.sm }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: FS.xs, fontWeight: 600, color: TX3, textTransform: "uppercase", letterSpacing: "0.06em" }}>Nom du projet *</span>
              <input value={meta.name} onChange={(e) => setMeta(m => ({ ...m, name: e.target.value }))} style={{ padding: "9px 11px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: FS.sm, fontFamily: "inherit", background: WH }} />
            </label>
            <div style={{ display: "flex", gap: SP.sm }}>
              <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: FS.xs, fontWeight: 600, color: TX3, textTransform: "uppercase", letterSpacing: "0.06em" }}>Maître d'ouvrage</span>
                <input value={meta.client} onChange={(e) => setMeta(m => ({ ...m, client: e.target.value }))} style={{ padding: "9px 11px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: FS.sm, fontFamily: "inherit", background: WH }} />
              </label>
              <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: FS.xs, fontWeight: 600, color: TX3, textTransform: "uppercase", letterSpacing: "0.06em" }}>Entreprise</span>
                <input value={meta.contractor} onChange={(e) => setMeta(m => ({ ...m, contractor: e.target.value }))} style={{ padding: "9px 11px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: FS.sm, fontFamily: "inherit", background: WH }} />
              </label>
            </div>
            <div style={{ display: "flex", gap: SP.sm }}>
              <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: FS.xs, fontWeight: 600, color: TX3, textTransform: "uppercase", letterSpacing: "0.06em" }}>Ville</span>
                <input value={meta.city} onChange={(e) => setMeta(m => ({ ...m, city: e.target.value }))} style={{ padding: "9px 11px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: FS.sm, fontFamily: "inherit", background: WH }} />
              </label>
              <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: FS.xs, fontWeight: 600, color: TX3, textTransform: "uppercase", letterSpacing: "0.06em" }}>Date de début</span>
                <DatePicker variant="field" value={meta.startDate} onChange={(v) => setMeta(m => ({ ...m, startDate: v }))} placeholder="jj/mm/aaaa" />
              </label>
            </div>
          </div>
          {err && <div role="alert" style={{ color: BR, fontSize: FS.sm }}>{err}</div>}
          <div style={{ display: "flex", justifyContent: "space-between", gap: SP.sm }}>
            <button onClick={() => setStep("review")} style={{ padding: "8px 16px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, color: TX2, fontSize: FS.sm, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
              Retour
            </button>
            <button onClick={goCreate} style={{ padding: "8px 18px", border: "none", borderRadius: 8, background: AC, color: "#fff", fontSize: FS.sm, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Créer le projet
            </button>
          </div>
        </div>
      )}

      {step === "creating" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 16px", gap: SP.md }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: ACL, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${ACL2}` }}>
            <div style={{ width: 22, height: 22, border: `3px solid ${AC}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          </div>
          <div style={{ fontSize: FS.md, fontWeight: 700, color: TX, textAlign: "center" }}>{progress || "Création du projet…"}</div>
          <div style={{ fontSize: FS.sm, color: TX3, textAlign: "center", maxWidth: 320, lineHeight: 1.5 }}>
            Ne ferme pas cet onglet. Selon le volume des fichiers, ça peut prendre une dizaine de secondes.
          </div>
        </div>
      )}
    </Modal>
  );
}
