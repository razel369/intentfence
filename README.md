# IntentFence

IntentFence is an open spend and action policy gate for autonomous AI. Put it
immediately before a tool call, evaluate declared scope, cost, data-retention,
and approval constraints, and run the downstream action only when the decision
allows it:

- `safe_to_proceed`
- `needs_review`
- `denied`

Production: <https://agentpass-protocol.rmalka06.chatgpt.site>

[![razel369/intentfence MCP server](https://glama.ai/mcp/servers/razel369/intentfence/badges/score.svg)](https://glama.ai/mcp/servers/razel369/intentfence)

## Protocol surfaces

| Surface | Endpoint |
| --- | --- |
| Free REST preview | `POST /api/preflight` |
| Paid x402 decision | `POST /api/preflight/verified` |
| Receipt verification | `POST /api/receipts/verify` |
| Public ES256 keys | `GET /.well-known/jwks.json` |
| MCP Streamable HTTP | `/mcp` |
| A2A Agent Card | `GET /.well-known/agent-card.json` |
| x402 service manifest | `GET /.well-known/x402` |
| OpenAPI | `GET /openapi.json` |

The paid endpoint costs 0.05 USDC on Base through x402. A successful call
returns both the facilitator's `PAYMENT-RESPONSE` settlement header and an
IntentFence ES256 compact-JWS receipt.

For teams that need a guarded production workflow, the launch pilot is $750
plus $149/month and includes hands-on integration of one agent action. The
Production plan starts at $499/month.

## Important trust boundary

IntentFence 0.5 attests that it evaluated the inputs supplied by the caller. It
does not independently prove real-world identity, authorization, or downstream
enforcement. The receipt-signing key is separate from the USDC recipient wallet.
IntentFence never needs a payer's seed phrase or wallet private key.

## Local development

```bash
npm install
npm run dev
```

For MCP clients that launch local `stdio` servers, use `npm run mcp:stdio`.
Glama and other container-based hosts can build the root `Dockerfile`; it starts
the same IntentFence policy engine and responds to MCP initialization,
`tools/list`, and `tools/call` requests over standard input/output.

```bash
docker build -t intentfence-mcp .
docker run --rm -i intentfence-mcp
```

The production signing key is stored in Sites as the secret
`INTENTFENCE_SIGNING_PRIVATE_JWK`. Generate a separate development key with:

```bash
node scripts/generate-signing-key.mjs /secure/path/intentfence-private-jwk.json
```

Never commit the generated private JWK. Publish only its public coordinates in
`/.well-known/jwks.json`.

## Validation

```bash
npm run test
npm run lint
npx tsc --noEmit
npm run sdk:check
npm run smoke:mcp:docker
npm run smoke:mcp:stdio
npm run smoke:protocol -- http://localhost:3000
```

Set `INTENTFENCE_TEST_PRIVATE_JWK_PATH` only for a local smoke test that should
exercise the signed-receipt verifier.

## Distribution

TypeScript and Python SDKs live in `sdk/`. The root `server.json` is ready for
the official MCP Registry under `io.github.razel369/intentfence`; the public MCP
endpoint uses Streamable HTTP and requires no API key.

The `/.well-known/x402` service manifest and Bazaar metadata make the paid
endpoint crawlable by x402 indexes and autonomous tool routers.

## Commercial pilot

The fastest path to production is one guarded action: purchase, transfer,
booking, deployment, deletion, or another consequential tool call. Submit the
pilot form on the production site with the real action and its policy boundary.

See [docs/PROTOCOL.md](docs/PROTOCOL.md) and
[docs/SECURITY.md](docs/SECURITY.md) for the protocol and security model.
