import React, { useState, useMemo, useCallback } from "react";
import { BASE_HEADS } from "./data/heads.js";
import { api } from "./api.js";
import { fmtINR, fmtNum, nowStamp, uid } from "./utils/format.js";
import { evaluatePR } from "./utils/evaluatePR.js";
import { C } from "./theme.js";
import DashboardTab from "./components/tabs/DashboardTab.jsx";
import FreezeTab from "./components/tabs/FreezeTab.jsx";
import RaisePRTab from "./components/tabs/RaisePRTab.jsx";
import QueueTab from "./components/tabs/QueueTab.jsx";
import ExceptionsTab from "./components/tabs/ExceptionsTab.jsx";
import AuditTab from "./components/tabs/AuditTab.jsx";
import DemoTab from "./components/tabs/DemoTab.jsx";

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

export default function BudgetApp({ currentUser, onLogout }) {
  const role = currentUser.role;
  const [tolerancePct, setTolerancePct] = useState(5);
  const [tab, setTab] = useState("dashboard");
  const [query, setQuery] = useState("");
  const [ceilOverrides, setCeilOverrides] = useState({});
  const HEADS = useMemo(
    () => BASE_HEADS.map((h) => ({ ...h, ceil: ceilOverrides[h.name] !== undefined ? ceilOverrides[h.name] : h.ceil })),
    [ceilOverrides]
  );
  const [selectedHead, setSelectedHead] = useState(HEADS[0].name);
  const [subCategoryFilter, setSubCategoryFilter] = useState("All");

  // working copy of items (loaded from the API / MongoDB)
  const [items, setItems] = useState([]);
  const [headFreeze, setHeadFreeze] = useState({});
  const [prs, setPrs] = useState([]);
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
        setAudit(s.audit || []);
        setHeadFreeze(s.headFreeze || {});
        setCeilOverrides(s.ceilOverrides || {});
        if (typeof s.tolerancePct === "number") setTolerancePct(s.tolerancePct);
        setLoaded(true);
      })
      .catch((err) => { if (alive) setLoadError(err.message); });
    return () => { alive = false; };
  }, []);

  useAutosave("items", items, loaded);
  useAutosave("prs", prs, loaded);
  useAutosave("audit", audit, loaded);
  useAutosave("headFreeze", headFreeze, loaded);
  useAutosave("ceilOverrides", ceilOverrides, loaded);
  useAutosave("tolerancePct", tolerancePct, loaded);

  const logAudit = useCallback((text, who) => {
    setAudit((a) => [{ ts: nowStamp(), who: who || role, text }, ...a]);
  }, [role]);

  // per-head committed totals (from approved item values consumed by PRs)
  const COMMITTED_STATUSES = ["Auto-Approved", "President-Approved", "Ready for PO", "PO Issued", "Closed"];
  const headCommitted = useMemo(() => {
    const o = {};
    HEADS.forEach((h) => (o[h.name] = 0));
    items.forEach((it) => { if (!it.deleted) o[it.head] = (o[it.head] || 0) + (it.committedVal || 0); });
    prs.forEach((p) => {
      if (!p.itemId && p.headName && COMMITTED_STATUSES.includes(p.status)) {
        o[p.headName] = (o[p.headName] || 0) + (p.value || 0);
      }
    });
    return o;
  }, [items, prs]);

  const headItemTotal = useMemo(() => {
    const o = {};
    HEADS.forEach((h) => (o[h.name] = 0));
    items.forEach((it) => { if (!it.deleted) o[it.head] = (o[it.head] || 0) + (it.val || 0); });
    return o;
  }, [items]);

  const headIncomplete = useMemo(() => {
    const o = {};
    HEADS.forEach((h) => (o[h.name] = 0));
    items.forEach((it) => { if (!it.deleted && it.status !== "Complete") o[it.head] = (o[it.head] || 0) + 1; });
    return o;
  }, [items]);

  function reconColor(headName) {
    const state = headFreeze[headName];
    if (state === "Not Frozen") return "grey";
    const total = headItemTotal[headName];
    const ceil = HEADS.find((h) => h.name === headName).ceil;
    if (headIncomplete[headName] > 0 && state !== "Lump-Sum Frozen") return "amber";
    if (total > ceil) return "red";
    return "green";
  }

  const execTotals = useMemo(() => {
    let frozen = 0, provisional = 0, autoVal = 0, presVal = 0, committed = 0;
    HEADS.forEach((h) => {
      if (headFreeze[h.name] === "Fully Frozen") frozen += h.ceil;
      if (headFreeze[h.name] === "Provisionally Frozen") provisional += h.ceil;
    });
    prs.forEach((p) => {
      if (p.status === "Auto-Approved" || p.status.startsWith("Ready") || p.status === "PO Issued" || p.status === "Closed") autoVal += p.autoApproved ? p.value : 0;
      if (!p.autoApproved && (p.status === "President-Approved" || p.status === "Ready for PO" || p.status === "PO Issued" || p.status === "Closed")) presVal += p.value;
    });
    committed = Object.values(headCommitted).reduce((a, b) => a + b, 0);
    return { frozen, provisional, autoVal, presVal, committed };
  }, [headFreeze, prs, headCommitted]);
  /* ---------- actions ---------- */
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
    logAudit(`Deleted ${ids.length} item(s): ${names.join(", ")}. Recoverable from Audit Trail via restore.`, "President (Arjun Arora)");
  }

  function restoreItem(id) {
    const it = items.find((i) => i.id === id);
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, deleted: false } : i)));
    logAudit(`Restored deleted item "${it ? it.name : id}".`, "President (Arjun Arora)");
  }

  function moveItemsToHead(ids, newHeadName) {
    if (!ids.length || !newHeadName) return;
    const newHead = HEADS.find((h) => h.name === newHeadName);
    const moved = items.filter((it) => ids.includes(it.id));
    const fromHeads = [...new Set(moved.map((it) => it.head))].join(", ");
    setItems((prev) => prev.map((it) => ids.includes(it.id) ? {
      ...it, head: newHeadName, dept: newHead.dept, ceil: newHead.ceil,
    } : it));
    logAudit(`Moved ${ids.length} item(s) from ${fromHeads} to "${newHeadName}": ${moved.map((it) => it.name).join(", ")}. Value counts against "${newHeadName}" ceiling immediately.`, "President (Arjun Arora)");
  }

  function renameItemName(id, newName) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, name: newName } : it)));
    logAudit(`Item ${id} renamed to "${newName}".`, "President (Arjun Arora)");
  }

  function renameCategoryBulk(ids, newCategory) {
    if (!ids.length || !newCategory) return;
    setItems((prev) => prev.map((it) => (ids.includes(it.id) ? { ...it, sub: newCategory } : it)));
    logAudit(`Renamed category to "${newCategory}" for ${ids.length} item(s).`, "President (Arjun Arora)");
  }

  function freezeHead(headName, state) {
    setHeadFreeze((prev) => ({ ...prev, [headName]: state }));
    setItems((prev) => prev.map((it) => (it.head === headName ? { ...it, freezeState: state } : it)));
    logAudit(`Budget head "${headName}" ${prev_action(state)}. Original approved values locked; a revision record will be created for any future edit.`, "President (Arjun Arora)");
  }
  function prev_action(state) {
    if (state === "Fully Frozen") return "FULLY FROZEN";
    if (state === "Provisionally Frozen") return "PROVISIONALLY FROZEN";
    if (state === "Lump-Sum Frozen") return "FROZEN AS LUMP-SUM (item-level PRs require case-by-case approval)";
    return "marked NOT APPROVED";
  }

  function setHeadCeiling(headName, newCeil) {
    const n = Number(newCeil);
    if (isNaN(n) || n < 0) return;
    setCeilOverrides((prev) => ({ ...prev, [headName]: n }));
    logAudit(`Budget head "${headName}" ceiling changed to ${fmtINR(n)}.`, "President (Arjun Arora)");
  }

  function submitPR({ itemId, requestedQty, requestedRate, requestedBy, dept, justification, urgency, requiredBy, unbudgetedName, unbudgetedHead, specChanged, brandChanged, vendorDetails, modelDetails, proposedBrand }) {
    const item = items.find((i) => i.id === itemId);
    const chargeHeadName = item ? item.head : unbudgetedHead;
    const head = { ceiling: HEADS.find((h) => h.name === chargeHeadName)?.ceil, committed: headCommitted[chargeHeadName] };
    let result;
    if (!item) {
      const catRemaining = (head.ceiling || 0) - (head.committed || 0);
      result = {
        decision: "escalate", reasonCode: "Unbudgeted Item",
        detail: `"${unbudgetedName}" does not exist anywhere in the frozen pre-opening item list. Requested to be charged against "${chargeHeadName}" (available balance: ${fmtINR(catRemaining)} of ${fmtINR(head.ceiling)}).`,
      };
    } else {
      result = evaluatePR(item, head, Number(requestedQty), Number(requestedRate), tolerancePct, specChanged, brandChanged);
    }
    const pr = {
      id: uid("PR"),
      itemId: item ? item.id : null,
      itemName: item ? item.name : unbudgetedName,
      headName: chargeHeadName,
      requestedQty: Number(requestedQty) || 0,
      requestedRate: Number(requestedRate) || 0,
      value: (Number(requestedQty) || 0) * (Number(requestedRate) || 0),
      requestedBy, dept, justification, urgency, requiredBy,
      vendorDetails: vendorDetails || "", modelDetails: modelDetails || "", proposedBrand: proposedBrand || "",
      submittedAt: nowStamp(),
      autoApproved: result.decision === "auto",
      status: result.decision === "auto" ? "Auto-Approved" : "Pending President",
      reasonCode: result.reasonCode,
      detail: result.detail,
      approvedQty: item ? item.qty : null,
      approvedRate: item ? item.rate : null,

      frozenSpec: item ? item.spec : null,
      decisionLog: [],
    };
    setPrs((prev) => [pr, ...prev]);
    if (result.decision === "auto" && item) {
      setItems((prev) => prev.map((it) => it.id === item.id ? {
        ...it,
        committedQty: (it.committedQty || 0) + pr.requestedQty,
        committedVal: (it.committedVal || 0) + pr.value,
      } : it));
      logAudit(`PR ${pr.id} for "${pr.itemName}" (${fmtNum(pr.requestedQty)} ${item.unit || "Nos"} @ ${fmtINR(pr.requestedRate)}) AUTO-APPROVED — within frozen pre-opening budget. Routed directly to Purchase Manager.`);
    } else {
      logAudit(`PR ${pr.id} for "${pr.itemName}" escalated to President — ${pr.reasonCode}.`);
    }
    return pr;
  }

  function presidentDecide(prId, decision, note) {
    setPrs((prev) => prev.map((p) => {
      if (p.id !== prId) return p;
      const approved = decision === "Approve" || decision === "Approve with Conditions" || decision === "Approve Revised Quantity" || decision === "Approve Revised Rate" || decision === "Approve Budget Transfer";
      const newStatus = approved ? "President-Approved" : (decision === "Reject" ? "Rejected" : decision === "Defer" ? "Deferred" : "Returned for Clarification");
      if (approved) {
        setItems((prevItems) => prevItems.map((it) => it.id === p.itemId ? {
          ...it,
          committedQty: (it.committedQty || 0) + p.requestedQty,
          committedVal: (it.committedVal || 0) + p.value,
        } : it));
      }
      logAudit(`President decision on PR ${p.id} ("${p.itemName}"): ${decision}${note ? " — " + note : ""}.`, "President (Arjun Arora)");
      return { ...p, status: newStatus, decisionLog: [...p.decisionLog, { decision, note, ts: nowStamp() }] };
    }));
  }

  function purchaseAdvance(prId, newStatus) {
    setPrs((prev) => prev.map((p) => p.id === prId ? { ...p, status: newStatus } : p));
    logAudit(`PR moved to "${newStatus}" by Purchase Manager.`);
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

  const frozenItemsForPR = useMemo(() =>
    items.filter((it) => !it.deleted && it.freezeState !== "Not Frozen" && it.approvalStatus === "Approved" && it.status === "Complete"),
    [items]
  );

  const pendingExceptions = prs.filter((p) => p.status === "Pending President");
  /* ---------- shared bits ---------- */
  const TABS = [
    { id: "dashboard", label: "Executive Dashboard", roles: ["President", "Purchase Manager", "Department Head"] },
    { id: "freeze", label: "Budget Review & Freeze", roles: ["President"] },
    { id: "raisepr", label: "Raise Purchase Requisition", roles: ["Department Head", "President"] },
    { id: "queue", label: "Purchase Manager Queue", roles: ["Purchase Manager", "President"] },
    { id: "exceptions", label: "President's Exception Desk", roles: ["President"] },
    { id: "audit", label: "Audit Trail", roles: ["President", "Purchase Manager", "Department Head"] },
    { id: "demo", label: "Demo Scenarios", roles: ["President", "Purchase Manager", "Department Head"] },
  ];
  const visibleTabs = TABS.filter((t) => t.roles.includes(role));

  const cardStyle = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 18 };

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
              <div style={{ fontSize: 12.5, color: C.sub }}>Fetching items, requisitions and audit trail from the database.</div>
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
              Operating Goods Budget · Owner &amp; Final Exception Approver: <b style={{ color: "#fff" }}>Arjun Arora, President</b> · Source: CPA_PRE_OPENING_CAPEX_WORKSHEET_1
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
          {visibleTabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                background: tab === t.id ? C.gold : "rgba(255,255,255,0.08)",
                color: tab === t.id ? C.navy : "#E8ECF3",
                border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
              }}>{t.label}{t.id === "exceptions" && pendingExceptions.length > 0 ? ` (${pendingExceptions.length})` : ""}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: 22, maxWidth: 1400, margin: "0 auto" }}>
        {tab === "dashboard" && (
          <DashboardTab {...{ HEADS, headFreeze, headItemTotal, headCommitted, headIncomplete, reconColor, execTotals, prs, cardStyle, items, setTab, setSelectedHead }} />
        )}
        {tab === "freeze" && role === "President" && (
          <FreezeTab {...{ HEADS, headFreeze, freezeHead, selectedHead, setSelectedHead, filteredItems, deletedItemsForHead, updateItem, setItemApproval, query, setQuery, subCategoryFilter, setSubCategoryFilter, subCategoryOptions, cardStyle, reconColor, headItemTotal, headIncomplete, headCommitted, tolerancePct, setTolerancePct, setHeadCeiling, deleteItems, restoreItem, moveItemsToHead, renameItemName, renameCategoryBulk }} />
        )}
        {tab === "raisepr" && (
          <RaisePRTab {...{ HEADS, frozenItemsForPR, submitPR, cardStyle, tolerancePct, role }} />
        )}
        {tab === "queue" && (
          <QueueTab {...{ prs, purchaseAdvance, cardStyle }} />
        )}
        {tab === "exceptions" && role === "President" && (
          <ExceptionsTab {...{ pendingExceptions, presidentDecide, cardStyle, headCommitted, HEADS }} />
        )}
        {tab === "audit" && (
          <AuditTab {...{ audit, cardStyle }} />
        )}
        {tab === "demo" && (
          <DemoTab {...{ items, HEADS, headFreeze, freezeHead, setItemApproval, submitPR, setTab, cardStyle, tolerancePct }} />
        )}
      </div>
    </div>
  );
}
