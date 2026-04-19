import { useState, useRef, useEffect } from "react";
import { useT, useTP } from "../i18n";
import { supabase } from "../supabase";
import { AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, RD, GR, SP, FS, RAD, DIS, DIST, REDBG, REDBRD, GRBG } from "../constants/tokens";
import { getStatus, nextStatus, getRemarkStatus } from "../constants/statuses";
import { Ico, PB } from "../components/ui";
import { parseNotesToRemarks } from "../utils/helpers";
import { uploadPhoto, deletePhoto, getPhotoUrl, track } from "../db";
import { addToOfflineQueue, savePvDraft } from "../utils/offline";
import { AnnotationEditor } from "./AnnotationEditor";

const SAMPLES = { "01": "- peinture démarrée rdc, 1ere couche ok\n- goulottes en cours\n- resserrages coupe-feu TOUJOURS PAS FAITS\n> retard 5 jours ouvrables", "02": "- MO rappelle: gilet fluo + casque obligatoires\n- nettoyage insuffisant", "03": "- réception phase 1 repoussée au 22/04", "45": "- bandes antislip posées, conforme\n- carrelage meeting #6 remplacé", "59": "- film opaque posé ok\n- joints vitrages à reprendre", "70-HVAC": "- flexibles corrigés 6/10\n- radiateur hall commandé", "70-ELEC": "- goulottes 5 locaux ok\n- screens en cours" };

export function NoteEditor({ project, setProjects, profile, onBack, onGenerate, initialMode }) {
  const [activePost,      setActivePost]      = useState(null);
  const [annotatingPhoto, setAnnotatingPhoto] = useState(null);
  const [addText,    setAddText]    = useState("");
  const [addUrgent,  setAddUrgent]  = useState(false);
  const [recipientFilters, setRecipientFilters] = useState(null); // null = not chosen yet, [] = tous explicitly
  const hasExistingRemarks = project.posts.some(p => (p.remarks || []).length > 0 || p.notes?.trim());
  const [inputMethod, setInputMethod] = useState(() => initialMode || "write"); // "write" | "dictate"
  const [pendingDictation, setPendingDictation] = useState(initialMode === "dictate"); // show waiting state until recording starts
  const [selectedMethod, setSelectedMethod] = useState("dictate"); // pre-selected method in chooser
  const [pvTitle, setPvTitle] = useState(`PV n°${project.pvHistory.length + 1}`);
  const [currentStep, setCurrentStep] = useState(0);
  const [renamingPost, setRenamingPost] = useState(null);
  const [renameVal,    setRenameVal]    = useState("");
  const [inputMode,    setInputMode]    = useState("write"); // "write" | "voice"
  const [isRecording,  setIsRecording]  = useState(false);
  const [voiceInterim, setVoiceInterim] = useState("");
  const [voiceErr,     setVoiceErr]     = useState("");
  const photoRef       = useRef(null);
  const addInputRef    = useRef(null);
  const recognitionRef = useRef(null);
  const t = useT();
  const tp = useTP();

  // ── Auto-carry unresolved remarks from previous PV ──
  const [carryDone, setCarryDone] = useState(false);
  useEffect(() => {
    if (carryDone) return;
    const lastPv = project.pvHistory?.[0]; // pvHistory is newest-first
    const lastPvNum = lastPv?.number || project.pvHistory?.length || 0;
    if (lastPvNum === 0) { setCarryDone(true); return; }

    // Count unresolved remarks without carriedFrom
    let unresolvedCount = 0;
    project.posts.forEach(post => {
      (post.remarks || []).forEach(r => {
        if (r.status !== "done" && !r.carriedFrom) unresolvedCount++;
      });
      // Also check legacy notes (not yet converted to remarks)
      if ((post.remarks || []).length === 0 && post.notes?.trim()) {
        unresolvedCount++; // notes exist = unprocessed content
      }
    });

    if (unresolvedCount === 0) { setCarryDone(true); return; }

    // Mark unresolved remarks with carriedFrom
    const updatedPosts = project.posts.map(post => {
      const remarks = post.remarks || [];
      // Convert legacy notes to remarks first
      let finalRemarks = remarks;
      if (remarks.length === 0 && post.notes?.trim()) {
        finalRemarks = parseNotesToRemarks(post.notes);
      }
      if (finalRemarks.length === 0) return post;
      const updated = finalRemarks.map(r => {
        if (r.status !== "done" && !r.carriedFrom) {
          return { ...r, carriedFrom: lastPvNum };
        }
        return r;
      });
      return { ...post, remarks: updated, notes: "" };
    });

    setProjects(prev => prev.map(p => p.id === project.id ? { ...p, posts: updatedPosts } : p));
    setCarryDone(true);
  }, [carryDone, project.id]);

  // ── Attendance tracking ──
  const [attendance, setAttendance] = useState(
    () => project.participants.map(p => ({ ...p, present: true }))
  );
  const toggleAttendance = (idx) => setAttendance(prev => prev.map((a, i) => i === idx ? { ...a, present: !a.present } : a));

  // ── Visit timestamp ──
  const [visitStart] = useState(() => new Date().toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" }));
  const [visitEnd, setVisitEnd] = useState("");

  // Arrêter la reconnaissance vocale quand on change de poste
  useEffect(() => {
    return () => { recognitionRef.current?.stop(); };
  }, [activePost]);

  const stopVoice = () => {
    recognitionRef.current?.stop();
    setIsRecording(false);
    setVoiceInterim("");
  };

  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setVoiceErr(t("notes.voiceNotSupported"));
      return;
    }
    setVoiceErr("");
    const rec = new SR();
    rec.lang = "fr-FR";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          const text = e.results[i][0].transcript.trim();
          if (text) {
            const post = project.posts.find((p) => p.id === activePost);
            if (post) {
              const current = getRemarks(post);
              setRemarks(post.id, [...current, { id: Date.now() + Math.random(), text, urgent: false, status: "open" }]);
            }
          }
        } else {
          interim += e.results[i][0].transcript;
        }
      }
      setVoiceInterim(interim);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed") setVoiceErr(t("notes.micDenied"));
      else if (e.error !== "no-speech") setVoiceErr("Erreur microphone : " + e.error);
      setIsRecording(false);
      setVoiceInterim("");
    };
    rec.onend = () => { setIsRecording(false); setVoiceInterim(""); };
    recognitionRef.current = rec;
    rec.start();
    setIsRecording(true);
  };

  // ── Continuous recording (global, not per-post) ──
  const [contRecording, setContRecording] = useState(false);
  const [contTranscript, setContTranscript] = useState("");
  const [contInterim, setContInterim] = useState("");
  const [contDispatching, setContDispatching] = useState(false);
  const [contReview, setContReview] = useState(false);
  const [contErr, setContErr] = useState("");
  const [contSeconds, setContSeconds] = useState(0);
  const contRecRef = useRef(null);
  const contTimerRef = useRef(null);
  const contTranscriptRef = useRef("");

  const startContinuous = (resume = false) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setContErr(t("notes.voiceNotSupported")); return; }
    setContErr("");
    if (!resume) {
      setContTranscript("");
      setContSeconds(0);
      contTranscriptRef.current = "";
    }
    setContInterim("");
    const rec = new SR();
    rec.lang = "fr-FR";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          const text = e.results[i][0].transcript.trim();
          if (text) {
            contTranscriptRef.current += (contTranscriptRef.current ? " " : "") + text;
            setContTranscript(contTranscriptRef.current);
          }
        } else {
          interim += e.results[i][0].transcript;
        }
      }
      setContInterim(interim);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed") setContErr(t("notes.micDenied"));
      else if (e.error !== "no-speech") setContErr("Erreur microphone : " + e.error);
      setContRecording(false);
      clearInterval(contTimerRef.current);
    };
    rec.onend = () => {
      // Auto-restart if still in continuous mode (browser stops after silence)
      // Check both _keepAlive AND that contRecRef still points to this instance
      if (rec._keepAlive && contRecRef.current === rec) {
        try { rec.start(); } catch (_) {}
      }
    };
    rec._keepAlive = true;
    contRecRef.current = rec;
    rec.start();
    setContRecording(true);
    contTimerRef.current = setInterval(() => setContSeconds(s => s + 1), 1000);
  };

  // Auto-start dictation when initialMode is "dictate"
  const dictateStartedRef = useRef(false);
  useEffect(() => {
    if (initialMode === "dictate" && inputMethod === "dictate" && !dictateStartedRef.current) {
      dictateStartedRef.current = true;
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR) {
        const timer = setTimeout(() => {
          startContinuous();
          setPendingDictation(false);
        }, 500);
        return () => clearTimeout(timer);
      } else {
        setPendingDictation(false);
      }
    }
  }, [initialMode, inputMethod]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopContinuous = () => {
    // Disable auto-restart BEFORE stopping
    if (contRecRef.current) {
      contRecRef.current._keepAlive = false;
    }
    // Small delay to let the last onresult fire before we read the ref
    setTimeout(() => {
      if (contRecRef.current) {
        try { contRecRef.current.stop(); } catch (_) {}
        contRecRef.current = null;
      }
      setContRecording(false);
      setContInterim("");
      clearInterval(contTimerRef.current);
      // Combine finalized transcript + any pending interim
      const transcript = contTranscriptRef.current.trim();
      if (!transcript) {
        // Nothing was captured — go back to chooser
        setInputMethod(null);
        return;
      }
      setContTranscript(transcript);
      setContReview(true);
    }, 300);
  };

  const submitTranscript = async () => {
    const transcript = contTranscript.trim();
    if (!transcript) return;
    setContReview(false);
    await dispatchTranscript(transcript);
  };

  const dispatchTranscript = async (transcript) => {
    setContDispatching(true);
    setContErr("");
    try {
      const posts = project.posts.map(p => ({ id: p.id, label: p.label }));
      console.log("dispatch-remarks payload:", { transcript: transcript?.slice(0, 100), transcriptLength: transcript?.length, postsCount: posts.length, posts });
      if (!transcript?.trim()) {
        throw new Error("La transcription est vide. Parlez dans le microphone avant de répartir.");
      }
      if (!posts?.length) {
        // Auto-create a default post if none exist
        setProjects(prev => prev.map(p => p.id === project.id && (!p.posts || p.posts.length === 0) ? { ...p, posts: [{ id: "01", label: "Situation du chantier", notes: "", remarks: [] }] } : p));
        throw new Error("Aucun poste défini — un poste par défaut a été créé. Réessayez.");
      }
      const { data, error } = await supabase.functions.invoke("dispatch-remarks", {
        body: { transcript, posts },
      });
      if (error) throw new Error(error.message || "Erreur serveur");
      if (data?.error) throw new Error(data.error);
      const items = data?.items;
      if (!Array.isArray(items)) throw new Error("Réponse invalide");
      // Normalize postIds for flexible matching (e.g. "1" matches "01")
      const normalizeId = (id) => String(id).replace(/^0+/, "") || "0";
      const postIds = project.posts.map(po => po.id);
      const findPost = (rawId) => {
        const s = String(rawId);
        if (postIds.includes(s)) return s;
        const norm = normalizeId(s);
        const match = postIds.find(pid => normalizeId(pid) === norm);
        return match || postIds[0] || null;
      };
      const grouped = {};
      for (const it of items) {
        const resolvedId = findPost(it.postId);
        if (!resolvedId) continue;
        if (!grouped[resolvedId]) grouped[resolvedId] = [];
        grouped[resolvedId].push({ id: Date.now() + Math.random(), text: it.text, urgent: !!it.urgent, status: "open" });
      }
      setProjects(prev => prev.map(p => {
        if (p.id !== project.id) return p;
        const updatedPosts = p.posts.map(po => {
          const newRemarks = grouped[po.id] || [];
          if (newRemarks.length === 0) return po;
          const existing = (po.remarks || []).length > 0 ? po.remarks : (po.notes?.trim() ? parseNotesToRemarks(po.notes) : []);
          return { ...po, remarks: [...existing, ...newRemarks], notes: "" };
        });
        return { ...p, posts: updatedPosts };
      }));
      setContTranscript("");
      setInputMethod("write");
    } catch (e) {
      console.error("Dispatch error:", e);
      setContErr("Erreur : " + e.message);
      setContReview(true);
    } finally {
      setContDispatching(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (contRecRef.current) { contRecRef.current._keepAlive = false; contRecRef.current.stop(); }
      clearInterval(contTimerRef.current);
    };
  }, []);

  const initials = (name) => name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  const updatePost = (postId, patch) => setProjects((prev) => prev.map((p) => p.id === project.id ? {
    ...p, posts: p.posts.map((po) => po.id === postId ? { ...po, ...patch } : po)
  } : p));

  const getRemarks = (post) => {
    // Migrate legacy notes on first access
    if ((post.remarks || []).length === 0 && post.notes?.trim()) {
      return parseNotesToRemarks(post.notes);
    }
    return post.remarks || [];
  };

  // ── Undo / Redo ──
  const historyRef = useRef({}); // { [postId]: { past: [[...remarks]], future: [[...remarks]] } }
  const getHistory = (postId) => {
    if (!historyRef.current[postId]) historyRef.current[postId] = { past: [], future: [] };
    return historyRef.current[postId];
  };
  const canUndo = (postId) => (getHistory(postId).past.length > 0);
  const canRedo = (postId) => (getHistory(postId).future.length > 0);
  const [, forceUpdate] = useState(0); // trigger re-render after undo/redo

  const setRemarks = (postId, remarks) => {
    // Push current state to undo stack before applying change
    const post = project.posts.find(p => p.id === postId);
    const current = post?.remarks || [];
    const h = getHistory(postId);
    h.past.push(JSON.parse(JSON.stringify(current)));
    if (h.past.length > 50) h.past.shift(); // cap history
    h.future = []; // clear redo on new action
    updatePost(postId, { remarks, notes: "" });
  };

  const undo = (postId) => {
    const h = getHistory(postId);
    if (h.past.length === 0) return;
    const post = project.posts.find(p => p.id === postId);
    const current = post?.remarks || [];
    h.future.push(JSON.parse(JSON.stringify(current)));
    const prev = h.past.pop();
    updatePost(postId, { remarks: prev, notes: "" });
    forceUpdate(n => n + 1);
  };

  const redo = (postId) => {
    const h = getHistory(postId);
    if (h.future.length === 0) return;
    const post = project.posts.find(p => p.id === postId);
    const current = post?.remarks || [];
    h.past.push(JSON.parse(JSON.stringify(current)));
    const next = h.future.pop();
    updatePost(postId, { remarks: next, notes: "" });
    forceUpdate(n => n + 1);
  };

  // Ctrl+Z / Ctrl+Shift+Z keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      // Don't intercept in text inputs
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (activePost) {
        // Inside a post: undo/redo remarks
        if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(activePost); }
        if ((e.key === "z" && e.shiftKey) || e.key === "y") { e.preventDefault(); redo(activePost); }
      } else {
        // Post list level: undo/redo post add/delete
        if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undoPosts(); }
        if ((e.key === "z" && e.shiftKey) || e.key === "y") { e.preventDefault(); redoPosts(); }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [activePost]);

  const addRemark = (postId) => {
    if (!addText.trim()) return;
    const post = project.posts.find((p) => p.id === postId);
    const current = getRemarks(post);
    const newRemark = { id: Date.now() + Math.random(), text: addText.trim(), urgent: addUrgent, status: "open" };
    setRemarks(postId, [...current, newRemark]);
    setAddText("");
    // keep urgency toggle so rapid entries stay consistent
    setTimeout(() => addInputRef.current?.focus(), 30);
  };

  const removeRemark = (postId, remarkId) => {
    const post = project.posts.find((p) => p.id === postId);
    setRemarks(postId, getRemarks(post).filter((r) => r.id !== remarkId));
  };

  const cycleStatus = (postId, remarkId) => {
    const post = project.posts.find((p) => p.id === postId);
    setRemarks(postId, getRemarks(post).map((r) => r.id === remarkId ? { ...r, status: nextStatus(r.status) } : r));
  };

  const editRemarkText = (postId, remarkId, text) => {
    const post = project.posts.find((p) => p.id === postId);
    setRemarks(postId, getRemarks(post).map((r) => r.id === remarkId ? { ...r, text } : r));
  };

  const toggleRemarkUrgent = (postId, remarkId) => {
    const post = project.posts.find((p) => p.id === postId);
    setRemarks(postId, getRemarks(post).map((r) => r.id === remarkId ? { ...r, urgent: !r.urgent } : r));
  };

  const toggleRemarkRecipient = (postId, remarkId, participantName) => {
    const post = project.posts.find((p) => p.id === postId);
    setRemarks(postId, getRemarks(post).map((r) => {
      if (r.id !== remarkId) return r;
      const cur = r.recipients || [];
      const has = cur.includes(participantName);
      return { ...r, recipients: has ? cur.filter((n) => n !== participantName) : [...cur, participantName] };
    }));
  };

  const addPhotos = (postId, files) => {
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = ev.target.result;
        const photoId = Date.now() + Math.random();
        // Add immediately with dataUrl for instant preview
        setProjects((prev) => prev.map((p) => p.id === project.id ? {
          ...p, posts: p.posts.map((po) => po.id === postId ? {
            ...po, photos: [...(po.photos || []), { id: photoId, dataUrl }]
          } : po)
        } : p));
        // Upload to Storage in background, then replace dataUrl with URL
        if (navigator.onLine) {
          const result = await uploadPhoto(dataUrl);
          if (result) {
            setProjects((prev) => prev.map((p) => p.id === project.id ? {
              ...p, posts: p.posts.map((po) => po.id === postId ? {
                ...po, photos: (po.photos || []).map((ph) => ph.id === photoId ? { ...ph, url: result.url, storagePath: result.storagePath } : ph)
              } : po)
            } : p));
          }
        } else {
          // Queue for upload when back online — photo stays as dataUrl locally
          addToOfflineQueue({ type: "photo_upload", projectId: project.id, postId, photoId, dataUrl: dataUrl.slice(0, 50) + "..." });
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removePhoto = (postId, photoId) => {
    const post = project.posts.find(po => po.id === postId);
    const photo = (post?.photos || []).find(ph => ph.id === photoId);
    if (photo?.storagePath) deletePhoto(photo.storagePath);
    setProjects((prev) => prev.map((p) => p.id === project.id ? {
      ...p, posts: p.posts.map((po) => po.id === postId ? { ...po, photos: (po.photos || []).filter((ph) => ph.id !== photoId) } : po)
    } : p));
  };

  const saveAnnotation = async (postId, photoId, newDataUrl) => {
    // Update locally immediately
    setProjects((prev) => prev.map((p) => p.id === project.id ? {
      ...p, posts: p.posts.map((po) => po.id === postId ? {
        ...po, photos: (po.photos || []).map((ph) => ph.id === photoId ? { ...ph, dataUrl: newDataUrl, annotated: true } : ph)
      } : po)
    } : p));
    setAnnotatingPhoto(null);
    // Re-upload annotated version to Storage
    const result = await uploadPhoto(newDataUrl);
    if (result) {
      // Delete old file if exists
      const post = project.posts.find(po => po.id === postId);
      const oldPhoto = (post?.photos || []).find(ph => ph.id === photoId);
      if (oldPhoto?.storagePath) deletePhoto(oldPhoto.storagePath);
      // Update with new URL
      setProjects((prev) => prev.map((p) => p.id === project.id ? {
        ...p, posts: p.posts.map((po) => po.id === postId ? {
          ...po, photos: (po.photos || []).map((ph) => ph.id === photoId ? { ...ph, url: result.url, storagePath: result.storagePath } : ph)
        } : po)
      } : p));
    }
  };

  const loadSamples = () => setProjects((prev) => prev.map((p) => p.id === project.id ? {
    ...p, posts: p.posts.map((po) => ({
      ...po,
      remarks: SAMPLES[po.id] ? parseNotesToRemarks(SAMPLES[po.id]) : (po.remarks || []),
      notes: "",
    }))
  } : p));

  const commitRename = (postId) => {
    if (renameVal.trim()) {
      setProjects(prev => prev.map(p => p.id === project.id ? {
        ...p, posts: p.posts.map(po => po.id === postId ? { ...po, label: renameVal.trim() } : po)
      } : p));
    }
    setRenamingPost(null);
  };

  // ── Global posts undo/redo (for add/delete post) ──
  const postsHistoryRef = useRef({ past: [], future: [] });
  const canUndoPosts = postsHistoryRef.current.past.length > 0;
  const canRedoPosts = postsHistoryRef.current.future.length > 0;

  const pushPostsHistory = () => {
    const h = postsHistoryRef.current;
    h.past.push(JSON.parse(JSON.stringify(project.posts)));
    if (h.past.length > 30) h.past.shift();
    h.future = [];
  };

  const undoPosts = () => {
    const h = postsHistoryRef.current;
    if (h.past.length === 0) return;
    h.future.push(JSON.parse(JSON.stringify(project.posts)));
    const prev = h.past.pop();
    setProjects(p => p.map(pr => pr.id === project.id ? { ...pr, posts: prev } : pr));
    forceUpdate(n => n + 1);
  };

  const redoPosts = () => {
    const h = postsHistoryRef.current;
    if (h.future.length === 0) return;
    h.past.push(JSON.parse(JSON.stringify(project.posts)));
    const next = h.future.pop();
    setProjects(p => p.map(pr => pr.id === project.id ? { ...pr, posts: next } : pr));
    forceUpdate(n => n + 1);
  };

  const deletePost = (postId) => {
    pushPostsHistory();
    setProjects(prev => prev.map(p => p.id === project.id ? {
      ...p, posts: p.posts.filter(po => po.id !== postId)
    } : p));
  };

  const filledCount = project.posts.filter((p) => {
    const remarks = (p.remarks || []).length > 0 ? p.remarks : (p.notes?.trim() ? parseNotesToRemarks(p.notes) : []);
    return remarks.length > 0 || (p.photos || []).length > 0 || (project.planMarkers || []).some((m) => m.postId === p.id);
  }).length;

  if (annotatingPhoto) {
    return (
      <AnnotationEditor
        photo={annotatingPhoto.photo}
        project={project}
        setProjects={setProjects}
        postId={annotatingPhoto.postId}
        onSave={(dataUrl) => saveAnnotation(annotatingPhoto.postId, annotatingPhoto.photo.id, dataUrl)}
        onClose={() => setAnnotatingPhoto(null)}
      />
    );
  }

  if (activePost) {
    const post    = project.posts.find((p) => p.id === activePost);
    const photos  = post.photos || [];
    const remarks = getRemarks(post);
    const openCount     = remarks.filter((r) => r.status === "open").length;
    const progressCount = remarks.filter((r) => r.status === "progress").length;
    const doneCount     = remarks.filter((r) => r.status === "done").length;

    return (
      <div>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <button onClick={() => setActivePost(null)} style={{ background: "none", border: "none", cursor: "pointer", padding: "8px", minWidth: 40, minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 }}><Ico name="back" color={TX2} /></button>
          <div style={{ flex: 1 }}>
          </div>
          {/* Undo / Redo — prominent in header */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            <button onClick={() => undo(activePost)} disabled={!canUndo(activePost)} title="Annuler (Ctrl+Z)" style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", border: `1px solid ${canUndo(activePost) ? SBB : "transparent"}`, borderRadius: 7, background: canUndo(activePost) ? WH : "transparent", cursor: canUndo(activePost) ? "pointer" : "default", fontFamily: "inherit", opacity: canUndo(activePost) ? 1 : 0.35, transition: "all 0.15s" }}>
              <Ico name="undo" size={14} color={canUndo(activePost) ? TX : TX3} />
              <span style={{ fontSize: 11, fontWeight: 500, color: canUndo(activePost) ? TX2 : TX3 }}>Annuler</span>
            </button>
            <button onClick={() => redo(activePost)} disabled={!canRedo(activePost)} title="Rétablir (Ctrl+Shift+Z)" style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", border: `1px solid ${canRedo(activePost) ? SBB : "transparent"}`, borderRadius: 7, background: canRedo(activePost) ? WH : "transparent", cursor: canRedo(activePost) ? "pointer" : "default", fontFamily: "inherit", opacity: canRedo(activePost) ? 1 : 0.35, transition: "all 0.15s" }}>
              <Ico name="repeat" size={14} color={canRedo(activePost) ? TX : TX3} />
              <span style={{ fontSize: 11, fontWeight: 500, color: canRedo(activePost) ? TX2 : TX3 }}>Rétablir</span>
            </button>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            {renamingPost === post.id ? (
              <input
                autoFocus
                value={renameVal}
                onChange={(e) => setRenameVal(e.target.value)}
                onBlur={() => commitRename(post.id)}
                onKeyDown={(e) => { if (e.key === "Enter") commitRename(post.id); if (e.key === "Escape") setRenamingPost(null); }}
                style={{ fontSize: 16, fontWeight: 600, color: TX, border: `1px solid ${AC}`, borderRadius: 6, padding: "3px 8px", background: WH, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" }}
              />
            ) : (
              <div
                onClick={() => { setRenamingPost(post.id); setRenameVal(post.label); }}
                style={{ fontSize: 16, fontWeight: 600, color: TX, cursor: "text", display: "flex", alignItems: "center", gap: 6 }}
                title={t("notes.rename")}
              >
                {post.id}. {post.label}
                <Ico name="edit" size={13} color={TX3} />
              </div>
            )}
            {remarks.length > 0 && (
              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                {openCount > 0     && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: FS.sm, fontWeight: 600, color: "#B91C1C", background: "#FEF2F2", padding: "2px 8px 2px 6px", borderRadius: 20 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "#EF4444", display: "inline-block" }} />{openCount} {t("notes.toProcess")}</span>}
                {progressCount > 0 && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: FS.sm, fontWeight: 600, color: "#92400E", background: "#FFFBEB", padding: "2px 8px 2px 6px", borderRadius: 20 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: AC,       display: "inline-block" }} />{progressCount} {t("notes.inProgress")}</span>}
                {doneCount > 0     && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: FS.sm, fontWeight: 600, color: "#166534", background: "#F0FDF4",  padding: "2px 8px 2px 6px", borderRadius: 20 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: GR,        display: "inline-block" }} />{doneCount} résolu{doneCount > 1 ? "s" : ""}</span>}
              </div>
            )}
          </div>
        </div>

        {/* Mode toggle: Écrire / Dicter */}
        <div style={{ display: "flex", gap: 4, marginBottom: 12, background: SB, borderRadius: 10, padding: 4 }}>
          <button
            onClick={() => { setInputMode("write"); stopVoice(); }}
            style={{ flex: 1, padding: "7px", border: "none", borderRadius: 8, background: inputMode === "write" ? WH : "transparent", color: inputMode === "write" ? TX : TX3, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, boxShadow: inputMode === "write" ? "0 1px 3px rgba(0,0,0,0.08)" : "none", transition: "all 0.15s" }}
          >
            <Ico name="edit" size={14} color={inputMode === "write" ? TX : TX3} />{t("notes.write")}
          </button>
          <button
            onClick={() => { setInputMode("voice"); setAddText(""); setAddUrgent(false); }}
            style={{ flex: 1, padding: "7px", border: "none", borderRadius: 8, background: inputMode === "voice" ? WH : "transparent", color: inputMode === "voice" ? RD : TX3, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, boxShadow: inputMode === "voice" ? "0 1px 3px rgba(0,0,0,0.08)" : "none", transition: "all 0.15s" }}
          >
            <Ico name="mic" size={14} color={inputMode === "voice" ? RD : TX3} />{t("notes.dictate")}
          </button>
        </div>

        {inputMode === "write" ? (
          <>
            {/* Quick-add texte */}
            <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center" }}>
              <button onClick={() => setAddUrgent(false)} style={{ padding: "5px 11px", border: "none", borderRadius: 6, background: !addUrgent ? SB2 : SB, color: !addUrgent ? TX : TX3, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>{t("notes.observation")}</button>
              <button onClick={() => setAddUrgent(true)}  style={{ padding: "5px 11px", border: "none", borderRadius: 6, background: addUrgent ? REDBG : SB, color: addUrgent ? RD : TX3, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>{t("notes.urgentBtn")}</button>
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              <input
                ref={addInputRef}
                value={addText}
                onChange={(e) => setAddText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addRemark(post.id); }}
                placeholder={addUrgent ? t("notes.placeholderUrgent") : t("notes.placeholderNormal")}
                style={{ flex: 1, padding: "9px 12px", border: `1px solid ${addUrgent ? RD + "60" : SBB}`, borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: WH, color: TX }}
                autoFocus
              />
              <button onClick={() => addRemark(post.id)} style={{ padding: "9px 14px", border: "none", borderRadius: 8, background: AC, color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                <Ico name="plus" size={16} color="#fff" />
              </button>
            </div>
          </>
        ) : (
          /* Interface dictée vocale */
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "28px 20px 20px", marginBottom: 12, background: isRecording ? REDBG : SB, borderRadius: 12, border: `1px solid ${isRecording ? RD + "40" : SBB}`, transition: "background 0.3s, border-color 0.3s" }}>
            <button
              onClick={isRecording ? stopVoice : startVoice}
              style={{ width: 76, height: 76, borderRadius: "50%", background: isRecording ? RD : WH, border: `2px solid ${isRecording ? RD : SBB}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, animation: isRecording ? "ring 1.4s ease infinite" : "none", boxShadow: isRecording ? "none" : "0 2px 10px rgba(0,0,0,0.1)", transition: "background 0.2s, border-color 0.2s" }}
            >
              <Ico name="mic" size={30} color={isRecording ? "#fff" : TX2} />
            </button>
            <div style={{ fontSize: 14, fontWeight: 600, color: isRecording ? RD : TX2, marginBottom: 6 }}>
              {isRecording ? t("notes.listening") : t("notes.pressToSpeak")}
            </div>
            {voiceInterim && (
              <div style={{ fontSize: 13, color: TX3, fontStyle: "italic", textAlign: "center", maxWidth: 320, lineHeight: 1.5, marginTop: 4 }}>
                « {voiceInterim} »
              </div>
            )}
            {voiceErr && (
              <div style={{ marginTop: 10, fontSize: 12, color: RD, textAlign: "center", padding: "8px 12px", background: REDBG, borderRadius: 8, border: `1px solid ${RD}20` }}>{voiceErr}</div>
            )}
            {!voiceErr && !isRecording && (
              <div style={{ fontSize: 11, color: TX3, marginTop: 6, textAlign: "center" }}>
                {t("notes.voiceSentence")}
              </div>
            )}
          </div>
        )}

        {/* Remark list */}
        {remarks.length > 0 ? (
          <div style={{ marginBottom: 12 }}>
            {remarks.map((r) => {
              const rs = getRemarkStatus(r.status);
              return (
                <div key={r.id} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 10px", marginBottom: 4, background: WH, border: `1px solid ${SBB}`, borderRadius: 10 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
                    {/* Status pill — click to cycle */}
                    <button onClick={() => cycleStatus(post.id, r.id)} title={`Statut : ${rs.label} — cliquer pour changer`} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: SP.xs, padding: `${SP.xs}px ${SP.sm + 1}px ${SP.xs}px ${SP.sm - 2}px`, border: `1px solid ${r.urgent && r.status === "open" ? REDBRD : rs.dot + "40"}`, borderRadius: 20, background: r.urgent && r.status === "open" ? "#FEF2F2" : rs.bg, cursor: "pointer", fontFamily: "inherit", marginTop: 1, whiteSpace: "nowrap", outline: "none", transition: "all 0.15s" }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: r.urgent && r.status === "open" ? "#EF4444" : rs.dot, flexShrink: 0 }} />
                      <span style={{ fontSize: FS.sm, fontWeight: 700, color: r.urgent && r.status === "open" ? "#B91C1C" : rs.color }}>
                        {r.urgent && r.status === "open" ? t("notes.urgent") : rs.label}
                      </span>
                      <Ico name="chevron-down" size={9} color={r.urgent && r.status === "open" ? "#B91C1C" : rs.color} />
                    </button>
                    {r.carriedFrom && <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9, fontWeight: 600, color: AC, background: ACL, border: `1px solid ${ACL2}`, padding: "2px 6px", borderRadius: 20, marginTop: 2, whiteSpace: "nowrap" }}>↩ PV{r.carriedFrom}</span>}
                    <input value={r.text} onChange={(e) => editRemarkText(post.id, r.id, e.target.value)} style={{ flex: 1, border: "none", outline: "none", fontSize: 13, color: r.status === "done" ? TX3 : TX, background: "transparent", fontFamily: "inherit", textDecoration: r.status === "done" ? "line-through" : "none", padding: 0, minWidth: 0 }} />
                    <button onClick={() => removeRemark(post.id, r.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0 }}>
                      <Ico name="x" size={13} color={TX3} />
                    </button>
                  </div>
                  {/* Participant assignment chips */}
                  {project.participants.length > 0 && (
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", paddingLeft: 2 }}>
                      {project.participants.map((p, pi) => {
                        const assigned = (r.recipients || []).includes(p.name);
                        return (
                          <button key={pi} onClick={() => toggleRemarkRecipient(post.id, r.id, p.name)} title={`${assigned ? "Retirer" : "Assigner à"} ${p.name}`} style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 7px", border: `1px solid ${assigned ? AC : SBB}`, borderRadius: 20, background: assigned ? ACL : "transparent", cursor: "pointer", fontFamily: "inherit" }}>
                            <div style={{ width: 16, height: 16, borderRadius: "50%", background: assigned ? AC : SB2, color: assigned ? "#fff" : TX3, fontSize: 8, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              {initials(p.name)}
                            </div>
                            <span style={{ fontSize: 10, color: assigned ? AC : TX3, fontWeight: assigned ? 600 : 400 }}>{p.name.split(" ")[0]}</span>
                          </button>
                        );
                      })}
                      {(r.recipients || []).length === 0 && <span style={{ fontSize: 10, color: TX3, fontStyle: "italic", alignSelf: "center" }}>{t("notes.allRecipientsList")}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: TX3, padding: "12px 0", textAlign: "center" }}>{t("notes.noRemarks")}</div>
        )}

        {/* Photos */}
        <div style={{ padding: "12px 14px", background: SB, borderRadius: 10, border: `1px solid ${SBB}`, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: photos.length > 0 ? 10 : 0 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: TX2 }}>{t("notes.photos")}{photos.length > 0 ? ` (${photos.length})` : ""}</span>
            <button onClick={() => photoRef.current.click()} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", border: "none", borderRadius: 6, background: ACL, cursor: "pointer", fontFamily: "inherit" }}>
              <Ico name="camera" size={13} color={AC} />
              <span style={{ fontSize: 12, fontWeight: 600, color: AC }}>{t("notes.addPhotos")}</span>
            </button>
            <input ref={photoRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => { addPhotos(post.id, e.target.files); e.target.value = ""; }} />
          </div>
          {photos.length > 0 ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {photos.map((ph) => (
                <div key={ph.id} style={{ position: "relative", width: 80, height: 80, flexShrink: 0 }}>
                  <img src={getPhotoUrl(ph)} alt="" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: `2px solid ${ph.annotated ? AC : SBB}` }} />
                  <button onClick={() => setAnnotatingPhoto({ postId: post.id, photo: ph })} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0)", borderRadius: 8, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0, transition: "opacity 0.15s" }} onMouseEnter={(e) => e.currentTarget.style.opacity="1"} onMouseLeave={(e) => e.currentTarget.style.opacity="0"} onFocus={(e) => e.currentTarget.style.opacity="1"} onBlur={(e) => e.currentTarget.style.opacity="0"} title={t("notes.annotate")}>
                    <div style={{ background: "rgba(0,0,0,0.55)", borderRadius: 6, padding: "4px 6px" }}><Ico name="pen2" size={12} color="#fff" /></div>
                  </button>
                  {ph.annotated && <div style={{ position: "absolute", bottom: 3, left: 3, background: AC, borderRadius: 4, padding: "1px 4px" }}><Ico name="pen2" size={9} color="#fff" /></div>}
                  <button onClick={() => removePhoto(post.id, ph.id)} aria-label="Supprimer la photo" style={{ position: "absolute", top: -6, right: -6, width: 24, height: 24, borderRadius: "50%", background: RD, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                    <Ico name="x" size={10} color="#fff" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: TX3, marginTop: 4 }}>{t("notes.noPhotos")}</div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: TX3 }}>{remarks.length} remarque{remarks.length !== 1 ? "s" : ""} · {photos.length} photo{photos.length !== 1 ? "s" : ""}</span>
          <button onClick={() => setActivePost(null)} style={{ padding: "8px 20px", border: "none", borderRadius: 8, background: AC, color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>{t("validate")}</button>
        </div>
      </div>
    );
  }

  // Compute carried-over remarks summary
  const allCarried = project.posts.flatMap((p) => (p.remarks || []).filter((r) => r.carriedFrom));
  const carriedCount = allCarried.length;
  const carriedFromPV = carriedCount > 0 ? Math.max(...allCarried.map((r) => r.carriedFrom)) : null;

  // Stats pour le résumé
  const totalRemarks = project.posts.reduce((acc, p) => acc + getRemarks(p).length, 0);
  const urgentCount  = project.posts.reduce((acc, p) => acc + getRemarks(p).filter(r => r.urgent).length, 0);
  const totalPhotos  = project.posts.reduce((acc, p) => acc + (p.photos || []).length, 0);
  const readyToGenerate = filledCount > 0 && recipientFilters !== null;

  // Steps data (shared between desktop and mobile)
  const stepsData = [
    { step: 1, label: "Saisie", sub: `${filledCount}/${project.posts.length} postes`, icon: "listcheck", done: filledCount > 0 },
    { step: 2, label: "Destinataires", sub: recipientFilters === null ? "À définir" : recipientFilters.length === 0 ? "Tous" : `${recipientFilters.length} filtrés`, icon: "users", done: recipientFilters !== null },
    { step: 3, label: "Génération", sub: readyToGenerate ? "Prêt" : "En attente", icon: "send", done: false },
  ];
  // currentStep is now managed by useState above — no auto-calculation needed

  return (
    <div className="ap-note-container" data-mobile-step={currentStep} style={{ paddingBottom: 32 }}>

      {/* ── Mobile top bar — back + stepper ── */}
      <div className="ap-note-mobile-stepper" style={{ display: "none", padding: "8px 0 10px", flexShrink: 0, borderBottom: `1px solid ${SB2}`, marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0 }}>
            {stepsData.map((s, i) => {
              const isDone = s.done;
              const isActive = i === currentStep;
              return (
                <div key={s.step} style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0 }}>
                  <div
                    onClick={() => setCurrentStep(i)}
                    style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", flex: 1, minWidth: 0, padding: "3px 4px", borderRadius: 6, background: isActive ? ACL : "transparent", transition: "all 0.15s" }}
                  >
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: isDone ? AC : isActive ? AC : SB2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.2s" }}>
                      {isDone ? <Ico name="check" size={9} color="#fff" /> : <span style={{ fontSize: 9, fontWeight: 700, color: isActive ? "#fff" : TX3 }}>{s.step}</span>}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: isActive ? 700 : 500, color: isActive ? TX : isDone ? AC : TX3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.label}</span>
                  </div>
                  {i < stepsData.length - 1 && (
                    <div style={{ width: 12, height: 2, background: isDone ? AC : SBB, borderRadius: 1, flexShrink: 0, margin: "0 2px" }} />
                  )}
                </div>
              );
            })}
        </div>
      </div>

      {/* ── Desktop Header ── */}
      <div className="ap-note-desktop-header" style={{ background: WH, borderRadius: 12, padding: "16px 20px 14px", marginBottom: 14, border: `1px solid ${SBB}`, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <button onClick={onBack} style={{ background: SB, border: `1px solid ${SBB}`, cursor: "pointer", padding: 7, minWidth: 36, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, flexShrink: 0, marginTop: 1 }}>
            <Ico name="back" color={TX2} size={16} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 1 }}>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: AC, background: ACL, padding: "2px 7px", borderRadius: 3 }}>{t("notes.redaction")}</div>
            </div>
            <input
              value={pvTitle}
              onChange={(e) => setPvTitle(e.target.value)}
              style={{ fontSize: 20, fontWeight: 800, color: TX, border: "none", background: "transparent", outline: "none", padding: 0, fontFamily: "inherit", width: "100%", letterSpacing: "-0.4px", lineHeight: 1.25 }}
              title="Cliquez pour renommer"
            />
            <div style={{ fontSize: 11, color: TX3, marginTop: 2, display: "flex", alignItems: "center", gap: 5 }}>
              <span>{project.name}</span>
              <span style={{ width: 2.5, height: 2.5, borderRadius: "50%", background: TX3, opacity: 0.5 }} />
              <span>{new Date().toLocaleDateString("fr-BE", { day: "numeric", month: "long", year: "numeric" })}</span>
            </div>
          </div>
          <button onClick={loadSamples} style={{ padding: "6px 12px", border: `1px solid ${SBB}`, borderRadius: 7, background: WH, cursor: "pointer", fontSize: 10, color: TX3, fontFamily: "inherit", flexShrink: 0, fontWeight: 500 }}>{t("examples")}</button>
        </div>

        {/* Barre de progression — cliquable, basée sur currentStep */}
        {(() => {
          const steps = [
            { step: 0, label: t("notes.stepPosts"), sub: `${filledCount}/${project.posts.length}`, icon: "listcheck", done: filledCount > 0 },
            { step: 1, label: t("notes.stepRecipients"), sub: recipientFilters === null ? "À définir" : recipientFilters.length === 0 ? t("notes.allRecipients") : `${recipientFilters.length} filtrés`, icon: "users", done: recipientFilters !== null },
            { step: 2, label: t("notes.stepGeneration"), sub: readyToGenerate ? t("notes.stepReady") : t("notes.stepWaiting"), icon: "send", done: false },
          ];
          return (
            <div style={{ marginTop: 14, background: SB, borderRadius: 10, padding: "4px 4px", display: "flex", alignItems: "stretch", gap: 3 }}>
              {steps.map((s, i) => {
                const isDone = s.done;
                const isActive = i === currentStep;
                return (
                  <div key={s.step} style={{ flex: 1, display: "flex", alignItems: "center", gap: 0, minWidth: 0 }}>
                    <div
                      onClick={() => setCurrentStep(i)}
                      style={{
                        flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                        background: isActive ? WH : "transparent",
                        borderRadius: 8, cursor: "pointer",
                        boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                        transition: "all 0.25s",
                      }}>
                      <div style={{
                        width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                        background: isDone ? AC : isActive ? AC + "14" : SB2,
                        border: isActive ? `2px solid ${AC}` : "2px solid transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: isDone ? "0 1px 3px rgba(192,90,44,0.25)" : "none",
                        transition: "all 0.3s",
                      }}>
                        {isDone
                          ? <Ico name="check" size={11} color="#fff" />
                          : <Ico name={s.icon} size={11} color={isActive ? AC : TX3} />
                        }
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: isDone || isActive ? 700 : 500, color: isDone ? TX : isActive ? TX : TX3, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {s.label}
                        </div>
                        <div style={{ fontSize: 9.5, color: isDone ? GR : isActive ? AC : DIST, fontWeight: 500, marginTop: 0, whiteSpace: "nowrap" }}>
                          {isDone ? t("notes.stepCompleted") : s.sub}
                        </div>
                      </div>
                    </div>
                    {i < steps.length - 1 && (
                      <div style={{ width: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Ico name="arrowr" size={9} color={isDone ? AC : SBB} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* ── Step 0: Saisie ── */}
      <div className="ap-note-section-0" style={{ display: currentStep === 0 ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>

      {/* Content area for step 0 */}
      <div className="ap-note-step-content">

      {/* ── Rappel remarques non clôturées ── */}
      {carriedCount > 0 && (
        <div className="ap-carried-reminder" style={{ display: "flex", alignItems: "stretch", borderRadius: 10, marginBottom: 12, overflow: "hidden", border: `1px solid ${ACL2}`, background: WH }}>
          <div style={{ width: 4, background: AC, flexShrink: 0 }} />
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: ACL }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: WH, border: `1px solid ${ACL2}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Ico name="repeat" size={14} color={AC} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TX, lineHeight: 1.3 }}>
                {carriedCount} remarque{carriedCount > 1 ? "s" : ""} reportée{carriedCount > 1 ? "s" : ""}
                <span style={{ fontWeight: 500, color: TX2 }}> depuis le PV n°{carriedFromPV}</span>
              </div>
              <div style={{ fontSize: 10.5, color: TX3, marginTop: 2, lineHeight: 1.3 }}>{t("notes.carried.desc")}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0, background: WH, border: `1px solid ${ACL2}`, borderRadius: 6, padding: "4px 8px" }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: AC, lineHeight: 1 }}>{carriedCount}</span>
              <span style={{ fontSize: 9, color: TX3, fontWeight: 500, lineHeight: 1.1 }}>à<br/>suivre</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Section 1 : Remarques ── */}
      <div className="ap-section-card" style={{ background: WH, borderRadius: 12, border: `1px solid ${SBB}`, overflow: "hidden", marginBottom: 12 }}>
        {/* Section header */}
        <div className="ap-section-hdr" style={{ padding: "11px 16px", borderBottom: `1px solid ${SBB}`, background: SB }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: filledCount > 0 ? AC : SB2, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: filledCount > 0 ? "0 1px 3px rgba(217,123,13,0.25)" : "none" }}>
                {filledCount > 0 ? <Ico name="check" size={11} color="#fff" /> : <span style={{ fontSize: 9, fontWeight: 700, color: TX3 }}>1</span>}
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: TX, letterSpacing: "-0.1px" }}>{t("notes.posts")}</span>
              <span style={{ fontSize: 10.5, color: TX3, fontWeight: 400 }}>{filledCount}/{project.posts.length}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {/* Inline stat chips */}
            {(totalRemarks > 0 || totalPhotos > 0) && (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: WH, border: `1px solid ${SBB}`, borderRadius: 6, padding: "3px 8px" }}>
                  <Ico name="edit" size={10} color={TX3} />
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: TX2 }}>{totalRemarks}</span>
                </div>
                {urgentCount > 0 && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: REDBG, border: `1px solid ${REDBRD}`, borderRadius: 6, padding: "3px 8px" }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: RD, flexShrink: 0 }} />
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: RD }}>{urgentCount}</span>
                  </div>
                )}
                {carriedCount > 0 && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: ACL, border: `1px solid ${ACL2}`, borderRadius: 6, padding: "3px 8px" }}>
                    <Ico name="repeat" size={9} color={AC} />
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: AC }}>{carriedCount}</span>
                  </div>
                )}
                {totalPhotos > 0 && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: WH, border: `1px solid ${SBB}`, borderRadius: 6, padding: "3px 8px" }}>
                    <Ico name="camera" size={10} color={TX3} />
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: TX2 }}>{totalPhotos}</span>
                  </div>
                )}
              </div>
            )}
            {/* Undo/Redo posts */}
            {(canUndoPosts || canRedoPosts) && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 2, background: WH, border: `1px solid ${SBB}`, borderRadius: 6, padding: "2px" }}>
                <button onClick={undoPosts} disabled={!canUndoPosts} title="Annuler (Ctrl+Z)" style={{ width: 26, height: 26, border: "none", borderRadius: 4, background: canUndoPosts ? "transparent" : "transparent", cursor: canUndoPosts ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", opacity: canUndoPosts ? 1 : 0.3 }}>
                  <Ico name="undo" size={12} color={TX2} />
                </button>
                <button onClick={redoPosts} disabled={!canRedoPosts} title="Rétablir (Ctrl+Shift+Z)" style={{ width: 26, height: 26, border: "none", borderRadius: 4, background: canRedoPosts ? "transparent" : "transparent", cursor: canRedoPosts ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", opacity: canRedoPosts ? 1 : 0.3 }}>
                  <Ico name="repeat" size={12} color={TX2} />
                </button>
              </div>
            )}
            {/* Delete all posts — hidden on mobile */}
            {project.posts.length > 0 && (
              <button
                className="ap-delete-all-btn"
                onClick={() => { if (confirm(`Supprimer les ${project.posts.length} postes et tout leur contenu ?`)) { pushPostsHistory(); setProjects(prev => prev.map(p => p.id === project.id ? { ...p, posts: [] } : p)); } }}
                style={{ display: "inline-flex", alignItems: "center", gap: 4, background: WH, border: `1px solid ${SBB}`, borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = RD; e.currentTarget.style.background = "#FEF2F2"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = SBB; e.currentTarget.style.background = WH; }}
                title="Supprimer tous les postes"
              >
                <Ico name="trash" size={10} color={RD} />
                <span style={{ fontSize: 10.5, fontWeight: 600, color: RD }}>Tout supprimer</span>
              </button>
            )}
            </div>
          </div>
        </div>

        {/* ── Method chooser / Dictation / Review / Dispatch / Post list ── */}
        {contDispatching ? (
          /* Dispatching state */
          <div style={{ padding: "12px" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "36px 20px", background: ACL, borderRadius: 12, border: `1px solid ${ACL2}` }}>
              <div style={{ width: 52, height: 52, borderRadius: "50%", background: WH, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, boxShadow: "0 2px 10px rgba(217,123,13,0.15)" }}>
                <div style={{ width: 22, height: 22, border: `3px solid ${AC}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: TX, marginBottom: 4 }}>Répartition en cours...</div>
              <div style={{ fontSize: 12, color: TX3 }}>L'IA analyse et répartit vos remarques dans les postes</div>
            </div>
          </div>
        ) : contRecording ? (
          /* Active recording */
          <div style={{ padding: "12px" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "28px 16px", background: "#FEF2F2", borderRadius: 12, border: "1px solid #FECACA", transition: "all 0.3s" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: RD, animation: "ring 1.4s ease infinite" }} />
                <span style={{ fontSize: 15, fontWeight: 700, color: RD }}>Enregistrement en cours</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#B91C1C", fontVariantNumeric: "tabular-nums" }}>
                  {String(Math.floor(contSeconds / 60)).padStart(2, "0")}:{String(contSeconds % 60).padStart(2, "0")}
                </span>
              </div>
              <div style={{ width: "100%", minHeight: 60, maxHeight: 220, overflowY: "auto", marginBottom: 16, padding: "12px 14px", background: WH, borderRadius: 10, border: "1px solid #FECACA", fontSize: 13, color: TX, lineHeight: 1.7 }}>
                {contTranscript ? (
                  <>{contTranscript}{contInterim && <span style={{ color: TX3, fontStyle: "italic" }}> {contInterim}</span>}</>
                ) : contInterim ? (
                  <span style={{ color: TX3, fontStyle: "italic" }}>{contInterim}</span>
                ) : (
                  <span style={{ color: TX3 }}>Parlez librement de chaque poste...</span>
                )}
              </div>
              <button
                onClick={stopContinuous}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 32px", border: "none", borderRadius: 10, background: RD, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 3px 12px rgba(196,57,42,0.25)" }}
              >
                <Ico name="stop" size={16} color="#fff" />
                Terminer l'enregistrement
              </button>
            </div>
          </div>
        ) : contReview ? (
          /* Review & edit transcript before dispatch */
          <div style={{ padding: "12px" }}>
            <div style={{ padding: "20px 16px", background: SB, borderRadius: 12, border: `1px solid ${SBB}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: AC, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Ico name="check" size={14} color="#fff" />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: TX }}>Transcription terminée</div>
                  <div style={{ fontSize: 11, color: TX3 }}>Relisez et corrigez si besoin avant la répartition</div>
                </div>
              </div>
              <textarea
                value={contTranscript}
                onChange={(e) => setContTranscript(e.target.value)}
                style={{ width: "100%", minHeight: 120, maxHeight: 300, padding: "12px 14px", border: `1px solid ${SBB}`, borderRadius: 10, fontSize: 13, color: TX, lineHeight: 1.7, fontFamily: "inherit", background: WH, resize: "vertical", outline: "none" }}
                onFocus={(e) => { e.target.style.borderColor = AC; }}
                onBlur={(e) => { e.target.style.borderColor = SBB; }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button
                  onClick={() => { setContReview(false); setContTranscript(""); contTranscriptRef.current = ""; setInputMethod(null); }}
                  style={{ flex: 1, padding: "11px 16px", border: `1px solid ${SBB}`, borderRadius: 10, background: WH, color: TX2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                >
                  Annuler
                </button>
                <button
                  onClick={() => { contTranscriptRef.current = contTranscript; setContReview(false); startContinuous(true); }}
                  style={{ padding: "11px 16px", border: `1px solid ${SBB}`, borderRadius: 10, background: WH, color: TX2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}
                >
                  <Ico name="mic" size={13} color={RD} />Reprendre
                </button>
                <button
                  onClick={submitTranscript}
                  disabled={!contTranscript.trim()}
                  style={{ flex: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "11px 20px", border: "none", borderRadius: 10, background: contTranscript.trim() ? AC : SBB, color: contTranscript.trim() ? "#fff" : TX3, fontSize: 13, fontWeight: 700, cursor: contTranscript.trim() ? "pointer" : "default", fontFamily: "inherit", boxShadow: contTranscript.trim() ? "0 3px 12px rgba(217,123,13,0.2)" : "none" }}
                >
                  <span style={{ fontSize: 14 }}>✦</span>Répartir dans les postes
                </button>
              </div>
              {contErr && <div style={{ marginTop: 10, fontSize: 12, color: RD, textAlign: "center", padding: "8px 12px", background: "#FEF2F2", borderRadius: 8, border: `1px solid ${RD}20` }}>{contErr}</div>}
            </div>
          </div>
        ) : pendingDictation ? (
          /* Waiting for dictation to start */
          <div style={{ padding: "12px" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "36px 20px", background: "#FEF2F2", borderRadius: 12, border: "1px solid #FECACA" }}>
              <div style={{ width: 52, height: 52, borderRadius: "50%", background: WH, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <div style={{ width: 22, height: 22, border: `3px solid ${RD}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: TX, marginBottom: 4 }}>Démarrage de la dictée...</div>
              <div style={{ fontSize: 12, color: TX3 }}>Autorisez l'accès au microphone si demandé</div>
            </div>
          </div>
        ) : !inputMethod ? (
          /* ── Method chooser — action-oriented ── */
          (() => {
            const hasSR = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
            const sel = selectedMethod;
            const isDictate = sel === "dictate";
            return (
            <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "14px 14px 16px" }}>
              {/* Title */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: TX, letterSpacing: "-0.3px", lineHeight: 1.3 }}>Comment voulez-vous créer ce PV ?</div>
                <div style={{ fontSize: 11.5, color: TX3, marginTop: 3, lineHeight: 1.4 }}>Choisissez votre méthode de départ. Vous pourrez changer plus tard.</div>
              </div>

              {/* Option cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {/* Dictate */}
                <button
                  onClick={() => setSelectedMethod("dictate")}
                  disabled={!hasSR}
                  className="method-card-dictate"
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: `2px solid ${isDictate && hasSR ? AC : SBB}`, borderRadius: 12, background: isDictate && hasSR ? ACL : WH, cursor: hasSR ? "pointer" : "not-allowed", fontFamily: "inherit", transition: "all 0.15s", textAlign: "left", opacity: hasSR ? 1 : 0.5, position: "relative" }}
                >
                  <div style={{ width: 42, height: 42, borderRadius: 10, background: isDictate ? `linear-gradient(135deg, ${AC} 0%, #C06A08 100%)` : SB, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s" }}>
                    <Ico name="mic" size={20} color={isDictate ? "#fff" : TX3} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: TX }}>Dicter</span>
                      {hasSR && <span style={{ fontSize: 8.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: AC, background: WH, padding: "1px 6px", borderRadius: 3, border: `1px solid ${ACL2}` }}>Recommandé</span>}
                    </div>
                    <div style={{ fontSize: 11, color: TX3, lineHeight: 1.4, marginTop: 2 }}>Parlez librement, l'IA répartit les remarques automatiquement.</div>
                    <div style={{ display: "flex", gap: 4, marginTop: 5 }}>
                      {["Chantier", "Rapide", "IA"].map((tag, ti) => (
                        <span key={ti} style={{ fontSize: 9, fontWeight: 600, color: isDictate ? AC : TX3, background: isDictate ? WH : SB, border: `1px solid ${isDictate ? ACL2 : SBB}`, padding: "1px 6px", borderRadius: 3 }}>{tag}</span>
                      ))}
                    </div>
                    {!hasSR && <div style={{ fontSize: 10, color: RD, marginTop: 3 }}>Non supporté par ce navigateur</div>}
                  </div>
                  {/* Radio indicator */}
                  <div style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${isDictate && hasSR ? AC : SBB}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s" }}>
                    {isDictate && hasSR && <div style={{ width: 10, height: 10, borderRadius: "50%", background: AC }} />}
                  </div>
                </button>

                {/* Write */}
                <button
                  onClick={() => setSelectedMethod("write")}
                  className="method-card-write"
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: `2px solid ${!isDictate ? AC : SBB}`, borderRadius: 12, background: !isDictate ? ACL : WH, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", textAlign: "left" }}
                >
                  <div style={{ width: 42, height: 42, borderRadius: 10, background: !isDictate ? `linear-gradient(135deg, ${AC} 0%, #C06A08 100%)` : SB, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s" }}>
                    <Ico name="edit" size={20} color={!isDictate ? "#fff" : TX3} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: TX }}>Écrire</span>
                    <div style={{ fontSize: 11, color: TX3, lineHeight: 1.4, marginTop: 2 }}>Ajoutez vos remarques manuellement, poste par poste.</div>
                    <div style={{ display: "flex", gap: 4, marginTop: 5 }}>
                      {["Précis", "Compléments", "Photos"].map((tag, ti) => (
                        <span key={ti} style={{ fontSize: 9, fontWeight: 600, color: !isDictate ? AC : TX3, background: !isDictate ? WH : SB, border: `1px solid ${!isDictate ? ACL2 : SBB}`, padding: "1px 6px", borderRadius: 3 }}>{tag}</span>
                      ))}
                    </div>
                  </div>
                  {/* Radio indicator */}
                  <div style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${!isDictate ? AC : SBB}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s" }}>
                    {!isDictate && <div style={{ width: 10, height: 10, borderRadius: "50%", background: AC }} />}
                  </div>
                </button>

                {/* CTA — inside cards container */}
                <button
                  onClick={() => {
                    if (sel === "dictate" && hasSR) { setInputMethod("dictate"); startContinuous(); }
                    else { setInputMethod("write"); }
                  }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    padding: "13px 20px", border: "none", borderRadius: 10, marginTop: 2,
                    background: `linear-gradient(135deg, ${AC} 0%, #C06A08 100%)`,
                    color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                    boxShadow: "0 3px 14px rgba(217,123,13,0.25)", transition: "all 0.15s",
                  }}
                >
                  {isDictate && hasSR ? (
                    <><Ico name="mic" size={16} color="#fff" />Commencer à dicter</>
                  ) : (
                    <><Ico name="edit" size={16} color="#fff" />Commencer à écrire</>
                  )}
                </button>
              </div>
              {contErr && <div style={{ marginTop: 8, fontSize: 11, color: RD, textAlign: "center", padding: "6px 10px", background: "#FEF2F2", borderRadius: 8, border: `1px solid ${RD}20` }}>{contErr}</div>}
            </div>
            );
          })()
        ) : (
          /* Post list (write mode, or after dictation dispatch) */
          <>
            {/* Method switch bar */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: `1px solid ${SB2}` }}>
              <div style={{ display: "flex", gap: 4, background: SB, borderRadius: 8, padding: 3 }}>
                <button
                  onClick={() => { setInputMethod("dictate"); startContinuous(); }}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", border: "none", borderRadius: 6, background: "transparent", color: TX3, fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}
                >
                  <Ico name="mic" size={12} color={TX3} />Dicter
                </button>
                <button
                  onClick={() => setInputMethod("write")}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", border: "none", borderRadius: 6, background: WH, color: TX, fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
                >
                  <Ico name="edit" size={12} color={TX} />Écrire
                </button>
              </div>
              {totalRemarks > 0 && (
                <span style={{ fontSize: 11, color: TX3 }}>{totalRemarks} remarque{totalRemarks !== 1 ? "s" : ""}</span>
              )}
            </div>

        {/* Post list */}
        <div className="ap-post-list" style={{ padding: "6px 8px 2px" }}>
          {project.posts.map((post, postIdx) => {
            const remarks     = getRemarks(post);
            const openCount   = remarks.filter((r) => r.status === "open").length;
            const progressCount = remarks.filter((r) => r.status === "progress").length;
            const doneCount   = remarks.filter((r) => r.status === "done").length;
            const carriedHere = remarks.filter((r) => r.carriedFrom).length;
            const photoCount  = (post.photos || []).length;
            const markerCount = (project.planMarkers || []).filter((m) => m.postId === post.id).length;
            const hasContent  = remarks.length > 0 || photoCount > 0 || markerCount > 0;
            const hasUrgent   = remarks.some(r => r.urgent && r.status === "open");
            return (
              <button
                key={post.id}
                className="ap-post-row"
                onClick={() => { setActivePost(post.id); setAddText(""); setAddUrgent(false); }}
                style={{ width: "100%", display: "flex", alignItems: "stretch", gap: 0, padding: 0, background: WH, border: `1px solid ${hasUrgent ? REDBRD : hasContent ? ACL2 : SB2}`, borderRadius: 9, cursor: "pointer", textAlign: "left", fontFamily: "inherit", transition: "border-color 0.15s, box-shadow 0.15s", marginBottom: 5, overflow: "hidden", boxShadow: hasContent ? "0 1px 2px rgba(0,0,0,0.03)" : "none" }}
              >
                {/* Left accent strip */}
                <div style={{ width: 3.5, flexShrink: 0, background: hasUrgent ? RD : hasContent ? AC : SB2, borderRadius: "9px 0 0 9px", transition: "background 0.15s" }} />

                {/* Main content area */}
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "9px 12px 9px 10px", minWidth: 0 }}>
                  {/* Post number badge */}
                  <div style={{ width: 30, height: 30, borderRadius: 7, background: hasContent ? ACL : SB, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0, position: "relative" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: hasContent ? AC : TX3, lineHeight: 1, letterSpacing: "-0.3px" }}>{post.id}</span>
                    {hasContent && (
                      <div style={{ position: "absolute", bottom: -2, right: -2, width: 12, height: 12, borderRadius: "50%", background: doneCount === remarks.length && remarks.length > 0 ? GR : AC, display: "flex", alignItems: "center", justifyContent: "center", border: "1.5px solid #fff" }}>
                        <Ico name="check" size={7} color="#fff" />
                      </div>
                    )}
                  </div>

                  {/* Text content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Top line: label */}
                    {renamingPost === post.id ? (
                      <input
                        autoFocus
                        value={renameVal}
                        onChange={(e) => setRenameVal(e.target.value)}
                        onBlur={() => commitRename(post.id)}
                        onKeyDown={(e) => { if (e.key === "Enter") commitRename(post.id); if (e.key === "Escape") setRenamingPost(null); }}
                        onClick={(e) => e.stopPropagation()}
                        style={{ fontSize: 13, fontWeight: 500, color: TX, border: `1px solid ${AC}`, borderRadius: 4, padding: "2px 6px", background: WH, fontFamily: "inherit", outline: "none", width: "90%" }}
                      />
                    ) : (
                      <div
                        style={{ fontSize: 13, fontWeight: hasContent ? 600 : 450, color: hasContent ? TX : TX2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.3 }}
                        onDoubleClick={(e) => { e.stopPropagation(); setRenamingPost(post.id); setRenameVal(post.label); }}
                        title={t("notes.dblRename")}
                      >{post.label}</div>
                    )}

                    {/* Status pills row */}
                    {hasContent && (
                      <div style={{ display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap", alignItems: "center" }}>
                        {hasUrgent && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 700, color: "#fff", background: RD, padding: "2px 8px 2px 5px", borderRadius: 4, lineHeight: "14px", letterSpacing: "0.01em" }}>
                            <span style={{ fontSize: 11, lineHeight: 1 }}>!</span> {t("notes.urgent")}
                          </span>
                        )}
                        {openCount > 0 && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 600, color: "#B91C1C", background: REDBG, border: `1px solid ${REDBRD}`, padding: "1px 7px", borderRadius: 4, lineHeight: "15px" }}>
                            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#EF4444", flexShrink: 0 }} />{openCount} {t("notes.toProcess")}
                          </span>
                        )}
                        {carriedHere > 0 && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 600, color: AC, background: ACL, border: `1px solid ${ACL2}`, padding: "1px 7px", borderRadius: 4, lineHeight: "15px" }}>
                            <Ico name="repeat" size={8} color={AC} />{carriedHere} reportée{carriedHere > 1 ? "s" : ""}
                          </span>
                        )}
                        {progressCount > 0 && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 600, color: "#92400E", background: "#FFFBEB", border: "1px solid #FDE68A", padding: "1px 7px", borderRadius: 4, lineHeight: "15px" }}>
                            <span style={{ width: 5, height: 5, borderRadius: "50%", background: AC, flexShrink: 0 }} />{progressCount} {t("notes.inProgress")}
                          </span>
                        )}
                        {doneCount > 0 && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 500, color: "#166534", background: GRBG, border: "1px solid #C6E9B4", padding: "1px 7px", borderRadius: 4, lineHeight: "15px" }}>
                            <Ico name="check" size={8} color={GR} />{doneCount} résolu{doneCount > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right meta column */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {/* Counters */}
                    {hasContent && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 4 }}>
                        {photoCount > 0 && (
                          <div style={{ display: "flex", alignItems: "center", gap: 3 }} title={`${photoCount} photo${photoCount > 1 ? "s" : ""}`}>
                            <Ico name="camera" size={11} color={TX3} />
                            <span style={{ fontSize: 11, fontWeight: 600, color: TX2 }}>{photoCount}</span>
                          </div>
                        )}
                        {markerCount > 0 && (
                          <div style={{ display: "flex", alignItems: "center", gap: 3 }} title={`${markerCount} marqueur${markerCount > 1 ? "s" : ""}`}>
                            <Ico name="mappin" size={11} color={TX3} />
                            <span style={{ fontSize: 11, fontWeight: 600, color: TX2 }}>{markerCount}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Delete post */}
                    <div
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); if (hasContent && !confirm(`Supprimer le poste "${post.label}" et tout son contenu ?`)) return; deletePost(post.id); }}
                      onPointerDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      style={{ width: 28, height: 28, borderRadius: 6, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer", transition: "background 0.15s" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = hasContent ? "#FEF2F2" : SB; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      title="Supprimer ce poste"
                      role="button"
                    >
                      <Ico name="trash" size={13} color={hasContent ? RD : TX3} />
                    </div>

                    {/* Arrow */}
                    <div style={{ width: 22, height: 22, borderRadius: 5, background: hasContent ? ACL : SB, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Ico name="arrowr" size={11} color={hasContent ? AC : TX3} />
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Add post inside card */}
        <div style={{ padding: "2px 8px 8px" }}>
          <button
            onClick={() => {
              pushPostsHistory();
              const newId = String(project.posts.length + 1).padStart(2, "0");
              setProjects(prev => prev.map(p => p.id === project.id ? { ...p, posts: [...p.posts, { id: newId, label: t("notes.newPost"), notes: "", remarks: [] }] } : p));
              setTimeout(() => { setRenamingPost(newId); setRenameVal(t("notes.newPost")); }, 100);
            }}
            style={{ width: "100%", padding: "8px 12px", border: `1px dashed ${SBB}`, borderRadius: 7, background: "transparent", cursor: "pointer", fontSize: 11, color: TX3, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}
          >
            <Ico name="plus" size={12} color={TX3} />{t("notes.addPost")}
          </button>
        </div>
          </>
        )}
      </div>

      </div>{/* end ap-note-step-content step 0 */}

      {/* Step 0 navigation */}
      <div style={{ padding: "12px 16px", borderTop: `1px solid ${SBB}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", border: `1px solid ${SBB}`, borderRadius: 10, background: WH, color: TX2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          <Ico name="back" size={14} color={TX2} /> Retour
        </button>
        <button
          onClick={() => setCurrentStep(project.participants.length > 0 ? 1 : 2)}
          disabled={filledCount === 0}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 20px", border: "none", borderRadius: 10, background: filledCount > 0 ? AC : SBB, color: filledCount > 0 ? "#fff" : TX3, fontSize: 13, fontWeight: 700, cursor: filledCount > 0 ? "pointer" : "not-allowed", fontFamily: "inherit" }}
        >
          Destinataires <Ico name="arrowr" size={13} color={filledCount > 0 ? "#fff" : TX3} />
        </button>
      </div>

      </div>{/* end step 0 */}

      {/* ── Step 1: Destinataires ── */}
      <div className="ap-note-section-1" style={{ display: currentStep === 1 ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>

      {/* Scrollable content area for step 1 */}
      <div className="ap-note-step-content">

      {/* ── Section 2 : Destinataires ── */}
      {project.participants.length > 0 && (
        <div style={{ background: WH, borderRadius: 12, border: `1px solid ${SBB}`, overflow: "hidden", marginBottom: 12 }}>
          {/* Section header */}
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "11px 16px", borderBottom: `1px solid ${SBB}`, background: SB }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: SB2, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: TX3 }}>2</span>
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: TX, letterSpacing: "-0.1px" }}>{t("notes.recipients")}</span>
            <span style={{ fontSize: 10.5, color: TX3, fontWeight: 400 }}>
              {recipientFilters === null ? "À définir" : recipientFilters.length === 0 ? t("notes.allRecipients") : `${recipientFilters.length} sélectionné${recipientFilters.length > 1 ? "s" : ""}`}
            </span>
          </div>

          {/* Recipients body */}
          <div style={{ padding: "12px 16px" }}>
            {recipientFilters === null && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, padding: "8px 12px", background: "#FDF4E7", borderRadius: 8, border: `1px solid ${ACL2}` }}>
                <Ico name="alert" size={13} color={AC} />
                <span style={{ fontSize: 11.5, color: TX2, fontWeight: 500 }}>Sélectionnez les destinataires du PV ou choisissez "Tous"</span>
              </div>
            )}
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              <button
                onClick={() => setRecipientFilters([])}
                style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 13px", border: `1.5px solid ${recipientFilters !== null && recipientFilters.length === 0 ? AC : SBB}`, borderRadius: 18, background: recipientFilters !== null && recipientFilters.length === 0 ? ACL : WH, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}
              >
                <span style={{ fontSize: 11, fontWeight: 600, color: recipientFilters !== null && recipientFilters.length === 0 ? AC : TX2 }}>{t("notes.allRecipients")}</span>
              </button>
              {project.participants.map((p, i) => {
                const selected = recipientFilters !== null && recipientFilters.includes(p.name);
                const countForP = project.posts.reduce((acc, post) => {
                  const remarks = getRemarks(post);
                  return acc + remarks.filter(r => !(r.recipients || []).length || (r.recipients || []).includes(p.name)).length;
                }, 0);
                return (
                  <button
                    key={i}
                    onClick={() => setRecipientFilters(prev => {
                      const list = prev || [];
                      return list.includes(p.name) ? list.filter(n => n !== p.name) : [...list, p.name];
                    })}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 11px", border: `1.5px solid ${selected ? AC : SBB}`, borderRadius: 18, background: selected ? ACL : WH, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}
                  >
                    <div style={{ width: 18, height: 18, borderRadius: "50%", background: selected ? AC : SB2, color: selected ? "#fff" : TX3, fontSize: 7.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {initials(p.name)}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: selected ? 600 : 500, color: selected ? AC : TX2 }}>{p.name}</span>
                    <span style={{ fontSize: 9.5, color: TX3 }}>({countForP})</span>
                    {selected && <Ico name="check" size={9} color={AC} />}
                  </button>
                );
              })}
            </div>
            {recipientFilters !== null && recipientFilters.length > 0 && (() => {
              const cnt = project.posts.reduce((acc, post) => {
                const remarks = getRemarks(post);
                return acc + remarks.filter(r => !(r.recipients || []).length || recipientFilters.some(rec => (r.recipients || []).includes(rec))).length;
              }, 0);
              return <div style={{ marginTop: 8, fontSize: 10.5, color: TX3, background: SB, padding: "6px 10px", borderRadius: 6 }}><strong>{cnt}</strong> remarque{cnt !== 1 ? "s" : ""} incluses — <strong>{recipientFilters.join(", ")}</strong> + communes.</div>;
            })()}
          </div>
        </div>
      )}

      </div>{/* end ap-note-step-content step 1 */}

      {/* Step 1 navigation */}
      <div style={{ padding: "12px 16px", borderTop: `1px solid ${SBB}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <button onClick={() => setCurrentStep(0)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", border: `1px solid ${SBB}`, borderRadius: 10, background: WH, color: TX2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          <Ico name="back" size={14} color={TX2} /> Saisie
        </button>
        <button
          onClick={() => setCurrentStep(2)}
          disabled={recipientFilters === null}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 20px", border: "none", borderRadius: 10, background: recipientFilters !== null ? AC : SBB, color: recipientFilters !== null ? "#fff" : TX3, fontSize: 13, fontWeight: 700, cursor: recipientFilters !== null ? "pointer" : "not-allowed", fontFamily: "inherit" }}
        >
          Génération <Ico name="arrowr" size={13} color={recipientFilters !== null ? "#fff" : TX3} />
        </button>
      </div>

      </div>{/* end step 1 */}

      {/* ── Step 2: Générer ── */}
      <div className="ap-note-section-2" style={{ display: currentStep === 2 ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>

      {/* Scrollable content area for step 2 */}
      <div className="ap-note-step-content">

      {/* ── Section 3 : Zone de génération ── */}
      {readyToGenerate ? (
        <div style={{ borderRadius: 12, overflow: "hidden", border: `1px solid ${ACL2}`, background: WH, boxShadow: "0 2px 10px rgba(217,123,13,0.07)", transition: "all 0.3s" }}>
          {/* Header */}
          <div className="ap-gen-header" style={{ background: `linear-gradient(135deg, ${AC} 0%, #C06A08 100%)`, padding: "14px 20px", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontSize: 14, lineHeight: 1 }}>✦</span>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", letterSpacing: "-0.2px" }}>{t("notes.readyTitle")}</div>
              <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.7)", marginTop: 0, fontWeight: 400 }}>{t("notes.readyDesc")}</div>
            </div>
          </div>

          {/* Stats row */}
          <div className="ap-gen-stats" style={{ display: "flex", borderBottom: `1px solid ${SB2}` }}>
            {[
              { value: filledCount, label: `poste${filledCount > 1 ? "s" : ""}`, icon: "listcheck", color: AC },
              { value: totalRemarks, label: `remarque${totalRemarks > 1 ? "s" : ""}`, icon: "edit", color: TX },
              ...(urgentCount > 0 ? [{ value: urgentCount, label: `urgent${urgentCount > 1 ? "s" : ""}`, icon: "alert", color: RD }] : []),
              ...(totalPhotos > 0 ? [{ value: totalPhotos, label: `photo${totalPhotos > 1 ? "s" : ""}`, icon: "camera", color: TX2 }] : []),
            ].map((stat, i, arr) => (
              <div key={i} style={{ flex: 1, padding: "11px 10px", textAlign: "center", borderRight: i < arr.length - 1 ? `1px solid ${SB2}` : "none" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                  <Ico name={stat.icon} size={12} color={stat.color} />
                  <span style={{ fontSize: 18, fontWeight: 800, color: stat.color, letterSpacing: "-0.5px", lineHeight: 1 }}>{stat.value}</span>
                </div>
                <div style={{ fontSize: 9, color: TX3, fontWeight: 500, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Attendance */}
          <div className="ap-gen-attendance" style={{ padding: "12px 20px 0" }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 8 }}>Présences</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {attendance.map((a, i) => (
                <button key={i} onClick={() => toggleAttendance(i)} style={{
                  display: "flex", alignItems: "center", gap: 5, padding: "5px 10px",
                  border: `1px solid ${a.present ? GR : SBB}`, borderRadius: 20,
                  background: a.present ? "#EAF3DE" : SB, cursor: "pointer", fontFamily: "inherit",
                  transition: "all 0.15s",
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: a.present ? GR : TX3 }} />
                  <span style={{ fontSize: 11, fontWeight: 500, color: a.present ? GR : TX3 }}>{a.name}</span>
                </button>
              ))}
            </div>
            <div style={{ fontSize: 10, color: TX3, marginBottom: 6 }}>
              {attendance.filter(a => a.present).length} présent{attendance.filter(a => a.present).length > 1 ? "s" : ""} · {attendance.filter(a => !a.present).length} absent{attendance.filter(a => !a.present).length > 1 ? "s" : ""}
            </div>
          </div>

          {/* Visit timestamp */}
          <div className="ap-gen-visit" style={{ padding: "6px 20px 12px", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Ico name="clock" size={12} color={TX3} />
              <span style={{ fontSize: 11, color: TX3 }}>Début : <strong style={{ color: TX2 }}>{visitStart}</strong></span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 11, color: TX3 }}>Fin :</span>
              <button onClick={() => setVisitEnd(new Date().toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" }))} style={{ padding: "3px 10px", border: `1px solid ${SBB}`, borderRadius: 6, background: visitEnd ? "#EAF3DE" : WH, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit", color: visitEnd ? GR : AC }}>
                {visitEnd || "Marquer la fin"}
              </button>
            </div>
          </div>

          {/* CTA area */}
          <div className="ap-gen-cta" style={{ padding: "12px 20px 16px" }}>
            {recipientFilters && recipientFilters.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 10, padding: "5px 9px", background: SB, borderRadius: 6, border: `1px solid ${SBB}` }}>
                <Ico name="users" size={11} color={TX2} />
                <span style={{ fontSize: 10.5, color: TX2 }}>{t("notes.filteredVersion")}</span>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: TX }}>{recipientFilters.map(n => n.split(" ")[0]).join(", ")}</span>
              </div>
            )}

            {/* What happens next — hidden on mobile */}
            <div className="ap-gen-next-steps" style={{ display: "flex", gap: 12, marginBottom: 12 }}>
              {[
                { icon: "edit", text: t("notes.redactionStep") },
                { icon: "file", text: t("notes.pdfStep") },
                { icon: "send", text: t("notes.sendStep") },
              ].map((step, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, flex: 1 }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: SB, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Ico name={step.icon} size={9} color={TX3} />
                  </div>
                  <span style={{ fontSize: 10.5, color: TX3, fontWeight: 500, lineHeight: 1.2 }}>{step.text}</span>
                </div>
              ))}
            </div>

            {/* Buttons */}
            {navigator.onLine ? (
              <button
                onClick={() => {
                  if (!visitEnd) setVisitEnd(new Date().toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" }));
                  onGenerate(recipientFilters, pvTitle, { attendance, visitStart, visitEnd: visitEnd || new Date().toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" }) });
                }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
                  padding: "13px 24px", border: "none", borderRadius: 10,
                  background: `linear-gradient(135deg, ${AC} 0%, #C06A08 100%)`,
                  color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  letterSpacing: "-0.1px", transition: "box-shadow 0.3s, transform 0.15s",
                  boxShadow: "0 3px 14px rgba(217,123,13,0.28)",
                }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 5px 20px rgba(217,123,13,0.38)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 3px 14px rgba(217,123,13,0.28)"; e.currentTarget.style.transform = "translateY(0)"; }}
              >
                <span style={{ fontSize: 15, opacity: 0.9 }}>✦</span>
                {t("notes.generateBtn")}
              </button>
            ) : (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, marginBottom: 10, fontSize: 11, color: RD }}>
                  <Ico name="wifioff" size={13} color={RD} />
                  Pas de connexion — la génération IA nécessite internet
                </div>
                <button
                  onClick={() => {
                    const end = visitEnd || new Date().toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" });
                    if (!visitEnd) setVisitEnd(end);
                    savePvDraft({
                      projectId: project.id,
                      projectName: project.name,
                      pvNumber: project.pvHistory.length + 1,
                      pvTitle,
                      recipientFilters,
                      attendance,
                      visitStart,
                      visitEnd: end,
                      posts: project.posts.map(po => ({ id: po.id, label: po.label, remarks: po.remarks || [], photos: (po.photos || []).length })),
                    });
                    onBack();
                  }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
                    padding: "13px 24px", border: "none", borderRadius: 10,
                    background: TX, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer",
                    fontFamily: "inherit", letterSpacing: "-0.1px",
                  }}
                >
                  <Ico name="save" size={15} color="#fff" />
                  Sauvegarder le brouillon (hors-ligne)
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ borderRadius: 12, border: `1px solid ${SBB}`, overflow: "hidden", background: WH }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "11px 16px", borderBottom: `1px solid ${SBB}`, background: SB }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: SB2, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: TX3 }}>3</span>
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: TX2, letterSpacing: "-0.1px" }}>{t("notes.generateAI")}</span>
          </div>
          <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: TX3, lineHeight: 1.5 }}>{t("notes.fillOnePost")}</div>
              <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                {[
                  { icon: "edit", text: t("notes.redactionStep") },
                  { icon: "file", text: t("notes.pdfStep") },
                  { icon: "send", text: t("notes.sendStep") },
                ].map((step, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, opacity: 0.4 }}>
                    <div style={{ width: 16, height: 16, borderRadius: "50%", background: SB2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Ico name={step.icon} size={8} color={TX3} />
                    </div>
                    <span style={{ fontSize: 10, color: TX3, fontWeight: 500 }}>{step.text}</span>
                  </div>
                ))}
              </div>
            </div>
            <button
              disabled
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "12px 22px", border: "none", borderRadius: 10, background: DIS, color: DIST, fontSize: 13, fontWeight: 700, cursor: "not-allowed", fontFamily: "inherit", flexShrink: 0, letterSpacing: "-0.1px" }}
            >
              <span style={{ fontSize: 13, opacity: 0.4 }}>✦</span>
              {t("notes.generateShort")}
            </button>
          </div>
        </div>
      )}

      </div>{/* end ap-note-step-content step 2 */}
      </div>{/* end step 2 */}

    </div>
  );
}
