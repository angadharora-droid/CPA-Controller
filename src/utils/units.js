/* ---------- units of measure ----------
   The VP's budget sheet has no unit column, so every item starts as "Nos". The Purchase Manager
   changes it where an item is really bought by length, weight or area — curtain cloth in metres. */
export const UNITS = ["Nos", "Mtr", "Kg", "Ltr", "Sq.ft", "Sq.mtr", "Set", "Pair", "Box", "Roll", "Pkt"];

/* The unit a requisition line counts in: its own, else its budget item's. */
export function unitOf(line, item) {
  return (line && line.unit) || (item && item.unit) || "Nos";
}
