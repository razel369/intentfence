#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

import {
  evaluatePreflight,
  PreflightValidationError,
  validatePreflightInput,
} from "../lib/preflight.mjs";
import { createPaidPreflightHandler } from "../lib/paid-preflight.mjs";

const SITE_URL = "https://agentpass-protocol.rmalka06.chatgpt.site";

const server = new McpServer(
  {
    name: "intentfence",
    title: "IntentFence Policy Gate",
    version: "0.6.1",
    websiteUrl: SITE_URL,
    description:
      "A declared-input policy gate for autonomous AI actions, including spend, scope, data-retention, and human-approval constraints.",
  },
  {
    instructions:
      "Call intentfence_preflight immediately before an autonomous action. Do not execute the downstream action when the result is denied; route needs_review to the appropriate approval flow. IntentFence evaluates caller-declared inputs and does not independently prove real-world authorization.",
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

const transport = new StdioServerTransport();
await server.connect(transport);
