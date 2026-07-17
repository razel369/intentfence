import { x402Client } from "@x402/core/client";
import { decodePaymentResponseHeader } from "@x402/core/http";
import type { PaymentRequired, PaymentRequirements } from "@x402/core/types";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

type JsonRecord = Record<string, unknown>;
type HttpMethod = "GET" | "HEAD" | "POST";
type HexPrivateKey = `0x${string}`;

type AssessmentRequest = {
  subject: string;
  target_url: string;
  method?: HttpMethod;
  payment_required: string;
  policy: {
    max_price_usdc: string;
    allowed_payees?: string[];
  };
};

type ChallengeSummary = {
  x402_version: 2;
  resource_url: string;
  scheme: "exact";
  network: "eip155:8453";
  asset: string;
  amount_atomic: "5000";
  pay_to: string;
  option_count: number;
};

type RunMode =
  | { kind: "dry-run" }
  | { kind: "payment"; privateKey: HexPrivateKey };

const DEFAULT_BASE_URL = "https://agentpass-protocol.rmalka06.chatgpt.site";
const ASSESSMENT_PATH = "/api/x402-assessments";
const PAYMENT_CONFIRMATION = "YES_SPEND_0.005_USDC_ON_BASE_MAINNET";

const EXPECTED_PAYMENT = {
  x402Version: 2,
  scheme: "exact",
  network: "eip155:8453",
  amountAtomic: "5000",
  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  payTo: "0x833ca7dcdb6a681ddc0c15982ef0d609bceb3a5e",
  maxTimeoutSeconds: 300,
} as const satisfies {
  x402Version: 2;
  scheme: "exact";
  network: "eip155:8453";
  amountAtomic: "5000";
  asset: `0x${string}`;
  payTo: `0x${string}`;
  maxTimeoutSeconds: number;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHttpMethod(value: string): value is HttpMethod {
  return value === "GET" || value === "HEAD" || value === "POST";
}

function isPrivateKey(value: string | undefined): value is HexPrivateKey {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/u.test(value);
}

function isPaymentRequirement(value: unknown): value is PaymentRequirements {
  if (!isRecord(value)) return false;
  return (
    typeof value.scheme === "string" &&
    typeof value.network === "string" &&
    /^[a-z0-9]+:[a-zA-Z0-9]+$/u.test(value.network) &&
    typeof value.asset === "string" &&
    typeof value.amount === "string" &&
    typeof value.payTo === "string" &&
    typeof value.maxTimeoutSeconds === "number" &&
    Number.isInteger(value.maxTimeoutSeconds) &&
    isRecord(value.extra)
  );
}

function isPaymentRequired(value: unknown): value is PaymentRequired {
  if (!isRecord(value) || !isRecord(value.resource)) return false;
  return (
    typeof value.x402Version === "number" &&
    typeof value.resource.url === "string" &&
    Array.isArray(value.accepts) &&
    value.accepts.length > 0 &&
    value.accepts.every(isPaymentRequirement)
  );
}

function isAssessmentRequest(value: unknown): value is AssessmentRequest {
  if (!isRecord(value) || !isRecord(value.policy)) return false;
  const methodIsValid =
    value.method === undefined ||
    (typeof value.method === "string" && isHttpMethod(value.method));
  const allowedPayeesAreValid =
    value.policy.allowed_payees === undefined ||
    (Array.isArray(value.policy.allowed_payees) &&
      value.policy.allowed_payees.length > 0 &&
      value.policy.allowed_payees.every(
        (payee) => typeof payee === "string" && isAddress(payee),
      ));
  return (
    typeof value.subject === "string" &&
    value.subject.length > 0 &&
    typeof value.target_url === "string" &&
    value.target_url.length > 0 &&
    methodIsValid &&
    typeof value.payment_required === "string" &&
    value.payment_required.length > 0 &&
    typeof value.policy.max_price_usdc === "string" &&
    /^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/u.test(
      value.policy.max_price_usdc,
    ) &&
    allowedPayeesAreValid
  );
}

function readNested(value: unknown, keys: readonly string[]): unknown {
  let current = value;
  for (const key of keys) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

function decodePaymentRequiredHeader(value: string): PaymentRequired {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(value, "base64").toString("utf8"));
  } catch {
    throw new Error("PAYMENT-REQUIRED was not valid base64-encoded JSON.");
  }
  if (!isPaymentRequired(decoded)) {
    throw new Error("PAYMENT-REQUIRED did not match the expected x402 shape.");
  }
  return decoded;
}

function verifyIntentFenceChallenge(
  paymentRequired: PaymentRequired,
  endpoint: string,
): ChallengeSummary {
  if (paymentRequired.x402Version !== EXPECTED_PAYMENT.x402Version) {
    throw new Error(`Refusing x402 version ${paymentRequired.x402Version}.`);
  }
  if (paymentRequired.resource.url !== endpoint) {
    throw new Error(
      `Refusing payment for unexpected resource ${paymentRequired.resource.url}.`,
    );
  }

  for (const option of paymentRequired.accepts) {
    if (option.scheme !== EXPECTED_PAYMENT.scheme) {
      throw new Error(`Refusing unexpected payment scheme ${option.scheme}.`);
    }
    if (option.network !== EXPECTED_PAYMENT.network) {
      throw new Error(`Refusing unexpected payment network ${option.network}.`);
    }
    if (option.amount !== EXPECTED_PAYMENT.amountAtomic) {
      throw new Error(`Refusing unexpected amount ${option.amount}.`);
    }
    if (option.asset.toLowerCase() !== EXPECTED_PAYMENT.asset.toLowerCase()) {
      throw new Error(`Refusing unexpected asset ${option.asset}.`);
    }
    if (option.payTo.toLowerCase() !== EXPECTED_PAYMENT.payTo.toLowerCase()) {
      throw new Error(`Refusing unexpected payee ${option.payTo}.`);
    }
    if (
      option.maxTimeoutSeconds < 1 ||
      option.maxTimeoutSeconds > EXPECTED_PAYMENT.maxTimeoutSeconds
    ) {
      throw new Error(
        `Refusing timeout ${option.maxTimeoutSeconds}; maximum is ${EXPECTED_PAYMENT.maxTimeoutSeconds}.`,
      );
    }
  }

  const first = paymentRequired.accepts[0];
  if (!first) throw new Error("No payment options were advertised.");
  return {
    x402_version: 2,
    resource_url: paymentRequired.resource.url,
    scheme: "exact",
    network: "eip155:8453",
    asset: first.asset,
    amount_atomic: "5000",
    pay_to: first.payTo,
    option_count: paymentRequired.accepts.length,
  };
}

function baseUrl(): string {
  return (process.env.INTENTFENCE_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/u, "");
}

async function loadOpenApiExample(rootUrl: string): Promise<AssessmentRequest> {
  const response = await fetch(`${rootUrl}/openapi.json`, {
    headers: { Accept: "application/json", "X-IntentFence-Source": "synthetic" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`OpenAPI discovery failed with HTTP ${response.status}.`);
  }
  const document: unknown = await response.json();
  const example = readNested(document, [
    "paths",
    ASSESSMENT_PATH,
    "post",
    "requestBody",
    "content",
    "application/json",
    "example",
  ]);
  if (!isAssessmentRequest(example)) {
    throw new Error("OpenAPI did not contain a valid x402 assessment example.");
  }
  return example;
}

function customAssessmentRequest(): AssessmentRequest | null {
  const challenge = process.env.TARGET_PAYMENT_REQUIRED?.trim();
  const targetUrl = process.env.TARGET_URL?.trim();
  if (!challenge && !targetUrl) return null;
  if (!challenge || !targetUrl) {
    throw new Error(
      "TARGET_URL and TARGET_PAYMENT_REQUIRED must be supplied together.",
    );
  }

  let parsedTarget: URL;
  try {
    parsedTarget = new URL(targetUrl);
  } catch {
    throw new Error("TARGET_URL must be an absolute URL.");
  }
  if (parsedTarget.protocol !== "https:") {
    throw new Error("TARGET_URL must use HTTPS.");
  }

  const method = (process.env.TARGET_METHOD ?? "GET").trim().toUpperCase();
  if (!isHttpMethod(method)) {
    throw new Error("TARGET_METHOD must be GET, HEAD, or POST.");
  }
  const maxPrice = process.env.MAX_PRICE_USDC?.trim();
  if (!maxPrice || !/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/u.test(maxPrice)) {
    throw new Error("MAX_PRICE_USDC is required and must be a USDC decimal string.");
  }
  const allowedPayees = (process.env.ALLOWED_PAYEES ?? "")
    .split(",")
    .map((payee) => payee.trim())
    .filter((payee) => payee.length > 0);
  if (
    allowedPayees.length === 0 ||
    !allowedPayees.every((payee) => isAddress(payee))
  ) {
    throw new Error("ALLOWED_PAYEES must contain one or more comma-separated EVM addresses.");
  }

  return {
    subject: process.env.SUBJECT?.trim() || "agent:intentfence-buyer-example",
    target_url: parsedTarget.toString(),
    method,
    payment_required: challenge,
    policy: {
      max_price_usdc: maxPrice,
      allowed_payees: allowedPayees,
    },
  };
}

async function assessmentRequest(rootUrl: string): Promise<AssessmentRequest> {
  return customAssessmentRequest() ?? loadOpenApiExample(rootUrl);
}

function requestInit(
  input: AssessmentRequest,
  source: "synthetic" | "x402-buyer-example",
): RequestInit {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-IntentFence-Source": source,
  } satisfies HeadersInit;
  return {
    method: "POST",
    headers,
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(30_000),
  };
}

async function dryRunChallenge(
  endpoint: string,
  input: AssessmentRequest,
): Promise<ChallengeSummary> {
  const response = await fetch(endpoint, requestInit(input, "synthetic"));
  const body = await response.text();
  if (response.status !== 402) {
    throw new Error(
      `Expected an unpaid 402 challenge, received HTTP ${response.status}: ${body.slice(0, 300)}`,
    );
  }
  const encoded = response.headers.get("PAYMENT-REQUIRED");
  if (!encoded) throw new Error("The 402 response omitted PAYMENT-REQUIRED.");
  return verifyIntentFenceChallenge(
    decodePaymentRequiredHeader(encoded),
    endpoint,
  );
}

function resolveRunMode(): RunMode {
  const command = process.argv[2] ?? "--dry-run";
  if (command === "--dry-run") {
    if (process.env.CONFIRM_PAYMENT || process.env.EVM_PRIVATE_KEY) {
      throw new Error(
        "Dry-run refuses payment environment variables. Unset them, or use the explicit npm run pay command.",
      );
    }
    return { kind: "dry-run" };
  }
  if (command !== "--pay") {
    throw new Error("Use --dry-run or --pay. No payment was created.");
  }
  const confirmation = process.env.CONFIRM_PAYMENT?.trim();
  if (confirmation !== PAYMENT_CONFIRMATION) {
    throw new Error(
      `CONFIRM_PAYMENT must exactly equal ${PAYMENT_CONFIRMATION}; no payment was created.`,
    );
  }
  const privateKey = process.env.EVM_PRIVATE_KEY?.trim();
  if (!isPrivateKey(privateKey)) {
    throw new Error(
      "EVM_PRIVATE_KEY must be a 0x-prefixed 32-byte private key; no payment was created.",
    );
  }
  return { kind: "payment", privateKey };
}

function requireSignedReceiptJws(value: unknown): string {
  if (!isRecord(value) || !isRecord(value.receipt)) {
    throw new Error("Paid response omitted the IntentFence receipt.");
  }
  const receipt = value.receipt;
  if (receipt.signed !== true || !isRecord(receipt.signature)) {
    throw new Error("Paid response did not contain a signed receipt.");
  }
  const jws = receipt.signature.jws;
  if (
    typeof jws !== "string" ||
    jws.length < 100 ||
    jws.length > 32_768 ||
    jws.split(".").length !== 3
  ) {
    throw new Error("Paid response contained an invalid compact JWS receipt.");
  }
  return jws;
}

async function verifySignedReceipt(rootUrl: string, jws: string): Promise<void> {
  const response = await fetch(`${rootUrl}/api/receipts/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-IntentFence-Source": "x402-buyer-example",
    },
    body: JSON.stringify({ jws }),
    signal: AbortSignal.timeout(15_000),
  });
  const result: unknown = await response.json();
  if (!response.ok || !isRecord(result) || result.valid !== true) {
    throw new Error("IntentFence receipt verification failed after settlement.");
  }
}

function paidResultSummary(value: unknown): JsonRecord {
  if (!isRecord(value)) return { response: "non_object" };
  const receipt = isRecord(value.receipt) ? value.receipt : null;
  return {
    status: typeof value.status === "string" ? value.status : "unknown",
    request_id:
      typeof value.request_id === "string" ? value.request_id : "unknown",
    receipt_id:
      receipt && typeof receipt.id === "string" ? receipt.id : "unknown",
    receipt_signed: receipt?.signed === true,
  };
}

async function payForAssessment(
  rootUrl: string,
  endpoint: string,
  input: AssessmentRequest,
  privateKey: HexPrivateKey,
): Promise<void> {
  const account = privateKeyToAccount(privateKey);
  const client = new x402Client();
  client.register("eip155:*", new ExactEvmScheme(account));
  client.onBeforePaymentCreation(async ({ paymentRequired }) => {
    const summary = verifyIntentFenceChallenge(paymentRequired, endpoint);
    console.log("Live payment challenge re-verified before signing:");
    console.log(JSON.stringify(summary, null, 2));
  });

  const fetchWithPayment = wrapFetchWithPayment(fetch, client);
  const response = await fetchWithPayment(
    endpoint,
    requestInit(input, "x402-buyer-example"),
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Paid request failed with HTTP ${response.status}: ${text.slice(0, 300)}`,
    );
  }
  const paymentResponseHeader = response.headers.get("PAYMENT-RESPONSE");
  if (!paymentResponseHeader) {
    throw new Error("Paid response omitted PAYMENT-RESPONSE settlement proof.");
  }
  const settlement = decodePaymentResponseHeader(paymentResponseHeader);
  if (
    settlement.success !== true ||
    settlement.network !== EXPECTED_PAYMENT.network ||
    typeof settlement.transaction !== "string" ||
    settlement.transaction.length === 0
  ) {
    throw new Error("PAYMENT-RESPONSE did not prove a successful Base settlement.");
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error("Paid response was not valid JSON.");
  }
  const receiptJws = requireSignedReceiptJws(body);
  await verifySignedReceipt(rootUrl, receiptJws);
  console.log("Payment settled and signed assessment received:");
  console.log(JSON.stringify(paidResultSummary(body), null, 2));
}

async function main(): Promise<void> {
  const mode = resolveRunMode();
  const rootUrl = baseUrl();
  const endpoint = `${rootUrl}${ASSESSMENT_PATH}`;
  const input = await assessmentRequest(rootUrl);

  const summary = await dryRunChallenge(endpoint, input);
  console.log("Dry-run passed. No payment was created or signed:");
  console.log(JSON.stringify(summary, null, 2));

  if (mode.kind === "dry-run") {
    console.log(
      `Payment remains disabled. Use npm run pay with CONFIRM_PAYMENT=${PAYMENT_CONFIRMATION} and EVM_PRIVATE_KEY only when you intentionally want to spend real Base USDC.`,
    );
    return;
  }

  await payForAssessment(rootUrl, endpoint, input, mode.privateKey);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Unexpected failure.");
  process.exitCode = 1;
});
