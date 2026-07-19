"use client";

import { FormEvent, useState } from "react";
import {
  INTENTFENCE_VSCODE_INSTALL_URL,
  INTENTFENCE_VSCODE_MANUAL_CONFIG,
} from "../lib/mcp-install";
import {
  AGENTIC_WALLET_CHECKOUT_COMMAND,
  AGENTIC_WALLET_CLI_VERSION,
} from "../lib/agentic-wallet-checkout";

const curlExample = `curl -X POST https://agentpass-protocol.rmalka06.chatgpt.site/api/preflight \\
  -H "Content-Type: application/json" \\
  -d '{
    "subject":"did:web:my-agent",
    "action":{"type":"purchase","resource":"order-42"},
    "constraints":{"cost_ceiling":100,"quoted_cost":79,"data_retention_hours":24}
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

const agentSkillInstall = `npx skills add razel369/intentfence \\
  --skill guard-x402-payments`;

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
    key: "verified",
    name: "x402 Quote Safety",
    price: "0.005 USDC",
    note: "per assessment or signed preflight - live on Base",
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
    featured: true,
  },
  {
    key: "pilot",
    name: "Founding Integration",
    price: "Apply",
    note: "one guarded payment workflow",
    features: [
      "30-day design-partner trial",
      "One payment-provider adapter",
      "Spend and exception policy",
      "Approval and audit workflow",
      "Pricing agreed before activation",
    ],
  },
];

export default function GrowthSections() {
  const [plan, setPlan] = useState("pilot");
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [checkoutCopied, setCheckoutCopied] = useState(false);

  function selectPlan(nextPlan: string) {
    setPlan(nextPlan);
    document.getElementById("founding-access")?.scrollIntoView({ behavior: "smooth" });
  }

  async function copyAgentCheckout() {
    await navigator.clipboard?.writeText(AGENTIC_WALLET_CHECKOUT_COMMAND);
    setCheckoutCopied(true);
    window.setTimeout(() => setCheckoutCopied(false), 1800);
  }

  async function submitLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setMessage("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          company: form.get("company"),
          useCase: form.get("useCase"),
          website: form.get("website"),
          plan,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not save your request.");
      setState("success");
      setMessage("Your application is saved. We will use your details only to discuss the IntentFence integration.");
      event.currentTarget.reset();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Could not save your request.");
    }
  }

  return (
    <>
      <section className="agent-gateway" id="agents" aria-labelledby="agents-title">
        <div className="gateway-intro">
          <div className="section-kicker">Machine entry points - live now</div>
          <h2 id="agents-title">Verify the quote before your agent signs the payment.</h2>
          <p>
            IntentFence lets an agent compare the exact x402 quote it observed with its own price ceiling, pre-approved payees, transfer rules, and target URL before signing.
          </p>
          <div className="discovery-links">
            <a href="/.well-known/agent-card.json">A2A Agent Card</a>
            <a href="/.well-known/intentfence.json">IntentFence manifest</a>
            <a href="/.well-known/x402">x402 service manifest</a>
            <a href="/openapi.json">OpenAPI 3.1</a>
            <a href="/llms.txt">llms.txt</a>
            <a href="https://github.com/razel369/intentfence/tree/main/skills/guard-x402-payments">Agent Skill</a>
            <a href="/api/payments">x402 payment metadata</a>
            <a href="/api/metrics">Public usage & revenue metrics</a>
            <a href="/.well-known/jwks.json">Receipt signing keys</a>
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
            <h3>Teach your agent to check x402 before it signs.</h3>
            <p>
              One open Agent Skill works across Codex, Claude Code, Cursor,
              Gemini CLI, GitHub Copilot, and other skills-compatible agents.
              It keeps keys local and pauses before any unapproved fee.
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
                href="https://github.com/razel369/intentfence/tree/main/skills/guard-x402-payments"
                target="_blank"
                rel="noreferrer"
              >
                Review every instruction <span aria-hidden="true">&#8599;</span>
              </a>
            </div>
          </div>
          <div className="mcp-install-config">
            <div className="code-topline">
              <span>Install in supported agents</span>
              <span>NO API KEY</span>
            </div>
            <pre><code>{agentSkillInstall}</code></pre>
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

        <div className="interface-grid">
          <article>
            <span>01 / x402 QUOTE</span>
            <h3>POST /api/x402-assessments</h3>
            <p>Send the base64 <code>PAYMENT-REQUIRED</code> challenge (up to 16 KiB) and validate Base USDC, price, caller-approved payee, and URL binding.</p>
          </article>
          <article>
            <span>02 / PAID MCP</span>
            <h3>intentfence_x402_assessment</h3>
            <p>MCP agents forward the exact challenge they received, pay the 0.005 USDC IntentFence fee, and get a signed assessment.</p>
          </article>
          <article>
            <span>03 / FREE REST</span>
            <h3>POST /api/preflight</h3>
            <p>Unsigned declared-input policy preview for any runtime, workflow, or backend.</p>
          </article>
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
          <div className="section-kicker">x402 quote safety - autonomous service-fee settlement</div>
          <h2 id="pricing-title">Observe the quote. Pay for signed evidence.</h2>
          <p>
            Agents pay 0.005 USDC per quote assessment or signed preflight with no account or API key. IntentFence never fetches or pays the target; it validates and signs the exact caller-observed challenge. A safe result requires an explicit matching payee allowlist. Teams can apply to put the guard directly in a real payment path.
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
              ) : item.key === "verified" ? (
                <a className="plan-button" href="#agent-wallet-checkout">Copy the capped checkout</a>
              ) : (
                <button className="plan-button" onClick={() => selectPlan(item.key)}>Request founding access</button>
              )}
            </article>
          ))}
        </div>
        <p className="pricing-note">The 0.005 USDC endpoints are live. Founding Integration is an application, not a checkout; no subscription is charged before scope and success criteria are agreed.</p>
      </section>

      <section className="founding-section" id="founding-access">
        <div>
          <div className="section-kicker">Founding integration program</div>
          <h2>Bring one AI-agent payment that needs a hard boundary.</h2>
          <p>We will define its merchant, amount, purpose, and exception rules, then put the guard directly before the payment call.</p>
        </div>
        <form onSubmit={submitLead}>
          <label>
            Work email
            <input name="email" type="email" required placeholder="you@company.com" autoComplete="email" />
          </label>
          <label>
            Company or project
            <input name="company" type="text" placeholder="Acme Agents" autoComplete="organization" />
          </label>
          <label>
            What action should IntentFence guard?
            <textarea name="useCase" rows={4} placeholder="Our agent books travel up to $500 after manager approval..." />
          </label>
          <label>
            Plan
            <select value={plan} onChange={(event) => setPlan(event.target.value)}>
              <option value="pilot">Founding Integration - apply</option>
              <option value="enterprise">Private deployment - discuss</option>
            </select>
          </label>
          <label className="honeypot" aria-hidden="true">
            Website
            <input name="website" type="text" tabIndex={-1} autoComplete="off" />
          </label>
          <button className="button button-primary" disabled={state === "submitting"}>
            {state === "submitting" ? "Saving..." : "Apply for founding integration"}
          </button>
          <p className={`form-message ${state}`} aria-live="polite">
            {message || "No card required. We will contact you only about this integration application."}
          </p>
        </form>
      </section>
    </>
  );
}
