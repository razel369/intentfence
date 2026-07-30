import assert from "node:assert/strict";
import test from "node:test";

import { createMcpX402ToolMeta } from "../lib/mcp-x402.ts";

test("advertises a complete proactive MCP x402 payment requirement", () => {
  const meta = createMcpX402ToolMeta("2000");

  assert.equal(meta.x402.paymentRequired, true);
  assert.equal(meta.x402.scheme, "exact");
  assert.equal(meta.x402.network, "eip155:8453");
  assert.equal(meta.x402.amount, "2000");
  assert.equal(
    meta.x402.asset,
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  );
  assert.equal(
    meta.x402.payTo,
    "0x833ca7dcdb6a681ddc0c15982ef0d609bceb3a5e",
  );
  assert.deepEqual(meta.x402.accepts, [
    {
      scheme: "exact",
      network: "eip155:8453",
      amount: "2000",
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      payTo: "0x833ca7dcdb6a681ddc0c15982ef0d609bceb3a5e",
      maxTimeoutSeconds: 300,
      extra: { name: "USD Coin", version: "2" },
    },
  ]);
});
