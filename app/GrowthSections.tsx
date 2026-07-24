"use client";

import { useState } from "react";
import {
  INTENTFENCE_VSCODE_INSTALL_URL,
  INTENTFENCE_VSCODE_MANUAL_CONFIG,
} from "../lib/mcp-install";
import {
  AGENTIC_WALLET_CHECKOUT_COMMAND,
  AGENTIC_WALLET_CLI_VERSION,
} from "../lib/agentic-wallet-checkout";
import { COINBASE_AGENTKIT_VERSION } from "../lib/coinbase-agentkit-checkout";
import { POLICY_PACK_CHECKOUT_COMMAND } from "../lib/policy-pack-checkout";

const curlExample = `curl -X POST https://agentpass-protocol.rmalka06.chatgpt.site/api/actions/authorize \\
  -H "Content-Type: application/json" \\
  -d '{
    "subject":"agent:buyer-07",
    "action":{"type":"purchase","resource":"merchant://orders/42","protocol":"mcp"},
    "context":{"currency":"USD","quoted_cost":79},
    "policy":{"allowed_action_types":["purchase"],"allowed_resources":["merchant://orders/*"],"max_cost":{"amount":100,"currency":"USD"}}
  }'`;

const paidFlow = `POST /api/preflight/verified
-> 402 + PAYMENT-REQUIRED
-> agent signs 0.005 USDC on Base
-> retry + PAYMENT-SIGNATURE
-> 200 + PAYMENT-RESPONSE`;

const assessmentFlow = `target -> 402 + PAYMENT-REQUIRED
-> agent forwards the base64 challenge to IntentFence
-> 402 + PAYMENT-REQUIRED (IntentFence fee)
-> agent signs 0.005 USDC on Base and retries
-> signed SHA-256-bound quote assessment`;

const walletRiskFlow = `GET /api/wallet-risk?address=0x...
-> 402 + PAYMENT-REQUIRED
-> agent signs 0.002 USDC on Base and retries
-> live Base + malicious-address intelligence
-> five-minute ES256 risk receipt`;

const agentSkillInstall = `npx skills add razel369/intentfence \\
  --skill guard-x402-payments`;
const readinessSkillInstall = `npx skills add razel369/intentfence \\
  --skill inspect-x402-endpoints`;

const plans = [
  {
    key: "free",
    name: "Open Preview",
    price: "$0",
    note: "free, unsigned preflight",
    features: [
      "Open spec and discovery files",
      "REST, MCP and A2A",
      "Deterministic policy checks",
      "No wallet required",
    ],
  },
  {
    key: "policy_pack",
    name: "Production Policy Pack",
    price: "1 USDC",
    note: "one-time, self-service x402 checkout",
    features: [
      "OpenAI, Cloudflare, AgentKit, or MCP gateway",
      "Copy-ready TypeScript guard",
      "Signed action and policy receipt",
      "Allowed, denied, and over-budget tests",
      "Fail-closed deployment checklist",
      "No account, meeting, or sales call",
    ],
    featured: true,
  },
  {
    key: "cpi",
    name: "Official U.S. CPI",
    price: "0.001 USDC",
    note: "per signed official-data response",
    features: [
      "Headline and core CPI",
      "Latest or requested YYYY-MM period",
      "Official Bureau of Labor Statistics source",
      "Six-hour edge cache",
      "ES256 provenance receipt",
      "MCP and REST discovery",
    ],
  },
  {
    key: "verified",
    name: "Wallet Risk",
    price: "0.002 USDC",
    note: "per live Base recipient assessment",
    features: [
      "Agent pays directly",
      "No account or API key",
      "Live Base activity evidence",
      "Malicious-address and sanctions flags",
      "Five-minute ES256 risk receipt",
      "Machine-readable MCP and REST discovery",
      "No stored wallet credentials",
    ],
  },
  {
    key: "quote",
    name: "x402 Quote Safety",
    price: "0.005 USDC",
    note: "per exact quote assessment or signed preflight",
    features: [
      "Agent pays directly",
      "No account or API key",
      "IntentFence service-fee settlement proof",
      "Exact caller-observed challenge validation",
      "Price, payee, asset and URL binding checks",
      "ES256-signed policy receipt",
      "Machine-readable discovery",
      "Payment audit record",
    ],
  },
];

export default function GrowthSections() {
  const [checkoutCopied, setCheckoutCopied] = useState(false);
  const [policyPackCopied, setPolicyPackCopied] = useState(false);
  const [scanState, setScanState] = useState<"idle" | "running" | "complete" | "error">("idle");
  const [scanResult, setScanResult] = useState("Ready to scan a consequential MCP tool definition.");

  async function copyAgentCheckout() {
    await navigator.clipboard?.writeText(AGENTIC_WALLET_CHECKOUT_COMMAND);
    setCheckoutCopied(true);
    window.setTimeout(() => setCheckoutCopied(false), 1800);
  }

  async function copyPolicyPackCheckout() {
    await navigator.clipboard?.writeText(POLICY_PACK_CHECKOUT_COMMAND);
    setPolicyPackCopied(true);
    window.setTimeout(() => setPolicyPackCopied(false), 1800);
  }

  async function runRiskScan() {
    setScanState("running");
    setScanResult("Scanning metadata…");
    try {
      const response = await fetch("/api/agent-risk/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          server_name: "demo-wallet-agent",
          tools: [{ name: "transfer_payment", description: "Transfer funds to a recipient." }],
        }),
      });
      const result = await response.json() as { score?: number; grade?: string; findings?: Array<{ code: string }>; message?: string };
      if (!response.ok || result.score === undefined) throw new Error(result.message || "Scan failed.");
      setScanState("complete");
      setScanResult(`Score ${result.score}/100 · Grade ${result.grade} · ${result.findings?.length ?? 0} findings`);
    } catch {
      setScanState("error");
      setScanResult("Scanner unavailable. No security conclusion was produced.");
    }
  }

  return (
    <>
      <section className="agent-gateway" id="agents" aria-labelledby="agents-title">
        <div className="gateway-intro">
          <div className="section-kicker">Machine entry points - live now</div>
          <h2 id="agents-title">Authorize the exact action before your agent calls the tool.</h2>
          <p>
            IntentFence binds the action, resource, payload hash, cost, retention, and approval policy to a five-minute signed receipt. The SDK verifies it locally and blocks execution on any mismatch or outage.
          </p>
          <div className="discovery-links">
            <a href="/.well-known/agent-card.json">A2A Agent Card</a>
            <a href="/.well-known/intentfence.json">IntentFence manifest</a>
            <a href="/.well-known/x402">x402 service manifest</a>
            <a href="/openapi.json">OpenAPI 3.1</a>
            <a href="/llms.txt">llms.txt</a>
            <a href="https://github.com/razel369/intentfence/tree/main/skills/guard-x402-payments">Agent Skill</a>
            <a href="/api/payments">x402 payment metadata</a>
            <a href="/integrations/coinbase-agentkit.json">Coinbase AgentKit adapter</a>
            <a href="/integrations/openai-agents-js.json">OpenAI Agents SDK guard</a>
            <a href="https://github.com/razel369/intentfence/tree/main/integrations/cloudflare-agents">Cloudflare Agents guard</a>
            <a href="https://github.com/razel369/intentfence/tree/main/integrations/mcp-gateway">MCP gateway guard</a>
            <a href="/api/metrics">Public usage & revenue metrics</a>
            <a href="/.well-known/jwks.json">Receipt signing keys</a>
          </div>
        </div>

        <div className="mcp-install-card" id="risk-scan">
          <div className="mcp-install-copy">
            <span>FREE MCP RISK SCAN</span>
            <h3>Find the dangerous gaps before integration.</h3>
            <p>
              Run a metadata-only scan for missing schemas, unsafe annotations,
              approval binding, and cost boundaries. The scanner never contacts
              or executes the supplied tools and is not a security certification.
            </p>
            <div className="mcp-install-actions">
              <button className="button mcp-install-button" onClick={runRiskScan} disabled={scanState === "running"}>
                {scanState === "running" ? "Scanning…" : "Run demo risk scan"}
              </button>
              <a className="mcp-install-docs" href="/openapi.json">Use your own MCP metadata</a>
            </div>
          </div>
          <div className="mcp-install-config">
            <div className="code-topline"><span>Live result</span><span>{scanState.toUpperCase()}</span></div>
            <pre><code>{scanResult}</code></pre>
          </div>
        </div>

        <div className="mcp-install-card" id="vscode-install">
          <div className="mcp-install-copy">
            <span>ONE-CLICK MCP INSTALL</span>
            <h3>Connect the live IntentFence server to VS Code.</h3>
            <p>
              VS Code asks you to review and trust the server before its first
              start. The free policy preview works without an API key; paid
              tools still require an x402-capable wallet flow controlled by the
              caller.
            </p>
            <div className="mcp-install-actions">
              <a className="button mcp-install-button" href={INTENTFENCE_VSCODE_INSTALL_URL}>
                Install IntentFence in VS Code
              </a>
              <a
                className="mcp-install-docs"
                href="https://code.visualstudio.com/api/extension-guides/ai/mcp#create-an-mcp-installation-url"
                target="_blank"
                rel="noreferrer"
              >
                Review VS Code MCP setup <span aria-hidden="true">↗</span>
              </a>
            </div>
          </div>
          <div className="mcp-install-config">
            <div className="code-topline">
              <span>Manual fallback</span>
              <span>.vscode/mcp.json</span>
            </div>
            <pre><code>{INTENTFENCE_VSCODE_MANUAL_CONFIG}</code></pre>
          </div>
        </div>

        <div className="mcp-install-card" id="agent-skill-install">
          <div className="mcp-install-copy">
            <span>CROSS-AGENT INSTALL</span>
            <h3>Teach your agent to inspect x402 before it pays.</h3>
            <p>
              Two open Agent Skills work across Codex, Claude Code, Cursor,
              Gemini CLI, GitHub Copilot, and other skills-compatible agents.
              Inspect a live URL first, then guard the exact quote before signing.
              Both keep keys local and pause before any unapproved fee.
            </p>
            <div className="mcp-install-actions">
              <a
                className="button mcp-install-button"
                href="https://github.com/razel369/intentfence/tree/main/skills/guard-x402-payments"
                target="_blank"
                rel="noreferrer"
              >
                Review and install the x402 guard
              </a>
              <a
                className="mcp-install-docs"
                href="https://github.com/razel369/intentfence/tree/main/skills/inspect-x402-endpoints"
                target="_blank"
                rel="noreferrer"
              >
                Review the live-readiness skill <span aria-hidden="true">&#8599;</span>
              </a>
            </div>
          </div>
          <div className="mcp-install-config">
            <div className="code-topline">
              <span>Install in supported agents</span>
              <span>NO API KEY</span>
            </div>
            <pre><code>{readinessSkillInstall}{"\n\n"}{agentSkillInstall}</code></pre>
          </div>
        </div>

        <div className="mcp-install-card" id="agent-wallet-checkout">
          <div className="mcp-install-copy">
            <span>DIRECT AGENT CHECKOUT</span>
            <h3>Pay for a signed policy receipt in one capped x402 command.</h3>
            <p>
              For agents that already have Coinbase Agentic Wallet, this command
              sends a complete policy request and caps the real Base USDC charge
              at exactly 0.005. Review the request first; IntentFence never sees
              wallet credentials and cannot initiate the payment itself.
            </p>
            <div className="mcp-install-actions">
              <button className="button mcp-install-button" onClick={copyAgentCheckout}>
                {checkoutCopied ? "Checkout command copied" : "Copy capped checkout command"}
              </button>
              <a className="mcp-install-docs" href="/api/payments">
                Read machine payment metadata <span aria-hidden="true">&#8599;</span>
              </a>
            </div>
          </div>
          <div className="mcp-install-config">
            <div className="code-topline">
              <span>Agentic Wallet v{AGENTIC_WALLET_CLI_VERSION}</span>
              <span>MAX 0.005 USDC</span>
            </div>
            <pre><code>{AGENTIC_WALLET_CHECKOUT_COMMAND}</code></pre>
          </div>
        </div>

        <div className="mcp-install-card" id="policy-pack-checkout">
          <div className="mcp-install-copy">
            <span>NO-CONTACT PRODUCTION CHECKOUT</span>
            <h3>Turn one action policy into a deployable fail-closed guard.</h3>
            <p>
              An agent pays exactly 1 USDC through x402 and immediately receives
              a runtime-specific TypeScript integration, a signed action and
              policy receipt, negative test vectors, and a deployment checklist.
              No account, meeting, email, or API key is required.
            </p>
            <div className="mcp-install-actions">
              <button className="button mcp-install-button" onClick={copyPolicyPackCheckout}>
                {policyPackCopied ? "Policy-pack checkout copied" : "Copy 1 USDC policy-pack checkout"}
              </button>
              <a className="mcp-install-docs" href="/api/payments">
                Read the machine offer <span aria-hidden="true">&#8599;</span>
              </a>
            </div>
          </div>
          <div className="mcp-install-config">
            <div className="code-topline">
              <span>Self-service x402</span>
              <span>MAX 1 USDC</span>
            </div>
            <pre><code>{POLICY_PACK_CHECKOUT_COMMAND}</code></pre>
          </div>
        </div>

        <div className="mcp-install-card" id="coinbase-agentkit-checkout">
          <div className="mcp-install-copy">
            <span>PINNED AGENTKIT CHECKOUT</span>
            <h3>Use an existing Coinbase AgentKit wallet without trusting a changing quote.</h3>
            <p>
              The open adapter pins the IntentFence URL, Base network, canonical
              USDC asset, exact 0.005 amount, and recipient before it asks your
              own authorization callback to sign. It rejects mismatches and
              requires on-chain settlement proof.
            </p>
            <div className="mcp-install-actions">
              <a
                className="button mcp-install-button"
                href="https://github.com/razel369/intentfence/tree/main/integrations/coinbase-agentkit"
                target="_blank"
                rel="noreferrer"
              >
                Review the AgentKit adapter
              </a>
              <a className="mcp-install-docs" href="/integrations/coinbase-agentkit.json">
                Read machine integration metadata <span aria-hidden="true">&#8599;</span>
              </a>
            </div>
          </div>
          <div className="mcp-install-config">
            <div className="code-topline">
              <span>Coinbase AgentKit v{COINBASE_AGENTKIT_VERSION}</span>
              <span>5 QUOTE PINS</span>
            </div>
            <pre><code>resource + network + asset + amount + payTo{"\n"}approval callback -&gt; sign -&gt; settlement proof</code></pre>
          </div>
        </div>

        <div className="interface-grid">
          <article>
            <span>00 / OFFICIAL CPI</span>
            <h3>GET /api/us-cpi</h3>
            <p>Retrieve official headline and core U.S. inflation data with signed BLS provenance for 0.001 USDC.</p>
          </article>
          <article>
            <span>01 / WALLET RISK</span>
            <h3>GET /api/wallet-risk</h3>
            <p>Check the recipient with live Base activity and malicious-address intelligence for 0.002 USDC before signing a payment.</p>
          </article>
          <article>
            <span>02 / x402 QUOTE</span>
            <h3>POST /api/x402-assessments</h3>
            <p>Send the base64 <code>PAYMENT-REQUIRED</code> challenge (up to 16 KiB) and validate Base USDC, price, caller-approved payee, and URL binding.</p>
          </article>
          <article>
            <span>03 / LIVE x402 READINESS</span>
            <h3>POST /api/x402-readiness</h3>
            <p>Give IntentFence only the endpoint URL. It makes one bounded no-payment request, blocks redirects and private networks, validates the live challenge, and signs the result for 0.002 USDC.</p>
          </article>
          <article>
            <span>04 / PAID MCP</span>
            <h3>intentfence_x402_assessment</h3>
            <p>MCP agents forward the exact challenge they received, pay the 0.005 USDC IntentFence fee, and get a signed assessment.</p>
          </article>
          <article>
            <span>05 / FREE REST</span>
            <h3>POST /api/preflight</h3>
            <p>Unsigned declared-input policy preview for any runtime, workflow, or backend.</p>
          </article>
        </div>

        <div className="quickstart">
          <div className="code-topline">
            <span>Live Base recipient assessment</span>
            <a href="/openapi.json">0.002 USDC</a>
          </div>
          <pre><code>{walletRiskFlow}</code></pre>
        </div>

        <div className="quickstart">
          <div className="code-topline">
            <span>Caller-observed x402 quote assessment</span>
            <a href="/openapi.json">0.005 USDC</a>
          </div>
          <pre><code>{assessmentFlow}</code></pre>
        </div>

        <div className="quickstart">
          <div className="code-topline">
            <span>60-second quickstart</span>
            <span>FREE REST</span>
          </div>
          <pre><code>{curlExample}</code></pre>
        </div>

        <div className="quickstart">
          <div className="code-topline">
            <span>Autonomous payment flow</span>
            <a href="/api/payments">LIVE x402</a>
          </div>
          <pre><code>{paidFlow}</code></pre>
        </div>
      </section>

      <section className="pricing-section" id="pricing" aria-labelledby="pricing-title">
        <div className="pricing-heading">
          <div className="section-kicker">Action authorization plus autonomous service-fee settlement</div>
          <h2 id="pricing-title">Start free. Buy a deployable production guard without talking to sales.</h2>
          <p>
            Public authorization and MCP metadata scanning are free and
            rate-limited. Paid x402 evidence and the production policy pack are
            delivered immediately without an account, API key, or meeting.
          </p>
        </div>
        <div className="pricing-grid">
          {plans.map((item) => (
            <article className={item.featured ? "featured" : ""} key={item.key}>
              {item.featured && <div className="plan-flag">Live pay-per-use</div>}
              <span>{item.name}</span>
              <h3>{item.price}</h3>
              <p>{item.note}</p>
              <ul>
                {item.features.map((feature) => <li key={feature}>{feature}</li>)}
              </ul>
              {item.key === "free" ? (
                <a className="plan-button" href="/openapi.json">Open the API spec</a>
              ) : item.key === "policy_pack" ? (
                <a className="plan-button" href="#policy-pack-checkout">Copy the 1 USDC checkout</a>
              ) : item.key === "cpi" || item.key === "verified" || item.key === "quote" ? (
                <a className="plan-button" href="#agent-wallet-checkout">Copy the capped checkout</a>
              ) : null}
            </article>
          ))}
        </div>
        <p className="pricing-note">The 0.001, 0.002, 0.005 and 1 USDC endpoints are live on Base. Every paid response requires x402 settlement proof; wallet credentials stay with the buyer.</p>
      </section>

      <section className="founding-section" id="self-service">
        <div>
          <div className="section-kicker">Autonomous commercial path</div>
          <h2>One payment. One complete integration pack. Zero sales calls.</h2>
          <p>
            The buyer supplies a public-safe project label, target runtime, and
            exact authorization policy. IntentFence validates the request before
            settlement, then returns the code, signed receipt, tests, and launch
            checklist in the same paid response.
          </p>
        </div>
        <div className="quickstart">
          <div className="code-topline">
            <span>Production policy pack</span>
            <span>1 USDC / BASE</span>
          </div>
          <pre><code>POST /api/policy-packs{"\n"}runtime + exact action + policy{"\n"}-&gt; 402 PAYMENT-REQUIRED{"\n"}-&gt; x402 settlement{"\n"}-&gt; code + signed receipt + tests + checklist</code></pre>
        </div>
      </section>
    </>
  );
}
