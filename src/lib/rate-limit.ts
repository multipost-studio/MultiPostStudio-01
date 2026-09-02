import { flags, env } from "@/lib/env";
import { logger } from "@/lib/logger";

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

/** Throwing helper for server actions. */
export class RateLimitError extends Error {
  constructor(public resetAt: number) {
    super("Too many requests — please slow down and try again shortly.");
    this.name = "RateLimitError";
  }
}

export async function enforceRateLimit(key: string, limit: number, windowMs = 60_000) {
  const res = await rateLimit(key, limit, windowMs);
  if (!res.ok) throw new RateLimitError(res.resetAt);
  return res;
}
