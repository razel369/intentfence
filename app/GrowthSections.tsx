"use client";

import { FormEvent, useState } from "react";

const curlExample = `curl -X POST https://agentpass-protocol.rmalka06.chatgpt.site/api/preflight \\
  -H "Content-Type: application/json" \\
  -d '{
    "subject":"did:web:my-agent",
    "action":{"type":"purchase","resource":"order-42"},
    "constraints":{"cost_ceiling":100,"quoted_cost":79,"data_retention_hours":24}
  }'`;

const paidFlow = `POST /api/preflight/verified
-> 402 + PAYMENT-REQUIRED
-> agent signs 0.05 USDC on Base
-> retry + PAYMENT-SIGNATURE
-> 200 + PAYMENT-RESPONSE`;

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
    name: "Verified x402",
    price: "0.05 USDC",
    note: "per action - live on Base",
    features: [
      "Agent pays directly",
      "No account or API key",
      "On-chain settlement proof",
      "ES256-signed policy receipt",
      "Machine-readable discovery",
      "Payment audit record",
    ],
    featured: true,
  },
  {
    key: "high_assurance",
    name: "High Assurance",
    price: "0.25 USDC",
    note: "per action - coming next",
    features: [
      "External identity proofs",
      "Policy-set verification",
      "Longer audit retention",
      "External proof verification",
      "Founding access priority",
    ],
  },
  {
    key: "fleet",
    name: "Agent Fleet",
    price: "Custom",
    note: "for high-volume agent operators",
    features: [
      "Volume pricing",
      "Batch settlement",
      "Custom retention and SLA",
      "Private deployment option",
    ],
  },
];

export default function GrowthSections() {
  const [plan, setPlan] = useState("high_assurance");
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  function selectPlan(nextPlan: string) {
    setPlan(nextPlan);
    document.getElementById("founding-access")?.scrollIntoView({ behavior: "smooth" });
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
      setMessage("You are on the founding-customer list. We will use your details only for AgentPass access.");
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
          <h2 id="agents-title">One check, in the protocol your agent already speaks.</h2>
          <p>
            AgentPass publishes standard discovery files and callable endpoints so an agent can find the service without reading this page.
          </p>
          <div className="discovery-links">
            <a href="/.well-known/agent-card.json">A2A Agent Card</a>
            <a href="/.well-known/agentpass.json">AgentPass manifest</a>
            <a href="/openapi.json">OpenAPI 3.1</a>
            <a href="/llms.txt">llms.txt</a>
            <a href="/api/payments">x402 payment metadata</a>
            <a href="/.well-known/jwks.json">Receipt signing keys</a>
          </div>
        </div>

        <div className="interface-grid">
          <article>
            <span>01 / REST</span>
            <h3>POST /api/preflight</h3>
            <p>Free JSON policy preview for any runtime, workflow, or backend.</p>
          </article>
          <article>
            <span>02 / x402</span>
            <h3>POST /api/preflight/verified</h3>
            <p>Pay 0.05 USDC per successful action with settlement proof and an ES256-signed receipt.</p>
          </article>
          <article>
            <span>03 / MCP + A2A</span>
            <h3>Machine-native discovery</h3>
            <p>REST, MCP, A2A, OpenAPI, llms.txt, and Bazaar entry points.</p>
          </article>
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
          <div className="section-kicker">Open protocol - autonomous USDC payments</div>
          <h2 id="pricing-title">Free to discover. Pay only when an agent uses it.</h2>
          <p>
            An agent can discover the endpoint, pay 0.05 USDC on Base, and receive the result without creating an account or asking a human to enter a card.
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
                <a className="plan-button" href="/api/payments">Inspect the live payment flow</a>
              ) : (
                <button className="plan-button" onClick={() => selectPlan(item.key)}>Request founding access</button>
              )}
            </article>
          ))}
        </div>
        <p className="pricing-note">Verified x402 at 0.05 USDC now includes a signed declared-input receipt. External identity verification and fleet features remain upcoming or custom.</p>
      </section>

      <section className="founding-section" id="founding-access">
        <div>
          <div className="section-kicker">Founding customer program</div>
          <h2>Bring one real agent action. We will help make it safe and autonomously billable.</h2>
          <p>The pay-per-use endpoint is live. Use this form for higher-assurance verification, volume pricing, or a private deployment.</p>
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
            What action should AgentPass check?
            <textarea name="useCase" rows={4} placeholder="Our agent books travel up to $500 after manager approval..." />
          </label>
          <label>
            Plan
            <select value={plan} onChange={(event) => setPlan(event.target.value)}>
              <option value="high_assurance">High Assurance - 0.25 USDC/action</option>
              <option value="fleet">Agent Fleet - custom</option>
              <option value="enterprise">Private Enterprise - custom</option>
            </select>
          </label>
          <label className="honeypot" aria-hidden="true">
            Website
            <input name="website" type="text" tabIndex={-1} autoComplete="off" />
          </label>
          <button className="button button-primary" disabled={state === "submitting"}>
            {state === "submitting" ? "Saving..." : "Request founding access"}
          </button>
          <p className={`form-message ${state}`} aria-live="polite">
            {message || "No card required. We will contact you only about AgentPass access."}
          </p>
        </form>
      </section>
    </>
  );
}
