import { unitOf } from "./units.js";
import { computeTransport } from "./po.js";
import { raisedLane } from "./classifyLine.js";

/* ---------- budget → requisition → PO → GRN roll-up ----------
   Everything the Reports tab, its Excel workbook and the Approved Items list show about how far an
   item has got, worked out in one place from the same state the other screens use, so the figures
   agree with the Dashboard (committed) and Raise PR (balance). Values are before GST. */

const num = (v) => Number(v) || 0;
const has = (v) => v !== undefined && v !== null && v !== "";

function pushUnique(list, v) {
  if (v && !list.includes(v)) list.push(v);
}

/* What can still be requisitioned against an item: its approved quantity less what the VP has
   approved (committed) and what is still waiting on the VP. The Balance on Raise PR; never below 0. */
export function remainingToOrder(item, pendingQty) {
  if (item.qty === null || item.qty === undefined || item.qty === "") return null;
  return Math.max(0, num(item.qty) - num(item.committedQty) - num(pendingQty));
}

/* A line whose quantity counts against the budget, the way BudgetApp commits it: the VP's approval
   commits a budget item (the President's rejection releases it again); an unbudgeted line counts
   against its head once the President approves it. */
export function lineCommits(l) {
  if (l.vpDecision !== "Approved" && l.vpDecision !== "Modified & Approved") return false;
  return l.itemId ? l.presidentDecision !== "Rejected" : l.presidentDecision === "Approved" || l.presidentDecision === "Modified & Approved";
}

/* Where a line stands, in words: its workflow status until it is on a PO, then how much has come in. */
function stageOf(l, poQty, receivedQty) {
  if (!l.poId) return l.status || "—";
  if (receivedQty <= 0) return "PO Issued";
  return receivedQty >= poQty ? "Received" : "Part Received";
}

/* One row per requisition line, with its PO line and every GRN taken against it. */
export function buildLineRows({ items, allLines, pos, grns }) {
  const itemById = new Map(items.map((it) => [it.id, it]));
  const onPO = new Map(); // "prId::lineId" -> { po, pl }
  pos.forEach((po) => (po.lines || []).forEach((pl) => onPO.set(`${pl.prId}::${pl.lineId}`, { po, pl })));
  const receipts = new Map(); // "poId::lineId" -> [{ id, billNo, billDate, receivedDate, qty }]
  grns.forEach((g) => (g.lines || []).forEach((gl) => {
    const k = `${g.poId}::${gl.lineId}`;
    if (!receipts.has(k)) receipts.set(k, []);
    receipts.get(k).push({ id: g.id, billNo: g.billNo || "", billDate: g.billDate || "", receivedDate: g.receivedDate || "", qty: num(gl.qtyReceived), recordedBy: g.recordedBy || "", ts: g.ts || "" });
  }));

  return allLines.map((l) => {
    const item = l.itemId ? itemById.get(l.itemId) : null;
    const po = l.poId ? onPO.get(`${l.prId}::${l.lineId}`) : null;
    const poQty = po ? num(po.pl.qty) : 0;
    const poRate = po ? num(po.pl.rate) : 0;
    const receivedQty = num(l.qtyReceived);
    const toReceive = po ? Math.max(0, poQty - receivedQty) : 0;
    return {
      prId: l.prId, lineId: l.lineId, submittedAt: l.submittedAt || "", raisedBy: l.raisedBy || "", dept: l.dept || "",
      urgency: l.urgency || "", requiredBy: l.requiredBy || "",
      itemId: l.itemId || null, itemName: l.itemName || "",
      // a budget item may have been moved to another head since; it counts where it is now
      head: item ? item.head : l.headName || "",
      brand: l.proposedBrand || (item && item.brand) || "", spec: l.proposedModel || (item && item.spec) || "",
      unit: unitOf(l, item),
      budgetQty: item ? item.qty : null, budgetRate: item ? item.rate : null,
      requestedQty: num(l.requestedQty), requestedRate: num(l.requestedRate),
      lane: raisedLane(l) === "exception" ? "Exception" : "Good to Approve", reasons: l.reasons || [],
      vpDecision: l.vpDecision || "", presidentDecision: l.presidentDecision || "",
      // the VP's own figures, once the President has modified them or the Purchase Manager has cut the
      // quantity; and the President's, when the President approved at figures of their own
      vpQty: has(l.vpQty) ? num(l.vpQty) : null, vpRate: has(l.vpRate) ? num(l.vpRate) : null,
      presidentQty: has(l.presidentQty) ? num(l.presidentQty) : null, presidentRate: has(l.presidentRate) ? num(l.presidentRate) : null,
      finalQty: num(l.finalQty),
      approvedQty: lineCommits(l) ? num(l.finalQty) : 0, approvedRate: num(l.finalRate),
      pmRate: l.pmRate ? num(l.pmRate) : null,
      status: l.status || "", stage: stageOf(l, poQty, receivedQty),
      poId: l.poId || "", poDate: po ? po.po.datedISO || po.po.dated || "" : "", supplier: po ? po.po.supplier || "" : "",
      deliveryDate: po ? po.po.deliveryDate || "" : "",
      poQty, poRate, poAmount: po ? num(po.pl.amount) || poQty * poRate : 0,
      receivedQty, receivedVal: receivedQty * poRate,
      toReceive, toReceiveVal: toReceive * poRate,
      receipts: l.poId ? receipts.get(`${l.poId}::${l.lineId}`) || [] : [],
    };
  });
}

function blankTotals() {
  return { pendingQty: 0, approvedQty: 0, approvedVal: 0, poQty: 0, poVal: 0, receivedQty: 0, receivedVal: 0, toReceive: 0, toReceiveVal: 0, prIds: [], poIds: [], grnIds: [], suppliers: [] };
}

function addLine(t, r) {
  if (r.vpDecision === "Pending") t.pendingQty += r.requestedQty;
  t.approvedQty += r.approvedQty; t.approvedVal += r.approvedQty * r.approvedRate;
  t.poQty += r.poQty; t.poVal += r.poAmount;
  t.receivedQty += r.receivedQty; t.receivedVal += r.receivedVal;
  t.toReceive += r.toReceive; t.toReceiveVal += r.toReceiveVal;
  pushUnique(t.prIds, r.prId); pushUnique(t.poIds, r.poId); pushUnique(t.suppliers, r.supplier);
  r.receipts.forEach((g) => pushUnique(t.grnIds, g.id));
}

/* One row per budget item (deleted ones left out), then one per unbudgeted item raised against a
   head (lines for the same name under the same head taken together), in budget-head order. A budget
   item's approved figures are its committed ones, the same the Dashboard and Raise PR read. */
export function buildItemRows({ HEADS, items, lineRows }) {
  const byItem = new Map();
  const unbudgeted = new Map();
  lineRows.forEach((r) => {
    if (r.itemId) {
      if (!byItem.has(r.itemId)) byItem.set(r.itemId, blankTotals());
      addLine(byItem.get(r.itemId), r);
      return;
    }
    const k = `${r.head}::${r.itemName.trim().toLowerCase()}`;
    if (!unbudgeted.has(k)) unbudgeted.set(k, { first: r, t: blankTotals() });
    addLine(unbudgeted.get(k).t, r);
  });

  const rows = items.filter((it) => !it.deleted).map((it) => {
    const t = byItem.get(it.id) || blankTotals();
    return {
      ...t, key: it.id, itemId: it.id, unbudgeted: false,
      head: it.head, sub: it.sub || "", name: it.name, brand: it.brand || "", spec: it.spec || "", unit: it.unit || "Nos",
      freezeState: it.freezeState || "Not Frozen", approvalStatus: it.approvalStatus || "", budgetStatus: it.status || "",
      budgetQty: it.qty, budgetRate: it.rate, budgetVal: it.val,
      approvedQty: num(it.committedQty), approvedVal: num(it.committedVal),
      remaining: remainingToOrder(it, t.pendingQty),
    };
  });
  unbudgeted.forEach(({ first, t }, k) => rows.push({
    ...t, key: `U:${k}`, itemId: null, unbudgeted: true,
    head: first.head, sub: "", name: first.itemName, brand: first.brand, spec: first.spec, unit: first.unit,
    freezeState: "", approvalStatus: "", budgetStatus: "Unbudgeted",
    budgetQty: null, budgetRate: null, budgetVal: null, remaining: null,
  }));

  const order = new Map(HEADS.map((h, i) => [h.name, i]));
  const at = (r) => (order.has(r.head) ? order.get(r.head) : HEADS.length);
  return rows.sort((a, b) => at(a) - at(b));
}

/* One row per budget head: its ceiling against the item list, what is committed (as on the
   Dashboard), what is on PO and what has been received. */
export function buildHeadRows({ HEADS, headFreeze, itemRows }) {
  return HEADS.map((h) => {
    const rows = itemRows.filter((r) => r.head === h.name);
    const sum = (k) => rows.reduce((s, r) => s + num(r[k]), 0);
    const committed = sum("approvedVal");
    return {
      head: h.name, dept: h.dept || "", freezeState: headFreeze[h.name] || "Not Frozen", ceiling: num(h.ceil),
      budgetVal: sum("budgetVal"), committed, poVal: sum("poVal"), receivedVal: sum("receivedVal"), toReceiveVal: sum("toReceiveVal"),
      balance: num(h.ceil) - committed,
      items: rows.filter((r) => !r.unbudgeted).length, unbudgetedItems: rows.filter((r) => r.unbudgeted).length,
    };
  });
}

/* One row per item received on a GRN, newest GRN first, with the bill it came against. The freight
   belongs to the whole receipt, so it rides on the GRN's rows as `transport` — see transportOnce. */
export function buildGrnRows({ grns, pos, lineRows }) {
  const poById = new Map(pos.map((p) => [p.id, p]));
  const lineByKey = new Map(lineRows.map((r) => [`${r.poId}::${r.lineId}`, r]));
  const out = [];
  grns.forEach((g) => {
    const po = poById.get(g.poId);
    const transport = g.transport ? { ...computeTransport(g.transport), transporter: g.transport.transporter || "", lrNo: g.transport.lrNo || "" } : null;
    (g.lines || []).forEach((gl) => {
      const pl = po ? (po.lines || []).find((x) => x.lineId === gl.lineId) : null;
      const r = lineByKey.get(`${g.poId}::${gl.lineId}`);
      const qty = num(gl.qtyReceived);
      const rate = pl ? num(pl.rate) : 0;
      out.push({
        key: `${g.id}::${gl.lineId}`, grnId: g.id, recordedAt: g.ts || "", recordedBy: g.recordedBy || "",
        poId: g.poId, supplier: po ? po.supplier || "" : "", billNo: g.billNo || "", billDate: g.billDate || "", receivedDate: g.receivedDate || "",
        prId: pl ? pl.prId : r ? r.prId : "", head: r ? r.head : "",
        itemName: gl.itemName || (pl && pl.itemName) || gl.lineId, unit: (pl && pl.unit) || (r && r.unit) || "Nos",
        qty, rate, value: qty * rate, transport,
      });
    });
  });
  return out;
}

/* A GRN's freight is one charge however many items came on it: keep it on the first of the GRN's
   rows being listed and clear it from the rest, so a column of transport adds up. */
export function transportOnce(grnRows) {
  const seen = new Set();
  return grnRows.map((r) => {
    if (!r.transport || seen.has(r.grnId)) return r.transport ? { ...r, transport: null } : r;
    seen.add(r.grnId);
    return r;
  });
}

/* Who decided each requisition line and who issued each PO. The lines and POs keep only the decision,
   so the names and times are read back from the audit trail, which logs every one of them:
     `PR-CPA-0004 line "Shot glasses" approved by VP (36 @ ₹116). …`   (also modified & approved,
     rejected, deferred; by VP or by President)
     `"Shot glasses" (PR-CPA-0004) marked Ready for PO by Purchase Manager at ₹116.`
     `PO-CPA-0002 issued by Purchase Manager for 4 line item(s) …`
   Returns { decisions: "prId::itemName" -> [{ action, role, who, ts }] oldest first,
             ready: "prId::itemName" -> { who, ts }, issued: poId -> { who, ts } }. */
const DECISION = /^(\S+) line "(.*)" (modified & approved|approved|rejected|deferred) by (VP|President)\b/;
const READY = /^"(.*)" \((\S+)\) marked Ready for PO by /;
const ISSUED = /^(\S+) issued by Purchase Manager\b/;

export function whoFromAudit(audit) {
  const decisions = new Map();
  const ready = new Map();
  const issued = new Map();
  // the audit trail is newest first; walk it oldest first so the latest entry wins and lists read in order
  for (let i = audit.length - 1; i >= 0; i--) {
    const a = audit[i];
    const text = String(a.text || "");
    const who = { who: a.who || "", ts: a.ts || "" };
    let m = DECISION.exec(text);
    if (m) {
      const k = `${m[1]}::${m[2]}`;
      if (!decisions.has(k)) decisions.set(k, []);
      decisions.get(k).push({ action: m[3], role: m[4], ...who });
      continue;
    }
    if ((m = READY.exec(text))) { ready.set(`${m[2]}::${m[1]}`, who); continue; }
    if ((m = ISSUED.exec(text))) issued.set(m[1], who);
  }
  return { decisions, ready, issued };
}

/* The whole report. */
export function buildReport({ HEADS, headFreeze, items, allLines, pos, grns }) {
  const lines = buildLineRows({ items, allLines, pos, grns });
  const itemRows = buildItemRows({ HEADS, items, lineRows: lines });
  return {
    lines,
    items: itemRows,
    heads: buildHeadRows({ HEADS, headFreeze, itemRows }),
    grns: buildGrnRows({ grns, pos, lineRows: lines }),
  };
}
