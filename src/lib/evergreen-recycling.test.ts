import { describe, it, expect } from "vitest";
import {
  dueForRecycle,
  alternateHashtags,
  pickNextVariation,
  isExhaustedByEngagement,
} from "./adapters/recycling";

const DAY = 86_400_000;
const NOW = new Date("2026-09-20T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

describe("dueForRecycle advanced features", () => {
  const baseRule = { maxReposts: 5, frequencyDays: 30 };

  it("never recycles a paused post", () => {
    const post = {
      publishedAt: daysAgo(60),
      recycles: [],
      recyclePaused: true,
      recycleExhausted: false,
    };
    expect(dueForRecycle(post, baseRule, NOW)).toBe(false);
  });

  it("never recycles an exhausted post", () => {
    const post = {
      publishedAt: daysAgo(60),
      recycles: [],
      recyclePaused: false,
      recycleExhausted: true,
    };
    expect(dueForRecycle(post, baseRule, NOW)).toBe(false);
  });

  it("applies exponential decay factor to extend intervals between reposts", () => {
    const decayRule = { maxReposts: 5, frequencyDays: 30, decayFactor: 1.5 };

    // 0 reposts: 30 * (1.5^0) = 30 days
    const post0 = {
      publishedAt: daysAgo(31),
      recycles: [],
    };
    expect(dueForRecycle(post0, decayRule, NOW)).toBe(true);

    // 1 repost: 30 * (1.5^1) = 45 days
    const post1Recent = {
      publishedAt: daysAgo(100),
      recycles: [{ scheduledAt: daysAgo(35), createdAt: daysAgo(35) }], // 35d ago (< 45d)
    };
    expect(dueForRecycle(post1Recent, decayRule, NOW)).toBe(false);

    const post1Due = {
      publishedAt: daysAgo(100),
      recycles: [{ scheduledAt: daysAgo(46), createdAt: daysAgo(46) }], // 46d ago (>= 45d)
    };
    expect(dueForRecycle(post1Due, decayRule, NOW)).toBe(true);

    // 2 reposts: 30 * (1.5^2) = 67.5 -> 68 days
    const post2 = {
      publishedAt: daysAgo(200),
      recycles: [
        { scheduledAt: daysAgo(120), createdAt: daysAgo(120) },
        { scheduledAt: daysAgo(60), createdAt: daysAgo(60) }, // 60d ago (< 68d)
      ],
    };
    expect(dueForRecycle(post2, decayRule, NOW)).toBe(false);
  });
});

describe("isExhaustedByEngagement", () => {
  it("returns false if threshold is null, undefined, or zero", () => {
    expect(isExhaustedByEngagement([{ engagementRate: 0.5 }], null)).toBe(false);
    expect(isExhaustedByEngagement([{ engagementRate: 0.5 }], 0)).toBe(false);
  });

  it("returns true when engagement drops below threshold", () => {
    expect(isExhaustedByEngagement([{ engagementRate: 1.2 }], 2.0)).toBe(true);
  });

  it("returns false when engagement meets or exceeds threshold", () => {
    expect(isExhaustedByEngagement([{ engagementRate: 2.5 }], 2.0)).toBe(false);
    expect(isExhaustedByEngagement([{ engagementRate: 2.0 }], 2.0)).toBe(false);
  });
});

describe("pickNextVariation", () => {
  it("returns default body if no variations provided", () => {
    expect(pickNextVariation("Original post body", null, 0)).toBe("Original post body");
    expect(pickNextVariation("Original post body", "", 1)).toBe("Original post body");
  });

  it("rotates through string array variations based on recycle count", () => {
    const variations = JSON.stringify([
      "First alternate hook",
      "Second alternate angle",
      "Third variation with story",
    ]);

    expect(pickNextVariation("Default", variations, 0)).toBe("First alternate hook");
    expect(pickNextVariation("Default", variations, 1)).toBe("Second alternate angle");
    expect(pickNextVariation("Default", variations, 2)).toBe("Third variation with story");
    // Cycles back to 0
    expect(pickNextVariation("Default", variations, 3)).toBe("First alternate hook");
  });

  it("supports structured variation objects", () => {
    const variations = JSON.stringify([
      { body: "Custom body variation 1" },
      { body: "Custom body variation 2" },
    ]);

    expect(pickNextVariation("Default", variations, 0)).toBe("Custom body variation 1");
    expect(pickNextVariation("Default", variations, 1)).toBe("Custom body variation 2");
  });
});

describe("alternateHashtags", () => {
  it("leaves text untouched if 0 or 1 hashtag is present", () => {
    expect(alternateHashtags("Hello world")).toBe("Hello world");
    expect(alternateHashtags("Hello #world")).toBe("Hello #world");
  });

  it("rotates hashtag positions based on seed", () => {
    const text = "Great tips #tech #saas #growth";
    const rotated = alternateHashtags(text, 1);
    expect(rotated).toContain("#saas");
    expect(rotated).toContain("#growth");
    expect(rotated).toContain("#tech");
    expect(rotated).toBe("Great tips #saas #growth #tech");
  });
});
