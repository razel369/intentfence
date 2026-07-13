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
