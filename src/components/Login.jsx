import { useState } from "react";
import { C } from "../theme.js";
import { login } from "../auth.js";

export default function Login({ onLogin }) {
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const user = await login(id, password);
      onLogin(user);
    } catch (err) {
      setError(err.message || "Sign-in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = {
    width: "100%", padding: "11px 13px", border: `1px solid ${C.line}`, borderRadius: 8,
    fontSize: 14, boxSizing: "border-box", fontFamily: "inherit", background: "#FDFDFC",
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: `linear-gradient(135deg, ${C.navy} 0%, ${C.navy2} 55%, #1A3A5F 100%)`,
      fontFamily: "'Segoe UI', Inter, system-ui, sans-serif", padding: 20,
    }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 26 }}>
          <div style={{ fontSize: 12, letterSpacing: 3, color: C.gold, fontWeight: 700, textTransform: "uppercase" }}>
            Centre Point Hospitality
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", marginTop: 6 }}>
            Centre Point Amravati
          </div>
          <div style={{ fontSize: 13, color: "#C7D0DE", marginTop: 4 }}>
            Pre-Opening Budget &amp; Purchase Control
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{
          background: "#fff", borderRadius: 14, padding: "28px 26px",
          boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
        }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 18 }}>Sign in to continue</div>

          <label style={{ fontSize: 11.5, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 }}>User ID</label>
          <input value={id} onChange={(e) => setId(e.target.value)} placeholder="Enter your user ID"
            autoFocus autoComplete="username" style={{ ...inputStyle, marginBottom: 14 }} />

          <label style={{ fontSize: 11.5, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 }}>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password"
            autoComplete="current-password" style={{ ...inputStyle, marginBottom: 16 }} />

          {error && (
            <div style={{ background: "#FCEAEA", color: C.red, fontSize: 12.5, fontWeight: 600, padding: "9px 12px", borderRadius: 8, marginBottom: 14 }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={busy} style={{
            width: "100%", background: `linear-gradient(120deg, ${C.gold}, ${C.goldDark})`, color: C.navy,
            border: "none", borderRadius: 8, padding: "12px 0", fontSize: 14.5, fontWeight: 800,
            cursor: busy ? "wait" : "pointer", letterSpacing: 0.4, opacity: busy ? 0.7 : 1,
          }}>{busy ? "Signing in…" : "Sign In"}</button>

          <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.line}`, fontSize: 11.5, color: "#9AA1AC", lineHeight: 1.7 }}>
            Access is limited to authorised users: <b>VP</b>, <b>President</b>, <b>Purchase Manager</b>, <b>Store Manager</b> and <b>Department Head</b>.
          </div>
        </form>
      </div>
    </div>
  );
}
