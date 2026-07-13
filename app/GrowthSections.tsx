"use client";

import { FormEvent, useState } from "react";

const curlExample = `curl -X POST https://agentpass-protocol.rmalka06.chatgpt.site/api/preflight \\
  -H "Content-Type: application/json" \\
  -d '{
    "subject":"did:web:my-agent",
    "action":{"type":"purchase","resource":"order-42"},
    "constraints":{"cost_ceiling":100,"quoted_cost":79,"data_retention_hours":24}
  }'`;

const plans = [
  {
    key: "free",
    name: "Open",
    price: "$0",
    note: "for builders and distribution",
    features: ["Open spec + discovery files", "10k public preflights / month", "REST, MCP and A2A", "Unsigned preview receipts"],
  },
  {
    key: "builder",
    name: "Builder",
    price: "$49",
    note: "per month · founding price",
    features: ["100k preflights / month", "Signed decision receipts", "API keys and policy sets", "30-day audit history", "$9 per extra 100k"],
    featured: true,
  },
  {
    key: "scale",
    name: "Scale",
    price: "$249",
    note: "per month · founding price",
    features: ["1m preflights / month", "Team policy controls", "90-day audit history", "Priority onboarding", "Usage export"],
  },
  {
    key: "enterprise",
    name: "Enterprise",
    price: "Custom",
    note: "for regulated agent fleets",
    features: ["SSO and data residency", "Private deployment", "Custom retention and SLA", "Security review support"],
  },
];

export default function GrowthSections() {
  const [plan, setPlan] = useState("builder");
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
          <div className="section-kicker">Machine entry points · live now</div>
          <h2 id="agents-title">One check, in the protocol your agent already speaks.</h2>
          <p>
            AgentPass publishes standard discovery files and callable endpoints so an agent can find the service without reading this page.
          </p>
          <div className="discovery-links">
            <a href="/.well-known/agent-card.json">A2A Agent Card</a>
            <a href="/.well-known/agentpass.json">AgentPass manifest</a>
            <a href="/openapi.json">OpenAPI 3.1</a>
            <a href="/llms.txt">llms.txt</a>
          </div>
        </div>

        <div className="interface-grid">
          <article>
            <span>01 / REST</span>
            <h3>POST /api/preflight</h3>
            <p>Universal JSON endpoint for any runtime, workflow, or backend.</p>
          </article>
          <article>
            <span>02 / MCP</span>
            <h3>POST /mcp</h3>
            <p>Discover and call <code>agentpass_preflight</code> as an MCP tool.</p>
          </article>
          <article>
            <span>03 / A2A</span>
            <h3>/.well-known/agent-card.json</h3>
            <p>A2A 1.0 Agent Card with an HTTP+JSON message interface.</p>
          </article>
        </div>

        <div className="quickstart">
          <div className="code-topline">
            <span>60-second quickstart</span>
            <span>REST</span>
          </div>
          <pre><code>{curlExample}</code></pre>
        </div>
      </section>

      <section className="pricing-section" id="pricing" aria-labelledby="pricing-title">
        <div className="pricing-heading">
          <div className="section-kicker">Open protocol · paid trust infrastructure</div>
          <h2 id="pricing-title">Free to adopt. Paid when the action needs proof.</h2>
          <p>
            The open layer drives distribution. Hosted signing, policy enforcement, audit retention, and team controls are what businesses pay for.
          </p>
        </div>
        <div className="pricing-grid">
          {plans.map((item) => (
            <article className={item.featured ? "featured" : ""} key={item.key}>
              {item.featured && <div className="plan-flag">Best starting point</div>}
              <span>{item.name}</span>
              <h3>{item.price}</h3>
              <p>{item.note}</p>
              <ul>
                {item.features.map((feature) => <li key={feature}>{feature}</li>)}
              </ul>
              {item.key === "free" ? (
                <a className="plan-button" href="/openapi.json">Open the API spec</a>
              ) : (
                <button className="plan-button" onClick={() => selectPlan(item.key)}>Request founding access</button>
              )}
            </article>
          ))}
        </div>
        <p className="pricing-note">Founding prices are an early-access offer, not a claim that every listed paid feature is generally available today.</p>
      </section>

      <section className="founding-section" id="founding-access">
        <div>
          <div className="section-kicker">Founding customer program</div>
          <h2>Bring one real agent action. We will help make it safe and billable.</h2>
          <p>Tell us what your agent does and which plan fits. We will prioritize the policy and receipt flow around real demand.</p>
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
              <option value="builder">Builder · $49/mo</option>
              <option value="scale">Scale · $249/mo</option>
              <option value="enterprise">Enterprise · custom</option>
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
