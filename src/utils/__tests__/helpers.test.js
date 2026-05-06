import { describe, it, expect } from "vitest";
import { parseNotesToRemarks, getDocCurrent, cleanPvOutput, nextPvNumber } from "../helpers";

describe("parseNotesToRemarks", () => {
  it("splits notes by newline and creates remarks", () => {
    const result = parseNotesToRemarks("Remarque 1\nRemarque 2\nRemarque 3");
    expect(result).toHaveLength(3);
    expect(result[0].text).toBe("Remarque 1");
    expect(result[1].text).toBe("Remarque 2");
    expect(result[2].text).toBe("Remarque 3");
  });

  it("filters out empty lines", () => {
    const result = parseNotesToRemarks("Remarque 1\n\n\nRemarque 2");
    expect(result).toHaveLength(2);
  });

  it("strips leading dashes and arrows", () => {
    const result = parseNotesToRemarks("- Dash remark\n– En dash remark\n> Urgent remark");
    expect(result[0].text).toBe("Dash remark");
    expect(result[1].text).toBe("En dash remark");
    expect(result[2].text).toBe("Urgent remark");
  });

  it("marks lines starting with > as urgent", () => {
    const result = parseNotesToRemarks("> Urgent\nNormal");
    expect(result[0].urgent).toBe(true);
    expect(result[1].urgent).toBe(false);
  });

  it("sets all remarks to open status", () => {
    const result = parseNotesToRemarks("Test");
    expect(result[0].status).toBe("open");
  });

  it("assigns unique ids", () => {
    const result = parseNotesToRemarks("A\nB\nC");
    const ids = result.map(r => r.id);
    expect(new Set(ids).size).toBe(3);
  });
});

describe("cleanPvOutput", () => {
  it("returns empty for null/undefined", () => {
    expect(cleanPvOutput(null)).toBe("");
    expect(cleanPvOutput(undefined)).toBe("");
    expect(cleanPvOutput("")).toBe("");
  });

  it("strips bold/italic markdown", () => {
    const out = cleanPvOutput("01. Test\n01.1 **Bold** and *italic* text");
    expect(out).toContain("Bold and italic text");
    expect(out).not.toContain("**");
    expect(out).not.toContain("*");
  });

  it("strips heading markdown ###", () => {
    const out = cleanPvOutput("### 01. Situation\n01.1 Peinture rdc");
    expect(out).not.toContain("###");
    expect(out).toContain("01. Situation");
  });

  it("drops PROJET / CLIENT / ENTREPRISE / DATE / PRÉSENTS / DESTINATAIRES headers", () => {
    const input = `PROJET : Test 1
CLIENT : Antho
ENTREPRISE : Besix
ADRESSE : Rebecq
DATE : 05/05/2026
PV n°1
PRÉSENTS : Gaëlle CNOP
DESTINATAIRES : Tous
01. Situation
01.1 Peinture rdc`;
    const out = cleanPvOutput(input);
    expect(out).not.toMatch(/PROJET\s*:/i);
    expect(out).not.toMatch(/CLIENT\s*:/i);
    expect(out).not.toMatch(/ENTREPRISE\s*:/i);
    expect(out).not.toMatch(/ADRESSE\s*:/i);
    expect(out).not.toMatch(/DATE\s*:/i);
    expect(out).not.toMatch(/^\s*PV\s*n[°o]/im);
    expect(out).not.toMatch(/PRÉSENTS\s*:/i);
    expect(out).not.toMatch(/DESTINATAIRES\s*:/i);
    expect(out).toContain("01. Situation");
    expect(out).toContain("01.1 Peinture rdc");
  });

  it("drops generic intro/conclusion sentences", () => {
    const input = `Le présent procès-verbal a été établi pour faire état de la situation.
01. Situation
01.1 Peinture rdc OK
Les interventions requises sont attendues dans les meilleurs délais.`;
    const out = cleanPvOutput(input);
    expect(out).not.toMatch(/le présent procès-verbal/i);
    expect(out).not.toMatch(/interventions requises sont attendues/i);
  });

  it("renumbers unnumbered remarks under section", () => {
    const input = `01. Situation
peinture rdc OK
goulottes en cours
03. Planning
réception phase 1 repoussée`;
    const out = cleanPvOutput(input);
    expect(out).toContain("01.1 peinture rdc OK");
    expect(out).toContain("01.2 goulottes en cours");
    expect(out).toContain("03.1 réception phase 1 repoussée");
  });

  it("preserves correct numbering when model emits it correctly", () => {
    const input = `01. Situation
01.1 Peinture rdc
01.2 Goulottes en cours`;
    const out = cleanPvOutput(input);
    expect(out).toContain("01.1 Peinture rdc");
    expect(out).toContain("01.2 Goulottes en cours");
  });

  it("collapses 3+ blank lines to 2", () => {
    const out = cleanPvOutput("01. Test\n01.1 a\n\n\n\n02. Other\n02.1 b");
    expect(out.match(/\n{3,}/)).toBe(null);
  });

  it("removes -- separator lines", () => {
    const out = cleanPvOutput("01. Test\n--\n01.1 content");
    expect(out).not.toContain("--");
  });
});

describe("getDocCurrent", () => {
  it("returns base document data when no versions", () => {
    const doc = { dataUrl: "data:test", size: 100, type: "pdf", addedAt: "2026-01-01" };
    const current = getDocCurrent(doc);
    expect(current.dataUrl).toBe("data:test");
    expect(current.size).toBe(100);
    expect(current.version).toBe(1);
  });

  it("returns latest version when versions exist", () => {
    const doc = {
      dataUrl: "old",
      size: 50,
      type: "pdf",
      addedAt: "2026-01-01",
      versions: [
        { dataUrl: "v1", size: 100, type: "pdf", addedAt: "2026-02-01" },
        { dataUrl: "v2", size: 200, type: "pdf", addedAt: "2026-03-01" },
      ],
    };
    const current = getDocCurrent(doc);
    expect(current.dataUrl).toBe("v2");
    expect(current.size).toBe(200);
    expect(current.version).toBe(2);
  });

  it("returns version 1 for empty versions array", () => {
    const doc = { dataUrl: "data:test", size: 100, type: "pdf", addedAt: "2026-01-01", versions: [] };
    const current = getDocCurrent(doc);
    expect(current.dataUrl).toBe("data:test");
    expect(current.version).toBe(1);
  });
});

describe("nextPvNumber", () => {
  it("returns 1 for empty history", () => {
    expect(nextPvNumber([])).toBe(1);
    expect(nextPvNumber(undefined)).toBe(1);
    expect(nextPvNumber(null)).toBe(1);
  });

  it("returns max+1 from a contiguous list", () => {
    expect(nextPvNumber([{ number: 1 }, { number: 2 }, { number: 3 }])).toBe(4);
  });

  it("returns max+1 even when a number is missing in the middle", () => {
    // PV n°2 was deleted — next must be 6, not 5 (length+1 would be wrong)
    expect(nextPvNumber([{ number: 1 }, { number: 3 }, { number: 4 }, { number: 5 }])).toBe(6);
  });

  it("ignores entries without a numeric number", () => {
    expect(nextPvNumber([{ number: 5 }, { number: undefined }, { number: "abc" }])).toBe(6);
  });

  it("handles string numbers", () => {
    expect(nextPvNumber([{ number: "7" }, { number: "3" }])).toBe(8);
  });
});
