import React from 'react'
import ReactDOM from 'react-dom/client'
import { initSentry, Sentry } from './sentry'
import { AuthProvider, useAuth, AuthPage, ResetPasswordPage, MfaVerifyPage } from './Auth.jsx'
import App from './App.jsx'
import { PublicSignPage } from './views/PublicSignPage'
import { PvComposer } from './pages/PvComposer'
import { Account } from './pages/Account'
import { MetierDemo } from './pages/MetierViews'
import { OnboardingWizard } from './components/modals/OnboardingWizard'
import { isEnabled } from './constants/featureFlags'

// Route preview du composer de PV v2 (design Direction D) : /pv/demo
const pvComposerDemo = (() => {
  try { return window.location.pathname === "/pv/demo"; } catch { return false; }
})();
// Route preview de la page Compte v2 : /compte/demo
const accountDemo = (() => {
  try { return window.location.pathname === "/compte/demo"; } catch { return false; }
})();
// Route preview des vues métier v2 (Réserves OPR / Honoraires / Devis) : /metier/demo
const metierDemo = (() => {
  try { return window.location.pathname === "/metier/demo"; } catch { return false; }
})();
// Route preview du wizard d'onboarding v2 : /onboarding/demo
const onboardingDemo = (() => {
  try { return window.location.pathname === "/onboarding/demo"; } catch { return false; }
})();

// Initialize Sentry before anything else
initSentry();

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null, info: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { this.setState({ info }); console.error("ErrorBoundary caught:", error, info); Sentry.captureException(error, { extra: { componentStack: info?.componentStack } }); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: "monospace", maxWidth: 700, margin: "0 auto" }}>
          <h2 style={{ color: "#C4392A" }}>Erreur de rendu</h2>
          <pre style={{ background: "#FEF2F2", padding: 16, borderRadius: 8, overflow: "auto", fontSize: 12, lineHeight: 1.6 }}>
            {this.state.error.toString()}
            {"\n\n"}
            {this.state.info?.componentStack}
          </pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: 16, padding: "10px 24px", background: "#B85C2C", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
            Recharger
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Capture an org invite token from the URL the moment the page loads,
// before any auth redirect can strip it. App.jsx will pick it up after
// the user logs in (whether by signing up fresh or signing in to an
// existing account).
try {
  const token = new URLSearchParams(window.location.search).get("invite");
  if (token) localStorage.setItem("archipilot_pending_invite", token);
} catch { /* ignore */ }

function Root() {
  const { user, loading, recovery, mfaRequired } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FAFAF9", fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <img src="/icon-512.png" alt="ArchiPilot" style={{ width: 48, height: 48, margin: "0 auto 16px" }} />
          <div style={{ width: 24, height: 24, border: "2.5px solid #E2E1DD", borderTop: "2.5px solid #B85C2C", borderRadius: "50%", animation: "spin 0.7s linear infinite", margin: "0 auto" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      </div>
    );
  }

  if (recovery) return <ResetPasswordPage />;

  if (!user) return <AuthPage />;

  if (mfaRequired) return <MfaVerifyPage />;

  if (pvComposerDemo) return <ErrorBoundary><PvComposer onClose={() => { window.location.href = "/"; }} /></ErrorBoundary>;

  if (accountDemo) return <ErrorBoundary><div style={{ height: "100vh" }}><Account demo /></div></ErrorBoundary>;

  if (metierDemo) return <ErrorBoundary><MetierDemo /></ErrorBoundary>;

  if (onboardingDemo) { const _st = Number(new URLSearchParams(window.location.search).get("step")) || 0; return <ErrorBoundary><div style={{ minHeight: "100vh", background: "#FBF8F5" }}><OnboardingWizard initialStep={_st} profile={{ name: "Gaëlle Dupont", structure: "Atelier d'architecture GD", structureType: "architecte", plan: "free", email: "", phone: "" }} onUpdateProfile={() => {}} onCreateProject={() => {}} onComplete={() => { window.location.href = "/"; }} /></div></ErrorBoundary>; }

  return <ErrorBoundary><App /></ErrorBoundary>;
}

// Public signing route — bypass auth entirely for anonymous signataires.
// Token in URL is the only credential they need.
function publicSignToken() {
  try {
    const m = window.location.pathname.match(/^\/sign\/([A-Za-z0-9_-]{16,})$/);
    return m ? m[1] : null;
  } catch { return null; }
}

// POC : route publique de signature OPR désactivée tant que la feature `opr`
// est différée (la page de signature à distance fait partie de l'OPR).
const signToken = isEnabled("opr") ? publicSignToken() : null;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {signToken ? (
      <ErrorBoundary><PublicSignPage token={signToken} /></ErrorBoundary>
    ) : (
      <AuthProvider>
        <Root />
      </AuthProvider>
    )}
  </React.StrictMode>
)
