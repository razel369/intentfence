import { withX402FromHTTPServer, x402HTTPResourceServer } from "@x402/next";
import { NextRequest, NextResponse } from "next/server";
import { JsonRequestError, readJsonWithLimit } from "../../../lib/request";
import {
  createSignedAssessmentReceipt,
  ReceiptSigningError,
} from "../../../lib/receipts";
import { getReceiptSigningPrivateJwk } from "../../../lib/runtime-secrets";
import { recordFunnelEvent } from "../../../lib/telemetry";
import {
  assessX402Resource,
  validateX402AssessmentInput,
  X402AssessmentValidationError,
} from "../../../lib/x402-assessment";
import { finalizeIntentFenceSettlement } from "../../../lib/x402-settlement";
import { isSuccessfulX402Settlement } from "../../../lib/x402-settlement-status";
import {
  releaseX402PaymentAuthorization,
  reserveX402PaymentAuthorization,
  X402PaymentReservationConflictError,
  X402PaymentReservationInputError,
  X402PaymentReservationUnavailableError,
} from "../../../lib/x402-reservation";
import {
  intentFenceX402Server,
  INTENTFENCE_ASSET,
  INTENTFENCE_NETWORK,
  INTENTFENCE_PAY_TO,
  INTENTFENCE_PRICE_ATOMIC,
  INTENTFENCE_PRICE_USD,
} from "../../../lib/x402";
import {
  createX402AssessmentPaymentRequired,
  encodeX402Header,
  INTENTFENCE_SITE_URL,
  x402AssessmentRouteConfig,
} from "../../../lib/x402-payment";

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

async function releaseReservationQuietly(
  authorizationHash: string,
  reason: string,
) {
  try {
    await releaseX402PaymentAuthorization(authorizationHash);
  } catch (error) {
    console.error("IntentFence x402 reservation release failed", {
      reason,
      error: error instanceof Error ? error.message : "unknown_error",
    });
  }
}

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

function unpaidResponse(request: NextRequest) {
  const paymentRequired = createX402AssessmentPaymentRequired(request.url);
  return NextResponse.json(
    {
      error: "payment_required",
      message: `Pay ${INTENTFENCE_PRICE_USD} in USDC on Base for a signed assessment of the exact caller-observed x402 quote.`,
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

    const input = validateX402AssessmentInput(await readJsonWithLimit(request, 24_576));
    const paymentHeader =
      request.headers.get("PAYMENT-SIGNATURE") ?? request.headers.get("X-PAYMENT");
    if (!paymentHeader) {
      throw new X402PaymentReservationInputError(
        "A verified x402 payment authorization is required.",
      );
    }
    reservationHash = await reserveX402PaymentAuthorization(
      paymentHeader,
      "x402-assessment",
    );
    reservationByRequest.set(request, reservationHash);
    const decision = await assessX402Resource(input);
    const receipt = await createSignedAssessmentReceipt(decision, privateJwk, {
      network: INTENTFENCE_NETWORK,
      asset: INTENTFENCE_ASSET,
      amountAtomic: INTENTFENCE_PRICE_ATOMIC,
      payTo: INTENTFENCE_PAY_TO,
    });
    return NextResponse.json(
      {
        ...decision,
        verification_tier: "x402-quote-assessment+x402-settled",
        receipt,
      },
      {
        headers: {
          ...corsHeaders,
          "X-IntentFence-Request-ID": decision.request_id,
        },
      },
    );
  } catch (error) {
    if (reservationHash) {
      reservationByRequest.delete(request);
      await releaseReservationQuietly(reservationHash, "handler_failed");
    }
    if (error instanceof JsonRequestError) {
      return problem(
        request,
        error.status,
        error.code.replaceAll("_", "-"),
        "Invalid request body",
        error.message,
      );
    }
    if (error instanceof X402AssessmentValidationError) {
      return problem(
        request,
        400,
        "invalid-x402-assessment",
        "Invalid x402 assessment",
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
      console.error("IntentFence x402 assessment receipt signing failed", {
        error: error.message,
      });
      return problem(
        request,
        503,
        "signing-unavailable",
        "Receipt signing unavailable",
        "Receipt signing is temporarily unavailable; no payment was settled.",
        { "Retry-After": "60" },
      );
    }
    console.error("IntentFence x402 assessment failed", {
      error: error instanceof Error ? error.message : "unknown_error",
    });
    return problem(
      request,
      500,
      "internal-error",
      "Internal server error",
      "The x402 assessment could not be processed.",
    );
  }
}

const httpPaymentServer = new x402HTTPResourceServer(intentFenceX402Server, {
  "POST /api/x402-assessments": x402AssessmentRouteConfig,
});
const protectedPost = withX402FromHTTPServer<unknown>(paidHandler, httpPaymentServer);

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  // Validate the bounded, caller-supplied quote before asking for payment. The
  // paid handler validates the original request again after x402 verification.
  try {
    validateX402AssessmentInput(
      await readJsonWithLimit(request.clone() as unknown as Request, 24_576),
    );
  } catch (error) {
    if (error instanceof JsonRequestError) {
      return problem(
        request,
        error.status,
        error.code.replaceAll("_", "-"),
        "Invalid request body",
        error.message,
      );
    }
    if (error instanceof X402AssessmentValidationError) {
      return problem(
        request,
        400,
        "invalid-x402-assessment",
        "Invalid x402 assessment",
        error.message,
      );
    }
    return problem(
      request,
      400,
      "invalid-x402-assessment",
      "Invalid x402 assessment",
      "The x402 assessment request could not be validated.",
    );
  }

  if (!request.headers.has("PAYMENT-SIGNATURE") && !request.headers.has("X-PAYMENT")) {
    await recordFunnelEvent({
      eventName: "payment_required",
      request,
      metadata: {
        amount_atomic: INTENTFENCE_PRICE_ATOMIC,
        protocol: "rest-x402",
        product: "x402-assessment",
      },
    });
    return unpaidResponse(request);
  }

  if (!(await getReceiptSigningPrivateJwk())) {
    return problem(
      request,
      503,
      "signing-unavailable",
      "Receipt signing unavailable",
      "Receipt signing is temporarily unavailable; do not submit a payment yet.",
      { "Retry-After": "60" },
    );
  }

  let response: NextResponse;
  try {
    response = await protectedPost(request);
  } catch (error) {
    const activeReservation = reservationByRequest.get(request);
    if (activeReservation) {
      reservationByRequest.delete(request);
      await releaseReservationQuietly(activeReservation, "protected_handler_threw");
      return problem(
        request,
        503,
        "payment-processing-unavailable",
        "Payment processing unavailable",
        "The assessment could not be completed; no payment was settled.",
        { "Retry-After": "30" },
      );
    }
    console.error("IntentFence x402 assessment initialization retry", {
      error: error instanceof Error ? error.message : "unknown_error",
    });
    try {
      response = await protectedPost(request);
    } catch (retryError) {
      console.error("IntentFence x402 assessment initialization failed", {
        error: retryError instanceof Error ? retryError.message : "unknown_error",
      });
      return problem(
        request,
        503,
        "payment-processing-unavailable",
        "Payment processing unavailable",
        "The assessment could not be initialized; no payment was settled.",
        { "Retry-After": "30" },
      );
    }
  }

  const reservationHash = reservationByRequest.get(request);
  reservationByRequest.delete(request);
  if (reservationHash && !isSuccessfulX402Settlement(response)) {
    await releaseReservationQuietly(reservationHash, "settlement_not_confirmed");
  }

  return finalizeIntentFenceSettlement(request, response, "x402-assessment");
}
