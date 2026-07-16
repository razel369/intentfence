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
-> agent signs 0.005 USDC on Base
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
    price: "0.005 USDC",
    note: "per settled preflight - live on Base",
    features: [
      "Agent pays directly",
      "No account or API key",
      "IntentFence service-fee settlement proof",
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
          <h2 id="agents-title">One check, in the protocol your agent already speaks.</h2>
          <p>
            IntentFence publishes standard discovery files and callable endpoints so an agent runtime can find the payment firewall without reading this page.
          </p>
          <div className="discovery-links">
            <a href="/.well-known/agent-card.json">A2A Agent Card</a>
            <a href="/.well-known/intentfence.json">IntentFence manifest</a>
            <a href="/.well-known/x402">x402 service manifest</a>
            <a href="/openapi.json">OpenAPI 3.1</a>
            <a href="/llms.txt">llms.txt</a>
            <a href="/api/payments">x402 payment metadata</a>
            <a href="/api/metrics">Public usage & revenue metrics</a>
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
            <p>Pay 0.005 USDC for a settled preflight with an ES256-signed audit receipt.</p>
          </article>
          <article>
            <span>03 / PAID MCP</span>
            <h3>intentfence_verified_preflight</h3>
            <p>MCP agents receive a standard x402 challenge, pay from their own wallet, and retry automatically.</p>
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
          <div className="section-kicker">Payment preflight - autonomous x402 service-fee settlement</div>
          <h2 id="pricing-title">Preview free. Pay only for a settled audit receipt.</h2>
          <p>
            Agents pay 0.005 USDC per x402-settled signed preflight with no account or API key. Teams can apply to put the guard directly in a real payment path.
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
        <p className="pricing-note">The 0.005 USDC endpoint is live. Founding Integration is an application, not a checkout; no subscription is charged before scope and success criteria are agreed.</p>
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
