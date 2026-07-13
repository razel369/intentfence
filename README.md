# AgentPass

AgentPass is a public, machine-callable preflight layer for autonomous AI
actions. It evaluates declared identity, scope, cost, data-retention, and
human-approval constraints before a tool call and returns one of:

- `safe_to_proceed`
- `needs_review`
- `denied`

Production: <https://agentpass-protocol.rmalka06.chatgpt.site>

## Protocol surfaces

| Surface | Endpoint |
| --- | --- |
| Free REST preview | `POST /api/preflight` |
| Paid x402 decision | `POST /api/preflight/verified` |
| Receipt verification | `POST /api/receipts/verify` |
| Public ES256 keys | `GET /.well-known/jwks.json` |
| MCP Streamable HTTP | `/mcp` |
| A2A Agent Card | `GET /.well-known/agent-card.json` |
| OpenAPI | `GET /openapi.json` |

The paid endpoint costs 0.05 USDC on Base through x402. A successful call
returns both the facilitator's `PAYMENT-RESPONSE` settlement header and an
AgentPass ES256 compact-JWS receipt.

## Important trust boundary

AgentPass 0.4 attests that it evaluated the inputs supplied by the caller. It
does not independently prove real-world identity, authorization, or downstream
enforcement. The receipt-signing key is separate from the USDC recipient wallet.
AgentPass never needs a payer's seed phrase or wallet private key.

## Local development

```bash
npm install
npm run dev
```

The production signing key is stored in Sites as the secret
`AGENTPASS_SIGNING_PRIVATE_JWK`. Generate a separate development key with:

```bash
node scripts/generate-signing-key.mjs /secure/path/agentpass-private-jwk.json
```

Never commit the generated private JWK. Publish only its public coordinates in
`/.well-known/jwks.json`.

## Validation

```bash
npm run test
npm run lint
npx tsc --noEmit
npm run sdk:check
npm run smoke:protocol -- http://localhost:3000
```

Set `AGENTPASS_TEST_PRIVATE_JWK_PATH` only for a local smoke test that should
exercise the signed-receipt verifier.

## Distribution

Draft TypeScript and Python SDKs live in `sdk/`. A remote-server metadata
template for the official MCP Registry is in
`distribution/mcp-server.template.json`. Publishing those artifacts requires a
verified npm/PyPI namespace and a verified MCP Registry namespace; no external
registry publication is performed by the build.

See [docs/PROTOCOL.md](docs/PROTOCOL.md) and
[docs/SECURITY.md](docs/SECURITY.md) for the protocol and security model.
