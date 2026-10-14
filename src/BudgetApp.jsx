import React, { useState, useMemo, useCallback } from "react";
import { BASE_HEADS } from "./data/heads.js";
import { api } from "./api.js";
import { createStateSync } from "./sync.js";
import { fmtINR, fmtNum, fmtRate, round2, nowStamp, uid, padNum } from "./utils/format.js";
import { classifyLine } from "./utils/classifyLine.js";
import { unitOf } from "./utils/units.js";
import { todayISO, computeTransport, poIsLocked, lineHasOwnGst } from "./utils/po.js";
import { C } from "./theme.js";
import { editTabsOf, signBoxOf } from "./data/access.js";
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
import ReportsTab from "./components/tabs/ReportsTab.jsx";
import AuditTab from "./components/tabs/AuditTab.jsx";
import DemoTab from "./components/tabs/DemoTab.jsx";

/* Tabs with something to change on them; on these a login without edit rights is told it can only view. */
const ACTION_TABS = new Set(["freeze", "raisepr", "vpdesk", "president2nd", "pmqueue", "issuepo", "receive", "demo"]);

/* PO header fields that can be corrected after issue, with the label used in the audit trail. */
const PO_EDITABLE = {
  supplier: "supplier name", supplierAddress: "supplier address", supplierGstin: "supplier GSTIN",
  supplierState: "supplier state", supplierContact: "supplier contact",
  invoiceTo: "Invoice To", consignee: "Consignee",
  referenceNo: "reference no.", paymentTerms: "payment terms", otherReferences: "other references",
  deliveryTerms: "terms of delivery", deliveryDate: "delivery date", dispatchThrough: "dispatched through",
  destination: "destination", discountPct: "discount %", gstPct: "GST rate", gstType: "GST type",
};


/* The Purchase Executive role was merged into Purchase Manager: POs issued before the merge carry the
   signature under the old key, so move it across (the merged role signs in that box from now on). */
function migratePOSignatures(po) {
  const sig = po.signatures;
  if (!sig || !("purchaseExecutive" in sig)) return po;
  const { purchaseExecutive, ...rest } = sig;
  return { ...po, signatures: { ...rest, purchaseManager: rest.purchaseManager || purchaseExecutive || null } };
}

function defaultFreeze() {
  const o = {};
  BASE_HEADS.forEach((h) => (o[h.name] = "Not Frozen"));
  return o;
}

/* How each slice of app state arrives from the server -> the value the app works with. */
const NORMALIZE = {
  items: (v) => v || [],
  prs: (v) => v || [],
  prCounter: (v) => (typeof v === "number" ? v : 1),
  pos: (v) => (v || []).map(migratePOSignatures),
  poCounter: (v) => (typeof v === "number" ? v : 1),
  grns: (v) => v || [],
  audit: (v) => v || [],
  headFreeze: (v) => {
    const hf = defaultFreeze();
    Object.keys(hf).forEach((k) => { if (v && v[k]) hf[k] = v[k]; });
    return hf;
  },
  ceilOverrides: (v) => v || {},
  tolerancePct: (v) => (typeof v === "number" ? v : 5),
  secondApprovalPct: (v) => (typeof v === "number" ? v : 15),
};

const POLL_MS = 5000; // how often an open browser asks the server whether anything changed

export default function BudgetApp({ currentUser, onLogout }) {
  const role = currentUser.role;
  /* Everyone opens every tab. What a login may change is set per tab in data/access.js (the server
     enforces the same table): a tab it cannot edit shows read-only. The PO signature box it signs, if
     any, is separate: the VP and the President sign POs they otherwise only view. */
  const editTabs = useMemo(() => new Set(editTabsOf(currentUser.id)), [currentUser.id]);
  const canEdit = (tabId) => editTabs.has(tabId);
  const signAs = signBoxOf(currentUser.id);
  /* A login that can change nothing at all: every action hidden or disabled, nothing saved back. */
  const readOnly = role === "Viewer" || (editTabs.size === 0 && !signAs);
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

  // working state — loaded from the API / MongoDB, saved back and kept current by the sync engine (sync.js)
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

  const [syncNotes, setSyncNotes] = useState({}); // "clash" | "unsaved" -> message shown above the tabs
  const sync = React.useRef(null);

  React.useEffect(() => {
    let alive = true;
    const engine = createStateSync({
      api, normalize: NORMALIZE, readOnly,
      adopt: (n) => {
        if (!alive) return;
        setItems(n.items); setPrs(n.prs); setPrCounter(n.prCounter); setPos(n.pos); setPoCounter(n.poCounter);
        setGrns(n.grns); setAudit(n.audit); setHeadFreeze(n.headFreeze); setCeilOverrides(n.ceilOverrides);
        setTolerancePct(n.tolerancePct); setSecondApprovalPct(n.secondApprovalPct);
      },
      notify: (kind, text) => { if (alive) setSyncNotes((m) => ((m[kind] || null) === (text || null) ? m : { ...m, [kind]: text || null })); },
    });
    sync.current = engine;
    engine.load().then(() => { if (alive) setLoaded(true); }).catch((err) => { if (alive) setLoadError(err.message); });
    // other people's work shows up by itself: look every few seconds, and at once when the window is picked up again
    const look = () => { if (!document.hidden) engine.poll().catch(() => {}); };
    const every = setInterval(look, POLL_MS);
    window.addEventListener("focus", look);
    document.addEventListener("visibilitychange", look);
    return () => {
      alive = false; engine.stop(); clearInterval(every);
      window.removeEventListener("focus", look);
      document.removeEventListener("visibilitychange", look);
    };
  }, [readOnly]);

  // every change on screen goes to the engine, which saves whatever differs from the server's copy
  React.useEffect(() => {
    if (loaded) sync.current.changed({ items, prs, prCounter, pos, poCounter, grns, audit, headFreeze, ceilOverrides, tolerancePct, secondApprovalPct });
  }, [loaded, items, prs, prCounter, pos, poCounter, grns, audit, headFreeze, ceilOverrides, tolerancePct, secondApprovalPct]);

  const logAudit = useCallback((text, who) => {
    setAudit((a) => [{ ts: nowStamp(), who: who || whoLabel, text }, ...a]);
  }, [whoLabel]);

  // flatten all PR lines with parent PR context, for use across VP/President/Purchase Manager/Store Manager/Dashboard
  const allLines = useMemo(() => {
    const out = [];
    prs.forEach((pr) => {
      pr.lines.forEach((ln) => out.push({ ...ln, prId: pr.id, raisedBy: pr.raisedBy, dept: pr.dept, urgency: pr.urgency, requiredBy: pr.requiredBy, submittedAt: pr.submittedAt }));
    });
    return out;
  }, [prs]);

  // quantity per budget item still waiting on the VP: not committed yet, but already spoken for
  const pendingQtyByItem = useMemo(() => {
    const o = {};
    allLines.forEach((l) => { if (l.itemId && l.vpDecision === "Pending") o[l.itemId] = (o[l.itemId] || 0) + (Number(l.requestedQty) || 0); });
    return o;
  }, [allLines]);

  // per-head committed totals: item-tracked commitments + approved unbudgeted lines charged to a head
  const headCommitted = useMemo(() => {
    const o = {};
    HEADS.forEach((h) => (o[h.name] = 0));
    items.forEach((it) => { if (!it.deleted) o[it.head] = (o[it.head] || 0) + (it.committedVal || 0); });
    allLines.forEach((l) => {
      if (!l.itemId && l.headName && (l.presidentDecision === "Approved" || l.presidentDecision === "Modified & Approved")) o[l.headName] = (o[l.headName] || 0) + (l.finalQty || 0) * (l.finalRate || 0);
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
    const spokenFor = { ...pendingQtyByItem }; // grows with this PR's own lines, should one item appear twice
    const builtLines = lines.map((ln, idx) => {
      const item = ln.itemId ? items.find((i) => i.id === ln.itemId) : null;
      const cls = classifyLine(item, Number(ln.requestedQty), Number(ln.requestedRate), ln.proposedBrand, ln.proposedModel, tolerancePct, secondApprovalPct, item ? spokenFor[item.id] || 0 : 0);
      if (item) spokenFor[item.id] = (spokenFor[item.id] || 0) + (Number(ln.requestedQty) || 0);
      return {
        lineId: `${prId}-L${idx + 1}`,
        itemId: ln.itemId || null,
        itemName: item ? item.name : ln.unbudgetedName,
        headName: item ? item.head : ln.unbudgetedHead,
        requestedQty: Number(ln.requestedQty) || 0,
        requestedRate: Number(ln.requestedRate) || 0,
        unit: unitOf(null, item),
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
    // the VP may still approve past the balance, but never silently: the VP's Desk warns and the audit trail records it
    const overBy = item ? finalQty - ((item.qty || 0) - (item.committedQty || 0)) : 0;
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
    logAudit(`${prId} line "${ln.itemName}" ${decision === "Modify-Approve" ? "modified & approved" : "approved"} by VP (${fmtNum(finalQty)} @ ${fmtINR(finalRate)}).${needsSecond ? " Requires President's second approval (variance/unbudgeted)." : " Routed to Purchase Manager."}${overBy > 0 ? ` Approved quantity exceeds the remaining approved balance by ${fmtNum(overBy)} ${item.unit || "Nos"}.` : ""}`);
  }

  function presidentDecideLine(prId, lineId, decision, modifiedQty, modifiedRate) {
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
    /* Modify & Approve: the President approves at a quantity and/or rate of their own. What the VP's
       approval committed against the budget item moves to the new figures (an unbudgeted line's head
       total is worked out from the line itself); the VP's own figures stay on the line as vpQty / vpRate. */
    if (decision === "Modify-Approve") {
      const q = modifiedQty !== undefined && modifiedQty !== null && modifiedQty !== "" ? Number(modifiedQty) : ln.finalQty;
      const r = modifiedRate !== undefined && modifiedRate !== null && modifiedRate !== "" ? Number(modifiedRate) : ln.finalRate;
      if (!(q > 0) || !(r > 0)) return;
      if (q === Number(ln.finalQty) && round2(r) === round2(ln.finalRate)) return presidentDecideLine(prId, lineId, "Approve");
      const item = ln.itemId ? items.find((i) => i.id === ln.itemId) : null;
      updateLine(prId, lineId, {
        presidentDecision: "Modified & Approved", status: "Pending Purchase Manager",
        finalQty: q, finalRate: r, variancePct: item && item.rate > 0 ? ((r - item.rate) / item.rate) * 100 : ln.variancePct,
        vpQty: ln.vpQty ?? ln.finalQty, vpRate: ln.vpRate ?? ln.finalRate, presidentQty: q, presidentRate: r,
      });
      let overBy = 0;
      if (item) {
        setItems((prev) => prev.map((it) => it.id === item.id ? {
          ...it,
          committedQty: Math.max(0, (it.committedQty || 0) - ln.finalQty + q),
          committedVal: Math.max(0, (it.committedVal || 0) - ln.finalQty * ln.finalRate + q * r),
        } : it));
        overBy = (item.committedQty || 0) - ln.finalQty + q - (item.qty || 0);
      }
      logAudit(`${prId} line "${ln.itemName}" modified & approved by President (second approval): ${fmtNum(q)} @ ${fmtRate(r)}, was ${fmtNum(ln.finalQty)} @ ${fmtRate(ln.finalRate)} as approved by the VP. Routed to Purchase Manager.${overBy > 0 ? ` Approved quantity exceeds the item's approved quantity by ${fmtNum(overBy)} ${item.unit || "Nos"}.` : ""}`);
      return;
    }
    updateLine(prId, lineId, { presidentDecision: "Approved", status: "Pending Purchase Manager" });
    logAudit(`${prId} line "${ln.itemName}" approved by President (second approval). Routed to Purchase Manager.`);
  }

  function pmSetRate(prId, lineId, negotiatedRate) {
    const ln = getLine(prId, lineId);
    if (!ln) return;
    const n = Number(negotiatedRate);
    if (isNaN(n) || n <= 0) return;
    /* The PM sets the rate actually being paid, up or down. A rate above the VP-approved one goes
       through but is flagged on the line and in the audit trail. */
    const was = ln.pmRate || ln.finalRate;
    if (n === Number(was)) return;
    updateLine(prId, lineId, { pmRate: n });
    const vsApproved = n > ln.finalRate ? ` — ABOVE the approved rate of ${fmtRate(ln.finalRate)} by ${fmtRate(n - ln.finalRate)}`
      : n < ln.finalRate ? ` (approved rate ${fmtRate(ln.finalRate)})` : " (back to the approved rate)";
    logAudit(`Purchase Manager changed the rate of "${ln.itemName}" (${prId}) from ${fmtRate(was)} to ${fmtRate(n)}${vsApproved}.`);
  }

  /* What changing a requisition line to `n` means, or null when there is no change. */
  function qtyChange(ln, n) {
    const was = Number(ln.finalQty) || 0;
    if (isNaN(n) || n <= 0 || n === was) return null;
    const delta = n - was;
    const item = ln.itemId ? items.find((i) => i.id === ln.itemId) : null;
    const unit = unitOf(ln, item);
    const abs = Math.abs(delta);
    return {
      was, n, delta, unit, itemId: item ? item.id : null,
      note: delta < 0
        ? item ? `${fmtNum(abs)} ${unit} back to the item's approved balance` : `${fmtINR(abs * ln.finalRate)} back to the "${ln.headName}" budget head`
        : item ? `${fmtNum(abs)} ${unit} added to the item's committed quantity` : `${fmtINR(abs * ln.finalRate)} added to the "${ln.headName}" committed value`,
    };
  }

  /* Apply a quantity change while keeping committed quantities aligned. */
  function applyQtyChange(prId, ln, q) {
    const baseVpQty = ln.vpQty ?? q.was;
    updateLine(prId, ln.lineId, { finalQty: q.n, vpQty: baseVpQty === q.n ? undefined : baseVpQty });
    if (q.itemId) {
      setItems((prev) => prev.map((it) => it.id === q.itemId ? {
        ...it,
        committedQty: Math.max(0, (it.committedQty || 0) + q.delta),
        committedVal: Math.max(0, (it.committedVal || 0) + q.delta * ln.finalRate),
      } : it));
    }
  }

  /* Before the PO; once a line is on a PO its quantity is changed through Edit PO, so the two stay equal. */
  function pmSetQty(prId, lineId, qty) {
    const ln = getLine(prId, lineId);
    if (!ln || (ln.status !== "Pending Purchase Manager" && ln.status !== "Ready for PO")) return;
    const q = qtyChange(ln, Number(qty));
    if (!q) return;
    applyQtyChange(prId, ln, q);
    logAudit(`Purchase Manager changed the quantity of "${ln.itemName}" (${prId}) from ${fmtNum(q.was)} to ${fmtNum(q.n)} ${q.unit} — ${q.note}.`);
  }

  /* A budget item counts in one unit, so its unit can change only while no PO carries the item in
     the old one: a PO goes out to the supplier as printed. The line itself, on the PO being edited,
     doesn't count. The reason it can't, or null when it can. */
  function unitChangeBlock(ln) {
    if (!ln || !ln.itemId) return null;
    const onPOs = [...new Set(allLines.filter((l) => l.itemId === ln.itemId && l.poId && l.lineId !== ln.lineId).map((l) => l.poId))];
    if (!onPOs.length) return null;
    return `"${ln.itemName}" is already on ${onPOs.join(", ")} in ${unitOf(ln, items.find((i) => i.id === ln.itemId))}, so its unit can't change now.`;
  }
  const unitBlock = (prId, lineId) => unitChangeBlock(getLine(prId, lineId));

  /* Some things are bought by length or weight, not by the piece: curtain cloth goes by the metre.
     The Purchase Manager picks the unit and types the quantity in it. That fixes the ratio (10 Nos →
     150 Mtr is 15 Mtr to the Nos); the amount stays what it was, so every rate is divided by the
     same ratio. What changing `ln` to `to` at quantity `qty` means, or null when it is no change. */
  function unitChange(ln, to, qty) {
    const item = ln.itemId ? items.find((i) => i.id === ln.itemId) : null;
    const from = unitOf(ln, item);
    const was = Number(ln.finalQty) || 0;
    const n = Number(qty);
    if (!to || to === from || isNaN(n) || n <= 0 || was <= 0) return null;
    return { from, to, was, n, f: n / was, rate: ln.pmRate || ln.finalRate, itemId: item ? item.id : null };
  }

  /* Apply it. The budget item (approved quantity, balance, rate, committed quantity) and every
     requisition line for it convert along with this one, so balances stay in one unit; no value
     moves. An unbudgeted line has only itself to convert. The line keeps what it was as unitWas. */
  function applyUnitChange(prId, ln, u) {
    const q = (v) => (typeof v === "number" ? Math.round(v * u.f * 1000) / 1000 : v);
    const r = (v) => (typeof v === "number" ? v / u.f : v);
    const isThis = (pr, l) => pr.id === prId && l.lineId === ln.lineId;
    const touches = (pr, l) => isThis(pr, l) || (u.itemId && l.itemId === u.itemId);
    setPrs((prev) => prev.map((pr) => !pr.lines.some((l) => touches(pr, l)) ? pr : {
      ...pr,
      lines: pr.lines.map((l) => {
        if (!touches(pr, l)) return l;
        const next = {
          ...l, unit: u.to,
          requestedQty: q(l.requestedQty), requestedRate: r(l.requestedRate),
          approvedQty: q(l.approvedQty), approvedRate: r(l.approvedRate),
          finalQty: q(l.finalQty), finalRate: r(l.finalRate), pmRate: r(l.pmRate),
          vpQty: q(l.vpQty), qtyReceived: q(l.qtyReceived),
        };
        if (!isThis(pr, l)) return next;
        // changed back to the unit it started in: nothing left to show
        const unitWas = l.unitWas ? (l.unitWas.unit === u.to ? undefined : l.unitWas) : { unit: u.from, qty: u.was };
        return { ...next, finalQty: u.n, unitWas };
      }),
    }));
    if (u.itemId) {
      setItems((prev) => prev.map((it) => it.id !== u.itemId ? it : {
        ...it, unit: u.to, qty: q(it.qty), bal: q(it.bal), stock: q(it.stock), rate: r(it.rate), committedQty: q(it.committedQty),
      }));
    }
  }

  /* "from Nos to Mtr: 10 Nos → 150 Mtr, rate ₹2,000 per Nos → ₹133.33 per Mtr, amount unchanged at ₹20,000; …" */
  function unitNote(u) {
    return `from ${u.from} to ${u.to}: ${fmtNum(u.was)} ${u.from} → ${fmtNum(u.n)} ${u.to}, rate ${fmtRate(u.rate)} per ${u.from} → ${fmtRate(u.rate / u.f)} per ${u.to}, amount unchanged at ${fmtINR(u.was * u.rate)}`
      + (u.itemId ? `; the budget item and its other requisitions now count in ${u.to} too (1 ${u.from} = ${fmtNum(u.f)} ${u.to})` : "");
  }

  /* Before the PO, like a quantity cut; once a line is on a PO its unit is changed through Edit PO. */
  function pmSetUnit(prId, lineId, unit, qty) {
    const ln = getLine(prId, lineId);
    if (!ln || (ln.status !== "Pending Purchase Manager" && ln.status !== "Ready for PO") || unitChangeBlock(ln)) return;
    const u = unitChange(ln, unit, qty);
    if (!u) return;
    applyUnitChange(prId, ln, u);
    logAudit(`Purchase Manager changed the unit of "${ln.itemName}" (${prId}) ${unitNote(u)}.`);
  }

  function pmMarkReady(prId, lineId) {
    const ln = getLine(prId, lineId);
    if (!ln) return;
    updateLine(prId, lineId, { status: "Ready for PO" });
    const rate = ln.pmRate || ln.finalRate;
    logAudit(`"${ln.itemName}" (${prId}) marked Ready for PO by Purchase Manager at ${fmtRate(rate)}${rate > ln.finalRate ? ` (above the approved rate of ${fmtRate(ln.finalRate)})` : ""}.`);
  }

  /* ---------- PO / delivery / GRN actions ---------- */
  function issuePO({
    lineRefs, supplier, supplierAddress, supplierGstin, supplierState, supplierContact,
    invoiceTo, consignee, referenceNo, paymentTerms, otherReferences, deliveryTerms, deliveryDate,
    dispatchThrough, destination, discountPct, gstPct, gstType, lineGst,
  }) {
    if (!lineRefs.length) return null;
    const poId = `PO-CPA-${padNum(poCounter, 4)}`;
    setPoCounter((c) => c + 1);
    const lineSnapshots = lineRefs.map(({ prId, lineId }) => {
      const ln = getLine(prId, lineId);
      const item = ln.itemId ? items.find((i) => i.id === ln.itemId) : null;
      const rate = ln.pmRate || ln.finalRate;
      const ownGst = lineGst?.[`${prId}::${lineId}`];
      return {
        prId, lineId, itemName: ln.itemName,
        // what was actually requisitioned, falling back to the approved budget line
        brand: ln.proposedBrand || (item && item.brand) || "",
        spec: ln.proposedModel || (item && item.spec) || "",
        qty: ln.finalQty, rate, amount: ln.finalQty * rate, unit: unitOf(ln, item), qtyReceived: 0,
        // null: taxed at the order's GST rate
        gstPct: ownGst === undefined || ownGst === null ? null : Number(ownGst) || 0,
      };
    });
    const po = {
      id: poId, dated: nowStamp(), datedISO: todayISO(),
      supplier, supplierAddress: supplierAddress || "", supplierGstin: supplierGstin || "", supplierState: supplierState || "", supplierContact: supplierContact || "",
      invoiceTo, consignee,
      referenceNo: referenceNo || "", paymentTerms, otherReferences: otherReferences || "", deliveryTerms,
      deliveryDate, dispatchThrough: dispatchThrough || "", destination: destination || "",
      discountPct: Number(discountPct) || 0, gstPct: Number(gstPct) || 0, gstType: gstType === "IGST" ? "IGST" : "CGST_SGST",
      lines: lineSnapshots, status: "Issued",
      signatures: { vp: null, president: null, purchaseManager: null },
    };
    setPos((prev) => [po, ...prev]);
    lineRefs.forEach(({ prId, lineId }) => updateLine(prId, lineId, { status: "PO Issued", poId }));
    logAudit(`${poId} issued by Purchase Manager for ${lineSnapshots.length} line item(s) from supplier "${supplier}", expected delivery ${deliveryDate || "TBD"}.`);
    return po;
  }

  /* Correct the header of an issued PO (supplier, voucher details, discount, GST), the GST rate of
     single items (`fields.lineGst`, keyed "prId::lineId"; an item left out follows the order's rate)
     and the rate of single items (`fields.lineRate`, same keys). A new rate is copied back to the
     requisition line as its PM rate; like on the Purchase Manager tab it may go above the approved
     rate, flagged in the audit trail. A quantity (`fields.lineQty`, same keys) may go up or down:
     the change is copied back to the requisition line and the item's commitment delta — unless
     the item is given a new unit (`fields.lineUnit`, same keys), when the quantity is the one in
     that unit and the rate follows so the amount stays (see unitChange). Any
     signatures were given on the old content, so a real change clears them and the PO has to be
     signed again. Once goods have been received against the PO it is locked: nobody, admin
     included, can edit it. */
  function updatePO(poId, fields) {
    const po = pos.find((p) => p.id === poId);
    if (!po) return null;
    if (poIsLocked(po)) {
      logAudit(`${whoLabel} attempted to edit ${poId} after goods were received against it — rejected by system (a received PO is locked).`);
      return po;
    }
    const patch = {};
    Object.keys(PO_EDITABLE).forEach((k) => {
      if (fields[k] === undefined) return;
      if (k === "discountPct" || k === "gstPct") patch[k] = Number(fields[k]) || 0;
      else if (k === "gstType") patch[k] = fields[k] === "IGST" ? "IGST" : "CGST_SGST";
      else patch[k] = String(fields[k]);
    });
    const current = (k) => (k === "discountPct" || k === "gstPct") ? Number(po[k]) || 0
      : k === "gstType" ? (po[k] === "IGST" ? "IGST" : "CGST_SGST")
      : String(po[k] ?? "");
    const changed = Object.keys(patch).filter((k) => patch[k] !== current(k)).map((k) => PO_EDITABLE[k]);
    let lines = po.lines;
    if (fields.lineGst) {
      lines = lines.map((l) => {
        const own = fields.lineGst[`${l.prId}::${l.lineId}`];
        const want = own === undefined || own === null ? null : Number(own) || 0;
        const had = lineHasOwnGst(l) ? Number(l.gstPct) || 0 : null;
        if (want === had) return l;
        changed.push(`GST rate on "${l.itemName}" (${had === null ? "order rate" : `${had}%`} → ${want === null ? "order rate" : `${want}%`})`);
        return { ...l, gstPct: want };
      });
    }
    // a new unit goes first: the quantity typed is in that unit, and the rate follows so the amount stays
    const unitChanges = [];
    const converted = new Set();
    if (fields.lineUnit) {
      lines = lines.map((l) => {
        const key = `${l.prId}::${l.lineId}`;
        const ln = getLine(l.prId, l.lineId);
        const to = fields.lineUnit[key];
        if (!ln || !to || to === (l.unit || "Nos") || unitChangeBlock(ln)) return l;
        const u = unitChange(ln, to, fields.lineQty?.[key]);
        if (!u) return l;
        changed.push(`unit of "${l.itemName}" (${unitNote(u)})`);
        unitChanges.push({ prId: l.prId, ln, u });
        converted.add(key);
        return { ...l, unit: u.to, qty: u.n, rate: (Number(l.rate) || 0) / u.f };
      });
    }
    const rateChanges = [];
    if (fields.lineRate) {
      lines = lines.map((l) => {
        if (converted.has(`${l.prId}::${l.lineId}`)) return l;
        const n = Number(fields.lineRate[`${l.prId}::${l.lineId}`]);
        // a missing or non-positive rate leaves the item as it was; the form shows rates to the paisa
        if (isNaN(n) || n <= 0 || round2(n) === round2(l.rate)) return l;
        const approved = Number(getLine(l.prId, l.lineId)?.finalRate) || 0;
        const vsApproved = !approved ? "" : n > approved ? ` — ABOVE the approved rate of ${fmtRate(approved)} by ${fmtRate(n - approved)}`
          : n < approved ? ` (approved rate ${fmtRate(approved)})` : " (back to the approved rate)";
        changed.push(`rate of "${l.itemName}" (${fmtRate(l.rate)} → ${fmtRate(n)}${vsApproved})`);
        rateChanges.push({ prId: l.prId, lineId: l.lineId, rate: n });
        return { ...l, rate: n, amount: (Number(l.qty) || 0) * n };
      });
    }
    const qtyChanges = [];
    if (fields.lineQty) {
      lines = lines.map((l) => {
        if (converted.has(`${l.prId}::${l.lineId}`)) return l;
        const ln = getLine(l.prId, l.lineId);
        const n = Number(fields.lineQty[`${l.prId}::${l.lineId}`]);
        const q = ln ? qtyChange(ln, n) : null;
        if (!q) return l;
        changed.push(`quantity of "${l.itemName}" (${fmtNum(q.was)} → ${fmtNum(q.n)} ${q.unit}, ${q.note})`);
        qtyChanges.push({ prId: l.prId, ln, q });
        return { ...l, qty: q.n, amount: q.n * (Number(l.rate) || 0) };
      });
    }
    if (!changed.length) return po;
    const signed = Object.values(po.signatures || {}).filter(Boolean).length;
    const next = {
      ...po, ...patch, lines,
      signatures: signed ? { vp: null, president: null, purchaseManager: null } : po.signatures,
      editedBy: whoLabel, editedAt: nowStamp(),
    };
    setPos((prev) => prev.map((p) => p.id === poId ? next : p));
    // the pipeline values a line at its PM rate, so keep it equal to what the PO now says
    unitChanges.forEach(({ prId, ln, u }) => applyUnitChange(prId, ln, u));
    rateChanges.forEach(({ prId, lineId, rate }) => updateLine(prId, lineId, { pmRate: rate }));
    qtyChanges.forEach(({ prId, ln, q }) => applyQtyChange(prId, ln, q));
    logAudit(`${poId} edited by ${whoLabel}: ${changed.join(", ")} changed.${signed ? ` ${signed} signature(s) cleared — PO must be re-signed.` : ""}`);
    return next;
  }

  function signPO(poId, roleKey) {
    if (roleKey !== signAs) return; // each signs only their own box
    setPos((prev) => prev.map((po) => po.id === poId ? {
      ...po, signatures: { ...po.signatures, [roleKey]: { by: currentUser.name, date: nowStamp() } },
    } : po));
    logAudit(`${poId} digitally signed by ${whoLabel}.`);
  }

  function recordGRN({ poId, billNo, billDate, receivedDate, lines, transport }) {
    const grnId = `GRN-CPA-${padNum(grns.length + 1, 4)}`;
    const grn = { id: grnId, poId, billNo, billDate, receivedDate, lines, transport: transport || null, recordedBy: whoLabel, ts: nowStamp() };
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
    logAudit(`${grnId} recorded against ${poId} (Bill No. ${billNo || "—"}, dated ${billDate || "—"}): ${lines.length} line item(s) received.${transport ? ` ${transportNote(transport)}.` : ""}`);
    return grn;
  }

  /* "Transport ₹1,500 + IGST @ 5% = ₹1,575 (ABC Roadlines)" for the audit trail. */
  function transportNote(transport) {
    const tr = computeTransport(transport);
    return `Transport ${fmtINR(tr.amount)}${tr.gstPct > 0 ? ` + ${tr.gstType === "IGST" ? "IGST" : "CGST/SGST"} @ ${tr.gstPct}% = ${fmtINR(tr.total)}` : ""}${transport.transporter ? ` (${transport.transporter})` : ""}`;
  }

  /* Add, correct or remove (transport = null) the freight on a GRN that is already recorded — the
     transport bill often turns up after the goods have been received. */
  function updateGRNTransport(grnId, transport) {
    const grn = grns.find((g) => g.id === grnId);
    if (!grn) return;
    const next = transport || null;
    if (!next && !grn.transport) return;
    setGrns((prev) => prev.map((g) => g.id === grnId ? { ...g, transport: next, transportEditedBy: whoLabel, transportEditedAt: nowStamp() } : g));
    if (!next) logAudit(`${grnId} (${grn.poId}): transport charge removed by ${whoLabel} — was ${transportNote(grn.transport)}.`);
    else logAudit(`${grnId} (${grn.poId}): transport charge ${grn.transport ? "corrected" : "added"} by ${whoLabel}. ${transportNote(next)}${grn.transport ? ` — was ${transportNote(grn.transport)}` : ""}.`);
  }

  // POs issued before brand/spec were snapshotted: fill them in from the requisition line for display.
  const posForView = useMemo(() => pos.map((po) => {
    if (po.lines.every((l) => l.brand !== undefined && l.spec !== undefined)) return po;
    return {
      ...po,
      lines: po.lines.map((l) => {
        if (l.brand !== undefined && l.spec !== undefined) return l;
        const pr = prs.find((p) => p.id === l.prId);
        const ln = pr ? pr.lines.find((x) => x.lineId === l.lineId) : null;
        const item = ln && ln.itemId ? items.find((i) => i.id === ln.itemId) : null;
        return { ...l, brand: (ln && ln.proposedBrand) || (item && item.brand) || "", spec: (ln && ln.proposedModel) || (item && item.spec) || "" };
      }),
    };
  }), [pos, prs, items]);

  /* ---------- shared bits ---------- */
  // every login sees every tab; data/access.js decides which of them it can change
  const TABS = [
    { id: "dashboard", label: "Executive Dashboard" },
    { id: "freeze", label: "Budget Review & Freeze" },
    { id: "itemstatus", label: "Approved & Pending Items" },
    { id: "raisepr", label: "Raise Purchase Requisition" },
    { id: "vpdesk", label: "VP's Desk" },
    { id: "president2nd", label: "President's 2nd Approval" },
    { id: "pmqueue", label: "Purchase Manager" },
    { id: "issuepo", label: "Issue PO" },
    { id: "calendar", label: "Delivery Calendar" },
    { id: "receive", label: "Receive Material (GRN)" },
    { id: "reports", label: "Reports" },
    { id: "audit", label: "Audit Trail" },
    { id: "demo", label: "Demo Scenarios" },
  ];

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
          {TABS.map((t) => {
            // a waiting count is a to-do, so it shows only to whoever can act on that tab
            let badge = "";
            if (t.id === "vpdesk" && pendingVPCount && canEdit(t.id)) badge = ` (${pendingVPCount})`;
            if (t.id === "president2nd" && pendingPresidentCount && canEdit(t.id)) badge = ` (${pendingPresidentCount})`;
            if (t.id === "pmqueue" && pendingPMCount && canEdit(t.id)) badge = ` (${pendingPMCount})`;
            if (t.id === "issuepo" && readyForPOCount && canEdit(t.id)) badge = ` (${readyForPOCount})`;
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
        {syncNotes.unsaved && (
          <div style={{ background: "#FCEAEA", border: `1px solid ${C.red}`, borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 12.5, color: C.red, fontWeight: 600 }}>
            {syncNotes.unsaved}
          </div>
        )}
        {syncNotes.clash && (
          <div style={{ background: "#FDF2E3", border: `1px solid ${C.amber}`, borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 12.5, color: C.amber, fontWeight: 600, display: "flex", gap: 12, alignItems: "flex-start", justifyContent: "space-between" }}>
            <span>{syncNotes.clash}</span>
            <button onClick={() => setSyncNotes((m) => ({ ...m, clash: null }))} style={{ background: "transparent", border: `1px solid ${C.amber}`, color: C.amber, borderRadius: 6, padding: "2px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>OK</button>
          </div>
        )}
        {readOnly && (
          <div style={{ background: "#FDF2E3", border: `1px solid ${C.gold}`, borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 12.5, color: C.amber, fontWeight: 600 }}>
            View-only access — every screen is open to you, but nothing can be added, edited, approved, signed or received from this login.
          </div>
        )}
        {!readOnly && ACTION_TABS.has(tab) && !canEdit(tab) && (
          <div style={{ background: "#EAF0FB", border: "1px solid #C7D6EF", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 12.5, color: C.blue, fontWeight: 600 }}>
            View only — your login can see this screen but not change anything on it{tab === "issuepo" && signAs ? ", apart from signing your own box on a PO" : ""}.
          </div>
        )}
        {tab === "dashboard" && (
          <DashboardTab {...{ HEADS, headFreeze, headItemTotal, headCommitted, headIncomplete, reconColor, cardStyle, setTab, setSelectedHead, budgetApproved, budgetCommitted, allLines, grns, tolerancePct }}
            pos={posForView} canOpenFreeze canOpenTab={() => true} />
        )}
        {tab === "freeze" && (
          <>
            {canEdit("freeze") && <VPImportPanel {...{ HEADS, importVPItems, cardStyle }} />}
            <FreezeTab {...{ HEADS, headFreeze, freezeHead, selectedHead, setSelectedHead, filteredItems, deletedItemsForHead, updateItem, setItemApproval, updateItemBrand, query, setQuery, subCategoryFilter, setSubCategoryFilter, subCategoryOptions, cardStyle, reconColor, headItemTotal, headIncomplete, headCommitted, tolerancePct, setTolerancePct, secondApprovalPct, setSecondApprovalPct, setHeadCeiling, deleteItems, restoreItem, moveItemsToHead, renameItemName, renameCategoryBulk }} readOnly={!canEdit("freeze")} />
          </>
        )}
        {tab === "itemstatus" && (
          <ItemStatusTab {...{ HEADS, items, allLines, pos, grns, audit, cardStyle }} />
        )}
        {tab === "raisepr" && (
          <RaisePRTab {...{ HEADS, approvedItemsForPR, pendingQtyByItem, submitBundledPR, cardStyle, currentUser }} readOnly={!canEdit("raisepr")} />
        )}
        {tab === "vpdesk" && (
          <VPDeskTab {...{ prs, items, vpDecideLine, cardStyle, tolerancePct, secondApprovalPct }} readOnly={!canEdit("vpdesk")} />
        )}
        {tab === "president2nd" && (
          <PresidentSecondApprovalTab {...{ prs, items, presidentDecideLine, cardStyle, secondApprovalPct }} readOnly={!canEdit("president2nd")} />
        )}
        {tab === "pmqueue" && (
          <PurchaseManagerTab {...{ prs, pmSetRate, pmSetQty, pmSetUnit, unitBlock, pmMarkReady, cardStyle }} readOnly={!canEdit("pmqueue")} />
        )}
        {tab === "issuepo" && (
          <IssuePOTab {...{ allLines, issuePO, updatePO, signPO, signAs, unitBlock, cardStyle }} readOnly={!canEdit("issuepo")} pos={posForView} />
        )}
        {tab === "calendar" && (
          <DeliveryCalendarTab {...{ cardStyle, signPO, signAs }} pos={posForView} />
        )}
        {tab === "receive" && (
          <ReceiveGoodsTab {...{ pos, recordGRN, updateGRNTransport, grns, cardStyle }} readOnly={!canEdit("receive")} />
        )}
        {tab === "reports" && (
          <ReportsTab {...{ HEADS, headFreeze, items, allLines, grns, cardStyle }} pos={posForView} />
        )}
        {tab === "audit" && (
          <AuditTab {...{ audit, cardStyle }} />
        )}
        {tab === "demo" && (
          <DemoTab {...{ items, HEADS, headFreeze, freezeHead, submitBundledPR, vpDecideLine, setTab, cardStyle }} readOnly={!canEdit("demo")} />
        )}
      </div>
    </div>
  );
}
