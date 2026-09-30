import { describe, it, expect, vi, beforeEach } from "vitest";
import { getYouTubeAnalyticsAction, getYouTubeVideoAnalyticsAction } from "./youtube-analytics";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/session";
import { refreshIfNeeded } from "@/lib/social/oauth";
import * as yta from "@/lib/integrations/youtube-analytics";

vi.mock("@/lib/session", () => ({ requireWorkspace: vi.fn() }));
vi.mock("@/lib/social/oauth", () => ({ refreshIfNeeded: vi.fn() }));
vi.mock("@/lib/integrations/youtube-analytics", () => ({
  fetchSummary: vi.fn(),
  fetchTimeSeries: vi.fn(),
  fetchTopVideos: vi.fn(),
  fetchTrafficSources: vi.fn(),
  fetchGeography: vi.fn(),
  fetchDeviceBreakdown: vi.fn(),
  fetchVideoAnalytics: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    socialAccount: { findUnique: vi.fn() },
    postChannel: { findFirst: vi.fn() },
    youtubeAnalyticsCache: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}));

const CTX = {
  active: { workspace: { id: "ws_1" }, permissions: ["analytics.view"], role: "owner" },
  user: { id: "user_1" },
};
const ACCOUNT = { id: "acc_1", workspaceId: "ws_1", platform: "youtube" };

const SUMMARY = {
  views: 100,
  estimatedMinutesWatched: 50,
  averageViewDuration: 30,
  likes: 5,
  comments: 2,
  shares: 1,
  subscribersGained: 3,
  subscribersLost: 1,
};

function mockFreshAccount() {
  vi.mocked(db.socialAccount.findUnique).mockImplementation(((args: { select?: unknown }) =>
    Promise.resolve(args.select ? { workspaceId: ACCOUNT.workspaceId } : ACCOUNT)) as never,
  );
}

describe("getYouTubeAnalyticsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireWorkspace).mockResolvedValue(CTX as Awaited<ReturnType<typeof requireWorkspace>>);
    vi.mocked(refreshIfNeeded).mockResolvedValue("token_abc");
    mockFreshAccount();
    vi.mocked(yta.fetchSummary).mockResolvedValue(SUMMARY);
    vi.mocked(yta.fetchTimeSeries).mockResolvedValue([]);
    vi.mocked(yta.fetchTopVideos).mockResolvedValue([]);
    vi.mocked(yta.fetchTrafficSources).mockResolvedValue([]);
    vi.mocked(yta.fetchGeography).mockResolvedValue([]);
    vi.mocked(yta.fetchDeviceBreakdown).mockResolvedValue([]);
    vi.mocked(db.youtubeAnalyticsCache.findUnique).mockResolvedValue(null);
    vi.mocked(db.youtubeAnalyticsCache.upsert).mockResolvedValue({ fetchedAt: new Date() } as never);
  });

  it("rejects an account from another workspace", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue({ workspaceId: "other_ws" } as never);
    const res = await getYouTubeAnalyticsAction("acc_1", "28");
    expect(res.ok).toBe(false);
    expect(yta.fetchSummary).not.toHaveBeenCalled();
  });

  it("rejects a non-YouTube social account", async () => {
    vi.mocked(db.socialAccount.findUnique).mockImplementation(((args: { select?: unknown }) =>
      Promise.resolve(args.select ? { workspaceId: ACCOUNT.workspaceId } : { ...ACCOUNT, platform: "tiktok" })) as never,
    );
    const res = await getYouTubeAnalyticsAction("acc_1", "28");
    expect(res.ok).toBe(false);
  });

  it("fetches fresh data for a valid range and returns a lastUpdatedAt", async () => {
    const res = await getYouTubeAnalyticsAction("acc_1", "28");
    expect(res.ok).toBe(true);
    expect(res.data?.summary.views).toBe(100);
    expect(res.data?.lastUpdatedAt).toBeTruthy();
    expect(yta.fetchSummary).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid range key", async () => {
    const res = await getYouTubeAnalyticsAction("acc_1", "not-a-range");
    expect(res.ok).toBe(false);
  });

  it("rejects a custom range where start is after end", async () => {
    const res = await getYouTubeAnalyticsAction("acc_1", "custom", { customStart: "2026-06-01", customEnd: "2026-01-01" });
    expect(res.ok).toBe(false);
    expect(yta.fetchSummary).not.toHaveBeenCalled();
  });

  it("rejects a custom range ending in the future", async () => {
    const res = await getYouTubeAnalyticsAction("acc_1", "custom", { customStart: "2020-01-01", customEnd: "2099-01-01" });
    expect(res.ok).toBe(false);
  });

  it("rejects a custom range spanning more than 2 years", async () => {
    const res = await getYouTubeAnalyticsAction("acc_1", "custom", { customStart: "2020-01-01", customEnd: "2023-06-01" });
    expect(res.ok).toBe(false);
  });

  it("returns an error when the token can't be refreshed", async () => {
    vi.mocked(refreshIfNeeded).mockResolvedValue(null);
    const res = await getYouTubeAnalyticsAction("acc_1", "28");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/reconnect/i);
  });

  it("serves cached data within the TTL without calling the API again", async () => {
    vi.mocked(db.youtubeAnalyticsCache.findUnique).mockResolvedValue({
      data: JSON.stringify({ summary: SUMMARY, timeSeries: [], topVideos: [], trafficSources: [], geography: [], devices: [] }),
      fetchedAt: new Date(),
    } as never);
    const res = await getYouTubeAnalyticsAction("acc_1", "28");
    expect(res.ok).toBe(true);
    expect(yta.fetchSummary).not.toHaveBeenCalled();
  });

  it("bypasses a fresh cache when forceRefresh is set", async () => {
    vi.mocked(db.youtubeAnalyticsCache.findUnique).mockResolvedValue({
      data: JSON.stringify({ summary: SUMMARY, timeSeries: [], topVideos: [], trafficSources: [], geography: [], devices: [] }),
      fetchedAt: new Date(),
    } as never);
    const res = await getYouTubeAnalyticsAction("acc_1", "28", { forceRefresh: true });
    expect(res.ok).toBe(true);
    expect(yta.fetchSummary).toHaveBeenCalledTimes(1);
  });

  it("refetches once an hour-old cache entry has expired", async () => {
    vi.mocked(db.youtubeAnalyticsCache.findUnique).mockResolvedValue({
      data: JSON.stringify({ summary: SUMMARY, timeSeries: [], topVideos: [], trafficSources: [], geography: [], devices: [] }),
      fetchedAt: new Date(Date.now() - 2 * 60 * 60_000),
    } as never);
    const res = await getYouTubeAnalyticsAction("acc_1", "28");
    expect(res.ok).toBe(true);
    expect(yta.fetchSummary).toHaveBeenCalledTimes(1);
  });

  it("surfaces an API error instead of throwing", async () => {
    vi.mocked(yta.fetchSummary).mockRejectedValue(new Error("YouTube Analytics 403: quota exceeded"));
    const res = await getYouTubeAnalyticsAction("acc_1", "28");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/quota exceeded/);
  });
});

describe("getYouTubeVideoAnalyticsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireWorkspace).mockResolvedValue(CTX as Awaited<ReturnType<typeof requireWorkspace>>);
    vi.mocked(refreshIfNeeded).mockResolvedValue("token_abc");
    mockFreshAccount();
    vi.mocked(db.youtubeAnalyticsCache.findUnique).mockResolvedValue(null);
    vi.mocked(db.youtubeAnalyticsCache.upsert).mockResolvedValue({ fetchedAt: new Date() } as never);
  });

  it("refuses a video id that isn't a published post on this channel (tenant isolation)", async () => {
    vi.mocked(db.postChannel.findFirst).mockResolvedValue(null);
    const res = await getYouTubeVideoAnalyticsAction("acc_1", "someone-elses-video", "28");
    expect(res.ok).toBe(false);
    expect(yta.fetchVideoAnalytics).not.toHaveBeenCalled();
  });

  it("fetches per-video analytics once ownership is confirmed", async () => {
    vi.mocked(db.postChannel.findFirst).mockResolvedValue({ id: "pc_1" } as never);
    vi.mocked(yta.fetchVideoAnalytics).mockResolvedValue([
      { date: "2026-01-01", views: 10, estimatedMinutesWatched: 5, averageViewDuration: 30, likes: 1, comments: 0 },
    ]);
    const res = await getYouTubeVideoAnalyticsAction("acc_1", "vid_1", "28");
    expect(res.ok).toBe(true);
    expect(res.data?.series).toHaveLength(1);
  });
});
