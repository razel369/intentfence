# IntentFence

IntentFence is a payment firewall for autonomous AI agents. Put it immediately
before a payment tool call, evaluate declared merchant/purpose, cost,
data-retention, and approval constraints, and run the downstream action only
when the decision allows it:

- `safe_to_proceed`
- `needs_review`
- `denied`

Production: <https://agentpass-protocol.rmalka06.chatgpt.site>

x402scan: <https://www.x402scan.com/server/c495c104-dba4-4764-86b1-96b8b0cda48b>

[![razel369/intentfence MCP server](https://glama.ai/mcp/servers/razel369/intentfence/badges/score.svg)](https://glama.ai/mcp/servers/razel369/intentfence)

## Protocol surfaces

| Surface | Endpoint |
| --- | --- |
| Free REST preview | `POST /api/preflight` |
| Paid x402 decision | `POST /api/preflight/verified` |
| Receipt verification | `POST /api/receipts/verify` |
| Public ES256 keys | `GET /.well-known/jwks.json` |
| MCP Streamable HTTP | `/mcp` (`intentfence_verified_preflight` is x402-paid) |
| A2A Agent Card | `GET /.well-known/agent-card.json` |
| x402 service manifest | `GET /.well-known/x402` |
| Public aggregate metrics | `GET /api/metrics` |
| OpenAPI | `GET /openapi.json` |

The paid endpoint costs 0.005 USDC on Base through x402. A successful call
returns both the facilitator's `PAYMENT-RESPONSE` settlement header and an
IntentFence ES256 compact-JWS receipt.

For teams that need a guarded production workflow, the founding-customer form
is an application for hands-on integration of one consequential agent action.
No subscription is charged until the production policy and success criteria
are agreed with the customer.

## Install now

The hosted MCP endpoint is available without an API key:

```text
https://agentpass-protocol.rmalka06.chatgpt.site/mcp
```

Gemini CLI can install the repository directly, without waiting for an npm
package or gallery crawl:

```bash
gemini extensions install https://github.com/razel369/intentfence
```

The extension starts a dependency-free local MCP bridge and exposes both the
free preview and the x402-paid verified preflight tool.

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
endpoint crawlable by x402 indexes and autonomous tool routers. The production
`POST /api/preflight/verified` resource is registered and continuously checked
on x402scan.

## Commercial pilot

The fastest path to production is one guarded action: purchase, transfer,
booking, deployment, deletion, or another consequential tool call. Submit the
pilot form on the production site with the real action and its policy boundary.

See [docs/PROTOCOL.md](docs/PROTOCOL.md) and
[docs/SECURITY.md](docs/SECURITY.md) for the protocol and security model.
