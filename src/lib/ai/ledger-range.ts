import { parseCustomRange, rangeLabel } from "@/lib/date-range";
import { AI_LOG_RETENTION_DAYS } from "./call-log";

export const LEDGER_PRESETS = [
  { id: "24h", label: "24 hours", hours: 24 },
  { id: "7d", label: "7 days", hours: 24 * 7 },
  { id: "30d", label: "30 days", hours: 24 * 30 },
] as const;

export type LedgerRange = {
  preset: string;
  from: Date;
  to: Date;
  label: string;
  /** The typed dates, when custom. */
  custom: { from: string; to: string } | null;
  /** True when ?callRange=custom was asked for but unusable (the 7-day default is shown). */
  invalid: boolean;
};

/** ?callRange=24h|7d|30d|custom (+ callFrom, callTo). The log is kept for AI_LOG_RETENTION_DAYS, so a custom range cannot be longer. */
export function resolveLedgerRange(sp: { callRange?: string; callFrom?: string; callTo?: string }, now: Date = new Date()): LedgerRange {
  if (sp.callRange === "custom") {
    const c = parseCustomRange(sp.callFrom, sp.callTo, { now, maxDays: AI_LOG_RETENTION_DAYS });
    if (c) return { preset: "custom", from: c.from, to: c.to, label: rangeLabel(c), custom: { from: c.fromDay, to: c.toDay }, invalid: false };
  }
  const p = LEDGER_PRESETS.find((x) => x.id === sp.callRange) ?? LEDGER_PRESETS[1];
  return { preset: p.id, from: new Date(now.getTime() - p.hours * 3_600_000), to: now, label: `last ${p.label}`, custom: null, invalid: sp.callRange === "custom" };
}
