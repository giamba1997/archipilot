import { useState, useRef, useEffect } from "react";
import { AC, ACL, SB, SBB, TX, TX2, TX3, WH } from "../../constants/tokens";
import { Ico } from "../ui";
import { getStatus } from "../../constants/statuses";

export function SearchModal({ projects, onClose, onOpen }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50); }, []);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const results = q.length < 2 ? [] : projects.flatMap((proj) =>
    (proj.pvHistory || []).flatMap((pv) => {
      const content = pv.content || "";
      const idx = content.toLowerCase().indexOf(q);
      if (idx === -1) return [];
      const start = Math.max(0, idx - 60);
      const end   = Math.min(content.length, idx + 70);
      let snippet = content.slice(start, end).replace(/\n/g, " ").trim();
      if (start > 0) snippet = "…" + snippet;
      if (end < content.length) snippet += "…";
      return [{ proj, pv, snippet }];
    })
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 300, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "56px 16px 16px" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: WH, borderRadius: 14, width: "100%", maxWidth: 600, maxHeight: "75vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        {/* Barre de recherche */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 16px", borderBottom: `1px solid ${SBB}` }}>
          <Ico name="search" size={18} color={TX3} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher dans les PV…"
            style={{ flex: 1, border: "none", outline: "none", fontSize: 15, color: TX, background: "transparent", fontFamily: "inherit" }}
          />
          {query && (
            <button onClick={() => setQuery("")} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
              <Ico name="x" size={16} color={TX3} />
            </button>
          )}
          <button onClick={onClose} style={{ background: "none", border: `1px solid ${SBB}`, borderRadius: 4, cursor: "pointer", padding: "2px 7px", fontSize: 12, color: TX3, fontFamily: "inherit" }}>Échap</button>
        </div>

        {/* Résultats */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {q.length < 2 ? (
            <div style={{ padding: "40px 20px", textAlign: "center", color: TX3, fontSize: 13 }}>Tapez au moins 2 caractères pour rechercher dans les PV</div>
          ) : results.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center" }}>
              <Ico name="search" size={32} color={TX3} />
              <div style={{ fontSize: 14, color: TX2, marginTop: 12 }}>Aucun résultat pour « {query} »</div>
            </div>
          ) : (
            results.map((r, i) => (
              <button
                key={i}
                onClick={() => { onOpen(r.proj.id, r.pv); onClose(); }}
                style={{ width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: `1px solid ${SBB}`, cursor: "pointer", padding: "12px 16px", fontFamily: "inherit" }}
                onMouseEnter={(e) => e.currentTarget.style.background = SB}
                onMouseLeave={(e) => e.currentTarget.style.background = "none"}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: AC }}>PV n°{r.pv.number}</span>
                  <span style={{ fontSize: 11, color: TX3 }}>{r.pv.date}</span>
                  <span style={{ fontSize: 11, color: TX3, marginLeft: "auto", whiteSpace: "nowrap" }}>{r.proj.name}</span>
                </div>
                <div style={{ fontSize: 12, color: TX2, lineHeight: 1.55 }}>{r.snippet}</div>
              </button>
            ))
          )}
        </div>

        {results.length > 0 && (
          <div style={{ padding: "8px 16px", borderTop: `1px solid ${SBB}`, fontSize: 11, color: TX3 }}>
            {results.length} résultat{results.length > 1 ? "s" : ""} trouvé{results.length > 1 ? "s" : ""}
          </div>
        )}
      </div>
    </div>
  );
}

