import { INTENTFENCE_NETWORK, INTENTFENCE_USDC_CONTRACT } from "./x402.ts";

const BASE_RPC_URLS = [
  "https://base-rpc.publicnode.com",
  "https://mainnet.base.org",
] as const;
const GOPLUS_ADDRESS_URL = "https://api.gopluslabs.io/api/v1/address_security";
const UPSTREAM_TIMEOUT_MS = 6_000;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const BURN_ADDRESS = "0x000000000000000000000000000000000000dead";

const MALICIOUS_FIELDS = {
  blacklist_doubt: "suspected malicious activity",
  blackmail_activities: "blackmail activity",
  cybercrime: "cybercrime",
  darkweb_transactions: "dark-web transactions",
  fake_kyc: "fake KYC activity",
  fake_standard_interface: "fake token interface",
  fake_token: "counterfeit token activity",
  financial_crime: "financial crime",
  gas_abuse: "gas abuse",
  honeypot_related_address: "honeypot-related activity",
  malicious_mining_activities: "malicious mining",
  mixer: "mixer activity",
  money_laundering: "money laundering",
  phishing_activities: "phishing activity",
  reinit: "reinitializable contract activity",
  sanctioned: "sanctions exposure",
  stealing_attack: "stealing attacks",
} as const;

type MaliciousField = keyof typeof MALICIOUS_FIELDS;

export type WalletRiskInput = { address: string };

export type WalletRiskCheck = {
  name: "address" | "malicious_intelligence" | "sanctions" | "activity" | "account_type" | "sources";
  status: "pass" | "review" | "deny";
  detail: string;
};

export type WalletRiskDecision = {
  intentfence: "0.7";
  request_id: string;
  status: "safe_to_proceed" | "needs_review" | "denied";
  risk_level: "low" | "medium" | "critical";
  risk_score: number;
  assessed_at: string;
  subject: {
    address: string;
    network: typeof INTENTFENCE_NETWORK;
    account_type: "eoa" | "contract";
  };
  observed: {
    block_number: string;
    transaction_count: string;
    native_balance_wei: string;
    usdc_balance_atomic: string;
    code_sha256: string | null;
    malicious_flags: string[];
    malicious_contracts_created: number;
    intelligence_source: string;
  };
  checks: WalletRiskCheck[];
  receipt: {
    id: string;
    issued_at: string;
    subject: string;
    action: { type: "wallet.counterparty-risk"; resource: string };
    signed: false;
    assurance: "live-base-wallet-risk";
    note: string;
  };
};

export class WalletRiskValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletRiskValidationError";
  }
}

export class WalletRiskUpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletRiskUpstreamError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateWalletAddress(value: unknown) {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/u.test(value)) {
    throw new WalletRiskValidationError("address must be a 20-byte EVM address.");
  }
  const normalized = value.toLowerCase();
  if (normalized === ZERO_ADDRESS || normalized === BURN_ADDRESS) {
    throw new WalletRiskValidationError("address must not be a zero or burn address.");
  }
  return normalized;
}

export function validateWalletRiskInput(value: unknown): WalletRiskInput {
  if (!isRecord(value)) {
    throw new WalletRiskValidationError("The request body must be a JSON object.");
  }
  return { address: validateWalletAddress(value.address) };
}

async function fetchWithTimeout(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    throw new WalletRiskUpstreamError("Live wallet intelligence is temporarily unavailable.");
  } finally {
    clearTimeout(timeout);
  }
}

async function sha256(value: string) {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseHex(value: unknown, field: string) {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/u.test(value)) {
    throw new WalletRiskUpstreamError(`Base RPC returned an invalid ${field}.`);
  }
  return BigInt(value);
}

async function fetchBaseEvidenceFrom(rpcUrl: string, address: string) {
  const paddedAddress = address.slice(2).padStart(64, "0");
  const response = await fetchWithTimeout(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([
      { jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] },
      { jsonrpc: "2.0", id: 2, method: "eth_getTransactionCount", params: [address, "latest"] },
      { jsonrpc: "2.0", id: 3, method: "eth_getBalance", params: [address, "latest"] },
      { jsonrpc: "2.0", id: 4, method: "eth_getCode", params: [address, "latest"] },
      {
        jsonrpc: "2.0",
        id: 5,
        method: "eth_call",
        params: [
          { to: INTENTFENCE_USDC_CONTRACT, data: `0x70a08231${paddedAddress}` },
          "latest",
        ],
      },
      { jsonrpc: "2.0", id: 6, method: "eth_chainId", params: [] },
    ]),
  });
  if (!response.ok) {
    throw new WalletRiskUpstreamError("Base RPC is temporarily unavailable.");
  }
  const payload = await response.json() as unknown;
  if (!Array.isArray(payload)) {
    throw new WalletRiskUpstreamError("Base RPC returned an invalid batch response.");
  }
  const results = new Map<number, unknown>();
  for (const entry of payload) {
    if (isRecord(entry) && typeof entry.id === "number" && entry.error === undefined) {
      results.set(entry.id, entry.result);
    }
  }
  if (results.size !== 6) {
    throw new WalletRiskUpstreamError("Base RPC did not return complete wallet evidence.");
  }
  if (parseHex(results.get(6), "chain ID") !== 8453n) {
    throw new WalletRiskUpstreamError("Base RPC returned evidence from the wrong network.");
  }
  const code = results.get(4);
  if (typeof code !== "string" || !/^0x[0-9a-fA-F]*$/u.test(code)) {
    throw new WalletRiskUpstreamError("Base RPC returned invalid account code.");
  }
  return {
    blockNumber: parseHex(results.get(1), "block number").toString(),
    transactionCount: parseHex(results.get(2), "transaction count"),
    nativeBalanceWei: parseHex(results.get(3), "native balance"),
    code,
    usdcBalanceAtomic: parseHex(results.get(5), "USDC balance"),
  };
}

async function fetchBaseEvidence(address: string) {
  let lastError: unknown;
  for (const rpcUrl of BASE_RPC_URLS) {
    try {
      return await fetchBaseEvidenceFrom(rpcUrl, address);
    } catch (error) {
      lastError = error;
    }
  }
  throw new WalletRiskUpstreamError(
    lastError instanceof Error
      ? lastError.message
      : "Base RPC evidence is temporarily unavailable.",
  );
}

async function fetchGoPlusEvidence(address: string) {
  const url = `${GOPLUS_ADDRESS_URL}/${encodeURIComponent(address)}?chain_id=8453`;
  const response = await fetchWithTimeout(url, {
    headers: { Accept: "application/json", "User-Agent": "IntentFence/0.8" },
  });
  if (!response.ok) {
    throw new WalletRiskUpstreamError("Malicious-address intelligence is temporarily unavailable.");
  }
  const payload = await response.json() as unknown;
  if (!isRecord(payload) || payload.code !== 1 || !isRecord(payload.result)) {
    throw new WalletRiskUpstreamError("Malicious-address intelligence returned an invalid response.");
  }
  const result = payload.result;
  const flags = (Object.keys(MALICIOUS_FIELDS) as MaliciousField[])
    .filter((field) => result[field] === "1")
    .map((field) => MALICIOUS_FIELDS[field]);
  const maliciousContracts = typeof result.number_of_malicious_contracts_created === "string" &&
      /^\d+$/u.test(result.number_of_malicious_contracts_created)
    ? Number(result.number_of_malicious_contracts_created)
    : 0;
  if (maliciousContracts > 0) flags.push("malicious contracts created");
  return {
    flags: [...new Set(flags)].sort(),
    sanctioned: result.sanctioned === "1",
    contract: result.contract_address === "1",
    maliciousContracts,
    dataSource: typeof result.data_source === "string" && result.data_source.trim()
      ? result.data_source.trim().slice(0, 200)
      : "GoPlus Security",
  };
}

function check(
  name: WalletRiskCheck["name"],
  status: WalletRiskCheck["status"],
  detail: string,
): WalletRiskCheck {
  return { name, status, detail };
}

export async function assessWalletRisk(input: WalletRiskInput): Promise<WalletRiskDecision> {
  const address = validateWalletAddress(input.address);
  const [base, intelligence] = await Promise.all([
    fetchBaseEvidence(address),
    fetchGoPlusEvidence(address),
  ]);
  const hasCode = base.code !== "0x" && !/^0x0*$/u.test(base.code);
  const accountType = hasCode || intelligence.contract ? "contract" : "eoa";
  const hasActivity = hasCode || base.transactionCount > 0n ||
    base.nativeBalanceWei > 0n || base.usdcBalanceAtomic > 0n;
  const denied = intelligence.flags.length > 0;
  const checks: WalletRiskCheck[] = [
    check("address", "pass", "The recipient is a normalized non-burn EVM address."),
    check(
      "malicious_intelligence",
      denied ? "deny" : "pass",
      denied
        ? `Live malicious-address intelligence reported: ${intelligence.flags.join(", ")}.`
        : "Live malicious-address intelligence reported no known risk flags.",
    ),
    check(
      "sanctions",
      intelligence.sanctioned ? "deny" : "pass",
      intelligence.sanctioned
        ? "The address is flagged for sanctions exposure."
        : "The live intelligence source did not flag sanctions exposure.",
    ),
    check(
      "activity",
      hasActivity ? "pass" : "review",
      hasActivity
        ? "Base RPC observed account code, transactions, or a non-zero native/USDC balance."
        : "The address has no observed code, outgoing transactions, native balance, or USDC balance; treat it as unestablished.",
    ),
    check(
      "account_type",
      "pass",
      accountType === "contract"
        ? "Base RPC or live intelligence identifies the recipient as a contract."
        : "The recipient currently appears to be an externally owned account.",
    ),
    check("sources", "pass", "Evidence was collected live from Base RPC and GoPlus malicious-address intelligence."),
  ];
  const status = denied
    ? "denied"
    : hasActivity
      ? "safe_to_proceed"
      : "needs_review";
  const requestId = crypto.randomUUID();
  const assessedAt = new Date().toISOString();
  return {
    intentfence: "0.7",
    request_id: requestId,
    status,
    risk_level: denied ? "critical" : hasActivity ? "low" : "medium",
    risk_score: denied ? 100 : hasActivity ? 5 : 40,
    assessed_at: assessedAt,
    subject: { address, network: INTENTFENCE_NETWORK, account_type: accountType },
    observed: {
      block_number: base.blockNumber,
      transaction_count: base.transactionCount.toString(),
      native_balance_wei: base.nativeBalanceWei.toString(),
      usdc_balance_atomic: base.usdcBalanceAtomic.toString(),
      code_sha256: hasCode ? await sha256(base.code.toLowerCase()) : null,
      malicious_flags: intelligence.flags,
      malicious_contracts_created: intelligence.maliciousContracts,
      intelligence_source: intelligence.dataSource,
    },
    checks,
    receipt: {
      id: `if_wallet_${requestId}`,
      issued_at: assessedAt,
      subject: address,
      action: { type: "wallet.counterparty-risk", resource: `${INTENTFENCE_NETWORK}:${address}` },
      signed: false,
      assurance: "live-base-wallet-risk",
      note: "A low-risk result means no listed malicious flags were observed and the address was established on Base at assessment time. It does not prove identity, ownership, or future behavior.",
    },
  };
}

export const walletRiskInputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["address"],
  properties: {
    address: {
      type: "string",
      pattern: "^0x[0-9a-fA-F]{40}$",
      description: "Base recipient or counterparty address to assess before payment.",
    },
  },
} as const;
