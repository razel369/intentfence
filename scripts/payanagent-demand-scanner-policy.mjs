export const INTENTFENCE_PAYANAGENT_ID = "j57d8w639k1c1d33k0hf5g7d5h8atk9g";
export const TARGETED_REVIEW_REQUEST_ID = "ks7aadkccsnmnec57j1dmrxgts8aw2zw";

const MAX_TEXT_LENGTH = 20_000;
const MAX_INPUT_PAYLOAD_LENGTH = 16_384;
const ADDRESS_PATTERN = /\b0x[0-9a-fA-F]{40}\b/gu;
const MONTH_PATTERN = /\b20[0-9]{2}-(?:0[1-9]|1[0-2])\b/gu;
const HTTPS_PATTERN = /https:\/\/[^\s<>"'`]+/giu;

const SERVICE_CONFIG = {
  x402_readiness: {
    endpoint: "/api/x402-readiness/preview",
    estimatedDurationSeconds: 15,
    bidMessage:
      "IntentFence can verify this public x402 endpoint with one credential-free, no-redirect probe and return HTTP 402, PAYMENT-REQUIRED, Base USDC price, payee, timeout, and resource-binding evidence. The target is never paid. One targeted marketplace bid only.",
  },
  base_wallet_risk: {
    endpoint: "/api/wallet-risk/preview",
    estimatedDurationSeconds: 15,
    bidMessage:
      "IntentFence can screen this Base wallet for live malicious-address, sanctions, phishing, account-code, activity, and balance evidence and return safe, review, or denied. This is counterparty screening, not identity verification. One targeted marketplace bid only.",
  },
  us_cpi: {
    endpoint: "/api/us-cpi/preview",
    estimatedDurationSeconds: 10,
    bidMessage:
      "IntentFence can deliver the latest or requested U.S. headline and core CPI observations with year-over-year inflation rates from the official Bureau of Labor Statistics. One targeted marketplace bid only.",
  },
};

function text(value) {
  return typeof value === "string" ? value.slice(0, MAX_TEXT_LENGTH) : "";
}

function requestText(request) {
  return `${text(request?.title)}\n${text(request?.description)}`;
}

function unique(values) {
  return [...new Set(values)];
}

function normalizeHttpsUrl(raw) {
  const trimmed = raw.replace(/[),.;:!?]+$/u, "");
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (url.port && url.port !== "443") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function httpsUrls(value) {
  return unique(
    [...text(value).matchAll(HTTPS_PATTERN)]
      .map((match) => normalizeHttpsUrl(match[0]))
      .filter(Boolean),
  );
}

function addresses(value) {
  return unique([...text(value).matchAll(ADDRESS_PATTERN)].map((match) => match[0].toLowerCase()));
}

function months(value) {
  return unique([...text(value).matchAll(MONTH_PATTERN)].map((match) => match[0]));
}

function parseInputPayload(value) {
  if (typeof value !== "string" || value.length > MAX_INPUT_PAYLOAD_LENGTH) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function classifySupportedRequest(request) {
  if (!request || typeof request !== "object") return null;
  const combined = requestText(request);
  const lower = combined.toLowerCase();
  const urls = httpsUrls(combined);
  const walletAddresses = addresses(combined);

  const asksForX402Readiness =
    /\bx402\b/u.test(lower) &&
    /\b(?:endpoint|url|payment route|resource)\b/u.test(lower) &&
    /\b(?:readiness|verify|validate|check|inspect|preflight)\b/u.test(lower);
  if (asksForX402Readiness && urls.length === 1) {
    return { kind: "x402_readiness", target_url: urls[0] };
  }

  const asksForBaseWalletRisk =
    /\bbase\b/u.test(lower) &&
    /\bwallet\b/u.test(lower) &&
    /\b(?:risk|sanctions|screen|screening|phishing|safety|safe|check)\b/u.test(lower);
  if (asksForBaseWalletRisk && walletAddresses.length === 1) {
    return { kind: "base_wallet_risk", address: walletAddresses[0] };
  }

  const asksForUsCpi =
    /\b(?:u\.?s\.?|united states)\b/u.test(lower) &&
    /\bcpi\b/u.test(lower) &&
    /\b(?:data|inflation|latest|month|observation|series|rate)\b/u.test(lower);
  if (asksForUsCpi) {
    return { kind: "us_cpi", month: months(combined)[0] };
  }

  return null;
}

export function decideDemandAction({ request, bids = [], agentId = INTENTFENCE_PAYANAGENT_ID }) {
  if (!request || typeof request !== "object" || typeof request._id !== "string") {
    return { action: "noop", reason: "invalid-request" };
  }
  if (request._id === TARGETED_REVIEW_REQUEST_ID) {
    return { action: "noop", reason: "handled-by-targeted-review" };
  }
  if (request.buyerId === agentId) return { action: "noop", reason: "self-request" };

  const service = classifySupportedRequest(request);
  if (!service) return { action: "noop", reason: "unsupported-or-ambiguous" };

  if (request.status === "accepted") {
    return request.providerId === agentId
      ? { action: "fulfill", service }
      : { action: "noop", reason: "assigned-to-another-provider" };
  }

  if (request.status !== "open") {
    return { action: "noop", reason: `not-actionable:${String(request.status)}` };
  }
  if (!Number.isInteger(request.budgetMaxCents) || request.budgetMaxCents < 1) {
    return { action: "noop", reason: "budget-too-low" };
  }
  const existingBid = bids.find((bid) => bid?.bidderId === agentId);
  if (existingBid) {
    return { action: "noop", reason: "bid-already-exists", bidId: existingBid._id };
  }

  const config = SERVICE_CONFIG[service.kind];
  return {
    action: "bid",
    service,
    bid: {
      priceCents: 1,
      estimatedDurationSeconds: config.estimatedDurationSeconds,
      message: config.bidMessage,
    },
  };
}

export function buildFulfillmentInput(service, fullRequest) {
  if (!service || !SERVICE_CONFIG[service.kind]) throw new Error("Unsupported service kind");
  const parsed = parseInputPayload(fullRequest?.inputPayload);
  const payloadText = text(fullRequest?.inputPayload);

  if (service.kind === "x402_readiness") {
    const rawUrl = typeof parsed.target_url === "string" ? parsed.target_url : service.target_url;
    const targetUrl = normalizeHttpsUrl(rawUrl ?? "");
    if (!targetUrl) throw new Error("A single public HTTPS target_url is required");
    const input = { target_url: targetUrl };
    if (["GET", "HEAD", "POST"].includes(parsed.method)) input.method = parsed.method;
    if (typeof parsed.max_price_usdc === "string") input.max_price_usdc = parsed.max_price_usdc;
    if (Array.isArray(parsed.allowed_payees)) input.allowed_payees = parsed.allowed_payees.slice(0, 20);
    if (parsed.method === "POST" && parsed.body !== undefined) input.body = parsed.body;
    return input;
  }

  if (service.kind === "base_wallet_risk") {
    const candidate = typeof parsed.address === "string"
      ? parsed.address
      : service.address ?? addresses(payloadText)[0];
    if (!candidate || !/^0x[0-9a-fA-F]{40}$/u.test(candidate)) {
      throw new Error("One Base wallet address is required");
    }
    return { address: candidate.toLowerCase() };
  }

  const candidateMonth = typeof parsed.month === "string"
    ? parsed.month
    : service.month ?? months(payloadText)[0];
  if (candidateMonth && !/^20[0-9]{2}-(?:0[1-9]|1[0-2])$/u.test(candidateMonth)) {
    throw new Error("month must use YYYY-MM");
  }
  return candidateMonth ? { month: candidateMonth } : {};
}

export function serviceEndpoint(kind) {
  const endpoint = SERVICE_CONFIG[kind]?.endpoint;
  if (!endpoint) throw new Error("Unsupported service kind");
  return endpoint;
}
