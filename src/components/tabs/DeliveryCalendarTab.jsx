import { useState, useMemo } from "react";
import { C, btnStyle } from "../../theme.js";
import { matchesQuery } from "../../utils/search.js";
import { SearchBox } from "../ui.jsx";
import POView from "../POView.jsx";

/* ================= DELIVERY CALENDAR ================= */
export default function DeliveryCalendarTab({ pos, cardStyle, signPO, role, isAdmin }) {
  const [viewPoId, setViewPoId] = useState(null);
  const viewPo = pos.find((p) => p.id === viewPoId) || null;
  const [query, setQuery] = useState("");
  const grouped = useMemo(() => {
    const o = {};
    pos.filter((po) => matchesQuery(query, po.id, po.supplier, po.deliveryDate, ...po.lines.map((l) => l.itemName))).forEach((po) => { const d = po.deliveryDate || "No date set"; (o[d] = o[d] || []).push(po); });
    return Object.entries(o).sort(([a], [b]) => (a > b ? 1 : -1));
  }, [pos, query]);

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Delivery Calendar</div>
      <div style={{ fontSize: 12.5, color: "#9AA1AC", marginBottom: 14 }}>Every issued PO, grouped by its expected delivery date. Coordinate with suppliers accordingly.</div>
      {pos.length > 0 && <div style={{ display: "flex", marginBottom: 14 }}><SearchBox value={query} onChange={setQuery} placeholder="Search PO no., supplier, item or delivery date…" /></div>}
      {pos.length === 0 && <div style={{ ...cardStyle, textAlign: "center", color: "#9AA1AC", padding: 40 }}>No POs issued yet.</div>}
      {pos.length > 0 && grouped.length === 0 && <div style={{ ...cardStyle, textAlign: "center", color: "#9AA1AC", padding: 40 }}>No POs match "{query.trim()}".</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>
        {grouped.map(([date, list]) => (
          <div key={date} style={{ ...cardStyle }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.navy, marginBottom: 8 }}>{date}</div>
            {list.map((po) => {
              const ordered = po.lines.reduce((s, l) => s + (l.qty || 0), 0);
              const received = po.lines.reduce((s, l) => s + (l.qtyReceived || 0), 0);
              return (
                <div key={po.id} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 8, marginBottom: 8, fontSize: 12 }}>
                  <div style={{ fontWeight: 700 }}>{po.id}</div>
                  <div style={{ color: "#9AA1AC" }}>{po.supplier} · {po.lines.length} item(s)</div>
                  <div style={{ color: received >= ordered && ordered > 0 ? C.green : "#9AA1AC", fontSize: 11.5 }}>Received {received} of {ordered} units</div>
                  <button onClick={() => setViewPoId(po.id)} style={{ ...btnStyle(C.navy), fontSize: 11, padding: "4px 9px", marginTop: 6 }}>View / Download</button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {viewPo && <div style={{ marginTop: 16 }}><POView po={viewPo} signPO={signPO} role={role} isAdmin={isAdmin} /></div>}
    </div>
  );
}
