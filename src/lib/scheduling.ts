import { db } from "@/lib/db";
import { rankSlots, describeSlot, zonedParts, type PostOutcome } from "@/lib/best-time";

/**
 * Timezone-aware date parts via Intl (no date-fns-tz dependency).
 */
function tzDateParts(d: Date, timeZone: string): { y: number; mo: number; day: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    parts.find((p) => p.type === "weekday")?.value ?? "Sun",
  );
  return { y: get("year"), mo: get("month"), day: get("day"), weekday: wd < 0 ? 0 : wd };
}

function tzOffsetMs(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - at.getTime();
}

/** Wall-clock time in `timeZone` → UTC instant (two-pass offset fix, DST-safe). */
function zonedWallToUtc(y: number, mo: number, day: number, hour: number, minute: number, timeZone: string): Date {
  let guess = Date.UTC(y, mo - 1, day, hour, minute);
  for (let i = 0; i < 2; i++) guess = Date.UTC(y, mo - 1, day, hour, minute) - tzOffsetMs(timeZone, new Date(guess));
  return new Date(guess);
}

/**
 * Compute the next open queue slot for a set of channels after `from`.
 * Walks forward day-by-day, checking configured QueueSlots against posts already
 * scheduled in that slot. Falls back to `from + 1h` if no slots are configured.
 *
 * All slot arithmetic happens in `timeZone` (the author's timezone — queue
 * slots are wall-clock times like "Tue 9:00", not UTC instants), and conflicts
 * are matched at hour granularity: a manually scheduled 9:15 blocks the 9:00
 * slot. Previously this used the server's local timezone with exact
 * minute matching, so slots drifted from the displayed best-time advice and
 * same-hour double-bookings slipped through.
 */
export async function nextAvailableSlot(
  workspaceId: string,
  channelIds: string[],
  from = new Date(),
  timeZone = "UTC",
): Promise<Date> {
  let tz = timeZone;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    tz = "UTC";
  }
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
      status: { in: ["scheduled", "approved", "publishing"] },
      scheduledAt: { gte: from },
      channels: { some: { channelId: { in: channelIds } } },
    },
    select: { scheduledAt: true },
  });
  // Hour-granularity keys in the author's timezone: any post in the 9 o'clock
  // hour blocks the 9:00 slot, regardless of its exact minute.
  const takenKeys = new Set(
    taken
      .map((t) => t.scheduledAt)
      .filter((d): d is Date => !!d)
      .map((d) => {
        const p = tzDateParts(d, tz);
        const h = Number(
          new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(d),
        );
        return `${p.y}-${p.mo}-${p.day}-${h}`;
      }),
  );

  for (let dayOffset = 0; dayOffset < 60; dayOffset++) {
    const probe = new Date(from.getTime() + dayOffset * 86_400_000);
    const p = tzDateParts(probe, tz);
    const daySlots = slots
      .filter((s) => s.weekday === p.weekday)
      .sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));

    for (const s of daySlots) {
      const candidate = zonedWallToUtc(p.y, p.mo, p.day, s.hour, s.minute, tz);
      if (candidate <= from) continue;
      const key = `${p.y}-${p.mo}-${p.day}-${s.hour}`;
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
