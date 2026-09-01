/* ---------- design tokens & shared styles ---------- */
export const C = {
  navy: "#0B1E36",
  navy2: "#122A47",
  charcoal: "#1C242E",
  gold: "#C6A15B",
  goldDark: "#A9843E",
  bg: "#F6F5F2",
  card: "#FFFFFF",
  line: "#E4E1D9",
  text: "#1C242E",
  sub: "#6B7280",
  green: "#1E8E5A",
  amber: "#B9760A",
  red: "#B3261E",
  blue: "#2E5FA3",
  grey: "#9AA1AC",
};

export const STATUS_COLORS = {
  Complete: { bg: "#E9F6EF", fg: "#1E8E5A", label: "Complete" },
  "Rate Missing": { bg: "#FDF2E3", fg: "#B9760A", label: "Rate Missing" },
  "Quantity Missing": { bg: "#FDF2E3", fg: "#B9760A", label: "Qty Missing" },
  "Specification Missing": { bg: "#FDF2E3", fg: "#B9760A", label: "Spec Missing" },
  "Item-Level Details Missing": { bg: "#FCEAEA", fg: "#B3261E", label: "Details Missing" },
  "Management Confirmation Required": { bg: "#EAF0FB", fg: "#2E5FA3", label: "Mgmt Confirmation" },
};

export const FREEZE_STATES = ["Not Frozen", "Fully Frozen", "Provisionally Frozen", "Lump-Sum Frozen", "Not Approved"];
export const APPROVAL_STATES = ["Pending", "Approved", "Rejected", "Deferred"];

export const th = { padding: "8px 10px", whiteSpace: "nowrap" };
export const thR = { padding: "8px 10px", textAlign: "right", whiteSpace: "nowrap" };
export const pgBtn = { border: `1px solid ${C.line}`, background: "#fff", borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer" };
export function btnStyle(color) {
  return { background: color, color: "#fff", border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" };
}
export const cellInput = { width: 72, padding: "4px 6px", border: `1px solid ${C.line}`, borderRadius: 5, textAlign: "right", fontSize: 12 };
export const cardBase = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 12 };
export const inputStyle = { width: "100%", padding: "8px 10px", border: `1px solid ${C.line}`, borderRadius: 7, fontSize: 13, boxSizing: "border-box", fontFamily: "inherit" };
export const toggleBtn = { border: `1px solid ${C.line}`, background: "#fff", borderRadius: 7, padding: "6px 12px", fontSize: 12, cursor: "pointer" };
export const toggleActive = { background: C.navy, color: "#fff", borderColor: C.navy };
