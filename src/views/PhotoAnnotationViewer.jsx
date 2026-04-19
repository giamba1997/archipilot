import { useCallback, useMemo, useState } from "react";
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
  // DEBUG: last save attempt + count
  const [dbg, setDbg] = useState({ count: 0, last: "—" });
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
    setDbg((d) => ({ count: d.count + 1, last: "onPhotoPinsChange appelé" }));
    setProjects((prev) => prev.map((p) => {
      if (p.id !== project.id) return p;
      const post = (p.posts || []).find((po) => po.id === postId);
      const ph = post?.photos?.find((x) => x.id === photo.id);
      if (!ph) {
        setDbg((d) => ({ ...d, last: `Photo introuvable! postId=${postId} photoId=${photo.id}` }));
        return p;
      }
      const nextPins = typeof updater === "function" ? updater(ph.pins || []) : updater;
      setDbg((d) => ({ ...d, last: `pins: ${(ph.pins || []).length} → ${nextPins.length}` }));
      return {
        ...p,
        posts: (p.posts || []).map((po) => po.id !== postId ? po : {
          ...po,
          photos: (po.photos || []).map((pho) => pho.id !== photo.id ? pho : {
            ...pho,
            pins: nextPins,
          }),
        }),
      };
    }));
  }, [setProjects, project.id, postId, photo.id]);

  return (
    <div style={{ position: "relative" }}>
      {/* DEBUG — à retirer une fois OK */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, background: "#DCFCE7", color: "#14532D", padding: "4px 12px", fontSize: 11, fontFamily: "monospace", display: "flex", gap: 14, flexWrap: "wrap", borderBottom: "1px solid #16A34A", zIndex: 9999 }}>
        <span>PhotoAnnotationViewer actif</span>
        <span>photoId: <b>{String(photo?.id).slice(0, 14)}</b></span>
        <span>postId: <b>{String(postId)}</b></span>
        <span>pins lus: <b>{photoPins.length}</b></span>
        <span>saves: <b>{dbg.count}</b></span>
        <span>→ {dbg.last}</span>
      </div>
      <PlanViewer
        project={photoAsPlan}
        setProjects={proxySetProjects}
        planRemarks={photoPins}
        onPlanRemarksChange={onPhotoPinsChange}
        onBack={onBack}
        hideUpload
      />
    </div>
  );
}
