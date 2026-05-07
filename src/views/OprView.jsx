import { useState, useRef, useEffect } from "react";
import { AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, RD, GR, SP, FS, RAD, DIS, DIST, REDBG, REDBRD, GRBG, BG } from "../constants/tokens";
import { RESERVE_STATUSES, RESERVE_SEVERITIES, getReserveStatus, getReserveSeverity, nextReserveStatus } from "../constants/statuses";
import { Ico } from "../components/ui";
import { uploadPhoto, getPhotoUrl, loadOprSignatureRequests, requestOprSignatures } from "../db";
import { SignOprModal, SendOprModal, RequestSignaturesModal } from "../components/modals";
import { generateOprPdf } from "../utils/pdf";

// ── OPR View ─────────────────────────────────────────────────

export function OprView({ project, setProjects, profile, showToast, onBack }) {
  const [mode, setMode] = useState("list"); // "list" | "add" | "edit"
  const [editingId, setEditingId] = useState(null);
  const [filter, setFilter] = useState("all"); // "all" | "non_levee" | "partiellement_levee" | "levee"
  const [filterContractor, setFilterContractor] = useState("all");
  const [signOpen, setSignOpen] = useState(false);
  const [sendOprOpen, setSendOprOpen] = useState(null); // opr object to send, or null
  const [requestSigOpen, setRequestSigOpen] = useState(false);
  const [signatureRequests, setSignatureRequests] = useState([]);
  const [relaunchingId, setRelaunchingId] = useState(null); // id du sigreq en cours de relance
  const photoRef = useRef(null);

  // Renvoie un nouveau lien de signature pour un signataire ayant refusé / expiré.
  // Crée un nouveau sigreq frais (token, expiration) sans toucher à l'ancien
  // pour préserver la traçabilité du refus.
  const relaunchSignature = async (opr, sigreq) => {
    if (relaunchingId) return;
    setRelaunchingId(sigreq.id);
    try {
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
        authorName: profile?.name || profile?.email || "L'architecte",
        structureName: profile?.structure,
        customMessage: "",
      });
      if (result.error) {
        showToast?.(`Erreur : ${result.error}`, "error");
      } else {
        showToast?.(`Nouveau lien envoyé à ${sigreq.signatory_email}`);
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
    updateReserves(reserves.map(r => {
      if (r.id !== reserveId) return r;
      const next = nextReserveStatus(r.status);
      return { ...r, status: next, resolvedAt: next === "levee" ? new Date().toISOString() : null };
    }));
  };

  const deleteReserve = (reserveId) => {
    if (!confirm("Supprimer cette réserve ?")) return;
    updateReserves(reserves.filter(r => r.id !== reserveId));
  };

  // ── Add / Edit form ──
  if (mode === "add" || mode === "edit") {
    const existing = mode === "edit" ? reserves.find(r => r.id === editingId) : null;
    return (
      <ReserveForm
        reserve={existing}
        contractors={contractors}
        nextCode={`R-${String(reserves.length + 1).padStart(3, "0")}`}
        onSave={(reserve) => {
          if (mode === "edit") {
            updateReserves(reserves.map(r => r.id === reserve.id ? reserve : r));
          } else {
            updateReserves([...reserves, reserve]);
          }
          setMode("list");
          setEditingId(null);
        }}
        onCancel={() => { setMode("list"); setEditingId(null); }}
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
          <button
            onClick={() => setSignOpen(true)}
            disabled={reserves.length === 0}
            title="Signer sur place lors de la réception (canvas tactile)"
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", border: `1px solid ${SBB}`, borderRadius: 10, background: WH, color: reserves.length === 0 ? DIST : TX2, fontSize: 13, fontWeight: 600, cursor: reserves.length === 0 ? "not-allowed" : "pointer", fontFamily: "inherit" }}
          >
            <Ico name="edit" size={13} color={reserves.length === 0 ? DIST : TX2} /> Signer sur place
          </button>
          <button
            onClick={() => setRequestSigOpen(true)}
            disabled={reserves.length === 0}
            title="Envoyer un lien de signature par email à chaque participant"
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", border: `1px solid ${SBB}`, borderRadius: 10, background: WH, color: reserves.length === 0 ? DIST : TX2, fontSize: 13, fontWeight: 600, cursor: reserves.length === 0 ? "not-allowed" : "pointer", fontFamily: "inherit" }}
          >
            <Ico name="send" size={13} color={reserves.length === 0 ? DIST : TX2} /> Envoyer pour signature
          </button>
          <button
            onClick={() => setMode("add")}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", border: "none", borderRadius: 10, background: AC, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
          >
            <Ico name="plus" size={14} color="#fff" /> Nouvelle réserve
          </button>
        </div>
      </div>

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

      {/* Per-contractor breakdown */}
      {contractorStats.length > 0 && (
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
          {contractors.length > 1 && (
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
              <div key={r.id} style={{ background: WH, border: `1px solid ${r.severity === "critical" && r.status !== "levee" ? REDBRD : SBB}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "stretch" }}>
                  {/* Left accent */}
                  <div style={{ width: 4, background: st.color, flexShrink: 0 }} />

                  <div style={{ flex: 1, padding: "12px 14px", minWidth: 0 }}>
                    {/* Top row: code + severity + status */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: TX, fontFamily: "monospace" }}>{r.code}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: sev.color, background: sev.bg, padding: "2px 8px", borderRadius: 4 }}>{sev.label}</span>
                      <button onClick={() => toggleStatus(r.id)} title="Cliquez pour changer le statut"
                        style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, color: st.color, background: st.bg, padding: "2px 8px", borderRadius: 4, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: st.dot }} />
                        {st.label}
                      </button>
                      <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                        <button onClick={() => { setEditingId(r.id); setMode("edit"); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                          <Ico name="edit" size={13} color={TX3} />
                        </button>
                        <button onClick={() => deleteReserve(r.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                          <Ico name="x" size={13} color={TX3} />
                        </button>
                      </div>
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
                      {(r.photos || []).length > 0 && (
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <Ico name="camera" size={11} color={TX3} /> {r.photos.length} photo{r.photos.length > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>

                    {/* Photos */}
                    {(r.photos || []).length > 0 && (
                      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                        {r.photos.slice(0, 4).map((ph, i) => (
                          <img key={i} src={ph} style={{ width: 48, height: 48, borderRadius: 6, objectFit: "cover", border: `1px solid ${SBB}` }} />
                        ))}
                        {r.photos.length > 4 && (
                          <div style={{ width: 48, height: 48, borderRadius: 6, background: SB, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: TX3 }}>+{r.photos.length - 4}</div>
                        )}
                      </div>
                    )}
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
function ReserveForm({ reserve, contractors, nextCode, onSave, onCancel }) {
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
  }));
  const photoRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const set = (key) => (val) => setForm(f => ({ ...f, [key]: val }));

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
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

        {/* Description */}
        <FormField label="Description *">
          <textarea value={form.description} onChange={e => set("description")(e.target.value)} placeholder="Décrivez le défaut constaté..."
            rows={3} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
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
