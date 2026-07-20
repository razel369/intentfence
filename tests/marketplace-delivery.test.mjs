import assert from "node:assert/strict";
import test from "node:test";

const {
  hasValidPayanAgentDeliveryToken,
  PAYANAGENT_DELIVERY_TOKEN_PARAM,
} = await import("../lib/marketplace-delivery.ts");

const secret = "a-secure-marketplace-delivery-token-123456789";

test("marketplace delivery requires the exact high-entropy token", async () => {
  const base = "https://intentfence.example/api/us-cpi/preview";
  assert.equal(
    await hasValidPayanAgentDeliveryToken(new Request(base), secret),
    false,
  );
  assert.equal(
    await hasValidPayanAgentDeliveryToken(
      new Request(`${base}?${PAYANAGENT_DELIVERY_TOKEN_PARAM}=wrong`),
      secret,
    ),
    false,
  );
  assert.equal(
    await hasValidPayanAgentDeliveryToken(
      new Request(
        `${base}?${PAYANAGENT_DELIVERY_TOKEN_PARAM}=${encodeURIComponent(secret)}`,
      ),
      secret,
    ),
    true,
  );
});

test("marketplace delivery fails closed for missing or weak configuration", async () => {
  const request = new Request(
    `https://intentfence.example/api/us-cpi/preview?${PAYANAGENT_DELIVERY_TOKEN_PARAM}=short`,
  );
  assert.equal(await hasValidPayanAgentDeliveryToken(request, null), false);
  assert.equal(await hasValidPayanAgentDeliveryToken(request, "short"), false);
});
