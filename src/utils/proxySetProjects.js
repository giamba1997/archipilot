/**
 * Shared helper for the "reshape a nested item as a pseudo-plan project,
 * let PlanViewer edit it, then write the result back" pattern used by
 * PlanManager (plan files), GalleryView (gallery photos) and
 * PhotoAnnotationViewer (photos attached to posts).
 *
 * makeProxyPlanSetProjects(setProjects, projectId, pseudoProject, writeBack)
 *   → a setProjects-shaped function suitable for PlanViewer's `setProjects`
 *     prop. It:
 *       1. swaps the real project with `pseudoProject` in the virtual array,
 *       2. runs the updater `fn` on that virtual array,
 *       3. takes the updated virtual project,
 *       4. calls `writeBack(originalProject, updatedVirtualProject)` so the
 *          caller can persist the relevant fields back where they truly
 *          belong (planFiles[i], gallery[i], posts[i].photos[i], …).
 *
 * Only the target project is replaced; other projects pass through.
 */
export function makeProxyPlanSetProjects(setProjects, projectId, pseudoProject, writeBack) {
  return (fn) => {
    setProjects((prev) => {
      const virtualPrev = prev.map((p) => p.id === projectId ? pseudoProject : p);
      const virtualNext = typeof fn === "function" ? fn(virtualPrev) : virtualPrev;
      const updated = virtualNext.find((p) => p.id === projectId);
      if (!updated) return prev;
      return prev.map((p) => p.id === projectId ? writeBack(p, updated) : p);
    });
  };
}
