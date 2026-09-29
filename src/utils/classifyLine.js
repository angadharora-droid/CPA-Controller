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

  // only quantity and rate decide the lane
  if (variancePct > tolerancePct) { lane = "exception"; reasons.push(`Rate variance ${variancePct.toFixed(2)}% exceeds the ${tolerancePct}% good-to-approve threshold`); }
  if (requestedQty > remainingQty) {
    lane = "exception";
    const unit = item.unit || "Nos";
    const used = [(item.committedQty || 0) > 0 && `${fmtNum(item.committedQty)} already approved`, pendingQty > 0 && `${fmtNum(pendingQty)} awaiting approval on other requisitions`].filter(Boolean).join(", ");
    reasons.push(`Quantity is above the approved quantity — asked for ${fmtNum(requestedQty)} ${unit} but only ${fmtNum(Math.max(0, remainingQty))} of the approved ${fmtNum(item.qty || 0)} ${unit} is left${used ? ` (${used})` : ""}: over by ${fmtNum(requestedQty - Math.max(0, remainingQty))} ${unit}`);
  }
  // brand and Model/Specs are noted for the VP to read, but they do not make a line an exception
  if (brandChanged) reasons.push(`Brand differs from approved brand ("${approvedBrand}")`);
  if (specChanged) reasons.push("Model/Specs differ from the approved submission");
  if (specBlank) reasons.push("Model/Specs left blank");
  if (reasons.length === 0) reasons.push("Matches approved brand, specs, rate and quantity");

  const needsSecondApproval = variancePct > secondApprovalPct;
  return { lane, reasons, variancePct, needsSecondApproval, remainingQty };
}

// Lane of a line that has already been raised. Lines raised while brand and Model/Specs still counted
// may carry "exception" for those alone; only an unlisted item, a quantity reason or a rate reason keeps them there.
export function raisedLane(line) {
  if (line.lane !== "exception") return "good";
  if (!line.itemId) return "exception";
  return (line.reasons || []).some((r) => /^(Quantity|Rate variance)/.test(r)) ? "exception" : "good";
}
