export class X402AssessmentValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "X402AssessmentValidationError";
  }
}

const MAX_PAYMENT_REQUIRED_LENGTH = 16_384;
const MAX_ACCEPTED_PAYMENTS = 20;
const MAX_PAYMENT_TIMEOUT_SECONDS = 600;

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value, field, maxLength) {
  if (typeof value !== "string" || !value.trim()) {
    throw new X402AssessmentValidationError(`${field} is required.`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new X402AssessmentValidationError(`${field} must be ${maxLength} characters or fewer.`);
  }
  return normalized;
}

function isEvmAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/u.test(value);
}

function isBlockedHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/\.$/u, "");
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    normalized.endsWith(".lan") ||
    normalized === "metadata.google.internal" ||
    !normalized.includes(".") ||
    /^\[.*\]$/u.test(normalized) ||
    /^[0-9.]+$/u.test(normalized)
  );
}

function decodePaymentRequired(value) {
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
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.from(padded, "base64"),
    );
    return { encoded, decoded: JSON.parse(decoded) };
  } catch {
    throw new X402AssessmentValidationError(
      "payment_required must decode to valid UTF-8 JSON.",
    );
  }
}

function challengeString(value, field, maxLength) {
  if (typeof value !== "string" || !value || value.length > maxLength) {
    throw new X402AssessmentValidationError(
      `payment_required ${field} must be a non-empty string of at most ${maxLength} characters.`,
    );
  }
  return value;
}

function validatePaymentChallenge(value) {
  if (!isRecord(value) || value.x402Version !== 2) {
    throw new X402AssessmentValidationError(
      "payment_required must contain an x402 v2 challenge.",
    );
  }
  if (!isRecord(value.resource)) {
    throw new X402AssessmentValidationError(
      "payment_required.resource must be an object.",
    );
  }
  challengeString(value.resource.url, "resource.url", 2048);
  if (
    value.resource.description !== undefined &&
    (typeof value.resource.description !== "string" ||
      value.resource.description.length > 1_000)
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

  value.accepts.forEach((entry, index) => {
    if (!isRecord(entry)) {
      throw new X402AssessmentValidationError(
        `payment_required.accepts[${index}] must be an object.`,
      );
    }
    challengeString(entry.scheme, `accepts[${index}].scheme`, 64);
    challengeString(entry.network, `accepts[${index}].network`, 128);
    const amount = challengeString(entry.amount, `accepts[${index}].amount`, 78);
    if (!/^[0-9]{1,78}$/u.test(amount)) {
      throw new X402AssessmentValidationError(
        `payment_required accepts[${index}].amount must be an atomic-unit integer string.`,
      );
    }
    challengeString(entry.asset, `accepts[${index}].asset`, 200);
    challengeString(entry.payTo, `accepts[${index}].payTo`, 200);
    if (
      !Number.isInteger(entry.maxTimeoutSeconds) ||
      entry.maxTimeoutSeconds < 1 ||
      entry.maxTimeoutSeconds > MAX_PAYMENT_TIMEOUT_SECONDS
    ) {
      throw new X402AssessmentValidationError(
        `payment_required accepts[${index}].maxTimeoutSeconds must be an integer from 1 to ${MAX_PAYMENT_TIMEOUT_SECONDS}.`,
      );
    }
  });
}

export function validateX402AssessmentInput(value) {
  if (!isRecord(value)) {
    throw new X402AssessmentValidationError("The request body must be a JSON object.");
  }
  if (!isRecord(value.policy)) {
    throw new X402AssessmentValidationError("policy must be a JSON object.");
  }
  const subject = requiredString(value.subject, "subject", 200);
  const rawUrl = requiredString(value.target_url, "target_url", 2048);
  let target;
  try {
    target = new URL(rawUrl);
  } catch {
    throw new X402AssessmentValidationError("target_url must be a valid HTTPS URL.");
  }
  if (
    target.protocol !== "https:" ||
    target.username ||
    target.password ||
    isBlockedHostname(target.hostname)
  ) {
    throw new X402AssessmentValidationError(
      "target_url must use a public HTTPS DNS hostname without embedded credentials.",
    );
  }
  target.hash = "";
  const method = value.method ?? "GET";
  if (method !== "GET" && method !== "HEAD" && method !== "POST") {
    throw new X402AssessmentValidationError("method must be GET, HEAD, or POST.");
  }
  const { encoded: paymentRequired, decoded: paymentChallenge } =
    decodePaymentRequired(value.payment_required);
  validatePaymentChallenge(paymentChallenge);
  const maxPrice = requiredString(
    value.policy.max_price_usdc,
    "policy.max_price_usdc",
    32,
  );
  if (!/^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,6})?$/u.test(maxPrice)) {
    throw new X402AssessmentValidationError(
      "policy.max_price_usdc must be a non-negative decimal string with at most 6 decimal places.",
    );
  }

  let allowedPayees;
  if (value.policy.allowed_payees !== undefined) {
    if (
      !Array.isArray(value.policy.allowed_payees) ||
      value.policy.allowed_payees.length === 0 ||
      value.policy.allowed_payees.length > 20
    ) {
      throw new X402AssessmentValidationError(
        "policy.allowed_payees must contain 1 to 20 EVM addresses.",
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
    subject,
    target_url: target.toString(),
    method,
    payment_required: paymentRequired,
    policy: {
      max_price_usdc: maxPrice,
      ...(allowedPayees ? { allowed_payees: [...new Set(allowedPayees)] } : {}),
    },
  };
}
