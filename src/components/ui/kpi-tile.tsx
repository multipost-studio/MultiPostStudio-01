import * as React from "react";
import { cn } from "@/lib/utils";
import { AnimatedNumber, CountUp } from "@/components/motion";

/**
 * Big-number tile: label + icon chip, large value, delta pill. `hero` renders the
 * deep-flame gradient version used for the single most important metric.
 */
export function KpiTile({
  label,
  value,
  icon,
  delta,
  hint,
  hero = false,
  countUp = false,
  className,
  children,
}: {
  label: string;
  value: number | string;
  icon?: React.ReactNode;
  /** Percent change; omit to show only the hint. */
  delta?: number;
  hint?: string;
  hero?: boolean;
  /** Numeric `value` counts up from zero on first view (compact: 83.9K). */
  countUp?: boolean;
  className?: string;
  /** Extra content under the value (e.g. a sparkline). */
  children?: React.ReactNode;
}) {
  const up = (delta ?? 0) >= 0;
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col rounded-[var(--radius-lg)] p-4 sm:p-5",
        hero
          ? "mps-hero-tile"
          : "mps-card-lift border border-[var(--border)]/70 bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={cn("text-[14px] font-medium", hero ? "text-white/90" : "text-[var(--text-muted)]")}>{label}</p>
        {icon && (
          <span
            aria-hidden
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
              hero ? "bg-white/20 text-white" : "bg-[var(--primary-soft)] text-[var(--primary)]",
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <p
        className={cn(
          "mt-3 font-semibold leading-none tracking-tight tabular-nums",
          hero ? "text-[40px] sm:text-[44px]" : "text-[28px] sm:text-[32px]",
        )}
      >
        {typeof value === "number" ? countUp ? <CountUp to={value} compact /> : <AnimatedNumber value={value} /> : value}
      </p>
      {(delta !== undefined || hint) && (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
          {delta !== undefined && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[12px] font-semibold",
                hero
                  ? "bg-white/20 text-white"
                  : up
                    ? "bg-[var(--success-soft)] text-[var(--success)]"
                    : "bg-[var(--danger-soft)] text-[var(--danger)]",
              )}
            >
              <span aria-hidden>{up ? "↑" : "↓"}</span>
              {Math.abs(delta).toFixed(1)}%
            </span>
          )}
          {hint && <span className={hero ? "text-white/80" : "text-[var(--text-subtle)]"}>{hint}</span>}
        </p>
      )}
      {children}
    </div>
  );
}
