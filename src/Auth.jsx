import { useState, useEffect, createContext, useContext } from "react";
import { supabase } from "./supabase";

// ── Colors (matching App.jsx DA) ───────────────────────────
const AC  = "#D97B0D";
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
const AuthContext = createContext({ user: null, session: null, loading: true });

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Auth Page (Login / Register / Forgot) ──────────────────
export function AuthPage() {
  const [mode, setMode] = useState("login"); // "login" | "register" | "forgot" | "check-email"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const reset = () => { setError(""); setMessage(""); setPassword(""); };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
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
    setError(""); setLoading(true);
    if (password.length < 6) { setError("Le mot de passe doit contenir au moins 6 caractères."); setLoading(false); return; }
    if (!name.trim()) { setError("Le nom est requis."); setLoading(false); return; }
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
    setError(""); setLoading(true);
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
          <button onClick={() => { reset(); setMode("login"); }} style={linkBtnStyle}>
            Retour à la connexion
          </button>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      {/* Title */}
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: TX, letterSpacing: "-0.4px" }}>
          {mode === "login" && "Connexion"}
          {mode === "register" && "Créer un compte"}
          {mode === "forgot" && "Mot de passe oublié"}
        </div>
        <div style={{ fontSize: 13, color: TX3, marginTop: 6 }}>
          {mode === "login" && "Connectez-vous pour accéder à vos projets"}
          {mode === "register" && "Commencez à gérer vos chantiers avec ArchiPilot"}
          {mode === "forgot" && "Entrez votre email pour recevoir un lien de réinitialisation"}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: "10px 14px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, marginBottom: 16, fontSize: 13, color: RD, display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={RD} strokeWidth="2" strokeLinecap="round"><path d="M12 9v4 M12 17h.01" /></svg>
          {error}
        </div>
      )}

      {/* Success message */}
      {message && (
        <div style={{ padding: "10px 14px", background: "#EAF3DE", border: "1px solid #C6E9B4", borderRadius: 8, marginBottom: 16, fontSize: 13, color: GR }}>
          {message}
        </div>
      )}

      {/* Form */}
      <form onSubmit={mode === "login" ? handleLogin : mode === "register" ? handleRegister : handleForgot}>
        {mode === "register" && (
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Nom complet</label>
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="ex: Gaëlle CNOP"
              required style={inputStyle}
            />
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Email</label>
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="votre@email.com"
            required autoComplete="email" style={inputStyle}
          />
        </div>

        {mode !== "forgot" && (
          <div style={{ marginBottom: 6 }}>
            <label style={labelStyle}>Mot de passe</label>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "register" ? "6 caractères minimum" : "••••••••"}
              required minLength={mode === "register" ? 6 : undefined}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              style={inputStyle}
            />
          </div>
        )}

        {/* Forgot password link */}
        {mode === "login" && (
          <div style={{ textAlign: "right", marginBottom: 18 }}>
            <button type="button" onClick={() => { reset(); setMode("forgot"); }} style={linkBtnStyle}>
              Mot de passe oublié ?
            </button>
          </div>
        )}

        {mode !== "login" && <div style={{ height: 12 }} />}

        {/* Submit */}
        <button type="submit" disabled={loading} style={{
          width: "100%", padding: "13px 20px", border: "none", borderRadius: 10,
          background: loading ? "#D3D1C7" : `linear-gradient(135deg, ${AC} 0%, #C06A08 100%)`,
          color: "#fff", fontSize: 15, fontWeight: 700, cursor: loading ? "wait" : "pointer",
          fontFamily: "inherit", letterSpacing: "-0.1px",
          boxShadow: loading ? "none" : "0 3px 12px rgba(217,123,13,0.25)",
          transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          {loading && <span style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid #fff", borderRadius: "50%", animation: "sp 0.6s linear infinite", flexShrink: 0 }} />}
          {mode === "login" && "Se connecter"}
          {mode === "register" && "Créer mon compte"}
          {mode === "forgot" && "Envoyer le lien"}
        </button>
      </form>

      {/* Switch mode */}
      <div style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: TX3 }}>
        {mode === "login" && (
          <>Pas encore de compte ?{" "}
            <button onClick={() => { reset(); setMode("register"); }} style={linkBtnStyle}>S'inscrire</button>
          </>
        )}
        {mode === "register" && (
          <>Déjà un compte ?{" "}
            <button onClick={() => { reset(); setMode("login"); }} style={linkBtnStyle}>Se connecter</button>
          </>
        )}
        {mode === "forgot" && (
          <button onClick={() => { reset(); setMode("login"); }} style={linkBtnStyle}>Retour à la connexion</button>
        )}
      </div>
    </PageShell>
  );
}

// ── Page Shell ─────────────────────────────────────────────
function PageShell({ children }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: BG, fontFamily: "system-ui, -apple-system, sans-serif", padding: 20 }}>
      <style>{`@keyframes sp { to { transform: rotate(360deg) } }`}</style>
      <div style={{ width: "100%", maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: AC, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 20, fontWeight: 800, letterSpacing: "-0.5px", margin: "0 auto 12px" }}>A</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: TX, letterSpacing: "-0.3px" }}>ArchiPilot</div>
          <div style={{ fontSize: 12, color: TX3, marginTop: 2 }}>Gestion de chantier</div>
        </div>

        {/* Card */}
        <div style={{ background: WH, borderRadius: 16, border: `1px solid ${SBB}`, padding: "28px 28px 24px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          {children}
        </div>

        {/* Footer */}
        <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: TX3 }}>
          © {new Date().getFullYear()} ArchiPilot · DEWIL architecten
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
  outline: "none", transition: "border-color 0.15s",
};

const linkBtnStyle = {
  background: "none", border: "none", cursor: "pointer", color: AC,
  fontWeight: 600, fontSize: 13, fontFamily: "inherit", padding: 0,
  textDecoration: "none",
};
