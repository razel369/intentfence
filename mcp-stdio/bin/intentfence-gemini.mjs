#!/usr/bin/env node

import { createInterface } from "node:readline";

import { negotiateProtocolVersion } from "../lib/protocol-version.mjs";
import { validateX402AssessmentInput } from "../lib/x402-assessment.mjs";
import { validateX402ReadinessInput } from "../lib/x402-readiness.mjs";
import { validateWalletRiskInput } from "../lib/wallet-risk.mjs";
import { validateUsCpiInput } from "../lib/us-cpi.mjs";

const baseUrl = (process.env.INTENTFENCE_BASE_URL ??
  "https://agentpass-protocol.rmalka06.chatgpt.site").replace(/\/$/u, "");

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

const assessmentInputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["subject", "target_url", "payment_required", "policy"],
  properties: {
    subject: { type: "string", minLength: 1, maxLength: 200 },
    target_url: { type: "string", format: "uri", maxLength: 2048 },
    method: { type: "string", enum: ["GET", "HEAD", "POST"], default: "GET" },
    payment_required: {
      type: "string",
      minLength: 1,
      maxLength: 16384,
      pattern: "^[A-Za-z0-9+/_-]+={0,2}$",
      description: "Exact base64 or base64url PAYMENT-REQUIRED header observed by the caller.",
    },
    policy: {
      type: "object",
      additionalProperties: false,
      required: ["max_price_usdc"],
      properties: {
        max_price_usdc: {
          type: "string",
          pattern: "^(?:0|[1-9][0-9]{0,11})(?:\\.[0-9]{1,6})?$",
        },
        allowed_payees: {
          type: "array",
          minItems: 1,
          maxItems: 20,
          items: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
        },
      },
    },
  },
};

const walletRiskInputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["address"],
  properties: {
    address: {
      type: "string",
      pattern: "^0x[0-9a-fA-F]{40}$",
      description: "Base recipient or counterparty address to assess before payment.",
    },
  },
};

const readinessInputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["target_url"],
  properties: {
    subject: { type: "string", minLength: 1, maxLength: 200 },
    target_url: { type: "string", format: "uri", maxLength: 2048 },
    method: { type: "string", enum: ["GET", "HEAD", "POST"], default: "GET" },
    body: {},
    max_price_usdc: { type: "string", pattern: "^(?:0|[1-9][0-9]{0,11})(?:\\.[0-9]{1,6})?$" },
    allowed_payees: { type: "array", minItems: 1, maxItems: 20, items: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" } },
    policy: { type: "object", additionalProperties: false, required: ["max_price_usdc"], properties: {
      max_price_usdc: { type: "string", pattern: "^(?:0|[1-9][0-9]{0,11})(?:\\.[0-9]{1,6})?$" },
      allowed_payees: { type: "array", minItems: 1, maxItems: 20, items: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" } },
    } },
  },
};

const usCpiInputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    month: { type: "string", pattern: "^\\d{4}-(?:0[1-9]|1[0-2])$" },
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
  {
    name: "intentfence_x402_assessment",
    title: "IntentFence x402 Quote Assessment",
    description: "Paid assessment costing 0.005 USDC on Base. The caller forwards its exact PAYMENT-REQUIRED header; IntentFence validates the quote, payee, asset, price, timeout, and resource binding without contacting the target, then returns a short-lived signed receipt bound to the quote hash.",
    inputSchema: assessmentInputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  {
    name: "intentfence_x402_readiness",
    title: "IntentFence Live x402 Readiness",
    description: "Paid live endpoint check costing 0.002 USDC on Base. Makes one bounded credential-free request, blocks private networks and redirects, never pays the target, validates the returned x402 challenge, and returns a signed five-minute receipt.",
    inputSchema: readinessInputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  {
    name: "intentfence_wallet_risk",
    title: "IntentFence Wallet Risk",
    description: "Paid AML/KYT wallet screening costing 0.002 USDC on Base. Checks live activity plus sanctions, phishing, mixer, money-laundering, dark-web, blacklist, and related counterparty-risk flags, then returns a five-minute signed receipt. A low-risk result is not proof of identity or ownership.",
    inputSchema: walletRiskInputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  {
    name: "intentfence_us_cpi",
    title: "IntentFence Official U.S. CPI",
    description: "Paid official U.S. headline and core CPI data costing 0.001 USDC on Base, sourced from BLS with a signed provenance receipt.",
    inputSchema: usCpiInputSchema,
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

  const assessment = name === "intentfence_x402_assessment";
  const readiness = name === "intentfence_x402_readiness";
  const walletRisk = name === "intentfence_wallet_risk";
  const usCpi = name === "intentfence_us_cpi";
  const paid = name === "intentfence_verified_preflight" || assessment || readiness || walletRisk || usCpi;
  const arguments_ = assessment
    ? validateX402AssessmentInput(params?.arguments ?? {})
    : readiness
      ? validateX402ReadinessInput(params?.arguments ?? {})
    : walletRisk
      ? validateWalletRiskInput(params?.arguments ?? {})
      : usCpi
        ? validateUsCpiInput(params?.arguments ?? {})
      : params?.arguments ?? {};
  const payment = params?._meta?.["x402/payment"];
  const headers = {
    "Content-Type": "application/json",
    "X-IntentFence-Source": "gemini-extension",
  };
  if (paid && payment && typeof payment === "object") {
    headers["PAYMENT-SIGNATURE"] = encode(payment);
  }

  const endpoint = walletRisk
    ? `${baseUrl}/api/wallet-risk?address=${encodeURIComponent(arguments_.address)}`
    : usCpi
      ? `${baseUrl}/api/us-cpi${arguments_.month ? `?month=${encodeURIComponent(arguments_.month)}` : ""}`
    : `${baseUrl}${assessment ? "/api/x402-assessments" : readiness ? "/api/x402-readiness" : paid ? "/api/preflight/verified" : "/api/preflight"}`;
  const response = await fetch(endpoint, walletRisk || usCpi
    ? { method: "GET", headers }
    : { method: "POST", headers, body: JSON.stringify(arguments_) });
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
        protocolVersion: negotiateProtocolVersion(request.params?.protocolVersion),
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "intentfence", version: "0.11.0" },
        instructions: "Before signing an x402 payment, use intentfence_x402_readiness to inspect the live endpoint without paying it, use intentfence_wallet_risk to check the recipient, or forward an already-observed PAYMENT-REQUIRED header to intentfence_x402_assessment. The free preflight remains an unsigned declared-input preview.",
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
