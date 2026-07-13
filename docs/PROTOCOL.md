# IntentFence Protocol Core 0.5

IntentFence is a declared-input policy gate. It evaluates the subject, action,
cost, data-retention, and approval constraints supplied by a caller and returns
`safe_to_proceed`, `needs_review`, or `denied`.

## Interfaces

- REST preview: `POST /api/preflight`
- x402 paid decision: `POST /api/preflight/verified`
- Receipt verification: `POST /api/receipts/verify`
- MCP Streamable HTTP: `/mcp`
- A2A HTTP+JSON base URL: `/a2a`

## Signed receipts

Successful paid decisions include a compact JWS signed with ES256. The public
key is published at `/.well-known/jwks.json`; the claims schema is published at
`/protocol/receipt.schema.json`. Receipts expire after 24 hours and bind the
decision, declared inputs, checks, and expected x402 payment terms.

The JWS attests that IntentFence evaluated those declared inputs. The
`PAYMENT-RESPONSE` HTTP header separately carries the facilitator's x402
settlement result. Neither signal proves a person's identity or the caller's
authority to perform a consequential action.

## Integration rule

Call IntentFence immediately before a tool invocation. Block on `denied`. By
default, also block on `needs_review` or route it to human/policy review.
Always enforce independent authorization at the target service.
