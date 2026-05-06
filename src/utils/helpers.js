export const parseNotesToRemarks = (notes) =>
  notes.split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => ({
      id: Date.now() + Math.random(),
      text: l.replace(/^[-–>]\s*/, ""),
      urgent: l.startsWith(">"),
      status: "open",
    }));

// Strip the most common markdown markers so a generated PV's first 100
// characters render as readable plain text in the history excerpt.
export const stripMarkdown = (s) =>
  String(s || "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^[>\-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();

// Defensive cleanup of the PV body returned by the AI. Even with strict
// system prompts, models sometimes regress — we strip markdown, drop
// header/boilerplate lines, normalise list markers, and force a coherent
// "PP.N" numbering when the model forgets it.
export const cleanPvOutput = (raw) => {
  if (!raw) return "";
  let text = String(raw);

  // 1. Strip line-level markdown markers (headings, blockquotes, hrules)
  text = text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .replace(/^-{2,}\s*$/gm, "")
    .replace(/^\s*[-*+]\s+/gm, ""); // bullet markers at line start

  // 2. Strip inline markdown (bold/italic/underline/code)
  text = text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1")
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1");

  // 3. Drop boilerplate header lines the model might emit despite the rules.
  //    Pattern: "MOT-CLÉ : valeur" sur une ligne dédiée, où MOT-CLÉ est l'un
  //    des champs de l'en-tête (déjà rendus par le PDF generator).
  const headerKeys = /^\s*(?:projet|chantier|client|maître d'ouvrage|m\.o\.|mo|entreprise|adresse|lieu|date|visite|présents|presents|absents|destinataires)\s*[:\-—]/i;
  // Lignes "PV n°X" / "Procès-Verbal n°X" autonomes (sans deux-points)
  const standaloneRefRe = /^\s*(?:pv|procès[- ]verbal|proces[- ]verbal)\s*n\s*[°ºoO]?\s*\d+\s*$/i;
  text = text
    .split("\n")
    .filter(line => !headerKeys.test(line) && !standaloneRefRe.test(line))
    .join("\n");

  // 4. Drop generic intro/conclusion sentences. We pattern-match common
  //    fillers since this is the most frequent regression.
  const boilerplate = [
    /^.*?(le présent (procès[- ]verbal|compte[- ]rendu|pv)|cette réunion a permis|cette visite a permis|en synthèse|en conclusion).*$/gim,
    /^.*?(les interventions (requises|nécessaires) sont attendues|la prochaine réunion (sera|aura lieu)|merci de votre (collaboration|attention)).*$/gim,
  ];
  for (const re of boilerplate) text = text.replace(re, "");

  // 5. Force "NN.X" numbering on remarks when the model forgets it.
  //    We walk lines, track the current section number, and renumber.
  const lines = text.split("\n");
  const out = [];
  let currentSection = null;
  let remarkCounter = 0;
  const sectionRe = /^\s*(\d{1,3})\s*\.\s*(.+?)\s*$/;
  const numberedRemarkRe = /^\s*(\d{1,3})\.(\d+)\s+(.*)$/;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) {
      out.push("");
      continue;
    }
    const sec = line.match(sectionRe);
    if (sec && !numberedRemarkRe.test(line)) {
      // New section header
      currentSection = sec[1].padStart(2, "0");
      remarkCounter = 0;
      out.push(`${currentSection}. ${sec[2]}`);
      continue;
    }
    if (currentSection) {
      const numbered = line.match(numberedRemarkRe);
      if (numbered) {
        // Keep model's numbering if the section matches; otherwise renumber.
        const provided = numbered[1].padStart(2, "0");
        if (provided === currentSection) {
          remarkCounter++;
          out.push(`${currentSection}.${remarkCounter} ${numbered[3]}`);
          continue;
        }
      }
      // Unnumbered remark — auto-number
      remarkCounter++;
      out.push(`${currentSection}.${remarkCounter} ${line.trim()}`);
    } else {
      // Stray content before any section — keep but don't number
      out.push(line);
    }
  }
  text = out.join("\n");

  // 6. Collapse 3+ consecutive blank lines into 1.
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  return text;
};

export const getDocCurrent = (doc) => {
  if (doc.versions && doc.versions.length > 0) {
    const v = doc.versions[doc.versions.length - 1];
    return { dataUrl: v.dataUrl, size: v.size, type: v.type, addedAt: v.addedAt, version: doc.versions.length };
  }
  return { dataUrl: doc.dataUrl, size: doc.size, type: doc.type, addedAt: doc.addedAt, version: 1 };
};
