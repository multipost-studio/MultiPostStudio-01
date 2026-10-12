import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncPinterestPostMetrics } from "@/lib/adapters/social-sync";
import { db } from "@/lib/db";
import { refreshIfNeeded } from "@/lib/social/oauth";
import * as pin from "@/lib/integrations/pinterest";

vi.mock("@/lib/social/oauth", () => ({ refreshIfNeeded: vi.fn() }));
vi.mock("@/lib/social/crypto", () => ({ isRealToken: vi.fn().mockReturnValue(true) }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/adapters/ai", () => ({ detectSentiment: vi.fn() }));
vi.mock("@/lib/social/bluesky", () => ({ blueskyGetPostStats: vi.fn(), blueskyListNotifications: vi.fn() }));
vi.mock("@/lib/social/bluesky-session", () => ({ runWithBluesky: vi.fn() }));
vi.mock("@/lib/integrations/pinterest", async (orig) => ({
  ...(await orig<typeof import("@/lib/integrations/pinterest")>()),
  getPinAnalytics: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    socialAccount: { findMany: vi.fn() },
    postChannel: { findMany: vi.fn() },
    postMetric: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));

const account = { id: "acc", accessToken: "tok", channels: [{ id: "ch" }] };
const pc = (id: string, remoteId: string, contentType = "pin") => ({ id, postId: `p_${id}`, remoteId, contentType, post: { publishedAt: new Date() } });

beforeEach(() => {
  vi.mocked(db.socialAccount.findMany).mockReset().mockResolvedValue([account] as never);
  vi.mocked(db.postChannel.findMany).mockReset().mockResolvedValue([] as never);
  vi.mocked(db.postMetric.findMany).mockReset().mockResolvedValue([] as never);
  vi.mocked(db.postMetric.create).mockReset().mockResolvedValue({} as never);
  vi.mocked(db.postMetric.update).mockReset().mockResolvedValue({} as never);
  vi.mocked(refreshIfNeeded).mockReset().mockResolvedValue("tok");
  vi.mocked(pin.getPinAnalytics).mockReset();
});

describe("syncPinterestPostMetrics", () => {
  it("does nothing without a usable token", async () => {
    vi.mocked(refreshIfNeeded).mockResolvedValueOnce(null);
    expect(await syncPinterestPostMetrics()).toBe(0);
    expect(db.postChannel.findMany).not.toHaveBeenCalled();
  });

  it("stores impressions, saves and combined clicks", async () => {
    vi.mocked(db.postChannel.findMany).mockResolvedValueOnce([pc("a", "1")] as never);
    vi.mocked(pin.getPinAnalytics).mockResolvedValueOnce({ impressions: 1000, saves: 30, pinClicks: 15, outboundClicks: 5, videoViews: 0 });
    expect(await syncPinterestPostMetrics()).toBe(1);
    const data = vi.mocked(db.postMetric.create).mock.calls[0][0].data as unknown as Record<string, number | string>;
    expect(data).toMatchObject({ postId: "p_a", postChannelId: "a", impressions: 1000, reach: 1000, saves: 30, clicks: 20, likes: 0, comments: 0 });
    expect(data.engagementRate).toBeCloseTo(5);
  });

  it("asks for video metrics only for video Pins", async () => {
    vi.mocked(db.postChannel.findMany).mockResolvedValueOnce([pc("a", "1", "pin"), pc("b", "2", "video_pin")] as never);
    vi.mocked(pin.getPinAnalytics).mockResolvedValue({ impressions: 1, saves: 0, pinClicks: 0, outboundClicks: 0, videoViews: 1 });
    await syncPinterestPostMetrics();
    const flags = Object.fromEntries(vi.mocked(pin.getPinAnalytics).mock.calls.map((c) => [c[1], c[3]]));
    expect(flags).toEqual({ "1": false, "2": true });
  });

  it("skips a Pin that fails and still saves the others", async () => {
    vi.mocked(db.postChannel.findMany).mockResolvedValueOnce([pc("a", "1"), pc("b", "2")] as never);
    vi.mocked(pin.getPinAnalytics).mockRejectedValueOnce(new Error("429")).mockResolvedValueOnce({ impressions: 10, saves: 1, pinClicks: 0, outboundClicks: 0, videoViews: 0 });
    expect(await syncPinterestPostMetrics()).toBe(1);
    expect(db.postMetric.create).toHaveBeenCalledOnce();
  });

  it("has a zero engagement rate when there are no impressions", async () => {
    vi.mocked(db.postChannel.findMany).mockResolvedValueOnce([pc("a", "1")] as never);
    vi.mocked(pin.getPinAnalytics).mockResolvedValueOnce({ impressions: 0, saves: 0, pinClicks: 0, outboundClicks: 0, videoViews: 0 });
    await syncPinterestPostMetrics();
    expect(vi.mocked(db.postMetric.create).mock.calls[0][0].data).toMatchObject({ engagementRate: 0 });
  });

  it("ignores Pins whose analytics are unavailable", async () => {
    vi.mocked(db.postChannel.findMany).mockResolvedValueOnce([pc("a", "1")] as never);
    vi.mocked(pin.getPinAnalytics).mockResolvedValueOnce(null);
    expect(await syncPinterestPostMetrics()).toBe(0);
  });
});
