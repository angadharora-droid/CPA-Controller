/* ---------- authentication (backed by the API + MongoDB) ---------- */
import { api, setToken, clearToken, getToken } from "./api.js";

const SESSION_KEY = "cpa-budget-control-session";

export async function login(id, password) {
  const { token, user } = await api("/login", { method: "POST", body: { id, password } });
  setToken(token);
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(user)); } catch {}
  return user;
}

/* Central sign-on: exchange the portal hand-off token for a session, stored exactly as login() does. */
export async function loginWithSso(ssoToken) {
  const { token, user } = await api("/sso", { method: "POST", body: { token: ssoToken } });
  setToken(token);
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(user)); } catch {}
  return user;
}

export function loadSession() {
  try {
    if (!getToken()) return null;
    const raw = localStorage.getItem(SESSION_KEY);
    const user = raw ? JSON.parse(raw) : null;
    // A session cached before the admin flag existed has no isAdmin field; force a fresh sign-in
    // so the account picks up its current role and permissions.
    if (!user || typeof user.isAdmin !== "boolean") { clearSession(); return null; }
    return user;
  } catch {
    return null;
  }
}

export function clearSession() {
  clearToken();
  try { localStorage.removeItem(SESSION_KEY); } catch {}
}
