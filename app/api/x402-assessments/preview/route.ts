import { NextRequest, NextResponse } from "next/server";
import { JsonRequestError, readJsonWithLimit } from "../../../../lib/request";
import { recordFunnelEvent } from "../../../../lib/telemetry";
import {
  assessX402Resource,
  validateX402AssessmentInput,
  X402AssessmentValidationError,
} from "../../../../lib/x402-assessment";
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
      headers: {
        ...corsHeaders,
        "Content-Type": "application/problem+json",
      },
    },
  );
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    const input = validateX402AssessmentInput(
      await readJsonWithLimit(request, 24_576),
    );
    const decision = await assessX402Resource(input);
    await recordFunnelEvent({
      eventName: "preview_completed",
      request,
      requestId: decision.request_id,
      subject: input.subject,
      metadata: {
        product: "x402-assessment-preview",
        status: decision.status,
        marketplace: request.headers.get("x-routed-through") ?? "direct",
      },
    });
    return NextResponse.json(
      {
        ...decision,
        verification_tier: "unsigned-preview",
        marketplace_note:
          "This route returns an unsigned decision. A marketplace may attach its own settlement receipt; use /api/x402-assessments for an IntentFence ES256-signed receipt.",
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
    if (error instanceof X402AssessmentValidationError) {
      return problem(
        request,
        400,
        "invalid-x402-assessment",
        "Invalid x402 assessment",
        error.message,
      );
    }
    console.error("IntentFence x402 assessment preview failed", {
      error: error instanceof Error ? error.message : "unknown_error",
    });
    return problem(
      request,
      500,
      "internal-error",
      "Internal server error",
      "The x402 assessment preview could not be processed.",
    );
  }
}
