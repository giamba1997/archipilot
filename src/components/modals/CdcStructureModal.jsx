import { useEffect, useMemo, useState } from "react";
import { AC, ACL, ACL2, BL, BLB, GR, GRBG, BR, BRB, RD, REDBG, REDBRD, SB, SB2, SBB, TX, TX2, TX3, WH, FS, SP, RAD, DIS, DIST } from "../../constants/tokens";
import { Modal, Ico, AskAiButton } from "../ui";
import { parseCdc } from "../../db";

// Modal de relecture de la structure extraite par parse-cdc.
//
// Flow :
//   1. Ouverte par CdcBanner → on lance parseCdc en arrière-plan.
//   2. Spinner pendant l'analyse.
//   3. Affichage : 3 sections (Postes / Obligations / Attendus), chacune
//      avec une checkbox "tout sélectionner" + cases par item.
//   4. L'utilisateur décoche ce qu'il ne veut pas. Cliquer "Appliquer" merge
//      avec le projet (non destructif — pas de remplacement, que des ajouts).
//   5. Le résultat brut + un timestamp sont mémorisés sur cdc.structured pour
//      ne pas refaire l'appel IA si l'utilisateur réouvre la modal.
//
// Principe directeur : l'IA propose, l'utilisateur valide. Aucun item n'est
// appliqué automatiquement.

const SECTION_META = {
  posts:       { label: "Postes du chantier",     color: BL, bg: BLB,  icon: "folder",   helper: "Sections de prise de notes — fusionnés avec les postes existants." },
  obligations: { label: "Obligations détectées",  color: AC, bg: ACL,  icon: "alert",    helper: "Stockées en champs personnalisés du projet — consultables dans Modifier les informations." },
  attendus:    { label: "Documents/livrables attendus", color: GR, bg: GRBG, icon: "listcheck", helper: "Génère une checklist 'Attendus du CDC' à compléter au fil du chantier." },
};

const obligationTypeLabel = (t) => {
  const map = { "matériau": "Matériau", marque: "Marque", performance: "Performance", norme: "Norme", "délai": "Délai", autre: "Autre" };
  return map[t?.toLowerCase()] || "Autre";
};

const attenduCategoryLabel = (c) => {
  const map = { documents: "Documents", tests: "Tests", essais: "Essais", autre: "Autre" };
  return map[c?.toLowerCase()] || "Autre";
};

export function CdcStructureModal({ open, onClose, project, onApply, showToast }) {
  const cdc = project?.cahierDesCharges || null;
  const cached = cdc?.structured || null;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(cached);
  const [selected, setSelected] = useState(() => initSelection(cached));

  // Lance l'analyse à l'ouverture si on n'a pas déjà un résultat caché.
  useEffect(() => {
    if (!open) return;
    setError("");
    setSelected(initSelection(data));
    if (data || !cdc?.extractedText) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const res = await parseCdc({
        extractedText: cdc.extractedText,
        projectName: project.name,
        projectType: project._projectTemplateId || project.postTemplate || "",
      });
      if (cancelled) return;
      setLoading(false);
      if (res.upgradeRequired) {
        setError(res.upgradeRequired.error || "Quota IA dépassé — passe à Pro pour relancer l'analyse.");
        return;
      }
      if (res.error) { setError(res.error); return; }
      setData(res);
      setSelected(initSelection(res));
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const counts = useMemo(() => ({
    posts:       (data?.posts || []).length,
    obligations: (data?.obligations || []).length,
    attendus:    (data?.attendus || []).length,
  }), [data]);

  const selectedCounts = useMemo(() => ({
    posts:       Object.values(selected.posts || {}).filter(Boolean).length,
    obligations: Object.values(selected.obligations || {}).filter(Boolean).length,
    attendus:    Object.values(selected.attendus || {}).filter(Boolean).length,
  }), [selected]);

  const toggle = (section, idx) => {
    setSelected(s => ({
      ...s,
      [section]: { ...s[section], [idx]: !s[section][idx] },
    }));
  };
  const toggleAll = (section, value) => {
    const items = data?.[section] || [];
    const next = {};
    items.forEach((_, i) => { next[i] = value; });
    setSelected(s => ({ ...s, [section]: next }));
  };

  const handleRetry = async () => {
    setData(null);
    setError("");
    setSelected({ posts: {}, obligations: {}, attendus: {} });
    setLoading(true);
    const res = await parseCdc({
      extractedText: cdc.extractedText,
      projectName: project.name,
      projectType: project._projectTemplateId || project.postTemplate || "",
    });
    setLoading(false);
    if (res.upgradeRequired) { setError(res.upgradeRequired.error || "Quota IA dépassé."); return; }
    if (res.error) { setError(res.error); return; }
    setData(res);
    setSelected(initSelection(res));
  };

  const handleApply = () => {
    const picked = {
      posts:       (data?.posts || []).filter((_, i) => selected.posts[i]),
      obligations: (data?.obligations || []).filter((_, i) => selected.obligations[i]),
      attendus:    (data?.attendus || []).filter((_, i) => selected.attendus[i]),
      parsedAt:    data?.parsedAt,
    };
    onApply(picked, data); // data complet passé pour caching dans cdc.structured.
    // Pas de toast ici — c'est le handler dans App.jsx qui en émet un détaillé
    // (postes ajoutés vs renommés vs intacts) après le merge.
    onClose();
  };

  const totalPicked = selectedCounts.posts + selectedCounts.obligations + selectedCounts.attendus;
  const canApply = !loading && !error && totalPicked > 0;

  return (
    <Modal open={open} onClose={onClose} title="Structure du cahier des charges" wide>
      <div style={{ fontSize: FS.sm, color: TX3, lineHeight: 1.5, marginBottom: SP.md }}>
        L'IA propose une structure détectée dans le document. <strong style={{ color: TX2 }}>Décoche ce que tu ne veux pas appliquer</strong> — rien n'est ajouté au projet sans ta validation.
      </div>

      {/* États ────────────────────────────────────────────── */}
      {loading && (
        <div style={{ padding: `${SP.lg}px`, textAlign: "center", color: TX3 }}>
          <div style={{ width: 22, height: 22, border: `2.5px solid ${SBB}`, borderTopColor: AC, borderRadius: "50%", animation: "sp 0.6s linear infinite", margin: "0 auto 10px" }} />
          <div style={{ fontSize: FS.sm }}>L'IA lit le cahier des charges…</div>
          <div style={{ fontSize: FS.xs, marginTop: 4, fontStyle: "italic" }}>Quelques secondes selon la longueur.</div>
        </div>
      )}

      {error && !loading && (
        <div style={{ padding: SP.md, background: REDBG, border: `1px solid ${REDBRD}`, borderRadius: RAD.md, marginBottom: SP.md }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: SP.sm }}>
            <Ico name="alert" size={14} color={BR} />
            <div style={{ flex: 1, fontSize: FS.sm, color: BR }}>{error}</div>
          </div>
          {cdc?.extractedText && (
            <button onClick={handleRetry} style={{ marginTop: SP.sm, padding: "6px 12px", border: `1px solid ${BR}`, borderRadius: 6, background: WH, color: BR, fontSize: FS.xs, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Réessayer</button>
          )}
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* Postes */}
          <Section
            section="posts"
            items={data.posts}
            selected={selected.posts}
            count={counts.posts}
            picked={selectedCounts.posts}
            onToggle={toggle}
            onToggleAll={toggleAll}
            renderItem={(p) => (
              <>
                <span style={{ fontSize: FS.xs, fontWeight: 700, color: TX3, fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>{p.id}</span>
                <span style={{ fontSize: FS.sm, fontWeight: 600, color: TX, marginLeft: 8 }}>{p.label}</span>
                {p.summary && <div style={{ fontSize: FS.xs, color: TX3, marginTop: 2, marginLeft: 28 }}>{p.summary}</div>}
              </>
            )}
          />

          {/* Obligations */}
          <Section
            section="obligations"
            items={data.obligations}
            selected={selected.obligations}
            count={counts.obligations}
            picked={selectedCounts.obligations}
            onToggle={toggle}
            onToggleAll={toggleAll}
            renderItem={(o) => (
              <>
                <span style={{ fontSize: 9, fontWeight: 700, color: AC, background: ACL, padding: "1px 7px", borderRadius: 10, textTransform: "uppercase", letterSpacing: "0.05em", marginRight: 6 }}>{obligationTypeLabel(o.type)}</span>
                <span style={{ fontSize: FS.sm, color: TX }}>{o.text}</span>
                {o.postId && <span style={{ fontSize: FS.xs, color: TX3, marginLeft: 6 }}>· poste {o.postId}</span>}
              </>
            )}
          />

          {/* Attendus */}
          <Section
            section="attendus"
            items={data.attendus}
            selected={selected.attendus}
            count={counts.attendus}
            picked={selectedCounts.attendus}
            onToggle={toggle}
            onToggleAll={toggleAll}
            renderItem={(a) => (
              <>
                <span style={{ fontSize: 9, fontWeight: 700, color: GR, background: GRBG, padding: "1px 7px", borderRadius: 10, textTransform: "uppercase", letterSpacing: "0.05em", marginRight: 6 }}>{attenduCategoryLabel(a.category)}</span>
                <span style={{ fontSize: FS.sm, color: TX }}>{a.label}</span>
              </>
            )}
          />

          {/* CTA */}
          <div style={{ display: "flex", gap: SP.sm, alignItems: "center", marginTop: SP.lg, paddingTop: SP.md, borderTop: `1px solid ${SBB}` }}>
            <AskAiButton
              size="compact"
              label="Discuter avec l'IA"
              sourceTag="cdc_structure_modal"
              contextHint="Ouvre le chat avec l'extraction structurée déjà en contexte. Poser une question, demander un complément."
              attachments={data ? [{
                type: "text",
                name: `Structure CDC — ${project.name}`,
                mimeType: "text/plain",
                content: structureToText(data),
                sourceTag: `Structure CDC — ${project.name}`,
              }] : undefined}
              message={`Voici la structure que l'IA a extraite du cahier des charges de **${project.name}**. Aide-moi à la compléter ou à clarifier un point précis.`}
              onBeforeOpen={() => { onClose(); return true; }}
            />
            <div style={{ flex: 1 }} />
            <button onClick={onClose} style={{ padding: "10px 16px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, color: TX2, fontSize: FS.sm, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Annuler</button>
            <button
              onClick={handleApply}
              disabled={!canApply}
              style={{ padding: "10px 18px", border: "none", borderRadius: 8, background: canApply ? AC : DIS, color: canApply ? WH : DIST, fontSize: FS.sm, fontWeight: 700, cursor: canApply ? "pointer" : "not-allowed", fontFamily: "inherit" }}
            >
              Appliquer ({totalPicked})
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

// ── Sous-composant Section ───────────────────────────────────
function Section({ section, items, selected, count, picked, onToggle, onToggleAll, renderItem }) {
  const meta = SECTION_META[section];
  if (count === 0) return null;
  const allSelected = picked === count;
  return (
    <div style={{ marginBottom: SP.md, border: `1px solid ${SBB}`, borderRadius: RAD.md, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.sm, padding: "10px 14px", background: meta.bg, borderBottom: `1px solid ${SBB}` }}>
        <Ico name={meta.icon} size={13} color={meta.color} />
        <span style={{ fontSize: FS.sm, fontWeight: 700, color: meta.color }}>{meta.label}</span>
        <span style={{ fontSize: FS.xs, color: TX3 }}>· {picked}/{count} sélectionnés</span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => onToggleAll(section, !allSelected)}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: FS.xs, color: meta.color, fontWeight: 600, fontFamily: "inherit" }}
        >
          {allSelected ? "Tout décocher" : "Tout cocher"}
        </button>
      </div>
      <div style={{ fontSize: FS.xs, color: TX3, padding: "6px 14px", borderBottom: `1px solid ${SBB}`, background: SB }}>{meta.helper}</div>
      <div>
        {items.map((item, i) => {
          const isSel = !!selected[i];
          return (
            <label
              key={i}
              style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 14px", borderBottom: `1px solid ${SBB}`, cursor: "pointer", background: isSel ? WH : SB }}
            >
              <input
                type="checkbox"
                checked={isSel}
                onChange={() => onToggle(section, i)}
                style={{ marginTop: 2, accentColor: meta.color, cursor: "pointer" }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>{renderItem(item)}</div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────
function initSelection(data) {
  const make = (arr) => {
    const o = {};
    (arr || []).forEach((_, i) => { o[i] = true; }); // tout sélectionné par défaut
    return o;
  };
  return {
    posts: make(data?.posts),
    obligations: make(data?.obligations),
    attendus: make(data?.attendus),
  };
}

function structureToText(data) {
  const lines = [];
  if (data.posts?.length) {
    lines.push("# Postes détectés");
    data.posts.forEach(p => lines.push(`- ${p.id} ${p.label}${p.summary ? ` — ${p.summary}` : ""}`));
  }
  if (data.obligations?.length) {
    lines.push("\n# Obligations");
    data.obligations.forEach(o => lines.push(`- [${o.type || "autre"}] ${o.text}${o.postId ? ` (poste ${o.postId})` : ""}`));
  }
  if (data.attendus?.length) {
    lines.push("\n# Attendus");
    data.attendus.forEach(a => lines.push(`- [${a.category || "autre"}] ${a.label}`));
  }
  return lines.join("\n");
}
