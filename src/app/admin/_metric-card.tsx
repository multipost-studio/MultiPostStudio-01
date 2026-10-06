import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Hero-weight KPI card for admin overview pages — bigger number, optional
 * icon and real trend delta. Sibling to the existing compact `Stat`
 * (components/ui/misc.tsx): that one stays for secondary/dense metric rows,
 * this one is for the handful of primary numbers a page leads with.
 *
 * `delta` is a real period-over-period percent, or omitted entirely when
 * there's nothing honest to compare against — never a fabricated 0%.
 */
export function MetricCard({
  label,
  value,
  delta,
  deltaHint = "vs prior period",
  icon,
  tone = "primary",
  sparkline,
  hero = false,
}: {
  label: string;
  value: React.ReactNode;
  delta?: number | null;
  deltaHint?: string;
  icon?: React.ReactNode;
  tone?: "primary" | "success" | "info" | "warning";
  /** A <Sparkline /> (components/charts.tsx) or any small inline visualization — rendered full-width along the card's bottom edge. */
  sparkline?: React.ReactNode;
  /** Deep-flame gradient version for the page's single most important number. */
  hero?: boolean;
}) {
  const up = (delta ?? 0) >= 0;
  const toneStyle: Record<string, { chip: string; wash: string }> = {
    primary: { chip: "bg-[var(--primary-soft)] text-[var(--primary)]", wash: "from-[var(--primary-soft)]" },
    success: { chip: "bg-[var(--success-soft)] text-[var(--success)]", wash: "from-[var(--success-soft)]" },
    info: { chip: "bg-[var(--info-soft)] text-[var(--info)]", wash: "from-[var(--info-soft)]" },
    warning: { chip: "bg-[var(--warning-soft)] text-[var(--warning)]", wash: "from-[var(--warning-soft)]" },
  };
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] p-5",
        hero
          ? "mps-hero-tile"
          : cn("mps-card-lift relative overflow-hidden border border-[var(--border)]/70 bg-gradient-to-br to-[var(--surface)] shadow-[var(--shadow-card)]", toneStyle[tone].wash),
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className={cn("text-[14px] font-medium", hero ? "text-white/90" : "text-[var(--text-muted)]")}>{label}</p>
        {icon && (
          <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", hero ? "bg-white/20 text-white" : toneStyle[tone].chip)}>
            {icon}
          </span>
        )}
      </div>
      <p className={cn("mt-3 text-[2.25rem] font-semibold leading-none tracking-tight tabular-nums", hero ? "text-white" : "text-[var(--text)]")}>{value}</p>
      {delta !== null && delta !== undefined && (
        <p
          className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]"
        >
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[12px] font-semibold",
              hero ? "bg-white/20 text-white" : up ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--danger-soft)] text-[var(--danger)]",
            )}
          >
            <span aria-hidden>{up ? "↑" : "↓"}</span>
            {Math.abs(delta).toFixed(1)}%
          </span>
          <span className={hero ? "text-white/80" : "text-[var(--text-subtle)]"}>{deltaHint}</span>
        </p>
      )}
      {sparkline && <div className="-mx-1 -mb-1 mt-3">{sparkline}</div>}
    </div>
  );
}
