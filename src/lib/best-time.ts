/**
 * Best time to post, from this workspace's own published results.
 *
 * `ai_best_time` has been a Pro entitlement and a line in the plan comparison
 * table with no implementation behind it anywhere in the codebase. This is
 * that implementation.
 *
 * It is arithmetic on measured engagement, not a model — there is no LLM call
 * here and nothing about it should be labelled AI-generated. It answers one
 * question: of the hours this workspace has actually published in, which ones
 * performed best?
 *
 * The hard rule is that it refuses rather than guesses. A slot backed by one
 * post is noise, and presenting noise as "your audience peaks Sunday 7:15pm"
 * is exactly the kind of confident invention that makes an analytics feature
 * worthless. Slots below the sample threshold are not returned at all, and a
 * workspace without enough history gets an honest empty answer.
 */

/** Minimum posts in a slot before it can be recommended. */
export const MIN_SAMPLES_PER_SLOT = 2;

/** Minimum posts overall before any recommendation is made. */
export const MIN_TOTAL_POSTS = 8;

export type PostOutcome = {
  /** When it went live. */
  publishedAt: Date;
  /** Measured engagement rate for that post on that channel. */
  engagementRate: number;
};

export type Slot = {
  /** 0 = Sunday, matching Date#getDay. */
  weekday: number;
  /** 0-23, in the timezone the caller bucketed for. */
  hour: number;
  posts: number;
  avgEngagementRate: number;
};

export type BestTimeResult = {
  /** Every slot with at least MIN_SAMPLES_PER_SLOT posts, best first. */
  slots: Slot[];
  /** Posts considered. */
  sampleSize: number;
  /** Set when there isn't enough history to answer honestly. */
  insufficient: boolean;
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Bucket outcomes into weekday/hour slots.
 *
 * `parts` must already express each date in the viewer's timezone — the caller
 * owns that, because a workspace in Kolkata and one in Toronto disagree about
 * which day a 9pm UTC post belongs to, and getting that wrong silently shifts
 * every recommendation.
 */
export function rankSlots(
  outcomes: PostOutcome[],
  parts: (d: Date) => { weekday: number; hour: number },
): BestTimeResult {
  const buckets = new Map<string, { weekday: number; hour: number; total: number; n: number }>();

  for (const o of outcomes) {
    const { weekday, hour } = parts(o.publishedAt);
    const key = `${weekday}:${hour}`;
    const b = buckets.get(key) ?? { weekday, hour, total: 0, n: 0 };
    b.total += o.engagementRate;
    b.n += 1;
    buckets.set(key, b);
  }

  const slots = [...buckets.values()]
    .filter((b) => b.n >= MIN_SAMPLES_PER_SLOT)
    .map((b) => ({
      weekday: b.weekday,
      hour: b.hour,
      posts: b.n,
      avgEngagementRate: b.total / b.n,
    }))
    // Best rate first; more evidence breaks a tie.
    .sort((a, b) => b.avgEngagementRate - a.avgEngagementRate || b.posts - a.posts);

  return {
    slots,
    sampleSize: outcomes.length,
    insufficient: outcomes.length < MIN_TOTAL_POSTS || slots.length === 0,
  };
}

/** "Tuesday at 08:00" — for a recommendation the user reads. */
export function describeSlot(slot: Slot): string {
  return `${DAYS[slot.weekday] ?? "?"} at ${String(slot.hour).padStart(2, "0")}:00`;
}

/**
 * The next occurrence of a slot, at or after `from`, in the given timezone.
 *
 * Returns a UTC Date suitable for `scheduledAt`. The hour is interpreted in
 * `timeZone`, so "Tuesday 08:00" means 08:00 where the user is, whatever the
 * server's clock says.
 */
export function nextOccurrence(slot: Slot, timeZone: string, from = new Date()): Date {
  // Walk forward day by day and ask the formatter what local day each is —
  // arithmetic on UTC hours would drift across a DST boundary.
  for (let i = 0; i < 8; i++) {
    const day = new Date(from.getTime() + i * 86_400_000);
    const { weekday, hour } = zonedParts(day, timeZone);
    if (weekday !== slot.weekday) continue;
    const candidate = atZonedHour(day, slot.hour, timeZone);
    if (candidate.getTime() > from.getTime()) return candidate;
    // Right weekday but the hour has passed today — keep walking to next week.
    if (i === 0 && hour >= slot.hour) continue;
  }
  // Unreachable for a valid weekday; fall back to a week out rather than throw.
  return new Date(from.getTime() + 7 * 86_400_000);
}

/** Weekday and hour of a Date as seen in `timeZone`. */
export function zonedParts(d: Date, timeZone: string): { weekday: number; hour: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hr = parts.find((p) => p.type === "hour")?.value ?? "0";
  const index = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
  return { weekday: index === -1 ? 0 : index, hour: Number(hr) % 24 };
}

/** The same calendar day as `day`, at `hour` local to `timeZone`, as UTC. */
function atZonedHour(day: Date, hour: number, timeZone: string): Date {
  // Start from the day's midnight UTC, then correct by the zone's offset at
  // that moment — which is what makes this DST-correct.
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(day);
  const guess = new Date(`${ymd}T${String(hour).padStart(2, "0")}:00:00Z`);
  const seen = zonedParts(guess, timeZone).hour;
  const driftHours = ((hour - seen + 36) % 24) - 12;
  return new Date(guess.getTime() + driftHours * 3_600_000);
}
