import { C } from "../../theme.js";
import { fmtINR } from "../../utils/format.js";
import { Badge, ReconIndicator } from "../ui.jsx";

/* ================= DASHBOARD ================= */
export default function DashboardTab({ HEADS, headFreeze, headItemTotal, headCommitted, headIncomplete, reconColor, execTotals, prs, cardStyle, items, setTab, setSelectedHead }) {
  const autoCount = prs.filter((p) => p.autoApproved).length;
  const exCount = prs.filter((p) => !p.autoApproved).length;
  const pendingCount = prs.filter((p) => p.status === "Pending President").length;
  const totalCommitted = Object.values(headCommitted).reduce((a, b) => a + b, 0);
  const rateAbove5 = prs.filter((p) => p.reasonCode === "Rate Exceeds Approved Rate").length;
  const unbudgeted = prs.filter((p) => p.reasonCode === "Unbudgeted Item").length;
  const KpiCard = ({ label, value, sub, accent }) => (
    <div style={{ ...cardStyle, flex: "1 1 200px", minWidth: 190 }}>
      <div style={{ fontSize: 11, color: "#6B7280", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6, color: accent || "#1C242E" }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: "#9AA1AC", marginTop: 3 }}>{sub}</div>}
    </div>
  );
  return (
    <div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
        <KpiCard label="Total Approved Budget" value={fmtINR(19058140)} />
        <KpiCard label="Committed (Auto + President PRs)" value={fmtINR(totalCommitted)} accent="#2E5FA3" />
        <KpiCard label="Available Balance" value={fmtINR(19058140 - totalCommitted)} accent="#1E8E5A" />
        <KpiCard label="Pending Exceptions" value={pendingCount} accent={pendingCount ? "#B3261E" : "#1E8E5A"} sub="On President's desk right now" />
        <KpiCard label="Auto-Approved PRs" value={autoCount} accent="#1E8E5A" />
        <KpiCard label="President-Routed Exceptions" value={exCount} accent="#B9760A" />
        <KpiCard label="Unbudgeted Requests" value={unbudgeted} />
        <KpiCard label="Rate Variations Above Tolerance" value={rateAbove5} />
      </div>

      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Budget Head vs Item List vs Committed</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#6B7280", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>
              <th style={{ padding: "6px 8px" }}>Budget Head</th>
              <th style={{ padding: "6px 8px" }}>Freeze Status</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>Ceiling</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>Item List Total</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>Committed</th>
              <th style={{ padding: "6px 8px" }}>Incomplete Items</th>
              <th style={{ padding: "6px 8px" }}>Reconciliation</th>
            </tr>
          </thead>
          <tbody>
            {HEADS.map((h) => (
              <tr key={h.name} style={{ borderTop: "1px solid #EEEDE7", cursor: "pointer" }} onClick={() => { setSelectedHead(h.name); setTab("freeze"); }}>
                <td style={{ padding: "8px 8px", fontWeight: 600 }}>{h.name}<div style={{ fontSize: 11, color: "#9AA1AC", fontWeight: 400 }}>{h.dept}</div></td>
                <td style={{ padding: "8px 8px" }}>
                  <Badge bg={headFreeze[h.name] === "Not Frozen" ? "#F0F0EF" : "#EAF0FB"} fg={headFreeze[h.name] === "Not Frozen" ? "#9AA1AC" : "#2E5FA3"}>{headFreeze[h.name]}</Badge>
                </td>
                <td style={{ padding: "8px 8px", textAlign: "right" }}>{fmtINR(h.ceil)}</td>
                <td style={{ padding: "8px 8px", textAlign: "right" }}>{fmtINR(headItemTotal[h.name])}</td>
                <td style={{ padding: "8px 8px", textAlign: "right" }}>{fmtINR(headCommitted[h.name])}</td>
                <td style={{ padding: "8px 8px" }}>{headIncomplete[h.name] > 0 ? <Badge bg="#FDF2E3" fg="#B9760A">{headIncomplete[h.name]} item(s)</Badge> : <Badge bg="#E9F6EF" fg="#1E8E5A">None</Badge>}</td>
                <td style={{ padding: "8px 8px" }}><ReconIndicator color={reconColor(h.name)} label={reconColor(h.name) === "green" ? "Within Ceiling" : reconColor(h.name) === "amber" ? "Incomplete" : reconColor(h.name) === "red" ? "Exceeds Ceiling" : "Not Frozen"} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: `2px solid ${C.line}`, fontWeight: 800 }}>
              <td style={{ padding: "10px 8px" }}>GRAND TOTAL</td>
              <td />
              <td style={{ padding: "10px 8px", textAlign: "right" }}>{fmtINR(19058140)}</td>
              <td style={{ padding: "10px 8px", textAlign: "right" }}>{fmtINR(Object.values(headItemTotal).reduce((a, b) => a + b, 0))}</td>
              <td style={{ padding: "10px 8px", textAlign: "right" }}>{fmtINR(totalCommitted)}</td>
              <td /><td />
            </tr>
          </tfoot>
        </table>
        <div style={{ fontSize: 11.5, color: "#9AA1AC", marginTop: 8 }}>Click any row to jump to that head's Budget Review &amp; Freeze screen.</div>
      </div>

      <div style={{ ...cardStyle }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Recent PR Activity</div>
        {prs.length === 0 && <div style={{ color: "#9AA1AC", fontSize: 13 }}>No purchase requisitions raised yet. Try the "Raise Purchase Requisition" tab or the Demo Scenarios.</div>}
        {prs.slice(0, 8).map((p) => (
          <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid #EEEDE7", fontSize: 13 }}>
            <div><b>{p.id}</b> · {p.itemName} <span style={{ color: "#9AA1AC" }}>({p.headName})</span></div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ color: "#9AA1AC" }}>{fmtINR(p.value)}</span>
              <Badge bg={p.autoApproved ? "#E9F6EF" : p.status === "Pending President" ? "#FCEAEA" : "#EAF0FB"} fg={p.autoApproved ? "#1E8E5A" : p.status === "Pending President" ? "#B3261E" : "#2E5FA3"}>{p.status}</Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
