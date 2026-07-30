"use client";

import { useEffect, useRef, useState } from "react";
import GrowthSections from "./GrowthSections";

const checks = [
  { label: "Identity", value: "agent:buyer-07", detail: "Subject bound" },
  { label: "Action", value: "purchase", detail: "Type allowlisted" },
  { label: "Resource", value: "orders/42", detail: "Resource allowlisted" },
  { label: "Cost", value: "$79 / $100", detail: "Within ceiling" },
  { label: "Receipt", value: "ES256 · 5 min", detail: "Exact action signed" },
];

const demoInput = {
  subject: "agent:buyer-07",
  action: {
    type: "purchase",
    resource: "merchant://orders/42",
    protocol: "mcp",
    method: "POST",
    payload_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  },
  context: { currency: "USD", quoted_cost: 79, data_retention_hours: 24 },
  policy: {
    allowed_action_types: ["purchase"],
    allowed_resources: ["merchant://orders/*"],
    max_cost: { amount: 100, currency: "USD" },
    max_data_retention_hours: 48,
  },
};

const manifest = `{
  "intentfence": "1.0",
  "subject": "agent:buyer-07",
  "action": {
    "type": "purchase",
    "resource": "merchant://orders/42",
    "protocol": "mcp",
    "payload_sha256": "<sha256>"
  },
  "context": { "currency": "USD", "quoted_cost": 79 },
  "policy": {
    "allowed_action_types": ["purchase"],
    "allowed_resources": ["merchant://orders/*"],
    "max_cost": { "amount": 100, "currency": "USD" }
  },
  "enforcement": "verify receipt, then execute locally"
}`;

export default function Home() {
  const [activeCheck, setActiveCheck] = useState(-1);
  const [runState, setRunState] = useState<"idle" | "running" | "complete" | "error">(
    "idle",
  );
  const [decisionLabel, setDecisionLabel] = useState("READY TO AUTHORIZE");
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
      const response = await fetch("/api/actions/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(demoInput),
      });
      const result = (await response.json()) as { request_id?: string; status?: string; message?: string };
      if (!response.ok || !result.status) {
        throw new Error(result.message || "The authorization API returned an error.");
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
        <a className="header-action" href="#agent-wallet-checkout">
          Buy a wallet screen
        </a>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="eyebrow-mark" aria-hidden="true" />
            Action firewall for autonomous AI agents
          </div>
          <h1>Stop unsafe AI-agent actions before the tool call executes.</h1>
          <p className="hero-intro">
            IntentFence binds the exact action to your allowlist, resource scope, spend ceiling, retention rules, and approval policy. It returns a five-minute signed receipt; your SDK verifies it and fails closed before execution.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#agent-wallet-checkout">
              Screen a Base wallet · 0.002 USDC
            </a>
            <a className="text-link" href="#playground">
              Run the free authorization demo <span aria-hidden="true">→</span>
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
              <strong>Exact action hash</strong>
              <span>five-minute receipt</span>
            </div>
          </div>
        </div>

        <section className="handshake-shell" id="playground" aria-labelledby="handshake-title">
          <div className="handshake-offset" aria-hidden="true" />
          <div className="handshake-card">
            <div className="handshake-topline">
              <span className="live-label">
                <span aria-hidden="true" /> LIVE ACTION AUTHORIZATION
              </span>
              <span className="request-id">REQ / {requestId.slice(0, 18)}</span>
            </div>

            <div className="request-heading">
              <div>
                <span>Incoming agent</span>
                <h2 id="handshake-title">BUYER-07</h2>
              </div>
              <div>
                <span>Requested action</span>
                <strong>Purchase order 42</strong>
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
                    : "Authorize exact action"}
            </button>
          </div>
        </section>
      </section>

      <section className="protocol-strip" id="protocol" aria-labelledby="protocol-title">
        <div className="section-label" id="protocol-title">How it works</div>
        <div className="protocol-step">
          <span>01</span>
          <div>
            <h2>Describe</h2>
            <p>Your agent hashes the consequential payload and declares the exact tool action, resource, cost, and retention context.</p>
          </div>
        </div>
        <div className="protocol-arrow" aria-hidden="true">→</div>
        <div className="protocol-step">
          <span>02</span>
          <div>
            <h2>Authorize</h2>
            <p>IntentFence checks explicit allowlists and ceilings, then signs the exact action and policy digests for five minutes.</p>
          </div>
        </div>
        <div className="protocol-arrow" aria-hidden="true">→</div>
        <div className="protocol-step">
          <span>03</span>
          <div>
            <h2>Execute or stop</h2>
            <p>The SDK verifies the receipt and re-hashes the action locally. Any mismatch, expiry, review, denial, or outage blocks the tool call.</p>
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
          <div className="section-kicker">Open protocol / v0.16</div>
          <h2>A tiny manifest with a very big job.</h2>
          <p>
            Call authorization immediately before a consequential tool. The SDK
            executes only after verifying the short-lived receipt and confirming
            that the local action digest still matches.
          </p>
          <div className="endpoint-list" aria-label="Suggested protocol endpoints">
            <div><span>DISCOVER</span><code>GET /.well-known/intentfence.json</code></div>
            <div><span>SCAN MCP</span><code>POST /api/agent-risk/scan</code></div>
            <div><span>AUTHORIZE</span><code>POST /api/actions/authorize</code></div>
            <div><span>BUILD GUARD</span><code>POST /api/policy-packs</code></div>
            <div><span>NEGOTIATE</span><code>POST /api/preflight</code></div>
            <div><span>GET CPI</span><code>GET /api/us-cpi?month=YYYY-MM</code></div>
            <div><span>CHECK WALLET</span><code>GET /api/wallet-risk?address=...</code></div>
            <div><span>ASSESS x402</span><code>POST /api/x402-assessments</code></div>
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
        <h2>Give every agent a verifiable boundary before it spends, deploys, sends, or changes anything.</h2>
        <a className="button button-light" href="#agent-wallet-checkout">Build one-call checkout</a>
      </section>

      <footer>
        <a className="wordmark wordmark-footer" href="#top">IntentFence<span className="wordmark-dot">.</span></a>
        <p>Action-bound authorization, MCP risk scanning, x402 checks, and signed receipts for autonomous AI.</p>
            <span>Protocol 1.0 · ES256 receipts · fail closed</span>
      </footer>
    </main>
  );
}
