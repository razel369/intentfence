export class IntentFenceHttpError extends Error {
    status;
    response;
    constructor(message, status, response) {
        super(message);
        this.status = status;
        this.response = response;
        this.name = "IntentFenceHttpError";
    }
}
export class IntentFenceBlockedError extends Error {
    decision;
    constructor(decision) {
        super(`IntentFence blocked the tool call with status ${decision.status}.`);
        this.decision = decision;
        this.name = "IntentFenceBlockedError";
    }
}
export class IntentFenceClient {
    baseUrl;
    request;
    constructor(options = {}) {
        this.baseUrl = (options.baseUrl ?? "https://agentpass-protocol.rmalka06.chatgpt.site").replace(/\/$/u, "");
        this.request = options.fetch ?? globalThis.fetch;
    }
    async preflight(input, options = {}) {
        const path = options.paid ? "/api/preflight/verified" : "/api/preflight";
        const response = await this.request(`${this.baseUrl}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
        });
        if (!response.ok) {
            throw new IntentFenceHttpError(`IntentFence returned HTTP ${response.status}.`, response.status, response);
        }
        return await response.json();
    }
    async authorizeAction(input) {
        const response = await this.request(`${this.baseUrl}/api/actions/authorize`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
        });
        if (!response.ok) {
            throw new IntentFenceHttpError(`IntentFence returned HTTP ${response.status}; fail closed.`, response.status, response);
        }
        return await response.json();
    }
    async scanAgentRisk(input) {
        const response = await this.request(`${this.baseUrl}/api/agent-risk/scan`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
        });
        if (!response.ok) {
            throw new IntentFenceHttpError(`IntentFence returned HTTP ${response.status}.`, response.status, response);
        }
        return await response.json();
    }
    async createPolicyPack(input, options = {}) {
        const response = await this.request(`${this.baseUrl}/api/policy-packs`, {
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
            throw new IntentFenceHttpError(`IntentFence returned HTTP ${response.status}.`, response.status, response);
        }
        return await response.json();
    }
    async assessX402(input, options = {}) {
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
            throw new IntentFenceHttpError(`IntentFence returned HTTP ${response.status}.`, response.status, response);
        }
        return await response.json();
    }
    async assessWalletRisk(address, options = {}) {
        const url = new URL(`${this.baseUrl}/api/wallet-risk`);
        url.searchParams.set("address", address);
        const response = await this.request(url, {
            method: "GET",
            headers: options.paymentSignature
                ? { "PAYMENT-SIGNATURE": options.paymentSignature }
                : {},
        });
        if (!response.ok) {
            throw new IntentFenceHttpError(`IntentFence returned HTTP ${response.status}.`, response.status, response);
        }
        return await response.json();
    }
    async getUsCpi(month, options = {}) {
        const url = new URL(`${this.baseUrl}/api/us-cpi`);
        if (month)
            url.searchParams.set("month", month);
        const response = await this.request(url, {
            method: "GET",
            headers: options.paymentSignature
                ? { "PAYMENT-SIGNATURE": options.paymentSignature }
                : {},
        });
        if (!response.ok) {
            throw new IntentFenceHttpError(`IntentFence returned HTTP ${response.status}.`, response.status, response);
        }
        return await response.json();
    }
    async verifyReceipt(jws) {
        const response = await this.request(`${this.baseUrl}/api/receipts/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jws }),
        });
        const result = await response.json();
        if (!response.ok || !result.valid) {
            throw new IntentFenceHttpError(`Receipt verification failed: ${result.reason ?? response.status}.`, response.status, response);
        }
        return result;
    }
    guard(options = {}) {
        return async (input, toolCall) => {
            const decision = await this.preflight(input, { paid: options.paid });
            if (decision.status === "denied" || (options.blockOnReview !== false && decision.status === "needs_review")) {
                throw new IntentFenceBlockedError(decision);
            }
            return await toolCall();
        };
    }
    /**
     * Fail-closed enforcement for consequential actions. IntentFence authorizes
     * and signs; the supplied callback is the only code that executes the action.
     */
    async enforceAction(input, toolCall) {
        const decision = await this.authorizeAction(input);
        if (decision.status !== "safe_to_proceed" || !decision.receipt.signed) {
            throw new IntentFenceBlockedError(decision);
        }
        const localDigest = await digestCanonical(input.action);
        if (localDigest !== decision.action_digest || localDigest !== decision.receipt.action_digest) {
            throw new IntentFenceBlockedError({ ...decision, status: "denied" });
        }
        const verified = await this.verifyReceipt(decision.receipt.signature.jws);
        const claims = verified.claims;
        if (!isRecord(claims) || !isRecord(claims.evidence) ||
            claims.decision !== "safe_to_proceed" ||
            claims.evidence.action_digest !== localDigest ||
            claims.assurance !== "action-bound-policy-authorization") {
            throw new IntentFenceBlockedError({ ...decision, status: "denied" });
        }
        return await toolCall();
    }
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function canonicalize(value) {
    if (Array.isArray(value))
        return value.map(canonicalize);
    if (isRecord(value)) {
        return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
    }
    return value;
}
export async function digestCanonical(value) {
    const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(value)));
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
