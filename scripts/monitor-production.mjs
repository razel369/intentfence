import assert from "node:assert/strict";

const baseUrl = (
  process.env.INTENTFENCE_BASE_URL ??
  "https://agentpass-protocol.rmalka06.chatgpt.site"
).replace(/\/$/u, "");
const monitorHeaders = { "X-IntentFence-Source": "monitor" };
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
  mcp.result.tools.some(
    (tool) => tool.name === "intentfence_x402_assessment",
  ),
  "caller-observed x402 quote assessment MCP tool missing",
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

const paidResourceUrls = [
  `${baseUrl}/api/preflight/verified`,
  `${baseUrl}/api/x402-assessments`,
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
        resources: paidResourceUrls.map((url) => ({ url, method: "POST" })),
      },
    },
  }),
);
const x402scanResponse = await fetchWithTimeout(x402scanUrl);
assert.equal(x402scanResponse.status, 200);
const x402scan = await json(x402scanResponse);
const registeredResources = x402scan?.[0]?.result?.data?.json?.registered ?? [];
assert.ok(
  paidResourceUrls.every((url) => registeredResources.includes(url)),
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

let payanAgentOfferListed = false;
let payanAgentChallengeReady = false;
let payanAgentQuoteOfferId = null;
let payanAgentQuoteOfferListed = false;
let payanAgentQuoteChallengeReady = false;
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
    payanAgentOfferListed =
      offer._id === payanAgentOfferId &&
      offer.isActive !== false &&
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
  if (payanAgentOfferListed) {
    const challengeResponse = await fetchWithTimeout(
      `https://payanagent.com/x402/${payanAgentOfferId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    );
    const challengeHeader = challengeResponse.headers.get("payment-required");
    if (challengeResponse.status === 402 && challengeHeader) {
      const challenge = JSON.parse(
        Buffer.from(challengeHeader, "base64").toString("utf8"),
      );
      payanAgentChallengeReady =
        challenge.accepts?.[0]?.amount === "10000" &&
        challenge.accepts?.[0]?.network === "eip155:8453" &&
        challenge.accepts?.[0]?.payTo?.toLowerCase() ===
          settlementWallet.toLowerCase();
    }
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
      x402_amount_atomic: paymentRequired.accepts[0].amount,
      settled_calls: metrics.settled_calls,
      revenue_usdc: metrics.revenue_usdc,
      official_mcp_registry: true,
      x402scan_registered: true,
      coinbase_bazaar_listed: bazaarListed,
      jaypay_directory_listed: jaypayDirectoryListed,
      payanagent_offer_listed: payanAgentOfferListed,
      payanagent_challenge_ready: payanAgentChallengeReady,
      payanagent_quote_offer_id: payanAgentQuoteOfferId,
      payanagent_quote_offer_listed: payanAgentQuoteOfferListed,
      payanagent_quote_challenge_ready: payanAgentQuoteChallengeReady,
      payanagent_sales: payanAgentSales,
      payanagent_distinct_buyers: payanAgentDistinctBuyers,
      payanagent_revenue_usdc: payanAgentRevenueUsdc,
    },
    null,
    2,
  ),
);
