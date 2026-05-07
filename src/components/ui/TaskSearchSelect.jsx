import { useEffect, useMemo, useRef, useState } from "react";
import { AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, FS, RAD } from "../../constants/tokens";
import { Ico } from "./Ico";
import { getTaskStatus } from "../../utils/tasks";

// Combobox de sélection d'une tâche.
// L'utilisateur peut :
//   - Cliquer pour ouvrir la liste de toutes les tâches du projet
//   - Taper le titre (filtrage textuel)
//   - Taper "#5" ou simplement "5" pour cibler par numéro
//   - Effacer la sélection avec le bouton ×
//
// Affiche dans la pill/input la sélection courante (numéro + titre + statut).
// Le caller passe `value` (taskId | "") et reçoit `onChange(taskId | "")`.

export function TaskSearchSelect({ tasks = [], value, onChange, placeholder = "Lier à une tâche…", disabled = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const selected = useMemo(() => tasks.find(t => t.id === value) || null, [tasks, value]);

  // Filtrage : on accepte le titre, le numéro brut "5", ou "#5".
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tasks;
    const numMatch = q.match(/^#?(\d+)$/);
    if (numMatch) {
      const n = Number(numMatch[1]);
      return tasks.filter(t => Number(t.number) === n);
    }
    return tasks.filter(t =>
      (t.title || "").toLowerCase().includes(q) ||
      (t.description || "").toLowerCase().includes(q)
    );
  }, [tasks, query]);

  // Fermer en cliquant en dehors
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Reset highlight quand la liste change
  useEffect(() => { setHighlightIdx(0); }, [query, open]);

  const choose = (task) => {
    onChange(task.id);
    setOpen(false);
    setQuery("");
  };

  const clear = (e) => {
    e?.stopPropagation();
    onChange("");
    setQuery("");
    setOpen(false);
  };

  const onKey = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlightIdx(i => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx(i => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlightIdx]) choose(filtered[highlightIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const handleInputClick = () => {
    if (disabled) return;
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 10);
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      {/* Display / input — un seul élément qui passe en mode input quand on tape */}
      <div onClick={handleInputClick}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          width: "100%", padding: "9px 10px",
          border: `1px solid ${open ? AC : SBB}`, borderRadius: RAD.md,
          background: WH, cursor: disabled ? "not-allowed" : "text",
          minHeight: 38, boxSizing: "border-box",
          opacity: disabled ? 0.5 : 1,
        }}>
        <Ico name="search" size={12} color={TX3} />
        {selected && !open ? (
          <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: TX3, fontFamily: "ui-monospace, monospace" }}>#{selected.number || "?"}</span>
            <span style={{ fontSize: FS.sm, color: TX, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{selected.title}</span>
            <TaskStatusPill status={selected.status} />
          </div>
        ) : (
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onKeyDown={onKey}
            onFocus={() => setOpen(true)}
            placeholder={selected ? `#${selected.number} ${selected.title}` : placeholder}
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: FS.sm, fontFamily: "inherit", color: TX, minWidth: 0 }}
          />
        )}
        {selected && (
          <button type="button" onClick={clear} aria-label="Retirer le lien"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}>
            <Ico name="x" size={11} color={TX3} />
          </button>
        )}
        <Ico name={open ? "chevron-up" : "chevron-down"} size={11} color={TX3} />
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 60,
          background: WH, border: `1px solid ${SBB}`, borderRadius: RAD.md,
          boxShadow: "0 10px 30px rgba(0,0,0,0.1)",
          maxHeight: 280, overflowY: "auto",
        }}>
          {tasks.length === 0 ? (
            <div style={{ padding: "12px 14px", fontSize: FS.sm, color: TX3, fontStyle: "italic" }}>
              Aucune tâche dans ce projet — crée-en d'abord depuis Planning.
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "12px 14px", fontSize: FS.sm, color: TX3, fontStyle: "italic" }}>
              Aucune tâche ne correspond à « {query} ».
            </div>
          ) : (
            filtered.map((t, i) => {
              const isHighlight = i === highlightIdx;
              const isSelected = t.id === value;
              const status = getTaskStatus(t.status);
              return (
                <button key={t.id}
                  type="button"
                  onMouseEnter={() => setHighlightIdx(i)}
                  onClick={() => choose(t)}
                  style={{
                    width: "100%", textAlign: "left",
                    padding: "8px 12px", border: "none",
                    background: isHighlight ? SB : (isSelected ? ACL : "transparent"),
                    cursor: "pointer", fontFamily: "inherit",
                    display: "flex", alignItems: "center", gap: 8,
                    borderBottom: `1px solid ${SBB}`,
                  }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: TX3, fontFamily: "ui-monospace, monospace", minWidth: 28 }}>
                    #{t.number || "?"}
                  </span>
                  <span style={{ fontSize: FS.sm, fontWeight: 500, color: TX, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.title}
                  </span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: status.color, background: status.bg, padding: "2px 7px", borderRadius: 10, flexShrink: 0 }}>
                    {status.label}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function TaskStatusPill({ status }) {
  const s = getTaskStatus(status);
  return (
    <span style={{ fontSize: 9, fontWeight: 700, color: s.color, background: s.bg, padding: "2px 7px", borderRadius: 10, flexShrink: 0 }}>
      {s.label}
    </span>
  );
}
