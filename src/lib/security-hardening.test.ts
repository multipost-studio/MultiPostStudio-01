import { describe, it, expect } from "vitest";
import { rateLimit, enforceRateLimit, RateLimitError, retryAfterSec, rateLimitHeaders, throttle } from "./rate-limit";
import { apiError } from "./api/respond";
import { verifyTurnstile } from "./bot-protection";
import { isRetryablePublishError } from "./adapters/publish";

describe("security hardening: rate-limit headers", () => {
  it("retryAfterSec is non-negative and ceil-seconds", () => {
    const now = Date.now();
    expect(retryAfterSec(now + 1500, now)).toBe(2);
    expect(retryAfterSec(now - 1000, now)).toBe(0);
  });

  it("rateLimitHeaders includes Retry-After only on block", async () => {
    const key = `sec:${Math.random()}`;
    const okRes = await rateLimit(key, 5, 60_000);
    expect(okRes.ok).toBe(true);
    const hOk = rateLimitHeaders(okRes, 5) as Record<string, string>;
    expect(hOk["X-RateLimit-Limit"]).toBe("5");
    expect(hOk["Retry-After"]).toBeUndefined();

    const blocked = await rateLimit(key, 1, 60_000);
    // key already consumed once above under a different limit bucket window —
    // force a fresh block:
    const k2 = `sec:${Math.random()}`;
    await rateLimit(k2, 1, 60_000);
    const b2 = await rateLimit(k2, 1, 60_000);
    expect(b2.ok).toBe(false);
    const hBlock = rateLimitHeaders(b2, 1) as Record<string, string>;
    expect(Number(hBlock["Retry-After"])).toBeGreaterThanOrEqual(0);
    expect(blocked).toBeDefined();
  });

  it("throttle returns headers", async () => {
    const t = await throttle(`sec:${Math.random()}`, 10, 60_000);
    expect(t.ok).toBe(true);
    expect(t.headers).toBeDefined();
  });

  it("enforceRateLimit throws RateLimitError with resetAt", async () => {
    const k = `sec:${Math.random()}`;
    await enforceRateLimit(k, 1, 60_000);
    await expect(enforceRateLimit(k, 1, 60_000)).rejects.toBeInstanceOf(RateLimitError);
  });
});

describe("security hardening: apiError 429", () => {
  it("always sets Retry-After on 429", async () => {
    const res = apiError(429, "slow down", undefined, { retryAfterSec: 42 });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(false);
  });

  it("defaults Retry-After to 60s when unknown", async () => {
    const res = apiError(429, "slow down");
    expect(res.headers.get("Retry-After")).toBe("60");
  });
});

describe("security hardening: bot protection fail-open", () => {
  it("skips verification when Turnstile is unconfigured", async () => {
    // No TURNSTILE_SECRET_KEY in test env → skipped:true, ok:true
    const r = await verifyTurnstile(null);
    expect(r.ok).toBe(true);
  });
});

describe("security hardening: publish retry classification", () => {
  it("treats 429/5xx as retryable, 4xx auth as terminal", () => {
    expect(isRetryablePublishError("429 too many requests")).toBe(true);
    expect(isRetryablePublishError("500 internal")).toBe(true);
    expect(isRetryablePublishError("401 unauthorized")).toBe(false);
    expect(isRetryablePublishError("403 forbidden")).toBe(false);
  });
});
