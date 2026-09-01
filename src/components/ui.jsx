import { C } from "../theme.js";

export function Badge({ children, bg, fg }) {
  return (
    <span style={{
      background: bg, color: fg, fontSize: 11.5, fontWeight: 700,
      padding: "3px 9px", borderRadius: 999, letterSpacing: 0.2, whiteSpace: "nowrap",
      display: "inline-block",
    }}>{children}</span>
  );
}

export function ReconIndicator({ color, label }) {
  const map = {
    green: { bg: "#E9F6EF", fg: C.green, dot: C.green },
    amber: { bg: "#FDF2E3", fg: C.amber, dot: C.amber },
    red: { bg: "#FCEAEA", fg: C.red, dot: C.red },
    grey: { bg: "#F0F0EF", fg: C.grey, dot: C.grey },
  };
  const m = map[color];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: m.bg, color: m.fg, fontWeight: 700, fontSize: 12, padding: "4px 10px", borderRadius: 999 }}>
      <span style={{ width: 7, height: 7, borderRadius: 99, background: m.dot }} />
      {label}
    </span>
  );
}
export function MiniStat({ label, value, accent }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: "#9AA1AC", textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: accent || C.text }}>{value}</div>
    </div>
  );
}
export function ResultPanel({ result, cardStyle }) {
  return (
    <div style={{ ...cardStyle, position: "sticky", top: 16, alignSelf: "start" }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>Result</div>
      {result.autoApproved ? (
        <div style={{ background: "#E9F6EF", border: "1px solid #BFE6D2", borderRadius: 8, padding: 12 }}>
          <div style={{ fontWeight: 800, color: C.green, fontSize: 13 }}>✓ AUTO-APPROVED — WITHIN FROZEN PRE-OPENING BUDGET</div>
          <div style={{ fontSize: 12, marginTop: 6, color: "#2A5F45" }}>{result.detail}</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>Routed directly to Purchase Manager. No President / GM / Finance approval required.</div>
        </div>
      ) : (
        <div style={{ background: "#FCEAEA", border: "1px solid #F2C5C2", borderRadius: 8, padding: 12 }}>
          <div style={{ fontWeight: 800, color: C.red, fontSize: 13 }}>⤴ ESCALATED TO PRESIDENT</div>
          <div style={{ fontSize: 12.5, marginTop: 6, fontWeight: 700 }}>{result.reasonCode}</div>
          <div style={{ fontSize: 12, marginTop: 4, color: "#7A2A26" }}>{result.detail}</div>
        </div>
      )}
      <div style={{ fontSize: 12, color: "#9AA1AC", marginTop: 10 }}>PR ID: {result.id}</div>
    </div>
  );
}

export function Field({ label, children }) {
  return <div style={{ marginBottom: 10 }}><label style={{ fontSize: 11.5, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 3 }}>{label}</label>{children}</div>;
}
