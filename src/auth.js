/* ---------- authentication (backed by the API + MongoDB) ---------- */
import { api, setToken, clearToken, getToken } from "./api.js";

const SESSION_KEY = "cpa-budget-control-session";

export async function login(id, password) {
  const { token, user } = await api("/login", { method: "POST", body: { id, password } });
  setToken(token);
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(user)); } catch {}
  return user;
}

export function loadSession() {
  try {
    if (!getToken()) return null;
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  clearToken();
  try { localStorage.removeItem(SESSION_KEY); } catch {}
}
