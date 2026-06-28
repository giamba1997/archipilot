import { useEffect, useMemo, useRef, useState } from "react";
import { tokens } from "../design/tokens";
import { Button } from "../components/ui/v2/Button";
import { parseDateFR } from "../utils/dates";
import { supabase } from "../supabase";
import { parseFunctionError, track, sendPvByEmail, uploadPhoto, getPhotoUrl } from "../db";
import { generatePDF } from "../utils/pdf";
import { useWhisperRecorder } from "../hooks/useWhisperRecorder";
import { getCurrentPositionSafe, fetchWeatherAt } from "../utils/weather";
import { nextPvNumber, parseNotesToRemarks, stripMarkdown, cleanPvOutput } from "../utils/helpers";
import { PV_TEMPLATES } from "../constants/templates";
import { useT } from "../i18n";

// ── PvComposer (v2) — composer plein écran « Direction D » ──────
//
// Flux : Choix de la méthode → 1·Saisie → 2·Rédaction → 3·Diffusion.
// Plein écran, hors du chrome habituel (sidebar/topbar). Porté depuis le
// prototype `design_handoff_archipilot_refonte`, sur le design system v2.
//
// État porté à ce jet : shell (top-bar + stepper) + écran « Choix de la
// méthode ». Les étapes Saisie / Rédaction / Diffusion sont des placeholders
// stylés, portées dans les itérations suivantes.

const Svg = ({ children, size = 24, sw = 1.5 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

const I = {
  back:    (p) => <Svg {...p} sw={2}><polyline points="15 18 9 12 15 6" /></Svg>,
  close:   (p) => <Svg {...p} sw={1.8}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></Svg>,
  check:   (p) => <Svg {...p} sw={3}><polyline points="20 6 9 17 4 12" /></Svg>,
  chevron: (p) => <Svg {...p} sw={2}><polyline points="9 6 15 12 9 18" /></Svg>,
  pen:     (p) => <Svg {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z" /></Svg>,
  mic:     (p) => <Svg {...p} sw={1.6}><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></Svg>,
  upload:  (p) => <Svg {...p} sw={1.7}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></Svg>,
  redo:    (p) => <Svg {...p} sw={1.7}><path d="M3 12a9 9 0 1 0 9-9 9.7 9.7 0 0 0-6.7 2.8L3 8" /><path d="M3 3v5h5" /></Svg>,
  cal:     (p) => <Svg {...p} sw={1.7}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></Svg>,
  cloud:   (p) => <Svg {...p} sw={1.7}><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" /></Svg>,
  image:   (p) => <Svg {...p} sw={1.7}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></Svg>,
  plus:    (p) => <Svg {...p} sw={2}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></Svg>,
  chevDown:(p) => <Svg {...p} sw={2}><polyline points="6 9 12 15 18 9" /></Svg>,
  spark:   (p) => <Svg {...p}><path d="M12 3l1.9 6.1L20 11l-6.1 1.9L12 19l-1.9-6.1L4 11l6.1-1.9z" /></Svg>,
  clipboard:(p) => <Svg {...p} sw={1.7}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></Svg>,
  mail:    (p) => <Svg {...p} sw={1.7}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" /></Svg>,
  user:    (p) => <Svg {...p} sw={1.7}><path d="M20 21a8 8 0 0 0-16 0" /><circle cx="12" cy="7" r="4" /></Svg>,
};

const DEFAULT_PROJECT = {
  name: "Hôtel de Ville — Nivelles",
  nextMeeting: "30/06/2026",
  pvHistory: [{ number: 1 }, { number: 2 }, { number: 11 }],
  reserves: [{ status: "open" }, { status: "open" }, { status: "open" }, { status: "open" }, { status: "open" }, { status: "levee" }],
};

const STEPS = [{ n: 1, label: "Saisie" }, { n: 2, label: "Rédaction" }, { n: 3, label: "Diffusion" }];

export function PvComposer({
  project: projectProp,
  setProjects,
  profile,
  onClose,
  onBack,
  onRequireUpgrade,
  pvRecipients,
  pvTitle,
  pvFieldData,
}) {
  // Mode démo (route /pv/demo) : pas de persistance, données mockées.
  const demo = !setProjects;
  const project = projectProp || DEFAULT_PROJECT;
  const t = useT();

  const [step, setStep] = useState("choice");
  const [saisieMode, setSaisieMode] = useState("write");
  const [importOpen, setImportOpen] = useState(false);
  const [pvStyle, setPvStyle] = useState(projectProp?.pvTemplate || "standard");
  const [recipFilter, setRecipFilter] = useState(() => (Array.isArray(pvRecipients) && pvRecipients.length === 1) ? pvRecipients[0] : null);
  const [numMode, setNumMode] = useState(projectProp?.remarkNumbering || "post-seq");
  const [gen, setGen] = useState({ loading: false, content: "", error: "", suggestedTasks: [], saved: false });
  const today = useMemo(() => new Date().toLocaleDateString("fr-BE"), []);
  const finish = () => (onBack || onClose)?.();

  const meta = useMemo(() => {
    const pvs = project?.pvHistory || [];
    const num = demo
      ? (pvs.reduce((m, p) => Math.max(m, p.number || 0), 0) || pvs.length) + 1
      : nextPvNumber(pvs);
    const allRemarks = (project?.posts || []).flatMap(p => p.remarks || []);
    const totalRemarks = demo ? 12 : allRemarks.length;
    const openReserves = demo
      ? (project?.reserves || []).filter(r => r.status !== "levee").length
      : allRemarks.filter(r => r.carriedFrom).length;
    const d = project?.nextMeeting ? (parseDateFR(project.nextMeeting) || new Date(project.nextMeeting)) : null;
    const meetingLabel = d && !isNaN(+d) ? d.toLocaleDateString("fr-BE", { weekday: "short", day: "numeric", month: "long" }) : null;
    return { num, openReserves, totalRemarks, meetingLabel };
  }, [project, demo]);

  // ── Moteur de génération (porté de ResultView.run) ──
  const genPv = async (opts = {}) => {
    if (demo) return;
    const styleId = opts.style != null ? opts.style : pvStyle;
    const recip = opts.recip !== undefined ? opts.recip : recipFilter;
    const numModeR = opts.num != null ? opts.num : numMode;
    setGen(g => ({ ...g, loading: true, error: "" }));
    const allRemarks = (p) => (p.remarks || []).length > 0 ? p.remarks : (p.notes?.trim() ? parseNotesToRemarks(p.notes) : []);
    const toRemarks = (p) => {
      const all = allRemarks(p);
      if (!recip) return all;
      return all.filter(r => !(r.recipients || []).length || (r.recipients || []).includes(recip));
    };
    let gIdx = 0;
    const notes = (project.posts || [])
      .filter(p => toRemarks(p).length > 0 || (p.photos || []).length > 0)
      .map(p => {
        const remarks = toRemarks(p);
        let pIdx = 0;
        const byStatus = (id) => remarks.filter(r => r.status === id);
        const fmtLine = (r) => { gIdx++; pIdx++; const prefix = r.urgent ? "> " : "- "; const num = numModeR === "sequential" ? `${pIdx}. ` : numModeR === "post-seq" ? `${p.id}.${pIdx} ` : numModeR === "global" ? `${gIdx}. ` : ""; return prefix + num + r.text; };
        const sections = [];
        if (byStatus("open").length) sections.push(t("result.toProcess") + "\n" + byStatus("open").map(fmtLine).join("\n"));
        if (byStatus("progress").length) sections.push("En cours :\n" + byStatus("progress").map(fmtLine).join("\n"));
        if (byStatus("done").length) sections.push(t("result.resolved") + "\n" + byStatus("done").map(fmtLine).join("\n"));
        const extra = (p.photos || []).length > 0 ? `[${p.photos.length} photo(s) jointe(s)]` : "";
        return `${p.id}. ${p.label}\n${sections.join("\n")}${extra ? "\n" + extra : ""}`;
      })
      .join("\n\n");
    const pvTpl = PV_TEMPLATES.find(x => x.id === styleId);
    const SYS = pvTpl?.prompt || t("ai.systemPrompt");
    const ctxLines = [];
    if (project.client) ctxLines.push(`Maître d'ouvrage : ${project.client}`);
    if (project.contractor) ctxLines.push(`Entreprise : ${project.contractor}`);
    (project.customFields || []).forEach(cf => { if (cf.label && cf.value) ctxLines.push(`${cf.label} : ${cf.value}`); });
    if (pvRecipients?.length > 0) ctxLines.push(`Filtre destinataires : ${pvRecipients.join(", ")} — ne garde que les remarques pertinentes pour ces destinataires.`);
    const prevPv = (project.pvHistory || [])[0];
    const prevPvBlock = prevPv && (prevPv.content || prevPv.excerpt)
      ? ["", `[PV PRÉCÉDENT n°${prevPv.number}${prevPv.date ? ` du ${prevPv.date}` : ""} — pour identifier les évolutions, NE PAS reproduire intégralement]`, String(prevPv.content || prevPv.excerpt || "").slice(0, 6000)].join("\n")
      : "";
    const evolutionRule = prevPv
      ? "\nSi tu repères une évolution notable par rapport au PV précédent (action levée, point qui avance, nouvelle remarque marquante), tu PEUX ajouter en tête une section \"00. Évolutions depuis le dernier PV\" très synthétique (max 4 lignes en bullets). Inclus-la SEULEMENT si l'évolution est concrète et utile à signaler. Sinon n'ajoute rien."
      : "";
    const userPrompt = [
      "[CONTEXTE — pour ta compréhension uniquement, NE PAS reproduire dans la sortie]",
      ctxLines.join("\n") || "(aucun)",
      prevPvBlock,
      "",
      "[NOTES BRUTES À TRANSFORMER]",
      notes,
      "",
      "[RAPPEL]",
      "Produis UNIQUEMENT les sections numérotées et leurs remarques. Aucun en-tête, aucune intro, aucune conclusion, aucun markdown. Format strict NN. Titre / NN.X texte." + evolutionRule,
    ].join("\n");
    try {
      const { data, error } = await supabase.functions.invoke("generate-pv", { body: { systemPrompt: SYS, userPrompt, maxTokens: pvTpl?.id === "detailed" ? 3000 : 2000, extractTasks: true } });
      if (error) {
        const body = await parseFunctionError(error);
        if (body.code === "plan_upgrade_required") { onRequireUpgrade?.(body.feature || "maxAiPerMonth"); setGen(g => ({ ...g, loading: false })); return; }
        throw new Error(body.error || error.message || "Erreur serveur");
      }
      if (data?.error) throw new Error(data.error);
      const cleaned = cleanPvOutput(data?.content);
      if (!cleaned) throw new Error(t("result.emptyResponse"));
      setGen(g => ({ ...g, loading: false, content: cleaned, suggestedTasks: Array.isArray(data?.suggestedTasks) ? data.suggestedTasks : [] }));
    } catch (e) { setGen(g => ({ ...g, loading: false, error: e.message || "Erreur" })); }
  };

  // ── Sauvegarde du brouillon (porté de ResultView.savePV) ──
  const saveDraft = () => {
    if (demo || gen.saved || !gen.content) return;
    const allRemarks = (p) => (p.remarks || []).length > 0 ? p.remarks : (p.notes?.trim() ? parseNotesToRemarks(p.notes) : []);
    const filledCount = (project.posts || []).filter(p => allRemarks(p).length > 0 || (p.photos || []).length > 0).length;
    const inputNotes = (project.posts || []).map(po => ({ id: po.id, label: po.label, remarks: (po.remarks || []).map(r => ({ text: r.text, urgent: r.urgent, status: r.status })), notes: po.notes || "" })).filter(po => po.remarks.length > 0 || po.notes.trim());
    const suggestedTasksWithIds = (gen.suggestedTasks || []).map((tk, i) => ({ ...tk, id: `sg_${meta.num}_${Date.now()}_${i}`, status: "pending" }));
    track?.("pv_generated", { pv_number: meta.num, project_name: project.name, _page: "composer", _ai_suggestions: (gen.suggestedTasks || []).length });
    setProjects(prev => prev.map(p => p.id === project.id ? {
      ...p,
      pvHistory: [{ number: meta.num, date: today, author: profile?.name || "Architecte", postsCount: filledCount, excerpt: stripMarkdown(gen.content).slice(0, 140) + "…", content: gen.content, inputNotes, status: "draft", suggestedTasks: suggestedTasksWithIds }, ...(p.pvHistory || [])],
      posts: (p.posts || []).map(po => ({ ...po, notes: "", remarks: (po.remarks || []).filter(r => r.status !== "done").map(r => ({ ...r, carriedFrom: meta.num })) })),
    } : p));
    setGen(g => ({ ...g, saved: true }));
  };

  // ── Mutations de remarques (Saisie réelle) ──
  const mutatePost = (postId, fn) => {
    if (demo) return;
    setProjects(prev => prev.map(p => p.id === project.id ? { ...p, posts: (p.posts || []).map(po => po.id === postId ? fn(po) : po) } : p));
  };
  const addRemark = (postId, text, status, photos, recipients) => {
    const r = { id: Date.now() + Math.random(), text, status: status === "urgent" ? "open" : (status || "open"), urgent: status === "urgent", recipients: recipients || [], photos: photos || [] };
    mutatePost(postId, po => ({ ...po, remarks: [...(po.remarks || []), r] }));
  };
  // Édition après création : (ré)assigner une personne / joindre des photos.
  const assignRemark = (postId, remarkId, name) => mutatePost(postId, po => ({ ...po, remarks: (po.remarks || []).map(r => r.id === remarkId ? { ...r, recipients: name ? [name] : [] } : r) }));
  const addRemarkPhotos = (postId, remarkId, photos) => mutatePost(postId, po => ({ ...po, remarks: (po.remarks || []).map(r => r.id === remarkId ? { ...r, photos: [...(r.photos || []), ...(photos || [])] } : r) }));
  const removeRemark = (postId, rid) => mutatePost(postId, po => ({ ...po, remarks: (po.remarks || []).filter(r => r.id !== rid) }));

  // ── Diffusion : destinataires, envoi email, création de tâches ──
  const [diffChecked, setDiffChecked] = useState({});
  const [diffAttachPdf, setDiffAttachPdf] = useState(true);
  const [sending, setSending] = useState(false);
  const isChecked = (i) => diffChecked[i] !== false; // coché par défaut
  const recipients = useMemo(() => {
    if (demo) return DIFF_RECIPIENTS;
    const palette = [["#DBEAFE", tokens.color.semantic.info.fg], ["#DCFCE7", tokens.color.semantic.success.fg], [tokens.color.brand[100], tokens.color.brand[700]], [tokens.color.neutral[100], tokens.color.neutral[500]]];
    return (project.participants || []).filter(p => p.email && p.email.trim()).map((p, i) => ({ ini: initials(p.name), name: p.name, email: p.email, role: p.role || "", avBg: palette[i % 4][0], avFg: palette[i % 4][1] }));
  }, [project, demo]);
  // Destinataires possibles pour filtrer les remarques du PV (toolbar Rédaction).
  const recipOptions = useMemo(() => {
    if (demo) return ["Gaëlle D.", "M. Genin", "P. Mertens"];
    const set = new Set();
    (project?.posts || []).forEach(p => (p.remarks || []).forEach(r => (r.recipients || []).forEach(n => n && set.add(n))));
    (project?.participants || []).forEach(p => p.name && p.name.trim() && set.add(p.name));
    return [...set];
  }, [project, demo]);
  const subject = `PV n°${meta.num} — ${project?.name || ""}${project?.nextMeeting ? ` (${project.nextMeeting})` : ""}`;
  // Signature de l'utilisateur (créée dans son profil) — sinon repli simple.
  const signatureHtml = profile?.emailSignature?.trim()
    || `Cordialement,<br>${profile?.name || "L'architecte"}${profile?.structure ? `<br>${profile.structure}` : (profile?.agency ? `<br>${profile.agency}` : "")}`;
  const customMessage = `<p>Bonjour,</p><p>Veuillez trouver ci-joint le procès-verbal de la réunion de chantier. Les points en attente y sont détaillés par poste.</p><p>${signatureHtml}</p>`;

  const sendPv = async () => {
    saveDraft();
    if (demo) { finish(); return; }
    const to = recipients.filter((_, i) => isChecked(i)).map(r => r.email).filter(Boolean);
    if (!to.length) { finish(); return; }
    setSending(true);
    try {
      let pdfBase64 = null, pdfFileName = null;
      if (diffAttachPdf) {
        try { const res = await generatePDF(project, meta.num, today, gen.content, profile, { returnDataUrl: true }); pdfBase64 = res.dataUrl.split(",")[1]; pdfFileName = res.fileName; } catch { /* PV part sans PDF si la génération échoue */ }
      }
      const r = await sendPvByEmail({ to, projectName: project.name, pvNumber: meta.num, pvDate: today, pvContent: gen.content, authorName: profile?.name || "Architecte", structureName: profile?.agency || profile?.structureName || "", pdfBase64, pdfFileName, subject, customMessage });
      if (r?.upgradeRequired) { onRequireUpgrade?.(r.upgradeRequired.feature || "maxEmailPerMonth"); setSending(false); return; }
      if (r?.error) throw new Error(r.error);
      setProjects(prev => prev.map(p => p.id === project.id ? { ...p, pvHistory: (p.pvHistory || []).map(pv => pv.number === meta.num ? { ...pv, status: "sent" } : pv) } : p));
      finish();
    } catch (e) { setSending(false); alert("Envoi échoué : " + (e.message || "erreur")); }
  };

  // Applique les remarques réparties par l'IA (dispatch-remarks) aux postes.
  const applyDispatch = (grouped) => {
    if (demo) return;
    setProjects(prev => prev.map(p => p.id !== project.id ? p : {
      ...p,
      posts: (p.posts || []).map(po => {
        const nr = grouped[po.id] || [];
        if (!nr.length) return po;
        const existing = (po.remarks || []).length > 0 ? po.remarks : (po.notes?.trim() ? parseNotesToRemarks(po.notes) : []);
        return { ...po, remarks: [...existing, ...nr], notes: "" };
      }),
    }));
  };

  const createTask = (task) => {
    if (demo) return;
    setProjects(prev => prev.map(p => {
      if (p.id !== project.id) return p;
      const id = Math.max(0, ...(p.actions || []).map(a => a.id || 0)) + 1;
      const newA = { id, text: task.title || task.description || "Action", who: task.who || "", due: task.due || "", urgent: task.priority === "urgent" || task.severity === "major", priority: task.priority || (task.severity === "major" ? "urgent" : "medium"), open: true, since: `PV n°${meta.num}`, createdAt: new Date().toISOString(), createdBy: profile?.name || "—" };
      return { ...p, actions: [...(p.actions || []), newA] };
    }));
  };

  const stepIndex = step === "redaction" ? 2 : step === "diffusion" ? 3 : 1;
  const stepCta =
    step === "saisie" ? { label: "Continuer vers la rédaction", onClick: () => { setStep("redaction"); if (!demo && !gen.content && !gen.loading) genPv(); } }
    : step === "redaction" ? { label: "Continuer vers la diffusion", onClick: () => { saveDraft(); setStep("diffusion"); }, disabled: !demo && (gen.loading || (!gen.content && !gen.error)) }
    : step === "diffusion" ? { label: sending ? "Envoi…" : "Valider et envoyer", onClick: sendPv, disabled: sending }
    : null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", flexDirection: "column", background: tokens.color.neutral[50], fontFamily: tokens.font.family, color: tokens.color.neutral[900] }}>
      {/* ── Top bar ── */}
      <div style={{ height: 58, flexShrink: 0, background: tokens.color.neutral[0], borderBottom: `1px solid ${tokens.color.neutral[200]}`, display: "flex", alignItems: "center", padding: `0 ${tokens.space[5]}`, gap: tokens.space[4] }}>
        <NaviButton onClick={step === "choice" ? finish : () => setStep(step === "diffusion" ? "redaction" : step === "redaction" ? "saisie" : "choice")} icon={<I.back size={18} />} label={step === "choice" ? "Espace projet" : "Retour"} />
        <div style={{ width: 1, height: 24, background: tokens.color.neutral[200] }} />
        <div>
          <div style={{ fontSize: tokens.font.size.base, fontWeight: tokens.font.weight.bold, letterSpacing: "-0.2px" }}>Nouveau PV n°{meta.num}</div>
          <div style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[500] }}>{project?.name}</div>
        </div>

        {/* Stepper */}
        <div style={{ margin: "0 auto", display: "flex", alignItems: "center", gap: tokens.space[2] }}>
          {STEPS.map((s, i) => (
            <div key={s.n} style={{ display: "flex", alignItems: "center", gap: tokens.space[2] }}>
              {i > 0 && <div style={{ width: 34, height: 2, borderRadius: tokens.radius.full, background: tokens.color.neutral[200] }} />}
              <div style={{ display: "flex", alignItems: "center", gap: tokens.space[2] }}>
                <div style={{
                  width: 24, height: 24, borderRadius: tokens.radius.full,
                  background: s.n <= stepIndex ? tokens.color.brand[500] : tokens.color.neutral[100],
                  color: s.n <= stepIndex ? tokens.color.neutral[0] : tokens.color.neutral[500],
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.bold,
                }}>
                  {s.n < stepIndex ? <I.check size={13} /> : s.n}
                </div>
                <span style={{ fontSize: tokens.font.size.sm, fontWeight: s.n === stepIndex ? tokens.font.weight.semibold : tokens.font.weight.medium, color: s.n === stepIndex ? tokens.color.neutral[900] : tokens.color.neutral[500] }}>{s.label}</span>
              </div>
            </div>
          ))}
        </div>

        {stepCta
          ? <Button variant="primary" size="md" rightIcon={<I.chevron size={15} />} onClick={stepCta.onClick} disabled={stepCta.disabled}>{stepCta.label}</Button>
          : <NaviButton onClick={finish} icon={<I.close size={18} />} square />}
      </div>

      {/* ── Contenu ── */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {step === "choice" && <ChoiceStep meta={meta} onChoose={(m) => { if (m === "dictate") { setStep("audio"); } else { setSaisieMode("write"); setStep("saisie"); } }} onImport={() => setImportOpen(true)} />}
        {step === "audio" && <AudioStep project={project} meta={meta} demo={demo} onApply={applyDispatch} onDone={() => { setStep("redaction"); if (!demo && !gen.content && !gen.loading) genPv(); }} onCancel={() => setStep("choice")} />}
        {step === "saisie" && <SaisieStep project={project} meta={meta} demo={demo} initialMode={saisieMode} onAddRemark={addRemark} onRemoveRemark={removeRemark} onAssignRemark={assignRemark} onAddRemarkPhotos={addRemarkPhotos} />}
        {step === "redaction" && <RedactionStep meta={meta} project={project} demo={demo} gen={gen} onChange={(v) => setGen(g => ({ ...g, content: v }))} onRegenerate={() => genPv()} profile={profile} today={today} styleId={pvStyle} onStyleChange={(id) => { setPvStyle(id); if (!demo) genPv({ style: id }); }} recipFilter={recipFilter} recipOptions={recipOptions} onRecipChange={(name) => { setRecipFilter(name); if (!demo) genPv({ recip: name }); }} numMode={numMode} onNumChange={(m) => { setNumMode(m); if (!demo) genPv({ num: m }); }} />}
        {step === "diffusion" && <DiffusionStep meta={meta} project={project} demo={demo} suggestedTasks={gen.suggestedTasks} recipients={recipients} subject={subject} isChecked={isChecked} onToggleRecipient={(i) => setDiffChecked(c => ({ ...c, [i]: c[i] === false }))} attachPdf={diffAttachPdf} onToggleAttach={() => setDiffAttachPdf(v => !v)} onCreateTask={createTask} profile={profile} messageHtml={customMessage} />}
      </div>

      {importOpen && (
        <ImportNotesModal
          demo={demo}
          project={project}
          onClose={() => setImportOpen(false)}
          onApply={applyDispatch}
          onDone={() => { setImportOpen(false); setStep("saisie"); }}
        />
      )}
    </div>
  );
}

function NaviButton({ onClick, icon, label, square }) {
  const [hover, setHover] = useState(false);
  return (
    <button type="button" onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex", alignItems: "center", gap: tokens.space[2],
        height: 34, width: square ? 34 : undefined, padding: square ? 0 : `0 ${tokens.space[2]} 0 ${tokens.space[1]}`,
        justifyContent: "center", borderRadius: tokens.radius.md, border: "none", cursor: "pointer", fontFamily: "inherit",
        background: hover ? tokens.color.neutral[100] : "transparent", color: tokens.color.neutral[700],
        fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.medium, transition: tokens.transition.base,
      }}>
      {icon}
      {label && <span>{label}</span>}
    </button>
  );
}

// ── Écran Choix de la méthode ──
function ChoiceStep({ meta, onChoose, onImport }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: `${tokens.space[10]} ${tokens.space[10]}`, minHeight: "100%", boxSizing: "border-box" }}>
      <div style={{ width: "100%", maxWidth: 760 }}>
        <div style={{ textAlign: "center", marginBottom: tokens.space[8] }}>
          {meta.meetingLabel && (
            <div style={{ fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.semibold, letterSpacing: "0.06em", textTransform: "uppercase", color: tokens.color.brand[600], marginBottom: tokens.space[2] }}>
              Réunion du {meta.meetingLabel}
            </div>
          )}
          <h1 style={{ margin: `0 0 ${tokens.space[2]}`, fontSize: tokens.font.size["3xl"], fontWeight: tokens.font.weight.bold, letterSpacing: "-0.6px", lineHeight: 1.1 }}>
            Comment veux-tu composer le PV n°{meta.num} ?
          </h1>
          <div style={{ fontSize: tokens.font.size.md, color: tokens.color.neutral[700], lineHeight: tokens.font.leading.normal }}>
            {meta.openReserves > 0
              ? <>Les <b style={{ color: tokens.color.brand[600], fontWeight: tokens.font.weight.semibold }}>{meta.openReserves} réserves non levées</b> du PV précédent sont déjà reportées. Choisis comment ajouter le reste.</>
              : <>Choisis comment saisir tes observations.</>}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: tokens.space[4], marginBottom: tokens.space[5] }}>
          <ChoiceCard
            icon={<I.pen size={26} />}
            title="Rédaction manuelle"
            desc="Saisis tes remarques poste par poste, au clavier. Idéal au bureau, au calme, avec le dernier PV sous les yeux."
            cta="Ouvrir la saisie"
            onClick={() => onChoose("write")}
          />
          <ChoiceCard
            emphasized
            badge="✦ Assisté par l'IA"
            icon={<I.mic size={26} />}
            title="Enregistrement audio"
            desc="Dicte tes observations ou dépose l'enregistrement de la réunion. L'IA transcrit, découpe en remarques atomiques et les répartit par poste."
            cta="Démarrer l'enregistrement"
            onClick={() => onChoose("dictate")}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: tokens.space[4] }}>
          <NaviButton onClick={onImport} icon={<I.upload size={15} />} label="Importer des notes (.txt)" />
          <div style={{ width: 1, height: 18, background: tokens.color.neutral[200] }} />
          <NaviButton onClick={() => onChoose("write")} icon={<I.redo size={15} />} label="Reprendre un brouillon" />
        </div>
      </div>
    </div>
  );
}

function ChoiceCard({ icon, title, desc, cta, onClick, emphasized, badge }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative", overflow: "hidden", cursor: "pointer",
        background: emphasized ? tokens.color.brand[50] : tokens.color.neutral[0],
        border: `${emphasized ? 1.5 : 1}px solid ${emphasized ? tokens.color.brand[200] : (hover ? tokens.color.brand[200] : tokens.color.neutral[200])}`,
        borderRadius: tokens.radius.xl, padding: tokens.space[6],
        display: "flex", flexDirection: "column",
        boxShadow: hover ? tokens.shadow.md : "none", transition: tokens.transition.base,
      }}
    >
      {badge && (
        <div style={{ position: "absolute", top: 0, right: 0, background: tokens.color.brand[500], color: tokens.color.neutral[0], fontSize: 10, fontWeight: tokens.font.weight.bold, letterSpacing: "0.04em", padding: "5px 12px", borderBottomLeftRadius: 12, textTransform: "uppercase" }}>{badge}</div>
      )}
      <div style={{
        width: 52, height: 52, borderRadius: 14, marginBottom: tokens.space[4],
        background: emphasized ? tokens.color.brand[500] : tokens.color.neutral[100],
        color: emphasized ? tokens.color.neutral[0] : tokens.color.neutral[700],
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: emphasized ? tokens.shadow.priority : "none",
      }}>{icon}</div>
      <div style={{ fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.bold, letterSpacing: "-0.3px", marginBottom: tokens.space[2] }}>{title}</div>
      <div style={{ fontSize: tokens.font.size.base, color: emphasized ? "#8B5A3C" : tokens.color.neutral[700], lineHeight: tokens.font.leading.normal, flex: 1 }}>{desc}</div>
      <div style={{ display: "flex", alignItems: "center", gap: tokens.space[1], marginTop: tokens.space[4], fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.semibold, color: emphasized ? tokens.color.brand[600] : tokens.color.neutral[700] }}>
        {cta} <I.chevron size={15} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Étape 1 — Saisie des remarques (contexte + postes + remarques)
// ─────────────────────────────────────────────────────────────

// Données de démo de la saisie (postes + remarques du poste actif).
const SAISIE_POSTES = [
  { code: "01", name: "Situation générale", count: 2 },
  { code: "02", name: "Gros œuvre", count: 1 },
  { code: "03", name: "Électricité", count: 4, contractor: "Elek & Co" },
  { code: "04", name: "HVAC", count: 2, alert: true },
  { code: "05", name: "Menuiseries ext.", count: 3 },
  { code: "06", name: "Finitions", count: 0 },
];
const SAISIE_REMARKS = {
  "03": [
    { id: 1, text: "Reprendre le tirage des câbles dans la gaine technique du 2e étage — section sous-dimensionnée constatée.", status: "reported", recipient: { ini: "EG", name: "Entreprise Genin" }, photos: 2 },
    { id: 2, text: "Tableau électrique principal non conforme : absence de différentiel 30 mA sur le circuit prises du rez. À corriger avant mise sous tension.", status: "urgent", recipient: { ini: "EC", name: "Elek & Co" }, canConvert: true },
    { id: 3, text: "Appareillage du hall principal validé sur site — pose conforme au plan d'exécution rév. C.", status: "observation" },
  ],
};
const REMARK_STATUS = {
  reported:    { label: "↩ Reporté", bg: tokens.color.brand[50], fg: tokens.color.brand[600], border: tokens.color.brand[100] },
  urgent:      { label: "Urgent", bg: tokens.color.semantic.danger.bg, fg: tokens.color.semantic.danger.fg, border: tokens.color.semantic.danger.border },
  observation: { label: "Observation", bg: tokens.color.semantic.info.bg, fg: tokens.color.semantic.info.fg, border: tokens.color.semantic.info.border },
  done:        { label: "Résolu", bg: tokens.color.semantic.success.bg, fg: tokens.color.semantic.success.fg, border: tokens.color.semantic.success.border },
};

function initials(s) {
  if (!s) return "?";
  const parts = String(s).trim().split(/\s+/);
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Mappe une remarque réelle {text,status,urgent,recipients,carriedFrom} vers
// l'affichage de carte (statut visuel + destinataire).
function toDisplayRemark(r) {
  const status = r.carriedFrom ? "reported" : r.urgent ? "urgent" : r.status === "done" ? "done" : r.status === "progress" ? "observation" : "observation";
  const rec = (r.recipients || [])[0];
  return { id: r.id, text: r.text, status, recipient: rec ? { ini: initials(rec), name: rec } : null, photos: r.photos || [] };
}

// ─────────────────────────────────────────────────────────────
// Étape 1 (variante) — Enregistrement audio (chrono + waveform +
// transcription + remarques détectées réparties par l'IA)
// ─────────────────────────────────────────────────────────────

const AUDIO_DEMO_TRANSCRIPT = [
  { who: "Gaëlle D.", t: "04:01", text: "…donc sur l'électricité, il faut reprendre le tirage des câbles dans la gaine du 2ᵉ, la section est sous-dimensionnée. Et attention, le tableau principal n'a pas de différentiel sur les prises du rez, c'est à corriger avant la mise sous tension." },
  { who: "M. Genin", t: "04:20", text: "D'accord, on planifie ça pour la semaine prochaine. Pour le hall, l'appareillage est posé, c'est conforme au plan rév. C." },
  { who: "Gaëlle D.", t: "04:31", text: "Parfait. Côté HVAC maintenant, la centrale de traitement d'air" },
];
const AUDIO_DEMO_DETECTED = [
  { poste: "03 · ÉLECTRICITÉ", text: "Reprendre le tirage des câbles — gaine 2ᵉ étage sous-dimensionnée." },
  { poste: "03 · ÉLECTRICITÉ", urgent: true, text: "Tableau principal sans différentiel sur les prises du rez — à corriger avant mise sous tension." },
  { poste: "03 · ÉLECTRICITÉ", text: "Appareillage du hall posé, conforme au plan rév. C." },
];

function AudioStep({ project, meta, demo, onApply, onDone, onCancel }) {
  const [elapsed, setElapsed] = useState(demo ? 272 : 0);
  const [phase, setPhase] = useState("recording"); // recording | done | error
  const [finalText, setFinalText] = useState("");
  const [interim, setInterim] = useState("");
  const [detected, setDetected] = useState([]);
  const [err, setErr] = useState("");
  const timerRef = useRef(null);
  const recRef = useRef(null);
  const activeRef = useRef(true);
  const pendingRef = useRef("");

  const présents = demo
    ? [{ ini: "GD", name: "Gaëlle D.", present: true }, { ini: "MG", name: "M. Genin", present: true }]
    : (project.participants || []).filter(p => p.name && p.name.trim()).slice(0, 5).map(p => ({ ini: initials(p.name), name: p.name, present: true }));

  // Répartition par poste d'un fragment de transcription (live, par phrase).
  const dispatchChunk = async (chunk) => {
    const posts = (project.posts || []).map(po => ({ id: po.id, label: po.label }));
    if (!chunk.trim() || !posts.length) return;
    try {
      const { data, error } = await supabase.functions.invoke("dispatch-remarks", { body: { transcript: chunk, posts } });
      if (error || data?.error) return;
      const items = Array.isArray(data?.items) ? data.items : [];
      const norm = (id) => String(id).replace(/^0+/, "") || "0";
      const postIds = posts.map(p => p.id);
      const findPost = (raw) => { const s = String(raw); if (postIds.includes(s)) return s; return postIds.find(pid => norm(pid) === norm(s)) || postIds[0] || null; };
      const grouped = {}, flat = [];
      for (const it of items) {
        const rid = findPost(it.postId);
        if (!rid) continue;
        (grouped[rid] = grouped[rid] || []).push({ id: Date.now() + Math.random(), text: it.text, urgent: !!it.urgent, status: "open" });
        const label = (project.posts.find(p => p.id === rid) || {}).label || rid;
        flat.push({ poste: `${rid} · ${String(label).toUpperCase()}`, text: it.text, urgent: !!it.urgent });
      }
      if (flat.length) { onApply(grouped); setDetected(prev => [...prev, ...flat]); }
    } catch { /* fragment ignoré */ }
  };

  // Transcription EN DIRECT via la Web Speech API (reconnaissance continue).
  useEffect(() => {
    if (demo) return;
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setErr("La transcription en direct n'est pas supportée par ce navigateur (essaie Chrome)."); return () => clearInterval(timerRef.current); }
    const rec = new SR();
    rec.lang = "fr-FR"; rec.continuous = true; rec.interimResults = true;
    rec.onresult = (e) => {
      let interimStr = "", finalAdded = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const txt = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalAdded += txt + " "; else interimStr += txt;
      }
      setInterim(interimStr);
      if (finalAdded) {
        setFinalText(prev => prev + finalAdded);
        pendingRef.current += finalAdded;
        if (/[.!?…]/.test(pendingRef.current) || pendingRef.current.length > 110) {
          const chunk = pendingRef.current; pendingRef.current = "";
          dispatchChunk(chunk);
        }
      }
    };
    rec.onerror = (ev) => { if (ev.error === "not-allowed" || ev.error === "service-not-allowed") setErr("Micro refusé — autorise le micro."); };
    rec.onend = () => { if (activeRef.current) { try { rec.start(); } catch { /* déjà en cours */ } } };
    recRef.current = rec;
    try { rec.start(); } catch { /* ignore */ }
    return () => { activeRef.current = false; clearInterval(timerRef.current); try { rec.onend = null; rec.stop(); } catch { /* ignore */ } };
    // eslint-disable-next-line
  }, [demo]);

  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  const recording = demo || phase === "recording";
  const finishRec = () => {
    if (demo) { setPhase("done"); setDetected(AUDIO_DEMO_DETECTED); return; }
    activeRef.current = false;
    clearInterval(timerRef.current);
    try { if (recRef.current) { recRef.current.onend = null; recRef.current.stop(); } } catch { /* ignore */ }
    if (pendingRef.current.trim()) { dispatchChunk(pendingRef.current); pendingRef.current = ""; }
    setPhase("done");
  };

  return (
    <>
      <style>{`@keyframes pvpulse { 0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,.5)} 50%{box-shadow:0 0 0 6px rgba(220,38,38,0)} }`}</style>

      {/* Bandeau d'enregistrement — plus haut */}
      <div style={{ flexShrink: 0, padding: `${tokens.space[4]} ${tokens.space[6]} 0` }}>
        <div style={{ background: tokens.color.brand[50], border: `1px solid ${tokens.color.brand[100]}`, borderRadius: tokens.radius.xl, padding: `${tokens.space[5]} ${tokens.space[5]}`, display: "flex", alignItems: "center", gap: tokens.space[5], minHeight: 76 }}>
          <div style={{ display: "flex", alignItems: "center", gap: tokens.space[2], flexShrink: 0 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: tokens.color.semantic.danger.fg, ...(recording ? { animation: "pvpulse 1.2s ease-in-out infinite" } : null) }} />
            <span style={{ fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.bold, letterSpacing: "0.06em", color: tokens.color.neutral[700], textTransform: "uppercase" }}>{phase === "done" ? "Terminé" : "Enregistrement"}</span>
            <span style={{ fontSize: tokens.font.size["2xl"], fontWeight: tokens.font.weight.bold, color: tokens.color.neutral[900], fontVariantNumeric: "tabular-nums", marginLeft: tokens.space[2], letterSpacing: "-0.5px" }}>{mmss}</span>
          </div>
          <Waveform stream={null} active={recording} />
          <div style={{ marginLeft: "auto", flexShrink: 0 }}>
            {phase === "recording" && <Button variant="primary" size="lg" onClick={finishRec}>Terminer &amp; transcrire</Button>}
            {phase === "done" && <Button variant="primary" size="lg" rightIcon={<I.chevron size={15} />} onClick={onDone}>Continuer vers la rédaction</Button>}
            {phase === "error" && <Button variant="secondary" size="lg" onClick={onCancel}>Retour</Button>}
          </div>
        </div>

        {/* Présents + note */}
        <div style={{ display: "flex", alignItems: "center", gap: tokens.space[2], padding: `${tokens.space[3]} ${tokens.space[1]} ${tokens.space[1]}`, flexWrap: "wrap" }}>
          <span style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[500] }}>Présents</span>
          {présents.map((p, i) => <PresentChip key={i} ini={p.ini} name={p.name} present={p.present} />)}
          <span style={{ marginLeft: "auto", fontSize: tokens.font.size.xs, color: err ? tokens.color.semantic.danger.fg : tokens.color.neutral[400] }}>{err || "L'audio reste sur l'appareil · transcription en direct"}</span>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Transcription en direct */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", borderRight: `1px solid ${tokens.color.neutral[200]}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: tokens.space[2], padding: `${tokens.space[4]} ${tokens.space[6]} ${tokens.space[2]}` }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: tokens.color.semantic.danger.fg, ...(recording ? { animation: "pvpulse 1.2s ease-in-out infinite" } : null) }} />
            <span style={{ fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[500], textTransform: "uppercase", letterSpacing: "0.05em" }}>Transcription en direct</span>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: `0 ${tokens.space[6]} ${tokens.space[5]}` }}>
            {demo ? (
              <div style={{ display: "flex", flexDirection: "column", gap: tokens.space[3] }}>
                {AUDIO_DEMO_TRANSCRIPT.map((l, i) => (
                  <div key={i}>
                    <div style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[500], marginBottom: 2 }}>{l.who} · {l.t}</div>
                    <div style={{ fontSize: tokens.font.size.base, color: tokens.color.neutral[700], lineHeight: 1.55 }}>{l.text}{i === AUDIO_DEMO_TRANSCRIPT.length - 1 && <span style={{ display: "inline-block", width: 2, height: 15, background: tokens.color.brand[500], verticalAlign: "text-bottom", marginLeft: 1 }} />}</div>
                  </div>
                ))}
              </div>
            ) : (finalText || interim) ? (
              <div style={{ fontSize: tokens.font.size.base, lineHeight: 1.6, color: tokens.color.neutral[700] }}>
                {finalText}
                <span style={{ color: tokens.color.neutral[400] }}>{interim}</span>
                {recording && <span style={{ display: "inline-block", width: 2, height: 15, background: tokens.color.brand[500], verticalAlign: "text-bottom", marginLeft: 1 }} />}
              </div>
            ) : (
              <div style={{ fontSize: tokens.font.size.sm, color: tokens.color.neutral[500], padding: tokens.space[4] }}>{err ? err : "Parle — le texte s'affiche ici en direct…"}</div>
            )}
          </div>
        </div>

        {/* Remarques détectées (live) */}
        <div style={{ width: 360, flexShrink: 0, display: "flex", flexDirection: "column", background: tokens.color.neutral[0] }}>
          <div style={{ display: "flex", alignItems: "center", gap: tokens.space[2], padding: `${tokens.space[4]} ${tokens.space[4]} ${tokens.space[2]}` }}>
            <span style={{ color: tokens.color.brand[600], display: "inline-flex" }}><I.spark size={15} /></span>
            <span style={{ fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[500], textTransform: "uppercase", letterSpacing: "0.05em" }}>Remarques détectées</span>
            {(demo ? AUDIO_DEMO_DETECTED : detected).length > 0 && <span style={{ marginLeft: "auto", fontSize: tokens.font.size.xs, color: tokens.color.neutral[400] }}>{(demo ? AUDIO_DEMO_DETECTED : detected).length} · réparties par l'IA</span>}
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: `0 ${tokens.space[4]} ${tokens.space[4]}`, display: "flex", flexDirection: "column", gap: tokens.space[2] }}>
            {(demo ? AUDIO_DEMO_DETECTED : detected).length === 0
              ? <div style={{ fontSize: tokens.font.size.sm, color: tokens.color.neutral[500], padding: tokens.space[4] }}>{recording ? "L'IA détecte et range les remarques au fil de la parole…" : "Aucune remarque détectée."}</div>
              : (demo ? AUDIO_DEMO_DETECTED : detected).map((d, i) => (
                <div key={i} style={{ background: tokens.color.neutral[0], border: `1px solid ${tokens.color.neutral[200]}`, borderLeft: d.urgent ? `3px solid ${tokens.color.semantic.danger.fg}` : `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.md, padding: tokens.space[3] }}>
                  <div style={{ display: "flex", alignItems: "center", gap: tokens.space[2], marginBottom: tokens.space[1] }}>
                    <span style={{ fontSize: 10, fontFamily: "ui-monospace, monospace", color: tokens.color.neutral[400] }}>{d.poste}</span>
                    {d.urgent && <span style={{ fontSize: 9, fontWeight: tokens.font.weight.semibold, color: tokens.color.semantic.danger.fg, textTransform: "uppercase" }}>Urgent</span>}
                  </div>
                  <div style={{ fontSize: tokens.font.size.sm, color: tokens.color.neutral[900], lineHeight: 1.4 }}>{d.text}</div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </>
  );
}

function Waveform({ stream, active }) {
  const [bars, setBars] = useState(() => Array.from({ length: 28 }, () => 0.2));
  const rafRef = useRef(null);
  useEffect(() => {
    if (!active) { setBars(Array.from({ length: 28 }, () => 0.18)); return; }
    if (!stream) {
      let t = 0;
      const tick = () => { t += 0.3; setBars(Array.from({ length: 28 }, (_, i) => 0.25 + 0.55 * Math.abs(Math.sin(t + i * 0.5)))); rafRef.current = requestAnimationFrame(tick); };
      rafRef.current = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(rafRef.current);
    }
    let ctx, analyser, src, data;
    try {
      const AC2 = window.AudioContext || window.webkitAudioContext;
      ctx = new AC2();
      src = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      src.connect(analyser);
      data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => { analyser.getByteFrequencyData(data); setBars(Array.from({ length: 28 }, (_, i) => Math.max(0.12, (data[i % data.length] || 0) / 255))); rafRef.current = requestAnimationFrame(tick); };
      rafRef.current = requestAnimationFrame(tick);
    } catch { /* ignore */ }
    return () => { cancelAnimationFrame(rafRef.current); try { src && src.disconnect(); ctx && ctx.close(); } catch { /* ignore */ } };
  }, [stream, active]);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, height: 28, flex: 1, minWidth: 0, overflow: "hidden" }}>
      {bars.map((b, i) => <span key={i} style={{ width: 3, height: `${Math.round(b * 100)}%`, background: active ? tokens.color.brand[500] : tokens.color.neutral[300], borderRadius: 2, transition: "height 0.08s linear" }} />)}
    </div>
  );
}

function SaisieStep({ project, meta, demo, onAddRemark, initialMode, onAssignRemark, onAddRemarkPhotos }) {
  const postes = useMemo(() => demo
    ? SAISIE_POSTES
    : (project.posts || []).map(p => ({ code: p.id, name: p.label, count: (p.remarks || []).length, alert: (p.remarks || []).some(r => r.urgent && r.status !== "done") })),
    [project, demo]);
  const [activePoste, setActivePoste] = useState(postes[0]?.code);
  const [mockRemarks, setMockRemarks] = useState(SAISIE_REMARKS);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState(initialMode === "dictate" ? "dictate" : "write");
  const [status, setStatus] = useState("observation");
  const [weather, setWeather] = useState(demo ? { temperature: 12, label: "Couvert" } : null);
  const [wxState, setWxState] = useState(demo ? "ok" : "loading");
  const startTime = useMemo(() => new Date().toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" }), []);
  const dateLabel = meta.meetingLabel || new Date().toLocaleDateString("fr-BE", { weekday: "short", day: "numeric", month: "long" });
  const [pendingPhotos, setPendingPhotos] = useState([]);
  const [pendingRecipient, setPendingRecipient] = useState(null);
  const [photoPickerFor, setPhotoPickerFor] = useState(null); // null | "capture" | remarkId

  useEffect(() => { if (!postes.find(p => p.code === activePoste)) setActivePoste(postes[0]?.code); }, [postes, activePoste]);

  const poste = postes.find(p => p.code === activePoste) || postes[0] || { code: "", name: "—", count: 0 };
  const realPost = demo ? null : (project.posts || []).find(p => p.id === activePoste);
  const remarks = demo ? (mockRemarks[activePoste] || []) : (realPost?.remarks || []).map(toDisplayRemark);
  const totalRemarks = demo ? postes.reduce((s, p) => s + p.count, 0) : meta.totalRemarks;
  const présents = demo
    ? [{ ini: "GD", name: "Gaëlle D.", present: true }, { ini: "MG", name: "M. Genin", present: true }, { ini: "PM", name: "P. Mertens", present: false }]
    : (project.participants || []).filter(p => p.name && p.name.trim()).slice(0, 4).map(p => ({ ini: initials(p.name), name: p.name, present: true }));

  const recOf = (name) => name ? { ini: initials(name), name } : null;
  const addRemark = () => {
    if (!draft.trim() && !pendingPhotos.length) return;
    if (demo) setMockRemarks(prev => ({ ...prev, [activePoste]: [...(prev[activePoste] || []), { id: Date.now(), text: draft.trim() || "(photo)", status, photos: pendingPhotos, recipient: recOf(pendingRecipient) }] }));
    else onAddRemark(activePoste, draft.trim() || "(photo)", status, pendingPhotos, pendingRecipient ? [pendingRecipient] : []);
    setDraft(""); setPendingPhotos([]); setPendingRecipient(null);
  };

  // Édition d'une remarque déjà créée (assignation / photos) — démo ou réel.
  const assignTo = (remarkId, name) => {
    if (demo) setMockRemarks(prev => ({ ...prev, [activePoste]: (prev[activePoste] || []).map(r => r.id === remarkId ? { ...r, recipient: recOf(name) } : r) }));
    else onAssignRemark?.(activePoste, remarkId, name);
  };
  const addPhotosTo = (remarkId, photos) => {
    if (demo) setMockRemarks(prev => ({ ...prev, [activePoste]: (prev[activePoste] || []).map(r => r.id === remarkId ? { ...r, photos: [...(r.photos || []), ...photos] } : r) }));
    else onAddRemarkPhotos?.(activePoste, remarkId, photos);
  };

  // Dictée : transcription Whisper → découpée en remarques sur le poste actif.
  const recorder = useWhisperRecorder({
    onResult: (text) => {
      if (demo || !text) return;
      const parts = String(text).split(/(?<=[.!?…])\s+/).map(s => s.trim()).filter(Boolean);
      (parts.length ? parts : [text.trim()]).forEach(p => p && onAddRemark(activePoste, p, status));
    },
    onError: () => {},
  });

  // Si on est arrivé par « Enregistrement audio », on lance l'enregistrement
  // directement (le micro démarre ; à l'arrêt, l'IA transcrit → remarques).
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!demo && initialMode === "dictate" && !autoStarted.current) {
      autoStarted.current = true;
      try { recorder.start(); } catch { /* mic refusé → l'utilisateur peut relancer */ }
    }
  }, [demo, initialMode, recorder]);

  // Météo réelle — chantier (project.geo) sinon position courante. Best effort.
  useEffect(() => {
    if (demo) return;
    let cancelled = false;
    (async () => {
      try {
        let w = null;
        const geo = project?.geo;
        if (geo?.lat && geo?.lng) w = await fetchWeatherAt(geo.lat, geo.lng);
        if (!w) { const pos = await getCurrentPositionSafe(); if (pos && !cancelled) w = await fetchWeatherAt(pos.lat, pos.lng); }
        if (cancelled) return;
        if (w) { setWeather(w); setWxState("ok"); } else setWxState("none");
      } catch { if (!cancelled) setWxState("none"); }
    })();
    return () => { cancelled = true; };
  }, [demo, project]);

  return (
    <>
      {/* Bandeau de contexte : date, météo, présents */}
      <div style={{ height: 52, flexShrink: 0, background: tokens.color.neutral[0], borderBottom: `1px solid ${tokens.color.neutral[200]}`, display: "flex", alignItems: "center", padding: `0 ${tokens.space[5]}`, gap: tokens.space[3], overflowX: "auto" }}>
        <CtxItem icon={<I.cal size={15} />}>{dateLabel} · {startTime}</CtxItem>
        <Divider />
        <CtxItem icon={<I.cloud size={15} />} muted>{wxState === "loading" ? "Météo…" : weather ? `${weather.temperature}°C · ${weather.label}` : "Météo indisponible"}</CtxItem>
        <Divider />
        <span style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[500] }}>Présents</span>
        {présents.map((p, i) => <PresentChip key={i} ini={p.ini} name={p.name} present={p.present} />)}
        <button style={{ height: 28, padding: `0 ${tokens.space[2]}`, background: tokens.color.neutral[0], border: `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.full, fontFamily: "inherit", fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.medium, color: tokens.color.neutral[500], cursor: "pointer", whiteSpace: "nowrap" }}>+ Gérer</button>
      </div>

      {/* Deux panneaux : rail de postes + remarques */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Rail des postes */}
        <div style={{ width: 256, flexShrink: 0, background: tokens.color.neutral[0], borderRight: `1px solid ${tokens.color.neutral[200]}`, display: "flex", flexDirection: "column" }}>
          <div style={{ height: 42, display: "flex", alignItems: "center", padding: `0 ${tokens.space[4]}`, borderBottom: `1px solid ${tokens.color.neutral[200]}` }}>
            <span style={{ fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[500], textTransform: "uppercase", letterSpacing: "0.05em" }}>Postes</span>
            <span style={{ marginLeft: tokens.space[2], fontSize: tokens.font.size.xs, color: tokens.color.neutral[300] }}>{postes.length}</span>
            <button style={{ marginLeft: "auto", width: 26, height: 26, borderRadius: tokens.radius.sm, border: "none", background: "transparent", color: tokens.color.neutral[500], cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><I.plus size={15} /></button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: tokens.space[2] }}>
            {postes.map(p => {
              const active = p.code === activePoste;
              return (
                <button key={p.code} onClick={() => setActivePoste(p.code)} style={{
                  width: "100%", display: "flex", alignItems: "center", gap: tokens.space[2], padding: `${tokens.space[2]} ${tokens.space[2]}`,
                  borderRadius: tokens.radius.md, cursor: "pointer", fontFamily: "inherit", textAlign: "left", marginBottom: 2,
                  background: active ? tokens.color.brand[50] : "transparent",
                  border: "none", borderLeft: active ? `3px solid ${tokens.color.brand[500]}` : "3px solid transparent",
                }}>
                  <span style={{ fontSize: 11, fontFamily: "ui-monospace, monospace", color: active ? tokens.color.brand[600] : tokens.color.neutral[300] }}>{p.code}</span>
                  <span style={{ flex: 1, fontSize: tokens.font.size.sm, color: active ? tokens.color.neutral[900] : tokens.color.neutral[700], fontWeight: active ? tokens.font.weight.semibold : tokens.font.weight.regular }}>{p.name}</span>
                  {p.alert && <span style={{ width: 6, height: 6, borderRadius: tokens.radius.full, background: tokens.color.semantic.danger.fg }} />}
                  <span style={{ fontSize: tokens.font.size.xs, color: active ? tokens.color.brand[600] : tokens.color.neutral[500], fontWeight: active ? tokens.font.weight.semibold : tokens.font.weight.regular }}>{p.count}</span>
                </button>
              );
            })}
          </div>
          <div style={{ padding: tokens.space[3], borderTop: `1px solid ${tokens.color.neutral[200]}`, fontSize: tokens.font.size.xs, color: tokens.color.neutral[500], textAlign: "center" }}>
            {totalRemarks} remarques · {meta.openReserves} reportées
          </div>
        </div>

        {/* Panneau des remarques */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {meta.openReserves > 0 && (
            <div style={{ margin: `${tokens.space[4]} ${tokens.space[6]} 0`, background: tokens.color.brand[50], border: `1px solid ${tokens.color.brand[100]}`, borderRadius: tokens.radius.lg, padding: `${tokens.space[3]} ${tokens.space[4]}`, display: "flex", alignItems: "center", gap: tokens.space[3] }}>
              <span style={{ color: tokens.color.brand[600], display: "inline-flex" }}><I.redo size={16} /></span>
              <span style={{ fontSize: tokens.font.size.sm, color: tokens.color.brand[700] }}><b>{meta.openReserves} remarques non levées</b> ont été reportées automatiquement du PV précédent.</span>
              <button style={{ marginLeft: "auto", height: 28, padding: `0 ${tokens.space[3]}`, background: tokens.color.neutral[0], border: `1px solid ${tokens.color.brand[100]}`, borderRadius: tokens.radius.md, fontFamily: "inherit", fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.medium, color: tokens.color.brand[600], cursor: "pointer" }}>Voir tout</button>
            </div>
          )}

          {/* En-tête du poste */}
          <div style={{ display: "flex", alignItems: "center", gap: tokens.space[2], padding: `${tokens.space[4]} ${tokens.space[6]} ${tokens.space[3]}` }}>
            <span style={{ fontSize: 11, fontFamily: "ui-monospace, monospace", color: tokens.color.neutral[300] }}>{poste.code}</span>
            <h2 style={{ margin: 0, fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.bold, color: tokens.color.neutral[900], letterSpacing: "-0.3px" }}>{poste.name}</h2>
            <span style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[500] }}>{remarks.length} remarque{remarks.length > 1 ? "s" : ""}</span>
            {poste.contractor && <span style={{ fontSize: tokens.font.size.xs, padding: "2px 9px", borderRadius: tokens.radius.full, background: tokens.color.neutral[100], color: tokens.color.neutral[700], border: `1px solid ${tokens.color.neutral[200]}`, fontWeight: tokens.font.weight.medium }}>{poste.contractor}</span>}
          </div>

          {/* Liste des remarques */}
          <div style={{ flex: 1, overflowY: "auto", padding: `0 ${tokens.space[6]}`, display: "flex", flexDirection: "column", gap: tokens.space[2] }}>
            {remarks.length === 0
              ? <div style={{ padding: tokens.space[8], textAlign: "center", color: tokens.color.neutral[500], fontSize: tokens.font.size.sm }}>Aucune remarque sur ce poste — ajoute-en une ci-dessous.</div>
              : remarks.map(r => <RemarkCard key={r.id} r={r} people={présents} onAssign={(name) => assignTo(r.id, name)} onAddPhoto={() => setPhotoPickerFor(r.id)} />)}
          </div>

          {/* Barre de capture */}
          <div style={{ flexShrink: 0, padding: `${tokens.space[3]} ${tokens.space[6]} ${tokens.space[4]}` }}>
            {pendingPhotos.length > 0 && (
              <div style={{ display: "flex", gap: tokens.space[2], marginBottom: tokens.space[2], flexWrap: "wrap" }}>
                {pendingPhotos.map((ph, i) => (
                  <div key={i} style={{ position: "relative", width: 52, height: 52, borderRadius: tokens.radius.md, overflow: "hidden", border: `1px solid ${tokens.color.neutral[200]}`, background: tokens.color.neutral[100] }}>
                    {(ph.url || ph.dataUrl) ? <img src={ph.url || ph.dataUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", color: tokens.color.neutral[400] }}><I.image size={18} /></span>}
                    <button onClick={() => setPendingPhotos(p => p.filter((_, j) => j !== i))} aria-label="Retirer la photo" style={{ position: "absolute", top: 2, right: 2, width: 16, height: 16, borderRadius: 999, border: "none", background: "rgba(28,25,23,0.72)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}><I.close size={9} /></button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ background: tokens.color.neutral[0], border: `1.5px solid ${tokens.color.brand[200]}`, borderRadius: tokens.radius.lg, padding: `${tokens.space[2]} ${tokens.space[2]} ${tokens.space[2]} ${tokens.space[3]}`, boxShadow: tokens.shadow.priority, display: "flex", alignItems: "center", gap: tokens.space[2] }}>
              <div style={{ display: "inline-flex", gap: 3, background: tokens.color.neutral[100], borderRadius: tokens.radius.md, padding: 3, flexShrink: 0 }}>
                {[{ id: "write", label: "Écrire" }, { id: "dictate", label: "Dicter" }].map(m => {
                  const a = m.id === mode;
                  return <button key={m.id} onClick={() => setMode(m.id)} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: tokens.radius.sm, border: "none", background: a ? tokens.color.neutral[0] : "transparent", boxShadow: a ? tokens.shadow.sm : "none", color: a ? tokens.color.neutral[900] : tokens.color.neutral[500], fontFamily: "inherit", fontSize: tokens.font.size.xs, fontWeight: a ? tokens.font.weight.semibold : tokens.font.weight.medium, cursor: "pointer" }}>{m.id === "dictate" && <I.mic size={12} />}{m.label}</button>;
                })}
              </div>
              {mode === "write" ? (
                <>
                  <input
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") addRemark(); }}
                    placeholder={`Ajouter une remarque au poste ${poste.name}…`}
                    style={{ flex: 1, minWidth: 0, height: 34, border: "none", outline: "none", background: "transparent", fontFamily: "inherit", fontSize: tokens.font.size.base, color: tokens.color.neutral[900] }}
                  />
                  <button onClick={() => setPhotoPickerFor("capture")} title="Joindre une photo" aria-label="Joindre une photo" style={{ width: 34, height: 34, flexShrink: 0, borderRadius: tokens.radius.md, border: "none", background: pendingPhotos.length ? tokens.color.brand[50] : "transparent", color: pendingPhotos.length ? tokens.color.brand[600] : tokens.color.neutral[500], cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                    <I.image size={18} />
                    {pendingPhotos.length > 0 && <span style={{ position: "absolute", top: -2, right: -2, minWidth: 14, height: 14, borderRadius: 999, background: tokens.color.brand[500], color: "#fff", fontSize: 9, fontWeight: tokens.font.weight.bold, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>{pendingPhotos.length}</span>}
                  </button>
                  <AssigneeControl variant="capture" people={présents} current={pendingRecipient} onAssign={setPendingRecipient} />
                  <div style={{ display: "flex", alignItems: "center", gap: tokens.space[1], flexShrink: 0 }}>
                    {["observation", "urgent"].map(s => {
                      const a = s === status;
                      const sc = REMARK_STATUS[s];
                      return <button key={s} onClick={() => setStatus(s)} style={{ height: 30, padding: `0 ${tokens.space[2]}`, background: a ? sc.bg : tokens.color.neutral[0], border: `1px solid ${a ? sc.border : tokens.color.neutral[200]}`, borderRadius: tokens.radius.md, fontFamily: "inherit", fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.medium, color: a ? sc.fg : tokens.color.neutral[500], cursor: "pointer", textTransform: "capitalize" }}>{s === "observation" ? "Observation" : "Urgent"}</button>;
                    })}
                  </div>
                  <Button variant="primary" size="md" onClick={addRemark} disabled={!draft.trim() && !pendingPhotos.length}>Ajouter</Button>
                </>
              ) : (
                <DictateBar recorder={recorder} demo={demo} posteName={poste.name} />
              )}
            </div>
          </div>
        </div>
      </div>
      {photoPickerFor && <PhotoPickerSheet project={project} demo={demo} onClose={() => setPhotoPickerFor(null)} onPick={(ref) => { if (photoPickerFor === "capture") setPendingPhotos(p => [...p, ref]); else addPhotosTo(photoPickerFor, [ref]); setPhotoPickerFor(null); }} />}
    </>
  );
}

function CtxItem({ icon, children, muted }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: tokens.space[1], fontSize: tokens.font.size.sm, color: muted ? tokens.color.neutral[500] : tokens.color.neutral[700], whiteSpace: "nowrap" }}>
      <span style={{ color: tokens.color.neutral[500], display: "inline-flex" }}>{icon}</span>{children}
    </div>
  );
}
function Divider() { return <div style={{ width: 1, height: 20, background: tokens.color.neutral[200], flexShrink: 0 }} />; }

function PresentChip({ ini, name, present }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: tokens.space[1], height: 28, padding: "0 10px 0 4px", borderRadius: tokens.radius.full, background: present ? tokens.color.semantic.success.bg : tokens.color.neutral[50], border: `1px solid ${present ? tokens.color.semantic.success.border : tokens.color.neutral[200]}`, whiteSpace: "nowrap" }}>
      <span style={{ width: 20, height: 20, borderRadius: tokens.radius.full, background: present ? "#DCFCE7" : tokens.color.neutral[100], color: present ? tokens.color.semantic.success.fg : tokens.color.neutral[500], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: tokens.font.weight.bold }}>{ini}</span>
      <span style={{ fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.medium, color: present ? tokens.color.semantic.success.fg : tokens.color.neutral[500], textDecoration: present ? "none" : "line-through" }}>{name}</span>
    </div>
  );
}

function DictateBar({ recorder: rec, demo, posteName }) {
  const active = rec.isRecording;
  const label = demo ? "Dictée (démo)" : active ? "Arrêter" : rec.isTranscribing ? "Transcription…" : "Enregistrer";
  const hint = demo
    ? "La dictée est active dans le vrai flux de génération."
    : active ? "Parle — l'IA transcrit et range en remarques…"
    : rec.isTranscribing ? "Transcription en cours…"
    : `Dicte tes remarques pour « ${posteName} »`;
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: tokens.space[3], minWidth: 0 }}>
      <button
        onClick={() => { if (demo) return; active ? rec.stop() : rec.start(); }}
        disabled={demo || rec.isTranscribing}
        style={{ display: "inline-flex", alignItems: "center", gap: tokens.space[2], height: 36, padding: `0 ${tokens.space[4]}`, borderRadius: tokens.radius.md, border: "none", cursor: demo ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.semibold, background: active ? tokens.color.semantic.danger.fg : tokens.color.brand[500], color: "#fff", opacity: demo ? 0.6 : 1, ...(active ? { animation: "pvpulse 1.2s ease-in-out infinite" } : null) }}>
        {active ? <span style={{ width: 10, height: 10, borderRadius: 2, background: "#fff" }} /> : <I.mic size={15} />}
        {label}
        <style>{`@keyframes pvpulse { 0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,.5)} 50%{box-shadow:0 0 0 6px rgba(220,38,38,0)} }`}</style>
      </button>
      <span style={{ flex: 1, minWidth: 0, fontSize: tokens.font.size.sm, color: tokens.color.neutral[500], overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hint}</span>
      {rec.error && <span style={{ fontSize: tokens.font.size.xs, color: tokens.color.semantic.danger.fg, flexShrink: 0 }}>Micro indisponible</span>}
    </div>
  );
}

function RemarkCard({ r, people, onAssign, onAddPhoto }) {
  const sc = REMARK_STATUS[r.status] || REMARK_STATUS.observation;
  const checked = r.status === "reported";
  const photoArr = Array.isArray(r.photos) ? r.photos : [];
  const photoNum = typeof r.photos === "number" ? r.photos : 0;
  return (
    <div style={{ background: tokens.color.neutral[0], border: `1px solid ${tokens.color.neutral[200]}`, borderLeft: r.status === "urgent" ? `3px solid ${tokens.color.semantic.danger.fg}` : `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.lg, padding: tokens.space[3], display: "flex", gap: tokens.space[3] }}>
      <span style={{ width: 20, height: 20, borderRadius: tokens.radius.full, border: `2px solid ${checked ? "#D97706" : tokens.color.neutral[300]}`, background: tokens.color.neutral[0], flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: tokens.font.size.base, color: tokens.color.neutral[900], lineHeight: 1.45, marginBottom: tokens.space[2] }}>{r.text}</div>
        {photoArr.length > 0 && (
          <div style={{ display: "flex", gap: tokens.space[2], marginBottom: tokens.space[2], flexWrap: "wrap" }}>
            {photoArr.map((ph, i) => (ph.url || ph.dataUrl)
              ? <img key={i} src={ph.url || ph.dataUrl} alt="" style={{ width: 56, height: 56, borderRadius: tokens.radius.md, objectFit: "cover", border: `1px solid ${tokens.color.neutral[200]}` }} />
              : <span key={i} style={{ width: 56, height: 56, borderRadius: tokens.radius.md, background: tokens.color.neutral[100], display: "flex", alignItems: "center", justifyContent: "center", color: tokens.color.neutral[400] }}><I.image size={18} /></span>)}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: tokens.space[2], flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: tokens.radius.full, background: sc.bg, color: sc.fg, border: `1px solid ${sc.border}`, fontWeight: r.status === "urgent" ? tokens.font.weight.semibold : tokens.font.weight.medium }}>{r.status === "reported" ? "↩ Reporté" : sc.label}</span>
          {onAssign
            ? <AssigneeControl variant="pill" people={people} current={r.recipient?.name} onAssign={onAssign} />
            : r.recipient && (
              <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, padding: "2px 8px", borderRadius: tokens.radius.full, background: tokens.color.neutral[100], color: tokens.color.neutral[700], border: `1px solid ${tokens.color.neutral[200]}` }}>
                <span style={{ width: 14, height: 14, borderRadius: tokens.radius.full, background: "#DCFCE7", color: tokens.color.semantic.success.fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: tokens.font.weight.bold }}>{r.recipient.ini}</span>
                {r.recipient.name}
              </span>
            )}
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: tokens.space[2] }}>
            {photoNum > 0 && <span style={{ fontSize: 11, color: tokens.color.neutral[500], display: "flex", alignItems: "center", gap: 4 }}><I.image size={13} />{photoNum} photo{photoNum > 1 ? "s" : ""}</span>}
            {onAddPhoto && <button onClick={onAddPhoto} title="Joindre une photo" aria-label="Joindre une photo" style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 26, padding: `0 ${tokens.space[2]}`, background: tokens.color.neutral[0], border: `1px dashed ${tokens.color.neutral[300]}`, borderRadius: tokens.radius.md, fontFamily: "inherit", fontSize: 11, fontWeight: tokens.font.weight.medium, color: tokens.color.neutral[500], cursor: "pointer" }}><I.image size={13} />Photo</button>}
            {r.canConvert && <button style={{ height: 26, padding: `0 ${tokens.space[2]}`, background: tokens.color.neutral[0], border: `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.sm, fontFamily: "inherit", fontSize: 11, fontWeight: tokens.font.weight.medium, color: tokens.color.neutral[500], cursor: "pointer" }}>→ Convertir en réserve</button>}
          </span>
        </div>
      </div>
    </div>
  );
}

// Contrôle d'assignation réutilisable (barre de capture + carte remarque).
function AssigneeControl({ variant, people, current, onAssign }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const list = (people || []).filter(p => p.name);
  const curIni = current ? initials(current) : null;

  const trigger = variant === "capture" ? (
    <button onClick={() => setOpen(o => !o)} title="Assigner à une personne" aria-label="Assigner à une personne" style={{ height: 34, padding: current ? "0 10px 0 4px" : "0 9px", flexShrink: 0, borderRadius: tokens.radius.md, border: "none", background: current ? tokens.color.brand[50] : "transparent", color: current ? tokens.color.brand[700] : tokens.color.neutral[500], cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "inherit", fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.medium }}>
      {current ? <><span style={{ width: 20, height: 20, borderRadius: tokens.radius.full, background: tokens.color.brand[100], color: tokens.color.brand[700], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: tokens.font.weight.bold }}>{curIni}</span>{current.split(" ")[0]}</> : <I.user size={16} />}
    </button>
  ) : (
    <button onClick={() => setOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, padding: "2px 8px", borderRadius: tokens.radius.full, background: current ? tokens.color.neutral[100] : tokens.color.neutral[0], color: current ? tokens.color.neutral[700] : tokens.color.neutral[500], border: current ? `1px solid ${tokens.color.neutral[200]}` : `1px dashed ${tokens.color.neutral[300]}`, cursor: "pointer", fontFamily: "inherit", fontWeight: tokens.font.weight.medium }}>
      {current ? <><span style={{ width: 14, height: 14, borderRadius: tokens.radius.full, background: "#DCFCE7", color: tokens.color.semantic.success.fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: tokens.font.weight.bold }}>{curIni}</span>{current}</> : <><I.user size={11} />Assigner</>}
    </button>
  );

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      {trigger}
      {open && (
        <div style={{ position: "absolute", left: 0, zIndex: 60, minWidth: 190, background: tokens.color.neutral[0], border: `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.lg, boxShadow: "0 12px 32px rgba(28,25,23,0.16)", padding: 4, ...(variant === "capture" ? { bottom: "calc(100% + 6px)" } : { top: "calc(100% + 4px)" }) }}>
          <div style={{ fontSize: 10, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[500], textTransform: "uppercase", letterSpacing: "0.05em", padding: `${tokens.space[1]} ${tokens.space[2]}` }}>Assigner à</div>
          {list.length === 0 && <div style={{ padding: `${tokens.space[2]}`, fontSize: tokens.font.size.xs, color: tokens.color.neutral[500] }}>Aucun intervenant.</div>}
          {list.map((p, i) => {
            const sel = current === p.name;
            return (
              <button key={i} onClick={() => { onAssign(sel ? null : p.name); setOpen(false); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: tokens.space[2], padding: `${tokens.space[2]} ${tokens.space[2]}`, border: "none", borderRadius: tokens.radius.md, background: sel ? tokens.color.brand[50] : "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                <span style={{ width: 22, height: 22, borderRadius: tokens.radius.full, background: "#DCFCE7", color: tokens.color.semantic.success.fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: tokens.font.weight.bold, flexShrink: 0 }}>{p.ini || initials(p.name)}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: tokens.font.size.sm, color: tokens.color.neutral[900], whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                {sel && <span style={{ color: tokens.color.brand[600], display: "inline-flex" }}><I.check size={14} /></span>}
              </button>
            );
          })}
          {current && <button onClick={() => { onAssign(null); setOpen(false); }} style={{ width: "100%", textAlign: "left", padding: `${tokens.space[2]}`, border: "none", borderTop: `1px solid ${tokens.color.neutral[100]}`, marginTop: 2, background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: tokens.font.size.xs, color: tokens.color.neutral[500] }}>Retirer l'assignation</button>}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Étape 2 — Rédaction (PV éditable + remarques source, traçabilité)
// ─────────────────────────────────────────────────────────────

const REDACTION_DOC = {
  meta: "Réunion du 30 juin 2026 · 09:00 · sur site — Présents : G. Dupont (architecte), M. Genin (entreprise). Excusé : P. Mertens (MO). Météo : 12°C, couvert.",
  sections: [
    { code: "00", title: "Évolutions depuis le PV précédent", brand: true, paras: [{ text: "La dalle du R+1 a été réceptionnée ; le démarrage des cloisons est confirmé. Trois réserves du précédent procès-verbal ont été levées." }] },
    { code: "03", title: "Électricité", paras: [
      { num: "03.1", text: "Le tirage des câbles dans la gaine technique du 2e étage doit être repris : la section constatée est sous-dimensionnée au regard du cahier des charges." },
      { num: "03.2", text: "Le tableau électrique principal ne comporte pas de dispositif différentiel 30 mA sur le circuit prises du rez-de-chaussée. ", highlight: "Correction requise avant toute mise sous tension." },
      { num: "03.3", text: "L'appareillage du hall principal a été validé sur site, conforme au plan d'exécution révision C." },
    ] },
    { code: "04", title: "HVAC", paras: [
      { num: "04.1", text: "La centrale de traitement d'air est en cours d'installation ; la mise en service reste conditionnée à l'achèvement du lot électrique.", cursor: true },
    ] },
  ],
};
const REDACTION_DEMO_TEXT = `00. Évolutions depuis le PV précédent
La dalle du R+1 a été réceptionnée ; le démarrage des cloisons est confirmé. Trois réserves du précédent procès-verbal ont été levées.

03. Électricité
- Le tirage des câbles dans la gaine technique du 2e étage doit être repris : la section constatée est **sous-dimensionnée** au regard du cahier des charges.
- Le tableau électrique principal ne comporte pas de dispositif différentiel 30 mA sur le circuit prises du rez-de-chaussée. __Correction requise avant toute mise sous tension.__
- L'appareillage du hall principal a été validé sur site, conforme au plan d'exécution révision C.

04. HVAC
La centrale de traitement d'air est en cours d'installation ; la mise en service reste conditionnée à l'achèvement du lot électrique.`;
const REDACTION_SOURCES = [
  { poste: "03 · ÉLECTRICITÉ", items: [
    { text: "Reprendre le tirage des câbles — gaine 2e sous-dimensionnée.", ref: "03.1" },
    { text: "Tableau principal sans différentiel prises rez.", ref: "03.2", urgent: true },
    { text: "Appareillage hall conforme plan rév. C.", ref: "03.3" },
  ] },
  { poste: "04 · HVAC", items: [
    { text: "Centrale de traitement d'air en cours d'installation.", ref: "04.1" },
  ] },
];

function SegToggle({ value, onChange, options, label }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: tokens.space[2] }}>
      {label && <span style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[500] }}>{label}</span>}
      <div style={{ display: "inline-flex", gap: 3, background: tokens.color.neutral[100], borderRadius: tokens.radius.md, padding: 3 }}>
        {options.map(o => {
          const a = o.id === value;
          return <button key={o.id} onClick={() => onChange(o.id)} style={{ padding: "5px 12px", borderRadius: tokens.radius.sm, border: "none", background: a ? tokens.color.neutral[0] : "transparent", boxShadow: a ? tokens.shadow.sm : "none", color: a ? tokens.color.neutral[900] : tokens.color.neutral[500], fontFamily: "inherit", fontSize: tokens.font.size.xs, fontWeight: a ? tokens.font.weight.semibold : tokens.font.weight.medium, cursor: "pointer" }}>{o.label}</button>;
        })}
      </div>
    </div>
  );
}

function DropBtn({ children, icon }) {
  const [hover, setHover] = useState(false);
  return (
    <button onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: "inline-flex", alignItems: "center", gap: tokens.space[2], height: 32, padding: `0 ${tokens.space[3]}`, background: hover ? tokens.color.neutral[50] : tokens.color.neutral[0], border: `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.md, fontFamily: "inherit", fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.medium, color: tokens.color.neutral[700], cursor: "pointer", transition: tokens.transition.base }}>
      {icon}{children}{!icon && <I.chevDown size={13} />}
    </button>
  );
}

function buildRealSources(project) {
  return (project?.posts || [])
    .filter(p => (p.remarks || []).length > 0)
    .map(p => ({
      poste: `${p.id} · ${String(p.label || "").toUpperCase()}`,
      items: (p.remarks || []).map((r, i) => ({ text: r.text, ref: `${p.id}.${i + 1}`, urgent: r.urgent })),
    }));
}

// ── Éditeur riche (WYSIWYG) — gras / italique / souligné / titres / listes
function escapeHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function inlineToHtml(s) {
  return escapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<u>$1</u>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
}
function plainToHtml(text) {
  if (!text) return "";
  if (/<\/?(div|p|ul|ol|li|strong|b|em|i|u|h[1-6]|br|span)\b/i.test(text)) return text; // déjà du HTML
  const lines = String(text).split("\n"); let html = ""; let inList = false;
  const closeList = () => { if (inList) { html += "</ul>"; inList = false; } };
  for (const raw of lines) {
    const t = raw.trim();
    const isSec = /^\d{1,2}[.-]\s/.test(t) && t.length < 90;
    if (t.startsWith("-")) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${inlineToHtml(t.slice(1).trim())}</li>`; continue; }
    closeList();
    if (!t) { html += "<div><br></div>"; continue; }
    if (isSec) { html += `<h3>${inlineToHtml(t)}</h3>`; continue; }
    if (t.startsWith(">")) { html += `<div data-u="1">${inlineToHtml(t.slice(1).trim())}</div>`; continue; }
    html += `<div>${inlineToHtml(t)}</div>`;
  }
  closeList();
  return html;
}

const RICH_TEXT_COLORS = ["#1C1917", "#B85C2C", "#DC2626", "#2563EB", "#16A34A", "#7C3AED"];
const RICH_HL_COLORS = ["#FEF08A", "#BBF7D0", "#BFDBFE", "#FBCFE8", "#FED7AA"];

function RichDocEditor({ value, onChange }) {
  const ref = useRef(null);
  const wrapRef = useRef(null);
  const lastHtml = useRef(null);
  const savedRange = useRef(null);
  const [menu, setMenu] = useState(null); // "fore" | "back" | null
  const [curBlock, setCurBlock] = useState("<p>");
  useEffect(() => {
    const html = plainToHtml(value || "");
    if (ref.current && html !== lastHtml.current) { ref.current.innerHTML = html; lastHtml.current = html; }
  }, [value]);
  useEffect(() => {
    if (!menu) return;
    const h = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setMenu(null); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [menu]);
  // Synchronise le sélecteur "Style" avec le bloc sous le curseur — pour que les
  // titres (y compris ceux générés par l'IA) soient reconnus par l'éditeur.
  useEffect(() => {
    const onSel = () => {
      const sel = window.getSelection();
      if (!sel || !sel.anchorNode || !ref.current || !ref.current.contains(sel.anchorNode)) return;
      let n = sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentNode : sel.anchorNode;
      let tag = "";
      while (n && n !== ref.current) { const tg = n.tagName?.toLowerCase(); if (["h1", "h2", "h3", "h4", "h5", "h6", "p", "div", "li"].includes(tg)) { tag = tg; break; } n = n.parentNode; }
      setCurBlock(/^h[1-3]$/.test(tag) ? `<${tag}>` : "<p>");
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, []);
  const emit = () => { const html = ref.current?.innerHTML || ""; lastHtml.current = html; onChange(html); };
  const exec = (cmd, arg) => { ref.current?.focus(); document.execCommand(cmd, false, arg); emit(); };
  const execCss = (cmd, arg) => { ref.current?.focus(); try { document.execCommand("styleWithCSS", false, true); } catch { /* */ } document.execCommand(cmd, false, arg); try { document.execCommand("styleWithCSS", false, false); } catch { /* */ } emit(); };
  const saveSel = () => { const s = window.getSelection(); savedRange.current = (s && s.rangeCount && ref.current?.contains(s.anchorNode)) ? s.getRangeAt(0).cloneRange() : null; };
  const applyColor = (cmd, color) => { ref.current?.focus(); const s = window.getSelection(); if (savedRange.current) { s.removeAllRanges(); s.addRange(savedRange.current); } execCss(cmd, color); setMenu(null); };
  const TBtn = ({ onClick, label, title }) => (
    <button type="button" title={title} onMouseDown={e => e.preventDefault()} onClick={onClick}
      style={{ minWidth: 30, height: 28, padding: "0 8px", borderRadius: tokens.radius.sm, border: `1px solid ${tokens.color.neutral[200]}`, background: tokens.color.neutral[0], color: tokens.color.neutral[700], cursor: "pointer", fontFamily: "inherit", fontSize: tokens.font.size.sm, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{label}</button>
  );
  const selStyle = { height: 28, borderRadius: tokens.radius.sm, border: `1px solid ${tokens.color.neutral[200]}`, background: tokens.color.neutral[0], color: tokens.color.neutral[700], fontFamily: "inherit", fontSize: tokens.font.size.xs, cursor: "pointer", padding: "0 4px" };
  const Sep = () => <span style={{ width: 1, height: 18, background: tokens.color.neutral[200], margin: `0 ${tokens.space[1]}` }} />;
  const Swatches = ({ colors, withNone, onPick }) => (
    <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 60, display: "flex", alignItems: "center", gap: 4, padding: 6, background: tokens.color.neutral[0], border: `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.md, boxShadow: "0 10px 28px rgba(28,25,23,0.16)" }}>
      {colors.map(c => <button key={c} type="button" onMouseDown={e => e.preventDefault()} onClick={() => onPick(c)} title={c} style={{ width: 22, height: 22, borderRadius: 6, border: `1px solid ${tokens.color.neutral[200]}`, background: c, cursor: "pointer", padding: 0 }} />)}
      {withNone && <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => onPick(null)} title="Aucun" style={{ width: 22, height: 22, borderRadius: 6, border: `1px solid ${tokens.color.neutral[200]}`, background: tokens.color.neutral[0], cursor: "pointer", fontSize: 11, color: tokens.color.neutral[500] }}>∅</button>}
      <span style={{ width: 1, height: 18, background: tokens.color.neutral[200], margin: "0 2px" }} />
      <label title="Couleur personnalisée…" style={{ position: "relative", width: 22, height: 22, borderRadius: 6, border: `1px solid ${tokens.color.neutral[200]}`, cursor: "pointer", overflow: "hidden", background: "conic-gradient(from 0deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#fff", textShadow: "0 0 2px rgba(0,0,0,.6)" }}>+</span>
        <input type="color" defaultValue="#B85C2C" onInput={e => onPick(e.target.value)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", border: "none" }} />
      </label>
    </div>
  );

  return (
    <>
      <style>{`.pv-rich:empty:before{content:"Le PV rédigé apparaît ici — édite librement.";color:${tokens.color.neutral[400]}}
.pv-rich h1{font-size:22px;font-weight:800;color:${tokens.color.neutral[900]};margin:16px 0 8px;letter-spacing:-0.3px}
.pv-rich h2{font-size:18px;font-weight:700;color:${tokens.color.neutral[900]};margin:14px 0 7px}
.pv-rich h3{font-size:15px;font-weight:700;color:${tokens.color.neutral[900]};margin:14px 0 6px}
.pv-rich ul{margin:6px 0 10px;padding-left:20px}.pv-rich li{margin:2px 0;line-height:1.6}
.pv-rich p,.pv-rich div{margin:0 0 6px;line-height:1.65}
.pv-rich [data-u="1"]{color:${tokens.color.semantic.danger.fg}}
.pv-rich u{text-decoration:underline}.pv-rich strong{font-weight:700}`}</style>
      <div ref={wrapRef} style={{ position: "sticky", top: 0, zIndex: 2, display: "flex", alignItems: "center", gap: tokens.space[1], padding: `${tokens.space[2]} 0`, marginBottom: tokens.space[2], borderBottom: `1px solid ${tokens.color.neutral[200]}`, background: tokens.color.neutral[0], flexWrap: "wrap" }}>
        <TBtn onClick={() => exec("bold")} title="Gras (Ctrl+B)" label={<b>B</b>} />
        <TBtn onClick={() => exec("italic")} title="Italique (Ctrl+I)" label={<i style={{ fontFamily: "Georgia, serif" }}>I</i>} />
        <TBtn onClick={() => exec("underline")} title="Souligné (Ctrl+U)" label={<u>U</u>} />
        <Sep />
        <select title="Style de paragraphe" value={curBlock} onChange={e => { setCurBlock(e.target.value); exec("formatBlock", e.target.value); }} style={selStyle}>
          <option value="<p>">Paragraphe</option>
          <option value="<h1>">Titre 1</option>
          <option value="<h2>">Titre 2</option>
          <option value="<h3>">Titre 3</option>
        </select>
        <select title="Taille du texte" defaultValue="" onChange={e => { if (e.target.value) { execCss("fontSize", e.target.value); e.target.value = ""; } }} style={selStyle}>
          <option value="" disabled hidden>Taille</option>
          <option value="2">Petit</option>
          <option value="3">Normal</option>
          <option value="5">Grand</option>
          <option value="6">Très grand</option>
        </select>
        <Sep />
        <div style={{ position: "relative" }}>
          <TBtn onClick={() => { saveSel(); setMenu(menu === "fore" ? null : "fore"); }} title="Couleur du texte" label={<span style={{ fontWeight: 700, borderBottom: `3px solid ${tokens.color.brand[500]}`, lineHeight: 1 }}>A</span>} />
          {menu === "fore" && <Swatches colors={RICH_TEXT_COLORS} onPick={c => applyColor("foreColor", c)} />}
        </div>
        <div style={{ position: "relative" }}>
          <TBtn onClick={() => { saveSel(); setMenu(menu === "back" ? null : "back"); }} title="Surligner" label={<span style={{ background: "#FEF08A", borderRadius: 2, padding: "1px 3px", fontSize: 11 }}>A</span>} />
          {menu === "back" && <Swatches colors={RICH_HL_COLORS} withNone onPick={c => applyColor("hiliteColor", c || "transparent")} />}
        </div>
        <Sep />
        <TBtn onClick={() => exec("insertUnorderedList")} title="Liste à puces" label="• Liste" />
        <TBtn onClick={() => exec("removeFormat")} title="Effacer le formatage" label="Effacer" />
      </div>
      <div ref={ref} className="pv-rich" contentEditable suppressContentEditableWarning onInput={emit} spellCheck={false}
        style={{ flex: 1, minHeight: 280, outline: "none", fontFamily: tokens.font.family, fontSize: tokens.font.size.base, lineHeight: 1.65, color: tokens.color.neutral[700] }} />
    </>
  );
}

// Menu générique de toolbar (préfixe + options {id,label}).
function ToolDrop({ prefix, value, options, onChange, loading }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const cur = (options || []).find(o => o.id === value) || options?.[0];
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} disabled={loading} style={{ display: "inline-flex", alignItems: "center", gap: tokens.space[2], height: 32, padding: `0 ${tokens.space[3]}`, background: open ? tokens.color.neutral[50] : tokens.color.neutral[0], border: `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.md, fontFamily: "inherit", fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.medium, color: tokens.color.neutral[700], cursor: loading ? "wait" : "pointer", whiteSpace: "nowrap" }}>
        {prefix} : <b style={{ fontWeight: tokens.font.weight.semibold }}>{cur?.short || cur?.label}</b> <I.chevDown size={13} />
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 60, minWidth: 210, background: tokens.color.neutral[0], border: `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.lg, boxShadow: "0 12px 32px rgba(28,25,23,0.16)", padding: 4 }}>
          {(options || []).map(o => {
            const sel = o.id === value;
            return (
              <button key={o.id} onClick={() => { setOpen(false); if (o.id !== value) onChange?.(o.id); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: tokens.space[2], padding: `${tokens.space[2]} ${tokens.space[2]}`, border: "none", borderRadius: tokens.radius.md, background: sel ? tokens.color.brand[50] : "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: tokens.font.size.sm, color: tokens.color.neutral[900] }}>{o.label}</span>
                {sel && <span style={{ color: tokens.color.brand[600], display: "inline-flex" }}><I.check size={14} /></span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Menu de filtrage par destinataire (toolbar Rédaction) — "Tous" ou une personne.
function RecipientDrop({ value, options, onChange, loading }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const pick = (v) => { setOpen(false); if (v !== value) onChange?.(v); };
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} disabled={loading} style={{ display: "inline-flex", alignItems: "center", gap: tokens.space[2], height: 32, padding: `0 ${tokens.space[3]}`, background: open ? tokens.color.neutral[50] : tokens.color.neutral[0], border: `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.md, fontFamily: "inherit", fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.medium, color: tokens.color.neutral[700], cursor: loading ? "wait" : "pointer", whiteSpace: "nowrap" }}>
        Destinataire : <b style={{ fontWeight: tokens.font.weight.semibold }}>{value || "tous"}</b> <I.chevDown size={13} />
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 60, minWidth: 200, maxHeight: 280, overflowY: "auto", background: tokens.color.neutral[0], border: `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.lg, boxShadow: "0 12px 32px rgba(28,25,23,0.16)", padding: 4 }}>
          {[null, ...(options || [])].map((opt, i) => {
            const sel = (opt || null) === (value || null);
            return (
              <button key={i} onClick={() => pick(opt)} style={{ width: "100%", display: "flex", alignItems: "center", gap: tokens.space[2], padding: `${tokens.space[2]} ${tokens.space[2]}`, border: "none", borderRadius: tokens.radius.md, background: sel ? tokens.color.brand[50] : "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                {opt ? <span style={{ width: 22, height: 22, borderRadius: tokens.radius.full, background: "#DCFCE7", color: tokens.color.semantic.success.fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: tokens.font.weight.bold, flexShrink: 0 }}>{initials(opt)}</span> : <span style={{ width: 22, height: 22, borderRadius: tokens.radius.full, background: tokens.color.neutral[100], color: tokens.color.neutral[500], display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><I.user size={12} /></span>}
                <span style={{ flex: 1, minWidth: 0, fontSize: tokens.font.size.sm, color: tokens.color.neutral[900], whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{opt || "Tous les destinataires"}</span>
                {sel && <span style={{ color: tokens.color.brand[600], display: "inline-flex" }}><I.check size={14} /></span>}
              </button>
            );
          })}
          <div style={{ padding: `${tokens.space[2]} ${tokens.space[2]} ${tokens.space[1]}`, fontSize: 10, color: tokens.color.neutral[400], lineHeight: 1.4 }}>Filtre les remarques incluses dans le PV (les remarques sans destinataire restent toujours incluses).</div>
        </div>
      )}
    </div>
  );
}

const NUM_OPTS = [
  { id: "post-seq", label: "Par poste (01.1)", short: "par poste" },
  { id: "sequential", label: "Séquentielle (1, 2…)", short: "séquentielle" },
  { id: "global", label: "Globale (continue)", short: "globale" },
  { id: "none", label: "Aucune", short: "aucune" },
];
function RedactionStep({ meta, project, demo, gen, onChange, onRegenerate, profile, today, styleId, onStyleChange, recipFilter, recipOptions, onRecipChange, numMode, onNumChange }) {
  const [previewTab, setPreviewTab] = useState("pdf");
  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const sources = demo ? REDACTION_SOURCES : buildRealSources(project);
  const sourceCount = demo ? (meta.totalRemarks || 12) : sources.reduce((s, g) => s + g.items.length, 0);

  // Génération de l'aperçu PDF réel, debouncée à chaque édition du contenu.
  useEffect(() => {
    if (demo || previewTab !== "pdf" || !gen?.content || gen.loading) return;
    let cancelled = false;
    setPdfLoading(true);
    const id = setTimeout(async () => {
      try {
        const res = await generatePDF(project, meta.num, today, gen.content, profile, { returnDataUrl: true });
        if (!cancelled) setPdfUrl(res.dataUrl);
      } catch { /* aperçu indisponible */ }
      finally { if (!cancelled) setPdfLoading(false); }
    }, 700);
    return () => { cancelled = true; clearTimeout(id); };
  }, [gen?.content, gen?.loading, demo, previewTab, project, meta.num, today, profile]);

  return (
    <>
      {/* Toolbar options */}
      <div style={{ minHeight: 50, flexShrink: 0, background: tokens.color.neutral[0], borderBottom: `1px solid ${tokens.color.neutral[200]}`, display: "flex", alignItems: "center", padding: `${tokens.space[2]} ${tokens.space[6]}`, gap: tokens.space[3], flexWrap: "wrap", position: "relative", zIndex: 5 }}>
        <SegToggle label="Style" value={styleId} onChange={onStyleChange} options={[{ id: "standard", label: "Standard" }, { id: "detailed", label: "Détaillé" }, { id: "concise", label: "Concis" }]} />
        <Divider />
        <ToolDrop prefix="Numérotation" value={numMode} options={NUM_OPTS} onChange={onNumChange} loading={!demo && gen?.loading} />
        <RecipientDrop value={recipFilter} options={recipOptions || []} onChange={onRecipChange} loading={!demo && gen?.loading} />
        <div style={{ marginLeft: "auto" }}><button onClick={!demo ? onRegenerate : undefined} disabled={!demo && gen?.loading} style={{ display: "inline-flex", alignItems: "center", gap: tokens.space[2], height: 32, padding: `0 ${tokens.space[3]}`, background: tokens.color.neutral[0], border: `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.md, fontFamily: "inherit", fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.medium, color: tokens.color.neutral[700], cursor: (!demo && gen?.loading) ? "wait" : "pointer" }}><I.redo size={13} />Régénérer</button></div>
      </div>

      {/* Deux panneaux */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Doc PV éditable */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ margin: `${tokens.space[4]} ${tokens.space[6]} 0`, background: tokens.color.brand[50], border: `1px solid ${tokens.color.brand[100]}`, borderRadius: tokens.radius.lg, padding: `${tokens.space[2]} ${tokens.space[4]}`, display: "flex", alignItems: "center", gap: tokens.space[2] }}>
            <span style={{ color: tokens.color.brand[600], display: "inline-flex" }}><I.spark size={16} /></span>
            <span style={{ fontSize: tokens.font.size.sm, color: tokens.color.brand[700] }}>Rédigé par l'IA à partir de <b>{sourceCount} remarques</b>. Le texte est <b>éditable</b> — clique pour ajuster.</span>
            <span style={{ marginLeft: "auto", fontSize: tokens.font.size.xs, color: tokens.color.semantic.success.fg, display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 6, height: 6, borderRadius: tokens.radius.full, background: tokens.color.semantic.success.fg }} />{demo ? "Enregistré" : gen?.loading ? "Génération…" : gen?.error ? "Erreur" : "Brouillon"}</span>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: `${tokens.space[4]} ${tokens.space[6]}` }}>
            <div style={{ background: tokens.color.neutral[0], border: `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.xl, padding: `${tokens.space[8]} ${tokens.space[10]}`, maxWidth: 720, margin: "0 auto", minHeight: 300, display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.semibold, letterSpacing: "0.08em", textTransform: "uppercase", color: tokens.color.neutral[500], marginBottom: tokens.space[1] }}>Procès-verbal de chantier n°{meta.num}</div>
              <div style={{ fontSize: tokens.font.size.xl, fontWeight: tokens.font.weight.bold, color: tokens.color.neutral[900], letterSpacing: "-0.3px", marginBottom: 3 }}>{project?.name}</div>
              <div style={{ fontSize: tokens.font.size.sm, color: tokens.color.neutral[700], marginBottom: tokens.space[5], paddingBottom: tokens.space[4], borderBottom: `1px solid ${tokens.color.neutral[200]}`, lineHeight: tokens.font.leading.normal }}>{demo ? REDACTION_DOC.meta : `Réunion du ${meta.meetingLabel || "—"} · Présents : ${(project?.participants || []).slice(0, 3).map(p => p.name).join(", ") || "—"}`}</div>

              {demo ? (
                <RichDocEditor value={REDACTION_DEMO_TEXT} onChange={() => {}} />
              ) : gen?.loading ? (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: tokens.space[3], color: tokens.color.neutral[500] }}>
                  <div style={{ width: 28, height: 28, border: `3px solid ${tokens.color.neutral[200]}`, borderTopColor: tokens.color.brand[500], borderRadius: "50%", animation: "pvspin 0.8s linear infinite" }} />
                  <span style={{ fontSize: tokens.font.size.sm }}>L'IA rédige le PV à partir de tes remarques…</span>
                  <style>{`@keyframes pvspin { to { transform: rotate(360deg) } }`}</style>
                </div>
              ) : gen?.error ? (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: tokens.space[3], textAlign: "center" }}>
                  <span style={{ fontSize: tokens.font.size.sm, color: tokens.color.semantic.danger.fg }}>{gen.error}</span>
                  <Button variant="secondary" size="sm" leftIcon={<I.redo size={13} />} onClick={onRegenerate}>Réessayer</Button>
                </div>
              ) : (
                <RichDocEditor value={gen?.content || ""} onChange={onChange} />
              )}
            </div>
          </div>
        </div>

        {/* Panneau droit — bascule Aperçu PDF / Remarques source */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", borderLeft: `1px solid ${tokens.color.neutral[200]}` }}>
          <div style={{ height: 50, flexShrink: 0, display: "flex", alignItems: "center", gap: tokens.space[3], padding: `0 ${tokens.space[4]}`, borderBottom: `1px solid ${tokens.color.neutral[200]}`, background: tokens.color.neutral[0] }}>
            <SegToggle value={previewTab} onChange={setPreviewTab} options={[{ id: "pdf", label: "Aperçu PDF" }, { id: "sources", label: "Remarques source" }]} />
            {previewTab === "pdf" && !demo && <span style={{ marginLeft: "auto", fontSize: tokens.font.size.xs, color: tokens.color.neutral[500] }}>{pdfLoading ? "Mise à jour…" : pdfUrl ? "À jour" : ""}</span>}
            {previewTab === "sources" && <span style={{ marginLeft: "auto", fontSize: tokens.font.size.xs, color: tokens.color.neutral[300] }}>{sourceCount}</span>}
          </div>

          {previewTab === "pdf" ? (
            <div style={{ flex: 1, minHeight: 0, position: "relative", background: tokens.color.neutral[100] }}>
              {demo ? (
                <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: tokens.space[8], color: tokens.color.neutral[500], fontSize: tokens.font.size.sm }}>L'aperçu du PDF réel (en-tête agence, mise en page finale) s'affiche ici dans le flux de génération.</div>
              ) : pdfUrl ? (
                <iframe src={pdfUrl} title="Aperçu du PDF" style={{ width: "100%", height: "100%", border: "none", display: "block" }} />
              ) : (
                <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: tokens.space[2], color: tokens.color.neutral[500], fontSize: tokens.font.size.sm }}>
                  {gen?.content ? <><div style={{ width: 24, height: 24, border: `3px solid ${tokens.color.neutral[200]}`, borderTopColor: tokens.color.brand[500], borderRadius: "50%", animation: "pvspin 0.8s linear infinite" }} /><span>Génération de l'aperçu PDF…</span></> : "L'aperçu apparaîtra dès que le PV est rédigé."}
                </div>
              )}
              {!demo && pdfLoading && pdfUrl && (
                <div style={{ position: "absolute", top: tokens.space[3], right: tokens.space[3], display: "flex", alignItems: "center", gap: 6, background: tokens.color.neutral[0], border: `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.full, padding: "4px 10px", fontSize: tokens.font.size.xs, color: tokens.color.neutral[500], boxShadow: tokens.shadow.sm }}>
                  <div style={{ width: 12, height: 12, border: `2px solid ${tokens.color.neutral[200]}`, borderTopColor: tokens.color.brand[500], borderRadius: "50%", animation: "pvspin 0.8s linear infinite" }} />
                  Mise à jour…
                </div>
              )}
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", background: tokens.color.neutral[0], minHeight: 0 }}>
              <div style={{ flex: 1, overflowY: "auto", padding: tokens.space[3], display: "flex", flexDirection: "column", gap: tokens.space[2] }}>
                {sources.map((grp, gi) => (
                  <div key={gi}>
                    <div style={{ fontSize: 10, fontFamily: "ui-monospace, monospace", color: tokens.color.neutral[500], margin: `${gi > 0 ? tokens.space[2] : 0} 0 ${tokens.space[2]}` }}>{grp.poste}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: tokens.space[2] }}>
                      {grp.items.map((it, ii) => (
                        <div key={ii} style={{ background: tokens.color.neutral[50], border: `1px solid ${tokens.color.neutral[200]}`, borderLeft: it.urgent ? `3px solid ${tokens.color.semantic.danger.fg}` : `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.md, padding: `${tokens.space[2]} ${tokens.space[3]}`, fontSize: tokens.font.size.xs, color: tokens.color.neutral[700], lineHeight: 1.45 }}>
                          {it.text} <span style={{ color: tokens.color.brand[600], fontWeight: tokens.font.weight.medium }}>→ {it.ref}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ padding: tokens.space[3], borderTop: `1px solid ${tokens.color.neutral[200]}`, fontSize: tokens.font.size.xs, color: tokens.color.neutral[500], textAlign: "center", lineHeight: 1.4 }}>
                Chaque ligne du PV renvoie à sa remarque — la traçabilité reste visible.
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Étape 3 — Diffusion (tâches suggérées par l'IA + envoi email)
// ─────────────────────────────────────────────────────────────

const DIFF_TASKS = [
  { id: 1, title: "Reprendre le tirage des câbles — gaine 2e étage", priority: "high", date: "10 juil.", assignee: { ini: "EG", name: "Entreprise Genin" }, quote: "…reprendre le tirage des câbles dans la gaine technique du 2e…" },
  { id: 2, title: "Installer le différentiel 30 mA — tableau rez", urgent: true, priority: "urgent", date: "4 juil.", assignee: { ini: "EC", name: "Elek & Co" }, quote: "…correction requise avant toute mise sous tension." },
];
const DIFF_RECIPIENTS = [
  { ini: "PM", name: "Paul Mertens", email: "p.mertens@nivelles.be", role: "MO", avBg: "#DBEAFE", avFg: tokens.color.semantic.info.fg },
  { ini: "MG", name: "Marc Genin", email: "m.genin@genin-sa.be", role: "Entreprise", avBg: "#DCFCE7", avFg: tokens.color.semantic.success.fg },
];

function DiffusionStep({ meta, project, demo, suggestedTasks, recipients, subject, isChecked, onToggleRecipient, attachPdf, onToggleAttach, onCreateTask, profile, messageHtml }) {
  const [tasks, setTasks] = useState(() => demo
    ? DIFF_TASKS.map(t => ({ id: t.id, title: t.title, priority: t.priority, who: t.assignee?.name || "", due: "", quote: t.quote }))
    : (suggestedTasks || []).map((t, i) => ({ id: `s${i}`, title: t.title || t.description || "Action", priority: t.severity === "major" ? "urgent" : "medium", who: "", due: "", quote: t.description && t.description !== t.title ? t.description : "", raw: t })));
  const people = demo
    ? [{ ini: "GD", name: "Gaëlle D." }, { ini: "MG", name: "M. Genin" }, { ini: "PM", name: "P. Mertens" }]
    : (project?.participants || []).filter(p => p.name && p.name.trim()).map(p => ({ ini: initials(p.name), name: p.name }));

  const updateTask = (id, patch) => setTasks(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t));
  const toTask = (t) => ({ title: t.title, who: t.who, due: t.due, priority: t.priority, raw: t.raw });
  const accept = (t) => { onCreateTask?.(toTask(t)); setTasks(ts => ts.filter(x => x.id !== t.id)); };
  const ignore = (t) => setTasks(ts => ts.filter(x => x.id !== t.id));
  const acceptAll = () => { tasks.forEach(t => onCreateTask?.(toTask(t))); setTasks([]); };

  return (
    <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
      {/* Tâches suggérées */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", borderRight: `1px solid ${tokens.color.neutral[200]}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: tokens.space[2], padding: `${tokens.space[5]} ${tokens.space[6]} ${tokens.space[3]}` }}>
          <span style={{ color: tokens.color.brand[600], display: "inline-flex" }}><I.spark size={18} /></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.bold, color: tokens.color.neutral[900] }}>Tâches suggérées</div>
            <div style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[500] }}>{tasks.length > 0 ? `${tasks.length} action${tasks.length > 1 ? "s" : ""} détectée${tasks.length > 1 ? "s" : ""} dans le PV — valide celles à suivre` : "Aucune action à créer."}</div>
          </div>
          {tasks.length > 0 && <Button variant="secondary" size="sm" onClick={acceptAll} disabled={demo}>Tout accepter</Button>}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: `0 ${tokens.space[6]} ${tokens.space[5]}`, display: "flex", flexDirection: "column", gap: tokens.space[3] }}>
          {tasks.length === 0
            ? <div style={{ padding: tokens.space[8], textAlign: "center", color: tokens.color.neutral[500], fontSize: tokens.font.size.sm }}>L'IA n'a pas détecté de tâche à suivre dans ce PV.</div>
            : tasks.map(t => <DiffTaskCard key={t.id} t={t} people={people} onUpdate={(patch) => updateTask(t.id, patch)} onAccept={() => accept(t)} onIgnore={() => ignore(t)} demo={demo} />)}
        </div>
      </div>

      {/* Envoi */}
      <div style={{ width: 480, flexShrink: 0, display: "flex", flexDirection: "column", background: tokens.color.neutral[0] }}>
        <div style={{ display: "flex", alignItems: "center", gap: tokens.space[2], padding: `${tokens.space[5]} ${tokens.space[5]} ${tokens.space[3]}` }}>
          <span style={{ color: tokens.color.neutral[900], display: "inline-flex" }}><I.mail size={18} /></span>
          <div style={{ fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.bold, color: tokens.color.neutral[900] }}>Envoyer le PV n°{meta.num}</div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: `0 ${tokens.space[5]} ${tokens.space[5]}`, display: "flex", flexDirection: "column", gap: tokens.space[4] }}>
          {/* Destinataires */}
          <div>
            <FieldLabel>Destinataires</FieldLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: tokens.space[2] }}>
              {recipients.length === 0 && <div style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[500], padding: `${tokens.space[1]} 0` }}>Aucun intervenant avec email — ajoute des destinataires.</div>}
              {recipients.map((r, i) => (
                <label key={i} onClick={() => onToggleRecipient?.(i)} style={{ display: "flex", alignItems: "center", gap: tokens.space[2], padding: `${tokens.space[2]} ${tokens.space[2]}`, border: `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.md, cursor: "pointer" }}>
                  <Check on={isChecked(i)} />
                  <span style={{ width: 26, height: 26, borderRadius: tokens.radius.full, background: r.avBg, color: r.avFg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: tokens.font.weight.bold }}>{r.ini}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: tokens.font.size.sm, color: tokens.color.neutral[900], fontWeight: tokens.font.weight.medium }}>{r.name}</div>
                    <div style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[500], overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.email}{r.role ? ` · ${r.role}` : ""}</div>
                  </div>
                </label>
              ))}
              <button style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: tokens.space[1], height: 34, padding: `0 ${tokens.space[2]}`, background: "transparent", border: `1px dashed ${tokens.color.brand[200]}`, borderRadius: tokens.radius.md, fontFamily: "inherit", fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.medium, color: tokens.color.brand[600], cursor: "pointer" }}><I.plus size={13} /> Ajouter un email externe</button>
            </div>
          </div>

          {/* Objet */}
          <div>
            <FieldLabel>Objet</FieldLabel>
            <div style={{ height: 38, border: `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.md, display: "flex", alignItems: "center", padding: `0 ${tokens.space[3]}`, fontSize: tokens.font.size.sm, color: tokens.color.neutral[900], overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{subject}</div>
          </div>

          {/* Joindre PDF */}
          <label onClick={onToggleAttach} style={{ display: "flex", alignItems: "center", gap: tokens.space[3], padding: `${tokens.space[3]} ${tokens.space[3]}`, border: `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.md, background: tokens.color.neutral[50], cursor: "pointer" }}>
            <div style={{ width: 30, height: 30, borderRadius: tokens.radius.md, background: tokens.color.semantic.danger.bg, color: tokens.color.semantic.danger.fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: tokens.font.weight.bold }}>PDF</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: tokens.font.size.sm, color: tokens.color.neutral[900], fontWeight: tokens.font.weight.medium }}>Joindre le PV en PDF</div>
              <div style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[500] }}>En-tête de l'agence</div>
            </div>
            <Toggle on={attachPdf} />
          </label>

          {/* Message — inclut la signature du profil */}
          <div>
            <FieldLabel>Message</FieldLabel>
            <div className="pv-msg" style={{ border: `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.md, padding: tokens.space[3], fontSize: tokens.font.size.sm, color: tokens.color.neutral[700], lineHeight: 1.55 }}
              dangerouslySetInnerHTML={{ __html: messageHtml || `<p>Bonjour,</p><p>Veuillez trouver ci-joint le procès-verbal.</p><p>Cordialement,<br>${profile?.name || "L'architecte"}</p>` }} />
            <style>{`.pv-msg p{margin:0 0 8px}.pv-msg p:last-child{margin-bottom:0}.pv-msg img{max-width:100%}`}</style>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldLabel({ children }) {
  return <div style={{ fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[500], textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: tokens.space[2] }}>{children}</div>;
}

function Check({ on }) {
  return (
    <span style={{ width: 18, height: 18, borderRadius: tokens.radius.sm, flexShrink: 0, color: "#fff", background: on ? tokens.color.brand[500] : tokens.color.neutral[0], border: on ? "none" : `1.5px solid ${tokens.color.neutral[300]}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {on && <I.check size={12} />}
    </span>
  );
}

function Toggle({ on }) {
  return (
    <div style={{ width: 38, height: 22, borderRadius: tokens.radius.full, background: on ? tokens.color.brand[500] : tokens.color.neutral[300], position: "relative", flexShrink: 0, transition: tokens.transition.base }}>
      <span style={{ position: "absolute", top: 2, left: on ? 18 : 2, width: 18, height: 18, borderRadius: tokens.radius.full, background: tokens.color.neutral[0], transition: tokens.transition.base }} />
    </div>
  );
}

const TASK_PRIOS = [{ id: "urgent", label: "Urgent" }, { id: "high", label: "Haute" }, { id: "medium", label: "Normale" }];
function DiffTaskCard({ t, people, onUpdate, onAccept, onIgnore, demo }) {
  const prio = t.priority || "medium";
  const isUrgent = prio === "urgent";
  return (
    <div style={{ background: tokens.color.neutral[0], border: `1px solid ${tokens.color.neutral[200]}`, borderLeft: isUrgent ? `3px solid ${tokens.color.semantic.danger.fg}` : `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.lg, padding: tokens.space[4] }}>
      <div style={{ fontSize: tokens.font.size.base, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[900], marginBottom: tokens.space[3] }}>{t.title}</div>

      {/* Contrôles éditables : importance · échéance · assigné */}
      <div style={{ display: "flex", alignItems: "center", gap: tokens.space[2], flexWrap: "wrap", marginBottom: tokens.space[3] }}>
        <div style={{ display: "inline-flex", gap: 3, background: tokens.color.neutral[100], borderRadius: tokens.radius.md, padding: 3 }}>
          {TASK_PRIOS.map(o => {
            const a = prio === o.id;
            const fg = o.id === "urgent" ? tokens.color.semantic.danger.fg : o.id === "high" ? "#B45309" : tokens.color.neutral[900];
            return <button key={o.id} onClick={() => onUpdate?.({ priority: o.id })} style={{ padding: "4px 10px", borderRadius: tokens.radius.sm, border: "none", background: a ? tokens.color.neutral[0] : "transparent", boxShadow: a ? tokens.shadow.sm : "none", color: a ? fg : tokens.color.neutral[500], fontFamily: "inherit", fontSize: tokens.font.size.xs, fontWeight: a ? tokens.font.weight.semibold : tokens.font.weight.medium, cursor: "pointer" }}>{o.label}</button>;
          })}
        </div>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 28, padding: "0 10px", borderRadius: tokens.radius.md, background: tokens.color.neutral[0], border: `1px solid ${tokens.color.neutral[200]}`, cursor: "pointer", color: t.due ? tokens.color.neutral[700] : tokens.color.neutral[500] }}>
          <I.cal size={12} />
          <input type="date" value={t.due || ""} onChange={e => onUpdate?.({ due: e.target.value })} style={{ border: "none", outline: "none", background: "transparent", fontFamily: "inherit", fontSize: tokens.font.size.xs, color: "inherit", cursor: "pointer", width: t.due ? 104 : 88 }} />
        </label>
        <AssigneeControl variant="pill" people={people} current={t.who || null} onAssign={(name) => onUpdate?.({ who: name })} />
      </div>

      {t.quote && <div style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[500], background: tokens.color.neutral[50], borderLeft: `2px solid ${tokens.color.neutral[200]}`, padding: `${tokens.space[1]} ${tokens.space[3]}`, borderRadius: "0 6px 6px 0", marginBottom: tokens.space[3] }}>« {t.quote} »</div>}
      <div style={{ display: "flex", gap: tokens.space[2] }}>
        <Button variant="primary" size="sm" onClick={onAccept} disabled={demo}>Créer la tâche</Button>
        <Button variant="secondary" size="sm" onClick={onIgnore}>Ignorer</Button>
      </div>
    </div>
  );
}

function MetaChip({ children, danger }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 26, padding: "0 10px", borderRadius: tokens.radius.md, background: danger ? tokens.color.semantic.danger.bg : tokens.color.neutral[100], border: `1px solid ${danger ? tokens.color.semantic.danger.border : tokens.color.neutral[200]}`, fontSize: tokens.font.size.xs, color: danger ? tokens.color.semantic.danger.fg : tokens.color.neutral[700] }}>{children}</span>
  );
}

// ─────────────────────────────────────────────────────────────
// Widget « Importer des notes » — fichier déposé / texte collé → IA range
// ─────────────────────────────────────────────────────────────

function fmtBytes(s) {
  if (!s) return "—";
  if (s < 1024) return `${s} o`;
  if (s < 1048576) return `${Math.round(s / 1024)} Ko`;
  return `${(s / 1048576).toFixed(1)} Mo`;
}

function ImportNotesModal({ demo, project, onClose, onApply, onDone }) {
  const [tab, setTab] = useState("file");
  const [file, setFile] = useState(null); // { name, size, text, lines }
  const [paste, setPaste] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [err, setErr] = useState("");
  const inputRef = useRef(null);

  const readFile = (f) => {
    setErr("");
    if (!f) return;
    if (f.size > 12 * 1024 * 1024) { setErr("Fichier trop volumineux (max 12 Mo)."); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target.result || "");
      setFile({ name: f.name, size: f.size, text, lines: text.split(/\r?\n/).filter(l => l.trim()).length });
    };
    reader.onerror = () => setErr("Lecture du fichier impossible.");
    reader.readAsText(f);
  };

  const dispatchText = async () => {
    const text = tab === "file" ? (file?.text || "") : paste;
    if (!text.trim()) { setErr("Aucun texte à répartir."); return; }
    if (demo) { onDone(); return; }
    const posts = (project.posts || []).map(po => ({ id: po.id, label: po.label }));
    if (!posts.length) { setErr("Aucun poste défini sur ce projet."); return; }
    setErr(""); setDispatching(true);
    try {
      const { data, error } = await supabase.functions.invoke("dispatch-remarks", { body: { transcript: text, posts } });
      if (error) throw new Error(error.message || "Erreur serveur");
      if (data?.error) throw new Error(data.error);
      const items = Array.isArray(data?.items) ? data.items : [];
      const norm = (id) => String(id).replace(/^0+/, "") || "0";
      const postIds = posts.map(p => p.id);
      const findPost = (raw) => { const s = String(raw); if (postIds.includes(s)) return s; return postIds.find(pid => norm(pid) === norm(s)) || postIds[0] || null; };
      const grouped = {};
      for (const it of items) { const rid = findPost(it.postId); if (!rid) continue; (grouped[rid] = grouped[rid] || []).push({ id: Date.now() + Math.random(), text: it.text, urgent: !!it.urgent, status: "open" }); }
      onApply(grouped);
      onDone();
    } catch (e) { setErr(e.message || "Erreur"); setDispatching(false); }
  };

  const canSubmit = (tab === "file" ? !!file?.text?.trim() : !!paste.trim()) && !dispatching;
  const ext = (file?.name || "").split(".").pop()?.toUpperCase().slice(0, 3) || "TXT";

  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(28,25,23,0.32)", display: "flex", alignItems: "center", justifyContent: "center", padding: tokens.space[5] }}>
      <div onMouseDown={e => e.stopPropagation()} style={{ width: 560, maxWidth: "100%", background: tokens.color.neutral[0], borderRadius: tokens.radius.xl, boxShadow: "0 24px 60px rgba(28,25,23,0.28)", overflow: "hidden", fontFamily: tokens.font.family }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: tokens.space[3], padding: `${tokens.space[5]} ${tokens.space[5]} ${tokens.space[4]}` }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: tokens.color.brand[50], color: tokens.color.brand[600], display: "flex", alignItems: "center", justifyContent: "center" }}><I.upload size={20} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.bold, color: tokens.color.neutral[900], letterSpacing: "-0.2px" }}>Importer des notes</div>
            <div style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[500] }}>L'IA les répartira en remarques par poste</div>
          </div>
          <button onClick={onClose} aria-label="Fermer" style={{ width: 32, height: 32, borderRadius: tokens.radius.md, border: "none", background: "transparent", color: tokens.color.neutral[500], cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><I.close size={17} /></button>
        </div>

        {/* Toggle fichier / coller */}
        <div style={{ padding: `0 ${tokens.space[5]} ${tokens.space[3]}` }}>
          <SegToggle value={tab} onChange={setTab} options={[{ id: "file", label: "Déposer un fichier" }, { id: "paste", label: "Coller du texte" }]} />
        </div>

        {/* Zone */}
        <div style={{ padding: `0 ${tokens.space[5]}` }}>
          {tab === "file" ? (
            file ? (
              <div style={{ display: "flex", alignItems: "center", gap: tokens.space[3], background: tokens.color.neutral[0], border: `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.md, padding: tokens.space[3] }}>
                <div style={{ width: 32, height: 32, borderRadius: tokens.radius.md, background: tokens.color.neutral[100], color: tokens.color.neutral[500], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: tokens.font.weight.bold }}>{ext}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.medium, color: tokens.color.neutral[900], whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{file.name}</div>
                  <div style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[500] }}>{fmtBytes(file.size)} · {file.lines} ligne{file.lines > 1 ? "s" : ""} détectée{file.lines > 1 ? "s" : ""}</div>
                </div>
                <span style={{ color: tokens.color.semantic.success.fg, display: "inline-flex" }}><I.check size={18} /></span>
                <button onClick={() => setFile(null)} aria-label="Retirer" style={{ width: 28, height: 28, border: "none", background: "transparent", color: tokens.color.neutral[400], cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><I.close size={14} /></button>
              </div>
            ) : (
              <div
                onClick={() => inputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); readFile(e.dataTransfer.files?.[0]); }}
                style={{ border: `2px dashed ${dragOver ? tokens.color.brand[400] : tokens.color.brand[200]}`, borderRadius: tokens.radius.lg, background: dragOver ? tokens.color.brand[50] : tokens.color.neutral[50], padding: `${tokens.space[8]} ${tokens.space[5]}`, textAlign: "center", cursor: "pointer", transition: tokens.transition.base }}
              >
                <div style={{ width: 48, height: 48, borderRadius: 13, background: tokens.color.brand[100], color: tokens.color.brand[700], display: "flex", alignItems: "center", justifyContent: "center", margin: `0 auto ${tokens.space[3]}` }}><I.upload size={24} /></div>
                <div style={{ fontSize: tokens.font.size.base, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[900], marginBottom: 4 }}>Glisse un fichier ici, ou <span style={{ color: tokens.color.brand[600], textDecoration: "underline" }}>parcours</span></div>
                <div style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[500] }}>.txt, .md ou transcription · max 12 Mo</div>
                <input ref={inputRef} type="file" accept=".txt,.md,text/plain,text/markdown" style={{ display: "none" }} onChange={e => readFile(e.target.files?.[0])} />
              </div>
            )
          ) : (
            <textarea
              value={paste}
              onChange={e => setPaste(e.target.value)}
              autoFocus
              placeholder={"Colle tes notes ici…\n- Peinture rdc 1ère couche OK\n- Tableau élec sans différentiel — URGENT\n- Étanchéité angle N-E à reprendre"}
              style={{ width: "100%", boxSizing: "border-box", minHeight: 150, padding: tokens.space[3], border: `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.md, fontFamily: tokens.font.family, fontSize: tokens.font.size.sm, lineHeight: 1.5, color: tokens.color.neutral[900], outline: "none", resize: "vertical" }}
            />
          )}
        </div>

        {/* Hint IA */}
        <div style={{ padding: `${tokens.space[3]} ${tokens.space[5]} 0` }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: tokens.space[2], background: tokens.color.brand[50], border: `1px solid ${tokens.color.brand[100]}`, borderRadius: tokens.radius.md, padding: tokens.space[3] }}>
            <span style={{ color: tokens.color.brand[600], flexShrink: 0, marginTop: 1, display: "inline-flex" }}><I.spark size={15} /></span>
            <span style={{ fontSize: tokens.font.size.xs, color: tokens.color.brand[700], lineHeight: 1.5 }}>L'IA détectera les remarques, les rangera par poste et proposera un statut. Tu valides tout sur l'écran de saisie avant génération.</span>
          </div>
          {err && <div style={{ fontSize: tokens.font.size.xs, color: tokens.color.semantic.danger.fg, marginTop: tokens.space[2] }}>{err}</div>}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", gap: tokens.space[2], padding: `${tokens.space[4]} ${tokens.space[5]} ${tokens.space[5]}`, justifyContent: "flex-end" }}>
          <Button variant="secondary" size="lg" onClick={onClose}>Annuler</Button>
          <Button variant="primary" size="lg" leftIcon={<I.spark size={15} />} onClick={dispatchText} disabled={!canSubmit}>{dispatching ? "Répartition…" : "Répartir en remarques"}</Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sélecteur de photo — galerie du projet ou fichier local
// ─────────────────────────────────────────────────────────────

function PhotoPickerSheet({ project, demo, onClose, onPick }) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);
  const gallery = project?.gallery || [];

  const onLocal = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = String(e.target.result || "");
      if (demo) { onPick({ dataUrl }); return; }
      setUploading(true);
      try { const res = await uploadPhoto(dataUrl); onPick(res?.url ? { url: res.url, storagePath: res.storagePath } : { dataUrl }); }
      catch { onPick({ dataUrl }); }
      finally { setUploading(false); }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(28,25,23,0.32)", display: "flex", alignItems: "center", justifyContent: "center", padding: tokens.space[5] }}>
      <div onMouseDown={e => e.stopPropagation()} style={{ width: 560, maxWidth: "100%", maxHeight: "80vh", background: tokens.color.neutral[0], borderRadius: tokens.radius.xl, boxShadow: "0 24px 60px rgba(28,25,23,0.28)", overflow: "hidden", fontFamily: tokens.font.family, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: tokens.space[3], padding: `${tokens.space[5]} ${tokens.space[5]} ${tokens.space[3]}` }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: tokens.color.brand[50], color: tokens.color.brand[600], display: "flex", alignItems: "center", justifyContent: "center" }}><I.image size={20} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.bold, color: tokens.color.neutral[900] }}>Joindre une photo</div>
            <div style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[500] }}>Depuis la galerie du projet ou ton appareil</div>
          </div>
          <button onClick={onClose} aria-label="Fermer" style={{ width: 32, height: 32, borderRadius: tokens.radius.md, border: "none", background: "transparent", color: tokens.color.neutral[500], cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><I.close size={17} /></button>
        </div>

        <div style={{ padding: `0 ${tokens.space[5]} ${tokens.space[3]}` }}>
          <button onClick={() => inputRef.current?.click()} disabled={uploading} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: tokens.space[2], height: 44, border: `1.5px dashed ${tokens.color.brand[200]}`, borderRadius: tokens.radius.lg, background: tokens.color.brand[50], color: tokens.color.brand[600], fontFamily: "inherit", fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.semibold, cursor: uploading ? "wait" : "pointer" }}>
            <I.upload size={16} /> {uploading ? "Envoi…" : "Prendre / choisir une photo (appareil)"}
          </button>
          <input ref={inputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => onLocal(e.target.files?.[0])} />
        </div>

        <div style={{ padding: `0 ${tokens.space[5]} ${tokens.space[2]}`, fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[500], textTransform: "uppercase", letterSpacing: "0.05em" }}>Galerie du projet · {gallery.length}</div>
        <div style={{ flex: 1, overflowY: "auto", padding: `0 ${tokens.space[5]} ${tokens.space[5]}` }}>
          {gallery.length === 0 ? (
            <div style={{ padding: tokens.space[6], textAlign: "center", color: tokens.color.neutral[500], fontSize: tokens.font.size.sm }}>Aucune photo dans la galerie du projet.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: tokens.space[2] }}>
              {gallery.map((ph, i) => {
                const src = getPhotoUrl(ph);
                return (
                  <button key={ph.id ?? i} onClick={() => onPick({ url: src, id: ph.id, caption: ph.caption })} style={{ aspectRatio: "1 / 1", borderRadius: tokens.radius.md, overflow: "hidden", border: `1px solid ${tokens.color.neutral[200]}`, background: tokens.color.neutral[100], cursor: "pointer", padding: 0 }}>
                    {src ? <img src={src} alt={ph.caption || ""} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <span style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", color: tokens.color.neutral[400], fontSize: 10 }}>{ph.caption || "photo"}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PvComposer;
