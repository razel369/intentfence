import {
  evaluatePreflight,
  PreflightValidationError,
  validatePreflightInput,
} from "../../../lib/preflight";
import { JsonRequestError, readJsonWithLimit } from "../../../lib/request";
import { recordFunnelEvent } from "../../../lib/telemetry";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export function GET() {
  return Response.json(
    {
      name: "IntentFence Preflight API",
      version: "0.5",
      method: "POST",
      documentation: "/openapi.json",
      discovery: "/.well-known/intentfence.json",
    },
    { headers: corsHeaders },
  );
}

export async function POST(request: Request) {
  await recordFunnelEvent({ eventName: "activation_started", request });
  try {
    const input = validatePreflightInput(await readJsonWithLimit(request));
    const decision = evaluatePreflight(input);
    await recordFunnelEvent({
      eventName: "preview_completed",
      request,
      requestId: decision.request_id,
      subject: input.subject,
      metadata: { status: decision.status, protocol: "rest" },
    });
    return Response.json(decision, { headers: corsHeaders });
  } catch (error) {
    if (error instanceof JsonRequestError) {
      return Response.json(
        { error: error.code, message: error.message },
        { status: error.status, headers: corsHeaders },
      );
    }
    if (error instanceof PreflightValidationError) {
      return Response.json(
        { error: "invalid_request", message: error.message },
        { status: 400, headers: corsHeaders },
      );
    }
    return Response.json(
      { error: "internal_error", message: "The preflight request could not be processed." },
      { status: 500, headers: corsHeaders },
    );
  }
}
