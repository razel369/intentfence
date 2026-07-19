const BLS_API_BASE = "https://api.bls.gov/publicAPI/v2/timeseries/data";
const CACHE_NAME = "intentfence-official-data-v1";
const CACHE_KEY = "https://agentpass-protocol.rmalka06.chatgpt.site/__cache/us-cpi-v1";
const CACHE_TTL_SECONDS = 21_600;
const UPSTREAM_TIMEOUT_MS = 8_000;

export const US_CPI_SERIES = {
  headline: "CUUR0000SA0",
  core: "CUUR0000SA0L1E",
} as const;

type BlsPoint = {
  year: string;
  period: string;
  periodName: string;
  value: string;
};

type CachedCpiSeries = {
  retrieved_at: string;
  headline: BlsPoint[];
  core: BlsPoint[];
};

export type UsCpiInput = { month?: string };

export type UsCpiDecision = {
  intentfence: "0.8";
  request_id: string;
  status: "verified";
  source: {
    publisher: "U.S. Bureau of Labor Statistics";
    api: typeof BLS_API_BASE;
    retrieved_at: string;
    cache_ttl_seconds: typeof CACHE_TTL_SECONDS;
    served_from_cache: boolean;
    series: typeof US_CPI_SERIES;
  };
  period: { year: string; month: string; name: string };
  cpi: {
    headline_index: number;
    headline_yoy_percent: number;
    core_index: number;
    core_yoy_percent: number;
  };
  summary: string;
  checks: Array<{
    name: "source" | "period" | "headline" | "core";
    status: "pass";
    detail: string;
  }>;
  receipt: {
    id: string;
    issued_at: string;
    subject: "official-data://bls/us-cpi";
    action: { type: "official_data.us_cpi"; resource: string };
    signed: false;
    assurance: "official-source-data";
    note: string;
  };
};

export class UsCpiValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsCpiValidationError";
  }
}

export class UsCpiUpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsCpiUpstreamError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateUsCpiInput(value: unknown): UsCpiInput {
  if (!isRecord(value)) throw new UsCpiValidationError("The request must be an object.");
  if (value.month === undefined || value.month === null || value.month === "") return {};
  if (typeof value.month !== "string" || !/^20\d{2}-(?:0[1-9]|1[0-2])$/u.test(value.month)) {
    throw new UsCpiValidationError("month must use YYYY-MM between 2000-01 and 2099-12.");
  }
  return { month: value.month };
}

function validPoint(value: unknown): value is BlsPoint {
  return isRecord(value) &&
    typeof value.year === "string" && /^20\d{2}$/u.test(value.year) &&
    typeof value.period === "string" && /^M(?:0[1-9]|1[0-2])$/u.test(value.period) &&
    typeof value.periodName === "string" &&
    typeof value.value === "string" && /^\d+(?:\.\d+)?$/u.test(value.value);
}

function parseBlsSeries(payload: unknown, expectedSeries: string) {
  if (!isRecord(payload) || payload.status !== "REQUEST_SUCCEEDED" || !isRecord(payload.Results)) {
    throw new UsCpiUpstreamError("BLS returned an unsuccessful response.");
  }
  const series = payload.Results.series;
  if (!Array.isArray(series) || !isRecord(series[0]) || series[0].seriesID !== expectedSeries) {
    throw new UsCpiUpstreamError("BLS returned an unexpected CPI series.");
  }
  const points = Array.isArray(series[0].data) ? series[0].data.filter(validPoint) : [];
  if (points.length < 13) throw new UsCpiUpstreamError("BLS returned incomplete CPI history.");
  return points;
}

async function fetchSeries(seriesId: string, fetchImpl: typeof fetch) {
  let response: Response;
  try {
    response = await fetchImpl(`${BLS_API_BASE}/${seriesId}`, {
      headers: { Accept: "application/json", "User-Agent": "IntentFence/0.9" },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    throw new UsCpiUpstreamError("The BLS public data API is temporarily unavailable.");
  }
  if (!response.ok) throw new UsCpiUpstreamError("The BLS public data API is temporarily unavailable.");
  return parseBlsSeries(await response.json(), seriesId);
}

async function defaultCache(): Promise<Cache | null> {
  try {
    return typeof caches === "undefined" ? null : await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

async function readCache(cache: Cache | null) {
  if (!cache) return null;
  try {
    const response = await cache.match(CACHE_KEY);
    if (!response) return null;
    const value = await response.json() as unknown;
    return isRecord(value) &&
      typeof value.retrieved_at === "string" &&
      Array.isArray(value.headline) &&
      Array.isArray(value.core)
      ? value as CachedCpiSeries
      : null;
  } catch {
    return null;
  }
}

async function writeCache(cache: Cache | null, value: CachedCpiSeries) {
  if (!cache) return;
  try {
    await cache.put(
      CACHE_KEY,
      new Response(JSON.stringify(value), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}`,
        },
      }),
    );
  } catch {
    // Cache failure must never turn verified upstream data into a failed paid call.
  }
}

function pointKey(point: BlsPoint) {
  return `${point.year}-${point.period.slice(1)}`;
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

function changePercent(current: BlsPoint, previous: BlsPoint) {
  return round((Number(current.value) / Number(previous.value) - 1) * 100);
}

function selectPeriod(series: CachedCpiSeries, requestedMonth?: string) {
  const headline = new Map(series.headline.map((point) => [pointKey(point), point]));
  const core = new Map(series.core.map((point) => [pointKey(point), point]));
  const candidates = requestedMonth
    ? [requestedMonth]
    : [...headline.keys()].sort().reverse();

  for (const month of candidates) {
    const year = Number(month.slice(0, 4));
    const previousMonth = `${year - 1}-${month.slice(5)}`;
    const currentHeadline = headline.get(month);
    const previousHeadline = headline.get(previousMonth);
    const currentCore = core.get(month);
    const previousCore = core.get(previousMonth);
    if (currentHeadline && previousHeadline && currentCore && previousCore) {
      return { month, currentHeadline, previousHeadline, currentCore, previousCore };
    }
  }
  throw new UsCpiValidationError(
    requestedMonth
      ? `BLS does not provide complete headline and core CPI data for ${requestedMonth}.`
      : "BLS does not currently provide a complete CPI period with a prior-year comparison.",
  );
}

export async function getUsCpi(
  input: UsCpiInput,
  dependencies: {
    fetchImpl?: typeof fetch;
    cache?: Cache | null;
    now?: Date;
  } = {},
): Promise<UsCpiDecision> {
  const normalized = validateUsCpiInput(input);
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const now = dependencies.now ?? new Date();
  const cache = dependencies.cache === undefined ? await defaultCache() : dependencies.cache;
  let series = await readCache(cache);
  const servedFromCache = Boolean(series);
  if (!series) {
    const [headline, core] = await Promise.all([
      fetchSeries(US_CPI_SERIES.headline, fetchImpl),
      fetchSeries(US_CPI_SERIES.core, fetchImpl),
    ]);
    series = { retrieved_at: now.toISOString(), headline, core };
    await writeCache(cache, series);
  }

  const selected = selectPeriod(series, normalized.month);
  const headlineYoY = changePercent(selected.currentHeadline, selected.previousHeadline);
  const coreYoY = changePercent(selected.currentCore, selected.previousCore);
  const requestId = crypto.randomUUID();
  const issuedAt = now.toISOString();
  return {
    intentfence: "0.8",
    request_id: requestId,
    status: "verified",
    source: {
      publisher: "U.S. Bureau of Labor Statistics",
      api: BLS_API_BASE,
      retrieved_at: series.retrieved_at,
      cache_ttl_seconds: CACHE_TTL_SECONDS,
      served_from_cache: servedFromCache,
      series: US_CPI_SERIES,
    },
    period: {
      year: selected.currentHeadline.year,
      month: selected.month,
      name: selected.currentHeadline.periodName,
    },
    cpi: {
      headline_index: Number(selected.currentHeadline.value),
      headline_yoy_percent: headlineYoY,
      core_index: Number(selected.currentCore.value),
      core_yoy_percent: coreYoY,
    },
    summary: `U.S. headline CPI was ${headlineYoY.toFixed(3)}% higher year over year in ${selected.currentHeadline.periodName} ${selected.currentHeadline.year}; core CPI was ${coreYoY.toFixed(3)}% higher.`,
    checks: [
      { name: "source", status: "pass", detail: "Values came from the official U.S. Bureau of Labor Statistics public API." },
      { name: "period", status: "pass", detail: `Headline and core series share the ${selected.month} observation period.` },
      { name: "headline", status: "pass", detail: `Headline CPI uses ${US_CPI_SERIES.headline} with a matching prior-year observation.` },
      { name: "core", status: "pass", detail: `Core CPI uses ${US_CPI_SERIES.core} with a matching prior-year observation.` },
    ],
    receipt: {
      id: `if_cpi_${requestId}`,
      issued_at: issuedAt,
      subject: "official-data://bls/us-cpi",
      action: { type: "official_data.us_cpi", resource: `bls:cpi:${selected.month}` },
      signed: false,
      assurance: "official-source-data",
      note: "IntentFence fetched or cache-served official BLS CPI series and computed year-over-year changes from the published index values.",
    },
  };
}

export const usCpiInputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    month: {
      type: "string",
      pattern: "^20[0-9]{2}-(?:0[1-9]|1[0-2])$",
      description: "Optional CPI month in YYYY-MM. Omit for the latest complete headline/core period.",
    },
  },
} as const;
