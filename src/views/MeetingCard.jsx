import { useState } from "react";
import { useT } from "../i18n";
import { AC, ACL, ACL2, SB, SBB, TX, TX2, TX3, WH, RD, BL, VI } from "../constants/tokens";
import { Ico } from "../components/ui";
import { daysUntil, calcNextMeeting, parseDateFR } from "../utils/dates";
import { getGoogleCalendarUrl, downloadICS } from "../utils/csv";

// Convert dd/mm/yyyy → yyyy-mm-dd for input[type=date]
const toISO = (fr) => {
  if (!fr) return "";
  const d = parseDateFR(fr);
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
// Convert yyyy-mm-dd → dd/mm/yyyy
const toFR = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

export const MEETING_MODES = [
  { id: "onsite", label: "Sur site", icon: "building", color: AC },
  { id: "remote", label: "À distance", icon: "users", color: BL },
  { id: "hybrid", label: "Hybride", icon: "repeat", color: VI },
];

export function MeetingCard({ project, setProjects, rec }) {
  const [editing, setEditing] = useState(false);
  const [dateVal, setDateVal] = useState(project.nextMeeting || "");
  const meetingMode = project.meetingMode || "onsite";
  const t = useT();

  const update = (patch) => setProjects(prev => prev.map(p => p.id === project.id ? { ...p, ...patch } : p));
  const days = daysUntil(project.nextMeeting);
  const isPast = days !== null && days < 0;
  const isToday = days === 0;
  const isSoon = days !== null && days > 0 && days <= 2;
  const mode = MEETING_MODES.find(m => m.id === meetingMode) || MEETING_MODES[0];
  const suggested = rec && rec.id !== "none" ? calcNextMeeting(project.nextMeeting, project.recurrence) : null;

  const Card = ({ children, style = {} }) => (
    <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 12, padding: "16px 18px", ...style }}>{children}</div>
  );

  return (
    <Card style={{ background: project.nextMeeting ? ACL : WH, border: `1px solid ${project.nextMeeting ? ACL2 : SBB}` }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: AC, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>{t("project.nextMeeting")}</div>

      {editing ? (
        <div>
          {/* Date picker */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 500, color: TX2, display: "block", marginBottom: 4 }}>Date</label>
            <input
              type="date" value={toISO(dateVal)} onChange={e => setDateVal(toFR(e.target.value))}
              autoFocus
              style={{ width: "100%", padding: "8px 10px", border: `1px solid ${SBB}`, borderRadius: 6, fontSize: 13, fontFamily: "inherit", background: WH, color: TX, boxSizing: "border-box", cursor: "pointer" }}
            />
          </div>
          {/* Meeting mode */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 500, color: TX2, display: "block", marginBottom: 4 }}>Format</label>
            <div style={{ display: "flex", gap: 4 }}>
              {MEETING_MODES.map(m => (
                <button key={m.id} onClick={() => update({ meetingMode: m.id })} style={{
                  flex: 1, padding: "6px 8px", border: `1.5px solid ${meetingMode === m.id ? m.color : SBB}`,
                  borderRadius: 6, background: meetingMode === m.id ? m.color + "14" : WH,
                  cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                }}>
                  <Ico name={m.icon} size={10} color={meetingMode === m.id ? m.color : TX3} />
                  <span style={{ fontSize: 10, fontWeight: 600, color: meetingMode === m.id ? m.color : TX3 }}>{m.label}</span>
                </button>
              ))}
            </div>
          </div>
          {/* Recurrence quick display */}
          {rec && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 10, fontSize: 10, color: TX3 }}>
              <Ico name="repeat" size={10} color={TX3} />
              {rec.label}
            </div>
          )}
          {/* Save / Cancel */}
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => { update({ nextMeeting: dateVal }); setEditing(false); }} style={{ flex: 1, padding: "7px 12px", border: "none", borderRadius: 6, background: AC, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Enregistrer</button>
            <button onClick={() => { setDateVal(project.nextMeeting || ""); setEditing(false); }} style={{ padding: "7px 12px", border: `1px solid ${SBB}`, borderRadius: 6, background: WH, color: TX3, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Annuler</button>
          </div>
        </div>
      ) : (
        <div>
          {/* Date display */}
          {project.nextMeeting ? (
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 20, fontWeight: 700, color: TX, letterSpacing: "-0.5px", lineHeight: 1.2 }}>{project.nextMeeting}</span>
                {isToday && <span style={{ fontSize: 11, fontWeight: 700, color: AC, background: WH, padding: "2px 8px", borderRadius: 10 }}>Aujourd'hui</span>}
                {isSoon && <span style={{ fontSize: 11, fontWeight: 600, color: AC }}>dans {days}j</span>}
                {isPast && <span style={{ fontSize: 11, fontWeight: 600, color: RD }}>passée ({Math.abs(days)}j)</span>}
                {days !== null && days > 2 && <span style={{ fontSize: 11, color: TX3 }}>dans {days} jours</span>}
              </div>
              {/* Mode badge */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", background: WH, border: `1px solid ${mode.color}22`, borderRadius: 6 }}>
                  <Ico name={mode.icon} size={10} color={mode.color} />
                  <span style={{ fontSize: 10, fontWeight: 600, color: mode.color }}>{mode.label}</span>
                </div>
                {rec && rec.id !== "none" && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                    <Ico name="repeat" size={10} color={TX3} />
                    <span style={{ fontSize: 10, color: TX3 }}>{rec.label}</span>
                  </div>
                )}
                {rec && rec.id === "none" && (
                  <span style={{ fontSize: 10, color: TX3 }}>Ponctuel</span>
                )}
              </div>
              {/* Suggest next if past */}
              {isPast && suggested && (
                <button onClick={() => { update({ nextMeeting: suggested }); setDateVal(suggested); }} style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", border: `1px solid ${AC}`, borderRadius: 6, background: WH, cursor: "pointer", fontFamily: "inherit", fontSize: 10, fontWeight: 600, color: AC, width: "100%" }}>
                  <Ico name="repeat" size={10} color={AC} />Planifier la prochaine : {suggested}
                </button>
              )}
            </div>
          ) : (
            <span style={{ fontSize: 14, color: TX3, fontWeight: 400 }}>{t("project.notPlanned")}</span>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button onClick={() => { setDateVal(project.nextMeeting || ""); setEditing(true); }} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "6px 10px", border: `1px solid ${ACL2}`, borderRadius: 6, background: WH, fontSize: 10, fontWeight: 600, color: AC, cursor: "pointer", fontFamily: "inherit" }}>
              <Ico name="edit" size={11} color={AC} />{project.nextMeeting ? "Modifier" : "Planifier"}
            </button>
            {project.nextMeeting && getGoogleCalendarUrl(project) && (
              <a href={getGoogleCalendarUrl(project)} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "6px 10px", border: `1px solid ${ACL2}`, borderRadius: 6, background: WH, fontSize: 10, fontWeight: 600, color: AC, textDecoration: "none" }}>
                <Ico name="calendar" size={10} color={AC} />Cal
              </a>
            )}
            {project.nextMeeting && (
              <button onClick={() => downloadICS(project)} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "6px 10px", border: `1px solid ${ACL2}`, borderRadius: 6, background: WH, fontSize: 10, fontWeight: 600, color: AC, cursor: "pointer", fontFamily: "inherit" }}>
                <Ico name="download" size={10} color={AC} />.ics
              </button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
