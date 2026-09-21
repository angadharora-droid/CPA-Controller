import React, { useState, useMemo } from "react";
import { C, STATUS_COLORS, APPROVAL_STATES, th, thR, pgBtn, cellInput, btnStyle } from "../../theme.js";
import { fmtINR, fmtNum } from "../../utils/format.js";
import { Badge, ReconIndicator, MiniStat } from "../ui.jsx";

/* ================= BUDGET REVIEW & FREEZE ================= */
export default function FreezeTab({ HEADS, headFreeze, freezeHead, selectedHead, setSelectedHead, filteredItems, deletedItemsForHead, updateItem, setItemApproval, updateItemBrand, query, setQuery, subCategoryFilter, setSubCategoryFilter, subCategoryOptions, cardStyle, reconColor, headItemTotal, headIncomplete, headCommitted, tolerancePct, setTolerancePct, secondApprovalPct, setSecondApprovalPct, setHeadCeiling, deleteItems, restoreItem, moveItemsToHead, renameItemName, renameCategoryBulk, role, isAdmin, readOnly }) {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(() => new Set());
  const [showDeleted, setShowDeleted] = useState(false);
  const [moveTarget, setMoveTarget] = useState("");
  const [categoryInput, setCategoryInput] = useState("");
  const PAGE_SIZE = 25;
  const head = HEADS.find((h) => h.name === selectedHead);
  const pageItems = filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const frozen = (headFreeze[selectedHead] || "Not Frozen") !== "Not Frozen";
  const canFreeze = role === "President" || isAdmin;
  // a view-only login sees every row exactly as it reads once frozen: plain values, no inputs
  const locked = frozen || readOnly;
  const color = reconColor(selectedHead);
  const dupes = useMemo(() => {
    const counts = {};
    filteredItems.forEach((it) => { counts[it.name.toLowerCase()] = (counts[it.name.toLowerCase()] || 0) + 1; });
    return Object.keys(counts).filter((k) => counts[k] > 1);
  }, [filteredItems]);

  React.useEffect(() => { setPage(1); }, [subCategoryFilter, query, selectedHead]);

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleSelectAllPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = pageItems.every((it) => next.has(it.id));
      pageItems.forEach((it) => { if (allSelected) next.delete(it.id); else next.add(it.id); });
      return next;
    });
  }
  const selectedIds = [...selected];
  function clearSelection() { setSelected(new Set()); }
  function handleBulkDelete() {
    deleteItems(selectedIds);
    clearSelection();
  }
  function handleBulkMove() {
    if (!moveTarget) return;
    moveItemsToHead(selectedIds, moveTarget);
    clearSelection();
    setMoveTarget("");
  }
  function handleBulkRenameCategory() {
    if (!categoryInput.trim()) return;
    renameCategoryBulk(selectedIds, categoryInput.trim());
    clearSelection();
    setCategoryInput("");
  }

  const dotColor = { green: "#1E8E5A", amber: "#B9760A", red: "#B3261E", grey: "#9AA1AC" };

  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      {/* sidebar */}
      <div style={{ width: 260, flexShrink: 0 }}>
        <div style={{ ...cardStyle, padding: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", padding: "4px 8px", textTransform: "uppercase" }}>Budget Heads</div>
          {HEADS.map((h) => (
            <div key={h.name} onClick={() => { setSelectedHead(h.name); setPage(1); }}
              style={{
                padding: "9px 10px", borderRadius: 8, cursor: "pointer", marginBottom: 2,
                background: h.name === selectedHead ? "#0B1E36" : "transparent",
                color: h.name === selectedHead ? "#fff" : C.text,
              }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{h.name}</span>
                <span style={{ width: 7, height: 7, borderRadius: 99, flexShrink: 0, background: dotColor[reconColor(h.name)] }} />
              </div>
              <div style={{ fontSize: 11, color: h.name === selectedHead ? "#C7D0DE" : "#9AA1AC" }}>{fmtINR(h.ceil)} ceiling</div>
            </div>
          ))}
        </div>
        <div style={{ ...cardStyle, marginTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", marginBottom: 8 }}>Admin Settings</div>
          <label style={{ fontSize: 12.5 }}>Good-to-Approve rate tolerance</label>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, marginBottom: 10 }}>
            <input type="number" value={tolerancePct} disabled={readOnly} onChange={(e) => setTolerancePct(Number(e.target.value))} style={{ width: 60, padding: "5px 7px", border: `1px solid ${C.line}`, borderRadius: 6 }} />
            <span style={{ fontSize: 13 }}>%</span>
          </div>
          <label style={{ fontSize: 12.5 }}>President's 2nd-approval threshold</label>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <input type="number" value={secondApprovalPct} disabled={readOnly} onChange={(e) => setSecondApprovalPct(Number(e.target.value))} style={{ width: 60, padding: "5px 7px", border: `1px solid ${C.line}`, borderRadius: 6 }} />
            <span style={{ fontSize: 13 }}>%</span>
          </div>
        </div>
      </div>

      {/* main */}
      <div style={{ flex: 1, minWidth: 320 }}>
        <div style={{ background: "#EAF0FB", border: `1px solid #C7D6EF`, borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: "#2E5FA3" }}>
          {readOnly ? "View-only access — browse every budget head and its items. Nothing on this screen can be edited or frozen from this login." : isAdmin ? "You have full administrative access — edit items freely and freeze heads directly. Freezing a head locks it for departments to requisition against." : role === "VP" ? "You're preparing this submission for the President to freeze — edit items freely, then hand off." : "You're reviewing the VP's submission. Freezing a head locks it for departments to requisition against."}
        </div>
        <div style={{ ...cardStyle, marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700 }}>{selectedHead}</div>
              <div style={{ fontSize: 12.5, color: "#9AA1AC" }}>{head.dept} · {filteredItems.length} line item(s) in this head</div>
            </div>
            <ReconIndicator color={color} label={color === "green" ? "Item total ≤ ceiling" : color === "amber" ? "Item list incomplete" : color === "red" ? "Item total exceeds ceiling" : "Not yet frozen"} />
          </div>
          <div style={{ display: "flex", gap: 22, marginTop: 14, flexWrap: "wrap" }}>
            {locked ? (
              <MiniStat label="Ceiling" value={fmtINR(head.ceil)} />
            ) : (
              <div>
                <div style={{ fontSize: 10.5, color: "#9AA1AC", textTransform: "uppercase", letterSpacing: 0.3 }}>Ceiling (editable)</div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 13 }}>₹</span>
                  <input key={selectedHead} type="number" defaultValue={head.ceil} onBlur={(e) => Number(e.target.value) !== head.ceil && setHeadCeiling(selectedHead, e.target.value)}
                    style={{ width: 110, padding: "4px 6px", border: `1px solid ${C.line}`, borderRadius: 5, fontSize: 14, fontWeight: 700 }} />
                </div>
              </div>
            )}
            <MiniStat label="Item list total" value={fmtINR(headItemTotal[selectedHead])} />
            <MiniStat label="Variance" value={fmtINR(headItemTotal[selectedHead] - head.ceil)} accent={headItemTotal[selectedHead] > head.ceil ? "#B3261E" : "#1E8E5A"} />
            <MiniStat label="Incomplete items" value={headIncomplete[selectedHead]} accent={headIncomplete[selectedHead] ? "#B9760A" : "#1E8E5A"} />
            <MiniStat label="Duplicate names" value={dupes.length} accent={dupes.length ? "#B3261E" : "#1E8E5A"} />
            <MiniStat label="Committed so far" value={fmtINR(headCommitted[selectedHead])} />
          </div>

          {!frozen ? (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.line}`, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {canFreeze ? (
                <>
                  <span style={{ fontSize: 12.5, color: "#6B7280", marginRight: 4 }}>Freeze this budget head as:</span>
                  <button onClick={() => freezeHead(selectedHead, "Fully Frozen")} style={btnStyle(C.green)}>Fully Frozen</button>
                  <button onClick={() => freezeHead(selectedHead, "Provisionally Frozen")} style={btnStyle(C.amber)}>Provisionally Frozen</button>
                  <button onClick={() => freezeHead(selectedHead, "Lump-Sum Frozen")} style={btnStyle(C.blue)}>Lump-Sum Frozen</button>
                  <button onClick={() => freezeHead(selectedHead, "Not Approved")} style={btnStyle(C.red)}>Not Approved</button>
                </>
              ) : (
                <span style={{ fontSize: 12.5, color: "#6B7280" }}>{readOnly ? "This budget head has not been frozen yet." : "Freezing is reserved for the President — hand off once the item list is complete."}</span>
              )}
              {(headIncomplete[selectedHead] > 0 || headItemTotal[selectedHead] > head.ceil || dupes.length > 0) && (
                <span style={{ fontSize: 11.5, color: C.amber, marginLeft: 6 }}>⚠ Missing data, ceiling breach, or duplicates detected — review before freezing "Fully Frozen".</span>
              )}
            </div>
          ) : (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.line}`, fontSize: 13 }}>
              <Badge bg="#EAF0FB" fg="#2E5FA3">{headFreeze[selectedHead]}</Badge>
              <span style={{ color: "#9AA1AC", marginLeft: 10 }}>Original values are locked. Purchase users cannot edit. </span>
              {canFreeze && <button onClick={() => freezeHead(selectedHead, "Not Frozen")} style={{ ...btnStyle(C.grey), marginLeft: 8 }}>Unfreeze (creates revision)</button>}
            </div>
          )}
        </div>

        {!locked && selectedIds.length > 0 && (
          <div style={{ ...cardStyle, marginBottom: 14, background: "#FFFBF0", border: `1px solid ${C.gold}` }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <Badge bg={C.gold} fg={C.navy}>{selectedIds.length} selected</Badge>
              <select value={moveTarget} onChange={(e) => setMoveTarget(e.target.value)} style={{ fontSize: 12.5, padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.line}` }}>
                <option value="">Move to head…</option>
                {HEADS.filter((h) => h.name !== selectedHead).map((h) => <option key={h.name} value={h.name}>{h.name}</option>)}
              </select>
              <button onClick={handleBulkMove} disabled={!moveTarget} style={{ ...btnStyle(C.blue), opacity: moveTarget ? 1 : 0.5 }}>Move</button>
              <input placeholder="Rename category to…" value={categoryInput} onChange={(e) => setCategoryInput(e.target.value)}
                style={{ fontSize: 12.5, padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.line}`, width: 180 }} />
              <button onClick={handleBulkRenameCategory} disabled={!categoryInput.trim()} style={{ ...btnStyle(C.navy), opacity: categoryInput.trim() ? 1 : 0.5 }}>Rename</button>
              <button onClick={handleBulkDelete} style={btnStyle(C.red)}>Delete selected</button>
              <button onClick={clearSelection} style={{ ...btnStyle(C.grey) }}>Clear</button>
            </div>
          </div>
        )}

        <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: 12, borderBottom: `1px solid ${C.line}`, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input placeholder="Search items in this head…" value={query} onChange={(e) => setQuery(e.target.value)}
              style={{ flex: 1, minWidth: 180, padding: "8px 10px", border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 13 }} />
            <select value={subCategoryFilter} onChange={(e) => setSubCategoryFilter(e.target.value)}
              style={{ padding: "8px 10px", border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 13, minWidth: 160 }}>
              {subCategoryOptions.map((s) => <option key={s} value={s}>{s === "All" ? "All categories" : s}</option>)}
            </select>
            {subCategoryFilter !== "All" && (
              <Badge bg="#EAF0FB" fg="#2E5FA3">{filteredItems.length} in "{subCategoryFilter}"</Badge>
            )}
            {deletedItemsForHead.length > 0 && (
              <button onClick={() => setShowDeleted((s) => !s)} style={{ ...pgBtn, whiteSpace: "nowrap" }}>
                {showDeleted ? "Hide" : "Show"} deleted ({deletedItemsForHead.length})
              </button>
            )}
          </div>
          {showDeleted && (
            <div style={{ padding: 12, background: "#FAFAF8", borderBottom: `1px solid ${C.line}` }}>
              {deletedItemsForHead.map((it) => (
                <div key={it.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "5px 0" }}>
                  <span style={{ color: "#9AA1AC", textDecoration: "line-through" }}>{it.name}</span>
                  {!readOnly && <button onClick={() => restoreItem(it.id)} style={{ ...pgBtn, padding: "3px 10px" }}>Restore</button>}
                </div>
              ))}
            </div>
          )}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#6B7280", fontSize: 10.5, textTransform: "uppercase", background: "#FAFAF8" }}>
                  {!locked && <th style={th}><input type="checkbox" checked={pageItems.length > 0 && pageItems.every((it) => selected.has(it.id))} onChange={toggleSelectAllPage} /></th>}
                  <th style={th}>Item</th>
                  <th style={th}>Spec / Sub-category</th>
                  <th style={th}>Approved Brand</th>
                  <th style={thR}>Qty</th>
                  <th style={thR}>Rate</th>
                  <th style={thR}>Value</th>
                  <th style={th}>Data Status</th>
                  <th style={th}>Approval</th>
                  <th style={th}>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((it) => (
                  <ItemRow key={it.id} it={it} updateItem={updateItem} setItemApproval={setItemApproval} updateItemBrand={updateItemBrand} frozen={locked}
                    selected={selected.has(it.id)} onToggleSelect={() => toggleSelect(it.id)}
                    renameItemName={renameItemName} deleteItems={deleteItems} />
                ))}
                {pageItems.length === 0 && (
                  <tr><td colSpan={10} style={{ padding: 24, textAlign: "center", color: "#9AA1AC" }}>
                    {role === "VP" ? "No items in this head yet — import the budget submission workbook above." : "No items in this head yet — awaiting the VP's budget submission."}
                  </td></tr>
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
      </div>
    </div>
  );
}

function ItemRow({ it, updateItem, setItemApproval, updateItemBrand, frozen, selected, onToggleSelect, renameItemName, deleteItems }) {
  const sc = STATUS_COLORS[it.status] || STATUS_COLORS.Complete;
  return (
    <tr style={{ borderTop: "1px solid #F0EFEA", background: selected ? "#FFFBF0" : "transparent" }}>
      {!frozen && <td style={{ padding: "7px 6px" }}><input type="checkbox" checked={!!selected} onChange={onToggleSelect} /></td>}
      <td style={{ padding: "7px 10px", fontWeight: 600, maxWidth: 220 }}>
        {frozen ? it.name : (
          <input defaultValue={it.name} onBlur={(e) => e.target.value.trim() && e.target.value !== it.name && renameItemName(it.id, e.target.value.trim())}
            style={{ ...cellInput, width: "100%", fontWeight: 600, textAlign: "left" }} />
        )}
        {it.vq && Object.keys(it.vq).length > 0 && (
          <div style={{ fontSize: 10.5, color: "#9AA1AC", fontWeight: 400 }}>{Object.entries(it.vq).map(([v, d]) => `${v}: ₹${d.rate}`).join(" · ")}</div>
        )}
        {!frozen && <button onClick={() => deleteItems([it.id])} style={{ fontSize: 10.5, color: C.red, background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 3 }}>Delete</button>}
      </td>
      <td style={{ padding: "7px 10px", color: "#6B7280", maxWidth: 200 }}>
        {it.spec || (frozen ? (it.sub || "—") : (
          <input defaultValue={it.sub || ""} placeholder="category" onBlur={(e) => e.target.value !== it.sub && updateItem(it.id, { sub: e.target.value })}
            style={{ ...cellInput, width: "100%", textAlign: "left" }} />
        ))}
        {it.spec && it.sub && <div style={{ fontSize: 10.5, color: "#9AA1AC" }}>{it.sub}</div>}
      </td>
      <td style={{ padding: "7px 10px", color: "#6B7280", maxWidth: 140 }}>
        {frozen ? (it.brand || "—") : (
          <input defaultValue={it.brand || ""} placeholder="brand" onBlur={(e) => e.target.value !== (it.brand || "") && updateItemBrand(it.id, e.target.value)}
            style={{ ...cellInput, width: "100%", textAlign: "left" }} />
        )}
      </td>
      <td style={{ padding: "3px 6px", textAlign: "right" }}>
        {frozen ? fmtNum(it.qty) : <input defaultValue={it.qty ?? ""} onBlur={(e) => updateItem(it.id, { qty: e.target.value === "" ? null : Number(e.target.value) })} style={cellInput} />}
      </td>
      <td style={{ padding: "3px 6px", textAlign: "right" }}>
        {frozen ? fmtINR(it.rate) : <input defaultValue={it.rate ?? ""} onBlur={(e) => updateItem(it.id, { rate: e.target.value === "" ? null : Number(e.target.value) })} style={cellInput} />}
      </td>
      <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 600 }}>{fmtINR(it.val)}</td>
      <td style={{ padding: "7px 10px" }}><Badge bg={sc.bg} fg={sc.fg}>{sc.label}</Badge></td>
      <td style={{ padding: "7px 10px" }}>
        {frozen ? <Badge bg="#EAF0FB" fg="#2E5FA3">{it.approvalStatus}</Badge> : (
          <select value={it.approvalStatus} onChange={(e) => setItemApproval(it.id, e.target.value)} style={{ fontSize: 11.5, padding: "3px 5px", borderRadius: 5, border: `1px solid ${C.line}` }}>
            {APPROVAL_STATES.map((s) => <option key={s}>{s}</option>)}
          </select>
        )}
      </td>
      <td style={{ padding: "7px 10px", color: "#9AA1AC", maxWidth: 260, fontSize: 11.5 }}>{it.rem || "—"}</td>
    </tr>
  );
}
