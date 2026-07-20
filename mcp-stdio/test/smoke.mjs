import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  validateX402AssessmentInput,
  X402AssessmentValidationError,
} from "../lib/x402-assessment.mjs";

const callerObservedChallenge = Buffer.from(JSON.stringify({
  x402Version: 2,
  resource: { url: "https://merchant.example/paid" },
  accepts: [{
    scheme: "exact",
    network: "eip155:8453",
    amount: "10000",
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    payTo: "0x1111111111111111111111111111111111111111",
    maxTimeoutSeconds: 300,
  }],
}), "utf8").toString("base64url");

const validatedAssessment = validateX402AssessmentInput({
  subject: "agent://npm-package-smoke",
  target_url: "https://merchant.example/paid",
  method: "POST",
  payment_required: callerObservedChallenge,
  policy: {
    max_price_usdc: "0.02",
    allowed_payees: ["0x1111111111111111111111111111111111111111"],
  },
});
assert.equal(validatedAssessment.method, "POST");
assert.equal(validatedAssessment.payment_required, callerObservedChallenge);
assert.throws(
  () => validateX402AssessmentInput({
    ...validatedAssessment,
    payment_required: "A".repeat(16_385),
  }),
  X402AssessmentValidationError,
);

const packageDirectory = fileURLToPath(new URL("../", import.meta.url));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["bin/intentfence-mcp.mjs"],
  cwd: packageDirectory,
  stderr: "pipe",
});

const client = new Client(
  { name: "intentfence-package-smoke", version: "0.10.0" },
  { capabilities: {} },
);

try {
  await client.connect(transport);

  const listed = await client.listTools();
  assert.equal(listed.tools.length, 5);
  assert.equal(listed.tools.some((tool) => tool.name === "intentfence_us_cpi"), true);
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
      subject: "agent://npm-package-smoke",
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

  console.log("IntentFence npm package smoke passed: initialize, tools/list, caller-observed quote schema, and tools/call.");
} finally {
  await client.close();
}
