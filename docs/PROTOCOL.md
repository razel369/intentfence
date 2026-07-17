# IntentFence Protocol 0.7

IntentFence is a declared-input policy gate. It evaluates the subject, action,
cost, data-retention, and approval constraints supplied by a caller and returns
`safe_to_proceed`, `needs_review`, or `denied`.

The 0.6 quote-assessment receipt adds evidence from the exact x402 challenge a
caller observed. The caller supplies `subject`, `target_url`, an optional
`method` (`GET`, `HEAD`, or `POST`), the base64 `payment_required` header (up to
16 KiB), and a policy with `max_price_usdc` and optional `allowed_payees`.
IntentFence checks x402 v2, exact scheme, Base mainnet, canonical Base USDC,
price, payee, and exact resource-URL binding. It never fetches or pays the
target resource.

## Interfaces

- REST preview: `POST /api/preflight`
- x402 paid decision: `POST /api/preflight/verified`
- x402 paid caller-observed quote assessment: `POST /api/x402-assessments`
- Receipt verification: `POST /api/receipts/verify`
- MCP Streamable HTTP: `/api/mcp`
- A2A HTTP+JSON base URL: `/a2a`

## Signed receipts

Successful paid decisions include a compact JWS signed with ES256. The public
key is published at `/.well-known/jwks.json`; the claims schema is published at
`/protocol/receipt.schema.json`. Receipts expire after 24 hours and bind the
decision, declared inputs or caller-observed challenge evidence, checks, and expected
IntentFence service-fee payment terms.

Policy JWS receipts attest that IntentFence evaluated declared inputs.
Quote-assessment JWS receipts additionally bind the target URL hash, target
origin and path, assessment time, and SHA-256 hash of the exact supplied
payment requirement. Their assurance is
`caller-observed-x402-quote-assessment` and their verification tier is
`x402-quote-assessment+x402-settled`. A `safe_to_proceed` decision requires an
explicit `allowed_payees` entry matching the quote; omitting the allowlist
produces `needs_review`. Every advertised payment option must pass every
automatic check; mixed safe and unsafe option sets are denied. The receipts do
not prove that IntentFence contacted
the target, or prove merchant identity or delivery. The
`PAYMENT-RESPONSE` HTTP header separately carries the facilitator's x402
settlement result. Neither signal proves a person's identity or the caller's
authority to perform a consequential action.

## Integration rule

For an x402 merchant, first make the intended unpaid request, then
send the returned `PAYMENT-REQUIRED` challenge to the quote-assessment endpoint
immediately before signing the target payment. IntentFence validates and signs
the exact caller-observed challenge, then settles its 0.005 USDC assessment fee;
it does not make the target request. For other consequential actions, call the
declared-input preflight immediately before the tool invocation. Block on
`denied`. By default, also block on `needs_review` or route it to human/policy
review. Always enforce independent authorization at the target service.
