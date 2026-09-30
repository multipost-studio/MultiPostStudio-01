"use server";

import { db } from "@/lib/db";
import { withPermission, ensureInWorkspace, ok, fail } from "./_helpers";
import { refreshIfNeeded } from "@/lib/social/oauth";
import * as yta from "@/lib/integrations/youtube-analytics";

const CACHE_TTL_MS = 60 * 60_000; // 1 hour — matches the "don't hammer the quota" requirement

export type AnalyticsRangeKey = "7" | "28" | "90" | "365";
const RANGE_DAYS: Record<AnalyticsRangeKey, number> = { "7": 7, "28": 28, "90": 90, "365": 365 };

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Validates and resolves a range into { startDate, endDate } (YYYY-MM-DD), plus the cache key. */
function resolveRange(range: string, customStart?: string, customEnd?: string): { startDate: string; endDate: string; cacheKey: string } {
  if (range === "custom") {
    const start = customStart ? new Date(customStart) : null;
    const end = customEnd ? new Date(customEnd) : null;
    const today = new Date();
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new Error("Invalid custom date range");
    }
    if (start > end) throw new Error("Start date must be before end date");
    if (end > today) throw new Error("End date can't be in the future");
    const spanDays = (end.getTime() - start.getTime()) / 86_400_000;
    if (spanDays > 730) throw new Error("Custom range can't exceed 2 years");
    const startDate = fmt(start);
    const endDate = fmt(end);
    return { startDate, endDate, cacheKey: `custom:${startDate}:${endDate}` };
  }
  const days = RANGE_DAYS[range as AnalyticsRangeKey];
  if (!days) throw new Error("Invalid range");
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  return { startDate: fmt(start), endDate: fmt(end), cacheKey: `range:${range}` };
}

async function getYouTubeAccount(accountId: string, workspaceId: string) {
  await ensureInWorkspace("socialAccount", accountId, workspaceId);
  const account = await db.socialAccount.findUnique({ where: { id: accountId } });
  if (!account || account.platform !== "youtube") throw new Error("Not a connected YouTube account");
  return account;
}

// Prevents duplicate simultaneous requests for the same cache row (e.g. two
// dashboard tabs, or the manual-refresh button double-clicked) from firing
// the same Analytics API call twice.
const inFlight = new Map<string, Promise<unknown>>();

async function cached<T>(socialAccountId: string, cacheKey: string, forceRefresh: boolean, fetcher: () => Promise<T>): Promise<{ data: T; lastUpdatedAt: Date }> {
  const dedupeKey = `${socialAccountId}:${cacheKey}`;
  const existing = inFlight.get(dedupeKey);
  if (existing) return existing as Promise<{ data: T; lastUpdatedAt: Date }>;

  const promise = (async () => {
    if (!forceRefresh) {
      const row = await db.youtubeAnalyticsCache.findUnique({ where: { socialAccountId_cacheKey: { socialAccountId, cacheKey } } });
      if (row && Date.now() - row.fetchedAt.getTime() < CACHE_TTL_MS) {
        return { data: JSON.parse(row.data) as T, lastUpdatedAt: row.fetchedAt };
      }
    }
    const data = await fetcher();
    const row = await db.youtubeAnalyticsCache.upsert({
      where: { socialAccountId_cacheKey: { socialAccountId, cacheKey } },
      create: { socialAccountId, cacheKey, data: JSON.stringify(data) },
      update: { data: JSON.stringify(data), fetchedAt: new Date() },
    });
    return { data, lastUpdatedAt: row.fetchedAt };
  })().finally(() => inFlight.delete(dedupeKey));

  inFlight.set(dedupeKey, promise);
  return promise as Promise<{ data: T; lastUpdatedAt: Date }>;
}

export type YouTubeAnalyticsDashboard = {
  summary: yta.AnalyticsSummary;
  timeSeries: yta.DailyPoint[];
  topVideos: yta.TopVideo[];
  trafficSources: yta.BreakdownRow[];
  geography: yta.BreakdownRow[];
  devices: yta.BreakdownRow[];
};

export async function getYouTubeAnalyticsAction(
  accountId: string,
  range: string,
  opts?: { customStart?: string; customEnd?: string; forceRefresh?: boolean },
) {
  const ctx = await withPermission("analytics.view");
  try {
    const account = await getYouTubeAccount(accountId, ctx.active.workspace.id);
    const { startDate, endDate, cacheKey } = resolveRange(range, opts?.customStart, opts?.customEnd);

    const token = await refreshIfNeeded(account.id);
    if (!token) return fail("YouTube token unavailable — reconnect the account");

    const { data, lastUpdatedAt } = await cached(account.id, `dashboard:${cacheKey}`, !!opts?.forceRefresh, async () => {
      const [summary, timeSeries, topVideos, trafficSources, geography, devices] = await Promise.all([
        yta.fetchSummary(token, startDate, endDate),
        yta.fetchTimeSeries(token, startDate, endDate),
        yta.fetchTopVideos(token, startDate, endDate),
        yta.fetchTrafficSources(token, startDate, endDate),
        yta.fetchGeography(token, startDate, endDate),
        yta.fetchDeviceBreakdown(token, startDate, endDate),
      ]);
      return { summary, timeSeries, topVideos, trafficSources, geography, devices } satisfies YouTubeAnalyticsDashboard;
    });

    return ok({ ...data, lastUpdatedAt: lastUpdatedAt.toISOString() });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Failed to load YouTube Analytics");
  }
}

export async function getYouTubeVideoAnalyticsAction(
  accountId: string,
  videoId: string,
  range: string,
  opts?: { customStart?: string; customEnd?: string; forceRefresh?: boolean },
) {
  const ctx = await withPermission("analytics.view");
  try {
    const account = await getYouTubeAccount(accountId, ctx.active.workspace.id);
    // videoId must be one this workspace actually published, not an arbitrary
    // id — Google's API itself only returns data for the token's own channel,
    // but this keeps our cache rows from being probed for unrelated videos.
    const published = await db.postChannel.findFirst({
      where: { remoteId: videoId, channel: { socialAccountId: account.id } },
      select: { id: true },
    });
    if (!published) return fail("Video not found on this connected channel");

    const { startDate, endDate, cacheKey } = resolveRange(range, opts?.customStart, opts?.customEnd);
    const token = await refreshIfNeeded(account.id);
    if (!token) return fail("YouTube token unavailable — reconnect the account");

    const { data, lastUpdatedAt } = await cached(account.id, `video:${videoId}:${cacheKey}`, !!opts?.forceRefresh, () =>
      yta.fetchVideoAnalytics(token, videoId, startDate, endDate),
    );

    return ok({ series: data, lastUpdatedAt: lastUpdatedAt.toISOString() });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Failed to load video analytics");
  }
}
