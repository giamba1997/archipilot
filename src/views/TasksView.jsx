import { useMemo, useState } from "react";
import {
  AC, ACL, ACL2, BL, BLB, SB, SB2, SBB, TX, TX2, TX3, WH, BR, BRB, RD, GR,
  AM, AMB, ST, STB, REDBG, REDBRD, SP, FS, RAD, LH,
} from "../constants/tokens";
import { Ico, MobileConsultationBanner } from "../components/ui";
import { useIsMobile } from "../hooks/useIsMobile";
import { TaskEditModal } from "../components/modals/TaskEditModal";
import {
  TASK_STATUSES, TASK_PRIORITIES, getTaskStatus, getTaskPriority,
  newTask, sortTasks, countTasks, isOverdue, advanceTaskStatus, isClosed,
} from "../utils/tasks";

// Vue principale des tâches d'un projet.
// Groupement primaire = par lot (avec une section "Transverses" pour les
// tâches sans lot). Filtres rapides en haut (statut / priorité / en retard /
// recherche). Click sur une tâche = ouverture de la modal d'édition.

export function TasksView({ project, setProjects, onBack, profile }) {
  const tasks = project.tasks || [];
  const lots = project.lots || [];

  const isMobile = useIsMobile();
  const [editTaskId, setEditTaskId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [filterStatuses, setFilterStatuses] = useState(new Set(["created", "open", "in_progress", "pending_validation"])); // par défaut, tout sauf clôturées
  const [filterPriorities, setFilterPriorities] = useState(new Set());
  const [filterAssignee, setFilterAssignee] = useState("");
  const [filterOverdueOnly, setFilterOverdueOnly] = useState(false);
  const [search, setSearch] = useState("");

  const editTask = useMemo(() => editTaskId ? tasks.find(t => t.id === editTaskId) : null, [editTaskId, tasks]);
  const stats = useMemo(() => countTasks(tasks), [tasks]);

  // Liste filtrée + triée
  const visibleTasks = useMemo(() => {
    let list = tasks;
    if (filterStatuses.size > 0) list = list.filter(t => filterStatuses.has(t.status));
    if (filterPriorities.size > 0) list = list.filter(t => filterPriorities.has(t.priority));
    if (filterAssignee.trim()) list = list.filter(t => (t.assigneeName || "").toLowerCase().includes(filterAssignee.toLowerCase()));
    if (filterOverdueOnly) list = list.filter(t => isOverdue(t));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        (t.title || "").toLowerCase().includes(q) ||
        (t.description || "").toLowerCase().includes(q)
      );
    }
    return sortTasks(list);
  }, [tasks, filterStatuses, filterPriorities, filterAssignee, filterOverdueOnly, search]);

  // Groupement par lot
  const groups = useMemo(() => {
    const byLot = new Map();
    const transverse = [];
    for (const t of visibleTasks) {
      if (!t.lotId) { transverse.push(t); continue; }
      if (!byLot.has(t.lotId)) byLot.set(t.lotId, []);
      byLot.get(t.lotId).push(t);
    }
    const out = [];
    for (const lot of lots) {
      if (byLot.has(lot.id)) out.push({ lot, tasks: byLot.get(lot.id) });
    }
    if (transverse.length > 0) out.push({ lot: null, tasks: transverse });
    return out;
  }, [visibleTasks, lots]);

  // ── Mutations ──
  const updateProject = (mutator) => setProjects(prev => prev.map(p => p.id === project.id ? mutator(p) : p));

  const handleSave = (task) => {
    updateProject(p => {
      const exists = (p.tasks || []).some(t => t.id === task.id);
      const tasks = exists
        ? (p.tasks || []).map(t => t.id === task.id ? task : t)
        : [...(p.tasks || []), task];
      return { ...p, tasks };
    });
  };
  const handleDelete = (id) => {
    updateProject(p => ({ ...p, tasks: (p.tasks || []).filter(t => t.id !== id) }));
  };
  const handleAdvance = (id) => updateProject(p => advanceTaskStatus(p, id));

  const toggleSetItem = (set, key, setter) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key); else next.add(key);
    setter(next);
  };

  const resetFilters = () => {
    setFilterStatuses(new Set(["created", "open", "in_progress", "pending_validation"]));
    setFilterPriorities(new Set());
    setFilterAssignee("");
    setFilterOverdueOnly(false);
    setSearch("");
  };

  // ── Render ──
  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", animation: "fadeIn 0.2s ease" }}>
      {/* Header — KPIs + bouton nouvelle tâche */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: SP.md, flexWrap: "wrap", gap: SP.md }}>
        <div style={{ display: "flex", alignItems: "center", gap: SP.lg, flexWrap: "wrap" }}>
          <Kpi label="Actives" value={stats.active} color={AC} />
          <Kpi label="En retard" value={stats.overdue} color={BR} highlight={stats.overdue > 0} />
          <Kpi label="Urgentes" value={stats.urgent} color={BR} highlight={stats.urgent > 0} />
          <Kpi label="Clôturées" value={stats.closed} color={GR} />
        </div>
        {!isMobile && (
          <button onClick={() => setCreating(true)}
            style={{ padding: "10px 18px", border: "none", borderRadius: RAD.md, background: AC, color: WH, fontSize: FS.sm, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Ico name="plus" size={13} color={WH} /> Nouvelle tâche
          </button>
        )}
      </div>

      {isMobile && <MobileConsultationBanner hint="tap pour avancer une tâche. Création + édition au bureau." />}

      {/* Barre de filtres — desktop seulement (mobile = vue épurée) */}
      {!isMobile && <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: RAD.lg, padding: `${SP.sm + 2}px ${SP.md}px`, marginBottom: SP.md }}>
        <div style={{ display: "flex", alignItems: "center", gap: SP.md, flexWrap: "wrap" }}>
          {/* Search */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "1 1 240px", minWidth: 200 }}>
            <Ico name="search" size={13} color={TX3} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par titre ou description…"
              style={{ flex: 1, padding: "6px 8px", border: `1px solid ${SBB}`, borderRadius: 6, fontSize: FS.sm, fontFamily: "inherit", background: SB, color: TX }}
            />
          </div>
          {/* Status pills */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {TASK_STATUSES.map(s => {
              const active = filterStatuses.has(s.id);
              return (
                <button key={s.id} onClick={() => toggleSetItem(filterStatuses, s.id, setFilterStatuses)}
                  style={{ padding: "4px 10px", border: `1px solid ${active ? s.color : SBB}`, borderRadius: 14, background: active ? s.bg : WH, color: active ? s.color : TX3, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot }} />
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: SP.md, marginTop: 8, flexWrap: "wrap" }}>
          {/* Priority pills */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {TASK_PRIORITIES.map(p => {
              const active = filterPriorities.has(p.id);
              return (
                <button key={p.id} onClick={() => toggleSetItem(filterPriorities, p.id, setFilterPriorities)}
                  style={{ padding: "4px 10px", border: `1px solid ${active ? p.color : SBB}`, borderRadius: 14, background: active ? p.bg : WH, color: active ? p.color : TX3, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  {p.label}
                </button>
              );
            })}
          </div>
          {/* Assigné */}
          <input
            value={filterAssignee}
            onChange={(e) => setFilterAssignee(e.target.value)}
            placeholder="Assigné à…"
            style={{ padding: "5px 10px", border: `1px solid ${SBB}`, borderRadius: 6, fontSize: 11, fontFamily: "inherit", background: SB, color: TX, width: 160 }}
          />
          {/* Overdue toggle */}
          <button onClick={() => setFilterOverdueOnly(v => !v)}
            style={{ padding: "5px 10px", border: `1px solid ${filterOverdueOnly ? BR : SBB}`, borderRadius: 14, background: filterOverdueOnly ? BRB : WH, color: filterOverdueOnly ? BR : TX3, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            En retard uniquement
          </button>
          <button onClick={resetFilters} style={{ marginLeft: "auto", background: "none", border: "none", color: TX3, fontSize: 11, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}>
            Réinitialiser
          </button>
        </div>
      </div>}

      {/* Liste des groupes */}
      {groups.length === 0 && tasks.length === 0 && (
        <div style={{ background: WH, border: `1px dashed ${SBB}`, borderRadius: RAD.lg, padding: SP.xxl, textAlign: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: SB, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
            <Ico name="listcheck" size={20} color={TX3} />
          </div>
          <div style={{ fontSize: FS.md, fontWeight: 700, color: TX, marginBottom: 4 }}>Aucune tâche pour ce chantier</div>
          <div style={{ fontSize: FS.sm, color: TX3, marginBottom: 14 }}>
            Crée une tâche manuellement, ou laisse l'IA en proposer après avoir généré un PV.
          </div>
          {!isMobile && (
            <button onClick={() => setCreating(true)} style={{ padding: "9px 18px", border: "none", borderRadius: RAD.md, background: AC, color: WH, fontSize: FS.sm, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Ico name="plus" size={13} color={WH} /> Nouvelle tâche
            </button>
          )}
        </div>
      )}

      {groups.length === 0 && tasks.length > 0 && (
        <div style={{ padding: SP.lg, background: WH, border: `1px solid ${SBB}`, borderRadius: RAD.lg, textAlign: "center", color: TX3, fontSize: FS.sm }}>
          Aucune tâche ne correspond aux filtres.
        </div>
      )}

      {groups.map(g => (
        <div key={g.lot ? g.lot.id : "transverse"} style={{ marginBottom: SP.md }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 4px" }}>
            {g.lot ? (
              <>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: TX3 }} />
                <span style={{ fontSize: FS.sm, fontWeight: 700, color: TX }}>{g.lot.name}</span>
                {g.lot.contractor && <span style={{ fontSize: FS.xs, color: TX3 }}>· {g.lot.contractor}</span>}
              </>
            ) : (
              <>
                <Ico name="building" size={12} color={TX3} />
                <span style={{ fontSize: FS.sm, fontWeight: 700, color: TX }}>Tâches transverses</span>
              </>
            )}
            <span style={{ fontSize: FS.xs, color: TX3, marginLeft: 4 }}>· {g.tasks.length}</span>
          </div>
          <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: RAD.lg, overflow: "hidden" }}>
            {g.tasks.map((t, i) => (
              <TaskRow key={t.id} task={t} project={project}
                isLast={i === g.tasks.length - 1}
                onClick={() => isMobile ? handleAdvance(t.id) : setEditTaskId(t.id)}
                onAdvance={() => handleAdvance(t.id)}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Modals */}
      <TaskEditModal
        open={creating}
        onClose={() => setCreating(false)}
        project={project}
        existingTask={null}
        profile={profile}
        onSave={(t) => handleSave(t)}
      />
      <TaskEditModal
        open={!!editTask}
        onClose={() => setEditTaskId(null)}
        project={project}
        existingTask={editTask}
        profile={profile}
        onSave={(t) => handleSave(t)}
        onDelete={(id) => handleDelete(id)}
      />
    </div>
  );
}

// ── Sous-composants ──

function Kpi({ label, value, color, highlight }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <span style={{ fontSize: 22, fontWeight: 700, color: highlight ? color : TX, lineHeight: 1.1 }}>{value}</span>
      <span style={{ fontSize: 10, color: TX3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
    </div>
  );
}

function TaskRow({ task, project, isLast, onClick, onAdvance }) {
  const status = getTaskStatus(task.status);
  const priority = getTaskPriority(task.priority);
  const overdue = isOverdue(task);
  const closed = isClosed(task.status);
  const post = task.postId ? project.posts?.find(p => p.id === task.postId) : null;

  const dueLabel = task.dueDate
    ? new Date(task.dueDate).toLocaleDateString("fr-BE", { day: "numeric", month: "short" })
    : null;

  return (
    <div onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: SP.sm,
        padding: "10px 14px",
        borderBottom: isLast ? "none" : `1px solid ${SBB}`,
        cursor: "pointer", background: WH,
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = SB}
      onMouseLeave={(e) => e.currentTarget.style.background = WH}>
      {/* Pastille priorité */}
      <span title={priority.label} style={{ width: 8, height: 8, borderRadius: "50%", background: priority.color, flexShrink: 0 }} />
      {/* Titre + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: FS.sm, fontWeight: 600, color: closed ? TX3 : TX, textDecoration: closed ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {task.title}
        </div>
        <div style={{ fontSize: 10, color: TX3, marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {task.assigneeName && <span><Ico name="user" size={9} color={TX3} /> {task.assigneeName}</span>}
          {dueLabel && (
            <span style={{ color: overdue ? BR : TX3, fontWeight: overdue ? 700 : 500 }}>
              <Ico name="calendar" size={9} color={overdue ? BR : TX3} /> {dueLabel}
              {overdue && " · en retard"}
            </span>
          )}
          {post && <span>Poste {post.id}</span>}
          {task.origin === "pv" && task.pvNumber && <span style={{ color: AC, fontWeight: 600 }}>PV n°{task.pvNumber}</span>}
          {(task.attachments || []).length > 0 && <span><Ico name="folder" size={9} color={TX3} /> {task.attachments.length}</span>}
          {(task.comments || []).length > 0 && <span><Ico name="mail" size={9} color={TX3} /> {task.comments.length}</span>}
        </div>
      </div>
      {/* Statut badge */}
      <span style={{ fontSize: 10, fontWeight: 700, color: status.color, background: status.bg, padding: "3px 9px", borderRadius: 14, flexShrink: 0 }}>{status.label}</span>
      {/* Avancer le statut — bouton discret */}
      {!closed && (
        <button onClick={(e) => { e.stopPropagation(); onAdvance(); }}
          title="Avancer au statut suivant" aria-label="Avancer au statut suivant"
          style={{ padding: 5, minWidth: 32, minHeight: 32, justifyContent: "center", border: `1px solid ${SBB}`, borderRadius: 6, background: WH, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", flexShrink: 0 }}>
          <Ico name="arrowr" size={11} color={TX3} />
        </button>
      )}
    </div>
  );
}
