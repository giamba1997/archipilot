import { useState, useRef, useEffect } from "react";
import { tokens } from "../design/tokens";
import { PLANS, STRUCTURE_TYPES } from "../constants/config";
import { exportUserData, deleteAccount } from "../db";
import { supabase } from "../supabase";
import { MfaSection } from "../views/MfaSection";

// ─────────────────────────────────────────────────────────────
// Compte (v2 · Direction D) — sous-nav + 7 sections
//   Profil · Structure & facturation · Signature email · Abonnement
//   · Sécurité · Notifications · Données & RGPD
// ─────────────────────────────────────────────────────────────

const Svg = ({ d, size = 18, sw = 1.7, fill = "none" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d.split("|").map((p, i) => <path key={i} d={p} />)}
  </svg>
);
const ICONS = {
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M4 21a8 8 0 0 1 16 0",
  building: "M3 21h18|M5 21V7l8-4v18|M19 21V11l-6-4",
  send: "m22 2-7 20-4-9-9-4z",
  card: "M2 5h20v14H2z|M2 10h20",
  lock: "M3 11h18v11H3z|M7 11V7a5 5 0 0 1 10 0v4",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9|M13.7 21a2 2 0 0 1-3.4 0",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6",
  check: "M20 6 9 17l-5-5",
  spark: "M12 3l1.9 6.1L20 11l-6.1 1.9L12 19l-1.9-6.1L4 11l6.1-1.9z",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4|M7 10l5 5 5-5|M12 15V3",
  trash: "M3 6h18|M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2|M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  chevron: "M9 6l6 6-6 6",
  edit: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7|M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z",
};

const NAV = [
  { id: "profil", label: "Profil", icon: "user" },
  { id: "structure", label: "Structure & facturation", icon: "building" },
  { id: "signature", label: "Signature email", icon: "send" },
  { id: "abonnement", label: "Abonnement", icon: "card" },
  { id: "securite", label: "Sécurité", icon: "lock" },
  { id: "notifications", label: "Notifications", icon: "bell" },
  { id: "donnees", label: "Données & RGPD", icon: "file" },
];

const initials = (n) => (n || "?").trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase() || "?";

const MOCK_PROFILE = {
  name: "Gaëlle Dupont", structure: "Atelier d'architecture GD", structureType: "architecte",
  address: "Rue de la Station 14, 1400 Nivelles", phone: "+32 478 12 34 56", email: "gaelle.dupont@atelier-gd.be",
  vatNumber: "BE 0712.345.678", iban: "BE68 5390 0754 7034", bic: "GKCCBEBB", vatRate: "21",
  invoicePaymentTermsDays: 30, invoicePrefix: "2026-", ordreNumber: "A-04521",
  invoicePaymentNote: "En cas de retard de paiement, un intérêt de 8 % l'an sera appliqué de plein droit. TVA acquittée sur les encaissements. Assurance RC professionnelle — Protect SA, police n° 4521-887.",
  plan: "pro", emailSignature: "",
  alertSettings: { reserve_overdue: true, permit_deadline: true, invoice_overdue: false, reception_definitive: true, task_overdue: true, no_pv_30d: false },
  pushSettings: { enabled: true, opr: true, permits: true, reserves: false, invoices: true, collab: true },
};

// ── Primitives ────────────────────────────────────────────────
function Card({ children, style }) {
  return <div style={{ background: tokens.color.neutral[0], border: `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.xl, padding: tokens.space[5], ...style }}>{children}</div>;
}
function CardTitle({ children, right }) {
  return <div style={{ display: "flex", alignItems: "center", marginBottom: tokens.space[4] }}><span style={{ fontSize: tokens.font.size.base, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[900] }}>{children}</span>{right && <span style={{ marginLeft: "auto" }}>{right}</span>}</div>;
}
function Field({ label, value, onChange, mono, type = "text", placeholder, options, textarea }) {
  const base = { width: "100%", boxSizing: "border-box", border: `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.md, background: tokens.color.neutral[0], padding: `0 ${tokens.space[3]}`, fontFamily: mono ? "ui-monospace, monospace" : "inherit", fontSize: tokens.font.size.sm, color: tokens.color.neutral[900], outline: "none" };
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[500], marginBottom: 5 }}>{label}</div>
      {options ? (
        <select value={value || ""} onChange={e => onChange(e.target.value)} style={{ ...base, height: 38, cursor: "pointer" }}>
          {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      ) : textarea ? (
        <textarea value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ ...base, padding: tokens.space[3], minHeight: 72, lineHeight: 1.5, resize: "vertical" }} />
      ) : (
        <input type={type} value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ ...base, height: 38 }} />
      )}
    </label>
  );
}
function Toggle({ on, onClick }) {
  return (
    <button onClick={onClick} aria-pressed={on} style={{ width: 38, height: 22, borderRadius: tokens.radius.full, border: "none", background: on ? tokens.color.brand[500] : tokens.color.neutral[300], position: "relative", cursor: "pointer", flexShrink: 0, transition: tokens.transition.base }}>
      <span style={{ position: "absolute", top: 2, left: on ? 18 : 2, width: 18, height: 18, borderRadius: tokens.radius.full, background: "#fff", transition: tokens.transition.base, boxShadow: tokens.shadow.sm }} />
    </button>
  );
}
function Btn({ children, onClick, variant = "secondary", size = "md", disabled, danger, leftIcon }) {
  const h = size === "sm" ? 30 : 36;
  const v = danger
    ? { background: tokens.color.neutral[0], border: `1px solid ${tokens.color.semantic.danger.border}`, color: tokens.color.semantic.danger.fg }
    : variant === "primary"
    ? { background: tokens.color.brand[500], border: "none", color: "#fff" }
    : variant === "ghost"
    ? { background: "transparent", border: "none", color: tokens.color.neutral[700] }
    : { background: tokens.color.neutral[0], border: `1px solid ${tokens.color.neutral[200]}`, color: tokens.color.neutral[700] };
  return <button onClick={onClick} disabled={disabled} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, height: h, padding: `0 ${tokens.space[4]}`, borderRadius: tokens.radius.md, fontFamily: "inherit", fontSize: tokens.font.size.sm, fontWeight: variant === "primary" || danger ? tokens.font.weight.semibold : tokens.font.weight.medium, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.55 : 1, ...v }}>{leftIcon}{children}</button>;
}
const Hint = ({ children }) => <div style={{ fontSize: tokens.font.size.sm, color: tokens.color.neutral[500], lineHeight: 1.5, marginBottom: tokens.space[4] }}>{children}</div>;
const SubLabel = ({ children }) => <div style={{ fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[500], textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: tokens.space[3] }}>{children}</div>;
const okBadge = (txt) => <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: tokens.font.size.xs, padding: "2px 9px", borderRadius: tokens.radius.full, background: tokens.color.semantic.success.bg, color: tokens.color.semantic.success.fg, border: `1px solid ${tokens.color.semantic.success.border}`, fontWeight: tokens.font.weight.medium }}><Svg d={ICONS.check} size={11} sw={3} />{txt}</span>;

// ─────────────────────────────────────────────────────────────
export function Account({ profile: profileProp, onSave, demo: demoProp }) {
  const demo = demoProp ?? !onSave;
  const profile = demo ? MOCK_PROFILE : (profileProp || {});
  const [section, setSection] = useState("profil");
  const [toast, setToast] = useState("");
  const saveRef = useRef(null);
  const save = (patch) => { if (demo) { setToast("Enregistré (démo)"); setTimeout(() => setToast(""), 1800); return; } onSave?.({ ...profile, ...patch }); setToast("Enregistré"); setTimeout(() => setToast(""), 1800); };
  const hasTopSave = section === "structure" || section === "signature";

  return (
    <div style={{ display: "flex", height: "100%", minHeight: "calc(100dvh - 58px)", fontFamily: tokens.font.family, color: tokens.color.neutral[900], background: tokens.color.neutral[50] }}>
      {/* Sous-nav */}
      <div style={{ width: 222, flexShrink: 0, background: tokens.color.neutral[0], borderRight: `1px solid ${tokens.color.neutral[200]}`, padding: `${tokens.space[5]} ${tokens.space[3]}`, display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
        <div style={{ fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[400], textTransform: "uppercase", letterSpacing: "0.05em", padding: `0 ${tokens.space[3]} ${tokens.space[3]}` }}>Compte</div>
        {NAV.map(n => {
          const a = n.id === section;
          return (
            <button key={n.id} onClick={() => setSection(n.id)} style={{ display: "flex", alignItems: "center", gap: tokens.space[3], padding: "10px 11px", borderRadius: tokens.radius.md, border: "none", borderLeft: a ? `3px solid ${tokens.color.brand[500]}` : "3px solid transparent", background: a ? tokens.color.brand[50] : "transparent", color: a ? tokens.color.neutral[900] : tokens.color.neutral[700], cursor: "pointer", fontFamily: "inherit", fontSize: tokens.font.size.sm, fontWeight: a ? tokens.font.weight.semibold : tokens.font.weight.medium, textAlign: "left" }}>
              <span style={{ color: a ? tokens.color.brand[600] : tokens.color.neutral[500], display: "inline-flex" }}><Svg d={ICONS[n.icon]} size={17} /></span>{n.label}
            </button>
          );
        })}
        {/* Déconnexion — toujours visible en bas de la sous-nav */}
        <button
          onClick={() => { if (demo) { setToast("Déconnexion (démo)"); setTimeout(() => setToast(""), 1800); return; } supabase.auth.signOut(); }}
          style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: tokens.space[3], padding: "10px 11px", borderRadius: tokens.radius.md, border: "none", borderLeft: "3px solid transparent", background: "transparent", color: tokens.color.semantic.danger.fg, cursor: "pointer", fontFamily: "inherit", fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.medium, textAlign: "left" }}
          onMouseEnter={e => { e.currentTarget.style.background = tokens.color.semantic.danger.bg; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
        >
          <span style={{ display: "inline-flex" }}><Svg d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9" size={17} /></span>Se déconnecter
        </button>
      </div>

      {/* Contenu */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: "#FCFBFA" }}>
        <div style={{ height: 54, flexShrink: 0, display: "flex", alignItems: "center", gap: tokens.space[3], padding: `0 ${tokens.space[6]}`, background: tokens.color.neutral[0], borderBottom: `1px solid ${tokens.color.neutral[200]}` }}>
          <span style={{ fontSize: tokens.font.size.sm, color: tokens.color.neutral[500] }}>Compte <span style={{ color: tokens.color.neutral[300] }}>/</span> <span style={{ color: tokens.color.neutral[900], fontWeight: tokens.font.weight.semibold }}>{NAV.find(n => n.id === section)?.label}</span></span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: tokens.space[3] }}>
            {toast && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: tokens.font.size.xs, color: tokens.color.semantic.success.fg }}><Svg d={ICONS.check} size={13} sw={3} />{toast}</span>}
            {hasTopSave && <Btn variant="primary" size="sm" onClick={() => saveRef.current?.()}>Enregistrer</Btn>}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: `${tokens.space[6]} ${tokens.space[8]}` }}>
          <div style={{ maxWidth: 980, margin: "0 auto" }}>
            {section === "profil" && <ProfilSection profile={profile} go={setSection} save={save} />}
            {section === "structure" && <StructureSection profile={profile} save={save} saveRef={saveRef} />}
            {section === "signature" && <SignatureSection profile={profile} save={save} saveRef={saveRef} />}
            {section === "abonnement" && <AbonnementSection profile={profile} save={save} demo={demo} />}
            {section === "securite" && <SecuriteSection profile={profile} demo={demo} setToast={setToast} />}
            {section === "notifications" && <NotificationsSection profile={profile} save={save} />}
            {section === "donnees" && <DonneesSection demo={demo} profile={profile} save={save} />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Profil (tableau de bord récap) ────────────────────────────
function Avatar({ pic, name, size = 72 }) {
  if (pic) return <img src={pic} alt="" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, display: "block" }} />;
  return <div style={{ width: size, height: size, borderRadius: "50%", background: `linear-gradient(135deg, ${tokens.color.brand[100]}, ${tokens.color.brand[200]})`, color: tokens.color.brand[700], display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(size * 0.36), fontWeight: tokens.font.weight.bold, flexShrink: 0 }}>{initials(name)}</div>;
}

function ProfilSection({ profile, go, save }) {
  const sigText = profile.emailSignature?.trim();
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState(profile);
  const [err, setErr] = useState("");
  const set = (k) => (v) => setF(s => ({ ...s, [k]: v }));
  const startEdit = () => { setF(profile); setErr(""); setEditing(true); };
  const onPhoto = (file) => {
    setErr("");
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { setErr("Image trop lourde (max 3 Mo)."); return; }
    const r = new FileReader();
    r.onload = e => setF(s => ({ ...s, picture: String(e.target.result || "") }));
    r.readAsDataURL(file);
  };
  const typeOpts = (STRUCTURE_TYPES || []).map(t => typeof t === "string" ? { id: t, label: t } : { id: t.id, label: t.label });
  const submit = () => { save({ name: f.name, picture: f.picture, structureType: f.structureType, email: f.email, phone: f.phone }); setEditing(false); };

  return (
    <>
      {editing ? (
        <Card style={{ marginBottom: tokens.space[6] }}>
          <CardTitle>Identité</CardTitle>
          <div style={{ display: "flex", gap: tokens.space[5], alignItems: "flex-start" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: tokens.space[2], flexShrink: 0 }}>
              <label style={{ position: "relative", cursor: "pointer", display: "block" }}>
                <Avatar pic={f.picture} name={f.name} size={88} />
                <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(28,25,23,0.45)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0, transition: tokens.transition.base, fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.semibold }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0}>Changer</span>
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => onPhoto(e.target.files?.[0])} />
              </label>
              {f.picture && <button onClick={() => setF(s => ({ ...s, picture: "" }))} style={{ background: "none", border: "none", color: tokens.color.neutral[500], fontSize: tokens.font.size.xs, cursor: "pointer", fontFamily: "inherit" }}>Retirer</button>}
            </div>
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: `${tokens.space[4]} ${tokens.space[6]}` }}>
              <Field label="Nom complet" value={f.name} onChange={set("name")} />
              <Field label="Rôle / type" value={f.structureType} onChange={set("structureType")} options={typeOpts.length ? typeOpts : [{ id: "architecte", label: "Architecte" }, { id: "bureau", label: "Bureau" }, { id: "ingénieur", label: "Ingénieur" }]} />
              <Field label="Email" value={f.email} onChange={set("email")} type="email" />
              <Field label="Téléphone" value={f.phone} onChange={set("phone")} />
            </div>
          </div>
          {err && <div style={{ fontSize: tokens.font.size.xs, color: tokens.color.semantic.danger.fg, marginTop: tokens.space[3] }}>{err}</div>}
          <div style={{ display: "flex", gap: tokens.space[2], justifyContent: "flex-end", marginTop: tokens.space[5] }}>
            <Btn variant="ghost" onClick={() => setEditing(false)}>Annuler</Btn>
            <Btn variant="primary" onClick={submit}>Enregistrer</Btn>
          </div>
        </Card>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: tokens.space[5], marginBottom: tokens.space[6] }}>
          <Avatar pic={profile.picture} name={profile.name} size={72} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: tokens.space[2], marginBottom: 3 }}>
              <h1 style={{ margin: 0, fontSize: tokens.font.size["2xl"], fontWeight: tokens.font.weight.bold, letterSpacing: "-0.5px", color: tokens.color.neutral[900] }}>{profile.name || "—"}</h1>
              <span style={{ fontSize: tokens.font.size.xs, padding: "2px 9px", borderRadius: tokens.radius.full, background: tokens.color.brand[50], color: tokens.color.brand[600], border: `1px solid ${tokens.color.brand[100]}`, fontWeight: tokens.font.weight.medium, textTransform: "capitalize" }}>{profile.structureType || "Architecte"}</span>
            </div>
            <div style={{ fontSize: tokens.font.size.base, color: tokens.color.neutral[500] }}>{[profile.email, profile.phone].filter(Boolean).join(" · ") || "—"}</div>
          </div>
          <Btn leftIcon={<Svg d={ICONS.edit} size={14} />} onClick={startEdit}>Modifier le profil</Btn>
        </div>
      )}

      <div style={{ display: "flex", gap: tokens.space[4], alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 380px", minWidth: 0, display: "flex", flexDirection: "column", gap: tokens.space[4] }}>
          <Card>
            <CardTitle right={okBadge("Conforme SEPA")}>Structure & facturation</CardTitle>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: `${tokens.space[4]} ${tokens.space[6]}` }}>
              {[["Agence", profile.structure], ["N° TVA", profile.vatNumber], ["Siège", profile.address], ["IBAN", profile.iban, true], ["N° d'ordre (OA)", profile.ordreNumber], ["Délai de paiement", profile.invoicePaymentTermsDays ? `${profile.invoicePaymentTermsDays} jours` : ""]].map(([k, v, mono], i) => (
                <div key={i}><div style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[400], marginBottom: 3 }}>{k}</div><div style={{ fontSize: tokens.font.size.sm, color: tokens.color.neutral[900], fontWeight: tokens.font.weight.medium, fontFamily: mono ? "ui-monospace, monospace" : "inherit" }}>{v || "—"}</div></div>
              ))}
            </div>
          </Card>
          <Card>
            <CardTitle right={<Btn size="sm" onClick={() => go("signature")}>Modifier</Btn>}>Signature email</CardTitle>
            <div style={{ border: `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.md, padding: tokens.space[4], background: "#FCFBFA", fontSize: tokens.font.size.sm, lineHeight: 1.5, color: tokens.color.neutral[700] }}
              dangerouslySetInnerHTML={{ __html: sigText || `Bien cordialement,<br><b style="color:${tokens.color.neutral[900]}">${profile.name || ""}</b><br>${profile.structureType || "Architecte"}${profile.structure ? " · " + profile.structure : ""}` }} />
          </Card>
        </div>

        <div style={{ width: 320, flexShrink: 0, display: "flex", flexDirection: "column", gap: tokens.space[4] }}>
          <div style={{ background: `linear-gradient(135deg, ${tokens.color.brand[500]}, ${tokens.color.brand[600]})`, borderRadius: tokens.radius.xl, padding: tokens.space[5], color: "#fff", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", right: -20, top: -20, width: 110, height: 110, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} />
            <div style={{ position: "relative" }}>
              <div style={{ display: "flex", alignItems: "center", gap: tokens.space[2], marginBottom: tokens.space[4] }}>
                <span style={{ fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.semibold, letterSpacing: "0.05em", textTransform: "uppercase", opacity: 0.85 }}>Abonnement</span>
                <span style={{ fontSize: 10, fontWeight: tokens.font.weight.bold, background: "rgba(255,255,255,0.2)", borderRadius: tokens.radius.full, padding: "2px 8px" }}>{(profile.plan || "free") === "free" ? "GRATUIT" : "ACTIF"}</span>
              </div>
              <div style={{ fontSize: tokens.font.size["2xl"], fontWeight: tokens.font.weight.bold, letterSpacing: "-0.5px" }}>Plan {PLANS[profile.plan]?.label || "Free"}</div>
              <div style={{ fontSize: tokens.font.size.sm, opacity: 0.85, marginBottom: tokens.space[4] }}>{(profile.plan || "free") === "free" ? "0 €/mois" : `${PLANS.pro.price} €/mois`}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: tokens.space[4] }}>
                {["Projets & PV illimités", "OPR, galerie, planning", "3 collaborateurs / projet"].map((f, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: tokens.font.size.sm }}><Svg d={ICONS.check} size={14} sw={2.4} />{f}</div>)}
              </div>
              <button onClick={() => go("abonnement")} style={{ width: "100%", height: 38, background: "#fff", color: tokens.color.brand[600], border: "none", borderRadius: tokens.radius.md, fontFamily: "inherit", fontWeight: tokens.font.weight.bold, fontSize: tokens.font.size.sm, cursor: "pointer" }}>Gérer l'abonnement</button>
            </div>
          </div>
          <Card style={{ padding: tokens.space[4] }}>
            <CardTitle>Sécurité</CardTitle>
            <Row onClick={() => go("securite")} icon="lock" label="Mot de passe" right={<span style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[400] }}>Modifié récemment</span>} />
            <Row onClick={() => go("securite")} icon="shield" label="Double authentification" right={okBadge("Activée")} />
          </Card>
          <Card style={{ padding: tokens.space[4] }}>
            <CardTitle>Notifications</CardTitle>
            <Row onClick={() => go("notifications")} label="Préférences d'alertes" right={<Svg d={ICONS.chevron} size={15} />} />
          </Card>
        </div>
      </div>
    </>
  );
}
function Row({ icon, label, right, onClick }) {
  return (
    <button onClick={onClick} style={{ width: "100%", display: "flex", alignItems: "center", gap: tokens.space[3], padding: "9px 6px", border: "none", background: "transparent", cursor: onClick ? "pointer" : "default", fontFamily: "inherit", textAlign: "left", borderRadius: tokens.radius.md }}>
      {icon && <span style={{ color: tokens.color.neutral[500], display: "inline-flex" }}><Svg d={ICONS[icon]} size={16} /></span>}
      <span style={{ flex: 1, fontSize: tokens.font.size.sm, color: tokens.color.neutral[700] }}>{label}</span>
      {right}
    </button>
  );
}

// ── Structure & facturation ───────────────────────────────────
const LEGAL_FORMS = ["Indépendant / personne physique", "SRL", "SA", "SC", "SNC", "ASBL", "Autre"].map(x => ({ id: x, label: x }));
function StructureSection({ profile, save, saveRef }) {
  const [f, setF] = useState(profile);
  const [err, setErr] = useState("");
  const set = (k) => (v) => setF(s => ({ ...s, [k]: v }));
  if (saveRef) saveRef.current = () => save(f);
  const onLogo = (file) => {
    setErr("");
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setErr("Logo trop lourd (max 2 Mo)."); return; }
    const r = new FileReader();
    r.onload = e => setF(s => ({ ...s, logo: String(e.target.result || "") }));
    r.readAsDataURL(file);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: tokens.space[4] }}>
      <Card>
        <CardTitle>Identité de l'agence</CardTitle>
        <div style={{ display: "flex", gap: tokens.space[5], alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: tokens.space[2], flexShrink: 0 }}>
            <label style={{ width: 96, height: 96, borderRadius: tokens.radius.lg, border: `1px dashed ${tokens.color.brand[200]}`, background: f.logo ? tokens.color.neutral[0] : "repeating-linear-gradient(45deg, #F3E9E1, #F3E9E1 8px, #EDE0D5 8px, #EDE0D5 16px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: tokens.color.brand[400], gap: 5, cursor: "pointer", overflow: "hidden" }}>
              {f.logo
                ? <img src={f.logo} alt="logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                : <><Svg d="M3 5h18v14H3z|M8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3|m21 16-5-5L5 21" size={20} sw={1.5} /><span style={{ fontFamily: "ui-monospace, monospace", fontSize: 9 }}>logo</span></>}
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => onLogo(e.target.files?.[0])} />
            </label>
            {f.logo && <button onClick={() => setF(s => ({ ...s, logo: "" }))} style={{ background: "none", border: "none", color: tokens.color.neutral[500], fontSize: tokens.font.size.xs, cursor: "pointer", fontFamily: "inherit" }}>Retirer</button>}
          </div>
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: `${tokens.space[4]} ${tokens.space[6]}` }}>
            <Field label="Nom de l'agence" value={f.structure} onChange={set("structure")} />
            <Field label="Forme juridique" value={f.legalForm} onChange={set("legalForm")} options={LEGAL_FORMS} />
            <Field label="N° d'ordre (Ordre des Architectes)" value={f.ordreNumber} onChange={set("ordreNumber")} placeholder="A-00000" />
            <Field label="Email de facturation" value={f.billingEmail} onChange={set("billingEmail")} type="email" placeholder="compta@…" />
            <div style={{ gridColumn: "1 / -1" }}><Field label="Siège (adresse de facturation)" value={f.address} onChange={set("address")} placeholder="Rue, n°, code postal, ville" /></div>
          </div>
        </div>
        {err && <div style={{ fontSize: tokens.font.size.xs, color: tokens.color.semantic.danger.fg, marginTop: tokens.space[3] }}>{err}</div>}
      </Card>
      <Card>
        <CardTitle right={okBadge("Factures conformes SEPA")}>Coordonnées bancaires & TVA</CardTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: `${tokens.space[4]} ${tokens.space[6]}` }}>
          <Field label="N° de TVA" value={f.vatNumber} onChange={set("vatNumber")} placeholder="BE 0000.000.000" />
          <Field label="IBAN" value={f.iban} onChange={set("iban")} mono placeholder="BE00 0000 0000 0000" />
          <Field label="BIC" value={f.bic} onChange={set("bic")} mono />
          <Field label="Taux de TVA par défaut (%)" value={f.vatRate} onChange={set("vatRate")} />
          <Field label="Délai de paiement (jours)" value={f.invoicePaymentTermsDays} onChange={v => set("invoicePaymentTermsDays")(Number(v) || "")} type="number" />
          <Field label="Préfixe de numérotation" value={f.invoicePrefix} onChange={set("invoicePrefix")} placeholder="2026-" />
        </div>
      </Card>
      <Card>
        <CardTitle>Mentions en pied de facture</CardTitle>
        <Field label="" value={f.invoicePaymentNote} onChange={set("invoicePaymentNote")} textarea placeholder="Conditions de paiement, intérêts de retard, assurance RC…" />
      </Card>
    </div>
  );
}

// ── Signature email ───────────────────────────────────────────
// Redimensionne une image (logo) à une taille standard côté app, quel que soit
// le fichier fourni : on garde le ratio, on borne à maxW×maxH, export PNG.
const LOGO_MAX_W = 320, LOGO_MAX_H = 120;
function resizeImage(file, maxW = LOGO_MAX_W, maxH = LOGO_MAX_H) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = reject;
    r.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(maxW / img.width, maxH / img.height, 1);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL("image/png")); // PNG → transparence conservée
      };
      img.src = String(r.result || "");
    };
    r.readAsDataURL(file);
  });
}

function SignatureSection({ profile, save, saveRef }) {
  const ref = useRef(null);
  const fileRef = useRef(null);
  const initial = profile.emailSignature || `Bien cordialement,<br><br><b>${profile.name || ""}</b><br>${profile.structureType || "Architecte"}${profile.structure ? " · " + profile.structure : ""}<br>${[profile.phone, profile.email].filter(Boolean).join(" · ")}`;
  const [html, setHtml] = useState(initial);
  const [err, setErr] = useState("");
  // Initialise l'éditeur une seule fois (pas de re-set par React → pas de saut de curseur).
  useEffect(() => { if (ref.current) { ref.current.innerHTML = initial; } }, []); // eslint-disable-line
  const sync = () => setHtml(ref.current?.innerHTML || "");
  const exec = (cmd, arg) => { ref.current?.focus(); document.execCommand(cmd, false, arg); sync(); };
  const onImg = async (file) => {
    setErr("");
    if (!file) return;
    if (!file.type?.startsWith("image/")) { setErr("Choisis un fichier image (PNG, JPG, SVG…)."); return; }
    if (file.size > 10 * 1024 * 1024) { setErr("Fichier trop lourd (max 10 Mo)."); return; }
    try {
      const dataUrl = await resizeImage(file);
      ref.current?.focus();
      document.execCommand("insertImage", false, dataUrl);
      sync();
    } catch { setErr("Image illisible."); }
  };
  const tbtn = { width: 30, height: 30, borderRadius: tokens.radius.sm, border: `1px solid ${tokens.color.neutral[200]}`, background: tokens.color.neutral[0], color: tokens.color.neutral[700], cursor: "pointer", fontFamily: "inherit", fontSize: tokens.font.size.sm, display: "inline-flex", alignItems: "center", justifyContent: "center" };
  if (saveRef) saveRef.current = () => save({ emailSignature: html });
  return (
    <>
      <style>{`.sig-edit img,.sig-prev img{max-width:180px;max-height:60px;border-radius:6px;vertical-align:middle}`}</style>
      <Hint>Cette signature est ajoutée automatiquement aux PV, OPR et factures envoyés par email. <b style={{ color: tokens.color.neutral[700], fontWeight: 600 }}>Logo recommandé</b> : horizontal, ~320×100 px, PNG transparent — l'image est <b style={{ color: tokens.color.neutral[700], fontWeight: 600 }}>redimensionnée automatiquement</b> à une taille standard.</Hint>
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: tokens.space[4] }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, padding: `${tokens.space[2]} ${tokens.space[3]}`, borderBottom: `1px solid ${tokens.color.neutral[200]}`, background: "#FCFBFA" }}>
          {[["B", "bold", { fontWeight: 700 }], ["I", "italic", { fontStyle: "italic" }], ["U", "underline", { textDecoration: "underline" }]].map(([l, cmd, st]) => (
            <button key={cmd} onMouseDown={e => e.preventDefault()} onClick={() => exec(cmd)} title={l} style={{ ...tbtn, ...st }}>{l}</button>
          ))}
          <span style={{ width: 1, height: 18, background: tokens.color.neutral[200], margin: "0 4px" }} />
          <button onMouseDown={e => e.preventDefault()} onClick={() => fileRef.current?.click()} title="Insérer une image / un logo" style={tbtn}><Svg d={ICONS.image || "M3 5h18v14H3z|M8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3|m21 16-5-5L5 21"} size={15} /></button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => onImg(e.target.files?.[0])} />
        </div>
        <div ref={ref} className="sig-edit" contentEditable suppressContentEditableWarning onInput={sync} style={{ padding: tokens.space[4], fontSize: tokens.font.size.base, lineHeight: 1.6, color: tokens.color.neutral[700], outline: "none", minHeight: 120 }} />
      </Card>
      {err && <div style={{ fontSize: tokens.font.size.xs, color: tokens.color.semantic.danger.fg, marginTop: `-${tokens.space[3]}`, marginBottom: tokens.space[3] }}>{err}</div>}
      <SubLabel>Aperçu dans un email</SubLabel>
      <Card>
        <div style={{ fontSize: tokens.font.size.sm, color: tokens.color.neutral[700], lineHeight: 1.55, marginBottom: tokens.space[4], paddingBottom: tokens.space[4], borderBottom: `1px solid ${tokens.color.neutral[100]}` }}>Bonjour,<br />Veuillez trouver ci-joint le procès-verbal de la réunion.</div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: tokens.space[3] }}>
          <Avatar pic={profile.picture} name={profile.name} size={46} />
          <div className="sig-prev" style={{ fontSize: tokens.font.size.sm, lineHeight: 1.5, color: tokens.color.neutral[700] }} dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </Card>
    </>
  );
}

// ── Abonnement ────────────────────────────────────────────────
function AbonnementSection({ profile, save, demo }) {
  const cur = profile.plan || "free";
  const PLANS_UI = [
    { id: "free", name: "Free", price: "0 €", feats: ["1 projet", "3 PV / mois", "3 requêtes IA / mois"] },
    { id: "pro", name: "Pro", price: "39 €", per: "/mois", feats: ["Projets & PV illimités", "OPR · galerie · planning", "3 collaborateurs / projet"] },
    { id: "team", name: "Team", price: "89 €", per: "/mois", feats: ["Tout Pro, +", "Collaborateurs illimités · rôles", "Planning cross-projets · export CSV"], soon: true },
  ];
  const HIST = [["1 juin 2026", "39,00 €"], ["1 mai 2026", "39,00 €"], ["1 avril 2026", "39,00 €"]];
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: tokens.space[3], background: tokens.color.neutral[0], border: `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.lg, padding: tokens.space[4], marginBottom: tokens.space[5] }}>
        <div style={{ width: 42, height: 42, borderRadius: tokens.radius.lg, background: tokens.color.brand[50], color: tokens.color.brand[600], display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Svg d={ICONS.spark} size={22} fill="none" /></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.bold, color: tokens.color.neutral[900] }}>Plan {PLANS[cur]?.label || "Free"} · {cur === "free" ? "0 €/mois" : "39 €/mois"}</div>
          <div style={{ fontSize: tokens.font.size.sm, color: tokens.color.neutral[500] }}>{cur === "free" ? "Passe à Pro pour débloquer projets & PV illimités." : "Prochain prélèvement le 1er juillet 2026 · carte •••• 4242"}</div>
        </div>
        {cur !== "free" && <Btn onClick={() => !demo && setToastSafe()}>Gérer le paiement</Btn>}
      </div>

      <SubLabel>Changer de formule</SubLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: tokens.space[4], marginBottom: tokens.space[5] }}>
        {PLANS_UI.map(p => {
          const active = p.id === cur;
          return (
            <div key={p.id} style={{ background: active ? tokens.color.brand[50] : tokens.color.neutral[0], border: active ? `1.5px solid ${tokens.color.brand[500]}` : `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.xl, padding: tokens.space[5], position: "relative" }}>
              {active && <span style={{ position: "absolute", top: 14, right: 14, fontSize: 10, fontWeight: tokens.font.weight.bold, color: "#fff", background: tokens.color.brand[500], borderRadius: tokens.radius.full, padding: "2px 9px" }}>ACTUEL</span>}
              <div style={{ fontSize: tokens.font.size.base, fontWeight: tokens.font.weight.bold, color: tokens.color.neutral[900], marginBottom: 4 }}>{p.name}</div>
              <div style={{ fontSize: tokens.font.size["2xl"], fontWeight: tokens.font.weight.bold, color: active ? tokens.color.brand[600] : tokens.color.neutral[900], letterSpacing: "-0.5px", marginBottom: tokens.space[4] }}>{p.price}{p.per && <span style={{ fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.medium, color: tokens.color.neutral[400] }}>{p.per}</span>}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: tokens.font.size.xs, color: tokens.color.neutral[600], marginBottom: tokens.space[4] }}>{p.feats.map((ft, i) => <div key={i}>{ft}</div>)}</div>
              {active
                ? <button disabled style={{ width: "100%", height: 34, background: tokens.color.neutral[0], border: `1px solid ${tokens.color.brand[200]}`, borderRadius: tokens.radius.md, color: tokens.color.brand[600], fontFamily: "inherit", fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.semibold }}>Formule actuelle</button>
                : p.soon
                ? <button disabled style={{ width: "100%", height: 34, background: tokens.color.neutral[0], border: `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.md, color: tokens.color.neutral[400], fontFamily: "inherit", fontSize: tokens.font.size.xs }}>Bientôt</button>
                : <button onClick={() => !demo && save({ plan: p.id })} style={{ width: "100%", height: 34, background: p.id === "pro" ? tokens.color.brand[500] : tokens.color.neutral[0], border: p.id === "pro" ? "none" : `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.md, color: p.id === "pro" ? "#fff" : tokens.color.neutral[600], fontFamily: "inherit", fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.semibold, cursor: "pointer" }}>{p.id === "free" ? "Rétrograder" : "Passer à Pro"}</button>}
            </div>
          );
        })}
      </div>

      <SubLabel>Historique de facturation</SubLabel>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {HIST.map(([d, amt], i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: tokens.space[4], padding: `${tokens.space[3]} ${tokens.space[5]}`, borderBottom: i < HIST.length - 1 ? `1px solid ${tokens.color.neutral[100]}` : "none" }}>
            <span style={{ flex: 1, fontSize: tokens.font.size.sm, color: tokens.color.neutral[900], fontWeight: tokens.font.weight.medium }}>{d} · Plan Pro</span>
            <span style={{ fontSize: tokens.font.size.sm, color: tokens.color.neutral[700], width: 80, textAlign: "right" }}>{amt}</span>
            {okBadge("Payé")}
            <button style={{ fontSize: tokens.font.size.xs, color: tokens.color.brand[600], background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", width: 64, textAlign: "right" }}>Reçu PDF</button>
          </div>
        ))}
      </Card>
    </>
  );
}
function setToastSafe() { /* placeholder pour 'Gérer le paiement' (Stripe portal) */ }

// ── Sécurité ──────────────────────────────────────────────────
function SecuriteSection({ profile, demo, setToast }) {
  const [pwSent, setPwSent] = useState(false);
  const changePw = async () => {
    if (demo || !profile.email) { setPwSent(true); return; }
    try { await supabase.auth.resetPasswordForEmail(profile.email, { redirectTo: window.location.origin }); } catch { /* ignore */ }
    setPwSent(true); setToast?.("Email de réinitialisation envoyé"); setTimeout(() => setToast?.(""), 2200);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: tokens.space[4] }}>
      <Card style={{ display: "flex", alignItems: "center", gap: tokens.space[4] }}>
        <div style={{ width: 42, height: 42, borderRadius: tokens.radius.lg, background: tokens.color.neutral[100], color: tokens.color.neutral[500], display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Svg d={ICONS.lock} size={20} /></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: tokens.font.size.base, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[900] }}>Mot de passe</div>
          <div style={{ fontSize: tokens.font.size.sm, color: tokens.color.neutral[400] }}>{pwSent ? "Email de réinitialisation envoyé — vérifie ta boîte." : "Reçois un lien sécurisé pour le modifier."}</div>
        </div>
        <Btn onClick={changePw}>Changer</Btn>
      </Card>
      <Card>
        <CardTitle>Double authentification (2FA)</CardTitle>
        <MfaSection />
      </Card>
      <Card>
        <CardTitle right={<Btn size="sm" danger>Déconnecter tout</Btn>}>Sessions actives</CardTitle>
        <div style={{ display: "flex", alignItems: "center", gap: tokens.space[3], padding: `${tokens.space[2]} 0` }}>
          <div style={{ width: 36, height: 36, borderRadius: tokens.radius.md, background: tokens.color.neutral[100], color: tokens.color.neutral[500], display: "flex", alignItems: "center", justifyContent: "center" }}><Svg d="M2 3h20v14H2z|M8 21h8|M12 17v4" size={18} /></div>
          <div style={{ flex: 1 }}><div style={{ fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.medium, color: tokens.color.neutral[900] }}>Cet appareil</div><div style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[400] }}>Navigateur · session actuelle</div></div>
          {okBadge("Actuelle")}
        </div>
      </Card>
    </div>
  );
}

// ── Notifications (matrice) ───────────────────────────────────
const NOTIF_ROWS = [
  { key: "opr", alert: "reserve_overdue", title: "Signatures OPR", desc: "Réserve signée, refusée ou OPR complété" },
  { key: "permits", alert: "permit_deadline", title: "Échéances de permis", desc: "Deadline à moins de 30 jours" },
  { key: "reserves", alert: "reserve_overdue", title: "Réserves en retard", desc: "Réserve non levée dont l'échéance approche" },
  { key: "invoices", alert: "invoice_overdue", title: "Factures impayées", desc: "Facture échue non réglée" },
  { key: "collab", alert: "task_overdue", title: "Collaboration", desc: "Invitation, commentaire, partage de projet" },
];
function NotificationsSection({ profile, save }) {
  const [alert, setAlert] = useState(profile.alertSettings || {});
  const [push, setPush] = useState(profile.pushSettings || {});
  const [email, setEmail] = useState(profile.emailDigest || {});
  const persist = (a, p, e) => save({ alertSettings: a, pushSettings: p, emailDigest: e });
  const toggle = (kind, key) => {
    if (kind === "bell") { const n = { ...alert, [key]: !alert[key] }; setAlert(n); persist(n, push, email); }
    if (kind === "push") { const n = { ...push, [key]: !push[key] }; setPush(n); persist(alert, n, email); }
    if (kind === "email") { const n = { ...email, [key]: !email[key] }; setEmail(n); persist(alert, push, n); }
  };
  return (
    <>
      <Hint>Choisis comment être prévenu pour chaque type d'événement. La cloche reste toujours active dans l'app.</Hint>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", padding: `${tokens.space[3]} ${tokens.space[5]}`, borderBottom: `1px solid ${tokens.color.neutral[200]}`, background: "#FCFBFA" }}>
          <span style={{ flex: 1, fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[500], textTransform: "uppercase", letterSpacing: "0.04em" }}>Événement</span>
          {["Cloche", "Push", "Email"].map(h => <span key={h} style={{ width: 72, textAlign: "center", fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[500], textTransform: "uppercase" }}>{h}</span>)}
        </div>
        {NOTIF_ROWS.map((r, i) => (
          <div key={r.key} style={{ display: "flex", alignItems: "center", padding: `${tokens.space[3]} ${tokens.space[5]}`, borderBottom: i < NOTIF_ROWS.length - 1 ? `1px solid ${tokens.color.neutral[100]}` : "none" }}>
            <div style={{ flex: 1 }}><div style={{ fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[900] }}>{r.title}</div><div style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[400] }}>{r.desc}</div></div>
            <span style={{ width: 72, display: "flex", justifyContent: "center" }}><Toggle on={alert[r.alert] !== false} onClick={() => toggle("bell", r.alert)} /></span>
            <span style={{ width: 72, display: "flex", justifyContent: "center" }}><Toggle on={!!push[r.key]} onClick={() => toggle("push", r.key)} /></span>
            <span style={{ width: 72, display: "flex", justifyContent: "center" }}><Toggle on={!!email[r.key]} onClick={() => toggle("email", r.key)} /></span>
          </div>
        ))}
      </Card>
      <div style={{ display: "flex", alignItems: "center", gap: tokens.space[3], marginTop: tokens.space[4], background: tokens.color.neutral[0], border: `1px solid ${tokens.color.neutral[200]}`, borderRadius: tokens.radius.lg, padding: tokens.space[4] }}>
        <Svg d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20|M12 16v-4|M12 8h.01" size={16} />
        <span style={{ flex: 1, fontSize: tokens.font.size.sm, color: tokens.color.neutral[500] }}>Les notifications push nécessitent l'app installée sur ton appareil.</span>
      </div>
    </>
  );
}

// ── Données & RGPD ────────────────────────────────────────────
function ConsentRow({ title, desc, on, onToggle, border }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: tokens.space[3], padding: `${tokens.space[3]} 0`, borderBottom: border ? `1px solid ${tokens.color.neutral[100]}` : "none" }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.medium, color: tokens.color.neutral[900] }}>{title}</div>
        <div style={{ fontSize: tokens.font.size.xs, color: tokens.color.neutral[400] }}>{desc}</div>
      </div>
      <Toggle on={on} onClick={onToggle} />
    </div>
  );
}
function DonneesSection({ demo, profile, save }) {
  const [exporting, setExporting] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [consents, setConsents] = useState(profile?.consents || { analytics: true, productEmails: false });
  const toggleConsent = (k) => { const n = { ...consents, [k]: !consents[k] }; setConsents(n); save?.({ consents: n }); };
  const doExport = async () => { if (demo) return; setExporting(true); try { await exportUserData(); } catch { /* ignore */ } setExporting(false); };
  const doDelete = async () => { if (demo || confirm !== "SUPPRIMER") return; setDeleting(true); try { await deleteAccount(); } catch { setDeleting(false); } };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: tokens.space[4] }}>
      <Card style={{ display: "flex", alignItems: "center", gap: tokens.space[4] }}>
        <div style={{ width: 42, height: 42, borderRadius: tokens.radius.lg, background: tokens.color.neutral[100], color: tokens.color.neutral[500], display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Svg d={ICONS.download} size={20} /></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: tokens.font.size.base, fontWeight: tokens.font.weight.semibold, color: tokens.color.neutral[900] }}>Exporter mes données</div>
          <div style={{ fontSize: tokens.font.size.sm, color: tokens.color.neutral[400] }}>Tous tes projets, PV, réserves et factures au format JSON (RGPD art. 20).</div>
        </div>
        <Btn onClick={doExport} disabled={exporting}>{exporting ? "Export…" : "Demander l'export"}</Btn>
      </Card>
      <Card>
        <CardTitle>Consentements</CardTitle>
        <ConsentRow title="Cookies de mesure d'audience" desc="Statistiques anonymes d'utilisation" on={consents.analytics !== false} onToggle={() => toggleConsent("analytics")} border />
        <ConsentRow title="Emails produit & nouveautés" desc="Au plus une fois par mois" on={!!consents.productEmails} onToggle={() => toggleConsent("productEmails")} />
      </Card>
      <Card style={{ padding: `${tokens.space[2]} ${tokens.space[3]}` }}>
        {[["Conditions générales d'utilisation", "file"], ["Politique de confidentialité", "shield"]].map(([l, ic], i) => (
          <Row key={i} icon={ic} label={l} right={<Svg d={ICONS.chevron} size={15} />} onClick={() => {}} />
        ))}
      </Card>
      <Card style={{ background: tokens.color.semantic.danger.bg, border: `1px solid ${tokens.color.semantic.danger.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: tokens.space[4] }}>
          <div style={{ width: 42, height: 42, borderRadius: tokens.radius.lg, background: tokens.color.neutral[0], color: tokens.color.semantic.danger.fg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Svg d={ICONS.trash} size={20} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: tokens.font.size.base, fontWeight: tokens.font.weight.semibold, color: "#991B1B" }}>Supprimer mon compte</div>
            <div style={{ fontSize: tokens.font.size.sm, color: "#B45454" }}>Action irréversible — tes projets et données seront définitivement effacés.</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: tokens.space[2], marginTop: tokens.space[4] }}>
          <input value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Tape SUPPRIMER pour confirmer" style={{ flex: 1, height: 36, padding: `0 ${tokens.space[3]}`, border: `1px solid ${tokens.color.semantic.danger.border}`, borderRadius: tokens.radius.md, fontFamily: "inherit", fontSize: tokens.font.size.sm, color: tokens.color.neutral[900], background: tokens.color.neutral[0], outline: "none" }} />
          <Btn danger disabled={confirm !== "SUPPRIMER" || deleting} onClick={doDelete}>{deleting ? "Suppression…" : "Supprimer le compte"}</Btn>
        </div>
      </Card>
    </div>
  );
}

export default Account;
