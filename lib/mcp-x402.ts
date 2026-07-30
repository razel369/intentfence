import {
  INTENTFENCE_NETWORK,
  INTENTFENCE_PAY_TO,
  INTENTFENCE_PAYMENT_TIMEOUT_SECONDS,
  INTENTFENCE_USDC_CONTRACT,
} from "./x402.ts";

export function createMcpX402ToolMeta(amount: string) {
  const accept = {
    scheme: "exact",
    network: INTENTFENCE_NETWORK,
    amount,
    asset: INTENTFENCE_USDC_CONTRACT,
    payTo: INTENTFENCE_PAY_TO,
    maxTimeoutSeconds: INTENTFENCE_PAYMENT_TIMEOUT_SECONDS,
    extra: { name: "USD Coin", version: "2" },
  };

  return {
    x402: {
      paymentRequired: true,
      accepts: [accept],
      ...accept,
    },
  };
}
