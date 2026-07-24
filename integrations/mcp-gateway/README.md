# IntentFence guard for an MCP gateway

Call `guardMcpToolCall` immediately before forwarding a consequential
`tools/call` request to a downstream MCP server:

```ts
await guardMcpToolCall(
  "agent:operations-07",
  {
    server: "payments.internal",
    name: "transfer_usdc",
    arguments: { recipient, amount },
  },
  {
    allowed_action_types: ["transfer_usdc"],
    allowed_resources: ["mcp://payments.internal/tools/*"],
    max_cost: { amount: 100, currency: "USD" },
  },
  { currency: "USD", quoted_cost: amount },
  () => downstreamMcp.callTool("transfer_usdc", { recipient, amount }),
);
```

The adapter hashes the tool arguments, binds them to the action receipt, and
fails closed before the gateway forwards the request. Existing MCP OAuth,
identity, and server-side authorization remain mandatory.
