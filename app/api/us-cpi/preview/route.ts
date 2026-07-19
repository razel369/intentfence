import { NextRequest, NextResponse } from "next/server";
import { JsonRequestError, readJsonWithLimit } from "../../../../lib/request";
import { recordFunnelEvent } from "../../../../lib/telemetry";
import {
  getUsCpi,
  UsCpiUpstreamError,
  UsCpiValidationError,
  validateUsCpiInput,
} from "../../../../lib/us-cpi";
import { INTENTFENCE_SITE_URL } from "../../../../lib/x402-payment";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-IntentFence-Source, X-Routed-Through",
  "Access-Control-Expose-Headers": "X-IntentFence-Request-ID",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function problem(request: Request, status: number, slug: string, title: string, detail: string) {
  return new NextResponse(JSON.stringify({
    type: `${INTENTFENCE_SITE_URL}/problems/${slug}`,
    title,
    status,
    detail,
    instance: new URL(request.url).pathname,
  }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/problem+json" },
  });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    const input = validateUsCpiInput(await readJsonWithLimit(request, 2_048));
    const decision = await getUsCpi(input);
    await recordFunnelEvent({
      eventName: "preview_completed",
      request,
      requestId: decision.request_id,
      subject: input.month ?? "latest",
      metadata: {
        product: "us-cpi-marketplace",
        marketplace: request.headers.get("x-routed-through") ?? "direct",
      },
    });
    return NextResponse.json({
      ...decision,
      verification_tier: "official-source-data+marketplace-delivery",
      marketplace_note:
        "This delivery is unsigned by IntentFence. PayanAgent attaches its own on-chain settlement receipt; use /api/us-cpi for an IntentFence ES256 provenance receipt.",
    }, {
      headers: { ...corsHeaders, "X-IntentFence-Request-ID": decision.request_id },
    });
  } catch (error) {
    if (error instanceof JsonRequestError) {
      return problem(request, error.status, error.code.replaceAll("_", "-"), "Invalid request body", error.message);
    }
    if (error instanceof UsCpiValidationError) {
      return problem(request, 400, "invalid-cpi-period", "Invalid CPI period", error.message);
    }
    if (error instanceof UsCpiUpstreamError) {
      return problem(request, 503, "official-data-unavailable", "Official CPI data unavailable", error.message);
    }
    console.error("IntentFence U.S. CPI marketplace delivery failed", {
      error: error instanceof Error ? error.message : "unknown_error",
    });
    return problem(request, 500, "internal-error", "Internal server error", "The U.S. CPI delivery could not be processed.");
  }
}
