# IntentFence TypeScript SDK

The npm package is not public yet. Install the SDK from this repository until
the first npm release is completed:

```bash
git clone https://github.com/razel369/intentfence.git
npm install ./intentfence/sdk/typescript
```

```ts
import { IntentFenceClient } from "intentfence";

const intentFence = new IntentFenceClient({
  // For paid calls, inject a fetch implementation wrapped by your x402 wallet client.
  fetch,
});
const guard = intentFence.guard({ paid: false, blockOnReview: true });

const assessment = await intentFence.assessX402({
  subject: "agent:buyer-07",
  target_url: "https://merchant.example/api/paid-resource",
  method: "GET",
  payment_required: base64PaymentRequiredFromTarget,
  policy: {
    max_price_usdc: "0.10",
    allowed_payees: ["0x1111111111111111111111111111111111111111"],
  },
});

const result = await guard(
  {
    subject: "did:web:my-agent",
    action: { type: "purchase", resource: "order-42" },
    constraints: { cost_ceiling: 100, quoted_cost: 79 },
  },
  () => purchaseOrder("order-42"),
);
```

IntentFence does not need your wallet private key. For paid calls, the injected
`fetch` implementation should handle the x402 challenge and sign in the payer's
own wallet environment. `assessX402` also accepts an already encoded
`paymentSignature` option for clients that handle the two-step x402 exchange.

The assessment accepts the exact base64 `PAYMENT-REQUIRED` header observed by
the caller, up to 16 KiB. `method` is optional and may be `GET`, `HEAD`, or
`POST`. A `safe_to_proceed` decision requires an explicit matching
`allowed_payees` entry; omitting the allowlist yields `needs_review`.
Every advertised payment option must pass every automatic check; mixed option
sets fail closed. IntentFence never fetches or pays the target. It validates and SHA-256-binds the
supplied challenge, returns assurance `caller-observed-x402-quote-assessment`
with verification tier `x402-quote-assessment+x402-settled`, and settles only
the 0.005 USDC IntentFence assessment fee.
