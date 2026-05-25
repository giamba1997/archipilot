import { useState, useEffect, useRef } from "react";
import {
  AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, RD, GR,
  AM, AMB, ST, STB, BR, BRB, SG, SGB,
  DIS, DIST, REDBRD,
} from "../constants/tokens";
import { getReserveStatus, getReserveSeverity, RESERVE_SEVERITIES } from "../constants/statuses";
import { Ico } from "../components/ui";
import { uploadPhoto } from "../db";
import { useWhisperRecorder } from "../hooks/useWhisperRecorder";
import { useConversationRecorder, transcribeAudioBlob } from "../hooks/useConversationRecorder";
import {
  getActiveVisit,
  startVisit,
  endVisit,
  clearVisit,
  setPhase,
  setMeetingTranscript,
  togglePresent,
  logReserveAction,
  addNewReserve,
  addPhoto,
  addDecision,
  removeDecision,
  composeDraftPvFromVisit,
  getVisitStats,
} from "../utils/chantierVisit";
import { savePvDraft as savePvDraftLocal } from "../utils/offline";

// ── Mode Chantier — vue plein écran de visite ──────────────
//
// L'archi arrive sur chantier, tape "Démarrer la visite" depuis la home
// du projet. L'UI bascule en mode walk-through dédié :
//
//   - Chrono live depuis le début
//   - 3 actions tactiles : Photo / Note vocale / Réserve
//   - Pointage des présents
//   - Liste des réserves ouvertes avec boutons "Toujours présente" /
//     "Levée à cette visite"
//   - Sections live "Nouvelles réserves" et "Décisions"
//   - Bouton "Terminer la visite" qui compose un brouillon de PV
//
// État persisté en localStorage à chaque action (cf. chantierVisit.js).
// Les mutations métier (status réserves, nouvelles réserves, photos)
// vont DIRECTEMENT dans project.* via setProjects — la visite ne sert
// qu'à logger les actions pour la composition finale du PV.

export function ChantierModeView({ project, setProjects, profile, onBack, showToast }) {
  const [visit, setVisit] = useState(() => {
    const existing = getActiveVisit();
    if (existing && String(existing.projectId) === String(project.id) && !existing.endedAt) {
      return existing;
    }
    // Démarre une nouvelle visite avec les participants du projet
    return startVisit(project.id, project.participants || []);
  });

  // Re-render toutes les 30s pour mettre à jour le chrono affiché
  // (le chronomètre étant calculé depuis visit.startedAt).
  const [, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(i);
  }, []);

  // Sheets ouverts (photo, note vocale, nouvelle réserve, terminer)
  const [activeSheet, setActiveSheet] = useState(null); // null | "photo" | "voice" | "new-reserve" | "end"

  // Modal RGPD de transition vers la Phase 2 (réunion)
  const [showRgpdModal, setShowRgpdModal] = useState(false);

  // Phase courante : "inspection" (default) ou "reunion" (assis autour
  // de la table, enregistrement de la conversation). Bascule explicite.
  const phase = visit.phase || "inspection";

  // ── Mutations phase ──
  const onRequestMeeting = () => setShowRgpdModal(true);
  const onConfirmMeeting = () => {
    setVisit(v => setPhase(v, "reunion"));
    setShowRgpdModal(false);
  };
  const onResumeInspection = () => {
    setVisit(v => setPhase(v, "inspection"));
  };

  // ── Enregistrement de la conversation (Phase 2) ──
  // Le recorder vit au niveau de ChantierModeView pour persister à
  // travers les bascules inspection ↔ reunion. Démarrage automatique
  // au premier passage en "reunion" (après modal RGPD), pause si
  // l'archi repasse en inspection, resume au retour. Stop à la fin
  // de la visite via onEndVisit qui récupère le blob et déclenche
  // la transcription Whisper.
  const [recorderErrorMsg, setRecorderErrorMsg] = useState("");
  const [transcribing, setTranscribing] = useState(false);
  const conv = useConversationRecorder({
    onError: (code) => {
      if (code === "micDenied") setRecorderErrorMsg("Accès micro refusé — la réunion ne sera pas enregistrée. Tu peux toujours saisir les décisions manuellement.");
      else if (code === "noMic") setRecorderErrorMsg("Aucun micro détecté — la réunion ne sera pas enregistrée.");
      else setRecorderErrorMsg("Enregistrement audio indisponible — la réunion continue sans transcription.");
    },
  });

  useEffect(() => {
    if (phase === "reunion") {
      if (!conv.isRecording && !conv.error) {
        conv.start();
      } else if (conv.isRecording && conv.isPaused) {
        conv.resume();
      }
    } else if (phase === "inspection" && conv.isRecording && !conv.isPaused) {
      // Retour en inspection pendant la réunion : on PAUSE (pas stop).
      // Le blob continue d'exister, l'archi peut reprendre la réunion
      // sans avoir perdu l'audio.
      conv.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, conv.isRecording, conv.isPaused, conv.error]);

  // ── Mutations ──

  const onTogglePresent = (name) => setVisit(v => togglePresent(v, name));

  // Changer le statut d'une réserve : applique IMMÉDIATEMENT à project.reserves
  // ET logge l'action dans la visite pour la composition finale du PV.
  const onChangeReserveStatus = (reserveId, action) => {
    const targetStatus = action === "lifted" ? "levee" : "non_levee";
    setProjects(prev => prev.map(p => {
      if (p.id !== project.id) return p;
      return {
        ...p,
        reserves: (p.reserves || []).map(r => r.id !== reserveId ? r : {
          ...r,
          status: targetStatus,
          resolvedAt: targetStatus === "levee" ? new Date().toISOString() : null,
        }),
      };
    }));
    setVisit(v => logReserveAction(v, reserveId, action));
    const r = (project.reserves || []).find(rr => rr.id === reserveId);
    showToast?.(`${r?.code || "Réserve"} ${action === "lifted" ? "marquée levée" : "toujours présente"}`);
  };

  const onAddDecision = (text, source = "text") => {
    if (!text?.trim()) return;
    setVisit(v => addDecision(v, text, source));
    showToast?.("Décision notée");
  };

  const onRemoveDecision = (id) => setVisit(v => removeDecision(v, id));

  // Création d'une réserve pendant la visite — appelée depuis le
  // QuickReserveSheet. Crée la réserve immédiatement dans project.reserves
  // ET logge le created dans la visite.
  const onCreateReserve = (newRes) => {
    const code = `R-${String((project.reserves || []).length + 1).padStart(3, "0")}`;
    const reserve = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      code,
      description: newRes.description.trim(),
      severity: newRes.severity || "major",
      status: "non_levee",
      contractor: newRes.contractor || "",
      location: newRes.location || "",
      photos: newRes.photos || [],
      deadline: "",
      notes: "",
      createdAt: new Date().toISOString(),
      resolvedAt: null,
    };
    setProjects(prev => prev.map(p => p.id !== project.id ? p : {
      ...p,
      reserves: [...(p.reserves || []), reserve],
    }));
    setVisit(v => addNewReserve(v, reserve.id));
    showToast?.(`${code} créée`);
    setActiveSheet(null);
  };

  // Ajout d'une photo à la galerie projet + tag dans la visite.
  // `voiceAnnotated` distingue une caption issue de la dictée Whisper
  // (badge mic affiché dans la galerie + lightbox) d'un caption tapé.
  const onAddPhoto = async (dataUrl, caption = "", voiceAnnotated = false) => {
    const photoId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const photo = {
      id: photoId,
      dataUrl,
      date: new Date().toISOString(),
      caption,
      voiceAnnotated,
      // Tag de visite — utile pour le futur "filtre par visite" en galerie
      _visitId: visit.startedAt,
    };
    setProjects(prev => prev.map(p => p.id !== project.id ? p : {
      ...p,
      gallery: [...(p.gallery || []), photo],
    }));
    setVisit(v => addPhoto(v, photoId));

    // Upload async vers Supabase Storage
    if (navigator.onLine) {
      try {
        const result = await uploadPhoto(dataUrl);
        if (result) {
          setProjects(prev => prev.map(p => p.id !== project.id ? p : {
            ...p,
            gallery: (p.gallery || []).map(ph => ph.id === photoId ? { ...ph, url: result.url, storagePath: result.storagePath } : ph),
          }));
        }
      } catch { /* upload échoué — la photo reste en dataUrl local */ }
    }
  };

  // ── Terminer la visite ──
  //
  // Si une réunion (Phase 2) était active :
  //   1. Stop le recorder, récupère le blob webm
  //   2. Envoie à transcribe-audio (Whisper) — peut prendre quelques
  //      secondes selon la durée audio
  //   3. Persiste la transcription dans visit.meetingTranscript
  //
  // Puis compose le brouillon PV (qui inclura la transcription si
  // présente), sauve, clear, retour overview. On reste sur l'écran
  // pendant la transcription pour ne pas naviguer trop tôt — la UI
  // affiche un état "Transcription en cours…" via `transcribing`.
  const onEndVisit = async () => {
    let blob = null;
    if (conv.isRecording) {
      try { blob = await conv.stop(); } catch { blob = null; }
    }

    let workingVisit = visit;
    if (blob && blob.size > 0) {
      setTranscribing(true);
      try {
        const text = await transcribeAudioBlob(blob);
        if (text) {
          workingVisit = setMeetingTranscript(workingVisit, text);
          setVisit(workingVisit);
        }
      } catch (err) {
        console.error("Meeting transcription failed:", err);
        showToast?.("Transcription audio échouée — le brouillon est créé sans la conversation.", "error");
      } finally {
        setTranscribing(false);
      }
    }

    const finalVisit = endVisit();
    if (!finalVisit) {
      showToast?.("Aucune visite active", "error");
      return;
    }
    const content = composeDraftPvFromVisit(finalVisit, project);
    const pvNumber = (project.pvHistory || []).length + 1;
    const draft = {
      projectId: project.id,
      number: pvNumber,
      date: new Date().toLocaleDateString("fr-BE"),
      author: profile?.name || profile?.email || "Architecte",
      content,
      _fromVisit: true,
    };
    savePvDraftLocal(draft);
    clearVisit();
    showToast?.(`Visite terminée — brouillon PV n°${pvNumber} créé`);
    onBack?.();
  };

  // Annule la visite sans créer de PV (mais les mutations métier
  // restent — c'est seulement le log de visite qui est effacé).
  const onCancelVisit = () => {
    if (!confirm("Annuler la visite ? Les réserves modifiées seront conservées, mais aucun PV ne sera créé.")) return;
    clearVisit();
    showToast?.("Visite annulée");
    onBack?.();
  };

  if (!visit) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: TX3 }}>
        Impossible de démarrer une visite — une autre est déjà active sur un autre projet.
      </div>
    );
  }

  // Données dérivées
  const reserves = project.reserves || [];
  const openReserves = reserves.filter(r => r.status !== "levee");
  // Pour chaque réserve ouverte, son statut dans cette visite (action loggée)
  const actionByReserve = new Map(visit.reserveActions.map(a => [String(a.reserveId), a.action]));
  const newReserveIds = new Set(visit.newReserveIds);
  // Les "nouvelles réserves" sont celles créées pendant la visite
  const newReserves = reserves.filter(r => newReserveIds.has(r.id));
  const stats = getVisitStats(visit);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", animation: "fadeIn 0.2s ease", paddingBottom: 100 }}>
      {/* ── Header sticky — change d'allure selon la phase ──
          Inspection : fond blanc, chip ambre/pulse AC, sobre.
          Réunion    : fond rouge profond, chip ENR pulse blanche,
                       chrono de réunion mis en avant. */}
      <div style={{
        position: "sticky", top: 0, zIndex: 10,
        background: phase === "reunion" ? RD : WH,
        borderBottom: phase === "reunion" ? "none" : `1px solid ${SBB}`,
        padding: "10px 14px",
        display: "flex", alignItems: "center", gap: 10,
        color: phase === "reunion" ? "#fff" : TX,
      }}>
        <button onClick={onCancelVisit} title="Annuler la visite"
          style={{
            background: phase === "reunion" ? "rgba(255,255,255,0.16)" : SB,
            border: phase === "reunion" ? "1px solid rgba(255,255,255,0.25)" : `1px solid ${SBB}`,
            cursor: "pointer", padding: 7, minWidth: 36, minHeight: 36,
            display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8,
          }}>
          <Ico name="x" color={phase === "reunion" ? "#fff" : TX2} size={14} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 1 }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: phase === "reunion" ? "#fff" : AC,
              animation: "pulseDot 1.6s ease-in-out infinite",
            }} />
            <span style={{
              fontSize: 10, fontWeight: 700,
              color: phase === "reunion" ? "#fff" : AC,
              textTransform: "uppercase", letterSpacing: "0.06em",
            }}>
              {phase === "reunion"
                ? `● Enr · Réunion · ${stats.meetingDuration < 60 ? `${stats.meetingDuration} min` : `${Math.floor(stats.meetingDuration / 60)}h${String(stats.meetingDuration % 60).padStart(2, "0")}`}`
                : `Visite en cours · ${stats.duration < 60 ? `${stats.duration} min` : `${Math.floor(stats.duration / 60)}h${String(stats.duration % 60).padStart(2, "0")}`}`}
            </span>
          </div>
          <div style={{
            fontSize: 15, fontWeight: 700,
            color: phase === "reunion" ? "#fff" : TX,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {project.name}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulseDot {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.6; }
        }
      `}</style>

      <div style={{ padding: "14px" }}>

      {phase === "reunion" ? (
        <MeetingPhase stats={stats} recorder={conv} errorMsg={recorderErrorMsg} />
      ) : (
      <>
        {/* ── 3 boutons d'action tactiles ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 18 }}>
          <ActionButton
            icon="camera"
            label="Photo"
            count={stats.photos}
            onClick={() => setActiveSheet("photo")}
          />
          <ActionButton
            icon="mic"
            label="Note vocale"
            count={stats.decisions}
            onClick={() => setActiveSheet("voice")}
          />
          <ActionButton
            icon="alert"
            label="Réserve"
            count={stats.created}
            onClick={() => setActiveSheet("new-reserve")}
          />
        </div>

        {/* ── Stats récap ── */}
        {(stats.lifted > 0 || stats.still > 0 || stats.created > 0 || stats.decisions > 0) && (
          <div style={{
            background: SB, border: `1px solid ${SBB}`, borderRadius: 10,
            padding: "10px 12px", marginBottom: 18,
            display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11, color: TX3,
          }}>
            <StatPill value={stats.lifted} label="levées" color={SG} />
            <StatPill value={stats.still} label="toujours présentes" color={AM} />
            <StatPill value={stats.created} label="nouvelles" color={BR} />
            <StatPill value={stats.decisions} label="décisions" color={ST} />
            <StatPill value={stats.photos} label="photos" color={TX2} />
          </div>
        )}

        {/* ── Présents ── */}
        <Section title={`Présents (${visit.presents.filter(p => p.present).length}/${visit.presents.length})`}>
          {visit.presents.length === 0 ? (
            <div style={{ fontSize: 12, color: TX3, fontStyle: "italic", padding: "8px 0" }}>
              Aucun participant — ajoute-les via la modale participants du projet.
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {visit.presents.map((p, i) => (
                <button
                  key={i}
                  onClick={() => onTogglePresent(p.name)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "5px 10px",
                    border: `1px solid ${p.present ? SG : SBB}`,
                    background: p.present ? SGB : WH,
                    color: p.present ? SG : TX3,
                    borderRadius: 999, cursor: "pointer", fontFamily: "inherit",
                    fontSize: 11, fontWeight: 600,
                  }}
                >
                  <Ico name={p.present ? "check" : "x"} size={9} color={p.present ? SG : TX3} />
                  {p.role ? `${p.role}: ${p.name}` : p.name}
                </button>
              ))}
            </div>
          )}
        </Section>

        {/* ── Réserves ouvertes ── */}
        <Section title={`Réserves ouvertes (${openReserves.length})`}>
          {openReserves.length === 0 ? (
            <div style={{ fontSize: 12, color: TX3, fontStyle: "italic", padding: "8px 0" }}>
              Aucune réserve ouverte sur ce projet.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {openReserves.map(r => (
                <ReserveRow
                  key={r.id}
                  reserve={r}
                  action={actionByReserve.get(String(r.id))}
                  onLifted={() => onChangeReserveStatus(r.id, "lifted")}
                  onStill={() => onChangeReserveStatus(r.id, "still_present")}
                />
              ))}
            </div>
          )}
        </Section>

        {/* ── Nouvelles réserves créées pendant la visite ── */}
        {newReserves.length > 0 && (
          <Section title={`Nouvelles réserves (${newReserves.length})`}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {newReserves.map(r => {
                const sev = getReserveSeverity(r.severity);
                return (
                  <div key={r.id} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 12px", background: WH, border: `1px solid ${SBB}`, borderRadius: 10,
                  }}>
                    <div style={{ width: 4, height: 28, borderRadius: 2, background: sev.color, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: TX, fontFamily: "ui-monospace, monospace" }}>{r.code}</span>
                        <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 999, background: sev.bg, color: sev.color, fontWeight: 700 }}>{sev.label}</span>
                      </div>
                      <div style={{ fontSize: 12, color: TX, lineHeight: 1.4 }}>{r.description}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* ── Décisions ── */}
        {visit.decisions.length > 0 && (
          <Section title={`Décisions notées (${visit.decisions.length})`}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {visit.decisions.map(d => (
                <div key={d.id} style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "10px 12px", background: WH, border: `1px solid ${SBB}`, borderRadius: 10,
                }}>
                  <Ico name={d.source === "voice" ? "mic" : "pen2"} size={12} color={ST} />
                  <div style={{ flex: 1, fontSize: 12, color: TX, lineHeight: 1.5 }}>{d.text}</div>
                  <button onClick={() => onRemoveDecision(d.id)}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                    <Ico name="x" size={11} color={TX3} />
                  </button>
                </div>
              ))}
            </div>
          </Section>
        )}
      </>
      )}
      </div>

      {/* ── Sticky footer — 2 boutons selon la phase ──
          Inspection : "Terminer sans réunion" (secondaire) + "Passer
          à la réunion" (primaire, déclenche le modal RGPD).
          Réunion : "Reprendre l'inspection" (secondaire) + "Terminer
          la visite" (primaire, ouvre EndVisitSheet pour confirmer). */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: WH, borderTop: `1px solid ${SBB}`,
        padding: "12px 16px",
        display: "flex", gap: 8,
        boxShadow: "0 -4px 12px rgba(0, 0, 0, 0.05)",
        zIndex: 20,
      }}>
        {phase === "inspection" ? (
          <>
            <button
              onClick={() => setActiveSheet("end")}
              style={{
                flex: 1, padding: "13px 12px", border: `1px solid ${SBB}`, borderRadius: 10,
                background: WH, color: TX2, fontSize: 13, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Terminer sans réunion
            </button>
            <button
              onClick={onRequestMeeting}
              style={{
                flex: 1.4, padding: "13px 16px", border: "none", borderRadius: 10,
                background: AC, color: "#fff", fontSize: 14, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit",
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}
            >
              <Ico name="users" size={14} color="#fff" />
              Passer à la réunion
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onResumeInspection}
              style={{
                flex: 1, padding: "13px 12px", border: `1px solid ${SBB}`, borderRadius: 10,
                background: WH, color: TX2, fontSize: 13, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Reprendre l'inspection
            </button>
            <button
              onClick={() => setActiveSheet("end")}
              style={{
                flex: 1.4, padding: "13px 16px", border: "none", borderRadius: 10,
                background: AC, color: "#fff", fontSize: 14, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit",
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}
            >
              <Ico name="check" size={14} color="#fff" />
              Terminer la visite
            </button>
          </>
        )}
      </div>

      {/* ── Sheets / Modals ── */}
      {activeSheet === "photo" && (
        <PhotoSheet onClose={() => setActiveSheet(null)} onSubmit={onAddPhoto} />
      )}
      {activeSheet === "voice" && (
        <VoiceSheet onClose={() => setActiveSheet(null)} onSubmit={onAddDecision} showToast={showToast} />
      )}
      {activeSheet === "new-reserve" && (
        <NewReserveSheet
          contractors={[...new Set([
            ...reserves.map(r => r.contractor).filter(Boolean),
            ...(project.participants || []).filter(p => p.role !== "Architecte").map(p => p.name),
          ])]}
          onClose={() => setActiveSheet(null)}
          onSubmit={onCreateReserve}
        />
      )}
      {activeSheet === "end" && (
        <EndVisitSheet
          stats={stats}
          transcribing={transcribing}
          onCancel={() => setActiveSheet(null)}
          onConfirm={onEndVisit}
        />
      )}
      {showRgpdModal && (
        <RgpdConfirmModal
          onCancel={() => setShowRgpdModal(false)}
          onConfirm={onConfirmMeeting}
        />
      )}
    </div>
  );
}

// ── Sous-composants ─────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: TX3,
        textTransform: "uppercase", letterSpacing: "0.06em",
        marginBottom: 8,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function ActionButton({ icon, label, count, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
      padding: "16px 8px",
      border: `1px solid ${SBB}`, background: WH,
      borderRadius: 12, cursor: "pointer", fontFamily: "inherit",
      position: "relative",
      transition: "all 0.15s",
    }}
      onMouseDown={e => { e.currentTarget.style.transform = "scale(0.97)"; }}
      onMouseUp={e => { e.currentTarget.style.transform = "scale(1)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 10, background: ACL,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Ico name={icon} size={18} color={AC} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: TX }}>{label}</span>
      {count > 0 && (
        <span style={{
          position: "absolute", top: 8, right: 8,
          minWidth: 18, height: 18, borderRadius: 999,
          background: AC, color: "#fff",
          fontSize: 9, fontWeight: 800,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "0 5px",
        }}>{count}</span>
      )}
    </button>
  );
}

function StatPill({ value, label, color }) {
  if (!value) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <strong style={{ color, fontSize: 13, fontWeight: 800 }}>{value}</strong>
      <span style={{ fontSize: 11, color: TX3 }}>{label}</span>
    </span>
  );
}

function ReserveRow({ reserve, action, onLifted, onStill }) {
  const sev = getReserveSeverity(reserve.severity);
  const isLifted = action === "lifted";
  const isStill = action === "still_present";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 12px",
      background: isLifted ? SGB : isStill ? AMB : WH,
      border: `1px solid ${isLifted ? SG + "44" : isStill ? AM + "44" : SBB}`,
      borderRadius: 10,
      transition: "all 0.15s",
    }}>
      <div style={{ width: 4, height: 36, borderRadius: 2, background: sev.color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: TX, fontFamily: "ui-monospace, monospace" }}>{reserve.code}</span>
          {reserve.contractor && (
            <span style={{ fontSize: 10, color: TX3 }}>· {reserve.contractor}</span>
          )}
        </div>
        <div style={{ fontSize: 12, color: TX, lineHeight: 1.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {reserve.description}
        </div>
      </div>
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        <button
          onClick={onStill}
          title="Toujours présente"
          style={{
            padding: "6px 10px", border: `1px solid ${isStill ? AM : SBB}`,
            background: isStill ? AM : WH, color: isStill ? "#fff" : TX2,
            borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
            fontSize: 10, fontWeight: 700,
            minWidth: 36, minHeight: 36,
          }}
        >
          <Ico name="alert" size={12} color={isStill ? "#fff" : TX2} />
        </button>
        <button
          onClick={onLifted}
          title="Levée à cette visite"
          style={{
            padding: "6px 10px", border: `1px solid ${isLifted ? SG : SBB}`,
            background: isLifted ? SG : WH, color: isLifted ? "#fff" : TX2,
            borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
            fontSize: 10, fontWeight: 700,
            minWidth: 36, minHeight: 36,
          }}
        >
          <Ico name="check" size={12} color={isLifted ? "#fff" : TX2} />
        </button>
      </div>
    </div>
  );
}

// ── Sheet : Photo + annotation vocale ──
//
// Flow mains-libres (Tier 2 ArchiPilot mobile) : après la capture, on
// auto-démarre la dictée Whisper pour que l'archi puisse décrire ce
// qu'il vient de photographier sans poser le téléphone. La transcription
// devient le `caption` de la photo et un flag `voiceAnnotated` permet
// d'afficher un badge mic sur les vignettes annotées vocalement.
//
// L'archi peut toujours : skip (sans annotation), recommencer la dictée
// (si raté), ou éditer manuellement le texte transcrit avant de garder.
// Aucun audio brut n'est stocké — seul le texte transcrit est gardé.
function PhotoSheet({ onClose, onSubmit }) {
  const fileRef = useRef(null);
  const [photo, setPhoto] = useState(null);
  const [annotation, setAnnotation] = useState("");
  const [voiceAnnotated, setVoiceAnnotated] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const [autoStarted, setAutoStarted] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const recorder = useWhisperRecorder({
    onResult: (text) => {
      if (!text) return;
      setAnnotation(t => (t ? t + " " : "") + text);
      setVoiceAnnotated(true);
    },
    onError: (code) => {
      if (code === "micDenied") setErrorMsg("Accès microphone refusé — tu peux quand même garder la photo.");
      else if (code === "noMic") setErrorMsg("Aucun microphone détecté.");
      else setErrorMsg("Dictée indisponible — la photo reste enregistrable.");
    },
  });

  // Auto-open file picker à l'ouverture — l'archi a déjà tap "Photo",
  // pas la peine de demander un second tap pour ouvrir la caméra.
  useEffect(() => {
    fileRef.current?.click();
  }, []);

  // Auto-start dictée dès que la photo est capturée. Court délai pour
  // laisser le navigateur peindre la preview avant de demander le mic.
  useEffect(() => {
    if (!photo || autoStarted || errorMsg) return;
    setAutoStarted(true);
    const t = setTimeout(() => { recorder.start(); }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo, autoStarted, errorMsg]);

  // Chrono pendant l'enregistrement — affiché en overlay sur la photo.
  useEffect(() => {
    if (!recorder.isRecording) { setRecordingSec(0); return; }
    const start = Date.now();
    const id = setInterval(() => {
      setRecordingSec(Math.floor((Date.now() - start) / 1000));
    }, 250);
    return () => clearInterval(id);
  }, [recorder.isRecording]);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) { onClose(); return; }
    const reader = new FileReader();
    reader.onload = (ev) => setPhoto(ev.target.result);
    reader.readAsDataURL(file);
  };

  const ensureRecorderStopped = async () => {
    if (recorder.isRecording) recorder.stop();
    // Petit délai pour laisser Whisper rendre le dernier chunk avant
    // de fermer la modale (sinon le dernier morceau de transcript est
    // perdu si on submit immédiatement après l'arrêt).
    if (recorder.isRecording || recorder.isTranscribing) {
      await new Promise(r => setTimeout(r, 350));
    }
  };

  const submit = async () => {
    if (!photo) return;
    await ensureRecorderStopped();
    setUploading(true);
    await onSubmit(photo, annotation.trim(), voiceAnnotated && annotation.trim().length > 0);
    setUploading(false);
    onClose();
  };

  const skip = async () => {
    if (!photo) return;
    if (recorder.isRecording) recorder.stop();
    setUploading(true);
    await onSubmit(photo, "", false);
    setUploading(false);
    onClose();
  };

  const restart = () => {
    if (recorder.isRecording) recorder.stop();
    setAnnotation("");
    setVoiceAnnotated(false);
    setErrorMsg("");
    setTimeout(() => recorder.start(), 200);
  };

  const chrono = `${String(Math.floor(recordingSec / 60)).padStart(2, "0")}:${String(recordingSec % 60).padStart(2, "0")}`;

  return (
    <SheetWrapper title="Photo + annotation vocale" onClose={onClose}>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handleFile} />
      {!photo ? (
        <div style={{ padding: 30, textAlign: "center", color: TX3, fontSize: 13 }}>
          Ouverture de la caméra…
          <div style={{ marginTop: 12 }}>
            <button onClick={() => fileRef.current?.click()}
              style={{ padding: "10px 20px", border: "none", borderRadius: 10, background: AC, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              Choisir une photo
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Photo + overlay chrono enregistrement */}
          <div style={{ position: "relative", marginBottom: 12 }}>
            <img src={photo} alt="" style={{ width: "100%", maxHeight: 220, objectFit: "contain", borderRadius: 10, background: SB, display: "block" }} />
            {recorder.isRecording && (
              <div style={{ position: "absolute", top: 10, left: 10, padding: "5px 10px", background: "rgba(0,0,0,0.65)", borderRadius: 999, fontSize: 11, color: "#fff", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "ui-monospace, monospace", letterSpacing: "0.04em" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: RD, animation: "pulseDot 1.2s ease-in-out infinite" }} />
                {chrono}
              </div>
            )}
            {recorder.isTranscribing && !recorder.isRecording && (
              <div style={{ position: "absolute", top: 10, left: 10, padding: "5px 10px", background: "rgba(0,0,0,0.65)", borderRadius: 999, fontSize: 11, color: "#fff", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Ico name="sparkle" size={11} color="#fff" />
                Transcription…
              </div>
            )}
          </div>

          {/* Transcript area — toujours visible, devient éditable quand non vide */}
          <div style={{ background: SB, border: `1px solid ${SBB}`, borderRadius: 10, padding: 12, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: voiceAnnotated ? AC : TX3, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {voiceAnnotated ? "Annotation vocale" : recorder.isRecording ? "Dictée en cours…" : "Annotation"}
              </span>
              {voiceAnnotated && (
                <Ico name="mic" size={12} color={AC} />
              )}
            </div>
            {annotation ? (
              <textarea
                value={annotation}
                onChange={e => setAnnotation(e.target.value)}
                rows={3}
                style={{ width: "100%", border: "none", background: "transparent", fontSize: 13, color: TX, lineHeight: 1.5, resize: "vertical", outline: "none", fontFamily: "inherit", padding: 0, boxSizing: "border-box" }}
              />
            ) : (
              <div style={{ fontSize: 12, color: TX3, lineHeight: 1.5, fontStyle: "italic", minHeight: 36 }}>
                {recorder.isRecording
                  ? "Décris ce que tu viens de photographier — la transcription apparaîtra ici."
                  : "Tape Recommencer pour démarrer la dictée, ou Sans annotation pour passer."}
              </div>
            )}
          </div>

          {errorMsg && (
            <div style={{ padding: "8px 12px", background: BRB, color: BR, borderRadius: 8, fontSize: 12, marginBottom: 12, lineHeight: 1.4 }}>
              {errorMsg}
            </div>
          )}

          {/* 3 actions : Skip / Recommencer / Garder */}
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={skip} disabled={uploading} style={{
              flex: 1, padding: "11px 10px",
              border: `1px solid ${SBB}`, background: WH, color: TX2,
              borderRadius: 10, fontSize: 12, fontWeight: 600,
              cursor: uploading ? "not-allowed" : "pointer", fontFamily: "inherit",
            }}>
              Sans annotation
            </button>
            <button onClick={restart} disabled={uploading || recorder.isTranscribing}
              title="Recommencer la dictée"
              style={{
                padding: "11px 12px",
                border: `1px solid ${SBB}`, background: WH, color: TX2,
                borderRadius: 10, fontSize: 12, fontWeight: 600,
                cursor: uploading || recorder.isTranscribing ? "not-allowed" : "pointer", fontFamily: "inherit",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                minWidth: 44,
              }}
            >
              <Ico name="undo" size={14} color={TX2} />
            </button>
            <button onClick={submit} disabled={uploading || recorder.isTranscribing} style={{
              flex: 1.4, padding: "11px 14px",
              border: "none", background: AC, color: "#fff",
              borderRadius: 10, fontSize: 13, fontWeight: 700,
              cursor: uploading || recorder.isTranscribing ? "not-allowed" : "pointer", fontFamily: "inherit",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              opacity: uploading || recorder.isTranscribing ? 0.6 : 1,
            }}>
              <Ico name="check" size={14} color="#fff" />
              {uploading ? "..." : "Garder"}
            </button>
          </div>
        </>
      )}
    </SheetWrapper>
  );
}

// ── Sheet : Note vocale ──
function VoiceSheet({ onClose, onSubmit, showToast }) {
  const [transcript, setTranscript] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const recorder = useWhisperRecorder({
    onResult: (text) => {
      setTranscript(t => (t ? t + " " : "") + text);
    },
    onError: (code) => {
      if (code === "micDenied") setErrorMsg("Accès microphone refusé.");
      else if (code === "noMic") setErrorMsg("Aucun microphone détecté.");
      else setErrorMsg("Erreur enregistrement.");
    },
  });

  const submit = () => {
    if (!transcript.trim()) return;
    onSubmit(transcript, "voice");
    onClose();
  };

  return (
    <SheetWrapper title="Note vocale" onClose={onClose}>
      <div style={{ textAlign: "center", padding: "20px 0" }}>
        <button
          onClick={recorder.isRecording ? recorder.stop : recorder.start}
          style={{
            width: 80, height: 80, borderRadius: "50%",
            border: "none", background: recorder.isRecording ? RD : AC,
            color: "#fff", cursor: "pointer", fontFamily: "inherit",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            boxShadow: recorder.isRecording ? `0 0 0 6px ${RD}33` : `0 4px 12px rgba(0,0,0,0.15)`,
            transition: "all 0.2s",
          }}
        >
          <Ico name="mic" size={32} color="#fff" />
        </button>
        <div style={{ fontSize: 12, color: TX2, marginTop: 12, fontWeight: 600 }}>
          {recorder.isTranscribing ? "Transcription en cours…"
            : recorder.isRecording ? "Tap pour arrêter"
            : "Tap pour démarrer l'enregistrement"}
        </div>
      </div>

      {transcript && (
        <textarea
          value={transcript}
          onChange={e => setTranscript(e.target.value)}
          rows={5}
          placeholder="La transcription apparaîtra ici…"
          style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
        />
      )}

      {errorMsg && (
        <div style={{ padding: "8px 12px", background: BRB, color: BR, borderRadius: 8, fontSize: 12, marginTop: 8 }}>
          {errorMsg}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={onClose} style={btnSecondary}>Annuler</button>
        <button onClick={submit} disabled={!transcript.trim()} style={{ ...btnPrimary, flex: 2, background: transcript.trim() ? AC : DIS, color: transcript.trim() ? "#fff" : DIST, cursor: transcript.trim() ? "pointer" : "not-allowed" }}>
          Ajouter la note
        </button>
      </div>
    </SheetWrapper>
  );
}

// ── Sheet : Nouvelle réserve ──
function NewReserveSheet({ contractors, onClose, onSubmit }) {
  const [form, setForm] = useState({
    description: "",
    severity: "major",
    contractor: "",
    location: "",
    photos: [],
  });
  const canSubmit = form.description.trim().length > 0;

  return (
    <SheetWrapper title="Nouvelle réserve" onClose={onClose}>
      <div style={{ fontSize: 11, fontWeight: 600, color: TX2, marginBottom: 4 }}>Description *</div>
      <textarea
        value={form.description}
        onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
        rows={3}
        placeholder="Décris le défaut constaté…"
        style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
      />

      <div style={{ fontSize: 11, fontWeight: 600, color: TX2, marginTop: 12, marginBottom: 4 }}>Gravité</div>
      <div style={{ display: "flex", gap: 4 }}>
        {RESERVE_SEVERITIES.map(s => (
          <button
            key={s.id}
            onClick={() => setForm(f => ({ ...f, severity: s.id }))}
            style={{
              flex: 1, padding: "8px 4px",
              border: `1.5px solid ${form.severity === s.id ? s.color : SBB}`,
              borderRadius: 8,
              background: form.severity === s.id ? s.bg : WH,
              color: form.severity === s.id ? s.color : TX3,
              fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: TX2, marginBottom: 4 }}>Entreprise</div>
          <input
            list="contractors-list-chantier"
            value={form.contractor}
            onChange={e => setForm(f => ({ ...f, contractor: e.target.value }))}
            placeholder="ex: BESIX"
            style={inputStyle}
          />
          <datalist id="contractors-list-chantier">
            {contractors.map(c => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: TX2, marginBottom: 4 }}>Localisation</div>
          <input
            value={form.location}
            onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
            placeholder="ex: Cuisine RDC"
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button onClick={onClose} style={btnSecondary}>Annuler</button>
        <button
          onClick={() => onSubmit(form)}
          disabled={!canSubmit}
          style={{ ...btnPrimary, flex: 2, background: canSubmit ? AC : DIS, color: canSubmit ? "#fff" : DIST, cursor: canSubmit ? "pointer" : "not-allowed" }}
        >
          Créer la réserve
        </button>
      </div>
    </SheetWrapper>
  );
}

// ── Sheet : Terminer la visite ──
function EndVisitSheet({ stats, transcribing, onCancel, onConfirm }) {
  return (
    <SheetWrapper title="Terminer la visite" onClose={transcribing ? undefined : onCancel}>
      {transcribing && (
        <div style={{
          padding: "14px 16px", background: ACL, border: `1px solid ${ACL2}`,
          borderRadius: 10, marginBottom: 12,
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            background: AC, display: "inline-flex", alignItems: "center", justifyContent: "center",
            animation: "pulseDot 1.4s ease-in-out infinite",
          }}>
            <Ico name="sparkle" size={14} color="#fff" />
          </div>
          <div style={{ flex: 1, fontSize: 12, color: TX, lineHeight: 1.45 }}>
            <strong>Transcription Whisper en cours…</strong><br />
            Ne ferme pas l'app — la conversation est envoyée et structurée.
          </div>
        </div>
      )}
      <div style={{ fontSize: 13, color: TX2, lineHeight: 1.6, marginBottom: 14 }}>
        Tu t'apprêtes à clôturer la visite. Un brouillon de PV sera créé
        avec ce qui a été collecté pendant la visite. Tu pourras l'éditer
        depuis l'écran "PV à finaliser" du projet.
      </div>

      <div style={{
        padding: "12px 14px", background: SB, border: `1px solid ${SBB}`,
        borderRadius: 10, marginBottom: 14,
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: TX3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
          Récap de la visite
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: TX }}>
          <div>Durée : <strong>{stats.duration < 60 ? `${stats.duration} min` : `${Math.floor(stats.duration / 60)}h${String(stats.duration % 60).padStart(2, "0")}`}</strong></div>
          {stats.lifted > 0 && <div><strong style={{ color: SG }}>{stats.lifted}</strong> réserve{stats.lifted > 1 ? "s" : ""} levée{stats.lifted > 1 ? "s" : ""}</div>}
          {stats.still > 0 && <div><strong style={{ color: AM }}>{stats.still}</strong> réserve{stats.still > 1 ? "s" : ""} toujours présente{stats.still > 1 ? "s" : ""}</div>}
          {stats.created > 0 && <div><strong style={{ color: BR }}>{stats.created}</strong> nouvelle{stats.created > 1 ? "s" : ""} réserve{stats.created > 1 ? "s" : ""}</div>}
          {stats.decisions > 0 && <div><strong style={{ color: ST }}>{stats.decisions}</strong> décision{stats.decisions > 1 ? "s" : ""} notée{stats.decisions > 1 ? "s" : ""}</div>}
          {stats.photos > 0 && <div><strong style={{ color: TX2 }}>{stats.photos}</strong> photo{stats.photos > 1 ? "s" : ""} prise{stats.photos > 1 ? "s" : ""}</div>}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onCancel} disabled={transcribing} style={{ ...btnSecondary, opacity: transcribing ? 0.5 : 1, cursor: transcribing ? "not-allowed" : "pointer" }}>
          Continuer la visite
        </button>
        <button onClick={onConfirm} disabled={transcribing} style={{ ...btnPrimary, flex: 2, opacity: transcribing ? 0.6 : 1, cursor: transcribing ? "not-allowed" : "pointer" }}>
          {transcribing ? "Transcription…" : "Terminer · Créer le brouillon"}
        </button>
      </div>
    </SheetWrapper>
  );
}

// ── Sheet wrapper générique ──
function SheetWrapper({ title, onClose, children }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 250,
        background: "rgba(0, 0, 0, 0.5)",
        display: "flex", alignItems: "flex-end",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: WH, width: "100%",
          borderRadius: "16px 16px 0 0",
          padding: "18px 20px 24px",
          maxHeight: "85vh", overflowY: "auto",
          fontFamily: "inherit",
          animation: "slideUp 0.22s ease-out",
          paddingBottom: "max(24px, env(safe-area-inset-bottom, 24px))",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: TX }}>{title}</div>
          <button onClick={onClose} style={{ background: SB, border: `1px solid ${SBB}`, cursor: "pointer", padding: 6, borderRadius: 8 }}>
            <Ico name="x" size={14} color={TX2} />
          </button>
        </div>
        {children}
      </div>
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "10px 12px",
  border: `1px solid ${SBB}`, borderRadius: 8,
  fontSize: 13, fontFamily: "inherit", background: WH, color: TX,
  outline: "none", boxSizing: "border-box",
};

const btnPrimary = {
  padding: "11px 16px", border: "none", borderRadius: 10,
  background: AC, color: "#fff", fontSize: 13, fontWeight: 700,
  cursor: "pointer", fontFamily: "inherit",
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
};

const btnSecondary = {
  flex: 1, padding: "11px 16px", border: `1px solid ${SBB}`, borderRadius: 10,
  background: WH, color: TX2, fontSize: 13, fontWeight: 600,
  cursor: "pointer", fontFamily: "inherit",
};

// ── Phase 2 — Réunion (enregistrement audio actif) ──
//
// Une fois passée par le modal RGPD, on entre dans ce composant.
// Le recorder est démarré par le useEffect parent — ici on rend
// l'état live (chrono d'enregistrement effectif, niveau audio,
// taille fichier) + un bouton Pause/Resume.
//
// Pause / Resume du MediaRecorder : le blob continue d'exister et
// reprend là où il s'est arrêté. La pause auto a aussi lieu si
// l'archi repasse en Phase Inspection (géré par le parent).
function MeetingPhase({ recorder, errorMsg }) {
  const recSec = recorder?.duration || 0;
  const recChrono = `${String(Math.floor(recSec / 60)).padStart(2, "0")}:${String(recSec % 60).padStart(2, "0")}`;
  const sizeKB = recorder?.estimatedSize ? Math.round(recorder.estimatedSize / 1024) : 0;
  const sizeLabel = sizeKB < 1024 ? `${sizeKB} Ko` : `${(sizeKB / 1024).toFixed(1)} Mo`;
  const isActive = recorder?.isRecording && !recorder?.isPaused;

  return (
    <div style={{ paddingTop: 8 }}>
      {/* Hero : pose le téléphone */}
      <div style={{
        textAlign: "center", padding: "28px 16px 22px",
        background: WH, border: `1px solid ${SBB}`, borderRadius: 12,
        marginBottom: 14,
      }}>
        <div style={{
          width: 84, height: 84, borderRadius: "50%",
          background: "#FDECEC", color: RD,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          marginBottom: 14, position: "relative",
        }}>
          <Ico name="mic" size={38} color={RD} />
          {isActive && (
            <span style={{
              position: "absolute", inset: -6, borderRadius: "50%",
              border: `2px solid ${RD}`, opacity: 0.5,
              animation: "pulseDot 2.2s ease-in-out infinite",
            }} />
          )}
        </div>
        <div style={{ fontSize: 17, fontWeight: 800, color: TX, marginBottom: 4 }}>
          Pose le téléphone sur la table
        </div>
        <div style={{ fontSize: 13, color: TX2, lineHeight: 1.5, maxWidth: 320, margin: "0 auto" }}>
          La conversation est enregistrée. À la fin de la visite,
          Whisper la transcrira et l'ajoutera au brouillon de PV.
        </div>
      </div>

      {/* Card live : chrono + meter + bouton pause */}
      {recorder?.isRecording && (
        <div style={{
          padding: "14px 16px", background: WH, border: `1px solid ${SBB}`,
          borderRadius: 12, marginBottom: 14,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{
                width: 8, height: 8, borderRadius: "50%",
                background: recorder.isPaused ? AM : RD,
                animation: recorder.isPaused ? "none" : "pulseDot 1.2s ease-in-out infinite",
              }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: recorder.isPaused ? AM : RD, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {recorder.isPaused ? "En pause" : "Enregistrement"}
              </span>
            </div>
            <span style={{
              fontFamily: "ui-monospace, monospace",
              fontSize: 16, fontWeight: 700, color: TX,
              letterSpacing: "0.04em",
            }}>
              {recChrono}
            </span>
          </div>

          {/* Audio meter — barre horizontale animée selon le niveau RMS */}
          <div style={{
            height: 6, background: SB, borderRadius: 999,
            overflow: "hidden", marginBottom: 12,
          }}>
            <div style={{
              height: "100%",
              width: `${recorder.isPaused ? 0 : (recorder.audioLevel || 0)}%`,
              background: `linear-gradient(90deg, ${SG}, ${AM}, ${RD})`,
              borderRadius: 999,
              transition: "width 100ms ease-out",
            }} />
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <span style={{ fontSize: 11, color: TX3 }}>
              ~ {sizeLabel} enregistrés
            </span>
            <button
              onClick={recorder.isPaused ? recorder.resume : recorder.pause}
              style={{
                padding: "8px 14px",
                border: `1px solid ${SBB}`,
                background: recorder.isPaused ? AC : WH,
                color: recorder.isPaused ? "#fff" : TX2,
                borderRadius: 999,
                fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                display: "inline-flex", alignItems: "center", gap: 6,
              }}
            >
              <Ico name={recorder.isPaused ? "send" : "stop"} size={11} color={recorder.isPaused ? "#fff" : TX2} />
              {recorder.isPaused ? "Reprendre" : "Pause"}
            </button>
          </div>
        </div>
      )}

      {/* Erreur micro / wake lock — message clair, la visite continue */}
      {errorMsg && (
        <div style={{
          padding: "12px 14px", background: BRB, color: BR,
          borderRadius: 10, fontSize: 12, lineHeight: 1.5, marginBottom: 14,
          display: "flex", alignItems: "flex-start", gap: 10,
        }}>
          <Ico name="alert" size={14} color={BR} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Astuce IA */}
      <div style={{
        padding: "12px 14px", background: ACL, border: `1px solid ${ACL2}`,
        borderRadius: 10, fontSize: 12, color: TX2, lineHeight: 1.5,
      }}>
        <strong style={{ color: TX }}>Astuce :</strong> parle naturellement,
        l'IA structurera la conversation (présents, décisions, réserves)
        au moment de finaliser le brouillon au bureau.
      </div>
    </div>
  );
}

// ── Modal RGPD — consentement avant Phase 2 (réunion) ──
//
// Affiché au tap "Passer à la réunion" pour rappeler à l'archi que
// la phase Réunion va (à terme) enregistrer la conversation des
// participants. Pas de checkbox alourdissante : les 3 vérifications
// sont affichées et le bouton "Démarrer" sert d'acquit.
function RgpdConfirmModal({ onCancel, onConfirm }) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, zIndex: 260,
        background: "rgba(0, 0, 0, 0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 380,
          background: WH, borderRadius: 16,
          padding: "24px 22px",
          fontFamily: "inherit",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.4)",
        }}
      >
        <div style={{
          width: 56, height: 56, borderRadius: "50%",
          background: "#FDECEC", color: RD,
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 14px",
        }}>
          <Ico name="mic" size={26} color={RD} />
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: TX, textAlign: "center", marginBottom: 6 }}>
          Démarrer la réunion ?
        </div>
        <div style={{ fontSize: 13, color: TX2, textAlign: "center", lineHeight: 1.5, marginBottom: 18 }}>
          Le mode réunion accompagnera la rédaction du PV.
          L'enregistrement audio (à venir) servira à structurer
          automatiquement le compte-rendu.
        </div>

        <div style={{
          background: SB, border: `1px solid ${SBB}`, borderRadius: 10,
          padding: 14, marginBottom: 18,
        }}>
          {[
            "Les participants sont informés que tu prends note de la réunion.",
            "Les données restent stockées uniquement sur ton compte.",
            "Tu peux quitter ou reprendre l'inspection à tout moment.",
          ].map((line, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "flex-start", gap: 9,
              fontSize: 12, color: TX2, lineHeight: 1.45,
              marginBottom: i < 2 ? 8 : 0,
            }}>
              <Ico name="check" size={14} color={GR} />
              <span>{line}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: "12px 14px", border: `1px solid ${SBB}`,
            background: WH, color: TX2, borderRadius: 10,
            fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}>
            Annuler
          </button>
          <button onClick={onConfirm} style={{
            flex: 1.4, padding: "12px 14px", border: "none",
            background: RD, color: "#fff", borderRadius: 10,
            fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
            boxShadow: `0 4px 14px ${RD}40`,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />
            Démarrer
          </button>
        </div>
      </div>
    </div>
  );
}

export default ChantierModeView;
