import { count, countDistinct, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { leads, paymentAudits, usageEvents } from "../../../db/schema";
import { INTENTFENCE_PRICE_ATOMIC } from "../../../lib/x402";

export async function GET() {
  try {
    const db = getDb();
    const [revenueRows, leadRows, eventRows] = await Promise.all([
      db
        .select({
          settledCalls: count(),
          distinctPayers: countDistinct(paymentAudits.payerAddress),
          revenueAtomic: sql<number>`coalesce(sum(cast(${paymentAudits.amountAtomic} as integer)), 0)`,
          latestSettlementAt: sql<number | null>`max(${paymentAudits.createdAt})`,
        })
        .from(paymentAudits)
        .where(eq(paymentAudits.status, "settled")),
      db.select({ submitted: count() }).from(leads),
      db
        .select({ eventName: usageEvents.eventName, total: count() })
        .from(usageEvents)
        .groupBy(usageEvents.eventName),
    ]);

    const revenue = revenueRows[0];
    const revenueAtomic = Number(revenue?.revenueAtomic ?? 0);
    const eventTotals = Object.fromEntries(eventRows.map((row) => [row.eventName, row.total]));

    return Response.json(
      {
        generated_at: new Date().toISOString(),
        currency: "USDC",
        decimals: 6,
        current_price_atomic: INTENTFENCE_PRICE_ATOMIC,
        settled_calls: revenue?.settledCalls ?? 0,
        distinct_payers: revenue?.distinctPayers ?? 0,
        revenue_atomic: String(revenueAtomic),
        revenue_usdc: revenueAtomic / 1_000_000,
        latest_settlement_at: revenue?.latestSettlementAt
          ? new Date(Number(revenue.latestSettlementAt) * 1_000).toISOString()
          : null,
        leads_submitted: leadRows[0]?.submitted ?? 0,
        funnel_events: eventTotals,
        note: "Counts come from IntentFence D1 settlement and funnel records; failed or unverified payments are excluded from revenue.",
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch (error) {
    console.error("IntentFence public metrics query failed", {
      error: error instanceof Error ? error.message : "unknown_error",
    });
    return Response.json(
      { error: "metrics_unavailable", message: "Metrics are temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
