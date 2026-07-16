import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { bazaarResourceServerExtension } from "@x402/extensions/bazaar";
import { facilitator } from "@payai/facilitator";

export const INTENTFENCE_PAY_TO = "0x833ca7dcdb6a681ddc0c15982ef0d609bceb3a5e";
export const INTENTFENCE_NETWORK = "eip155:8453" as const;
export const INTENTFENCE_NETWORK_NAME = "Base mainnet";
export const INTENTFENCE_ASSET = "USDC";
export const INTENTFENCE_PRICE_USD = "$0.005";
export const INTENTFENCE_PRICE_ATOMIC = "5000";
export const INTENTFENCE_USDC_CONTRACT = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const INTENTFENCE_PAYMENT_TIMEOUT_SECONDS = 300;
export const INTENTFENCE_FACILITATOR = "PayAI";
export const INTENTFENCE_FACILITATOR_URL = "https://facilitator.payai.network";

const facilitatorClient = new HTTPFacilitatorClient(facilitator);

export const intentFenceX402Server = new x402ResourceServer(facilitatorClient)
  .register(INTENTFENCE_NETWORK, new ExactEvmScheme())
  .registerExtension(bazaarResourceServerExtension);
