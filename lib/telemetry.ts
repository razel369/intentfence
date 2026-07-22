import { getDb } from "../db";
import { usageEvents } from "../db/schema";

export type FunnelStage = "discovery" | "activation" | "lead" | "payment" | "revenue";

export const funnelEventStages = {
  discovery_served: "discovery",
  activation_started: "activation",
  preview_completed: "activation",
  risk_scan_completed: "activation",
  action_authorized: "activation",
  action_denied: "activation",
  lead_submitted: "lead",
  lead_rejected: "lead",
  lead_spam_filtered: "lead",
  payment_required: "payment",
  payment_settled: "revenue",
  payment_verification_settled: "revenue",
  receipt_issued: "revenue",
} as const satisfies Record<string, FunnelStage>;

export type FunnelEventName = keyof typeof funnelEventStages;
export type FunnelEventMetadataValue = string | number | boolean | null;
const syntheticSources = new Set(["monitor", "smoke", "synthetic"]);

export type FunnelEvent = {
  eventName: FunnelEventName;
  request?: Request;
  requestId?: string | null;
  subject?: string | null;
  metadata?: Readonly<Record<string, FunnelEventMetadataValue>>;
};

type RequestAttribution = {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  referrer: string | null;
  path: string | null;
};

function bounded(value: string | null | undefined, maxLength: number): string | null {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function safeUrl(value: string | null | undefined): URL | null {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function requestAttribution(request: Request | undefined): RequestAttribution {
  if (!request) {
    return { source: null, medium: null, campaign: null, referrer: null, path: null };
  }

  const requestUrl = safeUrl(request.url);
  const referrerUrl = safeUrl(request.headers.get("referer"));
  const parameter = (name: string) =>
    requestUrl?.searchParams.get(name) ?? referrerUrl?.searchParams.get(name);

  return {
    source: bounded(
      request.headers.get("x-intentfence-source") ??
        parameter("utm_source") ??
        referrerUrl?.hostname,
      120,
    ),
    medium: bounded(parameter("utm_medium"), 120),
    campaign: bounded(parameter("utm_campaign"), 160),
    referrer: referrerUrl
      ? bounded(`${referrerUrl.origin}${referrerUrl.pathname}`, 500)
      : null,
    path: bounded(requestUrl?.pathname, 500),
  };
}

function serializeMetadata(
  metadata: FunnelEvent["metadata"],
): string | null {
  if (!metadata) return null;

  const boundedEntries = Object.entries(metadata)
    .slice(0, 24)
    .map(([key, value]) => [
      key.slice(0, 80),
      typeof value === "string" ? value.slice(0, 500) : value,
    ]);
  const serialized = JSON.stringify(Object.fromEntries(boundedEntries));
  return serialized.length <= 4_096
    ? serialized
    : JSON.stringify({ truncated: true, original_length: serialized.length });
}

/**
 * Persists a bounded funnel event without allowing telemetry failures to affect
 * the product request that produced it. Do not place secrets or raw payment
 * payloads in subject or metadata.
 */
export async function recordFunnelEvent(event: FunnelEvent): Promise<void> {
  const requestSource = event.request?.headers
    .get("x-intentfence-source")
    ?.trim()
    .toLowerCase();
  if (requestSource && syntheticSources.has(requestSource)) return;
  try {
    const attribution = requestAttribution(event.request);
    await getDb()
      .insert(usageEvents)
      .values({
        id: crypto.randomUUID(),
        eventName: event.eventName,
        funnelStage: funnelEventStages[event.eventName],
        requestId: bounded(event.requestId, 200),
        subject: bounded(event.subject, 200),
        ...attribution,
        metadataJson: serializeMetadata(event.metadata),
        createdAt: new Date(),
      });
  } catch (error) {
    console.error("IntentFence telemetry write failed", {
      eventName: event.eventName,
      error: error instanceof Error ? error.message : "unknown_error",
    });
  }
}
