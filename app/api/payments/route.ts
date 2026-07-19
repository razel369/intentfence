import {
  INTENTFENCE_ASSET,
  INTENTFENCE_FACILITATOR,
  INTENTFENCE_FACILITATOR_URL,
  INTENTFENCE_NETWORK,
  INTENTFENCE_NETWORK_NAME,
  INTENTFENCE_PAY_TO,
  INTENTFENCE_PRICE_ATOMIC,
  INTENTFENCE_PRICE_USD,
} from "../../../lib/x402";
import { AGENTIC_WALLET_CHECKOUT } from "../../../lib/agentic-wallet-checkout";
import { COINBASE_AGENTKIT_CHECKOUT } from "../../../lib/coinbase-agentkit-checkout";

export function GET() {
  return Response.json(
    {
      protocol: "x402",
      version: 2,
      status: "live",
      endpoint: "/api/preflight/verified",
      endpoints: [
        {
          path: "/api/x402-assessments",
          product: "caller-observed-x402-quote-assessment",
          recommended_for: "caller-observed x402 quotes before signing an approved target payment",
        },
        {
          path: "/api/preflight/verified",
          product: "signed-declared-input-preflight",
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
        "POST without payment and read the PAYMENT-REQUIRED response header.",
        "Create and sign the exact USDC payment with an x402-compatible wallet.",
        "Retry with PAYMENT-SIGNATURE; a successful response includes PAYMENT-RESPONSE.",
      ],
      buyer_quickstart: AGENTIC_WALLET_CHECKOUT,
      coinbase_agentkit: COINBASE_AGENTKIT_CHECKOUT,
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
