import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const { classifyPaymentVerificationFailure } = await import(
  "../lib/payment-funnel.ts"
);

test("maps payment failures to bounded public categories", () => {
  assert.equal(classifyPaymentVerificationFailure({ status: 400 }), "request_invalid");
  assert.equal(classifyPaymentVerificationFailure({ status: 402 }), "facilitator_rejected");
  assert.equal(classifyPaymentVerificationFailure({ status: 409 }), "authorization_conflict");
  assert.equal(classifyPaymentVerificationFailure({ status: 429 }), "rate_limited");
  assert.equal(classifyPaymentVerificationFailure({ status: 503 }), "dependency_unavailable");
  assert.equal(classifyPaymentVerificationFailure({ status: 500 }), "internal_error");
  assert.equal(classifyPaymentVerificationFailure({ status: 200 }), "settlement_unconfirmed");
});

test("publishes the complete x402 payment funnel without raw payment payloads", async () => {
  const telemetry = await readFile(new URL("../lib/telemetry.ts", import.meta.url), "utf8");
  const settlement = await readFile(
    new URL("../lib/x402-settlement.ts", import.meta.url),
    "utf8",
  );
  const metrics = await readFile(
    new URL("../app/api/metrics/route.ts", import.meta.url),
    "utf8",
  );

  for (const eventName of [
    "payment_required",
    "payment_signature_received",
    "payment_verification_succeeded",
    "payment_verification_failed",
    "payment_settled",
  ]) {
    assert.match(telemetry + settlement, new RegExp(eventName));
  }
  assert.match(metrics, /tracking_started_version: "0\.13\.0"/);
  assert.match(metrics, /failure_reasons: failureTotals/);
  assert.doesNotMatch(settlement, /metadata:\s*\{[^}]*paymentHeader/s);
  assert.doesNotMatch(settlement, /metadata:\s*\{[^}]*settlementResponse/s);
});
