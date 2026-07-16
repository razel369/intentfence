import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

globalThis.crypto ??= webcrypto;

const {
  INTENTFENCE_SIGNING_KID,
  signReceiptClaims,
  validateReceiptSigningKey,
  verifyReceipt,
} = await import("../lib/receipts.ts");

async function keyPair() {
  const keys = await webcrypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const publicJwk = await webcrypto.subtle.exportKey("jwk", keys.publicKey);
  const privateJwk = await webcrypto.subtle.exportKey("jwk", keys.privateKey);
  for (const jwk of [publicJwk, privateJwk]) {
    jwk.alg = "ES256";
    jwk.kid = INTENTFENCE_SIGNING_KID;
    jwk.use = "sig";
  }
  return { publicJwk, privateJwk: JSON.stringify(privateJwk) };
}

function claims(nowSeconds) {
  return {
    iss: "https://agentpass-protocol.rmalka06.chatgpt.site",
    aud: "intentfence-verifier",
    iat: nowSeconds,
    exp: nowSeconds + 3600,
    jti: "ap_test",
    intentfence_version: "0.5",
    assurance: "declared-input-policy",
    request_id: "00000000-0000-4000-8000-000000000000",
    decision: "safe_to_proceed",
    subject: "did:web:test-agent",
    action: { type: "test.action" },
    checks: [],
    payment: {
      protocol: "x402-v2",
      network: "eip155:8453",
      asset: "USDC",
      amount_atomic: "5000",
      pay_to: "0x833ca7dcdb6a681ddc0c15982ef0d609bceb3a5e",
    },
  };
}

test("signs and verifies an ES256 IntentFence receipt", async () => {
  const now = Date.now();
  const keys = await keyPair();
  const jws = await signReceiptClaims(claims(Math.floor(now / 1000)), keys.privateJwk);
  const result = await verifyReceipt(jws, now, keys.publicJwk);
  assert.equal(result.valid, true);
  assert.equal(result.claims.request_id, "00000000-0000-4000-8000-000000000000");
});

test("rejects a tampered receipt and an expired receipt", async () => {
  const now = Date.now();
  const keys = await keyPair();
  const jws = await signReceiptClaims(claims(Math.floor(now / 1000)), keys.privateJwk);
  const segments = jws.split(".");
  const last = segments[1].at(-1);
  segments[1] = `${segments[1].slice(0, -1)}${last === "A" ? "B" : "A"}`;
  assert.equal((await verifyReceipt(segments.join("."), now, keys.publicJwk)).valid, false);
  assert.deepEqual(
    await verifyReceipt(jws, now + 3_700_000, keys.publicJwk),
    { valid: false, reason: "expired" },
  );
});

test("published JWKS contains the production signing key", async () => {
  const jwks = JSON.parse(await readFile(new URL("../public/.well-known/jwks.json", import.meta.url), "utf8"));
  assert.equal(jwks.keys.length, 1);
  assert.equal(jwks.keys[0].kid, INTENTFENCE_SIGNING_KID);
  assert.equal(jwks.keys[0].alg, "ES256");
  assert.equal(jwks.keys[0].d, undefined);
});

test("health validation rejects a well-formed but wrong ES256 signing key", async () => {
  const keys = await keyPair();
  assert.equal(await validateReceiptSigningKey(keys.privateJwk), false);
  assert.equal(await validateReceiptSigningKey("not-json"), false);
});
