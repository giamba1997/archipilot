import React from 'react'
import ReactDOM from 'react-dom/client'
import { AuthProvider, useAuth, AuthPage } from './Auth.jsx'
import App from './App.jsx'

function Root() {
  const { user, loading } = useAuth();

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

  if (!user) return <AuthPage />;

  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
  </React.StrictMode>
)
