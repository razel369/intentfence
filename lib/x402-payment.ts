import type { RouteConfig } from "@x402/core/server";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { preflightInputSchema } from "./preflight";
import {
  INTENTFENCE_NETWORK,
  INTENTFENCE_PAY_TO,
  INTENTFENCE_PAYMENT_TIMEOUT_SECONDS,
  INTENTFENCE_PRICE_ATOMIC,
  INTENTFENCE_PRICE_USD,
  INTENTFENCE_USDC_CONTRACT,
} from "./x402";

export const INTENTFENCE_SITE_URL = "https://agentpass-protocol.rmalka06.chatgpt.site";

export const intentFenceDiscoveryExtensions = declareDiscoveryExtension({
  input: {
    subject: "did:web:checkout-agent",
    action: { type: "purchase", resource: "order-1842" },
    constraints: {
      currency: "USD",
      cost_ceiling: 100,
      quoted_cost: 79,
      data_retention_hours: 24,
      human_approval: "not_required",
    },
  },
  inputSchema: preflightInputSchema,
  bodyType: "json",
  output: {
    example: {
      intentfence: "0.5",
      request_id: "7d7fbf44-3c39-4eca-89d6-b44d756c8df1",
      status: "safe_to_proceed",
      verification_tier: "x402-settled",
      receipt: { signed: true, format: "JWS Compact", algorithm: "ES256" },
    },
    schema: {
      properties: {
        intentfence: { type: "string", const: "0.5" },
        request_id: { type: "string", format: "uuid" },
        status: {
          type: "string",
          enum: ["safe_to_proceed", "needs_review", "denied"],
        },
        verification_tier: { type: "string", const: "x402-settled" },
        receipt: { type: "object" },
      },
      required: ["intentfence", "request_id", "status", "verification_tier", "receipt"],
    },
  },
});

export const intentFencePaymentRequiredExtensions = {
  bazaar: {
    ...intentFenceDiscoveryExtensions.bazaar,
    info: {
      ...intentFenceDiscoveryExtensions.bazaar.info,
      input: {
        ...intentFenceDiscoveryExtensions.bazaar.info.input,
        method: "POST" as const,
      },
    },
  },
};

export const intentFencePaidRouteConfig = {
  accepts: {
    scheme: "exact",
    price: INTENTFENCE_PRICE_USD,
    network: INTENTFENCE_NETWORK,
    payTo: INTENTFENCE_PAY_TO,
  },
  description: "Run a paid IntentFence preflight and receive x402 on-chain settlement proof.",
  mimeType: "application/json",
  serviceName: "IntentFence",
  tags: ["ai-agents", "payment-firewall", "preflight", "policy", "x402", "usdc"],
  iconUrl: `${INTENTFENCE_SITE_URL}/favicon.svg`,
  unpaidResponseBody: () => ({
    contentType: "application/json",
    body: {
      error: "payment_required",
      message: `Pay ${INTENTFENCE_PRICE_USD} in USDC on Base to run this verified preflight.`,
      payment_info: `${INTENTFENCE_SITE_URL}/api/payments`,
    },
  }),
} satisfies RouteConfig;

export function createIntentFencePaymentRequired(resourceUrl: string, error = "Payment required") {
  return {
    x402Version: 2,
    error,
    resource: {
      url: resourceUrl,
      description: intentFencePaidRouteConfig.description,
      mimeType: intentFencePaidRouteConfig.mimeType,
      serviceName: intentFencePaidRouteConfig.serviceName,
      tags: intentFencePaidRouteConfig.tags,
      iconUrl: intentFencePaidRouteConfig.iconUrl,
    },
    accepts: [
      {
        scheme: "exact",
        network: INTENTFENCE_NETWORK,
        amount: INTENTFENCE_PRICE_ATOMIC,
        asset: INTENTFENCE_USDC_CONTRACT,
        payTo: INTENTFENCE_PAY_TO,
        maxTimeoutSeconds: INTENTFENCE_PAYMENT_TIMEOUT_SECONDS,
        extra: { name: "USD Coin", version: "2" },
      },
    ],
    extensions: intentFencePaymentRequiredExtensions,
  };
}

export function encodeX402Header(value: unknown) {
  return btoa(JSON.stringify(value));
}

export function decodeX402Header(value: string | null): unknown | null {
  if (!value) return null;
  try {
    return JSON.parse(atob(value)) as unknown;
  } catch {
    return null;
  }
}
