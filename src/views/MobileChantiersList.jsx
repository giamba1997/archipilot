import { useMemo, useState } from "react";
import {
  AC, SB, SBB, TX, TX2, TX3, WH, SP, RAD,
  BR, AM,
} from "../constants/tokens";
import { Ico } from "../components/ui";
import { getStatus } from "../constants/statuses";
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

const FILTERS = [
  { id: "active",   label: "Actifs",   test: p => !p.archived },
  { id: "all",      label: "Tous",     test: () => true },
  { id: "archived", label: "Archivés", test: p => p.archived },
];

export function MobileChantiersList({
  projects = [],
  onSelectProject,
  onBack,
  onOpenNewProject,
}) {
  const [query, setQuery] = useState("");
  const [filterId, setFilterId] = useState("active");

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
    <div style={{ maxWidth: 640, margin: "0 auto", paddingBottom: SP.xl * 4 }}>
      {/* Sticky header : back + titre + search + filtres */}
      <div style={{ position: "sticky", top: 0, background: WH, zIndex: 10, padding: `${SP.md}px ${SP.md}px ${SP.sm}px`, borderBottom: `1px solid ${SBB}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: SP.md }}>
          {onBack && (
            <button onClick={onBack} aria-label="Retour" style={{ background: "none", border: "none", padding: 4, cursor: "pointer", marginLeft: -4 }}>
              <Ico name="back" size={20} color={TX} />
            </button>
          )}
          <h1 style={{ flex: 1, fontSize: 18, fontWeight: 800, color: TX, margin: 0, letterSpacing: -0.2 }}>
            Mes chantiers
            <span style={{ fontSize: 12, fontWeight: 600, color: TX3, marginLeft: 6 }}>
              ({filtered.length})
            </span>
          </h1>
          {onOpenNewProject && (
            <button onClick={onOpenNewProject} aria-label="Nouveau projet" style={{ background: AC, color: "#fff", border: "none", borderRadius: RAD.full, width: 32, height: 32, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <Ico name="plus" size={16} color="#fff" />
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
              width: "100%", padding: "10px 36px 10px 38px",
              border: `1px solid ${SBB}`, borderRadius: RAD.md,
              fontSize: 14, fontFamily: "inherit", background: SB,
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

        {/* Filtres tactiles */}
        <div style={{ display: "flex", gap: 6 }}>
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilterId(f.id)}
              style={{
                padding: "6px 12px",
                borderRadius: RAD.full,
                border: `1px solid ${filterId === f.id ? AC : SBB}`,
                background: filterId === f.id ? AC : WH,
                color: filterId === f.id ? "#fff" : TX2,
                fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                cursor: "pointer",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Liste */}
      <div style={{ padding: `${SP.md}px ${SP.md}px 0`, display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.length === 0 && (
          <div style={{ padding: SP.xl, textAlign: "center", background: SB, borderRadius: RAD.md, fontSize: 13, color: TX2 }}>
            {query
              ? <>Aucun chantier ne correspond à <strong style={{ color: TX }}>"{query}"</strong>.</>
              : "Aucun chantier dans cette catégorie."}
          </div>
        )}
        {filtered.map(p => {
          const status = getStatus(p.statusId);
          const hint = describeHint(p);
          const location = [p.address, p.city].filter(Boolean).join(", ");
          return (
            <button
              key={p.id}
              onClick={() => onSelectProject?.(p.id)}
              style={{
                display: "flex", flexDirection: "column", gap: 4,
                padding: "12px 14px", textAlign: "left",
                border: `1px solid ${SBB}`, background: WH,
                borderRadius: RAD.md, cursor: "pointer",
                fontFamily: "inherit", width: "100%",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: TX, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {p.name}
                </div>
                {status && (
                  <div style={{ fontSize: 10, color: status.color || TX3, background: `${status.color || TX3}1a`, padding: "2px 8px", borderRadius: 999, fontWeight: 700, whiteSpace: "nowrap" }}>
                    {status.label}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 11, color: hint.color, fontWeight: 600 }}>{hint.txt}</div>
              {location && (
                <div style={{ fontSize: 11, color: TX3, marginTop: 2, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  <Ico name="mappin" size={11} color={TX3} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{location}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
