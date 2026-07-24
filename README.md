# IntentFence

IntentFence is a fail-closed authorization firewall for autonomous AI agents.
Immediately before a consequential MCP, HTTP, A2A, or payment action, it binds
the exact action and payload hash to explicit action/resource allowlists, spend
and retention ceilings, and optional action-specific approval. It returns a
five-minute ES256 receipt; the TypeScript and Python SDKs verify the receipt and
local action digest before executing the caller-owned callback. IntentFence
never executes downstream tools and should never receive credentials or wallet
keys. It also provides MCP metadata scanning and x402 payment-safety checks.

- `safe_to_proceed`
- `needs_review`
- `denied`

Production: <https://agentpass-protocol.rmalka06.chatgpt.site>

x402scan: <https://www.x402scan.com/server/c495c104-dba4-4764-86b1-96b8b0cda48b>

Official MCP Registry: <https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.razel369%2Fintentfence>

[![razel369/intentfence MCP server](https://glama.ai/mcp/servers/razel369/intentfence/badges/score.svg)](https://glama.ai/mcp/servers/razel369/intentfence)

## Protocol surfaces

| Surface | Endpoint |
| --- | --- |
| Action-bound authorization | `POST /api/actions/authorize` |
| Paid self-service production policy pack | `POST /api/policy-packs` |
| Free MCP metadata risk scan | `POST /api/agent-risk/scan` |
| Free REST preview | `POST /api/preflight` |
| Paid x402 decision | `POST /api/preflight/verified` |
| Paid caller-observed x402 quote assessment | `POST /api/x402-assessments` |
| Paid live x402 endpoint readiness | `POST /api/x402-readiness` |
| Paid live Base wallet-risk assessment | `GET /api/wallet-risk?address=...` |
| Paid signed official U.S. CPI data | `GET /api/us-cpi?month=YYYY-MM` |
| Receipt verification | `POST /api/receipts/verify` |
| Public ES256 keys | `GET /.well-known/jwks.json` |
| MCP Streamable HTTP | `/api/mcp` (`intentfence_verified_preflight` is x402-paid) |
| A2A Agent Card | `GET /.well-known/agent-card.json` |
| x402 service manifest | `GET /.well-known/x402` |
| Public aggregate metrics | `GET /api/metrics` |
| OpenAPI | `GET /openapi.json` |

## Fail-closed action authorization

The hosted MCP tools `intentfence_authorize_action` and
`intentfence_agent_risk_scan` are available without an API key and are
rate-limited. Authorization signs the exact caller-supplied action and policy
digests for five minutes but does not validate the truth of a self-declared
identity or approval source. Production callers must verify the receipt,
re-hash the local action, and block on denial, review, expiry, mismatch, network
failure, or verification failure. Use the TypeScript `enforceAction` or Python
`run_authorized` helper to make that boundary executable.

The scanner evaluates caller-supplied MCP metadata only. It highlights missing
schemas, annotations, action-bound approval, and financial limits, but does not
execute tools, inspect source code, or certify security or compliance.

Official U.S. CPI costs 0.001 USDC; live readiness and wallet risk cost 0.002 USDC; signed preflight and exact-quote assessment cost
0.005 USDC on Base through x402. A successful call
returns both the facilitator's `PAYMENT-RESPONSE` settlement header and an
IntentFence ES256 compact-JWS receipt.

Wallet risk is the recommended first check before paying a Base recipient. It
uses live Base RPC activity and GoPlus malicious-address intelligence. A
`safe_to_proceed` result means no listed malicious flags were observed and the
address was established on Base at assessment time; it does not prove identity,
ownership, authorization, or future behavior.

The live readiness check is the simplest first call when an agent only has an endpoint URL. It makes one bounded credential-free request, rejects private-network targets and redirects, validates the returned challenge, never pays the target, and signs the result for five minutes.

The quote assessment is the recommended check after an x402 merchant returns
its unpaid challenge and before the agent signs the merchant payment.
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

## Self-service production policy pack

An agent or developer can buy a complete production guard without an account,
email, meeting, or sales call:

```text
POST /api/policy-packs
```

The request selects `cloudflare-agents`, `coinbase-agentkit`, or `mcp-gateway`
and supplies one exact action plus its allowlists, spend ceiling, retention
limit, and optional approval policy. The first request returns an x402 challenge
for exactly 1 USDC on Base. After settlement, the same response delivers a
copy-ready TypeScript guard, signed action and policy receipt, allowed/denied/
over-budget test vectors, and a fail-closed deployment checklist. The buyer
must review the generated code and keep all credentials in its own runtime.

## Install now

The hosted MCP endpoint is available without an API key:

```text
https://agentpass-protocol.rmalka06.chatgpt.site/api/mcp
```

### Install the local stdio MCP package

Agents and MCP clients that require a local process can run the immutable public
0.11.0 release directly. This does not require an npm account, repository clone,
or IntentFence API key:

```bash
npx --yes --package https://github.com/razel369/intentfence/releases/download/mcp-v0.11.0/razel369-intentfence-mcp-0.11.0.tgz intentfence-mcp
```

The release artifact is built and tested by GitHub Actions. Its SHA-256 digest
is `f0cdf3df28da8a5c037e48193cbb4602744b5fb0b6c182d877abedb707b1e9f9`.
Use the hosted endpoint above when the client supports Streamable HTTP.

### Install in an agent runtime

- [Cloudflare Agents fail-closed guard](integrations/cloudflare-agents)
- [Coinbase AgentKit pinned x402 checkout](integrations/coinbase-agentkit)
- [Generic MCP gateway guard](integrations/mcp-gateway)

All adapters keep credentials in the caller runtime and execute the downstream
action only after the exact local action digest and ES256 receipt verify.

#### Opt-in one-call payment for local agents

The local stdio package can handle the x402 challenge, sign it, retry the tool
call, and return the settled result without requiring special MCP-client
support. Automatic payment is disabled unless all three values below are set:

```text
INTENTFENCE_EVM_PRIVATE_KEY=<buyer-controlled 0x-prefixed key>
INTENTFENCE_MAX_AUTO_PAYMENT_USDC=0.005
INTENTFENCE_AUTO_PAYMENT_BUDGET_USDC=0.05
```

Supply the key through the agent runtime's secret manager or process
environment; never commit it to an MCP configuration file. The package signs
only `exact` Base-mainnet USDC requirements addressed to the published
IntentFence recipient, rejects any payment above the per-call ceiling, and
reserves every attempted signature against the process-lifetime budget before
signing. Failed attempts remain reserved, so retry loops and concurrent calls
cannot exceed the cap. The private key stays in the buyer's local process and is
never sent to IntentFence.

### Install in VS Code

[Open the live install panel](https://agentpass-protocol.rmalka06.chatgpt.site/#vscode-install),
then select **Install IntentFence in VS Code**.

The install action contains only the public server name, transport, and URL. VS
Code asks you to review and trust the server before its first start. The free
policy-preview tool works with no API key. Paid calls through the hosted server
need an x402-capable client; runtimes without one can use the budget-capped local
stdio mode above.

Manual `.vscode/mcp.json` or user-profile fallback:

```json
{
  "servers": {
    "IntentFence": {
      "type": "http",
      "url": "https://agentpass-protocol.rmalka06.chatgpt.site/api/mcp"
    }
  }
}
```

Review the server details yourself before starting a manually configured server.

See the [official VS Code MCP installation documentation](https://code.visualstudio.com/api/extension-guides/ai/mcp#create-an-mcp-installation-url).

### Install the cross-agent payment guard

Install the open Agent Skill in Codex, Claude Code, Cursor, Gemini CLI, GitHub
Copilot, and other skills-compatible agents:

```bash
npx skills add razel369/intentfence --skill guard-x402-payments
```

[Review the complete skill before installing it](https://github.com/razel369/intentfence/tree/main/skills/guard-x402-payments).

The skill triggers when an agent is about to sign an x402 payment. It teaches
the agent to capture the exact quote, enforce a caller-defined ceiling and
payee allowlist, keep wallet credentials local, and use IntentFence only after
the 0.005 USDC assessment fee is authorized. It includes a capped Coinbase
Agentic Wallet buyer path for agents that already use an authenticated wallet.

Agents that have only a public x402 URL can install the narrower live-readiness
skill. It probes the route without credentials or target payment, blocks
redirects and private-network targets, validates the returned challenge, and
requires explicit authorization before the 0.002 USDC IntentFence fee:

```bash
npx skills add razel369/intentfence --skill inspect-x402-endpoints
```

The official x402 client buyer example verifies the live fee challenge before
creating a signer and is payment-disabled by default:

<https://github.com/razel369/intentfence/tree/main/examples/x402-buyer>

Agents that already use Coinbase Agentic Wallet can retrieve a complete capped
checkout from `GET /api/payments` under `buyer_quickstart`. The published
command is pinned to a verified CLI version, includes a valid policy body, and
sets `--max-amount 5000` so it cannot authorize more than the 0.005 USDC
IntentFence fee. Review the body and explicitly authorize the real payment
before running it.

Projects that already own a Coinbase AgentKit EVM wallet can use the
[pinned AgentKit adapter](https://github.com/razel369/intentfence/tree/main/integrations/coinbase-agentkit).
Unlike an automatic retry, it binds the payment to the exact IntentFence URL,
Base network, canonical USDC asset, 5000-atomic-unit amount, and recipient,
then calls the buyer's own authorization function before signing. The matching
machine-readable manifest is published at
<https://agentpass-protocol.rmalka06.chatgpt.site/integrations/coinbase-agentkit.json>.

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

## Live Base wallet risk

The first call returns an x402 challenge for 0.002 USDC:

```bash
curl -i "https://agentpass-protocol.rmalka06.chatgpt.site/api/wallet-risk?address=0x1111111111111111111111111111111111111111"
```

Retry the same URL with a valid x402 v2 `PAYMENT-SIGNATURE`. The successful
response includes Base account activity, native and USDC balances, a code hash
for contracts, current malicious-address flags, pass/review/deny checks, and a
five-minute ES256 receipt with assurance `live-base-wallet-risk`. If a required
live source is unavailable, the endpoint fails closed and does not intentionally
settle the assessment fee.

## Important trust boundary

Declared-input receipts attest only that IntentFence evaluated caller-supplied
policy data. Quote-assessment receipts bind the exact caller-observed
`PAYMENT-REQUIRED` challenge; they do not prove that IntentFence contacted the
merchant, or prove merchant identity, delivery, or downstream enforcement. The
receipt-signing key is separate from the USDC recipient wallet. IntentFence
never needs a payer's seed phrase or wallet private key. Wallet-risk receipts
report observed evidence at one point in time and are not identity attestations.

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

## Commercial path

The fastest no-contact path to production is the 1 USDC policy pack for one
guarded purchase, transfer, booking, deployment, deletion, or other
consequential action. The machine-readable offer and capped Agentic Wallet
checkout are published by `GET /api/payments`.

See [docs/PROTOCOL.md](docs/PROTOCOL.md) and
[docs/SECURITY.md](docs/SECURITY.md) for the protocol and security model.
