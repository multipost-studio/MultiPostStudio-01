import { describe, it, expect } from "vitest";
import { dueForRecycle, lastActivity } from "./recycling";

/**
 * The recycling page let people set "every Nd, max M reposts, ≥Gd gap" and
 * nothing ever read those numbers — no code in the app touched a RecycleRule.
 * These pin the caps the user configured to what the engine actually enforces,
 * because getting them wrong means reposting to a real audience too often.
 */

const DAY = 86_400_000;
const NOW = new Date("2026-09-07T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);
const rule = { maxReposts: 3, frequencyDays: 30 };

/** A published post with the given reposts already made. */
function post(publishedDaysAgo: number | null, repostDaysAgo: number[] = []) {
  return {
    publishedAt: publishedDaysAgo === null ? null : daysAgo(publishedDaysAgo),
    recycles: repostDaysAgo.map((d) => ({ scheduledAt: daysAgo(d), createdAt: daysAgo(d) })),
  };
}

describe("dueForRecycle", () => {
  it("recycles a post whose last outing is older than the frequency", () => {
    expect(dueForRecycle(post(31), rule, NOW)).toBe(true);
  });

  it("holds a post that went out more recently than the frequency", () => {
    expect(dueForRecycle(post(29), rule, NOW)).toBe(false);
  });

  it("treats the boundary day as due", () => {
    expect(dueForRecycle(post(30), rule, NOW)).toBe(true);
  });

  it("counts from the most recent repost, not the original publish", () => {
    // Published 90d ago but reposted 5d ago — nowhere near due again.
    expect(dueForRecycle(post(90, [5]), rule, NOW)).toBe(false);
    expect(dueForRecycle(post(90, [40]), rule, NOW)).toBe(true);
  });

  it("stops at maxReposts however old the post is", () => {
    expect(dueForRecycle(post(400, [300, 200, 100]), rule, NOW)).toBe(false);
    expect(dueForRecycle(post(400, [300, 200]), rule, NOW)).toBe(true);
  });

  it("never recycles a post that never published", () => {
    // publishedAt null would otherwise read as epoch 0 — infinitely overdue.
    expect(dueForRecycle(post(null), rule, NOW)).toBe(false);
    expect(dueForRecycle(post(null, [1]), rule, NOW)).toBe(false);
  });

  it("respects a rule that allows no reposts at all", () => {
    expect(dueForRecycle(post(400), { maxReposts: 0, frequencyDays: 30 }, NOW)).toBe(false);
  });
});

describe("lastActivity", () => {
  it("is the latest of the publish and every repost", () => {
    expect(lastActivity(post(90, [60, 10, 30]))).toBe(daysAgo(10).getTime());
  });

  it("falls back to createdAt for a repost with no scheduled time", () => {
    const p = {
      publishedAt: daysAgo(90),
      recycles: [{ scheduledAt: null, createdAt: daysAgo(7) }],
    };
    expect(lastActivity(p)).toBe(daysAgo(7).getTime());
  });

  it("is the publish date when nothing has been recycled", () => {
    expect(lastActivity(post(12))).toBe(daysAgo(12).getTime());
  });
});
