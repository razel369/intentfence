import type { RouteConfig } from "@x402/core/server";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { preflightInputSchema } from "./preflight";
import { x402AssessmentInputSchema } from "./x402-assessment";
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
  tags: ["ai-agents", "payment-firewall", "preflight", "x402", "usdc"],
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

export const x402AssessmentDiscoveryExtensions = declareDiscoveryExtension({
  input: {
    subject: "agent:buyer-07",
    target_url: "https://merchant.example/api/paid-resource",
    method: "GET",
    payment_required:
      "eyJ4NDAyVmVyc2lvbiI6MiwicmVzb3VyY2UiOnsidXJsIjoiaHR0cHM6Ly9tZXJjaGFudC5leGFtcGxlL2FwaS9wYWlkLXJlc291cmNlIiwiZGVzY3JpcHRpb24iOiJQYWlkIHJlc291cmNlIiwibWltZVR5cGUiOiJhcHBsaWNhdGlvbi9qc29uIn0sImFjY2VwdHMiOlt7InNjaGVtZSI6ImV4YWN0IiwibmV0d29yayI6ImVpcDE1NTo4NDUzIiwiYW1vdW50IjoiMTAwMDAiLCJhc3NldCI6IjB4ODMzNTg5ZkNENmVEYjZFMDhmNGM3QzMyRDRmNzFiNTRiZEEwMjkxMyIsInBheVRvIjoiMHgxMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExIiwibWF4VGltZW91dFNlY29uZHMiOjMwMCwiZXh0cmEiOnsibmFtZSI6IlVTRCBDb2luIiwidmVyc2lvbiI6IjIifX1dfQ==",
    policy: {
      max_price_usdc: "0.10",
      allowed_payees: ["0x1111111111111111111111111111111111111111"],
    },
  },
  inputSchema: x402AssessmentInputSchema,
  bodyType: "json",
  output: {
    example: {
      intentfence: "0.6",
      request_id: "7d7fbf44-3c39-4eca-89d6-b44d756c8df1",
      status: "safe_to_proceed",
      verification_tier: "x402-quote-assessment+x402-settled",
      observed: {
        x402_version: 2,
        payment_requirements_sha256:
          "6902df25de3f5724ff75332b01efab618f7082e69cb3b541a99b6cd4cbf3a2a6",
      },
      receipt: {
        signed: true,
        assurance: "caller-observed-x402-quote-assessment",
      },
    },
    schema: {
      type: "object",
      properties: {
        intentfence: { type: "string", const: "0.6" },
        request_id: { type: "string", format: "uuid" },
        status: {
          type: "string",
          enum: ["safe_to_proceed", "needs_review", "denied"],
        },
        verification_tier: {
          type: "string",
          const: "x402-quote-assessment+x402-settled",
        },
        target: { type: "object" },
        observed: { type: "object" },
        checks: { type: "array", items: { type: "object" } },
        receipt: { type: "object" },
      },
      required: [
        "intentfence",
        "request_id",
        "status",
        "verification_tier",
        "target",
        "observed",
        "checks",
        "receipt",
      ],
    },
  },
});

export const x402AssessmentPaymentRequiredExtensions = {
  bazaar: {
    ...x402AssessmentDiscoveryExtensions.bazaar,
    info: {
      ...x402AssessmentDiscoveryExtensions.bazaar.info,
      input: {
        ...x402AssessmentDiscoveryExtensions.bazaar.info.input,
        method: "POST" as const,
      },
    },
  },
};

export const x402AssessmentRouteConfig = {
  accepts: {
    scheme: "exact",
    price: INTENTFENCE_PRICE_USD,
    network: INTENTFENCE_NETWORK,
    payTo: INTENTFENCE_PAY_TO,
  },
  description:
    "Validate and sign the exact caller-observed PAYMENT-REQUIRED challenge against a Base USDC ceiling, explicit payee allowlist, timeout, and resource binding. IntentFence never fetches or pays the target.",
  mimeType: "application/json",
  serviceName: "IntentFence x402 Assessment",
  tags: [
    "ai-agents",
    "merchant-risk",
    "payment-safety",
    "quote-assessment",
    "x402",
  ],
  iconUrl: `${INTENTFENCE_SITE_URL}/favicon.svg`,
  unpaidResponseBody: () => ({
    contentType: "application/json",
    body: {
      error: "payment_required",
      message: `Pay ${INTENTFENCE_PRICE_USD} in USDC on Base for a signed caller-observed x402 quote assessment.`,
      payment_info: `${INTENTFENCE_SITE_URL}/api/payments`,
    },
  }),
} satisfies RouteConfig;

function createPaymentRequired(
  resourceUrl: string,
  routeConfig: typeof intentFencePaidRouteConfig | typeof x402AssessmentRouteConfig,
  extensions:
    | typeof intentFencePaymentRequiredExtensions
    | typeof x402AssessmentPaymentRequiredExtensions,
  error: string,
) {
  return {
    x402Version: 2,
    error,
    resource: {
      url: resourceUrl,
      description: routeConfig.description,
      mimeType: routeConfig.mimeType,
      serviceName: routeConfig.serviceName,
      tags: routeConfig.tags,
      iconUrl: routeConfig.iconUrl,
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
    extensions,
  };
}

export function createIntentFencePaymentRequired(resourceUrl: string, error = "Payment required") {
  return createPaymentRequired(
    resourceUrl,
    intentFencePaidRouteConfig,
    intentFencePaymentRequiredExtensions,
    error,
  );
}

export function createX402AssessmentPaymentRequired(
  resourceUrl: string,
  error = "Payment required",
) {
  return createPaymentRequired(
    resourceUrl,
    x402AssessmentRouteConfig,
    x402AssessmentPaymentRequiredExtensions,
    error,
  );
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
