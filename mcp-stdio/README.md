# IntentFence MCP

IntentFence is a payment firewall for autonomous AI agents. The MCP server
checks declared identity, scope, spend, data-retention, and human-approval
constraints immediately before an agent performs a consequential payment.

## Run

```bash
npx -y @razel369/intentfence-mcp@0.6.0
```

Example MCP client configuration:

```json
{
  "mcpServers": {
    "intentfence": {
      "command": "npx",
      "args": ["-y", "@razel369/intentfence-mcp@0.6.0"]
    }
  }
}
```

The server exposes two tools:

- `intentfence_preflight` is a free, unsigned declared-input preview.
- `intentfence_verified_preflight` returns a standard x402 challenge for 0.005
  USDC on Base, then forwards the signed payment and returns the remote ES256
  receipt plus settlement metadata.

The server never receives a seed phrase or private key and does not execute the
downstream payment. It does not independently prove real-world authorization.

Project documentation: <https://github.com/razel369/intentfence>

Licensed under Apache-2.0.
