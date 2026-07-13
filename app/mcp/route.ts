import { evaluatePreflight, preflightInputSchema, type PreflightInput } from "../../lib/preflight";

const SITE_ORIGIN = "https://agentpass-protocol.rmalka06.chatgpt.site";

function headers(request: Request) {
  const origin = request.headers.get("origin");
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin === SITE_ORIGIN ? origin : SITE_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, MCP-Protocol-Version",
    "MCP-Protocol-Version": "2025-11-25",
  };
}

function jsonRpc(request: Request, id: unknown, result: unknown, status = 200) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    status,
    headers: headers(request),
  });
}

function errorRpc(request: Request, id: unknown, code: number, message: string, status = 200) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }), {
    status,
    headers: headers(request),
  });
}

export function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== SITE_ORIGIN) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: headers(request) });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== SITE_ORIGIN) return new Response(null, { status: 403 });

  let body: { id?: unknown; method?: string; params?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return errorRpc(request, null, -32700, "Parse error", 400);
  }

  if (body.method === "notifications/initialized") {
    return new Response(null, { status: 202, headers: headers(request) });
  }

  if (body.method === "initialize") {
    return jsonRpc(request, body.id, {
      protocolVersion: "2025-11-25",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "AgentPass", version: "0.2.0" },
      instructions: "Run agentpass_preflight before an autonomous action to check identity, scope, cost, data, and approval constraints.",
    });
  }

  if (body.method === "tools/list") {
    return jsonRpc(request, body.id, {
      tools: [
        {
          name: "agentpass_preflight",
          title: "AgentPass Preflight",
          description: "Evaluate whether a proposed agent action is safe to proceed, needs review, or must be denied.",
          inputSchema: preflightInputSchema,
        },
      ],
    });
  }

  if (body.method === "tools/call") {
    if (body.params?.name !== "agentpass_preflight") {
      return errorRpc(request, body.id, -32602, "Unknown tool name");
    }
    const decision = evaluatePreflight((body.params.arguments ?? {}) as PreflightInput);
    return jsonRpc(request, body.id, {
      content: [{ type: "text", text: JSON.stringify(decision) }],
      structuredContent: decision,
      isError: false,
    });
  }

  return errorRpc(request, body.id ?? null, -32601, "Method not found");
}
