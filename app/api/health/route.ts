import { sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { usageEvents } from "../../../db/schema";
import { getReceiptSigningPrivateJwk } from "../../../lib/runtime-secrets";
import { validateReceiptSigningKey } from "../../../lib/receipts";
import {
  INTENTFENCE_NETWORK,
  INTENTFENCE_PAY_TO,
  INTENTFENCE_PRICE_ATOMIC,
} from "../../../lib/x402";

export async function GET() {
  let database = false;
  let schema = false;
  let signing = false;

  try {
    const db = getDb();
    await db.run(sql`select 1`);
    database = true;
    await db.select({ id: usageEvents.id }).from(usageEvents).limit(1);
    schema = true;
  } catch (error) {
    console.error("IntentFence health database check failed", {
      error: error instanceof Error ? error.message : "unknown_error",
    });
  }

  try {
    const privateJwk = await getReceiptSigningPrivateJwk();
    signing = privateJwk ? await validateReceiptSigningKey(privateJwk) : false;
  } catch (error) {
    console.error("IntentFence health signing check failed", {
      error: error instanceof Error ? error.message : "unknown_error",
    });
  }

  const status = database && schema && signing ? "ok" : "degraded";
  return Response.json(
    {
      service: "IntentFence",
      version: "0.6.1",
      status,
      checks: {
        database,
        revenue_schema: schema,
        receipt_signing: signing,
        x402_configuration: {
          ready: Boolean(INTENTFENCE_PAY_TO && INTENTFENCE_NETWORK && INTENTFENCE_PRICE_ATOMIC),
          network: INTENTFENCE_NETWORK,
          amount_atomic: INTENTFENCE_PRICE_ATOMIC,
        },
      },
      protocol: {
        rest: true,
        mcp: true,
        paid_mcp: true,
        a2a: true,
        x402: true,
      },
    },
    {
      status: status === "ok" ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
