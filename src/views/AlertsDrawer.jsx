import { useState, useEffect, useMemo } from "react";
import {
  AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, RD, GR,
  AM, AMB, ST, STB, BR, BRB, SG, SGB,
} from "../constants/tokens";
import { Ico } from "../components/ui";
import { loadPermits, loadInvoices } from "../db";
import { computeAlerts } from "../utils/alerts";

// ── F5 — Drawer "Prochaines échéances" ──────────────────────
// Mode pull : l'archi clique sur l'icône cloche/alerte → on calcule
// l'agrégation en temps réel. Pas de push, pas d'auto-popup → respect
// du principe "IA assistante, jamais intrusive".

const TYPE_META = {
  reception_definitive: { label: "Réception définitive", color: AM, bg: AMB, icon: "check" },
  reserve_overdue:      { label: "Réserve",              color: BR, bg: BRB, icon: "alert" },
  permit_deadline:      { label: "Permis",               color: ST, bg: STB, icon: "file" },
  task_overdue:         { label: "Tâche",                color: AM, bg: AMB, icon: "listcheck" },
  invoice_overdue:      { label: "Facture",              color: BR, bg: BRB, icon: "file" },
  no_pv_30d:            { label: "PV manquant",          color: AC, bg: ACL, icon: "clock" },
};

const SEVERITY_BG = {
  critical: BRB,
  high:     AMB,
  medium:   STB,
  low:      SB,
};
const SEVERITY_COLOR = {
  critical: BR,
  high:     AM,
  medium:   ST,
  low:      TX3,
};

export function AlertsDrawer({ projects, profile, onClose, onSelectProject }) {
  const [permits, setPermits] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState(false); // distingue l'échec du calcul de l'état « tout à jour »

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadPermits(), loadInvoices()])
      .then(([perms, invs]) => {
        if (cancelled) return;
        setPermits(perms);
        setInvoices(invs);
        setLoadErr(false);
        setLoading(false);
      })
      .catch((e) => { if (!cancelled) { console.error("AlertsDrawer load error:", e); setLoadErr(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const alerts = useMemo(
    () => computeAlerts({ projects, permits, invoices, settings: profile?.alertSettings }),
    [projects, permits, invoices, profile?.alertSettings]
  );

  const groupedBySeverity = useMemo(() => {
    const out = { critical: [], high: [], medium: [], low: [] };
    for (const a of alerts) out[a.severity]?.push(a);
    return out;
  }, [alerts]);

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 240, background: "rgba(0,0,0,0.3)", display: "flex", justifyContent: "flex-end" }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 440, height: "100%",
          background: WH, overflowY: "auto", padding: 18,
          animation: "slideInRight 0.25s ease-out",
          fontFamily: "inherit",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: TX }}>Prochaines échéances</div>
            <div style={{ fontSize: 11, color: TX3, marginTop: 2 }}>
              {loading ? "Calcul…" : `${alerts.length} alerte${alerts.length > 1 ? "s" : ""} active${alerts.length > 1 ? "s" : ""}`}
            </div>
          </div>
          <button onClick={onClose} aria-label="Fermer" style={{ background: SB, border: `1px solid ${SBB}`, cursor: "pointer", padding: 6, borderRadius: 8 }}>
            <Ico name="x" size={14} color={TX2} />
          </button>
        </div>

        {loading ? (
          <div style={{ padding: "30px 0", textAlign: "center", color: TX3, fontSize: 13 }}>Chargement…</div>
        ) : loadErr ? (
          <div style={{ padding: "32px 20px", textAlign: "center", background: WH, border: `1px solid ${SBB}`, borderRadius: 14, color: TX2, fontSize: 13 }}>
            Impossible de calculer les échéances (permis/factures non chargés). Vérifie ta connexion.
          </div>
        ) : alerts.length === 0 ? (
          <div style={{ padding: "32px 20px", textAlign: "center", background: SGB, border: `1px solid ${SG}33`, borderRadius: 14 }}>
            <Ico name="check" size={32} color={GR} />
            <div style={{ fontSize: 14, fontWeight: 700, color: GR, marginTop: 8 }}>Tout est à jour</div>
            <div style={{ fontSize: 11, color: TX3, marginTop: 4 }}>Aucune échéance dans les 30 prochains jours.</div>
          </div>
        ) : (
          <>
            {["critical", "high", "medium", "low"].map(sev => {
              const list = groupedBySeverity[sev];
              if (!list || list.length === 0) return null;
              const label = sev === "critical" ? "Urgent" : sev === "high" ? "Cette semaine" : sev === "medium" ? "Ce mois-ci" : "Plus tard";
              return (
                <div key={sev} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: SEVERITY_COLOR[sev], textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                    {label} ({list.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {list.map(a => {
                      const meta = TYPE_META[a.type] || { label: "Alerte", color: TX2, bg: SB, icon: "alert" };
                      return (
                        <button
                          key={a.id}
                          onClick={() => { onSelectProject?.(a.projectId); onClose(); }}
                          style={{
                            display: "flex", alignItems: "flex-start", gap: 10,
                            padding: "10px 12px",
                            border: `1px solid ${SEVERITY_COLOR[sev]}33`,
                            borderRadius: 10,
                            background: SEVERITY_BG[sev],
                            cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                            transition: "border-color 0.15s, transform 0.1s",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = SEVERITY_COLOR[sev]; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${SEVERITY_COLOR[sev]}33`; }}
                        >
                          <div style={{ width: 26, height: 26, borderRadius: 6, background: WH, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <Ico name={meta.icon} size={13} color={meta.color} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: TX, marginBottom: 2 }}>{a.title}</div>
                            {a.subtitle && (
                              <div style={{ fontSize: 11, color: TX2, marginBottom: 3, lineHeight: 1.4 }}>{a.subtitle}</div>
                            )}
                            <div style={{ fontSize: 10, color: TX3 }}>
                              <span style={{ fontWeight: 600, color: meta.color }}>{meta.label}</span>
                              {" · "}{a.projectName}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
