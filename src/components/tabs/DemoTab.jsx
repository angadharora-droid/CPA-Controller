import { useState } from "react";
import { C, btnStyle } from "../../theme.js";
import { Badge } from "../ui.jsx";

/* ================= DEMO SCENARIOS ================= */
export default function DemoTab({ items, HEADS, headFreeze, freezeHead, setItemApproval, submitPR, setTab, cardStyle, tolerancePct }) {
  const [log, setLog] = useState([]);
  function run(fn, label) {
    const pr = fn();
    setLog((l) => [{ label, pr }, ...l]);
  }
  function findItem(name) { return items.find((i) => i.name === name); }

  const scenarios = [
    {
      title: "1 · Crockery item within qty & rate", desc: "Dinner plates — request exactly the frozen qty/rate.",
      run: () => { const it = findItem("Dinner plates — Banquet"); if (!it || it.freezeState === "Not Frozen") return null; return submitPR({ itemId: it.id, requestedQty: it.qty - (it.committedQty||0) > 0 ? Math.min(50, it.qty-(it.committedQty||0)) : 1, requestedRate: it.rate, requestedBy: "F&B Store Incharge", dept: "F&B", justification: "Replenishing opening crockery stock." }); },
    },
    {
      title: "2 · Cutlery 4% above frozen rate", desc: "Ap Knive (Banquet) — vendor quoted 4% higher; enough category budget remains.",
      run: () => { const it = findItem("Ap Knive (Banquet)"); if (!it || it.rate === null) return null; return submitPR({ itemId: it.id, requestedQty: 20, requestedRate: it.rate * 1.04, requestedBy: "F&B Store Incharge", dept: "F&B", justification: "Vendor rate revision, within tolerance." }); },
    },
    {
      title: "3 · Glassware 8% above frozen rate", desc: "Champagne Flute (Banquet) — vendor quoted 8% higher; exceeds tolerance → President.",
      run: () => { const it = findItem("Champagne Flute (Banquet)"); if (!it || it.rate === null) return null; return submitPR({ itemId: it.id, requestedQty: 20, requestedRate: it.rate * 1.0835, requestedBy: "F&B Store Incharge", dept: "F&B", justification: "Only vendor available quoted higher due to import glass pricing." }); },
    },
    {
      title: "4 · Unlisted operating item", desc: "An item that does not exist anywhere in the imported workbook, charged to Miscellaneous & Contingency.",
      run: () => submitPR({ itemId: null, unbudgetedName: "Portable PA system for lobby announcements", unbudgetedHead: "Miscellaneous & Contingency", requestedQty: 1, requestedRate: 18000, requestedBy: "Front Office Manager", dept: "Front Office", justification: "Not part of original CAPEX list; needed for soft-launch event." }),
    },
    {
      title: "5 · Room Linen — rate not frozen", desc: "Double Bedsheet has 3 competing vendor quotes; no single approved rate yet.",
      run: () => { const it = findItem("Double Bedsheet"); if (!it) return null; return submitPR({ itemId: it.id, requestedQty: 50, requestedRate: 1205, requestedBy: "Housekeeping Manager", dept: "Housekeeping", justification: "Urgent — required before soft opening." }); },
    },
    {
      title: "6 · Kitchen lump-sum item, unfrozen detail", desc: "A Kitchen Equipment wishlist item under the ₹25L lump-sum head, with no rate captured.",
      run: () => { const it = items.find((i) => i.head === "Kitchen Equipment & Utensils" && i.status !== "Complete"); if (!it) return null; return submitPR({ itemId: it.id, requestedQty: 1, requestedRate: 50000, requestedBy: "Executive Chef", dept: "Kitchen", justification: "Required for BOH readiness." }); },
    },
    {
      title: "7 · Category budget exhausted", desc: "Kitchen Equipment & Utensils is already over its ₹25L ceiling — even a small within-item PR is stopped.",
      run: () => { const it = findItem("Masala try 9 box"); if (!it) return null; return submitPR({ itemId: it.id, requestedQty: 5, requestedRate: it.rate, requestedBy: "Executive Chef", dept: "Kitchen", justification: "Additional stock for opening week." }); },
    },
  ];

  return (
    <div>
      <div style={{ ...cardStyle, marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Setup: freeze the demo heads first</div>
        <div style={{ fontSize: 12.5, color: "#9AA1AC", marginBottom: 10 }}>Freezes Crockery, Cutlery, Glassware, Room Linen and Kitchen Equipment &amp; Utensils as "Fully Frozen" (Room Linen stays partially incomplete on purpose) so the scenarios below have something real to run against.</div>
        <button style={btnStyle(C.navy)} onClick={() => {
          ["Crockery", "Cutlery", "Glassware", "Kitchen Equipment & Utensils"].forEach((h) => freezeHead(h, "Fully Frozen"));
          freezeHead("Room Linen", "Provisionally Frozen");
        }}>Freeze demo budget heads</button>
        {" "}
        <span style={{ fontSize: 11.5, color: "#9AA1AC" }}>{Object.values(headFreeze).filter((s) => s !== "Not Frozen").length} of {HEADS.length} heads currently frozen.</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 12 }}>
        {scenarios.map((s) => (
          <div key={s.title} style={{ ...cardStyle }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{s.title}</div>
            <div style={{ fontSize: 12, color: "#9AA1AC", margin: "6px 0 10px" }}>{s.desc}</div>
            <button style={btnStyle(C.gold)} onClick={() => run(s.run, s.title)}>Run scenario</button>
          </div>
        ))}
      </div>

      {log.length > 0 && (
        <div style={{ ...cardStyle, marginTop: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Scenario results (most recent first)</div>
          {log.map((l, i) => (
            <div key={i} style={{ borderTop: i ? "1px solid #F0EFEA" : "none", padding: "10px 0" }}>
              <div style={{ fontWeight: 700, fontSize: 12.5 }}>{l.label}</div>
              {!l.pr && <div style={{ fontSize: 12, color: C.red }}>Could not run — freeze the demo budget heads first.</div>}
              {l.pr && (
                <div style={{ fontSize: 12.5, marginTop: 4 }}>
                  <Badge bg={l.pr.autoApproved ? "#E9F6EF" : "#FCEAEA"} fg={l.pr.autoApproved ? C.green : C.red}>{l.pr.autoApproved ? "AUTO-APPROVED" : "ESCALATED: " + l.pr.reasonCode}</Badge>
                  <div style={{ color: "#6B7280", marginTop: 4 }}>{l.pr.detail}</div>
                </div>
              )}
            </div>
          ))}
          <button onClick={() => setTab("exceptions")} style={{ ...btnStyle(C.navy), marginTop: 10 }}>View escalations on President's desk →</button>
        </div>
      )}
    </div>
  );
}
