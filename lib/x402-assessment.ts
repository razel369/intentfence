import { parsePaymentRequired } from "@x402/core/schemas";
import { getDefaultAsset } from "@x402/evm";
import { INTENTFENCE_NETWORK, INTENTFENCE_USDC_CONTRACT } from "./x402.ts";

const MAX_URL_LENGTH = 2_048;
const MAX_PAYMENT_REQUIRED_LENGTH = 16_384;
const MAX_ALLOWED_PAYEES = 20;
const MAX_ACCEPTED_PAYMENTS = 20;
const MAX_PAYMENT_TIMEOUT_SECONDS = 600;
const USDC_DECIMALS = 6;
const CANONICAL_BASE_USDC = getDefaultAsset(INTENTFENCE_NETWORK);
const PASSIVE_EXTENSION_KEYS = new Set(["bazaar"]);
const STANDARD_EIP3009_EXTRA_KEYS = new Set(["name", "version"]);

export type X402AssessmentInput = {
  subject: string;
  target_url: string;
  method: "GET" | "HEAD" | "POST";
  payment_required: string;
  policy: {
    max_price_usdc: string;
    allowed_payees?: string[];
  };
};

export type X402AssessmentCheck = {
  name:
    | "target"
    | "payment_required"
    | "protocol"
    | "scheme"
    | "network"
    | "asset"
    | "price"
    | "payee"
    | "timeout"
    | "eip712_domain"
    | "transfer_method"
    | "extensions"
    | "resource_binding";
  status: "pass" | "review" | "deny";
  detail: string;
};

type AcceptedPayment = {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  pay_to: string;
  max_timeout_seconds: number;
  extra: {
    name: string | null;
    version: string | null;
    asset_transfer_method: string | null;
    keys: string[];
  };
};

export type X402AssessmentDecision = {
  intentfence: "0.6";
  request_id: string;
  status: "safe_to_proceed" | "needs_review" | "denied";
  assessed_at: string;
  target: {
    origin: string;
    pathname: string;
    has_query: boolean;
    method: "GET" | "HEAD" | "POST";
    url_sha256: string;
  };
  observed: {
    challenge_source: "caller-supplied-payment-required";
    x402_version: 2;
    payment_requirements_sha256: string;
    accepts: AcceptedPayment[];
  };
  checks: X402AssessmentCheck[];
  receipt: {
    id: string;
    issued_at: string;
    subject: string;
    action: {
      type: "x402.quote-assessment";
      resource: string;
    };
    signed: false;
    assurance: "caller-observed-x402-quote-assessment";
    note: string;
  };
};

type ParsedChallenge = {
  x402Version: 2;
  resource: { url: string };
  accepts: AcceptedPayment[];
  extensionKeys: string[];
};

export class X402AssessmentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "X402AssessmentValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim()) {
    throw new X402AssessmentValidationError(`${field} is required.`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new X402AssessmentValidationError(`${field} must be ${maxLength} characters or fewer.`);
  }
  return normalized;
}

function isEvmAddress(value: string) {
  return /^0x[0-9a-fA-F]{40}$/u.test(value);
}

function isBlockedHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/\.$/u, "");
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    normalized.endsWith(".lan") ||
    normalized === "metadata.google.internal" ||
    !normalized.includes(".")
  ) {
    return true;
  }
  return /^\[.*\]$/u.test(normalized) || /^[0-9.]+$/u.test(normalized);
}

function validatedTargetUrl(value: unknown) {
  const raw = requiredString(value, "target_url", MAX_URL_LENGTH);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new X402AssessmentValidationError("target_url must be a valid HTTPS URL.");
  }
  if (url.protocol !== "https:") {
    throw new X402AssessmentValidationError("target_url must use HTTPS.");
  }
  if (url.username || url.password) {
    throw new X402AssessmentValidationError("target_url must not contain embedded credentials.");
  }
  if (isBlockedHostname(url.hostname)) {
    throw new X402AssessmentValidationError("target_url must use a public DNS hostname.");
  }
  url.hash = "";
  return url;
}

function usdcToAtomic(value: unknown) {
  const normalized = requiredString(value, "policy.max_price_usdc", 32);
  if (!/^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,6})?$/u.test(normalized)) {
    throw new X402AssessmentValidationError(
      "policy.max_price_usdc must be a non-negative decimal string with at most 6 decimal places.",
    );
  }
  const [whole, fractional = ""] = normalized.split(".");
  return BigInt(whole) * BigInt(10) ** BigInt(USDC_DECIMALS) +
    BigInt(fractional.padEnd(USDC_DECIMALS, "0"));
}

function decodePaymentRequired(value: unknown) {
  const encoded = requiredString(
    value,
    "payment_required",
    MAX_PAYMENT_REQUIRED_LENGTH,
  );
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/u.test(encoded) || encoded.length % 4 === 1) {
    throw new X402AssessmentValidationError(
      "payment_required must be the base64 or base64url PAYMENT-REQUIRED header value.",
    );
  }

  try {
    const normalized = encoded.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { encoded, decoded: JSON.parse(json) as unknown };
  } catch {
    throw new X402AssessmentValidationError(
      "payment_required must decode to valid UTF-8 JSON.",
    );
  }
}

function challengeString(value: unknown, field: string, maxLength: number) {
  if (typeof value !== "string" || !value || value.length > maxLength) {
    throw new X402AssessmentValidationError(
      `payment_required ${field} must be a non-empty string of at most ${maxLength} characters.`,
    );
  }
  return value;
}

function parseChallenge(value: unknown): ParsedChallenge {
  const official = parsePaymentRequired(value);
  if (!official.success || official.data.x402Version !== 2) {
    throw new X402AssessmentValidationError(
      "payment_required must satisfy the official x402 v2 PAYMENT-REQUIRED schema.",
    );
  }
  if (!isRecord(value) || value.x402Version !== 2) {
    throw new X402AssessmentValidationError("payment_required must contain an x402 v2 challenge.");
  }
  if (!isRecord(value.resource)) {
    throw new X402AssessmentValidationError("payment_required.resource must be an object.");
  }
  const resourceUrl = challengeString(value.resource.url, "resource.url", MAX_URL_LENGTH);
  if (
    value.resource.description !== undefined &&
    (typeof value.resource.description !== "string" || value.resource.description.length > 1_000)
  ) {
    throw new X402AssessmentValidationError(
      "payment_required resource.description must be a string of at most 1000 characters.",
    );
  }
  if (
    value.resource.mimeType !== undefined &&
    (typeof value.resource.mimeType !== "string" || value.resource.mimeType.length > 200)
  ) {
    throw new X402AssessmentValidationError(
      "payment_required resource.mimeType must be a string of at most 200 characters.",
    );
  }
  if (
    !Array.isArray(value.accepts) ||
    value.accepts.length === 0 ||
    value.accepts.length > MAX_ACCEPTED_PAYMENTS
  ) {
    throw new X402AssessmentValidationError(
      `payment_required.accepts must contain 1 to ${MAX_ACCEPTED_PAYMENTS} payment options.`,
    );
  }

  const accepts = value.accepts.map((entry, index): AcceptedPayment => {
    if (!isRecord(entry)) {
      throw new X402AssessmentValidationError(
        `payment_required.accepts[${index}] must be an object.`,
      );
    }
    const scheme = challengeString(entry.scheme, `accepts[${index}].scheme`, 64);
    const network = challengeString(entry.network, `accepts[${index}].network`, 128);
    const amount = challengeString(entry.amount, `accepts[${index}].amount`, 78);
    if (!/^[0-9]{1,78}$/u.test(amount)) {
      throw new X402AssessmentValidationError(
        `payment_required accepts[${index}].amount must be an atomic-unit integer string.`,
      );
    }
    const asset = challengeString(entry.asset, `accepts[${index}].asset`, 200);
    const payTo = challengeString(entry.payTo, `accepts[${index}].payTo`, 200);
    if (
      !Number.isInteger(entry.maxTimeoutSeconds) ||
      (entry.maxTimeoutSeconds as number) < 1 ||
      (entry.maxTimeoutSeconds as number) > MAX_PAYMENT_TIMEOUT_SECONDS
    ) {
      throw new X402AssessmentValidationError(
        `payment_required accepts[${index}].maxTimeoutSeconds must be an integer from 1 to ${MAX_PAYMENT_TIMEOUT_SECONDS}.`,
      );
    }
    if (entry.extra !== undefined && entry.extra !== null && !isRecord(entry.extra)) {
      throw new X402AssessmentValidationError(
        `payment_required accepts[${index}].extra must be an object when supplied.`,
      );
    }
    const extra = isRecord(entry.extra) ? entry.extra : {};
    const extraKeys = Object.keys(extra).sort();
    if (extraKeys.length > 20 || extraKeys.some((key) => key.length > 100)) {
      throw new X402AssessmentValidationError(
        `payment_required accepts[${index}].extra has too many or oversized keys.`,
      );
    }
    return {
      scheme,
      network,
      amount,
      asset,
      pay_to: payTo,
      max_timeout_seconds: entry.maxTimeoutSeconds as number,
      extra: {
        name: typeof extra.name === "string" ? extra.name : null,
        version: typeof extra.version === "string" ? extra.version : null,
        asset_transfer_method:
          typeof extra.assetTransferMethod === "string" ? extra.assetTransferMethod : null,
        keys: extraKeys,
      },
    };
  });

  if (value.extensions !== undefined && value.extensions !== null && !isRecord(value.extensions)) {
    throw new X402AssessmentValidationError(
      "payment_required.extensions must be an object when supplied.",
    );
  }
  const extensionKeys = isRecord(value.extensions)
    ? Object.keys(value.extensions).sort()
    : [];
  if (extensionKeys.length > 20 || extensionKeys.some((key) => key.length > 100)) {
    throw new X402AssessmentValidationError(
      "payment_required.extensions has too many or oversized keys.",
    );
  }

  return {
    x402Version: 2,
    resource: { url: resourceUrl },
    accepts,
    extensionKeys,
  };
}

export function validateX402AssessmentInput(value: unknown): X402AssessmentInput {
  if (!isRecord(value)) {
    throw new X402AssessmentValidationError("The request body must be a JSON object.");
  }
  if (!isRecord(value.policy)) {
    throw new X402AssessmentValidationError("policy must be a JSON object.");
  }

  const target = validatedTargetUrl(value.target_url);
  const method = value.method === undefined ? "GET" : value.method;
  if (method !== "GET" && method !== "HEAD" && method !== "POST") {
    throw new X402AssessmentValidationError("method must be GET, HEAD, or POST.");
  }

  usdcToAtomic(value.policy.max_price_usdc);
  const { encoded, decoded } = decodePaymentRequired(value.payment_required);
  parseChallenge(decoded);

  let allowedPayees: string[] | undefined;
  if (value.policy.allowed_payees !== undefined) {
    if (
      !Array.isArray(value.policy.allowed_payees) ||
      value.policy.allowed_payees.length === 0 ||
      value.policy.allowed_payees.length > MAX_ALLOWED_PAYEES
    ) {
      throw new X402AssessmentValidationError(
        `policy.allowed_payees must contain 1 to ${MAX_ALLOWED_PAYEES} EVM addresses.`,
      );
    }
    allowedPayees = value.policy.allowed_payees.map((payee, index) => {
      if (typeof payee !== "string" || !isEvmAddress(payee)) {
        throw new X402AssessmentValidationError(
          `policy.allowed_payees[${index}] must be an EVM address.`,
        );
      }
      return payee.toLowerCase();
    });
  }

  return {
    subject: requiredString(value.subject, "subject", 200),
    target_url: target.toString(),
    method,
    payment_required: encoded,
    policy: {
      max_price_usdc: value.policy.max_price_usdc as string,
      ...(allowedPayees ? { allowed_payees: [...new Set(allowedPayees)] } : {}),
    },
  };
}

async function sha256(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function amountWithinLimit(amount: string, limit: bigint) {
  try {
    return BigInt(amount) <= limit;
  } catch {
    return false;
  }
}

function check(
  name: X402AssessmentCheck["name"],
  status: X402AssessmentCheck["status"],
  detail: string,
): X402AssessmentCheck {
  return { name, status, detail };
}

export async function assessX402Resource(
  input: X402AssessmentInput,
): Promise<X402AssessmentDecision> {
  const target = new URL(input.target_url);
  const requestId = crypto.randomUUID();
  const assessedAt = new Date().toISOString();
  const targetHash = await sha256(target.toString());
  const paymentRequirementsHash = await sha256(input.payment_required);
  const { decoded } = decodePaymentRequired(input.payment_required);
  const challenge = parseChallenge(decoded);
  const limit = usdcToAtomic(input.policy.max_price_usdc);
  const optionCount = challenge.accepts.length;

  const exactOptions = challenge.accepts.filter((payment) => payment.scheme === "exact");
  const baseOptions = exactOptions.filter((payment) => payment.network === INTENTFENCE_NETWORK);
  const usdcOptions = baseOptions.filter(
    (payment) =>
      isEvmAddress(payment.asset) &&
      payment.asset.toLowerCase() === INTENTFENCE_USDC_CONTRACT.toLowerCase(),
  );
  const canonicalDomainOptions = usdcOptions.filter(
    (payment) =>
      payment.extra.name === CANONICAL_BASE_USDC.name &&
      payment.extra.version === CANONICAL_BASE_USDC.version,
  );
  const nonStandardTransferOptions = challenge.accepts.filter(
    (payment) =>
      payment.extra.asset_transfer_method !== null ||
      payment.extra.keys.some((key) => !STANDARD_EIP3009_EXTRA_KEYS.has(key)),
  );
  const unknownExtensionKeys = challenge.extensionKeys.filter(
    (key) => !PASSIVE_EXTENSION_KEYS.has(key),
  );
  const withinPriceOptions = canonicalDomainOptions.filter(
    (payment) => amountWithinLimit(payment.amount, limit),
  );
  const validPayeeOptions = withinPriceOptions.filter(
    (payment) => isEvmAddress(payment.pay_to),
  );
  const allowlist = input.policy.allowed_payees;
  const allowedOptions = allowlist
    ? validPayeeOptions.filter((payment) => allowlist.includes(payment.pay_to.toLowerCase()))
    : [];
  const safeOptions = allowedOptions.filter(
    (payment) =>
      payment.extra.asset_transfer_method === null &&
      payment.extra.keys.every((key) => STANDARD_EIP3009_EXTRA_KEYS.has(key)),
  );

  let resourceMatches = false;
  try {
    const observed = new URL(challenge.resource.url);
    observed.hash = "";
    resourceMatches = observed.toString() === target.toString();
  } catch {
    resourceMatches = false;
  }

  const checks: X402AssessmentCheck[] = [
    check("target", "pass", "The caller supplied a normalized public HTTPS target URL."),
    check(
      "payment_required",
      "pass",
      "The caller-supplied PAYMENT-REQUIRED value is valid UTF-8 JSON with a bounded x402 payment schema.",
    ),
    check("protocol", "pass", "The supplied challenge advertises x402 v2."),
    check(
      "scheme",
      exactOptions.length === optionCount ? "pass" : "deny",
      exactOptions.length === optionCount
        ? "Every advertised payment option uses the exact scheme."
        : "At least one advertised payment option does not use the exact scheme.",
    ),
    check(
      "network",
      baseOptions.length === optionCount ? "pass" : "deny",
      baseOptions.length === optionCount
        ? "Every advertised payment option uses Base mainnet (eip155:8453)."
        : "At least one advertised payment option does not use Base mainnet (eip155:8453).",
    ),
    check(
      "asset",
      usdcOptions.length === optionCount ? "pass" : "deny",
      usdcOptions.length === optionCount
        ? "Every advertised payment option uses canonical Base USDC."
        : "At least one advertised payment option does not use canonical Base USDC.",
    ),
    check(
      "eip712_domain",
      canonicalDomainOptions.length === optionCount ? "pass" : "deny",
      canonicalDomainOptions.length === optionCount
        ? `Every advertised payment option declares the expected EIP-712 domain (${CANONICAL_BASE_USDC.name} v${CANONICAL_BASE_USDC.version}).`
        : "At least one advertised payment option does not declare the expected EIP-712 name and version.",
    ),
    check(
      "price",
      withinPriceOptions.length === optionCount ? "pass" : "deny",
      withinPriceOptions.length === optionCount
        ? `Every advertised payment option is within the ${input.policy.max_price_usdc} USDC ceiling.`
        : `At least one advertised payment option exceeds or cannot be validated against the ${input.policy.max_price_usdc} USDC ceiling.`,
    ),
    check(
      "payee",
      !allowlist ? "review" : allowedOptions.length === optionCount ? "pass" : "deny",
      !allowlist
        ? "No payee allowlist was supplied; IntentFence will not classify an unknown recipient as safe."
        : allowedOptions.length === optionCount
          ? "Every advertised payment option pays a recipient on the caller's allowlist."
          : "At least one advertised payment option pays an invalid or unapproved recipient.",
    ),
    check(
      "timeout",
      "pass",
      `Every payment option has an integer timeout from 1 to ${MAX_PAYMENT_TIMEOUT_SECONDS} seconds.`,
    ),
    check(
      "transfer_method",
      nonStandardTransferOptions.length > 0 ? "review" : "pass",
      nonStandardTransferOptions.length > 0
        ? "At least one option requests a non-standard or unreviewed transfer method or extra field."
        : "Every option uses the standard EIP-3009 extra fields; no Permit2 or unknown transfer method was requested.",
    ),
    check(
      "extensions",
      unknownExtensionKeys.length > 0 ? "review" : "pass",
      unknownExtensionKeys.length > 0
        ? `Unreviewed x402 extension keys are present: ${unknownExtensionKeys.join(", ")}.`
        : challenge.extensionKeys.length > 0
          ? "Only the passive Bazaar discovery extension is present."
          : "No top-level x402 extensions are present.",
    ),
    check(
      "resource_binding",
      resourceMatches ? "pass" : "deny",
      resourceMatches
        ? "The challenge resource URL exactly matches the caller-supplied target URL."
        : "The challenge is not bound to the exact caller-supplied target URL.",
    ),
  ];

  const status = checks.some((item) => item.status === "deny")
    ? "denied"
    : checks.some((item) => item.status === "review") || safeOptions.length !== optionCount
      ? "needs_review"
      : "safe_to_proceed";

  return {
    intentfence: "0.6",
    request_id: requestId,
    status,
    assessed_at: assessedAt,
    target: {
      origin: target.origin,
      pathname: target.pathname,
      has_query: Boolean(target.search),
      method: input.method,
      url_sha256: targetHash,
    },
    observed: {
      challenge_source: "caller-supplied-payment-required",
      x402_version: 2,
      payment_requirements_sha256: paymentRequirementsHash,
      accepts: challenge.accepts,
    },
    checks,
    receipt: {
      id: `if_x402_${requestId}`,
      issued_at: assessedAt,
      subject: input.subject,
      action: {
        type: "x402.quote-assessment",
        resource: `sha256:${targetHash}`,
      },
      signed: false,
      assurance: "caller-observed-x402-quote-assessment",
      note: "Assessment of the exact caller-supplied PAYMENT-REQUIRED value. Compare its SHA-256 with the current challenge immediately before signing the target payment.",
    },
  };
}

export const x402AssessmentInputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["subject", "target_url", "payment_required", "policy"],
  properties: {
    subject: {
      type: "string",
      minLength: 1,
      maxLength: 200,
      description: "Agent or principal identifier.",
    },
    target_url: {
      type: "string",
      format: "uri",
      maxLength: MAX_URL_LENGTH,
      description: "Exact public HTTPS resource URL from the caller-observed x402 challenge.",
    },
    method: { type: "string", enum: ["GET", "HEAD", "POST"], default: "GET" },
    payment_required: {
      type: "string",
      minLength: 1,
      maxLength: MAX_PAYMENT_REQUIRED_LENGTH,
      description: "Exact base64 or base64url PAYMENT-REQUIRED header value observed by the caller.",
    },
    policy: {
      type: "object",
      additionalProperties: false,
      required: ["max_price_usdc"],
      properties: {
        max_price_usdc: {
          type: "string",
          pattern: "^(?:0|[1-9][0-9]{0,11})(?:\\.[0-9]{1,6})?$",
          description: "Exact USDC ceiling as a decimal string.",
        },
        allowed_payees: {
          type: "array",
          minItems: 1,
          maxItems: MAX_ALLOWED_PAYEES,
          uniqueItems: true,
          description: "Explicit payee allowlist. Without it, the result cannot be safe_to_proceed.",
          items: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
        },
      },
    },
  },
} as const;
