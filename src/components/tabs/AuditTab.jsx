/* ================= AUDIT TRAIL ================= */
export default function AuditTab({ audit, cardStyle }) {
  return (
    <div style={{ ...cardStyle }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Audit Trail</div>
      <div style={{ fontSize: 12, color: "#9AA1AC", marginBottom: 14 }}>Non-editable history. Nothing here can be deleted.</div>
      {audit.map((a, i) => (
        <div key={i} style={{ display: "flex", gap: 12, padding: "9px 0", borderTop: i ? "1px solid #F0EFEA" : "none", fontSize: 12.5 }}>
          <div style={{ width: 150, flexShrink: 0, color: "#9AA1AC" }}>{a.ts}</div>
          <div style={{ width: 190, flexShrink: 0, fontWeight: 700 }}>{a.who}</div>
          <div>{a.text}</div>
        </div>
      ))}
    </div>
  );
}
