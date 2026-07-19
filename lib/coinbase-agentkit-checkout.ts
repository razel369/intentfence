export const COINBASE_AGENTKIT_VERSION = "0.10.4";

export const COINBASE_AGENTKIT_CHECKOUT = {
  client: "Coinbase AgentKit",
  verified_version: COINBASE_AGENTKIT_VERSION,
  integration_manifest:
    "https://agentpass-protocol.rmalka06.chatgpt.site/integrations/coinbase-agentkit.json",
  source:
    "https://github.com/razel369/intentfence/tree/main/integrations/coinbase-agentkit",
  install_command:
    "npm install @coinbase/agentkit@0.10.4 @x402/core@2.18.0 @x402/evm@2.18.0",
  payment: {
    endpoint:
      "https://agentpass-protocol.rmalka06.chatgpt.site/api/preflight/verified",
    network: "eip155:8453",
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    amount_atomic: "5000",
    amount_usdc: "0.005",
    pay_to: "0x833ca7dcdb6a681ddc0c15982ef0d609bceb3a5e",
  },
  requires_explicit_authorization: true,
  quote_pins: ["resource", "network", "asset", "amount", "pay_to"],
  requires_settlement_proof: true,
  warning:
    "The supplied authorization callback controls a real Base USDC payment. Review the pinned quote before returning true.",
} as const;
