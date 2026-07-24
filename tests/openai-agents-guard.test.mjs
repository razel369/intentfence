import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";

globalThis.crypto ??= webcrypto;

const { createIntentFenceToolInputGuardrail } = await import(
  "../integrations/openai-agents-js/intentfence-tool-guardrail.ts"
);

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

async function digestCanonical(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(value)));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function bindings() {
  return {
    defineToolInputGuardrail: (config) => config,
    outputFactory: {
      allow: () => ({ behavior: "allow" }),
      rejectContent: (message) => ({ behavior: "rejectContent", message }),
    },
  };
}

function options(fetch) {
  return {
    subject: "agent:procurement",
    policy: {
      allowed_action_types: ["purchase_order"],
      allowed_resources: ["erp://purchase-orders/*"],
      max_cost: { amount: 1000, currency: "USD" },
    },
    context: { currency: "USD", quoted_cost: 640 },
    resource: (_toolName, args) =>
      `erp://purchase-orders/${args.orderId}`,
    fetch,
  };
}

test("allows only after the exact tool call receipt verifies", async () => {
  let action;
  const fetch = async (url, init) => {
    if (url.endsWith("/api/actions/authorize")) {
      const body = JSON.parse(init.body);
      action = body.action;
      const actionDigest = await digestCanonical(action);
      return new Response(
        JSON.stringify({
          status: "safe_to_proceed",
          action_digest: actionDigest,
          receipt: { signature: { jws: "header.payload.signature" } },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    const actionDigest = await digestCanonical(action);
    return new Response(
      JSON.stringify({
        valid: true,
        claims: {
          decision: "safe_to_proceed",
          evidence: { action_digest: actionDigest },
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const guardrail = createIntentFenceToolInputGuardrail(
    bindings(),
    options(fetch),
  );
  const result = await guardrail.run({
    toolCall: {
      name: "purchase_order",
      arguments: JSON.stringify({ supplier: "Acme", orderId: "42" }),
    },
  });

  assert.equal(result.behavior, "allow");
  assert.equal(action.type, "purchase_order");
  assert.equal(action.resource, "erp://purchase-orders/42");
  assert.equal(action.protocol, "other");
  assert.match(action.payload_sha256, /^[a-f0-9]{64}$/u);
});

test("rejects denied decisions, malformed arguments, and outages", async () => {
  const denied = createIntentFenceToolInputGuardrail(
    bindings(),
    options(async () =>
      new Response(JSON.stringify({ status: "denied" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
  assert.equal(
    (
      await denied.run({
        toolCall: { name: "purchase_order", arguments: '{"orderId":"42"}' },
      })
    ).behavior,
    "rejectContent",
  );
  assert.equal(
    (
      await denied.run({
        toolCall: { name: "purchase_order", arguments: "not-json" },
      })
    ).behavior,
    "rejectContent",
  );

  const offline = createIntentFenceToolInputGuardrail(
    bindings(),
    options(async () => {
      throw new Error("offline");
    }),
  );
  assert.equal(
    (
      await offline.run({
        toolCall: { name: "purchase_order", arguments: '{"orderId":"42"}' },
      })
    ).behavior,
    "rejectContent",
  );
});
