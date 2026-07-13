import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { facilitator } from "@payai/facilitator";

export const AGENTPASS_PAY_TO = "0x833ca7dcdb6a681ddc0c15982ef0d609bceb3a5e";
export const AGENTPASS_NETWORK = "eip155:8453" as const;
export const AGENTPASS_NETWORK_NAME = "Base mainnet";
export const AGENTPASS_ASSET = "USDC";
export const AGENTPASS_PRICE_USD = "$0.05";
export const AGENTPASS_PRICE_ATOMIC = "50000";
export const AGENTPASS_FACILITATOR = "PayAI";
export const AGENTPASS_FACILITATOR_URL = "https://facilitator.payai.network";

const facilitatorClient = new HTTPFacilitatorClient(facilitator);

export const agentpassX402Server = new x402ResourceServer(facilitatorClient).register(
  AGENTPASS_NETWORK,
  new ExactEvmScheme(),
);
