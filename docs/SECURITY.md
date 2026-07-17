# IntentFence security model

## Trust boundaries

- IntentFence treats all caller-provided identity, proofs, prices, and constraints
  as declarations unless an explicit external verifier is named.
- The receipt signing key is separate from the USDC recipient wallet and is
  stored only as a production secret.
- IntentFence never requests or receives a payer wallet seed phrase or private key.
- x402 payment settlement and IntentFence receipt signing are independent signals.

## Controls in 0.7

- Bounded request sizes for preflight, MCP, A2A, and quote-assessment inputs.
- Strict field bounds and finite-number validation.
- MCP `Origin` validation, protocol-version handling, and stateless transport.
- ES256 algorithm and key-id pinning; five-minute quote-assessment receipts
  and 24-hour declared-policy receipts.
- Public offline-verifiable JWKS plus a bounded verification endpoint.
- Failed validation or signing returns an HTTP error before x402 settlement.
- x402 quote assessments accept a base64 `payment_required` value no larger
  than 16 KiB and validate it as the exact caller-observed x402 v2 challenge.
- The official x402 schema is applied before classification. Canonical Base
  USDC must declare the expected `USD Coin` / `2` EIP-712 domain; Permit2,
  unknown transfer metadata, and active or unknown extensions cannot receive
  `safe_to_proceed` without review.
- A `safe_to_proceed` result requires an explicit `allowed_payees` entry that
  matches the quote. If the list is omitted, the result is `needs_review`.
- Every advertised payment option must pass every automatic check. Mixed
  compliant and unsafe option sets fail closed.
- After facilitator verification, D1 atomically reserves each EIP-3009
  `payer + nonce` authorization before assessment signing. Concurrent replay
  is rejected and failed or unsettled attempts release the reservation.
- The service never fetches or pays the target. It signs SHA-256 bindings for
  the full target URL and exact supplied payment requirement, then settles the
  0.005 USDC IntentFence assessment fee.

## Not yet provided

The service does not verify real-world identity, independently validate
authorization grants, prove target ownership or delivery, establish that the
caller received the challenge from the claimed target, or guarantee that a
downstream service enforced a decision. A quote assessment is a signed
evaluation of caller-supplied challenge bytes, not a merchant certification.
Callers should obtain the challenge immediately before assessment and compare
the current target challenge before signing a downstream payment. Those are
separate high-assurance integrations.
