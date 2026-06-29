import { useState, useEffect, useRef } from "react";
import {
  AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, RD, GR,
  AM, AMB, ST, STB, BR, BRB, SG, SGB,
  DIS, DIST, REDBRD,
} from "../constants/tokens";
import { getReserveStatus, getReserveSeverity, RESERVE_SEVERITIES } from "../constants/statuses";
import { isEnabled } from "../constants/featureFlags";
import { Ico } from "../components/ui";
import { uploadPhoto, getPhotoUrl } from "../db";
import { useWhisperRecorder } from "../hooks/useWhisperRecorder";
import { useConversationRecorder, transcribeAudioBlob } from "../hooks/useConversationRecorder";
import { fetchWeatherAt, getCurrentPositionSafe, formatWeatherShort } from "../utils/weather";
import {
  getActiveVisit,
  startVisit,
  endVisit,
  clearVisit,
  setPhase,
  setWeather,
  setMeetingTranscript,
  togglePresent,
  addPresent,
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

// Temps relatif court pour le fil ("à l'instant" / "il y a N min" / "il y a N h").
function relTimeShort(iso) {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return new Date(iso).toLocaleDateString("fr-BE", { day: "numeric", month: "short" });
}

// Durée M:SS (note vocale).
function fmtDur(s) {
  const n = Number(s) || 0;
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}

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
    const i = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(i);
  }, []);
  // Chrono HH:MM:SS depuis le début de la visite.
  const hhmmss = (() => {
    const s = Math.max(0, Math.floor((Date.now() - new Date(visit.startedAt).getTime()) / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  })();

  // ── Tier 1 : météo automatique au démarrage de la visite ──
  // Fetch une fois si pas encore fait (ou si échec précédent — on
  // re-essaie si l'archi reload). Préfère les coords du projet si
  // dispo (déjà géocodé), sinon fallback géoloc silencieuse.
  useEffect(() => {
    if (visit.weather || visit._weatherFetched) return;
    let cancelled = false;
    (async () => {
      let coords = (project.geo?.lat && project.geo?.lng)
        ? { lat: project.geo.lat, lng: project.geo.lng }
        : null;
      if (!coords) coords = await getCurrentPositionSafe(5000);
      if (cancelled) return;
      if (!coords) {
        setVisit(v => setWeather(v, null));
        return;
      }
      const weather = await fetchWeatherAt(coords.lat, coords.lng);
      if (cancelled) return;
      setVisit(v => setWeather(v, weather));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visit.weather, visit._weatherFetched, project.geo]);

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

  // Garde-fou audio (limite POC connue : pas de chunking, le blob audio en
  // mémoire est perdu si la page est rechargée/fermée pendant l'enregistrement).
  // On avertit l'utilisateur avant qu'il ne quitte tant que l'audio n'est pas
  // transcrit. À retirer quand l'enregistrement chunké/persisté sera en place.
  useEffect(() => {
    if (!conv.isRecording) return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; return ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [conv.isRecording]);

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
  const onAddPresent = () => {
    const name = window.prompt("Nom de la personne présente ?");
    if (name && name.trim()) setVisit(v => addPresent(v, name));
  };

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

  const onAddDecision = (text, source = "text", meta = {}) => {
    if (!text?.trim()) return;
    setVisit(v => addDecision(v, text, source, meta));
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
      deadline: newRes.deadline || "",
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
  //
  // Tier 1 : enrichissement GPS asynchrone non bloquant. La photo est
  // d'abord sauvegardée immédiatement, puis on tente un getCurrentPosition
  // en background et on patche `geo` sur la photo si dispo. Si la
  // permission est refusée ou que la géoloc traîne, la photo reste
  // utilisable sans coords — l'archi ne voit aucun blocage.
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

    // Enrichissement GPS en background — patche la photo si dispo
    getCurrentPositionSafe(4000).then(geo => {
      if (!geo) return;
      setProjects(prev => prev.map(p => p.id !== project.id ? p : {
        ...p,
        gallery: (p.gallery || []).map(ph => ph.id === photoId ? { ...ph, geo } : ph),
      }));
    });

    // Upload async vers Supabase Storage
    if (navigator.onLine) {
      try {
        const result = await uploadPhoto(dataUrl);
        if (result) {
          setProjects(prev => prev.map(p => p.id !== project.id ? p : {
            ...p,
            // On retire le dataUrl base64 après upload (pas de persistance JSONB).
            gallery: (p.gallery || []).map(ph => {
              if (ph.id !== photoId) return ph;
              const { dataUrl: _drop, ...rest } = ph;
              return { ...rest, url: result.url, storagePath: result.storagePath };
            }),
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
  const stats = getVisitStats(visit);
  // Fil de la visite — photos + observations fusionnées, ordre chronologique
  // inverse (le plus récent en haut). Donne à l'archi un retour immédiat sur
  // ce qu'il a capturé.
  const galleryById = new Map((project.gallery || []).map(g => [g.id, g]));
  const reservesById = new Map((project.reserves || []).map(r => [String(r.id), r]));
  const reserveCreatedAt = new Map((visit.reserveActions || []).filter(a => a.action === "created").map(a => [String(a.reserveId), a.timestamp]));
  const feed = [
    ...visit.photoIds.map(id => { const ph = galleryById.get(id); return ph ? { kind: "photo", at: ph.date, ph, id } : null; }).filter(Boolean),
    ...visit.decisions.map(d => ({ kind: "note", at: d.timestamp, text: d.text, source: d.source, id: d.id })),
    ...(visit.newReserveIds || []).map(rid => { const r = reservesById.get(String(rid)); return r ? { kind: "reserve", at: reserveCreatedAt.get(String(rid)) || r.createdAt, reserve: r, id: `res-${rid}` } : null; }).filter(Boolean),
  ].sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));

  // Présents nommés uniquement (on évite les pastilles "?" des participants
  // sans nom), cappés pour ne pas déborder sur 2 lignes.
  const namedPresents = (visit.presents || []).filter(p => p.name && String(p.name).trim());
  const presentsShown = namedPresents.slice(0, 4);
  const presentsMore = namedPresents.length - presentsShown.length;

  return (
    <div style={{ maxWidth: "none", margin: "0 auto", animation: "fadeIn 0.2s ease", paddingBottom: 100 }}>
      {/* ── Header sticky — visite continue, sobre ──
          Chrono qui tourne + météo. Une seule visite (plus de bascule
          inspection/réunion : on capture en continu). */}
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: "#FCFBFA", padding: "calc(10px + env(safe-area-inset-top, 0px)) 8px 8px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: TX3, fontWeight: 500, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Visite · {project.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#DC2626", animation: "pulseDot 1.4s ease-in-out infinite", flexShrink: 0 }} />
            <span style={{ fontSize: 26, fontWeight: 700, color: TX, fontVariantNumeric: "tabular-nums", letterSpacing: "0.5px" }}>{hhmmss}</span>
          </div>
        </div>
        <button onClick={() => setActiveSheet("end")} style={{ height: 38, minHeight: 38, padding: "0 16px", borderRadius: 999, background: WH, border: `1px solid ${SBB}`, color: TX2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6 }}><Ico name="check" size={14} color={TX2} />Terminer</button>
      </div>

      <style>{`
        @keyframes pulseDot {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.6; }
        }
      `}</style>

      <div style={{ padding: "14px 8px" }}>

      {/* ── Contexte : météo + présents + ajout (pills uniformes 30px) ──
          Tous les éléments partagent height:30 + minHeight:30 (sinon les
          BOUTONS présents seraient étirés à 44px par la règle tactile et
          ne s'aligneraient pas avec la pastille météo). */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 7, marginBottom: 16 }}>
        {visit.weather && (
          <span style={{ display: "inline-flex", alignItems: "center", height: 30, minHeight: 30, padding: "0 12px", borderRadius: 999, background: WH, border: `1px solid ${SBB}`, color: TX2, fontSize: 12, lineHeight: 1 }}>{formatWeatherShort(visit.weather)}</span>
        )}
        {presentsShown.map((p, i) => (
          <button key={i} onClick={() => onTogglePresent(p.name)} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 30, minHeight: 30, padding: "0 12px 0 4px", borderRadius: 999, background: p.present ? SGB : WH, border: `1px solid ${p.present ? SG : SBB}`, color: p.present ? SG : TX3, fontSize: 12, fontWeight: 500, lineHeight: 1, cursor: "pointer", fontFamily: "inherit" }}>
            <span style={{ width: 22, height: 22, borderRadius: 999, background: p.present ? SG : SBB, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, flexShrink: 0 }}>{p.name.split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase()}</span>
            {p.name}
          </button>
        ))}
        {presentsMore > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", height: 30, minHeight: 30, padding: "0 12px", borderRadius: 999, background: WH, border: `1px solid ${SBB}`, color: TX3, fontSize: 12, lineHeight: 1 }}>+{presentsMore} présent{presentsMore > 1 ? "s" : ""}</span>
        )}
        <button onClick={onAddPresent} aria-label="Ajouter une personne présente" style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 30, minHeight: 30, padding: "0 12px", borderRadius: 999, background: WH, border: `1px dashed ${SBB}`, color: TX3, fontSize: 12, fontWeight: 500, lineHeight: 1, cursor: "pointer", fontFamily: "inherit" }}>
          <Ico name="plus" size={12} color={TX3} /> Ajouter
        </button>
      </div>

      {/* ── Enregistrer la réunion (audio → PV par l'IA). En cours, l'écran
          plein MeetingRecorderOverlay prend le relais (phase reunion). ── */}
      <button onClick={onRequestMeeting} style={{ width: "100%", textAlign: "left", border: "none", cursor: "pointer", fontFamily: "inherit", background: "linear-gradient(135deg,#B85C2C,#A04C20)", borderRadius: 18, padding: 16, color: "#fff", position: "relative", overflow: "hidden", marginBottom: 18, boxShadow: "0 8px 22px rgba(184,92,44,0.24)" }}>
        <span style={{ position: "absolute", right: -20, top: -20, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} />
        <span style={{ position: "relative", display: "flex", alignItems: "center", gap: 13 }}>
          <span style={{ width: 52, height: 52, borderRadius: 16, background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Ico name="mic" size={26} color="#fff" /></span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 16, fontWeight: 700, letterSpacing: "-0.2px" }}>Enregistrer la réunion</span>
            <span style={{ display: "block", fontSize: 12, opacity: 0.85, lineHeight: 1.45, marginTop: 2 }}>L'IA en fera le PV · se synchronise sur l'ordinateur</span>
          </span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" style={{ flexShrink: 0, opacity: 0.9 }}><polyline points="9 6 15 12 9 18" /></svg>
        </span>
      </button>

      {/* ── Capturer sur le vif — 3 actions tactiles ── */}
      <div style={{ fontSize: 12, fontWeight: 700, color: TX3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Capturer sur le vif</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 22 }}>
        {[
          { icon: "camera", label: "Photo", bg: "#EFF6FF", fg: "#1E40AF", sheet: "photo" },
          { icon: "mic", label: "Note vocale", bg: "#FDF6F1", fg: "#A04C20", sheet: "voice" },
          { icon: "alert", label: "Réserve", bg: "#FEF2F2", fg: "#991B1B", sheet: "new-reserve" },
        ].map(c => (
          <button key={c.sheet} onClick={() => setActiveSheet(c.sheet)} style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 18, padding: "18px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 9, cursor: "pointer", fontFamily: "inherit", minHeight: 96 }}>
            <span style={{ width: 50, height: 50, borderRadius: 15, background: c.bg, color: c.fg, display: "flex", alignItems: "center", justifyContent: "center" }}><Ico name={c.icon} size={26} color={c.fg} /></span>
            <span style={{ fontSize: 13, fontWeight: 600, color: TX }}>{c.label}</span>
          </button>
        ))}
      </div>

      {/* ── Fil de la visite — photos + observations, chronologique ──
          Le cœur de l'écran : tout ce que l'archi capture s'empile ici
          dans l'ordre, pour qu'il voie en un coup d'œil ce qu'il a relevé. */}
      <div style={{ fontSize: 12, fontWeight: 700, color: TX3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
        Capturé{feed.length > 0 ? ` · ${feed.length} élément${feed.length > 1 ? "s" : ""}` : ""}
      </div>
      {feed.length === 0 ? (
        <div style={{ textAlign: "center", padding: "30px 20px", color: TX3, background: SB, border: `1px dashed ${SBB}`, borderRadius: 12 }}>
          <Ico name="camera" size={24} color={TX3} />
          <div style={{ fontSize: 13, fontWeight: 600, color: TX2, marginTop: 10 }}>Capture ta visite au fil de l'eau</div>
          <div style={{ fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>Photos et observations s'ajoutent ici. À la fin, l'IA en fait un brouillon de PV.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {feed.map(item => {
            const time = relTimeShort(item.at);
            if (item.kind === "photo") {
              return (
                <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, background: WH, border: "1px solid #EFEDEB", borderRadius: 13 }}>
                  <img src={getPhotoUrl(item.ph)} alt="" style={{ width: 38, height: 38, objectFit: "cover", borderRadius: 10, flexShrink: 0, border: `1px solid ${SBB}` }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.ph.caption || "Photo"}</div>
                    <div style={{ fontSize: 12, color: TX3 }}>Prise {time}</div>
                  </div>
                </div>
              );
            }
            if (item.kind === "reserve") {
              const sev = getReserveSeverity(item.reserve.severity);
              return (
                <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, background: WH, border: "1px solid #EFEDEB", borderRadius: 13 }}>
                  <span style={{ width: 38, height: 38, borderRadius: 10, background: "#FEF2F2", color: "#991B1B", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Ico name="alert" size={18} color="#991B1B" /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Réserve · {(item.reserve.description || "").slice(0, 26) || item.reserve.code || "réserve"}</div>
                    <div style={{ fontSize: 12, color: TX3 }}>{sev?.label || "Réserve"} · {time}</div>
                  </div>
                </div>
              );
            }
            const isVoice = item.source === "voice";
            return (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, background: WH, border: "1px solid #EFEDEB", borderRadius: 13 }}>
                <span style={{ width: 38, height: 38, borderRadius: 10, background: isVoice ? "#FDF6F1" : SB, color: isVoice ? "#A04C20" : TX2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Ico name={isVoice ? "mic" : "pen2"} size={18} color={isVoice ? "#A04C20" : TX2} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: TX }}>{isVoice ? `Note vocale${item.durationSec ? ` · ${fmtDur(item.durationSec)}` : ""}` : "Note écrite"}</div>
                  <div style={{ fontSize: 12, color: TX3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{isVoice ? `transcrite · ${time}` : (item.text || time)}</div>
                </div>
                <button onClick={() => onRemoveDecision(item.id)} aria-label="Supprimer" style={{ background: "none", border: "none", cursor: "pointer", padding: 6, flexShrink: 0 }}>
                  <Ico name="x" size={13} color={TX3} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {/* ── Finir → brouillon de PV (l'IA assemble la visite) ── */}
      <button onClick={() => setActiveSheet("end")} style={{ width: "100%", textAlign: "left", marginTop: 20, background: "#FDF6F1", border: "1px solid #F0DCCB", borderRadius: 14, padding: 14, display: "flex", alignItems: "center", gap: 11, cursor: "pointer", fontFamily: "inherit" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A04C20" strokeWidth="1.7"><path d="M12 3l1.9 6.1L20 11l-6.1 1.9L12 19l-1.9-6.1L4 11l6.1-1.9z" /></svg>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: TX }}>Finir → brouillon de PV</span>
          <span style={{ display: "block", fontSize: 12, color: "#8B5A3C" }}>L'IA assemble la visite en PV</span>
        </span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C7A98E" strokeWidth="2"><polyline points="9 6 15 12 9 18" /></svg>
      </button>
      </div>

      {/* ── Sheets / Modals ── */}
      {activeSheet === "photo" && (
        <PhotoSheet onClose={() => setActiveSheet(null)} onSubmit={onAddPhoto} />
      )}
      {activeSheet === "voice" && (
        <VoiceSheet onClose={() => setActiveSheet(null)} onSubmit={onAddDecision} showToast={showToast} />
      )}
      {activeSheet === "text" && (
        <TextNoteSheet onClose={() => setActiveSheet(null)} onSubmit={onAddDecision} />
      )}
      {isEnabled("opr") && activeSheet === "new-reserve" && (
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
      {phase === "reunion" && (
        <MeetingRecorderOverlay
          project={project}
          conv={conv}
          presents={visit.presents}
          onTogglePresent={onTogglePresent}
          onStop={onResumeInspection}
          onPhoto={() => setActiveSheet("photo")}
          nextPv={(project.pvHistory || []).length + 1}
        />
      )}
    </div>
  );
}

// ── Enregistrement réunion (plein écran) — handoff_mobile ────
// S'affiche quand la visite est en phase "reunion". Reprend le recorder
// `conv` déjà actif (duration + audioLevel live). Pause/Reprise, Stop
// (= revient en inspection, l'audio reste pour la transcription finale),
// Ajout photo. Carte de continuité desktop + présents.
function MeetingRecorderOverlay({ project, conv, presents = [], onTogglePresent, onStop, onPhoto, nextPv }) {
  const mmss = `${String(Math.floor(conv.duration / 60)).padStart(2, "0")}:${String(conv.duration % 60).padStart(2, "0")}`;
  const lvl = conv.isPaused ? 0 : (conv.audioLevel || 0) / 100;
  // 24 barres : motif fixe modulé par le niveau audio live.
  const BARS = [30, 60, 85, 45, 70, 100, 50, 80, 38, 92, 55, 42, 75, 60, 95, 48, 82, 35, 68, 52, 88, 40, 28, 64];
  const barColor = (i) => ["#E8B58E", "#D17A47", "#B85C2C"][i % 3];
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 250, background: "#FCFBFA", display: "flex", flexDirection: "column", paddingBottom: "max(20px, env(safe-area-inset-bottom, 20px))", fontFamily: "inherit" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(8px + env(safe-area-inset-top, 0px)) 8px 8px" }}>
        <button onClick={onStop} aria-label="Retour à la visite" style={{ width: 40, height: 40, minWidth: 40, minHeight: 40, flexShrink: 0, borderRadius: "50%", background: WH, border: "1px solid #EFEDEB", display: "flex", alignItems: "center", justifyContent: "center", color: TX2, cursor: "pointer" }}><Ico name="back" size={18} color={TX2} /></button>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: TX }}>Réunion · {project.name}</div>
          <div style={{ fontSize: 11, color: TX3 }}>PV n°{nextPv} en préparation</div>
        </div>
      </div>

      {/* Recorder */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
          <span style={{ width: 10, height: 10, borderRadius: 999, background: conv.isPaused ? "#A8A29E" : "#DC2626", animation: conv.isPaused ? "none" : "pulseDot 1.4s ease-in-out infinite" }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: conv.isPaused ? TX3 : "#991B1B", letterSpacing: "0.04em" }}>{conv.isPaused ? "EN PAUSE" : "ENREGISTREMENT"}</span>
        </div>
        <div style={{ fontSize: 46, fontWeight: 700, color: TX, fontVariantNumeric: "tabular-nums", letterSpacing: 1, marginBottom: 24 }}>{mmss}</div>

        {/* Waveform */}
        <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 3, height: 64, marginBottom: 30, overflow: "hidden" }}>
          {BARS.map((base, i) => {
            const h = Math.max(12, Math.min(100, base * (0.35 + lvl * 0.75)));
            return <div key={i} style={{ width: 3, height: `${h}%`, borderRadius: 9, background: conv.isPaused ? "#EFE0D4" : barColor(i), transition: "height 0.12s ease" }} />;
          })}
        </div>

        {/* Contrôles */}
        <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
          <button onClick={() => conv.isPaused ? conv.resume() : conv.pause()} aria-label={conv.isPaused ? "Reprendre" : "Pause"} style={{ width: 56, height: 56, borderRadius: 999, background: WH, border: "1px solid #E7E5E4", display: "flex", alignItems: "center", justifyContent: "center", color: TX2, cursor: "pointer" }}>
            {conv.isPaused
              ? <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              : <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>}
          </button>
          <button onClick={onStop} aria-label="Terminer la réunion" style={{ width: 84, height: 84, borderRadius: 999, background: "#DC2626", border: "none", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 24px rgba(220,38,38,0.35)", cursor: "pointer" }}>
            <span style={{ width: 30, height: 30, borderRadius: 7, background: "#fff" }} />
          </button>
          <button onClick={onPhoto} aria-label="Ajouter une photo" style={{ width: 56, height: 56, borderRadius: 999, background: WH, border: "1px solid #E7E5E4", display: "flex", alignItems: "center", justifyContent: "center", color: "#A04C20", cursor: "pointer" }}>
            <Ico name="camera" size={22} color="#A04C20" />
          </button>
        </div>
        <div style={{ fontSize: 12, color: TX3, marginTop: 18, textAlign: "center" }}>Pause · Stop · Ajouter une photo</div>
      </div>

      {/* Continuité desktop */}
      <div style={{ margin: "0 8px", background: WH, border: "1px solid #EFEDEB", borderRadius: 14, padding: "13px 15px", display: "flex", alignItems: "center", gap: 11 }}>
        <span style={{ width: 36, height: 36, borderRadius: 10, background: "#F0FDF4", color: "#166534", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: TX }}>Se synchronise sur l'ordinateur</div>
          <div style={{ fontSize: 12, color: TX2 }}>Audio + captures dispo sur le desktop dès qu'il y a du réseau</div>
        </div>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: "#16A34A", flexShrink: 0, animation: "pulseDot 1.6s ease-in-out infinite" }} />
      </div>

      {/* Présents */}
      <div style={{ padding: "14px 8px 0", display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: TX3 }}>Présents :</span>
        {presents.map((p, i) => (
          <button key={i} onClick={() => onTogglePresent?.(p.name)} style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 28, padding: "0 10px 0 4px", borderRadius: 999, background: p.present ? SGB : WH, border: `1px solid ${p.present ? SG : "#EFEDEB"}`, color: p.present ? SG : TX3, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
            <span style={{ width: 18, height: 18, borderRadius: 999, background: p.present ? SG : SBB, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700 }}>{(p.name || "?").split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase()}</span>
            {p.name}
          </button>
        ))}
      </div>
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
  const fileRef = useRef(null);     // caméra (capture)
  const galleryRef = useRef(null);  // galerie de l'appareil
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

  // On ne force plus l'ouverture caméra : l'archi choisit d'abord
  // « Prendre une photo » (caméra) ou « Depuis la galerie ».

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
      <input ref={galleryRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
      {!photo ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, paddingBottom: 4 }}>
          <button onClick={() => fileRef.current?.click()} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "20px 10px", border: "1px solid #EFEDEB", borderRadius: 16, background: WH, cursor: "pointer", fontFamily: "inherit" }}>
            <span style={{ width: 52, height: 52, borderRadius: 15, background: "#FDF6F1", color: "#A04C20", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Ico name="camera" size={26} color="#A04C20" /></span>
            <span style={{ fontSize: 14, fontWeight: 600, color: TX, textAlign: "center" }}>Prendre une photo</span>
          </button>
          <button onClick={() => galleryRef.current?.click()} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "20px 10px", border: "1px solid #EFEDEB", borderRadius: 16, background: WH, cursor: "pointer", fontFamily: "inherit" }}>
            <span style={{ width: 52, height: 52, borderRadius: 15, background: "#EFF6FF", color: "#1E40AF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Ico name="image" size={26} color="#1E40AF" /></span>
            <span style={{ fontSize: 14, fontWeight: 600, color: TX, textAlign: "center" }}>Depuis la galerie</span>
          </button>
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
  const [level, setLevel] = useState(0); // niveau audio live (0..1) pour l'anim
  const [recordingSec, setRecordingSec] = useState(0); // durée cumulée enregistrée

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

  // Analyse le flux micro en direct pour faire « respirer » le halo autour
  // du bouton au rythme de la voix — feedback clair que ça enregistre.
  useEffect(() => {
    if (!recorder.isRecording || !recorder.stream) { setLevel(0); return; }
    let ctx, raf, analyser;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaStreamSource(recorder.stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
        setLevel(Math.min(1, Math.sqrt(sum / data.length) * 3.2));
        raf = requestAnimationFrame(tick);
      };
      tick();
    } catch { /* audio context indisponible : pas d'anim, le reste marche */ }
    return () => { if (raf) cancelAnimationFrame(raf); if (ctx) ctx.close().catch(() => {}); };
  }, [recorder.isRecording, recorder.stream]);

  // Chrono cumulé d'enregistrement (sert de durée de la note vocale).
  useEffect(() => {
    if (!recorder.isRecording) return;
    const start = Date.now();
    const base = recordingSec;
    const id = setInterval(() => setRecordingSec(base + Math.floor((Date.now() - start) / 1000)), 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.isRecording]);

  const submit = () => {
    if (!transcript.trim()) return;
    onSubmit(transcript, "voice", { durationSec: recordingSec });
    onClose();
  };

  return (
    <SheetWrapper title="Note vocale" onClose={onClose}>
      <div style={{ textAlign: "center", padding: "16px 0 4px" }}>
        <div style={{ position: "relative", width: 150, height: 150, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {recorder.isRecording && (
            <>
              <span style={{ position: "absolute", width: 80, height: 80, borderRadius: "50%", background: `${RD}20`, transform: `scale(${1 + level * 0.85})`, transition: "transform 0.09s ease-out", pointerEvents: "none" }} />
              <span style={{ position: "absolute", width: 80, height: 80, borderRadius: "50%", background: `${RD}14`, transform: `scale(${1.1 + level * 1.55})`, transition: "transform 0.14s ease-out", pointerEvents: "none" }} />
            </>
          )}
          <button
            onClick={recorder.isRecording ? recorder.stop : recorder.start}
            aria-label={recorder.isRecording ? "Arrêter l'enregistrement" : "Démarrer l'enregistrement"}
            style={{
              position: "relative",
              width: 80, height: 80, minHeight: 80, borderRadius: "50%",
              border: "none", background: recorder.isRecording ? RD : AC,
              color: "#fff", cursor: "pointer", fontFamily: "inherit",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              boxShadow: recorder.isRecording ? `0 6px 18px ${RD}55` : `0 4px 12px rgba(0,0,0,0.15)`,
              transition: "background 0.2s",
            }}
          >
            <Ico name="mic" size={32} color="#fff" />
          </button>
        </div>
        <div style={{ fontSize: 12, color: TX2, marginTop: 12, fontWeight: 600 }}>
          {recorder.isTranscribing ? "Transcription en cours…"
            : recorder.isRecording ? "Tap pour arrêter · ça enregistre…"
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

// ── Sheet : Note écrite ──
function TextNoteSheet({ onClose, onSubmit }) {
  const [text, setText] = useState("");
  const submit = () => {
    if (!text.trim()) return;
    onSubmit(text, "text");
    onClose();
  };
  return (
    <SheetWrapper title="Note écrite" onClose={onClose}>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={5}
        autoFocus
        placeholder="Note une observation, une décision prise sur place…"
        style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={onClose} style={btnSecondary}>Annuler</button>
        <button onClick={submit} disabled={!text.trim()} style={{ ...btnPrimary, flex: 2, background: text.trim() ? AC : DIS, color: text.trim() ? "#fff" : DIST, cursor: text.trim() ? "pointer" : "not-allowed" }}>
          Ajouter la note
        </button>
      </div>
    </SheetWrapper>
  );
}

// ── Sheet : Nouvelle réserve ──
function NewReserveSheet({ contractors, onClose, onSubmit }) {
  const fileRef = useRef(null);
  const [form, setForm] = useState({ description: "", severity: "major", contractor: "", location: "", deadline: "", photos: [] });
  const [dictating, setDictating] = useState(false);
  const canSubmit = form.description.trim().length > 0;

  const addPhoto = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result;
      setForm(f => ({ ...f, photos: [...f.photos, dataUrl] }));
      if (navigator.onLine) { try { const res = await uploadPhoto(dataUrl); if (res?.url) setForm(f => ({ ...f, photos: f.photos.map(p => p === dataUrl ? res.url : p) })); } catch { /* hors-ligne : reste en dataUrl, rejoint la file de synchro */ } }
    };
    reader.readAsDataURL(file); e.target.value = "";
  };
  const dictate = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR(); r.lang = "fr-FR"; r.interimResults = false;
    setDictating(true);
    r.onresult = (e) => { const t = e.results[0][0].transcript; setForm(f => ({ ...f, description: (f.description ? f.description + " " : "") + t })); };
    r.onend = () => setDictating(false); r.onerror = () => setDictating(false);
    r.start();
  };

  const ROW = { padding: "12px 14px" };
  const ROW_LBL = { fontSize: 11, color: TX3, marginBottom: 4 };
  const ROW_INPUT = { ...inputStyle, padding: "6px 0", border: "none", fontSize: 14, fontWeight: 500, background: "transparent" };

  return (
    <SheetWrapper title="Nouvelle réserve" onClose={onClose}>
      {/* Photos (capture d'abord) */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {form.photos.map((p, i) => (
          <div key={i} style={{ position: "relative" }}>
            <img src={p} alt="" style={{ width: 64, height: 64, borderRadius: 10, objectFit: "cover", border: `1px solid ${SBB}` }} />
            <button onClick={() => setForm(f => ({ ...f, photos: f.photos.filter((_, j) => j !== i) }))} style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 999, background: BR, border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Ico name="x" size={11} color="#fff" /></button>
          </div>
        ))}
        <button onClick={() => fileRef.current?.click()} style={{ width: 64, height: 64, borderRadius: 10, border: `1.5px dashed ${SBB}`, background: SB, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, color: TX3, fontFamily: "inherit" }}>
          <Ico name="camera" size={20} color={TX3} /><span style={{ fontSize: 9, fontWeight: 600 }}>Photo</span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={addPhoto} />
      </div>

      {/* Description + dictée */}
      <div style={{ fontSize: 12, fontWeight: 600, color: TX2, marginBottom: 6 }}>Description</div>
      <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="Décris le défaut constaté…" style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} />
      <button onClick={dictate} style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 8, background: "none", border: "none", color: AC, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
        <Ico name="mic" size={14} color={AC} />{dictating ? "Écoute…" : "Dicter la description"}
      </button>

      {/* Gravité (gros boutons) */}
      <div style={{ fontSize: 12, fontWeight: 600, color: TX2, marginTop: 16, marginBottom: 8 }}>Gravité</div>
      <div style={{ display: "flex", gap: 7 }}>
        {RESERVE_SEVERITIES.map(s => { const a = form.severity === s.id; return (
          <button key={s.id} onClick={() => setForm(f => ({ ...f, severity: s.id }))} style={{ flex: 1, height: 40, borderRadius: 10, border: `1.5px solid ${a ? s.color : SBB}`, background: a ? s.bg : WH, color: a ? s.color : TX3, fontSize: 12.5, fontWeight: a ? 600 : 500, cursor: "pointer", fontFamily: "inherit" }}>{s.label}</button>
        ); })}
      </div>

      {/* Localisation · responsable · échéance */}
      <div style={{ marginTop: 16, background: WH, border: `1px solid ${SBB}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={ROW}>
          <div style={ROW_LBL}>Localisation</div>
          <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="ex : Toiture · angle N-E" style={ROW_INPUT} />
        </div>
        <div style={{ height: 1, background: SB2, margin: "0 14px" }} />
        <div style={ROW}>
          <div style={ROW_LBL}>Responsable</div>
          <input list="contractors-list-chantier" value={form.contractor} onChange={e => setForm(f => ({ ...f, contractor: e.target.value }))} placeholder="ex : Toitures Lurquin" style={ROW_INPUT} />
          <datalist id="contractors-list-chantier">{contractors.map(c => <option key={c} value={c} />)}</datalist>
        </div>
        <div style={{ height: 1, background: SB2, margin: "0 14px" }} />
        <div style={ROW}>
          <div style={ROW_LBL}>Échéance</div>
          <input type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} style={ROW_INPUT} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button onClick={onClose} style={btnSecondary}>Annuler</button>
        <button onClick={() => onSubmit(form)} disabled={!canSubmit} style={{ ...btnPrimary, flex: 2, background: canSubmit ? AC : DIS, color: canSubmit ? "#fff" : DIST, cursor: canSubmit ? "pointer" : "not-allowed" }}>Ajouter la réserve</button>
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
          <div style={{ fontSize: 17, fontWeight: 700, color: TX, letterSpacing: "-0.3px" }}>{title}</div>
          <button onClick={onClose} aria-label="Fermer" style={{ width: 34, height: 34, minHeight: 34, flexShrink: 0, background: WH, border: `1px solid ${SBB}`, cursor: "pointer", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: TX2 }}>
            <Ico name="x" size={16} color={TX2} />
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

      {/* Garde-fou POC : au-delà d'1h, on prévient (pas de chunking — un
          enregistrement très long alourdit la mémoire et le blob est perdu
          si la page est rechargée avant la transcription). */}
      {recSec >= 3600 && (
        <div style={{
          padding: "10px 14px", background: "#FFF7ED", border: `1px solid ${AM}`,
          borderRadius: 10, marginBottom: 14, display: "flex", alignItems: "center", gap: 8,
        }}>
          <Ico name="alert" size={14} color={AM} />
          <span style={{ fontSize: 12, color: TX2, lineHeight: 1.4 }}>
            Réunion longue (&gt; 1 h). Pense à terminer la visite pour lancer la transcription —
            ne recharge pas la page tant que l'audio n'est pas transcrit.
          </span>
        </div>
      )}

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
