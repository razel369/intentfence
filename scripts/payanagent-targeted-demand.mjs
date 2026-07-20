import {
  decideTargetedDemandAction,
  INTENTFENCE_PAYANAGENT_ID,
  TARGET_REQUEST_ID,
} from "./payanagent-targeted-demand-policy.mjs";

const apiKey = process.env.PAYANAGENT_API_KEY?.trim();
if (!apiKey) throw new Error("PAYANAGENT_API_KEY is required");

const apiBase = "https://payanagent.com";
const fujiRpc = "https://api.avax-test.network/ext/bc/C/rpc";
const contract = "0x16a4dea27DA0Edd05aC69d55305Ff3387aE62444";
const transactions = [
  "0x536fe9a6071565e2d85fd4a917cfac7d6fa7f8515112923899ce66d33a567b07",
  "0xce094f1fffabe6715d841b670edaff5e36914b0170baa1f71297abed8f93e2e7",
  "0xb74ec75f86f101b626272be240585b23eb15201b342d6f267b664388792becb4",
];
const agentSurfaces = [
  "https://thesyndicate.money/llms.txt",
  "https://thesyndicate.money/.well-known/agent.json",
  "https://thesyndicate.money/.well-known/agent-card.json",
];

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
    throw new Error(`${path} failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

let rpcId = 0;
async function rpc(method, params) {
  const response = await fetch(fujiRpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json();
  if (body.error) throw new Error(`Fuji RPC ${method} failed: ${JSON.stringify(body.error)}`);
  return body.result;
}

async function buildEvidenceReport() {
  const [chainId, code, receipts, surfaceResponses, homepage] = await Promise.all([
    rpc("eth_chainId", []),
    rpc("eth_getCode", [contract, "latest"]),
    Promise.all(transactions.map((hash) => rpc("eth_getTransactionReceipt", [hash]))),
    Promise.all(agentSurfaces.map(async (url) => {
      const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
      return { url, status: response.status, contentType: response.headers.get("content-type") };
    })),
    fetch("https://thesyndicate.money", { signal: AbortSignal.timeout(15_000) }).then((response) => response.text()),
  ]);

  const proofRows = receipts.map((receipt, index) => ({
    hash: transactions[index],
    found: Boolean(receipt),
    success: receipt?.status === "0x1",
    blockNumber: receipt?.blockNumber ?? null,
    contractAddress: receipt?.contractAddress ?? null,
    logs: receipt?.logs?.length ?? 0,
  }));
  const proofVerified =
    chainId === "0xa869" &&
    code !== "0x" &&
    proofRows.every((row) => row.found && row.success);
  const missingAgentSurfaces = surfaceResponses.filter((surface) => surface.status !== 200);
  const homepageSignals = {
    claims_live_avalanche: /Live on Avalanche/iu.test(homepage),
    claims_routes_verified: /All routes verified/iu.test(homepage),
    shows_protocol_pending: /Protocol PENDING/iu.test(homepage),
    advertises_membership_entry: /Join The Syndicate|Membership Sale/iu.test(homepage),
  };

  return `# Proof-first protocol feedback

Scope: public-surface and agent-readability review only. This is not a smart-contract audit, legal opinion, or investment advice.

## Evidence independently checked

- Avalanche Fuji chain ID: ${chainId} (expected 0xa869 / 43113).
- Contract ${contract}: ${Math.max(0, (code.length - 2) / 2)} bytes of deployed code.
- Deploy, mint, and sale-intent transactions: ${proofRows.map((row) => `${row.hash.slice(0, 10)}…=${row.success ? "success" : "not verified"}`).join(", ")}.
- Overall supplied Fuji proof: ${proofVerified ? "VERIFIED at review time" : "NOT fully verified"}.
- Standard agent surfaces missing: ${missingAgentSurfaces.map((surface) => `${new URL(surface.url).pathname} (HTTP ${surface.status})`).join(", ") || "none"}.

## Highest-priority findings

1. **Resolve the network/scope contradiction before any listing.** The request describes a Fuji-only artifact proof and no mainnet sale, while the current public homepage signals ${homepageSignals.claims_live_avalanche ? "Live on Avalanche" : "no live claim"}, ${homepageSignals.claims_routes_verified ? "All routes verified" : "no all-routes claim"}, ${homepageSignals.shows_protocol_pending ? "Protocol PENDING" : "no pending label"}, and ${homepageSignals.advertises_membership_entry ? "a membership purchase path" : "no purchase path"}. Put a canonical environment badge beside every actionable claim: network name, numeric chainId, contract, deployment state, and last verified block. A global LIVE label must never imply that a Fuji artifact proves a separate mainnet sale.
2. **Publish one canonical agent packet.** Serve /.well-known/agent.json plus /llms.txt with HTTP 200 and JSON/text content types. Minimum fields: schema_version, generated_at, project, environment, chain_id, contracts[{role,address,verified_source_url,deployment_tx,status}], claims[{id,text,status,evidence_refs}], artifacts[{id,contract,token_id,mint_status}], risks, boundaries, and canonical_urls. Agents should not have to scrape marketing copy to determine what is live.
3. **Make status vocabulary machine-enforceable.** Use exactly LIVE, PARTIAL, PREVIEW, PENDING, PAUSED, and FUTURE. Every card/claim should carry status, scope, source, observed_at, and failure behavior. Blank metrics should say unavailable or not-yet-observed, not coexist with “all routes verified.”
4. **Separate proof from meaning.** A successful transaction proves execution on a named chain; it does not by itself prove ownership, authorization, economic safety, future behavior, or the prose meaning of “membership.” Each receipt should expose chainId, block, transaction, contract, method/event, decoded identifiers, finality depth, source URL, and a hash of the human-readable claim it supports.
5. **Before a mainnet artifact or marketplace listing:** verify source code, freeze or explicitly version metadata/URI mutability, document mint authority and pause/admin powers, define idempotency/replay behavior, publish a threat model, and create one test vector that another agent can reproduce without a wallet or purchase.

## Recommended acceptance test

An unauthenticated agent fetches /.well-known/agent.json, selects one claim, follows its evidence_refs, confirms chainId + receipt status + contract code, and can distinguish Fuji proof, mainnet state, preview UI, and future intent without interpreting marketing prose. If any dependency fails, the packet must downgrade the affected claim rather than retain LIVE.
`;
}

const publicDetail = await requestJson(`/api/v1/requests/${TARGET_REQUEST_ID}`, { auth: false });
const decision = decideTargetedDemandAction({
  request: publicDetail.request,
  bids: publicDetail.bids ?? [],
  agentId: INTENTFENCE_PAYANAGENT_ID,
});

let result;
if (decision.action === "bid") {
  result = await requestJson(`/api/v1/requests/${TARGET_REQUEST_ID}/bid`, {
    method: "POST",
    body: JSON.stringify({
      priceCents: 1,
      estimatedDurationSeconds: 900,
      message:
        "IntentFence can deliver a focused public-surface security/protocol review: independently verify the supplied Fuji contract and three transactions, test standard agent discovery paths, identify live/preview/network contradictions, and provide a minimum safe agent-packet schema plus prioritized pre-mainnet fixes. No investment advice and no claim of a smart-contract audit. This is one targeted bid for this request only.",
    }),
  });
} else if (decision.action === "fulfill") {
  const authenticatedDetail = await requestJson(`/api/v1/requests/${TARGET_REQUEST_ID}`);
  if (authenticatedDetail.request?.status !== "accepted") {
    throw new Error("Request changed before fulfillment");
  }
  result = await requestJson(`/api/v1/requests/${TARGET_REQUEST_ID}/fulfill`, {
    method: "POST",
    body: JSON.stringify({ outputPayload: await buildEvidenceReport() }),
  });
} else {
  result = decision;
}

console.log(JSON.stringify({
  checked_at: new Date().toISOString(),
  request_id: TARGET_REQUEST_ID,
  action: decision.action,
  result,
}));
