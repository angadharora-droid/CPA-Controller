import { useState } from "react";
import { C, th, thR, cellInput, btnStyle } from "../../theme.js";
import { fmtNum, fmtRate, round2 } from "../../utils/format.js";
import { matchesQuery } from "../../utils/search.js";
import { unitOf } from "../../utils/units.js";
import { Badge, SearchBox, UnitSelect, confirmQtyCut, confirmUnitChange } from "../ui.jsx";

const hint = { fontSize: 10.5, color: "#9AA1AC", marginTop: 2 };
const warn = { ...hint, color: C.red, fontWeight: 600 };

/* ================= PURCHASE MANAGER ================= */
export default function PurchaseManagerTab({ prs, pmSetRate, pmSetQty, pmSetUnit, unitBlock, pmMarkReady, cardStyle, readOnly }) {
  const inQueue = (l) => l.status === "Pending Purchase Manager" || l.status === "Ready for PO";
  const [query, setQuery] = useState("");
  const relevantPrs = prs.filter((pr) => pr.lines.some(inQueue));
  const shown = (pr) => pr.lines.filter((l) => inQueue(l) && matchesQuery(query, pr.id, pr.raisedBy, pr.dept, l.itemName, l.headName, l.vendorDetails, l.status));
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Purchase Manager — Consolidated PRs</div>
      <div style={{ fontSize: 12.5, color: "#9AA1AC", marginBottom: 14 }}>Set the rate you are buying at — lower or higher than the approved rate. A rate above the approved one is allowed but flagged and recorded in the audit trail. The quantity can be lowered if fewer are needed, never raised; the units not bought go back to the approved balance. If an item is bought in another unit (cloth by the metre), pick the unit and type the quantity in it: the rate follows so the amount stays the same, and the budget item switches to that unit too. Once a line is marked Ready for PO, use Edit to change its rate, quantity or unit; after its PO is issued, use Edit on the Issue PO tab (until goods are received). Specs are locked at this stage.</div>
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
                    <th style={th}>Item</th><th style={thR}>Qty</th><th style={th}>Unit</th><th style={thR}>Approved Rate</th><th style={thR}>Negotiated Rate</th><th style={th}>Status</th><th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {/* keyed by unit too: once a unit change is made, the row starts afresh in the new unit */}
                  {lines.map((ln) => (
                    <PMLineRow key={`${ln.lineId}:${unitOf(ln)}`} pr={pr} ln={ln} pmSetRate={pmSetRate} pmSetQty={pmSetQty} pmSetUnit={pmSetUnit}
                      unitBlock={unitBlock} pmMarkReady={pmMarkReady} readOnly={readOnly} />
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

function PMLineRow({ pr, ln, pmSetRate, pmSetQty, pmSetUnit, unitBlock, pmMarkReady, readOnly }) {
  const current = ln.pmRate || ln.finalRate;
  const ready = ln.status === "Ready for PO";
  const lineUnit = unitOf(ln);
  const [rate, setRate] = useState(round2(current));
  const [qty, setQty] = useState(ln.finalQty);
  const [unit, setUnit] = useState(lineUnit);
  const [editing, setEditing] = useState(false);
  // the boxes are open; a view-only login never gets them
  const open = !readOnly && (!ready || editing);
  // a new unit picked: the quantity box takes the quantity in it, and the rate follows so the amount stays
  const converting = unit !== lineUnit;
  const newQty = Number(qty);
  const ratio = converting && newQty > 0 ? newQty / ln.finalQty : null;
  const block = unitBlock(pr.id, ln.lineId);
  function commit() {
    const n = Number(rate);
    // the box shows the rate to the paisa, which is not a change
    if (round2(n) === round2(current)) return;
    pmSetRate(pr.id, ln.lineId, rate);
    // pmSetRate refuses these, so show the rate that is still in force
    if (isNaN(n) || n <= 0) setRate(round2(current));
  }
  const qtyTooHigh = open && !converting && Number(qty) > Number(ln.finalQty);
  // the quantity only comes down; false when a cut was typed but not confirmed
  function commitQty() {
    const n = Number(qty);
    if (n === Number(ln.finalQty)) return true;
    if (isNaN(n) || n <= 0 || n > ln.finalQty || !confirmQtyCut([{ itemName: ln.itemName, was: ln.finalQty, n }])) { setQty(ln.finalQty); return false; }
    pmSetQty(pr.id, ln.lineId, n);
    return true;
  }
  function pickUnit(u) { setUnit(u); setQty(u === lineUnit ? ln.finalQty : ""); }
  function revertUnit() { setUnit(lineUnit); setQty(ln.finalQty); }
  function commitUnit() {
    if (!ratio || !confirmUnitChange([{ itemName: ln.itemName, was: ln.finalQty, from: lineUnit, n: newQty, to: unit, rate: current, onItem: !!ln.itemId }])) return;
    pmSetUnit(pr.id, ln.lineId, unit, newQty);
  }
  const above = Number(current) > Number(ln.finalRate);
  function save() { if (converting) { commitUnit(); return; } if (!commitQty()) return; commit(); setEditing(false); }
  function cancel() { setRate(round2(current)); setQty(ln.finalQty); setUnit(lineUnit); setEditing(false); }
  function keys(e) {
    if (e.key === "Enter") { if (ready) save(); else if (converting) commitUnit(); }
    if (e.key === "Escape") { if (ready) cancel(); else if (converting) revertUnit(); }
  }
  const smallBtn = { fontSize: 11, padding: "4px 10px" };
  return (
    <tr style={{ borderTop: "1px solid #F0EFEA" }}>
      <td style={{ padding: "6px 10px", fontWeight: 600 }}>{ln.itemName}<div style={{ fontSize: 10.5, color: "#9AA1AC", fontWeight: 400 }}>{ln.headName}{ln.vendorDetails ? ` · ${ln.vendorDetails}` : ""}</div></td>
      <td style={{ padding: "6px 6px", textAlign: "right" }}>
        {open
          ? <input type="number" min="0" max={converting ? undefined : ln.finalQty} value={qty} placeholder={converting ? `in ${unit}` : undefined}
              onChange={(e) => setQty(e.target.value)} onBlur={ready || converting ? undefined : commitQty}
              onKeyDown={keys} style={{ ...cellInput, width: 64, border: `1px solid ${qtyTooHigh || (converting && !ratio) ? C.red : C.line}` }} />
          : <span style={{ padding: "0 4px" }}>{fmtNum(ln.finalQty)}</span>}
        {qtyTooHigh && <div style={warn}>Can't go above {fmtNum(ln.finalQty)}</div>}
        {converting && <div style={hint}>was {fmtNum(ln.finalQty)} {lineUnit}</div>}
        {!converting && ln.vpQty > ln.finalQty && <div style={hint}>VP approved {fmtNum(ln.vpQty)}</div>}
        {!converting && ln.unitWas && <div style={hint}>was {fmtNum(ln.unitWas.qty)} {ln.unitWas.unit}</div>}
      </td>
      <td style={{ padding: "6px 6px" }}>
        {open ? <UnitSelect value={unit} onChange={pickUnit} disabled={!!block} title={block} /> : <span style={{ padding: "0 4px" }}>{lineUnit}</span>}
      </td>
      <td style={{ padding: "6px 10px", textAlign: "right" }}>
        {converting ? (ratio ? fmtRate(ln.finalRate / ratio) : "—") : fmtRate(ln.finalRate)}
        {converting && <div style={hint}>was {fmtRate(ln.finalRate)} / {lineUnit}</div>}
      </td>
      <td style={{ padding: "6px 6px", textAlign: "right" }}>
        {/* once Ready for PO the rate is locked until the PM presses Edit */}
        {converting
          ? <span style={{ padding: "0 4px", fontWeight: 600 }}>{ratio ? fmtRate(current / ratio) : "—"}</span>
          : open
            ? <input type="number" value={rate} autoFocus={ready} onChange={(e) => setRate(e.target.value)} onBlur={ready ? undefined : commit}
                onKeyDown={keys} style={{ ...cellInput, width: 80 }} />
            : <span style={{ padding: "0 4px", fontWeight: 600 }}>{fmtRate(current)}</span>}
        {converting && ratio && <div style={hint}>amount stays {fmtRate(ln.finalQty * current)}</div>}
        {!converting && above && <div style={warn}>Above approved by {fmtRate(current - ln.finalRate)}</div>}
      </td>
      <td style={{ padding: "6px 10px" }}><Badge bg={ready ? "#E9F6EF" : "#EAF0FB"} fg={ready ? C.green : C.blue}>{ln.status}</Badge></td>
      <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
        {open && converting && <>
          <button onClick={commitUnit} disabled={!ratio} style={{ ...btnStyle(C.navy), ...smallBtn, marginRight: 6, opacity: ratio ? 1 : 0.5 }}>Change unit</button>
          <button onClick={ready ? cancel : revertUnit} style={{ ...btnStyle(C.grey), ...smallBtn }}>Cancel</button>
        </>}
        {!converting && !readOnly && !ready && <button onClick={() => pmMarkReady(pr.id, ln.lineId)} style={{ ...btnStyle(C.navy), ...smallBtn }}>Mark Ready for PO</button>}
        {!converting && !readOnly && ready && !editing && <button onClick={() => { setRate(round2(current)); setQty(ln.finalQty); setUnit(lineUnit); setEditing(true); }} style={{ ...btnStyle(C.gold), ...smallBtn }}>Edit</button>}
        {!converting && ready && editing && <>
          <button onClick={save} style={{ ...btnStyle(C.navy), ...smallBtn, marginRight: 6 }}>Save</button>
          <button onClick={cancel} style={{ ...btnStyle(C.grey), ...smallBtn }}>Cancel</button>
        </>}
      </td>
    </tr>
  );
}
