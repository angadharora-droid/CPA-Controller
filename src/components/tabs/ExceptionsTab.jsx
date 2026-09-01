import { C, th, btnStyle } from "../../theme.js";
import { fmtINR, fmtNum } from "../../utils/format.js";

/* ================= PRESIDENT'S EXCEPTION DESK ================= */
export default function ExceptionsTab({ pendingExceptions, presidentDecide, cardStyle, headCommitted, HEADS }) {
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>President's Exception Desk</div>
      <div style={{ fontSize: 12.5, color: "#9AA1AC", marginBottom: 14 }}>Only genuine exceptions reach this screen. Everything within the frozen budget flows straight to the Purchase Manager.</div>
      {pendingExceptions.length === 0 && (
        <div style={{ ...cardStyle, textAlign: "center", color: "#9AA1AC", padding: 40 }}>No exceptions pending. The desk is clear.</div>
      )}
      {pendingExceptions.map((p) => {
        const head = HEADS.find((h) => h.name === p.headName);
        const catRemaining = head ? head.ceil - (headCommitted[head.name] || 0) : null;
        return (
          <div key={p.id} style={{ ...cardStyle, marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.gold, textTransform: "uppercase", letterSpacing: 0.5 }}>Why is this on my table?</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.red, marginTop: 2 }}>{p.reasonCode}</div>
            <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>{p.detail}</div>

            <table style={{ width: "100%", marginTop: 14, borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#6B7280", fontSize: 10.5, textTransform: "uppercase" }}>
                  <th style={th}>Control</th><th style={th}>Frozen Budget</th><th style={th}>Current Request</th><th style={th}>Variance</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderTop: "1px solid #F0EFEA" }}><td style={th}>Quantity</td><td style={th}>{p.approvedQty !== null ? fmtNum(p.approvedQty) : "—"}</td><td style={th}>{fmtNum(p.requestedQty)}</td><td style={th}>{p.approvedQty !== null ? fmtNum(p.requestedQty - p.approvedQty) : "—"}</td></tr>
                <tr style={{ borderTop: "1px solid #F0EFEA" }}><td style={th}>Rate</td><td style={th}>{fmtINR(p.approvedRate)}</td><td style={th}>{fmtINR(p.requestedRate)}</td><td style={th}>{p.approvedRate ? `${(((p.requestedRate - p.approvedRate) / p.approvedRate) * 100).toFixed(2)}%` : "—"}</td></tr>
                <tr style={{ borderTop: "1px solid #F0EFEA" }}><td style={th}>Total Value</td><td style={th}>{catRemaining !== null ? fmtINR(catRemaining) + " avail." : "—"}</td><td style={th}>{fmtINR(p.value)}</td><td style={th}>{catRemaining !== null ? fmtINR(p.value - catRemaining) : "—"}</td></tr>
                <tr style={{ borderTop: "1px solid #F0EFEA" }}><td style={th}>Specification</td><td style={th}>{p.frozenSpec || "—"}</td><td style={th} colSpan={2}>{p.frozenSpec ? "As frozen" : "N/A"}</td></tr>
                <tr style={{ borderTop: "1px solid #F0EFEA" }}><td style={th}>Brand</td><td style={th}>—</td><td style={th} colSpan={2}>{p.proposedBrand || "Not specified"}</td></tr>
                <tr style={{ borderTop: "1px solid #F0EFEA" }}><td style={th}>Vendor</td><td style={th}>—</td><td style={th} colSpan={2}>{p.vendorDetails || "Not specified"}</td></tr>
                <tr style={{ borderTop: "1px solid #F0EFEA" }}><td style={th}>Model no. / item details</td><td style={th}>—</td><td style={th} colSpan={2}>{p.modelDetails || "Not specified"}</td></tr>
              </tbody>
            </table>

            <div style={{ display: "flex", gap: 18, marginTop: 12, fontSize: 12, flexWrap: "wrap" }}>
              <span>Budget head: <b>{p.headName}</b></span>
              <span>Requested by: <b>{p.requestedBy || "—"}</b> ({p.dept || "—"})</span>
              <span>Urgency: <b>{p.urgency}</b></span>
              <span>Required by: <b>{p.requiredBy || "—"}</b></span>
              <span>Available category balance: <b>{catRemaining !== null ? fmtINR(catRemaining) : "—"}</b></span>
            </div>
            {p.justification && <div style={{ marginTop: 8, fontSize: 12.5, color: "#6B7280", fontStyle: "italic" }}>"{p.justification}"</div>}

            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              <button onClick={() => presidentDecide(p.id, "Approve")} style={btnStyle(C.green)}>Approve</button>
              <button onClick={() => presidentDecide(p.id, "Approve with Conditions", "See remarks")} style={btnStyle(C.blue)}>Approve with Conditions</button>
              <button onClick={() => presidentDecide(p.id, "Return for Clarification")} style={btnStyle(C.amber)}>Return for Clarification</button>
              <button onClick={() => presidentDecide(p.id, "Defer")} style={btnStyle(C.grey)}>Defer</button>
              <button onClick={() => presidentDecide(p.id, "Reject")} style={btnStyle(C.red)}>Reject</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
