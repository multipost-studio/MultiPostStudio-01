import { describe, it, expect } from "vitest";
import {
  rankSlots,
  describeSlot,
  nextOccurrence,
  zonedParts,
  MIN_SAMPLES_PER_SLOT,
  MIN_TOTAL_POSTS,
  type PostOutcome,
} from "./best-time";

/**
 * `ai_best_time` was sold on Pro with no implementation behind it. The risk in
 * writing one is inventing a confident answer from two data points, so these
 * pin the refusal as hard as the ranking.
 */

/** Bucket in UTC, so the arithmetic tests don't depend on a timezone. */
const utcParts = (d: Date) => ({ weekday: d.getUTCDay(), hour: d.getUTCHours() });

/** A published post at a given weekday/hour with a given engagement rate. */
function at(day: string, hour: number, rate: number): PostOutcome {
  return {
    publishedAt: new Date(`${day}T${String(hour).padStart(2, "0")}:00:00Z`),
    engagementRate: rate,
  };
}

// 2026-09-07 is a Monday, so 09-08 is Tuesday and 09-09 a Wednesday.
const TUE = "2026-09-08";
const WED = "2026-09-09";

describe("rankSlots", () => {
  it("ranks the better-performing hour first", () => {
    const outcomes = [
      ...Array.from({ length: 5 }, () => at(TUE, 8, 6)),
      ...Array.from({ length: 5 }, () => at(WED, 15, 2)),
    ];
    const r = rankSlots(outcomes, utcParts);
    expect(r.insufficient).toBe(false);
    expect(r.slots[0].hour).toBe(8);
    expect(r.slots[0].avgEngagementRate).toBeCloseTo(6);
  });

  it("refuses to answer without enough history at all", () => {
    // Three posts is not a posting pattern.
    const r = rankSlots([at(TUE, 8, 9), at(TUE, 8, 9), at(TUE, 8, 9)], utcParts);
    expect(r.sampleSize).toBe(3);
    expect(r.insufficient).toBe(true);
  });

  it("drops a slot backed by a single post however well it did", () => {
    // The dangerous case: one lucky post at 3am becoming "your best time".
    const outcomes = [
      at(WED, 3, 99),
      ...Array.from({ length: 8 }, () => at(TUE, 10, 4)),
    ];
    const r = rankSlots(outcomes, utcParts);
    expect(r.slots.some((s) => s.hour === 3)).toBe(false);
    expect(r.slots[0].hour).toBe(10);
  });

  it("is insufficient when no slot clears the sample threshold", () => {
    // Ten posts, all at different hours — no repeated slot, so nothing to say.
    const outcomes = Array.from({ length: 10 }, (_, i) => at(TUE, i, 5));
    const r = rankSlots(outcomes, utcParts);
    expect(r.sampleSize).toBe(10);
    expect(r.slots).toHaveLength(0);
    expect(r.insufficient).toBe(true);
  });

  it("breaks a tie on the better-evidenced slot", () => {
    const outcomes = [
      ...Array.from({ length: 6 }, () => at(TUE, 8, 5)),
      ...Array.from({ length: 2 }, () => at(WED, 9, 5)),
    ];
    const r = rankSlots(outcomes, utcParts);
    expect(r.slots[0].hour).toBe(8);
    expect(r.slots[0].posts).toBe(6);
  });

  it("averages rather than summing, so a busy slot isn't flattered", () => {
    const outcomes = [
      ...Array.from({ length: 10 }, () => at(TUE, 8, 2)), // lots of mediocre posts
      ...Array.from({ length: 3 }, () => at(WED, 20, 7)), // fewer, better ones
    ];
    const r = rankSlots(outcomes, utcParts);
    expect(r.slots[0].hour).toBe(20);
  });

  it("has thresholds that mean what the names say", () => {
    expect(MIN_SAMPLES_PER_SLOT).toBeGreaterThan(1);
    expect(MIN_TOTAL_POSTS).toBeGreaterThan(MIN_SAMPLES_PER_SLOT);
  });

  it("handles no history without throwing", () => {
    const r = rankSlots([], utcParts);
    expect(r.slots).toEqual([]);
    expect(r.insufficient).toBe(true);
  });
});

describe("describeSlot", () => {
  it("names the day and pads the hour", () => {
    expect(describeSlot({ weekday: 2, hour: 8, posts: 3, avgEngagementRate: 5 })).toBe(
      "Tuesday at 08:00",
    );
    expect(describeSlot({ weekday: 0, hour: 19, posts: 3, avgEngagementRate: 5 })).toBe(
      "Sunday at 19:00",
    );
  });
});

describe("timezone handling", () => {
  it("buckets by the viewer's day, not UTC's", () => {
    // 2026-09-08T20:30Z is Tuesday evening in UTC but already Wednesday in
    // Kolkata (+05:30). Bucketing this wrong shifts every recommendation.
    const d = new Date("2026-09-08T20:30:00Z");
    expect(zonedParts(d, "UTC").weekday).toBe(2); // Tuesday
    expect(zonedParts(d, "Asia/Kolkata").weekday).toBe(3); // Wednesday
    expect(zonedParts(d, "Asia/Kolkata").hour).toBe(2);
  });

  it("finds the next occurrence in the future", () => {
    const from = new Date("2026-09-07T12:00:00Z"); // a Monday
    const next = nextOccurrence({ weekday: 2, hour: 8, posts: 3, avgEngagementRate: 5 }, "UTC", from);
    expect(next.getTime()).toBeGreaterThan(from.getTime());
    expect(zonedParts(next, "UTC").weekday).toBe(2);
    expect(zonedParts(next, "UTC").hour).toBe(8);
  });

  it("lands on the right local hour in a non-UTC zone", () => {
    const from = new Date("2026-09-07T12:00:00Z");
    const slot = { weekday: 3, hour: 9, posts: 3, avgEngagementRate: 5 };
    const next = nextOccurrence(slot, "Asia/Kolkata", from);
    expect(zonedParts(next, "Asia/Kolkata").hour).toBe(9);
    expect(zonedParts(next, "Asia/Kolkata").weekday).toBe(3);
  });

  it("skips today when that hour has already passed", () => {
    // Monday 18:00, asking for the Monday 08:00 slot — must be next week.
    const from = new Date("2026-09-07T18:00:00Z");
    const next = nextOccurrence({ weekday: 1, hour: 8, posts: 3, avgEngagementRate: 5 }, "UTC", from);
    expect(next.getTime()).toBeGreaterThan(from.getTime());
    expect(zonedParts(next, "UTC").weekday).toBe(1);
  });
});
