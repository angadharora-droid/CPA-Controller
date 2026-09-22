import { useEffect, useState } from "react";
import Login from "./components/Login.jsx";
import BudgetApp from "./BudgetApp.jsx";
import { loadSession, clearSession, loginWithSso } from "./auth.js";
import { resolveSsoToken, ssoEnabled, ssoLogout } from "./lib/sso.js";

export default function App() {
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

  if (!user) {
    // Hold the sign-in screen back for a moment while the portal session is checked.
    if (ssoChecking) return <div style={{ minHeight: "100vh" }} aria-busy="true" />;
    return <Login onLogin={handleLogin} />;
  }
  return <BudgetApp key={user.id} currentUser={user} onLogout={handleLogout} />;
}
