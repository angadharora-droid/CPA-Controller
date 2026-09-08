import { useState } from "react";
import { C, th, thR, cellInput, inputStyle, btnStyle } from "../../theme.js";
import { fmtNum } from "../../utils/format.js";
import { Field } from "../ui.jsx";

/* ================= RECEIVE MATERIAL AGAINST BILL (GRN) ================= */
export default function ReceiveGoodsTab({ pos, recordGRN, grns, cardStyle }) {
  const [poId, setPoId] = useState("");
  const [billNo, setBillNo] = useState("");
  const [billDate, setBillDate] = useState("");
  const [receivedDate, setReceivedDate] = useState("");
  const [qtys, setQtys] = useState({});
  const po = pos.find((p) => p.id === poId);

  const anyQty = po ? po.lines.some((l) => Number(qtys[l.lineId] || 0) > 0) : false;

  function handleSubmit() {
    const lines = po.lines.map((l) => ({ lineId: l.lineId, itemName: l.itemName, qtyReceived: Number(qtys[l.lineId] || 0) })).filter((l) => l.qtyReceived > 0);
    recordGRN({ poId, billNo, billDate, receivedDate, lines });
    setPoId(""); setBillNo(""); setBillDate(""); setReceivedDate(""); setQtys({});
  }

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Receiving Material Against Bill</div>
      <div style={{ fontSize: 12.5, color: "#9AA1AC", marginBottom: 14 }}>Record goods received against a PO and its supplier bill.</div>
      <div style={{ ...cardStyle, marginBottom: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
          <Field label="PO">
            <select value={poId} onChange={(e) => { setPoId(e.target.value); setQtys({}); }} style={inputStyle}>
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
        <button onClick={handleSubmit} disabled={!po || !billNo || !anyQty} style={{ ...btnStyle(C.navy), marginTop: 12, opacity: (!po || !billNo || !anyQty) ? 0.5 : 1 }}>Record Goods Receipt</button>
      </div>
      {grns.length > 0 && (
        <div style={{ ...cardStyle }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Goods Receipt History</div>
          {grns.map((g) => (
            <div key={g.id} style={{ borderTop: "1px solid #F0EFEA", padding: "8px 0", fontSize: 12.5 }}>
              <b>{g.id}</b> — against {g.poId}, Bill {g.billNo} dated {g.billDate || "—"}, received {g.receivedDate || "—"} ({g.lines.length} line item(s))
              <div style={{ fontSize: 11.5, color: "#9AA1AC", marginTop: 2 }}>{g.lines.map((l) => `${l.itemName || l.lineId}: ${fmtNum(l.qtyReceived)}`).join(" · ")} · recorded by {g.recordedBy}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
