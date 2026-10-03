"use server";

import { db } from "@/lib/db";
import { withPermission, ensureInWorkspace, ok, fail } from "./_helpers";
import { refreshIfNeeded } from "@/lib/social/oauth";
import * as gbpa from "@/lib/integrations/gbp-analytics";

const CACHE_TTL_MS = 60 * 60_000; // 1 hour TTL to preserve Google Performance API quota

export type GbpAnalyticsRangeKey = "7" | "14" | "28" | "90";
const RANGE_DAYS: Record<GbpAnalyticsRangeKey, number> = { "7": 7, "14": 14, "28": 28, "90": 90 };

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function resolveRange(
  range: string,
  customStart?: string,
  customEnd?: string,
): { startDate: string; endDate: string; cacheKey: string } {
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
    if (spanDays > 540) throw new Error("Custom range can't exceed 18 months");
    const startDate = fmt(start);
    const endDate = fmt(end);
    return { startDate, endDate, cacheKey: `custom:${startDate}:${endDate}` };
  }
  const days = RANGE_DAYS[range as GbpAnalyticsRangeKey] ?? 28;
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  return { startDate: fmt(start), endDate: fmt(end), cacheKey: `range:${days}` };
}

// In-flight request deduplication per account+location+cacheKey
const inFlight = new Map<string, Promise<unknown>>();

async function cached<T>(
  socialAccountId: string,
  locationId: string,
  cacheKey: string,
  forceRefresh: boolean,
  fetcher: () => Promise<T>,
): Promise<{ data: T; lastUpdatedAt: Date; isCached: boolean }> {
  const dedupeKey = `${socialAccountId}:${locationId}:${cacheKey}`;
  const existing = inFlight.get(dedupeKey);
  if (existing) return existing as Promise<{ data: T; lastUpdatedAt: Date; isCached: boolean }>;

  const promise = (async () => {
    if (!forceRefresh) {
      const row = await db.gbpAnalyticsCache.findUnique({
        where: {
          socialAccountId_locationId_cacheKey: {
            socialAccountId,
            locationId,
            cacheKey,
          },
        },
      });
      if (row && Date.now() - row.fetchedAt.getTime() < CACHE_TTL_MS) {
        return { data: JSON.parse(row.data) as T, lastUpdatedAt: row.fetchedAt, isCached: true };
      }
    }

    const data = await fetcher();
    const row = await db.gbpAnalyticsCache.upsert({
      where: {
        socialAccountId_locationId_cacheKey: {
          socialAccountId,
          locationId,
          cacheKey,
        },
      },
      create: {
        socialAccountId,
        locationId,
        cacheKey,
        data: JSON.stringify(data),
      },
      update: {
        data: JSON.stringify(data),
        fetchedAt: new Date(),
      },
    });

    return { data, lastUpdatedAt: row.fetchedAt, isCached: false };
  })().finally(() => inFlight.delete(dedupeKey));

  inFlight.set(dedupeKey, promise);
  return promise as Promise<{ data: T; lastUpdatedAt: Date; isCached: boolean }>;
}

/**
 * Retrieves Google Business Profile Performance Analytics for a location.
 */
export async function getGbpAnalyticsAction(
  accountId: string,
  locationId: string,
  range: string,
  opts?: { customStart?: string; customEnd?: string; forceRefresh?: boolean },
) {
  const ctx = await withPermission("analytics.view");
  try {
    await ensureInWorkspace("socialAccount", accountId, ctx.active.workspace.id);

    const account = await db.socialAccount.findUnique({
      where: { id: accountId },
      include: {
        channels: {
          where: { workspaceId: ctx.active.workspace.id },
        },
      },
    });

    if (!account || account.platform !== "gbp") {
      return fail("Connected Google Business Profile account not found");
    }

    // Resolve location title from channels or metadata
    const channel = account.channels.find((c) => c.handle === locationId || c.handle.endsWith(locationId));
    let locationTitle = channel?.name ?? "Location";

    if (!channel) {
      // Check account.metadata
      try {
        const meta = account.metadata ? JSON.parse(account.metadata) : {};
        const loc = (meta.locations as Array<{ name: string; title: string }> ?? []).find(
          (l) => l.name === locationId || l.name.endsWith(locationId),
        );
        if (loc) locationTitle = loc.title;
      } catch {
        // use fallback
      }
    }

    const { startDate, endDate, cacheKey } = resolveRange(range, opts?.customStart, opts?.customEnd);

    const token = await refreshIfNeeded(account.id);
    if (!token) {
      return fail("Google authorization expired — please reconnect Google Business Profile");
    }

    const { data, lastUpdatedAt, isCached } = await cached(
      account.id,
      locationId,
      `dashboard:${cacheKey}`,
      !!opts?.forceRefresh,
      () => gbpa.fetchGbpPerformanceDashboard(token, locationId, locationTitle, startDate, endDate),
    );

    return ok({
      ...data,
      lastUpdatedAt: lastUpdatedAt.toISOString(),
      isCached,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Failed to load Google Business Profile Analytics");
  }
}
