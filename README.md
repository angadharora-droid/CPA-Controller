# CPA-Controller

Centre Point Amravati — Pre-Opening Budget & Purchase Control. A React + Express + MongoDB app for freezing item-level budgets, raising purchase requisitions with an auto-approval engine, and routing exceptions to the President's desk.

## Setup

```bash
npm install
copy .env.example .env   # then fill in your MongoDB URI and a random JWT secret
npm start                # runs the API (port 5000) and the frontend together
```

On first run the server seeds MongoDB with the users and all budget line items.

## Production

```bash
npm run build
npm run server           # serves the API and the built frontend from one process
```
