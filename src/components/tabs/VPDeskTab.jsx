import { useState } from "react";
import { C, cellInput, btnStyle, toggleBtn } from "../../theme.js";
import { fmtINR, fmtNum } from "../../utils/format.js";
import { Badge } from "../ui.jsx";

/* ================= VP'S DESK ================= */
export default function VPDeskTab({ prs, allLines, vpDecideLine, cardStyle, tolerancePct, secondApprovalPct, readOnly }) {
  const [lane, setLane] = useState("good"); // good | exception
  const relevantPrs = prs.filter((pr) => pr.lines.some((l) => l.vpDecision === "Pending"));
  const laneCount = (laneName) => allLines.filter((l) => l.vpDecision === "Pending" && l.lane === laneName).length;

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>VP's Desk</div>
      <div style={{ fontSize: 12.5, color: "#9AA1AC", marginBottom: 14 }}>Every PR line lands here first. Good-to-Approve lines match approved brand/specs/rate/quantity (≤{tolerancePct}% variance); Exception lines need a closer look. You can split a bundled PR — approve, modify, reject, or defer each line independently. Lines above {secondApprovalPct}% variance (or unbudgeted) go on to the President after your approval.</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setLane("good")} style={{ ...toggleBtn, ...(lane === "good" ? { background: C.green, color: "#fff", borderColor: C.green } : {}) }}>Good to Approve ({laneCount("good")})</button>
        <button onClick={() => setLane("exception")} style={{ ...toggleBtn, ...(lane === "exception" ? { background: C.red, color: "#fff", borderColor: C.red } : {}) }}>Exception Desk ({laneCount("exception")})</button>
      </div>
      {relevantPrs.length === 0 && <div style={{ ...cardStyle, textAlign: "center", color: "#9AA1AC", padding: 40 }}>Nothing pending.</div>}
      {relevantPrs.map((pr) => {
        const linesInLane = pr.lines.filter((l) => l.vpDecision === "Pending" && l.lane === lane);
        if (linesInLane.length === 0) return null;
        return (
          <div key={pr.id} style={{ ...cardStyle, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              <div><b>{pr.id}</b> <span style={{ color: "#9AA1AC", fontSize: 12.5 }}>— raised by {pr.raisedBy || "—"} ({pr.dept || "—"}), {pr.urgency}, required by {pr.requiredBy || "—"}</span></div>
              <Badge bg="#F0F0EF" fg="#6B7280">{pr.lines.length} line item(s) total</Badge>
            </div>
            {linesInLane.map((ln) => <VPLineRow key={ln.lineId} pr={pr} ln={ln} vpDecideLine={vpDecideLine} readOnly={readOnly} />)}
          </div>
        );
      })}
    </div>
  );
}

function VPLineRow({ pr, ln, vpDecideLine, readOnly }) {
  const [modifying, setModifying] = useState(false);
  const [mQty, setMQty] = useState(ln.requestedQty);
  const [mRate, setMRate] = useState(ln.requestedRate);

  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 10, marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700 }}>{ln.itemName} <span style={{ color: "#9AA1AC", fontWeight: 400, fontSize: 12 }}>({ln.headName})</span></div>
          <div style={{ fontSize: 11.5, color: "#9AA1AC" }}>{ln.reasons.join(" · ")}</div>
          {ln.vendorDetails && <div style={{ fontSize: 11.5, color: "#9AA1AC" }}>Vendor: {ln.vendorDetails}</div>}
        </div>
        <Badge bg={ln.lane === "good" ? "#E9F6EF" : "#FCEAEA"} fg={ln.lane === "good" ? C.green : C.red}>{ln.lane === "good" ? "Good to Approve" : "Exception"}</Badge>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", marginTop: 8, fontSize: 12 }}>
          <tbody>
            <tr style={{ color: "#6B7280" }}>
              <td>Qty requested / approved</td><td>Rate requested / approved</td><td>Brand requested / approved</td><td>Model/Specs requested / approved</td>
            </tr>
            <tr style={{ fontWeight: 600 }}>
              <td>{fmtNum(ln.requestedQty)} / {ln.approvedQty !== null ? fmtNum(ln.approvedQty) : "—"}</td>
              <td>{fmtINR(ln.requestedRate)} / {fmtINR(ln.approvedRate)}{ln.variancePct !== null ? ` (${ln.variancePct >= 0 ? "+" : ""}${ln.variancePct.toFixed(2)}%)` : ""}</td>
              <td>{ln.proposedBrand || "—"} / {ln.approvedBrand || "—"}</td>
              <td>{ln.proposedModel || "—"} / {ln.approvedModel || "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {readOnly ? null : modifying ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
          <input type="number" value={mQty} onChange={(e) => setMQty(e.target.value)} placeholder="Qty" style={{ ...cellInput, width: 80 }} />
          <input type="number" value={mRate} onChange={(e) => setMRate(e.target.value)} placeholder="Rate" style={{ ...cellInput, width: 90 }} />
          <button onClick={() => { vpDecideLine(pr.id, ln.lineId, "Modify-Approve", mQty, mRate); setModifying(false); }} style={btnStyle(C.blue)}>Confirm Modified Approval</button>
          <button onClick={() => setModifying(false)} style={btnStyle(C.grey)}>Cancel</button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <button onClick={() => vpDecideLine(pr.id, ln.lineId, "Approve")} style={btnStyle(C.green)}>Approve</button>
          <button onClick={() => setModifying(true)} style={btnStyle(C.blue)}>Modify &amp; Approve</button>
          <button onClick={() => vpDecideLine(pr.id, ln.lineId, "Defer")} style={btnStyle(C.amber)}>Defer</button>
          <button onClick={() => vpDecideLine(pr.id, ln.lineId, "Reject")} style={btnStyle(C.red)}>Reject</button>
        </div>
      )}
    </div>
  );
}
