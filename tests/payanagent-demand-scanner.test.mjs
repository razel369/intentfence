import assert from "node:assert/strict";
import test from "node:test";

const {
  buildFulfillmentInput,
  classifySupportedRequest,
  decideDemandAction,
  INTENTFENCE_PAYANAGENT_ID,
  TARGETED_REVIEW_REQUEST_ID,
} = await import("../scripts/payanagent-demand-scanner-policy.mjs");

const wallet = "0x833ca7dcdb6a681ddc0c15982ef0d609bceb3a5e";

function request(overrides = {}) {
  return {
    _id: "request-1",
    buyerId: "external-buyer",
    status: "open",
    budgetMaxCents: 5,
    title: "Verify an x402 endpoint",
    description: "Check x402 endpoint readiness at https://merchant.example.com/paid",
    ...overrides,
  };
}

test("classifies only explicit, unambiguous services", () => {
  assert.deepEqual(classifySupportedRequest(request()), {
    kind: "x402_readiness",
    target_url: "https://merchant.example.com/paid",
  });
  assert.deepEqual(
    classifySupportedRequest(request({
      title: "Base wallet sanctions screen",
      description: `Check Base wallet risk for ${wallet}`,
    })),
    { kind: "base_wallet_risk", address: wallet },
  );
  assert.deepEqual(
    classifySupportedRequest(request({
      title: "Latest U.S. CPI data",
      description: "Return official U.S. CPI inflation data for 2026-05.",
    })),
    { kind: "us_cpi", month: "2026-05" },
  );
  assert.equal(
    classifySupportedRequest(request({
      title: "Review my crypto site",
      description: "Give general feedback about https://one.example and https://two.example",
    })),
    null,
  );
});

test("bids once only on matching external demand and never the targeted review", () => {
  const bid = decideDemandAction({ request: request() });
  assert.equal(bid.action, "bid");
  assert.equal(bid.bid.priceCents, 1);
  assert.match(bid.bid.message, /One targeted marketplace bid only/u);

  assert.equal(
    decideDemandAction({
      request: request(),
      bids: [{ _id: "bid-1", bidderId: INTENTFENCE_PAYANAGENT_ID }],
    }).reason,
    "bid-already-exists",
  );
  assert.equal(
    decideDemandAction({ request: request({ buyerId: INTENTFENCE_PAYANAGENT_ID }) }).reason,
    "self-request",
  );
  assert.equal(
    decideDemandAction({ request: request({ _id: TARGETED_REVIEW_REQUEST_ID }) }).reason,
    "handled-by-targeted-review",
  );
  assert.equal(
    decideDemandAction({ request: request({ budgetMaxCents: 0 }) }).reason,
    "budget-too-low",
  );
});

test("fulfills only work assigned to IntentFence", () => {
  assert.equal(
    decideDemandAction({
      request: request({ status: "accepted", providerId: INTENTFENCE_PAYANAGENT_ID }),
    }).action,
    "fulfill",
  );
  assert.equal(
    decideDemandAction({
      request: request({ status: "accepted", providerId: "another-agent" }),
    }).reason,
    "assigned-to-another-provider",
  );
});

test("allowlists fulfillment fields and rejects unsafe or ambiguous input", () => {
  const readiness = buildFulfillmentInput(
    { kind: "x402_readiness", target_url: "https://merchant.example.com/paid" },
    {
      inputPayload: JSON.stringify({
        target_url: "https://merchant.example.com/checkout",
        method: "POST",
        max_price_usdc: "0.02",
        allowed_payees: [wallet, wallet, wallet],
        body: { order: 1 },
        ignored: "never-forwarded",
      }),
    },
  );
  assert.deepEqual(readiness, {
    target_url: "https://merchant.example.com/checkout",
    method: "POST",
    max_price_usdc: "0.02",
    allowed_payees: [wallet, wallet, wallet],
    body: { order: 1 },
  });
  assert.equal("ignored" in readiness, false);
  assert.throws(
    () => buildFulfillmentInput(
      { kind: "x402_readiness", target_url: "http://127.0.0.1/private" },
      {},
    ),
    /public HTTPS target_url/u,
  );
  assert.deepEqual(
    buildFulfillmentInput({ kind: "base_wallet_risk", address: wallet }, {}),
    { address: wallet },
  );
  assert.deepEqual(
    buildFulfillmentInput({ kind: "us_cpi", month: "2026-05" }, {}),
    { month: "2026-05" },
  );
});
