/* Repair of the damage done by out-of-date browser sessions saving over newer data (Sept 2026).
     node scripts/repair-live-data.mjs            dry run: prints the plan, changes nothing
     node scripts/repair-live-data.mjs --apply    makes the change
   Uses MONGODB_URI from the environment / .env. Run it only AFTER the stale-write protection is
   deployed and everyone has refreshed — before that, the next save from an old page undoes it again.
   Rule-based, so it can be re-run safely; a second run finds nothing to do.
     1. A requisition line that is on an issued PO goes (back) to "PO Issued", with the PO's number,
        negotiated rate and received quantity.
     2. Duplicated requisitions are deleted: the Demo-Scenario test entries still open, and the reviewed
        real duplicates below — never one with a line on a PO or with goods received.
     3. Every item's committed quantity / value is recalculated from the lines that really hold budget.
   POs and goods receipts are never touched. The full state is written to backups/ first. */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import dns from "node:dns";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { EJSON } from "bson";

const APPLY = process.argv.includes("--apply");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/cpa-budget-control";

// duplicate requisition -> the one that stays (reviewed against the live data on 21 Sept 2026)
const DUPLICATE_PRS = { "PR-CPA-0025": "PR-CPA-0026", "PR-CPA-0022": "PR-CPA-0013", "PR-CPA-0020": "PR-CPA-0005", "PR-CPA-0016": "PR-CPA-0007" };
// PR-CPA-0008 also holds a line nobody else asked for, so only its two repeated lines go
const DUPLICATE_LINES = { "PR-CPA-0008-L1": "PR-CPA-0024-L2", "PR-CPA-0008-L3": "PR-CPA-0024-L1" };
const DEMO_REQUESTERS = ["F&B Store Incharge", "Executive Chef", "Housekeeping Manager", "Front Office Manager"]; // names only the Demo Scenarios tab uses
const OPEN = new Set(["Pending VP", "Pending President", "Pending Purchase Manager", "Ready for PO"]);

const who = "System (data fix)";
const stamp = () => new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const inr = (n) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const approved = (l) => l.vpDecision === "Approved" || l.vpDecision === "Modified & Approved";
const holds = (l) => approved(l) && l.presidentDecision !== "Rejected" && !/^Cancelled/.test(l.status);

// some office/ISP DNS servers refuse the SRV lookup an Atlas address needs; public resolvers answer it
if (uri.startsWith("mongodb+srv://")) dns.setServers(["8.8.8.8", "1.1.1.1"]);
await mongoose.connect(uri);
const states = mongoose.connection.db.collection("appstates");
const s = await states.findOne({ key: "main" });
let prs = structuredClone(s.prs);
const items = structuredClone(s.items);
// every PO a requisition line is on, oldest first (one line ended up on two POs while statuses were being wiped)
const poLine = new Map();
[...s.pos].reverse().forEach((po) => po.lines.forEach((pl) => poLine.set(pl.lineId, [...(poLine.get(pl.lineId) || []), { po, pl }])));
const onPO = (l) => poLine.has(l.lineId);
const untouchable = (l) => onPO(l) || (Number(l.qtyReceived) || 0) > 0 || l.status === "PO Issued";

// ---- 1. lines that are on a PO
const restores = [];
prs.forEach((pr) => pr.lines.forEach((l) => {
  if (!onPO(l)) return;
  const on = poLine.get(l.lineId);
  const { po, pl } = on.find((x) => x.po.id === l.poId) || on[on.length - 1]; // the PO it already points to, else the latest
  const pmRate = Number(pl.rate) > 0 && Number(pl.rate) < Number(l.finalRate) ? Number(pl.rate) : l.pmRate;
  const want = { status: "PO Issued", poId: po.id, vpDecision: approved(l) ? l.vpDecision : "Approved", presidentDecision: l.presidentDecision === "Pending" ? "Approved" : l.presidentDecision, pmRate, qtyReceived: on.reduce((t, x) => t + (Number(x.pl.qtyReceived) || 0), 0) };
  if (Object.keys(want).every((k) => (l[k] ?? null) === (want[k] ?? null))) return;
  restores.push({ id: l.lineId, item: l.itemName, was: l.status, po: po.id });
  Object.assign(l, want);
}));

// ---- 2. duplicated requisitions
const deleted = [], skipped = [];
const dropPR = (pr, why) => {
  if (pr.lines.some(untouchable)) { skipped.push(`${pr.id} (${why}) — has a line on a PO / received, left alone`); return false; }
  deleted.push({ id: pr.id, why, raisedBy: pr.raisedBy, submittedAt: pr.submittedAt, lines: pr.lines.map((l) => `${l.itemName} ×${l.requestedQty}`), record: pr });
  return true;
};
prs = prs.filter((pr) => {
  if (DUPLICATE_PRS[pr.id]) return !dropPR(pr, `duplicate of ${DUPLICATE_PRS[pr.id]}`);
  if (DEMO_REQUESTERS.includes(pr.raisedBy) && pr.lines.every((l) => OPEN.has(l.status))) return !dropPR(pr, "Demo Scenarios test entry");
  return true;
});
const deletedLines = [];
prs.forEach((pr) => {
  pr.lines = pr.lines.filter((l) => {
    if (!DUPLICATE_LINES[l.lineId]) return true;
    if (untouchable(l)) { skipped.push(`${l.lineId} — on a PO / received, left alone`); return true; }
    deletedLines.push({ id: l.lineId, pr: pr.id, item: l.itemName, qty: l.requestedQty, why: `duplicate of ${DUPLICATE_LINES[l.lineId]}`, record: l });
    return false;
  });
});

// ---- 3. what each item really has committed
const lines = prs.flatMap((p) => p.lines);
const should = new Map();
lines.filter((l) => l.itemId && holds(l)).forEach((l) => { const c = should.get(l.itemId) || { q: 0, v: 0 }; c.q += Number(l.finalQty) || 0; c.v += (Number(l.finalQty) || 0) * (Number(l.finalRate) || 0); should.set(l.itemId, c); });
const itemChanges = [];
items.forEach((it) => {
  const c = should.get(it.id) || { q: 0, v: 0 };
  if ((it.committedQty || 0) === c.q && Math.abs((it.committedVal || 0) - c.v) <= 0.01) return;
  itemChanges.push({ id: it.id, name: it.name, qty: it.qty, from: { q: it.committedQty || 0, v: it.committedVal || 0 }, to: c });
  it.committedQty = c.q; it.committedVal = c.v;
});

// ---- the plan
console.log(`${APPLY ? "APPLYING" : "DRY RUN — nothing will be changed"}  (database "${mongoose.connection.db.databaseName}", last saved ${s.updatedAt?.toISOString?.()})\n`);
console.log(`1. back to "PO Issued": ${restores.length} line(s)`);
restores.forEach((r) => console.log(`   ${r.id.padEnd(17)} ${String(r.item).slice(0, 36).padEnd(36)} "${r.was}" -> on ${r.po}`));
console.log(`\n2. duplicated requisitions deleted: ${deleted.length} PR(s) and ${deletedLines.length} line(s)`);
deleted.forEach((d) => console.log(`   ${d.id.padEnd(12)} ${d.why.padEnd(28)} | ${d.raisedBy} on ${d.submittedAt} | ${d.lines.join(", ").slice(0, 80)}`));
deletedLines.forEach((d) => console.log(`   ${d.id.padEnd(17)} ${d.why} | ${d.item} ×${d.qty}`));
skipped.forEach((t) => console.log(`   SKIPPED ${t}`));
console.log(`\n3. committed figures corrected on ${itemChanges.length} item(s)`);
itemChanges.forEach((c) => console.log(`   ${String(c.name).trim().slice(0, 38).padEnd(38)} budget ${String(c.qty).padStart(4)} | committed ${c.from.q} -> ${c.to.q} | ${inr(c.from.v)} -> ${inr(c.to.v)}`));

const pendingQ = new Map();
lines.filter((l) => l.itemId && l.vpDecision === "Pending").forEach((l) => pendingQ.set(l.itemId, (pendingQ.get(l.itemId) || 0) + (Number(l.requestedQty) || 0)));
const over = items.filter((i) => !i.deleted && typeof i.qty === "number" && (i.committedQty || 0) + (pendingQ.get(i.id) || 0) > i.qty);
console.log(`\nStill above their approved quantity afterwards (real orders / requests, not data errors): ${over.length}`);
over.forEach((i) => console.log(`   ${String(i.name).trim().slice(0, 38).padEnd(38)} budget ${String(i.qty).padStart(4)} | approved ${String(i.committedQty || 0).padStart(4)} | awaiting VP ${String(pendingQ.get(i.id) || 0).padStart(4)}`));
const inQueue = (l) => l.status === "Pending Purchase Manager" || l.status === "Ready for PO";
console.log(`\nPurchase Manager queue afterwards: ${lines.filter(inQueue).map((l) => `${l.itemName} (${l.lineId})`).join(" | ")}`);

const nothing = !restores.length && !deleted.length && !deletedLines.length && !itemChanges.length;
if (nothing) console.log("\nNothing to repair — the data is consistent.");
if (!APPLY || nothing) { await mongoose.disconnect(); process.exit(0); }

// ---- apply: keep the full "before" on disk, then one atomic write that is refused if anyone saved meanwhile
const dir = path.resolve(__dirname, "..", "backups");
fs.mkdirSync(dir, { recursive: true });
const tag = new Date().toISOString().replace(/[:.]/g, "-");
fs.writeFileSync(path.join(dir, `appstate-before-repair-${tag}.json`), EJSON.stringify({ database: mongoose.connection.db.databaseName, takenAt: new Date(), docs: [s] }, null, 1));
const auditNew = [];
if (itemChanges.length) auditNew.push({ ts: stamp(), who, text: `Data correction: committed quantity and value recalculated for ${itemChanges.length} item(s) from the requisition lines that really hold budget (out-of-date browser sessions had saved over newer data).` });
if (deleted.length || deletedLines.length) auditNew.push({ ts: stamp(), who, text: `Data correction: duplicated requisitions deleted — ${[...deleted.map((d) => `${d.id} (${d.why})`), ...deletedLines.map((d) => `${d.id} ${d.item} (${d.why})`)].join("; ")}. Full copies are kept in the backup taken before the correction.` });
if (restores.length) auditNew.push({ ts: stamp(), who, text: `Data correction: ${restores.length} requisition line(s) already on an issued PO restored to "PO Issued": ${restores.map((r) => `${r.id} (${r.po})`).join(", ")}. No PO or goods receipt was changed.` });
const res = await states.updateOne(
  { _id: s._id, updatedAt: s.updatedAt },
  // revision numbers go up so every open browser notices and re-reads these slices
  { $set: { prs, items, audit: [...auditNew, ...s.audit] }, $inc: { "revs.prs": 1, "revs.items": 1, "revs.audit": 1 }, $currentDate: { updatedAt: true } },
);
if (res.modifiedCount !== 1) { console.log("\nNOT APPLIED: someone saved data while this was running. Nothing was changed — run it again."); process.exit(1); }
fs.writeFileSync(path.join(dir, `repair-report-${tag}.json`), EJSON.stringify({ appliedAt: new Date(), restores, deleted, deletedLines, itemChanges, skipped, auditAdded: auditNew }, null, 1));
console.log(`\nAPPLIED. Full "before" copy: backups/appstate-before-repair-${tag}.json · what changed: backups/repair-report-${tag}.json`);
await mongoose.disconnect();
