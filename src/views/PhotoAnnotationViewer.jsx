import { useCallback, useMemo } from "react";
import { PlanViewer } from "./PlanViewer";

/**
 * PhotoAnnotationViewer — reuses the PlanViewer UI to annotate a photo.
 *
 * The photo is shaped as a pseudo-"plan" project (planImage / planStrokes),
 * and a proxy setProjects persists changes back onto the correct photo in
 * project.posts[postId].photos[photoId]:
 *   - planStrokes  → photo.strokes  (drawing overlay)
 *   - pins         → photo.pins     (remark markers)
 *
 * Each photo has its own independent pins + strokes. Nothing is shared with
 * post.remarks or planFiles[].remarks.
 */
export function PhotoAnnotationViewer({ photo, project, setProjects, postId, onBack }) {
  // Present the photo as a pseudo-plan so PlanViewer can render it.
  const photoAsPlan = useMemo(() => ({
    ...project,
    planImage: photo.dataUrl || photo.url,
    planMarkers: [],
    planStrokes: photo.strokes || [],
  }), [project, photo]);

  // Proxy setProjects: PlanViewer updates planStrokes on a virtual project,
  // we persist them back onto the real photo.
  const proxySetProjects = useCallback((fn) => {
    setProjects((prev) => {
      const virtualPrev = prev.map((p) => p.id === project.id ? photoAsPlan : p);
      const virtualNext = typeof fn === "function" ? fn(virtualPrev) : virtualPrev;
      const updated = virtualNext.find((p) => p.id === project.id);
      if (!updated) return prev;
      return prev.map((p) => {
        if (p.id !== project.id) return p;
        return {
          ...p,
          posts: (p.posts || []).map((post) => post.id !== postId ? post : {
            ...post,
            photos: (post.photos || []).map((ph) => ph.id !== photo.id ? ph : {
              ...ph,
              strokes: updated.planStrokes || [],
            }),
          }),
        };
      });
    });
  }, [setProjects, project.id, postId, photo.id, photoAsPlan]);

  // Read/write pins directly on the photo.
  const photoPins = useMemo(() => {
    const ph = project.posts?.find((p) => p.id === postId)?.photos?.find((x) => x.id === photo.id);
    return ph?.pins || [];
  }, [project, postId, photo.id]);

  const onPhotoPinsChange = useCallback((updater) => {
    setProjects((prev) => prev.map((p) => {
      if (p.id !== project.id) return p;
      return {
        ...p,
        posts: (p.posts || []).map((post) => post.id !== postId ? post : {
          ...post,
          photos: (post.photos || []).map((ph) => ph.id !== photo.id ? ph : {
            ...ph,
            pins: typeof updater === "function" ? updater(ph.pins || []) : updater,
          }),
        }),
      };
    }));
  }, [setProjects, project.id, postId, photo.id]);

  return (
    <PlanViewer
      project={photoAsPlan}
      setProjects={proxySetProjects}
      planRemarks={photoPins}
      onPlanRemarksChange={onPhotoPinsChange}
      onBack={onBack}
      hideUpload
    />
  );
}
