/* Back up the app state before any manual data fix.
     node scripts/backup-state.mjs            (uses MONGODB_URI from .env / the environment)
   Writes every document of the app-state collections to backups/appstate-<timestamp>.json (Extended
   JSON, so it restores exactly), and also keeps the whole state as one document inside MongoDB, in
   "appstate_archives" under the key "main-backup-<timestamp>". */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dns from "node:dns";
import mongoose from "mongoose";
import { openStore, ARCHIVES } from "../server/store.js";

const { EJSON } = mongoose.mongo.BSON;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/cpa-budget-control";
const COLLECTIONS = ["settings", "items", "requisitions", "purchase_orders", "goods_receipts", "audit_trail"];

// some office/ISP DNS servers refuse the SRV lookup an Atlas address needs; public resolvers answer it
if (String(uri).startsWith("mongodb+srv://")) dns.setServers(["8.8.8.8", "1.1.1.1"]);
await mongoose.connect(uri);
const db = mongoose.connection.db;
const store = await openStore(db, mongoose.connection.getClient());
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupKey = `main-backup-${stamp}`;
const snap = await store.snapshot(backupKey);
if (!snap) { console.error(`No app state found in database "${db.databaseName}" — nothing backed up.`); process.exit(1); }

const raw = {};
for (const c of COLLECTIONS) raw[c] = await db.collection(c).find({}).toArray();
const dir = path.resolve(__dirname, "..", "backups");
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `appstate-${stamp}.json`);
fs.writeFileSync(file, EJSON.stringify({ database: db.databaseName, takenAt: new Date(), collections: raw }, { relaxed: false }, 1));
await db.collection(ARCHIVES).insertOne({ ...snap }); // a copy: the driver adds an _id to what it inserts

// read both back, so a backup that did not really land is never trusted
const exact = (v) => EJSON.stringify(v, { relaxed: false });
const onDisk = EJSON.parse(fs.readFileSync(file, "utf8"), { relaxed: false }).collections;
const inDb = await db.collection(ARCHIVES).findOne({ key: backupKey });
const size = (s) => `${(s.items || []).length} items, ${(s.prs || []).length} PRs, ${(s.pos || []).length} POs, ${(s.grns || []).length} GRNs, ${(s.audit || []).length} audit entries`;
const fileOk = COLLECTIONS.every((c) => exact(onDisk[c]) === exact(raw[c]));
const { _id, ...inDbBody } = inDb || {};
const dbOk = !!inDb && exact(inDbBody) === exact(snap);
console.log(`database      : ${db.databaseName}`);
console.log(`live state    : ${size(snap)}`);
console.log(`file backup   : ${COLLECTIONS.map((c) => `${c} ${onDisk[c].length}`).join(", ")}  ->  backups/${path.basename(file)} (${Math.round(fs.statSync(file).size / 1024)} KB)`);
console.log(`in-DB backup  : ${size(inDb || {})}  ->  ${ARCHIVES}, key "${backupKey}"`);
console.log(fileOk && dbOk ? "VERIFIED: both backups match the live data exactly." : "WARNING: a backup does not match the live data — do not proceed.");
await mongoose.disconnect();
