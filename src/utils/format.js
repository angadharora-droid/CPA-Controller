/* ---------- helpers ---------- */
export function fmtINR(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  const neg = n < 0;
  n = Math.round(Math.abs(n));
  const s = n.toString();
  let last3 = s.slice(-3);
  let rest = s.slice(0, -3);
  if (rest !== "") {
    last3 = "," + last3;
    rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  }
  return (neg ? "-" : "") + "₹" + rest + last3;
}
/* A rate with its paise: one converted to a smaller unit rarely comes out whole (₹2,000 a piece is ₹133.33 a metre). */
export function fmtRate(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return (n < 0 ? "-" : "") + "₹" + Math.abs(Number(n)).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
export function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}
export function fmtNum(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
export function nowStamp() {
  return new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
export function uid(prefix) {
  return prefix + "-" + Math.random().toString(36).slice(2, 8).toUpperCase();
}
export function padNum(n, len) {
  return String(n).padStart(len, "0");
}
