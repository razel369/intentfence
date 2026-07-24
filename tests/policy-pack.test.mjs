import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import { parsePaymentRequired } from "@x402/core/schemas";

globalThis.crypto ??= webcrypto;

const { evaluateActionAuthorization } = await import(
  "../lib/action-authorization.ts"
);
const {
  buildPolicyPack,
  PolicyPackValidationError,
  validatePolicyPackInput,
} = await import("../lib/policy-pack.ts");
const { createPolicyPackPaymentRequired } = await import(
  "../lib/x402-payment.ts"
);

function validRequest(runtime = "cloudflare-agents") {
  return {
    project_name: "Autonomous Checkout",
    runtime,
    authorization: {
      subject: "agent:checkout-production",
      action: {
        type: "purchase",
        resource: "merchant://orders/42",
        protocol: "payment",
        method: "POST",
      },
      context: {
        currency: "USD",
        quoted_cost: 79,
        data_retention_hours: 24,
      },
      policy: {
        allowed_action_types: ["purchase"],
        allowed_resources: ["merchant://orders/*"],
        max_cost: { amount: 100, currency: "USD" },
        max_data_retention_hours: 48,
      },
    },
  };
}

function signedReceipt(decision) {
  return {
    ...decision.receipt,
    signed: true,
    assurance: "action-bound-policy-authorization",
    expires_at: decision.expires_at,
    action_digest: decision.action_digest,
    policy_digest: decision.policy_digest,
    signature: {
      format: "JWS Compact",
      alg: "ES256",
      kid: "intentfence-es256-2026-07",
      jws: "header.payload.signature",
      verify_url:
        "https://agentpass-protocol.rmalka06.chatgpt.site/api/receipts/verify",
      jwks_url:
        "https://agentpass-protocol.rmalka06.chatgpt.site/.well-known/jwks.json",
    },
    note: "Test receipt.",
  };
}

test("builds a self-service runtime guard with negative test vectors", async () => {
  const input = validatePolicyPackInput(validRequest());
  const decision = await evaluateActionAuthorization(
    input.authorization,
    new Date("2026-07-24T12:00:00.000Z"),
  );
  const pack = buildPolicyPack(input, decision, signedReceipt(decision));

  assert.equal(pack.intentfence, "policy-pack-1.0");
  assert.equal(pack.verification_tier, "production-policy-pack+x402-settled");
  assert.equal(pack.decision.status, "safe_to_proceed");
  assert.equal(pack.integration.filename, "intentfence-cloudflare-agents.ts");
  assert.match(pack.integration.source, /localActionDigest !== decision\.action_digest/u);
  assert.match(pack.integration.source, /fail closed/u);
  assert.equal(
    pack.tests.denied_action_type.action.type,
    "purchase.unapproved",
  );
  assert.equal(pack.tests.over_budget.context.quoted_cost, 101);
  assert.equal(pack.support.mode, "self-service");
});

test("supports Cloudflare Agents, AgentKit, MCP gateway, and OpenAI Agents runtimes", () => {
  for (const runtime of [
    "cloudflare-agents",
    "coinbase-agentkit",
    "mcp-gateway",
    "openai-agents-js",
  ]) {
    assert.equal(validatePolicyPackInput(validRequest(runtime)).runtime, runtime);
  }
});

test("publishes a canonical one-USDC Base x402 challenge", () => {
  const challenge = createPolicyPackPaymentRequired(
    "https://agentpass-protocol.rmalka06.chatgpt.site/api/policy-packs",
  );
  assert.equal(parsePaymentRequired(challenge).success, true);
  assert.equal(challenge.accepts[0].network, "eip155:8453");
  assert.equal(challenge.accepts[0].amount, "1000000");
  assert.equal(
    challenge.accepts[0].payTo,
    "0x833ca7dcdb6a681ddc0c15982ef0d609bceb3a5e",
  );
});

test("rejects unknown runtimes, extra fields, and invalid authorization", () => {
  assert.throws(
    () => validatePolicyPackInput(validRequest("unknown-runtime")),
    PolicyPackValidationError,
  );
  assert.throws(
    () => validatePolicyPackInput({ ...validRequest(), private_key: "secret" }),
    /unknown fields/u,
  );
  const invalid = validRequest();
  invalid.authorization.action.protocol = "invalid";
  assert.throws(() => validatePolicyPackInput(invalid), /protocol/u);
});
