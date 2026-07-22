import {
  AgentRiskScanValidationError,
  scanAgentToolMetadata,
  validateAgentRiskScanInput,
} from "../../../../lib/agent-risk-scan";
import { enforceRequestRateLimit, type RateLimitResult } from "../../../../lib/rate-limit";
import { JsonRequestError, readJsonWithLimit } from "../../../../lib/request";
import { recordFunnelEvent } from "../../../../lib/telemetry";

const baseHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function headers(rateLimit?: RateLimitResult) {
  return {
    ...baseHeaders,
    ...(rateLimit
      ? {
          "RateLimit-Limit": String(rateLimit.limit),
          "RateLimit-Remaining": String(rateLimit.remaining),
          "RateLimit-Reset": String(rateLimit.resetAt),
        }
      : {}),
  };
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: baseHeaders });
}

export function GET() {
  return Response.json(
    {
      name: "IntentFence MCP Agent Risk Scanner",
      version: "1.0",
      method: "POST",
      scope: "caller-supplied MCP metadata only",
      documentation: "/openapi.json",
    },
    { headers: baseHeaders },
  );
}

export async function POST(request: Request) {
  let rateLimit: RateLimitResult | undefined;
  try {
    rateLimit = await enforceRequestRateLimit(request, "agent_risk_scan", 20);
    if (!rateLimit.allowed) {
      return Response.json(
        { error: "rate_limited", message: "Too many scans. Retry after the current window." },
        { status: 429, headers: headers(rateLimit) },
      );
    }
    const input = validateAgentRiskScanInput(await readJsonWithLimit(request, 65_536));
    const result = scanAgentToolMetadata(input);
    await recordFunnelEvent({
      eventName: "risk_scan_completed",
      request,
      requestId: result.scan_id,
      subject: input.server_name,
      metadata: { score: result.score, grade: result.grade, risk: result.risk, tool_count: result.tool_count },
    });
    return Response.json(result, { headers: headers(rateLimit) });
  } catch (error) {
    if (error instanceof JsonRequestError) {
      return Response.json({ error: error.code, message: error.message }, { status: error.status, headers: headers(rateLimit) });
    }
    if (error instanceof AgentRiskScanValidationError) {
      return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers: headers(rateLimit) });
    }
    console.error("IntentFence risk scan failed", {
      error: error instanceof Error ? error.message : "unknown_error",
    });
    return Response.json(
      { error: "scan_unavailable", message: "The risk scan could not be completed." },
      { status: 503, headers: headers(rateLimit) },
    );
  }
}
