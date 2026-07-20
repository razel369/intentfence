import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";

const BASE_NETWORK = "eip155:8453";
const BASE_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const INTENTFENCE_PAYEE = "0x833ca7dcdb6a681ddc0c15982ef0d609bceb3a5e";
const PRIVATE_KEY_PATTERN = /^0x[0-9a-fA-F]{64}$/u;
const USDC_PATTERN = /^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,6})?$/u;
const USDC_ATOMIC_SCALE = 1_000_000n;

export class AutoPaymentConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "AutoPaymentConfigurationError";
  }
}

export function parseUsdcAtomic(value, label) {
  const normalized = value?.trim();
  if (!normalized || !USDC_PATTERN.test(normalized)) {
    throw new AutoPaymentConfigurationError(
      `${label} must be a positive USDC amount with at most six decimals.`,
    );
  }

  const [whole, fraction = ""] = normalized.split(".");
  const amount =
    BigInt(whole) * USDC_ATOMIC_SCALE +
    BigInt(fraction.padEnd(6, "0"));
  if (amount <= 0n) {
    throw new AutoPaymentConfigurationError(`${label} must be greater than zero.`);
  }
  return amount;
}

export function readAutoPaymentConfiguration(env = process.env) {
  const privateKey = env.INTENTFENCE_EVM_PRIVATE_KEY?.trim();
  const perPayment = env.INTENTFENCE_MAX_AUTO_PAYMENT_USDC?.trim();
  const totalBudget = env.INTENTFENCE_AUTO_PAYMENT_BUDGET_USDC?.trim();
  const supplied = [privateKey, perPayment, totalBudget].filter(Boolean).length;

  if (supplied === 0) return null;
  if (supplied !== 3) {
    throw new AutoPaymentConfigurationError(
      "Automatic payment requires INTENTFENCE_EVM_PRIVATE_KEY, " +
        "INTENTFENCE_MAX_AUTO_PAYMENT_USDC, and " +
        "INTENTFENCE_AUTO_PAYMENT_BUDGET_USDC together.",
    );
  }
  if (!PRIVATE_KEY_PATTERN.test(privateKey)) {
    throw new AutoPaymentConfigurationError(
      "INTENTFENCE_EVM_PRIVATE_KEY must be a 0x-prefixed 32-byte key.",
    );
  }

  const perPaymentAtomic = parseUsdcAtomic(
    perPayment,
    "INTENTFENCE_MAX_AUTO_PAYMENT_USDC",
  );
  const totalBudgetAtomic = parseUsdcAtomic(
    totalBudget,
    "INTENTFENCE_AUTO_PAYMENT_BUDGET_USDC",
  );
  if (perPaymentAtomic > totalBudgetAtomic) {
    throw new AutoPaymentConfigurationError(
      "INTENTFENCE_MAX_AUTO_PAYMENT_USDC cannot exceed the total automatic-payment budget.",
    );
  }

  return {
    privateKey,
    perPaymentAtomic,
    totalBudgetAtomic,
  };
}

function isAllowedRequirement(requirement, perPaymentAtomic) {
  if (
    requirement?.scheme !== "exact" ||
    requirement?.network !== BASE_NETWORK ||
    requirement?.asset?.toLowerCase() !== BASE_USDC ||
    requirement?.payTo?.toLowerCase() !== INTENTFENCE_PAYEE
  ) {
    return false;
  }

  try {
    const amount = BigInt(requirement.amount);
    return amount > 0n && amount <= perPaymentAtomic;
  } catch {
    return false;
  }
}

export function createIntentFenceAutoPaymentFetch({
  env = process.env,
  baseFetch = globalThis.fetch,
  signer,
} = {}) {
  const config = readAutoPaymentConfiguration(env);
  if (!config) return null;

  const account = signer ?? privateKeyToAccount(config.privateKey);
  const client = new x402Client();
  registerExactEvmScheme(client, { signer: account });

  let reservedAtomic = 0n;
  client.registerPolicy((_version, requirements) =>
    requirements.filter((requirement) =>
      isAllowedRequirement(requirement, config.perPaymentAtomic),
    ),
  );
  client.onBeforePaymentCreation(async ({ selectedRequirements }) => {
    const amount = BigInt(selectedRequirements.amount);
    if (reservedAtomic + amount > config.totalBudgetAtomic) {
      return {
        abort: true,
        reason: "IntentFence automatic-payment process budget exhausted.",
      };
    }

    // Reserve synchronously before signing. Failed settlements remain reserved so
    // concurrent or repeatedly failing calls can never exceed the operator's cap.
    reservedAtomic += amount;
  });

  return {
    fetch: wrapFetchWithPayment(baseFetch, client),
    accountAddress: account.address,
    budget: () => ({
      reservedAtomic,
      remainingAtomic: config.totalBudgetAtomic - reservedAtomic,
      totalAtomic: config.totalBudgetAtomic,
      perPaymentAtomic: config.perPaymentAtomic,
    }),
  };
}

export const AUTO_PAYMENT_POLICY = Object.freeze({
  network: BASE_NETWORK,
  asset: BASE_USDC,
  payee: INTENTFENCE_PAYEE,
  scheme: "exact",
});
