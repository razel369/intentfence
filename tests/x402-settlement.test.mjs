import assert from "node:assert/strict";
import test from "node:test";

const { isSuccessfulX402Settlement } = await import("../lib/x402-settlement-status.ts");

function settlementResponse(success, status = 200) {
  return new Response("{}", {
    status,
    headers: {
      "PAYMENT-RESPONSE": Buffer.from(JSON.stringify({
        success,
        transaction: success ? `0x${"11".repeat(32)}` : "",
        network: "eip155:8453",
      })).toString("base64"),
    },
  });
}

test("keeps reservations only for an explicitly successful settlement", () => {
  assert.equal(isSuccessfulX402Settlement(settlementResponse(true)), true);
  assert.equal(isSuccessfulX402Settlement(settlementResponse(false, 402)), false);
  assert.equal(isSuccessfulX402Settlement(new Response("{}", { status: 200 })), false);
});
