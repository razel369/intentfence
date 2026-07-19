import { readFile } from "node:fs/promises";

const apiKey = process.env.PAYANAGENT_API_KEY?.trim();
if (!apiKey) throw new Error("PAYANAGENT_API_KEY is required");

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

const offers = [
  {
    idHint: primaryOfferId,
    title: "AI action policy preflight",
    description:
      "POST a declared autonomous-agent action and receive a deterministic safe_to_proceed, needs_review, or denied policy decision with check-level reasons. Evaluates quoted cost versus ceiling, data-retention limits, proofs, and human-approval requirements before execution. This marketplace route settles 0.01 USDC to the IntentFence wallet and PayanAgent supplies the settlement receipt. Direct ES256-signed IntentFence receipts remain available at the separate 0.005-USDC x402 endpoint.",
    category: "Trust",
    tags: ["ai-agent", "policy", "payment-safety", "preflight", "risk", "x402", "base-usdc"],
    priceCents: 1,
    offerType: "api",
    endpoint: `${serviceUrl}/api/preflight`,
    httpMethod: "POST",
    inputSchema: JSON.stringify(openapi.components.schemas.PreflightRequest),
    outputSchema: JSON.stringify(openapi.components.schemas.PreflightDecision),
    estimatedDurationSeconds: 2,
    previewDescription:
      "Machine-readable pre-execution policy decision; PayanAgent adds an on-chain settlement receipt.",
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
    endpoint: `${serviceUrl}/api/x402-assessments/preview`,
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
