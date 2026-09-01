import { fmtINR, fmtNum } from "./format.js";

/* ---------- auto-approval engine ---------- */
// item: working item object (with .qty=approved qty, .rate=approved rate, .val=approved value,
//        .committedQty, .committedVal, .frozen, .freezeState, .approvalStatus)
// headState: { ceiling, committed }
export function evaluatePR(item, head, requestedQty, requestedRate, tolerancePct, specChanged, brandChanged) {
  const reasons = [];
  if (!item) {
    return { decision: "escalate", reasonCode: "Unbudgeted Item", detail: "This item does not exist in the frozen item-level budget." };
  }
  if (item.freezeState === "Not Frozen" || item.freezeState === "Not Approved") {
    return { decision: "escalate", reasonCode: "Item Included but Quantity Not Frozen", detail: `Budget head "${item.head}" has not been frozen yet — this PR cannot auto-route.` };
  }
  if (item.approvalStatus === "Deferred" || item.approvalStatus === "Rejected") {
    return { decision: "escalate", reasonCode: "Previously Rejected Item Resubmitted", detail: `Item was marked "${item.approvalStatus}" during budget freeze.` };
  }
  if (item.status === "Rate Missing" || item.rate === null || item.rate === undefined) {
    return { decision: "escalate", reasonCode: "Item Included but Rate Not Frozen", detail: "No single approved rate has been frozen for this item (multiple vendor quotes on file)." };
  }
  if (item.status === "Quantity Missing" || item.qty === null || item.qty === undefined) {
    return { decision: "escalate", reasonCode: "Item Included but Quantity Not Frozen", detail: "Approved quantity for this item has not been frozen." };
  }
  if (specChanged) {
    return { decision: "escalate", reasonCode: "Specification Changed", detail: "Requested specification differs from the frozen specification." };
  }
  if (brandChanged) {
    return { decision: "escalate", reasonCode: "Brand Changed", detail: "Requested brand differs from the approved/frozen brand." };
  }

  const remainingQty = item.qty - (item.committedQty || 0);
  if (requestedQty > remainingQty) {
    return { decision: "escalate", reasonCode: "Quantity Exceeds Balance", detail: `Requested ${fmtNum(requestedQty)} ${item.unit || "Nos"} exceeds remaining approved balance of ${fmtNum(remainingQty)} ${item.unit || "Nos"}.`, variance: requestedQty - remainingQty };
  }

  const variancePct = item.rate > 0 ? ((requestedRate - item.rate) / item.rate) * 100 : 0;
  if (variancePct > tolerancePct) {
    return { decision: "escalate", reasonCode: "Rate Exceeds Approved Rate", detail: `Proposed rate ${fmtINR(requestedRate)} is ${variancePct.toFixed(2)}% above the approved rate ${fmtINR(item.rate)} (tolerance is ${tolerancePct}%).`, variancePct };
  }

  const requestedValue = requestedQty * requestedRate;
  const itemRemainingValue = (item.val || 0) - (item.committedVal || 0);
  if (requestedValue > itemRemainingValue + 0.01) {
    return { decision: "escalate", reasonCode: "Item Budget Short", detail: `PR value ${fmtINR(requestedValue)} exceeds the item's remaining budget of ${fmtINR(itemRemainingValue)}.`, shortfall: requestedValue - itemRemainingValue };
  }

  const catRemaining = head.ceiling - (head.committed || 0);
  if (requestedValue > catRemaining + 0.01) {
    return { decision: "escalate", reasonCode: "Category Budget Short", detail: `Category "${item.head}" has only ${fmtINR(catRemaining)} remaining against its ${fmtINR(head.ceiling)} ceiling; this PR needs ${fmtINR(requestedValue)}.`, shortfall: requestedValue - catRemaining };
  }

  return {
    decision: "auto",
    reasonCode: variancePct > 0 ? "Rate within tolerance, budget sufficient" : "Within frozen budget",
    detail: `Auto-approved: qty ${fmtNum(requestedQty)}/${fmtNum(remainingQty)} available, rate variance ${variancePct.toFixed(2)}% (≤ ${tolerancePct}%), item & category budget sufficient.`,
    variancePct,
    requestedValue,
  };
}
