/* ---------- keeping every open browser and the database in step ----------
   Several people use the app at once. Each browser used to load the data once and then save whole
   slices from its own copy, so a page left open would quietly write its old copy over everyone's newer
   work (issued POs back in the queue, VP approvals gone, budget committed twice). Now:
     • every slice has a revision number; a save names the revision it started from and the server
       refuses it (409) if someone saved that slice since — all slices of one action or none;
     • a refused save is not thrown away: the newer data is fetched and the unsaved change is merged
       on top of it (utils/merge.js), then saved again;
     • the audit trail is only ever added to, never replaced;
     • every few seconds, and whenever the window gets focus, the browser asks whether anything
       changed and re-reads just those slices — so screens stay current without a manual refresh.
   Plain JavaScript, no React: BudgetApp feeds it the current slices and applies what it hands back. */
import { mergeSlices, describeConflict } from "./utils/merge.js";

export const SLICE_KEYS = ["items", "prs", "prCounter", "pos", "poCounter", "grns", "audit", "headFreeze", "ceilOverrides", "tolerancePct", "secondApprovalPct"];

const SAVE_DELAY = 600;    // a burst of edits goes up as one save
const RETRY_DELAY = 5000;  // after a failed save

/* api: the fetch wrapper · normalize: { slice: (serverValue) => value the app works with }
   adopt(slices): put these values on screen · notify(kind, text | null): "clash" | "unsaved" banners */
export function createStateSync({ api, normalize, adopt, notify, readOnly = false, saveDelay = SAVE_DELAY }) {
  let synced = null;   // slice -> the value last known to be on the server
  let latest = null;   // slice -> the value on screen
  let revs = {};
  let busy = false, timer = null, stopped = false, signedOut = false;

  const dirtyKeys = () => (synced && latest ? SLICE_KEYS.filter((k) => latest[k] !== synced[k]) : []);
  const unsavedAudit = () => latest.audit.slice(0, Math.max(0, latest.audit.length - synced.audit.length));
  const schedule = (ms) => { if (timer) clearTimeout(timer); timer = setTimeout(flush, ms); };
  const show = (next) => { latest = next; adopt(next); };

  async function load() {
    const s = await api("/state");
    const next = {};
    SLICE_KEYS.forEach((k) => (next[k] = normalize[k](s[k])));
    synced = next; revs = { ...s.revs };
    show(next);
  }

  /* The server's state as of now, re-reading only the slices whose revision moved. Slices that did not
     change keep the very same objects, so nothing on screen re-renders for them. */
  async function fetchTheirs(serverRevs) {
    const moved = SLICE_KEYS.filter((k) => k !== "audit" && (serverRevs[k] || 0) !== (revs[k] || 0));
    let s = await api(`/state?slices=${moved.join(",")}&auditLen=${synced.audit.length}`);
    // New audit entries normally sit in front of the ones held here. If two people's entries interleaved,
    // the entry after the new ones is not our first one: take the whole trail instead of guessing.
    const sameEntry = (a, b) => !!a && !!b && a.ts === b.ts && a.who === b.who && a.text === b.text;
    if (!s.audit && synced.audit.length && !sameEntry(s.auditNext, synced.audit[0])) s = await api(`/state?slices=${moved.join(",")}&auditLen=${Number.MAX_SAFE_INTEGER}`);
    const theirs = { ...synced };
    moved.forEach((k) => (theirs[k] = normalize[k](s[k])));
    if (s.audit) theirs.audit = normalize.audit(s.audit);
    else if (s.auditNew.length) theirs.audit = [...s.auditNew, ...synced.audit];
    // only what was actually re-read is now current; anything that moved meanwhile is caught next time
    const theirRevs = { ...revs, audit: s.revs.audit };
    moved.forEach((k) => (theirRevs[k] = s.revs[k]));
    return { theirs, theirRevs };
  }

  /* BudgetApp calls this after every render with the slices on screen. */
  function changed(slices) {
    latest = slices;
    if (!readOnly && !stopped && !signedOut && dirtyKeys().length) schedule(saveDelay);
  }

  async function flush() {
    timer = null;
    if (busy || stopped || readOnly || signedOut) return;
    const snap = latest, dirty = dirtyKeys();
    if (!dirty.length) return;
    busy = true;
    const auditAppend = unsavedAudit();
    const set = {}, base = {};
    dirty.filter((k) => k !== "audit").forEach((k) => { set[k] = snap[k]; base[k] = revs[k] || 0; });
    try {
      await api("/state", { method: "PUT", body: { base, set, auditAppend } });
      synced = { ...synced };
      dirty.forEach((k) => { synced[k] = snap[k]; if (k !== "audit" || auditAppend.length) revs[k] = (revs[k] || 0) + 1; });
      notify("unsaved", null);
    } catch (err) {
      if (err.status === 409 && err.data?.revs) await rebase(err.data.revs).catch((e) => retryLater(e));
      else if (err.status === 401) { signedOut = true; notify("unsaved", "Your session has expired, so your latest change was not saved. Log out and sign in again."); }
      else retryLater(err);
    } finally {
      busy = false;
      if (!timer && !stopped && !signedOut && dirtyKeys().length) schedule(saveDelay); // edits made while saving, or a merge to send
    }
  }

  function retryLater(err) {
    notify("unsaved", `Your latest changes are not saved yet (${err.message}) — trying again…`);
    schedule(RETRY_DELAY);
  }

  /* Someone saved the same slice first: replay what is unsaved here on top of their data. */
  async function rebase(serverRevs) {
    const { theirs, theirRevs } = await fetchTheirs(serverRevs);
    const dirty = dirtyKeys(); // taken again: the user may have carried on working during the fetch
    const { merged, conflicts, renamed } = mergeSlices(synced, latest, theirs, dirty, unsavedAudit());
    synced = theirs; revs = theirRevs;
    show(merged);
    const notes = [];
    if (renamed.length) notes.push(`${renamed.map(([from, to]) => `${from} was saved as ${to}`).join(", ")} because someone else took that number at the same moment.`);
    if (conflicts.length) notes.push(`Someone else changed the same record just before you, and their version was kept for: ${[...new Set(conflicts.map(describeConflict))].join(", ")}. Please check it and redo your change if it is still needed.`);
    if (notes.length) notify("clash", notes.join(" "));
  }

  /* Anything new on the server? Runs every few seconds and on window focus. */
  async function poll() {
    if (busy || timer || stopped || signedOut || !synced) return;
    const { revs: serverRevs } = await api("/state/revs");
    if (!SLICE_KEYS.some((k) => (serverRevs[k] || 0) !== (revs[k] || 0))) return;
    const { theirs, theirRevs } = await fetchTheirs(serverRevs);
    // a change made here in the meantime is saved first (and merged if need be); the next poll catches up
    if (busy || timer || stopped || dirtyKeys().length) return;
    synced = theirs; revs = theirRevs;
    show(theirs);
  }

  return {
    load, changed, poll,
    flushNow: () => { if (timer) clearTimeout(timer); return flush(); },
    stop: () => { stopped = true; if (timer) clearTimeout(timer); timer = null; },
    state: () => ({ synced, latest, revs, dirty: dirtyKeys() }),
  };
}
