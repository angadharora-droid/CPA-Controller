import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { RAW_ITEMS } from "../src/data/rawItems.js";
import { BASE_HEADS } from "../src/data/heads.js";
import { nowStamp } from "../src/utils/format.js";
import { verifySsoToken, directoryGuard } from "./ssoClient.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/cpa-budget-control";
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const TOKEN_TTL = "12h";

/* Bump this whenever the stored app-state shape or cost-head taxonomy changes.
   An older "main" document is archived (never deleted) and a fresh one is seeded. */
const SCHEMA_VERSION = 2;

/* "Viewer" is not a workflow role: it opens every screen read-only and can never write app state. */
const VIEWER_ROLE = "Viewer";
const ROLES = ["VP", "President", "Purchase Manager", "Store Manager", "Department Head", VIEWER_ROLE];

/* ---------- models ---------- */
const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, required: true },
  role: { type: String, required: true, enum: ROLES },
  title: { type: String, default: "" },
  /* Full administrative access (every tab, every action) on top of the user's workflow role. */
  isAdmin: { type: Boolean, default: false },
  passwordHash: { type: String, required: true },
});
const User = mongoose.model("User", userSchema);

/* The pieces of app state the browser loads and saves. Each carries a revision number (revs.<slice>)
   that goes up by one on every save — that is how an out-of-date browser is stopped from saving its
   old copy over someone else's newer work. */
const SLICES = ["items", "prs", "prCounter", "pos", "poCounter", "grns", "audit", "headFreeze", "ceilOverrides", "tolerancePct", "secondApprovalPct"];
const revsOf = (doc) => Object.fromEntries(SLICES.map((k) => [k, Number(doc?.revs?.[k]) || 0]));

const stateSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  schemaVersion: { type: Number, default: 1 },
  items: { type: mongoose.Schema.Types.Mixed, default: [] },
  prs: { type: mongoose.Schema.Types.Mixed, default: [] },
  prCounter: { type: Number, default: 1 },
  pos: { type: mongoose.Schema.Types.Mixed, default: [] },
  poCounter: { type: Number, default: 1 },
  grns: { type: mongoose.Schema.Types.Mixed, default: [] },
  audit: { type: mongoose.Schema.Types.Mixed, default: [] },
  headFreeze: { type: mongoose.Schema.Types.Mixed, default: {} },
  ceilOverrides: { type: mongoose.Schema.Types.Mixed, default: {} },
  tolerancePct: { type: Number, default: 5 },
  secondApprovalPct: { type: Number, default: 15 },
  revs: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { minimize: false, timestamps: true });
const AppState = mongoose.model("AppState", stateSchema);

/* ---------- first-run seeding ---------- */
const SEED_USERS = [
  { userId: "amitkhandwal", password: "Amit@GM#2026", name: "Amit Khandwal", role: "VP", isAdmin: true, title: "Vice President — Budget Submission, First Approval & Full Administrative Access" },
  { userId: "arjun", password: "President@2026", name: "Arjun Arora", role: "President", title: "President — Budget Freeze & Second Approval" },
  { userId: "purchase", password: "Purchase@2026", name: "Purchase Manager", role: "Purchase Manager", title: "Purchase Manager — Rate Negotiation & Purchase Orders" },
  { userId: "store", password: "Store@2026", name: "Store Manager", role: "Store Manager", title: "Store Manager — Goods Receipt" },
  { userId: "depthead", password: "Dept@2026", name: "Department Head", role: "Department Head", title: "Department Head — Requisitions" },
  { userId: "shashank", password: "Shashank@2026", name: "Shashank Kapley", role: VIEWER_ROLE, title: "View-Only Access — All Screens" },
];

function freshState() {
  const items = RAW_ITEMS.map((it) => ({
    ...it,
    brand: it.brand || null,
    committedQty: 0,
    committedVal: 0,
    approvalStatus: it.status === "Complete" ? "Approved" : "Pending",
    freezeState: "Not Frozen",
    deleted: false,
  }));
  const headFreeze = {};
  BASE_HEADS.forEach((h) => (headFreeze[h.name] = "Not Frozen"));
  return {
    key: "main",
    schemaVersion: SCHEMA_VERSION,
    items,
    prs: [],
    prCounter: 1,
    pos: [],
    poCounter: 1,
    grns: [],
    audit: [{
      ts: nowStamp(), who: "System",
      text: `Budget data reset — all previous items cleared. Cost head structure updated to the new 16-head taxonomy (${BASE_HEADS.map((h) => h.name).join(", ")}). Awaiting VP's fresh budget submission.`,
    }],
    headFreeze,
    ceilOverrides: {},
    tolerancePct: 5,
    secondApprovalPct: 15,
    revs: revsOf(null),
  };
}

async function seed() {
  // Users: add any seed account that does not exist yet. Existing accounts (and their passwords) are never touched.
  let added = 0;
  for (const u of SEED_USERS) {
    if (await User.exists({ userId: u.userId })) continue;
    await User.create({ userId: u.userId, name: u.name, role: u.role, isAdmin: !!u.isAdmin, title: u.title, passwordHash: bcrypt.hashSync(u.password, 10) });
    added++;
  }
  if (added) console.log(`Seeded ${added} user account(s).`);
  await migrateUsers();

  // App state: archive an out-of-date document, then seed a fresh one.
  const existing = await AppState.findOne({ key: "main" });
  if (existing && (existing.schemaVersion || 1) < SCHEMA_VERSION) {
    const archiveKey = `main-archived-v${existing.schemaVersion || 1}-${Date.now()}`;
    await AppState.updateOne({ _id: existing._id }, { $set: { key: archiveKey } });
    console.log(`Archived previous app state as "${archiveKey}" (schema v${existing.schemaVersion || 1} → v${SCHEMA_VERSION}).`);
  }
  if (!(await AppState.findOne({ key: "main" }))) {
    const state = freshState();
    await AppState.create(state);
    console.log(`Seeded app state (schema v${SCHEMA_VERSION}) with ${state.items.length} budget items across ${BASE_HEADS.length} cost heads.`);
  }

  // App state saved before revision numbers existed has none: start every slice at 0.
  const main = await AppState.findOne({ key: "main" }).select("revs").lean();
  const unnumbered = SLICES.filter((k) => typeof main?.revs?.[k] !== "number");
  if (unnumbered.length) {
    await AppState.updateOne({ key: "main" }, { $set: Object.fromEntries(unnumbered.map((k) => [`revs.${k}`, 0])) });
    console.log(`Added revision numbers to ${unnumbered.length} app-state slice(s).`);
  }
}

/* One-time account migrations. Safe to run on every start; each step is a no-op once applied. */
async function migrateUsers() {
  // The VP and the former "General Manager" are the same person: fold the admin account into a
  // single VP login carrying the admin flag, so the audit trail records them as VP.
  const gm = SEED_USERS.find((u) => u.userId === "amitkhandwal");
  const folded = await User.updateOne(
    { userId: "amitkhandwal", $or: [{ role: "General Manager" }, { isAdmin: { $ne: true } }] },
    { $set: { role: "VP", isAdmin: true, title: gm.title } }
  );
  if (folded.modifiedCount) console.log('Migrated "amitkhandwal" to role VP with the admin flag.');
  // Retire the separate VP-only login that the merged account replaces.
  const retired = await User.deleteOne({ userId: "amit" });
  if (retired.deletedCount) console.log('Removed the retired "amit" login (merged into "amitkhandwal").');

  // The Purchase Executive role was merged into Purchase Manager: one person negotiates rates, issues POs
  // and signs them. Retire the separate "purchaseexec" login and fold any remaining account carrying the
  // old role into the merged one.
  const pm = SEED_USERS.find((u) => u.userId === "purchase");
  const retiredPE = await User.deleteOne({ userId: "purchaseexec" });
  if (retiredPE.deletedCount) console.log('Removed the retired "purchaseexec" login (merged into "purchase").');
  const foldedPE = await User.updateMany({ role: "Purchase Executive" }, { $set: { role: "Purchase Manager" } });
  if (foldedPE.modifiedCount) console.log(`Migrated ${foldedPE.modifiedCount} account(s) from role Purchase Executive to Purchase Manager.`);
  const retitled = await User.updateOne({ userId: "purchase", title: "Purchase Manager — Rate Negotiation" }, { $set: { title: pm.title } });
  if (retitled.modifiedCount) console.log('Updated the "purchase" account title for the merged role.');
}

/* ---------- auth ---------- */
function publicUser(u) {
  return { id: u.userId, name: u.name, role: u.role, isAdmin: !!u.isAdmin, title: u.title };
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not signed in." });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Session expired. Please sign in again." });
  }
}

/* ---------- app ---------- */
const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.post("/api/login", async (req, res) => {
  const { id, password } = req.body || {};
  if (!id || !password) return res.status(400).json({ error: "User ID and password are required." });
  const user = await User.findOne({ userId: String(id).trim().toLowerCase() });
  if (!user || !bcrypt.compareSync(String(password), user.passwordHash)) {
    return res.status(401).json({ error: "Invalid user ID or password. Please try again." });
  }
  const token = jwt.sign({ sub: user.userId, name: user.name, role: user.role, isAdmin: !!user.isAdmin }, JWT_SECRET, { expiresIn: TOKEN_TTL });
  res.json({ token, user: publicUser(user) });
});

/* Central sign-on from the CPG portal. The browser brings a hand-off token; the auth service says which
   local account (by userId) it is linked to, and that account is signed in exactly as /api/login does.
   Always 401 while AUTH_SERVICE_URL is not set; the password login above is untouched. */
app.post("/api/sso", async (req, res) => {
  const verified = await verifySsoToken(String((req.body || {}).token || ""));
  if (!verified) return res.status(401).json({ error: "SSO sign-in failed." });
  const user = await User.findOne({ userId: String(verified.localUserId || "").trim().toLowerCase() });
  if (!user) return res.status(404).json({ error: "No account linked." });
  const token = jwt.sign({ sub: user.userId, name: user.name, role: user.role, isAdmin: !!user.isAdmin }, JWT_SECRET, { expiresIn: TOKEN_TTL });
  res.json({ token, user: publicUser(user) });
});

/* User directory for the portal's admin screen (shared-secret guarded). `id` is the userId the SSO
   route looks accounts up by; there is no email on file. Password hashes are never included. */
app.get("/api/sso/users", directoryGuard, async (req, res) => {
  const list = await User.find({}, { userId: 1, name: 1, role: 1 }).sort({ userId: 1 }).lean();
  res.json(list.map((u) => ({ id: u.userId, name: u.name, email: "", role: u.role })));
});

const VIEW_ONLY = "This login is view-only and cannot make changes.";

/* Whole state, or with ?slices=a,b&auditLen=N just those slices plus the audit entries added since the
   caller's copy (the audit trail only ever grows at the front, so its new entries are the first few).
   Browsers re-read this way every few seconds when something changed, so it has to stay small. */
app.get("/api/state", requireAuth, async (req, res) => {
  if (typeof req.query.slices !== "string") {
    const state = await AppState.findOne({ key: "main" }).lean();
    if (!state) return res.status(500).json({ error: "App state not initialised." });
    const out = { revs: revsOf(state) };
    SLICES.forEach((k) => (out[k] = state[k]));
    return res.json(out);
  }
  const wanted = req.query.slices.split(",").filter((k) => SLICES.includes(k) && k !== "audit");
  const auditLen = Math.max(0, parseInt(req.query.auditLen, 10) || 0);
  const audit = { $ifNull: ["$audit", []] };
  // one read, so the slices, the new audit entries and the revision numbers all belong to the same moment
  const [doc] = await AppState.aggregate([
    { $match: { key: "main" } },
    { $project: {
      _id: 0, revs: 1, ...Object.fromEntries(wanted.map((k) => [k, 1])),
      auditTotal: { $size: audit },
      auditNew: { $cond: [{ $gt: [{ $size: audit }, auditLen] }, { $slice: [audit, { $subtract: [{ $size: audit }, auditLen] }] }, []] },
      // the entry just after the new ones: it should be the first one the caller already holds
      auditNext: { $arrayElemAt: [audit, { $max: [0, { $subtract: [{ $size: audit }, auditLen] }] }] },
    } },
  ]);
  if (!doc) return res.status(500).json({ error: "App state not initialised." });
  const out = { revs: revsOf(doc), auditNew: doc.auditNew, auditNext: doc.auditNext ?? null, auditTotal: doc.auditTotal };
  wanted.forEach((k) => (out[k] = doc[k]));
  // the caller holds more entries than exist (the trail was rewritten by hand): send it whole
  if (doc.auditTotal < auditLen) out.audit = (await AppState.findOne({ key: "main" }).select("audit").lean()).audit || [];
  res.json(out);
});

/* Cheap "has anything changed?" check that every open browser makes every few seconds. */
app.get("/api/state/revs", requireAuth, async (req, res) => {
  const state = await AppState.findOne({ key: "main" }).select("revs").lean();
  if (!state) return res.status(500).json({ error: "App state not initialised." });
  res.json({ revs: revsOf(state) });
});

/* Save. body = { base: { slice: revision the browser last saw }, set: { slice: new value }, auditAppend: [entries] }.
   Every slice in `set` is written only if its revision still equals `base` — all of them or none, in one
   atomic update — so one user action (say requisition lines + item commitments) can never half-save, and
   a browser holding an old copy gets 409 instead of overwriting newer work. The audit trail is never
   replaced, only added to, so it needs no revision check. */
app.put("/api/state", requireAuth, async (req, res) => {
  if (req.user.role === VIEWER_ROLE) return res.status(403).json({ error: VIEW_ONLY });
  const { base = {}, set = {}, auditAppend = [] } = req.body || {};
  const keys = Object.keys(set);
  const unknown = keys.find((k) => !SLICES.includes(k) || k === "audit");
  if (unknown) return res.status(400).json({ error: `Unknown state slice "${unknown}".` });
  if (!Array.isArray(auditAppend)) return res.status(400).json({ error: "auditAppend must be a list." });
  if (!keys.length && !auditAppend.length) return res.status(400).json({ error: "Nothing to save." });

  const filter = { key: "main" };
  const $set = {}, $inc = {};
  keys.forEach((k) => { filter[`revs.${k}`] = Number(base[k]) || 0; $set[k] = set[k]; $inc[`revs.${k}`] = 1; });
  const update = { $inc, $currentDate: { updatedAt: true } };
  if (keys.length) update.$set = $set;
  if (auditAppend.length) { update.$push = { audit: { $each: auditAppend, $position: 0 } }; $inc["revs.audit"] = 1; }

  // the raw collection: these are plain JSON slices, there is nothing for Mongoose to cast
  const saved = await AppState.collection.findOneAndUpdate(filter, update, { returnDocument: "after", projection: { revs: 1 } });
  if (!saved) {
    const now = await AppState.findOne({ key: "main" }).select("revs").lean();
    return res.status(409).json({ error: "Someone else changed this data first.", revs: revsOf(now) });
  }
  res.json({ ok: true, revs: revsOf(saved) });
});

/* The old save route replaced a whole slice with whatever the browser held, however old. Only a page
   opened before the upgrade still calls it, and that page is exactly the out-of-date copy that must not
   be written — so it is refused. */
app.put("/api/state/:slice", requireAuth, (req, res) => {
  if (req.user.role === VIEWER_ROLE) return res.status(403).json({ error: VIEW_ONLY });
  res.status(409).json({ error: "This page is out of date. Refresh the browser to carry on." });
});

/* serve the built frontend when dist/ exists (production) */
const distDir = path.resolve(__dirname, "..", "dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      return res.sendFile(path.join(distDir, "index.html"));
    }
    next();
  });
}

/* ---------- start ---------- */
mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log(`Connected to MongoDB: ${MONGODB_URI}`);
    await seed();
    app.listen(PORT, () => console.log(`API server running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err.message);
    process.exit(1);
  });
