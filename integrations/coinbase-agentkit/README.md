# IntentFence checkout for Coinbase AgentKit

This adapter lets an existing Coinbase AgentKit EVM wallet buy one signed
IntentFence preflight for exactly `0.005 USDC` on Base mainnet.

It deliberately does not use AgentKit's automatic `make_http_request_with_x402`
action. Before signing, the adapter pins the complete x402 quote to the live
IntentFence URL, Base mainnet, canonical Base USDC contract, `5000` atomic
units, and the published IntentFence recipient. It then calls an authorization
function owned by the buyer.

Install the verified dependency versions:

```sh
npm install @coinbase/agentkit@0.10.4 @x402/core@2.18.0 @x402/evm@2.18.0
```

Copy `intentfence-checkout.ts` into an AgentKit project, then call it with the
project's existing `EvmWalletProvider`:

```ts
import { payIntentFenceWithAgentKit } from "./intentfence-checkout.js";

const response = await payIntentFenceWithAgentKit(
  walletProvider,
  {
    subject: "agent:checkout-demo",
    action: { type: "purchase", resource: "order-42" },
    constraints: {
      currency: "USD",
      cost_ceiling: 100,
      quoted_cost: 79,
      data_retention_hours: 24,
      human_approval: "not_required",
    },
  },
  async quote => {
    // Replace this with the application's human approval or pre-approved policy.
    console.log("Authorize real IntentFence charge:", quote);
    return false; // Payment-disabled until the buyer wires an approval decision.
  },
);

console.log(await response.json());
```

Returning `true` authorizes a real USDC charge. Never hard-code `true` unless
the exact charge has already been approved by a policy or person. The adapter
does not receive private keys; signing stays inside the supplied wallet.
