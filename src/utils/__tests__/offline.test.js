import { describe, it, expect, beforeEach } from "vitest";
import { getOfflineQueue, addToOfflineQueue, clearOfflineQueue, getPvDrafts, savePvDraft, removePvDraft, syncReservePhotosToStorage } from "../offline";

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

describe("syncReservePhotosToStorage", () => {
  const upOk = async (d) => ({ url: `https://cdn/${d.length}` });
  const upFail = async () => { throw new Error("offline"); };

  it("returns null when no reserve has a dataURL photo", async () => {
    const projects = [{ id: 1, reserves: [{ id: "r", photos: ["https://cdn/x"] }] }];
    expect(await syncReservePhotosToStorage(projects, upOk)).toBeNull();
  });

  it("returns null for invalid inputs", async () => {
    expect(await syncReservePhotosToStorage(null, upOk)).toBeNull();
    expect(await syncReservePhotosToStorage([{ reserves: [{ photos: ["data:x"] }] }], null)).toBeNull();
  });

  it("re-uploads dataURL photos and replaces them with the returned URL", async () => {
    const projects = [{ id: 1, reserves: [{ id: "r1", photos: ["data:abc", "https://cdn/keep"] }] }];
    const out = await syncReservePhotosToStorage(projects, upOk);
    expect(out).not.toBeNull();
    expect(out[0].reserves[0].photos[0]).toBe("https://cdn/8"); // "data:abc".length
    expect(out[0].reserves[0].photos[1]).toBe("https://cdn/keep"); // non-data laissé tel quel
  });

  it("keeps the dataURL when the upload fails (never loses the photo)", async () => {
    const projects = [{ id: 1, reserves: [{ id: "r1", photos: ["data:abc"] }] }];
    expect(await syncReservePhotosToStorage(projects, upFail)).toBeNull(); // rien migré => null
  });

  it("does not mutate the input projects", async () => {
    const projects = [{ id: 1, reserves: [{ id: "r1", photos: ["data:abc"] }] }];
    await syncReservePhotosToStorage(projects, upOk);
    expect(projects[0].reserves[0].photos[0]).toBe("data:abc"); // original intact
  });
});
