import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";

globalThis.crypto ??= webcrypto;

const baseUrl = (process.argv[2] ?? "http://127.0.0.1:3104").replace(/\/$/u, "");
const input = {
  subject: "did:web:smoke-agent",
  action: { type: "purchase", resource: "order-smoke" },
  constraints: {
    currency: "USD",
    cost_ceiling: 100,
    quoted_cost: 79,
    data_retention_hours: 24,
    human_approval: "not_required",
  },
};

async function json(response) {
  return await response.json();
}

const x402Manifest = await fetch(`${baseUrl}/.well-known/x402`);
assert.equal(x402Manifest.status, 200);
const x402ManifestBody = await json(x402Manifest);
assert.equal(x402ManifestBody.spec, "agent402-service-manifest/1");
assert.equal(x402ManifestBody.payment.x402.network, "eip155:8453");

const free = await fetch(`${baseUrl}/api/preflight`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(input),
});
assert.equal(free.status, 200);
const freeBody = await json(free);
assert.equal(freeBody.intentfence, "0.5");
assert.equal(freeBody.status, "safe_to_proceed");
assert.equal(freeBody.receipt.signed, false);

const unpaid = await fetch(`${baseUrl}/api/preflight/verified`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(input),
});
assert.equal(unpaid.status, 402);
const required = JSON.parse(Buffer.from(unpaid.headers.get("payment-required"), "base64").toString("utf8"));
assert.equal(required.x402Version, 2);
assert.equal(required.accepts[0].network, "eip155:8453");
assert.equal(required.accepts[0].amount, "5000");
assert.equal(required.accepts[0].payTo.toLowerCase(), "0x833ca7dcdb6a681ddc0c15982ef0d609bceb3a5e");
assert.equal(required.extensions.bazaar.info.input.method, "POST");

const mcpHeaders = {
  Accept: "application/json, text/event-stream",
  "Content-Type": "application/json",
};
const initialize = await fetch(`${baseUrl}/mcp`, {
  method: "POST",
  headers: mcpHeaders,
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "intentfence-smoke", version: "1.0.0" },
    },
  }),
});
assert.equal(initialize.status, 200);
assert.equal((await json(initialize)).result.serverInfo.version, "0.6.0");

const toolCall = await fetch(`${baseUrl}/mcp`, {
  method: "POST",
  headers: { ...mcpHeaders, "MCP-Protocol-Version": "2025-11-25" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "intentfence_preflight", arguments: input },
  }),
});
assert.equal(toolCall.status, 200);
assert.equal((await json(toolCall)).result.structuredContent.status, "safe_to_proceed");

const paidToolCall = await fetch(`${baseUrl}/mcp`, {
  method: "POST",
  headers: { ...mcpHeaders, "MCP-Protocol-Version": "2025-11-25" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "intentfence_verified_preflight", arguments: input },
  }),
});
assert.equal(paidToolCall.status, 200);
const paidToolBody = await json(paidToolCall);
assert.equal(paidToolBody.result.isError, true);
assert.equal(paidToolBody.result.structuredContent.x402Version, 2);
assert.equal(paidToolBody.result.structuredContent.accepts[0].amount, "5000");

const foreignOrigin = await fetch(`${baseUrl}/mcp`, {
  method: "POST",
  headers: { ...mcpHeaders, Origin: "https://attacker.example" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "ping" }),
});
assert.equal(foreignOrigin.status, 403);
assert.equal((await fetch(`${baseUrl}/mcp`, { headers: { Accept: "text/event-stream" } })).status, 405);

const a2a = await fetch(`${baseUrl}/a2a/message:send`, {
  method: "POST",
  headers: { "Content-Type": "application/a2a+json", "A2A-Version": "1.0" },
  body: JSON.stringify({
    message: {
      role: "ROLE_USER",
      messageId: crypto.randomUUID(),
      parts: [{ data: input }],
    },
  }),
});
assert.equal(a2a.status, 200);
assert.equal((await json(a2a)).message.role, "ROLE_AGENT");
const tasks = await fetch(`${baseUrl}/a2a/tasks`, { headers: { "A2A-Version": "1.0" } });
assert.equal(tasks.status, 200);
assert.deepEqual((await json(tasks)).tasks, []);

if (process.env.INTENTFENCE_TEST_PRIVATE_JWK_PATH) {
  const { signReceiptClaims } = await import("../lib/receipts.ts");
  const privateJwk = await readFile(process.env.INTENTFENCE_TEST_PRIVATE_JWK_PATH, "utf8");
  const now = Math.floor(Date.now() / 1000);
  const jws = await signReceiptClaims({
    iss: "https://agentpass-protocol.rmalka06.chatgpt.site",
    aud: "intentfence-verifier",
    iat: now,
    exp: now + 3600,
    jti: "ap_smoke",
    intentfence_version: "0.5",
    assurance: "declared-input-policy",
    request_id: "00000000-0000-4000-8000-000000000001",
    decision: "safe_to_proceed",
    subject: input.subject,
    action: input.action,
    checks: [],
    payment: {
      protocol: "x402-v2",
      network: "eip155:8453",
      asset: "USDC",
      amount_atomic: "5000",
      pay_to: "0x833ca7dcdb6a681ddc0c15982ef0d609bceb3a5e",
    },
  }, privateJwk);
  const verify = await fetch(`${baseUrl}/api/receipts/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jws }),
  });
  assert.equal(verify.status, 200);
  assert.equal((await json(verify)).valid, true);
}

console.log(`IntentFence protocol smoke passed against ${baseUrl}`);
