import assert from "node:assert/strict";
import test from "node:test";

import { classifySettlementSource } from "../lib/x402-settlement-source.ts";

test("classifies Tollbooth verifier settlements as platform verification", () => {
  const request = new Request("https://example.com/api/us-cpi", {
    headers: { "user-agent": "Tollbooth-PaidCall/1.0" },
  });
  assert.equal(classifySettlementSource(request), "platform_verification");
});

test("classifies ordinary agent settlements as external", () => {
  const request = new Request("https://example.com/api/us-cpi", {
    headers: { "user-agent": "ExampleAgent/2.0" },
  });
  assert.equal(classifySettlementSource(request), "external");
});
