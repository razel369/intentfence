# ADR-0003: Use lifecycle events and continuous reconciliation

## Status

Accepted on 2026-07-17. Provider credential contracts remain open.

## Context

A payment firewall must answer more than whether a policy function returned
`allowed`. Operators need to know whether an approval was authentic, a permit
was consumed, a payment settled, and the downstream action completed.

The current paid route records a settlement audit on a best-effort basis after a
successful response. Logs or one audit row cannot reliably recover partial
failures, duplicated requests, lost responses, late settlement, or a discrepancy
between the evaluated intent and provider outcome.

## Decision

Use an append-only lifecycle event model backed by a durable relational store.
Persist each authoritative state transition and its outbox entry atomically.
Telemetry exporters and the reconciler consume the outbox asynchronously.

The canonical lifecycle is:

`received -> evaluated -> review_pending | denied | permitted ->`
`payment_submitted -> payment_settled | payment_failed ->`
`action_completed | action_failed`

Events carry bounded correlation identifiers and hashes rather than secrets or
full prompts. The reconciler compares four independent facts:

1. policy decision and immutable policy version;
2. approval grant and permit consumption;
3. service-fee and downstream payment settlement;
4. merchant or downstream action outcome.

Contradictions or missing facts create `reconciliation_mismatch`, trigger an
alert, and enter bounded provider-specific recovery. Compensation is never
assumed safe or automatic.

## Consequences

### Positive

- Lost responses and ambiguous provider timeouts can be recovered idempotently.
- Audit evidence has explicit provenance and lifecycle ordering.
- Provider health, approval latency, unit cost, and mismatch age become
  measurable.
- Outbox delivery can retry without blocking the payment request.

### Negative

- The event schema and state machine require versioning and migration discipline.
- Reconciliation workers, alerts, and runbooks add operational cost.
- Eventual reconciliation means some attempts remain temporarily `unknown`.

### Neutral

- OpenTelemetry or a specific monitoring vendor is an exporter choice, not the
  authoritative payment record.

## CDP and Bazaar credential dependency

The production Coinbase Developer Platform/Bazaar credential contract is
unresolved: account owner, secret type, scopes, environment promotion, rotation,
and production verification have not been established in the repository.

CDP payment adapters and credentialed Bazaar publication remain disabled until
those facts are confirmed and tested. Discovery credentials must be separate
from payment-execution credentials. Bazaar outage or stale indexing degrades
discovery only and must never bypass, broaden, or silently replace enforcement.
The existing PayAI path is a separate adapter and is not evidence that a CDP
credentialed path is ready.

## Trade-offs and failure modes

- **Durable events versus logs:** events cost more to operate but can drive
  recovery and prove ordering; logs cannot.
- **Asynchronous reconciliation versus fully synchronous verification:** async
  handling tolerates provider latency and chain finality, while the firewall
  still blocks when authoritative state is unknown.
- **Provider facts versus chain-only truth:** provider and merchant outcomes are
  needed because an on-chain transfer alone does not prove fulfillment.

If the lifecycle store or outbox cannot commit, the verified path does not expose
success. If settlement succeeds but the response or audit export is lost, the
reconciler recovers using idempotency and provider identifiers. If settlement
reverses or a chain reorganizes, reconciliation reopens the attempt and alerts.

## Alternatives considered

- **Application logs only:** rejected because logs are lossy and not a recovery
  state machine.
- **One mutable payment row:** rejected because overwrites obscure history and
  complicate incident reconstruction.
- **Synchronous provider polling before every response:** rejected because it
  couples availability and latency to every external system.
- **On-chain data as the only source of truth:** rejected because card, x402
  service fee, and downstream fulfillment have different facts and finality.

## References

- [Architecture overview](../README.md)
- [IntentFence protocol](../../PROTOCOL.md)
- [IntentFence security model](../../SECURITY.md)
