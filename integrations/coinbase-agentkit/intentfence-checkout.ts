import type { EvmWalletProvider } from "@coinbase/agentkit";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import type { PaymentRequirements } from "@x402/core/schemas";
import { registerExactEvmScheme } from "@x402/evm/exact/client";

export const INTENTFENCE_AGENTKIT_CHECKOUT = {
  endpoint: "https://agentpass-protocol.rmalka06.chatgpt.site/api/preflight/verified",
  method: "POST",
  network: "eip155:8453",
  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  amountAtomic: "5000",
  amountUsdc: "0.005",
  payTo: "0x833ca7dcdb6a681ddc0c15982ef0d609bceb3a5e",
} as const;

export type IntentFenceQuote = {
  endpoint: string;
  network: string;
  asset: string;
  amountAtomic: string;
  amountUsdc: string;
  payTo: string;
};

export type AuthorizeIntentFencePayment = (
  quote: IntentFenceQuote,
) => boolean | Promise<boolean>;

type V2PaymentRequirement = Extract<PaymentRequirements, { amount: string }>;

function equalsAddress(left: string | undefined, right: string) {
  return left?.toLowerCase() === right.toLowerCase();
}

function isPinnedIntentFenceRequirement(
  requirement: PaymentRequirements,
): requirement is V2PaymentRequirement {
  return (
    "amount" in requirement &&
    requirement.scheme === "exact" &&
    requirement.network === INTENTFENCE_AGENTKIT_CHECKOUT.network &&
    requirement.amount === INTENTFENCE_AGENTKIT_CHECKOUT.amountAtomic &&
    equalsAddress(requirement.asset, INTENTFENCE_AGENTKIT_CHECKOUT.asset) &&
    equalsAddress(requirement.payTo, INTENTFENCE_AGENTKIT_CHECKOUT.payTo)
  );
}

/**
 * Pays the live IntentFence x402 endpoint from an existing Coinbase AgentKit
 * EVM wallet, but only after pinning the complete quote and obtaining approval.
 * The caller owns the wallet and the authorization UI/policy.
 */
export async function payIntentFenceWithAgentKit(
  walletProvider: EvmWalletProvider,
  requestBody: unknown,
  authorize: AuthorizeIntentFencePayment,
) {
  const initialRequest = new Request(INTENTFENCE_AGENTKIT_CHECKOUT.endpoint, {
    method: INTENTFENCE_AGENTKIT_CHECKOUT.method,
    headers: {
      "Content-Type": "application/json",
      "X-IntentFence-Source": "coinbase-agentkit-pinned-checkout",
    },
    body: JSON.stringify(requestBody),
  });

  const challengeResponse = await fetch(initialRequest.clone());
  if (challengeResponse.status !== 402) {
    throw new Error(`Expected an x402 challenge, received HTTP ${challengeResponse.status}.`);
  }

  const encodedChallenge = challengeResponse.headers.get("payment-required");
  if (!encodedChallenge) {
    throw new Error("IntentFence returned HTTP 402 without PAYMENT-REQUIRED.");
  }

  const paymentRequired = decodePaymentRequiredHeader(encodedChallenge);
  if (paymentRequired.x402Version !== 2) {
    throw new Error(`Refusing unsupported x402 version ${paymentRequired.x402Version}.`);
  }
  if (new URL(paymentRequired.resource.url).href !== initialRequest.url) {
    throw new Error("Refusing a payment challenge bound to a different resource URL.");
  }

  const pinnedRequirement = paymentRequired.accepts.find(isPinnedIntentFenceRequirement);
  if (!pinnedRequirement) {
    throw new Error("The x402 quote does not match the pinned IntentFence price, asset, network, or recipient.");
  }

  const approved = await authorize({
    endpoint: INTENTFENCE_AGENTKIT_CHECKOUT.endpoint,
    network: pinnedRequirement.network,
    asset: pinnedRequirement.asset,
    amountAtomic: pinnedRequirement.amount,
    amountUsdc: INTENTFENCE_AGENTKIT_CHECKOUT.amountUsdc,
    payTo: pinnedRequirement.payTo,
  });
  if (!approved) {
    throw new Error("IntentFence payment was not authorized.");
  }

  const client = new x402Client().registerPolicy((_version, requirements) =>
    requirements.filter(isPinnedIntentFenceRequirement),
  );
  registerExactEvmScheme(client, {
    signer: walletProvider.toSigner(),
    networks: [INTENTFENCE_AGENTKIT_CHECKOUT.network],
  });
  const httpClient = new x402HTTPClient(client);
  const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
  const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);
  const paidRequest = new Request(initialRequest, {
    headers: {
      ...Object.fromEntries(initialRequest.headers.entries()),
      ...paymentHeaders,
    },
  });
  const response = await fetch(paidRequest);

  if (response.status !== 200) {
    throw new Error(`IntentFence payment did not complete; received HTTP ${response.status}.`);
  }
  if (!response.headers.get("payment-response")) {
    throw new Error("IntentFence returned HTTP 200 without PAYMENT-RESPONSE settlement proof.");
  }

  return response;
}
