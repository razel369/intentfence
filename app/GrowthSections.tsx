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
    key: "pilot",
    name: "Launch Pilot",
    price: "$750 + $149/mo",
    note: "one guarded production workflow",
    features: [
      "Hands-on integration",
      "Custom spend and approval policy",
      "Guarded SDK wrapper",
      "Receipt verification support",
      "Founding-customer priority",
    ],
  },
  {
    key: "production",
    name: "Production",
    price: "$499/mo",
    note: "for teams operating agent fleets",
    features: [
      "Volume pricing",
      "Team policy sets",
      "Custom retention and SLA",
      "Private deployment option",
    ],
  },
];

export default function GrowthSections() {
  const [plan, setPlan] = useState("pilot");
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
      setMessage("Your pilot request is saved. We will use your details only to discuss IntentFence integration.");
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
            IntentFence publishes standard discovery files and callable endpoints so an agent runtime can find and enforce the service without reading this page.
          </p>
          <div className="discovery-links">
            <a href="/.well-known/agent-card.json">A2A Agent Card</a>
            <a href="/.well-known/intentfence.json">IntentFence manifest</a>
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
          <h2 id="pricing-title">Start per action. Upgrade when the policy becomes critical.</h2>
          <p>
            Agents can pay 0.05 USDC per signed decision. Teams that need an enforced production workflow can launch with a fixed-price integration pilot.
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
        <p className="pricing-note">The 0.05 USDC endpoint is live. Pilot and Production prices are launch offers and include implementation support for an enforced workflow.</p>
      </section>

      <section className="founding-section" id="founding-access">
        <div>
          <div className="section-kicker">Founding customer program</div>
          <h2>Bring one agent action that can spend, send, deploy, or delete.</h2>
          <p>We will put IntentFence directly in the execution path, define the policy, and ship a guarded pilot around that workflow.</p>
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
              <option value="pilot">Launch Pilot - $750 + $149/month</option>
              <option value="production">Production - $499/month</option>
              <option value="enterprise">Private Enterprise - custom</option>
            </select>
          </label>
          <label className="honeypot" aria-hidden="true">
            Website
            <input name="website" type="text" tabIndex={-1} autoComplete="off" />
          </label>
          <button className="button button-primary" disabled={state === "submitting"}>
            {state === "submitting" ? "Saving..." : "Request a paid pilot"}
          </button>
          <p className={`form-message ${state}`} aria-live="polite">
            {message || "No card required now. We will contact you only about an IntentFence pilot."}
          </p>
        </form>
      </section>
    </>
  );
}
