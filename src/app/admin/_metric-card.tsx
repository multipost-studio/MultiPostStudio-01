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
}: {
  label: string;
  value: React.ReactNode;
  delta?: number | null;
  deltaHint?: string;
  icon?: React.ReactNode;
  tone?: "primary" | "success" | "info" | "warning";
}) {
  const up = (delta ?? 0) >= 0;
  const toneBg: Record<string, string> = {
    primary: "bg-[var(--primary-soft)] text-[var(--primary)]",
    success: "bg-[var(--success-soft)] text-[var(--success)]",
    info: "bg-[var(--info-soft)] text-[var(--info)]",
    warning: "bg-[var(--warning-soft)] text-[var(--warning)]",
  };
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-[var(--text-muted)]">{label}</p>
        {icon && (
          <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)]", toneBg[tone])}>
            {icon}
          </span>
        )}
      </div>
      <p className="mt-2 text-[2rem] font-bold leading-none tabular-nums text-[var(--text)]">{value}</p>
      {delta !== null && delta !== undefined && (
        <p
          className={cn(
            "mt-2.5 inline-flex items-center gap-1 text-[13px] font-medium",
            up ? "text-[var(--success)]" : "text-[var(--danger)]",
          )}
        >
          <span aria-hidden>{up ? "▲" : "▼"}</span>
          {Math.abs(delta).toFixed(1)}%<span className="font-normal text-[var(--text-subtle)]"> {deltaHint}</span>
        </p>
      )}
    </div>
  );
}
