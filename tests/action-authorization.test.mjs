import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";

globalThis.crypto ??= webcrypto;

const {
  ActionAuthorizationValidationError,
  digestAgentAction,
  evaluateActionAuthorization,
  validateActionAuthorizationInput,
} = await import("../lib/action-authorization.ts");

function validInput() {
  return {
    subject: "agent:buyer-07",
    action: {
      type: "purchase",
      resource: "merchant://orders/42",
      protocol: "mcp",
      method: "POST",
      payload_sha256: "a".repeat(64),
    },
    context: { quoted_cost: 79, currency: "usd", data_retention_hours: 24 },
    policy: {
      allowed_action_types: ["purchase"],
      allowed_resources: ["merchant://orders/*"],
      max_cost: { amount: 100, currency: "USD" },
      max_data_retention_hours: 48,
    },
  };
}

test("authorizes an exact allowlisted action within cost and retention ceilings", async () => {
  const input = validateActionAuthorizationInput(validInput());
  const decision = await evaluateActionAuthorization(input, new Date("2026-07-22T12:00:00.000Z"));
  assert.equal(decision.status, "safe_to_proceed");
  assert.equal(decision.enforcement.executed, false);
  assert.equal(decision.expires_at, "2026-07-22T12:05:00.000Z");
  assert.equal(decision.action_digest, await digestAgentAction(input.action));
});

test("denies a changed resource and an over-ceiling cost", async () => {
  const value = validInput();
  value.action.resource = "merchant://admin/refunds/42";
  value.context.quoted_cost = 101;
  const decision = await evaluateActionAuthorization(validateActionAuthorizationInput(value));
  assert.equal(decision.status, "denied");
  assert.equal(decision.checks.find((check) => check.name === "resource")?.status, "deny");
  assert.equal(decision.checks.find((check) => check.name === "cost")?.status, "deny");
});

test("requires approval bound to the exact action digest", async () => {
  const value = validInput();
  value.policy.require_human_approval_for = ["purchase"];
  const input = validateActionAuthorizationInput(value);
  const review = await evaluateActionAuthorization(input, new Date("2026-07-22T12:00:00.000Z"));
  assert.equal(review.status, "needs_review");

  const actionDigest = await digestAgentAction(input.action);
  const approved = validateActionAuthorizationInput({
    ...value,
    approval: {
      approved_by: "human:owner",
      approved_at: "2026-07-22T11:59:00.000Z",
      expires_at: "2026-07-22T12:10:00.000Z",
      action_digest: actionDigest,
      proof_id: "approval-42",
    },
  });
  assert.equal((await evaluateActionAuthorization(approved, new Date("2026-07-22T12:00:00.000Z"))).status, "safe_to_proceed");
  approved.approval.action_digest = "b".repeat(64);
  assert.equal((await evaluateActionAuthorization(approved, new Date("2026-07-22T12:00:00.000Z"))).status, "denied");
});

test("rejects unknown fields and invalid payload digests", () => {
  assert.throws(() => validateActionAuthorizationInput({ ...validInput(), secret: "do-not-send" }), ActionAuthorizationValidationError);
  const invalid = validInput();
  invalid.action.payload_sha256 = "not-a-hash";
  assert.throws(() => validateActionAuthorizationInput(invalid), /SHA-256/u);
});

test("action digest changes when any bound action field changes", async () => {
  const first = validateActionAuthorizationInput(validInput()).action;
  const second = { ...first, resource: "merchant://orders/43" };
  assert.notEqual(await digestAgentAction(first), await digestAgentAction(second));
});
