import type { Range } from "@/lib/analytics";
import { parseCustomRange, rangeLabel } from "@/lib/date-range";

const PRESETS: readonly Range[] = [7, 14, 30, 90];

export type ResolvedRange = {
  /** The preset to use when there is no valid custom window. */
  days: Range;
  /** Pass to getAnalytics; null for a preset. */
  window: { from: Date; to: Date } | null;
  /** The dates typed into the form, when custom. */
  custom: { from: string; to: string } | null;
  /** True when ?range=custom was asked for but the dates were unusable (the page falls back to 30 days). */
  invalid: boolean;
  /** Human text for headings: "last 30 days" or "5 Oct 2026 – 12 Oct 2026". */
  label: string;
  /** Query string that reproduces this range (for export and report links). */
  query: string;
};

/** Reads ?range=7|14|30|90 or ?range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD. Never throws; a bad value falls back to 30 days. */
export function resolveAnalyticsRange(sp: { range?: string; from?: string; to?: string }, now: Date = new Date()): ResolvedRange {
  if (sp.range === "custom") {
    const c = parseCustomRange(sp.from, sp.to, { now, maxDays: 365 });
    if (c) {
      return {
        days: 30,
        window: { from: c.from, to: c.to },
        custom: { from: c.fromDay, to: c.toDay },
        invalid: false,
        label: rangeLabel(c),
        query: `range=custom&from=${c.fromDay}&to=${c.toDay}`,
      };
    }
    return { days: 30, window: null, custom: null, invalid: true, label: "last 30 days", query: "range=30" };
  }
  const n = Number(sp.range);
  const days = (PRESETS.includes(n as Range) ? n : 30) as Range;
  return { days, window: null, custom: null, invalid: false, label: `last ${days} days`, query: `range=${days}` };
}
