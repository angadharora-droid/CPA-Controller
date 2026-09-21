import { fmtNum } from "./format.js";

/* ---------- line classification engine ---------- */
// item: working item object with .qty(approved), .rate(approved), .brand, .spec(model/specs),
//        .committedQty, .committedVal, .unit
// pendingQty: quantity of this item on other requisition lines still waiting on the VP. It is not
//        committed yet but it is spoken for, so two requisitions cannot both claim the same balance.
// Returns lane ("good" | "exception"), reasons[], variancePct, needsSecondApproval, remainingQty
export function classifyLine(item, requestedQty, requestedRate, proposedBrand, proposedModel, tolerancePct = 5, secondApprovalPct = 15, pendingQty = 0) {
  if (!item) {
    return { lane: "exception", reasons: ["Unbudgeted item — not in the frozen list"], variancePct: null, needsSecondApproval: true, remainingQty: null };
  }
  const reasons = [];
  let lane = "good";
  const approvedBrand = (item.brand || "").trim();
  const approvedModel = (item.spec || "").trim();
  const propBrand = (proposedBrand || "").trim();
  const propModel = (proposedModel || "").trim();
  const brandChanged = approvedBrand && propBrand && propBrand.toLowerCase() !== approvedBrand.toLowerCase();
  const specBlank = !propModel;
  const specChanged = approvedModel && propModel && propModel.toLowerCase() !== approvedModel.toLowerCase();
  const remainingQty = (item.qty || 0) - (item.committedQty || 0) - (pendingQty || 0);
  const variancePct = item.rate > 0 ? ((requestedRate - item.rate) / item.rate) * 100 : 0;

  if (brandChanged) { lane = "exception"; reasons.push(`Brand differs from approved brand ("${approvedBrand}")`); }
  if (specChanged) { lane = "exception"; reasons.push("Model/Specs differ from the approved submission"); }
  if (specBlank) { lane = "exception"; reasons.push("Model/Specs left blank"); }
  if (variancePct > tolerancePct) { lane = "exception"; reasons.push(`Rate variance ${variancePct.toFixed(2)}% exceeds the ${tolerancePct}% good-to-approve threshold`); }
  if (requestedQty > remainingQty) { lane = "exception"; reasons.push(`Quantity exceeds remaining approved balance by ${fmtNum(requestedQty - remainingQty)} ${item.unit || "Nos"}${pendingQty > 0 ? ` (${fmtNum(pendingQty)} already awaiting approval on other requisitions)` : ""}`); }
  if (reasons.length === 0) reasons.push("Matches approved brand, specs, rate and quantity");

  const needsSecondApproval = variancePct > secondApprovalPct;
  return { lane, reasons, variancePct, needsSecondApproval, remainingQty };
}
