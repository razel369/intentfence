import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTO_PAYMENT_POLICY,
  AutoPaymentConfigurationError,
  createIntentFenceAutoPaymentFetch,
  parseUsdcAtomic,
  readAutoPaymentConfiguration,
} from "../lib/auto-payment.mjs";

const TEST_PRIVATE_KEY = `0x${"1".padStart(64, "0")}`;
const RESOURCE_URL =
  "https://agentpass-protocol.rmalka06.chatgpt.site/api/us-cpi";

function configuration(overrides = {}) {
  return {
    INTENTFENCE_EVM_PRIVATE_KEY: TEST_PRIVATE_KEY,
    INTENTFENCE_MAX_AUTO_PAYMENT_USDC: "0.005",
    INTENTFENCE_AUTO_PAYMENT_BUDGET_USDC: "0.005",
    ...overrides,
  };
}

function challenge(overrides = {}) {
  return {
    x402Version: 2,
    error: "Payment required",
    resource: {
      url: RESOURCE_URL,
      description: "Test resource",
      mimeType: "application/json",
    },
    accepts: [{
      scheme: AUTO_PAYMENT_POLICY.scheme,
      network: AUTO_PAYMENT_POLICY.network,
      amount: "1000",
      asset: AUTO_PAYMENT_POLICY.asset,
      payTo: AUTO_PAYMENT_POLICY.payee,
      maxTimeoutSeconds: 300,
      extra: { name: "USD Coin", version: "2" },
      ...overrides,
    }],
  };
}

function encoded(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

test("automatic payment is disabled unless all three opt-in values are supplied", () => {
  assert.equal(readAutoPaymentConfiguration({}), null);
  assert.throws(
    () => readAutoPaymentConfiguration({ INTENTFENCE_EVM_PRIVATE_KEY: TEST_PRIVATE_KEY }),
    AutoPaymentConfigurationError,
  );
  assert.throws(
    () => readAutoPaymentConfiguration(configuration({
      INTENTFENCE_MAX_AUTO_PAYMENT_USDC: "0.006",
    })),
    /cannot exceed/u,
  );
  assert.equal(parseUsdcAtomic("0.005", "limit"), 5_000n);
});

test("allowed IntentFence challenge is signed and retried without exposing the key", async () => {
  const requests = [];
  const baseFetch = async (request) => {
    requests.push(request);
    if (requests.length === 1) {
      return new Response(JSON.stringify({ error: "Payment required" }), {
        status: 402,
        headers: { "PAYMENT-REQUIRED": encoded(challenge()) },
      });
    }
    assert.ok(request.headers.get("PAYMENT-SIGNATURE"));
    assert.equal(request.headers.get("PAYMENT-SIGNATURE").includes(TEST_PRIVATE_KEY), false);
    return Response.json({ ok: true });
  };
  const autoPayment = createIntentFenceAutoPaymentFetch({
    env: configuration(),
    baseFetch,
  });

  const response = await autoPayment.fetch(RESOURCE_URL);
  assert.equal(response.status, 200);
  assert.equal(requests.length, 2);
  assert.deepEqual(autoPayment.budget(), {
    reservedAtomic: 1_000n,
    remainingAtomic: 4_000n,
    totalAtomic: 5_000n,
    perPaymentAtomic: 5_000n,
  });
});

test("foreign payee, wrong asset, wrong network, and excess price are never signed", async () => {
  const denied = [
    { payTo: "0x0000000000000000000000000000000000000001" },
    { asset: "0x0000000000000000000000000000000000000001" },
    { network: "eip155:1" },
    { amount: "5001" },
  ];

  for (const override of denied) {
    let calls = 0;
    const autoPayment = createIntentFenceAutoPaymentFetch({
      env: configuration(),
      baseFetch: async () => {
        calls += 1;
        return new Response(null, {
          status: 402,
          headers: { "PAYMENT-REQUIRED": encoded(challenge(override)) },
        });
      },
    });
    await assert.rejects(() => autoPayment.fetch(RESOURCE_URL));
    assert.equal(calls, 1);
    assert.equal(autoPayment.budget().reservedAtomic, 0n);
  }
});

test("process-wide budget is reserved before signing and cannot be reused", async () => {
  let calls = 0;
  const autoPayment = createIntentFenceAutoPaymentFetch({
    env: configuration({
      INTENTFENCE_MAX_AUTO_PAYMENT_USDC: "0.001",
      INTENTFENCE_AUTO_PAYMENT_BUDGET_USDC: "0.001",
    }),
    baseFetch: async (request) => {
      calls += 1;
      if (request.headers.get("PAYMENT-SIGNATURE")) return Response.json({ ok: true });
      return new Response(null, {
        status: 402,
        headers: { "PAYMENT-REQUIRED": encoded(challenge()) },
      });
    },
  });

  assert.equal((await autoPayment.fetch(RESOURCE_URL)).status, 200);
  await assert.rejects(
    () => autoPayment.fetch(RESOURCE_URL),
    /process budget exhausted/u,
  );
  assert.equal(calls, 3);
  assert.equal(autoPayment.budget().remainingAtomic, 0n);
});

test("concurrent calls cannot race past the process-wide budget", async () => {
  let signedRequests = 0;
  const autoPayment = createIntentFenceAutoPaymentFetch({
    env: configuration({
      INTENTFENCE_MAX_AUTO_PAYMENT_USDC: "0.001",
      INTENTFENCE_AUTO_PAYMENT_BUDGET_USDC: "0.001",
    }),
    baseFetch: async (request) => {
      if (request.headers.get("PAYMENT-SIGNATURE")) {
        signedRequests += 1;
        return Response.json({ ok: true });
      }
      return new Response(null, {
        status: 402,
        headers: { "PAYMENT-REQUIRED": encoded(challenge()) },
      });
    },
  });

  const results = await Promise.allSettled([
    autoPayment.fetch(RESOURCE_URL),
    autoPayment.fetch(RESOURCE_URL),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(signedRequests, 1);
  assert.equal(autoPayment.budget().reservedAtomic, 1_000n);
});
