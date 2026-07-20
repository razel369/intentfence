import assert from "node:assert/strict";
import test from "node:test";

const { checkIntentFenceFacilitator, supportsIntentFenceRoute } = await import(
  "../lib/x402-health.ts"
);
const { fetchIntentFenceSupportedKinds } = await import("../lib/x402.ts");

const supportedPayload = {
  kinds: [
    { x402Version: 1, scheme: "exact", network: "base" },
    { x402Version: 2, scheme: "exact", network: "eip155:8453" },
  ],
};

test("recognizes the exact x402 v2 Base route", () => {
  assert.equal(supportsIntentFenceRoute(supportedPayload, "eip155:8453"), true);
  assert.equal(
    supportsIntentFenceRoute(
      {
        kinds: [{ x402Version: 2, scheme: "upto", network: "eip155:8453" }],
      },
      "eip155:8453",
    ),
    false,
  );
  assert.equal(supportsIntentFenceRoute({ kinds: [] }, "eip155:8453"), false);
});

test("checks facilitator reachability and route support", async () => {
  const supported = await checkIntentFenceFacilitator(
    "https://facilitator.example",
    "eip155:8453",
    async () => Response.json(supportedPayload),
  );
  assert.deepEqual(supported, { reachable: true, supportsRoute: true });

  const unavailable = await checkIntentFenceFacilitator(
    "https://facilitator.example",
    "eip155:8453",
    async () => new Response(null, { status: 503 }),
  );
  assert.deepEqual(unavailable, { reachable: false, supportsRoute: false });
});

test("loads supported kinds with a Worker-compatible facilitator request", async () => {
  let capturedUrl;
  let capturedInit;
  const supported = await fetchIntentFenceSupportedKinds(async (url, init) => {
    capturedUrl = url;
    capturedInit = init;
    return Response.json(supportedPayload);
  });

  assert.equal(capturedUrl, "https://facilitator.payai.network/supported");
  assert.equal(capturedInit.headers.Accept, "application/json");
  assert.deepEqual(supported.kinds, supportedPayload.kinds);
  assert.deepEqual(supported.extensions, []);
  assert.deepEqual(supported.signers, {});

  await assert.rejects(
    fetchIntentFenceSupportedKinds(async () => Response.json({ kinds: null })),
    /invalid supported payment kinds/u,
  );
});
