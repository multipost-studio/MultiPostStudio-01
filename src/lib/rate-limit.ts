import { headers } from "next/headers";
import { flags, env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Best-effort client IP for rate-limit keying.
 *
 * `x-forwarded-for` can carry client-supplied entries before the proxy's own
 * (a client can send `X-Forwarded-For: 1.2.3.4` and Vercel's edge appends the
 * real IP after it) — taking the FIRST entry lets an attacker pick their own
 * rate-limit bucket per request and bypass the limit entirely. `x-real-ip` is
 * set by Vercel's edge to the actual connecting IP and isn't client-settable,
 * so prefer it; only fall back to x-forwarded-for's LAST entry (the one the
 * proxy itself appended), never the first.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const real = h.get("x-real-ip");
  if (real) return real.trim();
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return "unknown";
}

/**
 * Fixed-window rate limiter. In-memory by default (fine for a single instance);
 * uses Upstash Redis when UPSTASH_REDIS_REST_URL/TOKEN are set so limits hold
 * across instances.
 *
 * ponytail: fixed window, not sliding — a burst can straddle the boundary and
 * briefly allow 2x. Good enough for abuse control; swap to @upstash/ratelimit's
 * slidingWindow if precise shaping matters.
 */

export type RateResult = { ok: boolean; remaining: number; resetAt: number };

const buckets = new Map<string, { count: number; resetAt: number }>();

function memoryLimit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { ok: true, remaining: limit - 1, resetAt };
  }
  b.count += 1;
  return { ok: b.count <= limit, remaining: Math.max(0, limit - b.count), resetAt: b.resetAt };
}

// Opportunistic sweep so the Map can't grow unbounded.
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }, 60_000).unref?.();
}

let redis: import("@upstash/redis").Redis | null = null;
async function getRedis() {
  if (redis || !flags.distributedRateLimit) return redis;
  const { Redis } = await import("@upstash/redis");
  redis = new Redis({ url: env.UPSTASH_REDIS_REST_URL!, token: env.UPSTASH_REDIS_REST_TOKEN! });
  return redis;
}

async function redisLimit(key: string, limit: number, windowMs: number): Promise<RateResult> {
  const r = (await getRedis())!;
  // Prefer precise sliding-window via @upstash/ratelimit when available —
  // falls back to the fixed-window INCR below if the package import fails.
  try {
    const { Ratelimit } = await import("@upstash/ratelimit");
    const windowSec = Math.max(1, Math.ceil(windowMs / 1000));
    const rl = new Ratelimit({
      redis: r as unknown as ConstructorParameters<typeof Ratelimit>[0]["redis"],
      // e.g. 10 requests per "60 s"
      limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`),
      analytics: false,
      prefix: "rl:sw",
    });
    const res = await rl.limit(key);
    return {
      ok: res.success,
      remaining: Math.max(0, res.remaining),
      resetAt: res.reset,
    };
  } catch {
    // Fall through to fixed-window below (keeps behavior on import failure).
  }
  const windowSec = Math.ceil(windowMs / 1000);
  const rkey = `rl:${key}:${Math.floor(Date.now() / windowMs)}`;
  const count = await r.incr(rkey);
  if (count === 1) await r.expire(rkey, windowSec);
  const resetAt = (Math.floor(Date.now() / windowMs) + 1) * windowMs;
  return { ok: count <= limit, remaining: Math.max(0, limit - count), resetAt };
}

/**
 * @param key   caller identity — e.g. `login:${ip}` or `ai:${userId}`
 * @param limit max requests per window
 * @param windowMs window length in ms (default 60s)
 */
export async function rateLimit(key: string, limit: number, windowMs = 60_000): Promise<RateResult> {
  try {
    if (flags.distributedRateLimit) return await redisLimit(key, limit, windowMs);
  } catch (e) {
    logger.warn({ err: e }, "redis rate-limit failed, falling back to memory");
  }
  return memoryLimit(key, limit, windowMs);
}

const abuseCounters = new Map<string, { hits: number; lastAt: number }>();

function recordAbuse(bucket: string) {
  const c = abuseCounters.get(bucket) ?? { hits: 0, lastAt: 0 };
  c.hits += 1;
  c.lastAt = Date.now();
  abuseCounters.set(bucket, c);
  if (abuseCounters.size > 200) {
    const oldest = [...abuseCounters.entries()].sort((a, b) => a[1].lastAt - b[1].lastAt)[0]?.[0];
    if (oldest) abuseCounters.delete(oldest);
  }
}

/** In-memory abuse counters for health/admin observability (no DB writes). */
export function getAbuseStats() {
  return [...abuseCounters.entries()].map(([bucket, v]) => ({ bucket, ...v }));
}

/** Throwing helper for server actions. */
export class RateLimitError extends Error {
  constructor(public resetAt: number) {
    super("Too many requests — please slow down and try again shortly.");
    this.name = "RateLimitError";
  }
}

export async function enforceRateLimit(key: string, limit: number, windowMs = 60_000) {
  const res = await rateLimit(key, limit, windowMs);
  if (!res.ok) {
    // Abuse telemetry: rate-limit hits are the earliest signal of brute-force,
    // scraping, or runaway loops. Pino-redacted logger only (no DB write, so
    // the limiter itself can't become a write-amplification vector). The
    // bucket prefix (before ":") identifies the flow without logging PII.
    logger.warn({ bucket: key.split(":")[0], limit, windowMs }, "rate limit exceeded");
    recordAbuse(key.split(":")[0]);
    throw new RateLimitError(res.resetAt);
  }
  return res;
}

/** Seconds until `resetAt` (for `Retry-After`). Always >= 0. */
export function retryAfterSec(resetAt: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((resetAt - now) / 1000));
}

/** Standard rate-limit response headers. Safe to attach to 200 and 429 alike. */
export function rateLimitHeaders(result: RateResult, limit: number): HeadersInit {
  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
    ...(result.ok ? {} : { "Retry-After": String(retryAfterSec(result.resetAt)) }),
  };
}

/**
 * One-call throttle for API routes and server actions that need headers.
 * Returns the raw result plus ready-to-send headers.
 */
export async function throttle(key: string, limit: number, windowMs = 60_000) {
  const result = await rateLimit(key, limit, windowMs);
  return { ...result, headers: rateLimitHeaders(result, limit) };
}
