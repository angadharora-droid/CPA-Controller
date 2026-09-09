import React, { useState, useMemo, useCallback } from "react";
import { BASE_HEADS } from "./data/heads.js";
import { api } from "./api.js";
import { fmtINR, fmtNum, nowStamp, uid, padNum } from "./utils/format.js";
import { classifyLine } from "./utils/classifyLine.js";
import { C } from "./theme.js";
import DashboardTab from "./components/tabs/DashboardTab.jsx";
import FreezeTab from "./components/tabs/FreezeTab.jsx";
import VPImportPanel from "./components/tabs/VPImportPanel.jsx";
import ItemStatusTab from "./components/tabs/ItemStatusTab.jsx";
import RaisePRTab from "./components/tabs/RaisePRTab.jsx";
import VPDeskTab from "./components/tabs/VPDeskTab.jsx";
import PresidentSecondApprovalTab from "./components/tabs/PresidentSecondApprovalTab.jsx";
import PurchaseManagerTab from "./components/tabs/PurchaseManagerTab.jsx";
import IssuePOTab from "./components/tabs/IssuePOTab.jsx";
import DeliveryCalendarTab from "./components/tabs/DeliveryCalendarTab.jsx";
import ReceiveGoodsTab from "./components/tabs/ReceiveGoodsTab.jsx";
import AuditTab from "./components/tabs/AuditTab.jsx";
import DemoTab from "./components/tabs/DemoTab.jsx";

const ALL_ROLES = ["VP", "President", "Purchase Manager", "Purchase Executive", "Store Manager", "Department Head"];

/* The General Manager is a full-access administrator — every tab, every action. */
const ADMIN_ROLE = "General Manager";

/* Debounced write-back of one state slice to the API/MongoDB. */
function useAutosave(slice, value, ready) {
  const skippedFirst = React.useRef(false);
  React.useEffect(() => {
    if (!ready) return;
    if (!skippedFirst.current) { skippedFirst.current = true; return; }
    const t = setTimeout(() => {
      api(`/state/${slice}`, { method: "PUT", body: { value } }).catch((err) => {
        console.error(`Failed to save ${slice}:`, err.message);
      });
    }, 600);
    return () => clearTimeout(t);
  }, [slice, value, ready]);
}

function defaultFreeze() {
  const o = {};
  BASE_HEADS.forEach((h) => (o[h.name] = "Not Frozen"));
  return o;
}

export default function BudgetApp({ currentUser, onLogout }) {
  const role = currentUser.role;
  const isAdmin = role === ADMIN_ROLE;
  const whoLabel = `${currentUser.name} (${role})`;
  const [tolerancePct, setTolerancePct] = useState(5);            // good-to-approve lane threshold
  const [secondApprovalPct, setSecondApprovalPct] = useState(15); // President's 2nd-approval threshold
  const [tab, setTab] = useState("dashboard");
  const [query, setQuery] = useState("");
  const [ceilOverrides, setCeilOverrides] = useState({});
  const HEADS = useMemo(
    () => BASE_HEADS.map((h) => ({ ...h, ceil: ceilOverrides[h.name] !== undefined ? ceilOverrides[h.name] : h.ceil })),
    [ceilOverrides]
  );
  const [selectedHead, setSelectedHead] = useState(HEADS[0].name);
  const [subCategoryFilter, setSubCategoryFilter] = useState("All");

  // working state — loaded from the API / MongoDB and autosaved back per slice
  const [items, setItems] = useState([]);
  const [headFreeze, setHeadFreeze] = useState(defaultFreeze);
  const [prs, setPrs] = useState([]);           // bundled PRs: { id, raisedBy, dept, urgency, requiredBy, submittedAt, lines:[...] }
  const [prCounter, setPrCounter] = useState(1);
  const [pos, setPos] = useState([]);            // purchase orders
  const [poCounter, setPoCounter] = useState(1);
  const [grns, setGrns] = useState([]);          // goods-receipt notes
  const [audit, setAudit] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");

  React.useEffect(() => {
    let alive = true;
    api("/state")
      .then((s) => {
        if (!alive) return;
        setItems(s.items || []);
        setPrs(s.prs || []);
        setPos(s.pos || []);
        setGrns(s.grns || []);
        setAudit(s.audit || []);
        const hf = defaultFreeze();
        Object.keys(hf).forEach((k) => { if (s.headFreeze && s.headFreeze[k]) hf[k] = s.headFreeze[k]; });
        setHeadFreeze(hf);
        setCeilOverrides(s.ceilOverrides || {});
        if (typeof s.tolerancePct === "number") setTolerancePct(s.tolerancePct);
        if (typeof s.secondApprovalPct === "number") setSecondApprovalPct(s.secondApprovalPct);
        if (typeof s.prCounter === "number") setPrCounter(s.prCounter);
        if (typeof s.poCounter === "number") setPoCounter(s.poCounter);
        setLoaded(true);
      })
      .catch((err) => { if (alive) setLoadError(err.message); });
    return () => { alive = false; };
  }, []);

  useAutosave("items", items, loaded);
  useAutosave("prs", prs, loaded);
  useAutosave("prCounter", prCounter, loaded);
  useAutosave("pos", pos, loaded);
  useAutosave("poCounter", poCounter, loaded);
  useAutosave("grns", grns, loaded);
  useAutosave("audit", audit, loaded);
  useAutosave("headFreeze", headFreeze, loaded);
  useAutosave("ceilOverrides", ceilOverrides, loaded);
  useAutosave("tolerancePct", tolerancePct, loaded);
  useAutosave("secondApprovalPct", secondApprovalPct, loaded);

  const logAudit = useCallback((text, who) => {
    setAudit((a) => [{ ts: nowStamp(), who: who || whoLabel, text }, ...a]);
  }, [whoLabel]);

  // flatten all PR lines with parent PR context, for use across VP/President/PM/PE/Store Manager/Dashboard
  const allLines = useMemo(() => {
    const out = [];
    prs.forEach((pr) => {
      pr.lines.forEach((ln) => out.push({ ...ln, prId: pr.id, raisedBy: pr.raisedBy, dept: pr.dept, urgency: pr.urgency, requiredBy: pr.requiredBy, submittedAt: pr.submittedAt }));
    });
    return out;
  }, [prs]);

  // per-head committed totals: item-tracked commitments + approved unbudgeted lines charged to a head
  const headCommitted = useMemo(() => {
    const o = {};
    HEADS.forEach((h) => (o[h.name] = 0));
    items.forEach((it) => { if (!it.deleted) o[it.head] = (o[it.head] || 0) + (it.committedVal || 0); });
    allLines.forEach((l) => {
      if (!l.itemId && l.headName && l.presidentDecision === "Approved") o[l.headName] = (o[l.headName] || 0) + (l.finalQty || 0) * (l.finalRate || 0);
    });
    return o;
  }, [HEADS, items, allLines]);

  const headItemTotal = useMemo(() => {
    const o = {};
    HEADS.forEach((h) => (o[h.name] = 0));
    items.forEach((it) => { if (!it.deleted) o[it.head] = (o[it.head] || 0) + (it.val || 0); });
    return o;
  }, [HEADS, items]);

  const headIncomplete = useMemo(() => {
    const o = {};
    HEADS.forEach((h) => (o[h.name] = 0));
    items.forEach((it) => { if (!it.deleted && it.status !== "Complete") o[it.head] = (o[it.head] || 0) + 1; });
    return o;
  }, [HEADS, items]);

  function reconColor(headName) {
    const state = headFreeze[headName] || "Not Frozen";
    if (state === "Not Frozen") return "grey";
    const total = headItemTotal[headName] || 0;
    const head = HEADS.find((h) => h.name === headName);
    const ceil = head ? head.ceil : 0;
    if (headIncomplete[headName] > 0 && state !== "Lump-Sum Frozen") return "amber";
    if (total > ceil) return "red";
    return "green";
  }

  const budgetApproved = useMemo(() => {
    let t = 0;
    HEADS.forEach((h) => { if ((headFreeze[h.name] || "Not Frozen") !== "Not Frozen") t += h.ceil; });
    return t;
  }, [HEADS, headFreeze]);

  const budgetCommitted = useMemo(() => Object.values(headCommitted).reduce((a, b) => a + b, 0), [headCommitted]);

  const itemsApprovedCount = allLines.filter((l) => (l.vpDecision === "Approved" || l.vpDecision === "Modified & Approved") && (!l.needsSecondApproval || l.presidentDecision === "Approved")).length;
  const itemsOrderedCount = pos.reduce((n, po) => n + po.lines.length, 0);
  const itemsReceivedCount = grns.reduce((n, g) => n + g.lines.length, 0);

  /* ---------- budget / item actions ---------- */
  function updateItem(id, patch) {
    setItems((prev) => prev.map((it) => {
      if (it.id !== id) return it;
      const updated = { ...it, ...patch };
      if (patch.qty !== undefined || patch.rate !== undefined) {
        const q = patch.qty !== undefined ? patch.qty : it.qty;
        const r = patch.rate !== undefined ? patch.rate : it.rate;
        if (q !== null && r !== null && q !== "" && r !== "") {
          updated.val = Number(q) * Number(r);
          updated.status = "Complete";
        }
      }
      return updated;
    }));
  }

  function setItemApproval(id, status) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, approvalStatus: status } : it)));
    logAudit(`Item ${id} marked "${status}" during budget review.`);
  }

  function deleteItems(ids) {
    if (!ids.length) return;
    const names = items.filter((it) => ids.includes(it.id)).map((it) => it.name);
    setItems((prev) => prev.map((it) => (ids.includes(it.id) ? { ...it, deleted: true } : it)));
    logAudit(`Deleted ${ids.length} item(s): ${names.join(", ")}. Recoverable from Budget Review via restore.`);
  }

  function restoreItem(id) {
    const it = items.find((i) => i.id === id);
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, deleted: false } : i)));
    logAudit(`Restored deleted item "${it ? it.name : id}".`);
  }

  function moveItemsToHead(ids, newHeadName) {
    if (!ids.length || !newHeadName) return;
    const newHead = HEADS.find((h) => h.name === newHeadName);
    if (!newHead) return;
    const moved = items.filter((it) => ids.includes(it.id));
    const fromHeads = [...new Set(moved.map((it) => it.head))].join(", ");
    setItems((prev) => prev.map((it) => ids.includes(it.id) ? {
      ...it, head: newHeadName, dept: newHead.dept, ceil: newHead.ceil,
    } : it));
    logAudit(`Moved ${ids.length} item(s) from ${fromHeads} to "${newHeadName}": ${moved.map((it) => it.name).join(", ")}. Value counts against "${newHeadName}" ceiling immediately.`);
  }

  function renameItemName(id, newName) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, name: newName } : it)));
    logAudit(`Item ${id} renamed to "${newName}".`);
  }

  function renameCategoryBulk(ids, newCategory) {
    if (!ids.length || !newCategory) return;
    setItems((prev) => prev.map((it) => (ids.includes(it.id) ? { ...it, sub: newCategory } : it)));
    logAudit(`Renamed category to "${newCategory}" for ${ids.length} item(s).`);
  }

  function updateItemBrand(id, brand) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, brand } : it)));
    logAudit(`Approved brand for item ${id} set to "${brand}".`);
  }

  function freezeHead(headName, state) {
    setHeadFreeze((prev) => ({ ...prev, [headName]: state }));
    setItems((prev) => prev.map((it) => (it.head === headName ? { ...it, freezeState: state } : it)));
    logAudit(`Budget head "${headName}" ${freezeLabel(state)}. Original approved values locked; a revision record will be created for any future edit.`);
  }
  function freezeLabel(state) {
    if (state === "Fully Frozen") return "FULLY FROZEN";
    if (state === "Provisionally Frozen") return "PROVISIONALLY FROZEN";
    if (state === "Lump-Sum Frozen") return "FROZEN AS LUMP-SUM (item-level PRs require case-by-case approval)";
    if (state === "Not Frozen") return "UNFROZEN (revision opened)";
    return "marked NOT APPROVED";
  }

  function setHeadCeiling(headName, newCeil) {
    const n = Number(newCeil);
    if (isNaN(n) || n < 0) return;
    setCeilOverrides((prev) => ({ ...prev, [headName]: n }));
    logAudit(`Budget head "${headName}" ceiling changed to ${fmtINR(n)}.`);
  }

  function importVPItems(rows, fileName) {
    if (!rows.length) return 0;
    const newItems = rows.map((r) => {
      const head = HEADS.find((h) => h.name.toLowerCase() === (r.head || "").trim().toLowerCase());
      if (!head) return null;
      const qty = r.qty !== "" && r.qty !== null && r.qty !== undefined && !isNaN(Number(r.qty)) ? Number(r.qty) : null;
      const rate = r.rate !== "" && r.rate !== null && r.rate !== undefined && !isNaN(Number(r.rate)) ? Number(r.rate) : null;
      const val = (qty !== null && rate !== null) ? qty * rate : null;
      let status;
      if (qty !== null && rate !== null) status = "Complete";
      else if (qty === null && rate === null) status = "Item-Level Details Missing";
      else if (qty === null) status = "Quantity Missing";
      else status = "Rate Missing";
      return {
        id: uid("VPI"), sheet: fileName || "VP Budget Submission Import", row: null,
        head: head.name, dept: head.dept, sub: r.subCategory || "", name: r.name, spec: r.model || "",
        area: {}, unit: "Nos", qty, stock: null, bal: qty, rate, val, ceil: head.ceil,
        rem: "Imported from VP budget submission.", status, vq: {}, brand: r.brand || null,
        committedQty: 0, committedVal: 0,
        approvalStatus: status === "Complete" ? "Approved" : "Pending",
        freezeState: headFreeze[head.name] || "Not Frozen", deleted: false,
      };
    }).filter(Boolean);
    setItems((prev) => [...prev, ...newItems]);
    logAudit(`Imported ${newItems.length} item(s) from budget submission file "${fileName}".`);
    return newItems.length;
  }

  const subCategoryOptions = useMemo(() => {
    const set = new Set();
    items.forEach((it) => { if (it.head === selectedHead && !it.deleted) set.add(it.sub && it.sub.trim() ? it.sub : "Uncategorized"); });
    return ["All", ...[...set].sort()];
  }, [items, selectedHead]);

  const filteredItems = useMemo(() => {
    let list = items.filter((it) => it.head === selectedHead && !it.deleted);
    if (subCategoryFilter !== "All") {
      list = list.filter((it) => (it.sub && it.sub.trim() ? it.sub : "Uncategorized") === subCategoryFilter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((it) => it.name.toLowerCase().includes(q) || (it.sub || "").toLowerCase().includes(q));
    }
    return list;
  }, [items, selectedHead, query, subCategoryFilter]);

  React.useEffect(() => { setSubCategoryFilter("All"); }, [selectedHead]);

  const deletedItemsForHead = useMemo(() =>
    items.filter((it) => it.head === selectedHead && it.deleted),
    [items, selectedHead]
  );

  // Items departments can requisition against: frozen + approved + complete
  const approvedItemsForPR = useMemo(() =>
    items.filter((it) => !it.deleted && it.freezeState !== "Not Frozen" && it.freezeState !== "Not Approved" && it.approvalStatus === "Approved" && it.status === "Complete"),
    [items]
  );

  /* ---------- PR (bundled) actions ---------- */
  function submitBundledPR({ lines, raisedBy, dept, urgency, requiredBy }) {
    const prId = `PR-CPA-${padNum(prCounter, 4)}`;
    setPrCounter((c) => c + 1);
    const builtLines = lines.map((ln, idx) => {
      const item = ln.itemId ? items.find((i) => i.id === ln.itemId) : null;
      const cls = classifyLine(item, Number(ln.requestedQty), Number(ln.requestedRate), ln.proposedBrand, ln.proposedModel, tolerancePct, secondApprovalPct);
      return {
        lineId: `${prId}-L${idx + 1}`,
        itemId: ln.itemId || null,
        itemName: item ? item.name : ln.unbudgetedName,
        headName: item ? item.head : ln.unbudgetedHead,
        requestedQty: Number(ln.requestedQty) || 0,
        requestedRate: Number(ln.requestedRate) || 0,
        approvedQty: item ? item.qty : null,
        approvedRate: item ? item.rate : null,
        approvedBrand: item ? item.brand : null,
        approvedModel: item ? item.spec : null,
        proposedBrand: ln.proposedBrand || "",
        proposedModel: ln.proposedModel || "",
        vendorDetails: ln.vendorDetails || "",
        lane: cls.lane,
        reasons: cls.reasons,
        variancePct: cls.variancePct,
        needsSecondApproval: cls.needsSecondApproval,
        vpDecision: "Pending",
        vpNote: "",
        finalQty: Number(ln.requestedQty) || 0,
        finalRate: Number(ln.requestedRate) || 0,
        presidentDecision: item === null || cls.needsSecondApproval ? "Pending" : null,
        presidentNote: "",
        pmRate: null,
        pmNote: "",
        status: "Pending VP",
        poId: null,
        qtyReceived: 0,
      };
    });
    const pr = { id: prId, raisedBy: raisedBy || currentUser.name, dept, urgency, requiredBy, submittedAt: nowStamp(), lines: builtLines };
    setPrs((prev) => [pr, ...prev]);
    logAudit(`${prId} raised by ${pr.raisedBy} (${dept || "—"}) with ${builtLines.length} line item(s): ${builtLines.map((l) => l.itemName).join(", ")}.`);
    return pr;
  }

  function updateLine(prId, lineId, patch) {
    setPrs((prev) => prev.map((pr) => pr.id !== prId ? pr : {
      ...pr, lines: pr.lines.map((ln) => ln.lineId === lineId ? { ...ln, ...patch } : ln),
    }));
  }
  function getLine(prId, lineId) {
    const pr = prs.find((p) => p.id === prId);
    return pr ? pr.lines.find((l) => l.lineId === lineId) : null;
  }

  // lineHint lets a caller act on a line created in the same render pass (used by the demo walkthroughs)
  function vpDecideLine(prId, lineId, decision, modifiedQty, modifiedRate, lineHint) {
    const ln = getLine(prId, lineId) || lineHint;
    if (!ln) return;
    if (decision === "Reject") {
      updateLine(prId, lineId, { vpDecision: "Rejected", status: "Rejected by VP" });
      logAudit(`${prId} line "${ln.itemName}" rejected by VP.`);
      return;
    }
    if (decision === "Defer") {
      updateLine(prId, lineId, { vpDecision: "Deferred", status: "Deferred by VP" });
      logAudit(`${prId} line "${ln.itemName}" deferred by VP.`);
      return;
    }
    // Approve or Modify-Approve
    const finalQty = modifiedQty !== undefined && modifiedQty !== null && modifiedQty !== "" ? Number(modifiedQty) : ln.requestedQty;
    const finalRate = modifiedRate !== undefined && modifiedRate !== null && modifiedRate !== "" ? Number(modifiedRate) : ln.requestedRate;
    const item = ln.itemId ? items.find((i) => i.id === ln.itemId) : null;
    const revisedVariance = item && item.rate > 0 ? ((finalRate - item.rate) / item.rate) * 100 : ln.variancePct;
    const needsSecond = !item || revisedVariance > secondApprovalPct;
    const newStatus = needsSecond ? "Pending President" : "Pending Purchase Manager";
    updateLine(prId, lineId, {
      vpDecision: decision === "Modify-Approve" ? "Modified & Approved" : "Approved",
      finalQty, finalRate, variancePct: revisedVariance, needsSecondApproval: needsSecond,
      presidentDecision: needsSecond ? "Pending" : null, status: newStatus,
    });
    // commit budget against the item at VP-approval time (unbudgeted lines commit against their head on President approval)
    if (item) {
      setItems((prev) => prev.map((it) => it.id === item.id ? {
        ...it, committedQty: (it.committedQty || 0) + finalQty, committedVal: (it.committedVal || 0) + finalQty * finalRate,
      } : it));
    }
    logAudit(`${prId} line "${ln.itemName}" ${decision === "Modify-Approve" ? "modified & approved" : "approved"} by VP (${fmtNum(finalQty)} @ ${fmtINR(finalRate)}).${needsSecond ? " Requires President's second approval (variance/unbudgeted)." : " Routed to Purchase Manager."}`);
  }

  function presidentDecideLine(prId, lineId, decision) {
    const ln = getLine(prId, lineId);
    if (!ln) return;
    if (decision === "Reject") {
      updateLine(prId, lineId, { presidentDecision: "Rejected", status: "Rejected by President" });
      if (ln.itemId) {
        // release the budget the VP's approval had committed against this item
        setItems((prev) => prev.map((it) => it.id === ln.itemId ? {
          ...it,
          committedQty: Math.max(0, (it.committedQty || 0) - ln.finalQty),
          committedVal: Math.max(0, (it.committedVal || 0) - ln.finalQty * ln.finalRate),
        } : it));
      }
      logAudit(`${prId} line "${ln.itemName}" rejected by President (second approval). Committed budget released.`);
      return;
    }
    if (decision === "Defer") {
      updateLine(prId, lineId, { presidentDecision: "Deferred", status: "Deferred by President" });
      logAudit(`${prId} line "${ln.itemName}" deferred by President.`);
      return;
    }
    updateLine(prId, lineId, { presidentDecision: "Approved", status: "Pending Purchase Manager" });
    logAudit(`${prId} line "${ln.itemName}" approved by President (second approval). Routed to Purchase Manager.`);
  }

  function pmSetRate(prId, lineId, negotiatedRate) {
    const ln = getLine(prId, lineId);
    if (!ln) return;
    const n = Number(negotiatedRate);
    if (isNaN(n) || n <= 0 || n > ln.finalRate) {
      logAudit(`Purchase Manager attempted to set a rate above the approved rate for "${ln.itemName}" — rejected by system (PM may only reduce price).`);
      return;
    }
    updateLine(prId, lineId, { pmRate: n });
    logAudit(`Purchase Manager negotiated "${ln.itemName}" down to ${fmtINR(n)} (from ${fmtINR(ln.finalRate)}).`);
  }

  function pmMarkReady(prId, lineId) {
    const ln = getLine(prId, lineId);
    if (!ln) return;
    updateLine(prId, lineId, { status: "Ready for PO" });
    logAudit(`"${ln.itemName}" (${prId}) marked Ready for PO by Purchase Manager at ${fmtINR(ln.pmRate || ln.finalRate)}.`);
  }

  /* ---------- PO / delivery / GRN actions ---------- */
  function issuePO({ lineRefs, supplier, invoiceTo, consignee, paymentTerms, deliveryTerms, deliveryDate, dispatchThrough, destination }) {
    if (!lineRefs.length) return null;
    const poId = `PO-CPA-${padNum(poCounter, 4)}`;
    setPoCounter((c) => c + 1);
    const lineSnapshots = lineRefs.map(({ prId, lineId }) => {
      const ln = getLine(prId, lineId);
      const rate = ln.pmRate || ln.finalRate;
      return {
        prId, lineId, itemName: ln.itemName, qty: ln.finalQty, rate, amount: ln.finalQty * rate, unit: "Nos", qtyReceived: 0,
      };
    });
    const po = {
      id: poId, dated: nowStamp(), supplier, invoiceTo, consignee, paymentTerms, deliveryTerms,
      deliveryDate, dispatchThrough: dispatchThrough || "", destination: destination || "",
      lines: lineSnapshots, status: "Issued",
      signatures: { vp: null, president: null, purchaseExecutive: null },
    };
    setPos((prev) => [po, ...prev]);
    lineRefs.forEach(({ prId, lineId }) => updateLine(prId, lineId, { status: "PO Issued", poId }));
    logAudit(`${poId} issued by Purchase Executive for ${lineSnapshots.length} line item(s) from supplier "${supplier}", expected delivery ${deliveryDate || "TBD"}.`);
    return po;
  }

  function signPO(poId, roleKey) {
    setPos((prev) => prev.map((po) => po.id === poId ? {
      ...po, signatures: { ...po.signatures, [roleKey]: { by: currentUser.name, date: nowStamp() } },
    } : po));
    logAudit(`${poId} digitally signed by ${whoLabel}.`);
  }

  function recordGRN({ poId, billNo, billDate, receivedDate, lines }) {
    const grnId = `GRN-CPA-${padNum(grns.length + 1, 4)}`;
    const grn = { id: grnId, poId, billNo, billDate, receivedDate, lines, recordedBy: whoLabel, ts: nowStamp() };
    setGrns((prev) => [grn, ...prev]);
    setPos((prev) => prev.map((po) => po.id !== poId ? po : {
      ...po,
      lines: po.lines.map((pl) => {
        const match = lines.find((l) => l.lineId === pl.lineId);
        return match ? { ...pl, qtyReceived: (pl.qtyReceived || 0) + Number(match.qtyReceived || 0) } : pl;
      }),
    }));
    // mirror the received quantity onto the originating PR line
    const po = pos.find((p) => p.id === poId);
    if (po) {
      lines.forEach((l) => {
        const ref = po.lines.find((pl) => pl.lineId === l.lineId);
        if (ref) updateLine(ref.prId, ref.lineId, { qtyReceived: (getLine(ref.prId, ref.lineId)?.qtyReceived || 0) + Number(l.qtyReceived || 0) });
      });
    }
    logAudit(`${grnId} recorded against ${poId} (Bill No. ${billNo || "—"}, dated ${billDate || "—"}): ${lines.length} line item(s) received.`);
    return grn;
  }

  /* ---------- shared bits ---------- */
  const TABS = [
    { id: "dashboard", label: "Executive Dashboard", roles: ALL_ROLES },
    { id: "freeze", label: "Budget Review & Freeze", roles: ["VP", "President"] },
    { id: "itemstatus", label: "Approved & Pending Items", roles: ["Department Head", "VP", "President"] },
    { id: "raisepr", label: "Raise Purchase Requisition", roles: ["Department Head"] },
    { id: "vpdesk", label: "VP's Desk", roles: ["VP"] },
    { id: "president2nd", label: "President's 2nd Approval", roles: ["President"] },
    { id: "pmqueue", label: "Purchase Manager", roles: ["Purchase Manager"] },
    { id: "issuepo", label: "Issue PO", roles: ["Purchase Executive"] },
    { id: "calendar", label: "Delivery Calendar", roles: ["Store Manager", "Purchase Executive"] },
    { id: "receive", label: "Receive Material (GRN)", roles: ["Store Manager"] },
    { id: "audit", label: "Audit Trail", roles: ALL_ROLES },
    { id: "demo", label: "Demo Scenarios", roles: ALL_ROLES },
  ];
  const visibleTabs = TABS.filter((t) => isAdmin || t.roles.includes(role));
  React.useEffect(() => { if (!visibleTabs.find((t) => t.id === tab)) setTab("dashboard"); }, [role]);

  const cardStyle = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 18 };

  const pendingVPCount = allLines.filter((l) => l.vpDecision === "Pending").length;
  const pendingPresidentCount = allLines.filter((l) => l.vpDecision !== "Pending" && l.vpDecision !== "Rejected" && l.vpDecision !== "Deferred" && l.needsSecondApproval && l.presidentDecision === "Pending").length;
  const pendingPMCount = allLines.filter((l) => l.status === "Pending Purchase Manager").length;
  const readyForPOCount = allLines.filter((l) => l.status === "Ready for PO").length;

  if (loadError || !loaded) {
    return (
      <div style={{ fontFamily: "'Segoe UI', Inter, system-ui, sans-serif", background: C.bg, color: C.text, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ ...cardStyle, maxWidth: 420, textAlign: "center", padding: 32 }}>
          {loadError ? (
            <>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.red, marginBottom: 8 }}>Could not load budget data</div>
              <div style={{ fontSize: 13, color: C.sub, marginBottom: 16 }}>{loadError}</div>
              <button onClick={() => window.location.reload()} style={{ background: C.navy, color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", marginRight: 8 }}>Retry</button>
              <button onClick={onLogout} style={{ background: "transparent", color: C.navy, border: `1px solid ${C.line}`, borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Logout</button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Loading budget data…</div>
              <div style={{ fontSize: 12.5, color: C.sub }}>Fetching items, requisitions, purchase orders and audit trail from the database.</div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Segoe UI', Inter, system-ui, sans-serif", background: C.bg, color: C.text, minHeight: "100%", fontSize: 14 }}>
      {/* HEADER */}
      <div style={{ background: `linear-gradient(120deg, ${C.navy}, ${C.navy2})`, color: "#fff", padding: "20px 28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 2, color: C.gold, fontWeight: 700, textTransform: "uppercase" }}>Centre Point Hospitality</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>Centre Point Amravati — Pre-Opening Budget &amp; Purchase Control</div>
            <div style={{ fontSize: 12.5, color: "#C7D0DE", marginTop: 4 }}>
              VP submits budget → President freezes → Departments requisition → VP's Desk → President's 2nd Approval → Purchase Manager → PO → Delivery → Receipt
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ textAlign: "right", marginRight: 6 }}>
              <div style={{ fontSize: 10, color: "#9FB0C7", letterSpacing: 1 }}>SIGNED IN</div>
              <div style={{ fontSize: 14, fontWeight: 700, marginTop: 3 }}>{currentUser.name}</div>
              <div style={{ fontSize: 11, color: C.gold, fontWeight: 700 }}>{currentUser.role}</div>
            </div>
            <button onClick={onLogout}
              style={{ background: "transparent", color: "#E8ECF3", border: `1px solid ${C.gold}`, borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
              Logout
            </button>
          </div>
        </div>
        {/* nav */}
        <div style={{ display: "flex", gap: 4, marginTop: 18, flexWrap: "wrap" }}>
          {visibleTabs.map((t) => {
            let badge = "";
            if (t.id === "vpdesk" && pendingVPCount) badge = ` (${pendingVPCount})`;
            if (t.id === "president2nd" && pendingPresidentCount) badge = ` (${pendingPresidentCount})`;
            if (t.id === "pmqueue" && pendingPMCount) badge = ` (${pendingPMCount})`;
            if (t.id === "issuepo" && readyForPOCount) badge = ` (${readyForPOCount})`;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{
                  background: tab === t.id ? C.gold : "rgba(255,255,255,0.08)",
                  color: tab === t.id ? C.navy : "#E8ECF3",
                  border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                }}>{t.label}{badge}</button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: 22, maxWidth: 1400, margin: "0 auto" }}>
        {tab === "dashboard" && (
          <DashboardTab {...{ HEADS, headFreeze, headItemTotal, headCommitted, headIncomplete, reconColor, cardStyle, setTab, setSelectedHead, budgetApproved, budgetCommitted, itemsApprovedCount, itemsOrderedCount, itemsReceivedCount, allLines, pos, grns, tolerancePct }} canOpenFreeze={role === "VP" || role === "President" || isAdmin} />
        )}
        {tab === "freeze" && (role === "VP" || role === "President" || isAdmin) && (
          <>
            {(role === "VP" || isAdmin) && <VPImportPanel {...{ HEADS, importVPItems, cardStyle }} />}
            <FreezeTab {...{ HEADS, headFreeze, freezeHead, selectedHead, setSelectedHead, filteredItems, deletedItemsForHead, updateItem, setItemApproval, updateItemBrand, query, setQuery, subCategoryFilter, setSubCategoryFilter, subCategoryOptions, cardStyle, reconColor, headItemTotal, headIncomplete, headCommitted, tolerancePct, setTolerancePct, secondApprovalPct, setSecondApprovalPct, setHeadCeiling, deleteItems, restoreItem, moveItemsToHead, renameItemName, renameCategoryBulk, role }} />
          </>
        )}
        {tab === "itemstatus" && (
          <ItemStatusTab {...{ HEADS, items, cardStyle }} />
        )}
        {tab === "raisepr" && (role === "Department Head" || isAdmin) && (
          <RaisePRTab {...{ HEADS, approvedItemsForPR, submitBundledPR, cardStyle, currentUser }} />
        )}
        {tab === "vpdesk" && (role === "VP" || isAdmin) && (
          <VPDeskTab {...{ prs, allLines, vpDecideLine, cardStyle, tolerancePct, secondApprovalPct }} />
        )}
        {tab === "president2nd" && (role === "President" || isAdmin) && (
          <PresidentSecondApprovalTab {...{ prs, presidentDecideLine, cardStyle, secondApprovalPct }} />
        )}
        {tab === "pmqueue" && (role === "Purchase Manager" || isAdmin) && (
          <PurchaseManagerTab {...{ prs, pmSetRate, pmMarkReady, cardStyle }} />
        )}
        {tab === "issuepo" && (role === "Purchase Executive" || isAdmin) && (
          <IssuePOTab {...{ allLines, issuePO, signPO, pos, cardStyle, role }} />
        )}
        {tab === "calendar" && (role === "Store Manager" || role === "Purchase Executive" || isAdmin) && (
          <DeliveryCalendarTab {...{ pos, cardStyle, signPO, role }} />
        )}
        {tab === "receive" && (role === "Store Manager" || isAdmin) && (
          <ReceiveGoodsTab {...{ pos, recordGRN, grns, cardStyle }} />
        )}
        {tab === "audit" && (
          <AuditTab {...{ audit, cardStyle }} />
        )}
        {tab === "demo" && (
          <DemoTab {...{ items, HEADS, headFreeze, freezeHead, submitBundledPR, vpDecideLine, setTab, role, cardStyle }} />
        )}
      </div>
    </div>
  );
}
