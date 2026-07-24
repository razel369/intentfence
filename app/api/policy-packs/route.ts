import { withX402FromHTTPServer, x402HTTPResourceServer } from "@x402/next";
import { NextRequest, NextResponse } from "next/server";
import { evaluateActionAuthorization } from "../../../lib/action-authorization";
import {
  buildPolicyPack,
  type PolicyPackInput,
  PolicyPackValidationError,
  validatePolicyPackInput,
} from "../../../lib/policy-pack";
import { JsonRequestError, readJsonWithLimit } from "../../../lib/request";
import {
  createSignedActionAuthorizationReceipt,
  ReceiptSigningError,
} from "../../../lib/receipts";
import { getReceiptSigningPrivateJwk } from "../../../lib/runtime-secrets";
import { recordFunnelEvent } from "../../../lib/telemetry";
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
  INTENTFENCE_POLICY_PACK_PRICE_ATOMIC,
  INTENTFENCE_POLICY_PACK_PRICE_USD,
} from "../../../lib/x402";
import {
  createPolicyPackPaymentRequired,
  encodeX402Header,
  INTENTFENCE_SITE_URL,
  policyPackRouteConfig,
} from "../../../lib/x402-payment";

const MAX_REQUEST_BYTES = 16_384;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, PAYMENT-SIGNATURE, X-PAYMENT, X-IntentFence-Source",
  "Access-Control-Expose-Headers":
    "PAYMENT-REQUIRED, PAYMENT-RESPONSE, EXTENSION-RESPONSES, X-PAYMENT-RESPONSE, X-IntentFence-Request-ID, X-IntentFence-Audit-Status",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

const reservationByRequest = new WeakMap<NextRequest, string>();
const inputByRequest = new WeakMap<NextRequest, PolicyPackInput>();

function problem(
  request: Request,
  status: number,
  slug: string,
  title: string,
  detail: string,
  extraHeaders: Record<string, string> = {},
) {
  return new NextResponse(
    JSON.stringify({
      type: `${INTENTFENCE_SITE_URL}/problems/${slug}`,
      title,
      status,
      detail,
      instance: new URL(request.url).pathname,
    }),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/problem+json",
        ...extraHeaders,
      },
    },
  );
}

async function releaseReservationQuietly(authorizationHash: string, reason: string) {
  try {
    await releaseX402PaymentAuthorization(authorizationHash);
  } catch (error) {
    console.error("IntentFence policy-pack reservation release failed", {
      reason,
      error: error instanceof Error ? error.message : "unknown_error",
    });
  }
}

async function parseInput(request: NextRequest) {
  const cached = inputByRequest.get(request);
  if (cached) return cached;
  const input = validatePolicyPackInput(
    await readJsonWithLimit(request.clone() as unknown as Request, MAX_REQUEST_BYTES),
  );
  inputByRequest.set(request, input);
  return input;
}

function unpaidResponse(request: NextRequest) {
  const paymentRequired = createPolicyPackPaymentRequired(request.url);
  return NextResponse.json(
    {
      error: "payment_required",
      message: `Pay ${INTENTFENCE_POLICY_PACK_PRICE_USD} in USDC on Base for a self-service production policy pack.`,
      payment_info: `${INTENTFENCE_SITE_URL}/api/payments`,
    },
    {
      status: 402,
      headers: {
        ...corsHeaders,
        "PAYMENT-REQUIRED": encodeX402Header(paymentRequired),
      },
    },
  );
}

async function paidHandler(request: NextRequest): Promise<NextResponse<unknown>> {
  let reservationHash: string | null = null;
  try {
    const input = await parseInput(request);
    const privateJwk = await getReceiptSigningPrivateJwk();
    if (!privateJwk) {
      return problem(
        request,
        503,
        "signing-unavailable",
        "Receipt signing unavailable",
        "Receipt signing is temporarily unavailable; no payment was settled.",
        { "Retry-After": "60" },
      );
    }
    const paymentHeader =
      request.headers.get("PAYMENT-SIGNATURE") ?? request.headers.get("X-PAYMENT");
    if (!paymentHeader) {
      throw new X402PaymentReservationInputError(
        "A verified x402 payment authorization is required.",
      );
    }
    reservationHash = await reserveX402PaymentAuthorization(
      paymentHeader,
      "policy-pack",
    );
    reservationByRequest.set(request, reservationHash);

    const decision = await evaluateActionAuthorization(input.authorization);
    const receipt = await createSignedActionAuthorizationReceipt(decision, privateJwk);
    const pack = buildPolicyPack(input, decision, receipt);
    return NextResponse.json(pack, {
      headers: {
        ...corsHeaders,
        "X-IntentFence-Request-ID": decision.request_id,
      },
    });
  } catch (error) {
    if (reservationHash) {
      reservationByRequest.delete(request);
      await releaseReservationQuietly(reservationHash, "handler_failed");
    }
    if (error instanceof JsonRequestError) {
      return problem(
        request,
        error.status,
        error.code,
        "Invalid JSON request",
        error.message,
      );
    }
    if (error instanceof PolicyPackValidationError) {
      return problem(
        request,
        400,
        "invalid-policy-pack",
        "Invalid policy pack",
        error.message,
      );
    }
    if (error instanceof X402PaymentReservationInputError) {
      return problem(
        request,
        400,
        "invalid-payment-authorization",
        "Invalid payment authorization",
        error.message,
      );
    }
    if (error instanceof X402PaymentReservationConflictError) {
      return problem(
        request,
        409,
        "payment-authorization-in-flight",
        "Payment authorization already in flight",
        error.message,
        { "Retry-After": "2" },
      );
    }
    if (error instanceof X402PaymentReservationUnavailableError) {
      return problem(
        request,
        503,
        "payment-reservation-unavailable",
        "Payment reservation unavailable",
        error.message,
        { "Retry-After": "30" },
      );
    }
    if (error instanceof ReceiptSigningError) {
      return problem(
        request,
        503,
        "signing-unavailable",
        "Receipt signing unavailable",
        "Receipt signing is temporarily unavailable; no payment was settled.",
        { "Retry-After": "60" },
      );
    }
    console.error("IntentFence policy-pack generation failed", {
      error: error instanceof Error ? error.message : "unknown_error",
    });
    return problem(
      request,
      500,
      "internal-error",
      "Internal server error",
      "The policy pack could not be generated.",
    );
  }
}

const httpPaymentServer = new x402HTTPResourceServer(intentFenceX402Server, {
  "POST /api/policy-packs": policyPackRouteConfig,
});
const protectedPost = withX402FromHTTPServer<unknown>(
  paidHandler,
  httpPaymentServer,
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  request = normalizeX402PaymentRequest(request);
  const hasPayment =
    request.headers.has("PAYMENT-SIGNATURE") || request.headers.has("X-PAYMENT");
  const finishPaymentAttempt = (response: NextResponse) =>
    finalizeIntentFenceSettlement(
      request,
      response,
      "policy-pack",
      INTENTFENCE_POLICY_PACK_PRICE_ATOMIC,
    );

  if (!hasPayment) {
    try {
      const input = await parseInput(request);
      await recordFunnelEvent({
        eventName: "payment_required",
        request,
        subject: input.authorization.subject,
        metadata: {
          amount_atomic: INTENTFENCE_POLICY_PACK_PRICE_ATOMIC,
          protocol: "rest-x402",
          product: "policy-pack",
          runtime: input.runtime,
        },
      });
    } catch {
      // Discovery probes receive the machine-readable challenge; paid calls
      // are validated before any settlement can occur.
    }
    return unpaidResponse(request);
  }

  try {
    await parseInput(request);
  } catch (error) {
    if (error instanceof JsonRequestError) {
      return finishPaymentAttempt(
        problem(
          request,
          error.status,
          error.code,
          "Invalid JSON request",
          error.message,
        ),
      );
    }
    return finishPaymentAttempt(
      problem(
        request,
        400,
        "invalid-policy-pack",
        "Invalid policy pack",
        error instanceof Error ? error.message : "The request is invalid.",
      ),
    );
  }
  if (!(await getReceiptSigningPrivateJwk())) {
    return finishPaymentAttempt(
      problem(
        request,
        503,
        "signing-unavailable",
        "Receipt signing unavailable",
        "Receipt signing is temporarily unavailable; do not submit a payment yet.",
        { "Retry-After": "60" },
      ),
    );
  }

  let response: NextResponse;
  try {
    response = await protectedPost(request);
  } catch (error) {
    const activeReservation = reservationByRequest.get(request);
    if (activeReservation) {
      reservationByRequest.delete(request);
      await releaseReservationQuietly(
        activeReservation,
        "protected_handler_threw",
      );
    }
    console.error("IntentFence policy-pack payment processing failed", {
      error: error instanceof Error ? error.message : "unknown_error",
    });
    return finishPaymentAttempt(
      problem(
        request,
        503,
        "payment-processing-unavailable",
        "Payment processing unavailable",
        "The policy pack could not be initialized; no payment was settled.",
        { "Retry-After": "30" },
      ),
    );
  }

  const reservationHash = reservationByRequest.get(request);
  reservationByRequest.delete(request);
  if (reservationHash && !isSuccessfulX402Settlement(response)) {
    await releaseReservationQuietly(
      reservationHash,
      "settlement_not_confirmed",
    );
  }
  return finishPaymentAttempt(response);
}
