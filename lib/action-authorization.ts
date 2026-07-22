const MAX_STRING = 500;
const MAX_LIST = 50;
const MAX_AMOUNT = 1_000_000_000_000;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

export type AgentActionProtocol = "mcp" | "http" | "a2a" | "payment" | "other";

export type ActionAuthorizationInput = {
  subject: string;
  action: {
    type: string;
    resource: string;
    protocol: AgentActionProtocol;
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

export type ActionAuthorizationCheck = {
  name: "identity" | "action_digest" | "action_type" | "resource" | "cost" | "data" | "approval";
  status: "pass" | "review" | "deny";
  detail: string;
};

export type ActionAuthorizationDecision = {
  intentfence: "1.0";
  request_id: string;
  status: "safe_to_proceed" | "needs_review" | "denied";
  authorized_at: string;
  expires_at: string;
  action_digest: string;
  policy_digest: string;
  subject: string;
  action: ActionAuthorizationInput["action"];
  checks: ActionAuthorizationCheck[];
  enforcement: {
    mode: "caller-side-fail-closed";
    executed: false;
    instruction: string;
  };
  receipt: {
    id: string;
    issued_at: string;
    subject: string;
    action: ActionAuthorizationInput["action"];
    signed: false;
    assurance: "action-bound-policy-authorization";
    note: string;
  };
};

export class ActionAuthorizationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionAuthorizationValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejectUnknown(value: Record<string, unknown>, allowed: readonly string[], field: string) {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unknown.length > 0) {
    throw new ActionAuthorizationValidationError(`${field} contains unknown fields: ${unknown.join(", ")}.`);
  }
}

function requiredString(value: unknown, field: string, maxLength = MAX_STRING) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ActionAuthorizationValidationError(`${field} is required.`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new ActionAuthorizationValidationError(`${field} must be ${maxLength} characters or fewer.`);
  }
  return normalized;
}

function optionalString(value: unknown, field: string, maxLength = MAX_STRING) {
  if (value === undefined) return undefined;
  return requiredString(value, field, maxLength);
}

function boundedNumber(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > MAX_AMOUNT) {
    throw new ActionAuthorizationValidationError(`${field} must be a finite non-negative number.`);
  }
  return value;
}

function stringList(value: unknown, field: string, required = false) {
  if (!Array.isArray(value) || value.length > MAX_LIST || (required && value.length === 0)) {
    throw new ActionAuthorizationValidationError(`${field} must contain ${required ? "1 to" : "0 to"} ${MAX_LIST} strings.`);
  }
  const items = value.map((item, index) => requiredString(item, `${field}[${index}]`));
  if (new Set(items).size !== items.length) {
    throw new ActionAuthorizationValidationError(`${field} must not contain duplicates.`);
  }
  return items;
}

function isoDate(value: unknown, field: string) {
  const normalized = requiredString(value, field, 40);
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== normalized) {
    throw new ActionAuthorizationValidationError(`${field} must be an ISO 8601 UTC timestamp.`);
  }
  return normalized;
}

export function validateActionAuthorizationInput(value: unknown): ActionAuthorizationInput {
  if (!isRecord(value)) throw new ActionAuthorizationValidationError("The request body must be a JSON object.");
  rejectUnknown(value, ["subject", "action", "context", "policy", "approval"], "request");
  if (!isRecord(value.action)) throw new ActionAuthorizationValidationError("action must be an object.");
  if (!isRecord(value.policy)) throw new ActionAuthorizationValidationError("policy must be an object.");
  if (value.context !== undefined && !isRecord(value.context)) {
    throw new ActionAuthorizationValidationError("context must be an object when supplied.");
  }
  if (value.approval !== undefined && !isRecord(value.approval)) {
    throw new ActionAuthorizationValidationError("approval must be an object when supplied.");
  }

  rejectUnknown(value.action, ["type", "resource", "protocol", "method", "payload_sha256"], "action");
  rejectUnknown(value.policy, ["allowed_action_types", "allowed_resources", "max_cost", "max_data_retention_hours", "require_human_approval_for"], "policy");
  if (isRecord(value.context)) {
    rejectUnknown(value.context, ["currency", "quoted_cost", "data_retention_hours"], "context");
  }
  if (isRecord(value.approval)) {
    rejectUnknown(value.approval, ["approved_by", "approved_at", "expires_at", "action_digest", "proof_id"], "approval");
  }

  const protocol = requiredString(value.action.protocol, "action.protocol", 20);
  if (!["mcp", "http", "a2a", "payment", "other"].includes(protocol)) {
    throw new ActionAuthorizationValidationError("action.protocol must be mcp, http, a2a, payment, or other.");
  }
  const payloadHash = optionalString(value.action.payload_sha256, "action.payload_sha256", 64)?.toLowerCase();
  if (payloadHash && !SHA256_PATTERN.test(payloadHash)) {
    throw new ActionAuthorizationValidationError("action.payload_sha256 must be a lowercase SHA-256 hex digest.");
  }

  let maxCost: ActionAuthorizationInput["policy"]["max_cost"];
  if (value.policy.max_cost !== undefined) {
    if (!isRecord(value.policy.max_cost)) {
      throw new ActionAuthorizationValidationError("policy.max_cost must be an object.");
    }
    rejectUnknown(value.policy.max_cost, ["amount", "currency"], "policy.max_cost");
    maxCost = {
      amount: boundedNumber(value.policy.max_cost.amount, "policy.max_cost.amount"),
      currency: requiredString(value.policy.max_cost.currency, "policy.max_cost.currency", 12).toUpperCase(),
    };
  }

  const context = isRecord(value.context)
    ? {
        ...(value.context.currency === undefined
          ? {}
          : { currency: requiredString(value.context.currency, "context.currency", 12).toUpperCase() }),
        ...(value.context.quoted_cost === undefined
          ? {}
          : { quoted_cost: boundedNumber(value.context.quoted_cost, "context.quoted_cost") }),
        ...(value.context.data_retention_hours === undefined
          ? {}
          : { data_retention_hours: boundedNumber(value.context.data_retention_hours, "context.data_retention_hours") }),
      }
    : undefined;

  const approval = isRecord(value.approval)
    ? {
        approved_by: requiredString(value.approval.approved_by, "approval.approved_by", 200),
        approved_at: isoDate(value.approval.approved_at, "approval.approved_at"),
        expires_at: isoDate(value.approval.expires_at, "approval.expires_at"),
        action_digest: requiredString(value.approval.action_digest, "approval.action_digest", 64).toLowerCase(),
        proof_id: requiredString(value.approval.proof_id, "approval.proof_id", 200),
      }
    : undefined;
  if (approval && !SHA256_PATTERN.test(approval.action_digest)) {
    throw new ActionAuthorizationValidationError("approval.action_digest must be a lowercase SHA-256 hex digest.");
  }

  return {
    subject: requiredString(value.subject, "subject", 200),
    action: {
      type: requiredString(value.action.type, "action.type", 120),
      resource: requiredString(value.action.resource, "action.resource", 1_000),
      protocol: protocol as AgentActionProtocol,
      ...(value.action.method === undefined ? {} : { method: requiredString(value.action.method, "action.method", 20).toUpperCase() }),
      ...(payloadHash ? { payload_sha256: payloadHash } : {}),
    },
    ...(context ? { context } : {}),
    policy: {
      allowed_action_types: stringList(value.policy.allowed_action_types, "policy.allowed_action_types", true),
      allowed_resources: stringList(value.policy.allowed_resources, "policy.allowed_resources", true),
      ...(maxCost ? { max_cost: maxCost } : {}),
      ...(value.policy.max_data_retention_hours === undefined
        ? {}
        : { max_data_retention_hours: boundedNumber(value.policy.max_data_retention_hours, "policy.max_data_retention_hours") }),
      ...(value.policy.require_human_approval_for === undefined
        ? {}
        : { require_human_approval_for: stringList(value.policy.require_human_approval_for, "policy.require_human_approval_for") }),
    },
    ...(approval ? { approval } : {}),
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export async function sha256Canonical(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(value)));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function digestAgentAction(action: ActionAuthorizationInput["action"]) {
  return await sha256Canonical(action);
}

function resourceMatches(resource: string, allowed: string) {
  if (allowed.endsWith("*")) return resource.startsWith(allowed.slice(0, -1));
  return resource === allowed;
}

export async function evaluateActionAuthorization(
  input: ActionAuthorizationInput,
  now = new Date(),
): Promise<ActionAuthorizationDecision> {
  const actionDigest = await digestAgentAction(input.action);
  const policyDigest = await sha256Canonical(input.policy);
  const checks: ActionAuthorizationCheck[] = [
    { name: "identity", status: "pass", detail: `Subject is bound as ${input.subject}.` },
    { name: "action_digest", status: "pass", detail: `The complete action descriptor is bound to SHA-256 ${actionDigest}.` },
  ];

  checks.push(input.policy.allowed_action_types.includes(input.action.type)
    ? { name: "action_type", status: "pass", detail: `${input.action.type} is explicitly allowed.` }
    : { name: "action_type", status: "deny", detail: `${input.action.type} is not in the action allowlist.` });

  checks.push(input.policy.allowed_resources.some((allowed) => resourceMatches(input.action.resource, allowed))
    ? { name: "resource", status: "pass", detail: "The exact resource matches the configured allowlist." }
    : { name: "resource", status: "deny", detail: "The resource does not match the configured allowlist." });

  if (input.policy.max_cost) {
    if (input.context?.quoted_cost === undefined || !input.context.currency) {
      checks.push({ name: "cost", status: "review", detail: "This policy requires quoted_cost and currency before execution." });
    } else if (input.context.currency !== input.policy.max_cost.currency) {
      checks.push({ name: "cost", status: "deny", detail: `Quoted currency ${input.context.currency} does not match policy currency ${input.policy.max_cost.currency}.` });
    } else if (input.context.quoted_cost > input.policy.max_cost.amount) {
      checks.push({ name: "cost", status: "deny", detail: `Quoted cost ${input.context.quoted_cost} exceeds the ${input.policy.max_cost.amount} ceiling.` });
    } else {
      checks.push({ name: "cost", status: "pass", detail: `Quoted cost ${input.context.quoted_cost} ${input.context.currency} is within policy.` });
    }
  } else {
    checks.push({ name: "cost", status: "pass", detail: "This policy does not declare a spend ceiling for the action." });
  }

  if (input.policy.max_data_retention_hours !== undefined) {
    if (input.context?.data_retention_hours === undefined) {
      checks.push({ name: "data", status: "review", detail: "This policy requires a declared data-retention duration." });
    } else if (input.context.data_retention_hours > input.policy.max_data_retention_hours) {
      checks.push({ name: "data", status: "deny", detail: `Retention ${input.context.data_retention_hours}h exceeds the ${input.policy.max_data_retention_hours}h maximum.` });
    } else {
      checks.push({ name: "data", status: "pass", detail: `Retention ${input.context.data_retention_hours}h is within policy.` });
    }
  } else {
    checks.push({ name: "data", status: "pass", detail: "This policy does not declare a data-retention ceiling." });
  }

  const approvalRequired = input.policy.require_human_approval_for?.includes(input.action.type) ?? false;
  if (!approvalRequired) {
    checks.push({ name: "approval", status: "pass", detail: "Human approval is not required for this action type." });
  } else if (!input.approval) {
    checks.push({ name: "approval", status: "review", detail: "An action-bound human approval proof is required." });
  } else {
    const approvedAt = Date.parse(input.approval.approved_at);
    const expiresAt = Date.parse(input.approval.expires_at);
    if (input.approval.action_digest !== actionDigest) {
      checks.push({ name: "approval", status: "deny", detail: "The approval proof is bound to a different action digest." });
    } else if (approvedAt > now.getTime() + 300_000 || expiresAt <= now.getTime() || expiresAt <= approvedAt) {
      checks.push({ name: "approval", status: "deny", detail: "The approval proof is expired or has an invalid time window." });
    } else {
      checks.push({ name: "approval", status: "pass", detail: `Approval ${input.approval.proof_id} is bound to this action and attributed to ${input.approval.approved_by}.` });
    }
  }

  const status = checks.some((check) => check.status === "deny")
    ? "denied"
    : checks.some((check) => check.status === "review")
      ? "needs_review"
      : "safe_to_proceed";
  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 300_000).toISOString();
  const requestId = crypto.randomUUID();
  return {
    intentfence: "1.0",
    request_id: requestId,
    status,
    authorized_at: issuedAt,
    expires_at: expiresAt,
    action_digest: actionDigest,
    policy_digest: policyDigest,
    subject: input.subject,
    action: input.action,
    checks,
    enforcement: {
      mode: "caller-side-fail-closed",
      executed: false,
      instruction: status === "safe_to_proceed"
        ? "Execute only the locally bound action and fail closed if its descriptor or payload hash changes."
        : "Do not execute the downstream action.",
    },
    receipt: {
      id: `if_action_${requestId}`,
      issued_at: issuedAt,
      subject: input.subject,
      action: input.action,
      signed: false,
      assurance: "action-bound-policy-authorization",
      note: "Unsigned decision. The API route replaces this with a short-lived ES256 receipt; caller-side enforcement must still bind and gate the actual tool call.",
    },
  };
}

export const actionAuthorizationInputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["subject", "action", "policy"],
  properties: {
    subject: { type: "string", minLength: 1, maxLength: 200 },
    action: {
      type: "object",
      additionalProperties: false,
      required: ["type", "resource", "protocol"],
      properties: {
        type: { type: "string", minLength: 1, maxLength: 120 },
        resource: { type: "string", minLength: 1, maxLength: 1000 },
        protocol: { type: "string", enum: ["mcp", "http", "a2a", "payment", "other"] },
        method: { type: "string", minLength: 1, maxLength: 20 },
        payload_sha256: { type: "string", pattern: "^[0-9a-f]{64}$" },
      },
    },
    context: {
      type: "object",
      additionalProperties: false,
      properties: {
        currency: { type: "string", minLength: 1, maxLength: 12 },
        quoted_cost: { type: "number", minimum: 0 },
        data_retention_hours: { type: "number", minimum: 0 },
      },
    },
    policy: {
      type: "object",
      additionalProperties: false,
      required: ["allowed_action_types", "allowed_resources"],
      properties: {
        allowed_action_types: { type: "array", minItems: 1, maxItems: MAX_LIST, uniqueItems: true, items: { type: "string" } },
        allowed_resources: { type: "array", minItems: 1, maxItems: MAX_LIST, uniqueItems: true, items: { type: "string" } },
        max_cost: {
          type: "object",
          additionalProperties: false,
          required: ["amount", "currency"],
          properties: { amount: { type: "number", minimum: 0 }, currency: { type: "string", minLength: 1, maxLength: 12 } },
        },
        max_data_retention_hours: { type: "number", minimum: 0 },
        require_human_approval_for: { type: "array", maxItems: MAX_LIST, uniqueItems: true, items: { type: "string" } },
      },
    },
    approval: {
      type: "object",
      additionalProperties: false,
      required: ["approved_by", "approved_at", "expires_at", "action_digest", "proof_id"],
      properties: {
        approved_by: { type: "string", minLength: 1, maxLength: 200 },
        approved_at: { type: "string", format: "date-time" },
        expires_at: { type: "string", format: "date-time" },
        action_digest: { type: "string", pattern: "^[0-9a-f]{64}$" },
        proof_id: { type: "string", minLength: 1, maxLength: 200 },
      },
    },
  },
} as const;
