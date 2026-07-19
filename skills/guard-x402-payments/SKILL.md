---
name: guard-x402-payments
description: Guard an autonomous agent's x402 payment with the live IntentFence service before it signs. Use when an agent receives a PAYMENT-REQUIRED challenge, is about to pay an x402 endpoint, needs to enforce a USDC price ceiling or payee allowlist, or needs signed evidence that an exact Base USDC quote was checked. Also use for a free declared-action policy preview when no x402 challenge exists.
---

# Guard x402 Payments

Use the live IntentFence service to inspect the exact x402 quote the caller
observed. Keep signing keys local and treat the result as policy evidence, not
as permission to spend.

## Choose the check

- For a real x402 quote, use the paid exact-quote assessment. It costs 0.005
  USDC on Base per successful assessment.
- For a declared action without a `PAYMENT-REQUIRED` challenge, use the free,
  unsigned preview. Do not describe a preview as verified or settled.
- If the caller has not authorized the 0.005 USDC assessment fee, show the fee
  and stop before signing or submitting payment.

## Assess an exact quote

1. Make the intended request without payment and capture the complete base64
   `PAYMENT-REQUIRED` header, exact target URL, and HTTP method.
2. Define `policy.max_price_usdc`. Add every approved merchant address to
   `policy.allowed_payees`; without an explicit matching payee, a quote cannot
   receive `safe_to_proceed`.
3. Call the MCP tool `intentfence_x402_assessment` at
   `https://agentpass-protocol.rmalka06.chatgpt.site/api/mcp`, or POST the same
   input to
   `https://agentpass-protocol.rmalka06.chatgpt.site/api/x402-assessments?utm_source=agent_skill&utm_medium=agent&utm_campaign=guard_x402_payments`:

```json
{
  "subject": "agent:buyer-07",
  "target_url": "https://merchant.example/paid-resource",
  "method": "GET",
  "payment_required": "BASE64_PAYMENT_REQUIRED_HEADER",
  "policy": {
    "max_price_usdc": "0.10",
    "allowed_payees": ["0x1111111111111111111111111111111111111111"]
  }
}
```

4. Expect IntentFence's own x402 challenge. Have the caller's x402 client sign
   it locally only after fee authorization, then retry the unchanged request
   with `PAYMENT-SIGNATURE` or the MCP payment metadata required by that client.
5. Accept a completed assessment only when the response is successful and
   includes the decision, signed receipt, and x402 settlement evidence. The
   service fee settlement does not prove that the merchant was paid or that it
   will deliver.

### Use Coinbase Agentic Wallet when available

If the caller already uses an authenticated Agentic Wallet CLI, check its
status and balance, then cap the IntentFence call at exactly 5000 USDC atomic
units:

```bash
npx awal@latest status
npx awal@latest balance
npx awal@latest x402 pay \
  'https://agentpass-protocol.rmalka06.chatgpt.site/api/x402-assessments?utm_source=agent_skill&utm_medium=agent&utm_campaign=guard_x402_payments' \
  -X POST -d '<ASSESSMENT_JSON>' --max-amount 5000 --json
```

Do not authenticate, fund a wallet, or run the paid command on the caller's
behalf unless they explicitly authorize those actions. With another x402
client, apply the same 0.005 USDC maximum and preserve the request body across
the payment retry.

Never send a private key, seed phrase, raw signer, or reusable wallet
credential to IntentFence. If no compatible x402 signer is available, return
integration guidance instead of requesting secret material.

## Enforce the result

- `safe_to_proceed`: confirm the caller already authorized the downstream
  merchant payment, then let the caller's own wallet sign the original quote.
- `needs_review`: pause the downstream payment and surface the failed or
  ambiguous checks.
- `denied`: do not sign or retry the downstream payment.

Do not reinterpret `safe_to_proceed` as merchant identity, reputation,
delivery, or legal approval. IntentFence validates quote integrity, Base USDC
payment fields, price, caller-approved payee, transfer rules, extensions, and
resource binding.

## Run a free preview

POST declared policy data to
`https://agentpass-protocol.rmalka06.chatgpt.site/api/preflight?utm_source=agent_skill&utm_medium=agent&utm_campaign=guard_x402_payments`:

```json
{
  "subject": "did:web:my-agent",
  "action": { "type": "purchase", "resource": "order-42" },
  "constraints": {
    "cost_ceiling": 100,
    "quoted_cost": 79,
    "data_retention_hours": 24
  }
}
```

Use the machine-readable contract at
`https://agentpass-protocol.rmalka06.chatgpt.site/openapi.json` when generating
client code. Verify signed receipts with `POST /api/receipts/verify` or the
public keys at `GET /.well-known/jwks.json`.
