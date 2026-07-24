const DEFAULT_INTENTFENCE_URL =
  "https://agentpass-protocol.rmalka06.chatgpt.site";

export type IntentFenceAuthorization = {
  subject: string;
  action: {
    type: string;
    resource: string;
    protocol: "mcp" | "http" | "a2a" | "payment" | "other";
    method?: string;
    payload_sha256?: string;
  };
  context?: {
    currency?: string;
    quoted_cost?: number;
    data_retention_hours?: number;
  };
  policy: {
    allowed_action_types: string[];
    allowed_resources: string[];
    max_cost?: { amount: number; currency: string };
    max_data_retention_hours?: number;
    require_human_approval_for?: string[];
  };
  approval?: {
    approved_by: string;
    approved_at: string;
    expires_at: string;
    action_digest: string;
    proof_id: string;
  };
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
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", bytes),
  );
  return [...digest]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Place this inside a Cloudflare Agent tool handler immediately before the
 * caller-owned side effect. Any uncertainty blocks execution.
 */
export async function guardCloudflareAgentAction<T>(
  authorization: IntentFenceAuthorization,
  execute: () => Promise<T>,
  options: { baseUrl?: string; fetch?: typeof fetch } = {},
): Promise<T> {
  const baseUrl = (
    options.baseUrl ?? DEFAULT_INTENTFENCE_URL
  ).replace(/\/$/u, "");
  const request = options.fetch ?? globalThis.fetch;
  const localActionDigest = await digestCanonical(authorization.action);
  const response = await request(`${baseUrl}/api/actions/authorize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(authorization),
  });
  if (!response.ok) {
    throw new Error(`IntentFence returned HTTP ${response.status}; fail closed.`);
  }
  const decision = (await response.json()) as Record<string, unknown>;
  const receipt = isRecord(decision.receipt) ? decision.receipt : {};
  const signature = isRecord(receipt.signature) ? receipt.signature : {};
  if (
    decision.status !== "safe_to_proceed" ||
    decision.action_digest !== localActionDigest ||
    typeof signature.jws !== "string"
  ) {
    throw new Error("IntentFence did not authorize the exact local action.");
  }

  const verification = await request(`${baseUrl}/api/receipts/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jws: signature.jws }),
  });
  const verified = (await verification.json()) as Record<string, unknown>;
  const claims = isRecord(verified.claims) ? verified.claims : {};
  const evidence = isRecord(claims.evidence) ? claims.evidence : {};
  if (
    !verification.ok ||
    verified.valid !== true ||
    claims.decision !== "safe_to_proceed" ||
    evidence.action_digest !== localActionDigest
  ) {
    throw new Error("IntentFence receipt verification failed; fail closed.");
  }
  return await execute();
}
