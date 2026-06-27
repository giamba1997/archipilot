import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../supabase";
import { AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, BR, BRB, REDBRD, RD, SP, FS, RAD } from "../constants/tokens";
import { Ico } from "../components/ui";
import { buildChatContext } from "../utils/chatContext";
import { processAttachment, formatBytes, isAttachmentSupported } from "../utils/chatAttachments";
import { parseFunctionError } from "../db";

const STORAGE_KEY = "archipilot_chat_history";
const ARCHIVE_KEY = "archipilot_chat_archives";
const HISTORY_CAP = 100; // 100 derniers messages — vraie mémoire de session pro
const ARCHIVE_CAP = 10;  // 10 conversations archivées max

// Greeting selon l'heure de la journée — moins "bot", plus humain.
const greetingFor = (firstName) => {
  const h = new Date().getHours();
  const name = firstName || "";
  if (h < 5) return name ? `Tu veilles tard, ${name} 🌙` : "Tu veilles tard 🌙";
  if (h < 12) return name ? `Bonjour ${name}` : "Bonjour";
  if (h < 18) return name ? `Salut ${name}` : "Salut";
  return name ? `Bonsoir ${name}` : "Bonsoir";
};

// Insight personnalisé sous le greeting — donne un point d'accroche concret.
// Ordre de priorité : urgences > réunion proche > PV en draft > sessions de temps.
const buildInsight = (projects = []) => {
  const active = projects.filter(p => !p.archived);
  if (active.length === 0) {
    return "Crée ton premier projet et je serai là pour t'aider à le piloter.";
  }
  const urgentCount = active.reduce((s, p) =>
    s + ((p.actions || []).filter(a => a.open && a.urgent).length), 0);
  if (urgentCount > 0) {
    return `${urgentCount} action${urgentCount > 1 ? "s" : ""} urgente${urgentCount > 1 ? "s" : ""} à traiter. On commence par où ?`;
  }
  const draftPvs = active.reduce((s, p) =>
    s + ((p.pvHistory || []).filter(pv => pv.status === "draft" || pv.status === "review").length), 0);
  if (draftPvs > 0) {
    return `${draftPvs} PV en attente de finalisation. Je peux t'aider à prioriser.`;
  }
  const upcomingMeetings = active.filter(p => {
    if (!p.nextMeeting) return false;
    const parts = p.nextMeeting.split("/");
    if (parts.length !== 3) return false;
    const date = new Date(parts[2], parts[1] - 1, parts[0]);
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const diff = (date - now) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 7;
  });
  if (upcomingMeetings.length > 0) {
    return `${upcomingMeetings.length} réunion${upcomingMeetings.length > 1 ? "s" : ""} cette semaine. Tu veux préparer quoi ?`;
  }
  return `${active.length} projet${active.length > 1 ? "s actifs" : " actif"}, rien de chaud. Demande ce que tu veux savoir.`;
};

// Suggestions adaptées au state — propose ce qui a du sens *là maintenant*.
const buildSuggestions = (projects = []) => {
  const active = projects.filter(p => !p.archived);
  const urgentCount = active.reduce((s, p) =>
    s + ((p.actions || []).filter(a => a.open && a.urgent).length), 0);
  const draftPvs = active.reduce((s, p) =>
    s + ((p.pvHistory || []).filter(pv => pv.status === "draft").length), 0);
  const totalSessions = active.reduce((s, p) => s + ((p.timeSessions || []).length), 0);

  const out = [];
  if (urgentCount > 0) {
    out.push({ icon: "alert", label: `Détaille mes ${urgentCount} action${urgentCount > 1 ? "s" : ""} urgente${urgentCount > 1 ? "s" : ""}` });
  } else {
    out.push({ icon: "alert", label: "Quelles urgences sur mes projets ?" });
  }
  if (draftPvs > 0) {
    out.push({ icon: "file", label: `Aide-moi à prioriser les ${draftPvs} PV en draft` });
  } else {
    out.push({ icon: "file", label: "Quel projet a le plus avancé ce mois ?" });
  }
  if (totalSessions > 0) {
    out.push({ icon: "clock", label: "Combien de temps cumulé ce mois ?" });
  } else {
    out.push({ icon: "clock", label: "Comment tracker mon temps efficacement ?" });
  }
  out.push({ icon: "calendar", label: "Que dois-je faire en priorité aujourd'hui ?" });
  return out;
};

// Mini-renderer markdown pour les réponses du bot (gras + listes simples).
// Volontairement limité : pas de XSS, pas de HTML brut, juste du texte enrichi.
const renderRichText = (text) => {
  if (!text) return [];
  const lines = text.split("\n");
  const blocks = [];
  let listBuffer = [];
  const flushList = () => {
    if (listBuffer.length) {
      blocks.push({ type: "list", items: listBuffer });
      listBuffer = [];
    }
  };
  for (const line of lines) {
    const trimmed = line.trimStart();
    const isBullet = /^[-*]\s+/.test(trimmed);
    if (isBullet) {
      listBuffer.push(trimmed.replace(/^[-*]\s+/, ""));
    } else if (trimmed === "") {
      flushList();
      blocks.push({ type: "spacer" });
    } else {
      flushList();
      blocks.push({ type: "para", text: line });
    }
  }
  flushList();
  return blocks;
};

// Parser inline simple — gras `**...**` uniquement. Retourne un array de
// segments React-friendly. Échappe le reste comme du texte plain.
const parseInline = (text) => {
  const segments = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      segments.push({ type: "text", value: text.slice(last, match.index) });
    }
    segments.push({ type: "bold", value: match[1] });
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    segments.push({ type: "text", value: text.slice(last) });
  }
  return segments;
};

const loadHistory = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};
const saveHistory = (msgs) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-HISTORY_CAP)));
  } catch { /* ignore */ }
};

// Conversations archivées — l'utilisateur peut basculer entre sujets sans
// perdre l'historique. On garde les ARCHIVE_CAP dernières conversations.
const loadArchives = () => {
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};
const saveArchives = (list) => {
  try {
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(list.slice(0, ARCHIVE_CAP)));
  } catch { /* ignore */ }
};
const titleForConversation = (msgs) => {
  // Titre = première question user, raccourci. Fallback : date.
  const firstUser = msgs.find(m => m.role === "user" && m.content);
  if (firstUser) {
    const t = String(firstUser.content).replace(/\s+/g, " ").trim();
    return t.length > 60 ? t.slice(0, 57) + "…" : t;
  }
  return `Conversation du ${new Date().toLocaleDateString("fr-BE")}`;
};

// ChatModal — fenêtre conversationnelle qui flotte au-dessus du contenu.
// Reçoit les data du parent pour construire le contexte (stuff context: pas
// d'embeddings, pas d'indexation — l'utilisateur a sa data en mémoire et on
// l'injecte directement dans le prompt).
export function ChatModal({ open, onClose, projects, profile, activeContext, activeProjectId, prefill, onPrefillConsumed, isMobile = false }) {
  const [messages, setMessages] = useState(() => loadHistory());
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  // Pièces jointes en attente d'envoi (image/PDF/texte). Reset après chaque
  // question. Pas persisté en localStorage (trop gros + pas de relance offline).
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  // Dictée vocale — Web Speech API. Toggle, append en append au textarea.
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [voiceErr, setVoiceErr] = useState("");
  // Conversations archivées (multi-sujets lite)
  const [archives, setArchives] = useState(() => loadArchives());
  const [showArchives, setShowArchives] = useState(false);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const dragCounterRef = useRef(0);
  const voiceRecRef = useRef(null);

  // Persistance localStorage
  useEffect(() => { saveHistory(messages); }, [messages]);

  // Autofocus + scroll bottom à l'ouverture / nouveau message
  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  // Pré-remplissage déclenché depuis l'extérieur (ex : bouton "Demander à l'IA"
  // sur la bannière du cahier des charges). Applique une fois puis notifie
  // le parent pour qu'il vide son state — ça évite qu'un re-render réapplique.
  useEffect(() => {
    if (!open || !prefill) return;
    if (prefill.attachments && prefill.attachments.length > 0) {
      setPendingAttachments(prefill.attachments);
    }
    if (prefill.message) {
      setInput(prefill.message);
    }
    onPrefillConsumed?.();
  }, [open, prefill, onPrefillConsumed]);

  // ── Dictée vocale ─────────────────────────────────────────
  // On stoppe le micro automatiquement à la fermeture du modal et au
  // démontage — sinon il reste actif en arrière-plan, ce qui est dérangeant
  // (icône micro browser persistante) et consomme batterie.
  const stopVoice = useCallback(() => {
    try { voiceRecRef.current?.stop(); } catch { /* recognition was already stopped */ }
    setIsVoiceRecording(false);
  }, []);
  useEffect(() => {
    if (!open && voiceRecRef.current) stopVoice();
  }, [open, stopVoice]);
  useEffect(() => () => stopVoice(), [stopVoice]);

  const startVoice = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setVoiceErr("Dictée non supportée par ce navigateur. Essaie Chrome ou Edge.");
      return;
    }
    setVoiceErr("");
    const rec = new SR();
    rec.lang = "fr-FR";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          const text = e.results[i][0].transcript.trim();
          if (text) {
            // Append au texte existant pour ne pas écraser ce que l'user a déjà tapé
            setInput(prev => prev ? `${prev.replace(/\s+$/, "")} ${text}` : text);
          }
        }
      }
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed") {
        setVoiceErr("Microphone refusé. Autorise l'accès dans ton navigateur.");
      } else if (e.error !== "no-speech") {
        setVoiceErr(`Erreur micro : ${e.error}`);
      }
      setIsVoiceRecording(false);
    };
    rec.onend = () => setIsVoiceRecording(false);
    voiceRecRef.current = rec;
    try {
      rec.start();
      setIsVoiceRecording(true);
    } catch {
      setVoiceErr("Impossible de démarrer la dictée.");
    }
  }, []);
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const sendQuestion = useCallback(async (questionText) => {
    const q = questionText?.trim();
    const hasAttachments = pendingAttachments.length > 0;
    if ((!q && !hasAttachments) || loading) return;
    // Si fichiers sans question, donne une question implicite (l'IA va inférer
    // ce qu'on attend d'elle à partir des fichiers + contexte projet).
    const finalQ = q || "Que penses-tu de ces fichiers, en lien avec mes projets ?";
    setErr("");
    setInput("");
    // Pour le storage : on garde uniquement les métadonnées des attachments
    // (nom, type, mimeType) pour pouvoir les afficher dans la bulle. On ne
    // stocke PAS le base64 (lourd, expire vite, déjà envoyé au serveur).
    const attachmentMeta = pendingAttachments.map(a => ({
      type: a.type, name: a.name, mimeType: a.mimeType,
      // On garde la dataUrl pour les images uniquement durant la session courante
      // (pour preview en re-affichage), mais elle ne survit pas au reload.
      previewUrl: a.previewUrl,
    }));
    const newUserMsg = {
      role: "user", content: finalQ, ts: Date.now(),
      attachments: attachmentMeta,
    };
    const next = [...messages, newUserMsg];
    setMessages(next);
    const sentAttachments = pendingAttachments;
    setPendingAttachments([]);
    setLoading(true);
    try {
      const context = buildChatContext({ projects, profile, activeContext, activeProjectId });
      // On envoie l'historique SANS les attachments (le modèle reverra les
      // fichiers fraîchement uploadés via `attachments` ; les anciens étaient
      // déjà discutés et leurs takeaways sont dans le texte).
      const history = next.slice(0, -1).map(m => ({ role: m.role, content: m.content }));
      // Payload des attachments envoyé au backend (avec base64/text complet).
      const attachmentsPayload = sentAttachments.map(a => ({
        type: a.type, name: a.name, mimeType: a.mimeType,
        dataUrl: a.dataUrl, content: a.content,
      }));
      const { data, error } = await supabase.functions.invoke("ask-archipilot", {
        body: { context, history, question: finalQ, attachments: attachmentsPayload },
      });
      if (error) {
        const body = await parseFunctionError(error);
        throw new Error(body.error || error.message || "Erreur serveur");
      }
      if (data?.error) throw new Error(data.error);
      const reply = data?.content;
      if (!reply) throw new Error("Réponse vide");
      setMessages(prev => [...prev, { role: "assistant", content: reply, ts: Date.now() }]);
    } catch (e) {
      setErr(e.message || "Une erreur est survenue.");
      // En cas d'erreur, on rend les attachments à l'utilisateur pour qu'il
      // puisse retenter (sinon il devrait les ré-uploader).
      setPendingAttachments(sentAttachments);
    } finally {
      setLoading(false);
    }
  }, [messages, projects, profile, activeContext, loading, pendingAttachments]);

  // Process une liste de fichiers (drag&drop ou file picker) en parallèle.
  // Les fichiers refusés (mauvais type/trop lourds) génèrent une erreur
  // visible mais n'empêchent pas les autres de passer.
  const handleFiles = useCallback(async (files) => {
    if (!files || files.length === 0) return;
    setErr("");
    setIsProcessing(true);
    const errors = [];
    const accepted = [];
    for (const file of files) {
      if (!isAttachmentSupported(file)) {
        errors.push(`${file.name} : format non supporté`);
        continue;
      }
      try {
        const att = await processAttachment(file);
        accepted.push(att);
      } catch (e) {
        errors.push(`${file.name} : ${e.message}`);
      }
    }
    if (accepted.length) {
      setPendingAttachments(prev => [...prev, ...accepted]);
    }
    if (errors.length) {
      setErr(errors.join(" · "));
    }
    setIsProcessing(false);
  }, []);

  const removeAttachment = (idx) => {
    setPendingAttachments(prev => prev.filter((_, i) => i !== idx));
  };

  // Drag & drop sur tout le panneau — counter pour gérer les enter/leave
  // sur les enfants nested sans flickering.
  const onDragEnter = (e) => {
    e.preventDefault(); e.stopPropagation();
    if (loading) return;
    dragCounterRef.current++;
    if (e.dataTransfer?.types?.includes("Files")) setIsDragging(true);
  };
  const onDragLeave = (e) => {
    e.preventDefault(); e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      setIsDragging(false);
      dragCounterRef.current = 0;
    }
  };
  const onDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };
  const onDrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;
    if (loading) return;
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length) handleFiles(files);
  };

  // Archive la conversation actuelle (si non vide) puis vide. Pas de prompt :
  // l'archive est la mécanique de safety net, on ne perd rien. Si l'archi
  // veut vraiment supprimer, il peut le faire depuis le panneau archives.
  const handleNewTopic = () => {
    if (messages.length > 0) {
      const archived = {
        id: Date.now(),
        title: titleForConversation(messages),
        createdAt: new Date().toISOString(),
        messages,
      };
      const next = [archived, ...archives];
      setArchives(next);
      saveArchives(next);
    }
    setMessages([]);
    setErr("");
    setShowArchives(false);
    setPendingAttachments([]);
    setInput("");
  };

  const handleLoadArchive = (archiveId) => {
    const target = archives.find(a => a.id === archiveId);
    if (!target) return;
    // On archive d'abord la conversation actuelle pour ne rien perdre
    let nextArchives = archives;
    if (messages.length > 0) {
      const current = {
        id: Date.now(),
        title: titleForConversation(messages),
        createdAt: new Date().toISOString(),
        messages,
      };
      nextArchives = [current, ...archives];
    }
    // Puis on retire celle qu'on rouvre de la liste (elle redevient courante)
    nextArchives = nextArchives.filter(a => a.id !== archiveId);
    setArchives(nextArchives);
    saveArchives(nextArchives);
    setMessages(target.messages || []);
    setShowArchives(false);
    setErr("");
  };

  const handleDeleteArchive = (archiveId) => {
    if (!confirm("Supprimer définitivement cette conversation archivée ?")) return;
    const next = archives.filter(a => a.id !== archiveId);
    setArchives(next);
    saveArchives(next);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendQuestion(input);
    }
  };

  if (!open) return null;

  const empty = messages.length === 0;
  const firstName = profile?.name?.split(" ")[0] || "";
  const greeting = greetingFor(firstName);
  const insight = empty ? buildInsight(projects) : null;
  const suggestions = empty ? buildSuggestions(projects) : [];

  return (
    <>
      {/* Backdrop transparent — clic ferme */}
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, background: "transparent", zIndex: 998,
      }} />
      {/* Panneau flottant bottom-right */}
      <div
        role="dialog" aria-label="Assistant ArchiPilot"
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        style={{
          // Sur mobile : le panneau s'ouvre au-dessus du FAB (lui-même
          // au-dessus de la MobileBottomBar v3). 108 + 56 (FAB) + 8 gap +
          // safe-area = ~172 px d'offset bas. Sur desktop, on garde 92.
          position: "fixed",
          bottom: isMobile ? `calc(172px + env(safe-area-inset-bottom, 0px))` : 92,
          right: isMobile ? 12 : 24,
          left: isMobile ? 12 : "auto",
          zIndex: 999,
          width: isMobile ? "auto" : 560, maxWidth: "calc(100vw - 32px)",
          height: 680, maxHeight: isMobile
            ? "calc(100vh - 252px - env(safe-area-inset-bottom, 0px))"
            : "calc(100vh - 130px)",
          background: WH, border: `1px solid ${SBB}`, borderRadius: 14,
          boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
          display: "flex", flexDirection: "column", overflow: "hidden",
          animation: "chatPopIn 0.18s ease-out",
          fontFamily: "inherit",
        }}
      >
        {/* Header — gauche : titre + sujet courant ; droite : nouveau / archives / close */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 12px 10px 14px", borderBottom: `1px solid ${SBB}`,
          background: ACL, gap: 8,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0, flex: 1 }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%", background: AC,
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <span style={{ fontSize: 13, color: "#fff", fontWeight: 700 }}>✦</span>
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: TX, lineHeight: 1.2 }}>
                Assistant ArchiPilot
              </div>
              <div
                title={
                  showArchives ? "Conversations passées"
                  : messages.length === 0 ? "Pose tes questions sur tes projets"
                  : titleForConversation(messages)
                }
                style={{
                  fontSize: 10, color: TX3, marginTop: 1,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
              >
                {showArchives
                  ? "Conversations passées"
                  : messages.length === 0
                    ? "Pose tes questions sur tes projets"
                    : titleForConversation(messages)}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
            {messages.length > 0 && !showArchives && (
              <button
                onClick={handleNewTopic}
                aria-label="Nouveau sujet"
                title="Nouveau sujet — archive le fil actuel et repart frais"
                style={{
                  width: 28, height: 28, border: `1px solid ${ACL2}`, borderRadius: 6,
                  background: WH, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit",
                }}
              >
                <Ico name="plus" size={13} color={TX2} />
              </button>
            )}
            {archives.length > 0 && (
              <button
                onClick={() => setShowArchives(s => !s)}
                aria-label={`${archives.length} sujet${archives.length > 1 ? "s" : ""} passé${archives.length > 1 ? "s" : ""}`}
                aria-pressed={showArchives}
                title={showArchives ? "Revenir à la conversation" : "Voir les conversations passées"}
                style={{
                  height: 28, padding: "0 10px",
                  border: `1px solid ${showArchives ? AC : ACL2}`, borderRadius: 6,
                  background: showArchives ? AC : WH, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit",
                  transition: "all 0.12s",
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 600, color: showArchives ? "#fff" : TX2 }}>
                  {archives.length} sujet{archives.length > 1 ? "s" : ""} passé{archives.length > 1 ? "s" : ""}
                </span>
                <span style={{ fontSize: 9, color: showArchives ? "#fff" : TX3, lineHeight: 1, transform: showArchives ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>▾</span>
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Fermer"
              title="Fermer"
              style={{
                width: 28, height: 28, border: "none", borderRadius: 6,
                background: "transparent", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                marginLeft: 2,
              }}
            >
              <Ico name="x" size={14} color={TX3} />
            </button>
          </div>
        </div>

        {/* Body — messages OU liste des archives */}
        <div ref={scrollRef} style={{
          flex: 1, overflowY: "auto", padding: "16px",
          display: "flex", flexDirection: "column", gap: 12,
          background: SB,
        }}>
          {showArchives ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: TX3, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Conversations archivées
                </span>
                <button
                  onClick={() => setShowArchives(false)}
                  style={{ background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 11, color: TX3, padding: 4 }}
                >
                  Retour
                </button>
              </div>
              {archives.length === 0 ? (
                <div style={{ padding: "32px 16px", textAlign: "center", color: TX3, fontSize: 12, lineHeight: 1.5 }}>
                  Aucune conversation archivée pour le moment.<br />
                  Utilise « Nouveau sujet » pour archiver la conversation actuelle.
                </div>
              ) : (
                archives.map(a => (
                  <div
                    key={a.id}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 10,
                      padding: "10px 12px", background: WH, border: `1px solid ${SBB}`, borderRadius: 8,
                      cursor: "pointer", transition: "border-color 0.12s",
                    }}
                    onClick={() => handleLoadArchive(a.id)}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = ACL2; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = SBB; }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: TX, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {a.title}
                      </div>
                      <div style={{ fontSize: 10, color: TX3, marginTop: 2 }}>
                        {a.messages.length} message{a.messages.length > 1 ? "s" : ""} · {new Date(a.createdAt).toLocaleDateString("fr-BE", { day: "numeric", month: "short" })}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteArchive(a.id); }}
                      aria-label="Supprimer cette archive"
                      style={{ width: 24, height: 24, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 4 }}
                    >
                      <Ico name="trash" size={10} color={TX3} />
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : empty ? (
            // Empty state — greeting contextuel + insight personnalisé + suggestions dynamiques
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 18, padding: "20px 8px" }}>
              <div style={{
                width: 56, height: 56, borderRadius: "50%", background: ACL,
                display: "flex", alignItems: "center", justifyContent: "center",
                border: `1px solid ${ACL2}`,
              }}>
                <span style={{ fontSize: 22, color: AC }}>✦</span>
              </div>
              <div style={{ textAlign: "center", maxWidth: 320 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: TX, marginBottom: 6, letterSpacing: "-0.2px" }}>
                  {greeting}
                </div>
                <div style={{ fontSize: 12, color: TX2, lineHeight: 1.5 }}>
                  {insight}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%", marginTop: 4 }}>
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => sendQuestion(s.label)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "9px 12px", border: `1px solid ${SBB}`, borderRadius: 8,
                      background: WH, cursor: "pointer", fontFamily: "inherit",
                      textAlign: "left",
                      transition: "all 0.12s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = ACL2;
                      e.currentTarget.style.background = ACL;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = SBB;
                      e.currentTarget.style.background = WH;
                    }}
                  >
                    <Ico name={s.icon} size={12} color={AC} />
                    <span style={{ fontSize: 12, color: TX2, fontWeight: 500 }}>{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            // Liste des messages
            messages.map((m, i) => (
              <div key={i} style={{
                display: "flex", flexDirection: "column",
                alignItems: m.role === "user" ? "flex-end" : "flex-start",
              }}>
                <div style={{
                  maxWidth: "85%",
                  padding: "9px 13px", borderRadius: 12,
                  background: m.role === "user" ? AC : WH,
                  color: m.role === "user" ? "#fff" : TX,
                  border: m.role === "user" ? "none" : `1px solid ${SBB}`,
                  fontSize: 13, lineHeight: 1.55,
                  wordBreak: "break-word",
                }}>
                  {/* Pièces jointes du user — thumbnails image, label PDF/text */}
                  {m.role === "user" && m.attachments && m.attachments.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: m.content ? 6 : 0 }}>
                      {m.attachments.map((att, ai) => att.type === "image" && att.previewUrl ? (
                        <img key={ai} src={att.previewUrl} alt={att.name}
                          style={{ width: 80, height: 80, borderRadius: 8, objectFit: "cover", border: `1px solid rgba(255,255,255,0.3)` }} />
                      ) : (
                        <div key={ai} style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          padding: "4px 8px", background: "rgba(255,255,255,0.18)",
                          borderRadius: 6, fontSize: 11, fontWeight: 500,
                          color: "#fff",
                        }}>
                          <Ico name="file" size={11} color="#fff" />
                          <span style={{ maxWidth: 160, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{att.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {m.role === "user" ? (
                    <span style={{ whiteSpace: "pre-wrap" }}>{m.content}</span>
                  ) : (
                    // Render assistant messages with light markdown (bold + bullets)
                    renderRichText(m.content).map((block, bi) => {
                      if (block.type === "list") {
                        return (
                          <ul key={bi} style={{ margin: "4px 0 4px 0", paddingLeft: 18, listStyle: "disc" }}>
                            {block.items.map((item, ii) => (
                              <li key={ii} style={{ marginBottom: 2 }}>
                                {parseInline(item).map((seg, si) => (
                                  seg.type === "bold"
                                    ? <strong key={si} style={{ color: TX, fontWeight: 700 }}>{seg.value}</strong>
                                    : <span key={si}>{seg.value}</span>
                                ))}
                              </li>
                            ))}
                          </ul>
                        );
                      }
                      if (block.type === "spacer") {
                        return <div key={bi} style={{ height: 4 }} />;
                      }
                      // para
                      return (
                        <div key={bi} style={{ marginBottom: 2 }}>
                          {parseInline(block.text).map((seg, si) => (
                            seg.type === "bold"
                              ? <strong key={si} style={{ color: TX, fontWeight: 700 }}>{seg.value}</strong>
                              : <span key={si}>{seg.value}</span>
                          ))}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ))
          )}
          {loading && (
            <div style={{ display: "flex", alignItems: "flex-start" }}>
              <div style={{
                maxWidth: "85%",
                padding: "9px 13px", borderRadius: 12,
                background: WH, border: `1px solid ${SBB}`,
                display: "inline-flex", alignItems: "center", gap: 6,
              }}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{
                    width: 6, height: 6, borderRadius: "50%", background: TX3,
                    animation: `chatTyping 1.2s ease-in-out ${i * 0.15}s infinite`,
                  }} />
                ))}
              </div>
            </div>
          )}
          {err && (
            <div style={{
              padding: "9px 12px", background: BRB, border: `1px solid ${REDBRD}`,
              borderRadius: 8, fontSize: 12, color: BR,
            }}>
              {err}
            </div>
          )}
          {voiceErr && (
            <div style={{
              padding: "9px 12px", background: BRB, border: `1px solid ${REDBRD}`,
              borderRadius: 8, fontSize: 12, color: BR,
            }}>
              {voiceErr}
            </div>
          )}
        </div>

        {/* Pending attachments preview */}
        {pendingAttachments.length > 0 && (
          <div style={{
            padding: "10px 14px 0",
            background: WH,
            display: "flex", flexWrap: "wrap", gap: 6,
            borderTop: `1px solid ${SBB}`,
          }}>
            {pendingAttachments.map((att, i) => (
              <div key={i} style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "5px 6px 5px 8px",
                background: SB, border: `1px solid ${SBB}`, borderRadius: 8,
                fontSize: 11, color: TX2,
              }}>
                {att.type === "image" && att.previewUrl ? (
                  <img src={att.previewUrl} alt={att.name}
                    style={{ width: 28, height: 28, borderRadius: 4, objectFit: "cover" }} />
                ) : (
                  <Ico name="file" size={12} color={TX3} />
                )}
                <span style={{ maxWidth: 120, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: 500 }}>{att.name}</span>
                <button onClick={() => removeAttachment(i)}
                  aria-label={`Retirer ${att.name}`}
                  style={{ width: 18, height: 18, borderRadius: 4, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                  <Ico name="x" size={10} color={TX3} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input */}
        <div style={{
          padding: "10px 14px 12px", borderTop: pendingAttachments.length > 0 ? "none" : `1px solid ${SBB}`,
          background: WH,
          display: "flex", gap: 6, alignItems: "flex-end",
        }}>
          {/* Hidden file input pilotée par le bouton paperclip */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.txt,.md,.csv"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length) handleFiles(files);
              e.target.value = ""; // reset pour permettre re-upload du même fichier
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading || isProcessing}
            aria-label="Joindre un fichier"
            title="Joindre une photo, un PDF ou un document texte"
            style={{
              width: 36, height: 36, flexShrink: 0,
              border: `1px solid ${SBB}`, borderRadius: 8,
              background: WH, color: TX2,
              cursor: loading || isProcessing ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.12s",
              opacity: loading || isProcessing ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              if (loading || isProcessing) return;
              e.currentTarget.style.borderColor = ACL2;
              e.currentTarget.style.background = ACL;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = SBB;
              e.currentTarget.style.background = WH;
            }}
          >
            {isProcessing ? (
              <span style={{ width: 12, height: 12, border: `2px solid ${SBB}`, borderTopColor: AC, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
            ) : (
              <Ico name="upload" size={14} color={TX2} />
            )}
          </button>
          <button
            onClick={isVoiceRecording ? stopVoice : startVoice}
            disabled={loading}
            aria-label={isVoiceRecording ? "Arrêter la dictée" : "Dicter ta question"}
            aria-pressed={isVoiceRecording}
            title={isVoiceRecording ? "Arrêter la dictée" : "Dicte ta question (fr-FR)"}
            style={{
              width: 36, height: 36, flexShrink: 0,
              border: `1px solid ${isVoiceRecording ? RD : SBB}`, borderRadius: 8,
              background: isVoiceRecording ? RD : WH,
              cursor: loading ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.12s",
              opacity: loading ? 0.5 : 1,
              animation: isVoiceRecording ? "ring 1.4s ease infinite" : "none",
            }}
          >
            <Ico name="mic" size={14} color={isVoiceRecording ? "#fff" : TX2} />
          </button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              // Auto-grow vertical jusqu'à maxHeight pour éviter la barre de scroll
              // qui masque les premières lignes quand on rédige un paragraphe.
              e.target.style.height = "auto";
              const next = Math.min(e.target.scrollHeight, 280);
              e.target.style.height = next + "px";
            }}
            onKeyDown={handleKeyDown}
            disabled={loading}
            placeholder={pendingAttachments.length > 0 ? "Pose ta question sur ces fichiers…" : "Pose ta question…"}
            rows={3}
            style={{
              flex: 1, resize: "vertical",
              padding: "10px 12px", border: `1px solid ${SBB}`, borderRadius: 8,
              fontSize: 13, fontFamily: "inherit", lineHeight: 1.5,
              background: SB, color: TX, boxSizing: "border-box",
              minHeight: 80, maxHeight: 280, outline: "none",
            }}
            onFocus={(e) => { e.target.style.borderColor = AC; e.target.style.background = WH; }}
            onBlur={(e) => { e.target.style.borderColor = SBB; e.target.style.background = SB; }}
          />
          <button
            onClick={() => sendQuestion(input)}
            disabled={(!input.trim() && pendingAttachments.length === 0) || loading}
            aria-label="Envoyer"
            style={{
              width: 36, height: 36, flexShrink: 0,
              border: "none", borderRadius: 8,
              background: (input.trim() || pendingAttachments.length > 0) && !loading ? AC : SB2,
              color: (input.trim() || pendingAttachments.length > 0) && !loading ? "#fff" : TX3,
              cursor: (input.trim() || pendingAttachments.length > 0) && !loading ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.12s",
            }}
          >
            <Ico name="send" size={14} color={(input.trim() || pendingAttachments.length > 0) && !loading ? "#fff" : TX3} />
          </button>
        </div>

        {/* Drop overlay */}
        {isDragging && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 10,
            background: "rgba(184,92,44,0.08)",
            border: `2px dashed ${AC}`, borderRadius: 14,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 8, pointerEvents: "none",
            backdropFilter: "blur(2px)",
          }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: WH, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(184,92,44,0.20)" }}>
              <Ico name="upload" size={22} color={AC} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: AC }}>Dépose tes fichiers ici</div>
            <div style={{ fontSize: 11, color: TX2 }}>Photos, PDF, texte</div>
          </div>
        )}
      </div>
    </>
  );
}

// Bouton flottant qui ouvre la modal — bottom-right.
//
// Couleur : warm dark TX (pas AC terracotta). La terracotta est réservée
// au FAB Visite (différenciateur PWA mobile, cf. mobile review P0). Avoir
// deux cercles terracotta dans la même bande basse créait une ambiguïté
// visuelle — gants + écran 6" = mis-taps probables. Le neutre TX reste
// reconnaissable comme FAB (taille + forme + ombre) sans capter l'attention
// au détriment du Visite FAB.
export function ChatLauncher({ open, onToggle, hasUnread = false, isMobile = false }) {
  // Sur mobile, on remonte le FAB pour qu'il ne chevauche pas la
  // MobileBottomBar v3 : 60 px nav + 36 px du SVG bump (qui héberge le
  // FAB Visite central) + safe-area = ~96 px de zone visuelle. On laisse
  // 12 px de marge confort pour ne pas frôler la courbe du bord droit.
  // En desktop, on garde l'ancrage bas standard.
  const bottomOffset = isMobile
    ? `calc(108px + env(safe-area-inset-bottom, 0px))`
    : 24;
  return (
    <button
      onClick={onToggle}
      aria-label={open ? "Fermer l'assistant" : "Ouvrir l'assistant"}
      title={open ? "Fermer l'assistant" : "Ouvrir l'assistant ArchiPilot"}
      style={{
        position: "fixed", bottom: bottomOffset, right: isMobile ? 16 : 24, zIndex: 997,
        width: 56, height: 56, borderRadius: "50%",
        background: TX, color: "#fff", border: "none",
        cursor: "pointer", fontFamily: "inherit",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: open
          ? "0 4px 12px rgba(28,25,23,0.25)"
          : "0 6px 20px rgba(28,25,23,0.30), 0 2px 6px rgba(0,0,0,0.10)",
        transition: "all 0.18s ease",
        transform: open ? "scale(0.92)" : "scale(1)",
      }}
      onMouseEnter={(e) => {
        if (!open) e.currentTarget.style.transform = "scale(1.05)";
      }}
      onMouseLeave={(e) => {
        if (!open) e.currentTarget.style.transform = "scale(1)";
      }}
    >
      {open ? (
        <Ico name="x" size={20} color="#fff" />
      ) : (
        <span style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, color: "#fff" }}>✦</span>
      )}
      {hasUnread && !open && (
        <span style={{
          position: "absolute", top: 2, right: 2,
          width: 10, height: 10, borderRadius: "50%",
          background: BR, border: `2px solid ${WH}`,
        }} />
      )}
    </button>
  );
}
