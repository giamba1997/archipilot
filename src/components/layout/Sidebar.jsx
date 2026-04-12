import { useState, useMemo, useRef } from "react";
import { useT } from "../../i18n";
import { supabase } from "../../supabase";
import { AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, RD, SP, FS, RAD } from "../../constants/tokens";
import { getStatus } from "../../constants/statuses";
import { Ico } from "../ui";

export function Sidebar({ projects, activeId, view, onSelect, open, onClose, profile, onNewProject, onProfile, installable, onInstall, sharedProjects, onSelectShared, onStats, onPlanning }) {
  const [sortBy, setSortBy] = useState("client"); // "recency" | "name" | "client"
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [collapsedClients, setCollapsedClients] = useState({});
  const t = useT();
  const active = useMemo(() => projects.filter((p) => !p.archived), [projects]);
  const archived = useMemo(() => projects.filter((p) => p.archived), [projects]);
  const sortedActive = useMemo(() => [...active].sort((a, b) => {
    if (sortBy === "name") return a.name.localeCompare(b.name, "fr");
    if (sortBy === "client") return (a.client || "").localeCompare(b.client || "", "fr") || a.name.localeCompare(b.name, "fr");
    const aDate = a.pvHistory?.[0]?.date || "";
    const bDate = b.pvHistory?.[0]?.date || "";
    return bDate.localeCompare(aDate) || b.id - a.id;
  }), [active, sortBy]);

  // Group by client
  const clientGroups = useMemo(() => sortBy === "client" ? sortedActive.reduce((acc, p) => {
    const client = p.client || "Sans client";
    if (!acc[client]) acc[client] = [];
    acc[client].push(p);
    return acc;
  }, {}) : null, [sortedActive, sortBy]);
  const toggleClient = (client) => setCollapsedClients(prev => ({ ...prev, [client]: !prev[client] }));

  const TX4 = "#8A8A85"; // muted text (sidebar only)

  // Swipe to dismiss
  const touchRef = useRef(null);
  const handleTouchStart = (e) => { touchRef.current = e.touches[0].clientX; };
  const handleTouchEnd = (e) => {
    if (touchRef.current === null) return;
    const diff = e.changedTouches[0].clientX - touchRef.current;
    if (diff < -60) onClose(); // swipe left > 60px = close
    touchRef.current = null;
  };

  return (
    <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} style={{ position: "fixed", left: 0, top: 0, bottom: 0, width: 264, background: SB, borderRight: `1px solid ${SBB}`, display: "flex", flexDirection: "column", zIndex: 100, transform: open ? "translateX(0)" : "translateX(-264px)", transition: "transform 0.25s ease" }}>

      {/* ── Branding + collapse ── */}
      <div style={{ padding: "16px 18px 14px", borderBottom: `1px solid ${SBB}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/icon-512.png" alt="ArchiPilot" style={{ width: 36, height: 36, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ color: "#4A3428", fontSize: 14, fontWeight: 800, letterSpacing: "0.5px", fontFamily: "'Manrope', 'Inter', sans-serif", textTransform: "uppercase" }}>ArchiPilot</div>
            <div style={{ color: TX3, fontSize: 10, marginTop: 1 }}>{t("app.tagline")}</div>
          </div>
          <button onClick={onClose} title="Réduire la barre latérale" style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.15s" }} onMouseEnter={e => e.currentTarget.style.background = SB2} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            <Ico name="back" size={14} color={TX3} />
          </button>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 10px 10px" }}>

        {/* CTA Nouveau projet — pleine largeur */}
        <button onClick={onNewProject} className="sb-cta" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 0", border: "none", borderRadius: 8, background: AC, cursor: "pointer", fontFamily: "inherit", marginBottom: 16 }}>
          <Ico name="plus" size={13} color="#fff" />
          <span style={{ fontSize: 12, fontWeight: 700, color: "#fff", letterSpacing: "0.01em" }}>{t("sidebar.newProject")}</span>
        </button>

        {/* Navigation — Dashboard + Planning */}
        <div style={{ display: "flex", gap: 4, marginBottom: SP.md }}>
          {[
            { id: "stats", label: "Dashboard", icon: "chart", onClick: onStats },
            { id: "planningDashboard", label: "Planning", icon: "calendar", onClick: onPlanning },
          ].map(btn => {
            const isAct = view === btn.id;
            return (
              <button key={btn.id} onClick={btn.onClick} className="sb-nav" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: `${SP.sm - 1}px ${SP.xs}px`, border: "none", borderRadius: RAD.sm, cursor: "pointer", fontFamily: "inherit", background: isAct ? WH : "transparent", boxShadow: isAct ? "0 1px 3px rgba(0,0,0,0.06)" : "none", transition: "background 0.15s" }}>
                <Ico name={btn.icon} size={13} color={isAct ? AC : TX3} />
                <span style={{ fontSize: FS.sm, fontWeight: isAct ? 600 : 500, color: isAct ? AC : TX2 }}>{btn.label}</span>
              </button>
            );
          })}
        </div>

        {/* Section header + mode de vue */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: `0 ${SP.xs}px`, marginBottom: SP.sm }}>
          <div style={{ display: "flex", alignItems: "center", gap: SP.xs }}>
            <span style={{ fontSize: FS.xs, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: TX2 }}>{t("sidebar.projects")}</span>
            {/* Collapse all — visible en mode client avec 2+ groupes */}
            {sortBy === "client" && clientGroups && Object.keys(clientGroups).length > 1 && (
              <button onClick={() => {
                const allCollapsed = Object.keys(clientGroups).every(c => collapsedClients[c]);
                setCollapsedClients(allCollapsed ? {} : Object.keys(clientGroups).reduce((a, c) => ({ ...a, [c]: true }), {}));
              }} title={Object.keys(clientGroups).every(c => collapsedClients[c]) ? "Tout déplier" : "Tout replier"} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: SP.xs }}>
                <Ico name={Object.keys(clientGroups).every(c => collapsedClients[c]) ? "chevron-down" : "chevron-up"} size={10} color={TX3} />
              </button>
            )}
          </div>
          <div style={{ display: "flex", background: SB2, borderRadius: RAD.sm, padding: 2, gap: 1 }}>
            {[
              { id: "client", icon: "folder", label: "Client" },
              { id: "recency", icon: "clock", label: "R\u00E9cents" },
              { id: "name", icon: null, label: "A\u2192Z" },
            ].map(s => (
              <button key={s.id} onClick={() => setSortBy(s.id)} style={{ display: "flex", alignItems: "center", gap: 3, padding: `3px ${RAD.sm}px`, border: "none", borderRadius: 5, background: sortBy === s.id ? WH : "transparent", cursor: "pointer", fontFamily: "inherit", boxShadow: sortBy === s.id ? "0 1px 2px rgba(0,0,0,0.08)" : "none", transition: "all 0.15s" }}>
                {s.icon && <Ico name={s.icon} size={FS.xs} color={sortBy === s.id ? AC : TX3} />}
                <span style={{ fontSize: 9, fontWeight: 600, color: sortBy === s.id ? AC : TX3 }}>{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Liste des projets */}
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {sortBy === "client" && clientGroups ? (
            Object.entries(clientGroups).map(([client, clientProjects], gi) => {
              const collapsed = collapsedClients[client];
              const hasActive = clientProjects.some(p => p.id === activeId);
              return (
                <div key={client} style={{ marginBottom: 2 }}>
                  {/* Separator between client groups */}
                  {gi > 0 && <div style={{ height: 1, background: SBB, margin: "6px 6px 6px 6px", opacity: 0.6 }} />}
                  {/* Client section header */}
                  <button onClick={() => toggleClient(client)} className="sb-client" style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 8,
                    padding: "7px 6px", border: "none", background: "transparent",
                    cursor: "pointer", fontFamily: "inherit", borderRadius: 6,
                  }}>
                    <Ico name={collapsed ? "chevron-right" : "chevron-down"} size={10} color={TX3} />
                    <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: hasActive ? TX : TX2, textAlign: "left", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: "-0.1px" }}>{client}</span>
                    <span style={{ fontSize: 9, color: TX4, fontWeight: 600, flexShrink: 0 }}>{clientProjects.length}</span>
                  </button>
                  {/* Projects in this client group */}
                  {!collapsed && (
                    <div style={{ marginLeft: 14, borderLeft: `2px solid ${hasActive ? ACL2 : SBB}`, paddingLeft: 0, transition: "border-color 0.2s" }}>
                      {clientProjects.map((p) => {
                        const st = getStatus(p.statusId);
                        const isAct = activeId === p.id;
                        const pvCount = (p.pvHistory || []).length;
                        return (
                          <button key={p.id} onClick={() => { onSelect(p.id); }} title={`${p.name} · ${st.label}${pvCount ? ` · ${pvCount} PV` : ""}`} className="sb-project" style={{
                            width: "100%", display: "flex", alignItems: "center", gap: 8,
                            padding: "7px 10px 7px 12px",
                            border: "none",
                            borderRadius: 7, cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                            background: isAct ? WH : "transparent",
                            boxShadow: isAct ? "0 1px 4px rgba(0,0,0,0.06)" : "none",
                            transition: "background 0.15s, box-shadow 0.15s", marginTop: 1,
                          }}>
                            <div style={{ width: 26, height: 26, borderRadius: 6, background: isAct ? st.bg : SB2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.15s" }}>
                              <Ico name="building" size={12} color={isAct ? st.color : TX4} />
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: 12, fontWeight: isAct ? 650 : 500, color: isAct ? TX : TX2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: "16px" }}>{p.name}</div>
                              <div style={{ fontSize: 9, color: isAct ? TX3 : TX4, marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                                <span style={{ fontSize: 9, fontWeight: 600, color: st.color, background: st.bg, padding: "1px 6px", borderRadius: 4, lineHeight: "14px" }}>{st.label}</span>
                                {pvCount > 0 && <span style={{ color: isAct ? AC : TX4, fontWeight: 600 }}>{pvCount} PV</span>}
                              </div>
                            </div>
                            {isAct && <div style={{ width: 5, height: 5, borderRadius: "50%", background: AC, flexShrink: 0 }} />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            sortedActive.map((p) => {
              const st = getStatus(p.statusId);
              const isActive = activeId === p.id;
              const pvCount = (p.pvHistory || []).length;
              return (
                <button
                  key={p.id}
                  onClick={() => { onSelect(p.id); }}
                  title={`${p.name} · ${p.client || ""} · ${st.label}${pvCount ? ` · ${pvCount} PV` : ""}`}
                  className="sb-project"
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 9,
                    padding: isActive ? "9px 10px 9px 10px" : "8px 10px 8px 12px",
                    border: "none",
                    borderLeft: isActive ? `3px solid ${AC}` : "3px solid transparent",
                    borderRadius: 8, cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                    background: isActive ? WH : "transparent",
                    boxShadow: isActive ? "0 1px 5px rgba(0,0,0,0.06)" : "none",
                    transition: "background 0.15s, box-shadow 0.15s",
                  }}
                >
                  <div style={{ width: 30, height: 30, borderRadius: 7, background: isActive ? st.bg : SB2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.15s" }}>
                    <Ico name="building" size={14} color={isActive ? st.color : TX4} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: isActive ? 650 : 500, color: isActive ? TX : TX2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: "17px" }}>{p.name}</div>
                    <div style={{ fontSize: 10, color: isActive ? TX3 : TX4, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 4 }}>
                      <span>{p.client}</span>
                      {pvCount > 0 && <span style={{ color: isActive ? AC : TX4, fontWeight: 600 }}>&middot; {pvCount} PV</span>}
                    </div>
                  </div>
                  {isActive && (
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: AC, flexShrink: 0 }} />
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Section Partagés */}
        {sharedProjects && sharedProjects.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 4px", marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: TX2 }}>{t("collab.sharedWithMe")}</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: TX3, background: SB2, padding: "1px 6px", borderRadius: 10 }}>{sharedProjects.length}</span>
            </div>
            {sharedProjects.map((p) => (
              <button key={`shared-${p._ownerId}-${p.id}`} onClick={() => { onSelectShared(p); }} className="sb-project" style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "7px 10px 7px 12px", border: "none", borderLeft: "3px solid transparent", borderRadius: 8, cursor: "pointer", textAlign: "left", fontFamily: "inherit", background: "transparent", marginTop: 1, transition: "background 0.15s" }}>
                <div style={{ width: 28, height: 28, borderRadius: 7, background: ACL, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Ico name="users" size={13} color={AC} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 12, color: TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>{p.name}</span>
                  <span style={{ fontSize: 10, color: TX4 }}>{t(`collab.role${p._role.charAt(0).toUpperCase() + p._role.slice(1)}`)}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Section Archivés — masquée si vide */}
        {archived.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <button
              onClick={() => setArchivedOpen((v) => !v)}
              className="sb-client"
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 4px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", borderRadius: 6 }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: TX2 }}>{t("sidebar.archived")}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: TX4, background: SB2, padding: "1px 6px", borderRadius: 10 }}>{archived.length}</span>
              </div>
              <Ico name={archivedOpen ? "chevron-up" : "chevron-down"} size={11} color={TX3} />
            </button>

            {archivedOpen && archived.map((p) => (
              <button key={p.id} onClick={() => { onSelect(p.id); }} className="sb-project" style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "7px 10px 7px 12px", border: "none", borderLeft: "3px solid transparent", borderRadius: 8, cursor: "pointer", textAlign: "left", fontFamily: "inherit", background: "transparent", marginTop: 1, transition: "background 0.15s" }}>
                <div style={{ width: 28, height: 28, borderRadius: 7, background: SB2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: 0.6 }}>
                  <Ico name="archive" size={13} color={TX3} />
                </div>
                <span style={{ fontSize: 12, color: TX3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
              </button>
            ))}
          </div>
        )}

      </div>

      {/* ── Installer PWA ── */}
      {installable && (
        <div style={{ padding: "0 10px 10px", flexShrink: 0 }}>
          <button onClick={onInstall} style={{ width: "100%", padding: "9px 12px", border: `1px solid ${ACL2}`, borderRadius: 8, background: ACL, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontFamily: "inherit" }}>
            <Ico name="install" size={14} color={AC} />
            <div style={{ flex: 1, textAlign: "left" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: AC }}>{t("sidebar.install")}</div>
              <div style={{ fontSize: 10, color: TX3, marginTop: 1 }}>{t("sidebar.installDesc")}</div>
            </div>
          </button>
        </div>
      )}

      {/* ── Footer : profil + déconnexion ── */}
      <div style={{ padding: "10px 10px 12px", flexShrink: 0, borderTop: `1px solid ${SBB}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "0 4px" }}>
          {/* Avatar — cliquable vers profil */}
          <button onClick={onProfile} aria-label="Mon profil" className="sb-avatar" style={{ width: 32, height: 32, borderRadius: "50%", background: ACL, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 11, fontWeight: 700, color: AC, border: `2px solid transparent`, cursor: "pointer", transition: "border-color 0.15s", padding: 0, fontFamily: "inherit" }}>
            {(profile?.name || "?").split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
          </button>
          {/* Nom + structure — cliquable vers profil */}
          <button onClick={onProfile} className="sb-profile-text" style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", cursor: "pointer", textAlign: "left", padding: 0, fontFamily: "inherit" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: "16px" }}>{profile?.name || "Mon profil"}</div>
            <div style={{ fontSize: 10, color: TX4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: "14px" }}>{profile?.structure || ""}</div>
          </button>
          {/* Logout — icône, toggle confirm */}
          <button onClick={() => setLogoutConfirm(v => !v)} aria-label="Se déconnecter" className="sb-logout-icon" title={t("sidebar.logout")} style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: logoutConfirm ? SB2 : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0, transition: "background 0.15s" }}>
            <Ico name="logout" size={14} color={logoutConfirm ? RD : TX3} />
          </button>
        </div>
        {/* Confirmation de déconnexion */}
        {logoutConfirm && (
          <div style={{ display: "flex", gap: 6, marginTop: 8, padding: "0 4px", animation: "fadeIn 0.15s ease-out" }}>
            <button onClick={() => setLogoutConfirm(false)} style={{ flex: 1, padding: "7px 0", border: `1px solid ${SBB}`, borderRadius: 6, background: WH, cursor: "pointer", fontSize: 11, fontWeight: 500, color: TX2, fontFamily: "inherit", transition: "background 0.15s" }}>
              Annuler
            </button>
            <button onClick={() => supabase.auth.signOut()} style={{ flex: 1, padding: "7px 0", border: "none", borderRadius: 6, background: RD, cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#fff", fontFamily: "inherit", transition: "background 0.15s" }}>
              Se déconnecter
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
