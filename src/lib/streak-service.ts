import { cache } from "react";
import { db } from "@/lib/db";
import { computeStreak, localDayKey, type StreakState } from "@/lib/streak";
import { notifyWorkspace } from "@/lib/events";

/**
 * Loads the publish history a streak is derived from.
 *
 * What counts: a PostChannel that actually reached a platform (status
 * "published"). Drafts, scheduled-but-unpublished, failed and skipped channels
 * do not — a streak that counts intent rather than delivery would be a lie.
 * A partially-failed post still counts, because at least one channel went live.
 *
 * Deleted posts disappear from the streak automatically: PostChannel is
 * cascade-deleted with its Post, so there is no stale counter to clean up.
 * That is the main reason this is derived rather than stored.
 */

/** Enough history for the 365-day milestone plus margin, without scanning all time. */
const WINDOW_DAYS = 420;

export type WorkspaceStreak = StreakState & {
  /** Viewer-local day keys with >= 1 published channel, for the calendar. */
  activeDays: string[];
  /** A post is scheduled for today but hasn't published yet. */
  todayScheduled: boolean;
  /** Resolved IANA zone the day boundaries were computed in. */
  timeZone: string;
  todayKey: string;
};

/**
 * Uncached read. Used by the publish pipeline, where a memoized pre-publish
 * result would make the milestone check look at stale history.
 */
export async function loadWorkspaceStreak(
  workspaceId: string,
  timeZone: string,
): Promise<WorkspaceStreak> {
  {
    const now = new Date();
    const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);
    const todayKey = localDayKey(now, timeZone);

    const [published, scheduledSoon] = await Promise.all([
      db.postChannel.findMany({
        where: {
          status: "published",
          post: { workspaceId, publishedAt: { gte: since, not: null } },
        },
        select: { post: { select: { publishedAt: true } } },
      }),
      // A ±2 day UTC window is wide enough to contain "today" in every zone,
      // so the local-day comparison below can be done without timezone SQL.
      db.post.findMany({
        where: {
          workspaceId,
          status: { in: ["scheduled", "approved", "publishing"] },
          scheduledAt: {
            gte: new Date(now.getTime() - 2 * 86_400_000),
            lte: new Date(now.getTime() + 2 * 86_400_000),
          },
        },
        select: { scheduledAt: true },
      }),
    ]);

    const activeDays = [
      ...new Set(
        published
          .map((pc) => pc.post.publishedAt)
          .filter((d): d is Date => d instanceof Date)
          .map((d) => localDayKey(d, timeZone)),
      ),
    ].sort();

    const todayScheduled = scheduledSoon.some(
      (p) => p.scheduledAt && localDayKey(p.scheduledAt, timeZone) === todayKey,
    );

    return {
      ...computeStreak(activeDays, todayKey),
      activeDays,
      todayScheduled,
      timeZone,
      todayKey,
    };
  }
}

/** Request-memoized read for UI: the dashboard and streak page share one query. */
export const getWorkspaceStreak = cache(loadWorkspaceStreak);

/**
 * Fires a one-off notification when a publish pushes the workspace onto a
 * streak milestone. Called from the publish pipeline.
 *
 * Dedupe is per streak RUN, not per milestone: the linkUrl carries both the
 * milestone and the run's start date, so hitting 7 days again after a break is
 * worth celebrating, while re-publishing on the same day is not. That keeps it
 * from becoming spam without needing a new table.
 *
 * Never throws — a notification must not be able to fail a publish.
 */
export async function notifyStreakMilestone(workspaceId: string, timeZone: string): Promise<void> {
  try {
    // Uncached on purpose — this runs right after a publish.
    const streak = await loadWorkspaceStreak(workspaceId, timeZone);
    if (!streak.reachedMilestone || !streak.startedOn) return;

    const linkUrl = `/insights/streak?m=${streak.reachedMilestone}&from=${streak.startedOn}`;
    const already = await db.notification.findFirst({
      where: { type: "streak_milestone", linkUrl },
      select: { id: true },
    });
    if (already) return;

    await notifyWorkspace(workspaceId, {
      type: "streak_milestone",
      title: `${streak.reachedMilestone}-day posting streak`,
      body: `This workspace has published on ${streak.reachedMilestone} consecutive days. Keep the run going to reach ${streak.nextMilestone ?? "the next milestone"}.`,
      linkUrl,
    });
  } catch {
    // Streak notification is a nicety; publishing already succeeded.
  }
}
