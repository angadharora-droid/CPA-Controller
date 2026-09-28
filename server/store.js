/* ---------- where the app's data lives in MongoDB ----------
   Each kind of record has its own collection, one document per record:
     items              budget items                        _id = the item id
     requisitions       purchase requisitions, lines inside  _id = the PR number
     purchase_orders    purchase orders                     _id = the PO number
     goods_receipts     goods-receipt notes                 _id = the GRN number
     audit_trail        one entry per logged action         seq: higher = newer
     settings           one document "main": PR/PO counters, approval thresholds, head freeze and
                        ceilings, and the revision number of every piece of state (revs) — that is how an
                        out-of-date browser is stopped from saving its old copy over newer work
     appstate_archives  old copies, never deleted
   The browser still loads and saves whole "slices" (the items list, the PR list...) as before; a saved
   list is turned into just the documents that changed. A save that touches several collections runs as
   one transaction, so all of it lands or none of it does. (A standalone MongoDB, as in local
   development, has no transactions: writes then go one after another.) */
import mongoose from "mongoose";

const { EJSON } = mongoose.mongo.BSON;

export const SLICES = ["items", "prs", "prCounter", "pos", "poCounter", "grns", "audit", "headFreeze", "ceilOverrides", "tolerancePct", "secondApprovalPct"];
export const revsOf = (doc) => Object.fromEntries(SLICES.map((k) => [k, Number(doc?.revs?.[k]) || 0]));

const LISTS = { items: "items", prs: "requisitions", pos: "purchase_orders", grns: "goods_receipts" };
const SETTING_DEFAULTS = { prCounter: 1, poCounter: 1, headFreeze: {}, ceilOverrides: {}, tolerancePct: 5, secondApprovalPct: 15 };
const SETTING_KEYS = Object.keys(SETTING_DEFAULTS);
const MAIN = "main";
const LEGACY = "appstates";          // the old layout: everything in one document, key "main"
const SPLITTING = "main-splitting";  // that document while it is being copied out
export const ARCHIVES = "appstate_archives";

const settingDefault = (k) => structuredClone(SETTING_DEFAULTS[k]);
const exact = (v) => EJSON.stringify(v ?? null, { relaxed: false });
const recordProjection = { _id: 0, _order: 0 };
const auditProjection = { _id: 0, seq: 0 };

/* Document ids for a list: the record's own id; a repeated or missing id gets a suffix, so a list is
   always stored whole even if it ever holds two records with the same id. */
function recordKeys(list) {
  const seen = new Map();
  return list.map((r) => {
    const base = r && (typeof r.id === "string" || typeof r.id === "number") ? String(r.id) : "(no id)";
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} #${n}`;
  });
}

/* Sort positions (_order) for a list as the app now holds it. Records already stored keep their
   position while their order among themselves is unchanged, so a PR added at the top gets a number
   below the rest and nothing else is rewritten; a real reshuffle renumbers the lot. */
function orderValues(keys, stored) {
  const known = keys.map((k) => stored.get(k));
  const renumber = () => keys.map((_, i) => i);
  let prev = -Infinity;
  for (const v of known) if (v !== undefined) { if (!(v > prev)) return renumber(); prev = v; }
  const out = new Array(keys.length);
  let lo;
  for (let i = 0; i < keys.length; i++) {
    if (known[i] !== undefined) { out[i] = lo = known[i]; continue; }
    let j = i;
    while (j < keys.length && known[j] === undefined) j++;
    const hi = j < keys.length ? known[j] : undefined, n = j - i;
    for (let t = 0; t < n; t++) {
      out[i + t] = lo === undefined && hi === undefined ? t
        : lo === undefined ? hi - (n - t)
        : hi === undefined ? lo + t + 1
        : lo + ((hi - lo) * (t + 1)) / (n + 1);
    }
    i = j - 1;
    lo = out[i];
  }
  for (let i = 1; i < out.length; i++) if (!(out[i] > out[i - 1])) return renumber();
  return out;
}

export async function openStore(db, client) {
  const hello = await db.admin().command({ hello: 1 }).catch(() => ({}));
  const transactions = !!(hello.setName || hello.msg === "isdbgrid");
  const settings = db.collection("settings");
  const auditCol = db.collection("audit_trail");
  const archives = db.collection(ARCHIVES);
  const legacy = db.collection(LEGACY);

  /* Run fn(session) as one transaction (retried by the driver on a transient clash). */
  async function inTx(fn) {
    if (!transactions) return fn(undefined);
    const session = client.startSession();
    let result;
    try {
      await session.withTransaction(async (s) => { result = await fn(s); }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary" });
    } finally {
      await session.endSession();
    }
    return result;
  }

  const readList = (k, session) => db.collection(LISTS[k]).find({}, { session, sort: { _order: 1 }, projection: recordProjection }).toArray();
  const readAudit = (session, extra = {}) => auditCol.find({}, { session, sort: { seq: -1 }, projection: auditProjection, ...extra }).toArray();

  async function readAllIn(session) {
    const s = await settings.findOne({ _id: MAIN }, { session });
    if (!s) return null;
    const out = { revs: revsOf(s), schemaVersion: s.schemaVersion || 1, createdAt: s.createdAt, updatedAt: s.updatedAt };
    SETTING_KEYS.forEach((k) => (out[k] = s[k] ?? settingDefault(k)));
    for (const k of Object.keys(LISTS)) out[k] = await readList(k, session);
    out.audit = await readAudit(session);
    return out;
  }

  /* Everything, as of one moment. */
  const readAll = () => inTx(readAllIn);

  /* Just these slices, plus the audit entries added since the caller's copy of auditLen entries (the
     trail only grows at the top, so its new entries are the first few). Settings — and with them the
     revision numbers — are read first: without a transaction, a save landing mid-read then makes the
     caller's next save look out of date (and merge), never the other way round. */
  const readSome = (wanted, auditLen) => inTx(async (session) => {
    const s = await settings.findOne({ _id: MAIN }, { session });
    if (!s) return null;
    const out = { revs: revsOf(s) };
    for (const k of wanted) out[k] = LISTS[k] ? await readList(k, session) : s[k] ?? settingDefault(k);
    const total = await auditCol.countDocuments({}, { session });
    const fresh = Math.max(0, total - auditLen);
    out.auditTotal = total;
    out.auditNew = fresh ? await readAudit(session, { limit: fresh }) : [];
    // the entry just after the new ones: it should be the first one the caller already holds
    out.auditNext = (await readAudit(session, { skip: fresh, limit: 1 }))[0] ?? null;
    // the caller holds more entries than exist (the trail was rewritten by hand): send it whole
    if (total < auditLen) out.audit = await readAudit(session);
    return out;
  });

  async function readRevs() {
    const s = await settings.findOne({ _id: MAIN }, { projection: { revs: 1 } });
    return s ? revsOf(s) : null;
  }

  /* Store a whole list, writing only the records that changed and removing those that are gone. */
  async function writeList(k, list, session) {
    const col = db.collection(LISTS[k]);
    const stored = await col.find({}, { session }).toArray();
    const byKey = new Map(stored.map((d) => [d._id, d]));
    const keys = recordKeys(list);
    const order = orderValues(keys, new Map(stored.map((d) => [d._id, d._order])));
    const ops = [];
    list.forEach((rec, i) => {
      const old = byKey.get(keys[i]);
      if (old) {
        const { _id, _order, ...body } = old;
        if (_order === order[i] && exact(body) === exact(rec)) return;
      }
      ops.push({ replaceOne: { filter: { _id: keys[i] }, replacement: { _id: keys[i], _order: order[i], ...rec }, upsert: true } });
    });
    const keep = new Set(keys);
    const gone = stored.filter((d) => !keep.has(d._id)).map((d) => d._id);
    if (gone.length) ops.push({ deleteMany: { filter: { _id: { $in: gone } } } });
    if (ops.length) await col.bulkWrite(ops, { session, ordered: true });
  }

  /* Save. set = { slice: new value } is written only if every slice's revision still equals base — all
     of it or none — and the audit trail is only ever added to. Returns { revs } or { conflict, revs }. */
  async function save({ base, set, auditAppend }) {
    const keys = Object.keys(set);
    const result = await inTx(async (session) => {
      const filter = { _id: MAIN };
      const $inc = {}, $set = { updatedAt: new Date() };
      keys.forEach((k) => {
        filter[`revs.${k}`] = Number(base[k]) || 0;
        $inc[`revs.${k}`] = 1;
        if (!LISTS[k]) $set[k] = set[k];
      });
      if (auditAppend.length) { $inc["revs.audit"] = 1; $inc.auditSeq = auditAppend.length; }
      // claiming the revision numbers first: a second save racing this one fails here, before any write
      const after = await settings.findOneAndUpdate(filter, { $inc, $set }, { session, returnDocument: "after" });
      if (!after) return { conflict: true };
      for (const k of keys) if (LISTS[k]) await writeList(k, set[k], session);
      // newest first, as the app holds them: the first entry gets the highest number
      if (auditAppend.length) await auditCol.insertMany(auditAppend.map((e, i) => ({ seq: after.auditSeq - i, ...e })), { session });
      return { revs: revsOf(after) };
    });
    if (result.conflict) result.revs = await readRevs();
    return result;
  }

  /* Replace the whole state (first run, a schema reset, the move out of the old single document). */
  async function writeWhole(state) {
    const now = new Date();
    await inTx(async (session) => {
      for (const k of Object.keys(LISTS)) {
        const col = db.collection(LISTS[k]);
        await col.deleteMany({}, { session });
        const keys = recordKeys(state[k]);
        if (state[k].length) await col.insertMany(state[k].map((r, i) => ({ _id: keys[i], _order: i, ...r })), { session });
      }
      await auditCol.deleteMany({}, { session });
      const n = state.audit.length;
      if (n) await auditCol.insertMany(state.audit.map((e, i) => ({ seq: n - i, ...e })), { session });
      await settings.replaceOne({ _id: MAIN }, {
        _id: MAIN, schemaVersion: state.schemaVersion,
        ...Object.fromEntries(SETTING_KEYS.map((k) => [k, state[k] ?? settingDefault(k)])),
        auditSeq: n, revs: revsOf(state), createdAt: state.createdAt || now, updatedAt: state.updatedAt || now,
      }, { session, upsert: true });
    });
  }

  async function clearAll() {
    await inTx(async (session) => {
      for (const name of [...Object.values(LISTS), "audit_trail", "settings"]) await db.collection(name).deleteMany({}, { session });
    });
  }

  /* The whole state as one document in the old shape — for archives and backups. */
  async function snapshot(key = MAIN) {
    const s = await readAll();
    if (!s) return null;
    const doc = { key, schemaVersion: s.schemaVersion };
    SLICES.forEach((k) => (doc[k] = s[k]));
    return { ...doc, revs: s.revs, createdAt: s.createdAt, updatedAt: s.updatedAt };
  }

  /* Keep a document in appstate_archives: copied, checked, and only then removed from where it was. */
  async function moveToArchive(doc, key, from) {
    const { _id, key: _k, ...body } = doc;
    let copy = await archives.findOne({ _id });
    if (!copy) { await archives.insertOne({ _id, key, ...body }); copy = await archives.findOne({ _id }); }
    const { _id: _i, key: _c, ...copied } = copy || {};
    if (!copy || exact(copied) !== exact(body)) throw new Error(`the archived copy of "${doc.key}" does not match; it was left in place`);
    if (from) await from.deleteOne({ _id });
  }

  /* The old layout: copy the single document into the collections, check the copy against it, then
     keep the document in appstate_archives. */
  async function splitLegacy(log) {
    // out of an old server's reach first: one still running during a deploy can then no longer read or
    // save "main", so nothing it writes can be missed by the copy
    await legacy.updateOne({ key: MAIN }, { $set: { key: SPLITTING } });
    const doc = await legacy.findOne({ key: SPLITTING });
    if (!doc) return false;
    const state = { schemaVersion: doc.schemaVersion || 1, revs: revsOf(doc), createdAt: doc.createdAt, updatedAt: doc.updatedAt };
    Object.keys(LISTS).forEach((k) => (state[k] = Array.isArray(doc[k]) ? doc[k] : []));
    state.audit = Array.isArray(doc.audit) ? doc.audit : [];
    SETTING_KEYS.forEach((k) => (state[k] = doc[k] ?? settingDefault(k)));
    try {
      await writeWhole(state);
      const back = await readAll();
      const bad = [...SLICES, "revs"].filter((k) => exact(back?.[k]) !== exact(state[k]));
      if (bad.length) throw new Error(`the copy does not match for ${bad.join(", ")}`);
    } catch (err) {
      // put things back exactly as they were: the single document is the data again
      await clearAll().catch(() => {});
      await legacy.updateOne({ _id: doc._id }, { $set: { key: MAIN } });
      throw new Error(`Could not move the app state into separate collections (${err.message}). Nothing was changed.`);
    }
    await moveToArchive(doc, `main-before-split-${Date.now()}`, legacy);
    log(`Moved the app state into separate collections: ${state.items.length} items, ${state.prs.length} requisitions, ${state.pos.length} purchase orders, ${state.grns.length} goods receipts, ${state.audit.length} audit entries (copy verified; the old single document is kept in ${ARCHIVES}).`);
    return true;
  }

  /* Start-up: bring the database to the current layout and schema. */
  async function init({ schemaVersion, fresh, log = console.log }) {
    await auditCol.createIndex({ seq: -1 }, { unique: true });
    let s = await settings.findOne({ _id: MAIN });
    if (!s && !(await splitLegacy(log))) {
      await writeWhole({ ...fresh(), schemaVersion });
      log(`Seeded app state (schema v${schemaVersion}).`);
    }
    s = await settings.findOne({ _id: MAIN });

    // an older schema: keep the whole state as one archived document, then start from a fresh one
    if ((s.schemaVersion || 1) < schemaVersion) {
      const key = `main-archived-v${s.schemaVersion || 1}-${Date.now()}`;
      const old = await snapshot(key);
      await archives.insertOne(old);
      const next = { ...fresh(), schemaVersion };
      next.revs = Object.fromEntries(SLICES.map((k) => [k, old.revs[k] + 1])); // open pages see every slice as changed
      await writeWhole(next);
      log(`Archived previous app state as "${key}" in ${ARCHIVES} (schema v${old.schemaVersion} → v${schemaVersion}).`);
    }

    // anything still in the old collection goes to the archive (a copy interrupted mid-way, or a
    // document an older server version wrote after the move — its changes are not in the live data)
    for (const d of await legacy.find({}).toArray()) {
      const key = d.key === SPLITTING ? `main-before-split-${Date.now()}` : d.key === MAIN ? `main-leftover-${Date.now()}` : d.key;
      await moveToArchive(d, key, legacy);
      log(d.key === MAIN
        ? `WARNING: found an app-state document written by an older server version after the move; kept it in ${ARCHIVES} as "${key}". Its changes are NOT in the live data.`
        : `Moved "${d.key}" from ${LEGACY} to ${ARCHIVES}.`);
    }
    if ((await db.listCollections({ name: LEGACY }).toArray()).length && !(await legacy.countDocuments())) await legacy.drop();

    // revision numbers for any slice that has none yet
    const revs = (await settings.findOne({ _id: MAIN }, { projection: { revs: 1 } }))?.revs || {};
    const unnumbered = SLICES.filter((k) => typeof revs[k] !== "number");
    if (unnumbered.length) await settings.updateOne({ _id: MAIN }, { $set: Object.fromEntries(unnumbered.map((k) => [`revs.${k}`, 0])) });
  }

  return { transactions, init, readAll, readSome, readRevs, save, snapshot, writeWhole };
}
