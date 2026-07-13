import type { RouteConfig } from "@x402/core/server";
import { withX402 } from "@x402/next";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../../db";
import { paymentAudits } from "../../../../db/schema";
import {
  evaluatePreflight,
  PreflightValidationError,
  validatePreflightInput,
} from "../../../../lib/preflight";
import { JsonRequestError, readJsonWithLimit } from "../../../../lib/request";
import {
  agentpassX402Server,
  AGENTPASS_ASSET,
  AGENTPASS_NETWORK,
  AGENTPASS_PAY_TO,
  AGENTPASS_PAYMENT_TIMEOUT_SECONDS,
  AGENTPASS_PRICE_ATOMIC,
  AGENTPASS_PRICE_USD,
  AGENTPASS_USDC_CONTRACT,
} from "../../../../lib/x402";

const SITE_URL = "https://agentpass-protocol.rmalka06.chatgpt.site";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, PAYMENT-SIGNATURE, X-PAYMENT",
  "Access-Control-Expose-Headers": "PAYMENT-REQUIRED, PAYMENT-RESPONSE, X-PAYMENT-RESPONSE, X-AgentPass-Request-ID",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

const routeConfig = {
  accepts: {
    scheme: "exact",
    price: AGENTPASS_PRICE_USD,
    network: AGENTPASS_NETWORK,
    payTo: AGENTPASS_PAY_TO,
  },
  description: "Run a paid AgentPass preflight and receive x402 on-chain settlement proof.",
  mimeType: "application/json",
  serviceName: "AgentPass",
  tags: ["ai-agents", "preflight", "policy", "x402", "usdc"],
  iconUrl: `${SITE_URL}/favicon.svg`,
  unpaidResponseBody: () => ({
    contentType: "application/json",
    body: {
      error: "payment_required",
      message: `Pay ${AGENTPASS_PRICE_USD} in USDC on Base to run this verified preflight.`,
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
        network: AGENTPASS_NETWORK,
        amount: AGENTPASS_PRICE_ATOMIC,
        asset: AGENTPASS_USDC_CONTRACT,
        payTo: AGENTPASS_PAY_TO,
        maxTimeoutSeconds: AGENTPASS_PAYMENT_TIMEOUT_SECONDS,
        extra: { name: "USD Coin", version: "2" },
      },
    ],
  };

  return NextResponse.json(
    {
      error: "payment_required",
      message: `Pay ${AGENTPASS_PRICE_USD} in USDC on Base to run this verified preflight.`,
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

async function paidHandler(request: NextRequest) {
  try {
    const input = validatePreflightInput(await readJsonWithLimit(request));
    const decision = evaluatePreflight(input);
    return NextResponse.json(
      {
        ...decision,
        verification_tier: "x402-settled",
        receipt: {
          ...decision.receipt,
          payment_assurance: "x402-settled",
          payment_network: AGENTPASS_NETWORK,
          payment_asset: AGENTPASS_ASSET,
          payment_amount_atomic: AGENTPASS_PRICE_ATOMIC,
          pay_to: AGENTPASS_PAY_TO,
          note: "The PAYMENT-RESPONSE HTTP header is the on-chain settlement proof for this response.",
        },
      },
      { headers: { ...corsHeaders, "X-AgentPass-Request-ID": decision.request_id } },
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
    return NextResponse.json(
      { error: "internal_error", message: "The paid preflight could not be processed." },
      { status: 500, headers: corsHeaders },
    );
  }
}

const protectedPost = withX402(paidHandler, routeConfig, agentpassX402Server);

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

  let response: NextResponse;
  try {
    response = await protectedPost(request);
  } catch (error) {
    console.error("AgentPass x402 initialization retry", {
      error: error instanceof Error ? error.message : "unknown_error",
    });
    response = await protectedPost(request);
  }
  const settlementResponse = response.headers.get("PAYMENT-RESPONSE");
  const requestId = response.headers.get("X-AgentPass-Request-ID");

  if (response.ok && settlementResponse && requestId) {
    try {
      await getDb()
        .insert(paymentAudits)
        .values({
          id: crypto.randomUUID(),
          requestId,
          network: AGENTPASS_NETWORK,
          asset: AGENTPASS_ASSET,
          amountAtomic: AGENTPASS_PRICE_ATOMIC,
          payTo: AGENTPASS_PAY_TO,
          settlementResponse: settlementResponse.slice(0, 4096),
          status: "settled",
          createdAt: new Date(),
        })
        .onConflictDoNothing({ target: paymentAudits.requestId });
    } catch (error) {
      console.error("AgentPass payment audit write failed", {
        requestId,
        error: error instanceof Error ? error.message : "unknown_error",
      });
    }
  }

  return response;
}
