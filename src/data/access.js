/* ---------- who can change what ----------
   Every signed-in user opens every tab and sees everything on it. Changing anything on a tab needs edit
   rights on that tab, given here per login (user ID). A login not listed here can only view.
   The screens hide or disable what a user may not do; the server refuses a save that changes anything
   outside the user's tabs (TAB_SLICES), so this table is the one place these rights are set.

   Agreed access (2026-10-15):            edits
     Arjun (President)       arjun          Budget Review & Freeze, Raise PR, VP's Desk, President's Desk
     Amit Kandwal (VP)       amitkhandwal   Budget Review & Freeze, Raise PR, VP's Desk
     Sunil, Ravi Sharma      sunil, ravisharma   Raise PR
     Narendra                purchase       Purchase Manager, Issue PO
     Shailendra              store          Receive Material (GRN)
     Ganesh and everyone else               view only */
export const EDIT_RIGHTS = {
  arjun: ["freeze", "raisepr", "vpdesk", "president2nd"],
  amitkhandwal: ["freeze", "raisepr", "vpdesk"],
  sunil: ["raisepr"],
  ravisharma: ["raisepr"],
  purchase: ["pmqueue", "issuepo"],
  store: ["receive"],
};

/* Signing a PO is not editing it: each of these signs their own box on any PO, from Issue PO or the
   Delivery Calendar, and nothing else on the PO changes. The box: "vp" | "president" | "purchaseManager". */
export const SIGNS_PO = {
  amitkhandwal: "vp",
  arjun: "president",
  purchase: "purchaseManager",
};

/* The parts of the saved state (server/store.js SLICES) each tab's actions write. The audit trail is
   only ever added to and goes with any of them. */
export const TAB_SLICES = {
  freeze: ["items", "headFreeze", "ceilOverrides", "tolerancePct", "secondApprovalPct"],
  raisepr: ["prs", "prCounter"],
  vpdesk: ["prs", "items"],
  president2nd: ["prs", "items"],
  // a quantity cut or a new unit converts the budget item too
  pmqueue: ["prs", "items"],
  issuepo: ["pos", "poCounter", "prs", "items"],
  receive: ["grns", "pos", "prs"],
  demo: ["items", "headFreeze", "prs", "prCounter"],
};

const key = (userId) => String(userId || "").trim().toLowerCase();

/* The tabs this login can edit. */
export function editTabsOf(userId) {
  return EDIT_RIGHTS[key(userId)] || [];
}

/* The PO signature box this login signs, or null. */
export function signBoxOf(userId) {
  return SIGNS_PO[key(userId)] || null;
}

/* Every slice this login's tabs may write. */
export function writableSlices(userId) {
  return new Set(editTabsOf(userId).flatMap((t) => TAB_SLICES[t] || []));
}

/* True when a login can change nothing at all: it only views. */
export function viewsOnly(userId) {
  return !editTabsOf(userId).length && !signBoxOf(userId);
}
