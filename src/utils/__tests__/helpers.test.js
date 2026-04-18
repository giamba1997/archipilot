import { describe, it, expect } from "vitest";
import { parseNotesToRemarks, getDocCurrent } from "../helpers";

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
