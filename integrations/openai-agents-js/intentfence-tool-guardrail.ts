const DEFAULT_INTENTFENCE_URL =
  "https://agentpass-protocol.rmalka06.chatgpt.site";

type GuardrailResult = unknown;

export type OpenAIAgentsGuardrailBindings = {
  defineToolInputGuardrail: (config: {
    name: string;
    run: (input: {
      toolCall: { name?: string; arguments: string };
    }) => Promise<GuardrailResult>;
  }) => unknown;
  outputFactory: {
    allow: () => GuardrailResult;
    rejectContent: (message: string) => GuardrailResult;
  };
};

export type IntentFenceOpenAIAgentsPolicy = {
  allowed_action_types: string[];
  allowed_resources: string[];
  max_cost?: { amount: number; currency: string };
  max_data_retention_hours?: number;
  require_human_approval_for?: string[];
};

export type IntentFenceOpenAIAgentsGuardrailOptions = {
  subject: string;
  policy: IntentFenceOpenAIAgentsPolicy;
  context?: {
    currency?: string;
    quoted_cost?: number;
    data_retention_hours?: number;
  };
  resource?: string | ((toolName: string, args: unknown) => string);
  baseUrl?: string;
  fetch?: typeof fetch;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

async function digestCanonical(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(value)));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function rejected(
  bindings: OpenAIAgentsGuardrailBindings,
  detail = "authorization unavailable or denied",
) {
  return bindings.outputFactory.rejectContent(
    `IntentFence blocked this exact tool call: ${detail}.`,
  );
}

/**
 * Creates an OpenAI Agents SDK function-tool input guardrail. It hashes tool
 * arguments locally, requests an action-bound authorization, verifies the
 * signed receipt and exact action digest, and rejects on every uncertain path.
 *
 * This applies to function tools configured with inputGuardrails. Hosted tools,
 * built-in execution tools, handoffs, and agent.asTool() use different SDK
 * execution paths and must keep their own approval and enforcement controls.
 */
export function createIntentFenceToolInputGuardrail(
  bindings: OpenAIAgentsGuardrailBindings,
  options: IntentFenceOpenAIAgentsGuardrailOptions,
) {
  return bindings.defineToolInputGuardrail({
    name: "intentfence_action_authorization",
    run: async ({ toolCall }) => {
      try {
        const toolName = toolCall.name?.trim();
        if (!toolName) return rejected(bindings, "missing tool name");

        let args: unknown;
        try {
          args = JSON.parse(toolCall.arguments);
        } catch {
          return rejected(bindings, "malformed tool arguments");
        }

        const payloadHash = await digestCanonical(args);
        const resource =
          typeof options.resource === "function"
            ? options.resource(toolName, args)
            : options.resource ??
              `openai-agents://tools/${encodeURIComponent(toolName)}`;
        const action = {
          type: toolName,
          resource,
          protocol: "other" as const,
          method: "tool/call",
          payload_sha256: payloadHash,
        };
        const localActionDigest = await digestCanonical(action);
        const baseUrl = (
          options.baseUrl ?? DEFAULT_INTENTFENCE_URL
        ).replace(/\/$/u, "");
        const request = options.fetch ?? globalThis.fetch;

        const response = await request(`${baseUrl}/api/actions/authorize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: options.subject,
            action,
            context: options.context,
            policy: options.policy,
          }),
        });
        if (!response.ok) {
          return rejected(bindings, `authorization HTTP ${response.status}`);
        }

        const decision = (await response.json()) as Record<string, unknown>;
        const receipt = isRecord(decision.receipt) ? decision.receipt : {};
        const signature = isRecord(receipt.signature) ? receipt.signature : {};
        if (
          decision.status !== "safe_to_proceed" ||
          decision.action_digest !== localActionDigest ||
          typeof signature.jws !== "string"
        ) {
          return rejected(bindings, "the action or policy was not authorized");
        }

        const verification = await request(
          `${baseUrl}/api/receipts/verify`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jws: signature.jws }),
          },
        );
        const verified = (await verification.json()) as Record<string, unknown>;
        const claims = isRecord(verified.claims) ? verified.claims : {};
        const evidence = isRecord(claims.evidence) ? claims.evidence : {};
        if (
          !verification.ok ||
          verified.valid !== true ||
          claims.decision !== "safe_to_proceed" ||
          evidence.action_digest !== localActionDigest
        ) {
          return rejected(bindings, "receipt verification failed");
        }

        return bindings.outputFactory.allow();
      } catch {
        return rejected(bindings);
      }
    },
  });
}
