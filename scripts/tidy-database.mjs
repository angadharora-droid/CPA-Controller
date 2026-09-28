/* Tidy the database without changing any data.
     node scripts/tidy-database.mjs            dry run: shows what is where and what would move
     node scripts/tidy-database.mjs --apply    does it
   "appstates" should hold one document, the live app state (key "main"). Old copies piled up next to
   it: the document archived by the 9 Sep taxonomy change and the backups taken before manual fixes.
   Each old copy is moved, byte for byte, into "appstate_archives": copied, the copy read back and
   compared with the original, and only then removed from "appstates". "main" is never touched, so open
   browsers are not affected. A full file backup is written to backups/ first.
   Other databases on the cluster are only reported, never changed. */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dns from "node:dns";
import mongoose from "mongoose";
import { EJSON } from "bson";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/cpa-budget-control";
const APPLY = process.argv.includes("--apply");
const SYSTEM_DBS = ["admin", "local", "config"]; // MongoDB's own; always there, never ours to change

if (String(uri).startsWith("mongodb+srv://")) dns.setServers(["8.8.8.8", "1.1.1.1"]);
await mongoose.connect(uri);
const db = mongoose.connection.db;
const states = db.collection("appstates");
const archives = db.collection("appstate_archives");
const exact = (d) => EJSON.stringify(d, { relaxed: false });
const size = (s) => `${(s.items || []).length} items, ${(s.prs || []).length} PRs, ${(s.pos || []).length} POs, ${(s.grns || []).length} GRNs`;
const when = (d) => (d.updatedAt instanceof Date ? d.updatedAt.toISOString().slice(0, 16).replace("T", " ") : "?");

/* ---------- what is on the cluster ---------- */
console.log(`App database: "${db.databaseName}"\n`);
try {
  const { databases } = await db.admin().listDatabases({ nameOnly: true });
  for (const { name } of databases) {
    if (SYSTEM_DBS.includes(name)) { console.log(`  ${name.padEnd(22)} MongoDB system database (built in, leave alone)`); continue; }
    const other = mongoose.connection.client.db(name);
    const cols = await other.listCollections({}, { nameOnly: true }).toArray();
    const parts = [];
    for (const c of cols) parts.push(`${c.name} (${await other.collection(c.name).countDocuments()})`);
    const tag = name === db.databaseName ? "IN USE by the app" : "not used by the app";
    console.log(`  ${name.padEnd(22)} ${tag}: ${parts.join(", ") || "empty"}`);
    // logins shaped like this app's (a userId) mark a stray copy of it; other apps' users are skipped
    const theirs = name !== db.databaseName && cols.some((c) => c.name === "users")
      ? (await other.collection("users").find({ userId: { $exists: true } }, { projection: { userId: 1 } }).toArray()) : [];
    if (theirs.length) {
      const live = new Set((await db.collection("users").find({}, { projection: { userId: 1 } }).toArray()).map((u) => u.userId));
      console.log(`  ${"".padEnd(22)}   its logins: ${theirs.map((u) => `${u.userId}${live.has(u.userId) ? "" : " (not a live login)"}`).join(", ")}`);
    }
  }
} catch (err) {
  console.log(`  (could not list databases: ${err.message})`);
}

/* ---------- appstates ---------- */
const docs = await states.find({}).toArray();
const main = docs.find((d) => d.key === "main");
if (!main) { console.error(`\nNo "main" document in "${db.databaseName}.appstates" — stopping, nothing changed.`); process.exit(1); }
const old = docs.filter((d) => d.key !== "main");
console.log(`\nappstates: ${docs.length} document(s)`);
console.log(`  main  (live, stays)  ${size(main)}, last saved ${when(main)}`);
old.forEach((d) => console.log(`  ${d.key}  -> appstate_archives   ${size(d)}, last saved ${when(d)}`));
console.log(`appstate_archives: ${await archives.countDocuments()} document(s) now`);

if (!old.length) { console.log("\nNothing to move: appstates already holds only the live document."); await mongoose.disconnect(); process.exit(0); }
if (!APPLY) { console.log(`\nDry run — nothing changed. Run again with --apply to move ${old.length} old cop${old.length === 1 ? "y" : "ies"}.`); await mongoose.disconnect(); process.exit(0); }

/* ---------- apply ---------- */
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const dir = path.resolve(__dirname, "..", "backups");
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `appstate-before-tidy-${stamp}.json`);
fs.writeFileSync(file, EJSON.stringify({ database: db.databaseName, takenAt: new Date(), docs }, { relaxed: false }, 1));
const onDisk = EJSON.parse(fs.readFileSync(file, "utf8"), { relaxed: false }).docs;
if (onDisk.length !== docs.length || onDisk.some((d, i) => exact(d) !== exact(docs[i]))) {
  console.error("\nThe file backup does not match the database — stopping, nothing changed."); process.exit(1);
}
console.log(`\nFile backup: backups/${path.basename(file)} (${Math.round(fs.statSync(file).size / 1024)} KB, verified)`);

let moved = 0;
for (const d of old) {
  // a copy left by an earlier, interrupted run is reused only if it is identical
  const already = await archives.findOne({ _id: d._id });
  if (already && exact(already) !== exact(d)) { console.error(`  ${d.key}: a different document with the same id is already archived — left in appstates.`); continue; }
  if (!already) await archives.insertOne(d);
  const copy = await archives.findOne({ _id: d._id });
  if (!copy || exact(copy) !== exact(d)) { console.error(`  ${d.key}: the archived copy does not match — left in appstates.`); continue; }
  await states.deleteOne({ _id: d._id, key: d.key });
  console.log(`  ${d.key}: moved to appstate_archives (copy verified)`);
  moved++;
}

const mainAfter = await states.findOne({ key: "main" });
console.log(`\nMoved ${moved} of ${old.length}. appstates now: ${await states.countDocuments()} document(s); appstate_archives: ${await archives.countDocuments()}.`);
console.log(exact(mainAfter) === exact(main) ? "Live \"main\" document unchanged." : "Note: \"main\" changed while this ran — that is someone using the app, not this script.");
await mongoose.disconnect();
