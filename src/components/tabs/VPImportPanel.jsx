import { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { C, th, thR, btnStyle } from "../../theme.js";

/* ================= VP EXCEL IMPORT ================= */
export default function VPImportPanel({ HEADS, importVPItems, cardStyle }) {
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState("");
  const [checked, setChecked] = useState({});
  const [imported, setImported] = useState(null);
  const [error, setError] = useState("");

  const headNamesLower = useMemo(() => HEADS.map((h) => h.name.toLowerCase()), [HEADS]);

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setError(""); setImported(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: "array" });
        const sheetName = wb.SheetNames.find((n) => n.toLowerCase().includes("budget submission")) || wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        let headerIdx = grid.findIndex((r) => (r[0] || "").toString().trim().toLowerCase() === "item name");
        if (headerIdx === -1) headerIdx = 0;
        const parsed = [];
        for (let i = headerIdx + 1; i < grid.length; i++) {
          const r = grid[i];
          const name = (r[0] || "").toString().trim();
          if (!name || name.toLowerCase() === "total") continue;
          const head = (r[1] || "").toString().trim();
          const subCategory = (r[2] || "").toString().trim();
          const qty = r[3] === "" ? null : r[3];
          const rate = r[4] === "" ? null : r[4];
          const brand = (r[5] || "").toString().trim();
          const model = (r[6] || "").toString().trim();
          const validHead = headNamesLower.includes(head.toLowerCase());
          parsed.push({ name, head, subCategory, qty, rate, brand, model, validHead });
        }
        if (parsed.length === 0) { setError("No item rows found — check this is the Budget Submission template with an 'Item Name' header row."); setRows(null); return; }
        setRows(parsed);
        const ch = {};
        parsed.forEach((r, i) => { ch[i] = r.validHead; });
        setChecked(ch);
      } catch (err) {
        setError("Could not read this file — make sure it's a valid .xlsx workbook.");
        setRows(null);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  }

  function toggle(i) { setChecked((prev) => ({ ...prev, [i]: !prev[i] })); }

  function handleImport() {
    const selected = rows.filter((r, i) => checked[i] && r.validHead);
    const n = importVPItems(selected, fileName);
    setImported(n);
    setRows(null);
  }

  const selectedCount = rows ? rows.filter((r, i) => checked[i] && r.validHead).length : 0;
  const invalidCount = rows ? rows.filter((r) => !r.validHead).length : 0;

  return (
    <div style={{ ...cardStyle, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Import Budget Submission from Excel</div>
      <div style={{ fontSize: 12.5, color: "#9AA1AC", marginBottom: 12 }}>Upload the filled "CPA Budget Submission Template" (Item Name, Cost Head, Department/Area or Sub Category, Quantity, Budgeted Rate, Approved Brand, Model Number/Specs/Size/Material). Imported items appear below as new line items, ready for President to review and freeze.</div>
      <input type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ fontSize: 12.5 }} />
      {error && <div style={{ color: C.red, fontSize: 12.5, marginTop: 8 }}>{error}</div>}
      {imported !== null && <div style={{ color: C.green, fontSize: 12.5, marginTop: 8, fontWeight: 700 }}>✓ Imported {imported} item(s) from {fileName}. Scroll down to review under their budget heads.</div>}

      {rows && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12.5, color: "#6B7280", marginBottom: 8 }}>
            {rows.length} row(s) found — {selectedCount} ready to import{invalidCount > 0 ? `, ${invalidCount} skipped (unrecognized Cost Head)` : ""}.
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto", overflowX: "auto", border: `1px solid ${C.line}`, borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#6B7280", fontSize: 10.5, textTransform: "uppercase", background: "#FAFAF8", position: "sticky", top: 0 }}>
                  <th style={th}></th><th style={th}>Item</th><th style={th}>Cost Head</th><th style={th}>Dept/Area/Sub-Cat</th><th style={thR}>Qty</th><th style={thR}>Rate</th><th style={th}>Brand</th><th style={th}>Model/Specs</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderTop: "1px solid #F0EFEA", background: !r.validHead ? "#FCEAEA" : "transparent" }}>
                    <td style={{ padding: "5px 8px" }}><input type="checkbox" disabled={!r.validHead} checked={!!checked[i]} onChange={() => toggle(i)} /></td>
                    <td style={{ padding: "5px 8px", fontWeight: 600 }}>{r.name}</td>
                    <td style={{ padding: "5px 8px" }}>{r.head || <span style={{ color: C.red }}>blank</span>}{!r.validHead && <div style={{ fontSize: 10, color: C.red }}>Not a recognized Cost Head</div>}</td>
                    <td style={{ padding: "5px 8px" }}>{r.subCategory || "—"}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>{r.qty ?? "—"}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>{r.rate ?? "—"}</td>
                    <td style={{ padding: "5px 8px" }}>{r.brand || "—"}</td>
                    <td style={{ padding: "5px 8px" }}>{r.model || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={handleImport} disabled={selectedCount === 0} style={{ ...btnStyle(C.navy), marginTop: 10, opacity: selectedCount === 0 ? 0.5 : 1 }}>
            Import {selectedCount} item(s)
          </button>
        </div>
      )}
    </div>
  );
}
