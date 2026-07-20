import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server.js";
import { normalizeX402PaymentRequest } from "../lib/x402-http-compat.ts";

test("normalizes a legacy X-PAYMENT buyer request without losing its body", async () => {
  const request = new NextRequest("https://intentfence.example/api/preflight/verified", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-PAYMENT": "legacy-v2-payload",
    },
    body: JSON.stringify({ subject: "did:web:buyer" }),
  });

  const normalized = normalizeX402PaymentRequest(request);

  assert.notEqual(normalized, request);
  assert.equal(normalized.headers.get("PAYMENT-SIGNATURE"), "legacy-v2-payload");
  assert.equal(normalized.headers.get("X-PAYMENT"), "legacy-v2-payload");
  assert.deepEqual(await normalized.json(), { subject: "did:web:buyer" });
});

test("keeps PAYMENT-SIGNATURE authoritative when both header names are sent", () => {
  const request = new NextRequest("https://intentfence.example/api/us-cpi", {
    headers: {
      "PAYMENT-SIGNATURE": "canonical-v2-payload",
      "X-PAYMENT": "legacy-v2-payload",
    },
  });

  const normalized = normalizeX402PaymentRequest(request);

  assert.equal(normalized, request);
  assert.equal(normalized.headers.get("PAYMENT-SIGNATURE"), "canonical-v2-payload");
});
