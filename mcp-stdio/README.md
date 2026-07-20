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

For a local stdio server, run the immutable public 0.9.0 release directly. It
does not require an npm account or source checkout:

```bash
npx --yes --package https://github.com/razel369/intentfence/releases/download/mcp-v0.9.0/razel369-intentfence-mcp-0.9.0.tgz intentfence-mcp
```

The release artifact SHA-256 is
`2fdceed20e22ad042b330f5d95fe3d441e2e33a32a70688443989dac166b8e89`.

The server exposes five tools:

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
  and GoPlus malicious-address intelligence for 0.002 USDC. It returns a
  five-minute ES256 receipt. A low-risk result is not proof of identity,
  ownership, authorization, or future behavior.
- `intentfence_us_cpi` retrieves official headline and core U.S. CPI for the
  latest complete month or a requested `YYYY-MM` period for 0.001 USDC and
  returns a signed provenance receipt.

The server never receives a seed phrase or private key and does not execute the
downstream payment. IntentFence never fetches or pays the target; it validates
the supplied challenge, signs its SHA-256 binding with assurance
`caller-observed-x402-quote-assessment`, and settles only its 0.005 USDC
assessment fee. It does not independently prove real-world authorization.

Project documentation: <https://github.com/razel369/intentfence>

Licensed under Apache-2.0.
