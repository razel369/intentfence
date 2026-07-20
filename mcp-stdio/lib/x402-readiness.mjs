export class X402ReadinessValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "X402ReadinessValidationError";
  }
}

const MAX_BODY_BYTES = 4_096;
const PRICE_PATTERN = /^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,6})?$/u;

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBlockedHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/\.$/u, "");
  return normalized === "localhost" || normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") || normalized.endsWith(".internal") ||
    normalized.endsWith(".lan") || normalized === "metadata.google.internal" ||
    !normalized.includes(".") || /^\[.*\]$/u.test(normalized) || /^[0-9.]+$/u.test(normalized);
}

export function validateX402ReadinessInput(value) {
  if (!isRecord(value)) throw new X402ReadinessValidationError("The request body must be a JSON object.");
  const allowed = new Set(["subject", "target_url", "method", "body", "max_price_usdc", "allowed_payees", "policy"]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new X402ReadinessValidationError(`Unknown request fields: ${unknown.join(", ")}.`);
  if (value.policy !== undefined && !isRecord(value.policy)) throw new X402ReadinessValidationError("policy must be a JSON object when supplied.");
  if (value.policy !== undefined && (value.max_price_usdc !== undefined || value.allowed_payees !== undefined)) {
    throw new X402ReadinessValidationError("Send max_price_usdc and allowed_payees either at the top level or inside legacy policy, not both.");
  }
  const rawUrl = typeof value.target_url === "string" ? value.target_url.trim() : "";
  let target;
  try { target = new URL(rawUrl); } catch { throw new X402ReadinessValidationError("target_url must be a valid HTTPS URL."); }
  if (!rawUrl || rawUrl.length > 2_048 || target.protocol !== "https:" || target.username || target.password || target.port || isBlockedHostname(target.hostname)) {
    throw new X402ReadinessValidationError("target_url must use a public HTTPS DNS hostname on the standard port without embedded credentials.");
  }
  target.hash = "";
  const method = value.method ?? "GET";
  if (!["GET", "HEAD", "POST"].includes(method)) throw new X402ReadinessValidationError("method must be GET, HEAD, or POST.");
  if (method !== "POST" && value.body !== undefined) throw new X402ReadinessValidationError("body is only supported when method is POST.");
  if (value.body !== undefined) {
    let encoded;
    try { encoded = JSON.stringify(value.body); } catch { throw new X402ReadinessValidationError("body must be valid JSON data."); }
    if (Buffer.byteLength(encoded, "utf8") > MAX_BODY_BYTES) throw new X402ReadinessValidationError(`body must be ${MAX_BODY_BYTES} bytes or smaller.`);
  }
  const subject = value.subject === undefined ? "agent:anonymous-marketplace-buyer" : typeof value.subject === "string" ? value.subject.trim() : "";
  if (!subject || subject.length > 200) throw new X402ReadinessValidationError("subject must be 1 to 200 characters.");
  const policy = isRecord(value.policy) ? value.policy : { max_price_usdc: value.max_price_usdc ?? "1.00", allowed_payees: value.allowed_payees };
  const policyUnknown = Object.keys(policy).filter((key) => !["max_price_usdc", "allowed_payees"].includes(key));
  if (policyUnknown.length) throw new X402ReadinessValidationError(`Unknown policy fields: ${policyUnknown.join(", ")}.`);
  const maxPrice = policy.max_price_usdc;
  if (typeof maxPrice !== "string" || !PRICE_PATTERN.test(maxPrice)) throw new X402ReadinessValidationError("max_price_usdc must be a non-negative decimal string with at most 6 decimal places.");
  let allowedPayees;
  if (policy.allowed_payees !== undefined) {
    if (!Array.isArray(policy.allowed_payees) || policy.allowed_payees.length < 1 || policy.allowed_payees.length > 20) throw new X402ReadinessValidationError("allowed_payees must contain 1 to 20 EVM addresses.");
    allowedPayees = [...new Set(policy.allowed_payees.map((payee, index) => {
      if (typeof payee !== "string" || !/^0x[0-9a-fA-F]{40}$/u.test(payee)) throw new X402ReadinessValidationError(`allowed_payees[${index}] must be an EVM address.`);
      return payee.toLowerCase();
    }))];
  }
  return {
    subject,
    target_url: target.toString(),
    method,
    ...(value.body !== undefined ? { body: value.body } : {}),
    policy: { max_price_usdc: maxPrice, ...(allowedPayees ? { allowed_payees: allowedPayees } : {}) },
  };
}
