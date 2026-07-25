export const AGENTIC_WALLET_CLI_VERSION = "2.12.1";

export const AGENTIC_WALLET_CHECKOUT_URL =
  "https://agentpass-protocol.rmalka06.chatgpt.site/api/preflight/verified?utm_source=agent_wallet_checkout&utm_medium=agent&utm_campaign=direct_paid_preflight";

export const AGENTIC_WALLET_CHECKOUT_REQUEST = {
  subject: "agent:checkout-demo",
  action: {
    type: "purchase",
    resource: "order-42",
  },
  constraints: {
    currency: "USD",
    cost_ceiling: 100,
    quoted_cost: 79,
    data_retention_hours: 24,
    human_approval: "not_required",
  },
} as const;

export const AGENTIC_WALLET_CHECKOUT_COMMAND =
  `npx awal@${AGENTIC_WALLET_CLI_VERSION} x402 pay "${AGENTIC_WALLET_CHECKOUT_URL}" -X POST -d '${JSON.stringify(AGENTIC_WALLET_CHECKOUT_REQUEST)}' --max-amount 5000 --json`;

export const AGENTIC_WALLET_CHECKOUT = {
  client: "Coinbase Agentic Wallet CLI",
  package: "awal",
  verified_version: AGENTIC_WALLET_CLI_VERSION,
  status_command: `npx awal@${AGENTIC_WALLET_CLI_VERSION} status`,
  balance_command: `npx awal@${AGENTIC_WALLET_CLI_VERSION} balance`,
  pay_command: AGENTIC_WALLET_CHECKOUT_COMMAND,
  request: AGENTIC_WALLET_CHECKOUT_REQUEST,
  max_amount_atomic: "5000",
  max_amount_usdc: "0.005",
  requires_explicit_authorization: true,
  warning:
    "Review the request body before running it. The pay command makes a real Base USDC payment when the wallet is authenticated and funded.",
} as const;
