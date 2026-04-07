import React from 'react'
import ReactDOM from 'react-dom/client'
import { AuthProvider, useAuth, AuthPage, ResetPasswordPage, MfaVerifyPage } from './Auth.jsx'
import App from './App.jsx'

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null, info: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { this.setState({ info }); console.error("ErrorBoundary caught:", error, info); }
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
          <button onClick={() => window.location.reload()} style={{ marginTop: 16, padding: "10px 24px", background: "#D97B0D", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
            Recharger
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function Root() {
  const { user, loading, recovery, mfaRequired } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FAFAF9", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: "#D97B0D", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 20, fontWeight: 800, margin: "0 auto 16px" }}>A</div>
          <div style={{ width: 24, height: 24, border: "2.5px solid #E2E1DD", borderTop: "2.5px solid #D97B0D", borderRadius: "50%", animation: "spin 0.7s linear infinite", margin: "0 auto" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      </div>
    );
  }

  if (recovery) return <ResetPasswordPage />;

  if (!user) return <AuthPage />;

  if (mfaRequired) return <MfaVerifyPage />;

  return <ErrorBoundary><App /></ErrorBoundary>;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
  </React.StrictMode>
)
