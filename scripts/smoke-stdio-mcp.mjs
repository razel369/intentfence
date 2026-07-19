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
  { name: "intentfence-stdio-smoke", version: "0.8.0" },
  { capabilities: {} },
);

try {
  await client.connect(transport);

  const listed = await client.listTools();
  assert.equal(listed.tools.length, 4);
  assert.equal(listed.tools[0].name, "intentfence_preflight");
  assert.ok(listed.tools.some((tool) => tool.name === "intentfence_verified_preflight"));
  const assessmentTool = listed.tools.find(
    (tool) => tool.name === "intentfence_x402_assessment",
  );
  assert.ok(assessmentTool);
  assert.deepEqual(
    [...assessmentTool.inputSchema.required].sort(),
    ["payment_required", "policy", "subject", "target_url"],
  );
  assert.ok(assessmentTool.inputSchema.properties.method.enum.includes("POST"));
  assert.equal(assessmentTool.inputSchema.properties.payment_required.maxLength, 16_384);
  assert.deepEqual(listed.tools[0].inputSchema.required, ["subject", "action"]);

  const invalidAssessment = await client.callTool({
    name: "intentfence_x402_assessment",
    arguments: {
      subject: "agent://glama-smoke",
      target_url: "https://merchant.example/paid",
      method: "POST",
      policy: { max_price_usdc: "0.02" },
    },
  });
  assert.equal(invalidAssessment.isError, true);
  assert.match(invalidAssessment.content[0].text, /payment_required/iu);

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
    `IntentFence ${dockerMode ? "Docker" : "stdio"} MCP smoke passed: initialize, tools/list, caller-observed quote schema, and tools/call.`,
  );
} finally {
  await client.close();
}
