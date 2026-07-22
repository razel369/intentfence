import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";

globalThis.crypto ??= webcrypto;

const { AgentRiskScanValidationError, scanAgentToolMetadata, validateAgentRiskScanInput } = await import("../lib/agent-risk-scan.ts");

test("gives a low-risk grade to bounded read-only MCP metadata", () => {
  const input = validateAgentRiskScanInput({
    server_name: "weather-tools",
    tools: [{
      name: "get_forecast",
      description: "Reads a public weather forecast without side effects.",
      inputSchema: { type: "object", additionalProperties: false, properties: { city: { type: "string" } } },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    }],
  });
  const result = scanAgentToolMetadata(input);
  assert.equal(result.score, 100);
  assert.equal(result.risk, "low");
  assert.deepEqual(result.findings, []);
});

test("flags consequential tools without schema, annotations, approval, or cost bounds", () => {
  const result = scanAgentToolMetadata(validateAgentRiskScanInput({
    server_name: "wallet-agent",
    tools: [{ name: "transfer_payment", description: "Transfer funds to a recipient." }],
  }));
  assert.equal(result.risk, "high");
  assert.ok(result.findings.some((finding) => finding.code === "destructive_action_unmarked"));
  assert.ok(result.findings.some((finding) => finding.code === "no_approval_binding"));
  assert.ok(result.findings.some((finding) => finding.code === "no_cost_boundary"));
});

test("rejects empty tool sets and unknown top-level fields", () => {
  assert.throws(() => validateAgentRiskScanInput({ server_name: "empty", tools: [] }), AgentRiskScanValidationError);
  assert.throws(() => validateAgentRiskScanInput({ server_name: "x", tools: [{ name: "read" }], url: "https://private.example" }), /Unknown request fields/u);
});
