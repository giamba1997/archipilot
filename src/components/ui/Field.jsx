import { SP, SBB, RAD, FS, SB, TX, TX2, RD, LH } from "../../constants/tokens";

export function Field({ label, value, onChange, area, half, type = "text", placeholder, select, options, required }) {
  const base = { width: "100%", padding: area ? SP.md : `${SP.sm + 1}px ${SP.md}px`, border: `1px solid ${SBB}`, borderRadius: RAD.md, fontSize: 14, fontFamily: "inherit", background: SB, color: TX, boxSizing: "border-box", lineHeight: LH.normal };
  const hasValue = value && value.trim();
  let error = null;
  if (hasValue && type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim())) error = "Email invalide";
  if (hasValue && type === "tel" && value.trim().length > 0 && value.trim().length < 8) error = "Numéro trop court";
  if (required && !hasValue) error = null;
  const borderColor = error ? RD : SBB;
  return (
    <div style={{ flex: half ? 1 : undefined, marginBottom: SP.md }}>
      {label && <div style={{ fontSize: FS.base, fontWeight: 500, color: TX2, marginBottom: SP.xs }}>{label}{required ? <span style={{ color: RD, marginLeft: 2 }}>*</span> : ""}</div>}
      {select ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...base, appearance: "auto" }}>
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      ) : area ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={4} placeholder={placeholder} style={{ ...base, resize: "vertical", lineHeight: LH.relaxed, borderColor }} />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ ...base, borderColor }} />
      )}
      {error && <div style={{ fontSize: FS.xs, color: RD, marginTop: SP.xs - 1 }}>{error}</div>}
    </div>
  );
}
