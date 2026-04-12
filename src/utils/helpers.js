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

export const getDocCurrent = (doc) => {
  if (doc.versions && doc.versions.length > 0) {
    const v = doc.versions[doc.versions.length - 1];
    return { dataUrl: v.dataUrl, size: v.size, type: v.type, addedAt: v.addedAt, version: doc.versions.length };
  }
  return { dataUrl: doc.dataUrl, size: doc.size, type: doc.type, addedAt: doc.addedAt, version: 1 };
};
