import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("publishes the IntentFence 0.5 protocol entry points in the site", async () => {
  const [page, growth, layout, manifest, agentCard] = await Promise.all([
    source("app/page.tsx"),
    source("app/GrowthSections.tsx"),
    source("app/layout.tsx"),
    source("public/.well-known/intentfence.json").then(JSON.parse),
    source("public/.well-known/agent-card.json").then(JSON.parse),
  ]);

  assert.match(layout, /IntentFence/);
  assert.match(page, /Open protocol \/ v0\.5/);
  assert.match(page, /POST \/api\/receipts\/verify/);
  assert.match(growth, /ES256-signed policy receipt/);
  assert.equal(manifest.version, "0.5");
  assert.equal(manifest.receipts.algorithm, "ES256");
  assert.equal(manifest.interfaces.mcp.protocolVersion, "2025-11-25");
  assert.equal(agentCard.version, "0.5.0");
  assert.equal(agentCard.supportedInterfaces[0].protocolBinding, "HTTP+JSON");
});

test("does not publish a private signing key", async () => {
  const [jwksText, receiptSource, runtimeSecretSource] = await Promise.all([
    source("public/.well-known/jwks.json"),
    source("lib/receipts.ts"),
    source("lib/runtime-secrets.ts"),
  ]);
  const jwks = JSON.parse(jwksText);

  assert.equal(jwks.keys.length, 1);
  assert.equal(jwks.keys[0].d, undefined);
  assert.doesNotMatch(jwksText, /"d"\s*:/);
  assert.doesNotMatch(receiptSource, /BEGIN PRIVATE KEY|"d"\s*:/);
  assert.match(runtimeSecretSource, /INTENTFENCE_SIGNING_PRIVATE_JWK/);
});
