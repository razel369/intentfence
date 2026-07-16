import assert from "node:assert/strict";
import test from "node:test";

import {
  isAdminRequestAuthorized,
  MIN_ADMIN_TOKEN_LENGTH,
} from "../lib/admin-auth.ts";

const token = "a".repeat(MIN_ADMIN_TOKEN_LENGTH);

test("requires the exact configured lead-admin bearer token", () => {
  const valid = new Request("https://intentfence.test/api/admin/leads", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(isAdminRequestAuthorized(valid, token), true);
  assert.equal(isAdminRequestAuthorized(valid, `${token}x`), false);
});

test("rejects missing authorization and weak server configuration", () => {
  const missing = new Request("https://intentfence.test/api/admin/leads");
  assert.equal(isAdminRequestAuthorized(missing, token), false);
  assert.equal(isAdminRequestAuthorized(missing, null), false);
  assert.equal(isAdminRequestAuthorized(missing, "too-short"), false);
});
