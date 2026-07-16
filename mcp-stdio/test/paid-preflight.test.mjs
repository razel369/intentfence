import assert from "node:assert/strict";
import test from "node:test";

import { createPaidPreflightHandler } from "../lib/paid-preflight.mjs";

const input = {
  subject: "agent://paid-handler-test",
  action: { type: "purchase", resource: "service://example" },
};

function encoded(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

test("paid MCP handler returns x402 requirements and forwards settlement metadata", async () => {
  const originalFetch = globalThis.fetch;
  let call = 0;
  globalThis.fetch = async (_url, init) => {
    call += 1;
    if (call === 1) {
      assert.equal(init.headers["PAYMENT-SIGNATURE"], undefined);
      return new Response(JSON.stringify({ error: "payment_required" }), {
        status: 402,
        headers: {
          "PAYMENT-REQUIRED": encoded({
            x402Version: 2,
            accepts: [{ amount: "5000", network: "eip155:8453" }],
          }),
        },
      });
    }
    assert.ok(init.headers["PAYMENT-SIGNATURE"]);
    return new Response(JSON.stringify({ status: "safe_to_proceed", receipt: { signed: true } }), {
      status: 200,
      headers: { "PAYMENT-RESPONSE": encoded({ success: true, transaction: "0xtest" }) },
    });
  };

  try {
    const handler = createPaidPreflightHandler({ validateInput: (value) => value, source: "test" });
    const required = await handler(input, {});
    assert.equal(required.isError, true);
    assert.equal(required.structuredContent.accepts[0].amount, "5000");

    const settled = await handler(input, { _meta: { "x402/payment": { x402Version: 2 } } });
    assert.equal(settled.isError, undefined);
    assert.equal(settled.structuredContent.receipt.signed, true);
    assert.equal(settled._meta["x402/payment-response"].transaction, "0xtest");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
