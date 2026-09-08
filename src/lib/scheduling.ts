import { db } from "@/lib/db";
import { rankSlots, describeSlot, zonedParts, type PostOutcome } from "@/lib/best-time";

/**
 * Compute the next open queue slot for a set of channels after `from`.
 * Walks forward day-by-day, checking configured QueueSlots against posts already
 * scheduled in that slot. Falls back to `from + 1h` if no slots are configured.
 */
export async function nextAvailableSlot(
  workspaceId: string,
  channelIds: string[],
  from = new Date(),
): Promise<Date> {
  const slots = await db.queueSlot.findMany({
    where: { workspaceId, channelId: { in: channelIds } },
  });
  if (slots.length === 0) {
    const d = new Date(from.getTime() + 60 * 60 * 1000);
    d.setSeconds(0, 0);
    return d;
  }

  const taken = await db.post.findMany({
    where: {
      workspaceId,
      status: { in: ["scheduled", "approved"] },
      scheduledAt: { gte: from },
      channels: { some: { channelId: { in: channelIds } } },
    },
    select: { scheduledAt: true },
  });
  const takenKeys = new Set(
    taken
      .map((t) => t.scheduledAt)
      .filter((d): d is Date => !!d)
      .map((d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}-${d.getMinutes()}`),
  );

  for (let dayOffset = 0; dayOffset < 60; dayOffset++) {
    const day = new Date(from);
    day.setDate(day.getDate() + dayOffset);
    const weekday = day.getDay();
    const daySlots = slots
      .filter((s) => s.weekday === weekday)
      .sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));

    for (const s of daySlots) {
      const candidate = new Date(day);
      candidate.setHours(s.hour, s.minute, 0, 0);
      if (candidate <= from) continue;
      const key = `${candidate.getFullYear()}-${candidate.getMonth()}-${candidate.getDate()}-${s.hour}-${s.minute}`;
      if (!takenKeys.has(key)) return candidate;
    }
  }

  const fallback = new Date(from.getTime() + 60 * 60 * 1000);
  fallback.setSeconds(0, 0);
  return fallback;
}

/**
 * Best times to post, measured from this workspace's own published results.
 *
 * The previous implementation was invented. It returned bestWeekday 2 and
 * bestHour 19 for every workspace in the product, chose each weekday's "best
 * hour" with `wd % 2 === 0 ? 19 : 12`, and attached the note "Engagement peaks
 * weekday evenings (18:00-20:00). Weekends perform ~30% lower" as though it
 * had been measured here. The only real data it read was averaged into a
 * `score` that nothing used. Customers were shown fabricated posting advice in
 * the composer and on the calendar, and acted on it.
 *
 * This reads what actually happened: every published channel and the
 * engagement rate its metrics recorded, bucketed into weekday/hour slots in
 * the viewer's timezone. When there is not enough history to say anything
 * honest, `insufficient` is true and callers hide the recommendation rather
 * than fill the gap with a plausible-looking default.
 *
 * Arithmetic on measured engagement, not a model — nothing here should be
 * presented as AI-generated.
 */
export async function recommendTimes(workspaceId: string, timeZone = "UTC") {
  const channels = await db.postChannel.findMany({
    where: {
      status: "published",
      post: { workspaceId, publishedAt: { not: null } },
    },
    select: {
      post: { select: { publishedAt: true } },
      metrics: { select: { engagementRate: true }, orderBy: { capturedAt: "desc" }, take: 1 },
    },
    take: 500,
  });

  const outcomes: PostOutcome[] = channels
    .filter((c) => c.post.publishedAt && c.metrics.length > 0)
    .map((c) => ({
      publishedAt: c.post.publishedAt as Date,
      engagementRate: c.metrics[0].engagementRate,
    }));

  const ranked = rankSlots(outcomes, (d) => zonedParts(d, timeZone));
  const best = ranked.slots[0];

  return {
    insufficient: ranked.insufficient,
    sampleSize: ranked.sampleSize,
    slots: ranked.slots,
    // Kept for callers that want a single suggestion. Meaningless when
    // insufficient is true, which is why callers must check it first.
    bestHour: best?.hour ?? null,
    bestWeekday: best?.weekday ?? null,
    note: ranked.insufficient
      ? `Not enough published history yet — ${ranked.sampleSize} post${ranked.sampleSize === 1 ? "" : "s"} with metrics so far.`
      : `${describeSlot(best)} averaged ${best.avgEngagementRate.toFixed(1)}% engagement across ${best.posts} posts.`,
  };
}
