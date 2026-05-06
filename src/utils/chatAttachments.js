// Process files dropped/picked into the chat for sending to ask-archipilot.
//
// 2 catégories :
//   image  → resize + base64 (vision API d'OpenAI gère ces formats nativement)
//   text   → extraction texte (PDF via pdfjs ; .txt brut tel quel)
//
// On limite la taille pour ne pas saturer le budget tokens. Les vrais cas
// d'usage archi sont : photo chantier, scan d'un PV ancien, devis PDF.

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;       // 5 MB en entrée
const MAX_PDF_BYTES   = 12 * 1024 * 1024;      // 12 MB en entrée
const IMAGE_MAX_DIM   = 1600;                  // resize si plus grand que ça
const PDF_MAX_PAGES   = 30;                    // limite extraction
const PDF_MAX_TEXT    = 30000;                 // ~30k chars envoyés au modèle

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
]);
const SUPPORTED_PDF_TYPES = new Set(["application/pdf"]);
const SUPPORTED_TEXT_TYPES = new Set([
  "text/plain", "text/csv", "text/markdown",
]);

export const isAttachmentSupported = (file) => {
  if (!file) return false;
  return (
    SUPPORTED_IMAGE_TYPES.has(file.type) ||
    SUPPORTED_PDF_TYPES.has(file.type) ||
    SUPPORTED_TEXT_TYPES.has(file.type) ||
    /\.(pdf|txt|md|csv)$/i.test(file.name) ||
    /\.(jpe?g|png|webp|gif)$/i.test(file.name)
  );
};

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

const readFileAsArrayBuffer = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsArrayBuffer(file);
});

const readFileAsText = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsText(file);
});

// Resize une image trop grande pour rester dans des budgets tokens raisonnables.
// On utilise canvas — perte JPEG acceptable pour de la lecture par l'IA.
const resizeImage = async (file) => {
  const dataUrl = await readFileAsDataUrl(file);
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = img;
      const maxDim = Math.max(width, height);
      if (maxDim <= IMAGE_MAX_DIM) {
        // Déjà OK, on garde le dataUrl original
        resolve(dataUrl);
        return;
      }
      const scale = IMAGE_MAX_DIM / maxDim;
      const w = Math.round(width * scale);
      const h = Math.round(height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      // Force JPEG pour réduire la taille (la qualité 0.85 est suffisante
      // pour de la vision low-detail).
      const out = canvas.toDataURL("image/jpeg", 0.85);
      resolve(out);
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
};

// Extraction texte d'un PDF via pdfjs-dist (déjà dans deps pour PDFPreview).
const extractPdfText = async (file) => {
  const pdfjs = await import("pdfjs-dist");
  // Worker setup — vite gère bien l'import direct du worker en dev/build.
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const buf = await readFileAsArrayBuffer(file);
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const pageCount = Math.min(doc.numPages, PDF_MAX_PAGES);
  const out = [];
  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(it => it.str || "").join(" ");
    out.push(pageText);
    if (out.join("\n").length > PDF_MAX_TEXT) break;
  }
  let combined = out.join("\n\n").slice(0, PDF_MAX_TEXT);
  if (doc.numPages > PDF_MAX_PAGES) {
    combined += `\n\n[Document plus long que ${PDF_MAX_PAGES} pages — seules les premières pages sont incluses.]`;
  }
  return combined;
};

// Process un fichier en payload pour ask-archipilot. Retourne un objet
// { type, name, dataUrl?, content? } ou throw si format/taille refusés.
export const processAttachment = async (file) => {
  if (!file) throw new Error("Fichier manquant.");

  const ext = (file.name || "").toLowerCase();
  const isImg = SUPPORTED_IMAGE_TYPES.has(file.type) || /\.(jpe?g|png|webp|gif)$/i.test(ext);
  const isPdf = SUPPORTED_PDF_TYPES.has(file.type) || /\.pdf$/i.test(ext);
  const isText = SUPPORTED_TEXT_TYPES.has(file.type) || /\.(txt|md|csv)$/i.test(ext);

  if (isImg) {
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error(`Image trop lourde (${Math.round(file.size / 1024 / 1024)} Mo). Limite : 5 Mo.`);
    }
    const dataUrl = await resizeImage(file);
    return {
      type: "image",
      name: file.name || "image",
      mimeType: file.type || "image/jpeg",
      dataUrl,
      // Pour preview UI uniquement
      previewUrl: dataUrl,
    };
  }

  if (isPdf) {
    if (file.size > MAX_PDF_BYTES) {
      throw new Error(`PDF trop lourd (${Math.round(file.size / 1024 / 1024)} Mo). Limite : 12 Mo.`);
    }
    const content = await extractPdfText(file);
    if (!content?.trim()) {
      throw new Error("Aucun texte n'a pu être extrait du PDF (peut-être un PDF scanné ?).");
    }
    return {
      type: "text",
      name: file.name || "document.pdf",
      mimeType: "application/pdf",
      content,
    };
  }

  if (isText) {
    if (file.size > MAX_PDF_BYTES) {
      throw new Error(`Fichier trop lourd. Limite : 12 Mo.`);
    }
    const raw = await readFileAsText(file);
    return {
      type: "text",
      name: file.name || "document.txt",
      mimeType: file.type || "text/plain",
      content: raw.slice(0, PDF_MAX_TEXT),
    };
  }

  throw new Error(`Format non supporté : ${file.type || file.name}. Formats acceptés : images (JPG/PNG/WEBP), PDF, texte.`);
};

// Format octets pour affichage UI ("1,2 Mo")
export const formatBytes = (bytes) => {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
};
