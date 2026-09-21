import { useState } from "react";
import { C, th, thR, cellInput, inputStyle, btnStyle } from "../../theme.js";
import { fmtNum } from "../../utils/format.js";
import { computeTransport, fmtMoney, stateCodeOf, gstTypeForState } from "../../utils/po.js";
import { Field } from "../ui.jsx";
import { GstRateField, GstTypeField, TotalRow } from "../GstFields.jsx";

/* ================= RECEIVE MATERIAL AGAINST BILL (GRN) ================= */
export default function ReceiveGoodsTab({ pos, recordGRN, grns, cardStyle }) {
  const [poId, setPoId] = useState("");
  const [billNo, setBillNo] = useState("");
  const [billDate, setBillDate] = useState("");
  const [receivedDate, setReceivedDate] = useState("");
  const [qtys, setQtys] = useState({});
  // transport / freight charged on this receipt
  const [hasTransport, setHasTransport] = useState(false);
  const [transporter, setTransporter] = useState("");
  const [lrNo, setLrNo] = useState("");
  const [freight, setFreight] = useState("");
  const [freightGstPct, setFreightGstPct] = useState("5");
  const [freightGstManual, setFreightGstManual] = useState(null);
  const po = pos.find((p) => p.id === poId);

  const anyQty = po ? po.lines.some((l) => Number(qtys[l.lineId] || 0) > 0) : false;
  // GST type on the freight follows the PO supplier's state until picked by hand
  const supplierCode = po ? stateCodeOf(po.supplierGstin, po.supplierState) : "";
  const freightGstType = freightGstManual || gstTypeForState(supplierCode);
  const tr = computeTransport({ amount: freight, gstPct: freightGstPct, gstType: freightGstType });
  const transportOk = !hasTransport || tr.amount > 0;
  const canSubmit = po && billNo && anyQty && transportOk;

  function resetTransport() {
    setHasTransport(false); setTransporter(""); setLrNo(""); setFreight(""); setFreightGstPct("5"); setFreightGstManual(null);
  }

  function handleSubmit() {
    const lines = po.lines.map((l) => ({ lineId: l.lineId, itemName: l.itemName, qtyReceived: Number(qtys[l.lineId] || 0) })).filter((l) => l.qtyReceived > 0);
    const transport = hasTransport
      ? { transporter: transporter.trim(), lrNo: lrNo.trim(), amount: tr.amount, gstPct: tr.gstPct, gstType: tr.gstType }
      : null;
    recordGRN({ poId, billNo, billDate, receivedDate, lines, transport });
    setPoId(""); setBillNo(""); setBillDate(""); setReceivedDate(""); setQtys({});
    resetTransport();
  }

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Receiving Material Against Bill</div>
      <div style={{ fontSize: 12.5, color: "#9AA1AC", marginBottom: 14 }}>Record goods received against a PO and its supplier bill.</div>
      <div style={{ ...cardStyle, marginBottom: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
          <Field label="PO">
            <select value={poId} onChange={(e) => { setPoId(e.target.value); setQtys({}); resetTransport(); }} style={inputStyle}>
              <option value="">— select a PO —</option>
              {pos.map((p) => <option key={p.id} value={p.id}>{p.id} — {p.supplier}</option>)}
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
            {hasTransport && (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
                  <Field label="Transporter"><input value={transporter} onChange={(e) => setTransporter(e.target.value)} style={inputStyle} placeholder="Transport company / on supplier bill" /></Field>
                  <Field label="LR / Vehicle No."><input value={lrNo} onChange={(e) => setLrNo(e.target.value)} style={inputStyle} /></Field>
                  <Field label="Transport amount (₹, before GST) *"><input type="number" min="0" step="0.01" value={freight} onChange={(e) => setFreight(e.target.value)} style={inputStyle} /></Field>
                  <GstRateField label="GST rate on transport" value={freightGstPct} onChange={setFreightGstPct} />
                  <GstTypeField label="GST type on transport" value={freightGstType} manual={!!freightGstManual} onPick={setFreightGstManual} onAuto={() => setFreightGstManual(null)} stateCode={supplierCode} />
                </div>
                <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 12px", maxWidth: 380, fontSize: 12.5, background: "#FAFAF8" }}>
                  <TransportBreakdown t={tr} />
                </div>
              </div>
            )}
          </div>
        )}
        <button onClick={handleSubmit} disabled={!canSubmit} style={{ ...btnStyle(C.navy), marginTop: 12, opacity: canSubmit ? 1 : 0.5 }}>Record Goods Receipt</button>
      </div>
      {grns.length > 0 && (
        <div style={{ ...cardStyle }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Goods Receipt History</div>
          {grns.map((g) => (
            <div key={g.id} style={{ borderTop: "1px solid #F0EFEA", padding: "8px 0", fontSize: 12.5 }}>
              <b>{g.id}</b> — against {g.poId}, Bill {g.billNo} dated {g.billDate || "—"}, received {g.receivedDate || "—"} ({g.lines.length} line item(s))
              <div style={{ fontSize: 11.5, color: "#9AA1AC", marginTop: 2 }}>{g.lines.map((l) => `${l.itemName || l.lineId}: ${fmtNum(l.qtyReceived)}`).join(" · ")} · recorded by {g.recordedBy}</div>
              {g.transport && <div style={{ fontSize: 11.5, color: "#6B7280", marginTop: 2 }}>{transportSummary(g.transport)}</div>}
            </div>
          ))}
        </div>
      )}
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
