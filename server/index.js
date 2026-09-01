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
import { BASE_HEADS, TOTAL_BUDGET } from "../src/data/heads.js";
import { fmtINR, nowStamp } from "../src/utils/format.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/cpa-budget-control";
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const TOKEN_TTL = "12h";

/* ---------- models ---------- */
const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, required: true },
  role: { type: String, required: true, enum: ["President", "Purchase Manager", "Department Head"] },
  title: { type: String, default: "" },
  passwordHash: { type: String, required: true },
});
const User = mongoose.model("User", userSchema);

const stateSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  items: { type: mongoose.Schema.Types.Mixed, default: [] },
  prs: { type: mongoose.Schema.Types.Mixed, default: [] },
  audit: { type: mongoose.Schema.Types.Mixed, default: [] },
  headFreeze: { type: mongoose.Schema.Types.Mixed, default: {} },
  ceilOverrides: { type: mongoose.Schema.Types.Mixed, default: {} },
  tolerancePct: { type: Number, default: 5 },
}, { minimize: false, timestamps: true });
const AppState = mongoose.model("AppState", stateSchema);

/* ---------- first-run seeding ---------- */
const SEED_USERS = [
  { userId: "arjun", password: "President@2026", name: "Arjun Arora", role: "President", title: "President & Final Exception Approver" },
  { userId: "purchase", password: "Purchase@2026", name: "Purchase Manager", role: "Purchase Manager", title: "Purchase Manager" },
  { userId: "depthead", password: "Dept@2026", name: "Department Head", role: "Department Head", title: "Department Head" },
];

async function seed() {
  if ((await User.countDocuments()) === 0) {
    await User.insertMany(SEED_USERS.map((u) => ({
      userId: u.userId, name: u.name, role: u.role, title: u.title,
      passwordHash: bcrypt.hashSync(u.password, 10),
    })));
    console.log(`Seeded ${SEED_USERS.length} users.`);
  }
  if (!(await AppState.findOne({ key: "main" }))) {
    const items = RAW_ITEMS.map((it) => ({
      ...it,
      committedQty: 0,
      committedVal: 0,
      approvalStatus: it.status === "Complete" ? "Approved" : "Pending",
      freezeState: "Not Frozen",
      deleted: false,
    }));
    const headFreeze = {};
    BASE_HEADS.forEach((h) => (headFreeze[h.name] = "Not Frozen"));
    await AppState.create({
      key: "main",
      items,
      prs: [],
      audit: [{ ts: nowStamp(), who: "System", text: `Imported ${RAW_ITEMS.length} line items from CPA_PRE_OPENING_CAPEX_WORKSHEET across 17 source sheets. Total approved operating-goods budget: ${fmtINR(TOTAL_BUDGET)}.` }],
      headFreeze,
      ceilOverrides: {},
      tolerancePct: 5,
    });
    console.log(`Seeded app state with ${items.length} budget items.`);
  }
}

/* ---------- auth ---------- */
function publicUser(u) {
  return { id: u.userId, name: u.name, role: u.role, title: u.title };
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
  const token = jwt.sign({ sub: user.userId, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: TOKEN_TTL });
  res.json({ token, user: publicUser(user) });
});

app.get("/api/state", requireAuth, async (req, res) => {
  const state = await AppState.findOne({ key: "main" }).lean();
  if (!state) return res.status(500).json({ error: "App state not initialised." });
  const { items, prs, audit, headFreeze, ceilOverrides, tolerancePct } = state;
  res.json({ items, prs, audit, headFreeze, ceilOverrides, tolerancePct });
});

const SLICES = ["items", "prs", "audit", "headFreeze", "ceilOverrides", "tolerancePct"];
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
