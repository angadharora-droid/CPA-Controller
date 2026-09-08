import { useState } from "react";
import { C, th, thR, inputStyle, btnStyle } from "../../theme.js";
import { fmtINR, fmtNum } from "../../utils/format.js";
import { Field } from "../ui.jsx";
import POView from "../POView.jsx";

const DEFAULT_ADDRESS = "Centre Point Amravati (Unit of Amarjit Fiscal Ventures Pvt. Ltd.), New Bye Pass, Near Chatri Talao, Dastur Nagar, Amravati";

/* ================= ISSUE PO (Purchase Executive) ================= */
export default function IssuePOTab({ allLines, issuePO, signPO, pos, cardStyle, role }) {
  const readyLines = allLines.filter((l) => l.status === "Ready for PO");
  const [selected, setSelected] = useState(() => new Set());
  const [supplier, setSupplier] = useState("");
  const [invoiceTo, setInvoiceTo] = useState(DEFAULT_ADDRESS);
  const [consignee, setConsignee] = useState(DEFAULT_ADDRESS);
  const [paymentTerms, setPaymentTerms] = useState("100% ADVANCE");
  const [deliveryTerms, setDeliveryTerms] = useState("AFTER PAYMENT WITHIN 8-10 DAYS");
  const [dispatchThrough, setDispatchThrough] = useState("");
  const [destination, setDestination] = useState("Amravati");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [lastPOId, setLastPOId] = useState(null);
  const lastPO = pos.find((p) => p.id === lastPOId) || null;

  function toggle(lineKey) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(lineKey)) next.delete(lineKey); else next.add(lineKey);
      return next;
    });
  }
  const selectedLines = readyLines.filter((l) => selected.has(`${l.prId}::${l.lineId}`));

  function handleIssue() {
    const lineRefs = selectedLines.map((l) => ({ prId: l.prId, lineId: l.lineId }));
    const po = issuePO({ lineRefs, supplier, invoiceTo, consignee, paymentTerms, deliveryTerms, deliveryDate, dispatchThrough, destination });
    setLastPOId(po ? po.id : null);
    setSelected(new Set());
  }

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Issue Purchase Order</div>
      <div style={{ fontSize: 12.5, color: "#9AA1AC", marginBottom: 14 }}>Select one or more Ready-for-PO lines (ideally from the same vendor) and bundle them into one PO.</div>

      <div style={{ ...cardStyle, padding: 0, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#6B7280", fontSize: 10.5, textTransform: "uppercase", background: "#FAFAF8" }}>
                <th style={th}></th><th style={th}>PR</th><th style={th}>Item</th><th style={th}>Vendor</th><th style={thR}>Qty</th><th style={thR}>Rate</th><th style={thR}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {readyLines.map((l) => {
                const key = `${l.prId}::${l.lineId}`;
                const rate = l.pmRate || l.finalRate;
                return (
                  <tr key={key} style={{ borderTop: "1px solid #F0EFEA" }}>
                    <td style={{ padding: "6px 10px" }}><input type="checkbox" checked={selected.has(key)} onChange={() => toggle(key)} /></td>
                    <td style={{ padding: "6px 10px", color: "#6B7280" }}>{l.prId}</td>
                    <td style={{ padding: "6px 10px", fontWeight: 600 }}>{l.itemName}</td>
                    <td style={{ padding: "6px 10px", color: "#6B7280" }}>{l.vendorDetails || "—"}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtNum(l.finalQty)}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtINR(rate)}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtINR(l.finalQty * rate)}</td>
                  </tr>
                );
              })}
              {readyLines.length === 0 && <tr><td colSpan={7} style={{ padding: 20, textAlign: "center", color: "#9AA1AC" }}>Nothing Ready for PO yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {selectedLines.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>PO Details — {selectedLines.length} line item(s) selected</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Supplier (Bill from)"><input value={supplier} onChange={(e) => setSupplier(e.target.value)} style={inputStyle} placeholder="Name, address, GSTIN, state, contact" /></Field>
            <Field label="Expected Date of Delivery"><input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} style={inputStyle} /></Field>
            <Field label="Invoice To"><textarea value={invoiceTo} onChange={(e) => setInvoiceTo(e.target.value)} style={{ ...inputStyle, minHeight: 44 }} /></Field>
            <Field label="Consignee (Ship to)"><textarea value={consignee} onChange={(e) => setConsignee(e.target.value)} style={{ ...inputStyle, minHeight: 44 }} /></Field>
            <Field label="Mode / Terms of Payment"><input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} style={inputStyle} /></Field>
            <Field label="Terms of Delivery"><input value={deliveryTerms} onChange={(e) => setDeliveryTerms(e.target.value)} style={inputStyle} /></Field>
            <Field label="Dispatched Through"><input value={dispatchThrough} onChange={(e) => setDispatchThrough(e.target.value)} style={inputStyle} /></Field>
            <Field label="Destination"><input value={destination} onChange={(e) => setDestination(e.target.value)} style={inputStyle} /></Field>
          </div>
          <button onClick={handleIssue} disabled={!supplier || !deliveryDate} style={{ ...btnStyle(C.navy), opacity: (!supplier || !deliveryDate) ? 0.5 : 1 }}>Issue PO</button>
        </div>
      )}

      {lastPO && <POView po={lastPO} signPO={signPO} role={role} />}

      {pos.length > 0 && (
        <div style={{ ...cardStyle, marginTop: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>All Issued POs</div>
          {pos.map((po) => (
            <div key={po.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: "1px solid #F0EFEA", fontSize: 12.5, gap: 10, flexWrap: "wrap" }}>
              <span>{po.id} — {po.supplier} — {po.lines.length} item(s)</span>
              <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ color: "#9AA1AC" }}>Due {po.deliveryDate}</span>
                <button onClick={() => setLastPOId(po.id)} style={{ ...btnStyle(C.navy), fontSize: 11, padding: "4px 9px" }}>View</button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
