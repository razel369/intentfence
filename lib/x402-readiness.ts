import {
  assessX402Resource,
  validateX402AssessmentInput,
  validateX402TargetUrl,
  X402AssessmentValidationError,
} from "./x402-assessment.ts";
import type { X402AssessmentDecision } from "./x402-assessment.ts";

const MAX_SUBJECT_LENGTH = 200;
const MAX_BODY_BYTES = 4_096;
const FETCH_TIMEOUT_MS = 8_000;
const DNS_TIMEOUT_MS = 4_000;
const DNS_JSON_URL = "https://cloudflare-dns.com/dns-query";

type ReadinessMethod = "GET" | "HEAD" | "POST";

export type X402ReadinessInput = {
  subject: string;
  target_url: string;
  method: ReadinessMethod;
  body?: unknown;
  policy: {
    max_price_usdc: string;
    allowed_payees?: string[];
  };
};

export type X402ReadinessResult = {
  intentfence: "0.8";
  request_id: string;
  status: "ready" | "ready_with_review" | "not_ready";
  checked_at: string;
  target: {
    origin: string;
    pathname: string;
    has_query: boolean;
    method: ReadinessMethod;
  };
  observed: {
    http_status: number | null;
    payment_required_present: boolean;
    redirect_blocked: boolean;
  };
  checks: Array<{
    name: "public_target" | "live_challenge" | "x402_assessment";
    status: "pass" | "review" | "deny";
    detail: string;
  }>;
  assessment: X402AssessmentDecision | null;
  receipt: {
    id: string;
    issued_at: string;
    subject: string;
    action: { type: "x402.endpoint-readiness"; resource: string };
    signed: false;
    assurance: "live-no-payment-x402-readiness";
    note: string;
  };
};

type DnsAnswer = { type?: unknown; data?: unknown };
type DnsResponse = { Status?: unknown; Answer?: unknown };

export class X402ReadinessValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "X402ReadinessValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim()) {
    throw new X402ReadinessValidationError(`${field} is required.`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new X402ReadinessValidationError(`${field} must be ${maxLength} characters or fewer.`);
  }
  return normalized;
}

function serializedBody(value: unknown) {
  if (value === undefined) return undefined;
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new X402ReadinessValidationError("body must be valid JSON data.");
  }
  if (new TextEncoder().encode(serialized).byteLength > MAX_BODY_BYTES) {
    throw new X402ReadinessValidationError(`body must be ${MAX_BODY_BYTES} bytes or smaller.`);
  }
  return serialized;
}

export function validateX402ReadinessInput(value: unknown): X402ReadinessInput {
  if (!isRecord(value)) {
    throw new X402ReadinessValidationError("The request body must be a JSON object.");
  }
  if (!isRecord(value.policy)) {
    throw new X402ReadinessValidationError("policy must be a JSON object.");
  }

  let target: URL;
  try {
    target = validateX402TargetUrl(value.target_url);
  } catch (error) {
    if (error instanceof X402AssessmentValidationError) {
      throw new X402ReadinessValidationError(error.message);
    }
    throw error;
  }
  if (target.port) {
    throw new X402ReadinessValidationError("target_url must use the standard HTTPS port.");
  }

  const method = value.method === undefined ? "GET" : value.method;
  if (method !== "GET" && method !== "HEAD" && method !== "POST") {
    throw new X402ReadinessValidationError("method must be GET, HEAD, or POST.");
  }
  if (method !== "POST" && value.body !== undefined) {
    throw new X402ReadinessValidationError("body is only supported when method is POST.");
  }
  serializedBody(value.body);

  const subject = requiredString(value.subject, "subject", MAX_SUBJECT_LENGTH);
  try {
    const probeChallenge = btoa(JSON.stringify({
      x402Version: 2,
      resource: { url: target.toString() },
      accepts: [{
        scheme: "exact",
        network: "eip155:8453",
        amount: "0",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x0000000000000000000000000000000000000000",
        maxTimeoutSeconds: 1,
        extra: { name: "USD Coin", version: "2" },
      }],
    }));
    const policyProbe = validateX402AssessmentInput({
      subject,
      target_url: target.toString(),
      method,
      payment_required: probeChallenge,
      policy: value.policy,
    });
    return {
      subject,
      target_url: target.toString(),
      method,
      ...(value.body !== undefined ? { body: value.body } : {}),
      policy: policyProbe.policy,
    };
  } catch (error) {
    if (error instanceof X402AssessmentValidationError) {
      throw new X402ReadinessValidationError(error.message);
    }
    throw error;
  }
}

function parseIpv4(address: string) {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const numbers = parts.map((part) => Number(part));
  if (numbers.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return numbers;
}

function isPublicIpv4(address: string) {
  const parts = parseIpv4(address);
  if (!parts) return false;
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function expandIpv6(address: string) {
  const normalized = address.toLowerCase().split("%")[0];
  const mappedIndex = normalized.lastIndexOf(":");
  const tail = normalized.slice(mappedIndex + 1);
  const ipv4 = parseIpv4(tail);
  let candidate = normalized;
  if (ipv4) {
    const high = ((ipv4[0] << 8) | ipv4[1]).toString(16);
    const low = ((ipv4[2] << 8) | ipv4[3]).toString(16);
    candidate = `${normalized.slice(0, mappedIndex)}:${high}:${low}`;
  }
  const halves = candidate.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - left.length - right.length : 0;
  const parts = [...left, ...Array.from({ length: fill }, () => "0"), ...right];
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/u.test(part))) return null;
  return parts.map((part) => Number.parseInt(part, 16));
}

function isPublicIpv6(address: string) {
  const parts = expandIpv6(address);
  if (!parts) return false;
  const [first, second] = parts;
  if (parts.every((part) => part === 0) || parts.slice(0, 7).every((part) => part === 0) && parts[7] === 1) return false;
  if ((first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80) return false;
  if ((first & 0xff00) === 0xff00) return false;
  if (first === 0x2001 && second === 0x0db8) return false;
  if (parts.slice(0, 5).every((part) => part === 0) && parts[5] === 0xffff) {
    return isPublicIpv4(`${parts[6] >> 8}.${parts[6] & 255}.${parts[7] >> 8}.${parts[7] & 255}`);
  }
  return true;
}

export function isPublicIpAddress(address: string) {
  return address.includes(":") ? isPublicIpv6(address) : isPublicIpv4(address);
}

async function defaultResolve(hostname: string): Promise<string[]> {
  const query = async (type: "A" | "AAAA") => {
    const response = await fetch(
      `${DNS_JSON_URL}?name=${encodeURIComponent(hostname)}&type=${type}`,
      {
        headers: { Accept: "application/dns-json" },
        redirect: "error",
        signal: AbortSignal.timeout(DNS_TIMEOUT_MS),
      },
    );
    if (!response.ok) throw new Error("dns_lookup_failed");
    const payload = await response.json() as DnsResponse;
    if (payload.Status !== 0 && payload.Status !== 3) throw new Error("dns_lookup_failed");
    const answers = Array.isArray(payload.Answer) ? payload.Answer as DnsAnswer[] : [];
    return answers
      .filter((answer) => answer.type === (type === "A" ? 1 : 28) && typeof answer.data === "string")
      .map((answer) => answer.data as string);
  };
  const [ipv4, ipv6] = await Promise.all([query("A"), query("AAAA")]);
  return [...ipv4, ...ipv6];
}

type ReadinessDependencies = {
  fetchTarget?: typeof fetch;
  resolveHostname?: (hostname: string) => Promise<string[]>;
};

function baseResult(input: X402ReadinessInput, requestId: string, checkedAt: string) {
  const target = new URL(input.target_url);
  return {
    intentfence: "0.8" as const,
    request_id: requestId,
    checked_at: checkedAt,
    target: {
      origin: target.origin,
      pathname: target.pathname,
      has_query: Boolean(target.search),
      method: input.method,
    },
  };
}

function receipt(input: X402ReadinessInput, requestId: string, checkedAt: string) {
  return {
    id: `if_ready_${requestId}`,
    issued_at: checkedAt,
    subject: input.subject,
    action: { type: "x402.endpoint-readiness" as const, resource: input.target_url },
    signed: false as const,
    assurance: "live-no-payment-x402-readiness" as const,
    note: "IntentFence performed one bounded live request without credentials or payment. Re-check the current challenge immediately before signing any payment.",
  };
}

export async function checkX402EndpointReadiness(
  input: X402ReadinessInput,
  dependencies: ReadinessDependencies = {},
): Promise<X402ReadinessResult> {
  const requestId = crypto.randomUUID();
  const checkedAt = new Date().toISOString();
  const common = baseResult(input, requestId, checkedAt);
  const target = new URL(input.target_url);
  const resolveHostname = dependencies.resolveHostname ?? defaultResolve;
  const fetchTarget = dependencies.fetchTarget ?? fetch;

  let addresses: string[];
  try {
    addresses = await resolveHostname(target.hostname);
  } catch {
    addresses = [];
  }
  if (addresses.length === 0 || addresses.some((address) => !isPublicIpAddress(address))) {
    return {
      ...common,
      status: "not_ready",
      observed: { http_status: null, payment_required_present: false, redirect_blocked: false },
      checks: [
        { name: "public_target", status: "deny", detail: "The hostname did not resolve exclusively to public Internet addresses." },
        { name: "live_challenge", status: "deny", detail: "IntentFence did not contact the target." },
        { name: "x402_assessment", status: "deny", detail: "No live x402 challenge was available to assess." },
      ],
      assessment: null,
      receipt: receipt(input, requestId, checkedAt),
    };
  }

  let response: Response;
  try {
    const body = input.method === "POST" ? serializedBody(input.body) : undefined;
    response = await fetchTarget(input.target_url, {
      method: input.method,
      headers: {
        Accept: "application/json, application/problem+json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body }),
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    return {
      ...common,
      status: "not_ready",
      observed: { http_status: null, payment_required_present: false, redirect_blocked: false },
      checks: [
        { name: "public_target", status: "pass", detail: "The hostname resolved exclusively to public Internet addresses." },
        { name: "live_challenge", status: "deny", detail: "The target did not return a usable response within the bounded live check." },
        { name: "x402_assessment", status: "deny", detail: "No live x402 challenge was available to assess." },
      ],
      assessment: null,
      receipt: receipt(input, requestId, checkedAt),
    };
  }

  const redirectBlocked = response.status >= 300 && response.status < 400;
  const paymentRequired = response.headers.get("payment-required");
  if (response.status !== 402 || !paymentRequired || redirectBlocked) {
    return {
      ...common,
      status: "not_ready",
      observed: {
        http_status: response.status,
        payment_required_present: Boolean(paymentRequired),
        redirect_blocked: redirectBlocked,
      },
      checks: [
        { name: "public_target", status: "pass", detail: "The hostname resolved exclusively to public Internet addresses." },
        {
          name: "live_challenge",
          status: "deny",
          detail: redirectBlocked
            ? "The target returned a redirect; redirects are not followed during readiness checks."
            : "The target did not return HTTP 402 with a PAYMENT-REQUIRED header.",
        },
        { name: "x402_assessment", status: "deny", detail: "No complete live x402 challenge was available to assess." },
      ],
      assessment: null,
      receipt: receipt(input, requestId, checkedAt),
    };
  }

  try {
    const assessmentInput = validateX402AssessmentInput({
      subject: input.subject,
      target_url: input.target_url,
      method: input.method,
      payment_required: paymentRequired,
      policy: input.policy,
    });
    const assessment = await assessX402Resource(assessmentInput);
    const status = assessment.status === "denied"
      ? "not_ready"
      : assessment.status === "needs_review"
        ? "ready_with_review"
        : "ready";
    return {
      ...common,
      status,
      observed: { http_status: 402, payment_required_present: true, redirect_blocked: false },
      checks: [
        { name: "public_target", status: "pass", detail: "The hostname resolved exclusively to public Internet addresses." },
        { name: "live_challenge", status: "pass", detail: "The target returned HTTP 402 with a PAYMENT-REQUIRED header." },
        {
          name: "x402_assessment",
          status: assessment.status === "denied" ? "deny" : assessment.status === "needs_review" ? "review" : "pass",
          detail: `The live challenge assessment returned ${assessment.status}.`,
        },
      ],
      assessment,
      receipt: receipt(input, requestId, checkedAt),
    };
  } catch (error) {
    return {
      ...common,
      status: "not_ready",
      observed: { http_status: 402, payment_required_present: true, redirect_blocked: false },
      checks: [
        { name: "public_target", status: "pass", detail: "The hostname resolved exclusively to public Internet addresses." },
        { name: "live_challenge", status: "pass", detail: "The target returned HTTP 402 with a PAYMENT-REQUIRED header." },
        {
          name: "x402_assessment",
          status: "deny",
          detail: error instanceof X402AssessmentValidationError
            ? error.message
            : "The live x402 challenge could not be safely validated.",
        },
      ],
      assessment: null,
      receipt: receipt(input, requestId, checkedAt),
    };
  }
}

export const x402ReadinessInputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["subject", "target_url", "policy"],
  properties: {
    subject: { type: "string", minLength: 1, maxLength: MAX_SUBJECT_LENGTH },
    target_url: {
      type: "string",
      format: "uri",
      maxLength: 2_048,
      description: "Public HTTPS x402 resource URL on the standard HTTPS port.",
    },
    method: { type: "string", enum: ["GET", "HEAD", "POST"], default: "GET" },
    body: {
      description: `Optional JSON request body for POST probes, limited to ${MAX_BODY_BYTES} encoded bytes.`,
    },
    policy: {
      type: "object",
      additionalProperties: false,
      required: ["max_price_usdc"],
      properties: {
        max_price_usdc: {
          type: "string",
          pattern: "^(?:0|[1-9][0-9]{0,11})(?:\\.[0-9]{1,6})?$",
          description: "Maximum acceptable x402 price in USDC.",
        },
        allowed_payees: {
          type: "array",
          minItems: 1,
          maxItems: 20,
          uniqueItems: true,
          items: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
          description: "Optional explicit payee allowlist. Omission yields ready_with_review for an otherwise valid quote.",
        },
      },
    },
  },
} as const;
