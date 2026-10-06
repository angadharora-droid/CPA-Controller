import { useState } from "react";
import { C, th, thR, cellInput, btnStyle } from "../../theme.js";
import { fmtINR, fmtNum } from "../../utils/format.js";
import { matchesQuery } from "../../utils/search.js";
import { Badge, SearchBox, confirmQtyCut } from "../ui.jsx";

/* ================= PURCHASE MANAGER ================= */
export default function PurchaseManagerTab({ prs, pmSetRate, pmSetQty, pmMarkReady, cardStyle, readOnly }) {
  const inQueue = (l) => l.status === "Pending Purchase Manager" || l.status === "Ready for PO";
  const [query, setQuery] = useState("");
  const relevantPrs = prs.filter((pr) => pr.lines.some(inQueue));
  const shown = (pr) => pr.lines.filter((l) => inQueue(l) && matchesQuery(query, pr.id, pr.raisedBy, pr.dept, l.itemName, l.headName, l.vendorDetails, l.status));
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Purchase Manager — Consolidated PRs</div>
      <div style={{ fontSize: 12.5, color: "#9AA1AC", marginBottom: 14 }}>Set the rate you are buying at — lower or higher than the approved rate. A rate above the approved one is allowed but flagged and recorded in the audit trail. The quantity can be lowered if fewer are needed, never raised; the units not bought go back to the approved balance. Once a line is marked Ready for PO, use Edit to change its rate or quantity; after its PO is issued, use Edit on the Issue PO tab (until goods are received). Specs are locked at this stage.</div>
      {relevantPrs.length > 0 && <div style={{ display: "flex", marginBottom: 14 }}><SearchBox value={query} onChange={setQuery} placeholder="Search PR no., item, head, vendor, status…" /></div>}
      {relevantPrs.length === 0 && <div style={{ ...cardStyle, textAlign: "center", color: "#9AA1AC", padding: 40 }}>Nothing to negotiate right now.</div>}
      {relevantPrs.length > 0 && !relevantPrs.some((pr) => shown(pr).length) && <div style={{ ...cardStyle, textAlign: "center", color: "#9AA1AC", padding: 40 }}>No lines match "{query.trim()}".</div>}
      {relevantPrs.map((pr) => {
        const lines = shown(pr);
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
                    <PMLineRow key={ln.lineId} pr={pr} ln={ln} pmSetRate={pmSetRate} pmSetQty={pmSetQty} pmMarkReady={pmMarkReady} readOnly={readOnly} />
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

function PMLineRow({ pr, ln, pmSetRate, pmSetQty, pmMarkReady, readOnly }) {
  const current = ln.pmRate || ln.finalRate;
  const ready = ln.status === "Ready for PO";
  const [rate, setRate] = useState(current);
  const [qty, setQty] = useState(ln.finalQty);
  const [editing, setEditing] = useState(false);
  function commit() {
    const n = Number(rate);
    if (n === Number(current)) return;
    pmSetRate(pr.id, ln.lineId, rate);
    // pmSetRate refuses these, so show the rate that is still in force
    if (isNaN(n) || n <= 0) setRate(current);
  }
  const qtyTooHigh = !readOnly && (!ready || editing) && Number(qty) > Number(ln.finalQty);
  // the quantity only comes down; false when a cut was typed but not confirmed
  function commitQty() {
    const n = Number(qty);
    if (n === Number(ln.finalQty)) return true;
    if (isNaN(n) || n <= 0 || n > ln.finalQty || !confirmQtyCut([{ itemName: ln.itemName, was: ln.finalQty, n }])) { setQty(ln.finalQty); return false; }
    pmSetQty(pr.id, ln.lineId, n);
    return true;
  }
  const above = Number(current) > Number(ln.finalRate);
  function save() { if (!commitQty()) return; commit(); setEditing(false); }
  function cancel() { setRate(current); setQty(ln.finalQty); setEditing(false); }
  const keys = ready ? (e) => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); } : undefined;
  const smallBtn = { fontSize: 11, padding: "4px 10px" };
  return (
    <tr style={{ borderTop: "1px solid #F0EFEA" }}>
      <td style={{ padding: "6px 10px", fontWeight: 600 }}>{ln.itemName}<div style={{ fontSize: 10.5, color: "#9AA1AC", fontWeight: 400 }}>{ln.headName}{ln.vendorDetails ? ` · ${ln.vendorDetails}` : ""}</div></td>
      <td style={{ padding: "6px 6px", textAlign: "right" }}>
        {readOnly || (ready && !editing)
          ? <span style={{ padding: "0 4px" }}>{fmtNum(ln.finalQty)}</span>
          : <input type="number" min="0" max={ln.finalQty} value={qty} onChange={(e) => setQty(e.target.value)} onBlur={ready ? undefined : commitQty}
              onKeyDown={keys} style={{ ...cellInput, width: 64, border: `1px solid ${qtyTooHigh ? C.red : C.line}` }} />}
        {qtyTooHigh && <div style={{ fontSize: 10.5, color: C.red, fontWeight: 600, marginTop: 2 }}>Can't go above {fmtNum(ln.finalQty)}</div>}
        {ln.vpQty > ln.finalQty && <div style={{ fontSize: 10.5, color: "#9AA1AC", marginTop: 2 }}>VP approved {fmtNum(ln.vpQty)}</div>}
      </td>
      <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtINR(ln.finalRate)}</td>
      <td style={{ padding: "6px 6px", textAlign: "right" }}>
        {/* once Ready for PO the rate is locked until the PM presses Edit; a view-only login never gets the input */}
        {readOnly || (ready && !editing)
          ? <span style={{ padding: "0 4px", fontWeight: 600 }}>{fmtINR(current)}</span>
          : <input type="number" value={rate} autoFocus={ready} onChange={(e) => setRate(e.target.value)} onBlur={ready ? undefined : commit}
              onKeyDown={keys} style={{ ...cellInput, width: 80 }} />}
        {above && <div style={{ fontSize: 10.5, color: C.red, fontWeight: 600, marginTop: 2 }}>Above approved by {fmtINR(current - ln.finalRate)}</div>}
      </td>
      <td style={{ padding: "6px 10px" }}><Badge bg={ready ? "#E9F6EF" : "#EAF0FB"} fg={ready ? C.green : C.blue}>{ln.status}</Badge></td>
      <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
        {!readOnly && !ready && <button onClick={() => pmMarkReady(pr.id, ln.lineId)} style={{ ...btnStyle(C.navy), ...smallBtn }}>Mark Ready for PO</button>}
        {!readOnly && ready && !editing && <button onClick={() => { setRate(current); setQty(ln.finalQty); setEditing(true); }} style={{ ...btnStyle(C.gold), ...smallBtn }}>Edit</button>}
        {ready && editing && <>
          <button onClick={save} style={{ ...btnStyle(C.navy), ...smallBtn, marginRight: 6 }}>Save</button>
          <button onClick={cancel} style={{ ...btnStyle(C.grey), ...smallBtn }}>Cancel</button>
        </>}
      </td>
    </tr>
  );
}
