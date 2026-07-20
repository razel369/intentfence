import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedPayanAgentDelivery } from "../../../../lib/marketplace-delivery";
import { JsonRequestError, readJsonWithLimit } from "../../../../lib/request";
import { recordFunnelEvent } from "../../../../lib/telemetry";
import {
  checkX402EndpointReadiness,
  validateX402ReadinessInput,
  X402ReadinessValidationError,
} from "../../../../lib/x402-readiness";
import { INTENTFENCE_SITE_URL } from "../../../../lib/x402-payment";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-IntentFence-Source",
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
      return problem(request, 404, "not-found", "Not found", "The requested resource is unavailable.");
    }
    const input = validateX402ReadinessInput(await readJsonWithLimit(request, 8_192));
    const result = await checkX402EndpointReadiness(input);
    await recordFunnelEvent({
      eventName: "preview_completed",
      request,
      requestId: result.request_id,
      subject: input.subject,
      metadata: {
        product: "x402-readiness-preview",
        status: result.status,
        marketplace: request.headers.get("x-routed-through") ?? "direct",
      },
    });
    return NextResponse.json(
      {
        ...result,
        verification_tier: "live-x402-readiness+marketplace-delivery",
        marketplace_note:
          "IntentFence made one bounded request without payment. PayanAgent supplies the settlement receipt for this readiness result.",
      },
      {
        headers: {
          ...corsHeaders,
          "X-IntentFence-Request-ID": result.request_id,
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
    if (error instanceof X402ReadinessValidationError) {
      return problem(
        request,
        400,
        "invalid-x402-readiness-request",
        "Invalid x402 readiness request",
        error.message,
      );
    }
    console.error("IntentFence x402 readiness preview failed", {
      error: error instanceof Error ? error.message : "unknown_error",
    });
    return problem(
      request,
      500,
      "internal-error",
      "Internal server error",
      "The x402 endpoint readiness check could not be processed.",
    );
  }
}
