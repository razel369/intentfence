# IntentFence TypeScript SDK

```ts
import { IntentFenceClient } from "intentfence";

const intentFence = new IntentFenceClient({
  // For paid calls, inject a fetch implementation wrapped by your x402 wallet client.
  fetch,
});
const guard = intentFence.guard({ paid: false, blockOnReview: true });

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
own wallet environment.
