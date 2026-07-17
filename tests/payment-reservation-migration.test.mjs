import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

test("payment reservation migration enforces one row per authorization", async () => {
  const sql = await readFile(
    new URL("../drizzle/0004_payment_reservations.sql", import.meta.url),
    "utf8",
  );
  const db = new DatabaseSync(":memory:");
  db.exec(sql);
  const insert = db.prepare(
    "INSERT OR IGNORE INTO payment_reservations " +
      "(authorization_hash, product, status, reserved_at, expires_at) " +
      "VALUES (?, ?, 'reserved', ?, ?)",
  );
  assert.equal(insert.run("hash-1", "x402-assessment", 1, 2).changes, 1);
  assert.equal(insert.run("hash-1", "x402-assessment", 1, 2).changes, 0);
  assert.equal(
    db.prepare("SELECT count(*) AS total FROM payment_reservations").get().total,
    1,
  );
  assert.ok(
    db.prepare("PRAGMA index_list('payment_reservations')").all()
      .some((index) => index.name === "payment_reservations_expires_at_idx"),
  );
  db.close();
});
