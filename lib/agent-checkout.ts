import { AGENTIC_WALLET_CLI_VERSION } from "./agentic-wallet-checkout.ts";
import { POLICY_PACK_CHECKOUT_REQUEST } from "./policy-pack-checkout.ts";
import { validatePolicyPackInput } from "./policy-pack.ts";
import { validatePreflightInput } from "./preflight.ts";
import { validateUsCpiInput } from "./us-cpi.ts";
import { validateWalletRiskInput } from "./wallet-risk.ts";
import {
  INTENTFENCE_NETWORK,
  INTENTFENCE_PAY_TO,
  INTENTFENCE_POLICY_PACK_PRICE_ATOMIC,
  INTENTFENCE_PRICE_ATOMIC,
  INTENTFENCE_READINESS_PRICE_ATOMIC,
  INTENTFENCE_US_CPI_PRICE_ATOMIC,
  INTENTFENCE_USDC_CONTRACT,
  INTENTFENCE_WALLET_RISK_PRICE_ATOMIC,
} from "./x402.ts";
import { validateX402AssessmentInput } from "./x402-assessment.ts";
import { validateX402ReadinessInput } from "./x402-readiness.ts";

const SITE_ORIGIN = "https://agentpass-protocol.rmalka06.chatgpt.site";
const MCP_URL = `${SITE_ORIGIN}/api/mcp`;
const MCP_PACKAGE =
  "https://github.com/razel369/intentfence/releases/download/mcp-v0.11.0/razel369-intentfence-mcp-0.11.0.tgz";

export const agentCheckoutProductIds = [
  "us-cpi",
  "wallet-risk",
  "x402-readiness",
  "x402-assessment",
  "verified-preflight",
  "policy-pack",
] as const;

export const agentCheckoutInputSchema = {
  type: "object",
  properties: {
    product: {
      type: "string",
      enum: agentCheckoutProductIds,
      description: "The paid outcome the agent wants to buy.",
    },
    input: {
      type: "object",
      description:
        "The exact product input. Omit only to receive a non-executable example recipe.",
    },
  },
  required: ["product"],
  additionalProperties: false,
} as const;

export type AgentCheckoutProductId = (typeof agentCheckoutProductIds)[number];

type ProductDefinition = {
  id: AgentCheckoutProductId;
  name: string;
  outcome: string;
  method: "GET" | "POST";
  path: string;
  amountAtomic: string;
  mcpTool: string;
  exampleInput: Record<string, unknown>;
};

const exampleChallenge =
  "eyJ4NDAyVmVyc2lvbiI6MiwicmVzb3VyY2UiOnsidXJsIjoiaHR0cHM6Ly9tZXJjaGFudC5leGFtcGxlL2FwaS9wYWlkLXJlc291cmNlIiwiZGVzY3JpcHRpb24iOiJQYWlkIHJlc291cmNlIiwibWltZVR5cGUiOiJhcHBsaWNhdGlvbi9qc29uIn0sImFjY2VwdHMiOlt7InNjaGVtZSI6ImV4YWN0IiwibmV0d29yayI6ImVpcDE1NTo4NDUzIiwiYW1vdW50IjoiMTAwMDAiLCJhc3NldCI6IjB4ODMzNTg5ZkNENmVEYjZFMDhmNGM3QzMyRDRmNzFiNTRiZEEwMjkxMyIsInBheVRvIjoiMHgxMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExIiwibWF4VGltZW91dFNlY29uZHMiOjMwMCwiZXh0cmEiOnsibmFtZSI6IlVTRCBDb2luIiwidmVyc2lvbiI6IjIifX1dfQ==";

const productDefinitions: Record<AgentCheckoutProductId, ProductDefinition> = {
  "us-cpi": {
    id: "us-cpi",
    name: "Official U.S. CPI",
    outcome: "Signed headline and core CPI data with BLS provenance.",
    method: "GET",
    path: "/api/us-cpi",
    amountAtomic: INTENTFENCE_US_CPI_PRICE_ATOMIC,
    mcpTool: "intentfence_us_cpi",
    exampleInput: {},
  },
  "wallet-risk": {
    id: "wallet-risk",
    name: "Base wallet risk",
    outcome: "Live sanctions, malicious-address, activity, and balance screening.",
    method: "GET",
    path: "/api/wallet-risk",
    amountAtomic: INTENTFENCE_WALLET_RISK_PRICE_ATOMIC,
    mcpTool: "intentfence_wallet_risk",
    exampleInput: { address: "0x1111111111111111111111111111111111111111" },
  },
  "x402-readiness": {
    id: "x402-readiness",
    name: "x402 endpoint readiness",
    outcome: "Live no-payment validation of a public x402 endpoint.",
    method: "POST",
    path: "/api/x402-readiness",
    amountAtomic: INTENTFENCE_READINESS_PRICE_ATOMIC,
    mcpTool: "intentfence_x402_readiness",
    exampleInput: {
      subject: "agent:checkout",
      target_url: `${SITE_ORIGIN}/api/us-cpi`,
      method: "GET",
      max_price_usdc: "0.01",
      allowed_payees: [INTENTFENCE_PAY_TO],
    },
  },
  "x402-assessment": {
    id: "x402-assessment",
    name: "x402 quote assessment",
    outcome: "Signed validation of the exact PAYMENT-REQUIRED quote observed by the buyer.",
    method: "POST",
    path: "/api/x402-assessments",
    amountAtomic: INTENTFENCE_PRICE_ATOMIC,
    mcpTool: "intentfence_x402_assessment",
    exampleInput: {
      subject: "agent:checkout",
      target_url: "https://merchant.example/api/paid-resource",
      method: "GET",
      payment_required: exampleChallenge,
      policy: {
        max_price_usdc: "0.01",
        allowed_payees: ["0x1111111111111111111111111111111111111111"],
      },
    },
  },
  "verified-preflight": {
    id: "verified-preflight",
    name: "Verified policy preflight",
    outcome: "Signed policy decision for a consequential agent action.",
    method: "POST",
    path: "/api/preflight/verified",
    amountAtomic: INTENTFENCE_PRICE_ATOMIC,
    mcpTool: "intentfence_verified_preflight",
    exampleInput: {
      subject: "agent:checkout",
      action: { type: "purchase", resource: "order-42" },
      constraints: {
        currency: "USD",
        cost_ceiling: 100,
        quoted_cost: 79,
        data_retention_hours: 24,
        human_approval: "not_required",
      },
    },
  },
  "policy-pack": {
    id: "policy-pack",
    name: "Production policy pack",
    outcome: "Runtime-specific guard, signed receipt, tests, and deployment checklist.",
    method: "POST",
    path: "/api/policy-packs",
    amountAtomic: INTENTFENCE_POLICY_PACK_PRICE_ATOMIC,
    mcpTool: "intentfence_policy_pack",
    exampleInput: POLICY_PACK_CHECKOUT_REQUEST,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class AgentCheckoutValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentCheckoutValidationError";
  }
}

export function validateAgentCheckoutProduct(value: unknown): AgentCheckoutProductId {
  if (
    typeof value !== "string" ||
    !agentCheckoutProductIds.includes(value as AgentCheckoutProductId)
  ) {
    throw new AgentCheckoutValidationError(
      `product must be one of: ${agentCheckoutProductIds.join(", ")}.`,
    );
  }
  return value as AgentCheckoutProductId;
}

function validateProductInput(product: AgentCheckoutProductId, value: unknown) {
  try {
    switch (product) {
      case "us-cpi":
        return validateUsCpiInput(value);
      case "wallet-risk":
        return validateWalletRiskInput(value);
      case "x402-readiness":
        return validateX402ReadinessInput(value);
      case "x402-assessment":
        return validateX402AssessmentInput(value);
      case "verified-preflight":
        return validatePreflightInput(value);
      case "policy-pack":
        return validatePolicyPackInput(value);
    }
  } catch (error) {
    throw new AgentCheckoutValidationError(
      error instanceof Error ? error.message : "input is invalid.",
    );
  }
}

function quotePosix(value: string) {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function quotePowerShell(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function requestForProduct(
  definition: ProductDefinition,
  input: Record<string, unknown>,
) {
  const url = new URL(definition.path, SITE_ORIGIN);
  if (definition.id === "us-cpi" && typeof input.month === "string") {
    url.searchParams.set("month", input.month);
  }
  if (definition.id === "wallet-risk" && typeof input.address === "string") {
    url.searchParams.set("address", input.address);
  }

  const body = definition.method === "POST" ? JSON.stringify(input) : null;
  const args = [
    `awal@${AGENTIC_WALLET_CLI_VERSION}`,
    "x402",
    "pay",
    url.toString(),
    "-X",
    definition.method,
    ...(body ? ["-d", body] : []),
    "--max-amount",
    definition.amountAtomic,
    "--json",
  ];
  const baseArgs = [
    `npx awal@${AGENTIC_WALLET_CLI_VERSION} x402 pay`,
    `"${url.toString()}"`,
    `-X ${definition.method}`,
    ...(body ? [`-d ${quotePosix(body)}`] : []),
    `--max-amount ${definition.amountAtomic}`,
    "--json",
  ];
  const powerShellArgs = [
    `npx.cmd awal@${AGENTIC_WALLET_CLI_VERSION} x402 pay`,
    `"${url.toString()}"`,
    `-X ${definition.method}`,
    ...(body ? [`-d ${quotePowerShell(body)}`] : []),
    `--max-amount ${definition.amountAtomic}`,
    "--json",
  ];

  return {
    method: definition.method,
    url: url.toString(),
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? input : null,
    agentic_wallet: {
      package: "awal",
      verified_version: AGENTIC_WALLET_CLI_VERSION,
      prerequisites: [
        "The buyer wallet is authenticated.",
        "The buyer wallet has sufficient Base USDC.",
        "The buyer has approved a per-call limit at or above this exact cap.",
      ],
      command: "npx",
      windows_command: "npx.cmd",
      args,
      argv: ["npx", ...args],
      shell: {
        posix: baseArgs.join(" "),
        powershell: powerShellArgs.join(" "),
      },
    },
  };
}

function skillForProduct(product: AgentCheckoutProductId) {
  if (product === "wallet-risk") {
    return {
      name: "screen-base-wallets",
      install:
        "npx skills add razel369/intentfence --skill screen-base-wallets",
      trigger:
        "Run before a new Base recipient receives USDC or an x402 payment.",
    };
  }
  if (product === "x402-readiness") {
    return {
      name: "inspect-x402-endpoints",
      install:
        "npx skills add razel369/intentfence --skill inspect-x402-endpoints",
      trigger: "Run when an agent discovers an unfamiliar x402 URL.",
    };
  }
  if (product === "x402-assessment") {
    return {
      name: "guard-x402-payments",
      install:
        "npx skills add razel369/intentfence --skill guard-x402-payments",
      trigger: "Run after receiving PAYMENT-REQUIRED and before signing it.",
    };
  }
  return null;
}

export function listAgentCheckoutProducts() {
  return agentCheckoutProductIds.map((id) => {
    const product = productDefinitions[id];
    return {
      id: product.id,
      name: product.name,
      outcome: product.outcome,
      method: product.method,
      endpoint: new URL(product.path, SITE_ORIGIN).toString(),
      price_usdc: Number(product.amountAtomic) / 1_000_000,
      amount_atomic: product.amountAtomic,
      mcp_tool: product.mcpTool,
      example_input: product.exampleInput,
    };
  });
}

export function buildAgentCheckout(value: unknown) {
  if (!isRecord(value)) {
    throw new AgentCheckoutValidationError("The checkout request must be a JSON object.");
  }
  const product = validateAgentCheckoutProduct(value.product);
  const definition = productDefinitions[product];
  const usingExample = value.input === undefined;
  const input = validateProductInput(
    product,
    usingExample ? definition.exampleInput : value.input,
  ) as Record<string, unknown>;
  const request = requestForProduct(definition, input);

  return {
    intentfence: "agent-checkout-1.0",
    product: {
      id: definition.id,
      name: definition.name,
      outcome: definition.outcome,
      price_usdc: Number(definition.amountAtomic) / 1_000_000,
      amount_atomic: definition.amountAtomic,
    },
    example_only: usingExample,
    warning: usingExample
      ? "This recipe contains example input. Replace it with the buyer's real input before authorizing payment."
      : "Review the exact request and payment cap before authorizing a real USDC payment.",
    payment: {
      protocol: "x402",
      version: 2,
      scheme: "exact",
      network: INTENTFENCE_NETWORK,
      asset: INTENTFENCE_USDC_CONTRACT,
      pay_to: INTENTFENCE_PAY_TO,
      max_amount_atomic: definition.amountAtomic,
      max_amount_usdc: Number(definition.amountAtomic) / 1_000_000,
      custody: "The buyer signs locally. IntentFence never receives the private key.",
    },
    request,
    mcp: {
      remote_url: MCP_URL,
      tool: definition.mcpTool,
      arguments: input,
      flow: [
        "Call the tool once without _meta to receive x402/payment requirements.",
        "Verify the exact resource, network, asset, amount, and payTo against this checkout.",
        "Sign locally and retry with _meta['x402/payment'].",
        "Require _meta['x402/payment-response'] before accepting the paid result.",
      ],
      local_autopay: {
        command: [
          "npx",
          "--yes",
          "--package",
          MCP_PACKAGE,
          "intentfence-mcp",
        ],
        required_secret_env: ["INTENTFENCE_EVM_PRIVATE_KEY"],
        required_budget_env: {
          INTENTFENCE_MAX_AUTO_PAYMENT_USDC:
            String(Number(definition.amountAtomic) / 1_000_000),
          INTENTFENCE_AUTO_PAYMENT_BUDGET_USDC:
            String(Math.max(Number(definition.amountAtomic) / 100_000, 0.01)),
        },
        enabled_by_default: false,
      },
    },
    buyer_clients: {
      coinbase_agentic_wallet_mcp: {
        install: "npx @coinbase/payments-mcp",
        action: "Make an x402 request",
        request: {
          method: request.method,
          url: request.url,
          headers: request.headers,
          body: request.body,
        },
        max_amount_atomic: definition.amountAtomic,
        instruction:
          "Use the connected wallet's x402 request tool. It handles the challenge, payment, and retry while enforcing the wallet owner's spending limits.",
      },
      mcpc: {
        connect:
          "mcpc connect https://agentpass-protocol.rmalka06.chatgpt.site/api/mcp @intentfence --x402",
        tool_call: {
          name: definition.mcpTool,
          arguments: input,
        },
        instruction:
          "The tool advertises _meta.x402, so compatible clients can sign before the first paid tool call.",
      },
    },
    agent_skill: skillForProduct(product),
    next_step:
      "Use either listed buyer client or another x402 v2 client. A successful paid response must include PAYMENT-RESPONSE settlement proof.",
  };
}
