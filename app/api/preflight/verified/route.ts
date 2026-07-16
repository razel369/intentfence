import { withX402FromHTTPServer, x402HTTPResourceServer } from "@x402/next";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../../db";
import { paymentAudits } from "../../../../db/schema";
import { evaluatePreflight, PreflightValidationError, validatePreflightInput } from "../../../../lib/preflight";
import { JsonRequestError, readJsonWithLimit } from "../../../../lib/request";
import { createSignedReceipt, ReceiptSigningError } from "../../../../lib/receipts";
import { getReceiptSigningPrivateJwk } from "../../../../lib/runtime-secrets";
import { recordFunnelEvent } from "../../../../lib/telemetry";
import {
  intentFenceX402Server,
  INTENTFENCE_ASSET,
  INTENTFENCE_FACILITATOR,
  INTENTFENCE_NETWORK,
  INTENTFENCE_PAY_TO,
  INTENTFENCE_PRICE_ATOMIC,
  INTENTFENCE_PRICE_USD,
} from "../../../../lib/x402";
import {
  createIntentFencePaymentRequired,
  decodeX402Header,
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
  const settlementResponse = response.headers.get("PAYMENT-RESPONSE");
  const requestId = response.headers.get("X-IntentFence-Request-ID");

  if (response.ok && settlementResponse && requestId) {
    let auditWritten = false;
    try {
      const decodedSettlement = decodeX402Header(settlementResponse);
      const paymentHeader = request.headers.get("PAYMENT-SIGNATURE") ?? request.headers.get("X-PAYMENT");
      const decodedPayment = decodeX402Header(paymentHeader);
      const settlement = decodedSettlement && typeof decodedSettlement === "object"
        ? decodedSettlement as Record<string, unknown>
        : {};
      const payment = decodedPayment && typeof decodedPayment === "object"
        ? decodedPayment as Record<string, unknown>
        : {};
      const payload = payment.payload && typeof payment.payload === "object"
        ? payment.payload as Record<string, unknown>
        : {};
      const authorization = payload.authorization && typeof payload.authorization === "object"
        ? payload.authorization as Record<string, unknown>
        : {};
      const payerAddress = typeof settlement.payer === "string"
        ? settlement.payer
        : typeof payment.payer === "string"
          ? payment.payer
          : typeof authorization.from === "string"
            ? authorization.from
            : null;
      const transactionHash = typeof settlement.transaction === "string"
        ? settlement.transaction
        : null;
      let decisionStatus: string | null = null;
      let receiptId: string | null = null;
      try {
        const paidBody = await response.clone().json() as Record<string, unknown>;
        decisionStatus = typeof paidBody.status === "string" ? paidBody.status : null;
        const receipt = paidBody.receipt && typeof paidBody.receipt === "object"
          ? paidBody.receipt as Record<string, unknown>
          : {};
        receiptId = typeof receipt.id === "string" ? receipt.id : null;
      } catch {
        // The settlement record is still authoritative when response metadata is unavailable.
      }
      let lastAuditError: unknown;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          await getDb()
            .insert(paymentAudits)
            .values({
              id: crypto.randomUUID(),
              requestId,
              network: INTENTFENCE_NETWORK,
              asset: INTENTFENCE_ASSET,
              amountAtomic: INTENTFENCE_PRICE_ATOMIC,
              payTo: INTENTFENCE_PAY_TO,
              settlementResponse: settlementResponse.slice(0, 4096),
              status: "settled",
              payerAddress,
              transactionHash,
              facilitator: INTENTFENCE_FACILITATOR,
              decisionStatus,
              receiptId,
              createdAt: new Date(),
            })
            .onConflictDoNothing({ target: paymentAudits.requestId });
          auditWritten = true;
          break;
        } catch (error) {
          lastAuditError = error;
          if (attempt < 3) {
            await new Promise((resolve) => setTimeout(resolve, attempt * 50));
          }
        }
      }
      if (!auditWritten) throw lastAuditError;
    } catch (error) {
      console.error("IntentFence payment audit write failed", {
        requestId,
        error: error instanceof Error ? error.message : "unknown_error",
      });
    }
    response.headers.set("X-IntentFence-Audit-Status", auditWritten ? "persisted" : "failed");
    await Promise.all([
      recordFunnelEvent({
        eventName: "payment_settled",
        request,
        requestId,
        metadata: {
          amount_atomic: INTENTFENCE_PRICE_ATOMIC,
          protocol: "x402-v2",
          audit_persisted: auditWritten,
        },
      }),
      recordFunnelEvent({
        eventName: "receipt_issued",
        request,
        requestId,
        metadata: { format: "JWS Compact", algorithm: "ES256" },
      }),
    ]);
  } else if (response.status === 402) {
    await recordFunnelEvent({
      eventName: "payment_required",
      request,
      metadata: { reason: "payment_not_verified", protocol: "rest-x402" },
    });
  }

  return response;
}
