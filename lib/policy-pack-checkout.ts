import { AGENTIC_WALLET_CLI_VERSION } from "./agentic-wallet-checkout.ts";

export const POLICY_PACK_CHECKOUT_URL =
  "https://agentpass-protocol.rmalka06.chatgpt.site/api/policy-packs?utm_source=agent_wallet_checkout&utm_medium=agent&utm_campaign=production_policy_pack";

export const POLICY_PACK_CHECKOUT_REQUEST = {
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
    context: {
      currency: "USD",
      quoted_cost: 79,
      data_retention_hours: 24,
    },
    policy: {
      allowed_action_types: ["purchase"],
      allowed_resources: ["merchant://orders/*"],
      max_cost: { amount: 100, currency: "USD" },
      max_data_retention_hours: 48,
    },
  },
} as const;

export const POLICY_PACK_CHECKOUT_COMMAND =
  `npx awal@${AGENTIC_WALLET_CLI_VERSION} x402 pay "${POLICY_PACK_CHECKOUT_URL}" -X POST -d '${JSON.stringify(POLICY_PACK_CHECKOUT_REQUEST)}' --max-amount 1000000 --json`;

export const POLICY_PACK_CHECKOUT = {
  product: "IntentFence Production Policy Pack",
  price_usdc: "1.00",
  amount_atomic: "1000000",
  network: "eip155:8453",
  endpoint: POLICY_PACK_CHECKOUT_URL,
  supported_runtimes: [
    "cloudflare-agents",
    "coinbase-agentkit",
    "mcp-gateway",
    "openai-agents-js",
  ],
  command: POLICY_PACK_CHECKOUT_COMMAND,
  request: POLICY_PACK_CHECKOUT_REQUEST,
  account_required: false,
  meeting_required: false,
  warning:
    "This command makes a real 1 USDC Base payment when the buyer wallet is authenticated and funded. Review the project name, action, and policy before running it.",
} as const;
