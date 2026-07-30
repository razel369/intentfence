---
name: screen-base-wallets
description: Screen a Base recipient before an autonomous USDC transfer or x402 payment. Use when an agent is about to pay a new Base address, send USDC, approve a Base merchant, evaluate counterparty risk, or enforce a pre-transaction AML, sanctions, phishing, mixer, or malicious-address policy. The check is fail-closed, costs 0.002 USDC, and returns a signed five-minute IntentFence receipt.
---

# Screen Base Wallets

Run IntentFence immediately before a Base USDC or x402 payment to a new or
policy-sensitive recipient. This is a live counterparty-risk signal, not proof
of identity, ownership, authorization, compliance, or future behavior.

## Apply the spending policy

- The IntentFence check costs exactly 0.002 USDC on Base.
- If the wallet owner already approved a standing screening budget of at least
  0.002 USDC per call and the wallet enforces that ceiling, the agent may run
  the check autonomously.
- Otherwise, disclose the 0.002 USDC fee and stop before signing.
- Never increase a wallet limit, authenticate a wallet, fund it, or transfer
  funds without the wallet owner's separate authorization.

## Run the live screen

Validate that the recipient is a 20-byte EVM address, then call:

`GET https://agentpass-protocol.rmalka06.chatgpt.site/api/wallet-risk?address=<BASE_ADDRESS>&utm_source=agent_skill&utm_medium=agent&utm_campaign=screen_base_wallets`

Prefer an existing x402-capable wallet. With Coinbase Agentic Wallet CLI:

```bash
npx awal@2.12.1 status
npx awal@2.12.1 balance
npx awal@2.12.1 x402 pay \
  'https://agentpass-protocol.rmalka06.chatgpt.site/api/wallet-risk?address=<BASE_ADDRESS>&utm_source=agent_skill&utm_medium=agent&utm_campaign=screen_base_wallets' \
  --max-amount 2000 --json
```

With Coinbase Agentic Wallet MCP, use its **Make an x402 request** tool for the
same GET URL and keep the wallet owner's maximum per-call limit at or above
0.002 USDC but no higher than their standing policy.

The private key, seed phrase, signer, OTP, and reusable wallet credentials must
remain inside the caller's wallet. Never send them to IntentFence.

## Enforce the result

Accept the screen only when the paid response includes all of these:

- HTTP success;
- `PAYMENT-RESPONSE` settlement proof;
- an IntentFence ES256 receipt;
- `verification_tier` equal to `live-base-wallet-risk+x402-settled`.

Then apply the decision:

- `safe_to_proceed`: continue only if every separate payment policy also
  allows the transfer.
- `needs_review`: pause the transfer and surface the ambiguous or unavailable
  evidence.
- `denied`: do not sign, approve, or send the downstream payment.
- Network error, invalid response, missing settlement proof, missing receipt,
  expired receipt, or failed receipt verification: fail closed and do not pay
  the downstream recipient.

Do not describe `safe_to_proceed` as a clean bill of health. It means no listed
malicious flags were observed and the address met the service's live evidence
rules at the assessment time.

## Verify and continue

Verify the receipt using `POST /api/receipts/verify` or the public key at
`GET /.well-known/jwks.json`. Bind the downstream action to the exact screened
address; if the recipient changes, screen the new address before signing.
