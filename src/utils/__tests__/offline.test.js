import { describe, it, expect, beforeEach } from "vitest";
import { getOfflineQueue, addToOfflineQueue, clearOfflineQueue, getPvDrafts, savePvDraft, removePvDraft } from "../offline";

beforeEach(() => {
  localStorage.clear();
});

describe("Offline Queue", () => {
  it("returns empty array when no queue exists", () => {
    expect(getOfflineQueue()).toEqual([]);
  });

  it("adds items to the queue", () => {
    addToOfflineQueue({ type: "save", data: "test" });
    const queue = getOfflineQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].type).toBe("save");
    expect(queue[0].data).toBe("test");
    expect(queue[0].id).toBeDefined();
    expect(queue[0].createdAt).toBeDefined();
  });

  it("appends multiple items", () => {
    addToOfflineQueue({ type: "a" });
    addToOfflineQueue({ type: "b" });
    expect(getOfflineQueue()).toHaveLength(2);
  });

  it("clears the queue", () => {
    addToOfflineQueue({ type: "a" });
    clearOfflineQueue();
    expect(getOfflineQueue()).toEqual([]);
  });

  it("handles corrupted localStorage gracefully", () => {
    localStorage.setItem("archipilot_offline_queue", "not-json");
    expect(getOfflineQueue()).toEqual([]);
  });
});

describe("PV Drafts", () => {
  it("returns empty array when no drafts exist", () => {
    expect(getPvDrafts()).toEqual([]);
  });

  it("saves a draft", () => {
    savePvDraft({ content: "Test PV", projectId: 1 });
    const drafts = getPvDrafts();
    expect(drafts).toHaveLength(1);
    expect(drafts[0].content).toBe("Test PV");
    expect(drafts[0].id).toBeDefined();
    expect(drafts[0].savedAt).toBeDefined();
  });

  it("removes a draft by id", () => {
    savePvDraft({ content: "A" });
    const drafts = getPvDrafts();
    const id = drafts[0].id;
    removePvDraft(id);
    expect(getPvDrafts()).toHaveLength(0);
  });

  it("only removes the specified draft", () => {
    savePvDraft({ content: "A" });
    // Ensure distinct ids by manually setting the second draft
    const draftsAfterA = getPvDrafts();
    const secondDraft = { content: "B", id: 999999, savedAt: new Date().toISOString() };
    localStorage.setItem("archipilot_pv_drafts", JSON.stringify([...draftsAfterA, secondDraft]));
    removePvDraft(draftsAfterA[0].id);
    const remaining = getPvDrafts();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].content).toBe("B");
  });

  it("handles corrupted localStorage gracefully", () => {
    localStorage.setItem("archipilot_pv_drafts", "{bad}");
    expect(getPvDrafts()).toEqual([]);
  });
});
