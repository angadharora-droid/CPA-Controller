import { C } from "../../theme.js";
import { fmtINR } from "../../utils/format.js";
import { Badge, ReconIndicator } from "../ui.jsx";
import PipelineBoard from "../PipelineBoard.jsx";

/* ================= EXECUTIVE DASHBOARD: purchase pipeline first, budget position beneath ================= */
export default function DashboardTab({ HEADS, headFreeze, headItemTotal, headCommitted, headIncomplete, reconColor, cardStyle, setTab, setSelectedHead, canOpenFreeze, canOpenTab, budgetApproved, budgetCommitted, allLines, pos, grns, tolerancePct }) {
  const totalBudget = HEADS.reduce((s, h) => s + h.ceil, 0);

  const KpiCard = ({ label, value, sub, accent }) => (
    <div style={{ ...cardStyle, flex: "1 1 200px", minWidth: 190 }}>
      <div style={{ fontSize: 11, color: "#6B7280", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6, color: accent || "#1C242E" }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: "#9AA1AC", marginTop: 3 }}>{sub}</div>}
    </div>
  );

  function openHead(name) {
    if (!canOpenFreeze) return;
    setSelectedHead(name);
    setTab("freeze");
  }

  return (
    <div>
      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Purchase Pipeline</div>
          <div style={{ fontSize: 12, color: "#9AA1AC" }}>Every live requisition and purchase order, by stage.</div>
        </div>
        <PipelineBoard {...{ allLines, pos, grns, tolerancePct, canOpenTab }} openTab={setTab} />
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
        <KpiCard label="Total Approved Budget" value={fmtINR(totalBudget)} />
        <KpiCard label="Budget Approved (Frozen Heads)" value={fmtINR(budgetApproved)} accent="#2E5FA3" />
        <KpiCard label="Budget Committed" value={fmtINR(budgetCommitted)} accent="#B9760A" sub={`${pos.length} PO(s) issued · ${grns.length} GRN(s) recorded`} />
        <KpiCard label="Available Balance" value={fmtINR(totalBudget - budgetCommitted)} accent="#1E8E5A" />
      </div>

      <div style={{ ...cardStyle }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Budget Head vs Item List vs Committed</div>
        <div style={{ overflowX: "auto" }}>
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
              {HEADS.map((h) => {
                const rc = reconColor(h.name);
                const fz = headFreeze[h.name] || "Not Frozen";
                return (
                  <tr key={h.name} style={{ borderTop: "1px solid #EEEDE7", cursor: canOpenFreeze ? "pointer" : "default" }} onClick={() => openHead(h.name)}>
                    <td style={{ padding: "8px 8px", fontWeight: 600 }}>{h.name}<div style={{ fontSize: 11, color: "#9AA1AC", fontWeight: 400 }}>{h.dept}</div></td>
                    <td style={{ padding: "8px 8px" }}>
                      <Badge bg={fz === "Not Frozen" ? "#F0F0EF" : "#EAF0FB"} fg={fz === "Not Frozen" ? "#9AA1AC" : "#2E5FA3"}>{fz}</Badge>
                    </td>
                    <td style={{ padding: "8px 8px", textAlign: "right" }}>{fmtINR(h.ceil)}</td>
                    <td style={{ padding: "8px 8px", textAlign: "right" }}>{fmtINR(headItemTotal[h.name])}</td>
                    <td style={{ padding: "8px 8px", textAlign: "right" }}>{fmtINR(headCommitted[h.name])}</td>
                    <td style={{ padding: "8px 8px" }}>{headIncomplete[h.name] > 0 ? <Badge bg="#FDF2E3" fg="#B9760A">{headIncomplete[h.name]} item(s)</Badge> : <Badge bg="#E9F6EF" fg="#1E8E5A">None</Badge>}</td>
                    <td style={{ padding: "8px 8px" }}><ReconIndicator color={rc} label={rc === "green" ? "Within Ceiling" : rc === "amber" ? "Incomplete" : rc === "red" ? "Exceeds Ceiling" : "Not Frozen"} /></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: `2px solid ${C.line}`, fontWeight: 800 }}>
                <td style={{ padding: "10px 8px" }}>GRAND TOTAL</td>
                <td />
                <td style={{ padding: "10px 8px", textAlign: "right" }}>{fmtINR(totalBudget)}</td>
                <td style={{ padding: "10px 8px", textAlign: "right" }}>{fmtINR(Object.values(headItemTotal).reduce((a, b) => a + b, 0))}</td>
                <td style={{ padding: "10px 8px", textAlign: "right" }}>{fmtINR(budgetCommitted)}</td>
                <td /><td />
              </tr>
            </tfoot>
          </table>
        </div>
        {canOpenFreeze && <div style={{ fontSize: 11.5, color: "#9AA1AC", marginTop: 8 }}>Click any row to jump to that head's Budget Review &amp; Freeze screen.</div>}
      </div>
    </div>
  );
}
