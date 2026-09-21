import { describe, it, expect } from "vitest";
import {
  calculateCampaignRollup,
  formatKpiMetricLabel,
  type CampaignMetaInput,
  type CampaignPostInput,
} from "./campaign-analytics";

describe("formatKpiMetricLabel", () => {
  it("formats standard metric keys into human-friendly labels", () => {
    expect(formatKpiMetricLabel("clicks")).toBe("Link Clicks");
    expect(formatKpiMetricLabel("impressions")).toBe("Total Impressions");
    expect(formatKpiMetricLabel("reach")).toBe("Audience Reach");
    expect(formatKpiMetricLabel("engagement")).toBe("Total Engagement");
    expect(formatKpiMetricLabel("conversions")).toBe("Conversions");
    expect(formatKpiMetricLabel("leads")).toBe("Leads Generated");
  });

  it("handles null or custom metrics gracefully", () => {
    expect(formatKpiMetricLabel(null)).toBe("Custom KPI");
    expect(formatKpiMetricLabel(undefined)).toBe("Custom KPI");
    expect(formatKpiMetricLabel("signups")).toBe("Signups");
  });
});

describe("calculateCampaignRollup", () => {
  it("handles empty campaign without posts safely", () => {
    const campaign: CampaignMetaInput = {
      budgetCents: 0,
      revenueCents: 0,
      conversions: 0,
    };

    const rollup = calculateCampaignRollup(campaign, []);

    expect(rollup.totalPosts).toBe(0);
    expect(rollup.publishedPosts).toBe(0);
    expect(rollup.impressions).toBe(0);
    expect(rollup.engagement).toBe(0);
    expect(rollup.clicks).toBe(0);
    expect(rollup.averageEngagementRate).toBe(0);
    expect(rollup.roiPct).toBeNull();
    expect(rollup.cpa).toBeNull();
    expect(rollup.cpc).toBeNull();
    expect(rollup.channelBreakdown).toHaveLength(0);
  });

  it("aggregates metrics and calculates channel breakdown", () => {
    const campaign: CampaignMetaInput = {
      budgetCents: 100000, // $1,000.00
      revenueCents: 250000, // $2,500.00
      conversions: 50,
      goalPosts: 10,
      goalEngagement: 500,
      kpiMetric: "clicks",
      kpiTarget: 200,
    };

    const posts: CampaignPostInput[] = [
      {
        id: "p1",
        status: "published",
        channels: [{ platform: "linkedin" }],
        metrics: [
          {
            impressions: 1000,
            reach: 800,
            likes: 40,
            comments: 10,
            shares: 5,
            saves: 5,
            clicks: 60,
            videoViews: 0,
          },
        ],
      },
      {
        id: "p2",
        status: "published",
        channels: [{ platform: "x" }],
        metrics: [
          {
            impressions: 2000,
            reach: 1500,
            likes: 80,
            comments: 20,
            shares: 10,
            saves: 10,
            clicks: 90,
            videoViews: 0,
          },
        ],
      },
      {
        id: "p3",
        status: "scheduled",
        channels: [{ platform: "instagram" }],
        metrics: [],
      },
    ];

    const rollup = calculateCampaignRollup(campaign, posts);

    expect(rollup.totalPosts).toBe(3);
    expect(rollup.publishedPosts).toBe(2);
    expect(rollup.scheduledPosts).toBe(1);
    expect(rollup.draftPosts).toBe(0);

    expect(rollup.impressions).toBe(3000);
    expect(rollup.reach).toBe(2300);
    expect(rollup.engagement).toBe(180); // (40+10+5+5) + (80+20+10+10) = 60 + 120
    expect(rollup.clicks).toBe(150); // 60 + 90

    // Financials
    expect(rollup.roiPct).toBe(150); // (2500 - 1000) / 1000 * 100 = 150%
    expect(rollup.cpa).toBe(2000); // 100000 / 50 = 2000 ($20 / conversion)
    expect(rollup.cpc).toBe(667); // 100000 / 150 = 666.67 -> 667 cents

    // Goals & KPIs
    expect(rollup.postProgressPct).toBe(30); // 3 / 10 = 30%
    expect(rollup.engagementProgressPct).toBe(36); // 180 / 500 = 36%
    expect(rollup.kpiCurrent).toBe(150); // clicks = 150
    expect(rollup.kpiProgressPct).toBe(75); // 150 / 200 = 75%

    // Channel breakdown
    expect(rollup.channelBreakdown).toHaveLength(3);
    const li = rollup.channelBreakdown.find((c) => c.platform === "linkedin");
    expect(li).toBeDefined();
    expect(li?.impressions).toBe(1000);
    expect(li?.engagement).toBe(60);
    expect(li?.engagementRate).toBe(6); // 60 / 1000 * 100 = 6%
  });

  it("calculates timeline duration, days remaining, and pacing status", () => {
    const campaign: CampaignMetaInput = {
      startDate: new Date("2026-09-01T00:00:00Z"),
      endDate: new Date("2026-09-30T00:00:00Z"),
      goalPosts: 10,
    };

    // Reference date: midway through campaign (Sept 15)
    const midDate = new Date("2026-09-15T00:00:00Z");

    // Case 1: On track (5 of 10 posts halfway through)
    const postsOnTrack: CampaignPostInput[] = Array.from({ length: 5 }, (_, i) => ({
      id: `p${i}`,
      status: "published",
      channels: [{ platform: "x" }],
      metrics: [],
    }));

    const rollupOnTrack = calculateCampaignRollup(campaign, postsOnTrack, midDate);
    expect(rollupOnTrack.durationDays).toBe(29);
    expect(rollupOnTrack.daysRemaining).toBe(15);
    expect(rollupOnTrack.pacingStatus).toBe("on_track");

    // Case 2: Ahead of schedule (8 of 10 posts halfway through)
    const postsAhead: CampaignPostInput[] = Array.from({ length: 8 }, (_, i) => ({
      id: `p${i}`,
      status: "published",
      channels: [{ platform: "x" }],
      metrics: [],
    }));

    const rollupAhead = calculateCampaignRollup(campaign, postsAhead, midDate);
    expect(rollupAhead.pacingStatus).toBe("ahead");

    // Case 3: Behind schedule (1 of 10 posts halfway through)
    const postsBehind: CampaignPostInput[] = [
      {
        id: "p1",
        status: "published",
        channels: [{ platform: "x" }],
        metrics: [],
      },
    ];

    const rollupBehind = calculateCampaignRollup(campaign, postsBehind, midDate);
    expect(rollupBehind.pacingStatus).toBe("behind");
  });
});
