import { useMemo } from "react";
import { C, th, thR } from "../theme.js";
import { fmtINR, fmtNum, fmtRate } from "../utils/format.js";
import { fmtDateShort } from "../utils/po.js";
import { whoFromAudit } from "../utils/report.js";
import { Badge, MiniStat, StageBadge } from "./ui.jsx";

const td = { padding: "7px 10px", verticalAlign: "top" };
const tdR = { ...td, textAlign: "right", whiteSpace: "nowrap" };
const small = { fontSize: 11, color: "#9AA1AC" };
const headRow = { textAlign: "left", color: "#6B7280", fontSize: 10.5, textTransform: "uppercase", background: "#FAFAF8" };
const rowStyle = { borderTop: "1px solid #F0EFEA" };
const card = { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 10, marginBottom: 12, overflow: "hidden" };

const TONE = {
  Approved: ["#E9F6EF", C.green], "Modified & Approved": ["#E9F6EF", C.green],
  Rejected: ["#FCEAEA", C.red], Deferred: ["#F0F0EF", C.grey], Pending: ["#FDF2E3", C.amber],
};
function DecisionBadge({ decision }) {
  const [bg, fg] = TONE[decision] || TONE.Pending;
  return <Badge bg={bg} fg={fg}>{decision}</Badge>;
}

/* The reasons that sent a line to the Exception Desk; brand and specs notes never do (see raisedLane). */
const laneReasons = (r) => r.reasons.filter((x) => /^(Quantity|Rate variance|Unbudgeted)/.test(x));

/* "by Rajesh (VP) · 14 Oct 2026, 10:30 am", from the audit trail. */
function By({ entry }) {
  if (!entry) return null;
  return <div style={small}>by <b style={{ color: C.text, fontWeight: 600 }}>{entry.who}</b>{entry.ts ? ` · ${entry.ts}` : ""}</div>;
}

function Section({ title, note, children }) {
  return (
    <div style={card}>
      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.line}`, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 700 }}>{title}</div>
        {note && <div style={small}>{note}</div>}
      </div>
      <div style={{ overflowX: "auto" }}>{children}</div>
    </div>
  );
}

const Empty = ({ cols, text }) => <tr><td colSpan={cols} style={{ padding: 16, textAlign: "center", color: "#9AA1AC" }}>{text}</td></tr>;

/* ================= ONE ITEM, BUDGET TO GRN: every requisition raised for it, who decided it, every PO
   it went on and every goods receipt against those POs ================= */
export default function ItemHistory({ item, progress, lines, pos, audit }) {
  const who = useMemo(() => whoFromAudit(audit || []), [audit]);
  const p = progress || {};
  const unit = item.unit || "Nos";
  const q = (n) => `${fmtNum(n || 0)} ${unit}`;
  const prLines = [...lines].sort((a, b) => a.prId.localeCompare(b.prId) || a.lineId.localeCompare(b.lineId));
  const poRows = prLines.filter((r) => r.poId).map((r) => ({ r, po: pos.find((x) => x.id === r.poId) })).sort((a, b) => a.r.poId.localeCompare(b.r.poId));
  const grnRows = prLines.flatMap((r) => r.receipts.map((g) => ({ ...g, poId: r.poId, prId: r.prId }))).sort((a, b) => a.id.localeCompare(b.id));
  const over = (p.approvedQty || 0) - (item.qty || 0);

  return (
    <div>
      <div style={{ ...card, padding: 14 }}>
        <div style={{ fontSize: 12.5, color: "#6B7280" }}>
          {item.head}{item.sub ? ` · ${item.sub}` : ""}{item.brand ? ` · Brand ${item.brand}` : ""}{item.spec ? ` · ${item.spec}` : ""}
        </div>
        <div style={{ display: "flex", gap: 26, flexWrap: "wrap", marginTop: 10 }}>
          <MiniStat label="Budget" value={`${q(item.qty)} @ ${fmtRate(item.rate)}`} />
          <MiniStat label="Approved on PRs" value={q(p.approvedQty)} accent={over > 0 ? C.red : C.amber} />
          <MiniStat label="Awaiting VP" value={q(p.pendingQty)} />
          <MiniStat label="Remaining to order" value={q(p.remaining)} />
          <MiniStat label="On PO" value={q(p.poQty)} accent={C.blue} />
          <MiniStat label="Received" value={q(p.receivedQty)} accent={C.green} />
          <MiniStat label="Yet to receive" value={q(p.toReceive)} />
        </div>
        {over > 0 && (
          <div style={{ background: "#FCEAEA", color: C.red, borderRadius: 7, padding: "7px 10px", fontSize: 12, fontWeight: 600, marginTop: 12 }}>
            {q(p.approvedQty)} approved on requisitions against a budget of {q(item.qty)}: {q(over)} over the approved quantity.
          </div>
        )}
      </div>

      <Section title={`Purchase Requisitions (${prLines.length})`} note="Who raised it, which desk it landed on, and who approved it">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={headRow}><th style={th}>PR</th><th style={thR}>Requested</th><th style={th}>Lane</th><th style={th}>VP</th><th style={th}>President</th><th style={th}>Status</th></tr>
          </thead>
          <tbody>
            {prLines.map((r) => {
              const decided = who.decisions.get(`${r.prId}::${r.itemName}`) || [];
              const last = (role) => decided.filter((d) => d.role === role).pop();
              const vpApproved = r.vpDecision === "Approved" || r.vpDecision === "Modified & Approved";
              const cut = r.vpQty !== null && r.vpQty > r.finalQty;
              const ready = who.ready.get(`${r.prId}::${r.itemName}`);
              return (
                <tr key={r.lineId} style={rowStyle}>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>
                    <b>{r.prId}</b>
                    <div style={small}>{r.submittedAt}</div>
                    <div style={small}>{r.raisedBy}{r.dept ? ` · ${r.dept}` : ""}{r.urgency && r.urgency !== "Normal" ? ` · ${r.urgency}` : ""}</div>
                  </td>
                  <td style={tdR}>{q(r.requestedQty)}<div style={small}>@ {fmtRate(r.requestedRate)}</div></td>
                  <td style={{ ...td, minWidth: 190 }}>
                    {r.lane === "Exception" ? <Badge bg="#FCEAEA" fg={C.red}>Exception</Badge> : <Badge bg="#E9F6EF" fg={C.green}>Good to Approve</Badge>}
                    {r.lane === "Exception" && laneReasons(r).map((x, i) => <div key={i} style={{ ...small, marginTop: 3 }}>{x}</div>)}
                  </td>
                  <td style={{ ...td, minWidth: 170 }}>
                    <DecisionBadge decision={r.vpDecision || "Pending"} />
                    {vpApproved && <div style={{ marginTop: 3 }}>{q(cut ? r.vpQty : r.finalQty)} @ {fmtRate(r.approvedRate)}</div>}
                    {r.vpDecision !== "Pending" && <By entry={last("VP")} />}
                    {cut && <div style={{ ...small, color: C.amber }}>cut to {q(r.finalQty)} by Purchase</div>}
                  </td>
                  <td style={{ ...td, minWidth: 150 }}>
                    {r.presidentDecision
                      ? <><DecisionBadge decision={r.presidentDecision} />{r.presidentDecision !== "Pending" && <By entry={last("President")} />}</>
                      : <span style={small}>{vpApproved ? "Not needed" : "—"}</span>}
                  </td>
                  <td style={td}>
                    <StageBadge stage={r.stage} />
                    {ready && <div style={{ ...small, marginTop: 3 }}>Ready for PO by {ready.who}</div>}
                  </td>
                </tr>
              );
            })}
            {prLines.length === 0 && <Empty cols={6} text="No requisition has been raised for this item yet." />}
          </tbody>
        </table>
      </Section>

      <Section title={`Purchase Orders (${new Set(poRows.map((x) => x.r.poId)).size})`} note="Amounts before GST">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={headRow}><th style={th}>PO</th><th style={th}>Supplier</th><th style={th}>From PR</th><th style={thR}>Qty × Rate</th><th style={th}>Due</th><th style={thR}>Received</th><th style={th}>Signed</th></tr>
          </thead>
          <tbody>
            {poRows.map(({ r, po }) => {
              const issued = who.issued.get(r.poId);
              const full = r.receivedQty >= r.poQty && r.poQty > 0;
              return (
                <tr key={`${r.poId}::${r.lineId}`} style={rowStyle}>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>
                    <b>{r.poId}</b>
                    <div style={small}>{fmtDateShort(r.poDate)}</div>
                    {issued && <div style={small}>by {issued.who}</div>}
                  </td>
                  <td style={td}>{r.supplier || "—"}</td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{r.prId}</td>
                  <td style={tdR}>{q(r.poQty)}<div style={small}>@ {fmtRate(r.poRate)} = {fmtINR(r.poAmount)}</div></td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtDateShort(r.deliveryDate) || "—"}</td>
                  <td style={{ ...tdR, color: full ? C.green : r.receivedQty > 0 ? C.navy : undefined, fontWeight: full ? 700 : 400 }}>
                    {fmtNum(r.receivedQty)} of {q(r.poQty)}
                    {r.toReceive > 0 && <div style={{ ...small, color: C.amber }}>{q(r.toReceive)} to come</div>}
                  </td>
                  <td style={{ ...td, fontSize: 11.5, whiteSpace: "nowrap" }}>
                    {[["vp", "VP"], ["president", "President"], ["purchaseManager", "Purchase Mgr"]].map(([k, label]) => {
                      const s = po && po.signatures && po.signatures[k];
                      return <div key={k} style={{ color: s ? C.green : "#9AA1AC" }} title={s ? `Signed by ${s.by} · ${s.date}` : "Not signed yet"}>{s ? "✓" : "○"} {label}{s ? ` — ${s.by}` : ""}</div>;
                    })}
                  </td>
                </tr>
              );
            })}
            {poRows.length === 0 && <Empty cols={7} text="No PO has been issued for this item yet." />}
          </tbody>
        </table>
      </Section>

      <Section title={`Goods Receipts — GRN (${grnRows.length})`}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={headRow}><th style={th}>GRN</th><th style={th}>Received On</th><th style={th}>Bill</th><th style={th}>PO / PR</th><th style={thR}>Qty Received</th><th style={th}>Recorded By</th></tr>
          </thead>
          <tbody>
            {grnRows.map((g, i) => (
              <tr key={`${g.id}-${i}`} style={rowStyle}>
                <td style={{ ...td, whiteSpace: "nowrap" }}><b>{g.id}</b></td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtDateShort(g.receivedDate) || "—"}</td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>{g.billNo || "—"}{g.billDate && <div style={small}>{fmtDateShort(g.billDate)}</div>}</td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>{g.poId}<div style={small}>{g.prId}</div></td>
                <td style={{ ...tdR, fontWeight: 600 }}>{q(g.qty)}</td>
                <td style={td}>{g.recordedBy || "—"}{g.ts && <div style={small}>{g.ts}</div>}</td>
              </tr>
            ))}
            {grnRows.length === 0 && <Empty cols={6} text="Nothing has been received against this item yet." />}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
