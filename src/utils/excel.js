import * as XLSX from "xlsx";
import { round2 } from "./format.js";
import { todayISO } from "./po.js";

/* ---------- Excel downloads ----------
   A sheet is described as a list of columns, each [header, value of a row, column width]. Figures go
   in as numbers so they can be summed and filtered in Excel; dates as they print on the PO (18-Aug-26). */

const has = (v) => v !== null && v !== undefined && v !== "";
export const money = (v) => (has(v) ? round2(v) : "");
export const count = (v) => (has(v) ? Math.round(Number(v) * 1000) / 1000 : "");

/* One worksheet: a header row, a row per record, column widths, and a filter on the header row. */
export function sheetOf(cols, rows, autofilter = true) {
  const ws = XLSX.utils.aoa_to_sheet([cols.map((c) => c[0]), ...rows.map((r) => cols.map((c) => c[1](r)))]);
  ws["!cols"] = cols.map((c) => ({ wch: c[2] }));
  if (autofilter && rows.length) ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: cols.length - 1 } }) };
  return ws;
}

/* Build the workbook and hand it to the browser as a download named "<name> - <scope> - <today>.xlsx".
   `sheets` is [{ name, cols, rows, autofilter }]. */
export function downloadWorkbook(name, scope, sheets) {
  const wb = XLSX.utils.book_new();
  sheets.forEach((s) => XLSX.utils.book_append_sheet(wb, sheetOf(s.cols, s.rows, s.autofilter !== false), s.name));
  XLSX.writeFile(wb, `${name} - ${String(scope).replace(/[\\/:*?"<>|]/g, "-")} - ${todayISO()}.xlsx`);
}
