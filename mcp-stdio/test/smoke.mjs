import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const packageDirectory = fileURLToPath(new URL("../", import.meta.url));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["bin/intentfence-mcp.mjs"],
  cwd: packageDirectory,
  stderr: "pipe",
});

const client = new Client(
  { name: "intentfence-package-smoke", version: "0.6.1" },
  { capabilities: {} },
);

try {
  await client.connect(transport);

  const listed = await client.listTools();
  assert.equal(listed.tools.length, 2);
  assert.equal(listed.tools[0].name, "intentfence_preflight");
  assert.ok(listed.tools.some((tool) => tool.name === "intentfence_verified_preflight"));
  assert.deepEqual(listed.tools[0].inputSchema.required, ["subject", "action"]);

  const result = await client.callTool({
    name: "intentfence_preflight",
    arguments: {
      subject: "agent://npm-package-smoke",
      action: { type: "purchase", resource: "service://example" },
      constraints: {
        currency: "USDC",
        cost_ceiling: 1,
        quoted_cost: 0.05,
        data_retention_hours: 24,
        human_approval: "not_required",
      },
    },
  });

  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent?.status, "safe_to_proceed");
  assert.equal(result.structuredContent?.checks?.length, 5);

  console.log("IntentFence npm package smoke passed: initialize, tools/list, and tools/call.");
} finally {
  await client.close();
}
