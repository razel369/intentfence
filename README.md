# IntentFence

IntentFence is a payment firewall for autonomous AI agents. Before an agent
pays an unfamiliar x402 resource, it can forward the exact `PAYMENT-REQUIRED`
challenge it just observed. IntentFence validates the Base USDC quote against
the agent's ceiling and payee allowlist, binds the challenge with SHA-256, and
returns a signed assessment. It also supports declared merchant/purpose, cost,
data-retention, and approval policy preflights.

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
| Paid caller-observed x402 quote assessment | `POST /api/x402-assessments` |
| Receipt verification | `POST /api/receipts/verify` |
| Public ES256 keys | `GET /.well-known/jwks.json` |
| MCP Streamable HTTP | `/api/mcp` (`intentfence_verified_preflight` is x402-paid) |
| A2A Agent Card | `GET /.well-known/agent-card.json` |
| x402 service manifest | `GET /.well-known/x402` |
| Public aggregate metrics | `GET /api/metrics` |
| OpenAPI | `GET /openapi.json` |

Each paid endpoint costs 0.005 USDC on Base through x402. A successful call
returns both the facilitator's `PAYMENT-RESPONSE` settlement header and an
IntentFence ES256 compact-JWS receipt.

The quote assessment is the recommended check after an unfamiliar x402 merchant
returns its unpaid challenge and before the agent signs that merchant's payment.
The agent supplies `subject`, `target_url`, optional `method` (`GET`, `HEAD`, or
`POST`), the base64 `payment_required` header (maximum 16 KiB), and a policy with
`max_price_usdc` plus an optional `allowed_payees` list. IntentFence validates
x402 v2, exact scheme, Base mainnet, canonical Base USDC, price, payee, and exact
resource binding. It requires the canonical USDC EIP-712 domain and sends
Permit2, unknown transfer metadata, and active extensions to review. A
`safe_to_proceed` result requires an explicit matching
`allowed_payees` entry; omitting the list yields `needs_review`. IntentFence
never fetches or pays the target. Every advertised payment option must satisfy
every automatic check; mixed safe and unsafe option sets are denied.

For teams that need a guarded production workflow, the founding-customer form
is an application for hands-on integration of one consequential agent action.
No subscription is charged until the production policy and success criteria
are agreed with the customer.

## Install now

The hosted MCP endpoint is available without an API key:

```text
https://agentpass-protocol.rmalka06.chatgpt.site/api/mcp
```

Gemini CLI can install the repository directly, without waiting for an npm
package or gallery crawl:

```bash
gemini extensions install https://github.com/razel369/intentfence
```

The extension starts a dependency-free local MCP bridge and exposes the free
preview plus the x402-paid verified preflight and quote-assessment tools.

## Caller-observed x402 quote assessment

The first call returns the standard `PAYMENT-REQUIRED` challenge for the
IntentFence fee:

```bash
curl -i -X POST https://agentpass-protocol.rmalka06.chatgpt.site/api/x402-assessments \
  -H "Content-Type: application/json" \
  -d '{"subject":"agent:buyer-07","target_url":"https://merchant.example/api/paid-resource","method":"GET","payment_required":"BASE64_PAYMENT_REQUIRED_HEADER","policy":{"max_price_usdc":"0.10","allowed_payees":["0x1111111111111111111111111111111111111111"]}}'
```

Retry the same request with a valid x402 v2 `PAYMENT-SIGNATURE`. A successful
response contains the validated caller-observed challenge fields,
pass/review/deny checks, a SHA-256 binding to the full target URL and exact
payment requirement, and an ES256-signed assessment receipt. The assessment
uses assurance `caller-observed-x402-quote-assessment` and verification tier
`x402-quote-assessment+x402-settled`; x402 settlement covers the 0.005 USDC
IntentFence assessment fee, not the target payment.

## Important trust boundary

Declared-input receipts attest only that IntentFence evaluated caller-supplied
policy data. Quote-assessment receipts bind the exact caller-observed
`PAYMENT-REQUIRED` challenge; they do not prove that IntentFence contacted the
merchant, or prove merchant identity, delivery, or downstream enforcement. The
receipt-signing key is separate from the USDC recipient wallet. IntentFence
never needs a payer's seed phrase or wallet private key.

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

The `/.well-known/x402` service manifest and Bazaar metadata make both paid
endpoints crawlable by x402 indexes and autonomous tool routers. Production
resources are continuously checked, and the original verified-preflight route
is registered on x402scan.

## Commercial pilot

The fastest path to production is one guarded action: purchase, transfer,
booking, deployment, deletion, or another consequential tool call. Submit the
pilot form on the production site with the real action and its policy boundary.

See [docs/PROTOCOL.md](docs/PROTOCOL.md) and
[docs/SECURITY.md](docs/SECURITY.md) for the protocol and security model.
