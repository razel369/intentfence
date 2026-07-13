export type IntentFenceInput = {
  subject: string;
  action: { type: string; resource?: string };
  constraints?: {
    currency?: string;
    cost_ceiling?: number;
    quoted_cost?: number;
    data_retention_hours?: number;
    human_approval?: "required" | "optional" | "not_required";
  };
  proofs?: string[];
};

export type IntentFenceDecision = {
  intentfence: "0.5";
  request_id: string;
  status: "safe_to_proceed" | "needs_review" | "denied";
  checks: Array<{ name: string; status: "pass" | "review" | "deny"; detail: string }>;
  receipt: {
    id: string;
    signed: boolean;
    signature?: { jws: string; kid: string; alg: "ES256"; verify_url: string };
  };
};

export class IntentFenceHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly response: Response,
  ) {
    super(message);
    this.name = "IntentFenceHttpError";
  }
}

export class IntentFenceBlockedError extends Error {
  constructor(public readonly decision: IntentFenceDecision) {
    super(`IntentFence blocked the tool call with status ${decision.status}.`);
    this.name = "IntentFenceBlockedError";
  }
}

export type IntentFenceClientOptions = {
  baseUrl?: string;
  fetch?: typeof fetch;
};

export class IntentFenceClient {
  private readonly baseUrl: string;
  private readonly request: typeof fetch;

  constructor(options: IntentFenceClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "https://agentpass-protocol.rmalka06.chatgpt.site").replace(/\/$/u, "");
    this.request = options.fetch ?? globalThis.fetch;
  }

  async preflight(input: IntentFenceInput, options: { paid?: boolean } = {}) {
    const path = options.paid ? "/api/preflight/verified" : "/api/preflight";
    const response = await this.request(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      throw new IntentFenceHttpError(`IntentFence returned HTTP ${response.status}.`, response.status, response);
    }
    return await response.json() as IntentFenceDecision;
  }

  async verifyReceipt(jws: string) {
    const response = await this.request(`${this.baseUrl}/api/receipts/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jws }),
    });
    const result = await response.json() as { valid: boolean; claims?: unknown; reason?: string };
    if (!response.ok || !result.valid) {
      throw new IntentFenceHttpError(`Receipt verification failed: ${result.reason ?? response.status}.`, response.status, response);
    }
    return result;
  }

  guard(options: { paid?: boolean; blockOnReview?: boolean } = {}) {
    return async <T>(input: IntentFenceInput, toolCall: () => Promise<T>) => {
      const decision = await this.preflight(input, { paid: options.paid });
      if (decision.status === "denied" || (options.blockOnReview !== false && decision.status === "needs_review")) {
        throw new IntentFenceBlockedError(decision);
      }
      return await toolCall();
    };
  }
}
