/**
 * Custom date ranges for reports. Pure.
 *
 * A custom range comes from two calendar dates (YYYY-MM-DD, UTC days) in the URL. Both are inclusive: 5 Oct to 7 Oct is
 * three days. The end is never later than "now" (a report cannot see the future), the start is never before MIN_DATE,
 * and the span is capped so a typo cannot ask the database for ten years of rows. Anything invalid returns null and the
 * caller falls back to its preset, so a hand-edited URL can never break a page.
 */
const DAY = 86_400_000;
export const MIN_DATE = "2020-01-01";
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export type CustomRange = {
  /** Start of the first day, UTC. */
  from: Date;
  /** End of the last day, UTC, clamped to `now`. */
  to: Date;
  /** Inclusive calendar days covered. */
  days: number;
  fromDay: string;
  toDay: string;
};

/** A real calendar date or null: rejects 2026-02-30, which `new Date` would silently roll over. */
export function parseDay(v: string | null | undefined): Date | null {
  if (typeof v !== "string" || !ISO_DAY.test(v)) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : d;
}

export function parseCustomRange(from: string | null | undefined, to: string | null | undefined, opts: { now?: Date; maxDays?: number } = {}): CustomRange | null {
  const now = opts.now ?? new Date();
  const maxDays = opts.maxDays ?? 1830;
  const start = parseDay(from);
  const endDay = parseDay(to);
  if (!start || !endDay) return null;
  if (start < new Date(`${MIN_DATE}T00:00:00.000Z`)) return null;
  if (start > now) return null;
  if (endDay < start) return null;
  const endOfDay = new Date(endDay.getTime() + DAY - 1);
  const end = endOfDay > now ? now : endOfDay;
  const days = Math.round((Date.UTC(endDay.getUTCFullYear(), endDay.getUTCMonth(), endDay.getUTCDate()) - start.getTime()) / DAY) + 1;
  if (days > maxDays) return null;
  return { from: start, to: end, days, fromDay: start.toISOString().slice(0, 10), toDay: endDay.toISOString().slice(0, 10) };
}

/** "5 Oct 2026 – 12 Oct 2026", stable across servers (UTC, English). */
export function rangeLabel(r: Pick<CustomRange, "from" | "to">): string {
  const f = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return `${f(r.from)} – ${f(r.to)}`;
}

export const DATE_PRESETS = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "90d", label: "Last 90 days" },
  { id: "this-month", label: "This month" },
  { id: "last-month", label: "Last month" },
  { id: "this-year", label: "This year" },
] as const;
export type DatePresetId = (typeof DATE_PRESETS)[number]["id"];

const dayOf = (d: Date) => d.toISOString().slice(0, 10);

/** UTC calendar days for a quick-pick. "Last 7 days" is today and the six days before it, matching the inclusive custom range. */
export function presetRange(id: string, now: Date = new Date()): { from: string; to: string } | null {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const back = (n: number) => dayOf(new Date(now.getTime() - n * DAY));
  switch (id) {
    case "today":
      return { from: dayOf(now), to: dayOf(now) };
    case "yesterday":
      return { from: back(1), to: back(1) };
    case "7d":
      return { from: back(6), to: dayOf(now) };
    case "30d":
      return { from: back(29), to: dayOf(now) };
    case "90d":
      return { from: back(89), to: dayOf(now) };
    case "this-month":
      return { from: dayOf(new Date(Date.UTC(y, m, 1))), to: dayOf(now) };
    case "last-month":
      return { from: dayOf(new Date(Date.UTC(y, m - 1, 1))), to: dayOf(new Date(Date.UTC(y, m, 0))) };
    case "this-year":
      return { from: dayOf(new Date(Date.UTC(y, 0, 1))), to: dayOf(now) };
    default:
      return null;
  }
}

/** Which quick-pick the current from/to equals, or "" when it is a hand-picked range (or empty). */
export function matchPreset(from: string, to: string, now: Date = new Date()): string {
  if (!from || !to) return "";
  for (const p of DATE_PRESETS) {
    const r = presetRange(p.id, now);
    if (r && r.from === from && r.to === to) return p.id;
  }
  return "";
}

export function todayDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
