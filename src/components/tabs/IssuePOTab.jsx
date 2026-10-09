import { Fragment, useState } from "react";
import { C, th, thR, inputStyle, cellInput, btnStyle } from "../../theme.js";
import { fmtINR, fmtNum, fmtRate, round2 } from "../../utils/format.js";
import { COMPANY_BLOCK, computePOTotals, fmtMoney, fmtSigned, stateCodeOf, gstTypeForState, poIsLocked, lineHasOwnGst } from "../../utils/po.js";
import { matchesQuery } from "../../utils/search.js";
import { unitOf } from "../../utils/units.js";
import { Field, SearchBox, UnitSelect, confirmQtyCut, confirmUnitChange } from "../ui.jsx";
import { GstRateField, GstTypeField, LineGstSelect, TotalRow } from "../GstFields.jsx";
import POView from "../POView.jsx";

/* Everything on a PO other than its line items. `gstTypeManual` is null while the GST type
   simply follows the supplier's state code. `lineGst` holds the items given their own GST rate,
   keyed "prId::lineId"; any item not in it is taxed at the order's rate. */
const BLANK_FORM = {
  // supplier (bill from)
  supplier: "", supplierAddress: "", supplierGstin: "", supplierState: "Maharashtra, Code : 27", supplierContact: "",
  // our side
  invoiceTo: COMPANY_BLOCK, consignee: COMPANY_BLOCK,
  // voucher details
  referenceNo: "", paymentTerms: "100% ADVANCE", otherReferences: "",
  deliveryTerms: "AFTER PAYMENT WITHIN 8-10 DAYS", dispatchThrough: "", destination: "Amravati", deliveryDate: "",
  // money
  discountPct: "0", gstPct: "18", gstTypeManual: null, lineGst: {},
};

const lineKey = (l) => `${l.prId}::${l.lineId}`;

function formGstType(form) {
  return form.gstTypeManual || gstTypeForState(stateCodeOf(form.supplierGstin, form.supplierState));
}

/* The fields sent to issuePO / updatePO. */
function formToFields(form) {
  const { gstTypeManual, lineGst, lineRate, lineQty, lineUnit, ...rest } = form;
  const ownGst = {};
  Object.entries(lineGst || {}).forEach(([k, v]) => { if (v !== "" && v !== null && v !== undefined) ownGst[k] = Number(v) || 0; });
  const fields = { ...rest, supplier: form.supplier.trim(), discountPct: Number(form.discountPct) || 0, gstPct: Number(form.gstPct) || 0, gstType: formGstType(form), lineGst: ownGst };
  // only the edit form carries rates, quantities and units: a new PO takes them from the Purchase Manager tab
  if (lineRate) fields.lineRate = Object.fromEntries(Object.entries(lineRate).map(([k, v]) => [k, Number(v)]));
  if (lineQty) fields.lineQty = Object.fromEntries(Object.entries(lineQty).map(([k, v]) => [k, Number(v)]));
  if (lineUnit) fields.lineUnit = { ...lineUnit };
  return fields;
}

function formFromPO(po) {
  // what the PO actually holds, never the new-PO defaults (older POs lack some of these fields)
  const form = {};
  Object.keys(BLANK_FORM).forEach((k) => { form[k] = po[k] === undefined || po[k] === null ? "" : String(po[k]); });
  form.discountPct = String(Number(po.discountPct) || 0);
  form.gstPct = String(Number(po.gstPct) || 0);
  const saved = po.gstType === "IGST" ? "IGST" : "CGST_SGST";
  form.gstTypeManual = saved === formGstType({ ...form, gstTypeManual: null }) ? null : saved;
  form.lineGst = {};
  po.lines.forEach((l) => { if (lineHasOwnGst(l)) form.lineGst[lineKey(l)] = String(Number(l.gstPct) || 0); });
  form.lineRate = {};
  // to the paisa: a rate converted to another unit carries more decimals than anyone types
  po.lines.forEach((l) => { form.lineRate[lineKey(l)] = String(round2(Number(l.rate) || 0)); });
  form.lineQty = {};
  po.lines.forEach((l) => { form.lineQty[lineKey(l)] = String(Number(l.qty) || 0); });
  form.lineUnit = {};
  po.lines.forEach((l) => { form.lineUnit[lineKey(l)] = l.unit || "Nos"; });
  return form;
}

/* ================= ISSUE PO (Purchase Manager) ================= */
export default function IssuePOTab({ allLines, issuePO, updatePO, signPO, unitBlock, pos, cardStyle, role, isAdmin, readOnly }) {
  const readyLines = allLines.filter((l) => l.status === "Ready for PO");
  const [selected, setSelected] = useState(() => new Set());
  const [form, setForm] = useState(BLANK_FORM);
  // searching only narrows what is listed: lines already ticked stay selected for the PO
  const [lineQuery, setLineQuery] = useState("");
  const shownLines = readyLines.filter((l) => matchesQuery(lineQuery, l.prId, l.itemName, l.headName, l.proposedBrand, l.proposedModel, l.vendorDetails, l.raisedBy, l.dept));
  const [poQuery, setPoQuery] = useState("");
  const shownPOs = pos.filter((po) => matchesQuery(poQuery, po.id, po.supplier, po.deliveryDate, po.referenceNo, ...po.lines.map((l) => l.itemName)));

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
  const editRate = (l) => Number(editForm.lineRate?.[lineKey(l)]);
  const editQty = (l) => Number(editForm.lineQty?.[lineKey(l)]);
  const editUnit = (l) => editForm.lineUnit?.[lineKey(l)] || l.unit || "Nos";
  // an item given a new unit: its quantity is the one in that unit, and its rate follows so the amount stays
  const converting = (l) => editUnit(l) !== (l.unit || "Nos");
  const ratesOk = editPO && editPO.lines.every((l) => converting(l) || editRate(l) > 0);
  // a quantity may come down, never go up
  const qtysOk = editPO && editPO.lines.every((l) => converting(l) || (editQty(l) > 0 && editQty(l) <= Number(l.qty)));
  const unitsOk = editPO && editPO.lines.every((l) => !converting(l) || editQty(l) > 0);
  const canSave = editPO && ratesOk && qtysOk && unitsOk && editForm.supplier.trim() && editForm.deliveryDate;
  function setEditUnit(l, unit) {
    const key = lineKey(l);
    // back to the PO's own unit restores its quantity; a new one waits for the quantity in it
    setEditForm((f) => ({ ...f, lineUnit: { ...(f.lineUnit || {}), [key]: unit }, lineQty: { ...(f.lineQty || {}), [key]: unit === (l.unit || "Nos") ? String(l.qty) : "" } }));
  }
  function handleSaveEdit() {
    const units = editPO.lines.filter(converting).map((l) => ({
      itemName: l.itemName, was: Number(l.qty), from: l.unit || "Nos", n: editQty(l), to: editUnit(l), rate: Number(l.rate),
      onItem: !!allLines.find((x) => x.prId === l.prId && x.lineId === l.lineId)?.itemId,
    }));
    if (units.length && !confirmUnitChange(units)) return;
    const cuts = editPO.lines.filter((l) => !converting(l) && editQty(l) < Number(l.qty)).map((l) => ({ itemName: l.itemName, was: l.qty, n: editQty(l) }));
    if (cuts.length && !confirmQtyCut(cuts)) return;
    updatePO(editPO.id, formToFields(editForm));
    setEditId(null);
  }

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Issue Purchase Order</div>
      <div style={{ fontSize: 12.5, color: "#9AA1AC", marginBottom: 14 }}>Select one or more Ready-for-PO lines (ideally from the same vendor) and bundle them into one PO.</div>

      <div style={{ ...cardStyle, padding: 0, overflow: "hidden", marginBottom: 14 }}>
        {readyLines.length > 0 && (
          <div style={{ padding: 12, borderBottom: `1px solid ${C.line}`, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <SearchBox value={lineQuery} onChange={setLineQuery} placeholder="Search PR no., item, brand, vendor…" />
            <span style={{ fontSize: 12, color: "#9AA1AC" }}>{shownLines.length} of {readyLines.length} line(s){selected.size > 0 ? ` · ${selected.size} selected` : ""}</span>
          </div>
        )}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#6B7280", fontSize: 10.5, textTransform: "uppercase", background: "#FAFAF8" }}>
                <th style={th}></th><th style={th}>PR</th><th style={th}>Item</th><th style={th}>Brand / Specs</th><th style={th}>Vendor</th><th style={thR}>Qty</th><th style={thR}>Rate</th><th style={thR}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {shownLines.map((l) => {
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
                    <td style={{ padding: "6px 10px", textAlign: "right", whiteSpace: "nowrap" }}>{fmtNum(l.finalQty)} {unitOf(l)}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtRate(rate)}
                      {rate > l.finalRate && <div style={{ fontSize: 10.5, color: C.red, fontWeight: 600 }}>Above approved {fmtRate(l.finalRate)}</div>}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtINR(l.finalQty * rate)}</td>
                  </tr>
                );
              })}
              {shownLines.length === 0 && <tr><td colSpan={8} style={{ padding: 20, textAlign: "center", color: "#9AA1AC" }}>{readyLines.length ? `No Ready-for-PO lines match "${lineQuery.trim()}".` : "Nothing Ready for PO yet."}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {selectedLines.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>PO Details — {selectedLines.length} line item(s) selected</div>
          <PODetailsFields form={form} setForm={setForm} lines={selectedLines.map((l) => ({ key: lineKey(l), itemName: l.itemName, qty: l.finalQty, rate: l.pmRate || l.finalRate }))} />
          <button onClick={handleIssue} disabled={!canIssue} style={{ ...btnStyle(C.navy), opacity: canIssue ? 1 : 0.5 }}>Issue PO</button>
        </div>
      )}

      {editPO && (
        <div style={{ ...cardStyle, marginBottom: 14, borderColor: C.gold }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Edit {editPO.id}</div>
          <div style={{ fontSize: 12, color: "#9AA1AC", marginBottom: 10 }}>
            Rates, quantities, units, supplier, voucher details, discount and GST (for the order or per item) can be corrected here. A rate above the approved one is allowed but flagged and recorded in the audit trail. A quantity can be lowered but never raised; the units not bought go back to the approved balance. A new unit takes the quantity in that unit, and the rate follows so the amount stays the same; the budget item switches to that unit too.
          </div>
          {signatureCount(editPO) > 0 && (
            <div style={{ background: "#FDF2E3", color: C.amber, borderRadius: 7, padding: "7px 10px", fontSize: 12, fontWeight: 600, marginBottom: 10 }}>
              This PO already has {signatureCount(editPO)} signature(s). Saving a change clears them, so the corrected PO must be signed again.
            </div>
          )}
          <SectionTitle>Items, quantities, units &amp; rates</SectionTitle>
          <EditItemsTable lines={editPO.lines} allLines={allLines} lineRate={editForm.lineRate || {}} lineQty={editForm.lineQty || {}} editUnit={editUnit} unitBlock={unitBlock}
            setRate={(key, v) => setEditForm((f) => ({ ...f, lineRate: { ...(f.lineRate || {}), [key]: v } }))}
            setQty={(key, v) => setEditForm((f) => ({ ...f, lineQty: { ...(f.lineQty || {}), [key]: v } }))} setUnit={setEditUnit} />
          {/* the amount follows the rate and quantity being typed, so the GST pickers and the total stay live */}
          <PODetailsFields form={editForm} setForm={setEditForm} lines={editPO.lines.map((l) => {
            if (converting(l)) {
              const amount = (Number(l.qty) || 0) * (Number(l.rate) || 0);
              const qty = editQty(l) > 0 ? editQty(l) : Number(l.qty) || 0;
              return { key: lineKey(l), itemName: l.itemName, qty, rate: qty ? amount / qty : 0, amount };
            }
            const rate = editRate(l) > 0 ? editRate(l) : 0;
            const qty = editQty(l) > 0 && editQty(l) <= Number(l.qty) ? editQty(l) : Number(l.qty) || 0;
            return { key: lineKey(l), itemName: l.itemName, qty, rate, amount: qty * rate };
          })} />
          {!ratesOk && <div style={{ fontSize: 12, color: C.red, fontWeight: 600, marginBottom: 8 }}>Every item needs a rate above zero.</div>}
          {!qtysOk && <div style={{ fontSize: 12, color: C.red, fontWeight: 600, marginBottom: 8 }}>A quantity can be lowered but not raised, and must stay above zero.</div>}
          {!unitsOk && <div style={{ fontSize: 12, color: C.red, fontWeight: 600, marginBottom: 8 }}>Type the quantity in the new unit for every item whose unit you changed.</div>}
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
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
            <div style={{ fontWeight: 700 }}>All Issued POs</div>
            <SearchBox value={poQuery} onChange={setPoQuery} placeholder="Search PO no., supplier, item, reference…" />
            <span style={{ fontSize: 12, color: "#9AA1AC" }}>{shownPOs.length} of {pos.length}</span>
          </div>
          {shownPOs.length === 0 && <div style={{ padding: "10px 0", fontSize: 12.5, color: "#9AA1AC" }}>No POs match "{poQuery.trim()}".</div>}
          {shownPOs.map((po) => (
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

/* The PO's items with a quantity box (it can only come down), a unit picker and a rate box each, next
   to the rate the VP approved on the requisition. With a new unit picked the quantity box takes the
   quantity in it and the rate is worked out from the amount, which stays. */
function EditItemsTable({ lines, allLines, lineRate, lineQty, editUnit, unitBlock, setRate, setQty, setUnit }) {
  const hint = { fontSize: 10.5, color: "#9AA1AC", marginTop: 2 };
  const warn = { ...hint, color: C.red, fontWeight: 600 };
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, marginBottom: 12, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "#6B7280", fontSize: 10.5, textTransform: "uppercase", background: "#FAFAF8" }}>
            <th style={th}>PR</th><th style={th}>Item</th><th style={thR}>Qty</th><th style={th}>Unit</th><th style={thR}>Approved Rate</th><th style={thR}>Rate</th><th style={thR}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const key = lineKey(l);
            const approved = Number(allLines.find((x) => x.prId === l.prId && x.lineId === l.lineId)?.finalRate) || 0;
            const value = lineRate[key] ?? "";
            const n = Number(value);
            const valid = value !== "" && n > 0;
            const poUnit = l.unit || "Nos";
            const unit = editUnit(l);
            const converting = unit !== poUnit;
            const block = unitBlock(l.prId, l.lineId);
            const qtyValue = lineQty[key] ?? "";
            const q = Number(qtyValue);
            const qtyValid = qtyValue !== "" && q > 0 && (converting || q <= Number(l.qty));
            // new quantity per old one: 10 Nos → 150 Mtr is 15
            const ratio = converting && qtyValid ? q / Number(l.qty) : null;
            return (
              <tr key={key} style={{ borderTop: "1px solid #F0EFEA" }}>
                <td style={{ padding: "6px 10px", color: "#6B7280" }}>{l.prId}</td>
                <td style={{ padding: "6px 10px", fontWeight: 600 }}>{l.itemName}</td>
                <td style={{ padding: "6px 6px", textAlign: "right" }}>
                  <input type="number" min="0" max={converting ? undefined : l.qty} value={qtyValue} placeholder={converting ? `in ${unit}` : undefined}
                    onChange={(e) => setQty(key, e.target.value)}
                    style={{ ...cellInput, width: 70, border: `1px solid ${qtyValid ? C.line : C.red}` }} />
                  {!converting && q > Number(l.qty) && <div style={warn}>Can't go above {fmtNum(l.qty)}</div>}
                  {(converting || (qtyValid && q !== Number(l.qty))) && <div style={hint}>was {fmtNum(l.qty)}{converting ? ` ${poUnit}` : ""}</div>}
                </td>
                <td style={{ padding: "6px 6px" }}><UnitSelect value={unit} onChange={(v) => setUnit(l, v)} disabled={!!block} title={block} /></td>
                <td style={{ padding: "6px 10px", textAlign: "right", color: "#6B7280" }}>
                  {!approved ? "—" : converting ? (ratio ? fmtRate(approved / ratio) : "—") : fmtRate(approved)}
                </td>
                <td style={{ padding: "6px 6px", textAlign: "right" }}>
                  {converting
                    ? <span style={{ padding: "0 4px", fontWeight: 600 }}>{ratio ? fmtRate(Number(l.rate) / ratio) : "—"}</span>
                    : <input type="number" min="0" step="0.01" value={value} onChange={(e) => setRate(key, e.target.value)}
                        style={{ ...cellInput, width: 90, border: `1px solid ${valid ? C.line : C.red}` }} />}
                  {converting && <div style={hint}>was {fmtRate(l.rate)} / {poUnit}</div>}
                  {!converting && valid && approved > 0 && n > approved && <div style={warn}>Above approved by {fmtRate(n - approved)}</div>}
                  {!converting && valid && round2(n) !== round2(l.rate) && <div style={hint}>was {fmtRate(l.rate)}</div>}
                </td>
                <td style={{ padding: "6px 10px", textAlign: "right" }}>
                  {converting ? (ratio ? fmtMoney(Number(l.qty) * Number(l.rate)) : "—") : valid && qtyValid ? fmtMoney(q * n) : "—"}
                  {ratio && <div style={hint}>unchanged</div>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* Supplier, our details, voucher details, discount & tax, with a live total — shared by the
   issue form and the edit form. `lines` ({ key, itemName, qty, rate }) feed the per-item GST
   pickers and the total preview. */
function PODetailsFields({ form, setForm, lines }) {
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const setValue = (key) => (v) => setForm((f) => ({ ...f, [key]: v }));
  const setLineGst = (key) => (v) => setForm((f) => {
    const lineGst = { ...(f.lineGst || {}) };
    if (v === "") delete lineGst[key]; else lineGst[key] = v;
    return { ...f, lineGst };
  });
  const lineGst = form.lineGst || {};
  const supplierCode = stateCodeOf(form.supplierGstin, form.supplierState);
  const gstType = formGstType(form);
  // same maths as the printed document
  const preview = computePOTotals({ lines: lines.map((l) => ({ ...l, gstPct: lineGst[l.key] })), discountPct: form.discountPct, gstPct: form.gstPct, gstType });
  const ownCount = lines.filter((l) => lineGst[l.key] !== undefined).length;

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
        <GstRateField label={lines.length > 1 ? "GST rate (whole order)" : "GST rate"} value={form.gstPct} onChange={setValue("gstPct")} />
        <GstTypeField value={gstType} manual={!!form.gstTypeManual} onPick={setValue("gstTypeManual")} onAuto={() => setValue("gstTypeManual")(null)} stateCode={supplierCode} />
      </div>

      {(lines.length > 1 || ownCount > 0) && (
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, marginBottom: 12, overflowX: "auto" }}>
          <div style={{ padding: "7px 10px", fontSize: 12, color: "#6B7280", borderBottom: `1px solid ${C.line}`, background: "#FAFAF8" }}>
            <b style={{ color: C.text }}>GST per item</b> — items left on "Order rate" follow the rate above; pick a rate to tax an item differently, or "No GST" to leave it untaxed.
            {ownCount > 0 && <> {ownCount} item(s) on their own rate.</>}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <tbody>
              {lines.map((l) => (
                <tr key={l.key} style={{ borderTop: "1px solid #F0EFEA" }}>
                  <td style={{ padding: "5px 10px", fontWeight: 600 }}>{l.itemName}</td>
                  <td style={{ padding: "5px 10px", textAlign: "right", color: "#6B7280", whiteSpace: "nowrap" }}>{fmtMoney(Number(l.amount) || (Number(l.qty) || 0) * (Number(l.rate) || 0))}</td>
                  <td style={{ padding: "5px 10px", width: 1 }}><LineGstSelect value={lineGst[l.key]} orderPct={form.gstPct} onChange={setLineGst(l.key)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 12px", marginBottom: 12, maxWidth: 380, fontSize: 12.5, background: "#FAFAF8" }}>
        <TotalRow label="Subtotal" value={fmtMoney(preview.subtotal)} />
        {preview.discount > 0 && <TotalRow label={`Less: Discount @ ${preview.discountPct}%`} value={fmtSigned(-preview.discount)} />}
        {preview.taxes.map((x) => gstType === "IGST"
          ? <TotalRow key={x.pct} label={`IGST @ ${x.pct}%`} value={fmtMoney(x.igst)} />
          : (
            <Fragment key={x.pct}>
              <TotalRow label={`SGST @ ${x.pct / 2}%`} value={fmtMoney(x.sgst)} />
              <TotalRow label={`CGST @ ${x.pct / 2}%`} value={fmtMoney(x.cgst)} />
            </Fragment>
          ))}
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
