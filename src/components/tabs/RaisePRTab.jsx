import { useState, useMemo } from "react";
import { C, th, thR, pgBtn, cellInput, cardBase, inputStyle, toggleBtn, toggleActive, btnStyle } from "../../theme.js";
import { fmtINR, fmtNum } from "../../utils/format.js";
import { Field, PRResultPanel } from "../ui.jsx";

const URGENCIES = ["Normal", "High — opening critical", "Low"];

/* What is left of an item's approved quantity once the requisitions already approved (committed) and
   those still waiting on the VP are taken off. */
function balanceLeft(item, pendingQtyByItem) {
  return (item.qty || 0) - (item.committedQty || 0) - (pendingQtyByItem[item.id] || 0);
}

/* What can still be requisitioned. An item that is already over its approved quantity has nothing
   left, so it reads 0 — never a minus and never "Over by"; the VP's Desk is where over-quantity shows. */
function BalanceText({ left }) {
  return fmtNum(Math.max(0, left));
}

function BalanceCell({ item, pendingQtyByItem, padding }) {
  const pending = pendingQtyByItem[item.id] || 0;
  return (
    <td style={{ padding, textAlign: "right" }}>
      <BalanceText left={balanceLeft(item, pendingQtyByItem)} />
      {pending > 0 && <div style={{ fontSize: 10.5, color: "#9AA1AC", whiteSpace: "nowrap" }}>{fmtNum(pending)} awaiting approval</div>}
    </td>
  );
}

/* ================= RAISE PR (bundled, sequentially numbered) ================= */
export default function RaisePRTab({ HEADS, approvedItemsForPR, pendingQtyByItem = {}, submitBundledPR, cardStyle, currentUser, readOnly }) {
  const [mode, setMode] = useState("single");
  const MODES = [
    { id: "single", label: "Single Order" },
    { id: "bulk", label: "Bulk Order" },
    { id: "unlisted", label: "Unlisted Item" },
  ];
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {MODES.map((m) => (
          <button key={m.id} onClick={() => setMode(m.id)} style={{ ...toggleBtn, ...(mode === m.id ? toggleActive : {}), padding: "9px 18px", fontSize: 13 }}>{m.label}</button>
        ))}
      </div>
      {mode === "single" && <SingleOrderPanel {...{ HEADS, approvedItemsForPR, pendingQtyByItem, submitBundledPR, cardStyle, currentUser, readOnly }} />}
      {mode === "bulk" && <BulkOrderPanel {...{ HEADS, approvedItemsForPR, pendingQtyByItem, submitBundledPR, cardStyle, currentUser, readOnly }} />}
      {mode === "unlisted" && <UnlistedOrderPanel {...{ HEADS, submitBundledPR, cardStyle, currentUser, readOnly }} />}
    </div>
  );
}

function RequesterFields({ requestedBy, setRequestedBy, dept, setDept, urgency, setUrgency, requiredBy, setRequiredBy }) {
  return (
    <>
      <Field label="Requested by"><input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} style={inputStyle} /></Field>
      <Field label="Department"><input value={dept} onChange={(e) => setDept(e.target.value)} style={inputStyle} /></Field>
      <Field label="Urgency">
        <select value={urgency} onChange={(e) => setUrgency(e.target.value)} style={inputStyle}>
          {URGENCIES.map((u) => <option key={u}>{u}</option>)}
        </select>
      </Field>
      <Field label="Required-by date"><input type="date" value={requiredBy} onChange={(e) => setRequiredBy(e.target.value)} style={inputStyle} /></Field>
    </>
  );
}

function ItemPickerTable({ items, headFilter, setHeadFilter, HEADS, showHeadFilter, query, setQuery, page, setPage, pageSize, children, extraHeaderCols, renderRow }) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const pageItems = items.slice((page - 1) * pageSize, page * pageSize);
  return (
    <div style={{ ...cardBase, padding: 0, overflow: "hidden" }}>
      <div style={{ padding: 12, borderBottom: `1px solid ${C.line}`, display: "flex", gap: 10, flexWrap: "wrap" }}>
        {showHeadFilter && (
          <select value={headFilter} onChange={(e) => setHeadFilter(e.target.value)} style={{ padding: "8px 10px", border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 13, minWidth: 200 }}>
            {HEADS.map((h) => <option key={h.name} value={h.name}>{h.name}</option>)}
          </select>
        )}
        <input placeholder="Search items…" value={query} onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1, minWidth: 160, padding: "8px 10px", border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 13 }} />
        <span style={{ alignSelf: "center", fontSize: 12, color: "#9AA1AC" }}>{items.length} approved item(s) available</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#6B7280", fontSize: 10.5, textTransform: "uppercase", background: "#FAFAF8" }}>
              {extraHeaderCols}
              <th style={th}>Item</th>
              <th style={th}>Head / Sub-category</th>
              <th style={thR}>Approved Qty</th>
              <th style={thR}>Balance</th>
              <th style={thR}>Rate</th>
              {children}
            </tr>
          </thead>
          <tbody>
            {pageItems.map((it) => renderRow(it))}
            {pageItems.length === 0 && (
              <tr><td colSpan={10} style={{ padding: 20, textAlign: "center", color: "#9AA1AC" }}>No approved items match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div style={{ padding: 10, display: "flex", justifyContent: "center", gap: 8, borderTop: `1px solid ${C.line}` }}>
        <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} style={pgBtn}>Prev</button>
        <span style={{ fontSize: 12, color: "#6B7280", alignSelf: "center" }}>Page {page} of {totalPages}</span>
        <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} style={pgBtn}>Next</button>
      </div>
    </div>
  );
}

/* ---------- SINGLE ORDER ---------- */
function SingleOrderPanel({ HEADS, approvedItemsForPR, pendingQtyByItem, submitBundledPR, cardStyle, currentUser, readOnly }) {
  const [headFilter, setHeadFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState(null);

  const filtered = useMemo(() => {
    let list = approvedItemsForPR;
    if (headFilter !== "All") list = list.filter((it) => it.head === headFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((it) => it.name.toLowerCase().includes(q) || (it.sub || "").toLowerCase().includes(q));
    }
    return list;
  }, [approvedItemsForPR, headFilter, query]);

  const item = approvedItemsForPR.find((it) => it.id === selectedId);

  return (
    <div style={{ display: "grid", gridTemplateColumns: item ? "minmax(0,1.2fr) minmax(0,0.8fr)" : "1fr", gap: 16 }}>
      <ItemPickerTable
        items={filtered} headFilter={headFilter} setHeadFilter={(v) => { setHeadFilter(v); setPage(1); }}
        HEADS={[{ name: "All" }, ...HEADS]} showHeadFilter query={query} setQuery={(v) => { setQuery(v); setPage(1); }}
        page={page} setPage={setPage} pageSize={12}
        renderRow={(it) => (
          <tr key={it.id} onClick={() => setSelectedId(it.id)}
            style={{ borderTop: "1px solid #F0EFEA", cursor: "pointer", background: selectedId === it.id ? "#FFFBF0" : "transparent" }}>
            <td style={{ padding: "8px 10px", fontWeight: 600 }}>{it.name}</td>
            <td style={{ padding: "8px 10px", color: "#6B7280" }}>{it.head}{it.sub ? ` · ${it.sub}` : ""}</td>
            <td style={{ padding: "8px 10px", textAlign: "right" }}>{fmtNum(it.qty)} {it.unit}</td>
            <BalanceCell item={it} pendingQtyByItem={pendingQtyByItem} padding="8px 10px" />
            <td style={{ padding: "8px 10px", textAlign: "right" }}>{fmtINR(it.rate)}</td>
          </tr>
        )}
      />
      {item && <SingleOrderForm key={item.id} item={item} pendingQty={pendingQtyByItem[item.id] || 0} submitBundledPR={submitBundledPR} cardStyle={cardStyle} currentUser={currentUser} readOnly={readOnly} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

function SingleOrderForm({ item, pendingQty, submitBundledPR, cardStyle, currentUser, readOnly, onClose }) {
  const [qty, setQty] = useState("");
  const [rate, setRate] = useState(item.rate);
  const [proposedBrand, setProposedBrand] = useState(item.brand || "");
  const [proposedModel, setProposedModel] = useState(item.spec || "");
  const [requestedBy, setRequestedBy] = useState(currentUser?.name || "");
  const [dept, setDept] = useState("");
  const [urgency, setUrgency] = useState("Normal");
  const [requiredBy, setRequiredBy] = useState("");
  const [vendorDetails, setVendorDetails] = useState("");
  const [result, setResult] = useState(null);

  const remainingQty = (item.qty || 0) - (item.committedQty || 0) - pendingQty;
  const overBy = Number(qty) - Math.max(0, remainingQty);

  function handleSubmit() {
    const pr = submitBundledPR({
      lines: [{ itemId: item.id, requestedQty: qty, requestedRate: rate, proposedBrand, proposedModel, vendorDetails }],
      raisedBy: requestedBy, dept, urgency, requiredBy,
    });
    setResult(pr);
    // like the bulk order: clear the quantity so a second click cannot raise the same requisition again
    setQty("");
  }

  return (
    <div>
      <div style={{ ...cardStyle, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontWeight: 700 }}>{item.name}</div>
            <div style={{ fontSize: 12, color: "#9AA1AC" }}>{item.head}{item.sub ? ` · ${item.sub}` : ""}</div>
          </div>
          <button onClick={onClose} style={{ ...pgBtn, padding: "3px 10px" }}>✕</button>
        </div>
        <div style={{ background: "#FAFAF8", border: `1px solid ${C.line}`, borderRadius: 8, padding: 10, marginTop: 10, fontSize: 12.5 }}>
          <div>Approved qty: <b>{fmtNum(item.qty)} {item.unit}</b> · Remaining balance: <b><BalanceText left={remainingQty} /></b></div>
          {((item.committedQty || 0) > 0 || pendingQty > 0) && <div style={{ color: "#6B7280" }}>Already approved: <b>{fmtNum(item.committedQty || 0)}</b> · Awaiting approval: <b>{fmtNum(pendingQty)}</b></div>}
          <div>Approved rate: <b>{fmtINR(item.rate)}</b> · Approved brand: <b>{item.brand || "Not specified"}</b></div>
          <div>Approved model/specs: <b>{item.spec || "Not specified"}</b></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
          <Field label="Requested quantity"><input type="number" value={qty} onChange={(e) => setQty(e.target.value)} style={inputStyle} /></Field>
          <Field label="Proposed rate (₹)"><input type="number" value={rate} onChange={(e) => setRate(e.target.value)} style={inputStyle} /></Field>
          <Field label="Proposed brand"><input value={proposedBrand} onChange={(e) => setProposedBrand(e.target.value)} style={inputStyle} /></Field>
          <Field label="Model / Specs"><input value={proposedModel} onChange={(e) => setProposedModel(e.target.value)} style={inputStyle} /></Field>
          <RequesterFields {...{ requestedBy, setRequestedBy, dept, setDept, urgency, setUrgency, requiredBy, setRequiredBy }} />
        </div>
        <Field label="Vendor / supplier (optional)"><input value={vendorDetails} onChange={(e) => setVendorDetails(e.target.value)} style={inputStyle} /></Field>
        {Number(qty) > 0 && overBy > 0 && (
          <div style={{ background: "#FCEAEA", color: C.red, borderRadius: 7, padding: "7px 10px", fontSize: 12, fontWeight: 600, marginBottom: 10 }}>
            This is {fmtNum(overBy)} {item.unit} more than the remaining balance. You can still submit it, but it will go to the VP's Exception Desk.
          </div>
        )}
        <button onClick={handleSubmit} disabled={readOnly || !qty || !rate} style={{ ...btnStyle(C.navy), opacity: (readOnly || !qty || !rate) ? 0.5 : 1 }}>Submit Purchase Requisition</button>
      </div>
      {result && <PRResultPanel pr={result} cardStyle={cardStyle} />}
    </div>
  );
}

/* ---------- BULK ORDER ---------- */
function BulkOrderPanel({ HEADS, approvedItemsForPR, pendingQtyByItem, submitBundledPR, cardStyle, currentUser, readOnly }) {
  const PAGE_SIZE = 10;
  const [headFilter, setHeadFilter] = useState(HEADS[0].name);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState({});
  const [requestedBy, setRequestedBy] = useState(currentUser?.name || "");
  const [dept, setDept] = useState("");
  const [urgency, setUrgency] = useState("Normal");
  const [requiredBy, setRequiredBy] = useState("");
  const [vendorDetails, setVendorDetails] = useState("");
  const [result, setResult] = useState(null);

  const items = useMemo(() => {
    let list = approvedItemsForPR.filter((it) => it.head === headFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((it) => it.name.toLowerCase().includes(q) || (it.sub || "").toLowerCase().includes(q));
    }
    return list;
  }, [approvedItemsForPR, headFilter, query]);

  function blankRow(item) {
    return { checked: false, qty: "", rate: item ? item.rate : "", brand: item ? (item.brand || "") : "", model: item ? (item.spec || "") : "" };
  }
  function setRow(id, patch, item) {
    setRows((prev) => ({ ...prev, [id]: { ...blankRow(item), ...prev[id], ...patch } }));
  }
  const selectedIds = Object.keys(rows).filter((id) => rows[id]?.checked);
  const readyCount = selectedIds.filter((id) => rows[id].qty && rows[id].rate).length;
  const allReady = !readOnly && selectedIds.length > 0 && readyCount === selectedIds.length;

  function handleSubmitBulk() {
    const lines = selectedIds.map((id) => ({
      itemId: id, requestedQty: rows[id].qty, requestedRate: rows[id].rate, proposedBrand: rows[id].brand, proposedModel: rows[id].model, vendorDetails,
    }));
    const pr = submitBundledPR({ lines, raisedBy: requestedBy, dept, urgency, requiredBy });
    setResult(pr);
    setRows({});
  }

  const pageItems = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const allPageChecked = pageItems.length > 0 && pageItems.every((it) => rows[it.id]?.checked);

  return (
    <div>
      <div style={{ ...cardStyle, marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Bulk order details (applied to the whole bundled PR)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginTop: 8 }}>
          <RequesterFields {...{ requestedBy, setRequestedBy, dept, setDept, urgency, setUrgency, requiredBy, setRequiredBy }} />
        </div>
        <Field label="Vendor / supplier (optional)"><input value={vendorDetails} onChange={(e) => setVendorDetails(e.target.value)} style={inputStyle} /></Field>
      </div>

      <ItemPickerTable
        items={items} headFilter={headFilter} setHeadFilter={(v) => { setHeadFilter(v); setPage(1); }}
        HEADS={HEADS} showHeadFilter query={query} setQuery={(v) => { setQuery(v); setPage(1); }}
        page={page} setPage={setPage} pageSize={PAGE_SIZE}
        extraHeaderCols={<th style={th}><input type="checkbox" checked={allPageChecked} onChange={(e) => {
          const checked = e.target.checked;
          const patch = {};
          pageItems.forEach((it) => { patch[it.id] = { ...blankRow(it), ...(rows[it.id] || {}), checked }; });
          setRows((prev) => ({ ...prev, ...patch }));
        }} /></th>}
        renderRow={(it) => {
          const row = rows[it.id] || blankRow(it);
          const bg = row.checked ? "#fff" : "#F5F5F3";
          // more than the balance is allowed, but it sends the line to the VP's Exception Desk
          const over = row.checked && Number(row.qty) > Math.max(0, balanceLeft(it, pendingQtyByItem));
          return (
            <tr key={it.id} style={{ borderTop: "1px solid #F0EFEA", background: row.checked ? "#FFFBF0" : "transparent" }}>
              <td style={{ padding: "6px 10px" }}><input type="checkbox" checked={row.checked} onChange={(e) => setRow(it.id, { checked: e.target.checked }, it)} /></td>
              <td style={{ padding: "6px 10px", fontWeight: 600 }}>{it.name}</td>
              <td style={{ padding: "6px 10px", color: "#6B7280" }}>{it.head}{it.sub ? ` · ${it.sub}` : ""}</td>
              <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtNum(it.qty)} {it.unit}</td>
              <BalanceCell item={it} pendingQtyByItem={pendingQtyByItem} padding="6px 10px" />
              <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtINR(it.rate)}</td>
              <td style={{ padding: "6px 6px" }}><input type="number" placeholder="Qty" disabled={!row.checked} value={row.qty} onChange={(e) => setRow(it.id, { qty: e.target.value }, it)} title={over ? "More than the remaining balance — this line will go to the VP's Exception Desk" : undefined} style={{ ...cellInput, width: 60, background: bg, ...(over ? { borderColor: C.red, color: C.red, fontWeight: 700 } : {}) }} /></td>
              <td style={{ padding: "6px 6px" }}><input type="number" placeholder="Rate" disabled={!row.checked} value={row.rate} onChange={(e) => setRow(it.id, { rate: e.target.value }, it)} style={{ ...cellInput, width: 70, background: bg }} /></td>
              <td style={{ padding: "6px 6px" }}><input placeholder="Brand" disabled={!row.checked} value={row.brand} onChange={(e) => setRow(it.id, { brand: e.target.value }, it)} style={{ ...cellInput, width: 80, textAlign: "left", background: bg }} /></td>
              <td style={{ padding: "6px 6px" }}><input placeholder="Model/Specs" disabled={!row.checked} value={row.model} onChange={(e) => setRow(it.id, { model: e.target.value }, it)} style={{ ...cellInput, width: 100, textAlign: "left", background: bg }} /></td>
            </tr>
          );
        }}
      >
        <th style={thR}>Req. Qty</th>
        <th style={thR}>Req. Rate</th>
        <th style={th}>Brand</th>
        <th style={th}>Model/Specs</th>
      </ItemPickerTable>

      <div style={{ ...cardStyle, marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 12.5, color: "#6B7280" }}>
          {selectedIds.length === 0 ? "No items selected." : `${selectedIds.length} item(s) selected — ${readyCount} have qty & rate filled in.`}
        </div>
        <button onClick={handleSubmitBulk} disabled={!allReady} style={{ ...btnStyle(C.navy), opacity: allReady ? 1 : 0.5 }}>Submit Bulk Order as One PR ({selectedIds.length})</button>
      </div>

      {result && <PRResultPanel pr={result} cardStyle={cardStyle} />}
    </div>
  );
}

/* ---------- UNLISTED ITEM ---------- */
function UnlistedOrderPanel({ HEADS, submitBundledPR, cardStyle, currentUser, readOnly }) {
  const [unbudgetedName, setUnbudgetedName] = useState("");
  const [unbudgetedHead, setUnbudgetedHead] = useState("");
  const [qty, setQty] = useState("");
  const [rate, setRate] = useState("");
  const [proposedBrand, setProposedBrand] = useState("");
  const [proposedModel, setProposedModel] = useState("");
  const [requestedBy, setRequestedBy] = useState(currentUser?.name || "");
  const [dept, setDept] = useState("");
  const [urgency, setUrgency] = useState("Normal");
  const [requiredBy, setRequiredBy] = useState("");
  const [vendorDetails, setVendorDetails] = useState("");
  const [result, setResult] = useState(null);

  function handleSubmit() {
    const pr = submitBundledPR({
      lines: [{ itemId: null, unbudgetedName, unbudgetedHead, requestedQty: qty, requestedRate: rate, proposedBrand, proposedModel, vendorDetails }],
      raisedBy: requestedBy, dept, urgency, requiredBy,
    });
    setResult(pr);
    // clear the item so a second click cannot raise the same requisition again
    setUnbudgetedName(""); setQty(""); setRate("");
  }
  const disabled = readOnly || !unbudgetedName || !unbudgetedHead || !qty || !rate;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(0,0.8fr)", gap: 16 }}>
      <div style={{ ...cardStyle }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Raise a requisition for an item not in the approved list</div>
        <div style={{ fontSize: 12.5, color: "#9AA1AC", marginBottom: 14 }}>Unlisted items always land on the VP's Exception Desk and always require the President's second approval.</div>
        <Field label="Item name"><input value={unbudgetedName} onChange={(e) => setUnbudgetedName(e.target.value)} style={inputStyle} /></Field>
        <Field label="Budget head to charge (required)">
          <select value={unbudgetedHead} onChange={(e) => setUnbudgetedHead(e.target.value)} style={inputStyle}>
            <option value="">— select —</option>
            {HEADS.map((h) => <option key={h.name} value={h.name}>{h.name}</option>)}
          </select>
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Requested quantity"><input type="number" value={qty} onChange={(e) => setQty(e.target.value)} style={inputStyle} /></Field>
          <Field label="Proposed rate (₹)"><input type="number" value={rate} onChange={(e) => setRate(e.target.value)} style={inputStyle} /></Field>
          <Field label="Proposed brand"><input value={proposedBrand} onChange={(e) => setProposedBrand(e.target.value)} style={inputStyle} /></Field>
          <Field label="Model / Specs"><input value={proposedModel} onChange={(e) => setProposedModel(e.target.value)} style={inputStyle} /></Field>
          <RequesterFields {...{ requestedBy, setRequestedBy, dept, setDept, urgency, setUrgency, requiredBy, setRequiredBy }} />
        </div>
        <Field label="Vendor / supplier (optional)"><input value={vendorDetails} onChange={(e) => setVendorDetails(e.target.value)} style={inputStyle} /></Field>
        <button onClick={handleSubmit} disabled={disabled} style={{ ...btnStyle(C.navy), opacity: disabled ? 0.5 : 1 }}>Submit Purchase Requisition</button>
      </div>
      {result && <PRResultPanel pr={result} cardStyle={cardStyle} />}
    </div>
  );
}
