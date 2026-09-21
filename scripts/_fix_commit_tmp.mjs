/* One-off data fix, 21 Sept 2026 — wrong "Over by" / minus balances.
     node scripts/_fix_commit_tmp.mjs            dry run
     node scripts/_fix_commit_tmp.mjs --apply
   1. A requisition line that is on an issued PO but shows as waiting on the VP goes back to
      "PO Issued" (it was approved and ordered; an out-of-date browser session wiped that).
   2. Every item's committed quantity and value is recalculated from the requisition lines that really
      hold budget today: approved by the VP, not rejected by the President, not cancelled — the same
      rule the app applies line by line (final qty × final rate).
   No requisition is approved, rejected or cancelled here, and no PO or goods receipt is touched. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dns from "node:dns";
import mongoose from "mongoose";
import { EJSON } from "bson";

const APPLY = process.argv.includes("--apply");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXPECTED_PO_LINES = ["PR-CPA-0029-L1", "PR-CPA-0031-L1", "PR-CPA-0044-L1"]; // reviewed against the live data
const who = "System (data fix)";
const stamp = () => new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const inr = (n) => `₹${Math.round(n).toLocaleString("en-IN")}`;

// some office/ISP DNS servers refuse the SRV lookup an Atlas address needs; public resolvers answer it
if (String(process.env.MONGODB_URI).startsWith("mongodb+srv://")) dns.setServers(["8.8.8.8", "1.1.1.1"]);
await mongoose.connect(process.env.MONGODB_URI);
const states = mongoose.connection.db.collection("appstates");
const s = await states.findOne({ key: "main" });
const prs = structuredClone(s.prs), items = structuredClone(s.items);
const lines = prs.flatMap((p) => p.lines);
const poLine = new Map();
[...s.pos].reverse().forEach((po) => po.lines.forEach((pl) => poLine.set(pl.lineId, { po, pl })));
const approved = (l) => l.vpDecision === "Approved" || l.vpDecision === "Modified & Approved";
const holds = (l) => approved(l) && l.presidentDecision !== "Rejected" && !/^Cancelled/.test(l.status);

// ---- 1. lines on a PO that lost their approval
const before = { lines: {}, items: {} }, after = { lines: {}, items: {} }, restores = [];
for (const l of lines) {
  if (!poLine.has(l.lineId) || (approved(l) && l.status === "PO Issued")) continue;
  const { po, pl } = poLine.get(l.lineId);
  before.lines[l.lineId] = structuredClone(l);
  const was = l.status;
  if (!approved(l)) l.vpDecision = "Approved";
  if (l.presidentDecision === "Pending") l.presidentDecision = "Approved"; // it could not have reached a PO otherwise
  l.status = "PO Issued";
  l.poId = po.id;
  if (Number(pl.rate) > 0 && Number(pl.rate) < Number(l.finalRate)) l.pmRate = Number(pl.rate);
  l.qtyReceived = Number(pl.qtyReceived) || 0;
  after.lines[l.lineId] = l;
  restores.push({ id: l.lineId, item: l.itemName, was, po: po.id, qty: l.finalQty, rate: l.pmRate || l.finalRate, qtyReceived: l.qtyReceived });
}

// ---- 2. recalculate what each item has committed
const should = new Map();
lines.filter((l) => l.itemId && holds(l)).forEach((l) => { const c = should.get(l.itemId) || { q: 0, v: 0 }; c.q += Number(l.finalQty) || 0; c.v += (Number(l.finalQty) || 0) * (Number(l.finalRate) || 0); should.set(l.itemId, c); });
const changed = [];
for (const it of items) {
  const c = should.get(it.id) || { q: 0, v: 0 };
  if ((it.committedQty || 0) === c.q && Math.abs((it.committedVal || 0) - c.v) <= 0.01) continue;
  before.items[it.id] = { name: it.name, head: it.head, qty: it.qty, committedQty: it.committedQty || 0, committedVal: it.committedVal || 0 };
  it.committedQty = c.q; it.committedVal = c.v;
  after.items[it.id] = { name: it.name, head: it.head, qty: it.qty, committedQty: c.q, committedVal: c.v };
  changed.push(it.id);
}
const totalBefore = s.items.filter((i) => !i.deleted).reduce((t, i) => t + (i.committedVal || 0), 0);
const totalAfter = items.filter((i) => !i.deleted).reduce((t, i) => t + (i.committedVal || 0), 0);

// ---- report
console.log(`${APPLY ? "APPLYING" : "DRY RUN — nothing will be changed"}  (database "${mongoose.connection.db.databaseName}", state last saved ${s.updatedAt?.toISOString?.()})\n`);
console.log(`1. back to "PO Issued": ${restores.length} line(s)`);
restores.forEach((r) => console.log(`   ${r.id.padEnd(16)} ${String(r.item).slice(0, 30).padEnd(30)} "${r.was}" -> PO Issued on ${r.po} | ${r.qty} @ ₹${r.rate} | received ${r.qtyReceived}`));
console.log(`\n2. committed figures corrected on ${changed.length} item(s); total committed ${inr(totalBefore)} -> ${inr(totalAfter)}`);
const byHead = Object.groupBy(changed, (id) => after.items[id].head);
Object.entries(byHead).forEach(([head, ids]) => console.log(`   ${String(head).padEnd(36)} ${String(ids.length).padStart(3)} item(s) | ${inr(ids.reduce((t, id) => t + before.items[id].committedVal, 0))} -> ${inr(ids.reduce((t, id) => t + after.items[id].committedVal, 0))}`));
const up = changed.filter((id) => after.items[id].committedQty > before.items[id].committedQty);
console.log(`   going up: ${up.length}${up.length ? " — " + up.map((id) => `${after.items[id].name} ${before.items[id].committedQty}->${after.items[id].committedQty}`).join(", ") : ""}`);

const pendingQ = new Map();
lines.filter((l) => l.itemId && l.vpDecision === "Pending").forEach((l) => pendingQ.set(l.itemId, (pendingQ.get(l.itemId) || 0) + (Number(l.requestedQty) || 0)));
const overCount = (list) => list.filter((i) => !i.deleted && typeof i.qty === "number" && i.qty - (i.committedQty || 0) - (pendingQ.get(i.id) || 0) < 0);
const stillOver = overCount(items);
console.log(`\n"Over by" on Raise PR: ${overCount(s.items).length} item(s) now -> ${stillOver.length} after`);
stillOver.forEach((i) => console.log(`   ${String(i.name).slice(0, 36).padEnd(36)} budget ${String(i.qty).padStart(4)} | approved ${String(i.committedQty).padStart(4)} | awaiting VP ${String(pendingQ.get(i.id) || 0).padStart(4)}`));

const okLines = restores.length === EXPECTED_PO_LINES.length && restores.every((r) => EXPECTED_PO_LINES.includes(r.id));
if (!okLines || up.length || changed.length < 90 || changed.length > 125) { console.log("\nSTOP: the live data no longer looks like what was reviewed — nothing applied."); process.exit(1); }
if (!APPLY) { await mongoose.disconnect(); process.exit(0); }

const auditNew = [
  { ts: stamp(), who, text: `Data correction: committed quantity and value recalculated for ${changed.length} item(s) from the requisition lines that are actually approved (total committed ${inr(totalBefore)} -> ${inr(totalAfter)}). An out-of-date browser session had wiped VP approvals from the requisitions while the budget they committed stayed behind, so items were shown as over their balance; lines that were re-approved had been counted twice. Lines still waiting on the VP were not approved or changed.` },
  { ts: stamp(), who, text: `Data correction: ${restores.length} requisition line(s) already on an issued PO but showing as waiting on the VP were restored to "PO Issued": ${restores.map((r) => `${r.id} ${r.item} (${r.po})`).join(", ")}. No PO or goods receipt was changed.` },
];
const res = await states.updateOne({ _id: s._id, updatedAt: s.updatedAt }, { $set: { prs, items, audit: [...auditNew, ...s.audit] }, $currentDate: { updatedAt: true } });
if (res.modifiedCount !== 1) { console.log("\nNOT APPLIED: someone saved data while this was running. Nothing was changed — run it again."); process.exit(1); }
const report = path.resolve(__dirname, "..", "backups", `commitment-fix-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(report, EJSON.stringify({ appliedAt: new Date(), restores, before, after, totalBefore, totalAfter, auditAdded: auditNew }, null, 1));
console.log(`\nAPPLIED. Before/after of every changed item and line saved to backups/${path.basename(report)}`);
await mongoose.disconnect();
