# CPA-Controller

Centre Point Amravati — Pre-Opening Budget & Purchase Control. A React + Express + MongoDB app that takes a budget from the VP's Excel submission through the President's freeze, departmental requisitions, two-tier approval, rate negotiation, purchase orders, delivery tracking and goods receipt.

**Flow:** VP submits budget → President freezes → Departments requisition → VP's Desk → President's 2nd Approval → Purchase Manager → PO → Delivery → Receipt (GRN)

## Setup

```bash
npm install
copy .env.example .env   # then fill in your MongoDB URI and a random JWT secret
npm start                # runs the API (port 5000) and the frontend together
```

On first run the server seeds MongoDB with the user accounts below and an empty budget on the 16-head cost taxonomy. If an older budget (previous taxonomy) is found it is kept as one document in the `appstate_archives` collection, not deleted, and a fresh empty budget is seeded.

## Users (seeded)

| User ID        | Password           | Role               | Screens                                                    |
|----------------|--------------------|--------------------|------------------------------------------------------------|
| `amitkhandwal` | `Amit@GM#2026`     | VP (admin)         | Budget import & review, VP's Desk (first approval); admin flag opens every tab and action |
| `arjun`        | `President@2026`   | President          | Budget Review & Freeze, President's 2nd Approval           |
| `depthead`     | `Dept@2026`        | Department Head    | Approved & Pending Items, Raise Purchase Requisition       |
| `ravisharma`   | `Ravi@2026`        | Department Head    | Approved & Pending Items, Raise Purchase Requisition — Ravi Sharma |
| `purchase`     | `Purchase@2026`    | Purchase Manager   | Rate negotiation (down only), mark lines Ready for PO, Issue PO, Delivery Calendar |
| `store`        | `Store@2026`       | Store Manager      | Delivery Calendar, Receive Material (GRN)                  |
| `shashank`     | `Shashank@2026`    | Viewer (view-only) | Every screen, read-only — Shashank Kapley                  |

Every role sees the Executive Dashboard, Audit Trail and Demo Scenarios. The Viewer role opens every tab but every action is hidden or disabled, nothing it does is saved, and the API rejects any write from it (403). Change the passwords in MongoDB (`users` collection) before going live.

The former Purchase Executive role has been merged into Purchase Manager: on start-up the server removes the old `purchaseexec` login, moves any account still carrying that role to Purchase Manager, and the app moves any Purchase Executive signature on an existing PO into the Purchase Manager box.

## Several people working at once

Every open browser keeps itself current and can never save an old copy over newer work:

- Each piece of app state (items, requisitions, POs, GRNs, settings...) has a revision number. A save names the revision it started from; if someone else saved that piece since, the server refuses it (`409`) - and one action that touches several pieces (e.g. requisition lines + item commitments) is written all together or not at all.
- A refused save is not lost: the browser fetches the newer data, merges the unsaved change on top of it (`src/utils/merge.js`) and saves again. Two people approving against the same item both count; two requisitions that took the same PR number are renumbered; only a real clash - the same field of the same record changed two ways - keeps the first person's version and tells the second.
- The audit trail is only ever added to, never replaced.
- Every 5 seconds, and whenever the window gets focus, the browser asks whether anything changed and re-reads just those pieces (`src/sync.js`). A red banner shows while a change has not reached the server (connection lost, session expired).
- Every build has its own id (`dist/version.json`, also baked into the page). The server refuses any call from a page built from a different version (`426`), and that page clears itself down to a blank "A new version of the app is available" screen with a single Refresh button - so nobody can keep working on, or save from, an out-of-date page after a deploy. Open pages notice within one 5-second poll. Anything typed but not yet saved on the old page is dropped.

## Database layout

One collection per kind of record, one document per record (`server/store.js`). With the current Atlas connection string, which names no database, MongoDB calls the database `test`.

| Collection          | Holds                                                                  |
|---------------------|------------------------------------------------------------------------|
| `items`             | budget items, `_id` = item id                                          |
| `requisitions`      | purchase requisitions with their lines, `_id` = PR number               |
| `purchase_orders`   | purchase orders, `_id` = PO number                                      |
| `goods_receipts`    | goods-receipt notes, `_id` = GRN number                                 |
| `audit_trail`       | one entry per logged action; `seq` higher = newer                       |
| `settings`          | one document: PR/PO counters, thresholds, head freeze, ceilings, and `revs` |
| `users`             | logins                                                                 |
| `appstate_archives` | old copies, never deleted: previous schemas, backups taken before manual fixes, and the old single document |

`_order` on a record is only its position in the list on screen. The app still loads and saves whole lists; the server writes just the records that changed, and a save that touches several collections runs as one transaction (all or nothing). A standalone local MongoDB has no transactions, which is fine for development.

Until 28 Sep 2026 everything was kept in one document (`appstates`, key `main`). The first start of a server with `server/store.js` moves it into the collections above by itself: it copies every record, reads the copy back and compares it with the original, keeps the old document in `appstate_archives` (`main-before-split-...`), and removes the empty `appstates` collection. If the copy does not match, it puts everything back as it was and the server does not start. Do not roll back to an older server version after that: it does not know the new collections and would start an empty budget.

`admin` and `local` are MongoDB's own system databases and always appear on the cluster.

Manual data fixes must go through `PUT /api/state` semantics too - at the very least bump `revs.<slice>` in the `settings` document for every slice they write, or open browsers will not notice the change. Take a backup first with `node scripts/backup-state.mjs`.

## Budget submission workbook (VP import)

The VP uploads the filled "CPA Budget Submission Template" (.xlsx). The importer reads the sheet whose name contains "Budget Submission" (or the first sheet), finds the row whose first cell is `Item Name`, and maps the columns in order:

1. Item Name
2. Cost Head (must match one of the 16 heads exactly, case-insensitive)
3. Department / Area or Sub Category
4. Quantity
5. Budgeted Rate
6. Approved Brand
7. Model Number / Specs / Size / Material

Rows with an unrecognised Cost Head are shown but cannot be imported.

## Approval rules

- A PR line is **Good to Approve** when brand, model/specs, rate (within the tolerance, default 5%) and quantity all match the frozen item; anything else lands on the VP's **Exception Desk**.
- Lines whose rate variance exceeds the second-approval threshold (default 15%), and every unlisted item, need the **President's 2nd Approval** after the VP.
- Both thresholds are editable by the VP/President under Admin Settings on the Budget Review & Freeze screen and are stored in MongoDB.
- The Purchase Manager may only negotiate a rate **down**.

## Production

```bash
npm run build
npm run server           # serves the API and the built frontend from one process
```
