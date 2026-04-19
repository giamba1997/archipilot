import { useState, useEffect, useRef } from "react";
import { useT } from "../i18n";
import { supabase } from "../supabase";
import { AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, RD, GR, SP, FS, RAD, DIS, DIST, OR, REDBG } from "../constants/tokens";
import { PV_STATUSES, getPvStatus, nextPvStatus } from "../constants/statuses";
import { Ico, PB, PvStatusBadge } from "../components/ui";
import { generatePDF } from "../utils/pdf";
import { track, loadPvSends, getPhotoUrl } from "../db";
import { SendPvModal } from "../components/modals/SendPvModal";
import { parseNotesToRemarks } from "../utils/helpers";
import { formatAddress } from "../utils/address";
import { PV_TEMPLATES } from "../constants/templates";

export function ResultView({ project, setProjects, onBack, onBackHome, onOpenPlans, profile, pvRecipients, pvTitle, pvFieldData }) {
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [sec, setSec] = useState(0);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [pdfErr, setPdfErr] = useState("");
  const [showSendModal, setShowSendModal] = useState(false);
  const [savedPvNum, setSavedPvNum] = useState(null);
  const timer = useRef(null);
  const ctrl = useRef(null);
  const pvNum = savedPvNum || project.pvHistory.length + 1;
  const t = useT();

  useEffect(() => { run(); return () => { clearInterval(timer.current); ctrl.current?.abort(); }; }, []);

  const run = async () => {
    setLoading(true);
    setErr("");
    setSec(0);
    timer.current = setInterval(() => setSec((s) => s + 1), 1000);
    ctrl.current = new AbortController();
    const allRemarks  = (p) => (p.remarks || []).length > 0 ? p.remarks : (p.notes?.trim() ? parseNotesToRemarks(p.notes) : []);
    const toRemarks   = (p) => {
      const all = allRemarks(p);
      if (!pvRecipients || pvRecipients.length === 0) return all;
      // keep remarks with no recipients (= common) OR assigned to any chosen recipient
      return all.filter((r) => !(r.recipients || []).length || pvRecipients.some(rec => (r.recipients || []).includes(rec)));
    };
    let globalRemarkIdx = 0;
    const numMode = project.remarkNumbering || "none";
    const notes = project.posts
      .filter((p) => toRemarks(p).length > 0 || (p.photos || []).length > 0 || (project.planMarkers || []).some((m) => m.postId === p.id))
      .map((p) => {
        const remarks = toRemarks(p);
        let postRemarkIdx = 0;
        const byStatus = (id) => remarks.filter((r) => r.status === id);
        const fmtLine  = (r) => {
          globalRemarkIdx++; postRemarkIdx++;
          const prefix = r.urgent ? "> " : "- ";
          const num = numMode === "sequential" ? `${postRemarkIdx}. ` : numMode === "post-seq" ? `${p.id}.${postRemarkIdx} ` : numMode === "global" ? `${globalRemarkIdx}. ` : "";
          return prefix + num + r.text;
        };
        const sections = [];
        if (byStatus("open").length)     sections.push(t("result.toProcess") + "\n" + byStatus("open").map(fmtLine).join("\n"));
        if (byStatus("progress").length) sections.push("En cours :\n" + byStatus("progress").map(fmtLine).join("\n"));
        if (byStatus("done").length)     sections.push(t("result.resolved") + "\n" + byStatus("done").map(fmtLine).join("\n"));
        const postMarkers = (project.planMarkers || []).filter((m) => m.postId === p.id);
        const extra = [
          (p.photos || []).length > 0 ? `[${p.photos.length} photo(s) jointe(s)]` : "",
          postMarkers.length > 0 ? `[Plan : marqueur${postMarkers.length > 1 ? "s" : ""} n°${postMarkers.map((m) => m.number).join(", ")}]` : "",
        ].filter(Boolean).join(" ");
        return `${p.id}. ${p.label}\n${sections.join("\n")}${extra ? "\n" + extra : ""}`;
      })
      .join("\n\n");
    const pvTpl = PV_TEMPLATES.find(t => t.id === project.pvTemplate);
    const SYS = pvTpl?.prompt || t("ai.systemPrompt");
    const recipientCtx = pvRecipients && pvRecipients.length > 0 ? "\n" + t("ai.recipientFilter", { recipients: pvRecipients.join(", ") }) : "";
    const userPrompt = `PROJET: ${project.name}\nCLIENT: ${project.client}\nENTREPRISE: ${project.contractor}\nADRESSE: ${formatAddress(project)}${(project.customFields || []).filter(cf => cf.label && cf.value).map(cf => `\n${cf.label.toUpperCase()}: ${cf.value}`).join("")}\nPV N${pvNum} — ${date}${pvFieldData?.visitStart ? `\nVISITE: ${pvFieldData.visitStart}${pvFieldData.visitEnd ? ` → ${pvFieldData.visitEnd}` : ""}` : ""}${pvFieldData?.attendance ? `\nPRÉSENTS: ${pvFieldData.attendance.filter(a => a.present).map(a => `${a.name} (${a.role})`).join(", ")}` : ""}${pvFieldData?.attendance?.some(a => !a.present) ? `\nABSENTS: ${pvFieldData.attendance.filter(a => !a.present).map(a => `${a.name} (${a.role})`).join(", ")}` : ""}${recipientCtx}\n\nNOTES:\n${notes}\n\nTransforme en PV.`;
    try {
      const { data, error } = await supabase.functions.invoke("generate-pv", {
        body: { systemPrompt: SYS, userPrompt, maxTokens: pvTpl?.id === "detailed" ? 3000 : 2000 },
      });
      if (error) throw new Error(error.message || "Erreur serveur");
      if (data?.error) throw new Error(data.error);
      const txt = data?.content;
      if (txt) setResult(txt); else throw new Error(t("result.emptyResponse"));
    } catch (e) { setErr(e.name === "AbortError" ? t("result.cancelled") : e.message); }
    finally { setLoading(false); clearInterval(timer.current); }
  };

  const date = new Date().toLocaleDateString("fr-BE");
  const parts = project.participants.map((p) => `  ${p.role.padEnd(14)} ${p.name}`).join("\n");
  const displayTitle = pvTitle || `PV n°${pvNum}`;
  const presentList = pvFieldData?.attendance ? pvFieldData.attendance.filter(a => a.present).map(p => `  ${p.role.padEnd(14)} ${p.name}`).join("\n") : parts;
  const absentList = pvFieldData?.attendance?.filter(a => !a.present) || [];
  const visitInfo = pvFieldData?.visitStart ? `\nVisite : ${pvFieldData.visitStart}${pvFieldData.visitEnd ? ` → ${pvFieldData.visitEnd}` : ""}` : "";
  const full = result ? `${displayTitle.toUpperCase()}\nde la REUNION du ${date}${visitInfo}\n\nMaitre d'ouvrage : ${project.client}\nChantier : ${project.name}\n${project.desc}\n\nPrésents :\n${presentList}${absentList.length > 0 ? `\n\nAbsents :\n${absentList.map(p => `  ${p.role.padEnd(14)} ${p.name}`).join("\n")}` : ""}\n\n${"=".repeat(50)}\n\n${result}\n\n${"=".repeat(50)}\nArchitecte, ${project.bureau}` : "";
  const filledCount = project.posts.filter((p) => {
    const remarks = (p.remarks || []).length > 0 ? p.remarks : (p.notes?.trim() ? parseNotesToRemarks(p.notes) : []);
    return remarks.length > 0 || (p.photos || []).length > 0 || (project.planMarkers || []).some((m) => m.postId === p.id);
  }).length;

  const savePV = () => {
    // Snapshot input notes (remarks per post)
    const inputNotes = project.posts.map(po => ({
      id: po.id, label: po.label,
      remarks: (po.remarks || []).map(r => ({ text: r.text, urgent: r.urgent, status: r.status })),
      notes: po.notes || "",
    })).filter(po => po.remarks.length > 0 || po.notes.trim());

    setSavedPvNum(pvNum);
    track("pv_generated", { pv_number: pvNum, project_name: project.name, _page: "result" });
    setProjects((prev) => prev.map((p) => p.id === project.id ? {
      ...p,
      pvHistory: [{ number: pvNum, date, author: profile.name || "Architecte", postsCount: filledCount, excerpt: result.slice(0, 100) + "...", content: result, inputNotes, status: "draft" }, ...p.pvHistory],
      // Carry forward open/progress remarks; remove done ones
      posts: p.posts.map((po) => ({
        ...po,
        notes: "",
        remarks: (po.remarks || [])
          .filter((r) => r.status !== "done")
          .map((r) => ({ ...r, carriedFrom: pvNum })),
      })),
    } : p));
    setSaved(true);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: "8px", minWidth: 40, minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 }}><Ico name="back" color={TX2} /></button>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: TX, letterSpacing: "-0.2px" }}>{pvTitle || `PV n°${pvNum}`}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 3, padding: "2px 7px", background: ACL, border: `1px solid ${ACL2}`, borderRadius: 5 }}>
              <span style={{ fontSize: 9, color: AC }}>✦</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: AC, letterSpacing: "0.04em" }}>IA</span>
            </div>
          </div>
          {pvRecipients && pvRecipients.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
              <Ico name="users" size={11} color={AC} />
              <span style={{ fontSize: 11, color: AC, fontWeight: 600 }}>Pour {pvRecipients.join(", ")}</span>
              <span style={{ fontSize: 11, color: TX3 }}>— version filtrée</span>
            </div>
          )}
        </div>
      </div>
      {loading && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "52px 20px 40px", textAlign: "center" }}>
          {/* Icône IA animée */}
          <div style={{ width: 52, height: 52, borderRadius: 14, background: ACL, border: `1px solid ${ACL2}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18, position: "relative" }}>
            <span style={{ fontSize: 22, color: AC }}>✦</span>
            <div style={{ position: "absolute", inset: -3, borderRadius: 17, border: `2px solid ${AC}`, opacity: 0.2, animation: "ring 1.8s ease infinite" }} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: TX, marginBottom: 4, letterSpacing: "-0.2px" }}>{t("result.generating")}</div>
          <div style={{ fontSize: FS.md, color: TX3, marginBottom: SP.lg }}>{t("result.generatingDesc")}</div>
          {/* Barre de progression estimée */}
          <div style={{ width: "100%", maxWidth: 300, height: 4, background: SB2, borderRadius: 2, marginBottom: SP.xl, overflow: "hidden" }}>
            <div style={{ height: "100%", background: AC, borderRadius: 2, transition: "width 1s ease-out", width: sec < 2 ? "15%" : sec < 4 ? "45%" : sec < 8 ? "70%" : sec < 15 ? "85%" : "92%" }} />
          </div>
          {/* Étapes progressives */}
          <div style={{ width: "100%", maxWidth: 300, textAlign: "left", marginBottom: 28 }}>
            {[
              { label: t("result.stepAnalysis"), delay: 0 },
              { label: t("result.stepDetection"), delay: 2 },
              { label: t("result.stepFormatting"), delay: 4 },
            ].map((step, i) => {
              const done = sec > step.delay;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: done ? AC : SB2, border: `1px solid ${done ? AC : SBB}`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.4s" }}>
                    {done ? <Ico name="check" size={10} color="#fff" /> : <div style={{ width: 5, height: 5, borderRadius: "50%", background: SBB }} />}
                  </div>
                  <span style={{ fontSize: 12, color: done ? TX2 : TX3, fontWeight: done ? 500 : 400, transition: "color 0.4s" }}>{step.label}</span>
                  {i === 2 && !done && <div style={{ width: 12, height: 12, border: `2px solid ${SBB}`, borderTopColor: AC, borderRadius: "50%", animation: "sp .7s linear infinite", flexShrink: 0 }} />}
                </div>
              );
            })}
          </div>
          <button onClick={() => ctrl.current?.abort()} style={{ padding: "7px 18px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, color: TX3, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>{t("cancel")}</button>
        </div>
      )}
      {err && (
        <div>
          <div style={{ padding: 14, background: REDBG, borderRadius: 10, color: RD, fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
            <strong>{t("result.error")}</strong> {err}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onBack} style={{ flex: 1, padding: "10px 20px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: TX2 }}>Retour</button>
            <button onClick={run} style={{ flex: 1, padding: "10px 20px", border: "none", borderRadius: 8, background: AC, cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: "#fff", fontWeight: 600 }}>{t("retry")}</button>
          </div>
        </div>
      )}
      {result && (() => {
        const lines = result.split("\n").filter(l => l.trim());
        const actionLines  = lines.filter(l => l.trim().startsWith("> ")).length;
        const pointLines   = lines.filter(l => l.trim().startsWith("- ")).length;
        const sectionCount = lines.filter(l => /^\d+\./.test(l.trim())).length;
        return (
        <div>
          {/* ── Bandeau IA ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: ACL, border: `1px solid ${ACL2}`, borderRadius: 10, marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", background: AC, borderRadius: 6, flexShrink: 0 }}>
                <span style={{ fontSize: 10, color: "#fff" }}>✦</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", letterSpacing: "0.02em" }}>IA</span>
              </div>
              <span style={{ fontSize: FS.base, color: TX2 }}>Rédigé par <strong>gpt-4o</strong> en {sec}s</span>
              <span style={{ fontSize: FS.sm, color: TX3 }}>· {result.trim().split(/\s+/).length} mots</span>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {sectionCount > 0 && <span style={{ fontSize: FS.sm, color: TX2 }}><strong>{sectionCount}</strong> poste{sectionCount > 1 ? "s" : ""}</span>}
              {actionLines > 0  && <span style={{ fontSize: 11, color: RD,  fontWeight: 600 }}><strong>{actionLines}</strong> point{actionLines > 1 ? "s" : ""} urgent{actionLines > 1 ? "s" : ""}</span>}
              {pointLines > 0   && <span style={{ fontSize: 11, color: TX2 }}><strong>{pointLines}</strong> décision{pointLines > 1 ? "s" : ""}</span>}
              {!saved && <span style={{ fontSize: 11, color: TX3, fontStyle: "italic" }}>Non sauvegardé</span>}
              {saved  && <span style={{ fontSize: 11, color: GR,  fontWeight: 600 }}>✓ Sauvegardé</span>}
            </div>
          </div>

          {/* ── Corps du PV ── */}
          <div style={{ position: "relative" }}>
            <textarea
              value={result}
              onChange={(e) => setResult(e.target.value)}
              style={{ width: "100%", padding: 16, border: `1px solid ${SBB}`, borderRadius: 10, background: WH, fontSize: 13, fontFamily: "monospace", lineHeight: 1.8, color: TX, boxSizing: "border-box", resize: "vertical", minHeight: 300, outline: "none" }}
            />
            <div style={{ position: "absolute", top: 10, right: 12, fontSize: 10, color: TX3, background: WH, padding: "2px 6px", borderRadius: 4, border: `1px solid ${SBB}`, pointerEvents: "none" }}>modifiable</div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button onClick={onBack} style={{ flex: 1, padding: 12, border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: TX2 }}>{t("result.editNotes")}</button>
            <button onClick={() => { navigator.clipboard.writeText(full); setCopied(true); setTimeout(() => setCopied(false), 2000); }} style={{ flex: 1, padding: 12, border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: TX2, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
              <Ico name="copy" size={14} color={TX3} />{copied ? t("copied") : t("copy")}
            </button>
            <button onClick={savePV} disabled={saved} style={{ flex: 1, padding: 12, border: "none", borderRadius: 8, background: saved ? GR : AC, cursor: saved ? "default" : "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
              <Ico name={saved ? "check" : "save"} size={14} color="#fff" />{saved ? t("result.saved") : t("result.saveValidate")}
            </button>
          </div>
          <button
            onClick={async () => {
              setPdfGenerating(true);
              setPdfErr("");
              try {
                await generatePDF(project, pvNum, date, result, profile);
              } catch (e) {
                setPdfErr("Erreur PDF : " + (e.message || "inconnue"));
              }
              setPdfGenerating(false);
            }}
            disabled={pdfGenerating}
            style={{ width: "100%", marginTop: 8, padding: 13, border: "none", borderRadius: 8, background: pdfGenerating ? SB2 : TX, color: pdfGenerating ? TX3 : "#fff", fontSize: 13, fontWeight: 600, cursor: pdfGenerating ? "default" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
          >
            {pdfGenerating
              ? <><div style={{ width: 14, height: 14, border: `2px solid ${TX3}`, borderTopColor: AC, borderRadius: "50%", animation: "sp .7s linear infinite" }} />Préparation du plan…</>
              : <><Ico name="file" size={15} color="#fff" />{(project.planMarkers || []).length > 0 ? t("result.downloadPDFPlan") : t("result.downloadPDF")}</>
            }
          </button>
          {pdfErr && <div style={{ marginTop: 6, padding: 10, background: REDBG, borderRadius: 8, color: RD, fontSize: 12 }}>{pdfErr}</div>}

          {/* Send by email button */}
          {saved && (
            <button
              onClick={() => setShowSendModal(true)}
              style={{ width: "100%", marginTop: 8, padding: 13, border: `1px solid ${AC}`, borderRadius: 8, background: WH, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit", color: AC, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
            >
              <Ico name="send" size={15} color={AC} />Envoyer par email
            </button>
          )}

          {saved && <button onClick={onBackHome} style={{ width: "100%", marginTop: 8, padding: 12, border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: TX2 }}>Retour au projet</button>}

          {/* Send PV Modal */}
          {showSendModal && (
            <SendPvModal
              project={project}
              pvNumber={pvNum}
              pvDate={date}
              pvContent={result}
              profile={profile}
              onUpgrade={() => { setShowSendModal(false); onOpenPlans?.(); }}
              onClose={() => setShowSendModal(false)}
              onSent={(to) => {
                // Update PV status to "sent"
                setProjects(prev => prev.map(p => p.id === project.id ? {
                  ...p,
                  pvHistory: p.pvHistory.map(pv => String(pv.number) === String(pvNum) ? { ...pv, status: "sent" } : pv),
                } : p));
              }}
            />
          )}
          {project.posts.some((p) => (p.photos || []).length > 0) && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: TX, marginBottom: 12 }}>Photos jointes</div>
              {project.posts.filter((p) => (p.photos || []).length > 0).map((post) => (
                <div key={post.id} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: TX2, marginBottom: 8 }}>{post.id}. {post.label}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {(post.photos || []).map((ph) => (
                      <img key={ph.id} src={getPhotoUrl(ph)} alt="" style={{ width: 120, height: 90, objectFit: "cover", borderRadius: 8, border: `1px solid ${SBB}` }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        );
      })()}
    </div>
  );
}
