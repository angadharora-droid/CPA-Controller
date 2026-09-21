import { useState } from "react";
import { C, inputStyle, toggleBtn, toggleActive } from "../theme.js";
import { GST_SLABS, OUR_STATE_CODE } from "../utils/po.js";
import { Field } from "./ui.jsx";

const GST_TYPES = [
  { id: "CGST_SGST", label: "CGST + SGST", hint: "billed from within Maharashtra" },
  { id: "IGST", label: "IGST", hint: "billed from another state" },
];

/* GST rate: the standard slabs, plus "Other rate…" for anything else. */
export function GstRateField({ label = "GST rate", value, onChange }) {
  const [pickedOther, setCustom] = useState(false);
  const custom = pickedOther || !GST_SLABS.includes(String(value));
  return (
    <Field label={label}>
      <div style={{ display: "flex", gap: 6 }}>
        <select
          value={custom ? "other" : String(value)}
          onChange={(e) => {
            if (e.target.value === "other") { setCustom(true); return; }
            setCustom(false); onChange(e.target.value);
          }}
          style={inputStyle}
        >
          {GST_SLABS.map((s) => <option key={s} value={s}>{s === "0" ? "No GST (0%)" : `${s}%`}</option>)}
          <option value="other">Other rate…</option>
        </select>
        {custom && <input type="number" min="0" max="100" step="0.01" value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, width: 90 }} placeholder="%" autoFocus />}
      </div>
    </Field>
  );
}

/* CGST + SGST vs IGST. `value` is the type in force; `manual` says whether the user picked it by
   hand (otherwise it follows the supplier's state code). */
export function GstTypeField({ label = "GST type", value, manual, onPick, onAuto, stateCode }) {
  return (
    <Field label={label}>
      <div style={{ display: "flex", gap: 6 }}>
        {GST_TYPES.map((g) => (
          <button key={g.id} type="button" onClick={() => onPick(g.id)} title={g.hint} style={{ ...toggleBtn, flex: 1, padding: "8px 10px", fontWeight: 600, ...(value === g.id ? toggleActive : {}) }}>{g.label}</button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: "#9AA1AC", marginTop: 4 }}>
        {manual
          ? <>Set by hand. <button type="button" onClick={onAuto} style={{ border: "none", background: "none", padding: 0, color: C.blue, fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>Use supplier state instead</button></>
          : stateCode
            ? `Auto: supplier state code ${stateCode} is ${stateCode === OUR_STATE_CODE ? "the same as ours" : `different from ours (${OUR_STATE_CODE})`}.`
            : "Auto: enter the supplier GSTIN or state code to pick this for you."}
      </div>
    </Field>
  );
}

export function TotalRow({ label, value, bold }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "2px 0", fontWeight: bold ? 700 : 400 }}>
      <span style={{ color: bold ? C.text : "#6B7280" }}>{label}</span><span>{value}</span>
    </div>
  );
}
