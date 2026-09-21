import { useState } from "react";
import { C, th, thR, cellInput, inputStyle, btnStyle } from "../../theme.js";
import { fmtNum } from "../../utils/format.js";
import { computeTransport, fmtMoney, stateCodeOf, gstTypeForState } from "../../utils/po.js";
import { matchesQuery } from "../../utils/search.js";
import { Field, SearchBox } from "../ui.jsx";
import { GstRateField, GstTypeField, TotalRow } from "../GstFields.jsx";

/* Transport / freight as typed. `gstTypeManual` is null while the GST type simply follows the PO
   supplier's state code. */
const BLANK_TRANSPORT = { transporter: "", lrNo: "", amount: "", gstPct: "5", gstTypeManual: null };

function transportGstType(t, supplierCode) {
  return t.gstTypeManual || gstTypeForState(supplierCode);
}

function transportTotals(t, supplierCode) {
  return computeTransport({ amount: t.amount, gstPct: t.gstPct, gstType: transportGstType(t, supplierCode) });
}

/* The transport object stored on a GRN. */
function transportToSave(t, supplierCode) {
  const c = transportTotals(t, supplierCode);
  return { transporter: t.transporter.trim(), lrNo: t.lrNo.trim(), amount: c.amount, gstPct: c.gstPct, gstType: c.gstType };
}

function transportFromSaved(saved, supplierCode) {
  if (!saved) return BLANK_TRANSPORT;
  const type = saved.gstType === "IGST" ? "IGST" : "CGST_SGST";
  return {
    transporter: saved.transporter || "", lrNo: saved.lrNo || "",
    amount: String(Number(saved.amount) || ""), gstPct: String(Number(saved.gstPct) || 0),
    gstTypeManual: type === gstTypeForState(supplierCode) ? null : type,
  };
}

const supplierCodeOf = (po) => (po ? stateCodeOf(po.supplierGstin, po.supplierState) : "");

/* ================= RECEIVE MATERIAL AGAINST BILL (GRN) ================= */
export default function ReceiveGoodsTab({ pos, recordGRN, updateGRNTransport, grns, cardStyle, readOnly }) {
  const [poId, setPoId] = useState("");
  const [billNo, setBillNo] = useState("");
  const [billDate, setBillDate] = useState("");
  const [receivedDate, setReceivedDate] = useState("");
  const [qtys, setQtys] = useState({});
  // transport / freight charged on this receipt
  const [hasTransport, setHasTransport] = useState(false);
  const [transport, setTransport] = useState(BLANK_TRANSPORT);
  // adding / correcting the transport on a GRN that is already recorded
  const [editGrnId, setEditGrnId] = useState(null);
  const po = pos.find((p) => p.id === poId);
  // narrows the PO dropdown; the PO already chosen always stays in it
  const [poQuery, setPoQuery] = useState("");
  const poOptions = pos.filter((p) => p.id === poId || matchesQuery(poQuery, p.id, p.supplier, p.deliveryDate, ...p.lines.map((l) => l.itemName)));
  const [grnQuery, setGrnQuery] = useState("");
  const shownGrns = grns.filter((g) => matchesQuery(grnQuery, g.id, g.poId, g.billNo, g.billDate, g.receivedDate, g.recordedBy, g.transport && g.transport.transporter, g.transport && g.transport.lrNo, (pos.find((p) => p.id === g.poId) || {}).supplier, ...g.lines.map((l) => l.itemName)));

  const anyQty = po ? po.lines.some((l) => Number(qtys[l.lineId] || 0) > 0) : false;
  // GST type on the freight follows the PO supplier's state until picked by hand
  const supplierCode = supplierCodeOf(po);
  const transportOk = !hasTransport || transportTotals(transport, supplierCode).amount > 0;
  const canSubmit = !readOnly && po && billNo && anyQty && transportOk;

  function resetTransport() {
    setHasTransport(false); setTransport(BLANK_TRANSPORT);
  }

  function handleSubmit() {
    const lines = po.lines.map((l) => ({ lineId: l.lineId, itemName: l.itemName, qtyReceived: Number(qtys[l.lineId] || 0) })).filter((l) => l.qtyReceived > 0);
    recordGRN({ poId, billNo, billDate, receivedDate, lines, transport: hasTransport ? transportToSave(transport, supplierCode) : null });
    setPoId(""); setBillNo(""); setBillDate(""); setReceivedDate(""); setQtys({});
    resetTransport();
  }

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Receiving Material Against Bill</div>
      <div style={{ fontSize: 12.5, color: "#9AA1AC", marginBottom: 14 }}>Record goods received against a PO and its supplier bill. Transport charges can be entered with the receipt, or added to it later from the history below.</div>
      <div style={{ ...cardStyle, marginBottom: 14 }}>
        {pos.length > 0 && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            <SearchBox value={poQuery} onChange={setPoQuery} placeholder="Find a PO by number, supplier or item…" />
            {poQuery.trim() && <span style={{ fontSize: 12, color: "#9AA1AC" }}>{poOptions.filter((p) => p.id !== poId).length} matching PO(s) in the list below</span>}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
          <Field label="PO">
            <select value={poId} onChange={(e) => { setPoId(e.target.value); setQtys({}); resetTransport(); }} style={inputStyle}>
              <option value="">— select a PO —</option>
              {poOptions.map((p) => <option key={p.id} value={p.id}>{p.id} — {p.supplier}</option>)}
            </select>
          </Field>
          <Field label="Bill / Invoice No."><input value={billNo} onChange={(e) => setBillNo(e.target.value)} style={inputStyle} /></Field>
          <Field label="Bill Date"><input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} style={inputStyle} /></Field>
          <Field label="Received Date"><input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} style={inputStyle} /></Field>
        </div>
        {po && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: 12.5, marginTop: 10, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#6B7280", fontSize: 10.5, textTransform: "uppercase" }}>
                  <th style={th}>Item</th><th style={thR}>Ordered</th><th style={thR}>Already Received</th><th style={thR}>Receiving Now</th>
                </tr>
              </thead>
              <tbody>
                {po.lines.map((l) => (
                  <tr key={l.lineId} style={{ borderTop: "1px solid #F0EFEA" }}>
                    <td style={{ padding: "6px 10px", fontWeight: 600 }}>{l.itemName}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtNum(l.qty)}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtNum(l.qtyReceived || 0)}</td>
                    <td style={{ padding: "6px 6px", textAlign: "right" }}>
                      <input type="number" min="0" value={qtys[l.lineId] || ""} onChange={(e) => setQtys((q) => ({ ...q, [l.lineId]: e.target.value }))} style={{ ...cellInput, width: 70 }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {po && (
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #F0EFEA" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              <input type="checkbox" checked={hasTransport} onChange={(e) => setHasTransport(e.target.checked)} />
              Transport / freight charged on this receipt
            </label>
            {hasTransport && <div style={{ marginTop: 10 }}><TransportFields value={transport} onChange={setTransport} supplierCode={supplierCode} /></div>}
          </div>
        )}
        <button onClick={handleSubmit} disabled={!canSubmit} style={{ ...btnStyle(C.navy), marginTop: 12, opacity: canSubmit ? 1 : 0.5 }}>Record Goods Receipt</button>
      </div>
      {grns.length > 0 && (
        <div style={{ ...cardStyle }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
            <div style={{ fontWeight: 700 }}>Goods Receipt History</div>
            <SearchBox value={grnQuery} onChange={setGrnQuery} placeholder="Search GRN / PO / bill no., supplier, item, transporter…" />
            <span style={{ fontSize: 12, color: "#9AA1AC" }}>{shownGrns.length} of {grns.length}</span>
          </div>
          {shownGrns.length === 0 && <div style={{ padding: "10px 0", fontSize: 12.5, color: "#9AA1AC" }}>No receipts match "{grnQuery.trim()}".</div>}
          {shownGrns.map((g) => (
            <div key={g.id} style={{ borderTop: "1px solid #F0EFEA", padding: "8px 0", fontSize: 12.5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
                <div>
                  <b>{g.id}</b> — against {g.poId}, Bill {g.billNo} dated {g.billDate || "—"}, received {g.receivedDate || "—"} ({g.lines.length} line item(s))
                  <div style={{ fontSize: 11.5, color: "#9AA1AC", marginTop: 2 }}>{g.lines.map((l) => `${l.itemName || l.lineId}: ${fmtNum(l.qtyReceived)}`).join(" · ")} · recorded by {g.recordedBy}</div>
                  {g.transport && <div style={{ fontSize: 11.5, color: "#6B7280", marginTop: 2 }}>{transportSummary(g.transport)}</div>}
                  {g.transportEditedAt && <div style={{ fontSize: 11, color: "#9AA1AC", marginTop: 2 }}>Transport {g.transport ? "updated" : "removed"} by {g.transportEditedBy} · {g.transportEditedAt}</div>}
                </div>
                {!readOnly && editGrnId !== g.id && (
                  <button onClick={() => setEditGrnId(g.id)} style={{ ...btnStyle(C.gold), fontSize: 11, padding: "4px 9px" }}>{g.transport ? "Edit transport" : "Add transport"}</button>
                )}
              </div>
              {editGrnId === g.id && (
                <GRNTransportEditor grn={g} supplierCode={supplierCodeOf(pos.find((p) => p.id === g.poId))}
                  onSave={(t) => { updateGRNTransport(g.id, t); setEditGrnId(null); }} onCancel={() => setEditGrnId(null)} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* Transporter, LR no., amount, GST rate and GST type with a live breakdown — shared by the receipt
   form and the editor for a GRN that is already recorded. */
function TransportFields({ value, onChange, supplierCode }) {
  const set = (key) => (v) => onChange((t) => ({ ...t, [key]: v }));
  const gstType = transportGstType(value, supplierCode);
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
        <Field label="Transporter"><input value={value.transporter} onChange={(e) => set("transporter")(e.target.value)} style={inputStyle} placeholder="Transport company / on supplier bill" /></Field>
        <Field label="LR / Vehicle No."><input value={value.lrNo} onChange={(e) => set("lrNo")(e.target.value)} style={inputStyle} /></Field>
        <Field label="Transport amount (₹, before GST) *"><input type="number" min="0" step="0.01" value={value.amount} onChange={(e) => set("amount")(e.target.value)} style={inputStyle} /></Field>
        <GstRateField label="GST rate on transport" value={value.gstPct} onChange={set("gstPct")} />
        <GstTypeField label="GST type on transport" value={gstType} manual={!!value.gstTypeManual} onPick={set("gstTypeManual")} onAuto={() => set("gstTypeManual")(null)} stateCode={supplierCode} />
      </div>
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 12px", maxWidth: 380, fontSize: 12.5, background: "#FAFAF8" }}>
        <TransportBreakdown t={transportTotals(value, supplierCode)} />
      </div>
    </>
  );
}

function GRNTransportEditor({ grn, supplierCode, onSave, onCancel }) {
  const [transport, setTransport] = useState(() => transportFromSaved(grn.transport, supplierCode));
  const canSave = transportTotals(transport, supplierCode).amount > 0;
  return (
    <div style={{ marginTop: 10, padding: 12, border: `1px solid ${C.gold}`, borderRadius: 8 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{grn.transport ? "Edit" : "Add"} transport — {grn.id}</div>
      <TransportFields value={transport} onChange={setTransport} supplierCode={supplierCode} />
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <button onClick={() => onSave(transportToSave(transport, supplierCode))} disabled={!canSave} style={{ ...btnStyle(C.navy), opacity: canSave ? 1 : 0.5 }}>Save transport</button>
        {grn.transport && <button onClick={() => onSave(null)} style={{ ...btnStyle(C.red) }}>Remove transport</button>}
        <button onClick={onCancel} style={{ ...btnStyle(C.grey) }}>Cancel</button>
      </div>
    </div>
  );
}

function TransportBreakdown({ t }) {
  const half = t.gstPct / 2;
  return (
    <>
      <TotalRow label="Transport" value={fmtMoney(t.amount)} />
      {t.gstPct > 0 && t.gstType === "IGST" && <TotalRow label={`IGST @ ${t.gstPct}%`} value={fmtMoney(t.igst)} />}
      {t.gstPct > 0 && t.gstType !== "IGST" && (
        <>
          <TotalRow label={`SGST @ ${half}%`} value={fmtMoney(t.sgst)} />
          <TotalRow label={`CGST @ ${half}%`} value={fmtMoney(t.cgst)} />
        </>
      )}
      <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 4, paddingTop: 4 }}>
        <TotalRow label="Transport total" value={`₹ ${fmtMoney(t.total)}`} bold />
      </div>
    </>
  );
}

/* "Transport: ABC Roadlines (LR 4521) — ₹ 1,500.00 + IGST @ 5% ₹ 75.00 = ₹ 1,575.00" */
function transportSummary(transport) {
  const t = computeTransport(transport);
  const who = [transport.transporter, transport.lrNo && `LR/Vehicle ${transport.lrNo}`].filter(Boolean).join(", ");
  const tax = t.gstPct > 0
    ? ` + ${t.gstType === "IGST" ? `IGST @ ${t.gstPct}%` : `CGST + SGST @ ${t.gstPct}%`} ₹ ${fmtMoney(t.gst)} = ₹ ${fmtMoney(t.total)}`
    : " (no GST)";
  return `Transport${who ? `: ${who}` : ""} — ₹ ${fmtMoney(t.amount)}${tax}`;
}
