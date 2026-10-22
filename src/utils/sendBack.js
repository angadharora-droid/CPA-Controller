import { lineCommits } from "./report.js";
import { fmtINR, fmtNum, fmtRate } from "./format.js";

/* ---------- sending a requisition back ----------
   The President can send a whole PR back while none of it has been bought: the PR is deleted and the
   budget its approved lines committed goes back to the items, so those quantities show in the balance
   on Raise Purchase Requisition again and can be raised afresh. The server does it (POST
   /api/prs/:id/send-back) from the live data, so what is released is what is committed at that moment
   and no open page can save the PR back. */

/* Why this PR can't be sent back, or null when it can: once any line is on a PO it stays. */
export function sendBackBlock(pr, pos = []) {
  const lineIds = new Set(pr.lines.map((l) => l.lineId));
  const onPO = new Set(pr.lines.map((l) => l.poId).filter(Boolean));
  pos.forEach((po) => (po.lines || []).forEach((pl) => { if (pl.prId === pr.id || lineIds.has(pl.lineId)) onPO.add(po.id); }));
  return onPO.size ? `${pr.id} is already on ${[...onPO].join(", ")}, so it can't be sent back.` : null;
}

/* The state once `prId` is sent back: { pr, prs, items, released } — released lists what each budget
   item gets back — or { error } when it can't be. */
export function sendBackPlan({ prs, items, pos }, prId) {
  const pr = prs.find((p) => p.id === prId);
  if (!pr) return { error: `${prId} is no longer there — it may have been sent back already.` };
  const block = sendBackBlock(pr, pos);
  if (block) return { error: block };
  // an unbudgeted line commits nothing on an item: its head total is worked out from the lines, so it drops by itself
  const back = new Map();
  pr.lines.forEach((l) => {
    if (!l.itemId || !lineCommits(l)) return;
    const r = back.get(l.itemId) || { qty: 0, val: 0 };
    r.qty += Number(l.finalQty) || 0;
    r.val += (Number(l.finalQty) || 0) * (Number(l.finalRate) || 0);
    back.set(l.itemId, r);
  });
  const released = [];
  const nextItems = items.map((it) => {
    const r = back.get(it.id);
    if (!r) return it;
    released.push({ name: it.name, unit: it.unit || "Nos", ...r });
    return { ...it, committedQty: Math.max(0, (it.committedQty || 0) - r.qty), committedVal: Math.max(0, (it.committedVal || 0) - r.val) };
  });
  return { pr, prs: prs.filter((p) => p.id !== prId), items: nextItems, released };
}

/* The audit-trail entry: the PR is gone afterwards, so this is where what it held is kept. */
export function sendBackNote({ pr, released }, reason) {
  const lines = pr.lines.map((l) => `${l.itemName} ${fmtNum(l.finalQty)} @ ${fmtRate(l.finalRate)} (${l.status})`).join(", ");
  const budget = released.length
    ? ` Committed budget released and back in the balance on Raise Purchase Requisition: ${released.map((r) => `${r.name} ${fmtNum(r.qty)} ${r.unit} / ${fmtINR(r.val)}`).join("; ")}.`
    : " It had no budget committed against any item.";
  return `${pr.id} sent back and deleted — raised by ${pr.raisedBy || "—"} (${pr.dept || "—"}) on ${pr.submittedAt || "—"}: ${lines}.${budget}${reason ? ` Reason: ${reason}` : ""}`;
}
