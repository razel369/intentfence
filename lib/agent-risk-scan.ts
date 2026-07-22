const MAX_TOOLS = 100;
const CONSEQUENTIAL = /(?:delete|destroy|remove|transfer|payment|purchase|refund|deploy|execute|shell|write|update|send|publish|rotate|revoke)/iu;
const FINANCIAL = /(?:payment|purchase|transfer|refund|invoice|wallet|spend|charge)/iu;
const APPROVAL_FIELD = /(?:approval|approved|confirm|consent|authorization)/iu;
const COST_FIELD = /(?:amount|cost|price|budget|ceiling|limit|max)/iu;

export type AgentRiskScanInput = {
  server_name: string;
  tools: Array<{
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
    annotations?: Record<string, unknown>;
  }>;
};

export type AgentRiskFinding = {
  severity: "high" | "medium" | "low";
  code: string;
  tool: string | null;
  detail: string;
  remediation: string;
};

export class AgentRiskScanValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentRiskScanValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, field: string, maxLength: number, required = false) {
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string" || !value.trim()) throw new AgentRiskScanValidationError(`${field} is required.`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new AgentRiskScanValidationError(`${field} must be ${maxLength} characters or fewer.`);
  return normalized;
}

export function validateAgentRiskScanInput(value: unknown): AgentRiskScanInput {
  if (!isRecord(value)) throw new AgentRiskScanValidationError("The request body must be a JSON object.");
  const unknown = Object.keys(value).filter((key) => key !== "server_name" && key !== "tools");
  if (unknown.length > 0) throw new AgentRiskScanValidationError(`Unknown request fields: ${unknown.join(", ")}.`);
  if (!Array.isArray(value.tools) || value.tools.length === 0 || value.tools.length > MAX_TOOLS) {
    throw new AgentRiskScanValidationError(`tools must contain 1 to ${MAX_TOOLS} MCP tool definitions.`);
  }
  const tools = value.tools.map((tool, index) => {
    if (!isRecord(tool)) throw new AgentRiskScanValidationError(`tools[${index}] must be an object.`);
    const name = boundedString(tool.name, `tools[${index}].name`, 120, true)!;
    const description = boundedString(tool.description, `tools[${index}].description`, 2_000);
    if (tool.inputSchema !== undefined && !isRecord(tool.inputSchema)) {
      throw new AgentRiskScanValidationError(`tools[${index}].inputSchema must be an object.`);
    }
    if (tool.annotations !== undefined && !isRecord(tool.annotations)) {
      throw new AgentRiskScanValidationError(`tools[${index}].annotations must be an object.`);
    }
    return {
      name,
      ...(description ? { description } : {}),
      ...(isRecord(tool.inputSchema) ? { inputSchema: tool.inputSchema } : {}),
      ...(isRecord(tool.annotations) ? { annotations: tool.annotations } : {}),
    };
  });
  return { server_name: boundedString(value.server_name, "server_name", 200, true)!, tools };
}

function schemaProperties(schema: Record<string, unknown> | undefined) {
  return schema && isRecord(schema.properties) ? schema.properties : {};
}

export function scanAgentToolMetadata(input: AgentRiskScanInput) {
  const findings: AgentRiskFinding[] = [];
  let consequentialTools = 0;

  for (const tool of input.tools) {
    const combined = `${tool.name} ${tool.description ?? ""}`;
    const consequential = CONSEQUENTIAL.test(combined);
    const financial = FINANCIAL.test(combined);
    if (consequential) consequentialTools += 1;
    const properties = schemaProperties(tool.inputSchema);
    const propertyNames = Object.keys(properties);
    const annotations = tool.annotations ?? {};

    if (!tool.description) {
      findings.push({ severity: "medium", code: "missing_description", tool: tool.name, detail: "The tool has no description of its effects or trust boundary.", remediation: "Describe side effects, affected resources, authorization assumptions, and failure behavior." });
    }
    if (!tool.inputSchema) {
      findings.push({ severity: "high", code: "missing_input_schema", tool: tool.name, detail: "The tool exposes no machine-readable input schema.", remediation: "Publish a bounded JSON Schema with required fields and explicit limits." });
    } else if (tool.inputSchema.additionalProperties !== false) {
      findings.push({ severity: "medium", code: "open_input_schema", tool: tool.name, detail: "The input schema does not reject unknown fields.", remediation: "Set additionalProperties to false and validate inputs at runtime." });
    }
    if (!tool.annotations) {
      findings.push({ severity: consequential ? "high" : "medium", code: "missing_annotations", tool: tool.name, detail: "MCP behavioral annotations are absent.", remediation: "Declare readOnlyHint, destructiveHint, idempotentHint, and openWorldHint accurately." });
    }
    if (consequential && annotations.destructiveHint !== true) {
      findings.push({ severity: "high", code: "destructive_action_unmarked", tool: tool.name, detail: "The tool appears consequential but is not explicitly marked destructive.", remediation: "Mark destructiveHint true and gate the call behind an action-bound policy decision." });
    }
    if (consequential && annotations.readOnlyHint === true) {
      findings.push({ severity: "high", code: "annotation_conflict", tool: tool.name, detail: "The tool appears consequential while declaring readOnlyHint true.", remediation: "Correct the annotation and test the real side effects." });
    }
    if (consequential && !propertyNames.some((name) => APPROVAL_FIELD.test(name))) {
      findings.push({ severity: "high", code: "no_approval_binding", tool: tool.name, detail: "No approval or authorization field is visible for a consequential action.", remediation: "Bind approval to the exact action digest or enforce it in a trusted gateway." });
    }
    if (financial && !propertyNames.some((name) => COST_FIELD.test(name))) {
      findings.push({ severity: "medium", code: "no_cost_boundary", tool: tool.name, detail: "A financial tool exposes no visible amount, budget, or ceiling field.", remediation: "Require an explicit amount and caller-controlled maximum before execution." });
    }
  }

  const penalty = findings.reduce((total, finding) => total + (finding.severity === "high" ? 18 : finding.severity === "medium" ? 7 : 2), 0);
  const score = Math.max(0, 100 - penalty);
  const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
  return {
    intentfence: "scanner-1.0" as const,
    scan_id: crypto.randomUUID(),
    scanned_at: new Date().toISOString(),
    server_name: input.server_name,
    score,
    grade,
    risk: score >= 80 ? "low" : score >= 60 ? "medium" : "high",
    tool_count: input.tools.length,
    consequential_tool_count: consequentialTools,
    findings,
    framework_context: [
      "OWASP Top 10 for Agentic Applications 2026 (metadata heuristics only)",
      "MCP tool schema and annotation hygiene",
    ],
    limitations: "This free scan evaluates caller-supplied MCP metadata only. It does not execute tools, test authorization, inspect source code, or certify security or compliance.",
    next_step: findings.some((finding) => finding.severity === "high")
      ? "Put one consequential tool call behind an IntentFence action authorization before production use."
      : "Validate runtime authorization and audit evidence in a scoped production pilot.",
  };
}

export const agentRiskScanInputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["server_name", "tools"],
  properties: {
    server_name: { type: "string", minLength: 1, maxLength: 200 },
    tools: {
      type: "array",
      minItems: 1,
      maxItems: MAX_TOOLS,
      items: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 120 },
          description: { type: "string", maxLength: 2_000 },
          inputSchema: { type: "object" },
          annotations: { type: "object" },
        },
      },
    },
  },
} as const;
