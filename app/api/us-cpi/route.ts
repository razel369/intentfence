import { withX402FromHTTPServer, x402HTTPResourceServer } from "@x402/next";
import { NextRequest, NextResponse } from "next/server";
import {
  createSignedOfficialDataReceipt,
  ReceiptSigningError,
} from "../../../lib/receipts";
import { getReceiptSigningPrivateJwk } from "../../../lib/runtime-secrets";
import { recordFunnelEvent } from "../../../lib/telemetry";
import {
  getUsCpi,
  UsCpiUpstreamError,
  UsCpiValidationError,
  validateUsCpiInput,
} from "../../../lib/us-cpi";
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
  INTENTFENCE_US_CPI_PRICE_ATOMIC,
  INTENTFENCE_US_CPI_PRICE_USD,
} from "../../../lib/x402";
import {
  createUsCpiPaymentRequired,
  decodeX402Header,
  encodeX402Header,
  INTENTFENCE_SITE_URL,
  usCpiRouteConfig,
} from "../../../lib/x402-payment";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "PAYMENT-SIGNATURE, X-PAYMENT, X-IntentFence-Source",
  "Access-Control-Expose-Headers":
    "PAYMENT-REQUIRED, PAYMENT-RESPONSE, EXTENSION-RESPONSES, X-PAYMENT-RESPONSE, X-IntentFence-Request-ID, X-IntentFence-Audit-Status",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

const reservationByRequest = new WeakMap<NextRequest, string>();

async function releaseReservationQuietly(authorizationHash: string, reason: string) {
  try {
    await releaseX402PaymentAuthorization(authorizationHash);
  } catch (error) {
    console.error("IntentFence U.S. CPI reservation release failed", {
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

function inputFromRequest(request: Request) {
  const month = new URL(request.url).searchParams.get("month");
  return validateUsCpiInput(month ? { month } : {});
}

function unpaidResponse(request: NextRequest) {
  const paymentRequired = createUsCpiPaymentRequired(request.url);
  return NextResponse.json(
    {
      error: "payment_required",
      message: `Pay ${INTENTFENCE_US_CPI_PRICE_USD} in USDC on Base for official U.S. headline and core CPI data with a signed source receipt.`,
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
    const paymentHeader =
      request.headers.get("PAYMENT-SIGNATURE") ?? request.headers.get("X-PAYMENT");
    if (!paymentHeader) {
      throw new X402PaymentReservationInputError(
        "A verified x402 payment authorization is required.",
      );
    }
    reservationHash = await reserveX402PaymentAuthorization(paymentHeader, "us-cpi");
    reservationByRequest.set(request, reservationHash);
    const decision = await getUsCpi(inputFromRequest(request));
    const receipt = await createSignedOfficialDataReceipt(decision, privateJwk, {
      network: INTENTFENCE_NETWORK,
      asset: INTENTFENCE_ASSET,
      amountAtomic: INTENTFENCE_US_CPI_PRICE_ATOMIC,
      payTo: INTENTFENCE_PAY_TO,
    });
    return NextResponse.json(
      {
        ...decision,
        verification_tier: "official-source-data+x402-settled",
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
    if (error instanceof UsCpiValidationError) {
      return problem(request, 400, "invalid-cpi-period", "Invalid CPI period", error.message);
    }
    if (error instanceof UsCpiUpstreamError) {
      return problem(
        request,
        503,
        "official-data-unavailable",
        "Official CPI data unavailable",
        `${error.message} No payment was settled.`,
        { "Retry-After": "60" },
      );
    }
    if (error instanceof X402PaymentReservationInputError) {
      return problem(request, 400, "invalid-payment-authorization", "Invalid payment authorization", error.message);
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
    console.error("IntentFence official U.S. CPI request failed", {
      error: error instanceof Error ? error.message : "unknown_error",
    });
    return problem(
      request,
      500,
      "internal-error",
      "Internal server error",
      "The official CPI request could not be processed.",
    );
  }
}

const httpPaymentServer = new x402HTTPResourceServer(intentFenceX402Server, {
  "GET /api/us-cpi": usCpiRouteConfig,
});
const protectedGet = withX402FromHTTPServer<unknown>(paidHandler, httpPaymentServer);

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  request = normalizeX402PaymentRequest(request);
  const hasPayment =
    request.headers.has("PAYMENT-SIGNATURE") || request.headers.has("X-PAYMENT");
  if (!hasPayment) {
    try {
      const input = inputFromRequest(request);
      await recordFunnelEvent({
        eventName: "payment_required",
        request,
        subject: input.month ?? "latest",
        metadata: {
          amount_atomic: INTENTFENCE_US_CPI_PRICE_ATOMIC,
          protocol: "rest-x402",
          product: "us-cpi",
        },
      });
    } catch {
      // Discovery probes reach 402; malformed paid requests are rejected below.
    }
    return unpaidResponse(request);
  }

  try {
    inputFromRequest(request);
  } catch (error) {
    return problem(
      request,
      400,
      "invalid-cpi-period",
      "Invalid CPI period",
      error instanceof UsCpiValidationError ? error.message : "month must use YYYY-MM.",
    );
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
    response = await protectedGet(request);
  } catch (error) {
    const activeReservation = reservationByRequest.get(request);
    if (activeReservation) {
      reservationByRequest.delete(request);
      await releaseReservationQuietly(activeReservation, "protected_handler_threw");
    }
    console.error("IntentFence official U.S. CPI payment processing failed", {
      error: error instanceof Error ? error.message : "unknown_error",
    });
    return problem(
      request,
      503,
      "payment-processing-unavailable",
      "Payment processing unavailable",
      "The official CPI request could not be initialized; no payment was settled.",
      { "Retry-After": "30" },
    );
  }

  const reservationHash = reservationByRequest.get(request);
  reservationByRequest.delete(request);
  if (response.status === 402) {
    const paymentRequired = decodeX402Header(response.headers.get("PAYMENT-REQUIRED"));
    const paymentError = paymentRequired && typeof paymentRequired === "object"
      && "error" in paymentRequired && typeof paymentRequired.error === "string"
      ? paymentRequired.error
      : "payment_rejected";
    console.warn("IntentFence U.S. CPI paid request rejected", {
      paymentError,
      sourceKind: request.headers.get("user-agent")?.startsWith("Tollbooth-")
        ? "platform_verification"
        : "external",
    });
  }
  if (reservationHash && !isSuccessfulX402Settlement(response)) {
    await releaseReservationQuietly(reservationHash, "settlement_not_confirmed");
  }

  return finalizeIntentFenceSettlement(
    request,
    response,
    "us-cpi",
    INTENTFENCE_US_CPI_PRICE_ATOMIC,
  );
}
