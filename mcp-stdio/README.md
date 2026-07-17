# IntentFence MCP

IntentFence is a payment firewall for autonomous AI agents. The MCP server
checks declared identity, scope, spend, data-retention, and human-approval
constraints immediately before an agent performs a consequential payment.

## Run

```bash
npx -y @razel369/intentfence-mcp@0.7.0
```

Example MCP client configuration:

```json
{
  "mcpServers": {
    "intentfence": {
      "command": "npx",
      "args": ["-y", "@razel369/intentfence-mcp@0.7.0"]
    }
  }
}
```

The server exposes three tools:

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

The server never receives a seed phrase or private key and does not execute the
downstream payment. IntentFence never fetches or pays the target; it validates
the supplied challenge, signs its SHA-256 binding with assurance
`caller-observed-x402-quote-assessment`, and settles only its 0.005 USDC
assessment fee. It does not independently prove real-world authorization.

Project documentation: <https://github.com/razel369/intentfence>

Licensed under Apache-2.0.
