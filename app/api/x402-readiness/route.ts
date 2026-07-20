import { withX402FromHTTPServer, x402HTTPResourceServer } from "@x402/next";
import { NextRequest, NextResponse } from "next/server";
import { JsonRequestError, readJsonWithLimit } from "../../../lib/request";
import { createSignedReadinessReceipt, ReceiptSigningError } from "../../../lib/receipts";
import { getReceiptSigningPrivateJwk } from "../../../lib/runtime-secrets";
import { recordFunnelEvent } from "../../../lib/telemetry";
import {
  checkX402EndpointReadiness,
  validateX402ReadinessInput,
  type X402ReadinessInput,
  X402ReadinessValidationError,
} from "../../../lib/x402-readiness";
import {
  releaseX402PaymentAuthorization,
  reserveX402PaymentAuthorization,
  X402PaymentReservationConflictError,
  X402PaymentReservationInputError,
  X402PaymentReservationUnavailableError,
} from "../../../lib/x402-reservation";
import { finalizeIntentFenceSettlement } from "../../../lib/x402-settlement";
import { isSuccessfulX402Settlement } from "../../../lib/x402-settlement-status";
import { normalizeX402PaymentRequest } from "../../../lib/x402-http-compat";
import {
  intentFenceX402Server,
  INTENTFENCE_ASSET,
  INTENTFENCE_NETWORK,
  INTENTFENCE_PAY_TO,
  INTENTFENCE_READINESS_PRICE_ATOMIC,
  INTENTFENCE_READINESS_PRICE_USD,
} from "../../../lib/x402";
import {
  createX402ReadinessPaymentRequired,
  encodeX402Header,
  INTENTFENCE_SITE_URL,
  x402ReadinessRouteConfig,
} from "../../../lib/x402-payment";

const MAX_REQUEST_BYTES = 8_192;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, PAYMENT-SIGNATURE, X-PAYMENT, X-IntentFence-Source",
  "Access-Control-Expose-Headers": "PAYMENT-REQUIRED, PAYMENT-RESPONSE, EXTENSION-RESPONSES, X-PAYMENT-RESPONSE, X-IntentFence-Request-ID, X-IntentFence-Audit-Status",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

const reservationByRequest = new WeakMap<NextRequest, string>();
const inputByRequest = new WeakMap<NextRequest, X402ReadinessInput>();

function problem(request: Request, status: number, slug: string, title: string, detail: string, extraHeaders: Record<string, string> = {}) {
  return new NextResponse(JSON.stringify({
    type: `${INTENTFENCE_SITE_URL}/problems/${slug}`,
    title,
    status,
    detail,
    instance: new URL(request.url).pathname,
  }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/problem+json", ...extraHeaders },
  });
}

async function releaseReservationQuietly(authorizationHash: string, reason: string) {
  try {
    await releaseX402PaymentAuthorization(authorizationHash);
  } catch (error) {
    console.error("IntentFence readiness reservation release failed", {
      reason,
      error: error instanceof Error ? error.message : "unknown_error",
    });
  }
}

async function parseInput(request: NextRequest) {
  const cached = inputByRequest.get(request);
  if (cached) return cached;
  const input = validateX402ReadinessInput(
    await readJsonWithLimit(request.clone() as unknown as Request, MAX_REQUEST_BYTES),
  );
  inputByRequest.set(request, input);
  return input;
}

function unpaidResponse(request: NextRequest) {
  const paymentRequired = createX402ReadinessPaymentRequired(request.url);
  return NextResponse.json({
    error: "payment_required",
    message: `Pay ${INTENTFENCE_READINESS_PRICE_USD} in USDC on Base for a live x402 endpoint readiness check and signed receipt.`,
    payment_info: `${INTENTFENCE_SITE_URL}/api/payments`,
  }, {
    status: 402,
    headers: { ...corsHeaders, "PAYMENT-REQUIRED": encodeX402Header(paymentRequired) },
  });
}

async function paidHandler(request: NextRequest): Promise<NextResponse<unknown>> {
  let reservationHash: string | null = null;
  try {
    const input = await parseInput(request);
    const privateJwk = await getReceiptSigningPrivateJwk();
    if (!privateJwk) {
      return problem(request, 503, "signing-unavailable", "Receipt signing unavailable", "Receipt signing is temporarily unavailable; no payment was settled.", { "Retry-After": "60" });
    }
    const paymentHeader = request.headers.get("PAYMENT-SIGNATURE") ?? request.headers.get("X-PAYMENT");
    if (!paymentHeader) throw new X402PaymentReservationInputError("A verified x402 payment authorization is required.");
    reservationHash = await reserveX402PaymentAuthorization(paymentHeader, "x402-readiness");
    reservationByRequest.set(request, reservationHash);

    const decision = await checkX402EndpointReadiness(input);
    const receipt = await createSignedReadinessReceipt(decision, privateJwk, {
      network: INTENTFENCE_NETWORK,
      asset: INTENTFENCE_ASSET,
      amountAtomic: INTENTFENCE_READINESS_PRICE_ATOMIC,
      payTo: INTENTFENCE_PAY_TO,
    });
    return NextResponse.json({
      ...decision,
      intentfence: "0.9",
      verification_tier: "live-x402-readiness+x402-settled",
      receipt,
    }, {
      headers: { ...corsHeaders, "X-IntentFence-Request-ID": decision.request_id },
    });
  } catch (error) {
    if (reservationHash) {
      reservationByRequest.delete(request);
      await releaseReservationQuietly(reservationHash, "handler_failed");
    }
    if (error instanceof JsonRequestError) return problem(request, error.status, error.code, "Invalid JSON request", error.message);
    if (error instanceof X402ReadinessValidationError) return problem(request, 400, "invalid-readiness-request", "Invalid readiness request", error.message);
    if (error instanceof X402PaymentReservationInputError) return problem(request, 400, "invalid-payment-authorization", "Invalid payment authorization", error.message);
    if (error instanceof X402PaymentReservationConflictError) return problem(request, 409, "payment-authorization-in-flight", "Payment authorization already in flight", error.message, { "Retry-After": "2" });
    if (error instanceof X402PaymentReservationUnavailableError) return problem(request, 503, "payment-reservation-unavailable", "Payment reservation unavailable", error.message, { "Retry-After": "30" });
    if (error instanceof ReceiptSigningError) return problem(request, 503, "signing-unavailable", "Receipt signing unavailable", "Receipt signing is temporarily unavailable; no payment was settled.", { "Retry-After": "60" });
    console.error("IntentFence x402 readiness check failed", { error: error instanceof Error ? error.message : "unknown_error" });
    return problem(request, 500, "internal-error", "Internal server error", "The x402 readiness check could not be processed.");
  }
}

const httpPaymentServer = new x402HTTPResourceServer(intentFenceX402Server, {
  "POST /api/x402-readiness": x402ReadinessRouteConfig,
});
const protectedPost = withX402FromHTTPServer<unknown>(paidHandler, httpPaymentServer);

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  request = normalizeX402PaymentRequest(request);
  if (!request.headers.has("PAYMENT-SIGNATURE") && !request.headers.has("X-PAYMENT")) {
    try {
      const input = await parseInput(request);
      await recordFunnelEvent({
        eventName: "payment_required",
        request,
        subject: input.target_url,
        metadata: { amount_atomic: INTENTFENCE_READINESS_PRICE_ATOMIC, protocol: "rest-x402", product: "x402-readiness" },
      });
    } catch {
      // Discovery probes receive the machine-readable challenge; paid calls are validated before settlement.
    }
    return unpaidResponse(request);
  }

  try {
    await parseInput(request);
  } catch (error) {
    if (error instanceof JsonRequestError) return problem(request, error.status, error.code, "Invalid JSON request", error.message);
    return problem(request, 400, "invalid-readiness-request", "Invalid readiness request", error instanceof Error ? error.message : "The request is invalid.");
  }
  if (!(await getReceiptSigningPrivateJwk())) {
    return problem(request, 503, "signing-unavailable", "Receipt signing unavailable", "Receipt signing is temporarily unavailable; do not submit a payment yet.", { "Retry-After": "60" });
  }

  let response: NextResponse;
  try {
    response = await protectedPost(request);
  } catch (error) {
    const activeReservation = reservationByRequest.get(request);
    if (activeReservation) {
      reservationByRequest.delete(request);
      await releaseReservationQuietly(activeReservation, "protected_handler_threw");
    }
    console.error("IntentFence readiness payment processing failed", { error: error instanceof Error ? error.message : "unknown_error" });
    return problem(request, 503, "payment-processing-unavailable", "Payment processing unavailable", "The readiness check could not be initialized; no payment was settled.", { "Retry-After": "30" });
  }
  const reservationHash = reservationByRequest.get(request);
  reservationByRequest.delete(request);
  if (reservationHash && !isSuccessfulX402Settlement(response)) await releaseReservationQuietly(reservationHash, "settlement_not_confirmed");
  return finalizeIntentFenceSettlement(request, response, "x402-readiness", INTENTFENCE_READINESS_PRICE_ATOMIC);
}
