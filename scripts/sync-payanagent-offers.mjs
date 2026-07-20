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
const primaryOfferId = process.env.PAYANAGENT_PRIMARY_OFFER_ID?.trim();
const quoteOfferId = process.env.PAYANAGENT_QUOTE_OFFER_ID?.trim();
const obsoleteOfferIds = (process.env.PAYANAGENT_OBSOLETE_OFFER_IDS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const openapi = JSON.parse(
  await readFile(new URL("../public/openapi.json", import.meta.url), "utf8"),
);
const protectedEndpoint = (path) =>
  `${serviceUrl}${path}?payan_token=${encodeURIComponent(deliverySecret)}`;

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
    idHint: quoteOfferId,
    title: "x402 quote safety assessment",
    description:
      "Submit the exact caller-observed PAYMENT-REQUIRED header before signing a target payment. IntentFence checks x402 v2 structure, exact scheme, Base mainnet, canonical USDC and EIP-712 domain, caller price ceiling, explicit payee allowlist, timeout, transfer method, extensions, and exact resource binding. Returns safe_to_proceed, needs_review, or denied with check-level evidence. PayanAgent settles 0.01 USDC to the seller and supplies its settlement receipt; the direct signed IntentFence route remains available separately.",
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
