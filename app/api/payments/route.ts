import {
  AGENTPASS_ASSET,
  AGENTPASS_FACILITATOR,
  AGENTPASS_FACILITATOR_URL,
  AGENTPASS_NETWORK,
  AGENTPASS_NETWORK_NAME,
  AGENTPASS_PAY_TO,
  AGENTPASS_PRICE_ATOMIC,
  AGENTPASS_PRICE_USD,
} from "../../../lib/x402";

export function GET() {
  return Response.json(
    {
      protocol: "x402",
      version: 2,
      status: "live",
      endpoint: "/api/preflight/verified",
      price: AGENTPASS_PRICE_USD,
      amount_atomic: AGENTPASS_PRICE_ATOMIC,
      asset: AGENTPASS_ASSET,
      network: AGENTPASS_NETWORK,
      network_name: AGENTPASS_NETWORK_NAME,
      pay_to: AGENTPASS_PAY_TO,
      facilitator: {
        name: AGENTPASS_FACILITATOR,
        url: AGENTPASS_FACILITATOR_URL,
      },
      flow: [
        "POST without payment and read the PAYMENT-REQUIRED response header.",
        "Create and sign the exact USDC payment with an x402-compatible wallet.",
        "Retry with PAYMENT-SIGNATURE; a successful response includes PAYMENT-RESPONSE.",
      ],
      custody: "AgentPass never receives wallet private keys and cannot initiate transfers.",
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
