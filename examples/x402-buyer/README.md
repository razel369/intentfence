# IntentFence x402 buyer example

This isolated example uses the official `@x402/fetch`, `@x402/evm`, and
`viem` packages to call IntentFence's paid quote-assessment endpoint.

It is deliberately safe by default:

- `npm run dry-run` makes an unpaid request and expects HTTP `402`; it refuses
  payment environment variables and has no path to the signer.
- It decodes and verifies every advertised payment option before any signer is
  created: x402 v2, `exact`, Base mainnet, canonical Base USDC, exactly
  `0.005 USDC`, the IntentFence recipient, timeout, and exact resource URL.
- Payment requires both a valid `EVM_PRIVATE_KEY` and the exact
  `CONFIRM_PAYMENT` phrase.
- The official x402 client's `onBeforePaymentCreation` hook verifies the fresh
  challenge again immediately before signing. A changed amount, payee, asset,
  network, scheme, timeout, or URL aborts payment.
- The private key and payment signature are never printed.

## Dry-run — no payment

```bash
cd examples/x402-buyer
npm install
npm run dry-run
```

With no custom merchant challenge, the script uses the valid documentation
example from the live OpenAPI document. The unpaid probe is tagged `synthetic`
so it is excluded from IntentFence's conversion telemetry.

Expected result:

```text
Dry-run passed. No payment was created or signed:
{
  "x402_version": 2,
  "network": "eip155:8453",
  "amount_atomic": "5000"
}
Payment remains disabled...
```

Run the complete check with:

```bash
npm test
```

## Deliberately enable a real payment

This spends **0.005 USDC on Base mainnet**. Use a dedicated, low-value wallet.
Merely setting `EVM_PRIVATE_KEY` does not enable payment.

PowerShell:

```powershell
$env:EVM_PRIVATE_KEY = "0xYOUR_32_BYTE_PRIVATE_KEY"
$env:CONFIRM_PAYMENT = "YES_SPEND_0.005_USDC_ON_BASE_MAINNET"
npm run pay
```

POSIX shell:

```bash
EVM_PRIVATE_KEY=0xYOUR_32_BYTE_PRIVATE_KEY \
CONFIRM_PAYMENT=YES_SPEND_0.005_USDC_ON_BASE_MAINNET \
npm run pay
```

The script first completes the unpaid verification. Only then does it create
the signer, make a fresh x402 request, re-check that fresh challenge in
`onBeforePaymentCreation`, sign, and retry. Success also requires a
`PAYMENT-RESPONSE` with `success: true`, a Base transaction identifier, and a
signed receipt that passes the live receipt-verification endpoint.

## Assess a real merchant challenge

Provide the exact `PAYMENT-REQUIRED` header observed from the target merchant.
These variables work in both dry-run and paid modes:

```text
TARGET_URL=https://merchant.example/api/paid-resource
TARGET_METHOD=GET
TARGET_PAYMENT_REQUIRED=BASE64_PAYMENT_REQUIRED_HEADER_FROM_THE_MERCHANT
MAX_PRICE_USDC=0.10
ALLOWED_PAYEES=0x1111111111111111111111111111111111111111
SUBJECT=agent:my-buyer
```

`ALLOWED_PAYEES` may contain comma-separated EVM addresses. The script requires
an explicit payee allowlist for custom requests; IntentFence does not establish
merchant identity or decide which addresses you should trust.

## Important boundaries

- The Base wallet must already hold sufficient USDC.
- This example pays IntentFence's assessment fee, not the downstream merchant.
- The assessment checks the caller-observed quote against caller-supplied
  policy. It does not prove merchant identity, delivery, or downstream payment.
- Never commit `.env`, a private key, or a reusable payment payload.

Official references:

- [x402 buyer quickstart](https://docs.x402.org/getting-started/quickstart-for-buyers)
- [x402 TypeScript fetch client](https://github.com/x402-foundation/x402/tree/main/examples/typescript/clients/fetch)
