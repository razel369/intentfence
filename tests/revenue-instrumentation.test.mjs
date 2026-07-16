import assert from "node:assert/strict";
import test from "node:test";

import { normalizeLeadPlan } from "../lib/lead-intake.ts";

test("lead plan mapping preserves current offers and legacy API values", () => {
  assert.equal(normalizeLeadPlan("pilot"), "pilot");
  assert.equal(normalizeLeadPlan("production"), "production");
  assert.equal(normalizeLeadPlan("enterprise"), "enterprise");
  assert.equal(normalizeLeadPlan("high_assurance"), "high_assurance");
  assert.equal(normalizeLeadPlan("fleet"), "fleet");
  assert.equal(normalizeLeadPlan("unknown"), "pilot");
  assert.equal(normalizeLeadPlan(undefined), "pilot");
});
