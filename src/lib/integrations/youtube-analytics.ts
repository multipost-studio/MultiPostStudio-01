/**
 * YouTube Analytics API (reports.query) — the `yt-analytics.readonly` scope.
 * Distinct from the public YouTube Data API v3 stats used in
 * lib/adapters/social-sync.ts (view/like/comment counts on the video itself):
 * this is the private, per-channel-owner Analytics Reporting API — watch
 * time, subscriber deltas, traffic sources, geography, device breakdown.
 * https://developers.google.com/youtube/analytics/reference/reports/query
 *
 * ids=channel==MINE always — the channel identity comes from whichever
 * Google account the access token belongs to, server-side. There is no
 * parameter here for a caller-supplied channel id; that would let a client
 * ask for someone else's channel, and Google's API would simply 403 it, but
 * we don't even expose the shape to try.
 */
const API = "https://youtubeanalytics.googleapis.com/v2/reports";

/** Thrown for all non-2xx responses so callers can branch on status. */
export class YouTubeAnalyticsError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "YouTubeAnalyticsError";
  }
}

function statusMessage(status: number, body: string): string {
  // Never echo the Authorization header or the request URL (both would be
  // the only things that could carry the token) — only Google's own response
  // body, truncated, goes into the error.
  const detail = body.slice(0, 300);
  switch (status) {
    case 401:
      return "YouTube session expired — reconnect the account";
    case 403:
      return `YouTube Analytics access denied (insufficient scope or revoked authorization): ${detail}`;
    case 404:
      return "YouTube channel not found for this connection";
    case 429:
      return "YouTube Analytics quota exceeded — try again later";
    default:
      return status >= 500 ? `YouTube Analytics is temporarily unavailable (${status})` : `YouTube Analytics ${status}: ${detail}`;
  }
}

async function queryReports(
  accessToken: string,
  params: {
    startDate: string;
    endDate: string;
    metrics: string[];
    dimensions?: string[];
    filters?: string;
    sort?: string;
    maxResults?: number;
  },
): Promise<{ columnHeaders: { name: string }[]; rows?: (string | number)[][] }> {
  const q = new URLSearchParams({
    ids: "channel==MINE",
    startDate: params.startDate,
    endDate: params.endDate,
    metrics: params.metrics.join(","),
  });
  if (params.dimensions?.length) q.set("dimensions", params.dimensions.join(","));
  if (params.filters) q.set("filters", params.filters);
  if (params.sort) q.set("sort", params.sort);
  if (params.maxResults) q.set("maxResults", String(params.maxResults));

  const res = await fetch(`${API}?${q}`, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new YouTubeAnalyticsError(res.status, statusMessage(res.status, body));
  }
  const data = await res.json();
  // A well-formed but empty result (no data yet for the range, or the most
  // recent 1-3 days not yet processed by Google) is not an error — it's
  // `rows: undefined`. Callers just get an empty array; nothing is faked in.
  return { columnHeaders: data.columnHeaders ?? [], rows: data.rows };
}

/** Row -> { colName: value } using the response's own column order — never a hardcoded index. */
function toObjects(data: { columnHeaders: { name: string }[]; rows?: (string | number)[][] }) {
  const cols = data.columnHeaders.map((c) => c.name);
  return (data.rows ?? []).map((row) => Object.fromEntries(cols.map((c, i) => [c, row[i]])));
}

// Metric/dimension groupings below follow Google's published compatibility
// tables (Basic User Activity + Time-based + Video-dimension + Playback
// Location groups) — https://developers.google.com/youtube/analytics/metrics
// Every combination here is drawn from a single compatible group; nothing
// mixes metrics across groups that Google doesn't allow together.

const SUMMARY_METRICS = [
  "views",
  "estimatedMinutesWatched",
  "averageViewDuration",
  "likes",
  "comments",
  "shares",
  "subscribersGained",
  "subscribersLost",
];

export type AnalyticsSummary = {
  views: number;
  estimatedMinutesWatched: number;
  averageViewDuration: number;
  likes: number;
  comments: number;
  shares: number;
  subscribersGained: number;
  subscribersLost: number;
};

const ZERO_SUMMARY: AnalyticsSummary = {
  views: 0,
  estimatedMinutesWatched: 0,
  averageViewDuration: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  subscribersGained: 0,
  subscribersLost: 0,
};

/** Channel totals for the range — no dimensions, one aggregate row (or none, if the channel has no activity yet). */
export async function fetchSummary(accessToken: string, startDate: string, endDate: string): Promise<AnalyticsSummary> {
  const data = await queryReports(accessToken, { startDate, endDate, metrics: SUMMARY_METRICS });
  const [row] = toObjects(data);
  return row ? ({ ...ZERO_SUMMARY, ...row } as AnalyticsSummary) : ZERO_SUMMARY;
}

export type DailyPoint = {
  date: string;
  views: number;
  estimatedMinutesWatched: number;
  subscribersGained: number;
  subscribersLost: number;
};

/**
 * Views / watch time / subscriber deltas, one point per day. Google's
 * Analytics processing typically lags 1-3 days behind — the response simply
 * omits days it hasn't finished processing yet, so the returned array's last
 * date may be a few days before `endDate`. Nothing here fills that gap in;
 * the UI shows exactly what came back.
 */
export async function fetchTimeSeries(accessToken: string, startDate: string, endDate: string): Promise<DailyPoint[]> {
  const data = await queryReports(accessToken, {
    startDate,
    endDate,
    metrics: ["views", "estimatedMinutesWatched", "subscribersGained", "subscribersLost"],
    dimensions: ["day"],
    sort: "day",
  });
  return toObjects(data).map((r) => ({
    date: String(r.day),
    views: Number(r.views ?? 0),
    estimatedMinutesWatched: Number(r.estimatedMinutesWatched ?? 0),
    subscribersGained: Number(r.subscribersGained ?? 0),
    subscribersLost: Number(r.subscribersLost ?? 0),
  }));
}

export type TopVideo = {
  videoId: string;
  views: number;
  estimatedMinutesWatched: number;
  averageViewDuration: number;
  likes: number;
  comments: number;
};

/**
 * Best-performing videos in the range, by views. The `video` dimension
 * supports the viewership + engagement metric group (views, watch time,
 * avg view duration, likes, comments) but NOT subscriber deltas — those
 * only report at the channel level, which is why TopVideo has no
 * subscribersGained/Lost field.
 */
export async function fetchTopVideos(
  accessToken: string,
  startDate: string,
  endDate: string,
  maxResults = 10,
): Promise<TopVideo[]> {
  const data = await queryReports(accessToken, {
    startDate,
    endDate,
    metrics: ["views", "estimatedMinutesWatched", "averageViewDuration", "likes", "comments"],
    dimensions: ["video"],
    sort: "-views",
    maxResults,
  });
  return toObjects(data).map((r) => ({
    videoId: String(r.video),
    views: Number(r.views ?? 0),
    estimatedMinutesWatched: Number(r.estimatedMinutesWatched ?? 0),
    averageViewDuration: Number(r.averageViewDuration ?? 0),
    likes: Number(r.likes ?? 0),
    comments: Number(r.comments ?? 0),
  }));
}

export type BreakdownRow = { label: string; views: number; estimatedMinutesWatched: number };

/**
 * Shared shape for the three "views/watch time by X" breakdowns below.
 * insightTrafficSourceType, country, and deviceType are each in the
 * Playback Location / Traffic Source / Playback Detail groups respectively,
 * all of which support the plain views + estimatedMinutesWatched pair.
 */
async function fetchBreakdown(accessToken: string, startDate: string, endDate: string, dimension: string): Promise<BreakdownRow[]> {
  const data = await queryReports(accessToken, {
    startDate,
    endDate,
    metrics: ["views", "estimatedMinutesWatched"],
    dimensions: [dimension],
    sort: "-views",
    maxResults: 25,
  });
  return toObjects(data).map((r) => ({
    label: String(r[dimension]),
    views: Number(r.views ?? 0),
    estimatedMinutesWatched: Number(r.estimatedMinutesWatched ?? 0),
  }));
}

export const fetchTrafficSources = (accessToken: string, startDate: string, endDate: string) =>
  fetchBreakdown(accessToken, startDate, endDate, "insightTrafficSourceType");

export const fetchGeography = (accessToken: string, startDate: string, endDate: string) =>
  fetchBreakdown(accessToken, startDate, endDate, "country");

export const fetchDeviceBreakdown = (accessToken: string, startDate: string, endDate: string) =>
  fetchBreakdown(accessToken, startDate, endDate, "deviceType");

export type VideoDailyPoint = {
  date: string;
  views: number;
  estimatedMinutesWatched: number;
  averageViewDuration: number;
  likes: number;
  comments: number;
};

/**
 * Per-video daily series, via filters=video==ID + dimensions=day. Excludes
 * subscribersGained/Lost — same reasoning as fetchTopVideos: subscriber
 * metrics aren't in the video-filtered group, only channel-level.
 */
export async function fetchVideoAnalytics(
  accessToken: string,
  videoId: string,
  startDate: string,
  endDate: string,
): Promise<VideoDailyPoint[]> {
  const data = await queryReports(accessToken, {
    startDate,
    endDate,
    metrics: ["views", "estimatedMinutesWatched", "averageViewDuration", "likes", "comments"],
    dimensions: ["day"],
    filters: `video==${videoId}`,
    sort: "day",
  });
  return toObjects(data).map((r) => ({
    date: String(r.day),
    views: Number(r.views ?? 0),
    estimatedMinutesWatched: Number(r.estimatedMinutesWatched ?? 0),
    averageViewDuration: Number(r.averageViewDuration ?? 0),
    likes: Number(r.likes ?? 0),
    comments: Number(r.comments ?? 0),
  }));
}
