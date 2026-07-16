# ADR-0001: Focus on a provider-neutral payment firewall

## Status

Accepted on 2026-07-17.

## Context

IntentFence currently evaluates caller-declared spend, scope, retention, and
approval fields. Wallet providers and agent runtimes already offer inexpensive
policy checks and approval primitives, so a general "trust protocol" or signed
decision alone has a weak, difficult-to-measure return on investment.

Teams allowing agents to spend real funds have a narrower operational job:
prevent an out-of-policy payment, route only exceptions to a human, and explain
the complete outcome afterward across payment providers.

## Decision

Build the first commercial architecture as a provider-neutral payment firewall.
It guards payment attempts immediately before execution, evaluates a canonical
payment intent, obtains a real approval when required, and gives a trusted
provider adapter a short-lived single-use permit.

The initial scope is money movement through selected wallet, x402, and card
adapters. General file, deployment, messaging, and MCP governance remain outside
the first product boundary unless required by a paying design partner.

IntentFence will not take custody of payer private keys. Adapters use narrowly
scoped provider credentials or caller-controlled signing mechanisms.

## Consequences

### Positive

- Value can be measured as protected payment attempts and loss avoided.
- One policy and audit model can span multiple payment rails.
- Enforcement and reconciliation differentiate the product from a signed
  advisory response.
- The scope is small enough for a modular-monolith implementation.

### Negative

- Each payment provider needs an adapter, conformance tests, and operational
  ownership.
- Strong enforcement requires integration into the real execution path and
  cannot be delivered by documentation or an optional SDK call alone.
- Provider outages and ambiguous settlements become IntentFence operational
  concerns.

### Neutral

- Broader MCP governance can remain a distribution surface without becoming the
  initial billable product.

## Trade-offs and failure modes

Provider neutrality is prioritized over the lower engineering cost of supporting
one wallet. A trusted adapter is prioritized over easier but bypassable client
advice. If an adapter is unavailable, under-scoped, or cannot determine payment
state, the firewall fails closed and reconciliation owns the unresolved attempt.

Adapter parameter drift could cause the evaluated intent to differ from the
submitted payment. The canonical intent hash, adapter conformance suite, and
permit parameter binding are therefore mandatory.

## Alternatives considered

- **General trust protocol:** rejected as the first wedge because value and
  enforcement are too diffuse.
- **Signed receipt service only:** rejected because evidence of evaluation does
  not stop a payment.
- **Single wallet policy plugin:** simpler, but duplicates provider-native rules
  and creates provider lock-in.
- **Full enterprise MCP gateway:** potentially valuable, but requires a
  sales-led security/compliance product before customer evidence justifies it.

## References

- [Architecture overview](../README.md)
- [IntentFence protocol](../../PROTOCOL.md)
- [IntentFence security model](../../SECURITY.md)
