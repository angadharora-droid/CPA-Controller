import { createPortal } from "react-dom";
import { C, btnStyle } from "../theme.js";
import { COMPANY, COMPANY_BLOCK, fmtDateShort, fmtMoney, fmtSigned, fmtQty, amountInWords, computePOTotals } from "../utils/po.js";

/* When printing, hide the whole app and show only the PO copy rendered into a body-level portal,
   so the document comes out on its own page(s) with nothing else around it. */
const PRINT_CSS = `
.po-print-only { display: none; }
@media print {
  @page { size: A4 portrait; margin: 0; }
  html, body { background: #fff !important; margin: 0; }
  #root { display: none !important; }
  .po-print-only { display: block !important; padding: 12mm 11mm; box-sizing: border-box; }
  .po-doc { max-width: none !important; }
}`;

const SIG_LABELS = { vp: "VP", president: "President", purchaseManager: "Purchase Manager" };
const INK = "#1a1a1a";
const B = `1px solid ${INK}`;
const label = { fontSize: 10, color: "#444", lineHeight: 1.3 };
const value = { fontWeight: 700, fontSize: 12, lineHeight: 1.35, minHeight: 15 };
const box = { border: B, padding: "4px 6px", verticalAlign: "top" };
const colCell = { borderLeft: B, borderRight: B, padding: "3px 6px", verticalAlign: "top", fontSize: 11.5, lineHeight: 1.3 };
const num = { ...colCell, textAlign: "right", whiteSpace: "nowrap" };
const thStyle = { border: B, padding: "3px 6px", fontSize: 10, fontWeight: 400, color: "#333", textAlign: "center", whiteSpace: "nowrap" };

/* POs issued before the structured block stored our own address as one comma-separated line;
   print those with the current company block (name, address, GSTIN, state) instead. */
function normalizeParty(text) {
  const t = String(text || "").trim();
  if (!t || t.includes("\n")) return t;
  if (/^centre point am(a)?ravati/i.test(t)) return COMPANY_BLOCK;
  return t;
}

/* A legacy supplier typed as "Name, address, GSTIN…" on one line: bold the name, wrap the rest. */
function splitSupplier(po) {
  const raw = String(po.supplier || "").trim();
  if (po.supplierAddress || !raw.includes(", ")) return { name: raw, rest: "" };
  const i = raw.indexOf(", ");
  return { name: raw.slice(0, i), rest: raw.slice(i + 2) };
}

function TextLines({ text, boldFirst }) {
  return String(text || "").split("\n").map((line, i) => (
    <div key={i} style={{ fontWeight: boldFirst && i === 0 ? 800 : 400, fontSize: i === 0 && boldFirst ? 12 : 11.5, lineHeight: 1.35 }}>{line || " "}</div>
  ));
}

function Cell({ title, children, style, colSpan }) {
  return (
    <td colSpan={colSpan} style={{ ...box, ...style }}>
      <div style={label}>{title}</div>
      <div style={value}>{children || " "}</div>
    </td>
  );
}

/* ================= THE PRINTED DOCUMENT ================= */
export function PODocument({ po }) {
  const t = computePOTotals(po);
  const half = t.gstPct / 2;
  const dueOn = fmtDateShort(po.deliveryDate);
  const supplier = splitSupplier(po);
  // short orders get a taller items area so the voucher fills the sheet, as Tally's does
  const spacer = Math.max(40, 280 - po.lines.length * 36);

  return (
    <div className="po-doc" style={{ background: "#fff", color: INK, fontFamily: "Arial, Helvetica, sans-serif", fontSize: 11, width: "100%", maxWidth: 820, margin: "0 auto", boxSizing: "border-box" }}>
      <div style={{ textAlign: "center", fontWeight: 800, fontSize: 15, letterSpacing: 0.5, padding: "4px 0 8px" }}>PURCHASE ORDER</div>

      {/* header: parties on the left, voucher details on the right */}
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <colgroup><col style={{ width: "52%" }} /><col style={{ width: "24%" }} /><col style={{ width: "24%" }} /></colgroup>
        <tbody>
          <tr>
            <td rowSpan={5} style={{ ...box, padding: 0 }}>
              <div style={{ padding: "4px 6px", borderBottom: B }}>
                <div style={label}>Invoice To</div>
                <TextLines text={normalizeParty(po.invoiceTo)} boldFirst />
              </div>
              <div style={{ padding: "4px 6px", borderBottom: B }}>
                <div style={label}>Consignee (Ship to)</div>
                <TextLines text={normalizeParty(po.consignee)} boldFirst />
              </div>
              <div style={{ padding: "4px 6px" }}>
                <div style={label}>Supplier (Bill from)</div>
                <div style={{ fontWeight: 800, fontSize: 12 }}>{supplier.name}</div>
                {supplier.rest && <div style={{ lineHeight: 1.35 }}>{supplier.rest}</div>}
                {po.supplierAddress && <TextLines text={po.supplierAddress} />}
                {po.supplierGstin && <div style={{ lineHeight: 1.35 }}>GSTIN/UIN<span style={{ display: "inline-block", width: 70 }} />: {po.supplierGstin}</div>}
                {po.supplierState && <div style={{ lineHeight: 1.35 }}>State Name<span style={{ display: "inline-block", width: 62 }} />: {po.supplierState}</div>}
                {po.supplierContact && <div style={{ lineHeight: 1.35, marginTop: 4 }}>Contact<span style={{ display: "inline-block", width: 84 }} />: {po.supplierContact}</div>}
              </div>
            </td>
            <Cell title="Voucher No.">{po.id}</Cell>
            <Cell title="Dated">{fmtDateShort(po.datedISO || po.dated)}</Cell>
          </tr>
          <tr>
            <Cell title="Reference No. & Date">{po.referenceNo}</Cell>
            <Cell title="Mode/Terms of Payment">{po.paymentTerms}</Cell>
          </tr>
          <tr>
            <Cell title="Dispatched through">{po.dispatchThrough}</Cell>
            <Cell title="Other References">{po.otherReferences}</Cell>
          </tr>
          <tr>
            <Cell title="Destination">{po.destination}</Cell>
            <Cell title="Expected Date of Delivery">{dueOn}</Cell>
          </tr>
          <tr>
            <Cell title="Terms of Delivery" colSpan={2} style={{ height: 34 }}>{po.deliveryTerms}</Cell>
          </tr>
        </tbody>
      </table>

      {/* goods */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: -1, tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "5%" }} /><col style={{ width: "31%" }} /><col style={{ width: "10%" }} /><col style={{ width: "10%" }} /><col style={{ width: "10%" }} />
          <col style={{ width: "9%" }} /><col style={{ width: "6%" }} /><col style={{ width: "6%" }} /><col style={{ width: "13%" }} />
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={2} style={thStyle}>Sl<br />No.</th>
            <th rowSpan={2} style={thStyle}>Description of Goods</th>
            <th rowSpan={2} style={thStyle}>Due on</th>
            <th colSpan={2} style={thStyle}>Quantity</th>
            <th rowSpan={2} style={thStyle}>Rate</th>
            <th rowSpan={2} style={thStyle}>per</th>
            <th rowSpan={2} style={thStyle}>Disc. %</th>
            <th rowSpan={2} style={thStyle}>Amount</th>
          </tr>
          <tr><th style={thStyle}>To Ship</th><th style={thStyle}>To Bill</th></tr>
        </thead>
        <tbody>
          {po.lines.map((l, i) => {
            const unit = (l.unit || "Nos").toUpperCase();
            const desc = [l.brand, l.spec].filter((s) => s && String(s).trim()).join(" - ");
            return (
              <tr key={l.lineId || i}>
                <td style={{ ...colCell, textAlign: "center", paddingTop: i === 0 ? 8 : 3 }}>{i + 1}</td>
                <td style={{ ...colCell, paddingTop: i === 0 ? 8 : 3 }}>
                  <div style={{ fontWeight: 800, textTransform: "uppercase" }}>{l.itemName}</div>
                  {desc && <div style={{ fontStyle: "italic", paddingLeft: 14, textTransform: "uppercase" }}>{desc}</div>}
                </td>
                <td style={{ ...colCell, fontStyle: "italic", whiteSpace: "nowrap", paddingTop: i === 0 ? 8 : 3 }}>{dueOn}</td>
                <td style={{ ...num, paddingTop: i === 0 ? 8 : 3 }}>{fmtQty(l.qty)} {unit}</td>
                <td style={{ ...num, fontWeight: 800, paddingTop: i === 0 ? 8 : 3 }}>{fmtQty(l.qty)} {unit}</td>
                <td style={{ ...num, paddingTop: i === 0 ? 8 : 3 }}>{fmtMoney(l.rate)}</td>
                <td style={{ ...colCell, textAlign: "center", paddingTop: i === 0 ? 8 : 3 }}>{unit}</td>
                <td style={colCell} />
                <td style={{ ...num, fontWeight: 800, paddingTop: i === 0 ? 8 : 3 }}>{fmtMoney(l.amount)}</td>
              </tr>
            );
          })}

          {/* summary rows sit in the Amount column, as on a Tally voucher */}
          {(t.discount > 0 || t.gstPct > 0 || t.roundOff !== 0) && (
            <tr>
              <td style={colCell} /><td style={colCell} /><td style={colCell} /><td style={colCell} /><td style={colCell} /><td style={colCell} /><td style={colCell} /><td style={colCell} />
              <td style={{ ...num, paddingTop: 10 }}>{fmtMoney(t.subtotal)}</td>
            </tr>
          )}
          {t.discount > 0 && (
            <SummaryRow left="Less :" text="DISCOUNT" amount={fmtSigned(-t.discount)} />
          )}
          {t.gstPct > 0 && t.gstType === "IGST" && (
            <SummaryRow text={`IGST INPUT @ ${fmtPct(t.gstPct)}%`} rate={`${fmtPct(t.gstPct)} %`} amount={fmtMoney(t.igst)} />
          )}
          {t.gstPct > 0 && t.gstType !== "IGST" && (
            <>
              <SummaryRow text={`SGST INPUT @ ${fmtPct(half)}%`} rate={`${fmtPct(half)} %`} amount={fmtMoney(t.sgst)} />
              <SummaryRow text={`CGST INPUT @ ${fmtPct(half)}%`} rate={`${fmtPct(half)} %`} amount={fmtMoney(t.cgst)} />
            </>
          )}
          {t.roundOff !== 0 && (
            <SummaryRow left={t.roundOff < 0 ? "Less :" : "Add :"} text="ROUND OFF" amount={fmtSigned(t.roundOff)} />
          )}
          {/* breathing room before the total, like the printed voucher */}
          <tr>
            <td style={{ ...colCell, height: spacer }} /><td style={colCell} /><td style={colCell} /><td style={colCell} /><td style={colCell} /><td style={colCell} /><td style={colCell} /><td style={colCell} /><td style={colCell} />
          </tr>
          <tr style={{ fontWeight: 800 }}>
            <td style={{ ...colCell, borderTop: B, borderBottom: B }} />
            <td style={{ ...colCell, borderTop: B, borderBottom: B, textAlign: "right", fontWeight: 400 }}>Total</td>
            <td style={{ ...colCell, borderTop: B, borderBottom: B }} />
            <td style={{ ...num, borderTop: B, borderBottom: B }}>{fmtQty(t.qtyTotal)} {unitLabel(po)}</td>
            <td style={{ ...num, borderTop: B, borderBottom: B }}>{fmtQty(t.qtyTotal)} {unitLabel(po)}</td>
            <td style={{ ...colCell, borderTop: B, borderBottom: B }} />
            <td style={{ ...colCell, borderTop: B, borderBottom: B }} />
            <td style={{ ...colCell, borderTop: B, borderBottom: B }} />
            <td style={{ ...num, borderTop: B, borderBottom: B, fontSize: 12.5 }}>₹ {fmtMoney(t.total)}</td>
          </tr>
        </tbody>
      </table>

      {/* amount in words */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: -1 }}>
        <tbody>
          <tr>
            <td style={{ ...box, borderTop: "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div>
                  <div style={label}>Amount Chargeable (in words)</div>
                  <div style={{ fontWeight: 800, fontSize: 11.5, marginTop: 2 }}>{amountInWords(t.total)}</div>
                </div>
                <div style={{ fontSize: 10, whiteSpace: "nowrap" }}>E. &amp; O.E</div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* authorised signatory, then the digital signature boxes: VP, President, Purchase Manager */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: -1, tableLayout: "fixed" }}>
        <tbody>
          <tr>
            <td colSpan={3} style={{ ...box, borderTop: "none", padding: 0 }}>
              <div style={{ display: "flex" }}>
                <div style={{ flex: 1, minHeight: 70 }} />
                <div style={{ flex: 1, borderLeft: B, padding: "6px 8px", textAlign: "right", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 70, boxSizing: "border-box" }}>
                  <div style={{ fontWeight: 700, fontSize: 10.5 }}>for {COMPANY.name}</div>
                  <div style={{ fontSize: 10.5 }}>Authorised Signatory</div>
                </div>
              </div>
            </td>
          </tr>
          <tr>
            {Object.keys(SIG_LABELS).map((key) => {
              const s = po.signatures?.[key];
              return (
                <td key={key} style={{ ...box, borderTop: "none", textAlign: "center", height: 62, verticalAlign: "top", padding: "6px 8px" }}>
                  <div style={{ fontSize: 9.5, color: "#666", textTransform: "uppercase", letterSpacing: 0.4 }}>{SIG_LABELS[key]}</div>
                  {s && (
                    <>
                      <div style={{ fontFamily: "'Segoe Script', 'Brush Script MT', cursive", fontSize: 15, color: C.navy, marginTop: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.by}</div>
                      <div style={{ fontSize: 9.5, color: "#555", marginTop: 2 }}>Signed {s.date}</div>
                    </>
                  )}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>

      <div style={{ textAlign: "center", fontSize: 10.5, marginTop: 6 }}>This is a Computer Generated Document</div>
    </div>
  );
}

function SummaryRow({ left, text, rate, amount }) {
  return (
    <tr>
      <td style={colCell} />
      <td style={colCell}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 10.5 }}>{left || ""}</span>
          <span style={{ fontStyle: "italic", fontWeight: 700 }}>{text}</span>
        </div>
      </td>
      <td style={colCell} /><td style={colCell} /><td style={colCell} />
      <td style={{ ...num, fontStyle: "italic" }}>{rate || ""}</td>
      <td style={colCell} /><td style={colCell} />
      <td style={{ ...num, fontWeight: 700 }}>{amount}</td>
    </tr>
  );
}

function fmtPct(n) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}
function unitLabel(po) {
  const units = new Set((po.lines || []).map((l) => (l.unit || "Nos").toUpperCase()));
  return units.size === 1 ? [...units][0] : "";
}

/* ================= ON-SCREEN WRAPPER: document + digital signatures + print ================= */
export default function POView({ po, signPO, role, isAdmin }) {
  const SigBlock = ({ roleKey, label: lbl, requiredRole }) => {
    const sig = po.signatures?.[roleKey];
    const canSign = (role === requiredRole || isAdmin) && !sig;
    return (
      <div style={{ flex: 1, border: `1px solid ${C.line}`, borderRadius: 8, padding: 10, textAlign: "center", minWidth: 150 }}>
        <div style={{ fontSize: 10.5, color: "#9AA1AC", textTransform: "uppercase" }}>{lbl}</div>
        {sig ? (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontFamily: "cursive", fontSize: 16, color: C.navy }}>{sig.by}</div>
            <div style={{ fontSize: 10.5, color: "#9AA1AC" }}>Signed {sig.date}</div>
          </div>
        ) : canSign ? (
          <button onClick={() => signPO(po.id, roleKey)} style={{ ...btnStyle(C.gold), marginTop: 8, fontSize: 11 }}>Sign as {lbl}</button>
        ) : (
          <div style={{ fontSize: 11, color: "#9AA1AC", marginTop: 8 }}>Awaiting {requiredRole}'s signature</div>
        )}
      </div>
    );
  };

  return (
    <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, padding: 20 }}>
      <style>{PRINT_CSS}</style>
      <div style={{ overflowX: "auto" }}>
        <PODocument po={po} />
      </div>

      <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.line}` }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>Digital signatures</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <SigBlock roleKey="vp" label="VP" requiredRole="VP" />
          <SigBlock roleKey="president" label="President" requiredRole="President" />
          <SigBlock roleKey="purchaseManager" label="Purchase Manager" requiredRole="Purchase Manager" />
        </div>
        <button onClick={() => window.print()} style={{ ...btnStyle(C.navy), marginTop: 14 }}>Print / Download PO</button>
      </div>

      {typeof document !== "undefined" && createPortal(
        <div className="po-print-only"><PODocument po={po} /></div>,
        document.body
      )}
    </div>
  );
}
