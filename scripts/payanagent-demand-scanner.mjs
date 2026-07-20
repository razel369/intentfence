import {
  buildFulfillmentInput,
  decideDemandAction,
  INTENTFENCE_PAYANAGENT_ID,
  serviceEndpoint,
} from "./payanagent-demand-scanner-policy.mjs";

const apiKey = process.env.PAYANAGENT_API_KEY?.trim();
if (!apiKey) throw new Error("PAYANAGENT_API_KEY is required");
const deliverySecret = process.env.PAYANAGENT_DELIVERY_SECRET?.trim();
if (!deliverySecret || deliverySecret.length < 32) {
  throw new Error("PAYANAGENT_DELIVERY_SECRET must contain at least 32 characters");
}

const apiBase = "https://payanagent.com";
const serviceBase = "https://agentpass-protocol.rmalka06.chatgpt.site";
const acceptedSearchTerms = ["x402", "wallet", "CPI"];
const maxOpenCandidatesPerRun = 10;

async function requestJson(path, init = {}) {
  const { auth = true, ...requestInit } = init;
  const response = await fetch(`${apiBase}${path}`, {
    ...requestInit,
    headers: {
      ...(auth ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...(requestInit.body ? { "Content-Type": "application/json" } : {}),
      ...requestInit.headers,
    },
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${path} failed with HTTP ${response.status}`);
  }
  return body;
}

async function deliver(kind, input) {
  const url = new URL(serviceEndpoint(kind), serviceBase);
  url.searchParams.set("payan_token", deliverySecret);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Routed-Through": "payanagent-demand-scanner",
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(25_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || typeof body !== "object") {
    throw new Error(`IntentFence ${kind} delivery failed with HTTP ${response.status}`);
  }
  return body;
}

async function acceptedRequests() {
  const rows = new Map();
  for (const term of acceptedSearchTerms) {
    const result = await requestJson(
      `/api/v1/requests?status=accepted&q=${encodeURIComponent(term)}&limit=200`,
      { auth: false },
    );
    for (const request of result.requests ?? []) rows.set(request._id, request);
  }
  return [...rows.values()];
}

for (const request of await acceptedRequests()) {
  const decision = decideDemandAction({ request, agentId: INTENTFENCE_PAYANAGENT_ID });
  if (decision.action !== "fulfill") continue;
  const detail = await requestJson(`/api/v1/requests/${request._id}`);
  if (detail.request?.status !== "accepted" || detail.request?.providerId !== INTENTFENCE_PAYANAGENT_ID) {
    continue;
  }
  const input = buildFulfillmentInput(decision.service, detail.request);
  const result = await deliver(decision.service.kind, input);
  const fulfilled = await requestJson(`/api/v1/requests/${request._id}/fulfill`, {
    method: "POST",
    body: JSON.stringify({
      outputPayload: JSON.stringify({
        provider: "IntentFence",
        service: decision.service.kind,
        request_id: request._id,
        delivered_at: new Date().toISOString(),
        result,
      }),
    }),
  });
  console.log(JSON.stringify({
    checked_at: new Date().toISOString(),
    action: "fulfilled",
    request_id: request._id,
    service: decision.service.kind,
    result: fulfilled,
  }));
  process.exit(0);
}

const open = await requestJson("/api/v1/requests?limit=200", { auth: false });
let candidatesChecked = 0;
for (const request of open.requests ?? []) {
  const preliminary = decideDemandAction({
    request,
    bids: [],
    agentId: INTENTFENCE_PAYANAGENT_ID,
  });
  if (preliminary.action !== "bid") continue;
  if (candidatesChecked >= maxOpenCandidatesPerRun) break;
  candidatesChecked += 1;
  const detail = await requestJson(`/api/v1/requests/${request._id}`, { auth: false });
  const decision = decideDemandAction({
    request: detail.request,
    bids: detail.bids ?? [],
    agentId: INTENTFENCE_PAYANAGENT_ID,
  });
  if (decision.action !== "bid") continue;
  const bid = await requestJson(`/api/v1/requests/${request._id}/bid`, {
    method: "POST",
    body: JSON.stringify(decision.bid),
  });
  console.log(JSON.stringify({
    checked_at: new Date().toISOString(),
    action: "bid",
    request_id: request._id,
    service: decision.service.kind,
    result: bid,
  }));
  process.exit(0);
}

console.log(JSON.stringify({
  checked_at: new Date().toISOString(),
  action: "noop",
  reason: "no-new-supported-demand",
  open_requests_checked: open.requests?.length ?? 0,
  supported_candidates_checked: candidatesChecked,
}));
