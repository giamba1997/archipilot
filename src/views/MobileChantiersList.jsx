import { useMemo, useState } from "react";
import {
  AC, ACL, SB, SBB, TX, TX2, TX3, WH, BG, SP, RAD,
  BR, BRB, AM, AMB, GR, SGB,
} from "../constants/tokens";
import { Ico } from "../components/ui";
import { getStatus, STATUS_TOTAL_STEPS } from "../constants/statuses";
import { parseDateFR } from "../utils/dates";

// ── MobileChantiersList — liste complète des chantiers (mobile) ──
//
// Vue accessible depuis le slot 2 de la MobileBottomBar. Conçue pour
// un browsing rapide entre 2 RDV ou sur la route : search-as-you-type
// + filtres tactiles + liste compacte avec hint d'action contextuel.
//
// MobileHome présente les 5 plus récents et reste l'écran de "que dois-je
// faire maintenant ?". Cette vue répond à "où est ce chantier ?" sur
// l'ensemble du portfolio (peut être 30+ projets).
//
// Tap projet → `onSelectProject(id)` → Overview du projet.

const TODAY_TS = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return +d; })();

function isMeetingToday(p) {
  if (!p.nextMeeting) return false;
  const d = parseDateFR(p.nextMeeting);
  if (!d) return false;
  d.setHours(0, 0, 0, 0);
  return +d === TODAY_TS;
}

function reservesOpen(p) {
  return (p.reserves || []).filter(r => r.status !== "levee").length;
}

function pvDrafts(p) {
  return (p.pvHistory || []).filter(x => x.status === "draft").length;
}

function describeHint(p) {
  if (isMeetingToday(p)) return { txt: "Réunion aujourd'hui", color: AC };
  const d = pvDrafts(p);
  if (d > 0) return { txt: `${d} PV à finir`, color: AM };
  const r = reservesOpen(p);
  if (r > 0) return { txt: `${r} réserve${r > 1 ? "s" : ""} ouverte${r > 1 ? "s" : ""}`, color: BR };
  const total = (p.pvHistory || []).length;
  return { txt: total > 0 ? `${total} PV au total` : "Pas encore de PV", color: TX3 };
}

// Calcule un score d'urgence pour trier les actifs en tête de liste.
// Réunion aujourd'hui domine (+100), puis brouillons PV (×10), puis
// réserves ouvertes. Les projets sans signal urgent tombent en ordre
// alphabétique à la fin.
function urgencyScore(p) {
  return (isMeetingToday(p) ? 100 : 0) + pvDrafts(p) * 10 + reservesOpen(p);
}

// Signal prioritaire affiché en bandeau (sémantique).
function signal(p) {
  const crit = (p.reserves || []).filter(r => r.severity === "critical" && r.status !== "levee").length;
  const openR = reservesOpen(p);
  const drafts = pvDrafts(p);
  if (crit) return { txt: `${crit} réserve${crit > 1 ? "s" : ""} critique${crit > 1 ? "s" : ""}`, icon: "alert", bg: BRB, fg: BR };
  if (isMeetingToday(p)) return { txt: "Réunion aujourd'hui", icon: "calendar", bg: ACL, fg: AC };
  if (drafts) return { txt: `${drafts} PV à préparer`, icon: "file", bg: AMB, fg: AM };
  if (openR) return { txt: `${openR} réserve${openR > 1 ? "s" : ""} ouverte${openR > 1 ? "s" : ""}`, icon: "alert", bg: AMB, fg: AM };
  return { txt: "À jour · rien d'urgent", icon: "check", bg: SGB, fg: GR };
}

// Type de projet (mockup) : "Permis" si le projet est en phase permis,
// sinon "Chantier". Pilote le badge de carte, la jauge et les filtres.
function projectType(p) {
  if (p.statusId === "permit") return { id: "permit", label: "Permis", color: "#C0791A", bg: "#F6EFE2", border: "#E8D7B0", fg: "#8A6A1E" };
  return { id: "chantier", label: "Chantier", color: AC, bg: "#FDF6F1", border: "#F0DCCB", fg: "#A04C20" };
}

const FILTERS = [
  { id: "all",      label: "Tous",     test: p => !p.archived },
  { id: "chantier", label: "Chantier", dot: AC,        test: p => !p.archived && projectType(p).id === "chantier" },
  { id: "permit",   label: "Permis",   dot: "#C0791A", test: p => !p.archived && projectType(p).id === "permit" },
];

export function MobileChantiersList({
  projects = [],
  onSelectProject,
  onBack,
  onOpenNewProject,
  onOpenMap,
  pickToVisit = false,
}) {
  const [query, setQuery] = useState("");
  const [filterId, setFilterId] = useState("all");

  const filtered = useMemo(() => {
    const filter = FILTERS.find(f => f.id === filterId);
    const q = query.trim().toLowerCase();
    return (projects || [])
      .filter(p => filter ? filter.test(p) : true)
      .filter(p => {
        if (!q) return true;
        const haystack = [
          p.name || "",
          p.address || "",
          p.city || "",
          p.client || "",
          p.contractor || "",
          (p.participants || []).map(x => x.name || "").join(" "),
        ].join(" ").toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => {
        if (filterId === "archived") return (a.name || "").localeCompare(b.name || "");
        const ua = urgencyScore(a), ub = urgencyScore(b);
        if (ua !== ub) return ub - ua;
        return (a.name || "").localeCompare(b.name || "");
      });
  }, [projects, filterId, query]);

  return (
    <div style={{ maxWidth: "none", margin: "0 auto", paddingBottom: SP.xl * 4 }}>
      {/* En-tête (sur le fond de page, comme le mockup) : retour seulement
          en mode "choisir un chantier" (sinon c'est l'onglet pur) + titre +
          bouton nouveau projet + recherche + filtres. */}
      <div style={{ position: "sticky", top: 0, background: BG, zIndex: 10, padding: `calc(${SP.md}px + env(safe-area-inset-top, 0px)) 4px ${SP.sm}px` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: SP.md }}>
          {pickToVisit && onBack && (
            <button onClick={onBack} aria-label="Retour" style={{ background: "none", border: "none", padding: 4, cursor: "pointer", marginLeft: -4 }}>
              <Ico name="back" size={22} color={TX} />
            </button>
          )}
          <h1 style={{ flex: 1, fontSize: 26, fontWeight: 700, color: TX, margin: 0, letterSpacing: "-0.5px" }}>{pickToVisit ? "Choisir un chantier" : "Chantiers"}</h1>
          {!pickToVisit && onOpenMap && (
            <button onClick={onOpenMap} aria-label="Carte des chantiers" title="Carte des chantiers" style={{ background: WH, color: TX2, border: "1px solid #EFEDEB", borderRadius: "50%", width: 40, height: 40, minWidth: 40, minHeight: 40, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Ico name="mappin" size={19} color={TX2} />
            </button>
          )}
        </div>

        {/* Search */}
        <div style={{ position: "relative", marginBottom: SP.sm }}>
          <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", display: "inline-flex" }}>
            <Ico name="search" size={16} color={TX3} />
          </div>
          <input
            type="text"
            placeholder="Rechercher un chantier, adresse, contact…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Rechercher"
            style={{
              width: "100%", padding: "11px 36px 11px 38px",
              border: "none", borderRadius: 12,
              fontSize: 15, fontFamily: "inherit", background: "#F1ECE8",
              color: TX,
              outline: "none",
              WebkitAppearance: "none",
              boxSizing: "border-box",
            }}
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label="Effacer la recherche" style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", padding: 4, cursor: "pointer", display: "inline-flex" }}>
              <Ico name="x" size={14} color={TX3} />
            </button>
          )}
        </div>

        {/* Filtres par type (Tous · N / Chantier / Permis) */}
        <div style={{ display: "flex", gap: 7, overflowX: "auto" }}>
          {FILTERS.map(f => {
            const active = filterId === f.id;
            const count = f.id === "all" ? (projects || []).filter(p => !p.archived).length : null;
            return (
              <button
                key={f.id}
                onClick={() => setFilterId(f.id)}
                style={{
                  flexShrink: 0, height: 28, padding: "0 12px", minHeight: 28,
                  borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 6,
                  border: `1px solid ${active ? "#EAC29E" : "#ECE7E2"}`,
                  background: active ? "#FDF6F1" : WH,
                  color: active ? "#A04C20" : "#78716C",
                  fontSize: 12.5, fontWeight: active ? 600 : 500, fontFamily: "inherit",
                  cursor: "pointer", whiteSpace: "nowrap", lineHeight: 1,
                }}
              >
                {f.dot && <span style={{ width: 7, height: 7, borderRadius: 999, background: f.dot }} />}
                {f.label}{count != null ? ` · ${count}` : ""}
              </button>
            );
          })}
        </div>
      </div>

      {/* Liste */}
      <div style={{ padding: "12px 4px 0", display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.length === 0 && (
          <div style={{ padding: SP.xl, textAlign: "center", background: SB, borderRadius: RAD.md, fontSize: 13, color: TX2 }}>
            {query
              ? <>Aucun chantier ne correspond à <strong style={{ color: TX }}>"{query}"</strong>.</>
              : "Aucun chantier dans cette catégorie."}
          </div>
        )}
        {filtered.map(p => {
          const status = getStatus(p.statusId);
          const type = projectType(p);
          const sig = signal(p);
          const location = [p.city, p.client].filter(Boolean).join(" · ");
          return (
            <button
              key={p.id}
              onClick={() => onSelectProject?.(p.id)}
              style={{ display: "flex", flexDirection: "column", textAlign: "left", padding: 16, border: "1px solid #EFEDEB", background: WH, borderRadius: 16, cursor: "pointer", fontFamily: "inherit", width: "100%" }}
            >
              {/* Badge type (Chantier / Permis) + jauge de phase */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, width: "100%" }}>
                <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 999, background: type.bg, color: type.fg, border: `1px solid ${type.border}`, fontWeight: 600 }}>{type.label}</span>
                <span style={{ marginLeft: "auto", display: "flex", gap: 3 }}>
                  {Array.from({ length: STATUS_TOTAL_STEPS }, (_, i) => <span key={i} style={{ width: 11, height: 4, borderRadius: 999, background: i < status.step ? type.color : SBB }} />)}
                </span>
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, color: TX, letterSpacing: "-0.3px", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
              <div style={{ fontSize: 13, color: TX3, marginBottom: 12 }}>{location || "—"}</div>
              {/* Bandeau signal */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: sig.fg, background: sig.bg, borderRadius: 9, padding: "8px 10px" }}>
                <Ico name={sig.icon} size={14} color={sig.fg} />{sig.txt}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
