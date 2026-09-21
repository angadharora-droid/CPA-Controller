/* True when every word typed appears somewhere in the given fields (case-insensitive), so
   "crockery plates" finds a Dinner plates line under the Crockery head. A blank query matches all. */
export function matchesQuery(query, ...fields) {
  const words = String(query || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fields.filter((f) => f !== null && f !== undefined).join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
}
