import { useState, useRef } from "react";
import { AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, RD, GR, SP, FS, RAD, DIS, BR, BRB, AM, AMB, SG, SGB } from "../constants/tokens";
import { getReserveStatus, getReserveSeverity } from "../constants/statuses";
import { isEnabled } from "../constants/featureFlags";
import { Ico, MobileConsultationBanner } from "../components/ui";
import { useIsMobile } from "../hooks/useIsMobile";
import { uploadPhoto, deletePhoto, getPhotoUrl } from "../db";
import { PlanViewer } from "./PlanViewer";
import { makeProxyPlanSetProjects } from "../utils/proxySetProjects";

// GalleryView supporte 2 modes (similaire à PlanManager) :
//   - Standalone (view="gallery" dans App.jsx) : annotation photo en plein
//     écran via state local activePhotoId.
//   - Embarqué (onglet Photos) : `onAnnotatePhoto(photoId)` délègue au parent
//     qui redirige vers la vue standalone (PlanViewer photo a besoin du plein
//     écran). `autoAction = { photoId }` permet de pré-ouvrir l'annotation.
export function GalleryView({ project, setProjects, onBack, onAnnotatePhoto, autoAction, showToast }) {
  const isMobile = useIsMobile();
  const uploadRef = useRef(null);
  const [activePhotoId, setActivePhotoId] = useState(autoAction?.photoId || null); // open in PlanViewer
  const [lightbox, setLightbox] = useState(null); // simple preview
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(new Set());
  // F/S6 — photo en cours de liaison à une réserve (id du photo, ou null)
  const [linkingPhoto, setLinkingPhoto] = useState(null);
  const photos = (project.gallery || []).slice().reverse();
  const reserves = project.reserves || [];

  // Toggle le lien d'une photo vers une réserve. Stockage : un array
  // `linkedReserves` sur le photo (forme libre, no migration nécessaire).
  // Pas de duplication côté reserve.photos — l'affichage OprView scanne
  // gallery pour reconstruire le set complet de photos liées.
  const toggleReserveLink = (photoId, reserveId) => {
    setProjects(prev => prev.map(p => {
      if (p.id !== project.id) return p;
      return {
        ...p,
        gallery: (p.gallery || []).map(ph => {
          if (ph.id !== photoId) return ph;
          const cur = new Set(ph.linkedReserves || []);
          if (cur.has(reserveId)) cur.delete(reserveId); else cur.add(reserveId);
          return { ...ph, linkedReserves: [...cur] };
        }),
      };
    }));
  };

  const toggleSelect = (id) => setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const selectAll = () => setSelected(new Set(photos.map(p => p.id)));
  const exitSelect = () => { setSelecting(false); setSelected(new Set()); };
  const deleteSelected = () => {
    selected.forEach(id => {
      const photo = photos.find(ph => ph.id === id);
      if (photo?.storagePath) deletePhoto(photo.storagePath);
    });
    setProjects(prev => prev.map(p => p.id === project.id ? { ...p, gallery: (p.gallery || []).filter(ph => !selected.has(ph.id)) } : p));
    exitSelect();
  };

  const addPhotos = (files) => {
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = ev.target.result;
        const photoId = Date.now() + Math.random();
        const photo = { id: photoId, dataUrl, date: new Date().toISOString() };
        setProjects(prev => prev.map(p => p.id === project.id ? { ...p, gallery: [...(p.gallery || []), photo] } : p));
        if (navigator.onLine) {
          const result = await uploadPhoto(dataUrl);
          if (result) {
            // Retire le dataUrl base64 après upload (pas de persistance JSONB).
            setProjects(prev => prev.map(p => p.id === project.id ? { ...p, gallery: (p.gallery || []).map(ph => {
              if (ph.id !== photoId) return ph;
              const { dataUrl: _drop, ...rest } = ph;
              return { ...rest, url: result.url, storagePath: result.storagePath };
            }) } : p));
          }
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removePhoto = (photoId) => {
    const photo = photos.find(ph => ph.id === photoId);
    if (photo?.storagePath) deletePhoto(photo.storagePath);
    setProjects(prev => prev.map(p => p.id === project.id ? { ...p, gallery: (p.gallery || []).filter(ph => ph.id !== photoId) } : p));
    if (lightbox === photoId) setLightbox(null);
  };

  // ── PlanViewer mode: same pattern as PlanManager ──
  const activePhoto = photos.find(ph => ph.id === activePhotoId);
  if (activePhoto) {
    const photoProject = {
      ...project,
      planImage: getPhotoUrl(activePhoto),
      planMarkers: activePhoto.markers || [],
      planStrokes: activePhoto.strokes || [],
    };
    const photoSetProjects = makeProxyPlanSetProjects(setProjects, project.id, photoProject, (p, updated) => ({
      ...p,
      gallery: (p.gallery || []).map(ph => ph.id !== activePhotoId ? ph : {
        ...ph,
        markers: updated.planMarkers || [],
        strokes: updated.planStrokes || [],
        annotated: (updated.planMarkers || []).length > 0 || (updated.planStrokes || []).length > 0,
      }),
    }));
    // Located remarks on this photo — persisted per-photo on gallery[i].pins,
    // independent from plan remarks and post remarks.
    const photoPins = activePhoto.pins || [];
    const onPhotoPinsChange = (updater) => setProjects(prev => prev.map(p => {
      if (p.id !== project.id) return p;
      return {
        ...p,
        gallery: (p.gallery || []).map(ph => ph.id !== activePhotoId ? ph : {
          ...ph, pins: typeof updater === "function" ? updater(ph.pins || []) : updater,
        }),
      };
    }));
    return (
      <PlanViewer
        project={photoProject}
        setProjects={photoSetProjects}
        planRemarks={photoPins}
        onPlanRemarksChange={onPhotoPinsChange}
        onBack={() => setActivePhotoId(null)}
        hideUpload
      />
    );
  }

  const lbPhoto = lightbox ? photos.find(ph => ph.id === lightbox) : null;
  const lbIdx = lightbox ? photos.findIndex(ph => ph.id === lightbox) : -1;

  return (
    <div style={{ animation: "fadeIn 0.2s ease" }}>
      {/* Header — bouton retour seulement en standalone (onBack fourni). En
          mode embarqué, le bouton "x" ne sert qu'à sortir de la sélection. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {(onBack || selecting) && (
            <button onClick={selecting ? exitSelect : onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 8, minWidth: 40, minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, flexShrink: 0 }}>
              <Ico name={selecting ? "x" : "back"} color={TX2} size={16} />
            </button>
          )}
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: TX, letterSpacing: "-0.3px" }}>
              {selecting ? `${selected.size} sélectionnée${selected.size !== 1 ? "s" : ""}` : "Photos du chantier"}
            </div>
            {!selecting && <div style={{ fontSize: 12, color: TX3 }}>{photos.length} photo{photos.length !== 1 ? "s" : ""}</div>}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {selecting ? (
            <>
              <button onClick={selected.size === photos.length ? () => setSelected(new Set()) : selectAll} style={{ padding: "7px 14px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: TX2 }}>
                {selected.size === photos.length ? "Désélectionner" : "Tout sélectionner"}
              </button>
              <button onClick={() => { if (selected.size > 0 && confirm(`Supprimer ${selected.size} photo${selected.size > 1 ? "s" : ""} ? Cette action est définitive.`)) deleteSelected(); }} disabled={selected.size === 0} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", border: "none", borderRadius: 8, background: selected.size > 0 ? RD : DIS, cursor: selected.size > 0 ? "pointer" : "default", fontFamily: "inherit" }}>
                <Ico name="trash" size={13} color="#fff" />
                <span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>Supprimer{selected.size > 0 ? ` (${selected.size})` : ""}</span>
              </button>
            </>
          ) : (
            <>
              {!isMobile && photos.length > 0 && (
                <button onClick={() => setSelecting(true)} style={{ padding: "7px 14px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: TX2 }}>
                  Sélectionner
                </button>
              )}
              {!isMobile && (
                <button onClick={() => uploadRef.current?.click()} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", border: "none", borderRadius: 8, background: AC, cursor: "pointer", fontFamily: "inherit" }}>
                  <Ico name="plus" size={14} color="#fff" />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>Ajouter</span>
                </button>
              )}
            </>
          )}
        </div>
        <input ref={uploadRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
      </div>

      {isMobile && <MobileConsultationBanner hint="upload bureau, ou utilise la capture rapide pour ajouter une photo." />}

      {/* Gallery grid — 4 per row */}
      {photos.length === 0 ? (
        <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 12, padding: "60px 20px", textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: SB, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <Ico name="camera" size={26} color={TX3} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: TX, marginBottom: 4 }}>Aucune photo</div>
          <div style={{ fontSize: 13, color: TX3, marginBottom: 16 }}>Ajoutez des photos de votre chantier pour les retrouver ici</div>
          {!isMobile && (
            <button onClick={() => uploadRef.current?.click()} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 20px", border: "none", borderRadius: 8, background: AC, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: "#fff" }}>
              <Ico name="plus" size={14} color="#fff" />Ajouter des photos
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
          {photos.map(ph => {
            const isSel = selected.has(ph.id);
            const hasAnnotations = (ph.markers?.length > 0) || (ph.strokes?.length > 0) || ph.annotated;
            return (
              <div key={ph.id} style={{ position: "relative", aspectRatio: "1", borderRadius: 10, overflow: "hidden", background: SB, cursor: "pointer", border: `2px solid ${selecting && isSel ? AC : SBB}`, transition: "border-color 0.15s" }} onClick={() => selecting ? toggleSelect(ph.id) : setLightbox(ph.id)}>
                <img src={getPhotoUrl(ph)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: selecting && isSel ? 0.7 : 1, transition: "opacity 0.15s" }} />
                {/* Selection checkbox */}
                {selecting && (
                  <div style={{ position: "absolute", top: 6, left: 6, width: 22, height: 22, borderRadius: 6, background: isSel ? AC : "rgba(255,255,255,0.85)", border: `2px solid ${isSel ? AC : "rgba(0,0,0,0.2)"}`, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>
                    {isSel && <Ico name="check" size={12} color="#fff" />}
                  </div>
                )}
                {/* Annotated badge */}
                {hasAnnotations && (
                  <div style={{ position: "absolute", top: 6, right: 6, padding: "2px 6px", borderRadius: 4, background: AC, display: "flex", alignItems: "center", gap: 3 }}>
                    <Ico name="edit" size={9} color="#fff" />
                    <span style={{ fontSize: 9, fontWeight: 600, color: "#fff" }}>Annoté</span>
                  </div>
                )}
                {/* Réserve(s) liée(s) — badge en bas-gauche pour éviter chevauchement
                    avec le badge "Annoté" en haut-droite */}
                {isEnabled("opr") && (ph.linkedReserves || []).length > 0 && (
                  <div style={{ position: "absolute", top: 6, left: 6, padding: "2px 6px", borderRadius: 4, background: BR, display: "flex", alignItems: "center", gap: 3 }}>
                    <Ico name="alert" size={9} color="#fff" />
                    <span style={{ fontSize: 9, fontWeight: 600, color: "#fff" }}>
                      {ph.linkedReserves.length === 1 ? "1 réserve" : `${ph.linkedReserves.length} réserves`}
                    </span>
                  </div>
                )}
                {/* Badge mic — photo annotée vocalement pendant une visite */}
                {ph.voiceAnnotated && (
                  <div title="Photo avec annotation vocale" style={{ position: "absolute", bottom: 6, right: 6, width: 22, height: 22, borderRadius: "50%", background: AC, display: "flex", alignItems: "center", justifyContent: "center", border: "1.5px solid #fff", boxShadow: "0 1px 3px rgba(0,0,0,0.3)", zIndex: 2 }}>
                    <Ico name="mic" size={10} color="#fff" />
                  </div>
                )}
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "16px 8px 6px", background: "linear-gradient(transparent, rgba(0,0,0,0.45))" }}>
                  <span style={{ fontSize: 10, color: "#fff", fontWeight: 500 }}>{new Date(ph.date).toLocaleDateString("fr-BE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox */}
      {lbPhoto && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.85)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }} onClick={() => setLightbox(null)}>
          {/* Top bar */}
          <div onClick={e => e.stopPropagation()} style={{ position: "absolute", top: 0, left: 0, right: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", zIndex: 2 }}>
            <span style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>{lbIdx + 1} / {photos.length} — {new Date(lbPhoto.date).toLocaleDateString("fr-BE", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
            <div style={{ display: "flex", gap: 8 }}>
              {!isMobile && (
                <button onClick={() => {
                  setLightbox(null);
                  if (onAnnotatePhoto) onAnnotatePhoto(lbPhoto.id);
                  else setActivePhotoId(lbPhoto.id);
                }} style={{ padding: "6px 12px", border: "none", borderRadius: 6, background: AC, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}>
                  <Ico name="edit" size={13} color="#fff" />
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#fff" }}>Annoter</span>
                </button>
              )}
              {/* Lier à une réserve — disponible quand le projet a au moins
                  une réserve. Affichage simple sur mobile (badge non-cliquable),
                  édition bureau seulement. */}
              {isEnabled("opr") && !isMobile && reserves.length > 0 && (
                <button onClick={() => setLinkingPhoto(lbPhoto.id)} style={{ padding: "6px 12px", border: "none", borderRadius: 6, background: "rgba(255,255,255,0.15)", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}>
                  <Ico name="alert" size={13} color="#fff" />
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#fff" }}>
                    {(lbPhoto.linkedReserves || []).length > 0
                      ? `Lien (${lbPhoto.linkedReserves.length})`
                      : "Lier à une réserve"}
                  </span>
                </button>
              )}
              {!isMobile && (
                <button onClick={() => { if (confirm("Supprimer cette photo ? Cette action est définitive.")) removePhoto(lbPhoto.id); }} style={{ padding: "6px 12px", border: "none", borderRadius: 6, background: "rgba(255,255,255,0.15)", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}>
                  <Ico name="trash" size={13} color="#fff" />
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#fff" }}>Supprimer</span>
                </button>
              )}
              <button onClick={() => setLightbox(null)} style={{ width: 36, height: 36, border: "none", borderRadius: 8, background: "rgba(255,255,255,0.15)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Ico name="x" size={16} color="#fff" />
              </button>
            </div>
          </div>
          {/* Prev / Next */}
          {lbIdx > 0 && (
            <button onClick={e => { e.stopPropagation(); setLightbox(photos[lbIdx - 1].id); }} style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>
              <Ico name="back" size={18} color="#fff" />
            </button>
          )}
          {lbIdx < photos.length - 1 && (
            <button onClick={e => { e.stopPropagation(); setLightbox(photos[lbIdx + 1].id); }} style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>
              <Ico name="arrowr" size={18} color="#fff" />
            </button>
          )}
          {/* Image */}
          <img src={getPhotoUrl(lbPhoto)} alt="" onClick={e => e.stopPropagation()} style={{ maxWidth: "90vw", maxHeight: "80vh", objectFit: "contain", borderRadius: 8 }} />
          {/* Caption / annotation (vocale ou tapée) — bandeau bas semi-transparent */}
          {lbPhoto.caption && (
            <div onClick={e => e.stopPropagation()} style={{
              position: "absolute", bottom: 24, left: 16, right: 16, maxWidth: 720, margin: "0 auto",
              padding: "12px 14px",
              background: "rgba(0,0,0,0.65)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
              borderRadius: 10,
              display: "flex", alignItems: "flex-start", gap: 10,
              zIndex: 2,
            }}>
              {lbPhoto.voiceAnnotated && (
                <div style={{ width: 22, height: 22, borderRadius: "50%", background: AC, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Ico name="mic" size={11} color="#fff" />
                </div>
              )}
              <div style={{ fontSize: 13, color: "#fff", lineHeight: 1.5, flex: 1, minWidth: 0 }}>
                {lbPhoto.caption}
              </div>
            </div>
          )}
        </div>
      )}

      {/* F/S6 — Modale "Lier à une réserve" (POC : réserves différées) */}
      {isEnabled("opr") && linkingPhoto && (() => {
        const photo = photos.find(ph => ph.id === linkingPhoto);
        if (!photo) return null;
        const linked = new Set(photo.linkedReserves || []);
        // Tri : réserves ouvertes (non levées) d'abord, puis partielles, puis levées
        const orderStatus = (s) => s === "non_levee" ? 0 : s === "partiellement_levee" ? 1 : 2;
        const sorted = [...reserves].sort((a, b) => orderStatus(a.status) - orderStatus(b.status) || (a.code || "").localeCompare(b.code || ""));
        return (
          <div onClick={() => setLinkingPhoto(null)} style={{ position: "fixed", inset: 0, zIndex: 320, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: WH, borderRadius: 14, width: "100%", maxWidth: 480, maxHeight: "85vh", display: "flex", flexDirection: "column", fontFamily: "inherit" }}>
              <div style={{ padding: "18px 20px 14px", borderBottom: `1px solid ${SBB}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: TX }}>Lier la photo à une réserve</div>
                  <div style={{ fontSize: 11, color: TX3, marginTop: 2 }}>
                    {linked.size === 0 ? "Sélectionne une ou plusieurs réserves" : `${linked.size} réserve${linked.size > 1 ? "s" : ""} liée${linked.size > 1 ? "s" : ""}`}
                  </div>
                </div>
                <button onClick={() => setLinkingPhoto(null)} style={{ background: SB, border: `1px solid ${SBB}`, cursor: "pointer", padding: 6, borderRadius: 8 }}>
                  <Ico name="x" size={14} color={TX2} />
                </button>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
                {sorted.length === 0 ? (
                  <div style={{ padding: 30, textAlign: "center", fontSize: 12, color: TX3 }}>
                    Aucune réserve pour l'instant. Crée une réserve dans la vue OPR pour pouvoir lier des photos.
                  </div>
                ) : (
                  sorted.map(r => {
                    const isLinked = linked.has(r.id);
                    const st = getReserveStatus(r.status);
                    const sev = getReserveSeverity(r.severity);
                    return (
                      <button
                        key={r.id}
                        onClick={() => {
                          toggleReserveLink(linkingPhoto, r.id);
                          showToast?.(isLinked ? `${r.code || "Réserve"} déliée` : `Photo liée à ${r.code || "la réserve"}`);
                        }}
                        style={{
                          display: "flex", alignItems: "center", gap: 10,
                          width: "100%", padding: "10px 12px",
                          border: `1px solid ${isLinked ? ACL2 : SBB}`,
                          background: isLinked ? ACL : WH,
                          borderRadius: 10,
                          marginBottom: 6,
                          cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                          transition: "all 0.15s",
                        }}
                      >
                        <div style={{
                          width: 22, height: 22, borderRadius: 6,
                          border: `2px solid ${isLinked ? AC : SBB}`,
                          background: isLinked ? AC : WH,
                          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                        }}>
                          {isLinked && <Ico name="check" size={12} color="#fff" />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: TX, fontFamily: "ui-monospace, monospace" }}>{r.code || "?"}</span>
                            <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: sev.bg, color: sev.color, fontWeight: 600 }}>{sev.label}</span>
                            <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: st.bg, color: st.color, fontWeight: 600 }}>{st.label}</span>
                          </div>
                          <div style={{ fontSize: 12, color: TX2, lineHeight: 1.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {r.description || "(sans description)"}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
              <div style={{ padding: "12px 20px", borderTop: `1px solid ${SBB}`, display: "flex", justifyContent: "flex-end" }}>
                <button onClick={() => setLinkingPhoto(null)} style={{ padding: "9px 18px", border: "none", borderRadius: 9, background: AC, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  Terminé
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
