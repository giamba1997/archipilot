import { useState, useRef, useEffect } from "react";
import { AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, RD, GR, SP, FS, RAD, DIS, DIST, REDBG, REDBRD, GRBG, BG } from "../constants/tokens";
import { RESERVE_STATUSES, RESERVE_SEVERITIES, getReserveStatus, getReserveSeverity, nextReserveStatus } from "../constants/statuses";
import { Ico, MobileConsultationBanner } from "../components/ui";
import { useIsMobile } from "../hooks/useIsMobile";
import { uploadPhoto, getPhotoUrl, loadOprSignatureRequests, requestOprSignatures, loadReserveTemplates, saveReserveTemplate, incrementReserveTemplateUsage } from "../db";
import { MAX_UPLOAD_PHOTO_BYTES } from "../constants/config";
import { SignOprModal, SendOprModal, RequestSignaturesModal } from "../components/modals";
import { generateOprPdf } from "../utils/pdf";

// ── OPR View ─────────────────────────────────────────────────

export function OprView({ project, setProjects, profile, showToast, onBack }) {
  const isMobile = useIsMobile();
  const [mode, setMode] = useState("list"); // "list" | "add" | "edit"
  const [editingId, setEditingId] = useState(null);
  const [detailReserve, setDetailReserve] = useState(null); // mobile : détail réserve (lecture)
  const [filter, setFilter] = useState("all"); // "all" | "non_levee" | "partiellement_levee" | "levee"
  const [filterContractor, setFilterContractor] = useState("all");
  const [signOpen, setSignOpen] = useState(false);
  const [sendOprOpen, setSendOprOpen] = useState(null); // opr object to send, or null
  const [requestSigOpen, setRequestSigOpen] = useState(false);
  const [signatureRequests, setSignatureRequests] = useState([]);
  const [relaunchingId, setRelaunchingId] = useState(null); // id du sigreq en cours de relance
  const [reserveTemplates, setReserveTemplates] = useState([]); // F8 — bibliothèque
  const photoRef = useRef(null);

  // Chargement de la bibliothèque de modèles (F8). Lazy : seulement quand
  // l'OPR view est ouverte, jamais sur d'autres écrans. Si l'archi n'a
  // aucun modèle (ni perso, ni org, ni système), l'autocomplete reste
  // simplement masqué — zéro intrusion.
  useEffect(() => {
    loadReserveTemplates().then(setReserveTemplates).catch(() => setReserveTemplates([]));
  }, []);

  // Renvoie un nouveau lien de signature pour un signataire ayant refusé / expiré.
  // Crée un nouveau sigreq frais (token, expiration) sans toucher à l'ancien
  // pour préserver la traçabilité du refus.
  const relaunchSignature = async (opr, sigreq) => {
    if (relaunchingId) return;
    setRelaunchingId(sigreq.id);
    try {
      // Génère un PDF preview pour pièce jointe (même version que l'envoi initial)
      let pdfBase64 = null;
      let pdfFileName = null;
      try {
        await import("jspdf");
        const res = await generateOprPdf(project, opr, profile, { returnDataUrl: true });
        if (res?.dataUrl) {
          pdfBase64 = res.dataUrl.split(",")[1];
          pdfFileName = res.fileName;
        }
      } catch (e) {
        console.error("PDF generation for relaunch failed:", e);
        // Non bloquant — on envoie sans pièce jointe
      }
      const result = await requestOprSignatures({
        projectId: project.id,
        projectName: project.name,
        opr: {
          id: opr.id,
          number: opr.number,
          date: opr.date,
          type: opr.type || "provisoire",
          reserves: opr.reserves || [],
          reservesHash: opr.reservesHash || "",
        },
        signatories: [{
          name: sigreq.signatory_name,
          role: sigreq.signatory_role || "",
          email: sigreq.signatory_email,
        }],
        pdfBase64,
        pdfFileName,
        authorName: profile?.name || profile?.email || "L'architecte",
        structureName: profile?.structure,
        customMessage: "",
      });
      if (result.error) {
        showToast?.(`Erreur : ${result.error}`, "error");
      } else {
        // Le sigreq peut être créé en DB mais l'email Resend peut échouer.
        // delivery[].sent indique le résultat réel par destinataire.
        const failed = (result.delivery || []).filter(d => !d.sent);
        if (failed.length > 0) {
          showToast?.(`Lien créé mais email non envoyé : ${failed[0].error || "erreur Resend"}`, "error");
        } else {
          showToast?.(`Nouveau lien envoyé à ${sigreq.signatory_email}`);
        }
        await refreshSignatureRequests();
      }
    } catch (e) {
      console.error("relaunchSignature error:", e);
      showToast?.("Échec de l'envoi", "error");
    } finally {
      setRelaunchingId(null);
    }
  };

  const reserves = project.reserves || [];
  const oprHistory = project.oprHistory || [];

  // Charge les demandes de signature à distance pour ce projet
  const refreshSignatureRequests = async () => {
    if (!project?.id) return;
    const rows = await loadOprSignatureRequests(project.id);
    setSignatureRequests(rows);
  };
  useEffect(() => { refreshSignatureRequests(); /* eslint-disable-next-line */ }, [project?.id]);

  // Index des demandes par opr_id pour affichage rapide
  const sigByOpr = {};
  for (const r of signatureRequests) {
    if (!sigByOpr[r.opr_id]) sigByOpr[r.opr_id] = [];
    sigByOpr[r.opr_id].push(r);
  }

  // Stats
  const total = reserves.length;
  const levees = reserves.filter(r => r.status === "levee").length;
  const partielles = reserves.filter(r => r.status === "partiellement_levee").length;
  const nonLevees = reserves.filter(r => r.status === "non_levee").length;
  const critiques = reserves.filter(r => r.severity === "critical" && r.status !== "levee").length;
  const pctLevees = total > 0 ? Math.round((levees / total) * 100) : 0;

  // Contractors from reserves + participants
  const contractors = [...new Set([
    ...reserves.map(r => r.contractor).filter(Boolean),
    ...(project.participants || []).filter(p => p.role !== "Architecte").map(p => p.name),
  ])];

  // Filtered reserves
  const filtered = reserves.filter(r => {
    if (filter !== "all" && r.status !== filter) return false;
    if (filterContractor !== "all" && r.contractor !== filterContractor) return false;
    return true;
  });

  // Per-contractor stats
  const contractorStats = contractors.map(c => {
    const cReserves = reserves.filter(r => r.contractor === c);
    const cLevees = cReserves.filter(r => r.status === "levee").length;
    return { name: c, total: cReserves.length, levees: cLevees, pct: cReserves.length > 0 ? Math.round((cLevees / cReserves.length) * 100) : 0 };
  }).filter(c => c.total > 0).sort((a, b) => a.pct - b.pct);

  const updateReserves = (newReserves) => {
    setProjects(prev => prev.map(p => p.id === project.id ? { ...p, reserves: newReserves } : p));
  };

  const toggleStatus = (reserveId) => {
    const target = reserves.find(r => r.id === reserveId);
    if (!target) return;
    const next = nextReserveStatus(target.status);
    updateReserves(reserves.map(r => r.id !== reserveId
      ? r
      : { ...r, status: next, resolvedAt: next === "levee" ? new Date().toISOString() : null }
    ));
    // Feedback : confirme le nouveau statut pour éviter l'incertitude sur
    // l'effet d'un clic (l'archi avance souvent en série sur 20 réserves).
    const label = next === "levee" ? "Réserve levée" : next === "partiellement_levee" ? "Réserve en cours" : "Réserve réouverte";
    showToast?.(`${target.code || "Réserve"} — ${label}`);
  };

  const deleteReserve = (reserveId) => {
    const target = reserves.find(r => r.id === reserveId);
    if (!confirm("Supprimer cette réserve ?")) return;
    updateReserves(reserves.filter(r => r.id !== reserveId));
    showToast?.(`${target?.code || "Réserve"} supprimée`);
  };

  // ── Add / Edit form ──
  if (mode === "add" || mode === "edit") {
    const existing = mode === "edit" ? reserves.find(r => r.id === editingId) : null;
    return (
      <ReserveForm
        reserve={existing}
        contractors={contractors}
        nextCode={`R-${String(reserves.length + 1).padStart(3, "0")}`}
        templates={reserveTemplates}
        onTemplateAdded={(newTpl) => setReserveTemplates(prev => [newTpl, ...prev])}
        onSave={(reserve) => {
          if (mode === "edit") {
            updateReserves(reserves.map(r => r.id === reserve.id ? reserve : r));
            showToast?.(`${reserve.code || "Réserve"} mise à jour`);
          } else {
            updateReserves([...reserves, reserve]);
            showToast?.(`${reserve.code || "Réserve"} ajoutée`);
          }
          // Fire-and-forget : si la réserve provient d'un modèle, on incrémente
          // son compteur d'usage pour le faire remonter dans l'autocomplete.
          if (reserve._templateId) incrementReserveTemplateUsage(reserve._templateId);
          setMode("list");
          setEditingId(null);
        }}
        onCancel={() => { setMode("list"); setEditingId(null); }}
        showToast={showToast}
      />
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", animation: "fadeIn 0.2s ease" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onBack} style={{ background: SB, border: `1px solid ${SBB}`, cursor: "pointer", padding: 7, minWidth: 36, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 }}>
            <Ico name="back" color={TX2} size={16} />
          </button>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: TX }}>Réserves OPR</div>
            <div style={{ fontSize: 12, color: TX3 }}>{project.name} — Opérations préalables à réception</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={async () => {
              try {
                await generateOprPdf(project, { number: oprHistory.length + 1, date: new Date().toLocaleDateString("fr-BE"), reserves }, profile);
              } catch (err) {
                console.error("OPR PDF error:", err);
                showToast?.(`Erreur PDF : ${err?.message || err}`, "error");
              }
            }}
            disabled={reserves.length === 0}
            title="Télécharger un PDF non signé (relecture / impression)"
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", border: `1px solid ${SBB}`, borderRadius: 10, background: WH, color: reserves.length === 0 ? DIST : TX2, fontSize: 13, fontWeight: 600, cursor: reserves.length === 0 ? "not-allowed" : "pointer", fontFamily: "inherit" }}
          >
            <Ico name="file" size={13} color={reserves.length === 0 ? DIST : TX2} /> PDF
          </button>
          {!isMobile && (
            <button
              onClick={() => setSignOpen(true)}
              disabled={reserves.length === 0}
              title="Signer sur place lors de la réception (canvas tactile)"
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", border: `1px solid ${SBB}`, borderRadius: 10, background: WH, color: reserves.length === 0 ? DIST : TX2, fontSize: 13, fontWeight: 600, cursor: reserves.length === 0 ? "not-allowed" : "pointer", fontFamily: "inherit" }}
            >
              <Ico name="edit" size={13} color={reserves.length === 0 ? DIST : TX2} /> Signer sur place
            </button>
          )}
          {!isMobile && (
            <button
              onClick={() => setRequestSigOpen(true)}
              disabled={reserves.length === 0}
              title="Envoyer un lien de signature par email à chaque participant"
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", border: `1px solid ${SBB}`, borderRadius: 10, background: WH, color: reserves.length === 0 ? DIST : TX2, fontSize: 13, fontWeight: 600, cursor: reserves.length === 0 ? "not-allowed" : "pointer", fontFamily: "inherit" }}
            >
              <Ico name="send" size={13} color={reserves.length === 0 ? DIST : TX2} /> Envoyer pour signature
            </button>
          )}
          {!isMobile && (
            <button
              onClick={() => setMode("add")}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", border: "none", borderRadius: 10, background: AC, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
            >
              <Ico name="plus" size={14} color="#fff" /> Nouvelle réserve
            </button>
          )}
        </div>
      </div>

      {isMobile && <MobileConsultationBanner hint="création de réserves via la capture rapide ou depuis l'ordinateur." />}

      {/* KPI Dashboard */}
      {total > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 16 }}>
          <KpiBox label="Total" value={total} color={TX} />
          <KpiBox label="Non levées" value={nonLevees} color={RD} />
          <KpiBox label="En cours" value={partielles} color="#D97706" />
          <KpiBox label="Levées" value={levees} color={GR} />
          {critiques > 0 && <KpiBox label="Critiques" value={critiques} color={RD} accent />}
        </div>
      )}

      {/* Global progress */}
      {total > 0 && (
        <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 12, padding: "14px 18px", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: TX }}>Progression globale</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: pctLevees === 100 ? GR : AC }}>{pctLevees}%</span>
          </div>
          <div style={{ height: 8, background: SB, borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pctLevees}%`, background: pctLevees === 100 ? GR : AC, borderRadius: 4, transition: "width 0.4s" }} />
          </div>
          {pctLevees === 100 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, padding: "8px 12px", background: GRBG, borderRadius: 8, fontSize: 13, color: GR, fontWeight: 600 }}>
              <Ico name="check" size={14} color={GR} />
              Toutes les réserves sont levées — vous pouvez procéder à la réception.
            </div>
          )}
        </div>
      )}

      {/* Historique OPR — signés sur place ou demandes en cours */}
      {oprHistory.length > 0 && (
        <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 12, padding: "14px 18px", marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 10 }}>
            Historique OPR ({oprHistory.length})
          </div>
          {oprHistory.map((opr, i) => {
            const requests = sigByOpr[opr.id] || [];
            const inSigning = !!opr.signingRequest;
            const localSignatures = (opr.signatures || []).length;
            const remoteSigned = requests.filter(r => r.status === "signed").length;
            const remoteDeclined = requests.filter(r => r.status === "declined").length;
            const remoteTotal = requests.length;
            const totalSignatures = localSignatures + remoteSigned;
            // OPR "prêt à diffuser" = au moins une demande à distance, et toutes signées (pas de declined / pending)
            const allRemoteSigned = remoteTotal > 0 && remoteSigned === remoteTotal;
            const isCompleted = !!opr.completed;
            const readyToDispatch = allRemoteSigned && !isCompleted;
            // Construit la version "merged" de l'OPR avec toutes les signatures pour PDF/diffusion
            const mergedSignatures = [
              ...(opr.signatures || []),
              ...requests.filter(r => r.status === "signed").map(r => ({
                name: r.signatory_name, role: r.signatory_role, email: r.signatory_email,
                dataUrl: r.signature_data_url, signedAt: r.signed_at,
              })),
            ];
            const oprForDispatch = { ...opr, signatures: mergedSignatures };
            const remoteRecipients = requests.map(r => ({ name: r.signatory_name, role: r.signatory_role, email: r.signatory_email }));
            return (
              <div key={opr.id || i} style={{ padding: "10px 0", borderTop: i > 0 ? `1px solid ${SB}` : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: totalSignatures > 0 ? GRBG : SB, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Ico name={totalSignatures > 0 ? "check" : "edit"} size={14} color={totalSignatures > 0 ? GR : TX3} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: TX, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span>OPR n°{opr.number}</span>
                      <span style={{ fontSize: 11, color: TX3, fontWeight: 500 }}>· {opr.type === "definitive" ? "Définitive" : "Provisoire"} · {opr.date}</span>
                      {readyToDispatch && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: GR, background: GRBG, padding: "2px 8px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.05em", display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <Ico name="check" size={9} color={GR} /> Prêt à diffuser
                        </span>
                      )}
                      {isCompleted && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: TX2, background: SB, padding: "2px 8px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          Diffusé
                        </span>
                      )}
                      {remoteDeclined > 0 && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: RD, background: REDBG, padding: "2px 8px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          {remoteDeclined} refus
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: TX3 }}>
                      {totalSignatures > 0 && `${totalSignatures} signature${totalSignatures > 1 ? "s" : ""}${remoteTotal > 0 ? ` (${remoteSigned}/${remoteTotal} à distance)` : ""}`}
                      {totalSignatures === 0 && inSigning && `Demandes envoyées — en attente${remoteTotal > 0 ? ` (0/${remoteTotal})` : ""}`}
                      {(opr.reserves || []).length > 0 && ` · ${(opr.reserves || []).length} réserve${(opr.reserves || []).length > 1 ? "s" : ""} figée${(opr.reserves || []).length > 1 ? "s" : ""}`}
                    </div>
                  </div>
                  <button onClick={() => generateOprPdf(project, oprForDispatch, profile)}
                    title="Télécharger le PDF (avec signatures actuelles)"
                    style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600, color: TX2, fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Ico name="file" size={11} color={TX2} /> PDF
                  </button>
                  <button onClick={() => setSendOprOpen({ opr: oprForDispatch, extraRecipients: remoteRecipients })}
                    title={readyToDispatch ? "Diffuser le rapport final consolidé" : "Envoyer le PDF aux destinataires"}
                    style={{ background: readyToDispatch ? GR : AC, border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 11, fontWeight: 700, color: WH, fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Ico name="send" size={11} color={WH} />
                    {readyToDispatch ? "Diffuser le rapport final" : (opr.sentAt ? "Renvoyer" : "Diffuser")}
                  </button>
                </div>

                {/* Détail des demandes de signature à distance pour cet OPR */}
                {requests.length > 0 && (
                  <div style={{ marginTop: 8, marginLeft: 42, display: "flex", flexDirection: "column", gap: 4 }}>
                    {requests.map(r => {
                      const isExpired = r.expires_at && new Date(r.expires_at) < new Date() && r.status === "pending";
                      const stColor = r.status === "signed" ? GR
                        : r.status === "declined" ? RD
                        : isExpired ? RD
                        : "#D97706";
                      const stLabel = r.status === "signed" ? "Signé"
                        : r.status === "declined" ? "Refusé"
                        : isExpired ? "Expiré"
                        : "En attente";
                      // Bouton "Relancer" disponible si refus/expiration — recrée un sigreq frais avec un nouveau lien
                      const canRelaunch = r.status === "declined" || isExpired;
                      const relaunchKey = `relaunch-${r.id}`;
                      const isRelaunching = relaunchingId === r.id;
                      return (
                        <div key={r.id} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "4px 0" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: stColor, flexShrink: 0 }} />
                            <span style={{ color: TX, fontWeight: 500 }}>{r.signatory_name}</span>
                            {r.signatory_role && <span style={{ color: TX3 }}>· {r.signatory_role}</span>}
                            <span style={{ color: TX3 }}>· {r.signatory_email}</span>
                            <span style={{ marginLeft: "auto", color: stColor, fontWeight: 600 }}>{stLabel}</span>
                            {r.signed_at && <span style={{ color: TX3 }}>— {new Date(r.signed_at).toLocaleDateString("fr-BE")}</span>}
                            {canRelaunch && (
                              <button
                                key={relaunchKey}
                                onClick={() => relaunchSignature(opr, r)}
                                disabled={isRelaunching}
                                title="Renvoyer un nouveau lien de signature à cette personne"
                                style={{ padding: "3px 8px", border: `1px solid ${SBB}`, borderRadius: 6, background: WH, color: isRelaunching ? TX3 : AC, fontSize: 10, fontWeight: 600, cursor: isRelaunching ? "wait" : "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4 }}>
                                <Ico name="send" size={9} color={isRelaunching ? TX3 : AC} />
                                {isRelaunching ? "Envoi..." : "Relancer"}
                              </button>
                            )}
                          </div>
                          {/* Motif de refus affiché sous la ligne quand declined */}
                          {r.status === "declined" && r.decline_reason && (
                            <div style={{ marginLeft: 14, padding: "6px 10px", background: REDBG, borderLeft: `2px solid ${RD}`, borderRadius: 4, fontSize: 11, color: TX2, fontStyle: "italic" }}>
                              « {r.decline_reason} »
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${SB}`, display: "flex", justifyContent: "flex-end" }}>
            <button onClick={refreshSignatureRequests}
              style={{ background: "none", border: "none", padding: "4px 8px", cursor: "pointer", fontSize: 11, color: TX3, fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Ico name="history" size={10} color={TX3} /> Actualiser
            </button>
          </div>
        </div>
      )}

      {/* Per-contractor breakdown — desktop only (densité mobile) */}
      {!isMobile && contractorStats.length > 0 && (
        <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 12, padding: "14px 18px", marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 10 }}>Par entreprise</div>
          {contractorStats.map((c, i) => (
            <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderTop: i > 0 ? `1px solid ${SB}` : "none" }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: SB, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Ico name="users" size={13} color={TX3} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: TX }}>{c.name}</div>
                <div style={{ height: 4, background: SB, borderRadius: 2, marginTop: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${c.pct}%`, background: c.pct === 100 ? GR : AC, borderRadius: 2, transition: "width 0.3s" }} />
                </div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: c.pct === 100 ? GR : TX2, flexShrink: 0 }}>{c.levees}/{c.total}</span>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      {total > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {[{ id: "all", label: "Toutes" }, ...RESERVE_STATUSES].map(s => (
            <button key={s.id} onClick={() => setFilter(s.id)}
              style={{ padding: "5px 12px", border: `1px solid ${filter === s.id ? AC : SBB}`, borderRadius: 20, background: filter === s.id ? ACL : WH, color: filter === s.id ? AC : TX2, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              {s.label} {s.id !== "all" && `(${reserves.filter(r => r.status === s.id).length})`}
            </button>
          ))}
          {!isMobile && contractors.length > 1 && (
            <select value={filterContractor} onChange={e => setFilterContractor(e.target.value)}
              style={{ padding: "5px 10px", border: `1px solid ${SBB}`, borderRadius: 20, background: WH, color: TX2, fontSize: 11, fontFamily: "inherit", cursor: "pointer" }}>
              <option value="all">Toutes les entreprises</option>
              {contractors.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>
      )}

      {/* Reserve list */}
      {total === 0 ? (
        <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 12, padding: "40px 20px", textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: SB, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <Ico name="check" size={24} color={TX3} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: TX, marginBottom: 6 }}>Aucune réserve</div>
          <div style={{ fontSize: 13, color: TX3, marginBottom: 16 }}>Commencez par ajouter les réserves constatées lors de la visite OPR.</div>
          <button onClick={() => setMode("add")}
            style={{ padding: "10px 20px", border: "none", borderRadius: 10, background: AC, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Ajouter une réserve
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(r => {
            const st = getReserveStatus(r.status);
            const sev = getReserveSeverity(r.severity);
            return (
              <div key={r.id} onClick={isMobile ? () => setDetailReserve(r) : undefined} style={{ background: WH, border: `1px solid ${r.severity === "critical" && r.status !== "levee" ? REDBRD : SBB}`, borderRadius: 12, overflow: "hidden", cursor: isMobile ? "pointer" : "default" }}>
                <div style={{ display: "flex", alignItems: "stretch" }}>
                  {/* Left accent */}
                  <div style={{ width: 4, background: st.color, flexShrink: 0 }} />

                  <div style={{ flex: 1, padding: "12px 14px", minWidth: 0 }}>
                    {/* Top row: code + severity + status */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: TX, fontFamily: "monospace" }}>{r.code}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: sev.color, background: sev.bg, padding: "2px 8px", borderRadius: 4 }}>{sev.label}</span>
                      {isMobile ? (
                        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, color: st.color, background: st.bg, padding: "2px 8px", borderRadius: 4 }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: st.dot }} />
                          {st.label}
                        </span>
                      ) : (
                        <button onClick={() => toggleStatus(r.id)} title="Cliquez pour changer le statut"
                          style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, color: st.color, background: st.bg, padding: "2px 8px", borderRadius: 4, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: st.dot }} />
                          {st.label}
                        </button>
                      )}
                      {!isMobile && (
                        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                          <button onClick={() => { setEditingId(r.id); setMode("edit"); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                            <Ico name="edit" size={13} color={TX3} />
                          </button>
                          <button onClick={() => deleteReserve(r.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                            <Ico name="x" size={13} color={TX3} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Description */}
                    <div style={{ fontSize: 13, color: TX, lineHeight: 1.5, marginBottom: 6 }}>{r.description}</div>

                    {/* Meta row */}
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11, color: TX3 }}>
                      {r.contractor && (
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <Ico name="users" size={11} color={TX3} /> {r.contractor}
                        </span>
                      )}
                      {r.location && (
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <Ico name="building" size={11} color={TX3} /> {r.location}
                        </span>
                      )}
                      {r.deadline && (
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <Ico name="calendar" size={11} color={TX3} /> {r.deadline}
                        </span>
                      )}
                      {(() => {
                        const directN = (r.photos || []).length;
                        const linkedN = (project.gallery || []).filter(g => (g.linkedReserves || []).includes(r.id)).length;
                        const total = directN + linkedN;
                        if (total === 0) return null;
                        return (
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }} title={linkedN > 0 ? `${directN} directe${directN > 1 ? "s" : ""} + ${linkedN} liée${linkedN > 1 ? "s" : ""} depuis la galerie` : undefined}>
                            <Ico name="camera" size={11} color={TX3} /> {total} photo{total > 1 ? "s" : ""}{linkedN > 0 ? ` (dont ${linkedN} liée${linkedN > 1 ? "s" : ""})` : ""}
                          </span>
                        );
                      })()}
                    </div>

                    {/* Photos directes (uploadées dans la réserve) + photos
                        liées depuis la galerie (gallery[i].linkedReserves
                        contient r.id). On marque les "liées" avec un petit
                        coin coloré en haut-droite. Pas de duplication —
                        c'est l'OprView qui reconstruit le set à l'affichage. */}
                    {(() => {
                      const direct = (r.photos || []).map(url => ({ url, source: "reserve" }));
                      const linked = (project.gallery || [])
                        .filter(g => (g.linkedReserves || []).includes(r.id))
                        .map(g => ({ url: g.url || g.dataUrl, source: "gallery", photoId: g.id }));
                      const all = [...direct, ...linked];
                      if (all.length === 0) return null;
                      return (
                        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                          {all.slice(0, 6).map((p, i) => (
                            <div key={i} style={{ position: "relative", width: 48, height: 48 }}>
                              <img src={p.url} style={{ width: 48, height: 48, borderRadius: 6, objectFit: "cover", border: `1px solid ${SBB}`, display: "block" }} />
                              {p.source === "gallery" && (
                                <div title="Liée depuis la galerie" style={{ position: "absolute", top: -3, right: -3, width: 14, height: 14, borderRadius: "50%", background: AC, border: `2px solid ${WH}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                  <Ico name="image" size={7} color="#fff" />
                                </div>
                              )}
                            </div>
                          ))}
                          {all.length > 6 && (
                            <div style={{ width: 48, height: 48, borderRadius: 6, background: SB, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: TX3 }}>+{all.length - 6}</div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ padding: 20, textAlign: "center", fontSize: 13, color: TX3 }}>Aucune réserve ne correspond aux filtres.</div>
          )}
        </div>
      )}

      {/* Modal d'envoi des demandes de signature à distance */}
      {requestSigOpen && (
        <RequestSignaturesModal
          project={project}
          setProjects={setProjects}
          profile={profile}
          onClose={() => setRequestSigOpen(false)}
          onSent={() => { refreshSignatureRequests(); }}
        />
      )}

      {/* Modal signature OPR */}
      {signOpen && (
        <SignOprModal
          open={signOpen}
          onClose={() => setSignOpen(false)}
          project={project}
          setProjects={setProjects}
          profile={profile}
          showToast={showToast}
          onComplete={(opr) => {
            // Une fois signé, on propose immédiatement l'envoi par email.
            setTimeout(() => setSendOprOpen(opr), 250);
          }}
        />
      )}

      {/* Modal envoi OPR */}
      {sendOprOpen && (
        <SendOprModal
          project={project}
          opr={sendOprOpen.opr}
          extraRecipients={sendOprOpen.extraRecipients || []}
          profile={profile}
          onClose={() => setSendOprOpen(null)}
          onSent={(emails) => {
            // Si tous les sigreqs distants sont signés au moment de la diffusion,
            // on considère l'OPR comme finalisé (badge "Diffusé").
            const targetOprId = sendOprOpen.opr.id;
            const reqs = sigByOpr[targetOprId] || [];
            const allRemoteSigned = reqs.length > 0 && reqs.every(r => r.status === "signed");
            setProjects(prev => prev.map(p => p.id !== project.id ? p : {
              ...p,
              oprHistory: (p.oprHistory || []).map(o => o.id === targetOprId ? {
                ...o,
                sentAt: new Date().toISOString(),
                sentTo: [...new Set([...(o.sentTo || []), ...emails])],
                completed: o.completed || allRemoteSigned,
                completedAt: o.completedAt || (allRemoteSigned ? new Date().toISOString() : null),
              } : o),
            }));
            showToast?.(allRemoteSigned
              ? `OPR n°${sendOprOpen.opr.number} diffusé à ${emails.length} destinataire${emails.length > 1 ? "s" : ""}`
              : `OPR envoyé à ${emails.length} destinataire${emails.length > 1 ? "s" : ""}`,
            );
            setSendOprOpen(null);
          }}
        />
      )}
      {detailReserve && <ReserveDetailSheet reserve={detailReserve} onClose={() => setDetailReserve(null)} />}
    </div>
  );
}

// ── Détail réserve (mobile, lecture seule) ──
function ReserveDetailSheet({ reserve, onClose }) {
  const sev = getReserveSeverity(reserve.severity);
  const st = getReserveStatus(reserve.status);
  const photos = reserve.photos || [];
  const fmt = (iso) => { if (!iso) return ""; const d = new Date(iso); return isNaN(d) ? String(iso) : d.toLocaleDateString("fr-BE", { day: "numeric", month: "long", year: "numeric" }); };
  const metaRow = (icon, label, value) => value ? (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px" }}>
      <Ico name={icon} size={16} color={TX3} />
      <span style={{ flex: 1, fontSize: 13, color: TX3 }}>{label}</span>
      <span style={{ fontSize: 13, color: TX, fontWeight: 500, textAlign: "right" }}>{value}</span>
    </div>
  ) : null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: BG, overflowY: "auto", fontFamily: "inherit", animation: "fadeIn 0.2s ease" }}>
      {/* Nav */}
      <div style={{ display: "flex", alignItems: "center", padding: "calc(8px + env(safe-area-inset-top, 0px)) 8px 14px" }}>
        <button onClick={onClose} aria-label="Retour" style={{ width: 40, height: 40, minWidth: 40, minHeight: 40, flexShrink: 0, borderRadius: "50%", background: WH, border: `1px solid #EFEDEB`, display: "flex", alignItems: "center", justifyContent: "center", color: TX2, cursor: "pointer" }}><Ico name="back" size={18} color={TX2} /></button>
      </div>
      {/* Titre */}
      <div style={{ padding: "0 8px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontFamily: "ui-monospace, monospace", color: TX3 }}>{reserve.code}</span>
          <span style={{ fontSize: 11, padding: "2px 9px", borderRadius: 999, background: sev.bg, color: sev.color, border: `1px solid ${sev.color}33`, fontWeight: 600 }}>{sev.label}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, padding: "2px 9px", borderRadius: 999, background: st.bg, color: st.color, fontWeight: 500 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: st.dot }} />{st.label}</span>
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: TX, letterSpacing: "-0.3px", lineHeight: 1.25 }}>{reserve.description || "Réserve"}</div>
      </div>
      {/* Photos */}
      {photos.length > 0 && (
        <div style={{ padding: "0 8px 18px", display: "flex", gap: 8, flexWrap: "wrap" }}>
          {photos.map((p, i) => <img key={i} src={getPhotoUrl(p)} alt="" style={{ flex: "1 1 45%", maxWidth: "48%", height: 120, objectFit: "cover", borderRadius: 12, border: `1px solid ${SBB}` }} />)}
        </div>
      )}
      {/* Méta */}
      {(reserve.location || reserve.contractor || reserve.deadline) && (
        <div style={{ margin: "0 8px 18px", background: WH, border: `1px solid #EFEDEB`, borderRadius: 14, overflow: "hidden" }}>
          {metaRow("mappin", "Localisation", reserve.location)}
          {reserve.location && (reserve.contractor || reserve.deadline) && <div style={{ height: 1, background: "#F5F2EF", margin: "0 14px" }} />}
          {metaRow("users", "Responsable", reserve.contractor)}
          {reserve.contractor && reserve.deadline && <div style={{ height: 1, background: "#F5F2EF", margin: "0 14px" }} />}
          {metaRow("calendar", "Échéance", fmt(reserve.deadline))}
        </div>
      )}
      {/* Description */}
      {reserve.description && (
        <div style={{ padding: "0 8px 8px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Description</div>
          <div style={{ fontSize: 14, color: TX2, lineHeight: 1.55 }}>{reserve.description}</div>
        </div>
      )}
      {/* Suivi */}
      <div style={{ padding: "18px 8px 10px" }}><div style={{ fontSize: 12, fontWeight: 700, color: TX3, textTransform: "uppercase", letterSpacing: "0.05em" }}>Suivi</div></div>
      <div style={{ padding: "0 8px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 11 }}>
          <div style={{ width: 8, height: 8, borderRadius: 999, background: AC, marginTop: 5, flexShrink: 0 }} />
          <div><div style={{ fontSize: 13, color: TX }}>Créée{reserve.createdAt ? ` le ${fmt(reserve.createdAt)}` : ""}</div></div>
        </div>
        {reserve.status === "levee" && (
          <div style={{ display: "flex", gap: 11 }}>
            <div style={{ width: 8, height: 8, borderRadius: 999, background: GR, marginTop: 5, flexShrink: 0 }} />
            <div><div style={{ fontSize: 13, color: TX }}>Levée{reserve.resolvedAt ? ` le ${fmt(reserve.resolvedAt)}` : ""}</div></div>
          </div>
        )}
      </div>
      {/* Note lecture seule */}
      <div style={{ margin: "18px 8px 32px", display: "flex", alignItems: "center", gap: 9, background: "#F7F5F3", borderRadius: 11, padding: "11px 13px" }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={TX3} strokeWidth="1.7" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></svg>
        <span style={{ fontSize: 12, color: TX3, lineHeight: 1.45 }}>Marquer comme levée : pendant une visite, ou sur ordinateur.</span>
      </div>
    </div>
  );
}

// ── KPI Box ──
function KpiBox({ label, value, color, accent }) {
  return (
    <div style={{ background: accent ? REDBG : WH, border: `1px solid ${accent ? REDBRD : SBB}`, borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
      <div style={{ fontSize: 24, fontWeight: 800, color, letterSpacing: "-0.5px", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 600, color: TX3, textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 4 }}>{label}</div>
    </div>
  );
}

// ── Reserve Form ──
function ReserveForm({ reserve, contractors, nextCode, templates = [], onTemplateAdded, showToast, onSave, onCancel }) {
  const [form, setForm] = useState(() => ({
    id: reserve?.id || Date.now() + Math.random(),
    code: reserve?.code || nextCode,
    description: reserve?.description || "",
    severity: reserve?.severity || "major",
    status: reserve?.status || "non_levee",
    contractor: reserve?.contractor || "",
    location: reserve?.location || "",
    deadline: reserve?.deadline || "",
    photos: reserve?.photos || [],
    notes: reserve?.notes || "",
    createdAt: reserve?.createdAt || new Date().toISOString(),
    resolvedAt: reserve?.resolvedAt || null,
    // F8 — id du modèle source si la description vient de la bibliothèque
    // (utilisé pour incrémenter usage_count à la sauvegarde, et pour
    // masquer le bouton « Enregistrer comme modèle » dans ce cas)
    _templateId: reserve?._templateId || null,
  }));
  const photoRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateSaved, setTemplateSaved] = useState(false);

  const set = (key) => (val) => setForm(f => ({ ...f, [key]: val }));

  // ── F8 — matching de modèles ──
  // Filtre la bibliothèque selon ce que l'archi est en train d'écrire.
  // Match fuzzy : on coupe la query en mots et on garde les modèles qui
  // contiennent tous les mots (insensible à la casse). Si la description
  // est vide, on retourne les 5 modèles les plus utilisés comme suggestions
  // de départ. Si elle dépasse 60 chars, plus de suggestion (l'archi sait
  // ce qu'il veut écrire).
  const matchingTemplates = (() => {
    if (!templates.length) return [];
    const q = form.description.trim().toLowerCase();
    if (q.length > 60) return [];
    if (!q) return templates.slice(0, 5);
    const words = q.split(/\s+/).filter(w => w.length > 1);
    if (!words.length) return templates.slice(0, 5);
    return templates
      .filter(t => {
        const desc = t.description.toLowerCase();
        return words.every(w => desc.includes(w));
      })
      .slice(0, 5);
  })();

  // Cache si la description courante correspond exactement à un modèle
  // existant — auquel cas on n'affiche pas le bouton « Enregistrer ».
  const descMatchesTemplate = !!templates.find(
    t => t.description.trim().toLowerCase() === form.description.trim().toLowerCase()
  );

  const applyTemplate = (t) => {
    setForm(f => ({
      ...f,
      description: t.description,
      // On ne réécrase la sévérité/entreprise que si l'archi ne les a pas
      // déjà touchées — sinon il perdrait son choix.
      severity: f.severity === "major" ? (t.default_severity || f.severity) : f.severity,
      contractor: !f.contractor && t.default_contractor_type ? t.default_contractor_type : f.contractor,
      _templateId: t.id,
    }));
    setTemplateSaved(false);
  };

  const saveAsTemplate = async () => {
    if (savingTemplate) return;
    setSavingTemplate(true);
    const created = await saveReserveTemplate({
      description: form.description,
      default_severity: form.severity,
      default_contractor_type: form.contractor || null,
      category: null,
    });
    setSavingTemplate(false);
    if (created) {
      onTemplateAdded?.(created);
      setForm(f => ({ ...f, _templateId: created.id }));
      setTemplateSaved(true);
      showToast?.("Modèle enregistré dans votre bibliothèque");
    } else {
      showToast?.("Échec de l'enregistrement du modèle", "error");
    }
  };

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("Format non supporté — image attendue."); e.target.value = ""; return; }
    if (file.size > MAX_UPLOAD_PHOTO_BYTES) {
      const mb = Math.round(file.size / 1024 / 1024);
      alert(`Photo trop lourde (${mb} Mo). Limite : ${MAX_UPLOAD_PHOTO_BYTES / 1024 / 1024} Mo.`);
      e.target.value = "";
      return;
    }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result;
      setForm(f => ({ ...f, photos: [...f.photos, dataUrl] }));
      if (navigator.onLine) {
        const result = await uploadPhoto(dataUrl);
        if (result) {
          setForm(f => ({ ...f, photos: f.photos.map(p => p === dataUrl ? result.url : p) }));
        }
      }
      setUploading(false);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const removePhoto = (idx) => setForm(f => ({ ...f, photos: f.photos.filter((_, i) => i !== idx) }));

  const canSave = form.description.trim();

  return (
    <div style={{ maxWidth: 600, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <button onClick={onCancel} style={{ background: SB, border: `1px solid ${SBB}`, cursor: "pointer", padding: 7, minWidth: 36, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 }}>
          <Ico name="back" color={TX2} size={16} />
        </button>
        <div style={{ fontSize: 18, fontWeight: 700, color: TX }}>{reserve ? `Modifier ${form.code}` : "Nouvelle réserve"}</div>
      </div>

      <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 14, padding: 20 }}>
        {/* Code */}
        <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
          <FormField label="Code" half>
            <input value={form.code} onChange={e => set("code")(e.target.value)} placeholder="R-001"
              style={{ ...inputStyle, fontFamily: "monospace", fontWeight: 700 }} />
          </FormField>
          <FormField label="Gravité" half>
            <div style={{ display: "flex", gap: 4 }}>
              {RESERVE_SEVERITIES.map(s => (
                <button key={s.id} onClick={() => set("severity")(s.id)}
                  style={{ flex: 1, padding: "7px 4px", border: `1.5px solid ${form.severity === s.id ? s.color : SBB}`, borderRadius: 8, background: form.severity === s.id ? s.bg : WH, color: form.severity === s.id ? s.color : TX3, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textAlign: "center" }}>
                  {s.label}
                </button>
              ))}
            </div>
          </FormField>
        </div>

        {/* Description + suggestions de la bibliothèque (F8) */}
        <FormField label="Description *">
          {matchingTemplates.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6, alignItems: "center" }}>
              <span style={{ fontSize: 10, color: TX3, marginRight: 2 }}>Bibliothèque :</span>
              {matchingTemplates.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => applyTemplate(t)}
                  title={t.description}
                  style={{
                    padding: "3px 9px",
                    border: `1px solid ${form._templateId === t.id ? ACL2 : SBB}`,
                    borderRadius: 999,
                    background: form._templateId === t.id ? ACL : WH,
                    color: form._templateId === t.id ? AC : TX2,
                    fontSize: 10,
                    fontWeight: 500,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    maxWidth: 260,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {t.description}
                </button>
              ))}
            </div>
          )}
          <textarea
            value={form.description}
            onChange={e => {
              const v = e.target.value;
              setForm(f => ({
                ...f,
                description: v,
                // Si l'archi modifie le texte après avoir choisi un modèle,
                // on détache la référence — sinon usage_count s'incrémenterait
                // pour un texte qui n'est plus le modèle.
                _templateId: f._templateId && f.description !== v ? null : f._templateId,
              }));
              setTemplateSaved(false);
            }}
            placeholder="Décrivez le défaut constaté..."
            rows={3}
            style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }}
          />
          {/* Enregistrer comme modèle — apparaît seulement si la description est
              inédite (>10 chars, pas déjà un modèle, pas en train d'éditer un
              modèle). Toujours opt-in, jamais auto. */}
          {form.description.trim().length > 10 && !form._templateId && !descMatchesTemplate && (
            <div style={{ marginTop: 6, display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={saveAsTemplate}
                disabled={savingTemplate || templateSaved}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "4px 10px",
                  border: `1px solid ${templateSaved ? GR : SBB}`,
                  borderRadius: 8,
                  background: templateSaved ? "#F0F9F1" : WH,
                  color: templateSaved ? GR : TX2,
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: savingTemplate || templateSaved ? "default" : "pointer",
                  fontFamily: "inherit",
                  transition: "all 0.15s",
                }}
              >
                <Ico name={templateSaved ? "check" : "plus"} size={10} color={templateSaved ? GR : TX2} />
                {templateSaved ? "Modèle enregistré" : savingTemplate ? "..." : "Enregistrer comme modèle"}
              </button>
            </div>
          )}
        </FormField>

        {/* Contractor + Location */}
        <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
          <FormField label="Entreprise" half>
            <input list="contractors-list" value={form.contractor} onChange={e => set("contractor")(e.target.value)} placeholder="Sélectionner ou saisir..."
              style={inputStyle} />
            <datalist id="contractors-list">
              {contractors.map(c => <option key={c} value={c} />)}
            </datalist>
          </FormField>
          <FormField label="Localisation" half>
            <input value={form.location} onChange={e => set("location")(e.target.value)} placeholder="ex: Cuisine RDC"
              style={inputStyle} />
          </FormField>
        </div>

        {/* Deadline */}
        <FormField label="Échéance">
          <input type="date" value={form.deadline} onChange={e => set("deadline")(e.target.value)} style={inputStyle} />
        </FormField>

        {/* Notes */}
        <FormField label="Notes complémentaires">
          <textarea value={form.notes} onChange={e => set("notes")(e.target.value)} placeholder="Observations, commentaires..."
            rows={2} style={{ ...inputStyle, resize: "vertical" }} />
        </FormField>

        {/* Photos */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: TX2, marginBottom: 6 }}>Photos</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {form.photos.map((ph, i) => (
              <div key={i} style={{ position: "relative" }}>
                <img src={ph} style={{ width: 64, height: 64, borderRadius: 8, objectFit: "cover", border: `1px solid ${SBB}` }} />
                <button onClick={() => removePhoto(i)} style={{ position: "absolute", top: -4, right: -4, width: 18, height: 18, borderRadius: "50%", background: RD, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Ico name="x" size={10} color="#fff" />
                </button>
              </div>
            ))}
            <button onClick={() => photoRef.current?.click()}
              style={{ width: 64, height: 64, borderRadius: 8, border: `1.5px dashed ${SBB}`, background: SB, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
              <Ico name="camera" size={16} color={TX3} />
              <span style={{ fontSize: 8, color: TX3, fontWeight: 600 }}>{uploading ? "..." : "Photo"}</span>
            </button>
            <input ref={photoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhoto} />
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, paddingTop: 6 }}>
          <button onClick={onCancel}
            style={{ flex: 1, padding: "11px 16px", border: `1px solid ${SBB}`, borderRadius: 10, background: WH, color: TX2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Annuler
          </button>
          <button onClick={() => canSave && onSave(form)} disabled={!canSave}
            style={{ flex: 2, padding: "11px 16px", border: "none", borderRadius: 10, background: canSave ? AC : DIS, color: canSave ? "#fff" : DIST, fontSize: 13, fontWeight: 700, cursor: canSave ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
            {reserve ? "Enregistrer" : "Ajouter la réserve"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Form Field ──
function FormField({ label, children, half }) {
  return (
    <div style={{ flex: half ? 1 : undefined, marginBottom: half ? 0 : 14 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: TX2, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "10px 12px", border: `1px solid ${SBB}`, borderRadius: 8,
  fontSize: 13, fontFamily: "inherit", background: WH, color: TX,
  outline: "none", boxSizing: "border-box", transition: "border-color 0.15s",
};
