export type IntentFenceInput = {
    subject: string;
    action: {
        type: string;
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
export type IntentFenceDecision = {
    intentfence: "0.5";
    request_id: string;
    status: "safe_to_proceed" | "needs_review" | "denied";
    checks: Array<{
        name: string;
        status: "pass" | "review" | "deny";
        detail: string;
    }>;
    receipt: {
        id: string;
        signed: boolean;
        signature?: {
            jws: string;
            kid: string;
            alg: "ES256";
            verify_url: string;
        };
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
    checks: Array<{
        name: string;
        status: "pass" | "review" | "deny";
        detail: string;
    }>;
    receipt: {
        id: string;
        issued_at: string;
        subject: string;
        action: {
            type: "x402.quote-assessment";
            resource: string;
        };
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
export declare class IntentFenceHttpError extends Error {
    readonly status: number;
    readonly response: Response;
    constructor(message: string, status: number, response: Response);
}
export declare class IntentFenceBlockedError extends Error {
    readonly decision: IntentFenceDecision;
    constructor(decision: IntentFenceDecision);
}
export type IntentFenceClientOptions = {
    baseUrl?: string;
    fetch?: typeof fetch;
};
export declare class IntentFenceClient {
    private readonly baseUrl;
    private readonly request;
    constructor(options?: IntentFenceClientOptions);
    preflight(input: IntentFenceInput, options?: {
        paid?: boolean;
    }): Promise<IntentFenceDecision>;
    assessX402(input: X402AssessmentInput, options?: {
        paymentSignature?: string;
    }): Promise<X402AssessmentDecision>;
    verifyReceipt(jws: string): Promise<{
        valid: boolean;
        claims?: unknown;
        reason?: string;
    }>;
    guard(options?: {
        paid?: boolean;
        blockOnReview?: boolean;
    }): <T>(input: IntentFenceInput, toolCall: () => Promise<T>) => Promise<T>;
}
