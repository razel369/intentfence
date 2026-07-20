import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { bazaarResourceServerExtension } from "@x402/extensions/bazaar";

export const INTENTFENCE_PAY_TO = "0x833ca7dcdb6a681ddc0c15982ef0d609bceb3a5e";
export const INTENTFENCE_NETWORK = "eip155:8453" as const;
export const INTENTFENCE_NETWORK_NAME = "Base mainnet";
export const INTENTFENCE_ASSET = "USDC";
export const INTENTFENCE_PRICE_USD = "$0.005";
export const INTENTFENCE_PRICE_ATOMIC = "5000";
export const INTENTFENCE_WALLET_RISK_PRICE_USD = "$0.002";
export const INTENTFENCE_WALLET_RISK_PRICE_ATOMIC = "2000";
export const INTENTFENCE_US_CPI_PRICE_USD = "$0.001";
export const INTENTFENCE_US_CPI_PRICE_ATOMIC = "1000";
export const INTENTFENCE_USDC_CONTRACT = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const INTENTFENCE_PAYMENT_TIMEOUT_SECONDS = 300;
export const INTENTFENCE_FACILITATOR = "PayAI";
export const INTENTFENCE_FACILITATOR_URL = "https://facilitator.payai.network";

const httpFacilitatorClient = new HTTPFacilitatorClient({
  url: INTENTFENCE_FACILITATOR_URL,
});

type SupportedResponse = Awaited<
  ReturnType<HTTPFacilitatorClient["getSupported"]>
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Load PayAI capabilities through the same Worker-compatible request shape as
 * the public health check. The SDK client's getSupported parser works in Node,
 * but its bundled path currently fails during Cloudflare Worker initialization.
 * Verify and settle still use the official SDK client unchanged.
 */
export async function fetchIntentFenceSupportedKinds(
  fetchImpl: typeof fetch = fetch,
): Promise<SupportedResponse> {
  const response = await fetchImpl(`${INTENTFENCE_FACILITATOR_URL}/supported`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(4_000),
  });
  if (!response.ok) {
    throw new Error(`Facilitator supported request failed with HTTP ${response.status}.`);
  }
  const payload = await response.json() as unknown;
  if (!isRecord(payload) || !Array.isArray(payload.kinds)) {
    throw new Error("Facilitator returned invalid supported payment kinds.");
  }
  return {
    kinds: payload.kinds,
    extensions: Array.isArray(payload.extensions) ? payload.extensions : [],
    signers: isRecord(payload.signers) ? payload.signers : {},
  } as SupportedResponse;
}

const facilitatorClient = {
  verify: httpFacilitatorClient.verify.bind(httpFacilitatorClient),
  settle: httpFacilitatorClient.settle.bind(httpFacilitatorClient),
  getSupported: fetchIntentFenceSupportedKinds,
};

export const intentFenceX402Server = new x402ResourceServer(facilitatorClient)
  .register(INTENTFENCE_NETWORK, new ExactEvmScheme())
  .registerExtension(bazaarResourceServerExtension);
