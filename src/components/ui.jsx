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

export function Field({ label, children }) {
  return <div style={{ marginBottom: 10 }}><label style={{ fontSize: 11.5, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 3 }}>{label}</label>{children}</div>;
}

export function PRResultPanel({ pr, cardStyle }) {
  const good = pr.lines.filter((l) => l.lane === "good").length;
  const exception = pr.lines.filter((l) => l.lane === "exception").length;
  return (
    <div style={{ ...cardStyle, position: "sticky", top: 16, alignSelf: "start" }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{pr.id} submitted</div>
      <div style={{ fontSize: 12.5, color: "#9AA1AC", marginBottom: 10 }}>{pr.lines.length} line item(s) — {good} on VP's Good-to-Approve lane, {exception} on VP's Exception Desk.</div>
      {pr.lines.map((l) => (
        <div key={l.lineId} style={{ borderTop: "1px solid #F0EFEA", padding: "8px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
            <span style={{ fontWeight: 600 }}>{l.itemName}</span>
            <Badge bg={l.lane === "good" ? "#E9F6EF" : "#FCEAEA"} fg={l.lane === "good" ? C.green : C.red}>{l.lane === "good" ? "Good to Approve" : "Exception"}</Badge>
          </div>
          <div style={{ fontSize: 11.5, color: "#9AA1AC", marginTop: 2 }}>{l.reasons.join("; ")}</div>
        </div>
      ))}
    </div>
  );
}
