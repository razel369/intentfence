export type AgentPassInput = {
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
export type AgentPassDecision = {
    agentpass: "0.4";
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
export declare class AgentPassHttpError extends Error {
    readonly status: number;
    readonly response: Response;
    constructor(message: string, status: number, response: Response);
}
export declare class AgentPassBlockedError extends Error {
    readonly decision: AgentPassDecision;
    constructor(decision: AgentPassDecision);
}
export type AgentPassClientOptions = {
    baseUrl?: string;
    fetch?: typeof fetch;
};
export declare class AgentPassClient {
    private readonly baseUrl;
    private readonly request;
    constructor(options?: AgentPassClientOptions);
    preflight(input: AgentPassInput, options?: {
        paid?: boolean;
    }): Promise<AgentPassDecision>;
    verifyReceipt(jws: string): Promise<{
        valid: boolean;
        claims?: unknown;
        reason?: string;
    }>;
    guard(options?: {
        paid?: boolean;
        blockOnReview?: boolean;
    }): <T>(input: AgentPassInput, toolCall: () => Promise<T>) => Promise<T>;
}
