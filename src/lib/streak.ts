/**
 * Posting-streak engine.
 *
 * Deliberately derived from real publish history rather than stored in its own
 * table: a counter that can drift out of sync with the posts it describes is
 * worse than one recomputed from the source of truth. The only inputs are a set
 * of calendar days on which the workspace actually published, plus which day
 * "today" is — so the whole thing is pure and testable with no clock or DB.
 *
 * Day boundaries are the VIEWER's, not the server's. `localDayKey` converts an
 * instant to a YYYY-MM-DD key in a given IANA zone, so a post published at
 * 23:30 in Asia/Kolkata counts for that day, not the UTC one.
 */

export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 90, 180, 365] as const;

export type StreakStatus =
  /** Never published anything. */
  | "none"
  /** Published today — the streak is safe. */
  | "active"
  /** Published yesterday but not yet today; today still saves it. */
  | "at_risk"
  /** The last publish is older than yesterday; the run has ended. */
  | "broken";

export type StreakState = {
  current: number;
  longest: number;
  status: StreakStatus;
  /** First day of the current run (YYYY-MM-DD), null when there is no run. */
  startedOn: string | null;
  /** Most recent day with a publish, across all history. */
  lastActiveOn: string | null;
  todayCompleted: boolean;
  totalActiveDays: number;
  /** Next milestone above the current streak, null once past the last one. */
  nextMilestone: number | null;
  daysToNextMilestone: number | null;
  /** Set when the current streak lands exactly on a milestone today. */
  reachedMilestone: number | null;
};

/** YYYY-MM-DD for `instant` as seen in `timeZone`. Falls back to UTC. */
export function localDayKey(instant: Date, timeZone: string): string {
  try {
    // en-CA formats as YYYY-MM-DD, which sorts and compares lexicographically.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(instant);
  } catch {
    // An unknown/garbage IANA name must not take the dashboard down.
    return instant.toISOString().slice(0, 10);
  }
}

/**
 * Calendar-date arithmetic done in UTC space on purpose: the keys are already
 * local dates, so stepping them as UTC midnights avoids DST double-counting
 * (a day that "has" 23 or 25 hours locally is still one calendar day).
 */
function addDays(dayKey: string, delta: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + delta * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

function isValidKey(k: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(k) && !Number.isNaN(Date.parse(`${k}T00:00:00Z`));
}

/**
 * @param activeDays days (YYYY-MM-DD, viewer-local) with >= 1 successful publish.
 *                   Duplicates and unsorted input are fine — multiple posts on
 *                   one day count once.
 * @param todayKey   today in the same zone.
 */
export function computeStreak(activeDays: Iterable<string>, todayKey: string): StreakState {
  const days = [...new Set([...activeDays].filter(isValidKey))].sort();

  const empty: StreakState = {
    current: 0,
    longest: 0,
    status: "none",
    startedOn: null,
    lastActiveOn: null,
    todayCompleted: false,
    totalActiveDays: 0,
    nextMilestone: STREAK_MILESTONES[0],
    daysToNextMilestone: STREAK_MILESTONES[0],
    reachedMilestone: null,
  };
  if (days.length === 0 || !isValidKey(todayKey)) return empty;

  // Longest run anywhere in history.
  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    run = days[i] === addDays(days[i - 1], 1) ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  const lastActiveOn = days[days.length - 1];
  const yesterdayKey = addDays(todayKey, -1);
  const todayCompleted = days.includes(todayKey);

  // The run is only "current" if it reaches today or yesterday; anything older
  // has already lapsed. Days after today (possible if a publish timestamp is in
  // the future) are ignored rather than trusted.
  const anchor = todayCompleted ? todayKey : lastActiveOn === yesterdayKey ? yesterdayKey : null;

  let current = 0;
  let startedOn: string | null = null;
  if (anchor) {
    const set = new Set(days);
    let cursor = anchor;
    while (set.has(cursor)) {
      current++;
      startedOn = cursor;
      cursor = addDays(cursor, -1);
    }
  }

  const status: StreakStatus = !anchor ? "broken" : todayCompleted ? "active" : "at_risk";
  const nextMilestone = STREAK_MILESTONES.find((m) => m > current) ?? null;

  return {
    current,
    longest,
    status,
    startedOn,
    lastActiveOn,
    todayCompleted,
    totalActiveDays: days.length,
    nextMilestone,
    daysToNextMilestone: nextMilestone === null ? null : nextMilestone - current,
    // Only celebrate on the day the milestone is actually hit.
    reachedMilestone:
      todayCompleted && (STREAK_MILESTONES as readonly number[]).includes(current) ? current : null,
  };
}

/** Inclusive list of day keys from `from` to `to`, for calendar rendering. */
export function dayRange(from: string, to: string): string[] {
  if (!isValidKey(from) || !isValidKey(to) || from > to) return [];
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export { addDays as addDayKey };
