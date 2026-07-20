---
name: inspect-x402-endpoints
description: Inspect a public x402 endpoint before an agent pays it. Use when an agent discovers an unfamiliar x402 URL, needs to confirm that a live route returns a valid PAYMENT-REQUIRED challenge, wants to enforce a maximum Base USDC price or recipient allowlist, or needs signed readiness evidence without paying the target resource.
---

# Inspect x402 Endpoints

Use IntentFence to make one bounded, credential-free request to a public HTTPS
route and validate its live x402 challenge. IntentFence never follows redirects,
forwards caller credentials, or pays the target.

## Collect the policy

Require one `target_url`. Default to `GET`; use `HEAD` or `POST` only when the
caller identifies the intended method. For `POST`, include only the public body
needed to elicit the payment challenge.

Ask for these optional limits when they matter:

- `max_price_usdc`: the largest target price the caller accepts.
- `allowed_payees`: the exact Base recipient addresses the caller already
  approved.

Never send a cookie, API key, bearer token, wallet signature, private key, or
seed phrase to the target or IntentFence. This check proves endpoint readiness
and policy fit at the observation time; it does not prove merchant identity,
authorization, delivery, or future behavior.

## Run the check

Prefer the MCP tool `intentfence_x402_readiness` at:

`https://agentpass-protocol.rmalka06.chatgpt.site/api/mcp`

Pass arguments such as:

```json
{
  "target_url": "https://merchant.example/api/paid-resource",
  "method": "GET",
  "max_price_usdc": "0.10",
  "allowed_payees": ["0x1111111111111111111111111111111111111111"]
}
```

The live check costs exactly 0.002 USDC on Base. Make the first call without a
payment to inspect IntentFence's own `PAYMENT-REQUIRED` response. Before a
wallet signs or an MCP client automatically retries, show the fee and obtain
the caller's explicit authorization. Cap the IntentFence payment at 2000 USDC
atomic units and preserve the input unchanged across the retry.

If no x402-capable signer is available, return the challenge and integration
guidance. Do not ask the caller to paste reusable wallet credentials.

## Use REST when MCP is unavailable

POST the same input to:

`https://agentpass-protocol.rmalka06.chatgpt.site/api/x402-readiness?utm_source=agent_skill&utm_medium=agent&utm_campaign=inspect_x402_endpoints`

For a caller who already has an authenticated Coinbase Agentic Wallet, verify
wallet status and balance first. After explicit payment authorization, use the
pinned buyer command with the same JSON body:

```bash
npx awal@2.12.1 status
npx awal@2.12.1 balance
npx awal@2.12.1 x402 pay \
  'https://agentpass-protocol.rmalka06.chatgpt.site/api/x402-readiness?utm_source=agent_skill&utm_medium=agent&utm_campaign=inspect_x402_endpoints' \
  -X POST -d '<READINESS_JSON>' --max-amount 2000 --json
```

Do not authenticate, fund, or pay from a caller's wallet without separate
authorization for those actions.

## Enforce the result

- `ready`: the live route returned a valid x402 challenge and every supplied
  automatic policy check passed.
- `ready_with_review`: the route is usable, but a missing or ambiguous policy
  condition needs review before paying it.
- `not_ready`: do not pay the target; surface the failed checks.

Accept a completed paid check only when the response includes the decision,
`live-x402-endpoint-readiness` signed receipt, and IntentFence settlement
evidence. The 0.002 USDC settlement pays IntentFence for the check; it is not a
payment to the inspected target.
