import { readFile } from "node:fs/promises";

const apiKey = process.env.PAYANAGENT_API_KEY?.trim();
if (!apiKey) throw new Error("PAYANAGENT_API_KEY is required");
const deliverySecret = process.env.PAYANAGENT_DELIVERY_SECRET?.trim();
if (!deliverySecret || deliverySecret.length < 32) {
  throw new Error("PAYANAGENT_DELIVERY_SECRET must contain at least 32 characters");
}

const marketplaceUrl = "https://payanagent.com";
const serviceUrl = "https://agentpass-protocol.rmalka06.chatgpt.site";
const sellerId =
  process.env.PAYANAGENT_AGENT_ID?.trim() ??
  "j57d8w639k1c1d33k0hf5g7d5h8atk9g";
const settlementWallet = "0x833ca7dcdb6a681ddc0c15982ef0d609bceb3a5e";
const primaryOfferId = process.env.PAYANAGENT_PRIMARY_OFFER_ID?.trim();
const quoteOfferId = process.env.PAYANAGENT_QUOTE_OFFER_ID?.trim();
const readinessOfferId =
  process.env.PAYANAGENT_READINESS_OFFER_ID?.trim() ??
  "kh7bq10drx7cwf2djcc1aqgpvn8axce3";
const walletRiskOfferId = process.env.PAYANAGENT_WALLET_RISK_OFFER_ID?.trim();
const obsoleteOfferIds = [...new Set([
  ...(process.env.PAYANAGENT_OBSOLETE_OFFER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  "kh79sp39hh7ayghkvfy6avb6158axpsg",
])];
const openapi = JSON.parse(
  await readFile(new URL("../public/openapi.json", import.meta.url), "utf8"),
);
const protectedEndpoint = (path) =>
  `${serviceUrl}${path}?payan_token=${encodeURIComponent(deliverySecret)}`;

const walletRiskOutputSchema = JSON.stringify({
  type: "object",
  required: [
    "intentfence",
    "request_id",
    "status",
    "risk_level",
    "risk_score",
    "subject",
    "observed",
    "checks",
    "receipt",
    "verification_tier",
  ],
  properties: {
    intentfence: { type: "string", const: "0.7" },
    request_id: { type: "string", format: "uuid" },
    status: {
      type: "string",
      enum: ["safe_to_proceed", "needs_review", "denied"],
    },
    risk_level: { type: "string", enum: ["low", "medium", "critical"] },
    risk_score: { type: "number" },
    subject: { type: "object" },
    observed: { type: "object" },
    checks: { type: "array", items: { type: "object" } },
    receipt: { type: "object" },
    verification_tier: {
      type: "string",
      const: "live-base-wallet-risk+marketplace-delivery",
    },
  },
});

const x402ReadinessOutputSchema = JSON.stringify({
  type: "object",
  required: [
    "intentfence",
    "request_id",
    "status",
    "checked_at",
    "target",
    "observed",
    "checks",
    "assessment",
    "receipt",
    "verification_tier",
  ],
  properties: {
    intentfence: { type: "string", const: "0.8" },
    request_id: { type: "string", format: "uuid" },
    status: { type: "string", enum: ["ready", "ready_with_review", "not_ready"] },
    checked_at: { type: "string", format: "date-time" },
    target: { type: "object" },
    observed: { type: "object" },
    checks: { type: "array", items: { type: "object" } },
    assessment: { anyOf: [{ type: "object" }, { type: "null" }] },
    receipt: { type: "object" },
    verification_tier: {
      type: "string",
      const: "live-x402-readiness+marketplace-delivery",
    },
  },
});

const desiredAgentProfile = {
  description:
    "IntentFence is an AI-agent payment safety API for x402 and Base USDC. Searchable tools include live x402 endpoint readiness from a URL, Base wallet risk and sanctions screening before paying, PAYMENT-REQUIRED quote security checks, policy preflight, and official U.S. CPI data. Results are machine-readable, evidence-backed, and fail closed when required live evidence is unavailable.",
  tags: [
    "ai-agents",
    "x402",
    "endpoint-readiness",
    "payment-safety",
    "wallet-risk",
    "sanctions",
    "phishing",
    "counterparty-risk",
    "base-usdc",
    "policy-preflight",
    "audit",
  ],
  agentUrl: serviceUrl,
};

const offers = [
  {
    title: "Official U.S. CPI & inflation data",
    description:
      "Retrieve the latest or a requested YYYY-MM U.S. headline CPI and core CPI observation, index values, and year-over-year inflation rates. Data is fetched from the official U.S. Bureau of Labor Statistics series CUUR0000SA0 and CUUR0000SA0L1E, normalized into stable JSON, and served through a six-hour edge cache. PayanAgent settles 0.01 USDC directly to the IntentFence wallet and supplies the on-chain receipt. For an IntentFence ES256 provenance receipt, use the separate direct x402 endpoint.",
    category: "Data",
    tags: ["cpi", "inflation", "economics", "official-data", "bls", "us-data", "x402", "base-usdc"],
    priceCents: 1,
    offerType: "api",
    endpoint: protectedEndpoint("/api/us-cpi/preview"),
    httpMethod: "POST",
    inputSchema: JSON.stringify({
      type: "object",
      additionalProperties: false,
      properties: {
        month: {
          type: "string",
          pattern: "^20[0-9]{2}-(?:0[1-9]|1[0-2])$",
          description: "Optional YYYY-MM period. Omit for the latest complete period.",
        },
      },
    }),
    outputSchema: JSON.stringify(openapi.components.schemas.UsCpiDecision),
    estimatedDurationSeconds: 3,
    previewDescription:
      "Official BLS headline and core CPI with year-over-year inflation rates in stable JSON.",
  },
  {
    idHint: readinessOfferId,
    title: "Verify x402 endpoint readiness before paying",
    description:
      "Verify public x402 endpoint readiness before paying. Send only target_url. IntentFence checks the live HTTP 402 and PAYMENT-REQUIRED response, Base USDC price, payee, scheme, timeout, and resource binding without sending credentials, following redirects, or paying the target. Optional max_price_usdc and allowed_payees add buyer policy. Returns ready, review, or not ready for 0.01 USDC.",
    category: "Trust",
    tags: [
      "x402",
      "endpoint-readiness",
      "payment-required",
      "payment-safety",
      "base-usdc",
      "preflight",
      "url-check",
      "ai-agents",
    ],
    priceCents: 1,
    offerType: "api",
    endpoint: protectedEndpoint("/api/x402-readiness/preview"),
    httpMethod: "POST",
    inputSchema: JSON.stringify({
      type: "object",
      additionalProperties: false,
      required: ["target_url"],
      properties: {
        subject: {
          type: "string",
          minLength: 1,
          maxLength: 200,
          default: "agent:anonymous-marketplace-buyer",
          description: "Optional buyer identifier.",
        },
        target_url: {
          type: "string",
          format: "uri",
          maxLength: 2048,
          description: "Public HTTPS x402 resource URL on the standard HTTPS port.",
        },
        method: { type: "string", enum: ["GET", "HEAD", "POST"], default: "GET" },
        body: {
          description: "Optional bounded JSON body for a POST probe.",
        },
        max_price_usdc: {
          type: "string",
          pattern: "^(?:0|[1-9][0-9]{0,11})(?:\\.[0-9]{1,6})?$",
          default: "1.00",
          description: "Optional maximum acceptable x402 price in USDC.",
        },
        allowed_payees: {
          type: "array",
          minItems: 1,
          maxItems: 20,
          uniqueItems: true,
          items: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
          description: "Optional trusted-recipient allowlist.",
        },
        policy: {
          type: "object",
          additionalProperties: false,
          required: ["max_price_usdc"],
          deprecated: true,
          description: "Legacy nested policy input.",
          properties: {
            max_price_usdc: {
              type: "string",
              pattern: "^(?:0|[1-9][0-9]{0,11})(?:\\.[0-9]{1,6})?$",
              description: "Maximum acceptable x402 price in USDC, for example 0.10.",
            },
            allowed_payees: {
              type: "array",
              minItems: 1,
              maxItems: 20,
              uniqueItems: true,
              items: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
              description: "Optional trusted-recipient allowlist.",
            },
          },
        },
      },
    }),
    outputSchema: x402ReadinessOutputSchema,
    estimatedDurationSeconds: 10,
    previewDescription:
      "One required field: target_url. Checks the live 402 challenge without paying the target.",
  },
  {
    idHint: quoteOfferId,
    title: "x402 quote safety assessment",
    description:
      "x402 payment safety and security check for AI agents before signing a target payment. Submit the exact caller-observed PAYMENT-REQUIRED header. IntentFence checks x402 v2 structure, exact scheme, Base mainnet, canonical USDC and EIP-712 domain, caller price ceiling, explicit payee allowlist, timeout, transfer method, extensions, and exact resource binding. Returns safe_to_proceed, needs_review, or denied with check-level evidence. PayanAgent settles 0.01 USDC to the seller and supplies its settlement receipt; the direct signed IntentFence route remains available separately.",
    category: "Trust",
    tags: ["x402", "quote", "payment-safety", "usdc", "base", "payee", "policy", "preflight"],
    priceCents: 1,
    offerType: "api",
    endpoint: protectedEndpoint("/api/x402-assessments/preview"),
    httpMethod: "POST",
    inputSchema: JSON.stringify(openapi.components.schemas.X402AssessmentRequest),
    outputSchema: JSON.stringify(openapi.components.schemas.X402AssessmentDecision),
    estimatedDurationSeconds: 2,
    previewDescription:
      "Checks a live x402 quote against a caller-owned ceiling and payee allowlist before payment.",
  },
  {
    idHint: walletRiskOfferId,
    title: "Check a Base wallet before paying",
    description:
      "Base wallet risk and sanctions check for AI agents before an x402 or USDC payment. Submit one Base wallet address. IntentFence performs live wallet screening for sanctions, phishing, mixers, money laundering, cybercrime, malicious contracts, account code, transaction activity, and native/USDC balances using GoPlus intelligence and chain-verified Base RPC evidence. Returns safe_to_proceed, needs_review, or denied with check-level evidence. This is counterparty screening, not identity verification or a guarantee of future behavior. PayanAgent settles 0.01 USDC directly to the IntentFence wallet and attaches its receipt.",
    category: "Trust",
    tags: [
      "base",
      "wallet",
      "usdc",
      "counterparty-risk",
      "sanctions",
      "phishing",
      "x402",
      "payment-safety",
    ],
    priceCents: 1,
    offerType: "api",
    endpoint: protectedEndpoint("/api/wallet-risk/preview"),
    httpMethod: "POST",
    inputSchema: JSON.stringify({
      type: "object",
      additionalProperties: false,
      required: ["address"],
      properties: {
        address: {
          type: "string",
          pattern: "^0x[0-9a-fA-F]{40}$",
          description: "Base recipient or counterparty address to screen.",
          example: settlementWallet,
        },
      },
    }),
    outputSchema: walletRiskOutputSchema,
    estimatedDurationSeconds: 8,
    previewDescription:
      "One-address live Base risk screen with malicious-activity, sanctions, account, activity, and balance evidence.",
  },
];

const authHeaders = {
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
};

async function marketplaceJson(path, init = {}) {
  const response = await fetch(`${marketplaceUrl}${path}`, {
    ...init,
    headers: { ...authHeaders, ...init.headers },
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${path} returned invalid JSON (${response.status})`);
  }
  if (!response.ok) {
    throw new Error(`${path} failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

async function findOwnedOffer(title, idHint) {
  if (idHint) {
    const detail = await marketplaceJson(`/api/v1/offers/${idHint}`);
    const offer = detail.offer ?? detail;
    if (offer.sellerId === sellerId && offer.title === title) return offer;
  }
  const search = await marketplaceJson(
    `/api/v1/offers?q=${encodeURIComponent(title)}&limit=20`,
  );
  for (const candidate of search.offers ?? []) {
    if (candidate.title !== title) continue;
    const detail = await marketplaceJson(`/api/v1/offers/${candidate._id}`);
    const offer = detail.offer ?? detail;
    if (offer.sellerId === sellerId) return offer;
  }
  return null;
}

const results = [];
const currentAgent = await marketplaceJson(`/api/v1/agents/${sellerId}`);
const profileMatches =
  currentAgent.description === desiredAgentProfile.description &&
  currentAgent.agentUrl === desiredAgentProfile.agentUrl &&
  JSON.stringify(currentAgent.tags ?? []) === JSON.stringify(desiredAgentProfile.tags);
if (profileMatches) {
  results.push({ title: "IntentFence agent profile", action: "unchanged" });
} else {
  await marketplaceJson(`/api/v1/agents/${sellerId}`, {
    method: "PATCH",
    body: JSON.stringify(desiredAgentProfile),
  });
  results.push({ title: "IntentFence agent profile", action: "updated" });
}

for (const desired of offers) {
  const { idHint, ...payload } = desired;
  const existing = await findOwnedOffer(payload.title, idHint);
  if (existing) {
    await marketplaceJson(`/api/v1/offers/${existing._id}`, {
      method: "PATCH",
      body: JSON.stringify({ ...payload, offerType: undefined }),
    });
    results.push({ title: payload.title, offer_id: existing._id, action: "updated" });
  } else {
    const created = await marketplaceJson("/api/v1/offers", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    results.push({ title: payload.title, offer_id: created.offerId, action: "created" });
  }
}

const freePreviewOffer = await findOwnedOffer(
  "AI action policy preflight",
  primaryOfferId,
);
if (freePreviewOffer && freePreviewOffer.isActive !== false) {
  await marketplaceJson(`/api/v1/offers/${freePreviewOffer._id}`, {
    method: "PATCH",
    body: JSON.stringify({ isActive: false }),
  });
  results.push({
    title: freePreviewOffer.title,
    offer_id: freePreviewOffer._id,
    action: "deactivated-free-duplicate",
  });
}

for (const offerId of obsoleteOfferIds) {
  const detail = await marketplaceJson(`/api/v1/offers/${offerId}`);
  const offer = detail.offer ?? detail;
  if (offer.sellerId !== sellerId) {
    throw new Error(`Refusing to deactivate unowned offer ${offerId}`);
  }
  if (offer.isActive !== false) {
    await marketplaceJson(`/api/v1/offers/${offerId}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: false }),
    });
  }
  results.push({ title: offer.title, offer_id: offerId, action: "deactivated" });
}

console.log(JSON.stringify({ synced_at: new Date().toISOString(), offers: results }));
