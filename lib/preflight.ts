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

const SITE_URL = "https://agentpass-protocol.rmalka06.chatgpt.site";

export function evaluatePreflight(input: PreflightInput) {
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
    agentpass: "0.2",
    request_id: requestId,
    status,
    checks,
    receipt: {
      id: `ap_${requestId}`,
      issued_at: new Date().toISOString(),
      subject: subject ?? null,
      action: input.action ?? null,
      signed: false,
      note: "Unsigned public-preview receipt. Hosted signed receipts are a paid feature.",
    },
    links: {
      discovery: `${SITE_URL}/.well-known/agentpass.json`,
      openapi: `${SITE_URL}/openapi.json`,
      pricing: `${SITE_URL}/#pricing`,
    },
  };
}

export const preflightInputSchema = {
  type: "object",
  required: ["subject", "action"],
  properties: {
    subject: { type: "string", description: "Agent or principal identifier." },
    action: {
      type: "object",
      required: ["type"],
      properties: {
        type: { type: "string" },
        resource: { type: "string" },
      },
    },
    constraints: {
      type: "object",
      properties: {
        currency: { type: "string" },
        cost_ceiling: { type: "number" },
        quoted_cost: { type: "number" },
        data_retention_hours: { type: "number" },
        human_approval: {
          type: "string",
          enum: ["required", "optional", "not_required"],
        },
      },
    },
    proofs: {
      type: "array",
      items: { type: "string" },
    },
  },
} as const;
