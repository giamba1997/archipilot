import { useState, useRef, useEffect } from "react";
import { AC, ACL, SB, SBB, TX, TX2, TX3, WH, RD, GR, REDBG, GRBG } from "../../constants/tokens";
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

  // Build results across all searchable content
  const results = q.length < 2 ? [] : (() => {
    const hits = [];

    projects.forEach((proj) => {
      // 1. Search in PV content
      (proj.pvHistory || []).forEach((pv) => {
        const content = pv.content || "";
        const idx = content.toLowerCase().indexOf(q);
        if (idx === -1) return;
        const start = Math.max(0, idx - 60);
        const end = Math.min(content.length, idx + 70);
        let snippet = content.slice(start, end).replace(/\n/g, " ").trim();
        if (start > 0) snippet = "\u2026" + snippet;
        if (end < content.length) snippet += "\u2026";
        hits.push({ type: "pv", proj, pv, snippet, icon: "file", color: AC });
      });

      // 2. Search in remarks
      (proj.posts || []).forEach((post) => {
        (post.remarks || []).forEach((r) => {
          if (r.text?.toLowerCase().includes(q)) {
            const snippet = r.text.length > 130 ? r.text.slice(0, 130) + "\u2026" : r.text;
            hits.push({ type: "remark", proj, post, remark: r, snippet, icon: "edit", color: r.urgent ? RD : TX2 });
          }
        });
      });

      // 3. Search in actions
      (proj.actions || []).forEach((a) => {
        if (a.text?.toLowerCase().includes(q) || a.who?.toLowerCase().includes(q)) {
          const snippet = `${a.text}${a.who ? ` — ${a.who}` : ""}${a.since ? ` (${a.since})` : ""}`;
          hits.push({ type: "action", proj, action: a, snippet, icon: "alert", color: a.urgent ? RD : TX2 });
        }
      });

      // 4. Search in project name, client, contractor, address
      const projFields = [proj.name, proj.client, proj.contractor, proj.address, proj.desc].filter(Boolean).join(" ");
      if (projFields.toLowerCase().includes(q)) {
        const st = getStatus(proj.statusId);
        hits.push({ type: "project", proj, snippet: `${proj.client} · ${proj.contractor}${proj.address ? ` · ${proj.address}` : ""}`, icon: "building", color: st.color });
      }

      // 5. Search in participants
      (proj.participants || []).forEach((p) => {
        const pFields = [p.name, p.email, p.phone, p.role].filter(Boolean).join(" ");
        if (pFields.toLowerCase().includes(q)) {
          hits.push({ type: "participant", proj, participant: p, snippet: `${p.role} — ${p.name}${p.email ? ` · ${p.email}` : ""}`, icon: "user", color: TX2 });
        }
      });
    });

    return hits.slice(0, 50); // cap results
  })();

  const typeLabels = { pv: "PV", remark: "Remarque", action: "Action", project: "Projet", participant: "Participant" };
  const typeBg = { pv: ACL, remark: SB, action: REDBG, project: GRBG, participant: SB };

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
            placeholder="Rechercher dans les PV, remarques, actions, projets\u2026"
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
            <div style={{ padding: "40px 20px", textAlign: "center", color: TX3, fontSize: 13 }}>
              Tapez au moins 2 caractères pour rechercher
              <div style={{ marginTop: 8, fontSize: 11, color: TX3 }}>Ctrl+K pour ouvrir la recherche</div>
            </div>
          ) : results.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center" }}>
              <Ico name="search" size={32} color={TX3} />
              <div style={{ fontSize: 14, color: TX2, marginTop: 12 }}>Aucun résultat pour « {query} »</div>
            </div>
          ) : (
            results.map((r, i) => (
              <button
                key={i}
                onClick={() => { onOpen(r.proj.id, r.pv || null); onClose(); }}
                style={{ width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: `1px solid ${SBB}`, cursor: "pointer", padding: "12px 16px", fontFamily: "inherit" }}
                onMouseEnter={(e) => e.currentTarget.style.background = SB}
                onMouseLeave={(e) => e.currentTarget.style.background = "none"}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, color: r.color, background: typeBg[r.type], padding: "2px 7px", borderRadius: 4 }}>
                    <Ico name={r.icon} size={10} color={r.color} />
                    {typeLabels[r.type]}
                    {r.type === "pv" && ` n°${r.pv.number}`}
                    {r.type === "remark" && ` · ${r.post.id}. ${r.post.label}`}
                  </span>
                  {r.type === "pv" && <span style={{ fontSize: 11, color: TX3 }}>{r.pv.date}</span>}
                  {r.type === "action" && r.action?.urgent && <span style={{ fontSize: 9, fontWeight: 700, color: RD, background: REDBG, padding: "1px 5px", borderRadius: 3 }}>URGENT</span>}
                  <span style={{ fontSize: 11, color: TX3, marginLeft: "auto", whiteSpace: "nowrap", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>{r.proj.name}</span>
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
