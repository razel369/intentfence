import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";

globalThis.crypto ??= webcrypto;

const {
  assessX402Resource,
  validateX402AssessmentInput,
  X402AssessmentValidationError,
} = await import("../lib/x402-assessment.ts");
const {
  createSignedAssessmentReceipt,
  INTENTFENCE_SIGNING_KID,
  verifyReceipt,
} = await import("../lib/receipts.ts");

const payee = "0x1111111111111111111111111111111111111111";
const targetUrl = "https://merchant.vendor.com/api/paid?asset=btc";

function challenge(overrides = {}) {
  return {
    x402Version: 2,
    resource: {
      url: targetUrl,
      description: "Paid resource",
      mimeType: "application/json",
    },
    accepts: [
      {
        scheme: "exact",
        network: "eip155:8453",
        amount: "10000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: payee,
        maxTimeoutSeconds: 300,
        extra: { name: "USD Coin", version: "2" },
      },
    ],
    ...overrides,
  };
}

function encoded(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function input(overrides = {}) {
  return validateX402AssessmentInput({
    subject: "agent:test-buyer",
    target_url: targetUrl,
    method: "GET",
    payment_required: encoded(challenge()),
    policy: {
      max_price_usdc: "0.02",
      allowed_payees: [payee],
    },
    ...overrides,
  });
}

test("rejects non-public targets and normalizes precise policy input", () => {
  for (const target_url of [
    "http://merchant.vendor.com/paid",
    "https://localhost/paid",
    "https://127.0.0.1/paid",
    "https://metadata.google.internal/computeMetadata/v1/",
    "https://user:secret@merchant.vendor.com/paid",
  ]) {
    assert.throws(() => input({ target_url }), X402AssessmentValidationError);
  }

  const validated = input({ method: "POST" });
  assert.equal(validated.target_url, targetUrl);
  assert.equal(validated.method, "POST");
  assert.equal(validated.policy.max_price_usdc, "0.02");
  assert.deepEqual(validated.policy.allowed_payees, [payee]);
});

test("assesses the exact caller-observed, resource-bound Base USDC quote", async () => {
  const validated = input();
  const decision = await assessX402Resource(validated);

  assert.equal(decision.status, "safe_to_proceed");
  assert.equal(decision.observed.challenge_source, "caller-supplied-payment-required");
  assert.equal(decision.observed.x402_version, 2);
  assert.equal(decision.target.has_query, true);
  assert.equal(decision.target.method, "GET");
  assert.match(decision.observed.payment_requirements_sha256, /^[0-9a-f]{64}$/u);
  assert.ok(decision.checks.every((item) => item.status === "pass"));
});

test("fails closed on an over-ceiling, unbound, or unapproved quote", async () => {
  const hostileChallenge = challenge({
    resource: { url: "https://merchant.vendor.com/api/other" },
    accepts: [
      {
        scheme: "exact",
        network: "eip155:8453",
        amount: "30000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x2222222222222222222222222222222222222222",
        maxTimeoutSeconds: 300,
      },
    ],
  });
  const decision = await assessX402Resource(
    input({ payment_required: encoded(hostileChallenge) }),
  );

  assert.equal(decision.status, "denied");
  assert.equal(decision.checks.find((item) => item.name === "price")?.status, "deny");
  assert.equal(decision.checks.find((item) => item.name === "payee")?.status, "deny");
  assert.equal(decision.checks.find((item) => item.name === "resource_binding")?.status, "deny");
});

test("fails closed when any advertised payment option is unsafe", async () => {
  const safeOption = challenge().accepts[0];
  const mixedChallenge = challenge({
    accepts: [
      {
        ...safeOption,
        amount: "30000",
        payTo: "0x2222222222222222222222222222222222222222",
      },
      safeOption,
    ],
  });
  const decision = await assessX402Resource(
    input({ payment_required: encoded(mixedChallenge) }),
  );

  assert.equal(decision.status, "denied");
  assert.equal(decision.checks.find((item) => item.name === "price")?.status, "deny");
  assert.equal(decision.checks.find((item) => item.name === "payee")?.status, "deny");
});

test("requires an explicit payee allowlist before returning safe_to_proceed", async () => {
  const decision = await assessX402Resource(
    input({ policy: { max_price_usdc: "0.02" } }),
  );
  assert.equal(decision.status, "needs_review");
  assert.equal(decision.checks.find((item) => item.name === "payee")?.status, "review");
});

test("denies missing canonical EIP-712 domain metadata", async () => {
  const noDomain = challenge({
    accepts: [
      {
        scheme: "exact",
        network: "eip155:8453",
        amount: "10000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: payee,
        maxTimeoutSeconds: 300,
      },
    ],
  });
  const decision = await assessX402Resource(
    input({ payment_required: encoded(noDomain) }),
  );
  assert.equal(decision.status, "denied");
  assert.equal(
    decision.checks.find((item) => item.name === "eip712_domain")?.status,
    "deny",
  );
});

test("downgrades Permit2, unknown extras, and active extensions to review", async () => {
  const extended = challenge({
    accepts: [
      {
        scheme: "exact",
        network: "eip155:8453",
        amount: "10000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: payee,
        maxTimeoutSeconds: 300,
        extra: {
          name: "USD Coin",
          version: "2",
          assetTransferMethod: "permit2",
        },
      },
    ],
    extensions: { eip2612GasSponsoring: { active: true } },
  });
  const decision = await assessX402Resource(
    input({ payment_required: encoded(extended) }),
  );
  assert.equal(decision.status, "needs_review");
  assert.equal(
    decision.checks.find((item) => item.name === "transfer_method")?.status,
    "review",
  );
  assert.equal(
    decision.checks.find((item) => item.name === "extensions")?.status,
    "review",
  );
});

test("rejects malformed or excessive payment timeouts before requesting payment", () => {
  for (const maxTimeoutSeconds of [undefined, 0, 1.5, 601]) {
    const malformed = challenge({
      accepts: [
        {
          scheme: "exact",
          network: "eip155:8453",
          amount: "10000",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: payee,
          ...(maxTimeoutSeconds === undefined ? {} : { maxTimeoutSeconds }),
        },
      ],
    });
    assert.throws(
      () => input({ payment_required: encoded(malformed) }),
      X402AssessmentValidationError,
    );
  }
});

test("signs and verifies short-lived caller-observed quote evidence", async () => {
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

  const decision = await assessX402Resource(input());
  const receipt = await createSignedAssessmentReceipt(
    decision,
    JSON.stringify(privateJwk),
    {
      network: "eip155:8453",
      asset: "USDC",
      amountAtomic: "5000",
      payTo: "0x833ca7dcdb6a681ddc0c15982ef0d609bceb3a5e",
    },
  );
  const result = await verifyReceipt(receipt.signature.jws, Date.now(), publicJwk);
  assert.equal(result.valid, true);
  assert.equal(result.claims.assurance, "caller-observed-x402-quote-assessment");
  assert.equal(
    result.claims.evidence.payment_requirements_sha256,
    decision.observed.payment_requirements_sha256,
  );
  assert.equal(result.claims.exp - result.claims.iat, 300);
});
