import assert from "node:assert/strict";
import test from "node:test";

import {
  assessWalletRisk,
  validateWalletRiskInput,
  WalletRiskUpstreamError,
  WalletRiskValidationError,
} from "../lib/wallet-risk.ts";

const TEST_ADDRESS = "0x1111111111111111111111111111111111111111";

function mockFetch({ flags = {}, nonce = "0x1", code = "0x", usdc = "0x7530" } = {}) {
  return async (url) => {
    if (
      String(url).startsWith("https://base-rpc.publicnode.com") ||
      String(url).startsWith("https://mainnet.base.org")
    ) {
      return Response.json([
        { jsonrpc: "2.0", id: 1, result: "0x100" },
        { jsonrpc: "2.0", id: 2, result: nonce },
        { jsonrpc: "2.0", id: 3, result: "0x0" },
        { jsonrpc: "2.0", id: 4, result: code },
        { jsonrpc: "2.0", id: 5, result: usdc },
        { jsonrpc: "2.0", id: 6, result: "0x2105" },
      ]);
    }
    if (String(url).startsWith("https://api.gopluslabs.io/")) {
      return Response.json({
        code: 1,
        message: "ok",
        result: {
          contract_address: code === "0x" ? "0" : "1",
          data_source: "GoPlus",
          number_of_malicious_contracts_created: "0",
          sanctioned: "0",
          ...flags,
        },
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
}

test("wallet-risk input validation normalizes addresses and rejects burn addresses", () => {
  assert.deepEqual(validateWalletRiskInput({ address: TEST_ADDRESS.toUpperCase().replace("0X", "0x") }), {
    address: TEST_ADDRESS,
  });
  assert.throws(
    () => validateWalletRiskInput({ address: "0x0000000000000000000000000000000000000000" }),
    WalletRiskValidationError,
  );
});

test("wallet-risk falls back to a second chain-verified Base RPC", async () => {
  const originalFetch = globalThis.fetch;
  let primaryCalls = 0;
  let fallbackCalls = 0;
  const healthy = mockFetch();
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith("https://base-rpc.publicnode.com")) {
      primaryCalls += 1;
      return Response.json([{ jsonrpc: "2.0", id: 1, result: "0x100" }]);
    }
    if (String(url).startsWith("https://mainnet.base.org")) {
      fallbackCalls += 1;
    }
    return healthy(url, init);
  };
  try {
    const decision = await assessWalletRisk({ address: TEST_ADDRESS });
    assert.equal(decision.status, "safe_to_proceed");
    assert.equal(primaryCalls, 1);
    assert.equal(fallbackCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("wallet-risk rejects evidence from a non-Base RPC", async () => {
  const originalFetch = globalThis.fetch;
  const healthy = mockFetch();
  globalThis.fetch = async (url, init) => {
    if (
      String(url).startsWith("https://base-rpc.publicnode.com") ||
      String(url).startsWith("https://mainnet.base.org")
    ) {
      const response = await healthy(url, init);
      const payload = await response.json();
      return Response.json(
        payload.map((entry) =>
          entry.id === 6 ? { ...entry, result: "0x1" } : entry,
        ),
      );
    }
    return healthy(url, init);
  };
  try {
    await assert.rejects(
      () => assessWalletRisk({ address: TEST_ADDRESS }),
      /wrong network/u,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("wallet-risk returns a low-risk decision only when live sources are complete", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch();
  try {
    const decision = await assessWalletRisk({ address: TEST_ADDRESS });
    assert.equal(decision.status, "safe_to_proceed");
    assert.equal(decision.risk_level, "low");
    assert.equal(decision.risk_score, 5);
    assert.equal(decision.observed.usdc_balance_atomic, "30000");
    assert.deepEqual(decision.observed.malicious_flags, []);
    assert.equal(decision.receipt.assurance, "live-base-wallet-risk");
    assert.match(decision.receipt.note, /does not prove identity/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("wallet-risk denies an address with live phishing intelligence", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch({ flags: { phishing_activities: "1" } });
  try {
    const decision = await assessWalletRisk({ address: TEST_ADDRESS });
    assert.equal(decision.status, "denied");
    assert.equal(decision.risk_level, "critical");
    assert.equal(decision.risk_score, 100);
    assert.deepEqual(decision.observed.malicious_flags, ["phishing activity"]);
    assert.equal(
      decision.checks.find((check) => check.name === "malicious_intelligence")?.status,
      "deny",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("wallet-risk fails closed when an intelligence source is unavailable", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("unavailable", { status: 503 });
  try {
    await assert.rejects(
      () => assessWalletRisk({ address: TEST_ADDRESS }),
      WalletRiskUpstreamError,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
