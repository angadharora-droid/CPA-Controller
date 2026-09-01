import { C, btnStyle } from "../../theme.js";
import { fmtINR, fmtNum } from "../../utils/format.js";
import { Badge } from "../ui.jsx";

/* ================= PURCHASE MANAGER QUEUE ================= */
export default function QueueTab({ prs, purchaseAdvance, cardStyle }) {
  const QUEUES = ["Auto-Approved PRs", "President-Approved Exceptions", "Ready for PO", "PO Issued", "Closed"];
  function mapQueue(p) {
    if (p.status === "Auto-Approved") return "Auto-Approved PRs";
    if (p.status === "President-Approved") return "President-Approved Exceptions";
    if (p.status === "Ready for PO") return "Ready for PO";
    if (p.status === "PO Issued") return "PO Issued";
    if (p.status === "Closed") return "Closed";
    return null;
  }
  const nextStatus = { "Auto-Approved PRs": "Ready for PO", "President-Approved Exceptions": "Ready for PO", "Ready for PO": "PO Issued", "PO Issued": "Closed" };
  return (
    <div>
      <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 16 }}>Purchase Manager Work Queue</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14 }}>
        {QUEUES.map((q) => {
          const list = prs.filter((p) => mapQueue(p) === q);
          return (
            <div key={q} style={{ ...cardStyle }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
                <span>{q}</span><Badge bg="#F0F0EF" fg="#6B7280">{list.length}</Badge>
              </div>
              {list.length === 0 && <div style={{ fontSize: 11.5, color: "#9AA1AC" }}>Empty</div>}
              {list.map((p) => (
                <div key={p.id} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 8, marginBottom: 8, fontSize: 12 }}>
                  <div style={{ fontWeight: 700 }}>{p.itemName}</div>
                  <div style={{ color: "#9AA1AC" }}>{p.id} · {fmtINR(p.value)}</div>
                  <div style={{ color: "#9AA1AC" }}>{fmtNum(p.requestedQty)} @ {fmtINR(p.requestedRate)}</div>
                  {p.vendorDetails && <div style={{ color: "#6B7280", marginTop: 2 }}>Vendor: {p.vendorDetails}</div>}
                  {p.proposedBrand && <div style={{ color: "#6B7280" }}>Brand: {p.proposedBrand}</div>}
                  {p.modelDetails && <div style={{ color: "#6B7280" }}>Model/spec: {p.modelDetails}</div>}
                  {nextStatus[q] && (
                    <button onClick={() => purchaseAdvance(p.id, nextStatus[q])} style={{ ...btnStyle(C.navy), fontSize: 11, padding: "4px 9px", marginTop: 6 }}>Move to {nextStatus[q]} →</button>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
