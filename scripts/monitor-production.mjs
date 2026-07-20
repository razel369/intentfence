import assert from "node:assert/strict";

const baseUrl = (
  process.env.INTENTFENCE_BASE_URL ??
  "https://agentpass-protocol.rmalka06.chatgpt.site"
).replace(/\/$/u, "");
const monitorHeaders = { "X-IntentFence-Source": "monitor" };
const payanAgentDeliverySecret = process.env.PAYANAGENT_DELIVERY_SECRET?.trim();
const payanAgentAgentId = "j57d8w639k1c1d33k0hf5g7d5h8atk9g";
const payanAgentOfferId = "kh7bwc280yqjr5607mejn1e1ks8atesm";
const payanAgentQuoteOfferIdConfigured = "kh7d72cgr8csya3n8pwgky0r258at4qa";
const settlementWallet = "0x833ca7dcdb6a681ddc0c15982ef0d609bceb3a5e";
const input = {
  subject: "did:web:intentfence-monitor",
  action: { type: "payment.healthcheck", resource: "synthetic" },
  constraints: { currency: "USD", cost_ceiling: 1, quoted_cost: 0 },
};

async function json(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `${response.url} returned invalid JSON: ${text.slice(0, 200)}`,
    );
  }
}

async function fetchWithTimeout(input, init = {}, timeoutMs = 10_000) {
  return fetch(input, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
  });
}

const healthResponse = await fetchWithTimeout(`${baseUrl}/api/health`, {
  headers: monitorHeaders,
});
assert.equal(healthResponse.status, 200, "health endpoint is not ready");
const health = await json(healthResponse);
assert.equal(health.status, "ok");
assert.equal(health.checks.database, true);
assert.equal(health.checks.revenue_schema, true);
assert.equal(health.checks.payment_reservation_schema, true);
assert.equal(health.checks.receipt_signing, true);
assert.equal(health.checks.x402_configuration.ready, true);
assert.equal(health.checks.x402_configuration.facilitator_reachable, true);
assert.equal(health.checks.x402_configuration.facilitator_supports_route, true);
assert.equal(health.checks.x402_configuration.amount_atomic, "5000");
assert.equal(health.checks.x402_configuration.us_cpi_amount_atomic, "1000");

const requiredResponse = await fetchWithTimeout(
  `${baseUrl}/api/preflight/verified`,
  {
    method: "POST",
    headers: { ...monitorHeaders, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  },
);
assert.equal(requiredResponse.status, 402);
const paymentRequiredHeader = requiredResponse.headers.get("payment-required");
assert.ok(paymentRequiredHeader, "PAYMENT-REQUIRED header missing");
const paymentRequired = JSON.parse(
  Buffer.from(paymentRequiredHeader, "base64").toString("utf8"),
);
assert.equal(paymentRequired.accepts[0].amount, "5000");
assert.equal(paymentRequired.accepts[0].network, "eip155:8453");

const assessmentInput = {
  subject: "agent:intentfence-monitor",
  target_url: paymentRequired.resource.url,
  method: "POST",
  payment_required: paymentRequiredHeader,
  policy: {
    max_price_usdc: "0.01",
    allowed_payees: [paymentRequired.accepts[0].payTo],
  },
};

const assessmentRequiredResponse = await fetchWithTimeout(
  `${baseUrl}/api/x402-assessments`,
  {
    method: "POST",
    headers: { ...monitorHeaders, "Content-Type": "application/json" },
    body: JSON.stringify(assessmentInput),
  },
);
if (assessmentRequiredResponse.status !== 402) {
  throw new Error(
    `Unexpected quote-assessment status ${assessmentRequiredResponse.status}: ${await assessmentRequiredResponse.text()}`,
  );
}
const assessmentRequiredHeader = assessmentRequiredResponse.headers.get("payment-required");
assert.ok(assessmentRequiredHeader, "assessment PAYMENT-REQUIRED header missing");
const assessmentPaymentRequired = JSON.parse(
  Buffer.from(assessmentRequiredHeader, "base64").toString("utf8"),
);
assert.equal(assessmentPaymentRequired.accepts[0].amount, "5000");
assert.equal(
  assessmentPaymentRequired.resource.url,
  `${baseUrl}/api/x402-assessments`,
);

const walletRiskAddress = settlementWallet;
const walletRiskDiscoveryUrl = `${baseUrl}/api/wallet-risk`;
const walletRiskDiscoveryResponse = await fetchWithTimeout(walletRiskDiscoveryUrl, {
  headers: monitorHeaders,
});
assert.equal(
  walletRiskDiscoveryResponse.status,
  402,
  "wallet-risk discovery probe must reach a payment challenge before query validation",
);
const walletRiskDiscoveryHeader = walletRiskDiscoveryResponse.headers.get("payment-required");
assert.ok(walletRiskDiscoveryHeader, "wallet-risk discovery PAYMENT-REQUIRED header missing");
const walletRiskDiscoveryChallenge = JSON.parse(
  Buffer.from(walletRiskDiscoveryHeader, "base64").toString("utf8"),
);
assert.equal(walletRiskDiscoveryChallenge.accepts[0].amount, "2000");
assert.equal(walletRiskDiscoveryChallenge.resource.url, walletRiskDiscoveryUrl);
const walletRiskUrl = `${baseUrl}/api/wallet-risk?address=${walletRiskAddress}`;
const walletRiskRequiredResponse = await fetchWithTimeout(walletRiskUrl, {
  headers: monitorHeaders,
});
assert.equal(walletRiskRequiredResponse.status, 402);
const walletRiskRequiredHeader = walletRiskRequiredResponse.headers.get("payment-required");
assert.ok(walletRiskRequiredHeader, "wallet-risk PAYMENT-REQUIRED header missing");
const walletRiskPaymentRequired = JSON.parse(
  Buffer.from(walletRiskRequiredHeader, "base64").toString("utf8"),
);
assert.equal(walletRiskPaymentRequired.accepts[0].amount, "2000");
assert.equal(walletRiskPaymentRequired.accepts[0].network, "eip155:8453");
assert.equal(walletRiskPaymentRequired.resource.url, walletRiskUrl);

const usCpiDiscoveryUrl = `${baseUrl}/api/us-cpi`;
const usCpiRequiredResponse = await fetchWithTimeout(usCpiDiscoveryUrl, {
  headers: monitorHeaders,
});
assert.equal(usCpiRequiredResponse.status, 402);
const usCpiRequiredHeader = usCpiRequiredResponse.headers.get("payment-required");
assert.ok(usCpiRequiredHeader, "U.S. CPI PAYMENT-REQUIRED header missing");
const usCpiPaymentRequired = JSON.parse(
  Buffer.from(usCpiRequiredHeader, "base64").toString("utf8"),
);
assert.equal(usCpiPaymentRequired.accepts[0].amount, "1000");
assert.equal(usCpiPaymentRequired.accepts[0].network, "eip155:8453");
assert.equal(usCpiPaymentRequired.resource.url, usCpiDiscoveryUrl);

const usCpiUnpaidDeliveryResponse = await fetchWithTimeout(`${baseUrl}/api/us-cpi/preview`, {
  method: "POST",
  headers: { ...monitorHeaders, "Content-Type": "application/json" },
  body: "{}",
});
assert.equal(
  usCpiUnpaidDeliveryResponse.status,
  404,
  "U.S. CPI marketplace delivery must fail closed without its private token",
);
const assessmentUnpaidDeliveryResponse = await fetchWithTimeout(
  `${baseUrl}/api/x402-assessments/preview`,
  {
    method: "POST",
    headers: { ...monitorHeaders, "Content-Type": "application/json" },
    body: JSON.stringify(assessmentInput),
  },
);
assert.equal(
  assessmentUnpaidDeliveryResponse.status,
  404,
  "quote-assessment marketplace delivery must fail closed without its private token",
);

let payanAgentDeliveryVerified = false;
if (payanAgentDeliverySecret) {
  const token = encodeURIComponent(payanAgentDeliverySecret);
  const [usCpiPreviewResponse, assessmentPreviewResponse] = await Promise.all([
    fetchWithTimeout(`${baseUrl}/api/us-cpi/preview?payan_token=${token}`, {
      method: "POST",
      headers: { ...monitorHeaders, "Content-Type": "application/json" },
      body: "{}",
    }),
    fetchWithTimeout(`${baseUrl}/api/x402-assessments/preview?payan_token=${token}`, {
      method: "POST",
      headers: { ...monitorHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(assessmentInput),
    }),
  ]);
  assert.equal(usCpiPreviewResponse.status, 200, "U.S. CPI marketplace delivery is unavailable");
  const usCpiPreview = await json(usCpiPreviewResponse);
  assert.equal(usCpiPreview.status, "verified");
  assert.equal(usCpiPreview.source.publisher, "U.S. Bureau of Labor Statistics");
  assert.equal(usCpiPreview.receipt.signed, false);
  assert.equal(assessmentPreviewResponse.status, 200, "quote-assessment marketplace delivery is unavailable");
  const assessmentPreview = await json(assessmentPreviewResponse);
  assert.ok(
    ["safe_to_proceed", "needs_review", "denied"].includes(assessmentPreview.status),
  );
  payanAgentDeliveryVerified = true;
}

const mcpResponse = await fetchWithTimeout(`${baseUrl}/api/mcp`, {
  method: "POST",
  headers: {
    ...monitorHeaders,
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
    "MCP-Protocol-Version": "2025-11-25",
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: {},
  }),
});
assert.equal(mcpResponse.status, 200);
const mcp = await json(mcpResponse);
assert.ok(
  mcp.result.tools.some(
    (tool) => tool.name === "intentfence_verified_preflight",
  ),
  "paid MCP tool missing",
);
assert.ok(
  mcp.result.tools.some((tool) => tool.name === "intentfence_wallet_risk"),
  "live wallet-risk MCP tool missing",
);
assert.ok(
  mcp.result.tools.some(
    (tool) => tool.name === "intentfence_x402_assessment",
  ),
  "caller-observed x402 quote assessment MCP tool missing",
);
assert.ok(
  mcp.result.tools.some((tool) => tool.name === "intentfence_us_cpi"),
  "official U.S. CPI MCP tool missing",
);

const mcpChallengeResponse = await fetchWithTimeout(`${baseUrl}/api/mcp`, {
  method: "POST",
  headers: {
    ...monitorHeaders,
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
    "MCP-Protocol-Version": "2025-11-25",
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "intentfence_verified_preflight", arguments: input },
  }),
});
assert.equal(mcpChallengeResponse.status, 200);
const mcpChallenge = await json(mcpChallengeResponse);
assert.equal(mcpChallenge.result.isError, true);
assert.equal(mcpChallenge.result.structuredContent.x402Version, 2);
assert.equal(mcpChallenge.result.structuredContent.accepts[0].amount, "5000");

const metricsResponse = await fetchWithTimeout(`${baseUrl}/api/metrics`, {
  headers: monitorHeaders,
});
assert.equal(metricsResponse.status, 200);
const metrics = await json(metricsResponse);
assert.equal(metrics.currency, "USDC");

const registryResponse = await fetchWithTimeout(
  "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.razel369%2Fintentfence",
  {},
  45_000,
);
assert.equal(registryResponse.status, 200);
const registry = await json(registryResponse);
const currentRegistryEntry = registry.servers?.find(
  (entry) => entry.server?.version === health.version,
);
assert.ok(currentRegistryEntry, "current production version is missing from the official MCP Registry");
assert.ok(
  currentRegistryEntry.server.remotes?.some(
    (remote) => remote.url === `${baseUrl}/api/mcp`,
  ),
  "current MCP Registry entry does not advertise the working hosted endpoint",
);

const paidResources = [
  { url: `${baseUrl}/api/preflight/verified`, method: "POST" },
  { url: `${baseUrl}/api/x402-assessments`, method: "POST" },
  { url: walletRiskDiscoveryUrl, method: "GET" },
  { url: usCpiDiscoveryUrl, method: "GET" },
];
const x402scanUrl = new URL(
  "https://www.x402scan.com/api/trpc/public.resources.checkRegistered",
);
x402scanUrl.searchParams.set("batch", "1");
x402scanUrl.searchParams.set(
  "input",
  JSON.stringify({
    0: {
      json: {
        resources: paidResources,
      },
    },
  }),
);
const x402scanResponse = await fetchWithTimeout(x402scanUrl);
assert.equal(x402scanResponse.status, 200);
const x402scan = await json(x402scanResponse);
const registeredResources = x402scan?.[0]?.result?.data?.json?.registered ?? [];
assert.ok(
  paidResources.every(({ url }) => registeredResources.includes(url)),
  "one or more x402scan paid-resource listings are missing",
);

let bazaarListed = false;
try {
  const bazaarResponse = await fetchWithTimeout(
    "https://api.cdp.coinbase.com/platform/v2/x402/discovery/search?query=IntentFence&limit=20",
  );
  if (bazaarResponse.ok) {
    const bazaar = await json(bazaarResponse);
    bazaarListed =
      Array.isArray(bazaar.resources) && bazaar.resources.length > 0;
  }
} catch {
  // Bazaar availability is reported but does not fail core production health.
}

let jaypayDirectoryListed = false;
try {
  const jaypayResponse = await fetchWithTimeout(
    "https://402directory.com/api/directory",
  );
  if (jaypayResponse.ok) {
    const jaypay = await json(jaypayResponse);
    jaypayDirectoryListed =
      Array.isArray(jaypay.entries) &&
      jaypay.entries.some(
        (entry) =>
          entry.endpoint === `${baseUrl}/api/preflight/verified` ||
          entry.endpoint_url === `${baseUrl}/api/preflight/verified`,
      );
  }
} catch {
  // A pending or unavailable directory listing does not fail core production health.
}

let payanAgentFreePreviewOfferDeactivated = false;
let payanAgentQuoteOfferId = null;
let payanAgentQuoteOfferListed = false;
let payanAgentQuoteChallengeReady = false;
let payanAgentCpiOfferId = null;
let payanAgentCpiOfferListed = false;
let payanAgentCpiChallengeReady = false;
let payanAgentSales = 0;
let payanAgentDistinctBuyers = 0;
let payanAgentRevenueUsdc = 0;
try {
  const [offerResponse, agentResponse] = await Promise.all([
    fetchWithTimeout(
      `https://payanagent.com/api/v1/offers/${payanAgentOfferId}`,
    ),
    fetchWithTimeout(
      `https://payanagent.com/api/v1/agents/${payanAgentAgentId}`,
    ),
  ]);
  if (offerResponse.ok) {
    const offerPayload = await json(offerResponse);
    const offer = offerPayload.offer ?? offerPayload;
    payanAgentFreePreviewOfferDeactivated =
      offer._id === payanAgentOfferId &&
      offer.isActive === false &&
      offer.sellerId === payanAgentAgentId &&
      offer.title === "AI action policy preflight";
  }
  if (agentResponse.ok) {
    const agent = await json(agentResponse);
    payanAgentSales = Number(agent.reputation?.sales ?? 0);
    payanAgentDistinctBuyers = Number(
      agent.reputation?.distinctBuyers ?? 0,
    );
    payanAgentRevenueUsdc =
      Number(agent.reputation?.volumeMicroUsd ?? 0) / 1_000_000;
  }
  const quoteDetailResponse = await fetchWithTimeout(
    `https://payanagent.com/api/v1/offers/${payanAgentQuoteOfferIdConfigured}`,
  );
  if (quoteDetailResponse.ok) {
    const detailPayload = await json(quoteDetailResponse);
    const detail = detailPayload.offer ?? detailPayload;
    payanAgentQuoteOfferListed =
      detail.sellerId === payanAgentAgentId &&
      detail.title === "x402 quote safety assessment" &&
      detail.isActive !== false;
    payanAgentQuoteOfferId = payanAgentQuoteOfferListed ? detail._id : null;
  }
  if (payanAgentQuoteOfferId) {
    const quoteChallengeResponse = await fetchWithTimeout(
      `https://payanagent.com/x402/${payanAgentQuoteOfferId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(assessmentInput),
      },
    );
    const quoteChallengeHeader =
      quoteChallengeResponse.headers.get("payment-required");
    if (quoteChallengeResponse.status === 402 && quoteChallengeHeader) {
      const quoteChallenge = JSON.parse(
        Buffer.from(quoteChallengeHeader, "base64").toString("utf8"),
      );
      payanAgentQuoteChallengeReady =
        quoteChallenge.accepts?.[0]?.amount === "10000" &&
        quoteChallenge.accepts?.[0]?.network === "eip155:8453" &&
        quoteChallenge.accepts?.[0]?.payTo?.toLowerCase() ===
          settlementWallet.toLowerCase();
    }
  }
  const cpiSearchResponse = await fetchWithTimeout(
    "https://payanagent.com/api/v1/offers?q=Official%20U.S.%20CPI%20%26%20inflation%20data&limit=20",
  );
  if (cpiSearchResponse.ok) {
    const cpiSearch = await json(cpiSearchResponse);
    for (const candidate of cpiSearch.offers ?? []) {
      if (candidate.title !== "Official U.S. CPI & inflation data") continue;
      const detailResponse = await fetchWithTimeout(
        `https://payanagent.com/api/v1/offers/${candidate._id}`,
      );
      if (!detailResponse.ok) continue;
      const detailPayload = await json(detailResponse);
      const detail = detailPayload.offer ?? detailPayload;
      if (detail.sellerId === payanAgentAgentId && detail.isActive !== false) {
        payanAgentCpiOfferId = detail._id;
        payanAgentCpiOfferListed = true;
        break;
      }
    }
  }
  if (payanAgentCpiOfferId) {
    const cpiChallengeResponse = await fetchWithTimeout(
      `https://payanagent.com/x402/${payanAgentCpiOfferId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
    );
    const cpiChallengeHeader = cpiChallengeResponse.headers.get("payment-required");
    if (cpiChallengeResponse.status === 402 && cpiChallengeHeader) {
      const cpiChallenge = JSON.parse(
        Buffer.from(cpiChallengeHeader, "base64").toString("utf8"),
      );
      payanAgentCpiChallengeReady =
        cpiChallenge.accepts?.[0]?.amount === "10000" &&
        cpiChallenge.accepts?.[0]?.network === "eip155:8453" &&
        cpiChallenge.accepts?.[0]?.payTo?.toLowerCase() === settlementWallet.toLowerCase();
    }
  }
} catch {
  // Marketplace distribution is reported but does not fail core production health.
}

console.log(
  JSON.stringify(
    {
      checked_at: new Date().toISOString(),
      base_url: baseUrl,
      health: health.status,
      paid_mcp_challenge: true,
      x402_assessment_challenge: true,
      wallet_risk_challenge: true,
      wallet_risk_discovery_probe: true,
      wallet_risk_amount_atomic: walletRiskPaymentRequired.accepts[0].amount,
      us_cpi_challenge: true,
      us_cpi_amount_atomic: usCpiPaymentRequired.accepts[0].amount,
      x402_amount_atomic: paymentRequired.accepts[0].amount,
      settled_calls: metrics.settled_calls,
      revenue_usdc: metrics.revenue_usdc,
      official_mcp_registry: true,
      x402scan_registered: true,
      payanagent_delivery_protected: true,
      payanagent_delivery_verified: payanAgentDeliveryVerified,
      coinbase_bazaar_listed: bazaarListed,
      jaypay_directory_listed: jaypayDirectoryListed,
      payanagent_free_preview_offer_deactivated: payanAgentFreePreviewOfferDeactivated,
      payanagent_quote_offer_id: payanAgentQuoteOfferId,
      payanagent_quote_offer_listed: payanAgentQuoteOfferListed,
      payanagent_quote_challenge_ready: payanAgentQuoteChallengeReady,
      payanagent_cpi_offer_id: payanAgentCpiOfferId,
      payanagent_cpi_offer_listed: payanAgentCpiOfferListed,
      payanagent_cpi_challenge_ready: payanAgentCpiChallengeReady,
      payanagent_sales: payanAgentSales,
      payanagent_distinct_buyers: payanAgentDistinctBuyers,
      payanagent_revenue_usdc: payanAgentRevenueUsdc,
    },
    null,
    2,
  ),
);
