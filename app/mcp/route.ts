import {
  evaluatePreflight,
  preflightInputSchema,
  PreflightValidationError,
  validatePreflightInput,
} from "../../lib/preflight";
import { JsonRequestError, readJsonWithLimit } from "../../lib/request";

const SITE_ORIGIN = "https://agentpass-protocol.rmalka06.chatgpt.site";
const LATEST_PROTOCOL_VERSION = "2025-11-25";
const SUPPORTED_PROTOCOL_VERSIONS = new Set([
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

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin");
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin === SITE_ORIGIN ? origin : SITE_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
    "Access-Control-Allow-Headers": "Accept, Content-Type, MCP-Protocol-Version, MCP-Session-Id",
    "Access-Control-Expose-Headers": "MCP-Protocol-Version",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
    Vary: "Origin",
  };
}

function validOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === SITE_ORIGIN;
}

function jsonRpc(request: Request, id: JsonRpcRequest["id"], result: unknown) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: id ?? null, result }), {
    status: 200,
    headers: corsHeaders(request),
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
    value = await readJsonWithLimit(request);
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
    return jsonRpc(request, body.id, {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "IntentFence", version: "0.5.0" },
      instructions: "Call intentfence_preflight immediately before an autonomous action, then block the downstream tool call unless the policy allows it.",
    });
  }

  if (body.method === "ping") return jsonRpc(request, body.id, {});

  if (body.method === "tools/list") {
    return jsonRpc(request, body.id, {
      tools: [
        {
          name: "intentfence_preflight",
          title: "IntentFence Preflight",
          description: "Evaluate spend, scope, data, and approval constraints before an agent tool call. Returns safe_to_proceed, needs_review, or denied.",
          inputSchema: preflightInputSchema,
          annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        },
      ],
    });
  }

  if (body.method === "tools/call") {
    if (body.params?.name !== "intentfence_preflight") {
      return jsonRpc(request, body.id, {
        content: [{ type: "text", text: "Unknown tool name." }],
        isError: true,
      });
    }
    try {
      const input = validatePreflightInput(body.params.arguments ?? {});
      const decision = evaluatePreflight(input);
      return jsonRpc(request, body.id, {
        content: [{ type: "text", text: JSON.stringify(decision) }],
        structuredContent: decision,
        isError: false,
      });
    } catch (error) {
      const message = error instanceof PreflightValidationError
        ? error.message
        : "The IntentFence preflight could not be processed.";
      return jsonRpc(request, body.id, {
        content: [{ type: "text", text: message }],
        isError: true,
      });
    }
  }

  return errorRpc(request, body.id, -32601, "Method not found");
}
