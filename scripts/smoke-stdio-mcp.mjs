import assert from "node:assert/strict";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const dockerMode = process.argv.includes("--docker");
const transport = new StdioClientTransport({
  command: dockerMode ? "docker" : process.execPath,
  args: dockerMode
    ? ["run", "--rm", "-i", "intentfence-mcp:glama-check"]
    : ["--experimental-strip-types", "scripts/glama-mcp-server.mjs"],
  cwd: dockerMode ? undefined : process.cwd(),
  stderr: "pipe",
});

const client = new Client(
  { name: "intentfence-stdio-smoke", version: "0.5.0" },
  { capabilities: {} },
);

try {
  await client.connect(transport);

  const listed = await client.listTools();
  assert.equal(listed.tools.length, 1);
  assert.equal(listed.tools[0].name, "intentfence_preflight");
  assert.deepEqual(listed.tools[0].inputSchema.required, ["subject", "action"]);

  const result = await client.callTool({
    name: "intentfence_preflight",
    arguments: {
      subject: "agent://glama-smoke",
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
  console.log(
    `IntentFence ${dockerMode ? "Docker" : "stdio"} MCP smoke passed: initialize, tools/list, and tools/call.`,
  );
} finally {
  await client.close();
}
