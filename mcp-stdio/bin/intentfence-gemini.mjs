#!/usr/bin/env node

import { createInterface } from "node:readline";

const baseUrl = (process.env.INTENTFENCE_BASE_URL ??
  "https://agentpass-protocol.rmalka06.chatgpt.site").replace(/\/$/u, "");
const latestProtocolVersion = "2025-11-25";

const inputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["subject", "action"],
  properties: {
    subject: { type: "string", minLength: 1, maxLength: 200 },
    action: {
      type: "object",
      additionalProperties: false,
      required: ["type"],
      properties: {
        type: { type: "string", minLength: 1, maxLength: 120 },
        resource: { type: "string", maxLength: 500 },
      },
    },
    constraints: {
      type: "object",
      additionalProperties: false,
      properties: {
        currency: { type: "string", maxLength: 12 },
        cost_ceiling: { type: "number", minimum: 0 },
        quoted_cost: { type: "number", minimum: 0 },
        data_retention_hours: { type: "number", minimum: 0 },
        human_approval: { type: "string", enum: ["required", "optional", "not_required"] },
      },
    },
    proofs: {
      type: "array",
      maxItems: 20,
      items: { type: "string", minLength: 1, maxLength: 200 },
    },
  },
};

const tools = [
  {
    name: "intentfence_preflight",
    title: "IntentFence Preview",
    description: "Free unsigned preview of caller-declared payment constraints. This does not authorize or execute the downstream payment.",
    inputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  {
    name: "intentfence_verified_preflight",
    title: "IntentFence Verified Preflight",
    description: "Paid production preflight costing 0.005 USDC on Base. Uses x402 and returns a signed declared-input receipt plus service-fee settlement metadata.",
    inputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
];

function encode(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function decode(value) {
  if (!value) return null;
  try {
    return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function result(id, value) {
  send({ jsonrpc: "2.0", id, result: value });
}

function error(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

async function callTool(params) {
  const name = params?.name;
  if (!tools.some((tool) => tool.name === name)) {
    return { content: [{ type: "text", text: "Unknown tool name." }], isError: true };
  }

  const paid = name === "intentfence_verified_preflight";
  const payment = params?._meta?.["x402/payment"];
  const headers = {
    "Content-Type": "application/json",
    "X-IntentFence-Source": "gemini-extension",
  };
  if (paid && payment && typeof payment === "object") {
    headers["PAYMENT-SIGNATURE"] = encode(payment);
  }

  const response = await fetch(
    `${baseUrl}${paid ? "/api/preflight/verified" : "/api/preflight"}`,
    { method: "POST", headers, body: JSON.stringify(params?.arguments ?? {}) },
  );
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { error: "invalid_remote_response", message: text.slice(0, 500) };
  }

  if (response.status === 402) {
    const required = decode(response.headers.get("payment-required"));
    if (!required) throw new Error("IntentFence omitted PAYMENT-REQUIRED.");
    return {
      content: [{ type: "text", text: JSON.stringify(required) }],
      structuredContent: required,
      isError: true,
    };
  }
  if (!response.ok) {
    return {
      content: [{ type: "text", text: body?.message ?? "IntentFence request failed." }],
      isError: true,
    };
  }

  const paymentResponseHeader = response.headers.get("payment-response");
  const paymentResponse = decode(paymentResponseHeader) ?? paymentResponseHeader;
  return {
    content: [{ type: "text", text: JSON.stringify(body) }],
    structuredContent: body,
    ...(paymentResponse ? { _meta: { "x402/payment-response": paymentResponse } } : {}),
  };
}

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", async (line) => {
  if (!line.trim()) return;
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    error(null, -32700, "Parse error");
    return;
  }

  if (request.id === undefined) return;
  try {
    if (request.method === "initialize") {
      result(request.id, {
        protocolVersion: latestProtocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "intentfence", version: "0.6.0" },
        instructions: "Use the free tool only as an unsigned preview. For an in-scope production payment, use the verified tool and proceed only when the returned status is safe_to_proceed and the target independently authorizes the action.",
      });
      return;
    }
    if (request.method === "ping") {
      result(request.id, {});
      return;
    }
    if (request.method === "tools/list") {
      result(request.id, { tools });
      return;
    }
    if (request.method === "tools/call") {
      result(request.id, await callTool(request.params));
      return;
    }
    error(request.id, -32601, "Method not found");
  } catch (cause) {
    result(request.id, {
      content: [{
        type: "text",
        text: cause instanceof Error ? cause.message : "IntentFence request failed.",
      }],
      isError: true,
    });
  }
});
