/* ---------- API client ---------- */
const TOKEN_KEY = "cpa-budget-control-token";

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token) {
  try { localStorage.setItem(TOKEN_KEY, token); } catch {}
}
export function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
}

/* The build this page was loaded from ("dev" under the Vite dev server). Sent with every call: the
   server refuses calls from a build older than the one it is serving. */
const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";

let onOutdated = () => {};
/* App registers what to do once the server says this page is out of date. */
export function whenOutdated(fn) {
  onOutdated = fn;
}

export async function api(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json", "X-App-Version": APP_VERSION };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Cannot reach the server. Is the API running?");
  }
  if (res.status === 401 && path !== "/login") clearToken();
  if (res.status === 426) onOutdated(); // a newer version has been deployed since this page was opened
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    // status and body travel with the error: a refused save (409) is handled differently from a dropped connection
    throw Object.assign(new Error(data.error || `Request failed (${res.status}).`), { status: res.status, data });
  }
  return res.json();
}
