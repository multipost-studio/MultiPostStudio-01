import { describe, it, expect, vi, beforeEach } from "vitest";
import { getGbpAnalyticsAction } from "./gbp-analytics";
import { db } from "@/lib/db";
import { withPermission, ensureInWorkspace } from "./_helpers";
import { refreshIfNeeded } from "@/lib/social/oauth";
import * as gbpa from "@/lib/integrations/gbp-analytics";

vi.mock("./_helpers", () => ({
  withPermission: vi.fn(),
  ensureInWorkspace: vi.fn(),
  ok: (data?: unknown, message?: string) => ({ ok: true, data, message }),
  fail: (error: string) => ({ ok: false, error }),
}));

vi.mock("@/lib/social/oauth", () => ({
  refreshIfNeeded: vi.fn(),
}));

vi.mock("@/lib/integrations/gbp-analytics", () => ({
  fetchGbpPerformanceDashboard: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    socialAccount: { findUnique: vi.fn() },
    gbpAnalyticsCache: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}));

const CTX = {
  active: {
    workspace: { id: "ws_test" },
    permissions: ["analytics.view"],
  },
  user: { id: "user_test" },
};

const MOCK_ACCOUNT = {
  id: "acc_gbp_1",
  platform: "gbp",
  workspaceId: "ws_test",
  channels: [
    { id: "chan_1", name: "Downtown Store", handle: "locations/12345" },
  ],
};

const MOCK_DASHBOARD: gbpa.GbpAnalyticsDashboardData = {
  locationId: "locations/12345",
  locationTitle: "Downtown Store",
  summary: {
    searchImpressions: 1200,
    mapsImpressions: 400,
    totalImpressions: 1600,
    websiteClicks: 150,
    callClicks: 45,
    directionRequests: 95,
    bookings: 12,
    topKeywordsCount: 1,
  },
  timeSeries: [],
  searchKeywords: [
    { keyword: "best coffee", insightsValue: 120 },
  ],
};

describe("getGbpAnalyticsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(withPermission).mockResolvedValue(CTX as never);
    vi.mocked(ensureInWorkspace).mockResolvedValue(undefined as never);
    vi.mocked(refreshIfNeeded).mockResolvedValue("fresh_token");
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue(MOCK_ACCOUNT as never);
    vi.mocked(gbpa.fetchGbpPerformanceDashboard).mockResolvedValue(MOCK_DASHBOARD);
    vi.mocked(db.gbpAnalyticsCache.findUnique).mockResolvedValue(null);
    vi.mocked(db.gbpAnalyticsCache.upsert).mockResolvedValue({
      fetchedAt: new Date("2026-10-01T12:00:00Z"),
    } as never);
  });

  it("fails if account is not in active workspace", async () => {
    vi.mocked(ensureInWorkspace).mockRejectedValueOnce(new Error("Unauthorized workspace access"));
    const res = await getGbpAnalyticsAction("acc_gbp_1", "locations/12345", "28");
    expect(res.ok).toBe(false);
    expect(res.error).toBe("Unauthorized workspace access");
    expect(gbpa.fetchGbpPerformanceDashboard).not.toHaveBeenCalled();
  });

  it("fails if account is not a GBP platform account", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValueOnce({
      ...MOCK_ACCOUNT,
      platform: "instagram",
    } as never);

    const res = await getGbpAnalyticsAction("acc_gbp_1", "locations/12345", "28");
    expect(res.ok).toBe(false);
    expect(res.error).toContain("Google Business Profile account not found");
  });

  it("fails if custom range has invalid dates", async () => {
    const res = await getGbpAnalyticsAction("acc_gbp_1", "locations/12345", "custom", {
      customStart: "invalid-date",
      customEnd: "2026-10-01",
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("Invalid custom date range");
  });

  it("fails if custom range start is after end", async () => {
    const res = await getGbpAnalyticsAction("acc_gbp_1", "locations/12345", "custom", {
      customStart: "2026-10-10",
      customEnd: "2026-10-01",
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("Start date must be before end date");
  });

  it("fetches fresh analytics and caches in database when no fresh cache exists", async () => {
    const res = await getGbpAnalyticsAction("acc_gbp_1", "locations/12345", "28");
    expect(res.ok).toBe(true);
    expect(res.data?.summary.totalImpressions).toBe(1600);
    expect(res.data?.isCached).toBe(false);
    expect(gbpa.fetchGbpPerformanceDashboard).toHaveBeenCalledTimes(1);
    expect(db.gbpAnalyticsCache.upsert).toHaveBeenCalledTimes(1);
  });

  it("returns cached data within TTL without calling Google API", async () => {
    const cachedRow = {
      fetchedAt: new Date(Date.now() - 10 * 60_000), // 10 minutes ago (< 1 hour TTL)
      data: JSON.stringify(MOCK_DASHBOARD),
    };
    vi.mocked(db.gbpAnalyticsCache.findUnique).mockResolvedValueOnce(cachedRow as never);

    const res = await getGbpAnalyticsAction("acc_gbp_1", "locations/12345", "28");
    expect(res.ok).toBe(true);
    expect(res.data?.isCached).toBe(true);
    expect(res.data?.summary.searchImpressions).toBe(1200);
    expect(gbpa.fetchGbpPerformanceDashboard).not.toHaveBeenCalled();
  });

  it("bypasses cache when forceRefresh is true", async () => {
    const cachedRow = {
      fetchedAt: new Date(Date.now() - 5 * 60_000),
      data: JSON.stringify(MOCK_DASHBOARD),
    };
    vi.mocked(db.gbpAnalyticsCache.findUnique).mockResolvedValueOnce(cachedRow as never);

    const res = await getGbpAnalyticsAction("acc_gbp_1", "locations/12345", "28", { forceRefresh: true });
    expect(res.ok).toBe(true);
    expect(res.data?.isCached).toBe(false);
    expect(gbpa.fetchGbpPerformanceDashboard).toHaveBeenCalledTimes(1);
  });
});
