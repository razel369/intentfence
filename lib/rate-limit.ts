import { env } from "cloudflare:workers";

type D1RateLimitEnv = {
  DB: D1Database;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
};

function clientIdentity(request: Request): string {
  const address = request.headers.get("cf-connecting-ip") ?? "unknown";
  const agent = request.headers.get("user-agent")?.slice(0, 300) ?? "unknown";
  return `${address}\n${agent}`;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * D1-backed fixed-window limiter. It stores only a one-way hash of the client
 * identity and fails closed when the backing store is unavailable.
 */
export async function enforceRequestRateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowSeconds = 60,
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1_000);
  const windowStart = Math.floor(now / windowSeconds) * windowSeconds;
  const keyHash = await sha256(clientIdentity(request));
  const db = (env as unknown as D1RateLimitEnv).DB;
  const row = await db
    .prepare(
      `INSERT INTO request_rate_limits (scope, key_hash, window_start, request_count)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(scope, key_hash, window_start)
       DO UPDATE SET request_count = request_count + 1
       RETURNING request_count`,
    )
    .bind(scope, keyHash, windowStart)
    .first<{ request_count: number }>();
  const requestCount = Number(row?.request_count ?? limit + 1);

  return {
    allowed: requestCount <= limit,
    limit,
    remaining: Math.max(0, limit - requestCount),
    resetAt: windowStart + windowSeconds,
  };
}
