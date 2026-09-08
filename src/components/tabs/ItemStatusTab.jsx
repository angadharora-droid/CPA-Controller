import { useState, useMemo } from "react";
import { C, th, thR, toggleBtn, toggleActive } from "../../theme.js";
import { fmtINR, fmtNum } from "../../utils/format.js";
import { Badge } from "../ui.jsx";

/* ================= APPROVED & PENDING ITEMS (Department Head view) ================= */
export default function ItemStatusTab({ HEADS, items, cardStyle }) {
  const [headFilter, setHeadFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [view, setView] = useState("approved"); // approved | pending

  const list = useMemo(() => {
    let l = items.filter((it) => !it.deleted);
    if (view === "approved") l = l.filter((it) => it.freezeState !== "Not Frozen" && it.approvalStatus === "Approved" && it.status === "Complete");
    else l = l.filter((it) => it.freezeState === "Not Frozen" || it.approvalStatus !== "Approved" || it.status !== "Complete");
    if (headFilter !== "All") l = l.filter((it) => it.head === headFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      l = l.filter((it) => it.name.toLowerCase().includes(q));
    }
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
          <input placeholder="Search items…" value={query} onChange={(e) => setQuery(e.target.value)}
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
                <th style={thR}>Rate</th>
                <th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((it) => (
                <tr key={it.id} style={{ borderTop: "1px solid #F0EFEA" }}>
                  <td style={{ padding: "7px 10px", fontWeight: 600 }}>{it.name}</td>
                  <td style={{ padding: "7px 10px", color: "#6B7280" }}>{it.head}</td>
                  <td style={{ padding: "7px 10px", color: "#6B7280" }}>{it.brand || "—"}</td>
                  <td style={{ padding: "7px 10px", color: "#6B7280" }}>{it.spec || "—"}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right" }}>{fmtNum(it.qty)} {it.unit}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right" }}>{fmtINR(it.rate)}</td>
                  <td style={{ padding: "7px 10px" }}>
                    {view === "approved"
                      ? <Badge bg="#E9F6EF" fg={C.green}>{it.freezeState}</Badge>
                      : <Badge bg="#FDF2E3" fg={C.amber}>{it.freezeState === "Not Frozen" ? "Awaiting Freeze" : it.status !== "Complete" ? it.status : it.approvalStatus}</Badge>}
                  </td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={7} style={{ padding: 20, textAlign: "center", color: "#9AA1AC" }}>Nothing here.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
