import { useState, useRef, useEffect } from "react";
import { useT } from "../i18n";
import { LangContext } from "../i18n";
import { supabase } from "../supabase";
import { AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, RD, GR, SP, FS, RAD, BL, BLB, DIS, DIST, LH } from "../constants/tokens";
import { PLANS, hasFeature, INIT_PROFILE, COLOR_PRESETS, FONT_OPTIONS, STRUCTURE_TYPES } from "../constants/config";
import { Ico, Field } from "../components/ui";
import { uploadPhoto, getPhotoUrl, track, exportUserData, deleteAccount, loadMyOrganizations } from "../db";
import { PricingSection } from "../components/modals/PricingSection";
import { MfaSection } from "./MfaSection";
import { PDFPreview } from "./PDFPreview";


const PROFILE_SECTIONS = [
  { id: "avatar", icon: "users", label: "Profil" },
  { id: "plan", icon: "chart", label: "Abonnement" },
  { id: "agency", icon: "users", label: "Mon agence" },
  { id: "account", icon: "mail", label: "Compte" },
  { id: "security", icon: "lock", label: "Sécurité" },
  { id: "info", icon: "file", label: "Informations" },
  { id: "lang", icon: "building", label: "Langue" },
  { id: "appearance", icon: "chart", label: "Apparence PV" },
  { id: "preview", icon: "eye", label: "Aperçu" },
  { id: "data", icon: "file", label: "Données" },
];

const ROLE_LABEL = { owner: "Propriétaire", admin: "Administrateur", member: "Membre", viewer: "Lecteur" };

export function ProfileView({ profile, onSave, onOpenAgency }) {
  const [form, setForm] = useState({ ...profile });
  const [saved, setSaved] = useState(false);
  const fileRef = useRef();
  const t = useT();
  const [authEmail, setAuthEmail] = useState("");
  const [newAuthEmail, setNewAuthEmail] = useState("");
  const [emailMsg, setEmailMsg] = useState("");
  const [emailErr, setEmailErr] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [activeSection, setActiveSection] = useState("avatar");
  const sectionRefs = useRef({});
  const scrollRef = useRef(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const em = data?.user?.email || "";
      setAuthEmail(em);
      setNewAuthEmail(em);
    });
  }, []);

  const [myOrgs, setMyOrgs] = useState(null);
  useEffect(() => {
    loadMyOrganizations().then(setMyOrgs).catch(() => setMyOrgs([]));
  }, []);
  const primaryOrg = myOrgs && myOrgs.length > 0 ? myOrgs[0] : null;

  // Track active section on scroll
  useEffect(() => {
    const onScroll = () => {
      // If scrolled to bottom, activate the last visible section
      const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 20;
      if (atBottom) {
        // Find last section that has a ref
        for (let i = PROFILE_SECTIONS.length - 1; i >= 0; i--) {
          if (sectionRefs.current[PROFILE_SECTIONS[i].id]) {
            setActiveSection(PROFILE_SECTIONS[i].id);
            return;
          }
        }
      }
      let current = "avatar";
      for (const s of PROFILE_SECTIONS) {
        const el = sectionRefs.current[s.id];
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 120) current = s.id;
        }
      }
      setActiveSection(current);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollTo = (id) => {
    const el = sectionRefs.current[id];
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top, behavior: "smooth" });
    }
  };

  const handleChangeAuthEmail = async () => {
    setEmailErr(""); setEmailMsg("");
    if (!newAuthEmail.trim() || newAuthEmail === authEmail) return;
    setEmailLoading(true);
    const { error } = await supabase.auth.updateUser({ email: newAuthEmail });
    setEmailLoading(false);
    if (error) {
      setEmailErr(error.message);
    } else {
      setEmailMsg("Un email de confirmation a été envoyé à " + newAuthEmail);
    }
  };

  const initials = form.name.trim().split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";

  const handlePicture = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setForm((p) => ({ ...p, picture: ev.target.result }));
    reader.readAsDataURL(file);
  };

  const removePicture = () => setForm((p) => ({ ...p, picture: null }));

  const set = (key) => (v) => setForm((p) => ({ ...p, [key]: v }));

  const refFor = (id) => (el) => { sectionRefs.current[id] = el; };

  const [isMobile, setIsMobile] = useState(window.innerWidth < 700);
  const [mobileSection, setMobileSection] = useState(null); // which section sheet is open
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Mobile profile — completely different layout
  if (isMobile) {
    const MOBILE_SECTIONS = [
      { id: "plan", icon: "chart", label: "Abonnement", desc: `Plan ${PLANS[form.plan || "free"]?.label || "Free"}` },
      { id: "info", icon: "file", label: "Informations personnelles", desc: `${form.name} · ${form.structure}` },
      { id: "account", icon: "mail", label: "Compte & email", desc: authEmail || "Email de connexion" },
      { id: "security", icon: "lock", label: "Sécurité", desc: "Authentification à deux facteurs" },
      { id: "signature", icon: "edit", label: "Signature email", desc: form.emailSignature ? "Configurée" : "Non configurée" },
      { id: "lang", icon: "building", label: "Langue", desc: form.lang === "fr" ? "Français" : "English" },
      { id: "appearance", icon: "chart", label: "Apparence du PV", desc: `${(form.pdfColor || "#C95A1B").toUpperCase()} · ${form.pdfFont || "helvetica"}` },
    ];
    const doSave = () => { onSave(form); setSaved(true); setTimeout(() => setSaved(false), 2500); };
    return (
      <div className="ap-profile-mobile" style={{ maxWidth: "100%", margin: 0, padding: 0, display: "flex", flexDirection: "column", height: "calc(100dvh - 52px - 96px)", justifyContent: "center", overflow: "hidden" }}>
        {/* Avatar + Name — centered */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 12, flexShrink: 0 }}>
          <div style={{ position: "relative", marginBottom: 6 }}>
            {form.picture ? (
              <img src={form.picture} alt="profil" style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", border: `3px solid ${ACL2}` }} />
            ) : (
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: ACL, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: AC, border: `3px solid ${ACL2}` }}>{initials}</div>
            )}
            <button onClick={() => fileRef.current.click()} style={{ position: "absolute", bottom: 0, right: 0, width: 24, height: 24, borderRadius: "50%", background: "none", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
              <Ico name="edit" size={14} color={TX3} />
            </button>
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: TX, lineHeight: LH.tight }}>{form.name || "Votre nom"}</div>
          <div style={{ fontSize: FS.sm, color: TX3, marginTop: 1 }}>{form.structure || "Votre bureau"}</div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePicture} />
        </div>

        {/* Section list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 8, flexShrink: 0 }}>
          {MOBILE_SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setMobileSection(s.id)}
              className="ap-profile-card"
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", border: `1px solid ${SBB}`, borderRadius: RAD.md, background: WH, cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "border-color 0.15s, background 0.15s" }}
            >
              <div style={{ width: 28, height: 28, borderRadius: RAD.sm, background: SB, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Ico name={s.icon} size={13} color={TX2} />
              </div>
              <span style={{ flex: 1, fontSize: FS.base, fontWeight: 600, color: TX, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.label}</span>
              <span style={{ fontSize: FS.xs, color: TX3, maxWidth: 100, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}>{s.desc}</span>
              <Ico name="arrowr" size={10} color={SBB} />
            </button>
          ))}
        </div>

        {/* Logout */}
        <button
          onClick={() => supabase.auth.signOut()}
          className="ap-profile-card"
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", border: `1px solid #FECACA`, borderRadius: RAD.md, background: "#FEF8F8", cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "border-color 0.15s, background 0.15s", flexShrink: 0 }}
        >
          <div style={{ width: 28, height: 28, borderRadius: RAD.sm, background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Ico name="logout" size={13} color={RD} />
          </div>
          <span style={{ fontSize: FS.base, fontWeight: 600, color: RD }}>Se déconnecter</span>
        </button>

        {/* ── Section Sheets ── */}
        {mobileSection && (
          <div style={{ position: "fixed", inset: 0, zIndex: 250, display: "flex", flexDirection: "column", justifyContent: "flex-end" }} onClick={() => setMobileSection(null)}>
            <div style={{ background: "rgba(0,0,0,0.3)", position: "absolute", inset: 0 }} />
            <div onClick={e => e.stopPropagation()} style={{ position: "relative", background: WH, borderRadius: "20px 20px 0 0", maxHeight: "85vh", overflowY: "auto", animation: "sheetUp 0.25s ease-out", padding: `${SP.xl}px ${SP.lg}px`, paddingBottom: `max(${SP.xl}px, env(safe-area-inset-bottom, 20px))` }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: SBB, margin: `0 auto ${SP.lg}px` }} />

              {mobileSection === "plan" && (() => {
                const curPlan = form.plan || "free";
                const planList = [
                  { ...PLANS.free, features: ["1 projet", "3 PV / mois", "3 IA / mois"] },
                  { ...PLANS.pro, popular: true, features: ["Projets illimités", "PV illimités", "IA illimitée", "Envoi email", "Galerie photos", "Planning & Lots", "3 collabs / projet"] },
                  { ...PLANS.team, features: ["Tout le Pro", "Collabs illimités", "Rôles & permissions", "Dashboard complet", "Export CSV", "PDF logo"] },
                ];
                return (
                <div style={{ padding: "0 4px" }}>
                  <div style={{ fontSize: FS.lg + 1, fontWeight: 700, color: TX, marginBottom: 4 }}>Abonnement</div>
                  <div style={{ fontSize: FS.sm, color: TX3, marginBottom: 14 }}>Plan actuel : <strong style={{ color: AC }}>{PLANS[curPlan]?.label}</strong></div>

                  {/* Plan toggle */}
                  <div style={{ display: "flex", background: SB, borderRadius: 10, padding: 3, gap: 3, marginBottom: 14 }}>
                    {planList.map(p => (
                      <button key={p.id} onClick={() => set("plan")(p.id)} style={{ flex: 1, padding: "8px 4px", border: "none", borderRadius: 8, fontSize: 12, fontWeight: curPlan === p.id ? 700 : 500, cursor: "pointer", fontFamily: "inherit", background: curPlan === p.id ? WH : "transparent", color: curPlan === p.id ? AC : TX3, boxShadow: curPlan === p.id ? "0 1px 3px rgba(0,0,0,0.06)" : "none", transition: "all 0.12s" }}>
                        {p.label}
                      </button>
                    ))}
                  </div>

                  {/* Selected plan details */}
                  {(() => { const p = planList.find(pl => pl.id === curPlan) || planList[0]; return (
                    <div style={{ background: WH, border: `1px solid ${p.popular ? AC : SBB}`, borderRadius: 12, padding: "16px 14px" }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 10 }}>
                        <span style={{ fontSize: 28, fontWeight: 800, color: TX }}>{p.price}€</span>
                        <span style={{ fontSize: 12, color: TX3 }}>/mois</span>
                        {p.popular && <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: AC, background: ACL, padding: "2px 8px", borderRadius: 8, marginLeft: 6 }}>Populaire</span>}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                        {p.features.map((f, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: TX2 }}>
                            <Ico name="check" size={11} color={GR} />{f}
                          </div>
                        ))}
                      </div>
                      <button onClick={() => { onSave({ ...form, plan: curPlan }); setSaved(true); setTimeout(() => setSaved(false), 2500); setMobileSection(null); track("plan_selected", { plan: curPlan, _page: "profile" }); }} style={{ width: "100%", padding: "11px 16px", border: "none", borderRadius: 8, background: AC, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                        Confirmer ce plan
                      </button>
                    </div>
                  ); })()}
                </div>
                );
              })()}

              {mobileSection === "info" && (
                <>
                  <div style={{ fontSize: FS.lg + 1, fontWeight: 700, color: TX, marginBottom: SP.lg }}>Informations</div>
                  <Field label={t("profile.fullName")} value={form.name} onChange={set("name")} placeholder="ex: Gaëlle CNOP" required />
                  <Field half={false} label={t("profile.structureName")} value={form.structure} onChange={set("structure")} placeholder="ex: DEWIL architecten" required />
                  <Field label={t("profile.structureType")} value={form.structureType} onChange={set("structureType")} select options={STRUCTURE_TYPES} />
                  <Field label={t("profile.address")} value={form.address} onChange={set("address")} placeholder="ex: Rue de la Loi 12, 1000 Bruxelles" />
                  <Field label={t("profile.phone")} value={form.phone} onChange={set("phone")} placeholder="ex: 0474 50 85 80" type="tel" />
                  <Field label={t("profile.email")} value={form.email} onChange={set("email")} placeholder="ex: contact@cabinet.be" type="email" />
                </>
              )}

              {mobileSection === "account" && (
                <>
                  <div style={{ fontSize: FS.lg + 1, fontWeight: 700, color: TX, marginBottom: SP.sm }}>Compte</div>
                  <div style={{ fontSize: FS.base, color: TX3, marginBottom: SP.lg, lineHeight: LH.relaxed }}>{t("profile.accountDesc")}</div>
                  <label style={{ display: "block", fontSize: FS.base, fontWeight: 600, color: TX2, marginBottom: SP.xs }}>{t("profile.loginEmail")}</label>
                  <input type="email" value={newAuthEmail} onChange={e => setNewAuthEmail(e.target.value)} placeholder={authEmail} style={{ width: "100%", padding: `${SP.sm + 1}px ${SP.md}px`, border: `1px solid ${SBB}`, borderRadius: RAD.md, fontSize: 14, fontFamily: "inherit", background: SB, color: TX, boxSizing: "border-box", marginBottom: SP.md }} />
                  <button onClick={handleChangeAuthEmail} disabled={emailLoading || !newAuthEmail.trim() || newAuthEmail === authEmail} style={{ width: "100%", padding: SP.sm + 2, border: "none", borderRadius: RAD.md, background: newAuthEmail !== authEmail && newAuthEmail.trim() ? AC : DIS, color: "#fff", fontSize: FS.md, fontWeight: 600, cursor: newAuthEmail !== authEmail ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
                    {emailLoading ? "..." : t("profile.changeEmail")}
                  </button>
                  {emailMsg && <div style={{ marginTop: SP.sm, fontSize: FS.sm, color: GR }}>{emailMsg}</div>}
                  {emailErr && <div style={{ marginTop: SP.sm, fontSize: FS.sm, color: RD }}>{emailErr}</div>}
                </>
              )}

              {mobileSection === "security" && (
                <>
                  <div style={{ fontSize: FS.lg + 1, fontWeight: 700, color: TX, marginBottom: SP.lg }}>Sécurité</div>
                  <MfaSection />
                </>
              )}

              {mobileSection === "signature" && (
                <>
                  <div style={{ fontSize: FS.lg + 1, fontWeight: 700, color: TX, marginBottom: SP.sm }}>Signature email</div>
                  <div style={{ fontSize: FS.sm, color: TX3, marginBottom: SP.md }}>Ajoutée automatiquement à la fin de vos emails. Collez une image directement.</div>
                  <div
                    contentEditable suppressContentEditableWarning
                    role="textbox" aria-label="Signature email" aria-multiline="true"
                    onInput={e => set("emailSignature")(e.currentTarget.innerHTML.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "").replace(/\bon\w+\s*=/gi, "data-removed="))}
                    onPaste={e => {
                      const items = e.clipboardData?.items;
                      if (!items) return;
                      for (const item of items) {
                        if (item.type.startsWith("image/")) {
                          e.preventDefault();
                          const file = item.getAsFile();
                          if (!file || file.size > 500000) { if (file?.size > 500000) alert("Image trop lourde (max 500 Ko)"); return; }
                          const reader = new FileReader();
                          reader.onload = (ev) => { document.execCommand("insertImage", false, ev.target.result); set("emailSignature")(e.currentTarget.innerHTML); };
                          reader.readAsDataURL(file);
                          return;
                        }
                      }
                    }}
                    dangerouslySetInnerHTML={{ __html: form.emailSignature || "" }}
                    style={{ width: "100%", minHeight: 120, padding: SP.md, border: `1px solid ${SBB}`, borderRadius: RAD.lg, fontSize: FS.base, lineHeight: LH.relaxed, fontFamily: "inherit", background: SB, color: TX, boxSizing: "border-box", outline: "none" }}
                  />
                  {!form.emailSignature && (
                    <button onClick={() => set("emailSignature")(`Cordialement,<br>${form.name || "Votre nom"}<br>${form.structure || "Votre bureau"}${form.phone ? "<br>Tél : " + form.phone : ""}${form.email ? "<br>" + form.email : ""}`)} style={{ marginTop: SP.sm, padding: `${SP.sm - 1}px ${SP.md}px`, border: `1px solid ${SBB}`, borderRadius: RAD.md, background: WH, cursor: "pointer", fontSize: FS.sm, fontFamily: "inherit", color: AC, fontWeight: 600 }}>
                      Générer depuis mon profil
                    </button>
                  )}
                </>
              )}

              {mobileSection === "lang" && (
                <>
                  <div style={{ fontSize: FS.lg + 1, fontWeight: 700, color: TX, marginBottom: SP.lg }}>Langue</div>
                  <div style={{ display: "flex", gap: SP.sm }}>
                    {[{ id: "fr", label: "Français", flag: "🇫🇷" }, { id: "en", label: "English", flag: "🇬🇧" }].map(l => (
                      <button key={l.id} onClick={() => set("lang")(l.id)} style={{ flex: 1, padding: `${SP.md}px ${SP.lg}px`, border: `2px solid ${form.lang === l.id ? AC : SBB}`, borderRadius: RAD.lg, background: form.lang === l.id ? ACL : WH, cursor: "pointer", textAlign: "center", fontFamily: "inherit" }}>
                        <span style={{ fontSize: 28, display: "block", marginBottom: SP.xs }}>{l.flag}</span>
                        <span style={{ fontSize: FS.md, fontWeight: 700, color: form.lang === l.id ? AC : TX }}>{l.label}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {mobileSection === "appearance" && (
                <>
                  <div style={{ fontSize: FS.lg + 1, fontWeight: 700, color: TX, marginBottom: SP.lg }}>Apparence du PV</div>
                  <div style={{ fontSize: FS.md, fontWeight: 500, color: TX2, marginBottom: SP.sm }}>Couleur principale</div>
                  <div style={{ display: "flex", gap: SP.sm, flexWrap: "wrap", marginBottom: SP.xl }}>
                    {COLOR_PRESETS.map(c => (
                      <button key={c.value} onClick={() => set("pdfColor")(c.value)} style={{ width: 40, height: 40, borderRadius: RAD.md, background: c.value, border: form.pdfColor === c.value ? `3px solid ${TX}` : "3px solid transparent", cursor: "pointer", padding: 0 }} />
                    ))}
                  </div>
                  <div style={{ fontSize: FS.md, fontWeight: 500, color: TX2, marginBottom: SP.sm }}>Police</div>
                  <div style={{ display: "flex", gap: SP.sm }}>
                    {FONT_OPTIONS.map(f => (
                      <button key={f.id} onClick={() => set("pdfFont")(f.id)} style={{ flex: 1, padding: `${SP.sm + 2}px ${SP.md}px`, border: `2px solid ${form.pdfFont === f.id ? AC : SBB}`, borderRadius: RAD.lg, background: form.pdfFont === f.id ? ACL : WH, cursor: "pointer", fontFamily: "inherit", textAlign: "center" }}>
                        <div style={{ fontSize: FS.md, fontWeight: 700, color: form.pdfFont === f.id ? AC : TX, fontFamily: f.id === "times" ? "Georgia,serif" : "inherit" }}>{f.label}</div>
                        <div style={{ fontSize: FS.xs, color: TX3 }}>{f.desc}</div>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Close / Done + auto-save */}
              <button onClick={() => { doSave(); setMobileSection(null); }} style={{ width: "100%", marginTop: SP.xl, padding: SP.md, border: "none", borderRadius: RAD.lg, background: AC, color: "#fff", fontSize: FS.md, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                Enregistrer
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Desktop layout
  return (
    <div style={{ display: "flex", maxWidth: 1100, margin: "0 auto", padding: 0, gap: 0 }}>
      {/* ── Navigation ── */}
      {(
        <nav style={{
          width: 180, flexShrink: 0, alignSelf: "flex-start",
          paddingRight: 20, borderRight: `1px solid ${SBB}`, marginRight: 24,
          position: "sticky", top: 80,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: TX3, marginBottom: 12, paddingLeft: 10 }}>
            {t("profile.title")}
          </div>
          {PROFILE_SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => scrollTo(s.id)}
              className="profile-nav-item"
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8,
                padding: "8px 10px", border: "none", borderRadius: 8,
                background: activeSection === s.id ? ACL : "transparent",
                cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                transition: "all 0.15s", marginBottom: 2,
              }}
            >
              <Ico name={s.icon} size={14} color={activeSection === s.id ? AC : TX3} />
              <span style={{
                fontSize: 12, fontWeight: activeSection === s.id ? 600 : 500,
                color: activeSection === s.id ? AC : TX2,
              }}>{s.label}</span>
            </button>
          ))}
        </nav>
      )}

      {/* ── Content ── */}
      <div ref={scrollRef} style={{ flex: 1, minWidth: 0, padding: isMobile ? "16px 16px 0" : "0 4px 0 0" }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: TX, marginBottom: 4 }}>{t("profile.title")}</div>
        <div style={{ fontSize: 13, color: TX3 }}>{t("profile.subtitle")}</div>
      </div>

      {/* Avatar */}
      <div ref={refFor("avatar")} style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 28, padding: 20, background: WH, border: `1px solid ${SBB}`, borderRadius: 14 }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          {form.picture ? (
            <img src={form.picture} alt="profil" style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", border: `2px solid ${SBB}` }} />
          ) : (
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: ACL, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: AC, border: `2px solid ${ACL2}` }}>{initials}</div>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: TX, marginBottom: 2 }}>{form.name || t("profile.yourName")}</div>
          <div style={{ fontSize: 12, color: TX3, marginBottom: 10 }}>{form.structure || t("profile.yourStructure")}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => fileRef.current.click()} style={{ padding: "6px 14px", border: `1px solid ${SBB}`, borderRadius: 6, background: WH, cursor: "pointer", fontSize: 12, fontWeight: 500, color: TX2, fontFamily: "inherit" }}>
              {form.picture ? t("profile.changePhoto") : t("profile.addPhoto")}
            </button>
            {form.picture && (
              <button onClick={removePicture} style={{ padding: "6px 14px", border: `1px solid ${SBB}`, borderRadius: 6, background: WH, cursor: "pointer", fontSize: 12, color: RD, fontFamily: "inherit" }}>{t("profile.removePhoto")}</button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePicture} />
          {form.picture && !hasFeature(form.plan, "pdfCustomLogo") && (
            <div style={{ marginTop: 10, fontSize: 11, color: TX3, display: "flex", alignItems: "center", gap: 6 }}>
              <Ico name="lock" size={11} color={TX3} />
              Logo sur PDF réservé au plan Team
            </div>
          )}
        </div>
      </div>

      {/* Abonnement */}
      <div ref={refFor("plan")} style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 14, padding: "20px 20px 16px", marginBottom: 16 }}>
        <PricingSection currentPlan={form.plan || "free"} onSelectPlan={(p) => { set("plan")(p); onSave({ ...form, plan: p }); setSaved(true); setTimeout(() => setSaved(false), 2500); }} />
      </div>

      {/* Mon agence */}
      <div ref={refFor("agency")} style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 14, padding: "20px 20px 16px", marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 4 }}>Mon agence</div>
        <div style={{ fontSize: 12, color: TX3, marginBottom: 14, lineHeight: 1.5 }}>
          Espace partagé multi-archi, rôles, dashboard cross-projets — réservé au plan Team.
        </div>
        {myOrgs === null ? (
          <div style={{ fontSize: 12, color: TX3 }}>Chargement…</div>
        ) : !primaryOrg ? (
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", background: SB, border: `1px dashed ${SBB}`, borderRadius: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: ACL, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Ico name="users" size={16} color={AC} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: TX }}>Pas encore d'agence</div>
              <div style={{ fontSize: 11, color: TX3, lineHeight: 1.4, marginTop: 2 }}>
                Crée une agence pour partager tes projets avec d'autres architectes.
              </div>
            </div>
            <button onClick={onOpenAgency}
              style={{ padding: "9px 14px", border: "none", borderRadius: 9, background: AC, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", flexShrink: 0 }}>
              <Ico name="plus" size={11} color="#fff" />
              Créer
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", background: SB, border: `1px solid ${SBB}`, borderRadius: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: ACL, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Ico name="users" size={16} color={AC} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{primaryOrg.name}</div>
              <div style={{ fontSize: 11, color: TX3, marginTop: 2 }}>
                Ton rôle : <strong style={{ color: TX2 }}>{ROLE_LABEL[primaryOrg._myRole] || primaryOrg._myRole}</strong>
                {primaryOrg.seat_limit ? <> · Cap {primaryOrg.seat_limit} sièges</> : null}
              </div>
            </div>
            <button onClick={onOpenAgency}
              style={{ padding: "9px 14px", border: `1px solid ${SBB}`, borderRadius: 9, background: WH, color: AC, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", flexShrink: 0 }}>
              Gérer <Ico name="arrowr" size={10} color={AC} />
            </button>
          </div>
        )}
      </div>

      {/* Compte — Email de connexion */}
      <div ref={refFor("account")} style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 14, padding: "20px 20px 16px", marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 14 }}>{t("profile.account")}</div>
        <div style={{ fontSize: 12, color: TX3, marginBottom: 12, lineHeight: 1.5 }}>{t("profile.accountDesc")}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: TX2, marginBottom: 5 }}>{t("profile.loginEmail")}</label>
            <input
              type="email" value={newAuthEmail} onChange={(e) => setNewAuthEmail(e.target.value)}
              placeholder={authEmail} style={{ width: "100%", padding: "11px 14px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: SB, color: TX, boxSizing: "border-box" }}
            />
          </div>
          <button
            onClick={handleChangeAuthEmail}
            disabled={emailLoading || !newAuthEmail.trim() || newAuthEmail === authEmail}
            style={{ padding: "11px 18px", border: "none", borderRadius: 8, background: newAuthEmail !== authEmail && newAuthEmail.trim() ? AC : "#D3D1C7", color: "#fff", fontSize: 13, fontWeight: 600, cursor: newAuthEmail !== authEmail && newAuthEmail.trim() ? "pointer" : "not-allowed", fontFamily: "inherit", whiteSpace: "nowrap" }}
          >
            {emailLoading ? "..." : t("profile.changeEmail")}
          </button>
        </div>
        {emailMsg && <div style={{ marginTop: 10, padding: "8px 12px", background: "#EAF3DE", border: "1px solid #C6E9B4", borderRadius: 6, fontSize: 12, color: GR }}>{emailMsg}</div>}
        {emailErr && <div style={{ marginTop: 10, padding: "8px 12px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6, fontSize: 12, color: RD }}>{emailErr}</div>}
      </div>

      {/* Sécurité — MFA */}
      <div ref={refFor("security")}><MfaSection /></div>

      {/* Form — Informations */}
      <div ref={refFor("info")} style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 14, padding: "20px 20px 8px", marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 14 }}>{t("profile.personalInfo")}</div>
        <Field label={t("profile.fullName")} value={form.name} onChange={set("name")} placeholder="ex: Gaëlle CNOP" required />
        <div style={{ display: "flex", gap: 10 }}>
          <Field half label={t("profile.structureName")} value={form.structure} onChange={set("structure")} placeholder="ex: DEWIL architecten" required />
          <Field half label={t("profile.structureType")} value={form.structureType} onChange={set("structureType")} select options={STRUCTURE_TYPES} />
        </div>
        <Field label={t("profile.address")} value={form.address} onChange={set("address")} placeholder="ex: Rue de la Loi 12, 1000 Bruxelles" />
        <div style={{ display: "flex", gap: 10 }}>
          <Field half label={t("profile.phone")} value={form.phone} onChange={set("phone")} placeholder="ex: 0474 50 85 80" type="tel" />
          <Field half label={t("profile.email")} value={form.email} onChange={set("email")} placeholder="ex: contact@cabinet.be" type="email" />
        </div>
      </div>

      {/* Signature email */}
      <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 14, padding: "20px 20px 16px", marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 6 }}>Signature email</div>
        <div style={{ fontSize: 11, color: TX3, marginBottom: 12 }}>Ajoutée automatiquement à la fin de vos emails. Vous pouvez coller une image (logo) directement dans l'éditeur.</div>
        <div
          contentEditable
          suppressContentEditableWarning
          role="textbox" aria-label="Signature email" aria-multiline="true"
          onInput={e => set("emailSignature")(e.currentTarget.innerHTML.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "").replace(/\bon\w+\s*=/gi, "data-removed="))}
          onPaste={e => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (const item of items) {
              if (item.type.startsWith("image/")) {
                e.preventDefault();
                const file = item.getAsFile();
                if (!file) return;
                if (file.size > 500000) { alert("Image trop lourde (max 500 Ko)"); return; }
                const reader = new FileReader();
                reader.onload = (ev) => {
                  const img = document.createElement("img");
                  img.src = ev.target.result;
                  img.style.maxHeight = "60px";
                  img.style.maxWidth = "200px";
                  img.style.objectFit = "contain";
                  img.style.display = "block";
                  img.style.marginBottom = "4px";
                  const sel = window.getSelection();
                  if (sel.rangeCount) {
                    const range = sel.getRangeAt(0);
                    range.deleteContents();
                    range.insertNode(img);
                    range.setStartAfter(img);
                    range.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(range);
                  }
                  set("emailSignature")(e.currentTarget.innerHTML);
                };
                reader.readAsDataURL(file);
                return;
              }
            }
          }}
          dangerouslySetInnerHTML={{ __html: form.emailSignature || "" }}
          style={{ width: "100%", minHeight: 100, padding: "10px 12px", border: `1px solid ${SBB}`, borderRadius: 10, fontSize: 12, lineHeight: 1.6, fontFamily: "inherit", background: SB, color: TX, boxSizing: "border-box", outline: "none", overflowWrap: "break-word", whiteSpace: "pre-wrap" }}
        />
        {!form.emailSignature && (
          <button
            onClick={() => {
              const html = `Cordialement,<br>${form.name || "Votre nom"}<br>${form.structure || "Votre bureau"}${form.phone ? "<br>Tél : " + form.phone : ""}${form.email ? "<br>" + form.email : ""}`;
              set("emailSignature")(html);
            }}
            style={{ marginTop: 8, padding: "7px 14px", border: `1px solid ${SBB}`, borderRadius: 8, background: WH, cursor: "pointer", fontSize: 11, fontFamily: "inherit", color: AC, fontWeight: 600 }}
          >
            Générer depuis mon profil
          </button>
        )}
      </div>

      {/* Langue */}
      <div ref={refFor("lang")} style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 14, padding: "20px 20px 16px", marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 14 }}>Langue / Language</div>
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { id: "fr", label: "Français", flag: "🇫🇷" },
            { id: "en", label: "English", flag: "🇬🇧" },
          ].map(l => (
            <button key={l.id} onClick={() => set("lang")(l.id)}
              style={{ flex: 1, padding: "12px 14px", border: `2px solid ${form.lang === l.id ? AC : SBB}`, borderRadius: 10, background: form.lang === l.id ? ACL : WH, cursor: "pointer", textAlign: "left", fontFamily: "inherit", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 22 }}>{l.flag}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: form.lang === l.id ? AC : TX }}>{l.label}</span>
            </button>
          ))}
        </div>
      </div>


      {/* Templates */}
      {/* Apparence du PV */}
      <div ref={refFor("appearance")} style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 14, padding: "20px 20px 16px", marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 16 }}>{t("profile.pdfAppearance")}</div>

        {/* Couleur principale */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: TX2, marginBottom: 10 }}>{t("profile.mainColor")}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {COLOR_PRESETS.map((c) => (
              <button
                key={c.value}
                title={c.label}
                onClick={() => set("pdfColor")(c.value)}
                style={{ width: 32, height: 32, borderRadius: 8, background: c.value, border: form.pdfColor === c.value ? `3px solid ${TX}` : "3px solid transparent", cursor: "pointer", padding: 0, transition: "border 0.15s", boxShadow: form.pdfColor === c.value ? "0 0 0 1px #fff inset" : "none" }}
              />
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 4 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: form.pdfColor, border: `2px solid ${SBB}`, overflow: "hidden", flexShrink: 0 }}>
                <input type="color" value={form.pdfColor || "#C95A1B"} onChange={(e) => set("pdfColor")(e.target.value)} style={{ width: 48, height: 48, border: "none", padding: 0, cursor: "pointer", marginTop: -8, marginLeft: -8, opacity: 0, position: "absolute" }} />
                <input type="color" value={form.pdfColor || "#C95A1B"} onChange={(e) => set("pdfColor")(e.target.value)} style={{ width: "100%", height: "100%", border: "none", padding: 0, cursor: "pointer", opacity: 0 }} />
              </div>
              <span style={{ fontSize: 12, color: TX3, fontFamily: "monospace" }}>{(form.pdfColor || "#C95A1B").toUpperCase()}</span>
            </div>
          </div>
        </div>

        {/* Police */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: TX2, marginBottom: 10 }}>{t("profile.font")}</div>
          <div style={{ display: "flex", gap: 8 }}>
            {FONT_OPTIONS.map((f) => (
              <button
                key={f.id}
                onClick={() => set("pdfFont")(f.id)}
                style={{ flex: 1, padding: "10px 12px", border: `2px solid ${form.pdfFont === f.id ? AC : SBB}`, borderRadius: 10, background: form.pdfFont === f.id ? ACL : WH, cursor: "pointer", textAlign: "left", fontFamily: "inherit", transition: "all 0.15s" }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, color: form.pdfFont === f.id ? AC : TX, fontFamily: f.id === "times" ? "Georgia,serif" : "inherit", marginBottom: 2 }}>{f.label}</div>
                <div style={{ fontSize: 11, color: form.pdfFont === f.id ? TX2 : TX3 }}>{f.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Aperçu */}
      <div ref={refFor("preview")} style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 14, padding: "20px 20px 16px", marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 10 }}>{t("profile.templatePreview")}</div>
        <PDFPreview form={form} />
      </div>

      {/* Données & Compte */}
      <DataSection refFor={refFor} />

      <button
        onClick={() => { onSave(form); setSaved(true); setTimeout(() => setSaved(false), 2500); }}
        disabled={!form.name.trim() || !form.structure.trim()}
        style={{ width: "100%", marginTop: 4, padding: 14, border: "none", borderRadius: 10, background: saved ? GR : (form.name.trim() && form.structure.trim() ? AC : DIS), color: form.name.trim() && form.structure.trim() ? "#fff" : DIST, fontSize: 15, fontWeight: 600, cursor: form.name.trim() && form.structure.trim() ? "pointer" : "not-allowed", fontFamily: "inherit", transition: "all 0.3s", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
      >
        {saved ? <><Ico name="check" size={18} color="#fff" />Enregistré !</> : t("profile.saveSettings")}
      </button>
      </div>{/* end scroll container */}
    </div>
  );
}

// ── Data & Account Management (GDPR) ─────────────────────────
function DataSection({ refFor }) {
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState("");

  const handleExport = async () => {
    setExporting(true);
    setError("");
    try {
      await exportUserData();
    } catch (e) {
      setError(e.message || "Erreur lors de l'export");
    }
    setExporting(false);
  };

  const handleDelete = async () => {
    if (confirmText !== "SUPPRIMER") return;
    setDeleting(true);
    setError("");
    try {
      await deleteAccount();
      // Page will redirect to auth after signOut
    } catch (e) {
      setError(e.message || "Erreur lors de la suppression");
      setDeleting(false);
    }
  };

  return (
    <div ref={refFor("data")} style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 14, padding: "20px 20px 16px", marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 14 }}>
        Données & Compte
      </div>

      {error && (
        <div style={{ padding: "10px 14px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, marginBottom: 14, fontSize: 13, color: RD }}>
          {error}
        </div>
      )}

      {/* Export data */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: TX, marginBottom: 4 }}>Exporter mes données</div>
        <div style={{ fontSize: 12, color: TX2, lineHeight: 1.5, marginBottom: 10 }}>
          Téléchargez une copie complète de toutes vos données (profil, projets, PV, remarques, photos) au format JSON. Conformément au RGPD (Art. 20).
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          style={{
            padding: "9px 18px", border: `1px solid ${SBB}`, borderRadius: 8,
            background: exporting ? SB : WH, color: TX, fontSize: 13, fontWeight: 600,
            cursor: exporting ? "wait" : "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", gap: 8,
          }}
        >
          <Ico name="file" size={16} color={TX2} />
          {exporting ? "Export en cours..." : "Télécharger mes données"}
        </button>
      </div>

      {/* Delete account */}
      <div style={{ borderTop: `1px solid ${SBB}`, paddingTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: RD, marginBottom: 4 }}>Supprimer mon compte</div>
        <div style={{ fontSize: 12, color: TX2, lineHeight: 1.5, marginBottom: 10 }}>
          Cette action est irréversible. Toutes vos données seront définitivement supprimées : projets, PV, photos, collaborations. Votre abonnement sera automatiquement résilié.
        </div>

        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            style={{
              padding: "9px 18px", border: `1px solid #FECACA`, borderRadius: 8,
              background: "#FEF2F2", color: RD, fontSize: 13, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Supprimer mon compte
          </button>
        ) : (
          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: RD, marginBottom: 8 }}>
              Êtes-vous sûr ? Tapez SUPPRIMER pour confirmer.
            </div>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Tapez SUPPRIMER"
              style={{
                width: "100%", padding: "9px 12px", border: `1px solid #FECACA`, borderRadius: 8,
                fontSize: 14, fontFamily: "inherit", background: WH, color: TX,
                boxSizing: "border-box", marginBottom: 10, outline: "none",
              }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleDelete}
                disabled={confirmText !== "SUPPRIMER" || deleting}
                style={{
                  padding: "9px 18px", border: "none", borderRadius: 8,
                  background: confirmText === "SUPPRIMER" ? RD : DIS,
                  color: confirmText === "SUPPRIMER" ? "#fff" : DIST,
                  fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                  cursor: confirmText === "SUPPRIMER" && !deleting ? "pointer" : "not-allowed",
                }}
              >
                {deleting ? "Suppression..." : "Confirmer la suppression"}
              </button>
              <button
                onClick={() => { setConfirmDelete(false); setConfirmText(""); }}
                style={{
                  padding: "9px 18px", border: `1px solid ${SBB}`, borderRadius: 8,
                  background: WH, color: TX2, fontSize: 13, fontWeight: 600,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
