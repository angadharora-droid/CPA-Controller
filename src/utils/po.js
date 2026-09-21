/* ---------- purchase-order document helpers ---------- */

/* The buying entity, as printed on every PO. */
export const COMPANY = {
  name: "CENTRE POINT AMARAVATI (UNIT OF AMARJIT FISCAL VENTURES PVT. LTD.)",
  address1: "New Bye Pass, Near Chatri Talao,",
  address2: "Dastur Nagar, Amravati",
  gstin: "27AAFCA2379C2ZU",
  state: "Maharashtra, Code : 27",
};

/* Multi-line "Invoice To" / "Consignee" block. First line is printed bold. */
export const COMPANY_BLOCK = [
  COMPANY.name,
  COMPANY.address1,
  COMPANY.address2,
  `GSTIN/UIN: ${COMPANY.gstin}`,
  `State Name : ${COMPANY.state}`,
].join("\n");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* "18-Aug-26" from an ISO date (yyyy-mm-dd) or anything Date can parse; otherwise the raw value. */
export function fmtDateShort(v) {
  if (!v) return "";
  let d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) d = new Date(`${v}T00:00:00`);
  else { d = new Date(v); if (isNaN(d.getTime())) return String(v); }
  return `${String(d.getDate()).padStart(2, "0")}-${MONTHS[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`;
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* 69739.2 -> "69,739.20" (Indian grouping, always two decimals, no currency symbol). */
export function fmtMoney(n) {
  const v = Number(n);
  if (isNaN(v)) return "";
  return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* Negative values print Tally-style as "(-)3,486.96". */
export function fmtSigned(n) {
  const v = Number(n) || 0;
  return v < 0 ? `(-)${fmtMoney(-v)}` : fmtMoney(v);
}

/* 72 -> "72.0", 504 -> "504.0" */
export function fmtQty(n) {
  const v = Number(n);
  if (isNaN(v)) return "";
  return v.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

const round2 = (n) => Math.round(n * 100) / 100;

/* ---------- GST helpers (shared by the PO and the GRN transport charge) ---------- */
/* Standard slabs offered in the rate pickers; any other rate can still be typed in. */
export const GST_SLABS = ["0", "5", "12", "18", "28", "40"];
export const OUR_STATE_CODE = COMPANY.gstin.slice(0, 2);

/* State code from a GSTIN (first two digits), else from "State Name, Code : 27". */
export function stateCodeOf(gstin, stateText) {
  const g = String(gstin || "").trim().match(/^\d{2}/);
  if (g) return g[0];
  const s = String(stateText || "").match(/(\d{2})\s*$/);
  return s ? s[1] : "";
}

/* Another state's party bills IGST; same state (or unknown) bills CGST + SGST. */
export function gstTypeForState(code) {
  return code && code !== OUR_STATE_CODE ? "IGST" : "CGST_SGST";
}

function splitGst(taxable, gstPct, gstType) {
  let cgst = 0, sgst = 0, igst = 0;
  if (gstPct > 0) {
    if (gstType === "IGST") igst = round2(taxable * gstPct / 100);
    else { cgst = round2(taxable * gstPct / 200); sgst = cgst; }
  }
  return { cgst, sgst, igst };
}

/* Freight recorded on a GRN: amount, its GST split and the total. Absent transport gives zeros. */
export function computeTransport(t) {
  const amount = round2(Number(t?.amount) || 0);
  const gstPct = Number(t?.gstPct) || 0;
  const gstType = t?.gstType === "IGST" ? "IGST" : "CGST_SGST";
  const { cgst, sgst, igst } = splitGst(amount, gstPct, gstType);
  const gst = round2(cgst + sgst + igst);
  return { amount, gstPct, gstType, cgst, sgst, igst, gst, total: round2(amount + gst) };
}

/* Subtotal, overall discount, GST split and rounding for a PO. Old POs without discount/GST fields
   simply produce zeros for those rows. */
export function computePOTotals(po) {
  const lines = po.lines || [];
  const subtotal = round2(lines.reduce((s, l) => s + (Number(l.amount) || (Number(l.qty) || 0) * (Number(l.rate) || 0)), 0));
  const discountPct = Number(po.discountPct) || 0;
  const discount = round2(subtotal * discountPct / 100);
  const taxable = round2(subtotal - discount);
  const gstPct = Number(po.gstPct) || 0;
  const gstType = po.gstType === "IGST" ? "IGST" : "CGST_SGST";
  const { cgst, sgst, igst } = splitGst(taxable, gstPct, gstType);
  const gross = round2(taxable + cgst + sgst + igst);
  const total = Math.round(gross);
  const roundOff = round2(total - gross);
  const qtyTotal = lines.reduce((s, l) => s + (Number(l.qty) || 0), 0);
  return { subtotal, discountPct, discount, taxable, gstPct, gstType, cgst, sgst, igst, gross, total, roundOff, qtyTotal };
}

/* ---------- amount in words (Indian numbering: thousand, lakh, crore) ---------- */
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n) {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : "");
}
function threeDigits(n) {
  const h = Math.floor(n / 100), r = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", r ? twoDigits(r) : ""].filter(Boolean).join(" ");
}
function integerWords(n) {
  if (n === 0) return "Zero";
  const parts = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  if (crore) parts.push(`${integerWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (n) parts.push(threeDigits(n));
  return parts.join(" ");
}

/* 78177 -> "INR Seventy Eight Thousand One Hundred Seventy Seven Only" */
export function amountInWords(amount) {
  const v = Math.abs(Number(amount) || 0);
  const rupees = Math.floor(v);
  const paise = Math.round((v - rupees) * 100);
  let s = `INR ${integerWords(rupees)}`;
  if (paise) s += ` and ${integerWords(paise)} Paise`;
  return `${s} Only`;
}
