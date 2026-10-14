# CPA-Controller

Pre-opening budget and purchase control. A React + Express + MongoDB app that takes a budget from an Excel submission through freezing, departmental requisitions, two-tier approval, rate negotiation, purchase orders, delivery tracking and goods receipt, with an audit trail and budget-to-GRN reports.

**Flow:** budget submitted → budget frozen → departments raise requisitions → first approval → second approval (where needed) → purchase → PO → delivery → goods receipt (GRN)

## Setup

```bash
npm install
npm start                # runs the API and the frontend together
```

Create a `.env` file in the project root (never commit it) with:

| Variable      | Purpose                                   |
|---------------|-------------------------------------------|
| `MONGODB_URI` | MongoDB connection string                 |
| `JWT_SECRET`  | a long random string for signing sessions |
| `PORT`        | API port (optional)                       |

Optional central sign-on: `AUTH_SERVICE_URL`, `SSO_APP_KEY`, `SSO_SHARED_SECRET` (server) and `VITE_AUTH_URL` (frontend).

On first run the server creates the user accounts and an empty budget. Login details are issued by the administrator and are not kept in this repository's documentation.

## Access

Every signed-in user can open every screen. What each login may change is set per screen in `src/data/access.js`; the screens follow it and the API refuses any save outside it.

## Working together

Several people can use the app at once. Each piece of saved data carries a revision number, so an out-of-date browser can never save over newer work: a refused save is merged with the newer data and retried. Open browsers refresh themselves every few seconds, and a page from an older build is asked to reload before it can do anything.

## Production

```bash
npm run build
npm run server           # serves the API and the built frontend from one process
```
