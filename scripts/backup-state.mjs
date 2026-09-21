/* Back up the app state before any manual data fix.
     node scripts/backup-state.mjs            (uses MONGODB_URI from .env / the environment)
   Writes every AppState document to backups/appstate-<timestamp>.json (Extended JSON, so it restores
   exactly), and also keeps a copy of the live "main" document inside MongoDB under the key
   "main-backup-<timestamp>" — the same never-delete convention the schema migration uses. */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dns from "node:dns";
import mongoose from "mongoose";
import { EJSON } from "bson";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/cpa-budget-control";

// some office/ISP DNS servers refuse the SRV lookup an Atlas address needs; public resolvers answer it
if (String(uri).startsWith("mongodb+srv://")) dns.setServers(["8.8.8.8", "1.1.1.1"]);
await mongoose.connect(uri);
const db = mongoose.connection.db;
const states = db.collection("appstates");
const docs = await states.find({}).toArray();
const main = docs.find((d) => d.key === "main");
if (!main) { console.error(`No "main" app state found in database "${db.databaseName}" — nothing backed up.`); process.exit(1); }

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const dir = path.resolve(__dirname, "..", "backups");
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `appstate-${stamp}.json`);
fs.writeFileSync(file, EJSON.stringify({ database: db.databaseName, takenAt: new Date(), docs }, null, 1));

const { _id, ...copy } = main;
const backupKey = `main-backup-${stamp}`;
await states.insertOne({ ...copy, key: backupKey });

// read both back, so a backup that did not really land is never trusted
const onDisk = EJSON.parse(fs.readFileSync(file, "utf8")).docs.find((d) => d.key === "main");
const inDb = await states.findOne({ key: backupKey });
const size = (s) => `${(s.items || []).length} items, ${(s.prs || []).length} PRs, ${(s.pos || []).length} POs, ${(s.grns || []).length} GRNs, ${(s.audit || []).length} audit entries`;
console.log(`database      : ${db.databaseName}`);
console.log(`live "main"   : ${size(main)}`);
console.log(`file backup   : ${size(onDisk)}  ->  backups/${path.basename(file)} (${Math.round(fs.statSync(file).size / 1024)} KB)`);
console.log(`in-DB backup  : ${size(inDb)}  ->  key "${backupKey}"`);
const same = (a, b) => EJSON.stringify({ i: a.items, p: a.prs, o: a.pos, g: a.grns, a: a.audit }) === EJSON.stringify({ i: b.items, p: b.prs, o: b.pos, g: b.grns, a: b.audit });
console.log(same(main, onDisk) && same(main, inDb) ? "VERIFIED: both backups match the live data exactly." : "WARNING: a backup does not match the live data — do not proceed.");
await mongoose.disconnect();
