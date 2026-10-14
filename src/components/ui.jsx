import { useEffect } from "react";
import { C, cellInput, btnStyle } from "../theme.js";
import { fmtNum, fmtRate } from "../utils/format.js";
import { UNITS } from "../utils/units.js";

/* The Purchase Manager can only lower a quantity, and a cut can't be taken back, so it is confirmed
   first. `cuts` is [{ itemName, was, n }]. */
export function confirmQtyCut(cuts) {
  const list = cuts.map((c) => `"${c.itemName}": ${fmtNum(c.was)} → ${fmtNum(c.n)}`).join("\n");
  return window.confirm(`Reduce the quantity?\n\n${list}\n\nThe units not bought go back to the approved balance. A quantity can't be raised again afterwards.`);
}

/* A new unit converts the budget item and every requisition for it, so it is confirmed first.
   `changes` is [{ itemName, was, from, n, to, rate, onItem }]; the amount (was × rate) stays put. */
export function confirmUnitChange(changes) {
  const list = changes.map((c) => {
    const f = c.n / c.was;
    return `"${c.itemName}": ${fmtNum(c.was)} ${c.from} → ${fmtNum(c.n)} ${c.to}\n`
      + `Rate ${fmtRate(c.rate)} per ${c.from} → ${fmtRate(c.rate / f)} per ${c.to}, amount stays ${fmtRate(c.was * c.rate)}`
      + (c.onItem ? `\nThe budget item counts in ${c.to} from now on (1 ${c.from} = ${fmtNum(f)} ${c.to}): its approved quantity, balance and other requisitions convert the same way.` : "");
  }).join("\n\n");
  return window.confirm(`Change the unit?\n\n${list}`);
}

/* The unit picker. A unit not on the list (typed into an older record) stays selectable so it still shows. */
export function UnitSelect({ value, onChange, disabled, title }) {
  const options = UNITS.includes(value) ? UNITS : [value, ...UNITS];
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} title={title || undefined}
      style={{ ...cellInput, width: 74, textAlign: "left", background: disabled ? "#F6F5F2" : "#fff", cursor: disabled ? "not-allowed" : "pointer" }}>
      {options.map((u) => <option key={u} value={u}>{u}</option>)}
    </select>
  );
}

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

/* A window over the page, so what is opened shows where the user is looking instead of somewhere
   down a long list. Closes on ✕, Esc or a click outside. Rendered in place, not in a body portal:
   printing hides the app (#root) and with it this window, so a PO prints only its own copy. */
export function Modal({ title, onClose, children, width = 960 }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(11,30,54,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "3vh 12px", boxSizing: "border-box" }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true"
        style={{ background: C.bg, borderRadius: 12, width: "100%", maxWidth: width, maxHeight: "94vh", overflowY: "auto", overscrollBehavior: "contain", boxShadow: "0 18px 50px rgba(0,0,0,0.3)" }}>
        <div style={{ position: "sticky", top: 0, zIndex: 1, background: C.navy, color: "#fff", padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, borderRadius: "12px 12px 0 0" }}>
          <div style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
          <button onClick={onClose} style={{ ...btnStyle("transparent"), border: `1px solid ${C.gold}`, padding: "5px 12px", flexShrink: 0 }}>✕ Close</button>
        </div>
        <div style={{ padding: 14 }}>{children}</div>
      </div>
    </div>
  );
}

/* Free-text filter box shown above a list; pair it with matchesQuery() from utils/search.js. */
export function SearchBox({ value, onChange, placeholder, style }) {
  return (
    <input type="search" placeholder={placeholder || "Search…"} value={value} onChange={(e) => onChange(e.target.value)}
      style={{ flex: 1, minWidth: 180, padding: "8px 10px", border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 13, boxSizing: "border-box", fontFamily: "inherit", ...style }} />
  );
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
