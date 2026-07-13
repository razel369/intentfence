export type PreflightInput = {
  subject?: string;
  action?: {
    type?: string;
    resource?: string;
  };
  constraints?: {
    currency?: string;
    cost_ceiling?: number;
    quoted_cost?: number;
    data_retention_hours?: number;
    human_approval?: "required" | "optional" | "not_required";
  };
  proofs?: string[];
};

export type PreflightCheck = {
  name: "identity" | "scope" | "cost" | "data" | "approval";
  status: "pass" | "review" | "deny";
  detail: string;
};

export type PreflightDecision = {
  intentfence: "0.5";
  request_id: string;
  status: "safe_to_proceed" | "needs_review" | "denied";
  checks: PreflightCheck[];
  receipt: {
    id: string;
    issued_at: string;
    subject: string | null;
    action: PreflightInput["action"] | null;
    signed: false;
    assurance: "declared-input-policy";
    note: string;
  };
  links: {
    discovery: string;
    openapi: string;
    pricing: string;
  };
};

export class PreflightValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreflightValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, field: string, maxLength: number, required = false) {
  if (value === undefined || value === null) {
    if (required) throw new PreflightValidationError(`${field} is required.`);
    return undefined;
  }
  if (typeof value !== "string") {
    throw new PreflightValidationError(`${field} must be a string.`);
  }
  const normalized = value.trim();
  if (required && !normalized) {
    throw new PreflightValidationError(`${field} is required.`);
  }
  if (normalized.length > maxLength) {
    throw new PreflightValidationError(`${field} must be ${maxLength} characters or fewer.`);
  }
  return normalized || undefined;
}

function nonNegativeNumber(value: unknown, field: string) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1_000_000_000_000) {
    throw new PreflightValidationError(`${field} must be a finite, non-negative number.`);
  }
  return value;
}

export function validatePreflightInput(value: unknown): PreflightInput {
  if (!isRecord(value)) {
    throw new PreflightValidationError("The request body must be a JSON object.");
  }
  if (!isRecord(value.action)) {
    throw new PreflightValidationError("action must be a JSON object.");
  }
  if (value.constraints !== undefined && !isRecord(value.constraints)) {
    throw new PreflightValidationError("constraints must be a JSON object.");
  }

  const constraints = value.constraints as Record<string, unknown> | undefined;
  const humanApproval = constraints?.human_approval;
  if (
    humanApproval !== undefined &&
    !["required", "optional", "not_required"].includes(String(humanApproval))
  ) {
    throw new PreflightValidationError(
      "constraints.human_approval must be required, optional, or not_required.",
    );
  }

  let proofs: string[] | undefined;
  if (value.proofs !== undefined) {
    if (!Array.isArray(value.proofs) || value.proofs.length > 20) {
      throw new PreflightValidationError("proofs must be an array with at most 20 entries.");
    }
    proofs = value.proofs.map((proof, index) => {
      const normalized = boundedString(proof, `proofs[${index}]`, 200, true);
      return normalized!;
    });
  }

  return {
    subject: boundedString(value.subject, "subject", 200, true),
    action: {
      type: boundedString(value.action.type, "action.type", 120, true),
      resource: boundedString(value.action.resource, "action.resource", 500),
    },
    constraints: constraints
      ? {
          currency: boundedString(constraints.currency, "constraints.currency", 12)?.toUpperCase(),
          cost_ceiling: nonNegativeNumber(constraints.cost_ceiling, "constraints.cost_ceiling"),
          quoted_cost: nonNegativeNumber(constraints.quoted_cost, "constraints.quoted_cost"),
          data_retention_hours: nonNegativeNumber(
            constraints.data_retention_hours,
            "constraints.data_retention_hours",
          ),
          human_approval: humanApproval as
            | "required"
            | "optional"
            | "not_required"
            | undefined,
        }
      : undefined,
    proofs,
  };
}

const SITE_URL = "https://agentpass-protocol.rmalka06.chatgpt.site";

export function evaluatePreflight(input: PreflightInput): PreflightDecision {
  const checks: PreflightCheck[] = [];
  const subject = input.subject?.trim();
  const actionType = input.action?.type?.trim();
  const constraints = input.constraints ?? {};
  const proofs = input.proofs ?? [];

  checks.push(
    subject
      ? { name: "identity", status: "pass", detail: `Subject declared as ${subject}.` }
      : { name: "identity", status: "deny", detail: "A subject identifier is required." },
  );

  checks.push(
    actionType
      ? { name: "scope", status: "pass", detail: `Action scope is ${actionType}.` }
      : { name: "scope", status: "deny", detail: "An action type is required." },
  );

  if (
    typeof constraints.quoted_cost === "number" &&
    typeof constraints.cost_ceiling === "number"
  ) {
    checks.push(
      constraints.quoted_cost <= constraints.cost_ceiling
        ? {
            name: "cost",
            status: "pass",
            detail: `Quoted cost ${constraints.quoted_cost} is within the ${constraints.cost_ceiling} ceiling.`,
          }
        : {
            name: "cost",
            status: "deny",
            detail: `Quoted cost ${constraints.quoted_cost} exceeds the ${constraints.cost_ceiling} ceiling.`,
          },
    );
  } else {
    checks.push({
      name: "cost",
      status: "review",
      detail: "Provide quoted_cost and cost_ceiling for an automatic cost decision.",
    });
  }

  if (typeof constraints.data_retention_hours === "number") {
    checks.push(
      constraints.data_retention_hours <= 720
        ? {
            name: "data",
            status: "pass",
            detail: `Retention is limited to ${constraints.data_retention_hours} hours.`,
          }
        : {
            name: "data",
            status: "review",
            detail: `Retention of ${constraints.data_retention_hours} hours requires policy review.`,
          },
    );
  } else {
    checks.push({
      name: "data",
      status: "review",
      detail: "No data-retention limit was declared.",
    });
  }

  const approvalRequired = constraints.human_approval === "required";
  const approvalAttached = proofs.includes("human_approval");
  checks.push(
    approvalRequired && !approvalAttached
      ? {
          name: "approval",
          status: "review",
          detail: "Human approval is required but no approval proof was attached.",
        }
      : {
          name: "approval",
          status: "pass",
          detail: approvalRequired
            ? "Required human approval proof is attached."
            : "Human approval is not required by the declared constraints.",
        },
  );

  const status = checks.some((check) => check.status === "deny")
    ? "denied"
    : checks.some((check) => check.status === "review")
      ? "needs_review"
      : "safe_to_proceed";

  const requestId = crypto.randomUUID();

  return {
    intentfence: "0.5",
    request_id: requestId,
    status,
    checks,
    receipt: {
      id: `if_${requestId}`,
      issued_at: new Date().toISOString(),
      subject: subject ?? null,
      action: input.action ?? null,
      signed: false,
      assurance: "declared-input-policy",
      note: "Unsigned public preview of a declared-input policy decision. Use the paid endpoint for an ES256-signed receipt.",
    },
    links: {
      discovery: `${SITE_URL}/.well-known/intentfence.json`,
      openapi: `${SITE_URL}/openapi.json`,
      pricing: `${SITE_URL}/#pricing`,
    },
  };
}

export const preflightInputSchema = {
  type: "object",
  required: ["subject", "action"],
  properties: {
    subject: { type: "string", minLength: 1, maxLength: 200, description: "Agent or principal identifier." },
    action: {
      type: "object",
      required: ["type"],
      properties: {
        type: { type: "string", minLength: 1, maxLength: 120 },
        resource: { type: "string", maxLength: 500 },
      },
    },
    constraints: {
      type: "object",
      properties: {
        currency: { type: "string", maxLength: 12 },
        cost_ceiling: { type: "number", minimum: 0 },
        quoted_cost: { type: "number", minimum: 0 },
        data_retention_hours: { type: "number", minimum: 0 },
        human_approval: {
          type: "string",
          enum: ["required", "optional", "not_required"],
        },
      },
    },
    proofs: {
      type: "array",
      maxItems: 20,
      items: { type: "string" },
    },
  },
} as const;
