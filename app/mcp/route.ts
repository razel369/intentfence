import {
  evaluatePreflight,
  preflightInputSchema,
  PreflightValidationError,
  validatePreflightInput,
} from "../../lib/preflight";
import { JsonRequestError, readJsonWithLimit } from "../../lib/request";
import { recordFunnelEvent } from "../../lib/telemetry";
import {
  validateX402AssessmentInput,
  x402AssessmentInputSchema,
  X402AssessmentValidationError,
} from "../../lib/x402-assessment";
import {
  createIntentFencePaymentRequired,
  createX402AssessmentPaymentRequired,
  decodeX402Header,
  encodeX402Header,
} from "../../lib/x402-payment";

const SITE_ORIGIN = "https://agentpass-protocol.rmalka06.chatgpt.site";
const MCP_PAYMENT_META_KEY = "x402/payment";
const MCP_PAYMENT_RESPONSE_META_KEY = "x402/payment-response";
const LATEST_PROTOCOL_VERSION = "2025-11-25";
const SUPPORTED_PROTOCOL_VERSIONS = new Set([
  "2024-11-05",
  "2025-03-26",
  "2025-06-18",
  LATEST_PROTOCOL_VERSION,
]);

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function negotiatedProtocolVersion(params: Record<string, unknown> | undefined) {
  const requested = params?.protocolVersion;
  return typeof requested === "string" && SUPPORTED_PROTOCOL_VERSIONS.has(requested)
    ? requested
    : LATEST_PROTOCOL_VERSION;
}

function responseProtocolVersion(request: Request) {
  const requested = request.headers.get("MCP-Protocol-Version");
  return requested && SUPPORTED_PROTOCOL_VERSIONS.has(requested)
    ? requested
    : LATEST_PROTOCOL_VERSION;
}

function corsHeaders(request: Request, protocolVersion = responseProtocolVersion(request)) {
  const origin = request.headers.get("origin");
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin === SITE_ORIGIN ? origin : SITE_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
    "Access-Control-Allow-Headers": "Accept, Content-Type, MCP-Protocol-Version, MCP-Session-Id",
    "Access-Control-Expose-Headers": "MCP-Protocol-Version",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "MCP-Protocol-Version": protocolVersion,
    Vary: "Origin",
  };
}

function validOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === SITE_ORIGIN;
}

function jsonRpc(
  request: Request,
  id: JsonRpcRequest["id"],
  result: unknown,
  protocolVersion?: string,
) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: id ?? null, result }), {
    status: 200,
    headers: corsHeaders(request, protocolVersion),
  });
}

function errorRpc(
  request: Request,
  id: JsonRpcRequest["id"],
  code: number,
  message: string,
  status = 200,
  data?: unknown,
) {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: id ?? null,
      error: { code, message, ...(data === undefined ? {} : { data }) },
    }),
    { status, headers: corsHeaders(request) },
  );
}

function validateEnvelope(value: unknown): JsonRpcRequest | null {
  if (!isRecord(value) || value.jsonrpc !== "2.0" || typeof value.method !== "string") {
    return null;
  }
  if (
    value.id !== undefined &&
    value.id !== null &&
    typeof value.id !== "string" &&
    typeof value.id !== "number"
  ) {
    return null;
  }
  if (value.params !== undefined && !isRecord(value.params)) return null;
  return value as JsonRpcRequest;
}

function unsupportedProtocolVersion(request: Request) {
  const version = request.headers.get("MCP-Protocol-Version");
  return Boolean(version && !SUPPORTED_PROTOCOL_VERSIONS.has(version));
}

function toolError(message: string, structuredContent?: Record<string, unknown>) {
  return {
    content: [{ type: "text", text: structuredContent ? JSON.stringify(structuredContent) : message }],
    ...(structuredContent ? { structuredContent } : {}),
    isError: true,
  };
}

function x402PaymentFromParams(params: Record<string, unknown> | undefined) {
  const meta = params?._meta;
  if (!isRecord(meta)) return null;
  const payment = meta[MCP_PAYMENT_META_KEY];
  return isRecord(payment) ? payment : null;
}

async function callPaidIntentFenceTool(
  request: Request,
  input: unknown,
  payment: Record<string, unknown>,
  options: {
    path: "/api/preflight/verified" | "/api/x402-assessments";
    source: "mcp" | "mcp-x402-assessment";
    invalidResponseMessage: string;
    failedMessage: string;
    paymentRequired: (resourceUrl: string, error?: string) => Record<string, unknown>;
  },
) {
  const paidEndpoint = new URL(options.path, request.url).toString();
  const response = await fetch(paidEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "PAYMENT-SIGNATURE": encodeX402Header(payment),
      "X-IntentFence-Source": options.source,
    },
    body: JSON.stringify(input),
  });
  const rawBody = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    body = { error: "upstream_invalid_response", message: options.invalidResponseMessage };
  }

  if (response.status === 402) {
    const required = decodeX402Header(response.headers.get("PAYMENT-REQUIRED"));
    const paymentRequired = isRecord(required)
      ? required
      : options.paymentRequired(paidEndpoint, "Payment verification failed");
    return toolError("Payment verification failed", paymentRequired);
  }

  if (!response.ok || !isRecord(body)) {
    const message = isRecord(body) && typeof body.message === "string"
      ? body.message
      : isRecord(body) && typeof body.detail === "string"
        ? body.detail
      : options.failedMessage;
    return toolError(message);
  }

  const paymentResponseHeader = response.headers.get("PAYMENT-RESPONSE");
  const paymentResponse = decodeX402Header(paymentResponseHeader) ?? paymentResponseHeader;
  return {
    content: [{ type: "text", text: JSON.stringify(body) }],
    structuredContent: body,
    isError: false,
    _meta: paymentResponse
      ? { [MCP_PAYMENT_RESPONSE_META_KEY]: paymentResponse }
      : undefined,
  };
}

function callVerifiedPreflight(
  request: Request,
  input: ReturnType<typeof validatePreflightInput>,
  payment: Record<string, unknown>,
) {
  return callPaidIntentFenceTool(request, input, payment, {
    path: "/api/preflight/verified",
    source: "mcp",
    invalidResponseMessage: "The verified preflight returned invalid JSON.",
    failedMessage: "The verified preflight could not be processed.",
    paymentRequired: createIntentFencePaymentRequired,
  });
}

function callX402Assessment(
  request: Request,
  input: ReturnType<typeof validateX402AssessmentInput>,
  payment: Record<string, unknown>,
) {
  return callPaidIntentFenceTool(request, input, payment, {
    path: "/api/x402-assessments",
    source: "mcp-x402-assessment",
    invalidResponseMessage: "The x402 quote assessment returned invalid JSON.",
    failedMessage: "The x402 quote assessment could not be processed.",
    paymentRequired: createX402AssessmentPaymentRequired,
  });
}

export function OPTIONS(request: Request) {
  if (!validOrigin(request)) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export function GET(request: Request) {
  if (!validOrigin(request)) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 405,
    headers: { ...corsHeaders(request), Allow: "POST, GET, OPTIONS, DELETE" },
  });
}

export function DELETE(request: Request) {
  if (!validOrigin(request)) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 405,
    headers: { ...corsHeaders(request), Allow: "POST, GET, OPTIONS, DELETE" },
  });
}

export async function POST(request: Request) {
  if (!validOrigin(request)) return new Response(null, { status: 403 });
  if (unsupportedProtocolVersion(request)) {
    return errorRpc(
      request,
      null,
      -32600,
      "Unsupported MCP-Protocol-Version",
      400,
      { supported: [...SUPPORTED_PROTOCOL_VERSIONS] },
    );
  }

  let value: unknown;
  try {
    value = await readJsonWithLimit(request, 24_576);
  } catch (error) {
    if (error instanceof JsonRequestError) {
      return errorRpc(request, null, -32700, error.message, error.status);
    }
    return errorRpc(request, null, -32700, "Parse error", 400);
  }

  const body = validateEnvelope(value);
  if (!body) return errorRpc(request, null, -32600, "Invalid Request", 400);

  if (body.id === undefined) {
    return new Response(null, { status: 202, headers: corsHeaders(request) });
  }

  if (body.method === "initialize") {
    const protocolVersion = negotiatedProtocolVersion(body.params);
    return jsonRpc(request, body.id, {
      protocolVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "IntentFence", version: "0.7.0" },
      instructions: "Before paying an unfamiliar x402 resource, forward the exact caller-observed PAYMENT-REQUIRED header to intentfence_x402_assessment. It validates the quote against a Base USDC ceiling and payee allowlist, binds the signed receipt to the quote hash, and never contacts the target. Supply allowed_payees for safe_to_proceed; omission yields needs_review. intentfence_preflight remains a free declared-input preview; intentfence_verified_preflight returns a paid signed policy decision.",
    }, protocolVersion);
  }

  if (body.method === "ping") return jsonRpc(request, body.id, {});

  if (body.method === "tools/list") {
    await recordFunnelEvent({
      eventName: "discovery_served",
      request,
      metadata: { protocol: "mcp", tools: 3 },
    });
    return jsonRpc(request, body.id, {
      tools: [
        {
          name: "intentfence_preflight",
          title: "IntentFence Preview",
          description: "Free declared-input preview with no signed receipt, authorization proof, or enforcement guarantee. Returns safe_to_proceed, needs_review, or denied.",
          inputSchema: preflightInputSchema,
          annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        },
        {
          name: "intentfence_verified_preflight",
          title: "IntentFence Verified Preflight",
          description: "Paid production preflight ($0.005 USDC on Base). Settles through x402 and returns a signed ES256 audit receipt plus settlement metadata.",
          inputSchema: preflightInputSchema,
          annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
        },
        {
          name: "intentfence_x402_assessment",
          title: "IntentFence x402 Quote Assessment",
          description: "Paid assessment ($0.005 USDC on Base). Forward the exact base64 or base64url PAYMENT-REQUIRED header observed by the caller. IntentFence validates the quote, canonical Base USDC asset, price ceiling, payee allowlist, timeout, and resource binding without contacting the target, then returns a short-lived ES256 receipt bound to the quote hash. Supply allowed_payees for safe_to_proceed; omission yields needs_review.",
          inputSchema: x402AssessmentInputSchema,
          annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
        },
      ],
    });
  }

  if (body.method === "tools/call") {
    const toolParams = body.params ?? {};
    const toolName = toolParams.name;
    if (
      toolName !== "intentfence_preflight" &&
      toolName !== "intentfence_verified_preflight" &&
      toolName !== "intentfence_x402_assessment"
    ) {
      return jsonRpc(request, body.id, {
        content: [{ type: "text", text: "Unknown tool name." }],
        isError: true,
      });
    }
    try {
      if (toolName === "intentfence_x402_assessment") {
        const input = validateX402AssessmentInput(toolParams.arguments ?? {});
        const payment = x402PaymentFromParams(toolParams);
        if (!payment) {
          const paidEndpoint = new URL("/api/x402-assessments", request.url).toString();
          const paymentRequired = createX402AssessmentPaymentRequired(paidEndpoint);
          await recordFunnelEvent({
            eventName: "payment_required",
            request,
            subject: input.subject,
            metadata: { protocol: "mcp-x402", product: "x402-assessment" },
          });
          return jsonRpc(request, body.id, toolError("Payment required", paymentRequired));
        }
        return jsonRpc(request, body.id, await callX402Assessment(request, input, payment));
      }

      const input = validatePreflightInput(toolParams.arguments ?? {});
      if (toolName === "intentfence_verified_preflight") {
        const payment = x402PaymentFromParams(toolParams);
        if (!payment) {
          const paidEndpoint = new URL("/api/preflight/verified", request.url).toString();
          const paymentRequired = createIntentFencePaymentRequired(paidEndpoint);
          await recordFunnelEvent({
            eventName: "payment_required",
            request,
            subject: input.subject,
            metadata: { protocol: "mcp-x402" },
          });
          return jsonRpc(request, body.id, toolError("Payment required", paymentRequired));
        }
        return jsonRpc(request, body.id, await callVerifiedPreflight(request, input, payment));
      }
      const decision = evaluatePreflight(input);
      await recordFunnelEvent({
        eventName: "preview_completed",
        request,
        requestId: decision.request_id,
        subject: input.subject,
        metadata: { status: decision.status, protocol: "mcp" },
      });
      return jsonRpc(request, body.id, {
        content: [{ type: "text", text: JSON.stringify(decision) }],
        structuredContent: decision,
        isError: false,
      });
    } catch (error) {
      const message = error instanceof PreflightValidationError ||
          error instanceof X402AssessmentValidationError
        ? error.message
        : "The IntentFence request could not be processed.";
      return jsonRpc(request, body.id, {
        content: [{ type: "text", text: message }],
        isError: true,
      });
    }
  }

  return errorRpc(request, body.id, -32601, "Method not found");
}
