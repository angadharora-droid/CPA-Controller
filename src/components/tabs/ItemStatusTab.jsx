import { useState, useMemo } from "react";
import { C, th, thR, toggleBtn, toggleActive } from "../../theme.js";
import { fmtINR, fmtNum, fmtRate } from "../../utils/format.js";
import { matchesQuery } from "../../utils/search.js";
import { buildLineRows, buildItemRows } from "../../utils/report.js";
import { Badge } from "../ui.jsx";

const sub = { fontSize: 10.5, color: "#9AA1AC", whiteSpace: "nowrap" };

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

  const list = useMemo(() => {
    let l = items.filter((it) => !it.deleted);
    if (view === "approved") l = l.filter((it) => it.freezeState !== "Not Frozen" && it.approvalStatus === "Approved" && it.status === "Complete");
    else l = l.filter((it) => it.freezeState === "Not Frozen" || it.approvalStatus !== "Approved" || it.status !== "Complete");
    if (headFilter !== "All") l = l.filter((it) => it.head === headFilter);
    if (query.trim()) l = l.filter((it) => matchesQuery(query, it.name, it.head, it.sub, it.brand, it.spec));
    return l;
  }, [items, headFilter, query, view]);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setView("approved")} style={{ ...toggleBtn, ...(view === "approved" ? toggleActive : {}) }}>Approved Items</button>
        <button onClick={() => setView("pending")} style={{ ...toggleBtn, ...(view === "pending" ? toggleActive : {}) }}>Pending Items</button>
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
                      : <Badge bg="#FDF2E3" fg={C.amber}>{it.freezeState === "Not Frozen" ? "Awaiting Freeze" : it.status !== "Complete" ? it.status : it.approvalStatus}</Badge>}
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
