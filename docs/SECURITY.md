# AgentPass security model

## Trust boundaries

- AgentPass treats all caller-provided identity, proofs, prices, and constraints
  as declarations unless an explicit external verifier is named.
- The receipt signing key is separate from the USDC recipient wallet and is
  stored only as a production secret.
- AgentPass never requests or receives a payer wallet seed phrase or private key.
- x402 payment settlement and AgentPass receipt signing are independent signals.

## Controls in 0.4

- 16 KiB request limits for preflight, MCP, and A2A inputs.
- Strict field bounds and finite-number validation.
- MCP `Origin` validation, protocol-version handling, and stateless transport.
- ES256 algorithm and key-id pinning; 24-hour receipt lifetime.
- Public offline-verifiable JWKS plus a bounded verification endpoint.
- Failed validation or signing returns an HTTP error before x402 settlement.

## Not yet provided

The current service does not verify real-world identity, independently validate
authorization grants, or guarantee that a downstream service enforced a
decision. Those are separate high-assurance integrations.
