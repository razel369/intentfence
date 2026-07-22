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
import {
  AGENTIC_WALLET_CHECKOUT,
  AGENTIC_WALLET_CHECKOUT_COMMAND,
  AGENTIC_WALLET_CHECKOUT_REQUEST,
} from "../lib/agentic-wallet-checkout.ts";
import {
  COINBASE_AGENTKIT_CHECKOUT,
  COINBASE_AGENTKIT_VERSION,
} from "../lib/coinbase-agentkit-checkout.ts";
import { validatePreflightInput } from "../lib/preflight.ts";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("publishes the IntentFence 0.11 protocol entry points in the site", async () => {
  const [page, growth, layout, paidRoute, assessmentRoute, assessmentPreviewRoute, readinessRoute, readinessPreviewRoute, walletRiskRoute, walletRiskPreviewRoute, usCpiRoute, usCpiPreviewRoute, x402Server, manifest, agentCard, x402Manifest, openapi, readme, server, socialImage] = await Promise.all([
    source("app/page.tsx"),
    source("app/GrowthSections.tsx"),
    source("app/layout.tsx"),
    source("app/api/preflight/verified/route.ts"),
    source("app/api/x402-assessments/route.ts"),
    source("app/api/x402-assessments/preview/route.ts"),
    source("app/api/x402-readiness/route.ts"),
    source("app/api/x402-readiness/preview/route.ts"),
    source("app/api/wallet-risk/route.ts"),
    source("app/api/wallet-risk/preview/route.ts"),
    source("app/api/us-cpi/route.ts"),
    source("app/api/us-cpi/preview/route.ts"),
    source("lib/x402.ts"),
    source("public/.well-known/intentfence.json").then(JSON.parse),
    source("public/.well-known/agent-card.json").then(JSON.parse),
    source("public/.well-known/x402").then(JSON.parse),
    source("public/openapi.json").then(JSON.parse),
    source("README.md"),
    source("server.json").then(JSON.parse),
    readFile(new URL("public/intentfence-social.png", root)),
  ]);

  assert.match(layout, /IntentFence/);
  assert.match(page, /Open protocol \/ v0\.11/);
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
  assert.match(assessmentPreviewRoute, /isAuthorizedPayanAgentDelivery/);
  assert.match(assessmentPreviewRoute, /verification_tier: "unsigned-preview"/);
  assert.match(readinessPreviewRoute, /isAuthorizedPayanAgentDelivery/);
  assert.match(readinessPreviewRoute, /live-x402-readiness\+marketplace-delivery/);
  assert.match(readinessRoute, /"POST \/api\/x402-readiness": x402ReadinessRouteConfig/);
  assert.match(readinessRoute, /reserveX402PaymentAuthorization\(paymentHeader, "x402-readiness"\)/);
  assert.match(walletRiskRoute, /"GET \/api\/wallet-risk": walletRiskRouteConfig/);
  assert.match(walletRiskPreviewRoute, /isAuthorizedPayanAgentDelivery/);
  assert.match(
    walletRiskPreviewRoute,
    /live-base-wallet-risk\+marketplace-delivery/,
  );
  assert.match(usCpiRoute, /"GET \/api\/us-cpi": usCpiRouteConfig/);
  assert.match(usCpiPreviewRoute, /isAuthorizedPayanAgentDelivery/);
  assert.match(usCpiPreviewRoute, /official-source-data\+marketplace-delivery/);
  assert.match(x402Server, /new HTTPFacilitatorClient\(\{[\s\S]*url: INTENTFENCE_FACILITATOR_URL/u);
  assert.doesNotMatch(x402Server, /@payai\/facilitator/u);
  assert.equal(manifest.version, "0.11.0");
  assert.equal(manifest.receipts.algorithm, "ES256");
  assert.equal(manifest.interfaces.mcp.protocolVersion, "2025-11-25");
  assert.equal(manifest.interfaces.mcp.url, "https://agentpass-protocol.rmalka06.chatgpt.site/api/mcp");
  assert.deepEqual(manifest.interfaces.mcp.stdio.args, [
    "--yes",
    "--package",
    "https://github.com/razel369/intentfence/releases/download/mcp-v0.11.0/razel369-intentfence-mcp-0.11.0.tgz",
    "intentfence-mcp",
  ]);
  assert.equal(
    manifest.interfaces.mcp.stdio.sha256,
    "f0cdf3df28da8a5c037e48193cbb4602744b5fb0b6c182d877abedb707b1e9f9",
  );
  assert.equal(manifest.interfaces.mcp.stdio.autoPayment.enabledByDefault, false);
  assert.deepEqual(manifest.interfaces.mcp.stdio.autoPayment.requiredEnv, [
    "INTENTFENCE_EVM_PRIVATE_KEY",
    "INTENTFENCE_MAX_AUTO_PAYMENT_USDC",
    "INTENTFENCE_AUTO_PAYMENT_BUDGET_USDC",
  ]);
  assert.equal(
    manifest.interfaces.mcp.stdio.autoPayment.policy.payTo,
    "0x833ca7dcdb6a681ddc0c15982ef0d609bceb3a5e",
  );
  assert.equal(agentCard.version, "0.11.0");
  assert.equal(agentCard.supportedInterfaces[0].protocolBinding, "HTTP+JSON");
  assert.equal(server.remotes[0].type, "streamable-http");
  assert.equal(server.remotes[0].url, INTENTFENCE_MCP_URL);
  assert.equal(x402Manifest.spec, "agent402-service-manifest/1");
  assert.equal(x402Manifest.payment.x402.payTo, "0x833ca7dcdb6a681ddc0c15982ef0d609bceb3a5e");
  assert.equal(openapi.paths["/api/preflight/verified"].post["x-x402-price"], "$0.005");
  assert.match(openapi.paths["/api/preflight/verified"].post.summary, /payment safety and policy preflight/u);
  assert.ok(openapi.paths["/api/preflight/verified"].post.tags.includes("payment-safety"));
  assert.ok(openapi.paths["/api/preflight/verified"].post.tags.includes("spend-control"));
  assert.equal(openapi.paths["/api/x402-assessments"].post["x-x402-price"], "$0.005");
  assert.equal(openapi.paths["/api/x402-readiness"].post["x-x402-price"], "$0.002");
  assert.equal(openapi.paths["/api/x402-readiness"].post["x-payment-info"].price.amount, "0.002");
  assert.equal(openapi.paths["/api/wallet-risk"].get["x-x402-price"], "$0.002");
  assert.equal(openapi.paths["/api/wallet-risk"].get["x-payment-info"].price.amount, "0.002");
  assert.equal(openapi.paths["/api/wallet-risk/preview"], undefined);
  assert.equal(openapi.paths["/api/us-cpi"].get["x-x402-price"], "$0.001");
  assert.equal(openapi.paths["/api/us-cpi/preview"], undefined);
  assert.match(openapi.paths["/api/wallet-risk"].get.summary, /sanctions.*phishing.*counterparty risk/iu);
  assert.match(openapi.paths["/api/wallet-risk"].get.description, /AML\/KYT wallet screening/iu);
  assert.equal(manifest.interfaces.mcp.tools.includes("intentfence_wallet_risk"), true);
  assert.equal(manifest.interfaces.mcp.tools.includes("intentfence_us_cpi"), true);
  assert.equal(manifest.interfaces.mcp.tools.includes("intentfence_x402_readiness"), true);
  assert.equal(openapi.paths["/api/x402-assessments/preview"], undefined);
  assert.equal(openapi.paths["/api/x402-readiness/preview"], undefined);
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

test("lists a protected one-cent Base wallet screen on PayanAgent", async () => {
  const syncScript = await source("scripts/sync-payanagent-offers.mjs");

  assert.match(syncScript, /title: "Check a Base wallet before paying"/u);
  assert.match(syncScript, /protectedEndpoint\("\/api\/wallet-risk\/preview"\)/u);
  assert.match(syncScript, /priceCents: 1/u);
  assert.match(syncScript, /counterparty screening, not identity verification/u);
  assert.match(syncScript, /live-base-wallet-risk\+marketplace-delivery/u);
  assert.match(syncScript, /Base wallet risk and sanctions check for AI agents/u);
  assert.match(syncScript, /x402 payment safety and security check for AI agents/u);
  assert.match(syncScript, /title: "Verify x402 endpoint readiness before paying"/u);
  assert.match(syncScript, /protectedEndpoint\("\/api\/x402-readiness\/preview"\)/u);
  assert.match(syncScript, /idHint: readinessOfferId/u);
  assert.match(syncScript, /kh79sp39hh7ayghkvfy6avb6158axpsg/u);
  assert.match(syncScript, /Verify public x402 endpoint readiness before paying/u);
  assert.match(syncScript, /Send only target_url/u);
  assert.match(syncScript, /required: \["target_url"\]/u);
  assert.match(syncScript, /Optional max_price_usdc and allowed_payees add buyer policy/u);
  assert.match(syncScript, /live-x402-readiness\+marketplace-delivery/u);
  assert.match(syncScript, /IntentFence agent profile/u);
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

test("ships a cross-agent x402 guard with a capped buyer path", async () => {
  const [skill, metadata, growth, readme] = await Promise.all([
    source("skills/guard-x402-payments/SKILL.md"),
    source("skills/guard-x402-payments/agents/openai.yaml"),
    source("app/GrowthSections.tsx"),
    source("README.md"),
  ]);

  assert.match(skill, /^---\nname: guard-x402-payments\n/u);
  assert.match(skill, /live IntentFence service before it signs/u);
  assert.match(skill, /--max-amount 5000 --json/u);
  assert.match(skill, /unless they explicitly authorize those actions/u);
  assert.match(metadata, /\$guard-x402-payments/u);
  assert.match(growth, /npx skills add razel369\/intentfence/u);
  assert.match(readme, /--skill guard-x402-payments/u);
});

test("ships a discoverable live x402 readiness skill with a strict payment cap", async () => {
  const [skill, metadata, llms, readme] = await Promise.all([
    source("skills/inspect-x402-endpoints/SKILL.md"),
    source("skills/inspect-x402-endpoints/agents/openai.yaml"),
    source("public/llms.txt"),
    source("README.md"),
  ]);

  assert.match(skill, /^---\nname: inspect-x402-endpoints\n/u);
  assert.match(skill, /never follows redirects/u);
  assert.match(skill, /explicit authorization/u);
  assert.match(skill, /--max-amount 2000 --json/u);
  assert.match(skill, /live-x402-endpoint-readiness/u);
  assert.match(metadata, /\$inspect-x402-endpoints/u);
  assert.match(llms, /--skill inspect-x402-endpoints/u);
  assert.match(readme, /--skill inspect-x402-endpoints/u);
});

test("publishes a directly executable and strictly capped agent checkout", async () => {
  const [paymentRoute, growth, manifest, x402Manifest, llms, readme] = await Promise.all([
    source("app/api/payments/route.ts"),
    source("app/GrowthSections.tsx"),
    source("public/.well-known/intentfence.json").then(JSON.parse),
    source("public/.well-known/x402").then(JSON.parse),
    source("public/llms.txt"),
    source("README.md"),
  ]);

  assert.doesNotThrow(() => validatePreflightInput(AGENTIC_WALLET_CHECKOUT_REQUEST));
  assert.match(AGENTIC_WALLET_CHECKOUT_COMMAND, /awal@2\.12\.1 x402 pay/u);
  assert.match(AGENTIC_WALLET_CHECKOUT_COMMAND, /--max-amount 5000/u);
  assert.match(AGENTIC_WALLET_CHECKOUT_COMMAND, /utm_source=agent_wallet_checkout/u);
  assert.equal(AGENTIC_WALLET_CHECKOUT.max_amount_atomic, "5000");
  assert.equal(AGENTIC_WALLET_CHECKOUT.requires_explicit_authorization, true);
  assert.match(paymentRoute, /buyer_quickstart: AGENTIC_WALLET_CHECKOUT/u);
  assert.match(growth, /Copy capped checkout command/u);
  assert.match(growth, /MAX 0\.005 USDC/u);
  assert.match(manifest.payments.buyerQuickstart, /\/api\/payments/u);
  assert.match(x402Manifest.buyerQuickstart, /\/api\/payments/u);
  assert.match(llms, /buyer_quickstart/u);
  assert.match(readme, /--max-amount 5000/u);
});

test("publishes a priced commercial pilot without automatic billing", async () => {
  const [paymentRoute, growth, llms, layout] = await Promise.all([
    source("app/api/payments/route.ts"),
    source("app/GrowthSections.tsx"),
    source("public/llms.txt"),
    source("app/layout.tsx"),
  ]);

  assert.match(paymentRoute, /commercial_offer/u);
  assert.match(paymentRoute, /setup_fee: \{ amount: 3000, currency: "USD" \}/u);
  assert.match(paymentRoute, /amount: 750/u);
  assert.match(paymentRoute, /no automatic charge before written scope/u);
  assert.match(growth, /Paid Integration Pilot/u);
  assert.match(growth, /\$3,000/u);
  assert.match(growth, /\$750\/month/u);
  assert.match(llms, /Commercial deployment/u);
  assert.match(llms, /No automatic charge/u);
  assert.match(layout, /Paid Integration Pilot/u);
});

test("publishes a quote-pinned Coinbase AgentKit adapter", async () => {
  const [adapter, adapterReadme, paymentRoute, growth, manifest, integration, llms, readme] = await Promise.all([
    source("integrations/coinbase-agentkit/intentfence-checkout.ts"),
    source("integrations/coinbase-agentkit/README.md"),
    source("app/api/payments/route.ts"),
    source("app/GrowthSections.tsx"),
    source("public/.well-known/intentfence.json").then(JSON.parse),
    source("public/integrations/coinbase-agentkit.json").then(JSON.parse),
    source("public/llms.txt"),
    source("README.md"),
  ]);

  assert.equal(COINBASE_AGENTKIT_VERSION, "0.10.4");
  assert.equal(COINBASE_AGENTKIT_CHECKOUT.payment.amount_atomic, "5000");
  assert.deepEqual(COINBASE_AGENTKIT_CHECKOUT.quote_pins, [
    "resource",
    "network",
    "asset",
    "amount",
    "pay_to",
  ]);
  assert.equal(COINBASE_AGENTKIT_CHECKOUT.requires_explicit_authorization, true);
  assert.equal(COINBASE_AGENTKIT_CHECKOUT.requires_settlement_proof, true);
  assert.match(adapter, /registerPolicy/u);
  assert.match(adapter, /paymentRequired\.resource\.url/u);
  assert.match(adapter, /pinnedRequirement\.amount/u);
  assert.match(adapter, /await authorize/u);
  assert.match(adapter, /payment-response/u);
  assert.doesNotMatch(adapter, /make_http_request_with_x402/u);
  assert.match(adapterReadme, /Never hard-code `true`/u);
  assert.match(paymentRoute, /coinbase_agentkit: COINBASE_AGENTKIT_CHECKOUT/u);
  assert.match(growth, /PINNED AGENTKIT CHECKOUT/u);
  assert.match(manifest.payments.coinbaseAgentKit, /coinbase-agentkit\.json/u);
  assert.equal(integration.payment.amountAtomic, "5000");
  assert.equal(integration.payment.payTo, "0x833ca7dcdb6a681ddc0c15982ef0d609bceb3a5e");
  assert.match(llms, /Pinned Coinbase AgentKit checkout/u);
  assert.match(readme, /pinned AgentKit adapter/u);
});

test("does not publish a private signing key", async () => {
  const [jwksText, receiptSource, runtimeSecretSource, autoPaymentSource] = await Promise.all([
    source("public/.well-known/jwks.json"),
    source("lib/receipts.ts"),
    source("lib/runtime-secrets.ts"),
    source("mcp-stdio/lib/auto-payment.mjs"),
  ]);
  const jwks = JSON.parse(jwksText);

  assert.equal(jwks.keys.length, 1);
  assert.equal(jwks.keys[0].d, undefined);
  assert.doesNotMatch(jwksText, /"d"\s*:/);
  assert.doesNotMatch(receiptSource, /BEGIN PRIVATE KEY|"d"\s*:/);
  assert.match(runtimeSecretSource, /INTENTFENCE_SIGNING_PRIVATE_JWK/);
  assert.match(autoPaymentSource, /INTENTFENCE_EVM_PRIVATE_KEY/u);
  assert.doesNotMatch(autoPaymentSource, /console\.(?:log|error).*privateKey/u);
});

test("monitors the live x402Scout listing without buying a synthetic health check", async () => {
  const monitor = await source("scripts/monitor-production.mjs");

  assert.match(monitor, /https:\/\/x402scout\.com\/catalog/u);
  assert.match(monitor, /mcp-v0\.11\.0/u);
  assert.match(
    monitor,
    /sha256:f0cdf3df28da8a5c037e48193cbb4602744b5fb0b6c182d877abedb707b1e9f9/u,
  );
  assert.match(monitor, /4f5739b7-799f-412b-8cc7-6c8d4ae6edd9/u);
  assert.match(monitor, /d11b67ab-debd-493a-b7c9-d41adfabb498/u);
  assert.match(monitor, /x402ScoutWalletRisk\.price_usd, 0\.002/u);
  assert.match(monitor, /x402ScoutWalletRisk\.status, "active"/u);
  assert.match(monitor, /x402ScoutWalletRisk\.facilitator_compatible, true/u);
  assert.match(monitor, /x402ScoutUsCpi\.price_usd, 0\.001/u);
  assert.match(monitor, /x402ScoutUsCpi\.category, "data"/u);
  assert.match(monitor, /x402ScoutUsCpi\.status, "active"/u);
  assert.match(monitor, /x402ScoutUsCpi\.facilitator_compatible, true/u);
  assert.doesNotMatch(monitor, /x402scout\.com\/health\//u);
});

test("can release an immutable account-free MCP install artifact", async () => {
  const [workflow, smoke, rootReadme, packageReadme, llms] = await Promise.all([
    source(".github/workflows/release-mcp-tarball.yml"),
    source("scripts/smoke-stdio-mcp.mjs"),
    source("README.md"),
    source("mcp-stdio/README.md"),
    source("public/llms.txt"),
  ]);

  assert.match(workflow, /contents: write/u);
  assert.match(workflow, /working-directory: mcp-stdio/u);
  assert.match(workflow, /run: npm test/u);
  assert.match(workflow, /npm pack --ignore-scripts --json/u);
  assert.match(workflow, /gh release create/u);
  assert.match(workflow, /mcp-v\$\{VERSION\}/u);
  assert.match(workflow, /refusing to replace an immutable install artifact/u);
  assert.doesNotMatch(workflow, /NPM_TOKEN|NODE_AUTH_TOKEN/u);
  assert.match(smoke, /--package/u);
  assert.match(smoke, /intentfence-mcp/u);
  for (const documentation of [rootReadme, packageReadme, llms]) {
    assert.match(
      documentation,
      /releases\/download\/mcp-v0\.11\.0\/razel369-intentfence-mcp-0\.11\.0\.tgz/u,
    );
  }
});

test("ships a self-contained Glama Docker introspection server", async () => {
  const [dockerfile, server] = await Promise.all([
    source("Dockerfile"),
    source("scripts/glama-mcp-server.mjs"),
  ]);

  assert.match(dockerfile, /COPY mcp-stdio\/lib \.\/mcp-stdio\/lib/u);
  assert.match(dockerfile, /CMD \["node", "scripts\/glama-mcp-server\.mjs"\]/u);
  assert.doesNotMatch(dockerfile, /lib\/preflight\.ts/u);
  assert.match(server, /mcp-stdio\/lib\/preflight\.mjs/u);
  assert.match(server, /mcp-stdio\/lib\/x402-assessment\.mjs/u);
});
