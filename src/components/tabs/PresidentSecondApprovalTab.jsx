import { C, btnStyle } from "../../theme.js";
import { fmtINR, fmtNum } from "../../utils/format.js";

/* ================= PRESIDENT'S SECOND APPROVAL ================= */
export default function PresidentSecondApprovalTab({ prs, presidentDecideLine, cardStyle, secondApprovalPct }) {
  const needsMe = (l) => l.needsSecondApproval && l.presidentDecision === "Pending" && l.vpDecision !== "Pending" && l.vpDecision !== "Rejected" && l.vpDecision !== "Deferred";
  const relevantPrs = prs.filter((pr) => pr.lines.some(needsMe));

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>President's Second Approval</div>
      <div style={{ fontSize: 12.5, color: "#9AA1AC", marginBottom: 14 }}>Only lines the VP has already approved, where rate variance exceeds {secondApprovalPct}% or the item is unbudgeted, reach here.</div>
      {relevantPrs.length === 0 && <div style={{ ...cardStyle, textAlign: "center", color: "#9AA1AC", padding: 40 }}>Nothing pending second approval.</div>}
      {relevantPrs.map((pr) => {
        const lines = pr.lines.filter(needsMe);
        if (!lines.length) return null;
        return (
          <div key={pr.id} style={{ ...cardStyle, marginBottom: 14 }}>
            <div style={{ marginBottom: 10 }}><b>{pr.id}</b> <span style={{ color: "#9AA1AC", fontSize: 12.5 }}>— raised by {pr.raisedBy || "—"} ({pr.dept || "—"})</span></div>
            {lines.map((ln) => (
              <div key={ln.lineId} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 10, marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.gold, textTransform: "uppercase" }}>Why is this on my table?</div>
                <div style={{ fontWeight: 800, color: C.red, fontSize: 14 }}>
                  {ln.itemId ? `Rate variance ${ln.variancePct !== null ? ln.variancePct.toFixed(2) : "—"}% exceeds ${secondApprovalPct}%` : "Unbudgeted item"}
                </div>
                <div style={{ fontSize: 12.5, marginTop: 4 }}>{ln.itemName} ({ln.headName}) — VP {ln.vpDecision.toLowerCase()} {fmtNum(ln.finalQty)} @ {fmtINR(ln.finalRate)}{ln.approvedRate ? ` vs approved ${fmtINR(ln.approvedRate)}` : ""}.</div>
                {(ln.proposedBrand || ln.proposedModel) && <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>Brand: {ln.proposedBrand || "—"} · Model/Specs: {ln.proposedModel || "—"}</div>}
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <button onClick={() => presidentDecideLine(pr.id, ln.lineId, "Approve")} style={btnStyle(C.green)}>Approve</button>
                  <button onClick={() => presidentDecideLine(pr.id, ln.lineId, "Defer")} style={btnStyle(C.amber)}>Defer</button>
                  <button onClick={() => presidentDecideLine(pr.id, ln.lineId, "Reject")} style={btnStyle(C.red)}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
