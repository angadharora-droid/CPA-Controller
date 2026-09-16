import { useState } from "react";
import { C, th, thR, inputStyle, btnStyle } from "../../theme.js";
import { fmtINR, fmtNum } from "../../utils/format.js";
import { COMPANY_BLOCK } from "../../utils/po.js";
import { Field } from "../ui.jsx";
import POView from "../POView.jsx";

const GST_TYPES = [
  { id: "CGST_SGST", label: "CGST + SGST (within Maharashtra)" },
  { id: "IGST", label: "IGST (inter-state)" },
];

/* ================= ISSUE PO (Purchase Manager) ================= */
export default function IssuePOTab({ allLines, issuePO, signPO, pos, cardStyle, role, isAdmin }) {
  const readyLines = allLines.filter((l) => l.status === "Ready for PO");
  const [selected, setSelected] = useState(() => new Set());

  // supplier (bill from)
  const [supplier, setSupplier] = useState("");
  const [supplierAddress, setSupplierAddress] = useState("");
  const [supplierGstin, setSupplierGstin] = useState("");
  const [supplierState, setSupplierState] = useState("Maharashtra, Code : 27");
  const [supplierContact, setSupplierContact] = useState("");
  // our side
  const [invoiceTo, setInvoiceTo] = useState(COMPANY_BLOCK);
  const [consignee, setConsignee] = useState(COMPANY_BLOCK);
  // voucher details
  const [referenceNo, setReferenceNo] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("100% ADVANCE");
  const [otherReferences, setOtherReferences] = useState("");
  const [deliveryTerms, setDeliveryTerms] = useState("AFTER PAYMENT WITHIN 8-10 DAYS");
  const [dispatchThrough, setDispatchThrough] = useState("");
  const [destination, setDestination] = useState("Amravati");
  const [deliveryDate, setDeliveryDate] = useState("");
  // money
  const [discountPct, setDiscountPct] = useState("0");
  const [gstPct, setGstPct] = useState("18");
  const [gstType, setGstType] = useState("CGST_SGST");

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
  const canIssue = selectedLines.length > 0 && supplier.trim() && deliveryDate;

  function handleIssue() {
    const lineRefs = selectedLines.map((l) => ({ prId: l.prId, lineId: l.lineId }));
    const po = issuePO({
      lineRefs,
      supplier: supplier.trim(), supplierAddress, supplierGstin, supplierState, supplierContact,
      invoiceTo, consignee,
      referenceNo, paymentTerms, otherReferences, deliveryTerms, deliveryDate, dispatchThrough, destination,
      discountPct: Number(discountPct) || 0, gstPct: Number(gstPct) || 0, gstType,
    });
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
                <th style={th}></th><th style={th}>PR</th><th style={th}>Item</th><th style={th}>Brand / Specs</th><th style={th}>Vendor</th><th style={thR}>Qty</th><th style={thR}>Rate</th><th style={thR}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {readyLines.map((l) => {
                const key = `${l.prId}::${l.lineId}`;
                const rate = l.pmRate || l.finalRate;
                const desc = [l.proposedBrand, l.proposedModel].filter(Boolean).join(" - ");
                return (
                  <tr key={key} style={{ borderTop: "1px solid #F0EFEA" }}>
                    <td style={{ padding: "6px 10px" }}><input type="checkbox" checked={selected.has(key)} onChange={() => toggle(key)} /></td>
                    <td style={{ padding: "6px 10px", color: "#6B7280" }}>{l.prId}</td>
                    <td style={{ padding: "6px 10px", fontWeight: 600 }}>{l.itemName}</td>
                    <td style={{ padding: "6px 10px", color: "#6B7280" }}>{desc || "—"}</td>
                    <td style={{ padding: "6px 10px", color: "#6B7280" }}>{l.vendorDetails || "—"}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtNum(l.finalQty)}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtINR(rate)}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtINR(l.finalQty * rate)}</td>
                  </tr>
                );
              })}
              {readyLines.length === 0 && <tr><td colSpan={8} style={{ padding: 20, textAlign: "center", color: "#9AA1AC" }}>Nothing Ready for PO yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {selectedLines.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>PO Details — {selectedLines.length} line item(s) selected</div>

          <SectionTitle>Supplier (Bill from)</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            <Field label="Supplier name *"><input value={supplier} onChange={(e) => setSupplier(e.target.value)} style={inputStyle} placeholder="e.g. S L CROCKERIES" /></Field>
            <Field label="GSTIN/UIN"><input value={supplierGstin} onChange={(e) => setSupplierGstin(e.target.value)} style={inputStyle} placeholder="e.g. 27AATPV3967E1ZX" /></Field>
            <Field label="State Name, Code"><input value={supplierState} onChange={(e) => setSupplierState(e.target.value)} style={inputStyle} /></Field>
            <Field label="Contact"><input value={supplierContact} onChange={(e) => setSupplierContact(e.target.value)} style={inputStyle} placeholder="Phone / email" /></Field>
          </div>
          <Field label="Supplier address"><textarea value={supplierAddress} onChange={(e) => setSupplierAddress(e.target.value)} style={{ ...inputStyle, minHeight: 44 }} placeholder={"632, Deputy Signal, Railway Crossing,\nWardhaman Nagar, Nagpur"} /></Field>

          <SectionTitle>Our details</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Invoice To (first line prints bold)"><textarea value={invoiceTo} onChange={(e) => setInvoiceTo(e.target.value)} style={{ ...inputStyle, minHeight: 96 }} /></Field>
            <Field label="Consignee (Ship to)"><textarea value={consignee} onChange={(e) => setConsignee(e.target.value)} style={{ ...inputStyle, minHeight: 96 }} /></Field>
          </div>

          <SectionTitle>Voucher details</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            <Field label="Expected Date of Delivery (Due on) *"><input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} style={inputStyle} /></Field>
            <Field label="Reference No. & Date"><input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} style={inputStyle} placeholder="Quotation / reference" /></Field>
            <Field label="Mode/Terms of Payment"><input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} style={inputStyle} placeholder="e.g. 30 DAYS CREDIT" /></Field>
            <Field label="Other References"><input value={otherReferences} onChange={(e) => setOtherReferences(e.target.value)} style={inputStyle} /></Field>
            <Field label="Dispatched through"><input value={dispatchThrough} onChange={(e) => setDispatchThrough(e.target.value)} style={inputStyle} /></Field>
            <Field label="Destination"><input value={destination} onChange={(e) => setDestination(e.target.value)} style={inputStyle} /></Field>
          </div>
          <Field label="Terms of Delivery"><input value={deliveryTerms} onChange={(e) => setDeliveryTerms(e.target.value)} style={inputStyle} /></Field>

          <SectionTitle>Discount &amp; tax</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            <Field label="Discount % (on the whole order)"><input type="number" min="0" max="100" step="0.01" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} style={inputStyle} /></Field>
            <Field label="GST %"><input type="number" min="0" max="100" step="0.01" value={gstPct} onChange={(e) => setGstPct(e.target.value)} style={inputStyle} /></Field>
            <Field label="GST type">
              <select value={gstType} onChange={(e) => setGstType(e.target.value)} style={inputStyle}>
                {GST_TYPES.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
              </select>
            </Field>
          </div>

          <button onClick={handleIssue} disabled={!canIssue} style={{ ...btnStyle(C.navy), opacity: canIssue ? 1 : 0.5 }}>Issue PO</button>
        </div>
      )}

      {lastPO && <POView po={lastPO} signPO={signPO} role={role} isAdmin={isAdmin} />}

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

function SectionTitle({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.4, margin: "12px 0 6px" }}>{children}</div>;
}
