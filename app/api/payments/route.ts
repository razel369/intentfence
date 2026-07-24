import {
  INTENTFENCE_ASSET,
  INTENTFENCE_FACILITATOR,
  INTENTFENCE_FACILITATOR_URL,
  INTENTFENCE_NETWORK,
  INTENTFENCE_NETWORK_NAME,
  INTENTFENCE_PAY_TO,
  INTENTFENCE_POLICY_PACK_PRICE_ATOMIC,
  INTENTFENCE_POLICY_PACK_PRICE_USD,
  INTENTFENCE_PRICE_ATOMIC,
  INTENTFENCE_PRICE_USD,
  INTENTFENCE_READINESS_PRICE_ATOMIC,
  INTENTFENCE_READINESS_PRICE_USD,
  INTENTFENCE_US_CPI_PRICE_ATOMIC,
  INTENTFENCE_US_CPI_PRICE_USD,
  INTENTFENCE_WALLET_RISK_PRICE_ATOMIC,
  INTENTFENCE_WALLET_RISK_PRICE_USD,
} from "../../../lib/x402";
import { AGENTIC_WALLET_CHECKOUT } from "../../../lib/agentic-wallet-checkout";
import { COINBASE_AGENTKIT_CHECKOUT } from "../../../lib/coinbase-agentkit-checkout";
import { POLICY_PACK_CHECKOUT } from "../../../lib/policy-pack-checkout";

export function GET() {
  return Response.json(
    {
      protocol: "x402",
      version: 2,
      status: "live",
      endpoint: "/api/preflight/verified",
      endpoints: [
        {
          path: "/api/policy-packs",
          method: "POST",
          product: "production-policy-pack",
          price: INTENTFENCE_POLICY_PACK_PRICE_USD,
          amount_atomic: INTENTFENCE_POLICY_PACK_PRICE_ATOMIC,
          recommended_for:
            "a self-service, runtime-specific production guard with signed policy evidence, negative tests, and a fail-closed deployment checklist",
        },
        {
          path: "/api/us-cpi?month={YYYY-MM}",
          method: "GET",
          product: "signed-official-us-cpi",
          price: INTENTFENCE_US_CPI_PRICE_USD,
          amount_atomic: INTENTFENCE_US_CPI_PRICE_ATOMIC,
          recommended_for: "official headline and core U.S. inflation data with signed provenance",
        },
        {
          path: "/api/wallet-risk?address={base_address}",
          method: "GET",
          product: "live-base-wallet-risk",
          price: INTENTFENCE_WALLET_RISK_PRICE_USD,
          amount_atomic: INTENTFENCE_WALLET_RISK_PRICE_ATOMIC,
          recommended_for: "recipient and counterparty screening before a Base payment",
        },
        {
          path: "/api/x402-readiness",
          method: "POST",
          product: "live-x402-endpoint-readiness",
          price: INTENTFENCE_READINESS_PRICE_USD,
          amount_atomic: INTENTFENCE_READINESS_PRICE_ATOMIC,
          recommended_for: "checking a public x402 endpoint before the buyer signs or pays its challenge",
        },
        {
          path: "/api/x402-assessments",
          method: "POST",
          product: "caller-observed-x402-quote-assessment",
          price: INTENTFENCE_PRICE_USD,
          amount_atomic: INTENTFENCE_PRICE_ATOMIC,
          recommended_for: "caller-observed x402 quotes before signing an approved target payment",
        },
        {
          path: "/api/preflight/verified",
          method: "POST",
          product: "signed-declared-input-preflight",
          price: INTENTFENCE_PRICE_USD,
          amount_atomic: INTENTFENCE_PRICE_ATOMIC,
          recommended_for: "general consequential agent actions",
        },
      ],
      price: INTENTFENCE_PRICE_USD,
      amount_atomic: INTENTFENCE_PRICE_ATOMIC,
      asset: INTENTFENCE_ASSET,
      network: INTENTFENCE_NETWORK,
      network_name: INTENTFENCE_NETWORK_NAME,
      pay_to: INTENTFENCE_PAY_TO,
      facilitator: {
        name: INTENTFENCE_FACILITATOR,
        url: INTENTFENCE_FACILITATOR_URL,
      },
      flow: [
        "Call the chosen endpoint without payment and read the PAYMENT-REQUIRED response header.",
        "Create and sign the exact USDC payment with an x402-compatible wallet.",
        "Retry with PAYMENT-SIGNATURE; a successful response includes PAYMENT-RESPONSE.",
      ],
      buyer_quickstart: AGENTIC_WALLET_CHECKOUT,
      policy_pack_checkout: POLICY_PACK_CHECKOUT,
      coinbase_agentkit: COINBASE_AGENTKIT_CHECKOUT,
      commercial_offer: {
        status: "self_service_live",
        name: "IntentFence Production Policy Pack",
        audience: "teams operating AI agents that can initiate x402 or USDC payments",
        price: {
          amount: 1,
          currency: "USDC",
          network: INTENTFENCE_NETWORK,
          amount_atomic: INTENTFENCE_POLICY_PACK_PRICE_ATOMIC,
        },
        scope: [
          "one exact consequential action and policy",
          "Cloudflare Agents, Coinbase AgentKit, or MCP gateway runtime",
          "copy-ready TypeScript fail-closed guard",
          "signed action and policy receipt",
          "allowed, denied, and over-budget test vectors",
          "deployment and audit checklist",
        ],
        checkout: {
          method: "POST",
          path: "/api/policy-packs",
          content_type: "application/json",
          payment_protocol: "x402-v2",
          account_required: false,
          meeting_required: false,
        },
        enterprise_application: {
          method: "POST",
          path: "/api/leads",
          plan: "enterprise",
          note: "Optional asynchronous application for custom private deployment.",
        },
      },
      custody: "IntentFence never receives wallet private keys and cannot initiate transfers.",
      documentation: "/openapi.json",
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
