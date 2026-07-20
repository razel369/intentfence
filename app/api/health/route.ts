import { sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { paymentReservations, usageEvents } from "../../../db/schema";
import { MIN_ADMIN_TOKEN_LENGTH } from "../../../lib/admin-auth";
import {
  getIntentFenceAdminToken,
  getReceiptSigningPrivateJwk,
} from "../../../lib/runtime-secrets";
import { validateReceiptSigningKey } from "../../../lib/receipts";
import {
  INTENTFENCE_FACILITATOR_URL,
  INTENTFENCE_NETWORK,
  INTENTFENCE_PAY_TO,
  INTENTFENCE_PRICE_ATOMIC,
  INTENTFENCE_US_CPI_PRICE_ATOMIC,
  INTENTFENCE_WALLET_RISK_PRICE_ATOMIC,
} from "../../../lib/x402";
import { checkIntentFenceFacilitator } from "../../../lib/x402-health";

export async function GET() {
  let database = false;
  let schema = false;
  let paymentReservationSchema = false;
  let signing = false;
  let leadAdministration = false;
  let facilitatorReachable = false;
  let facilitatorSupportsRoute = false;

  try {
    const db = getDb();
    await db.run(sql`select 1`);
    database = true;
    await db.select({ id: usageEvents.id }).from(usageEvents).limit(1);
    schema = true;
    await db
      .select({ authorizationHash: paymentReservations.authorizationHash })
      .from(paymentReservations)
      .limit(1);
    paymentReservationSchema = true;
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

  try {
    const adminToken = await getIntentFenceAdminToken();
    leadAdministration = Boolean(
      adminToken && adminToken.length >= MIN_ADMIN_TOKEN_LENGTH,
    );
  } catch (error) {
    console.error("IntentFence health admin-token check failed", {
      error: error instanceof Error ? error.message : "unknown_error",
    });
  }

  try {
    const facilitator = await checkIntentFenceFacilitator(
      INTENTFENCE_FACILITATOR_URL,
      INTENTFENCE_NETWORK,
    );
    facilitatorReachable = facilitator.reachable;
    facilitatorSupportsRoute = facilitator.supportsRoute;
  } catch (error) {
    console.error("IntentFence health facilitator check failed", {
      error: error instanceof Error ? error.message : "unknown_error",
    });
  }

  const x402Configured = Boolean(
    INTENTFENCE_PAY_TO && INTENTFENCE_NETWORK && INTENTFENCE_PRICE_ATOMIC,
  );
  const x402Ready =
    x402Configured && facilitatorReachable && facilitatorSupportsRoute;
  const status =
    database && schema && paymentReservationSchema && signing && leadAdministration && x402Ready
      ? "ok"
      : "degraded";
  return Response.json(
    {
      service: "IntentFence",
      version: "0.10.0",
      status,
      checks: {
        database,
        revenue_schema: schema,
        payment_reservation_schema: paymentReservationSchema,
        receipt_signing: signing,
        lead_administration: leadAdministration,
        x402_configuration: {
          ready: x402Ready,
          configured: x402Configured,
          facilitator_reachable: facilitatorReachable,
          facilitator_supports_route: facilitatorSupportsRoute,
          network: INTENTFENCE_NETWORK,
          amount_atomic: INTENTFENCE_PRICE_ATOMIC,
          wallet_risk_amount_atomic: INTENTFENCE_WALLET_RISK_PRICE_ATOMIC,
          us_cpi_amount_atomic: INTENTFENCE_US_CPI_PRICE_ATOMIC,
        },
      },
      protocol: {
        rest: true,
        mcp: true,
        paid_mcp: true,
        a2a: true,
        x402: true,
        caller_observed_x402_quote_assessment: true,
        live_base_wallet_risk: true,
        signed_official_us_cpi: true,
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
