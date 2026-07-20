import { withX402FromHTTPServer, x402HTTPResourceServer } from "@x402/next";
import { NextRequest, NextResponse } from "next/server";
import { evaluatePreflight, PreflightValidationError, validatePreflightInput } from "../../../../lib/preflight";
import { JsonRequestError, readJsonWithLimit } from "../../../../lib/request";
import { createSignedReceipt, ReceiptSigningError } from "../../../../lib/receipts";
import { getReceiptSigningPrivateJwk } from "../../../../lib/runtime-secrets";
import { recordFunnelEvent } from "../../../../lib/telemetry";
import { finalizeIntentFenceSettlement } from "../../../../lib/x402-settlement";
import { normalizeX402PaymentRequest } from "../../../../lib/x402-http-compat";
import {
  intentFenceX402Server,
  INTENTFENCE_ASSET,
  INTENTFENCE_NETWORK,
  INTENTFENCE_PAY_TO,
  INTENTFENCE_PRICE_ATOMIC,
  INTENTFENCE_PRICE_USD,
} from "../../../../lib/x402";
import {
  createIntentFencePaymentRequired,
  encodeX402Header,
  INTENTFENCE_SITE_URL,
  intentFencePaidRouteConfig,
} from "../../../../lib/x402-payment";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, PAYMENT-SIGNATURE, X-PAYMENT, X-IntentFence-Source",
  "Access-Control-Expose-Headers": "PAYMENT-REQUIRED, PAYMENT-RESPONSE, EXTENSION-RESPONSES, X-PAYMENT-RESPONSE, X-IntentFence-Request-ID, X-IntentFence-Audit-Status",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function unpaidResponse(request: NextRequest) {
  const paymentRequired = createIntentFencePaymentRequired(request.url);

  return NextResponse.json(
    {
      error: "payment_required",
      message: `Pay ${INTENTFENCE_PRICE_USD} in USDC on Base to run this verified preflight.`,
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
  try {
    const privateJwk = await getReceiptSigningPrivateJwk();
    if (!privateJwk) {
      return NextResponse.json(
        {
          error: "signing_temporarily_unavailable",
          message: "Receipt signing is temporarily unavailable; no payment was settled.",
        },
        { status: 503, headers: { ...corsHeaders, "Retry-After": "60" } },
      );
    }
    const input = validatePreflightInput(await readJsonWithLimit(request));
    const decision = evaluatePreflight(input);
    const receipt = await createSignedReceipt(decision, privateJwk, {
      network: INTENTFENCE_NETWORK,
      asset: INTENTFENCE_ASSET,
      amountAtomic: INTENTFENCE_PRICE_ATOMIC,
      payTo: INTENTFENCE_PAY_TO,
    });
    return NextResponse.json(
      {
        ...decision,
        verification_tier: "x402-settled",
        receipt,
      },
      { headers: { ...corsHeaders, "X-IntentFence-Request-ID": decision.request_id } },
    );
  } catch (error) {
    if (error instanceof JsonRequestError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.status, headers: corsHeaders },
      );
    }
    if (error instanceof PreflightValidationError) {
      return NextResponse.json(
        { error: "invalid_request", message: error.message },
        { status: 400, headers: corsHeaders },
      );
    }
    if (error instanceof ReceiptSigningError) {
      console.error("IntentFence receipt signing failed", { error: error.message });
      return NextResponse.json(
        {
          error: "signing_temporarily_unavailable",
          message: "Receipt signing is temporarily unavailable; no payment was settled.",
        },
        { status: 503, headers: { ...corsHeaders, "Retry-After": "60" } },
      );
    }
    return NextResponse.json(
      { error: "internal_error", message: "The paid preflight could not be processed." },
      { status: 500, headers: corsHeaders },
    );
  }
}

const httpPaymentServer = new x402HTTPResourceServer(intentFenceX402Server, {
  "POST /api/preflight/verified": intentFencePaidRouteConfig,
});

const protectedPost = withX402FromHTTPServer<unknown>(paidHandler, httpPaymentServer);

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  request = normalizeX402PaymentRequest(request);
  if (
    !request.headers.has("PAYMENT-SIGNATURE") &&
    !request.headers.has("X-PAYMENT")
  ) {
    await recordFunnelEvent({
      eventName: "payment_required",
      request,
      metadata: { amount_atomic: INTENTFENCE_PRICE_ATOMIC, protocol: "rest-x402" },
    });
    return unpaidResponse(request);
  }

  if (!(await getReceiptSigningPrivateJwk())) {
    return NextResponse.json(
      {
        error: "signing_temporarily_unavailable",
        message: "Receipt signing is temporarily unavailable; do not submit a payment yet.",
      },
      { status: 503, headers: { ...corsHeaders, "Retry-After": "60" } },
    );
  }

  let response: NextResponse;
  try {
    response = await protectedPost(request);
  } catch (error) {
    console.error("IntentFence x402 initialization retry", {
      error: error instanceof Error ? error.message : "unknown_error",
    });
    response = await protectedPost(request);
  }
  return finalizeIntentFenceSettlement(request, response, "verified-preflight");
}
