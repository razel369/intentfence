import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import {
  latestProtocolVersion,
  negotiateProtocolVersion,
} from "../lib/protocol-version.mjs";

function encoded(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

test("negotiates protocol versions supported by older Gemini CLI releases", () => {
  assert.equal(negotiateProtocolVersion("2024-11-05"), "2024-11-05");
  assert.equal(negotiateProtocolVersion("2025-06-18"), "2025-06-18");
  assert.equal(negotiateProtocolVersion("unsupported"), latestProtocolVersion);
});

test("dependency-free Gemini extension lists tools and returns an x402 challenge", async () => {
  let requestCount = 0;
  const mock = createServer((_request, response) => {
    requestCount += 1;
    response.writeHead(402, {
      "Content-Type": "application/json",
      "PAYMENT-REQUIRED": encoded({
        x402Version: 2,
        accepts: [{ amount: "5000", network: "eip155:8453" }],
      }),
    });
    response.end(JSON.stringify({ error: "payment_required" }));
  });
  await new Promise((resolve) => mock.listen(0, "127.0.0.1", resolve));
  const address = mock.address();
  assert.ok(address && typeof address === "object");

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["bin/intentfence-gemini.mjs"],
    cwd: new URL("../", import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))\//u, "$1/"),
    env: { ...process.env, INTENTFENCE_BASE_URL: `http://127.0.0.1:${address.port}` },
    stderr: "pipe",
  });
  const client = new Client({ name: "gemini-extension-test", version: "0.11.0" });

  try {
    await client.connect(transport);
    const listed = await client.listTools();
    assert.equal(listed.tools.length, 6);
    assert.equal(listed.tools.some((tool) => tool.name === "intentfence_x402_readiness"), true);
    assert.equal(listed.tools.some((tool) => tool.name === "intentfence_us_cpi"), true);
    const assessmentTool = listed.tools.find(
      (tool) => tool.name === "intentfence_x402_assessment",
    );
    assert.ok(assessmentTool);
    assert.ok(assessmentTool.inputSchema.required.includes("payment_required"));
    assert.ok(assessmentTool.inputSchema.properties.method.enum.includes("POST"));
    assert.equal(assessmentTool.inputSchema.properties.payment_required.maxLength, 16_384);

    const invalidAssessment = await client.callTool({
      name: "intentfence_x402_assessment",
      arguments: {
        subject: "agent://gemini",
        target_url: "https://merchant.example/paid",
        policy: { max_price_usdc: "0.02" },
      },
    });
    assert.equal(invalidAssessment.isError, true);
    assert.match(invalidAssessment.content[0].text, /payment_required/iu);
    assert.equal(requestCount, 0);

    const challenge = await client.callTool({
      name: "intentfence_verified_preflight",
      arguments: { subject: "agent://gemini", action: { type: "purchase" } },
    });
    assert.equal(challenge.isError, true);
    assert.equal(challenge.structuredContent?.accepts?.[0]?.amount, "5000");
    assert.equal(requestCount, 1);
  } finally {
    await client.close();
    await new Promise((resolve, reject) => mock.close((cause) => cause ? reject(cause) : resolve()));
  }
});
