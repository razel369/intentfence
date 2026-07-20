export const TARGET_REQUEST_ID = "ks7aadkccsnmnec57j1dmrxgts8aw2zw";
export const TARGET_REQUEST_TITLE =
  "Security/protocol feedback on a proof-first on-chain membership site + Fuji artifact proof";
export const INTENTFENCE_PAYANAGENT_ID = "j57d8w639k1c1d33k0hf5g7d5h8atk9g";

export function decideTargetedDemandAction({ request, bids, agentId }) {
  if (!request || request._id !== TARGET_REQUEST_ID) return { action: "noop", reason: "wrong-request" };
  if (request.title !== TARGET_REQUEST_TITLE) return { action: "noop", reason: "request-changed" };
  if (request.buyerId === agentId) return { action: "noop", reason: "self-request" };

  const existingBid = bids.find((bid) => bid.bidderId === agentId);
  if (request.status === "open") {
    if (existingBid) return { action: "noop", reason: "bid-already-exists", bidId: existingBid._id };
    if (request.budgetMaxCents < 1) return { action: "noop", reason: "budget-too-low" };
    return { action: "bid" };
  }

  if (request.status === "accepted" && request.providerId === agentId) {
    return { action: "fulfill" };
  }
  return { action: "noop", reason: `terminal-or-not-assigned:${request.status}` };
}
