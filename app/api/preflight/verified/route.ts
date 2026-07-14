import type { RouteConfig } from "@x402/core/server";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { withX402 } from "@x402/next";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../../db";
import { paymentAudits } from "../../../../db/schema";
import {
  evaluatePreflight,
  preflightInputSchema,
  PreflightValidationError,
  validatePreflightInput,
} from "../../../../lib/preflight";
import { JsonRequestError, readJsonWithLimit } from "../../../../lib/request";
import { createSignedReceipt, ReceiptSigningError } from "../../../../lib/receipts";
import { getReceiptSigningPrivateJwk } from "../../../../lib/runtime-secrets";
import {
  intentFenceX402Server,
  INTENTFENCE_ASSET,
  INTENTFENCE_NETWORK,
  INTENTFENCE_PAY_TO,
  INTENTFENCE_PAYMENT_TIMEOUT_SECONDS,
  INTENTFENCE_PRICE_ATOMIC,
  INTENTFENCE_PRICE_USD,
  INTENTFENCE_USDC_CONTRACT,
} from "../../../../lib/x402";

const SITE_URL = "https://agentpass-protocol.rmalka06.chatgpt.site";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, PAYMENT-SIGNATURE, X-PAYMENT",
  "Access-Control-Expose-Headers": "PAYMENT-REQUIRED, PAYMENT-RESPONSE, EXTENSION-RESPONSES, X-PAYMENT-RESPONSE, X-IntentFence-Request-ID",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

const discoveryExtensions = declareDiscoveryExtension({
  input: {
    subject: "did:web:checkout-agent",
    action: { type: "purchase", resource: "order-1842" },
    constraints: {
      currency: "USD",
      cost_ceiling: 100,
      quoted_cost: 79,
      data_retention_hours: 24,
      human_approval: "not_required",
    },
  },
  inputSchema: preflightInputSchema,
  bodyType: "json",
  output: {
    example: {
      intentfence: "0.5",
      request_id: "7d7fbf44-3c39-4eca-89d6-b44d756c8df1",
      status: "safe_to_proceed",
      verification_tier: "x402-settled",
      receipt: { signed: true, format: "JWS Compact", algorithm: "ES256" },
    },
    schema: {
      properties: {
        intentfence: { type: "string", const: "0.5" },
        request_id: { type: "string", format: "uuid" },
        status: {
          type: "string",
          enum: ["safe_to_proceed", "needs_review", "denied"],
        },
        verification_tier: { type: "string", const: "x402-settled" },
        receipt: { type: "object" },
      },
      required: ["intentfence", "request_id", "status", "verification_tier", "receipt"],
    },
  },
});

const paymentRequiredExtensions = {
  bazaar: {
    ...discoveryExtensions.bazaar,
    info: {
      ...discoveryExtensions.bazaar.info,
      input: {
        ...discoveryExtensions.bazaar.info.input,
        method: "POST" as const,
      },
    },
  },
};

const routeConfig = {
  accepts: {
    scheme: "exact",
    price: INTENTFENCE_PRICE_USD,
    network: INTENTFENCE_NETWORK,
    payTo: INTENTFENCE_PAY_TO,
  },
  description: "Run a paid IntentFence preflight and receive x402 on-chain settlement proof.",
  mimeType: "application/json",
  serviceName: "IntentFence",
  tags: ["ai-agents", "preflight", "policy", "x402", "usdc"],
  iconUrl: `${SITE_URL}/favicon.svg`,
  extensions: discoveryExtensions,
  unpaidResponseBody: () => ({
    contentType: "application/json",
    body: {
      error: "payment_required",
      message: `Pay ${INTENTFENCE_PRICE_USD} in USDC on Base to run this verified preflight.`,
      payment_info: `${SITE_URL}/api/payments`,
    },
  }),
} satisfies RouteConfig;

function unpaidResponse(request: NextRequest) {
  const paymentRequired = {
    x402Version: 2,
    error: "Payment required",
    resource: {
      url: request.url,
      description: routeConfig.description,
      mimeType: routeConfig.mimeType,
      serviceName: routeConfig.serviceName,
      tags: routeConfig.tags,
      iconUrl: routeConfig.iconUrl,
    },
    accepts: [
      {
        scheme: "exact",
        network: INTENTFENCE_NETWORK,
        amount: INTENTFENCE_PRICE_ATOMIC,
        asset: INTENTFENCE_USDC_CONTRACT,
        payTo: INTENTFENCE_PAY_TO,
        maxTimeoutSeconds: INTENTFENCE_PAYMENT_TIMEOUT_SECONDS,
        extra: { name: "USD Coin", version: "2" },
      },
    ],
    extensions: paymentRequiredExtensions,
  };

  return NextResponse.json(
    {
      error: "payment_required",
      message: `Pay ${INTENTFENCE_PRICE_USD} in USDC on Base to run this verified preflight.`,
      payment_info: `${SITE_URL}/api/payments`,
    },
    {
      status: 402,
      headers: {
        ...corsHeaders,
        "PAYMENT-REQUIRED": btoa(JSON.stringify(paymentRequired)),
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

const protectedPost = withX402<unknown>(paidHandler, routeConfig, intentFenceX402Server);

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  if (
    !request.headers.has("PAYMENT-SIGNATURE") &&
    !request.headers.has("X-PAYMENT")
  ) {
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
          createdAt: new Date(),
        })
        .onConflictDoNothing({ target: paymentAudits.requestId });
    } catch (error) {
      console.error("IntentFence payment audit write failed", {
        requestId,
        error: error instanceof Error ? error.message : "unknown_error",
      });
    }
  }

  return response;
}
