import { useState, useEffect, useRef, createContext, useContext } from "react";
import { supabase } from "./supabase";

// ── Colors (matching App.jsx DA) ───────────────────────────
const AC  = "#D97B0D";
const ACD = "#B8680A";
const ACL = "#FDF4E7";
const ACL2= "#FAE9CF";
const TX  = "#1D1D1B";
const TX2 = "#6B6B66";
const TX3 = "#767672";
const SB  = "#F7F6F4";
const SBB = "#E2E1DD";
const WH  = "#FFFFFF";
const BG  = "#FAFAF9";
const RD  = "#C4392A";
const GR  = "#2D8A4E";

// ── Auth Context ───────────────────────────────────────────
const AuthContext = createContext({ user: null, session: null, loading: true, recovery: false, setRecovery: () => {}, mfaRequired: false, refreshMfa: () => {} });

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);

  const checkMfa = async () => {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (data) {
      setMfaRequired(data.currentLevel === "aal1" && data.nextLevel === "aal2");
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
      if (s) checkMfa();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
      if (event === "PASSWORD_RECOVERY") {
        setRecovery(true);
      }
      if (s) checkMfa();
      else setMfaRequired(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, loading, recovery, setRecovery, mfaRequired, refreshMfa: checkMfa }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Benefits section ───────────────────────────────────────
const benefits = [
  { icon: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2 M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z M9 14l2 2 4-4", label: "Suivi de chantier simplifié" },
  { icon: "M12 20V10 M18 20V4 M6 20v-4", label: "PV générés en un clic" },
  { icon: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z", label: "Données sécurisées" },
];

// ── Auth Page (Login / Register / Forgot) ──────────────────
export function AuthPage() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [hovered, setHovered] = useState(null);
  const [showPw, setShowPw] = useState(false);
  const emailRef = useRef(null);

  useEffect(() => {
    if (emailRef.current && mode !== "check-email") {
      setTimeout(() => emailRef.current?.focus(), 100);
    }
  }, [mode]);

  const reset = () => { setError(""); setMessage(""); setPassword(""); setFieldErrors({}); };

  const validateFields = () => {
    const errs = {};
    if (!email.trim()) errs.email = "L'email est requis.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errs.email = "Format d'email invalide.";
    if (mode !== "forgot") {
      if (!password) errs.password = "Le mot de passe est requis.";
      else if (mode === "register") {
        if (password.length < 12) errs.password = "12 caractères minimum.";
        else if (!/[A-Z]/.test(password)) errs.password = "Une majuscule requise.";
        else if (!/[^A-Za-z0-9]/.test(password)) errs.password = "Un caractère spécial requis.";
      }
    }
    if (mode === "register" && !name.trim()) errs.name = "Le nom est requis.";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    if (!validateFields()) return;
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) {
      if (err.message.includes("Invalid login")) setError("Email ou mot de passe incorrect.");
      else if (err.message.includes("Email not confirmed")) setError("Veuillez confirmer votre email avant de vous connecter.");
      else setError(err.message);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    if (!validateFields()) return;
    setLoading(true);
    const { error: err } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name: name.trim() } },
    });
    setLoading(false);
    if (err) {
      if (err.message.includes("already registered")) setError("Cet email est déjà utilisé.");
      else setError(err.message);
    } else {
      setMode("check-email");
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setError("");
    if (!validateFields()) return;
    setLoading(true);
    // Check if user exists by attempting a dummy signup
    const { data: checkData } = await supabase.auth.signUp({ email, password: "CheckOnly_000!" });
    // If identities array is not empty, the user doesn't exist yet (new signup succeeded or was created)
    if (checkData?.user?.identities?.length > 0) {
      // User didn't exist — clean up by noting this, and show error
      setLoading(false);
      setError("Aucun compte n'est associé à cet email. Créez un compte d'abord.");
      return;
    }
    // User exists (identities is empty = already registered), proceed with reset
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    setLoading(false);
    if (err) setError(err.message);
    else setMessage("Un email de réinitialisation a été envoyé à " + email);
  };

  // ── Check Email confirmation screen ──
  if (mode === "check-email") {
    return (
      <PageShell>
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: ACL, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={AC} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
              <path d="M22 6l-10 7L2 6" />
            </svg>
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: TX, marginBottom: 8 }}>Vérifiez votre boîte mail</div>
          <div style={{ fontSize: 14, color: TX2, lineHeight: 1.6, marginBottom: 24 }}>
            Un email de confirmation a été envoyé à<br />
            <strong style={{ color: TX }}>{email}</strong><br /><br />
            Cliquez sur le lien dans l'email pour activer votre compte.
          </div>
          <button
            onClick={() => { reset(); setMode("login"); }}
            onMouseEnter={() => setHovered("back")}
            onMouseLeave={() => setHovered(null)}
            style={{ ...linkBtnStyle, color: hovered === "back" ? ACD : AC, transition: "color 0.15s" }}
          >
            Retour à la connexion
          </button>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      {/* Mode title — compact, only for register/forgot */}
      {mode !== "login" && (
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: TX }}>
            {mode === "register" && "Créer un compte"}
            {mode === "forgot" && "Mot de passe oublié"}
          </div>
          <div style={{ fontSize: 12, color: TX3, marginTop: 3 }}>
            {mode === "register" && "Commencez à gérer vos chantiers"}
            {mode === "forgot" && "Recevez un lien de réinitialisation par email"}
          </div>
        </div>
      )}

      {/* OAuth buttons */}
      {mode !== "forgot" && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } })}
              onMouseEnter={() => setHovered("google")}
              onMouseLeave={() => setHovered(null)}
              style={{
                flex: 1, padding: "11px 14px", border: `1px solid ${SBB}`, borderRadius: 10,
                background: hovered === "google" ? SB : WH, cursor: "pointer", fontFamily: "inherit",
                fontSize: 13, fontWeight: 500, color: TX2, display: "flex", alignItems: "center",
                justifyContent: "center", gap: 8, transition: "all 0.15s",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              Google
            </button>
            <button
              onClick={() => supabase.auth.signInWithOAuth({ provider: "apple", options: { redirectTo: window.location.origin } })}
              onMouseEnter={() => setHovered("apple")}
              onMouseLeave={() => setHovered(null)}
              style={{
                flex: 1, padding: "11px 14px", border: `1px solid ${SBB}`, borderRadius: 10,
                background: hovered === "apple" ? "#2A2A28" : TX, cursor: "pointer", fontFamily: "inherit",
                fontSize: 13, fontWeight: 500, color: WH, display: "flex", alignItems: "center",
                justifyContent: "center", gap: 8, transition: "all 0.15s",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
              Apple
            </button>
          </div>
          {/* Separator */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "14px 0 0" }}>
            <div style={{ flex: 1, height: 1, background: SBB }} />
            <span style={{ fontSize: 11, color: TX3, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px" }}>ou par email</span>
            <div style={{ flex: 1, height: 1, background: SBB }} />
          </div>
        </div>
      )}

      {/* General error banner */}
      {error && (
        <div style={{
          padding: "10px 14px", background: "#FEF2F2", border: "1px solid #FECACA",
          borderRadius: 10, marginBottom: 16, fontSize: 13, color: RD,
          display: "flex", alignItems: "flex-start", gap: 10, lineHeight: 1.5,
          animation: "fadeSlide 0.25s ease-out",
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={RD} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4 M12 16h.01" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Success message */}
      {message && (
        <div style={{
          padding: "10px 14px", background: "#EAF3DE", border: "1px solid #C6E9B4",
          borderRadius: 10, marginBottom: 16, fontSize: 13, color: GR,
          animation: "fadeSlide 0.25s ease-out",
        }}>
          {message}
        </div>
      )}

      {/* Form */}
      <form onSubmit={mode === "login" ? handleLogin : mode === "register" ? handleRegister : handleForgot}>
        {mode === "register" && (
          <FieldGroup label="Nom complet" error={fieldErrors.name}>
            <input
              className="auth-input"
              type="text" value={name} onChange={(e) => { setName(e.target.value); setFieldErrors(p => ({ ...p, name: undefined })); }}
              placeholder="ex: Jean Dupont"
              style={inputStyle}
            />
          </FieldGroup>
        )}

        <FieldGroup label="Email" error={fieldErrors.email}>
          <div style={{ position: "relative" }}>
            <input
              className="auth-input"
              ref={emailRef}
              type="email" value={email} onChange={(e) => { setEmail(e.target.value); setFieldErrors(p => ({ ...p, email: undefined })); }}
              placeholder="votre@email.com"
              autoComplete="email" style={{ ...inputStyle, paddingRight: email.length > 0 ? 36 : 14 }}
            />
            {email.length > 0 && (
              <span style={{
                position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                display: "flex", alignItems: "center",
              }}>
                {/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={GR} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={RD} strokeWidth="2.5" strokeLinecap="round">
                    <path d="M18 6L6 18 M6 6l12 12" />
                  </svg>
                )}
              </span>
            )}
          </div>
        </FieldGroup>

        {mode !== "forgot" && (
          <FieldGroup label="Mot de passe" error={fieldErrors.password}>
            <div style={{ position: "relative" }}>
              <input
                className="auth-input"
                type={showPw ? "text" : "password"} value={password} onChange={(e) => { setPassword(e.target.value); setFieldErrors(p => ({ ...p, password: undefined })); }}
                placeholder={mode === "register" ? "12 car., 1 majuscule, 1 spécial" : "••••••••"}
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                style={{ ...inputStyle, paddingRight: password.length > 0 && mode === "register" ? 60 : 36 }}
              />
              <PasswordToggle show={showPw} onToggle={() => setShowPw(p => !p)} right={password.length > 0 && mode === "register" ? 32 : 10} />
              {password.length > 0 && mode === "register" && <PasswordCheck valid={password.length >= 12 && /[A-Z]/.test(password) && /[^A-Za-z0-9]/.test(password)} />}
            </div>
            {mode === "register" && password.length > 0 && <PasswordStrength password={password} />}
          </FieldGroup>
        )}

        {/* Forgot password link */}
        {mode === "login" && (
          <div style={{ textAlign: "right", marginBottom: 14, marginTop: -4 }}>
            <button
              type="button"
              onClick={() => { reset(); setMode("forgot"); }}
              onMouseEnter={() => setHovered("forgot")}
              onMouseLeave={() => setHovered(null)}
              style={{
                ...linkBtnStyle,
                fontSize: 12,
                color: hovered === "forgot" ? ACD : TX3,
                transition: "color 0.15s",
                textDecoration: hovered === "forgot" ? "underline" : "none",
              }}
            >
              Mot de passe oublié ?
            </button>
          </div>
        )}

        {mode !== "login" && <div style={{ height: 4 }} />}

        {/* Primary CTA */}
        <button
          type="submit" disabled={loading}
          onMouseEnter={() => !loading && setHovered("submit")}
          onMouseLeave={() => setHovered(null)}
          style={{
            width: "100%", padding: "13px 20px", border: "none", borderRadius: 10,
            background: loading ? "#D3D1C7" : hovered === "submit"
              ? "linear-gradient(135deg, #C06A08 0%, #A85A06 100%)"
              : `linear-gradient(135deg, ${AC} 0%, #C06A08 100%)`,
            color: "#fff", fontSize: 14, fontWeight: 700, cursor: loading ? "wait" : "pointer",
            fontFamily: "inherit", letterSpacing: "-0.1px",
            boxShadow: loading ? "none" : hovered === "submit"
              ? "0 4px 16px rgba(217,123,13,0.35)"
              : "0 3px 12px rgba(217,123,13,0.25)",
            transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            transform: hovered === "submit" && !loading ? "translateY(-1px)" : "none",
          }}
        >
          {loading && <span className="auth-spinner" />}
          {mode === "login" && "Accéder à mes chantiers"}
          {mode === "register" && "Commencer gratuitement"}
          {mode === "forgot" && "Envoyer le lien"}
        </button>
      </form>

      {/* Switch mode — text link only */}
      <div style={{ textAlign: "center", marginTop: 16 }}>
        {mode === "login" && (
          <span style={{ fontSize: 12, color: TX3 }}>
            Pas encore de compte ?{" "}
            <button
              onClick={() => { reset(); setMode("register"); }}
              onMouseEnter={() => setHovered("switch")}
              onMouseLeave={() => setHovered(null)}
              style={{ ...linkBtnStyle, fontSize: 12, color: hovered === "switch" ? ACD : AC, transition: "color 0.15s" }}
            >
              Créer un compte
            </button>
          </span>
        )}
        {mode === "register" && (
          <span style={{ fontSize: 12, color: TX3 }}>
            Déjà un compte ?{" "}
            <button
              onClick={() => { reset(); setMode("login"); }}
              onMouseEnter={() => setHovered("switch")}
              onMouseLeave={() => setHovered(null)}
              style={{ ...linkBtnStyle, fontSize: 12, color: hovered === "switch" ? ACD : AC, transition: "color 0.15s" }}
            >
              Se connecter
            </button>
          </span>
        )}
        {mode === "forgot" && (
          <button
            onClick={() => { reset(); setMode("login"); }}
            onMouseEnter={() => setHovered("switch")}
            onMouseLeave={() => setHovered(null)}
            style={{ ...linkBtnStyle, fontSize: 12, color: hovered === "switch" ? ACD : AC, transition: "color 0.15s" }}
          >
            Retour à la connexion
          </button>
        )}
      </div>
    </PageShell>
  );
}

// ── Field Group with inline error ──────────────────────────
function FieldGroup({ label, error, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      {children}
      {error && (
        <div style={{
          fontSize: 12, color: RD, marginTop: 4, display: "flex",
          alignItems: "center", gap: 4, animation: "fadeSlide 0.2s ease-out",
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={RD} strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 8v4 M12 16h.01" />
          </svg>
          {error}
        </div>
      )}
    </div>
  );
}

// ── Password Toggle & Check Icons ───────────────────────────
function PasswordToggle({ show, onToggle, right }) {
  return (
    <span style={{ position: "absolute", right, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center" }}>
      <button type="button" onClick={onToggle} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex", alignItems: "center" }}>
        {show ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={TX3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            <path d="M1 1l22 22" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={TX3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </span>
  );
}

function PasswordCheck({ valid }) {
  return (
    <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center" }}>
      {valid ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={GR} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={RD} strokeWidth="2.5" strokeLinecap="round">
          <path d="M18 6L6 18 M6 6l12 12" />
        </svg>
      )}
    </span>
  );
}

// ── Password Strength Indicator ─────────────────────────────
function PasswordStrength({ password }) {
  const checks = [
    { ok: password.length >= 12, label: "12 caractères" },
    { ok: /[A-Z]/.test(password), label: "1 majuscule" },
    { ok: /[^A-Za-z0-9]/.test(password), label: "1 spécial" },
  ];
  const passed = checks.filter(c => c.ok).length;
  const color = passed === 3 ? GR : passed >= 2 ? "#D97B0D" : RD;

  return (
    <div style={{ marginTop: 6 }}>
      {/* Bar */}
      <div style={{ display: "flex", gap: 3, marginBottom: 5 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 2,
            background: i < passed ? color : SBB,
            transition: "background 0.2s",
          }} />
        ))}
      </div>
      {/* Criteria */}
      <div style={{ display: "flex", gap: 10 }}>
        {checks.map((c, i) => (
          <span key={i} style={{ fontSize: 11, color: c.ok ? GR : TX3, transition: "color 0.2s" }}>
            {c.ok ? "\u2713" : "\u2022"} {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Reset Password Page ────────────────────────────────────
export function ResetPasswordPage() {
  const { setRecovery } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [hovered, setHovered] = useState(null);
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleReset = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 12) { setError("Le mot de passe doit contenir au moins 12 caractères."); return; }
    if (!/[A-Z]/.test(password)) { setError("Le mot de passe doit contenir au moins une majuscule."); return; }
    if (!/[^A-Za-z0-9]/.test(password)) { setError("Le mot de passe doit contenir au moins un caractère spécial."); return; }
    if (password !== confirm) { setError("Les mots de passe ne correspondent pas."); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) {
      setError(err.message);
    } else {
      setSuccess(true);
      setTimeout(() => setRecovery(false), 2000);
    }
  };

  return (
    <PageShell>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: ACL, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={AC} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: TX, marginBottom: 8 }}>Nouveau mot de passe</div>
        <div style={{ fontSize: 13, color: TX3 }}>Choisissez un nouveau mot de passe pour votre compte</div>
      </div>

      {error && (
        <div style={{
          padding: "10px 14px", background: "#FEF2F2", border: "1px solid #FECACA",
          borderRadius: 10, marginBottom: 16, fontSize: 13, color: RD,
          display: "flex", alignItems: "flex-start", gap: 10, animation: "fadeSlide 0.25s ease-out",
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={RD} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4 M12 16h.01" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {success ? (
        <div style={{
          padding: "10px 14px", background: "#EAF3DE", border: "1px solid #C6E9B4",
          borderRadius: 10, marginBottom: 16, fontSize: 13, color: GR, textAlign: "center",
          animation: "fadeSlide 0.25s ease-out",
        }}>
          Mot de passe mis à jour avec succès ! Redirection en cours...
        </div>
      ) : (
        <form onSubmit={handleReset}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Nouveau mot de passe</label>
            <div style={{ position: "relative" }}>
              <input
                className="auth-input"
                type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="12 car., 1 majuscule, 1 spécial"
                required minLength={12} autoComplete="new-password" autoFocus style={{ ...inputStyle, paddingRight: password.length > 0 ? 60 : 36 }}
              />
              <PasswordToggle show={showPw} onToggle={() => setShowPw(p => !p)} right={password.length > 0 ? 32 : 10} />
              {password.length > 0 && <PasswordCheck valid={password.length >= 12 && /[A-Z]/.test(password) && /[^A-Za-z0-9]/.test(password)} />}
            </div>
            {password.length > 0 && <PasswordStrength password={password} />}
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Confirmer le mot de passe</label>
            <div style={{ position: "relative" }}>
              <input
                className="auth-input"
                type={showConfirm ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)}
                placeholder="Retapez le mot de passe"
                required minLength={12} autoComplete="new-password" style={{ ...inputStyle, paddingRight: 36 }}
              />
              <PasswordToggle show={showConfirm} onToggle={() => setShowConfirm(p => !p)} right={10} />
            </div>
          </div>
          <button
            type="submit" disabled={loading}
            onMouseEnter={() => !loading && setHovered("reset")}
            onMouseLeave={() => setHovered(null)}
            style={{
              width: "100%", padding: "13px 20px", border: "none", borderRadius: 10,
              background: loading ? "#D3D1C7" : hovered === "reset"
                ? "linear-gradient(135deg, #C06A08 0%, #A85A06 100%)"
                : `linear-gradient(135deg, ${AC} 0%, #C06A08 100%)`,
              color: "#fff", fontSize: 15, fontWeight: 700, cursor: loading ? "wait" : "pointer",
              fontFamily: "inherit", letterSpacing: "-0.1px",
              boxShadow: loading ? "none" : hovered === "reset"
                ? "0 4px 16px rgba(217,123,13,0.35)"
                : "0 3px 12px rgba(217,123,13,0.25)",
              transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              transform: hovered === "reset" && !loading ? "translateY(-1px)" : "none",
            }}
          >
            {loading && <span className="auth-spinner" />}
            Réinitialiser le mot de passe
          </button>
        </form>
      )}
    </PageShell>
  );
}

// ── MFA Verify Page ─────────────────────────────────────────
export function MfaVerifyPage() {
  const { refreshMfa } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [hovered, setHovered] = useState(null);

  const handleVerify = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const totp = factors?.totp?.[0];
    if (!totp) { setError("Aucun facteur MFA trouvé."); setLoading(false); return; }
    const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId: totp.id });
    if (chErr) { setError(chErr.message); setLoading(false); return; }
    const { error: vErr } = await supabase.auth.mfa.verify({ factorId: totp.id, challengeId: challenge.id, code });
    setLoading(false);
    if (vErr) {
      setError("Code incorrect. Veuillez réessayer.");
    } else {
      await refreshMfa();
    }
  };

  const handleLogout = () => supabase.auth.signOut();

  return (
    <PageShell>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: ACL, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={AC} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            <circle cx="12" cy="16" r="1" />
          </svg>
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: TX, marginBottom: 8 }}>Vérification en deux étapes</div>
        <div style={{ fontSize: 13, color: TX3 }}>Entrez le code à 6 chiffres de votre application d'authentification</div>
      </div>

      {error && (
        <div style={{
          padding: "10px 14px", background: "#FEF2F2", border: "1px solid #FECACA",
          borderRadius: 10, marginBottom: 16, fontSize: 13, color: RD,
          display: "flex", alignItems: "flex-start", gap: 10, animation: "fadeSlide 0.25s ease-out",
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={RD} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4 M12 16h.01" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleVerify}>
        <div style={{ marginBottom: 20 }}>
          <input
            className="auth-input"
            type="text" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000" required maxLength={6} autoComplete="one-time-code" inputMode="numeric" autoFocus
            style={{ ...inputStyle, textAlign: "center", fontSize: 24, fontWeight: 700, letterSpacing: "0.5em", padding: "14px 14px" }}
          />
        </div>
        <button
          type="submit" disabled={loading || code.length !== 6}
          onMouseEnter={() => !(loading || code.length !== 6) && setHovered("verify")}
          onMouseLeave={() => setHovered(null)}
          style={{
            width: "100%", padding: "13px 20px", border: "none", borderRadius: 10,
            background: loading || code.length !== 6 ? "#D3D1C7" : hovered === "verify"
              ? "linear-gradient(135deg, #C06A08 0%, #A85A06 100%)"
              : `linear-gradient(135deg, ${AC} 0%, #C06A08 100%)`,
            color: "#fff", fontSize: 15, fontWeight: 700,
            cursor: loading || code.length !== 6 ? "not-allowed" : "pointer",
            fontFamily: "inherit", letterSpacing: "-0.1px",
            boxShadow: loading || code.length !== 6 ? "none" : hovered === "verify"
              ? "0 4px 16px rgba(217,123,13,0.35)"
              : "0 3px 12px rgba(217,123,13,0.25)",
            transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            transform: hovered === "verify" && !(loading || code.length !== 6) ? "translateY(-1px)" : "none",
          }}
        >
          {loading && <span className="auth-spinner" />}
          Vérifier
        </button>
      </form>

      <div style={{ textAlign: "center", marginTop: 20 }}>
        <button
          onClick={handleLogout}
          onMouseEnter={() => setHovered("logout")}
          onMouseLeave={() => setHovered(null)}
          style={{ ...linkBtnStyle, color: hovered === "logout" ? ACD : AC, transition: "color 0.15s" }}
        >
          Se déconnecter
        </button>
      </div>
    </PageShell>
  );
}

// ── Page Shell ─────────────────────────────────────────────
function PageShell({ children }) {
  return (
    <div style={{
      minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center",
      background: BG, fontFamily: "system-ui, -apple-system, sans-serif", padding: "12px 20px",
    }}>
      <style>{`
        @keyframes sp { to { transform: rotate(360deg) } }
        @keyframes fadeSlide { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        .auth-spinner {
          width: 16px; height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top: 2px solid #fff;
          border-radius: 50%;
          animation: sp 0.6s linear infinite;
          flex-shrink: 0;
        }
        .auth-input:focus {
          border-color: ${AC} !important;
          box-shadow: 0 0 0 3px rgba(217,123,13,0.12) !important;
          outline: none !important;
        }
        .auth-input::placeholder { color: #A8A8A3; }
      `}</style>
      <div style={{ width: "100%", maxWidth: 440 }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 20 }}>
          <img src="/icon-512.png" alt="ArchiPilot" style={{ width: 40, height: 40, flexShrink: 0 }} />
          <span style={{ fontSize: 20, fontWeight: 800, color: "#4A3428", letterSpacing: "0.5px", fontFamily: "'Manrope', system-ui, sans-serif", textTransform: "uppercase" }}>ArchiPilot</span>
        </div>

        {/* Value props */}
        <div style={{ display: "flex", justifyContent: "center", gap: 28, marginBottom: 20 }}>
          {benefits.map((b, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={AC} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d={b.icon} />
              </svg>
              <span style={{ fontSize: 10, color: TX3, fontWeight: 500, whiteSpace: "nowrap", textAlign: "center" }}>{b.label}</span>
            </div>
          ))}
        </div>

        {/* Card */}
        <div style={{
          background: WH, borderRadius: 16, border: `1px solid ${SBB}`,
          padding: "24px 28px 22px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
          animation: "fadeSlide 0.3s ease-out",
        }}>
          {children}
        </div>

        {/* Footer */}
        <div style={{ textAlign: "center", marginTop: 10, fontSize: 10, color: TX3, opacity: 0.6 }}>
          © {new Date().getFullYear()} ArchiPilot
        </div>
      </div>
    </div>
  );
}

// ── Shared Styles ──────────────────────────────────────────
const labelStyle = {
  display: "block", fontSize: 12, fontWeight: 600, color: TX2, marginBottom: 5,
};

const inputStyle = {
  width: "100%", padding: "11px 14px", border: `1px solid ${SBB}`, borderRadius: 8,
  fontSize: 14, fontFamily: "inherit", background: SB, color: TX, boxSizing: "border-box",
  outline: "none", transition: "border-color 0.15s, box-shadow 0.15s",
};

const linkBtnStyle = {
  background: "none", border: "none", cursor: "pointer", color: AC,
  fontWeight: 600, fontSize: 13, fontFamily: "inherit", padding: 0,
  textDecoration: "none",
};
