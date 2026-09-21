import { describe, it, expect } from "vitest";
import { synthesizeAnalyticsBrief } from "./analytics-ai";

describe("Analytics AI Period Synthesizer", () => {
  it("returns fallback summary when no activity is recorded", () => {
    const brief = synthesizeAnalyticsBrief({
      days: 30,
      totals: { followers: 100, reach: 0, impressions: 0, engagement: 0 },
      deltas: { followerGrowth: 0, reach: 0, impressions: 0, engagementRate: 0 },
      engagementRate: 0,
      postCount: 0,
      byFormat: [],
      byPlatform: [],
      bestSlots: [],
    });

    expect(brief.summary).toContain("Insufficient activity observed");
    expect(brief.highlights).toHaveLength(0);
    expect(brief.recommendations.length).toBeGreaterThan(0);
  });

  it("synthesizes executive summary, highlights, and platform insights", () => {
    const brief = synthesizeAnalyticsBrief({
      days: 30,
      totals: { followers: 12500, reach: 45000, impressions: 92000, engagement: 4600 },
      deltas: { followerGrowth: 5.2, reach: 12.0, impressions: 18.5, engagementRate: 0.8 },
      engagementRate: 5.0,
      postCount: 15,
      byFormat: [
        { format: "Carousel", posts: 5, avgEngagementRate: 6.2, impressions: 35000 },
        { format: "Image", posts: 6, avgEngagementRate: 4.1, impressions: 32000 },
        { format: "Video", posts: 4, avgEngagementRate: 4.8, impressions: 25000 },
      ],
      byPlatform: [
        { platform: "instagram", posts: 8, engagement: 3100, avgEngagementRate: 5.8 },
        { platform: "linkedin", posts: 7, engagement: 1500, avgEngagementRate: 4.2 },
      ],
      bestSlots: [{ day: 2, hour: 14, value: 45 }],
    });

    expect(brief.summary).toContain("4,600 interactions");
    expect(brief.summary).toContain("5.0%");
    expect(brief.topPlatform).toBe("instagram");
    expect(brief.topFormat).toBe("Carousel");
    expect(brief.highlights.length).toBeGreaterThanOrEqual(3);
    expect(brief.highlights.some((h) => h.includes("INSTAGRAM"))).toBe(true);
    expect(brief.recommendations.some((r) => r.includes("Carousel"))).toBe(true);
    expect(brief.recommendations.some((r) => r.includes("Tuesday at 14:00"))).toBe(true);
  });
});
