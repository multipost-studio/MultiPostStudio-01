import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchSummary,
  fetchTimeSeries,
  fetchTopVideos,
  fetchTrafficSources,
  fetchGeography,
  fetchDeviceBreakdown,
  fetchVideoAnalytics,
  YouTubeAnalyticsError,
} from "./youtube-analytics";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

function errorResponse(status: number, body = "") {
  return { ok: false, status, text: () => Promise.resolve(body) } as Response;
}

describe("youtube-analytics adapter", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("requests channel==MINE, never a caller-supplied channel id", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ columnHeaders: [{ name: "views" }], rows: [[10]] }));
    await fetchSummary("token_x", "2026-01-01", "2026-01-31");
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("ids=channel%3D%3DMINE");
    expect(url).not.toMatch(/ids=channel==UC/);
  });

  it("sends the bearer token in the Authorization header, never in the URL", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ columnHeaders: [{ name: "views" }], rows: [[1]] }));
    await fetchSummary("secret_token_123", "2026-01-01", "2026-01-31");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).not.toContain("secret_token_123");
    expect((init as RequestInit).headers).toMatchObject({ authorization: "Bearer secret_token_123" });
  });

  it("parses rows using columnHeaders order, not a hardcoded index", async () => {
    // Deliberately out-of-declared-order columns to prove we read the header, not a fixed position.
    fetchMock.mockResolvedValue(
      jsonResponse({
        columnHeaders: [{ name: "comments" }, { name: "views" }, { name: "likes" }, { name: "estimatedMinutesWatched" }, { name: "averageViewDuration" }, { name: "shares" }, { name: "subscribersGained" }, { name: "subscribersLost" }],
        rows: [[3, 100, 7, 50, 30, 1, 5, 2]],
      }),
    );
    const summary = await fetchSummary("t", "2026-01-01", "2026-01-31");
    expect(summary).toEqual({
      views: 100,
      comments: 3,
      likes: 7,
      estimatedMinutesWatched: 50,
      averageViewDuration: 30,
      shares: 1,
      subscribersGained: 5,
      subscribersLost: 2,
    });
  });

  it("returns zeroed summary when the API returns no rows (no activity in range)", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ columnHeaders: [{ name: "views" }] }));
    const summary = await fetchSummary("t", "2026-01-01", "2026-01-31");
    expect(summary.views).toBe(0);
  });

  it("returns an empty array for time series with no rows, never fabricated dates", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ columnHeaders: [{ name: "day" }, { name: "views" }, { name: "estimatedMinutesWatched" }, { name: "subscribersGained" }, { name: "subscribersLost" }] }));
    const series = await fetchTimeSeries("t", "2026-01-01", "2026-01-31");
    expect(series).toEqual([]);
  });

  it("time series omits days Google hasn't processed yet, rather than filling gaps", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        columnHeaders: [{ name: "day" }, { name: "views" }, { name: "estimatedMinutesWatched" }, { name: "subscribersGained" }, { name: "subscribersLost" }],
        rows: [
          ["2026-01-01", 10, 5, 1, 0],
          ["2026-01-02", 12, 6, 0, 1],
          // 2026-01-03 through the requested endDate simply absent — not zero-filled.
        ],
      }),
    );
    const series = await fetchTimeSeries("t", "2026-01-01", "2026-01-05");
    expect(series).toHaveLength(2);
    expect(series[series.length - 1].date).toBe("2026-01-02");
  });

  it("sorts top videos by -views and caps at maxResults", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ columnHeaders: [{ name: "video" }, { name: "views" }, { name: "estimatedMinutesWatched" }, { name: "averageViewDuration" }, { name: "likes" }, { name: "comments" }] }));
    await fetchTopVideos("t", "2026-01-01", "2026-01-31", 5);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("sort=-views");
    expect(url).toContain("maxResults=5");
    expect(url).toContain("dimensions=video");
  });

  it("traffic sources, geography, and device breakdown each query their own dimension", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ columnHeaders: [{ name: "insightTrafficSourceType" }, { name: "views" }, { name: "estimatedMinutesWatched" }] }));
    await fetchTrafficSources("t", "2026-01-01", "2026-01-31");
    expect(fetchMock.mock.calls[0][0]).toContain("dimensions=insightTrafficSourceType");

    fetchMock.mockResolvedValue(jsonResponse({ columnHeaders: [{ name: "country" }, { name: "views" }, { name: "estimatedMinutesWatched" }] }));
    await fetchGeography("t", "2026-01-01", "2026-01-31");
    expect(fetchMock.mock.calls[1][0]).toContain("dimensions=country");

    fetchMock.mockResolvedValue(jsonResponse({ columnHeaders: [{ name: "deviceType" }, { name: "views" }, { name: "estimatedMinutesWatched" }] }));
    await fetchDeviceBreakdown("t", "2026-01-01", "2026-01-31");
    expect(fetchMock.mock.calls[2][0]).toContain("dimensions=deviceType");
  });

  it("video analytics filters by video== and excludes subscriber metrics", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ columnHeaders: [{ name: "day" }, { name: "views" }, { name: "estimatedMinutesWatched" }, { name: "averageViewDuration" }, { name: "likes" }, { name: "comments" }] }));
    await fetchVideoAnalytics("t", "vid_123", "2026-01-01", "2026-01-31");
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("filters=video%3D%3Dvid_123");
    expect(url).not.toContain("subscribersGained");
  });

  it.each([
    [401, /reconnect/i],
    [403, /access denied/i],
    [404, /not found/i],
    [429, /quota/i],
    [500, /temporarily unavailable/i],
    [503, /temporarily unavailable/i],
  ])("maps HTTP %i to a distinct, non-leaking error message", async (status, matcher) => {
    fetchMock.mockResolvedValue(errorResponse(status as number, "some google error body"));
    await expect(fetchSummary("secret_token", "2026-01-01", "2026-01-31")).rejects.toThrow(matcher as RegExp);
  });

  it("error messages never contain the access token", async () => {
    fetchMock.mockResolvedValue(errorResponse(403, "insufficient scope: yt-analytics.readonly"));
    try {
      await fetchSummary("super-secret-token-value", "2026-01-01", "2026-01-31");
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(YouTubeAnalyticsError);
      expect((e as Error).message).not.toContain("super-secret-token-value");
    }
  });

  it("throws YouTubeAnalyticsError carrying the original status code", async () => {
    fetchMock.mockResolvedValue(errorResponse(429));
    await expect(fetchSummary("t", "2026-01-01", "2026-01-31")).rejects.toMatchObject({ status: 429 });
  });
});
