import { describe, it, expect } from "vitest";
import { rateLimit, enforceRateLimit, RateLimitError } from "./rate-limit";

// No UPSTASH_* env in tests → in-memory fixed-window path.

describe("rateLimit (memory)", () => {
  it("allows up to the limit then blocks within the window", async () => {
    const key = `test:${Math.random()}`;
    const a = await rateLimit(key, 3, 10_000);
    const b = await rateLimit(key, 3, 10_000);
    const c = await rateLimit(key, 3, 10_000);
    const d = await rateLimit(key, 3, 10_000);
    expect([a.ok, b.ok, c.ok, d.ok]).toEqual([true, true, true, false]);
    expect(a.remaining).toBe(2);
    expect(d.remaining).toBe(0);
  });

  it("resets after the window elapses", async () => {
    const key = `test:${Math.random()}`;
    await rateLimit(key, 1, 20); // consume
    const blocked = await rateLimit(key, 1, 20);
    expect(blocked.ok).toBe(false);
    await new Promise((r) => setTimeout(r, 30));
    const fresh = await rateLimit(key, 1, 20);
    expect(fresh.ok).toBe(true);
  });

  it("keys are independent", async () => {
    const k1 = `test:${Math.random()}`;
    const k2 = `test:${Math.random()}`;
    await rateLimit(k1, 1, 10_000);
    expect((await rateLimit(k2, 1, 10_000)).ok).toBe(true);
  });
});

describe("enforceRateLimit", () => {
  it("throws RateLimitError with a resetAt once over the limit", async () => {
    const key = `test:${Math.random()}`;
    await enforceRateLimit(key, 1, 10_000);
    await expect(enforceRateLimit(key, 1, 10_000)).rejects.toBeInstanceOf(RateLimitError);
  });
});
