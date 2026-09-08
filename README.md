# CPA-Controller

Centre Point Amravati — Pre-Opening Budget & Purchase Control. A React + Express + MongoDB app that takes a budget from the VP's Excel submission through the President's freeze, departmental requisitions, two-tier approval, rate negotiation, purchase orders, delivery tracking and goods receipt.

**Flow:** VP submits budget → President freezes → Departments requisition → VP's Desk → President's 2nd Approval → Purchase Manager → PO → Delivery → Receipt (GRN)

## Setup

```bash
npm install
copy .env.example .env   # then fill in your MongoDB URI and a random JWT secret
npm start                # runs the API (port 5000) and the frontend together
```

On first run the server seeds MongoDB with the user accounts below and an empty budget on the 16-head cost taxonomy. If an older budget (previous taxonomy) is found it is archived inside MongoDB, not deleted, and a fresh empty budget is seeded.

## Users (seeded)

| User ID        | Password           | Role               | Screens                                                    |
|----------------|--------------------|--------------------|------------------------------------------------------------|
| `amit`         | `VP@2026`          | VP                 | Budget import & review, VP's Desk (first approval)         |
| `arjun`        | `President@2026`   | President          | Budget Review & Freeze, President's 2nd Approval           |
| `depthead`     | `Dept@2026`        | Department Head    | Approved & Pending Items, Raise Purchase Requisition       |
| `purchase`     | `Purchase@2026`    | Purchase Manager   | Rate negotiation (down only), mark lines Ready for PO      |
| `purchaseexec` | `PurchaseExec@2026`| Purchase Executive | Issue PO, Delivery Calendar                                |
| `store`        | `Store@2026`       | Store Manager      | Delivery Calendar, Receive Material (GRN)                  |

Every role sees the Executive Dashboard, Audit Trail and Demo Scenarios. Change the passwords in MongoDB (`users` collection) before going live.

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
