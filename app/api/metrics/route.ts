import { and, count, countDistinct, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { leads, paymentAudits, usageEvents } from "../../../db/schema";
import { INTENTFENCE_PRICE_ATOMIC } from "../../../lib/x402";

export async function GET() {
  try {
    const db = getDb();
    const failureReason = sql<string>`coalesce(json_extract(${usageEvents.metadataJson}, '$.reason'), 'unknown')`;
    const signatureSource = sql<string>`coalesce(json_extract(${usageEvents.metadataJson}, '$.source_kind'), 'unknown')`;
    const [
      revenueRows,
      leadRows,
      eventRows,
      failureRows,
      signatureSourceRows,
      qualifiedCheckoutRows,
    ] = await Promise.all([
      db
        .select({
          settledCalls: count(),
          distinctPayers: countDistinct(paymentAudits.payerAddress),
          revenueAtomic: sql<number>`coalesce(sum(cast(${paymentAudits.amountAtomic} as integer)), 0)`,
          latestSettlementAt: sql<number | null>`max(${paymentAudits.createdAt})`,
        })
        .from(paymentAudits)
        .where(and(
          eq(paymentAudits.status, "settled"),
          eq(paymentAudits.sourceKind, "external"),
        )),
      db.select({ submitted: count() }).from(leads),
      db
        .select({ eventName: usageEvents.eventName, total: count() })
        .from(usageEvents)
        .groupBy(usageEvents.eventName),
      db
        .select({ reason: failureReason, total: count() })
        .from(usageEvents)
        .where(eq(usageEvents.eventName, "payment_verification_failed"))
        .groupBy(failureReason),
      db
        .select({ sourceKind: signatureSource, total: count() })
        .from(usageEvents)
        .where(eq(usageEvents.eventName, "payment_signature_received"))
        .groupBy(signatureSource),
      db
        .select({ total: count() })
        .from(usageEvents)
        .where(
          and(
            eq(usageEvents.eventName, "checkout_selected"),
            sql`(
              json_extract(${usageEvents.metadataJson}, '$.traffic_kind') = 'agent'
              OR json_extract(${usageEvents.metadataJson}, '$.protocol') IN ('mcp', 'a2a')
            )`,
          ),
        ),
    ]);

    const revenue = revenueRows[0];
    const revenueAtomic = Number(revenue?.revenueAtomic ?? 0);
    const eventTotals = Object.fromEntries(eventRows.map((row) => [row.eventName, row.total]));
    const failureTotals = Object.fromEntries(failureRows.map((row) => [row.reason, row.total]));
    const signatureSources = Object.fromEntries(
      signatureSourceRows.map((row) => [row.sourceKind, row.total]),
    );
    const externalSignatures = Number(signatureSources.external ?? 0);
    const externalSettlements = Number(revenue?.settledCalls ?? 0);

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
        payment_funnel: {
          instrumentation_version: "2.0",
          tracking_started_version: "0.13.0",
          traffic_classification_started_version: "0.16.0",
          challenges_issued: Number(eventTotals.payment_required ?? 0),
          unclassified_or_buyer_challenges: Number(eventTotals.payment_required ?? 0),
          automated_probes_excluded_since_0_16: Number(eventTotals.payment_probe ?? 0),
          checkout_catalog_views_since_0_16: Number(
            eventTotals.checkout_discovered ?? 0,
          ),
          checkout_selections_total_since_0_16: Number(
            eventTotals.checkout_selected ?? 0,
          ),
          qualified_checkout_intents_since_0_16: Number(
            qualifiedCheckoutRows[0]?.total ?? 0,
          ),
          signatures_received: Number(eventTotals.payment_signature_received ?? 0),
          signature_sources: signatureSources,
          verification_succeeded: Number(eventTotals.payment_verification_succeeded ?? 0),
          verification_failed: Number(eventTotals.payment_verification_failed ?? 0),
          failure_reasons: failureTotals,
          external_settlements_succeeded: externalSettlements,
          platform_verification_settlements: Number(
            eventTotals.payment_verification_settled ?? 0,
          ),
          external_settlement_rate_per_external_signature:
            externalSignatures > 0 ? externalSettlements / externalSignatures : null,
          privacy:
            "Payment-attempt events do not store payment signatures, raw facilitator errors, or full wallet addresses.",
          interpretation:
            "A 402 response is not a payment attempt. Since 0.16.0, recognized liveness monitors and crawlers are counted as payment_probe instead of payment_required. Browser checkout selections are reported separately and do not count as qualified agent intent; only agent, MCP, or A2A selections qualify. Historical payment_required totals can still include probes.",
        },
        note: "Counts come from IntentFence D1 settlement and funnel records; failed, unverified, synthetic, known-monitor, and platform-verification payments are excluded from customer revenue.",
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
