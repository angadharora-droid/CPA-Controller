// Drop-in client for the central sign-on service (ESM copy of Meeting OS
// auth/integration/node/ssoClient.js). Set AUTH_SERVICE_URL, SSO_APP_KEY and
// SSO_SHARED_SECRET; while AUTH_SERVICE_URL is empty every helper is a no-op.
// Env is read lazily so it works whether dotenv loads before or after imports.
import crypto from "crypto";

const authServiceUrl = () => String(process.env.AUTH_SERVICE_URL || "").replace(/\/+$/, "");
const sharedSecret = () => process.env.SSO_SHARED_SECRET || "";

export function ssoAppKey() {
  return process.env.SSO_APP_KEY || "cpa-controller";
}

export function ssoEnabled() {
  return Boolean(authServiceUrl());
}

// Exchanges a hand-off token (from the browser) for the local user it belongs to.
// Resolves to { localUserId, centralId, name, role } or null when the token is not valid for this app.
export async function verifySsoToken(token) {
  if (!ssoEnabled() || !token) return null;
  const appKey = ssoAppKey();
  try {
    const response = await fetch(`${authServiceUrl()}/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-SSO-App": appKey },
      body: JSON.stringify({ token }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok || data.app !== appKey) return null;
    return { localUserId: data.localUserId, centralId: data.centralId, name: data.name, role: data.role };
  } catch (err) {
    console.error("SSO verify failed:", err.message);
    return null;
  }
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

// Guards the user-directory endpoint the auth service calls when the admin matches accounts.
export function directoryGuard(req, res, next) {
  const secret = sharedSecret();
  if (!secret || !safeEqual(req.get("X-SSO-Secret") || "", secret)) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  return next();
}
