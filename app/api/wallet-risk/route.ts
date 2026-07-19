import { withX402FromHTTPServer, x402HTTPResourceServer } from "@x402/next";
import { NextRequest, NextResponse } from "next/server";
import {
  createSignedWalletRiskReceipt,
  ReceiptSigningError,
} from "../../../lib/receipts";
import { getReceiptSigningPrivateJwk } from "../../../lib/runtime-secrets";
import { recordFunnelEvent } from "../../../lib/telemetry";
import {
  assessWalletRisk,
  validateWalletAddress,
  WalletRiskUpstreamError,
  WalletRiskValidationError,
} from "../../../lib/wallet-risk";
import {
  releaseX402PaymentAuthorization,
  reserveX402PaymentAuthorization,
  X402PaymentReservationConflictError,
  X402PaymentReservationInputError,
  X402PaymentReservationUnavailableError,
} from "../../../lib/x402-reservation";
import { finalizeIntentFenceSettlement } from "../../../lib/x402-settlement";
import { isSuccessfulX402Settlement } from "../../../lib/x402-settlement-status";
import {
  intentFenceX402Server,
  INTENTFENCE_ASSET,
  INTENTFENCE_NETWORK,
  INTENTFENCE_PAY_TO,
  INTENTFENCE_WALLET_RISK_PRICE_ATOMIC,
  INTENTFENCE_WALLET_RISK_PRICE_USD,
} from "../../../lib/x402";
import {
  createWalletRiskPaymentRequired,
  encodeX402Header,
  INTENTFENCE_SITE_URL,
  walletRiskRouteConfig,
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
    console.error("IntentFence wallet-risk reservation release failed", {
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

function addressFromRequest(request: Request) {
  return validateWalletAddress(new URL(request.url).searchParams.get("address"));
}

function unpaidResponse(request: NextRequest) {
  const paymentRequired = createWalletRiskPaymentRequired(request.url);
  return NextResponse.json(
    {
      error: "payment_required",
      message: `Pay ${INTENTFENCE_WALLET_RISK_PRICE_USD} in USDC on Base for a live recipient wallet-risk assessment and signed receipt.`,
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
    reservationHash = await reserveX402PaymentAuthorization(paymentHeader, "wallet-risk");
    reservationByRequest.set(request, reservationHash);
    const decision = await assessWalletRisk({ address: addressFromRequest(request) });
    const receipt = await createSignedWalletRiskReceipt(decision, privateJwk, {
      network: INTENTFENCE_NETWORK,
      asset: INTENTFENCE_ASSET,
      amountAtomic: INTENTFENCE_WALLET_RISK_PRICE_ATOMIC,
      payTo: INTENTFENCE_PAY_TO,
    });
    return NextResponse.json(
      {
        ...decision,
        verification_tier: "live-base-wallet-risk+x402-settled",
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
    if (error instanceof WalletRiskValidationError) {
      return problem(request, 400, "invalid-wallet-address", "Invalid wallet address", error.message);
    }
    if (error instanceof WalletRiskUpstreamError) {
      return problem(
        request,
        503,
        "wallet-intelligence-unavailable",
        "Wallet intelligence unavailable",
        `${error.message} No payment was settled.`,
        { "Retry-After": "30" },
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
    console.error("IntentFence wallet-risk assessment failed", {
      error: error instanceof Error ? error.message : "unknown_error",
    });
    return problem(
      request,
      500,
      "internal-error",
      "Internal server error",
      "The wallet-risk assessment could not be processed.",
    );
  }
}

const httpPaymentServer = new x402HTTPResourceServer(intentFenceX402Server, {
  "GET /api/wallet-risk": walletRiskRouteConfig,
});
const protectedGet = withX402FromHTTPServer<unknown>(paidHandler, httpPaymentServer);

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  if (!request.headers.has("PAYMENT-SIGNATURE") && !request.headers.has("X-PAYMENT")) {
    try {
      const address = addressFromRequest(request);
      await recordFunnelEvent({
        eventName: "payment_required",
        request,
        subject: address,
        metadata: {
          amount_atomic: INTENTFENCE_WALLET_RISK_PRICE_ATOMIC,
          protocol: "rest-x402",
          product: "wallet-risk",
        },
      });
    } catch {
      // Discovery probes intentionally reach the machine-readable 402 challenge.
      // Invalid or missing input is still rejected before any paid request can settle.
    }
    return unpaidResponse(request);
  }

  try {
    addressFromRequest(request);
  } catch (error) {
    return problem(
      request,
      400,
      "invalid-wallet-address",
      "Invalid wallet address",
      error instanceof WalletRiskValidationError
        ? error.message
        : "address must be a 20-byte EVM address.",
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
    console.error("IntentFence wallet-risk payment processing failed", {
      error: error instanceof Error ? error.message : "unknown_error",
    });
    return problem(
      request,
      503,
      "payment-processing-unavailable",
      "Payment processing unavailable",
      "The wallet-risk assessment could not be initialized; no payment was settled.",
      { "Retry-After": "30" },
    );
  }

  const reservationHash = reservationByRequest.get(request);
  reservationByRequest.delete(request);
  if (reservationHash && !isSuccessfulX402Settlement(response)) {
    await releaseReservationQuietly(reservationHash, "settlement_not_confirmed");
  }

  return finalizeIntentFenceSettlement(
    request,
    response,
    "wallet-risk",
    INTENTFENCE_WALLET_RISK_PRICE_ATOMIC,
  );
}
