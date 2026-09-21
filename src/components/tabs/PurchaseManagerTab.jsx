import { useState } from "react";
import { C, th, thR, cellInput, btnStyle } from "../../theme.js";
import { fmtINR, fmtNum } from "../../utils/format.js";
import { Badge } from "../ui.jsx";

/* ================= PURCHASE MANAGER ================= */
export default function PurchaseManagerTab({ prs, pmSetRate, pmMarkReady, cardStyle }) {
  const inQueue = (l) => l.status === "Pending Purchase Manager" || l.status === "Ready for PO";
  const relevantPrs = prs.filter((pr) => pr.lines.some(inQueue));
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Purchase Manager — Consolidated PRs</div>
      <div style={{ fontSize: 12.5, color: "#9AA1AC", marginBottom: 14 }}>You may negotiate the rate down (never up), even after a line is marked Ready for PO — until its PO is issued. Quantity and specs are locked at this stage.</div>
      {relevantPrs.length === 0 && <div style={{ ...cardStyle, textAlign: "center", color: "#9AA1AC", padding: 40 }}>Nothing to negotiate right now.</div>}
      {relevantPrs.map((pr) => {
        const lines = pr.lines.filter(inQueue);
        if (!lines.length) return null;
        return (
          <div key={pr.id} style={{ ...cardStyle, marginBottom: 14 }}>
            <div style={{ marginBottom: 10 }}><b>{pr.id}</b> <span style={{ color: "#9AA1AC", fontSize: 12.5 }}>— {pr.raisedBy || "—"} ({pr.dept || "—"})</span></div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "#6B7280", fontSize: 10.5, textTransform: "uppercase" }}>
                    <th style={th}>Item</th><th style={thR}>Qty</th><th style={thR}>Approved Rate</th><th style={thR}>Negotiated Rate</th><th style={th}>Status</th><th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((ln) => (
                    <PMLineRow key={ln.lineId} pr={pr} ln={ln} pmSetRate={pmSetRate} pmMarkReady={pmMarkReady} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PMLineRow({ pr, ln, pmSetRate, pmMarkReady }) {
  const current = ln.pmRate || ln.finalRate;
  const [rate, setRate] = useState(current);
  function commit() {
    const n = Number(rate);
    if (n === Number(current)) return;
    pmSetRate(pr.id, ln.lineId, rate);
    // pmSetRate refuses these, so show the rate that is still in force
    if (isNaN(n) || n <= 0 || n > ln.finalRate) setRate(current);
  }
  return (
    <tr style={{ borderTop: "1px solid #F0EFEA" }}>
      <td style={{ padding: "6px 10px", fontWeight: 600 }}>{ln.itemName}<div style={{ fontSize: 10.5, color: "#9AA1AC", fontWeight: 400 }}>{ln.headName}{ln.vendorDetails ? ` · ${ln.vendorDetails}` : ""}</div></td>
      <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtNum(ln.finalQty)}</td>
      <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtINR(ln.finalRate)}</td>
      <td style={{ padding: "6px 6px", textAlign: "right" }}>
        <input type="number" value={rate} onChange={(e) => setRate(e.target.value)} onBlur={commit} style={{ ...cellInput, width: 80 }} />
      </td>
      <td style={{ padding: "6px 10px" }}><Badge bg={ln.status === "Ready for PO" ? "#E9F6EF" : "#EAF0FB"} fg={ln.status === "Ready for PO" ? C.green : C.blue}>{ln.status}</Badge></td>
      <td style={{ padding: "6px 10px" }}>
        {ln.status !== "Ready for PO" && <button onClick={() => pmMarkReady(pr.id, ln.lineId)} style={{ ...btnStyle(C.navy), fontSize: 11, padding: "4px 10px" }}>Mark Ready for PO</button>}
      </td>
    </tr>
  );
}
