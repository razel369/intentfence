import assert from "node:assert/strict";
import test from "node:test";

import {
  AgentCheckoutValidationError,
  buildAgentCheckout,
  listAgentCheckoutProducts,
} from "../lib/agent-checkout.ts";
import {
  classifyRequestTraffic,
  paymentChallengeEventName,
} from "../lib/request-traffic.ts";

test("lists every paid outcome with a machine checkout", () => {
  const products = listAgentCheckoutProducts();

  assert.deepEqual(
    products.map((product) => product.id),
    [
      "us-cpi",
      "wallet-risk",
      "x402-readiness",
      "x402-assessment",
      "verified-preflight",
      "policy-pack",
    ],
  );
  assert.deepEqual(
    products.map((product) => product.amount_atomic),
    ["1000", "2000", "2000", "5000", "5000", "1000000"],
  );
});

test("builds a validated, capped, cross-shell wallet-risk checkout", () => {
  const checkout = buildAgentCheckout({
    product: "wallet-risk",
    input: { address: "0x1111111111111111111111111111111111111111" },
  });

  assert.equal(checkout.example_only, false);
  assert.equal(checkout.product.amount_atomic, "2000");
  assert.match(checkout.request.url, /\/api\/wallet-risk\?address=0x1111/u);
  assert.deepEqual(checkout.request.agentic_wallet.argv.slice(0, 5), [
    "npx",
    "awal@2.12.1",
    "x402",
    "pay",
    checkout.request.url,
  ]);
  assert.match(checkout.request.agentic_wallet.shell.posix, /--max-amount 2000/u);
  assert.match(checkout.request.agentic_wallet.shell.powershell, /^npx\.cmd /u);
  assert.equal(checkout.mcp.tool, "intentfence_wallet_risk");
  assert.equal(checkout.payment.pay_to, "0x833ca7dcdb6a681ddc0c15982ef0d609bceb3a5e");
});

test("marks omitted input as example-only and rejects invalid product input", () => {
  const example = buildAgentCheckout({ product: "us-cpi" });
  assert.equal(example.example_only, true);

  assert.throws(
    () => buildAgentCheckout({ product: "wallet-risk", input: { address: "bad" } }),
    AgentCheckoutValidationError,
  );
});

test("separates known monitors and crawlers from buyer challenges", () => {
  const sentinel = new Request("https://example.com", {
    headers: {
      "User-Agent":
        "SentinelOracle/0.1 (+https://glimind.com/opt-out; liveness-only, never invokes tools)",
    },
  });
  const observer = new Request("https://example.com", {
    headers: { "User-Agent": "x402-observer/1.0" },
  });
  const browser = new Request("https://example.com", {
    headers: {
      "User-Agent":
        "Mozilla/5.0 AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
    },
  });
  const agent = new Request("https://example.com", {
    headers: { "User-Agent": "undici" },
  });

  assert.equal(classifyRequestTraffic(sentinel).kind, "monitor");
  assert.equal(classifyRequestTraffic(browser).kind, "browser");
  assert.equal(classifyRequestTraffic(agent).kind, "agent");
  assert.equal(paymentChallengeEventName(sentinel), "payment_probe");
  assert.equal(paymentChallengeEventName(observer), "payment_probe");
  assert.equal(paymentChallengeEventName(browser), "payment_required");
  assert.equal(paymentChallengeEventName(agent), "payment_required");
});
