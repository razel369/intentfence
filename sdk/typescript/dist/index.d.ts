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
export type ActionAuthorizationInput = {
    subject: string;
    action: {
        type: string;
        resource: string;
        protocol: "mcp" | "http" | "a2a" | "payment" | "other";
        method?: string;
        /** SHA-256 of a consequential payload. Send the digest, never credentials or secrets. */
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
        max_cost?: {
            amount: number;
            currency: string;
        };
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
    checks: Array<{
        name: string;
        status: "pass" | "review" | "deny";
        detail: string;
    }>;
    enforcement: {
        mode: "caller-side-fail-closed";
        executed: false;
        instruction: string;
    };
    receipt: {
        id: string;
        signed: true;
        assurance: "action-bound-policy-authorization";
        expires_at: string;
        action_digest: string;
        policy_digest: string;
        signature: {
            jws: string;
            kid: string;
            alg: "ES256";
            verify_url: string;
            jwks_url: string;
        };
        note: string;
    };
};
export type AgentRiskScanInput = {
    server_name: string;
    tools: Array<{
        name: string;
        description?: string;
        inputSchema?: Record<string, unknown>;
        annotations?: Record<string, unknown>;
    }>;
};
export type AgentRiskScanResult = {
    intentfence: "scanner-1.0";
    scan_id: string;
    score: number;
    grade: "A" | "B" | "C" | "D" | "F";
    risk: "low" | "medium" | "high";
    findings: Array<{
        severity: "high" | "medium" | "low";
        code: string;
        tool: string | null;
        detail: string;
        remediation: string;
    }>;
};
export type PolicyPackInput = {
    project_name: string;
    runtime: "cloudflare-agents" | "coinbase-agentkit" | "mcp-gateway" | "openai-agents-js";
    authorization: ActionAuthorizationInput;
};
export type PolicyPackResult = {
    intentfence: "policy-pack-1.0";
    pack_id: string;
    project_name: string;
    runtime: PolicyPackInput["runtime"];
    generated_at: string;
    verification_tier: "production-policy-pack+x402-settled";
    decision: Record<string, unknown>;
    integration: {
        language: "typescript";
        filename: string;
        source: string;
        placement: string;
    };
    tests: Record<string, unknown>;
    deployment_checklist: string[];
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
    checks: Array<{
        name: string;
        status: "pass" | "review" | "deny";
        detail: string;
    }>;
    receipt: {
        id: string;
        signed: true;
        assurance: "live-base-wallet-risk";
        expires_at: string;
        payment_amount_atomic: "2000";
        signature: {
            jws: string;
            kid: string;
            alg: "ES256";
            verify_url: string;
        };
    };
};
export type UsCpiDecision = {
    intentfence: "0.8";
    request_id: string;
    status: "verified";
    source: {
        publisher: "U.S. Bureau of Labor Statistics";
        api: string;
        retrieved_at: string;
        cache_ttl_seconds: 21600;
        served_from_cache: boolean;
        series: {
            headline: "CUUR0000SA0";
            core: "CUUR0000SA0L1E";
        };
    };
    period: {
        year: string;
        month: string;
        name: string;
    };
    cpi: {
        headline_index: number;
        headline_yoy_percent: number;
        core_index: number;
        core_yoy_percent: number;
    };
    summary: string;
    checks: Array<{
        name: string;
        status: "pass";
        detail: string;
    }>;
    receipt: {
        signed: true;
        assurance: "official-source-data";
        signature: {
            jws: string;
        };
    };
};
export declare class IntentFenceHttpError extends Error {
    readonly status: number;
    readonly response: Response;
    constructor(message: string, status: number, response: Response);
}
export declare class IntentFenceBlockedError extends Error {
    readonly decision: IntentFenceDecision | ActionAuthorizationDecision;
    constructor(decision: IntentFenceDecision | ActionAuthorizationDecision);
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
    authorizeAction(input: ActionAuthorizationInput): Promise<ActionAuthorizationDecision>;
    scanAgentRisk(input: AgentRiskScanInput): Promise<AgentRiskScanResult>;
    createPolicyPack(input: PolicyPackInput, options?: {
        paymentSignature?: string;
    }): Promise<PolicyPackResult>;
    assessX402(input: X402AssessmentInput, options?: {
        paymentSignature?: string;
    }): Promise<X402AssessmentDecision>;
    assessWalletRisk(address: string, options?: {
        paymentSignature?: string;
    }): Promise<WalletRiskDecision>;
    getUsCpi(month?: string, options?: {
        paymentSignature?: string;
    }): Promise<UsCpiDecision>;
    verifyReceipt(jws: string): Promise<{
        valid: boolean;
        claims?: unknown;
        reason?: string;
    }>;
    guard(options?: {
        paid?: boolean;
        blockOnReview?: boolean;
    }): <T>(input: IntentFenceInput, toolCall: () => Promise<T>) => Promise<T>;
    /**
     * Fail-closed enforcement for consequential actions. IntentFence authorizes
     * and signs; the supplied callback is the only code that executes the action.
     */
    enforceAction<T>(input: ActionAuthorizationInput, toolCall: () => Promise<T>): Promise<T>;
}
export declare function digestCanonical(value: unknown): Promise<string>;
