import { useState, useMemo } from "react";
import { C, th, thR, toggleBtn, toggleActive, btnStyle } from "../../theme.js";
import { fmtNum, fmtRate } from "../../utils/format.js";
import { matchesQuery } from "../../utils/search.js";
import { buildLineRows, buildItemRows } from "../../utils/report.js";
import { money, count, downloadWorkbook } from "../../utils/excel.js";
import { Badge } from "../ui.jsx";

const sub = { fontSize: 10.5, color: "#9AA1AC", whiteSpace: "nowrap" };

/* Frozen, approved and complete: what departments can requisition against. Everything else is pending. */
const isApproved = (it) => it.freezeState !== "Not Frozen" && it.approvalStatus === "Approved" && it.status === "Complete";

/* What a pending item is waiting for. */
function pendingReason(it) {
  if (it.freezeState === "Not Frozen") return "Awaiting Freeze";
  return it.status !== "Complete" ? it.status : it.approvalStatus;
}

/* The two sheets of the download, in the columns described in utils/excel.js. A row is the item with
   its progress (`p`) alongside. */
const ITEM_COLS = [
  ["Budget Head", (r) => r.head, 24],
  ["Sub-category", (r) => r.sub || "", 18],
  ["Item", (r) => r.name, 32],
  ["Brand", (r) => r.brand || "", 14],
  ["Model / Specs", (r) => r.spec || "", 30],
  ["Unit", (r) => r.unit || "Nos", 7],
];
const APPROVED_SHEET = [
  ...ITEM_COLS,
  ["Approved Qty", (r) => count(r.qty), 11],
  ["Remaining Qty", (r) => count(r.p ? r.p.remaining : r.qty), 11],
  ["Awaiting Approval", (r) => count(r.p ? r.p.pendingQty : 0), 11],
  ["On PO", (r) => count(r.p ? r.p.poQty : 0), 9],
  ["Received", (r) => count(r.p ? r.p.receivedQty : 0), 9],
  ["Rate (₹)", (r) => money(r.rate), 11],
  ["Value (₹)", (r) => money(r.val), 13],
  ["Status", (r) => r.freezeState, 18],
];
const PENDING_SHEET = [
  ...ITEM_COLS,
  ["Qty", (r) => count(r.qty), 9],
  ["Rate (₹)", (r) => money(r.rate), 11],
  ["Value (₹)", (r) => money(r.val), 13],
  ["Status", pendingReason, 24],
];

/* ================= APPROVED & PENDING ITEMS (Department Head view) ================= */
export default function ItemStatusTab({ HEADS, items, allLines, pos, grns, cardStyle }) {
  const [headFilter, setHeadFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [view, setView] = useState("approved"); // approved | pending

  // how far each approved item has got: what is left to requisition, what is on PO and what has come in
  const progress = useMemo(() => {
    const m = new Map();
    buildItemRows({ HEADS, items, lineRows: buildLineRows({ items, allLines, pos, grns }) }).forEach((r) => { if (r.itemId) m.set(r.itemId, r); });
    return m;
  }, [HEADS, items, allLines, pos, grns]);

  const inHead = useMemo(() => items.filter((it) => !it.deleted && (headFilter === "All" || it.head === headFilter)), [items, headFilter]);
  const list = useMemo(() => {
    let l = inHead.filter((it) => isApproved(it) === (view === "approved"));
    if (query.trim()) l = l.filter((it) => matchesQuery(query, it.name, it.head, it.sub, it.brand, it.spec));
    return l;
  }, [inHead, query, view]);

  // both lists, for the head picked (the search only narrows the screen), as on the Reports tab
  function download() {
    const rows = inHead.map((it) => ({ ...it, p: progress.get(it.id) }));
    downloadWorkbook("Approved & Pending Items", headFilter === "All" ? "All Heads" : headFilter, [
      { name: "Approved Items", cols: APPROVED_SHEET, rows: rows.filter(isApproved) },
      { name: "Pending Items", cols: PENDING_SHEET, rows: rows.filter((r) => !isApproved(r)) },
    ]);
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={() => setView("approved")} style={{ ...toggleBtn, ...(view === "approved" ? toggleActive : {}) }}>Approved Items</button>
        <button onClick={() => setView("pending")} style={{ ...toggleBtn, ...(view === "pending" ? toggleActive : {}) }}>Pending Items</button>
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: "#9AA1AC" }}>{headFilter === "All" ? "All heads" : headFilter} · both lists</span>
        <button onClick={download} style={btnStyle(C.navy)}>Download Excel</button>
      </div>
      <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: 12, borderBottom: `1px solid ${C.line}`, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <select value={headFilter} onChange={(e) => setHeadFilter(e.target.value)} style={{ padding: "8px 10px", border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 13, minWidth: 200 }}>
            <option>All</option>
            {HEADS.map((h) => <option key={h.name}>{h.name}</option>)}
          </select>
          <input placeholder="Search item, head, brand or specs…" value={query} onChange={(e) => setQuery(e.target.value)}
            style={{ flex: 1, minWidth: 160, padding: "8px 10px", border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 13 }} />
          <span style={{ alignSelf: "center", fontSize: 12, color: "#9AA1AC" }}>{list.length} item(s)</span>
        </div>
        <div style={{ overflowX: "auto", maxHeight: 560, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#6B7280", fontSize: 10.5, textTransform: "uppercase", background: "#FAFAF8" }}>
                <th style={th}>Item</th>
                <th style={th}>Head</th>
                <th style={th}>Brand</th>
                <th style={th}>Model / Specs</th>
                <th style={thR}>Approved Qty</th>
                {view === "approved" && <th style={thR} title="Approved quantity less what the VP has approved and what is awaiting the VP — the Balance on Raise PR">Remaining Qty</th>}
                {view === "approved" && <th style={thR} title="Received on GRNs so far">Received</th>}
                <th style={thR}>Rate</th>
                <th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((it) => {
                const p = progress.get(it.id);
                const unit = it.unit || "Nos";
                return (
                <tr key={it.id} style={{ borderTop: "1px solid #F0EFEA" }}>
                  <td style={{ padding: "7px 10px", fontWeight: 600 }}>{it.name}</td>
                  <td style={{ padding: "7px 10px", color: "#6B7280" }}>{it.head}</td>
                  <td style={{ padding: "7px 10px", color: "#6B7280" }}>{it.brand || "—"}</td>
                  <td style={{ padding: "7px 10px", color: "#6B7280" }}>{it.spec || "—"}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right" }}>{fmtNum(it.qty)} {it.unit}</td>
                  {view === "approved" && (
                    <td style={{ padding: "7px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
                      {fmtNum(p ? p.remaining : it.qty)} {unit}
                      {p && p.pendingQty > 0 && <div style={sub}>{fmtNum(p.pendingQty)} awaiting approval</div>}
                    </td>
                  )}
                  {view === "approved" && (
                    <td style={{ padding: "7px 10px", textAlign: "right", whiteSpace: "nowrap", color: p && p.receivedQty > 0 ? C.green : undefined, fontWeight: p && p.receivedQty > 0 ? 600 : 400 }}>
                      {fmtNum(p ? p.receivedQty : 0)} {unit}
                      {p && p.poQty > 0 && <div style={{ ...sub, fontWeight: 400 }}>of {fmtNum(p.poQty)} on PO</div>}
                    </td>
                  )}
                  <td style={{ padding: "7px 10px", textAlign: "right" }}>{fmtRate(it.rate)}</td>
                  <td style={{ padding: "7px 10px" }}>
                    {view === "approved"
                      ? <Badge bg="#E9F6EF" fg={C.green}>{it.freezeState}</Badge>
                      : <Badge bg="#FDF2E3" fg={C.amber}>{pendingReason(it)}</Badge>}
                  </td>
                </tr>
                );
              })}
              {list.length === 0 && <tr><td colSpan={view === "approved" ? 9 : 7} style={{ padding: 20, textAlign: "center", color: "#9AA1AC" }}>Nothing here.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
