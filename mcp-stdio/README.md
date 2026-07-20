# IntentFence MCP

IntentFence is a payment firewall for autonomous AI agents. The MCP server
checks declared identity, scope, spend, data-retention, and human-approval
constraints immediately before an agent performs a consequential payment.

## Connect now

The hosted Streamable HTTP server is published in the official MCP Registry:

```text
https://agentpass-protocol.rmalka06.chatgpt.site/api/mcp
```

For the verified one-click VS Code link and manual remote-server configuration,
see the root README's **Install in VS Code** section.

For a local stdio server, run the immutable public 0.11.0 release directly. It
does not require an npm account or source checkout:

```bash
npx --yes --package https://github.com/razel369/intentfence/releases/download/mcp-v0.11.0/razel369-intentfence-mcp-0.11.0.tgz intentfence-mcp
```

The immutable release artifact SHA-256 is
`f0cdf3df28da8a5c037e48193cbb4602744b5fb0b6c182d877abedb707b1e9f9`.

## Opt-in automatic payment

Generic MCP clients can buy a paid IntentFence result in one tool call when the
local stdio process receives all three settings:

```text
INTENTFENCE_EVM_PRIVATE_KEY=<buyer-controlled 0x-prefixed key>
INTENTFENCE_MAX_AUTO_PAYMENT_USDC=0.005
INTENTFENCE_AUTO_PAYMENT_BUDGET_USDC=0.05
```

Keep the key in a runtime secret manager or process environment, never in a
committed MCP configuration. Automatic payment is otherwise disabled. Before
signing, the package requires `exact` Base-mainnet USDC, the published
IntentFence recipient, a price within the per-call ceiling, and capacity in the
process-lifetime budget. Budget is reserved before signing and is not restored
after a failed attempt, preventing retry loops or concurrent calls from
overspending. The buyer's private key never leaves the local MCP process.

The server exposes six tools:

- `intentfence_preflight` is a free, unsigned declared-input preview.
- `intentfence_verified_preflight` returns a standard x402 challenge for 0.005
  USDC on Base, then forwards the signed payment and returns the remote ES256
  receipt plus settlement metadata.
- `intentfence_x402_assessment` accepts the exact base64 `PAYMENT-REQUIRED`
  challenge the caller observed (maximum 16 KiB), validates its Base USDC quote
  against a caller ceiling and optional payee allowlist, and returns a signed
  assessment for 0.005 USDC. Inputs are `subject`, `target_url`, optional
  `method` (`GET`, `HEAD`, or `POST`), `payment_required`, and `policy` with
  `max_price_usdc` plus optional `allowed_payees`. A safe result requires an
  explicit matching allowlist entry; omitting it yields `needs_review`.
- `intentfence_wallet_risk` checks a Base recipient with live Base RPC activity
- `intentfence_x402_readiness` accepts a public HTTPS `target_url`, makes one bounded credential-free request without following redirects or paying the target, validates the live challenge, and returns a five-minute signed result for 0.002 USDC. Private-network targets are rejected before contact.
- `intentfence_wallet_risk` checks a Base recipient with live Base RPC activity
  and GoPlus malicious-address intelligence for 0.002 USDC. It returns a
  five-minute ES256 receipt. A low-risk result is not proof of identity,
  ownership, authorization, or future behavior.
- `intentfence_us_cpi` retrieves official headline and core U.S. CPI for the
  latest complete month or a requested `YYYY-MM` period for 0.001 USDC and
  returns a signed provenance receipt.

The hosted IntentFence server never receives a seed phrase or private key. The
optional local auto-payment mode signs only the IntentFence service fee inside
the buyer-controlled process. IntentFence never fetches or pays the target; it validates
the supplied challenge, signs its SHA-256 binding with assurance
`caller-observed-x402-quote-assessment`, and settles only its 0.005 USDC
assessment fee. It does not independently prove real-world authorization.

Project documentation: <https://github.com/razel369/intentfence>

Licensed under Apache-2.0.
