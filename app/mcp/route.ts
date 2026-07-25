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
  validateWalletRiskInput,
  walletRiskInputSchema,
  WalletRiskValidationError,
} from "../../lib/wallet-risk";
import {
  validateX402ReadinessInput,
  x402ReadinessInputSchema,
  X402ReadinessValidationError,
} from "../../lib/x402-readiness";
import {
  usCpiInputSchema,
  UsCpiValidationError,
  validateUsCpiInput,
} from "../../lib/us-cpi";
import {
  policyPackInputSchema,
  PolicyPackValidationError,
  validatePolicyPackInput,
} from "../../lib/policy-pack";
import {
  createIntentFencePaymentRequired,
  createPolicyPackPaymentRequired,
  createUsCpiPaymentRequired,
  createWalletRiskPaymentRequired,
  createX402AssessmentPaymentRequired,
  createX402ReadinessPaymentRequired,
  decodeX402Header,
  encodeX402Header,
} from "../../lib/x402-payment";
import {
  actionAuthorizationInputSchema,
  ActionAuthorizationValidationError,
  evaluateActionAuthorization,
  validateActionAuthorizationInput,
} from "../../lib/action-authorization";
import {
  agentRiskScanInputSchema,
  AgentRiskScanValidationError,
  scanAgentToolMetadata,
  validateAgentRiskScanInput,
} from "../../lib/agent-risk-scan";
import { enforceRequestRateLimit } from "../../lib/rate-limit";
import { createSignedActionAuthorizationReceipt } from "../../lib/receipts";
import { getReceiptSigningPrivateJwk } from "../../lib/runtime-secrets";
import {
  agentCheckoutInputSchema,
  AgentCheckoutValidationError,
  buildAgentCheckout,
} from "../../lib/agent-checkout";
import { paymentChallengeEventName } from "../../lib/request-traffic";

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
    path:
      | "/api/preflight/verified"
      | "/api/x402-assessments"
      | "/api/x402-readiness"
      | "/api/policy-packs";
    source:
      | "mcp"
      | "mcp-x402-assessment"
      | "mcp-x402-readiness"
      | "mcp-policy-pack";
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

function callX402Readiness(
  request: Request,
  input: ReturnType<typeof validateX402ReadinessInput>,
  payment: Record<string, unknown>,
) {
  return callPaidIntentFenceTool(request, input, payment, {
    path: "/api/x402-readiness",
    source: "mcp-x402-readiness",
    invalidResponseMessage: "The x402 endpoint readiness service returned invalid JSON.",
    failedMessage: "The x402 endpoint readiness check could not be processed.",
    paymentRequired: createX402ReadinessPaymentRequired,
  });
}

function callPolicyPack(
  request: Request,
  input: ReturnType<typeof validatePolicyPackInput>,
  payment: Record<string, unknown>,
) {
  return callPaidIntentFenceTool(request, input, payment, {
    path: "/api/policy-packs",
    source: "mcp-policy-pack",
    invalidResponseMessage: "The production policy pack returned invalid JSON.",
    failedMessage: "The production policy pack could not be generated.",
    paymentRequired: createPolicyPackPaymentRequired,
  });
}

async function callWalletRisk(
  request: Request,
  input: ReturnType<typeof validateWalletRiskInput>,
  payment: Record<string, unknown>,
) {
  const paidEndpoint = new URL("/api/wallet-risk", request.url);
  paidEndpoint.searchParams.set("address", input.address);
  const response = await fetch(paidEndpoint, {
    method: "GET",
    headers: {
      "PAYMENT-SIGNATURE": encodeX402Header(payment),
      "X-IntentFence-Source": "mcp-wallet-risk",
    },
  });
  const rawBody = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    body = {
      error: "upstream_invalid_response",
      message: "The wallet-risk assessment returned invalid JSON.",
    };
  }
  if (response.status === 402) {
    const required = decodeX402Header(response.headers.get("PAYMENT-REQUIRED"));
    const paymentRequired = isRecord(required)
      ? required
      : createWalletRiskPaymentRequired(paidEndpoint.toString(), "Payment verification failed");
    return toolError("Payment verification failed", paymentRequired);
  }
  if (!response.ok || !isRecord(body)) {
    const message = isRecord(body) && typeof body.detail === "string"
      ? body.detail
      : "The wallet-risk assessment could not be processed.";
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

async function callUsCpi(
  request: Request,
  input: ReturnType<typeof validateUsCpiInput>,
  payment: Record<string, unknown>,
) {
  const paidEndpoint = new URL("/api/us-cpi", request.url);
  if (input.month) paidEndpoint.searchParams.set("month", input.month);
  const response = await fetch(paidEndpoint, {
    method: "GET",
    headers: {
      "PAYMENT-SIGNATURE": encodeX402Header(payment),
      "X-IntentFence-Source": "mcp-us-cpi",
    },
  });
  const rawBody = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    body = { error: "upstream_invalid_response", message: "The U.S. CPI response returned invalid JSON." };
  }
  if (response.status === 402) {
    const required = decodeX402Header(response.headers.get("PAYMENT-REQUIRED"));
    const paymentRequired = isRecord(required)
      ? required
      : createUsCpiPaymentRequired(paidEndpoint.toString(), "Payment verification failed");
    return toolError("Payment verification failed", paymentRequired);
  }
  if (!response.ok || !isRecord(body)) {
    const message = isRecord(body) && typeof body.detail === "string"
      ? body.detail
      : "The U.S. CPI request could not be processed.";
    return toolError(message);
  }
  const paymentResponseHeader = response.headers.get("PAYMENT-RESPONSE");
  const paymentResponse = decodeX402Header(paymentResponseHeader) ?? paymentResponseHeader;
  return {
    content: [{ type: "text", text: JSON.stringify(body) }],
    structuredContent: body,
    isError: false,
    _meta: paymentResponse ? { [MCP_PAYMENT_RESPONSE_META_KEY]: paymentResponse } : undefined,
  };
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
      serverInfo: { name: "IntentFence", version: "0.16.0" },
      instructions: "Use intentfence_checkout to choose a paid outcome and receive an exact, budget-capped machine checkout without initiating payment. Use intentfence_authorize_action immediately before a consequential tool call and execute only when its short-lived, action-bound receipt verifies. Use intentfence_agent_risk_scan to inspect MCP metadata. The authorization service never executes the downstream action. Production policy packs, x402 readiness, wallet risk, quote assessment, verified preflight, and official data remain paid tools.",
    }, protocolVersion);
  }

  if (body.method === "ping") return jsonRpc(request, body.id, {});

  if (body.method === "tools/list") {
    await recordFunnelEvent({
      eventName: "discovery_served",
      request,
      metadata: { protocol: "mcp", tools: 10 },
    });
    return jsonRpc(request, body.id, {
      tools: [
        {
          name: "intentfence_authorize_action",
          title: "IntentFence Action Authorization",
          description: "Authorize an exact agent action against an explicit allowlist, spend ceiling, retention ceiling, and optional action-bound approval. Returns a five-minute ES256 receipt and never executes the downstream action. Callers must verify the receipt and fail closed if the action changes.",
          inputSchema: actionAuthorizationInputSchema,
          annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        },
        {
          name: "intentfence_agent_risk_scan",
          title: "IntentFence MCP Agent Risk Scan",
          description: "Free metadata-only scan of caller-supplied MCP tool definitions for missing schemas, unsafe annotations, approval binding, and cost boundaries. Does not execute tools or certify security.",
          inputSchema: agentRiskScanInputSchema,
          annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        },
        {
          name: "intentfence_checkout",
          title: "IntentFence Agent Checkout",
          description: "Free machine checkout builder. Select a paid IntentFence outcome and receive the exact endpoint, validated request, USDC cap, shell-safe Agentic Wallet argv, MCP tool call, and opt-in local auto-payment budget. It never signs or initiates payment.",
          inputSchema: agentCheckoutInputSchema,
          annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        },
        {
          name: "intentfence_preflight",
          title: "IntentFence Preview",
          description: "Free declared-input preview with no signed receipt, authorization proof, or enforcement guarantee. Returns safe_to_proceed, needs_review, or denied.",
          inputSchema: preflightInputSchema,
          annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        },
        {
          name: "intentfence_policy_pack",
          title: "IntentFence Production Policy Pack",
          description: "Paid self-service integration pack (1 USDC on Base). Generates a runtime-specific TypeScript guard, signed action and policy receipt, negative test vectors, and a fail-closed deployment checklist for Cloudflare Agents, Coinbase AgentKit, or an MCP gateway. No meeting or account is required.",
          inputSchema: policyPackInputSchema,
          annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
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
        {
          name: "intentfence_x402_readiness",
          title: "IntentFence Live x402 Readiness",
          description: "Paid live endpoint check ($0.002 USDC on Base). Makes one bounded credential-free request to a public HTTPS target, blocks private networks and redirects, never pays the target, validates the returned x402 challenge, and returns a signed five-minute receipt.",
          inputSchema: x402ReadinessInputSchema,
          annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
        },
        {
          name: "intentfence_wallet_risk",
          title: "IntentFence Wallet Risk",
          description: "Paid AML/KYT wallet screening ($0.002 USDC on Base) before sending funds or approving a transaction. Checks live Base activity plus GoPlus sanctions, phishing, mixer, money-laundering, dark-web, blacklist, and related counterparty-risk flags, then returns a five-minute ES256 receipt. A low-risk result is not proof of identity, ownership, authorization, or future behavior.",
          inputSchema: walletRiskInputSchema,
          annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
        },
        {
          name: "intentfence_us_cpi",
          title: "IntentFence Official U.S. CPI",
          description: "Paid official U.S. CPI and core CPI data ($0.001 USDC on Base), retrieved from the Bureau of Labor Statistics with a six-hour edge cache and returned with an ES256 provenance receipt. Optionally request a YYYY-MM period.",
          inputSchema: usCpiInputSchema,
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
      toolName !== "intentfence_authorize_action" &&
      toolName !== "intentfence_agent_risk_scan" &&
      toolName !== "intentfence_checkout" &&
      toolName !== "intentfence_policy_pack" &&
      toolName !== "intentfence_verified_preflight" &&
      toolName !== "intentfence_x402_assessment" &&
      toolName !== "intentfence_x402_readiness" &&
      toolName !== "intentfence_wallet_risk" &&
      toolName !== "intentfence_us_cpi"
    ) {
      return jsonRpc(request, body.id, {
        content: [{ type: "text", text: "Unknown tool name." }],
        isError: true,
      });
    }
    try {
      if (toolName === "intentfence_authorize_action") {
        const rateLimit = await enforceRequestRateLimit(request, "mcp_action_authorization", 30);
        if (!rateLimit.allowed) {
          return jsonRpc(request, body.id, {
            content: [{ type: "text", text: "Action authorization rate limit exceeded. Fail closed and retry after the current window." }],
            isError: true,
          });
        }
        const input = validateActionAuthorizationInput(toolParams.arguments ?? {});
        const decision = await evaluateActionAuthorization(input);
        const signingKey = await getReceiptSigningPrivateJwk();
        if (!signingKey) throw new Error("Signing unavailable");
        const receipt = await createSignedActionAuthorizationReceipt(decision, signingKey);
        const result = { ...decision, receipt };
        await recordFunnelEvent({
          eventName: decision.status === "safe_to_proceed" ? "action_authorized" : "action_denied",
          request,
          requestId: decision.request_id,
          subject: input.subject,
          metadata: { status: decision.status, protocol: "mcp", action_type: input.action.type },
        });
        return jsonRpc(request, body.id, {
          content: [{ type: "text", text: JSON.stringify(result) }],
          structuredContent: result,
          isError: false,
        });
      }

      if (toolName === "intentfence_agent_risk_scan") {
        const rateLimit = await enforceRequestRateLimit(request, "mcp_agent_risk_scan", 20);
        if (!rateLimit.allowed) {
          return jsonRpc(request, body.id, {
            content: [{ type: "text", text: "Agent risk scan rate limit exceeded. Retry after the current window." }],
            isError: true,
          });
        }
        const input = validateAgentRiskScanInput(toolParams.arguments ?? {});
        const result = scanAgentToolMetadata(input);
        await recordFunnelEvent({
          eventName: "risk_scan_completed",
          request,
          requestId: result.scan_id,
          subject: input.server_name,
          metadata: { score: result.score, grade: result.grade, risk: result.risk, tool_count: result.tool_count },
        });
        return jsonRpc(request, body.id, {
          content: [{ type: "text", text: JSON.stringify(result) }],
          structuredContent: result,
          isError: false,
        });
      }

      if (toolName === "intentfence_checkout") {
        const checkout = buildAgentCheckout(toolParams.arguments ?? {});
        await recordFunnelEvent({
          eventName: "checkout_selected",
          request,
          metadata: {
            protocol: "mcp",
            product: checkout.product.id,
            example_only: checkout.example_only,
          },
        });
        return jsonRpc(request, body.id, {
          content: [{ type: "text", text: JSON.stringify(checkout) }],
          structuredContent: checkout,
          isError: false,
        });
      }

      if (toolName === "intentfence_policy_pack") {
        const input = validatePolicyPackInput(toolParams.arguments ?? {});
        const payment = x402PaymentFromParams(toolParams);
        if (!payment) {
          const paidEndpoint = new URL("/api/policy-packs", request.url).toString();
          const paymentRequired = createPolicyPackPaymentRequired(paidEndpoint);
          await recordFunnelEvent({
            eventName: paymentChallengeEventName(request),
            request,
            subject: input.authorization.subject,
            metadata: {
              protocol: "mcp-x402",
              product: "policy-pack",
              runtime: input.runtime,
            },
          });
          return jsonRpc(request, body.id, toolError("Payment required", paymentRequired));
        }
        return jsonRpc(request, body.id, await callPolicyPack(request, input, payment));
      }

      if (toolName === "intentfence_us_cpi") {
        const input = validateUsCpiInput(toolParams.arguments ?? {});
        const payment = x402PaymentFromParams(toolParams);
        const paidEndpoint = new URL("/api/us-cpi", request.url);
        if (input.month) paidEndpoint.searchParams.set("month", input.month);
        if (!payment) {
          const paymentRequired = createUsCpiPaymentRequired(paidEndpoint.toString());
          await recordFunnelEvent({
            eventName: paymentChallengeEventName(request),
            request,
            subject: "official-data://bls/us-cpi",
            metadata: { protocol: "mcp-x402", product: "us-cpi" },
          });
          return jsonRpc(request, body.id, toolError("Payment required", paymentRequired));
        }
        return jsonRpc(request, body.id, await callUsCpi(request, input, payment));
      }

      if (toolName === "intentfence_wallet_risk") {
        const input = validateWalletRiskInput(toolParams.arguments ?? {});
        const payment = x402PaymentFromParams(toolParams);
        const paidEndpoint = new URL("/api/wallet-risk", request.url);
        paidEndpoint.searchParams.set("address", input.address);
        if (!payment) {
          const paymentRequired = createWalletRiskPaymentRequired(paidEndpoint.toString());
          await recordFunnelEvent({
            eventName: paymentChallengeEventName(request),
            request,
            subject: input.address,
            metadata: { protocol: "mcp-x402", product: "wallet-risk" },
          });
          return jsonRpc(request, body.id, toolError("Payment required", paymentRequired));
        }
        return jsonRpc(request, body.id, await callWalletRisk(request, input, payment));
      }

      if (toolName === "intentfence_x402_readiness") {
        const input = validateX402ReadinessInput(toolParams.arguments ?? {});
        const payment = x402PaymentFromParams(toolParams);
        if (!payment) {
          const paidEndpoint = new URL("/api/x402-readiness", request.url).toString();
          const paymentRequired = createX402ReadinessPaymentRequired(paidEndpoint);
          await recordFunnelEvent({
            eventName: paymentChallengeEventName(request),
            request,
            subject: input.target_url,
            metadata: { protocol: "mcp-x402", product: "x402-readiness" },
          });
          return jsonRpc(request, body.id, toolError("Payment required", paymentRequired));
        }
        return jsonRpc(request, body.id, await callX402Readiness(request, input, payment));
      }

      if (toolName === "intentfence_x402_assessment") {
        const input = validateX402AssessmentInput(toolParams.arguments ?? {});
        const payment = x402PaymentFromParams(toolParams);
        if (!payment) {
          const paidEndpoint = new URL("/api/x402-assessments", request.url).toString();
          const paymentRequired = createX402AssessmentPaymentRequired(paidEndpoint);
          await recordFunnelEvent({
            eventName: paymentChallengeEventName(request),
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
            eventName: paymentChallengeEventName(request),
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
          error instanceof X402AssessmentValidationError ||
          error instanceof X402ReadinessValidationError ||
          error instanceof WalletRiskValidationError ||
          error instanceof UsCpiValidationError ||
          error instanceof ActionAuthorizationValidationError ||
          error instanceof PolicyPackValidationError ||
          error instanceof AgentRiskScanValidationError ||
          error instanceof AgentCheckoutValidationError
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
