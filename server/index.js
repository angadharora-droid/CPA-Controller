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
import { openStore, SLICES, revsOf } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/cpa-budget-control";
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const TOKEN_TTL = "12h";

/* Bump this whenever the stored app-state shape or cost-head taxonomy changes.
   The older state is archived as one document (never deleted) and a fresh one is seeded. */
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

/* The app state — items, requisitions, POs, GRNs, audit trail and settings — lives in one collection per
   kind of record (server/store.js). The browser loads and saves it in "slices" (SLICES); each carries a
   revision number (revs.<slice>) that goes up by one on every save — that is how an out-of-date browser
   is stopped from saving its old copy over someone else's newer work. */
let store;

/* ---------- first-run seeding ---------- */
const SEED_USERS = [
  { userId: "amitkhandwal", password: "Amit@GM#2026", name: "Amit Kandwal", role: "VP", isAdmin: true, title: "Vice President — Budget Submission, First Approval & Full Administrative Access" },
  { userId: "arjun", password: "President@2026", name: "Arjun Arora", role: "President", title: "President — Budget Freeze & Second Approval" },
  { userId: "purchase", password: "Purchase@2026", name: "Purchase Manager", role: "Purchase Manager", title: "Purchase Manager — Rate Negotiation & Purchase Orders" },
  { userId: "store", password: "Store@2026", name: "Store Manager", role: "Store Manager", title: "Store Manager — Goods Receipt" },
  { userId: "depthead", password: "Dept@2026", name: "Department Head", role: "Department Head", title: "Department Head — Requisitions" },
  { userId: "ravisharma", password: "Ravi@2026", name: "Ravi Sharma", role: "Department Head", title: "Department Head — Requisitions" },
  { userId: "sunil", password: "Sunil@2026", name: "Sunil", role: "Department Head", title: "Department Head — Requisitions" },
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

  // App state: move it out of the old single document if need be, archive an out-of-date schema, or
  // seed a fresh one on first run.
  store = await openStore(mongoose.connection.db, mongoose.connection.getClient());
  await store.init({ schemaVersion: SCHEMA_VERSION, fresh: freshState, log: (m) => console.log(m) });
  if (!store.transactions) console.log("Note: this MongoDB is a standalone server without transactions (fine for local development); a save touching several collections is not all-or-nothing here.");
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
  // Name spelling corrected to "Amit Kandwal" (the login ID stays "amitkhandwal").
  const renamed = await User.updateOne({ userId: "amitkhandwal", name: "Amit Khandwal" }, { $set: { name: gm.name } });
  if (renamed.modifiedCount) console.log(`Renamed the "amitkhandwal" account to "${gm.name}".`);

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

/* The build of the frontend being served, from dist/version.json (written by `vite build`); null when
   there is no build, e.g. under the Vite dev server. Re-read whenever the file changes, so a rebuild
   without a restart does not lock out the new pages. */
const distDir = path.resolve(__dirname, "..", "dist");
const versionFile = path.join(distDir, "version.json");
let build = { mtimeMs: -1, id: null };
function currentBuild() {
  try {
    const { mtimeMs } = fs.statSync(versionFile);
    if (mtimeMs !== build.mtimeMs) build = { mtimeMs, id: JSON.parse(fs.readFileSync(versionFile, "utf8")).version || null };
  } catch {
    build = { mtimeMs: -1, id: null };
  }
  return build.id;
}

/* A page opened before the latest deploy is refused on every call — it can neither read nor save — and
   the page replaces itself with a Refresh screen. A page from before this check sends no version at all
   and is refused the same way. ("dev" is the Vite dev server; /sso/users is the portal, not a page.) */
app.use("/api", (req, res, next) => {
  const serving = currentBuild();
  const theirs = req.get("X-App-Version");
  if (!serving || theirs === serving || theirs === "dev" || req.path === "/sso/users") return next();
  res.status(426).json({ error: "This page is out of date. Refresh the browser to load the latest version.", code: "APP_OUTDATED" });
});

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
   caller's copy. Browsers re-read this way every few seconds when something changed, so it has to stay small. */
app.get("/api/state", requireAuth, async (req, res) => {
  if (typeof req.query.slices !== "string") {
    const state = await store.readAll();
    if (!state) return res.status(500).json({ error: "App state not initialised." });
    const out = { revs: state.revs };
    SLICES.forEach((k) => (out[k] = state[k]));
    return res.json(out);
  }
  const wanted = req.query.slices.split(",").filter((k) => SLICES.includes(k) && k !== "audit");
  const auditLen = Math.max(0, parseInt(req.query.auditLen, 10) || 0);
  const out = await store.readSome(wanted, auditLen);
  if (!out) return res.status(500).json({ error: "App state not initialised." });
  res.json(out);
});

/* Cheap "has anything changed?" check that every open browser makes every few seconds. */
app.get("/api/state/revs", requireAuth, async (req, res) => {
  const revs = await store.readRevs();
  if (!revs) return res.status(500).json({ error: "App state not initialised." });
  res.json({ revs });
});

/* Save. body = { base: { slice: revision the browser last saw }, set: { slice: new value }, auditAppend: [entries] }.
   Every slice in `set` is written only if its revision still equals `base` — all of them or none, in one
   transaction — so one user action (say requisition lines + item commitments) can never half-save, and
   a browser holding an old copy gets 409 instead of overwriting newer work. The audit trail is never
   replaced, only added to, so it needs no revision check. */
app.put("/api/state", requireAuth, async (req, res) => {
  if (req.user.role === VIEWER_ROLE) return res.status(403).json({ error: VIEW_ONLY });
  const { base = {}, set = {}, auditAppend = [] } = req.body || {};
  const keys = Object.keys(set);
  const unknown = keys.find((k) => !SLICES.includes(k) || k === "audit");
  if (unknown) return res.status(400).json({ error: `Unknown state slice "${unknown}".` });
  const notList = keys.find((k) => ["items", "prs", "pos", "grns"].includes(k) && !Array.isArray(set[k]));
  if (notList) return res.status(400).json({ error: `"${notList}" must be a list.` });
  if (!Array.isArray(auditAppend)) return res.status(400).json({ error: "auditAppend must be a list." });
  if (!keys.length && !auditAppend.length) return res.status(400).json({ error: "Nothing to save." });

  const saved = await store.save({ base, set, auditAppend });
  if (saved.conflict) return res.status(409).json({ error: "Someone else changed this data first.", revs: saved.revs });
  res.json({ ok: true, revs: saved.revs });
});

/* The old save route replaced a whole slice with whatever the browser held, however old. Only a page
   opened before the upgrade still calls it, and that page is exactly the out-of-date copy that must not
   be written — so it is refused. */
app.put("/api/state/:slice", requireAuth, (req, res) => {
  if (req.user.role === VIEWER_ROLE) return res.status(403).json({ error: VIEW_ONLY });
  res.status(409).json({ error: "This page is out of date. Refresh the browser to carry on." });
});

/* serve the built frontend when dist/ exists (production) */
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
