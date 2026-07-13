export class AgentPassHttpError extends Error {
    status;
    response;
    constructor(message, status, response) {
        super(message);
        this.status = status;
        this.response = response;
        this.name = "AgentPassHttpError";
    }
}
export class AgentPassBlockedError extends Error {
    decision;
    constructor(decision) {
        super(`AgentPass blocked the tool call with status ${decision.status}.`);
        this.decision = decision;
        this.name = "AgentPassBlockedError";
    }
}
export class AgentPassClient {
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
            throw new AgentPassHttpError(`AgentPass returned HTTP ${response.status}.`, response.status, response);
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
            throw new AgentPassHttpError(`Receipt verification failed: ${result.reason ?? response.status}.`, response.status, response);
        }
        return result;
    }
    guard(options = {}) {
        return async (input, toolCall) => {
            const decision = await this.preflight(input, { paid: options.paid });
            if (decision.status === "denied" || (options.blockOnReview !== false && decision.status === "needs_review")) {
                throw new AgentPassBlockedError(decision);
            }
            return await toolCall();
        };
    }
}
