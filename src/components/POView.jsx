import { C, th, thR, btnStyle } from "../theme.js";
import { fmtINR, fmtNum } from "../utils/format.js";

/* ================= PURCHASE ORDER DOCUMENT (shared by Issue PO & Delivery Calendar) ================= */
export default function POView({ po, signPO, role }) {
  const total = po.lines.reduce((s, l) => s + l.amount, 0);
  const SigBlock = ({ roleKey, label, requiredRole }) => {
    const sig = po.signatures[roleKey];
    const canSign = (role === requiredRole || role === "General Manager") && !sig;
    return (
      <div style={{ flex: 1, border: `1px solid ${C.line}`, borderRadius: 8, padding: 10, textAlign: "center" }}>
        <div style={{ fontSize: 10.5, color: "#9AA1AC", textTransform: "uppercase" }}>{label}</div>
        {sig ? (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontFamily: "cursive", fontSize: 16, color: C.navy }}>{sig.by}</div>
            <div style={{ fontSize: 10.5, color: "#9AA1AC" }}>Signed {sig.date}</div>
          </div>
        ) : canSign ? (
          <button onClick={() => signPO(po.id, roleKey)} style={{ ...btnStyle(C.gold), marginTop: 8, fontSize: 11 }}>Sign as {label}</button>
        ) : (
          <div style={{ fontSize: 11, color: "#9AA1AC", marginTop: 8 }}>Awaiting {requiredRole}'s signature</div>
        )}
      </div>
    );
  };
  return (
    <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, padding: 20 }}>
      <div style={{ textAlign: "center", fontWeight: 800, fontSize: 15, marginBottom: 12 }}>PURCHASE ORDER</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 12, marginBottom: 12 }}>
        <div><b>Invoice To</b><div style={{ color: "#6B7280" }}>{po.invoiceTo}</div></div>
        <div><b>Voucher No.</b> {po.id} &nbsp; <b>Dated</b> {po.dated}<br /><b>Mode/Terms of Payment:</b> {po.paymentTerms}</div>
        <div><b>Consignee (Ship to)</b><div style={{ color: "#6B7280" }}>{po.consignee}</div></div>
        <div><b>Terms of Delivery:</b> {po.deliveryTerms}<br /><b>Dispatched through:</b> {po.dispatchThrough || "—"} &nbsp; <b>Destination:</b> {po.destination || "—"}</div>
        <div><b>Supplier (Bill from)</b><div style={{ color: "#6B7280" }}>{po.supplier}</div></div>
        <div><b>Expected Date of Delivery</b><div style={{ color: C.red, fontWeight: 700 }}>{po.deliveryDate}</div></div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ textAlign: "left", background: "#FAFAF8", fontSize: 10.5, textTransform: "uppercase", color: "#6B7280" }}>
              <th style={th}>Sl</th><th style={th}>Description</th><th style={thR}>Qty</th><th style={thR}>Rate</th><th style={thR}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {po.lines.map((l, i) => (
              <tr key={l.lineId} style={{ borderTop: "1px solid #F0EFEA" }}>
                <td style={{ padding: "5px 10px" }}>{i + 1}</td>
                <td style={{ padding: "5px 10px" }}>{l.itemName}</td>
                <td style={{ padding: "5px 10px", textAlign: "right" }}>{fmtNum(l.qty)} {l.unit}</td>
                <td style={{ padding: "5px 10px", textAlign: "right" }}>{fmtINR(l.rate)}</td>
                <td style={{ padding: "5px 10px", textAlign: "right" }}>{fmtINR(l.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: `2px solid ${C.navy}`, fontWeight: 800 }}>
              <td colSpan={4} style={{ padding: "8px 10px", textAlign: "right" }}>Total</td>
              <td style={{ padding: "8px 10px", textAlign: "right" }}>{fmtINR(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        <SigBlock roleKey="vp" label="VP" requiredRole="VP" />
        <SigBlock roleKey="president" label="President" requiredRole="President" />
        <SigBlock roleKey="purchaseExecutive" label="Purchase Executive" requiredRole="Purchase Executive" />
      </div>
      <button onClick={() => window.print()} style={{ ...btnStyle(C.navy), marginTop: 14 }}>Print / Download PO</button>
    </div>
  );
}
