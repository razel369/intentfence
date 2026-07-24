import type { RouteConfig } from "@x402/core/server";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { preflightInputSchema } from "./preflight.ts";
import { policyPackInputSchema } from "./policy-pack.ts";
import { x402AssessmentInputSchema } from "./x402-assessment.ts";
import { x402ReadinessInputSchema } from "./x402-readiness.ts";
import { walletRiskInputSchema } from "./wallet-risk.ts";
import { usCpiInputSchema } from "./us-cpi.ts";
import {
  INTENTFENCE_NETWORK,
  INTENTFENCE_PAY_TO,
  INTENTFENCE_PAYMENT_TIMEOUT_SECONDS,
  INTENTFENCE_POLICY_PACK_PRICE_ATOMIC,
  INTENTFENCE_POLICY_PACK_PRICE_USD,
  INTENTFENCE_PRICE_ATOMIC,
  INTENTFENCE_PRICE_USD,
  INTENTFENCE_READINESS_PRICE_ATOMIC,
  INTENTFENCE_READINESS_PRICE_USD,
  INTENTFENCE_USDC_CONTRACT,
  INTENTFENCE_US_CPI_PRICE_ATOMIC,
  INTENTFENCE_US_CPI_PRICE_USD,
  INTENTFENCE_WALLET_RISK_PRICE_ATOMIC,
  INTENTFENCE_WALLET_RISK_PRICE_USD,
} from "./x402.ts";

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

export const policyPackDiscoveryExtensions = declareDiscoveryExtension({
  input: {
    project_name: "Autonomous Checkout",
    runtime: "cloudflare-agents",
    authorization: {
      subject: "agent:checkout-production",
      action: {
        type: "purchase",
        resource: "merchant://orders/42",
        protocol: "payment",
        method: "POST",
      },
      context: { currency: "USD", quoted_cost: 79, data_retention_hours: 24 },
      policy: {
        allowed_action_types: ["purchase"],
        allowed_resources: ["merchant://orders/*"],
        max_cost: { amount: 100, currency: "USD" },
        max_data_retention_hours: 48,
      },
    },
  },
  inputSchema: policyPackInputSchema,
  bodyType: "json",
  output: {
    example: {
      intentfence: "policy-pack-1.0",
      runtime: "cloudflare-agents",
      verification_tier: "production-policy-pack+x402-settled",
      integration: {
        language: "typescript",
        filename: "intentfence-cloudflare-agents.ts",
      },
      decision: {
        status: "safe_to_proceed",
        receipt: { signed: true, assurance: "action-bound-policy-authorization" },
      },
    },
    schema: {
      type: "object",
      properties: {
        intentfence: { type: "string", const: "policy-pack-1.0" },
        runtime: { type: "string", enum: ["cloudflare-agents", "coinbase-agentkit", "mcp-gateway", "openai-agents-js"] },
        verification_tier: {
          type: "string",
          const: "production-policy-pack+x402-settled",
        },
        integration: { type: "object" },
        decision: { type: "object" },
        tests: { type: "object" },
        deployment_checklist: { type: "array", items: { type: "string" } },
      },
      required: [
        "intentfence",
        "runtime",
        "verification_tier",
        "integration",
        "decision",
        "tests",
        "deployment_checklist",
      ],
    },
  },
});

export const policyPackPaymentRequiredExtensions = {
  bazaar: {
    ...policyPackDiscoveryExtensions.bazaar,
    info: {
      ...policyPackDiscoveryExtensions.bazaar.info,
      input: {
        ...policyPackDiscoveryExtensions.bazaar.info.input,
        method: "POST" as const,
      },
    },
  },
};

export const policyPackRouteConfig = {
  accepts: {
    scheme: "exact",
    price: INTENTFENCE_POLICY_PACK_PRICE_USD,
    network: INTENTFENCE_NETWORK,
    payTo: INTENTFENCE_PAY_TO,
  },
  description:
    "Generate a production-ready, runtime-specific IntentFence guard with a signed action and policy receipt, negative test vectors, and a fail-closed deployment checklist.",
  mimeType: "application/json",
  serviceName: "IntentFence Policy Pack",
  tags: [
    "ai-agents",
    "authorization",
    "integration",
    "mcp",
    "x402",
  ],
  iconUrl: `${INTENTFENCE_SITE_URL}/favicon.svg`,
  unpaidResponseBody: () => ({
    contentType: "application/json",
    body: {
      error: "payment_required",
      message: `Pay ${INTENTFENCE_POLICY_PACK_PRICE_USD} in USDC on Base for a self-service production policy pack.`,
      payment_info: `${INTENTFENCE_SITE_URL}/api/payments`,
    },
  }),
} satisfies RouteConfig;

export const x402ReadinessDiscoveryExtensions = declareDiscoveryExtension({
  input: {
    target_url: `${INTENTFENCE_SITE_URL}/api/wallet-risk?address=${INTENTFENCE_PAY_TO}`,
    method: "GET",
    max_price_usdc: "0.01",
    allowed_payees: [INTENTFENCE_PAY_TO],
  },
  inputSchema: x402ReadinessInputSchema,
  bodyType: "json",
  output: {
    example: {
      intentfence: "0.9",
      request_id: "7d7fbf44-3c39-4eca-89d6-b44d756c8df1",
      status: "ready",
      verification_tier: "live-x402-readiness+x402-settled",
      observed: { http_status: 402, payment_required_present: true, redirect_blocked: false },
      receipt: { signed: true, assurance: "live-x402-endpoint-readiness" },
    },
    schema: {
      type: "object",
      properties: {
        intentfence: { type: "string", const: "0.9" },
        request_id: { type: "string", format: "uuid" },
        status: { type: "string", enum: ["ready", "ready_with_review", "not_ready"] },
        verification_tier: { type: "string", const: "live-x402-readiness+x402-settled" },
        target: { type: "object" },
        observed: { type: "object" },
        checks: { type: "array", items: { type: "object" } },
        assessment: { type: ["object", "null"] },
        receipt: { type: "object" },
      },
      required: ["intentfence", "request_id", "status", "verification_tier", "target", "observed", "checks", "assessment", "receipt"],
    },
  },
});

export const x402ReadinessPaymentRequiredExtensions = {
  bazaar: {
    ...x402ReadinessDiscoveryExtensions.bazaar,
    info: {
      ...x402ReadinessDiscoveryExtensions.bazaar.info,
      input: { ...x402ReadinessDiscoveryExtensions.bazaar.info.input, method: "POST" as const },
    },
  },
};

export const x402ReadinessRouteConfig = {
  accepts: {
    scheme: "exact",
    price: INTENTFENCE_READINESS_PRICE_USD,
    network: INTENTFENCE_NETWORK,
    payTo: INTENTFENCE_PAY_TO,
  },
  description: "Make one bounded credential-free request to a public HTTPS endpoint, block redirects and private-network targets, validate its live x402 challenge against a price ceiling and optional payee allowlist, and return a signed five-minute readiness receipt. IntentFence never pays the target.",
  mimeType: "application/json",
  serviceName: "IntentFence x402 Readiness",
  tags: ["ai-agents", "endpoint-readiness", "payment-safety", "ssrf-protection", "x402"],
  iconUrl: `${INTENTFENCE_SITE_URL}/favicon.svg`,
  unpaidResponseBody: () => ({
    contentType: "application/json",
    body: {
      error: "payment_required",
      message: `Pay ${INTENTFENCE_READINESS_PRICE_USD} in USDC on Base for a live x402 endpoint readiness check and signed receipt.`,
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

export const walletRiskDiscoveryExtensions = declareDiscoveryExtension({
  input: {
    address: "0x833ca7dcdb6a681ddc0c15982ef0d609bceb3a5e",
  },
  inputSchema: walletRiskInputSchema,
  output: {
    example: {
      intentfence: "0.7",
      request_id: "7d7fbf44-3c39-4eca-89d6-b44d756c8df1",
      status: "safe_to_proceed",
      risk_level: "low",
      risk_score: 5,
      verification_tier: "live-base-wallet-risk+x402-settled",
      receipt: { signed: true, assurance: "live-base-wallet-risk" },
    },
    schema: {
      type: "object",
      properties: {
        intentfence: { type: "string", const: "0.7" },
        request_id: { type: "string", format: "uuid" },
        status: {
          type: "string",
          enum: ["safe_to_proceed", "needs_review", "denied"],
        },
        risk_level: { type: "string", enum: ["low", "medium", "critical"] },
        risk_score: { type: "integer", minimum: 0, maximum: 100 },
        observed: { type: "object" },
        checks: { type: "array", items: { type: "object" } },
        receipt: { type: "object" },
      },
      required: ["intentfence", "request_id", "status", "risk_level", "risk_score", "observed", "checks", "receipt"],
    },
  },
});

export const walletRiskPaymentRequiredExtensions = {
  bazaar: {
    ...walletRiskDiscoveryExtensions.bazaar,
    info: {
      ...walletRiskDiscoveryExtensions.bazaar.info,
      input: {
        ...walletRiskDiscoveryExtensions.bazaar.info.input,
        method: "GET" as const,
      },
    },
  },
};

export const walletRiskRouteConfig = {
  accepts: {
    scheme: "exact",
    price: INTENTFENCE_WALLET_RISK_PRICE_USD,
    network: INTENTFENCE_NETWORK,
    payTo: INTENTFENCE_PAY_TO,
  },
  description:
    "Screen a Base wallet before sending USDC for sanctions, phishing, mixer, money-laundering, blacklist, and counterparty risk using live Base RPC and GoPlus intelligence. Returns a signed five-minute receipt; it does not prove identity or ownership.",
  mimeType: "application/json",
  serviceName: "IntentFence Wallet Risk",
  tags: [
    "ai-agents",
    "counterparty-risk",
    "malicious-address",
    "payment-safety",
    "wallet-intelligence",
  ],
  iconUrl: `${INTENTFENCE_SITE_URL}/favicon.svg`,
  unpaidResponseBody: () => ({
    contentType: "application/json",
    body: {
      error: "payment_required",
      message: `Pay ${INTENTFENCE_WALLET_RISK_PRICE_USD} in USDC on Base for a live wallet-risk assessment.`,
      payment_info: `${INTENTFENCE_SITE_URL}/api/payments`,
    },
  }),
} satisfies RouteConfig;

export const usCpiDiscoveryExtensions = declareDiscoveryExtension({
  input: { month: "2026-06" },
  inputSchema: usCpiInputSchema,
  output: {
    example: {
      intentfence: "0.8",
      request_id: "a6f37ff9-90aa-43f7-8304-f329292bc702",
      status: "verified",
      period: { year: "2026", month: "2026-06", name: "June" },
      cpi: {
        headline_index: 333.952,
        headline_yoy_percent: 3.531,
        core_index: 336.882,
        core_yoy_percent: 2.594,
      },
      receipt: { signed: true, assurance: "official-source-data" },
    },
    schema: {
      type: "object",
      properties: {
        intentfence: { type: "string", const: "0.8" },
        request_id: { type: "string", format: "uuid" },
        status: { type: "string", const: "verified" },
        source: { type: "object" },
        period: { type: "object" },
        cpi: { type: "object" },
        summary: { type: "string" },
        checks: { type: "array", items: { type: "object" } },
        receipt: { type: "object" },
      },
      required: ["intentfence", "request_id", "status", "source", "period", "cpi", "summary", "checks", "receipt"],
    },
  },
});

export const usCpiPaymentRequiredExtensions = {
  bazaar: {
    ...usCpiDiscoveryExtensions.bazaar,
    info: {
      ...usCpiDiscoveryExtensions.bazaar.info,
      input: {
        ...usCpiDiscoveryExtensions.bazaar.info.input,
        method: "GET" as const,
      },
    },
  },
};

export const usCpiRouteConfig = {
  accepts: {
    scheme: "exact",
    price: INTENTFENCE_US_CPI_PRICE_USD,
    network: INTENTFENCE_NETWORK,
    payTo: INTENTFENCE_PAY_TO,
  },
  description:
    "Official U.S. headline and core Consumer Price Index data from the Bureau of Labor Statistics. Returns the latest complete month or a requested YYYY-MM period, year-over-year inflation calculations, source provenance, and a signed receipt.",
  mimeType: "application/json",
  serviceName: "IntentFence Official U.S. CPI",
  tags: [
    "ai-agents",
    "bls",
    "consumer-price-index",
    "inflation",
    "official-data",
  ],
  iconUrl: `${INTENTFENCE_SITE_URL}/favicon.svg`,
  unpaidResponseBody: () => ({
    contentType: "application/json",
    body: {
      error: "payment_required",
      message: `Pay ${INTENTFENCE_US_CPI_PRICE_USD} in USDC on Base for official U.S. headline and core CPI data with a signed source receipt.`,
      payment_info: `${INTENTFENCE_SITE_URL}/api/payments`,
    },
  }),
} satisfies RouteConfig;

function createPaymentRequired(
  resourceUrl: string,
  routeConfig:
    | typeof intentFencePaidRouteConfig
    | typeof x402AssessmentRouteConfig
    | typeof x402ReadinessRouteConfig
    | typeof walletRiskRouteConfig
    | typeof usCpiRouteConfig
    | typeof policyPackRouteConfig,
  extensions:
    | typeof intentFencePaymentRequiredExtensions
    | typeof x402AssessmentPaymentRequiredExtensions
    | typeof x402ReadinessPaymentRequiredExtensions
    | typeof walletRiskPaymentRequiredExtensions
    | typeof usCpiPaymentRequiredExtensions
    | typeof policyPackPaymentRequiredExtensions,
  error: string,
  amountAtomic = INTENTFENCE_PRICE_ATOMIC,
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
        amount: amountAtomic,
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

export function createWalletRiskPaymentRequired(
  resourceUrl: string,
  error = "Payment required",
) {
  return createPaymentRequired(
    resourceUrl,
    walletRiskRouteConfig,
    walletRiskPaymentRequiredExtensions,
    error,
    INTENTFENCE_WALLET_RISK_PRICE_ATOMIC,
  );
}

export function createX402ReadinessPaymentRequired(
  resourceUrl: string,
  error = "Payment required",
) {
  return createPaymentRequired(
    resourceUrl,
    x402ReadinessRouteConfig,
    x402ReadinessPaymentRequiredExtensions,
    error,
    INTENTFENCE_READINESS_PRICE_ATOMIC,
  );
}

export function createUsCpiPaymentRequired(
  resourceUrl: string,
  error = "Payment required",
) {
  return createPaymentRequired(
    resourceUrl,
    usCpiRouteConfig,
    usCpiPaymentRequiredExtensions,
    error,
    INTENTFENCE_US_CPI_PRICE_ATOMIC,
  );
}

export function createPolicyPackPaymentRequired(
  resourceUrl: string,
  error = "Payment required",
) {
  return createPaymentRequired(
    resourceUrl,
    policyPackRouteConfig,
    policyPackPaymentRequiredExtensions,
    error,
    INTENTFENCE_POLICY_PACK_PRICE_ATOMIC,
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
