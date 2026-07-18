import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parsePaymentRequired } from "@x402/core/schemas";
import {
  INTENTFENCE_MCP_URL,
  INTENTFENCE_VSCODE_INSTALL_URL,
  INTENTFENCE_VSCODE_MANUAL_CONFIG,
  INTENTFENCE_VSCODE_SERVER,
} from "../lib/mcp-install.ts";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("publishes the IntentFence 0.7 protocol entry points in the site", async () => {
  const [page, growth, layout, paidRoute, assessmentRoute, manifest, agentCard, x402Manifest, openapi, readme, server, socialImage] = await Promise.all([
    source("app/page.tsx"),
    source("app/GrowthSections.tsx"),
    source("app/layout.tsx"),
    source("app/api/preflight/verified/route.ts"),
    source("app/api/x402-assessments/route.ts"),
    source("public/.well-known/intentfence.json").then(JSON.parse),
    source("public/.well-known/agent-card.json").then(JSON.parse),
    source("public/.well-known/x402").then(JSON.parse),
    source("public/openapi.json").then(JSON.parse),
    source("README.md"),
    source("server.json").then(JSON.parse),
    readFile(new URL("public/intentfence-social.png", root)),
  ]);

  assert.match(layout, /IntentFence/);
  assert.match(page, /Open protocol \/ v0\.7/);
  assert.match(page, /POST \/api\/receipts\/verify/);
  assert.match(growth, /ES256-signed policy receipt/);
  assert.match(growth, /Install IntentFence in VS Code/);
  assert.match(growth, /paid\s+tools still require/);
  assert.match(layout, /intentfence-social\.png/);
  assert.match(readme, /## Install now/);
  assert.match(readme, /#vscode-install/);
  assert.deepEqual([...socialImage.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(socialImage.readUInt32BE(16), 1200);
  assert.equal(socialImage.readUInt32BE(20), 630);
  assert.match(paidRoute, /"POST \/api\/preflight\/verified": intentFencePaidRouteConfig/);
  assert.match(assessmentRoute, /"POST \/api\/x402-assessments": x402AssessmentRouteConfig/);
  assert.equal(manifest.version, "0.7.1");
  assert.equal(manifest.receipts.algorithm, "ES256");
  assert.equal(manifest.interfaces.mcp.protocolVersion, "2025-11-25");
  assert.equal(manifest.interfaces.mcp.url, "https://agentpass-protocol.rmalka06.chatgpt.site/api/mcp");
  assert.equal(agentCard.version, "0.7.1");
  assert.equal(agentCard.supportedInterfaces[0].protocolBinding, "HTTP+JSON");
  assert.equal(server.remotes[0].type, "streamable-http");
  assert.equal(server.remotes[0].url, INTENTFENCE_MCP_URL);
  assert.equal(x402Manifest.spec, "agent402-service-manifest/1");
  assert.equal(x402Manifest.payment.x402.payTo, "0x833ca7dcdb6a681ddc0c15982ef0d609bceb3a5e");
  assert.equal(openapi.paths["/api/preflight/verified"].post["x-x402-price"], "$0.005");
  assert.equal(openapi.paths["/api/x402-assessments"].post["x-x402-price"], "$0.005");
  assert.equal(
    openapi.paths["/api/x402-assessments"].post["x-payment-info"].price.amount,
    "0.005",
  );
  assert.deepEqual(
    openapi.paths["/api/x402-assessments"].post["x-payment-info"].protocols,
    [{
      x402: {
        version: 2,
        network: "eip155:8453",
        asset: "USDC",
        payTo: "0x833ca7dcdb6a681ddc0c15982ef0d609bceb3a5e",
      },
    }],
  );
  const assessmentSchema = openapi.components.schemas.X402AssessmentRequest;
  assert.equal(assessmentSchema.properties.policy.properties.max_price_usdc.example, "0.10");
  const discoveryProbeChallenge = JSON.parse(
    Buffer.from(
      assessmentSchema.properties.payment_required.example,
      "base64",
    ).toString("utf8"),
  );
  assert.equal(parsePaymentRequired(discoveryProbeChallenge).success, true);
  assert.doesNotMatch(JSON.stringify(openapi), /"\$ref":"https?:\/\//u);
});

test("encodes a reviewable VS Code remote MCP installation", () => {
  const prefix = "vscode:mcp/install?";
  assert.equal(INTENTFENCE_VSCODE_INSTALL_URL.startsWith(prefix), true);
  assert.deepEqual(
    JSON.parse(decodeURIComponent(INTENTFENCE_VSCODE_INSTALL_URL.slice(prefix.length))),
    INTENTFENCE_VSCODE_SERVER,
  );
  assert.deepEqual(JSON.parse(INTENTFENCE_VSCODE_MANUAL_CONFIG), {
    servers: {
      IntentFence: {
        type: "http",
        url: INTENTFENCE_MCP_URL,
      },
    },
  });
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
