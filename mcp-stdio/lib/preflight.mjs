export class PreflightValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "PreflightValidationError";
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(value, field, maxLength, required = false) {
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

function nonNegativeNumber(value, field) {
  if (value === undefined || value === null) return undefined;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1_000_000_000_000
  ) {
    throw new PreflightValidationError(`${field} must be a finite, non-negative number.`);
  }
  return value;
}

export function validatePreflightInput(value) {
  if (!isRecord(value)) {
    throw new PreflightValidationError("The request body must be a JSON object.");
  }
  if (!isRecord(value.action)) {
    throw new PreflightValidationError("action must be a JSON object.");
  }
  if (value.constraints !== undefined && !isRecord(value.constraints)) {
    throw new PreflightValidationError("constraints must be a JSON object.");
  }

  const constraints = value.constraints;
  const humanApproval = constraints?.human_approval;
  if (
    humanApproval !== undefined &&
    !["required", "optional", "not_required"].includes(String(humanApproval))
  ) {
    throw new PreflightValidationError(
      "constraints.human_approval must be required, optional, or not_required.",
    );
  }

  let proofs;
  if (value.proofs !== undefined) {
    if (!Array.isArray(value.proofs) || value.proofs.length > 20) {
      throw new PreflightValidationError("proofs must be an array with at most 20 entries.");
    }
    proofs = value.proofs.map((proof, index) =>
      boundedString(proof, `proofs[${index}]`, 200, true),
    );
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
          human_approval: humanApproval,
        }
      : undefined,
    proofs,
  };
}

const SITE_URL = "https://agentpass-protocol.rmalka06.chatgpt.site";

export function evaluatePreflight(input) {
  const checks = [];
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
