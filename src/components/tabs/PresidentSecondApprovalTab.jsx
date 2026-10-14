import { useState } from "react";
import { C, btnStyle, cellInput } from "../../theme.js";
import { fmtINR, fmtNum, fmtRate, round2 } from "../../utils/format.js";
import { matchesQuery } from "../../utils/search.js";
import { SearchBox } from "../ui.jsx";

/* ================= PRESIDENT'S SECOND APPROVAL ================= */
export default function PresidentSecondApprovalTab({ prs, items = [], presidentDecideLine, cardStyle, secondApprovalPct, readOnly }) {
  const needsMe = (l) => l.needsSecondApproval && l.presidentDecision === "Pending" && l.vpDecision !== "Pending" && l.vpDecision !== "Rejected" && l.vpDecision !== "Deferred";
  const [query, setQuery] = useState("");
  const relevantPrs = prs.filter((pr) => pr.lines.some(needsMe));
  const shown = (pr) => pr.lines.filter((l) => needsMe(l) && matchesQuery(query, pr.id, pr.raisedBy, pr.dept, l.itemName, l.headName, l.proposedBrand, l.proposedModel));

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>President's Second Approval</div>
      <div style={{ fontSize: 12.5, color: "#9AA1AC", marginBottom: 14 }}>Only lines the VP has already approved, where rate variance exceeds {secondApprovalPct}% or the item is unbudgeted, reach here. Approve as the VP did, or Modify &amp; Approve at a quantity and rate of your own.</div>
      {relevantPrs.length > 0 && <div style={{ display: "flex", marginBottom: 14 }}><SearchBox value={query} onChange={setQuery} placeholder="Search PR no., item, head, brand, requester…" /></div>}
      {relevantPrs.length === 0 && <div style={{ ...cardStyle, textAlign: "center", color: "#9AA1AC", padding: 40 }}>Nothing pending second approval.</div>}
      {relevantPrs.length > 0 && !relevantPrs.some((pr) => shown(pr).length) && <div style={{ ...cardStyle, textAlign: "center", color: "#9AA1AC", padding: 40 }}>Nothing pending matches "{query.trim()}".</div>}
      {relevantPrs.map((pr) => {
        const lines = shown(pr);
        if (!lines.length) return null;
        return (
          <div key={pr.id} style={{ ...cardStyle, marginBottom: 14 }}>
            <div style={{ marginBottom: 10 }}><b>{pr.id}</b> <span style={{ color: "#9AA1AC", fontSize: 12.5 }}>— raised by {pr.raisedBy || "—"} ({pr.dept || "—"})</span></div>
            {lines.map((ln) => (
              <PresidentLineRow key={ln.lineId} pr={pr} ln={ln} item={ln.itemId ? items.find((i) => i.id === ln.itemId) : null}
                presidentDecideLine={presidentDecideLine} secondApprovalPct={secondApprovalPct} readOnly={readOnly} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function PresidentLineRow({ pr, ln, item, presidentDecideLine, secondApprovalPct, readOnly }) {
  const [modifying, setModifying] = useState(false);
  const [mQty, setMQty] = useState(ln.finalQty);
  const [mRate, setMRate] = useState(round2(ln.finalRate));
  const unit = ln.unit || (item && item.unit) || "Nos";
  const q = Number(mQty) || 0, r = Number(mRate) || 0;
  const valid = q > 0 && r > 0;
  // what the modified figures mean, worked out live as they are typed
  const variance = item && item.rate > 0 ? ((r - item.rate) / item.rate) * 100 : null;
  // the VP's approval already counts in the item's committed quantity: take it out, put the new one in
  const left = item ? (item.qty || 0) - ((item.committedQty || 0) - (Number(ln.finalQty) || 0)) : null;

  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 10, marginBottom: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.gold, textTransform: "uppercase" }}>Why is this on my table?</div>
      <div style={{ fontWeight: 800, color: C.red, fontSize: 14 }}>
        {ln.itemId ? `Rate variance ${ln.variancePct !== null ? ln.variancePct.toFixed(2) : "—"}% exceeds ${secondApprovalPct}%` : "Unbudgeted item"}
      </div>
      <div style={{ fontSize: 12.5, marginTop: 4 }}>{ln.itemName} ({ln.headName}) — VP {ln.vpDecision.toLowerCase()} {fmtNum(ln.finalQty)} @ {fmtRate(ln.finalRate)}{ln.approvedRate ? ` vs approved ${fmtRate(ln.approvedRate)}` : ""}.</div>
      {(ln.proposedBrand || ln.proposedModel) && <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>Brand: {ln.proposedBrand || "—"} · Model/Specs: {ln.proposedModel || "—"}</div>}
      {readOnly ? null : modifying ? (
        <div style={{ marginTop: 10, padding: 10, background: "#FAFAF8", border: `1px solid ${C.line}`, borderRadius: 8 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <label style={{ fontSize: 11.5, color: "#6B7280", fontWeight: 600 }}>Quantity ({unit})<br />
              <input type="number" min="0" value={mQty} onChange={(e) => setMQty(e.target.value)} style={{ ...cellInput, width: 90, marginTop: 3 }} />
            </label>
            <label style={{ fontSize: 11.5, color: "#6B7280", fontWeight: 600 }}>Rate (₹)<br />
              <input type="number" min="0" step="0.01" value={mRate} onChange={(e) => setMRate(e.target.value)} style={{ ...cellInput, width: 100, marginTop: 3 }} />
            </label>
            <button disabled={!valid} onClick={() => { presidentDecideLine(pr.id, ln.lineId, "Modify-Approve", mQty, mRate); setModifying(false); }}
              style={{ ...btnStyle(C.blue), opacity: valid ? 1 : 0.5 }}>Confirm Modified Approval</button>
            <button onClick={() => { setModifying(false); setMQty(ln.finalQty); setMRate(round2(ln.finalRate)); }} style={btnStyle(C.grey)}>Cancel</button>
          </div>
          {valid && (
            <div style={{ fontSize: 12, marginTop: 8, color: "#6B7280" }}>
              Amount {fmtINR(q * r)} (VP approved {fmtINR((Number(ln.finalQty) || 0) * (Number(ln.finalRate) || 0))})
              {variance !== null && <> · Rate variance <b style={{ color: variance > secondApprovalPct ? C.red : C.green }}>{variance >= 0 ? "+" : ""}{variance.toFixed(2)}%</b> against the approved {fmtRate(item.rate)}</>}
              {left !== null && (q > left
                ? <div style={{ color: C.red, fontWeight: 700, marginTop: 3 }}>Over the approved quantity by {fmtNum(q - left)} {unit} — only {fmtNum(Math.max(0, left))} of {fmtNum(item.qty)} {unit} is left.</div>
                : <div style={{ marginTop: 3 }}>Balance after this approval: {fmtNum(left - q)} of {fmtNum(item.qty)} {unit}.</div>)}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <button onClick={() => presidentDecideLine(pr.id, ln.lineId, "Approve")} style={btnStyle(C.green)}>Approve</button>
          <button onClick={() => setModifying(true)} style={btnStyle(C.blue)}>Modify &amp; Approve</button>
          <button onClick={() => presidentDecideLine(pr.id, ln.lineId, "Defer")} style={btnStyle(C.amber)}>Defer</button>
          <button onClick={() => presidentDecideLine(pr.id, ln.lineId, "Reject")} style={btnStyle(C.red)}>Reject</button>
        </div>
      )}
    </div>
  );
}
