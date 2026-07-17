import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";

globalThis.crypto ??= webcrypto;

const {
  X402PaymentReservationInputError,
  x402PaymentAuthorizationFingerprint,
} = await import("../lib/x402-reservation.ts");

function header({
  from = "0xaBcDEFabcdefABcdefabCDefABcDEfAbCdefABCD",
  nonce = `0x${"ab".repeat(32)}`,
  validBefore = String(Math.floor(Date.now() / 1000) + 300),
} = {}) {
  return Buffer.from(JSON.stringify({
    x402Version: 2,
    accepted: {
      scheme: "exact",
      network: "eip155:8453",
      amount: "5000",
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      payTo: "0x833ca7dcdb6a681ddc0c15982ef0d609bceb3a5e",
      maxTimeoutSeconds: 300,
      extra: { name: "USD Coin", version: "2" },
    },
    payload: {
      signature: `0x${"11".repeat(65)}`,
      authorization: {
        from,
        to: "0x833ca7dcdb6a681ddc0c15982ef0d609bceb3a5e",
        value: "5000",
        validAfter: "0",
        validBefore,
        nonce,
      },
    },
  }), "utf8").toString("base64");
}

test("fingerprints an EIP-3009 authorization by normalized payer and nonce", async () => {
  const first = await x402PaymentAuthorizationFingerprint(header());
  const second = await x402PaymentAuthorizationFingerprint(header({
    from: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    nonce: `0x${"AB".repeat(32)}`,
  }));
  assert.equal(first.authorizationHash, second.authorizationHash);
  assert.ok(first.expiresAt.getTime() > Date.now());
});

test("uses a different reservation for a different authorization nonce", async () => {
  const first = await x402PaymentAuthorizationFingerprint(header());
  const second = await x402PaymentAuthorizationFingerprint(header({
    nonce: `0x${"cd".repeat(32)}`,
  }));
  assert.notEqual(first.authorizationHash, second.authorizationHash);
});

test("rejects payment payloads without a bounded EIP-3009 authorization", async () => {
  const malformed = Buffer.from(JSON.stringify({
    x402Version: 2,
    payload: { permit2Authorization: { nonce: "1" } },
  })).toString("base64");
  await assert.rejects(
    x402PaymentAuthorizationFingerprint(malformed),
    X402PaymentReservationInputError,
  );
});
