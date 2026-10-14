import { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { C, th, toggleBtn, toggleActive, btnStyle } from "../../theme.js";
import { fmtINR, fmtNum, fmtRate, round2 } from "../../utils/format.js";
import { fmtDateShort, todayISO } from "../../utils/po.js";
import { matchesQuery } from "../../utils/search.js";
import { buildReport, transportOnce } from "../../utils/report.js";
import { Badge, MiniStat, SearchBox } from "../ui.jsx";

const VIEWS = [
  { id: "heads", label: "Budget Heads", count: "head(s)", search: "Search budget heads…" },
  { id: "items", label: "Items", count: "item(s)", search: "Search item, head, brand, specs, PR / PO / GRN no. or supplier…" },
  { id: "lines", label: "PR → PO → GRN", count: "requisition line(s)", search: "Search PR / PO / GRN / bill no., item, supplier, requester, status…" },
  { id: "grns", label: "GRN Register", count: "receipt line(s)", search: "Search GRN / PO / bill no., supplier, item, transporter…" },
];

// the header row stays in view while the table scrolls
const sth = { ...th, position: "sticky", top: 0, zIndex: 1, background: "#FAFAF8", boxShadow: `inset 0 -1px 0 ${C.line}` };
const sthR = { ...sth, textAlign: "right" };
const td = { padding: "7px 10px", verticalAlign: "top" };
const tdR = { ...td, textAlign: "right", whiteSpace: "nowrap" };
const small = { fontSize: 11, color: "#9AA1AC", fontWeight: 400 };
const rowStyle = { borderTop: "1px solid #F0EFEA" };
const footStyle = { borderTop: `2px solid ${C.line}`, fontWeight: 800, background: "#FAFAF8" };
const headRow = { textAlign: "left", color: "#6B7280", fontSize: 10.5, textTransform: "uppercase" };

const has = (v) => v !== null && v !== undefined && v !== "";
const qty = (n, unit) => (has(n) ? `${fmtNum(n)} ${unit}` : "—");
const sumOf = (rows, k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);

function stageTone(stage) {
  if (/Rejected/.test(stage)) return ["#FCEAEA", C.red];
  if (/Deferred/.test(stage)) return ["#F0F0EF", C.grey];
  if (stage === "Received") return ["#E9F6EF", C.green];
  if (stage === "PO Issued" || stage === "Part Received") return ["#E9EDF4", C.navy];
  if (stage === "Pending Purchase Manager" || stage === "Ready for PO") return ["#EAF0FB", C.blue];
  return ["#FDF2E3", C.amber];
}

function StageBadge({ stage }) {
  const [bg, fg] = stageTone(stage);
  return <Badge bg={bg} fg={fg}>{stage}</Badge>;
}

const Unbudgeted = () => <> <Badge bg="#FDF2E3" fg={C.amber}>Unbudgeted</Badge></>;

/* ================= REPORTS: BUDGET → REQUISITION → PO → GRN ================= */
export default function ReportsTab({ HEADS, headFreeze, items, allLines, pos, grns, cardStyle }) {
  const [view, setView] = useState("items");
  const [headFilter, setHeadFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);

  const report = useMemo(() => buildReport({ HEADS, headFreeze, items, allLines, pos, grns }), [HEADS, headFreeze, items, allLines, pos, grns]);

  // the head picked narrows everything, the Excel workbook included; the search narrows only the table on screen
  const scoped = useMemo(() => {
    const inHead = (r) => headFilter === "All" || r.head === headFilter;
    return { heads: report.heads.filter(inHead), items: report.items.filter(inHead), lines: report.lines.filter(inHead), grns: report.grns.filter(inHead) };
  }, [report, headFilter]);

  const rows = useMemo(() => {
    if (view === "heads") return scoped.heads.filter((r) => matchesQuery(query, r.head, r.dept, r.freezeState));
    if (view === "items") {
      return scoped.items.filter((r) => (!activeOnly || r.prIds.length > 0)
        && matchesQuery(query, r.name, r.head, r.sub, r.brand, r.spec, r.unbudgeted ? "unbudgeted" : null,...r.prIds, ...r.poIds, ...r.grnIds, ...r.suppliers));
    }
    if (view === "lines") {
      return scoped.lines.filter((r) => matchesQuery(query, r.prId, r.raisedBy, r.dept, r.itemName, r.head, r.brand, r.spec, r.stage, r.lane, r.poId, r.supplier, ...r.receipts.flatMap((g) => [g.id, g.billNo])));
    }
    return transportOnce(scoped.grns.filter((r) => matchesQuery(query, r.grnId, r.poId, r.prId, r.supplier, r.billNo, r.itemName, r.head, r.recordedBy, r.transport && r.transport.transporter, r.transport && r.transport.lrNo)));
  }, [scoped, view, query, activeOnly]);

  const totals = useMemo(() => {
    const t = Object.fromEntries(["ceiling", "budgetVal", "committed", "poVal", "receivedVal", "toReceiveVal", "balance"].map((k) => [k, sumOf(scoped.heads, k)]));
    t.prs = new Set(scoped.lines.map((r) => r.prId)).size;
    t.pos = new Set(scoped.lines.map((r) => r.poId).filter(Boolean)).size;
    t.grns = new Set(scoped.grns.map((r) => r.grnId)).size;
    return t;
  }, [scoped]);

  const v = VIEWS.find((x) => x.id === view);
  const empty = (cols) => (
    <tr><td colSpan={cols} style={{ padding: 24, textAlign: "center", color: "#9AA1AC" }}>{query.trim() ? `Nothing matches "${query.trim()}".` : "Nothing here yet."}</td></tr>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Budget to GRN Report</div>
          <div style={{ fontSize: 12.5, color: "#9AA1AC" }}>Every budget item followed from its approved budget through requisition, approval and purchase order to goods received. Amounts are before GST.</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <button onClick={() => downloadWorkbook(scoped, headFilter)} style={btnStyle(C.navy)}>Download Excel</button>
          <div style={{ ...small, marginTop: 4 }}>{headFilter === "All" ? "All budget heads" : headFilter} · 4 sheets</div>
        </div>
      </div>

      <div style={{ ...cardStyle, display: "flex", gap: 28, flexWrap: "wrap", marginBottom: 14 }}>
        <MiniStat label="Ceiling" value={fmtINR(totals.ceiling)} />
        <MiniStat label="Item list total" value={fmtINR(totals.budgetVal)} />
        <MiniStat label="Committed" value={fmtINR(totals.committed)} accent={C.amber} />
        <MiniStat label="On PO" value={fmtINR(totals.poVal)} accent={C.blue} />
        <MiniStat label="Received" value={fmtINR(totals.receivedVal)} accent={C.green} />
        <MiniStat label="Yet to receive" value={fmtINR(totals.toReceiveVal)} />
        <MiniStat label="Balance vs ceiling" value={fmtINR(totals.balance)} accent={totals.balance < 0 ? C.red : C.green} />
        <MiniStat label="Documents" value={`${totals.prs} PR · ${totals.pos} PO · ${totals.grns} GRN`} />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {VIEWS.map((x) => (
          <button key={x.id} onClick={() => setView(x.id)} style={{ ...toggleBtn, ...(view === x.id ? toggleActive : {}), padding: "9px 18px", fontSize: 13 }}>{x.label}</button>
        ))}
      </div>

      <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: 12, borderBottom: `1px solid ${C.line}`, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <select value={headFilter} onChange={(e) => setHeadFilter(e.target.value)} style={{ padding: "8px 10px", border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 13, minWidth: 200 }}>
            <option value="All">All budget heads</option>
            {HEADS.map((h) => <option key={h.name}>{h.name}</option>)}
          </select>
          <SearchBox value={query} onChange={setQuery} placeholder={v.search} />
          {view === "items" && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap" }}>
              <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
              Only items requisitioned
            </label>
          )}
          <span style={{ fontSize: 12, color: "#9AA1AC" }}>{rows.length} {v.count}</span>
        </div>
        <div style={{ overflowX: "auto", maxHeight: 620, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            {view === "heads" && <HeadsTable rows={rows} empty={empty} onOpen={(head) => { setHeadFilter(head); setQuery(""); setView("items"); }} />}
            {view === "items" && <ItemsTable rows={rows} empty={empty} />}
            {view === "lines" && <LinesTable rows={rows} empty={empty} />}
            {view === "grns" && <GrnTable rows={rows} empty={empty} />}
          </table>
        </div>
      </div>
      {view === "heads" && <div style={{ fontSize: 11.5, color: "#9AA1AC", marginTop: 8 }}>Click a head to see its items.</div>}
    </div>
  );
}

/* ---------- on-screen tables ---------- */

function HeadsTable({ rows, empty, onOpen }) {
  return (
    <>
      <thead>
        <tr style={headRow}>
          <th style={sth}>Budget Head</th><th style={sth}>Freeze Status</th><th style={sthR}>Ceiling</th><th style={sthR}>Item List Total</th>
          <th style={sthR}>Committed</th><th style={sthR}>On PO</th><th style={sthR}>Received</th><th style={sthR}>Yet to Receive</th><th style={sthR}>Balance vs Ceiling</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.head} style={{ ...rowStyle, cursor: "pointer" }} onClick={() => onOpen(r.head)}>
            <td style={{ ...td, fontWeight: 600 }}>
              {r.head}
              <div style={small}>{r.dept ? `${r.dept} · ` : ""}{r.items} item(s){r.unbudgetedItems ? ` · ${r.unbudgetedItems} unbudgeted` : ""}</div>
            </td>
            <td style={td}><Badge bg={r.freezeState === "Not Frozen" ? "#F0F0EF" : "#EAF0FB"} fg={r.freezeState === "Not Frozen" ? C.grey : C.blue}>{r.freezeState}</Badge></td>
            <td style={tdR}>{fmtINR(r.ceiling)}</td>
            <td style={tdR}>{fmtINR(r.budgetVal)}</td>
            <td style={tdR}>{fmtINR(r.committed)}</td>
            <td style={tdR}>{fmtINR(r.poVal)}</td>
            <td style={{ ...tdR, color: r.receivedVal > 0 ? C.green : undefined }}>{fmtINR(r.receivedVal)}</td>
            <td style={tdR}>{fmtINR(r.toReceiveVal)}</td>
            <td style={{ ...tdR, fontWeight: 700, color: r.balance < 0 ? C.red : undefined }}>{fmtINR(r.balance)}</td>
          </tr>
        ))}
        {rows.length === 0 && empty(9)}
      </tbody>
      {rows.length > 1 && (
        <tfoot>
          <tr style={footStyle}>
            <td style={td} colSpan={2}>GRAND TOTAL</td>
            {["ceiling", "budgetVal", "committed", "poVal", "receivedVal", "toReceiveVal", "balance"].map((k) => <td key={k} style={tdR}>{fmtINR(sumOf(rows, k))}</td>)}
          </tr>
        </tfoot>
      )}
    </>
  );
}

function Refs({ r }) {
  const groups = [r.prIds, r.poIds, r.grnIds].filter((l) => l.length);
  if (!groups.length) return <span style={small}>—</span>;
  return groups.map((l, i) => <div key={i} style={{ whiteSpace: "nowrap" }}>{l.join(", ")}</div>);
}

function ItemsTable({ rows, empty }) {
  return (
    <>
      <thead>
        <tr style={headRow}>
          <th style={sth}>Item</th><th style={sth}>Head</th><th style={sthR}>Budget</th><th style={sthR}>Approved</th>
          <th style={sthR} title="Approved quantity less what the VP has approved and what is awaiting the VP — the Balance on Raise PR">Remaining to Order</th>
          <th style={sthR}>On PO</th><th style={sthR}>Received</th><th style={sthR}>Yet to Receive</th><th style={sth}>PR / PO / GRN</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} style={rowStyle}>
            <td style={{ ...td, fontWeight: 600, minWidth: 180 }}>
              {r.name}{r.unbudgeted && <Unbudgeted />}
              {(r.brand || r.spec) && <div style={small}>{[r.brand, r.spec].filter(Boolean).join(" · ")}</div>}
            </td>
            <td style={{ ...td, color: "#6B7280" }}>{r.head}{r.sub && <div style={small}>{r.sub}</div>}</td>
            <td style={tdR}>
              {qty(r.budgetQty, r.unit)}
              {has(r.budgetRate) && <div style={small}>@ {fmtRate(r.budgetRate)} = {fmtINR(r.budgetVal)}</div>}
            </td>
            <td style={tdR}>
              {qty(r.approvedQty, r.unit)}
              {r.approvedVal > 0 && <div style={small}>{fmtINR(r.approvedVal)}</div>}
              {r.pendingQty > 0 && <div style={{ ...small, color: C.amber }}>{fmtNum(r.pendingQty)} awaiting VP</div>}
            </td>
            <td style={{ ...tdR, fontWeight: 700 }}>{qty(r.remaining, r.unit)}</td>
            <td style={tdR}>{qty(r.poQty, r.unit)}{r.poVal > 0 && <div style={small}>{fmtINR(r.poVal)}</div>}</td>
            <td style={{ ...tdR, color: r.receivedQty > 0 ? C.green : undefined }}>{qty(r.receivedQty, r.unit)}{r.receivedVal > 0 && <div style={small}>{fmtINR(r.receivedVal)}</div>}</td>
            <td style={{ ...tdR, color: r.toReceive > 0 ? C.amber : undefined }}>{qty(r.toReceive, r.unit)}</td>
            <td style={{ ...td, fontSize: 11.5, color: "#6B7280" }}><Refs r={r} /></td>
          </tr>
        ))}
        {rows.length === 0 && empty(9)}
      </tbody>
      {rows.length > 0 && (
        <tfoot>
          <tr style={footStyle}>
            <td style={td} colSpan={2}>TOTAL — {rows.length} item(s)</td>
            <td style={tdR}>{fmtINR(sumOf(rows, "budgetVal"))}</td>
            <td style={tdR}>{fmtINR(sumOf(rows, "approvedVal"))}</td>
            <td />
            <td style={tdR}>{fmtINR(sumOf(rows, "poVal"))}</td>
            <td style={tdR}>{fmtINR(sumOf(rows, "receivedVal"))}</td>
            <td style={tdR}>{fmtINR(sumOf(rows, "toReceiveVal"))}</td>
            <td />
          </tr>
        </tfoot>
      )}
    </>
  );
}

function LinesTable({ rows, empty }) {
  return (
    <>
      <thead>
        <tr style={headRow}>
          <th style={sth}>PR</th><th style={sth}>Item</th><th style={sthR}>Requested</th><th style={sthR}>Approved</th><th style={sth}>Status</th>
          <th style={sth}>PO</th><th style={sthR}>PO Qty × Rate</th><th style={sthR}>Received</th><th style={sth}>GRN · Bill</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.prId}::${r.lineId}`} style={rowStyle}>
            <td style={{ ...td, whiteSpace: "nowrap" }}>
              <b>{r.prId}</b>
              <div style={small}>{r.submittedAt}</div>
              <div style={small}>{r.raisedBy}{r.dept ? ` · ${r.dept}` : ""}</div>
            </td>
            <td style={{ ...td, minWidth: 170 }}>
              <span style={{ fontWeight: 600 }}>{r.itemName}</span>{!r.itemId && <Unbudgeted />}
              <div style={small}>{r.head}</div>
            </td>
            <td style={tdR}>
              {qty(r.requestedQty, r.unit)}
              <div style={small}>@ {fmtRate(r.requestedRate)}</div>
              {r.lane === "Exception" && <div style={{ ...small, color: C.red, fontWeight: 700 }}>Exception</div>}
            </td>
            <td style={tdR}>{r.approvedQty > 0 ? <>{qty(r.approvedQty, r.unit)}<div style={small}>@ {fmtRate(r.approvedRate)}</div></> : "—"}</td>
            <td style={td}><StageBadge stage={r.stage} /></td>
            <td style={{ ...td, whiteSpace: "nowrap" }}>
              {r.poId ? (
                <>
                  <b>{r.poId}</b>
                  <div style={small}>{r.supplier}</div>
                  <div style={small}>{fmtDateShort(r.poDate)}{r.deliveryDate ? ` · due ${fmtDateShort(r.deliveryDate)}` : ""}</div>
                </>
              ) : <span style={small}>—</span>}
            </td>
            <td style={tdR}>{r.poId ? <>{qty(r.poQty, r.unit)}<div style={small}>@ {fmtRate(r.poRate)} = {fmtINR(r.poAmount)}</div></> : "—"}</td>
            <td style={{ ...tdR, color: r.receivedQty > 0 ? C.green : undefined }}>
              {r.poId ? qty(r.receivedQty, r.unit) : "—"}
              {r.toReceive > 0 && <div style={{ ...small, color: C.amber }}>{fmtNum(r.toReceive)} to come</div>}
            </td>
            <td style={{ ...td, fontSize: 11.5 }}>
              {r.receipts.length ? r.receipts.map((g, i) => (
                <div key={`${g.id}-${i}`} style={{ whiteSpace: "nowrap" }}>
                  <b>{g.id}</b> · {fmtNum(g.qty)} · Bill {g.billNo || "—"}{g.receivedDate ? ` · ${fmtDateShort(g.receivedDate)}` : ""}
                </div>
              )) : <span style={small}>—</span>}
            </td>
          </tr>
        ))}
        {rows.length === 0 && empty(9)}
      </tbody>
      {rows.length > 0 && (
        <tfoot>
          <tr style={footStyle}>
            <td style={td} colSpan={6}>TOTAL — {rows.length} line(s)</td>
            <td style={tdR}>{fmtINR(sumOf(rows, "poAmount"))}</td>
            <td style={tdR}>{fmtINR(sumOf(rows, "receivedVal"))}</td>
            <td />
          </tr>
        </tfoot>
      )}
    </>
  );
}

function GrnTable({ rows, empty }) {
  const freight = rows.reduce((s, r) => s + (r.transport ? r.transport.total : 0), 0);
  return (
    <>
      <thead>
        <tr style={headRow}>
          <th style={sth}>GRN</th><th style={sth}>PO / Supplier</th><th style={sth}>Bill</th><th style={sth}>Item</th>
          <th style={sthR}>Qty</th><th style={sthR}>PO Rate</th><th style={sthR}>Value</th><th style={sthR}>Transport (incl. GST)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} style={rowStyle}>
            <td style={{ ...td, whiteSpace: "nowrap" }}>
              <b>{r.grnId}</b>
              <div style={small}>Received {fmtDateShort(r.receivedDate) || "—"}</div>
              <div style={small}>{r.recordedBy}</div>
            </td>
            <td style={{ ...td, whiteSpace: "nowrap" }}><b>{r.poId}</b><div style={small}>{r.supplier}</div></td>
            <td style={{ ...td, whiteSpace: "nowrap" }}>{r.billNo || "—"}<div style={small}>{fmtDateShort(r.billDate)}</div></td>
            <td style={{ ...td, minWidth: 170 }}><span style={{ fontWeight: 600 }}>{r.itemName}</span><div style={small}>{r.head}{r.prId ? ` · ${r.prId}` : ""}</div></td>
            <td style={tdR}>{qty(r.qty, r.unit)}</td>
            <td style={tdR}>{fmtRate(r.rate)}</td>
            <td style={tdR}>{fmtINR(r.value)}</td>
            <td style={tdR}>
              {r.transport ? (
                <>
                  {fmtINR(r.transport.total)}
                  <div style={small}>{[r.transport.transporter, r.transport.lrNo && `LR ${r.transport.lrNo}`].filter(Boolean).join(" · ")}</div>
                </>
              ) : "—"}
            </td>
          </tr>
        ))}
        {rows.length === 0 && empty(8)}
      </tbody>
      {rows.length > 0 && (
        <tfoot>
          <tr style={footStyle}>
            <td style={td} colSpan={6}>TOTAL — {rows.length} line(s)</td>
            <td style={tdR}>{fmtINR(sumOf(rows, "value"))}</td>
            <td style={tdR}>{fmtINR(freight)}</td>
          </tr>
        </tfoot>
      )}
    </>
  );
}

/* ---------- Excel workbook ----------
   Each sheet is a list of [header, value of a row, column width]. Figures go in as numbers so they
   can be summed and filtered in Excel; dates as they print on the PO (18-Aug-26). */

const money = (v) => (has(v) ? round2(v) : "");
const count = (v) => (has(v) ? Math.round(Number(v) * 1000) / 1000 : "");
const onPO = (r, v) => (r.poId ? v : "");

const HEAD_SHEET = [
  ["Budget Head", (r) => r.head, 30],
  ["Department", (r) => r.dept, 18],
  ["Freeze Status", (r) => r.freezeState, 20],
  ["Items", (r) => r.items, 8],
  ["Unbudgeted Items", (r) => r.unbudgetedItems, 11],
  ["Ceiling (₹)", (r) => money(r.ceiling), 14],
  ["Item List Total (₹)", (r) => money(r.budgetVal), 16],
  ["Committed (₹)", (r) => money(r.committed), 14],
  ["On PO (₹)", (r) => money(r.poVal), 14],
  ["Received (₹)", (r) => money(r.receivedVal), 14],
  ["Yet to Receive (₹)", (r) => money(r.toReceiveVal), 15],
  ["Balance vs Ceiling (₹)", (r) => money(r.balance), 17],
];

const ITEM_SHEET = [
  ["Budget Head", (r) => r.head, 24],
  ["Sub-category", (r) => r.sub, 18],
  ["Item", (r) => r.name, 32],
  ["Brand", (r) => r.brand, 14],
  ["Model / Specs", (r) => r.spec, 30],
  ["Unit", (r) => r.unit, 7],
  ["Freeze Status", (r) => r.freezeState, 18],
  ["Budget Status", (r) => (r.unbudgeted ? "Unbudgeted" : r.budgetStatus === "Complete" ? r.approvalStatus : r.budgetStatus), 18],
  ["Budget Qty", (r) => count(r.budgetQty), 10],
  ["Budget Rate (₹)", (r) => money(r.budgetRate), 12],
  ["Budget Value (₹)", (r) => money(r.budgetVal), 14],
  ["Awaiting VP Qty", (r) => count(r.pendingQty), 10],
  ["Approved Qty", (r) => count(r.approvedQty), 10],
  ["Approved Value (₹)", (r) => money(r.approvedVal), 14],
  ["Remaining to Order", (r) => count(r.remaining), 11],
  ["On PO Qty", (r) => count(r.poQty), 10],
  ["PO Value (₹)", (r) => money(r.poVal), 14],
  ["Received Qty", (r) => count(r.receivedQty), 10],
  ["Received Value (₹)", (r) => money(r.receivedVal), 14],
  ["Yet to Receive Qty", (r) => count(r.toReceive), 10],
  ["PR Nos.", (r) => r.prIds.join(", "), 24],
  ["PO Nos.", (r) => r.poIds.join(", "), 24],
  ["Suppliers", (r) => r.suppliers.join(", "), 24],
  ["GRN Nos.", (r) => r.grnIds.join(", "), 24],
];

const LINE_SHEET = [
  ["PR No.", (r) => r.prId, 14],
  ["PR Date", (r) => r.submittedAt, 20],
  ["Raised By", (r) => r.raisedBy, 18],
  ["Department", (r) => r.dept, 16],
  ["Urgency", (r) => r.urgency, 14],
  ["Required By", (r) => fmtDateShort(r.requiredBy), 11],
  ["Budget Head", (r) => r.head, 24],
  ["Item", (r) => r.itemName, 30],
  ["Unbudgeted", (r) => (r.itemId ? "" : "Yes"), 10],
  ["Brand", (r) => r.brand, 14],
  ["Model / Specs", (r) => r.spec, 28],
  ["Unit", (r) => r.unit, 7],
  ["Budget Qty", (r) => count(r.budgetQty), 10],
  ["Budget Rate (₹)", (r) => money(r.budgetRate), 12],
  ["Requested Qty", (r) => count(r.requestedQty), 10],
  ["Requested Rate (₹)", (r) => money(r.requestedRate), 12],
  ["Lane", (r) => r.lane, 15],
  ["VP Decision", (r) => r.vpDecision, 18],
  ["President Decision", (r) => r.presidentDecision, 16],
  ["Approved Qty", (r) => count(r.approvedQty), 10],
  ["Approved Rate (₹)", (r) => (r.approvedQty ? money(r.approvedRate) : ""), 12],
  ["PM Rate (₹)", (r) => money(r.pmRate), 12],
  ["Status", (r) => r.stage, 22],
  ["PO No.", (r) => r.poId, 14],
  ["PO Date", (r) => fmtDateShort(r.poDate), 11],
  ["Supplier", (r) => r.supplier, 26],
  ["Delivery Date", (r) => fmtDateShort(r.deliveryDate), 11],
  ["PO Qty", (r) => onPO(r, count(r.poQty)), 9],
  ["PO Rate (₹)", (r) => onPO(r, money(r.poRate)), 12],
  ["PO Amount (₹)", (r) => onPO(r, money(r.poAmount)), 14],
  ["Received Qty", (r) => onPO(r, count(r.receivedQty)), 10],
  ["Received Value (₹)", (r) => onPO(r, money(r.receivedVal)), 14],
  ["Yet to Receive Qty", (r) => onPO(r, count(r.toReceive)), 10],
  ["GRN Nos.", (r) => r.receipts.map((g) => g.id).join(", "), 20],
  ["Bill Nos.", (r) => r.receipts.map((g) => g.billNo || "—").join(", "), 18],
  ["Bill Dates", (r) => r.receipts.map((g) => fmtDateShort(g.billDate) || "—").join(", "), 16],
  ["Received Dates", (r) => r.receipts.map((g) => fmtDateShort(g.receivedDate) || "—").join(", "), 16],
];

const GRN_SHEET = [
  ["GRN No.", (r) => r.grnId, 14],
  ["Recorded On", (r) => r.recordedAt, 20],
  ["Recorded By", (r) => r.recordedBy, 24],
  ["PO No.", (r) => r.poId, 14],
  ["Supplier", (r) => r.supplier, 26],
  ["Bill No.", (r) => r.billNo, 14],
  ["Bill Date", (r) => fmtDateShort(r.billDate), 11],
  ["Received Date", (r) => fmtDateShort(r.receivedDate), 11],
  ["PR No.", (r) => r.prId, 14],
  ["Budget Head", (r) => r.head, 24],
  ["Item", (r) => r.itemName, 30],
  ["Qty Received", (r) => count(r.qty), 10],
  ["Unit", (r) => r.unit, 7],
  ["PO Rate (₹)", (r) => money(r.rate), 12],
  ["Value (₹)", (r) => money(r.value), 14],
  ["Transporter", (r) => (r.transport ? r.transport.transporter : ""), 18],
  ["LR / Vehicle No.", (r) => (r.transport ? r.transport.lrNo : ""), 14],
  ["Transport (₹)", (r) => (r.transport ? money(r.transport.amount) : ""), 12],
  ["Transport GST (₹)", (r) => (r.transport ? money(r.transport.gst) : ""), 12],
  ["Transport Total (₹)", (r) => (r.transport ? money(r.transport.total) : ""), 14],
];

function sheetOf(cols, rows, autofilter = true) {
  const ws = XLSX.utils.aoa_to_sheet([cols.map((c) => c[0]), ...rows.map((r) => cols.map((c) => c[1](r)))]);
  ws["!cols"] = cols.map((c) => ({ wch: c[2] }));
  if (autofilter && rows.length) ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: cols.length - 1 } }) };
  return ws;
}

function downloadWorkbook(scoped, headFilter) {
  const heads = [...scoped.heads];
  if (heads.length > 1) {
    heads.push({
      head: "GRAND TOTAL", dept: "", freezeState: "",
      ...Object.fromEntries(["items", "unbudgetedItems", "ceiling", "budgetVal", "committed", "poVal", "receivedVal", "toReceiveVal", "balance"].map((k) => [k, sumOf(scoped.heads, k)])),
    });
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetOf(HEAD_SHEET, heads, false), "Budget Heads");
  XLSX.utils.book_append_sheet(wb, sheetOf(ITEM_SHEET, scoped.items), "Items");
  XLSX.utils.book_append_sheet(wb, sheetOf(LINE_SHEET, scoped.lines), "PR-PO-GRN Lines");
  XLSX.utils.book_append_sheet(wb, sheetOf(GRN_SHEET, transportOnce(scoped.grns)), "GRN Register");
  const scope = headFilter === "All" ? "All Heads" : headFilter.replace(/[\\/:*?"<>|]/g, "-");
  XLSX.writeFile(wb, `Budget to GRN Report - ${scope} - ${todayISO()}.xlsx`);
}
