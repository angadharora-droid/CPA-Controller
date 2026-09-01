import { useState } from "react";
import Login from "./components/Login.jsx";
import BudgetApp from "./BudgetApp.jsx";
import { loadSession, clearSession } from "./auth.js";

export default function App() {
  const [user, setUser] = useState(() => loadSession());

  function handleLogin(u) {
    setUser(u);
  }

  function handleLogout() {
    clearSession();
    setUser(null);
  }

  if (!user) return <Login onLogin={handleLogin} />;
  return <BudgetApp key={user.id} currentUser={user} onLogout={handleLogout} />;
}
