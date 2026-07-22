import {
  ActionAuthorizationValidationError,
  evaluateActionAuthorization,
  validateActionAuthorizationInput,
} from "../../../../lib/action-authorization";
import { enforceRequestRateLimit, type RateLimitResult } from "../../../../lib/rate-limit";
import { createSignedActionAuthorizationReceipt } from "../../../../lib/receipts";
import { JsonRequestError, readJsonWithLimit } from "../../../../lib/request";
import { getReceiptSigningPrivateJwk } from "../../../../lib/runtime-secrets";
import { recordFunnelEvent } from "../../../../lib/telemetry";

const baseHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function headers(rateLimit?: RateLimitResult) {
  return {
    ...baseHeaders,
    ...(rateLimit
      ? {
          "RateLimit-Limit": String(rateLimit.limit),
          "RateLimit-Remaining": String(rateLimit.remaining),
          "RateLimit-Reset": String(rateLimit.resetAt),
        }
      : {}),
  };
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: baseHeaders });
}

export function GET() {
  return Response.json(
    {
      name: "IntentFence Action Authorization API",
      version: "1.0",
      method: "POST",
      assurance: "action-bound-policy-authorization",
      executes_actions: false,
      documentation: "/openapi.json",
    },
    { headers: baseHeaders },
  );
}

export async function POST(request: Request) {
  let rateLimit: RateLimitResult | undefined;
  try {
    rateLimit = await enforceRequestRateLimit(request, "action_authorization", 30);
    if (!rateLimit.allowed) {
      return Response.json(
        { error: "rate_limited", message: "Too many authorization requests. Retry after the current window." },
        { status: 429, headers: headers(rateLimit) },
      );
    }

    const input = validateActionAuthorizationInput(await readJsonWithLimit(request, 32_768));
    const decision = await evaluateActionAuthorization(input);
    const signingKey = await getReceiptSigningPrivateJwk();
    if (!signingKey) {
      return Response.json(
        { error: "signing_unavailable", message: "Signed authorization is temporarily unavailable; fail closed." },
        { status: 503, headers: headers(rateLimit) },
      );
    }
    const receipt = await createSignedActionAuthorizationReceipt(decision, signingKey);
    await recordFunnelEvent({
      eventName: decision.status === "safe_to_proceed" ? "action_authorized" : "action_denied",
      request,
      requestId: decision.request_id,
      subject: input.subject,
      metadata: { status: decision.status, protocol: input.action.protocol, action_type: input.action.type },
    });
    return Response.json({ ...decision, receipt }, { headers: headers(rateLimit) });
  } catch (error) {
    if (error instanceof JsonRequestError) {
      return Response.json({ error: error.code, message: error.message }, { status: error.status, headers: headers(rateLimit) });
    }
    if (error instanceof ActionAuthorizationValidationError) {
      return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers: headers(rateLimit) });
    }
    console.error("IntentFence action authorization failed", {
      error: error instanceof Error ? error.message : "unknown_error",
    });
    return Response.json(
      { error: "authorization_unavailable", message: "Authorization could not be completed; fail closed." },
      { status: 503, headers: headers(rateLimit) },
    );
  }
}
