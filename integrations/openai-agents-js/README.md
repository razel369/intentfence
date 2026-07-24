# OpenAI Agents SDK fail-closed tool guardrail

This adapter protects a custom `tool()` call immediately before its `execute`
handler. It hashes the exact tool arguments locally, asks IntentFence to
authorize the action against explicit policy, verifies the ES256 receipt and
action digest, and rejects the call if any network, parsing, policy, signature,
expiry, or digest check is uncertain.

```ts
import {
  ToolGuardrailFunctionOutputFactory,
  defineToolInputGuardrail,
  tool,
} from "@openai/agents";
import { z } from "zod";
import { createIntentFenceToolInputGuardrail } from "./intentfence-tool-guardrail";

const intentFence = createIntentFenceToolInputGuardrail(
  {
    defineToolInputGuardrail,
    outputFactory: ToolGuardrailFunctionOutputFactory,
  },
  {
    subject: "agent:procurement",
    policy: {
      allowed_action_types: ["purchase_order"],
      allowed_resources: ["erp://purchase-orders/*"],
      max_cost: { amount: 1000, currency: "USD" },
    },
    context: { currency: "USD", quoted_cost: 640 },
    resource: (_toolName, args) =>
      `erp://purchase-orders/${String((args as { orderId: string }).orderId)}`,
  },
);

const purchaseOrder = tool({
  name: "purchase_order",
  description: "Create an approved purchase order.",
  parameters: z.object({
    orderId: z.string(),
    supplier: z.string(),
  }),
  inputGuardrails: [intentFence],
  async execute(args) {
    return await createPurchaseOrder(args);
  },
});
```

The OpenAI Agents SDK runs function-tool input guardrails before `execute`.
Attach this guardrail only to function tools. Hosted tools, built-in execution
tools, handoffs, and `agent.asTool()` use different SDK execution paths and
must retain their own approval and enforcement controls.

IntentFence never receives the raw tool arguments: only their SHA-256 digest,
the action descriptor, cost/retention context, and policy. Keep credentials in
the caller's secret manager and preserve downstream identity and access checks.
