import { useState, useEffect, useMemo } from "react";
import { AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, RD, DIS, DIST } from "../constants/tokens";
import { RESERVE_SEVERITIES } from "../constants/statuses";
import { Ico } from "../components/ui";
import { loadReserveTemplates, saveReserveTemplate, deleteReserveTemplate } from "../db";

// ── F8 — Section "Bibliothèque de réserves" dans le Profil ──
// CRUD inline sur les modèles personnels de l'archi + lecture seule
// sur les modèles système et ceux partagés par son agence. Affichage
// trié par fréquence d'usage décroissante.
//
// Cohérence visuelle : suit exactement le pattern des autres sections
// du Profil (card WH, border SBB, radius 14, padding 20, en-tête
// uppercase tracking 0.07em).

const CATEGORIES = [
  "Finitions", "Sol", "Étanchéité", "Menuiseries", "Châssis",
  "Électricité", "Sanitaire", "HVAC", "Gros œuvre", "Toiture",
  "Sécurité", "Réception",
];

export function ReserveLibrarySection({ sectionRef }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // "all" | "mine" | "system" | "org"
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null); // { description, default_severity, default_contractor_type, category }
  const [adding, setAdding] = useState(false);

  // Charge la bibliothèque au montage. Cancellation propre si le composant
  // est démonté avant la fin du fetch — évite un setState sur composant
  // démonté et fait passer la règle react-hooks/set-state-in-effect.
  useEffect(() => {
    let cancelled = false;
    loadReserveTemplates()
      .then(rows => { if (!cancelled) { setTemplates(rows); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Rechargement après mutation — pas dans un effet, donc pas concerné par
  // la règle. Utilisé par add / edit / delete pour rafraîchir la liste.
  const refresh = async () => {
    const rows = await loadReserveTemplates();
    setTemplates(rows);
  };

  const counts = useMemo(() => ({
    total: templates.length,
    mine: templates.filter(t => t.owner_user_id && !t.is_system).length,
    system: templates.filter(t => t.is_system).length,
    org: templates.filter(t => t.org_id).length,
  }), [templates]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter(t => {
      if (filter === "mine" && (!t.owner_user_id || t.is_system)) return false;
      if (filter === "system" && !t.is_system) return false;
      if (filter === "org" && !t.org_id) return false;
      if (q && !t.description.toLowerCase().includes(q) && !(t.category || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [templates, search, filter]);

  const startAdd = () => {
    setEditingId(null);
    setDraft({ description: "", default_severity: "major", default_contractor_type: "", category: "" });
    setAdding(true);
  };

  const startEdit = (t) => {
    if (t.is_system) return; // immuable côté user
    setAdding(false);
    setEditingId(t.id);
    setDraft({
      description: t.description,
      default_severity: t.default_severity,
      default_contractor_type: t.default_contractor_type || "",
      category: t.category || "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setAdding(false);
    setDraft(null);
  };

  const saveDraft = async () => {
    if (!draft?.description?.trim()) return;
    const payload = {
      id: editingId || undefined,
      description: draft.description.trim(),
      default_severity: draft.default_severity,
      default_contractor_type: draft.default_contractor_type.trim() || null,
      category: draft.category.trim() || null,
    };
    const result = await saveReserveTemplate(payload);
    if (result) {
      cancelEdit();
      refresh();
    }
  };

  const removeTemplate = async (t) => {
    if (t.is_system) return;
    if (!confirm(`Supprimer définitivement ce modèle ?\n\n« ${t.description.slice(0, 80)} »`)) return;
    const ok = await deleteReserveTemplate(t.id);
    if (ok) setTemplates(prev => prev.filter(x => x.id !== t.id));
  };

  // Helpers visuels
  const sevMeta = (id) => RESERVE_SEVERITIES.find(s => s.id === id) || RESERVE_SEVERITIES[1];

  return (
    <div
      ref={sectionRef}
      style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 14, padding: "20px 20px 16px", marginBottom: 16 }}
    >
      {/* Header — même typographie uppercase que les autres sections */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3 }}>Bibliothèque de réserves</div>
          <div style={{ fontSize: 12, color: TX3, marginTop: 4, lineHeight: 1.5 }}>
            Modèles réutilisables pour accélérer la saisie d'OPR. {counts.mine} perso · {counts.system} système{counts.org > 0 ? ` · ${counts.org} agence` : ""}.
          </div>
        </div>
        {!adding && !editingId && (
          <button
            onClick={startAdd}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", border: "none", borderRadius: 9, background: AC, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}
          >
            <Ico name="plus" size={11} color="#fff" /> Nouveau
          </button>
        )}
      </div>

      {/* Formulaire d'ajout / édition */}
      {(adding || editingId) && draft && (
        <div style={{ background: SB, border: `1px solid ${ACL2}`, borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: TX2, marginBottom: 4 }}>Description *</div>
          <textarea
            value={draft.description}
            onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
            placeholder="ex : Joint silicone manquant ou défaillant"
            rows={2}
            style={inputStyle}
          />
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: TX2, marginBottom: 4 }}>Sévérité par défaut</div>
              <div style={{ display: "flex", gap: 4 }}>
                {RESERVE_SEVERITIES.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setDraft(d => ({ ...d, default_severity: s.id }))}
                    style={{
                      flex: 1,
                      padding: "6px 4px",
                      border: `1.5px solid ${draft.default_severity === s.id ? s.color : SBB}`,
                      borderRadius: 8,
                      background: draft.default_severity === s.id ? s.bg : WH,
                      color: draft.default_severity === s.id ? s.color : TX3,
                      fontSize: 10, fontWeight: 600, cursor: "pointer",
                      fontFamily: "inherit", textAlign: "center",
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: TX2, marginBottom: 4 }}>Corps de métier (optionnel)</div>
              <input
                value={draft.default_contractor_type}
                onChange={e => setDraft(d => ({ ...d, default_contractor_type: e.target.value }))}
                placeholder="ex : Carrelage"
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: TX2, marginBottom: 4 }}>Catégorie (optionnel)</div>
              <input
                list="reserve-template-categories"
                value={draft.category}
                onChange={e => setDraft(d => ({ ...d, category: e.target.value }))}
                placeholder="ex : Finitions"
                style={inputStyle}
              />
              <datalist id="reserve-template-categories">
                {CATEGORIES.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              onClick={cancelEdit}
              style={{ flex: 1, padding: "9px 14px", border: `1px solid ${SBB}`, borderRadius: 9, background: WH, color: TX2, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
            >
              Annuler
            </button>
            <button
              onClick={saveDraft}
              disabled={!draft.description.trim()}
              style={{
                flex: 2, padding: "9px 14px", border: "none", borderRadius: 9,
                background: draft.description.trim() ? AC : DIS,
                color: draft.description.trim() ? "#fff" : DIST,
                fontSize: 12, fontWeight: 700,
                cursor: draft.description.trim() ? "pointer" : "not-allowed",
                fontFamily: "inherit",
              }}
            >
              {editingId ? "Enregistrer" : "Ajouter à la bibliothèque"}
            </button>
          </div>
        </div>
      )}

      {/* Filtres + recherche */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {[
          { id: "all", label: `Tous (${counts.total})` },
          { id: "mine", label: `Perso (${counts.mine})` },
          ...(counts.org > 0 ? [{ id: "org", label: `Agence (${counts.org})` }] : []),
          { id: "system", label: `Système (${counts.system})` },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            style={{
              padding: "5px 11px",
              border: `1px solid ${filter === f.id ? ACL2 : SBB}`,
              borderRadius: 999,
              background: filter === f.id ? ACL : WH,
              color: filter === f.id ? AC : TX2,
              fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {f.label}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher..."
          style={{ flex: 1, minWidth: 140, padding: "6px 10px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 12, fontFamily: "inherit", background: SB, color: TX, outline: "none", boxSizing: "border-box" }}
        />
      </div>

      {/* Liste */}
      {loading ? (
        <div style={{ padding: "20px 0", textAlign: "center", fontSize: 12, color: TX3 }}>Chargement…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: "24px 12px", textAlign: "center", fontSize: 12, color: TX3, background: SB, border: `1px dashed ${SBB}`, borderRadius: 10 }}>
          {search.trim() || filter !== "all"
            ? "Aucun modèle ne correspond à ce filtre."
            : "Aucun modèle pour l'instant. Crée-en un, ou enregistre-en un directement depuis le formulaire de réserve."}
        </div>
      ) : (
        <div style={{ maxHeight: 380, overflowY: "auto", border: `1px solid ${SBB}`, borderRadius: 10 }}>
          {filtered.map((t, idx) => {
            const sev = sevMeta(t.default_severity);
            const isMine = !!t.owner_user_id && !t.is_system;
            const isOrg = !!t.org_id;
            const isSystem = t.is_system;
            return (
              <div
                key={t.id}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px",
                  borderTop: idx === 0 ? "none" : `1px solid ${SBB}`,
                  background: editingId === t.id ? ACL : WH,
                  transition: "background 0.15s",
                }}
              >
                <div style={{ width: 6, height: 28, borderRadius: 3, background: sev.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: TX, fontWeight: 500, lineHeight: 1.4, marginBottom: 2 }}>
                    {t.description}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 999, background: sev.bg, color: sev.color, fontWeight: 600 }}>
                      {sev.label}
                    </span>
                    {t.category && (
                      <span style={{ fontSize: 10, color: TX3 }}>{t.category}</span>
                    )}
                    {t.default_contractor_type && (
                      <span style={{ fontSize: 10, color: TX3 }}>· {t.default_contractor_type}</span>
                    )}
                    {t.usage_count > 0 && (
                      <span style={{ fontSize: 10, color: TX3 }}>· utilisé {t.usage_count}×</span>
                    )}
                    <span style={{
                      fontSize: 9, padding: "1px 6px", borderRadius: 999, fontWeight: 600,
                      background: isSystem ? SB2 : isOrg ? ACL : "#EBF3E8",
                      color:      isSystem ? TX3 : isOrg ? AC  : "#5A8C3F",
                      textTransform: "uppercase", letterSpacing: "0.04em",
                    }}>
                      {isSystem ? "Système" : isOrg ? "Agence" : "Perso"}
                    </span>
                  </div>
                </div>
                {isMine || (isOrg && !isSystem) ? (
                  <>
                    <button
                      onClick={() => startEdit(t)}
                      title="Modifier"
                      style={{ background: "transparent", border: "none", cursor: "pointer", padding: 6, display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                      <Ico name="edit" size={14} color={TX3} />
                    </button>
                    <button
                      onClick={() => removeTemplate(t)}
                      title="Supprimer"
                      style={{ background: "transparent", border: "none", cursor: "pointer", padding: 6, display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                      <Ico name="trash" size={14} color={RD} />
                    </button>
                  </>
                ) : (
                  <span style={{ fontSize: 10, color: TX3, padding: "0 6px" }} title="Modèle système — non éditable">
                    <Ico name="lock" size={12} color={TX3} />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "8px 10px", border: `1px solid ${SBB}`, borderRadius: 8,
  fontSize: 12, fontFamily: "inherit", background: WH, color: TX,
  outline: "none", boxSizing: "border-box", resize: "vertical", lineHeight: 1.5,
};
