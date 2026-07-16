# ADR-0002: Separate free preview from verified enforcement

## Status

Accepted on 2026-07-17. Target enforcement is not yet fully implemented.

## Context

The free and paid endpoints currently share the deterministic evaluator. The
free path is unsigned. The paid x402 path proves settlement of the IntentFence
service fee and signs the declared-input decision, but payment for a decision is
not proof of caller identity, human approval, or downstream enforcement.

Conflating preview, paid verification, and execution authority would let an
integrator treat a successful receipt as permission that it does not provide.

## Decision

Maintain two explicit assurance classes:

1. **Preview:** free, unsigned, stateless, and non-authoritative. It helps a
   developer test inputs and policy behavior but can never mint an execution
   permit.
2. **Verified enforcement:** authenticated, policy-versioned, durably recorded,
   and fail-closed. It may mint a short-lived single-use permit only after all
   required grants are validated.

The current paid x402 response remains a **settled signed evaluation** until the
verified enforcement requirements are implemented. A service-fee settlement or
ES256 receipt alone must not be labeled an enforced payment authorization.

An executable permit binds subject, canonical intent hash, policy version,
adapter and audience, approval reference, nonce, issued time, and expiry. The
trusted adapter consumes it atomically. Receipts remain portable evidence and
cannot be consumed as permits.

## Consequences

### Positive

- Developers retain a zero-friction integration path.
- Production callers can distinguish policy feedback from execution authority.
- Preview can remain available when the enforcement store or signer is down.
- Separate credential and data boundaries reduce accidental privilege leakage.

### Negative

- Two assurance classes require explicit schemas, SDK types, documentation, and
  tests.
- Verified enforcement has higher latency and operational cost.
- Fail-closed behavior can delay legitimate payments.

### Neutral

- The same pure evaluator can serve both paths if authoritative context is added
  only in the enforcement plane.

## Trade-offs and failure modes

- A preview replayed as authorization is rejected because it has no permit type,
  signature audience, nonce, or store record.
- Caller text such as `human_approval` is never accepted as a grant; the approval
  service signs and binds the grant to one intent.
- If identity, policy, signing, or durable storage is unavailable, verified
  execution returns a retryable error before a permit is issued.
- If a client loses the response after service-fee settlement, idempotency and
  reconciliation recover the existing outcome rather than charging twice.
- If a permit is issued but the provider remains unavailable, it expires without
  implicit recreation; a new attempt requires policy re-evaluation.

## Alternatives considered

- **One endpoint with a `verified` flag:** rejected because clients can easily
  mishandle assurance and caching semantics.
- **Make every request paid:** rejected because it raises integration friction
  without increasing enforcement.
- **Treat the x402 settlement as authorization:** rejected because it proves
  payment to IntentFence, not authority to perform the downstream payment.
- **Rely on an SDK wrapper:** rejected as the trust boundary because an
  integrator or compromised agent can bypass it.

## References

- [Architecture overview](../README.md)
- [IntentFence protocol](../../PROTOCOL.md)
- [IntentFence security model](../../SECURITY.md)
