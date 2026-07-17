#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

import {
  evaluatePreflight,
  PreflightValidationError,
  validatePreflightInput,
} from "../lib/preflight.mjs";
import {
  createPaidIntentFenceHandler,
  createPaidPreflightHandler,
} from "../lib/paid-preflight.mjs";
import { validateX402AssessmentInput } from "../lib/x402-assessment.mjs";

const SITE_URL = "https://agentpass-protocol.rmalka06.chatgpt.site";

const server = new McpServer(
  {
    name: "intentfence",
    title: "IntentFence Policy Gate",
    version: "0.7.0",
    websiteUrl: SITE_URL,
    description:
      "A declared-input policy gate for autonomous AI actions, including spend, scope, data-retention, and human-approval constraints.",
  },
  {
    instructions:
      "Before paying an unfamiliar x402 resource, forward the exact caller-observed PAYMENT-REQUIRED header to intentfence_x402_assessment. It validates and hashes that quote without contacting the target, then returns a signed assessment. intentfence_preflight remains a free declared-input preview.",
  },
);

const checkSchema = z.object({
  name: z.enum(["identity", "scope", "cost", "data", "approval"]),
  status: z.enum(["pass", "review", "deny"]),
  detail: z.string(),
});

server.registerTool(
  "intentfence_preflight",
  {
    title: "Evaluate an autonomous action before execution",
    description:
      "Run a read-only preflight policy check immediately before an AI agent performs a consequential tool call. Supply the acting principal, exact action, quoted cost and ceiling, data-retention limit, approval requirement, and any approval proof. The result is safe_to_proceed, needs_review, or denied. This tool evaluates caller-declared inputs; it does not execute the action, transfer funds, or independently verify authorization.",
    inputSchema: {
      subject: z
        .string()
        .trim()
        .min(1)
        .max(200)
        .describe("Stable identifier for the AI agent or human principal that will perform the action."),
      action: z
        .object({
          type: z
            .string()
            .trim()
            .min(1)
            .max(120)
            .describe("Canonical action type, such as purchase, transfer, delete, deploy, or send_message."),
          resource: z
            .string()
            .trim()
            .max(500)
            .optional()
            .describe("Target resource, recipient, endpoint, asset, or record affected by the action."),
        })
        .describe("The exact downstream action that is about to be executed."),
      constraints: z
        .object({
          currency: z
            .string()
            .trim()
            .max(12)
            .optional()
            .describe("Currency or token symbol used by quoted_cost and cost_ceiling, for example USDC or USD."),
          cost_ceiling: z
            .number()
            .min(0)
            .max(1_000_000_000_000)
            .optional()
            .describe("Maximum amount the principal permits this action to spend."),
          quoted_cost: z
            .number()
            .min(0)
            .max(1_000_000_000_000)
            .optional()
            .describe("Amount the downstream service currently quotes for the action."),
          data_retention_hours: z
            .number()
            .min(0)
            .max(1_000_000_000_000)
            .optional()
            .describe("Maximum declared number of hours the downstream service will retain action data."),
          human_approval: z
            .enum(["required", "optional", "not_required"])
            .optional()
            .describe("Whether declared policy requires a human to approve this specific action."),
        })
        .optional()
        .describe("Policy limits that must be checked before execution."),
      proofs: z
        .array(z.string().trim().min(1).max(200))
        .max(20)
        .optional()
        .describe("Attached proof labels. Include human_approval when required approval has been obtained."),
    },
    outputSchema: {
      intentfence: z.literal("0.5"),
      request_id: z.string(),
      status: z.enum(["safe_to_proceed", "needs_review", "denied"]),
      checks: z.array(checkSchema),
      receipt: z.object({
        id: z.string(),
        issued_at: z.string(),
        subject: z.string().nullable(),
        action: z
          .object({
            type: z.string().optional(),
            resource: z.string().optional(),
          })
          .nullable(),
        signed: z.literal(false),
        assurance: z.literal("declared-input-policy"),
        note: z.string(),
      }),
      links: z.object({
        discovery: z.string(),
        openapi: z.string(),
        pricing: z.string(),
      }),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async (arguments_) => {
    try {
      const input = validatePreflightInput(arguments_);
      const decision = evaluatePreflight(input);
      return {
        content: [{ type: "text", text: JSON.stringify(decision, null, 2) }],
        structuredContent: decision,
      };
    } catch (error) {
      const message =
        error instanceof PreflightValidationError
          ? error.message
          : "The IntentFence preflight could not be processed.";
      return {
        content: [{ type: "text", text: message }],
        isError: true,
      };
    }
  },
);

server.registerTool(
  "intentfence_verified_preflight",
  {
    title: "Run a settled IntentFence payment preflight",
    description:
      "Production preflight costing 0.005 USDC on Base. On the first call, returns a standard x402 payment challenge. Retry with _meta['x402/payment']; success returns an ES256-signed receipt and _meta['x402/payment-response']. No IntentFence account or API key is required.",
    inputSchema: {
      subject: z.string().trim().min(1).max(200),
      action: z.object({
        type: z.string().trim().min(1).max(120),
        resource: z.string().trim().max(500).optional(),
      }),
      constraints: z.object({
        currency: z.string().trim().max(12).optional(),
        cost_ceiling: z.number().min(0).max(1_000_000_000_000).optional(),
        quoted_cost: z.number().min(0).max(1_000_000_000_000).optional(),
        data_retention_hours: z.number().min(0).max(1_000_000_000_000).optional(),
        human_approval: z.enum(["required", "optional", "not_required"]).optional(),
      }).optional(),
      proofs: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  createPaidPreflightHandler({
    validateInput: validatePreflightInput,
    source: "npm-mcp",
  }),
);

server.registerTool(
  "intentfence_x402_assessment",
  {
    title: "Assess a caller-observed x402 quote before paying it",
    description:
      "Costs 0.005 USDC on Base. Forward the exact base64 or base64url PAYMENT-REQUIRED header observed by the caller. IntentFence validates the quote against a USDC ceiling and payee allowlist without contacting the target, then returns a short-lived ES256 receipt bound to the quote hash. Supply allowed_payees for safe_to_proceed; omission yields needs_review.",
    inputSchema: {
      subject: z.string().trim().min(1).max(200),
      target_url: z.string().url().max(2048),
      method: z.enum(["GET", "HEAD", "POST"]).default("GET"),
      payment_required: z
        .string()
        .trim()
        .min(1)
        .max(16_384)
        .regex(/^[A-Za-z0-9+/_-]+={0,2}$/u)
        .describe("Exact base64 or base64url PAYMENT-REQUIRED header observed by the caller."),
      policy: z.object({
        max_price_usdc: z
          .string()
          .regex(/^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,6})?$/u),
        allowed_payees: z
          .array(z.string().regex(/^0x[0-9a-fA-F]{40}$/u))
          .min(1)
          .max(20)
          .optional(),
      }),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  createPaidIntentFenceHandler({
    validateInput: validateX402AssessmentInput,
    source: "npm-mcp-x402-assessment",
    endpoint: "/api/x402-assessments",
    failureMessage: "The IntentFence x402 quote assessment could not be processed.",
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
