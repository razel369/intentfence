import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";

globalThis.crypto ??= webcrypto;

const {
  checkX402EndpointReadiness,
  isPublicIpAddress,
  validateX402ReadinessInput,
  X402ReadinessValidationError,
} = await import("../lib/x402-readiness.ts");

const targetUrl = "https://merchant.vendor.com/api/paid?asset=btc";
const payee = "0x1111111111111111111111111111111111111111";

function encodedChallenge() {
  return Buffer.from(JSON.stringify({
    x402Version: 2,
    resource: {
      url: targetUrl,
      description: "Paid resource",
      mimeType: "application/json",
    },
    accepts: [{
      scheme: "exact",
      network: "eip155:8453",
      amount: "10000",
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      payTo: payee,
      maxTimeoutSeconds: 300,
      extra: { name: "USD Coin", version: "2" },
    }],
  }), "utf8").toString("base64");
}

function input(overrides = {}) {
  return validateX402ReadinessInput({
    subject: "agent:test-buyer",
    target_url: targetUrl,
    policy: { max_price_usdc: "0.02" },
    ...overrides,
  });
}

const publicDns = async () => ["104.18.2.10", "2606:4700::6812:20a"];

test("accepts a URL-first policy and rejects fetch-dangerous input", () => {
  const validated = input();
  assert.equal(validated.method, "GET");
  assert.equal(validated.policy.max_price_usdc, "0.02");

  for (const target_url of [
    "http://merchant.vendor.com/paid",
    "https://localhost/paid",
    "https://127.0.0.1/paid",
    "https://user:secret@merchant.vendor.com/paid",
    "https://merchant.vendor.com:8443/paid",
  ]) {
    assert.throws(() => input({ target_url }), X402ReadinessValidationError);
  }
  assert.throws(
    () => input({ method: "GET", body: { hello: "world" } }),
    X402ReadinessValidationError,
  );
  assert.throws(
    () => input({ method: "POST", body: { data: "x".repeat(5_000) } }),
    X402ReadinessValidationError,
  );
});

test("recognizes public addresses and blocks private, reserved, mapped, and documentation ranges", () => {
  for (const address of ["104.18.2.10", "8.8.8.8", "2606:4700::6812:20a", "2001:4860:4860::8888"]) {
    assert.equal(isPublicIpAddress(address), true, address);
  }
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "192.168.1.1",
    "100.64.0.1",
    "198.51.100.8",
    "::1",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
    "::ffff:127.0.0.1",
  ]) {
    assert.equal(isPublicIpAddress(address), false, address);
  }
});

test("performs one credential-free, no-redirect request and assesses a live challenge", async () => {
  let observedInit;
  const result = await checkX402EndpointReadiness(input(), {
    resolveHostname: publicDns,
    fetchTarget: async (url, init) => {
      assert.equal(url, targetUrl);
      observedInit = init;
      return new Response(null, {
        status: 402,
        headers: { "PAYMENT-REQUIRED": encodedChallenge() },
      });
    },
  });

  assert.equal(result.status, "ready_with_review");
  assert.equal(result.observed.http_status, 402);
  assert.equal(result.assessment?.status, "needs_review");
  assert.equal(result.assessment?.checks.find((item) => item.name === "payee")?.status, "review");
  assert.equal(observedInit.redirect, "manual");
  assert.equal(observedInit.headers.Authorization, undefined);
  assert.equal(observedInit.headers["PAYMENT-SIGNATURE"], undefined);
  assert.equal(observedInit.body, undefined);
});

test("returns ready when the live quote payee is explicitly allowed", async () => {
  const result = await checkX402EndpointReadiness(
    input({ policy: { max_price_usdc: "0.02", allowed_payees: [payee] } }),
    {
      resolveHostname: publicDns,
      fetchTarget: async () => new Response(null, {
        status: 402,
        headers: { "PAYMENT-REQUIRED": encodedChallenge() },
      }),
    },
  );
  assert.equal(result.status, "ready");
  assert.equal(result.assessment?.status, "safe_to_proceed");
});

test("does not contact DNS-private targets and does not follow redirects", async () => {
  let targetCalls = 0;
  const privateResult = await checkX402EndpointReadiness(input(), {
    resolveHostname: async () => ["169.254.169.254"],
    fetchTarget: async () => {
      targetCalls += 1;
      return new Response(null, { status: 402 });
    },
  });
  assert.equal(privateResult.status, "not_ready");
  assert.equal(targetCalls, 0);

  const redirectResult = await checkX402EndpointReadiness(input(), {
    resolveHostname: publicDns,
    fetchTarget: async (_url, init) => {
      assert.equal(init.redirect, "manual");
      return new Response(null, { status: 302, headers: { Location: "https://elsewhere.example/" } });
    },
  });
  assert.equal(redirectResult.status, "not_ready");
  assert.equal(redirectResult.observed.redirect_blocked, true);
});

test("returns useful not_ready evidence for a non-x402 response or malformed challenge", async () => {
  const noChallenge = await checkX402EndpointReadiness(input(), {
    resolveHostname: publicDns,
    fetchTarget: async () => new Response(null, { status: 200 }),
  });
  assert.equal(noChallenge.status, "not_ready");
  assert.equal(noChallenge.assessment, null);

  const malformed = await checkX402EndpointReadiness(input(), {
    resolveHostname: publicDns,
    fetchTarget: async () => new Response(null, {
      status: 402,
      headers: { "PAYMENT-REQUIRED": "not-valid-base64!" },
    }),
  });
  assert.equal(malformed.status, "not_ready");
  assert.equal(malformed.observed.payment_required_present, true);
  assert.equal(malformed.checks.find((item) => item.name === "x402_assessment")?.status, "deny");
});
