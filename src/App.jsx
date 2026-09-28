import { useEffect, useState } from "react";
import Login from "./components/Login.jsx";
import BudgetApp from "./BudgetApp.jsx";
import { loadSession, clearSession, loginWithSso } from "./auth.js";
import { resolveSsoToken, ssoEnabled, ssoLogout } from "./lib/sso.js";
import { whenOutdated } from "./api.js";
import { C } from "./theme.js";

/* Shown instead of everything else once a newer version has been deployed: no data on screen, nothing
   to click but Refresh, so an old page cannot change anything. The server refuses its calls anyway. */
function OutdatedScreen() {
  return (
    <div style={{ fontFamily: "'Segoe UI', Inter, system-ui, sans-serif", background: C.bg, color: C.text, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, maxWidth: 420, textAlign: "center", padding: 32 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>A new version of the app is available</div>
        <div style={{ fontSize: 13, color: C.sub, marginBottom: 18 }}>
          This page is out of date. Refresh to load the latest version and data. Nothing can be saved from this page.
        </div>
        <button onClick={() => window.location.reload()}
          style={{ background: C.navy, color: "#fff", border: "none", borderRadius: 8, padding: "10px 22px", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
          Refresh
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [outdated, setOutdated] = useState(false);
  useEffect(() => whenOutdated(() => setOutdated(true)), []);
  const [user, setUser] = useState(() => loadSession());
  // True while the CPG portal is asked whether this visitor is already signed in there
  // (only when there is no local session and VITE_AUTH_URL is set).
  const [ssoChecking, setSsoChecking] = useState(() => !user && ssoEnabled());

  // Central sign-on: with the portal cookie present, skip the sign-in screen.
  // The normal sign-in stays available when this finds nothing.
  useEffect(() => {
    if (!ssoChecking) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const token = await resolveSsoToken();
        if (token && !cancelled) {
          const u = await loginWithSso(token);
          if (!cancelled) setUser(u);
        }
      } catch {
        /* not signed in to the portal, or no account linked: show the sign-in screen */
      }
      if (!cancelled) setSsoChecking(false);
    })();
    return () => { cancelled = true; };
  }, []);

  function handleLogin(u) {
    setUser(u);
  }

  function handleLogout() {
    ssoLogout(); // ends the portal session too; no-op unless VITE_AUTH_URL is set
    clearSession();
    setUser(null);
  }

  if (outdated) return <OutdatedScreen />;
  if (!user) {
    // Hold the sign-in screen back for a moment while the portal session is checked.
    if (ssoChecking) return <div style={{ minHeight: "100vh" }} aria-busy="true" />;
    return <Login onLogin={handleLogin} />;
  }
  return <BudgetApp key={user.id} currentUser={user} onLogout={handleLogout} />;
}
