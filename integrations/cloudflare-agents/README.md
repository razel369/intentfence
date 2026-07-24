# IntentFence guard for Cloudflare Agents

Copy `intentfence-guard.ts` into a Cloudflare Agents project. Build the exact
action descriptor immediately before a consequential tool call, then pass the
caller-owned side effect as the callback:

```ts
import { guardCloudflareAgentAction } from "./intentfence-guard";

const result = await guardCloudflareAgentAction(
  {
    subject: `agent:${this.name}`,
    action: {
      type: "purchase",
      resource: "merchant://orders/42",
      protocol: "payment",
      method: "POST",
    },
    context: { currency: "USD", quoted_cost: 79 },
    policy: {
      allowed_action_types: ["purchase"],
      allowed_resources: ["merchant://orders/*"],
      max_cost: { amount: 100, currency: "USD" },
    },
  },
  () => this.payForOrder(),
);
```

The adapter recomputes the action digest, verifies the ES256 receipt, and fails
closed on denial, review, mismatch, malformed responses, or network failure. It
never receives wallet keys or downstream credentials.

For a generated runtime-specific pack with negative test vectors and a launch
checklist, call the x402-paid `POST /api/policy-packs` endpoint.
