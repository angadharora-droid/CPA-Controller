import { useMemo, useState } from "react";
import { C } from "../theme.js";
import { fmtINR, fmtNum } from "../utils/format.js";
import { fmtDateShort } from "../utils/po.js";
import { matchesQuery } from "../utils/search.js";
import { Badge, SearchBox } from "./ui.jsx";

/* ================= PURCHASE PIPELINE (Approve PR → Issue PO → Follow on Delivery → Received & Closed) ================= */

const STAGES = [
  { id: "approve", title: "Approve PR", sub: "Awaiting VP / President", color: C.amber, tint: "#FDF2E3" },
  { id: "issue", title: "Issue PO", sub: "Approved — with Purchase", color: C.blue, tint: "#EAF0FB" },
  { id: "delivery", title: "Follow on Delivery", sub: "PO issued, goods awaited", color: C.navy, tint: "#E9EDF4" },
  { id: "closed", title: "Received & Closed", sub: "Fully received", color: C.green, tint: "#E9F6EF" },
];

const APPROVE_STATUSES = new Set(["Pending VP", "Pending President"]);
const ISSUE_STATUSES = new Set(["Pending Purchase Manager", "Ready for PO"]);

const lineValue = (l) => (Number(l.finalQty) || 0) * (Number(l.pmRate || l.finalRate) || 0);
const lineRate = (l) => Number(l.pmRate || l.finalRate) || 0;
const poValue = (po) => (po.lines || []).reduce((s, l) => s + (Number(l.amount) || 0), 0);
const poOrdered = (po) => (po.lines || []).reduce((s, l) => s + (Number(l.qty) || 0), 0);
const poReceived = (po) => (po.lines || []).reduce((s, l) => s + (Number(l.qtyReceived) || 0), 0);
const isFullyReceived = (po) => (po.lines || []).length > 0 && po.lines.every((l) => (Number(l.qtyReceived) || 0) >= (Number(l.qty) || 0));

function groupByPR(lines) {
  const map = new Map();
  lines.forEach((l) => {
    if (!map.has(l.prId)) map.set(l.prId, { prId: l.prId, raisedBy: l.raisedBy, dept: l.dept, urgency: l.urgency, requiredBy: l.requiredBy, lines: [] });
    map.get(l.prId).lines.push(l);
  });
  return [...map.values()];
}

function dueInfo(iso) {
  if (!iso) return { label: "No due date", fg: "#9AA1AC", bg: "#F0F0EF" };
  const due = new Date(`${iso}T00:00:00`);
  if (isNaN(due.getTime())) return { label: iso, fg: "#9AA1AC", bg: "#F0F0EF" };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((due - today) / 86400000);
  if (days < 0) return { label: `Overdue by ${-days} day${-days === 1 ? "" : "s"}`, fg: C.red, bg: "#FCEAEA" };
  if (days === 0) return { label: "Due today", fg: C.amber, bg: "#FDF2E3" };
  if (days <= 3) return { label: `Due in ${days} day${days === 1 ? "" : "s"}`, fg: C.amber, bg: "#FDF2E3" };
  return { label: `Due ${fmtDateShort(iso)}`, fg: "#6B7280", bg: "#F0F0EF" };
}

const cardBox = { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 12px", marginBottom: 8 };
const muted = { fontSize: 11, color: "#9AA1AC" };

function StageHeader({ stage, count, value, first, last }) {
  const notch = 14;
  const clip = first
    ? `polygon(0 0, calc(100% - ${notch}px) 0, 100% 50%, calc(100% - ${notch}px) 100%, 0 100%)`
    : last
      ? `polygon(0 0, 100% 0, 100% 100%, 0 100%, ${notch}px 50%)`
      : `polygon(0 0, calc(100% - ${notch}px) 0, 100% 50%, calc(100% - ${notch}px) 100%, 0 100%, ${notch}px 50%)`;
  return (
    <div style={{ background: stage.color, color: "#fff", clipPath: clip, padding: `10px ${notch + 8}px 10px ${first ? 14 : notch + 10}px`, minHeight: 58, boxSizing: "border-box" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: 0.2, whiteSpace: "nowrap" }}>{stage.title}</div>
        <div style={{ fontWeight: 800, fontSize: 18, lineHeight: 1 }}>{count}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 3, fontSize: 11, opacity: 0.9 }}>
        <span>{stage.sub}</span>
        <span style={{ whiteSpace: "nowrap" }}>{fmtINR(value)}</span>
      </div>
    </div>
  );
}

function PRCard({ pr, stageId, onOpen }) {
  const value = pr.lines.reduce((s, l) => s + lineValue(l), 0);
  const urgent = /high/i.test(pr.urgency || "");
  return (
    <div onClick={onOpen} style={{ ...cardBox, cursor: onOpen ? "pointer" : "default" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 12.5 }}>{pr.prId}</div>
        {urgent && <Badge bg="#FCEAEA" fg={C.red}>Urgent</Badge>}
      </div>
      <div style={{ ...muted, marginTop: 1 }}>{pr.raisedBy || "—"}{pr.dept ? ` · ${pr.dept}` : ""}{pr.requiredBy ? ` · needs by ${fmtDateShort(pr.requiredBy)}` : ""}</div>
      <div style={{ marginTop: 8 }}>
        {pr.lines.map((l) => {
          let tag;
          if (stageId === "approve") {
            tag = l.status === "Pending VP"
              ? <Badge bg="#EAF0FB" fg={C.blue}>VP's Desk</Badge>
              : <Badge bg="#FCEAEA" fg={C.red}>President</Badge>;
          } else {
            tag = l.status === "Ready for PO"
              ? <Badge bg="#E9F6EF" fg={C.green}>Ready for PO</Badge>
              : <Badge bg="#EAF0FB" fg={C.blue}>Negotiating</Badge>;
          }
          return (
            <div key={l.lineId} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, padding: "5px 0", borderTop: "1px solid #F0EFEA", fontSize: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.itemName}</div>
                <div style={muted}>
                  {fmtNum(l.finalQty)} × {fmtINR(lineRate(l))}
                  {stageId === "approve" && l.lane === "exception" && <span style={{ color: C.red, fontWeight: 700 }}> · Exception</span>}
                  {!l.itemId && <span style={{ color: C.amber, fontWeight: 700 }}> · Unbudgeted</span>}
                </div>
              </div>
              <div style={{ flexShrink: 0 }}>{tag}</div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12 }}>
        <span style={muted}>{pr.lines.length} line{pr.lines.length === 1 ? "" : "s"}</span>
        <span style={{ fontWeight: 700 }}>{fmtINR(value)}</span>
      </div>
    </div>
  );
}

function POCard({ po, closedOn, onOpen }) {
  const ordered = poOrdered(po), received = poReceived(po);
  const pct = ordered > 0 ? Math.min(100, Math.round((received / ordered) * 100)) : 0;
  const due = closedOn ? null : dueInfo(po.deliveryDate);
  return (
    <div onClick={onOpen} style={{ ...cardBox, cursor: onOpen ? "pointer" : "default" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 12.5 }}>{po.id}</div>
        {closedOn
          ? <Badge bg="#E9F6EF" fg={C.green}>Closed</Badge>
          : <Badge bg={due.bg} fg={due.fg}>{due.label}</Badge>}
      </div>
      <div style={{ ...muted, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{po.supplier || "—"}</div>
      <div style={{ marginTop: 8, fontSize: 12 }}>
        {(po.lines || []).slice(0, 4).map((l) => (
          <div key={l.lineId} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "3px 0", borderTop: "1px solid #F0EFEA" }}>
            <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.itemName}</span>
            <span style={{ ...muted, whiteSpace: "nowrap" }}>{fmtNum(l.qtyReceived || 0)} / {fmtNum(l.qty)}</span>
          </div>
        ))}
        {(po.lines || []).length > 4 && <div style={{ ...muted, paddingTop: 3 }}>+ {po.lines.length - 4} more line(s)</div>}
      </div>
      <div style={{ marginTop: 8 }}>
        <div style={{ height: 6, background: "#EEEDE7", borderRadius: 99, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: pct >= 100 ? C.green : C.blue }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 12 }}>
          <span style={muted}>{closedOn ? `Received ${closedOn}` : `${fmtNum(received)} of ${fmtNum(ordered)} units received`}</span>
          <span style={{ fontWeight: 700 }}>{fmtINR(poValue(po))}</span>
        </div>
      </div>
    </div>
  );
}

export default function PipelineBoard({ allLines, pos, grns, openTab, canOpenTab, tolerancePct }) {
  const [query, setQuery] = useState("");
  const data = useMemo(() => {
    // a search narrows the cards (and the stage counts / values above them); the footer tallies stay overall
    const prMatches = (pr) => matchesQuery(query, pr.prId, pr.raisedBy, pr.dept, ...pr.lines.flatMap((l) => [l.itemName, l.headName, l.vendorDetails]));
    const poMatches = (po) => matchesQuery(query, po.id, po.supplier, ...(po.lines || []).map((l) => l.itemName));
    const approve = groupByPR(allLines.filter((l) => APPROVE_STATUSES.has(l.status))).filter(prMatches);
    const issue = groupByPR(allLines.filter((l) => ISSUE_STATUSES.has(l.status))).filter(prMatches);
    const delivery = pos.filter((po) => !isFullyReceived(po) && poMatches(po));
    const closed = pos.filter((po) => isFullyReceived(po) && poMatches(po)).map((po) => {
      const g = grns.find((x) => x.poId === po.id); // grns are newest-first
      return { po, closedOn: g ? fmtDateShort(g.receivedDate) || g.ts : "" };
    });
    const rejected = allLines.filter((l) => /Rejected/.test(l.status)).length;
    const deferred = allLines.filter((l) => /Deferred/.test(l.status)).length;
    const unbudgeted = allLines.filter((l) => !l.itemId && APPROVE_STATUSES.has(l.status)).length;
    const rateAboveTol = allLines.filter((l) => APPROVE_STATUSES.has(l.status) && l.variancePct !== null && l.variancePct > tolerancePct).length;
    return {
      approve, issue, delivery, closed, rejected, deferred, unbudgeted, rateAboveTol,
      values: {
        approve: approve.reduce((s, pr) => s + pr.lines.reduce((a, l) => a + lineValue(l), 0), 0),
        issue: issue.reduce((s, pr) => s + pr.lines.reduce((a, l) => a + lineValue(l), 0), 0),
        delivery: delivery.reduce((s, po) => s + poValue(po), 0),
        closed: closed.reduce((s, x) => s + poValue(x.po), 0),
      },
      counts: { approve: approve.length, issue: issue.length, delivery: delivery.length, closed: closed.length },
    };
  }, [allLines, pos, grns, tolerancePct, query]);

  // Where a click on a card should take the signed-in user, if they have that screen.
  function prTarget(pr, stageId) {
    const order = stageId === "approve"
      ? (pr.lines.some((l) => l.status === "Pending VP") ? ["vpdesk", "president2nd"] : ["president2nd", "vpdesk"])
      : (pr.lines.some((l) => l.status === "Ready for PO") ? ["issuepo", "pmqueue"] : ["pmqueue", "issuepo"]);
    const id = order.find(canOpenTab);
    return id ? () => openTab(id) : null;
  }
  function poTarget() {
    const id = ["calendar", "receive"].find(canOpenTab);
    return id ? () => openTab(id) : null;
  }

  const searching = !!query.trim();
  const empty = (text) => <div style={{ border: `1px dashed ${C.line}`, borderRadius: 10, padding: 18, textAlign: "center", ...muted }}>{searching ? "No matches in this stage" : text}</div>;

  return (
    <div>
      <div style={{ display: "flex", marginBottom: 10 }}>
        <SearchBox value={query} onChange={setQuery} placeholder="Search the pipeline — PR / PO no., item, supplier, requester, department…" />
      </div>
      <div style={{ overflowX: "auto", paddingBottom: 4 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(240px, 1fr))", gap: 0, minWidth: 980 }}>
          {STAGES.map((st, i) => (
            <StageHeader key={st.id} stage={st} count={data.counts[st.id]} value={data.values[st.id]} first={i === 0} last={i === STAGES.length - 1} />
          ))}
          {STAGES.map((st) => (
            <div key={st.id} style={{ background: st.tint, padding: 10, marginTop: 8, marginRight: 8, borderRadius: 10, minHeight: 200, maxHeight: 560, overflowY: "auto", boxSizing: "border-box" }}>
              {st.id === "approve" && (data.approve.length ? data.approve.map((pr) => <PRCard key={pr.prId} pr={pr} stageId="approve" onOpen={prTarget(pr, "approve")} />) : empty("No requisitions awaiting approval"))}
              {st.id === "issue" && (data.issue.length ? data.issue.map((pr) => <PRCard key={pr.prId} pr={pr} stageId="issue" onOpen={prTarget(pr, "issue")} />) : empty("Nothing approved and waiting for a PO"))}
              {st.id === "delivery" && (data.delivery.length ? data.delivery.map((po) => <POCard key={po.id} po={po} onOpen={poTarget()} />) : empty("No open purchase orders"))}
              {st.id === "closed" && (data.closed.length ? data.closed.map(({ po, closedOn }) => <POCard key={po.id} po={po} closedOn={closedOn} onOpen={poTarget()} />) : empty("Nothing fully received yet"))}
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10, fontSize: 12, color: "#6B7280" }}>
        <span><b style={{ color: C.text }}>{data.rejected}</b> rejected</span>
        <span><b style={{ color: C.text }}>{data.deferred}</b> deferred</span>
        <span><b style={{ color: data.unbudgeted ? C.amber : C.text }}>{data.unbudgeted}</b> unbudgeted awaiting approval</span>
        <span><b style={{ color: data.rateAboveTol ? C.red : C.text }}>{data.rateAboveTol}</b> above {tolerancePct}% rate variance awaiting approval</span>
        <span style={{ marginLeft: "auto", color: "#9AA1AC" }}>Click a card to open its screen.</span>
      </div>
    </div>
  );
}
