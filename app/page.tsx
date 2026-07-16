"use client";

import { useEffect, useRef, useState } from "react";
import GrowthSections from "./GrowthSections";

const checks = [
  { label: "Identity", value: "did:web:crew-07", detail: "Subject declared" },
  { label: "Scope", value: "travel.booking", detail: "Action declared" },
  { label: "Cost", value: "$428.20 / $500", detail: "Within ceiling" },
  { label: "Data", value: "24h retention", detail: "Within retention bound" },
  { label: "Approval", value: "Human required", detail: "Approval marker supplied" },
];

const demoInput = {
  subject: "did:web:crew-07",
  action: { type: "travel.booking", resource: "TLV-LHR" },
  constraints: {
    currency: "USD",
    cost_ceiling: 500,
    quoted_cost: 428.2,
    data_retention_hours: 24,
    human_approval: "required",
  },
  proofs: ["human_approval"],
};

const manifest = `{
  "intentfence": "0.5",
  "subject": "did:web:crew-07",
  "action": {
    "type": "travel.booking",
    "resource": "TLV-LHR"
  },
  "constraints": {
    "currency": "USD",
    "cost_ceiling": 500,
    "quoted_cost": 428.2,
    "data_retention_hours": 24,
    "human_approval": "required"
  },
  "proofs": ["human_approval"]
}`;

export default function Home() {
  const [activeCheck, setActiveCheck] = useState(-1);
  const [runState, setRunState] = useState<"idle" | "running" | "complete" | "error">(
    "idle",
  );
  const [decisionLabel, setDecisionLabel] = useState("READY FOR PREFLIGHT");
  const [requestId, setRequestId] = useState("not started");
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
    };
  }, []);

  async function runHandshake() {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);

    let step = 0;
    setActiveCheck(0);
    setRunState("running");
    setDecisionLabel("CALLING LIVE API");
    setRequestId("pending");

    timerRef.current = window.setInterval(() => {
      if (step < checks.length - 1) {
        step += 1;
        setActiveCheck(step);
      }
    }, 300);

    try {
      const response = await fetch("/api/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(demoInput),
      });
      const result = (await response.json()) as { request_id?: string; status?: string; message?: string };
      if (!response.ok || !result.status) {
        throw new Error(result.message || "The preflight API returned an error.");
      }
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      timerRef.current = null;
      setActiveCheck(checks.length);
      setRequestId(result.request_id || "returned without id");
      setDecisionLabel(result.status.replaceAll("_", " ").toUpperCase());
      setRunState("complete");
    } catch {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      timerRef.current = null;
      setRunState("error");
      setDecisionLabel("API UNAVAILABLE — NO DECISION");
      setRequestId("integration should fail closed");
    }
  }

  function runFromHero() {
    document.getElementById("playground")?.scrollIntoView({ behavior: "smooth" });
    window.setTimeout(runHandshake, 450);
  }

  async function copyManifest() {
    await navigator.clipboard?.writeText(manifest);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function downloadManifest() {
    const blob = new Blob([manifest], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = "intentfence.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(href);
  }

  return (
    <main>
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="IntentFence home">
          IntentFence<span className="wordmark-dot">.</span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#agents">For builders</a>
          <a href="#protocol">Protocol</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <a className="header-action" href="#playground">
          Try the policy gate
        </a>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="eyebrow-mark" aria-hidden="true" />
            Payment firewall for autonomous AI agents
          </div>
          <h1>Add a fail-closed preflight before each in-scope agent payment.</h1>
          <p className="hero-intro">
            IntentFence evaluates declared spend, scope, data, and approval limits immediately before a tool call. Your integration blocks the payment unless the decision allows it.
          </p>
          <div className="hero-actions">
            <button className="button button-primary" onClick={runFromHero}>
              Call the live preflight API
            </button>
            <a className="text-link" href="#manifest">
              Read the open protocol <span aria-hidden="true">↗</span>
            </a>
          </div>
          <div className="proof-grid" aria-label="Protocol highlights">
            <div>
              <strong>Public API</strong>
              <span>call it now</span>
            </div>
            <div>
              <strong>Block by default</strong>
              <span>guard the tool call</span>
            </div>
            <div>
              <strong>REST · MCP</strong>
              <span>plus A2A 1.0</span>
            </div>
            <div>
              <strong>x402 + USDC</strong>
              <span>agents pay directly</span>
            </div>
          </div>
        </div>

        <section className="handshake-shell" id="playground" aria-labelledby="handshake-title">
          <div className="handshake-offset" aria-hidden="true" />
          <div className="handshake-card">
            <div className="handshake-topline">
              <span className="live-label">
                <span aria-hidden="true" /> LIVE API PREFLIGHT
              </span>
              <span className="request-id">REQ / {requestId.slice(0, 18)}</span>
            </div>

            <div className="request-heading">
              <div>
                <span>Incoming agent</span>
                <h2 id="handshake-title">CREW-07</h2>
              </div>
              <div>
                <span>Requested action</span>
                <strong>Book flight TLV → LHR</strong>
              </div>
            </div>

            <div className="checks" aria-label="Preflight checks">
              {checks.map((check, index) => {
                const passed = runState === "complete" || index < activeCheck;
                const active = runState === "running" && index === activeCheck;

                return (
                  <div
                    className={`check-row ${passed ? "is-passed" : ""} ${active ? "is-active" : ""}`}
                    key={check.label}
                  >
                    <span className="check-index">0{index + 1}</span>
                    <span className="check-label">{check.label}</span>
                    <strong>{check.value}</strong>
                    <span className="check-detail">
                      <i aria-hidden="true">{passed ? "✓" : active ? "…" : "—"}</i>
                      {passed ? check.detail : active ? "Checking" : "Pending"}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className={`decision ${runState === "complete" ? "is-approved" : ""}`} aria-live="polite">
              <span>Decision</span>
              <strong>{runState === "running" ? `CHECKING 0${activeCheck + 1} / 05` : decisionLabel}</strong>
              <span className="decision-code">
                {runState === "complete" ? "LIVE RESPONSE / IF-200" : runState === "error" ? "FAIL CLOSED" : "AWAITING RESULT"}
              </span>
            </div>

            <button
              className="run-button"
              onClick={runHandshake}
              disabled={runState === "running"}
            >
              {runState === "running"
                ? "Calling IntentFence…"
                : runState === "complete"
                  ? "Run live check again"
                  : runState === "error"
                    ? "Retry live check"
                    : "Start live preflight"}
            </button>
          </div>
        </section>
      </section>

      <section className="protocol-strip" id="protocol" aria-labelledby="protocol-title">
        <div className="section-label" id="protocol-title">How it works</div>
        <div className="protocol-step">
          <span>01</span>
          <div>
            <h2>Declare</h2>
            <p>Agent and service publish identity, intent, and hard boundaries.</p>
          </div>
        </div>
        <div className="protocol-arrow" aria-hidden="true">→</div>
        <div className="protocol-step">
          <span>02</span>
          <div>
            <h2>Negotiate</h2>
            <p>Both sides resolve cost, scope, data rules, and approvals.</p>
          </div>
        </div>
        <div className="protocol-arrow" aria-hidden="true">→</div>
        <div className="protocol-step">
          <span>03</span>
          <div>
            <h2>Act</h2>
            <p>A signed declared-input decision is returned alongside proof that the IntentFence service fee settled.</p>
          </div>
        </div>
      </section>

      <GrowthSections />

      <section className="why-section" id="why">
        <div className="section-kicker">Why the world will need it</div>
        <div className="why-heading">
          <h2>The web has rules for reading. Agents need rules for acting.</h2>
          <p>
            Autonomous software is crossing the line from answering questions
            to spending money, moving data, and committing people. IntentFence
            turns every action into a bounded contract before anything happens.
          </p>
        </div>
        <div className="stakeholders">
          <article>
            <span>For agents</span>
            <h3>Know the rules before calling the tool.</h3>
            <p>Fewer failed actions, surprise charges, and unsafe assumptions.</p>
          </article>
          <article>
            <span>For businesses</span>
            <h3>Publish boundaries once, in machine language.</h3>
            <p>Accept autonomous customers without surrendering control.</p>
          </article>
          <article>
            <span>For people</span>
            <h3>Approve a contract, not a stream of clicks.</h3>
            <p>Every action stays explainable, limited, and auditable.</p>
          </article>
        </div>
      </section>

      <section className="manifest-section" id="manifest">
        <div className="manifest-copy">
          <div className="section-kicker">Open protocol / v0.5</div>
          <h2>A tiny manifest with a very big job.</h2>
          <p>
            Publish an IntentFence policy endpoint and wrap the downstream tool
            call with the SDK guard. The action runs only after an allowed decision.
          </p>
          <div className="endpoint-list" aria-label="Suggested protocol endpoints">
            <div><span>DISCOVER</span><code>GET /.well-known/intentfence.json</code></div>
            <div><span>NEGOTIATE</span><code>POST /api/preflight</code></div>
            <div><span>PAY + VERIFY</span><code>POST /api/preflight/verified</code></div>
            <div><span>VERIFY RECEIPT</span><code>POST /api/receipts/verify</code></div>
            <div><span>A2A</span><code>GET /.well-known/agent-card.json</code></div>
          </div>
          <div className="manifest-actions">
            <button className="button button-primary" onClick={copyManifest}>
              {copied ? "Copied to clipboard" : "Copy manifest"}
            </button>
            <button className="button button-secondary" onClick={downloadManifest}>
              Download JSON
            </button>
          </div>
        </div>
        <div className="code-window">
          <div className="code-topline">
            <span>intentfence.json</span>
            <span>JSON</span>
          </div>
          <pre><code>{manifest}</code></pre>
        </div>
      </section>

      <section className="closing">
        <span>THE ACTION LAYER IS ARRIVING</span>
        <h2>Give every agent a machine-readable answer: “This declared payment passed its policy check.”</h2>
        <a className="button button-light" href="#pricing">Choose a plan</a>
      </section>

      <footer>
        <a className="wordmark wordmark-footer" href="#top">IntentFence<span className="wordmark-dot">.</span></a>
        <p>Payment preflight and signed audit receipts for autonomous AI.</p>
        <span>Protocol 0.5 · ES256 receipts · x402 on Base</span>
      </footer>
    </main>
  );
}
