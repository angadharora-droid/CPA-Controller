import { useState, useMemo } from "react";
import { C, th, thR, pgBtn, cellInput, cardBase, inputStyle, toggleBtn, toggleActive, btnStyle } from "../../theme.js";
import { fmtINR, fmtNum } from "../../utils/format.js";
import { Badge, Field, ResultPanel } from "../ui.jsx";

/* ================= RAISE PR (Purchasing Guideline) ================= */
export default function RaisePRTab({ HEADS, frozenItemsForPR, submitPR, cardStyle, tolerancePct, role }) {
  const [mode, setMode] = useState("single"); // single | bulk | unlisted

  const MODES = [
    { id: "single", label: "Single Order" },
    { id: "bulk", label: "Bulk Order" },
    { id: "unlisted", label: "Unlisted Item" },
  ];

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {MODES.map((m) => (
          <button key={m.id} onClick={() => setMode(m.id)}
            style={{ ...toggleBtn, ...(mode === m.id ? toggleActive : {}), padding: "9px 18px", fontSize: 13 }}>
            {m.label}
          </button>
        ))}
      </div>
      {mode === "single" && <SingleOrderPanel {...{ HEADS, frozenItemsForPR, submitPR, cardStyle, tolerancePct, role }} />}
      {mode === "bulk" && <BulkOrderPanel {...{ HEADS, frozenItemsForPR, submitPR, cardStyle, tolerancePct, role }} />}
      {mode === "unlisted" && <UnlistedOrderPanel {...{ HEADS, submitPR, cardStyle, role }} />}
    </div>
  );
}

/* Shared item-picker table (used by Single and Bulk) */
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
        <span style={{ alignSelf: "center", fontSize: 12, color: "#9AA1AC" }}>{items.length} frozen item(s) available</span>
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
              <tr><td colSpan={8} style={{ padding: 20, textAlign: "center", color: "#9AA1AC" }}>No frozen items match.</td></tr>
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
function SingleOrderPanel({ HEADS, frozenItemsForPR, submitPR, cardStyle, tolerancePct, role }) {
  const [headFilter, setHeadFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState(null);

  const filtered = useMemo(() => {
    let list = frozenItemsForPR;
    if (headFilter !== "All") list = list.filter((it) => it.head === headFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((it) => it.name.toLowerCase().includes(q) || (it.sub || "").toLowerCase().includes(q));
    }
    return list;
  }, [frozenItemsForPR, headFilter, query]);

  const item = frozenItemsForPR.find((it) => it.id === selectedId);

  return (
    <div style={{ display: "grid", gridTemplateColumns: item ? "1.2fr 0.8fr" : "1fr", gap: 16 }}>
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
            <td style={{ padding: "8px 10px", textAlign: "right" }}>{fmtNum(it.qty - (it.committedQty || 0))}</td>
            <td style={{ padding: "8px 10px", textAlign: "right" }}>{fmtINR(it.rate)}</td>
          </tr>
        )}
      />
      {item && (
        <SingleOrderForm key={item.id} item={item} submitPR={submitPR} cardStyle={cardStyle} tolerancePct={tolerancePct} role={role} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}

function SingleOrderForm({ item, submitPR, cardStyle, tolerancePct, role, onClose }) {
  const [qty, setQty] = useState("");
  const [rate, setRate] = useState(item.rate);
  const [requestedBy, setRequestedBy] = useState("");
  const [dept, setDept] = useState("");
  const [justification, setJustification] = useState("");
  const [urgency, setUrgency] = useState("Normal");
  const [requiredBy, setRequiredBy] = useState("");
  const [specChanged, setSpecChanged] = useState(false);
  const [brandChanged, setBrandChanged] = useState(false);
  const [vendorDetails, setVendorDetails] = useState("");
  const [modelDetails, setModelDetails] = useState("");
  const [proposedBrand, setProposedBrand] = useState("");
  const [lastResult, setLastResult] = useState(null);

  const remainingQty = item.qty - (item.committedQty || 0);
  const maxRate = item.rate * (1 + tolerancePct / 100);

  function handleSubmit() {
    const pr = submitPR({
      itemId: item.id, requestedQty: qty, requestedRate: rate,
      requestedBy, dept, justification, urgency, requiredBy, specChanged, brandChanged,
      vendorDetails, modelDetails, proposedBrand,
    });
    setLastResult(pr);
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
          <div>Approved qty: <b>{fmtNum(item.qty)} {item.unit}</b> · Remaining balance: <b>{fmtNum(remainingQty)}</b></div>
          <div>Approved rate: <b>{fmtINR(item.rate)}</b> · Max under {tolerancePct}% tolerance: <b>{fmtINR(maxRate)}</b></div>
          <div>Committed so far: <b>{fmtINR(item.committedVal)}</b></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
          <Field label="Requested quantity"><input type="number" value={qty} onChange={(e) => setQty(e.target.value)} style={inputStyle} /></Field>
          <Field label="Proposed rate (₹)"><input type="number" value={rate} onChange={(e) => setRate(e.target.value)} style={inputStyle} /></Field>
          <Field label="Requested by"><input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} style={inputStyle} /></Field>
          <Field label="Department"><input value={dept} onChange={(e) => setDept(e.target.value)} style={inputStyle} /></Field>
          <Field label="Urgency">
            <select value={urgency} onChange={(e) => setUrgency(e.target.value)} style={inputStyle}>
              <option>Normal</option><option>High — opening critical</option><option>Low</option>
            </select>
          </Field>
          <Field label="Required-by date"><input type="date" value={requiredBy} onChange={(e) => setRequiredBy(e.target.value)} style={inputStyle} /></Field>
        </div>
        <Field label="Operational justification"><textarea value={justification} onChange={(e) => setJustification(e.target.value)} style={{ ...inputStyle, minHeight: 50 }} /></Field>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.4, margin: "10px 0 8px", paddingTop: 8, borderTop: `1px solid ${C.line}` }}>Vendor &amp; Item Detail</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Vendor / supplier"><input value={vendorDetails} onChange={(e) => setVendorDetails(e.target.value)} style={inputStyle} /></Field>
          <Field label="Proposed brand"><input value={proposedBrand} onChange={(e) => setProposedBrand(e.target.value)} style={inputStyle} /></Field>
        </div>
        <Field label="Model no. / specific item details"><textarea value={modelDetails} onChange={(e) => setModelDetails(e.target.value)} style={{ ...inputStyle, minHeight: 40 }} /></Field>
        <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
          <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={specChanged} onChange={(e) => setSpecChanged(e.target.checked)} /> Spec differs</label>
          <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={brandChanged} onChange={(e) => setBrandChanged(e.target.checked)} /> Brand differs</label>
        </div>
        <button onClick={handleSubmit} disabled={!qty || !rate} style={{ ...btnStyle(C.navy), opacity: (!qty || !rate) ? 0.5 : 1 }}>Submit Purchase Requisition</button>
      </div>
      {lastResult && <ResultPanel result={lastResult} cardStyle={cardStyle} />}
    </div>
  );
}

/* ---------- BULK ORDER ---------- */
function BulkOrderPanel({ HEADS, frozenItemsForPR, submitPR, cardStyle, tolerancePct, role }) {
  const [headFilter, setHeadFilter] = useState(HEADS[0].name);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState({}); // id -> {checked, qty, rate}
  const [requestedBy, setRequestedBy] = useState("");
  const [dept, setDept] = useState("");
  const [justification, setJustification] = useState("");
  const [urgency, setUrgency] = useState("Normal");
  const [requiredBy, setRequiredBy] = useState("");
  const [vendorDetails, setVendorDetails] = useState("");
  const [modelDetails, setModelDetails] = useState("");
  const [proposedBrand, setProposedBrand] = useState("");
  const [batchResults, setBatchResults] = useState(null);

  const items = useMemo(() => {
    let list = frozenItemsForPR.filter((it) => it.head === headFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((it) => it.name.toLowerCase().includes(q) || (it.sub || "").toLowerCase().includes(q));
    }
    return list;
  }, [frozenItemsForPR, headFilter, query]);

  function setRow(id, patch) {
    setRows((prev) => ({ ...prev, [id]: { checked: false, qty: "", rate: "", ...prev[id], ...patch } }));
  }
  const selectedIds = Object.keys(rows).filter((id) => rows[id]?.checked);
  const selectedCount = selectedIds.length;
  const readyCount = selectedIds.filter((id) => rows[id].qty && rows[id].rate).length;
  const allReady = selectedCount > 0 && readyCount === selectedCount;

  function handleSubmitBulk() {
    const results = selectedIds.map((id) => {
      return submitPR({
        itemId: id, requestedQty: rows[id].qty, requestedRate: rows[id].rate,
        requestedBy, dept, justification, urgency, requiredBy, vendorDetails, modelDetails, proposedBrand,
      });
    });
    setBatchResults(results);
    setRows({});
  }

  return (
    <div>
      <div style={{ ...cardStyle, marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Bulk order details (applied to every item in this batch)</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginTop: 8 }}>
          <Field label="Requested by"><input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} style={inputStyle} /></Field>
          <Field label="Department"><input value={dept} onChange={(e) => setDept(e.target.value)} style={inputStyle} /></Field>
          <Field label="Urgency">
            <select value={urgency} onChange={(e) => setUrgency(e.target.value)} style={inputStyle}>
              <option>Normal</option><option>High — opening critical</option><option>Low</option>
            </select>
          </Field>
          <Field label="Required-by date"><input type="date" value={requiredBy} onChange={(e) => setRequiredBy(e.target.value)} style={inputStyle} /></Field>
        </div>
        <Field label="Operational justification"><textarea value={justification} onChange={(e) => setJustification(e.target.value)} style={{ ...inputStyle, minHeight: 44 }} /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <Field label="Vendor / supplier"><input value={vendorDetails} onChange={(e) => setVendorDetails(e.target.value)} style={inputStyle} /></Field>
          <Field label="Proposed brand"><input value={proposedBrand} onChange={(e) => setProposedBrand(e.target.value)} style={inputStyle} /></Field>
          <Field label="Model no. / item details"><input value={modelDetails} onChange={(e) => setModelDetails(e.target.value)} style={inputStyle} /></Field>
        </div>
      </div>

      <ItemPickerTable
        items={items} headFilter={headFilter} setHeadFilter={(v) => { setHeadFilter(v); setPage(1); }}
        HEADS={HEADS} showHeadFilter query={query} setQuery={(v) => { setQuery(v); setPage(1); }}
        page={page} setPage={setPage} pageSize={12}
        extraHeaderCols={<th style={th}><input type="checkbox" onChange={(e) => {
          const checked = e.target.checked;
          const patch = {};
          items.slice((page - 1) * 12, page * 12).forEach((it) => { patch[it.id] = { ...(rows[it.id] || {}), checked }; });
          setRows((prev) => ({ ...prev, ...patch }));
        }} /></th>}
        renderRow={(it) => {
          const row = rows[it.id] || { checked: false, qty: "", rate: "" };
          return (
            <tr key={it.id} style={{ borderTop: "1px solid #F0EFEA", background: row.checked ? "#FFFBF0" : "transparent" }}>
              <td style={{ padding: "6px 10px" }}><input type="checkbox" checked={row.checked} onChange={(e) => setRow(it.id, { checked: e.target.checked })} /></td>
              <td style={{ padding: "6px 10px", fontWeight: 600 }}>{it.name}</td>
              <td style={{ padding: "6px 10px", color: "#6B7280" }}>{it.head}{it.sub ? ` · ${it.sub}` : ""}</td>
              <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtNum(it.qty)} {it.unit}</td>
              <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtNum(it.qty - (it.committedQty || 0))}</td>
              <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtINR(it.rate)}</td>
              <td style={{ padding: "6px 6px" }}>
                <input type="number" placeholder="Qty" disabled={!row.checked} value={row.qty} onChange={(e) => setRow(it.id, { qty: e.target.value })} style={{ ...cellInput, width: 70, background: row.checked ? "#fff" : "#F5F5F3" }} />
              </td>
              <td style={{ padding: "6px 6px" }}>
                <input type="number" placeholder="Rate" disabled={!row.checked} value={row.rate} onChange={(e) => setRow(it.id, { rate: e.target.value })} style={{ ...cellInput, width: 80, background: row.checked ? "#fff" : "#F5F5F3" }} />
              </td>
            </tr>
          );
        }}
      >
        <th style={thR}>Req. Qty</th>
        <th style={thR}>Req. Rate</th>
      </ItemPickerTable>

      <div style={{ ...cardStyle, marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 12.5, color: "#6B7280" }}>
          {selectedCount === 0 ? "No items selected." : `${selectedCount} item(s) selected — ${readyCount} have qty & rate filled in.`}
        </div>
        <button onClick={handleSubmitBulk} disabled={!allReady} style={{ ...btnStyle(C.navy), opacity: allReady ? 1 : 0.5 }}>
          Submit Bulk Order ({selectedCount})
        </button>
      </div>

      {batchResults && (
        <div style={{ ...cardStyle, marginTop: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>
            Batch result: {batchResults.filter((r) => r.autoApproved).length} auto-approved, {batchResults.filter((r) => !r.autoApproved).length} escalated to President
          </div>
          {batchResults.map((r) => (
            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid #F0EFEA", fontSize: 12.5 }}>
              <div>{r.itemName} <span style={{ color: "#9AA1AC" }}>({fmtNum(r.requestedQty)} @ {fmtINR(r.requestedRate)})</span></div>
              <Badge bg={r.autoApproved ? "#E9F6EF" : "#FCEAEA"} fg={r.autoApproved ? C.green : C.red}>{r.autoApproved ? "AUTO-APPROVED" : r.reasonCode}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- UNLISTED ITEM ---------- */
function UnlistedOrderPanel({ HEADS, submitPR, cardStyle, role }) {
  const [unbudgetedName, setUnbudgetedName] = useState("");
  const [unbudgetedHead, setUnbudgetedHead] = useState("");
  const [qty, setQty] = useState("");
  const [rate, setRate] = useState("");
  const [requestedBy, setRequestedBy] = useState("");
  const [dept, setDept] = useState("");
  const [justification, setJustification] = useState("");
  const [urgency, setUrgency] = useState("Normal");
  const [requiredBy, setRequiredBy] = useState("");
  const [vendorDetails, setVendorDetails] = useState("");
  const [modelDetails, setModelDetails] = useState("");
  const [proposedBrand, setProposedBrand] = useState("");
  const [lastResult, setLastResult] = useState(null);

  function handleSubmit() {
    const pr = submitPR({
      itemId: null, requestedQty: qty, requestedRate: rate, requestedBy, dept, justification, urgency, requiredBy,
      unbudgetedName, unbudgetedHead, vendorDetails, modelDetails, proposedBrand,
    });
    setLastResult(pr);
  }

  const disabled = !unbudgetedName || !unbudgetedHead || !qty || !rate;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 16 }}>
      <div style={{ ...cardStyle }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Raise a requisition for an item not in the frozen list</div>
        <div style={{ fontSize: 12.5, color: "#9AA1AC", marginBottom: 14 }}>This will always be escalated to the President — an unlisted item can never auto-approve.</div>
        <Field label="Item name"><input value={unbudgetedName} onChange={(e) => setUnbudgetedName(e.target.value)} style={inputStyle} placeholder="e.g. Extra buffet chafing dish set" /></Field>
        <Field label="Budget head to charge (required)">
          <select value={unbudgetedHead} onChange={(e) => setUnbudgetedHead(e.target.value)} style={inputStyle}>
            <option value="">— select the budget head this will draw from —</option>
            {HEADS.map((h) => <option key={h.name} value={h.name}>{h.name}</option>)}
          </select>
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Requested quantity"><input type="number" value={qty} onChange={(e) => setQty(e.target.value)} style={inputStyle} /></Field>
          <Field label="Proposed rate (₹)"><input type="number" value={rate} onChange={(e) => setRate(e.target.value)} style={inputStyle} /></Field>
          <Field label="Requested by"><input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} style={inputStyle} /></Field>
          <Field label="Department"><input value={dept} onChange={(e) => setDept(e.target.value)} style={inputStyle} /></Field>
          <Field label="Urgency">
            <select value={urgency} onChange={(e) => setUrgency(e.target.value)} style={inputStyle}>
              <option>Normal</option><option>High — opening critical</option><option>Low</option>
            </select>
          </Field>
          <Field label="Required-by date"><input type="date" value={requiredBy} onChange={(e) => setRequiredBy(e.target.value)} style={inputStyle} /></Field>
        </div>
        <Field label="Operational justification"><textarea value={justification} onChange={(e) => setJustification(e.target.value)} style={{ ...inputStyle, minHeight: 50 }} /></Field>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.4, margin: "10px 0 8px", paddingTop: 8, borderTop: `1px solid ${C.line}` }}>Vendor &amp; Item Detail</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Vendor / supplier"><input value={vendorDetails} onChange={(e) => setVendorDetails(e.target.value)} style={inputStyle} /></Field>
          <Field label="Proposed brand"><input value={proposedBrand} onChange={(e) => setProposedBrand(e.target.value)} style={inputStyle} /></Field>
        </div>
        <Field label="Model no. / specific item details"><textarea value={modelDetails} onChange={(e) => setModelDetails(e.target.value)} style={{ ...inputStyle, minHeight: 40 }} /></Field>
        <button onClick={handleSubmit} disabled={disabled} style={{ ...btnStyle(C.navy), opacity: disabled ? 0.5 : 1 }}>Submit Purchase Requisition</button>
      </div>
      {lastResult && <ResultPanel result={lastResult} cardStyle={cardStyle} />}
    </div>
  );
}
