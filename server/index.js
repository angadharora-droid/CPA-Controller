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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/cpa-budget-control";
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const TOKEN_TTL = "12h";

/* Bump this whenever the stored app-state shape or cost-head taxonomy changes.
   An older "main" document is archived (never deleted) and a fresh one is seeded. */
const SCHEMA_VERSION = 2;

const ROLES = ["VP", "President", "Purchase Manager", "Store Manager", "Department Head"];

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
}, { minimize: false, timestamps: true });
const AppState = mongoose.model("AppState", stateSchema);

/* ---------- first-run seeding ---------- */
const SEED_USERS = [
  { userId: "amitkhandwal", password: "Amit@GM#2026", name: "Amit Khandwal", role: "VP", isAdmin: true, title: "Vice President — Budget Submission, First Approval & Full Administrative Access" },
  { userId: "arjun", password: "President@2026", name: "Arjun Arora", role: "President", title: "President — Budget Freeze & Second Approval" },
  { userId: "purchase", password: "Purchase@2026", name: "Purchase Manager", role: "Purchase Manager", title: "Purchase Manager — Rate Negotiation & Purchase Orders" },
  { userId: "store", password: "Store@2026", name: "Store Manager", role: "Store Manager", title: "Store Manager — Goods Receipt" },
  { userId: "depthead", password: "Dept@2026", name: "Department Head", role: "Department Head", title: "Department Head — Requisitions" },
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

const SLICES = ["items", "prs", "prCounter", "pos", "poCounter", "grns", "audit", "headFreeze", "ceilOverrides", "tolerancePct", "secondApprovalPct"];

app.get("/api/state", requireAuth, async (req, res) => {
  const state = await AppState.findOne({ key: "main" }).lean();
  if (!state) return res.status(500).json({ error: "App state not initialised." });
  const out = {};
  SLICES.forEach((k) => (out[k] = state[k]));
  res.json(out);
});

app.put("/api/state/:slice", requireAuth, async (req, res) => {
  const { slice } = req.params;
  if (!SLICES.includes(slice)) return res.status(400).json({ error: `Unknown state slice "${slice}".` });
  if (!("value" in (req.body || {}))) return res.status(400).json({ error: "Missing value." });
  await AppState.updateOne({ key: "main" }, { $set: { [slice]: req.body.value } });
  res.json({ ok: true });
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
