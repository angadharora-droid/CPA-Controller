import { useState } from "react";
import { C, th, thR, inputStyle, btnStyle } from "../../theme.js";
import { fmtINR, fmtNum } from "../../utils/format.js";
import { COMPANY_BLOCK, computePOTotals, fmtMoney, fmtSigned, stateCodeOf, gstTypeForState, poIsLocked } from "../../utils/po.js";
import { Field } from "../ui.jsx";
import { GstRateField, GstTypeField, TotalRow } from "../GstFields.jsx";
import POView from "../POView.jsx";

/* Everything on a PO other than its line items. `gstTypeManual` is null while the GST type
   simply follows the supplier's state code. */
const BLANK_FORM = {
  // supplier (bill from)
  supplier: "", supplierAddress: "", supplierGstin: "", supplierState: "Maharashtra, Code : 27", supplierContact: "",
  // our side
  invoiceTo: COMPANY_BLOCK, consignee: COMPANY_BLOCK,
  // voucher details
  referenceNo: "", paymentTerms: "100% ADVANCE", otherReferences: "",
  deliveryTerms: "AFTER PAYMENT WITHIN 8-10 DAYS", dispatchThrough: "", destination: "Amravati", deliveryDate: "",
  // money
  discountPct: "0", gstPct: "18", gstTypeManual: null,
};

function formGstType(form) {
  return form.gstTypeManual || gstTypeForState(stateCodeOf(form.supplierGstin, form.supplierState));
}

/* The fields sent to issuePO / updatePO. */
function formToFields(form) {
  const { gstTypeManual, ...rest } = form;
  return { ...rest, supplier: form.supplier.trim(), discountPct: Number(form.discountPct) || 0, gstPct: Number(form.gstPct) || 0, gstType: formGstType(form) };
}

function formFromPO(po) {
  // what the PO actually holds, never the new-PO defaults (older POs lack some of these fields)
  const form = {};
  Object.keys(BLANK_FORM).forEach((k) => { form[k] = po[k] === undefined || po[k] === null ? "" : String(po[k]); });
  form.discountPct = String(Number(po.discountPct) || 0);
  form.gstPct = String(Number(po.gstPct) || 0);
  const saved = po.gstType === "IGST" ? "IGST" : "CGST_SGST";
  form.gstTypeManual = saved === formGstType({ ...form, gstTypeManual: null }) ? null : saved;
  return form;
}

/* ================= ISSUE PO (Purchase Manager) ================= */
export default function IssuePOTab({ allLines, issuePO, updatePO, signPO, pos, cardStyle, role, isAdmin, readOnly }) {
  const readyLines = allLines.filter((l) => l.status === "Ready for PO");
  const [selected, setSelected] = useState(() => new Set());
  const [form, setForm] = useState(BLANK_FORM);

  const [lastPOId, setLastPOId] = useState(null);
  const lastPO = pos.find((p) => p.id === lastPOId) || null;

  // editing a PO that has already been issued
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState(BLANK_FORM);
  // a PO stops being editable the moment goods are received against it
  const editPO = pos.find((p) => p.id === editId && !poIsLocked(p)) || null;

  function toggle(lineKey) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(lineKey)) next.delete(lineKey); else next.add(lineKey);
      return next;
    });
  }
  const selectedLines = readyLines.filter((l) => selected.has(`${l.prId}::${l.lineId}`));
  const canIssue = selectedLines.length > 0 && form.supplier.trim() && form.deliveryDate;

  function handleIssue() {
    const lineRefs = selectedLines.map((l) => ({ prId: l.prId, lineId: l.lineId }));
    const po = issuePO({ lineRefs, ...formToFields(form) });
    setLastPOId(po ? po.id : null);
    setSelected(new Set());
  }

  function startEdit(po) {
    if (readOnly || poIsLocked(po)) return;
    setEditId(po.id);
    setEditForm(formFromPO(po));
    setLastPOId(po.id);
  }
  const canSave = editPO && editForm.supplier.trim() && editForm.deliveryDate;
  function handleSaveEdit() {
    updatePO(editPO.id, formToFields(editForm));
    setEditId(null);
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
                    <td style={{ padding: "6px 10px" }}><input type="checkbox" checked={selected.has(key)} disabled={readOnly} onChange={() => toggle(key)} /></td>
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
          <PODetailsFields form={form} setForm={setForm} lines={selectedLines.map((l) => ({ qty: l.finalQty, rate: l.pmRate || l.finalRate }))} />
          <button onClick={handleIssue} disabled={!canIssue} style={{ ...btnStyle(C.navy), opacity: canIssue ? 1 : 0.5 }}>Issue PO</button>
        </div>
      )}

      {editPO && (
        <div style={{ ...cardStyle, marginBottom: 14, borderColor: C.gold }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Edit {editPO.id}</div>
          <div style={{ fontSize: 12, color: "#9AA1AC", marginBottom: 10 }}>
            Supplier, voucher details, discount and GST can be corrected here. Items, quantities and rates stay as approved on the requisition.
          </div>
          {signatureCount(editPO) > 0 && (
            <div style={{ background: "#FDF2E3", color: C.amber, borderRadius: 7, padding: "7px 10px", fontSize: 12, fontWeight: 600, marginBottom: 10 }}>
              This PO already has {signatureCount(editPO)} signature(s). Saving a change clears them, so the corrected PO must be signed again.
            </div>
          )}
          <PODetailsFields form={editForm} setForm={setEditForm} lines={editPO.lines} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleSaveEdit} disabled={!canSave} style={{ ...btnStyle(C.navy), opacity: canSave ? 1 : 0.5 }}>Save changes</button>
            <button onClick={() => setEditId(null)} style={{ ...btnStyle(C.grey) }}>Cancel</button>
          </div>
        </div>
      )}

      {lastPO && !editPO && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            {poIsLocked(lastPO)
              ? <LockedNote />
              : !readOnly && <button onClick={() => startEdit(lastPO)} style={{ ...btnStyle(C.gold), fontSize: 11.5, padding: "6px 12px" }}>Edit this PO</button>}
          </div>
          <POView po={lastPO} signPO={signPO} role={role} isAdmin={isAdmin} />
        </>
      )}

      {pos.length > 0 && (
        <div style={{ ...cardStyle, marginTop: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>All Issued POs</div>
          {pos.map((po) => (
            <div key={po.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: "1px solid #F0EFEA", fontSize: 12.5, gap: 10, flexWrap: "wrap" }}>
              <span>{po.id} — {po.supplier} — {po.lines.length} item(s){po.editedAt && <span style={{ color: "#9AA1AC" }}> · edited {po.editedAt}</span>}</span>
              <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ color: "#9AA1AC" }}>Due {po.deliveryDate}</span>
                <button onClick={() => { setEditId(null); setLastPOId(po.id); }} style={{ ...btnStyle(C.navy), fontSize: 11, padding: "4px 9px" }}>View</button>
                {poIsLocked(po)
                  ? <LockedNote />
                  : !readOnly && <button onClick={() => startEdit(po)} style={{ ...btnStyle(C.gold), fontSize: 11, padding: "4px 9px" }}>Edit</button>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LockedNote() {
  return <span title="Goods have been received against this PO, so it can no longer be edited." style={{ fontSize: 11.5, fontWeight: 600, color: "#9AA1AC" }}>Locked — goods received</span>;
}

function signatureCount(po) {
  return Object.values(po.signatures || {}).filter(Boolean).length;
}

/* Supplier, our details, voucher details, discount & tax, with a live total — shared by the
   issue form and the edit form. `lines` only feeds the total preview. */
function PODetailsFields({ form, setForm, lines }) {
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const setValue = (key) => (v) => setForm((f) => ({ ...f, [key]: v }));
  const supplierCode = stateCodeOf(form.supplierGstin, form.supplierState);
  const gstType = formGstType(form);
  // same maths as the printed document
  const preview = computePOTotals({ lines, discountPct: form.discountPct, gstPct: form.gstPct, gstType });
  const halfPct = preview.gstPct / 2;

  return (
    <>
      <SectionTitle>Supplier (Bill from)</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        <Field label="Supplier name *"><input value={form.supplier} onChange={set("supplier")} style={inputStyle} placeholder="e.g. S L CROCKERIES" /></Field>
        <Field label="GSTIN/UIN"><input value={form.supplierGstin} onChange={set("supplierGstin")} style={inputStyle} placeholder="e.g. 27AATPV3967E1ZX" /></Field>
        <Field label="State Name, Code"><input value={form.supplierState} onChange={set("supplierState")} style={inputStyle} /></Field>
        <Field label="Contact"><input value={form.supplierContact} onChange={set("supplierContact")} style={inputStyle} placeholder="Phone / email" /></Field>
      </div>
      <Field label="Supplier address"><textarea value={form.supplierAddress} onChange={set("supplierAddress")} style={{ ...inputStyle, minHeight: 44 }} placeholder={"632, Deputy Signal, Railway Crossing,\nWardhaman Nagar, Nagpur"} /></Field>

      <SectionTitle>Our details</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Invoice To (first line prints bold)"><textarea value={form.invoiceTo} onChange={set("invoiceTo")} style={{ ...inputStyle, minHeight: 96 }} /></Field>
        <Field label="Consignee (Ship to)"><textarea value={form.consignee} onChange={set("consignee")} style={{ ...inputStyle, minHeight: 96 }} /></Field>
      </div>

      <SectionTitle>Voucher details</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        <Field label="Expected Date of Delivery (Due on) *"><input type="date" value={form.deliveryDate} onChange={set("deliveryDate")} style={inputStyle} /></Field>
        <Field label="Reference No. & Date"><input value={form.referenceNo} onChange={set("referenceNo")} style={inputStyle} placeholder="Quotation / reference" /></Field>
        <Field label="Mode/Terms of Payment"><input value={form.paymentTerms} onChange={set("paymentTerms")} style={inputStyle} placeholder="e.g. 30 DAYS CREDIT" /></Field>
        <Field label="Other References"><input value={form.otherReferences} onChange={set("otherReferences")} style={inputStyle} /></Field>
        <Field label="Dispatched through"><input value={form.dispatchThrough} onChange={set("dispatchThrough")} style={inputStyle} /></Field>
        <Field label="Destination"><input value={form.destination} onChange={set("destination")} style={inputStyle} /></Field>
      </div>
      <Field label="Terms of Delivery"><input value={form.deliveryTerms} onChange={set("deliveryTerms")} style={inputStyle} /></Field>

      <SectionTitle>Discount &amp; tax</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        <Field label="Discount % (on the whole order)"><input type="number" min="0" max="100" step="0.01" value={form.discountPct} onChange={set("discountPct")} style={inputStyle} /></Field>
        <GstRateField value={form.gstPct} onChange={setValue("gstPct")} />
        <GstTypeField value={gstType} manual={!!form.gstTypeManual} onPick={setValue("gstTypeManual")} onAuto={() => setValue("gstTypeManual")(null)} stateCode={supplierCode} />
      </div>

      <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 12px", marginBottom: 12, maxWidth: 380, fontSize: 12.5, background: "#FAFAF8" }}>
        <TotalRow label="Subtotal" value={fmtMoney(preview.subtotal)} />
        {preview.discount > 0 && <TotalRow label={`Less: Discount @ ${preview.discountPct}%`} value={fmtSigned(-preview.discount)} />}
        {preview.gstPct > 0 && gstType === "IGST" && <TotalRow label={`IGST @ ${preview.gstPct}%`} value={fmtMoney(preview.igst)} />}
        {preview.gstPct > 0 && gstType !== "IGST" && (
          <>
            <TotalRow label={`SGST @ ${halfPct}%`} value={fmtMoney(preview.sgst)} />
            <TotalRow label={`CGST @ ${halfPct}%`} value={fmtMoney(preview.cgst)} />
          </>
        )}
        {preview.roundOff !== 0 && <TotalRow label="Round off" value={fmtSigned(preview.roundOff)} />}
        <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 4, paddingTop: 4 }}>
          <TotalRow label="PO total" value={`₹ ${fmtMoney(preview.total)}`} bold />
        </div>
      </div>
    </>
  );
}

function SectionTitle({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.4, margin: "12px 0 6px" }}>{children}</div>;
}
