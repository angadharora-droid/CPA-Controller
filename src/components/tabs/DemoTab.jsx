import { useState } from "react";
import { C, btnStyle } from "../../theme.js";
import { Badge } from "../ui.jsx";

const DEMO_HEADS = ["Crockery", "Cutlery", "Glassware", "Kitchen Utensils", "Kitchen Equipment", "Room Amenities (Non Consumable)"];

/* ================= DEMO SCENARIOS ================= */
export default function DemoTab({ items, HEADS, headFreeze, freezeHead, submitBundledPR, vpDecideLine, setTab, role, isAdmin, cardStyle }) {
  const [log, setLog] = useState([]);
  function findItem(name) { return items.find((i) => i.name === name && !i.deleted); }
  function push(label, result) { setLog((l) => [{ label, result }, ...l]); }
  // The demo walkthroughs act on a PR created in the same click, so the freshly built line is passed as a hint.
  const vpApproveFirstLine = (pr) => vpDecideLine(pr.id, pr.lines[0].lineId, "Approve", undefined, undefined, pr.lines[0]);

  const scenarios = [
    {
      title: "1 · Good to Approve", desc: "Dinner plates — exact qty/rate match, brand & model filled in.",
      run: () => {
        const it = findItem("Dinner plates"); if (!it) return null;
        return submitBundledPR({ lines: [{ itemId: it.id, requestedQty: 50, requestedRate: it.rate, proposedBrand: it.brand || "La Opala", proposedModel: it.spec || "10-inch round, white, bone china" }], raisedBy: "F&B Store Incharge", dept: "F&B", urgency: "Normal", requiredBy: "" });
      },
    },
    {
      title: "2 · Rate 4% high — still Good to Approve", desc: "Ap Knive (Banquet) — within the 5% good-to-approve threshold.",
      run: () => {
        const it = findItem("Ap Knive (Banquet)"); if (!it || it.rate === null) return null;
        return submitBundledPR({ lines: [{ itemId: it.id, requestedQty: 20, requestedRate: it.rate * 1.04, proposedBrand: it.brand || "Vinod", proposedModel: it.spec || "Stainless steel" }], raisedBy: "F&B Store Incharge", dept: "F&B", urgency: "Normal", requiredBy: "" });
      },
    },
    {
      title: "3 · Rate 8% high — VP Exception only", desc: "Champagne Flute (Banquet) — over 5% but under 15%, VP alone can approve.",
      run: () => {
        const it = findItem("Champagne Flute (Banquet)"); if (!it || it.rate === null) return null;
        return submitBundledPR({ lines: [{ itemId: it.id, requestedQty: 20, requestedRate: it.rate * 1.08, proposedBrand: it.brand || "Ocean", proposedModel: it.spec || "170ml crystal" }], raisedBy: "F&B Store Incharge", dept: "F&B", urgency: "Normal", requiredBy: "" });
      },
      walkthrough: vpApproveFirstLine,
    },
    {
      title: "4 · Rate 18% high — needs President's 2nd approval", desc: "Masala try 9 box — VP approves, but variance over 15% still needs the President.",
      run: () => {
        const it = findItem("Masala try 9 box"); if (!it || it.rate === null) return null;
        return submitBundledPR({ lines: [{ itemId: it.id, requestedQty: 5, requestedRate: it.rate * 1.18, proposedBrand: it.brand || "Approved", proposedModel: it.spec || "9-box masala tray" }], raisedBy: "Executive Chef", dept: "Kitchen", urgency: "High — opening critical", requiredBy: "" });
      },
      walkthrough: vpApproveFirstLine,
    },
    {
      title: "5 · Blank Model/Specs — Exception", desc: "Room Amenities item requested with the Model/Specs field left empty.",
      run: () => {
        const it = items.find((i) => i.head === "Room Amenities (Non Consumable)" && i.status === "Complete" && i.freezeState !== "Not Frozen" && !i.deleted); if (!it) return null;
        return submitBundledPR({ lines: [{ itemId: it.id, requestedQty: 10, requestedRate: it.rate, proposedBrand: it.brand || "As approved", proposedModel: "" }], raisedBy: "Housekeeping Manager", dept: "Housekeeping", urgency: "Normal", requiredBy: "" });
      },
    },
    {
      title: "6 · Unlisted item — Exception + 2nd approval", desc: "An item that doesn't exist in the approved list, charged to Miscellaneous and Contingencies.",
      run: () => submitBundledPR({ lines: [{ itemId: null, unbudgetedName: "Portable PA system for lobby announcements", unbudgetedHead: "Miscellaneous and Contingencies", requestedQty: 1, requestedRate: 18000, proposedBrand: "JBL", proposedModel: "Portable PA, 100W" }], raisedBy: "Front Office Manager", dept: "Front Office", urgency: "Normal", requiredBy: "" }),
      walkthrough: vpApproveFirstLine,
    },
    {
      title: "7 · Bulk order — one PR, three lines", desc: "Three Crockery items bundled into a single PR number.",
      run: () => {
        const names = ["Dinner plates", "Quarter plates", "Monkey Bowl"];
        const lines = names.map((n) => { const it = findItem(n); return it ? { itemId: it.id, requestedQty: 30, requestedRate: it.rate, proposedBrand: it.brand || "La Opala", proposedModel: it.spec || "As approved" } : null; }).filter(Boolean);
        if (!lines.length) return null;
        return submitBundledPR({ lines, raisedBy: "F&B Store Incharge", dept: "F&B", urgency: "Normal", requiredBy: "" });
      },
    },
  ];

  const frozenCount = Object.values(headFreeze).filter((s) => s && s !== "Not Frozen").length;

  return (
    <div>
      <div style={{ ...cardStyle, marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Setup: freeze the demo heads first</div>
        <div style={{ fontSize: 12.5, color: "#9AA1AC", marginBottom: 10 }}>Freezes {DEMO_HEADS.join(", ")} as "Fully Frozen" so the scenarios have something real to run against. Scenarios look for items by name (Dinner plates, Ap Knive (Banquet), Champagne Flute (Banquet), Masala try 9 box, Quarter plates, Monkey Bowl) — import them first via the VP's budget submission.</div>
        {role === "President" || isAdmin ? (
          <button style={btnStyle(C.navy)} onClick={() => { DEMO_HEADS.forEach((h) => freezeHead(h, "Fully Frozen")); }}>Freeze demo budget heads</button>
        ) : (
          <span style={{ fontSize: 12.5, color: C.amber }}>Sign in as the President to freeze the demo budget heads.</span>
        )}
        {" "}
        <span style={{ fontSize: 11.5, color: "#9AA1AC" }}>{frozenCount} of {HEADS.length} heads currently frozen.</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 12 }}>
        {scenarios.map((s) => (
          <div key={s.title} style={{ ...cardStyle }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{s.title}</div>
            <div style={{ fontSize: 12, color: "#9AA1AC", margin: "6px 0 10px" }}>{s.desc}</div>
            <button style={btnStyle(C.gold)} onClick={() => {
              const pr = s.run();
              if (pr && s.walkthrough) s.walkthrough(pr);
              push(s.title, pr);
            }}>Run scenario</button>
          </div>
        ))}
      </div>

      {log.length > 0 && (
        <div style={{ ...cardStyle, marginTop: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Scenario results (most recent first)</div>
          {log.map((l, i) => (
            <div key={i} style={{ borderTop: i ? "1px solid #F0EFEA" : "none", padding: "10px 0" }}>
              <div style={{ fontWeight: 700, fontSize: 12.5 }}>{l.label}</div>
              {!l.result && <div style={{ fontSize: 12, color: C.red }}>Could not run — the item isn't in the approved list yet. Import it via the VP's budget submission and freeze the demo heads first.</div>}
              {l.result && (
                <div style={{ fontSize: 12.5, marginTop: 4 }}>
                  <div style={{ color: "#6B7280", marginBottom: 4 }}>{l.result.id} — {l.result.lines.length} line(s)</div>
                  {l.result.lines.map((ln) => (
                    <div key={ln.lineId} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 3, flexWrap: "wrap" }}>
                      <Badge bg={ln.lane === "good" ? "#E9F6EF" : "#FCEAEA"} fg={ln.lane === "good" ? C.green : C.red}>{ln.lane === "good" ? "Good to Approve" : "Exception"}</Badge>
                      {ln.needsSecondApproval && <Badge bg="#EAF0FB" fg={C.blue}>Needs President's 2nd Approval</Badge>}
                      <span>{ln.itemName} — {ln.reasons.join("; ")}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
            {(role === "VP" || isAdmin) && <button onClick={() => setTab("vpdesk")} style={btnStyle(C.navy)}>Go to VP's Desk →</button>}
            {(role === "President" || isAdmin) && <button onClick={() => setTab("president2nd")} style={btnStyle(C.navy)}>Go to President's 2nd Approval →</button>}
            {role !== "VP" && role !== "President" && !isAdmin && <span style={{ fontSize: 12, color: "#9AA1AC" }}>Sign in as the VP or the President to act on these requisitions.</span>}
          </div>
        </div>
      )}
    </div>
  );
}
