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

export type X402AssessmentInput = {
  subject: string;
  target_url: string;
  method?: "GET" | "HEAD" | "POST";
  /** Exact base64 or base64url PAYMENT-REQUIRED header observed by the caller. */
  payment_required: string;
  policy: {
    max_price_usdc: string;
    allowed_payees?: string[];
  };
};

export type X402AcceptedPayment = {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  pay_to: string;
  max_timeout_seconds: number;
  extra: {
    name: string | null;
    version: string | null;
    asset_transfer_method: string | null;
    keys: string[];
  };
};

export type X402AssessmentDecision = {
  intentfence: "0.6";
  request_id: string;
  status: "safe_to_proceed" | "needs_review" | "denied";
  assessed_at: string;
  verification_tier: "x402-quote-assessment+x402-settled";
  target: {
    origin: string;
    pathname: string;
    has_query: boolean;
    method: "GET" | "HEAD" | "POST";
    url_sha256: string;
  };
  observed: {
    challenge_source: "caller-supplied-payment-required";
    x402_version: 2;
    payment_requirements_sha256: string;
    accepts: X402AcceptedPayment[];
  };
  checks: Array<{ name: string; status: "pass" | "review" | "deny"; detail: string }>;
  receipt: {
    id: string;
    issued_at: string;
    subject: string;
    action: { type: "x402.quote-assessment"; resource: string };
    signed: true;
    assurance: "caller-observed-x402-quote-assessment";
    expires_at: string;
    payment_assurance: "x402-settled";
    payment_network: string;
    payment_asset: string;
    payment_amount_atomic: string;
    pay_to: string;
    signature: {
      format: "JWS Compact";
      jws: string;
      kid: string;
      alg: "ES256";
      verify_url: string;
      jwks_url: string;
    };
    note: string;
  };
};

export type WalletRiskDecision = {
  intentfence: "0.7";
  request_id: string;
  status: "safe_to_proceed" | "needs_review" | "denied";
  risk_level: "low" | "medium" | "critical";
  risk_score: number;
  assessed_at: string;
  verification_tier: "live-base-wallet-risk+x402-settled";
  subject: {
    address: string;
    network: "eip155:8453";
    account_type: "eoa" | "contract";
  };
  observed: {
    block_number: string;
    transaction_count: string;
    native_balance_wei: string;
    usdc_balance_atomic: string;
    code_sha256: string | null;
    malicious_flags: string[];
    malicious_contracts_created: number;
    intelligence_source: string;
  };
  checks: Array<{ name: string; status: "pass" | "review" | "deny"; detail: string }>;
  receipt: {
    id: string;
    signed: true;
    assurance: "live-base-wallet-risk";
    expires_at: string;
    payment_amount_atomic: "2000";
    signature: { jws: string; kid: string; alg: "ES256"; verify_url: string };
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

  async assessX402(
    input: X402AssessmentInput,
    options: { paymentSignature?: string } = {},
  ) {
    const response = await this.request(`${this.baseUrl}/api/x402-assessments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(options.paymentSignature
          ? { "PAYMENT-SIGNATURE": options.paymentSignature }
          : {}),
      },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      throw new IntentFenceHttpError(
        `IntentFence returned HTTP ${response.status}.`,
        response.status,
        response,
      );
    }
    return await response.json() as X402AssessmentDecision;
  }

  async assessWalletRisk(
    address: string,
    options: { paymentSignature?: string } = {},
  ) {
    const url = new URL(`${this.baseUrl}/api/wallet-risk`);
    url.searchParams.set("address", address);
    const response = await this.request(url, {
      method: "GET",
      headers: options.paymentSignature
        ? { "PAYMENT-SIGNATURE": options.paymentSignature }
        : {},
    });
    if (!response.ok) {
      throw new IntentFenceHttpError(
        `IntentFence returned HTTP ${response.status}.`,
        response.status,
        response,
      );
    }
    return await response.json() as WalletRiskDecision;
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
