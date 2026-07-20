import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedPayanAgentDelivery } from "../../../../lib/marketplace-delivery";
import { JsonRequestError, readJsonWithLimit } from "../../../../lib/request";
import { recordFunnelEvent } from "../../../../lib/telemetry";
import {
  assessWalletRisk,
  validateWalletRiskInput,
  WalletRiskUpstreamError,
  WalletRiskValidationError,
} from "../../../../lib/wallet-risk";
import { INTENTFENCE_SITE_URL } from "../../../../lib/x402-payment";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, X-IntentFence-Source, X-Routed-Through",
  "Access-Control-Expose-Headers": "X-IntentFence-Request-ID",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function problem(
  request: Request,
  status: number,
  slug: string,
  title: string,
  detail: string,
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
      headers: { ...corsHeaders, "Content-Type": "application/problem+json" },
    },
  );
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    if (!(await isAuthorizedPayanAgentDelivery(request))) {
      return problem(
        request,
        404,
        "not-found",
        "Not found",
        "The requested resource is unavailable.",
      );
    }
    const input = validateWalletRiskInput(
      await readJsonWithLimit(request, 2_048),
    );
    const decision = await assessWalletRisk(input);
    await recordFunnelEvent({
      eventName: "preview_completed",
      request,
      requestId: decision.request_id,
      subject: input.address,
      metadata: {
        product: "wallet-risk-marketplace",
        status: decision.status,
        marketplace: request.headers.get("x-routed-through") ?? "direct",
      },
    });
    return NextResponse.json(
      {
        ...decision,
        verification_tier: "live-base-wallet-risk+marketplace-delivery",
        marketplace_note:
          "PayanAgent attaches its settlement receipt. This live screening does not prove identity, ownership, or future behavior; use /api/wallet-risk for an IntentFence ES256-signed receipt.",
      },
      {
        headers: {
          ...corsHeaders,
          "X-IntentFence-Request-ID": decision.request_id,
        },
      },
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
    if (error instanceof WalletRiskValidationError) {
      return problem(
        request,
        400,
        "invalid-wallet-address",
        "Invalid wallet address",
        error.message,
      );
    }
    if (error instanceof WalletRiskUpstreamError) {
      return problem(
        request,
        503,
        "wallet-intelligence-unavailable",
        "Wallet intelligence unavailable",
        error.message,
      );
    }
    console.error("IntentFence wallet-risk marketplace delivery failed", {
      error: error instanceof Error ? error.message : "unknown_error",
    });
    return problem(
      request,
      500,
      "internal-error",
      "Internal server error",
      "The wallet-risk delivery could not be processed.",
    );
  }
}
