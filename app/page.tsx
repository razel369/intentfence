"use client";

import { useEffect, useRef, useState } from "react";
import GrowthSections from "./GrowthSections";

const checks = [
  { label: "Identity", value: "did:web:crew-07", detail: "Verified issuer" },
  { label: "Scope", value: "travel.booking", detail: "Declared capability" },
  { label: "Cost", value: "$428.20 / $500", detail: "Within ceiling" },
  { label: "Data", value: "24h retention", detail: "Auto-delete required" },
  { label: "Approval", value: "Human required", detail: "Signed grant attached" },
];

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
    "data_retention_hours": 24,
    "human_approval": "required"
  },
  "decision": {
    "status": "safe_to_proceed",
    "quote": 428.20
  }
}`;

export default function Home() {
  const [activeCheck, setActiveCheck] = useState(-1);
  const [runState, setRunState] = useState<"idle" | "running" | "complete">(
    "idle",
  );
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
    };
  }, []);

  function runHandshake() {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);

    let step = 0;
    setActiveCheck(0);
    setRunState("running");

    timerRef.current = window.setInterval(() => {
      step += 1;
      if (step >= checks.length) {
        if (timerRef.current !== null) window.clearInterval(timerRef.current);
        timerRef.current = null;
        setRunState("complete");
        return;
      }
      setActiveCheck(step);
    }, 430);
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
            Spend and action policy for autonomous AI
          </div>
          <h1>Stop unsafe agent actions before they execute.</h1>
          <p className="hero-intro">
            IntentFence sits directly before a tool call and returns an
            enforceable decision for spend, scope, data, and approval limits.
          </p>
          <div className="hero-actions">
            <button className="button button-primary" onClick={runFromHero}>
              Run a live policy gate
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
                <span aria-hidden="true" /> LIVE PREFLIGHT
              </span>
              <span className="request-id">REQ / 2026-0713-0042</span>
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
              <strong>
                {runState === "idle"
                  ? "READY FOR PREFLIGHT"
                  : runState === "running"
                    ? `CHECKING 0${activeCheck + 1} / 05`
                    : "SAFE TO PROCEED"}
              </strong>
              <span className="decision-code">
                {runState === "complete" ? "PASS / IF-200" : "AWAITING RESULT"}
              </span>
            </div>

            <button
              className="run-button"
              onClick={runHandshake}
              disabled={runState === "running"}
            >
              {runState === "running"
                ? "Negotiating contract…"
                : runState === "complete"
                  ? "Run again"
                  : "Start preflight"}
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
            <p>An auditable decision and x402 settlement proof travel with the action.</p>
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
        <h2>Give every agent a safe way to say: “I’m allowed to do this.”</h2>
        <a className="button button-light" href="#pricing">Choose a plan</a>
      </section>

      <footer>
        <a className="wordmark wordmark-footer" href="#top">IntentFence<span className="wordmark-dot">.</span></a>
        <p>The spend and action firewall for autonomous AI.</p>
        <span>Protocol 0.5 · ES256 receipts · x402 on Base</span>
      </footer>
    </main>
  );
}
