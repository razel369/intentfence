import {
  actionAuthorizationInputSchema,
  type ActionAuthorizationDecision,
  type ActionAuthorizationInput,
  validateActionAuthorizationInput,
} from "./action-authorization.ts";
import type { SignedActionAuthorizationReceipt } from "./receipts.ts";

export const policyPackRuntimes = [
  "cloudflare-agents",
  "coinbase-agentkit",
  "mcp-gateway",
] as const;

export type PolicyPackRuntime = (typeof policyPackRuntimes)[number];

export type PolicyPackInput = {
  project_name: string;
  runtime: PolicyPackRuntime;
  authorization: ActionAuthorizationInput;
};

export class PolicyPackValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyPackValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validatePolicyPackInput(value: unknown): PolicyPackInput {
  if (!isRecord(value)) {
    throw new PolicyPackValidationError("The request body must be a JSON object.");
  }
  const unknown = Object.keys(value).filter(
    (key) => !["project_name", "runtime", "authorization"].includes(key),
  );
  if (unknown.length > 0) {
    throw new PolicyPackValidationError(
      `The request contains unknown fields: ${unknown.join(", ")}.`,
    );
  }
  const projectName =
    typeof value.project_name === "string" ? value.project_name.trim() : "";
  if (!projectName || projectName.length > 120) {
    throw new PolicyPackValidationError(
      "project_name is required and must be 120 characters or fewer.",
    );
  }
  if (
    typeof value.runtime !== "string" ||
    !policyPackRuntimes.includes(value.runtime as PolicyPackRuntime)
  ) {
    throw new PolicyPackValidationError(
      `runtime must be one of: ${policyPackRuntimes.join(", ")}.`,
    );
  }
  try {
    return {
      project_name: projectName,
      runtime: value.runtime as PolicyPackRuntime,
      authorization: validateActionAuthorizationInput(value.authorization),
    };
  } catch (error) {
    throw new PolicyPackValidationError(
      error instanceof Error ? error.message : "authorization is invalid.",
    );
  }
}

function integrationSource(runtime: PolicyPackRuntime, authorization: ActionAuthorizationInput) {
  const input = JSON.stringify(authorization, null, 2);
  const functionName = runtime === "mcp-gateway"
    ? "guardMcpToolCall"
    : runtime === "coinbase-agentkit"
      ? "guardAgentKitAction"
      : "guardCloudflareAgentAction";
  const runtimeNote = runtime === "coinbase-agentkit"
    ? "Call this guard before the AgentKit wallet action. Signing remains inside the caller-owned wallet provider."
    : runtime === "mcp-gateway"
      ? "Call this guard immediately before forwarding tools/call to the consequential MCP server."
      : "Call this guard inside the Cloudflare Agent tool handler immediately before the external side effect.";

  return `const INTENTFENCE_URL = "https://agentpass-protocol.rmalka06.chatgpt.site";

const authorization = ${input};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(value)));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function ${functionName}<T>(execute: () => Promise<T>): Promise<T> {
  const response = await fetch(\`\${INTENTFENCE_URL}/api/actions/authorize\`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(authorization),
  });
  if (!response.ok) throw new Error("IntentFence unavailable; fail closed.");

  const decision = await response.json();
  if (decision.status !== "safe_to_proceed" || !decision.receipt?.signature?.jws) {
    throw new Error(\`IntentFence blocked the action: \${decision.status ?? "invalid_response"}\`);
  }

  const verification = await fetch(\`\${INTENTFENCE_URL}/api/receipts/verify\`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jws: decision.receipt.signature.jws }),
  });
  const verified = await verification.json();
  const localActionDigest = await sha256(authorization.action);
  if (!verification.ok || !verified.valid ||
      localActionDigest !== decision.action_digest ||
      verified.claims?.evidence?.action_digest !== localActionDigest) {
    throw new Error("IntentFence receipt verification failed; fail closed.");
  }

  return await execute();
}

// ${runtimeNote}`;
}

export function buildPolicyPack(
  input: PolicyPackInput,
  decision: ActionAuthorizationDecision,
  receipt: SignedActionAuthorizationReceipt,
) {
  const deniedAction = {
    ...input.authorization,
    action: {
      ...input.authorization.action,
      type: `${input.authorization.action.type}.unapproved`,
    },
  };
  const overBudgetAction = input.authorization.policy.max_cost
    ? {
        ...input.authorization,
        context: {
          ...input.authorization.context,
          currency: input.authorization.policy.max_cost.currency,
          quoted_cost: input.authorization.policy.max_cost.amount + 1,
        },
      }
    : null;

  return {
    intentfence: "policy-pack-1.0",
    pack_id: `if_pack_${decision.request_id}`,
    project_name: input.project_name,
    runtime: input.runtime,
    generated_at: decision.authorized_at,
    verification_tier: "production-policy-pack+x402-settled",
    decision: {
      status: decision.status,
      action_digest: decision.action_digest,
      policy_digest: decision.policy_digest,
      checks: decision.checks,
      receipt,
    },
    integration: {
      language: "typescript",
      filename: `intentfence-${input.runtime}.ts`,
      source: integrationSource(input.runtime, input.authorization),
      placement:
        "Install this guard immediately before the caller-owned consequential action. Never put credentials or wallet keys in the authorization payload.",
    },
    tests: {
      allowed: input.authorization,
      denied_action_type: deniedAction,
      over_budget: overBudgetAction,
      required_assertions: [
        "Only safe_to_proceed may execute.",
        "Any network, parsing, signature, expiry, or digest failure blocks execution.",
        "Changing the local action after authorization invalidates the receipt.",
        "The downstream system must still enforce its own identity and access controls.",
      ],
    },
    deployment_checklist: [
      "Store credentials only in the caller runtime secret manager.",
      "Recompute the action descriptor and payload hash immediately before execution.",
      "Verify the ES256 receipt and exact action digest locally.",
      "Block denied, needs_review, expired, malformed, mismatched, and unavailable paths.",
      "Correlate the IntentFence request ID with the downstream audit record.",
    ],
    support: {
      mode: "self-service",
      documentation:
        "https://github.com/razel369/intentfence#self-service-production-policy-pack",
      openapi:
        "https://agentpass-protocol.rmalka06.chatgpt.site/openapi.json",
    },
  } as const;
}

export const policyPackInputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["project_name", "runtime", "authorization"],
  properties: {
    project_name: {
      type: "string",
      minLength: 1,
      maxLength: 120,
      description: "A public-safe project label. Do not include credentials or secrets.",
    },
    runtime: {
      type: "string",
      enum: policyPackRuntimes,
    },
    authorization: actionAuthorizationInputSchema,
  },
} as const;
