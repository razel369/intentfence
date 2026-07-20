import assert from "node:assert/strict";
import test from "node:test";

const {
  decideTargetedDemandAction,
  INTENTFENCE_PAYANAGENT_ID,
  TARGET_REQUEST_ID,
  TARGET_REQUEST_TITLE,
} = await import("../scripts/payanagent-targeted-demand-policy.mjs");

const request = {
  _id: TARGET_REQUEST_ID,
  title: TARGET_REQUEST_TITLE,
  buyerId: "buyer-agent",
  budgetMaxCents: 1,
  status: "open",
};

test("submits at most one bid to the exact matching open request", () => {
  assert.deepEqual(
    decideTargetedDemandAction({ request, bids: [], agentId: INTENTFENCE_PAYANAGENT_ID }),
    { action: "bid" },
  );
  assert.deepEqual(
    decideTargetedDemandAction({
      request,
      bids: [{ _id: "bid-1", bidderId: INTENTFENCE_PAYANAGENT_ID }],
      agentId: INTENTFENCE_PAYANAGENT_ID,
    }),
    { action: "noop", reason: "bid-already-exists", bidId: "bid-1" },
  );
});

test("fulfills only after the exact request assigns IntentFence", () => {
  assert.deepEqual(
    decideTargetedDemandAction({
      request: { ...request, status: "accepted", providerId: INTENTFENCE_PAYANAGENT_ID },
      bids: [],
      agentId: INTENTFENCE_PAYANAGENT_ID,
    }),
    { action: "fulfill" },
  );
  assert.match(
    decideTargetedDemandAction({
      request: { ...request, status: "accepted", providerId: "another-agent" },
      bids: [],
      agentId: INTENTFENCE_PAYANAGENT_ID,
    }).reason,
    /not-assigned/u,
  );
});

test("fails closed if the request identity or title changes", () => {
  assert.equal(
    decideTargetedDemandAction({
      request: { ...request, _id: "different" },
      bids: [],
      agentId: INTENTFENCE_PAYANAGENT_ID,
    }).action,
    "noop",
  );
  assert.equal(
    decideTargetedDemandAction({
      request: { ...request, title: "changed" },
      bids: [],
      agentId: INTENTFENCE_PAYANAGENT_ID,
    }).action,
    "noop",
  );
});
