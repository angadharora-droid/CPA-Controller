/* ---------- three-way merge of app state ----------
   Used when a save is refused because someone else saved the same slice first. Instead of throwing the
   user's change away, it is replayed on top of the newer data:
     base   = the copy this browser started from
     mine   = base + this user's unsaved changes
     theirs = what is on the server now
   Whatever only one side touched is kept. A true clash — the same field of the same record changed
   both ways — goes to the server's version and is reported, never silently mixed. */

// counters that both sides add to: two approvals of the same item must both count
const ADDITIVE = new Set(["committedQty", "committedVal", "qtyReceived"]);

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);

/* "lineId" for requisition / PO lines, "id" for items, PRs, POs and GRNs; null for plain lists. */
function recordKey(list) {
  if (!list.length || !list.every(isObj)) return null;
  if (list.every((r) => "lineId" in r)) return "lineId";
  return list.every((r) => "id" in r) ? "id" : null;
}

export function merge3(base, mine, theirs, path, conflicts) {
  if (same(mine, base)) return theirs;
  if (same(theirs, base) || same(mine, theirs)) return mine;
  const num = (v) => typeof v === "number" || v === null || v === undefined;
  if (ADDITIVE.has(path[path.length - 1]) && num(base) && num(mine) && num(theirs)) return (theirs || 0) + ((mine || 0) - (base || 0));
  if (isObj(mine) && isObj(theirs)) {
    const b = isObj(base) ? base : {};
    const out = {};
    for (const k of new Set([...Object.keys(theirs), ...Object.keys(mine)])) {
      const v = merge3(b[k], mine[k], theirs[k], [...path, k], conflicts);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  if (Array.isArray(mine) && Array.isArray(theirs)) {
    const key = recordKey([...mine, ...theirs]);
    if (key) return mergeList(Array.isArray(base) ? base : [], mine, theirs, key, path, conflicts);
  }
  conflicts.push(path);
  return theirs;
}

function mergeList(base, mine, theirs, key, path, conflicts) {
  const by = (list) => new Map(list.map((r) => [r[key], r]));
  const baseBy = by(base), mineBy = by(mine), theirsBy = by(theirs);
  // their list and order, with my changes folded into each record I also hold
  const out = theirs.map((t) => (mineBy.has(t[key]) ? merge3(baseBy.get(t[key]), mineBy.get(t[key]), t, [...path, t[key]], conflicts) : t));
  // a record I changed that they removed: theirs stands, but say so
  mine.forEach((m) => { if (baseBy.has(m[key]) && !theirsBy.has(m[key]) && !same(m, baseBy.get(m[key]))) conflicts.push([...path, m[key]]); });
  // records I added go back where I put them: new PRs / POs / GRNs lead the list, imported items end it
  const firstShared = mine.findIndex((r) => baseBy.has(r[key]));
  const added = mine.filter((r) => !baseBy.has(r[key]) && !theirsBy.has(r[key]));
  const leads = (r) => firstShared === -1 || mine.indexOf(r) < firstShared;
  return [...added.filter(leads), ...out, ...added.filter((r) => !leads(r))];
}

/* PR / PO / GRN numbers are handed out by the browser, so two people working at the same moment can
   both take "PR-CPA-0031". The one that reaches the server second is renumbered here, before merging. */
const pad = (n) => String(n).padStart(4, "0");
const numberOf = (id) => Number(String(id).match(/(\d+)$/)?.[1]) || 0;

function renumber(prefix, baseList, mineList, theirsList, startAt, fixRecord) {
  const baseIds = new Set(baseList.map((r) => r.id));
  const theirsBy = new Map(theirsList.map((r) => [r.id, r]));
  let next = Math.max(startAt, 1 + Math.max(0, ...theirsList.map((r) => numberOf(r.id)), ...mineList.map((r) => numberOf(r.id))));
  const renamed = [];
  const list = mineList.map((r) => {
    if (baseIds.has(r.id) || !theirsBy.has(r.id) || same(theirsBy.get(r.id), r)) return r; // not new, or no clash
    const id = `${prefix}${pad(next++)}`;
    renamed.push([r.id, id]);
    return fixRecord({ ...r, id }, r.id, id);
  });
  return { list, renamed, next };
}

/* Merge the slices this browser has unsaved changes in (`dirty`) onto the server's state.
   Returns { merged, conflicts, renamed }: merged holds every slice (the untouched ones are theirs). */
export function mergeSlices(base, mine, theirs, dirty, newAudit) {
  const work = { ...mine };
  let renamed = [];
  if (dirty.includes("prs")) {
    const r = renumber("PR-CPA-", base.prs, work.prs, theirs.prs, Math.max(work.prCounter || 1, theirs.prCounter || 1),
      (pr, oldId, id) => ({ ...pr, lines: pr.lines.map((l) => ({ ...l, lineId: String(l.lineId).startsWith(`${oldId}-`) ? id + String(l.lineId).slice(oldId.length) : l.lineId })) }));
    work.prs = r.list; renamed = renamed.concat(r.renamed);
    if (r.renamed.length) work.prCounter = r.next;
  }
  if (dirty.includes("pos")) {
    const r = renumber("PO-CPA-", base.pos, work.pos, theirs.pos, Math.max(work.poCounter || 1, theirs.poCounter || 1), (po) => po);
    work.pos = r.list; renamed = renamed.concat(r.renamed);
    if (r.renamed.length) {
      work.poCounter = r.next;
      // the requisition lines this browser just put on that PO carry its number too
      const newId = new Map(r.renamed);
      const basePo = new Map(base.prs.flatMap((pr) => pr.lines.map((l) => [l.lineId, l.poId])));
      work.prs = work.prs.map((pr) => ({ ...pr, lines: pr.lines.map((l) => (newId.has(l.poId) && basePo.get(l.lineId) !== l.poId ? { ...l, poId: newId.get(l.poId) } : l)) }));
    }
  }
  if (dirty.includes("grns")) {
    const r = renumber("GRN-CPA-", base.grns, work.grns, theirs.grns, theirs.grns.length + 1, (g) => g);
    work.grns = r.list; renamed = renamed.concat(r.renamed);
  }
  // the audit entries waiting to be saved name those numbers
  const audit = newAudit.map((a) => renamed.reduce((e, [from, to]) => ({ ...e, text: String(e.text).replace(new RegExp(`\\b${from}\\b`, "g"), to) }), a));

  const conflicts = [];
  const merged = { ...theirs };
  const touched = new Set(dirty);
  if (renamed.length) ["prs", "pos", "prCounter", "poCounter"].forEach((k) => work[k] !== mine[k] && touched.add(k));
  for (const k of touched) {
    if (k === "audit") continue;
    merged[k] = k === "prCounter" || k === "poCounter" ? Math.max(work[k] || 1, theirs[k] || 1) : merge3(base[k], work[k], theirs[k], [k], conflicts);
  }
  merged.audit = audit.length ? [...audit, ...theirs.audit] : theirs.audit;
  return { merged, conflicts, renamed };
}

/* A clash named the way the user knows the record: "PR-CPA-0007-L2", "PO-CPA-0004", or the slice itself. */
const SLICE_NAMES = { items: "a budget item", headFreeze: "a budget head's freeze status", ceilOverrides: "a budget head's ceiling", tolerancePct: "the Good-to-Approve tolerance", secondApprovalPct: "the 2nd-approval threshold" };
export function describeConflict(path) {
  const record = [...path].reverse().find((p) => /-\d{4}/.test(String(p)));
  return record ? String(record) : SLICE_NAMES[path[0]] || String(path[0]);
}
