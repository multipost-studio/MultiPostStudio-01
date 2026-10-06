import * as React from "react";
import { AlertTriangle, CheckCircle2, MinusCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StripCell } from "@/lib/health/analytics";
import type { ProbeStatus } from "@/lib/health/types";

export const STATUS_LABEL: Record<ProbeStatus, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  unhealthy: "Unhealthy",
  skipped: "Not configured",
};

const TEXT: Record<ProbeStatus, string> = {
  healthy: "text-[var(--success)]",
  degraded: "text-[var(--warning)]",
  unhealthy: "text-[var(--danger)]",
  skipped: "text-[var(--text-subtle)]",
};

const FILL: Record<ProbeStatus | "none", string> = {
  healthy: "bg-[var(--success)]",
  degraded: "bg-[var(--warning)]",
  unhealthy: "bg-[var(--danger)]",
  skipped: "bg-[var(--border-strong)]",
  none: "bg-[var(--bg-sunken)]",
};

const SOFT: Record<ProbeStatus, string> = {
  healthy: "bg-[var(--success-soft)] text-[var(--success)]",
  degraded: "bg-[var(--warning-soft)] text-[var(--warning)]",
  unhealthy: "bg-[var(--danger-soft)] text-[var(--danger)]",
  skipped: "bg-[var(--bg-sunken)] text-[var(--text-subtle)]",
};

export function StatusIcon({ status, size = 16, className }: { status: ProbeStatus; size?: number; className?: string }) {
  const cls = cn(TEXT[status], className);
  if (status === "healthy") return <CheckCircle2 size={size} className={cls} aria-hidden />;
  if (status === "degraded") return <AlertTriangle size={size} className={cls} aria-hidden />;
  if (status === "unhealthy") return <XCircle size={size} className={cls} aria-hidden />;
  return <MinusCircle size={size} className={cls} aria-hidden />;
}

/** Status pill. Colour is never the only cue: it always carries an icon and the word. */
export function StatusPill({ status, className }: { status: ProbeStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-semibold", SOFT[status], className)}>
      <StatusIcon status={status} size={13} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function statusText(status: ProbeStatus) {
  return TEXT[status];
}

const fmtTime = (ms: number) => new Date(ms).toLocaleString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) + " UTC";

/** A row of equal time cells, each coloured by the worst status seen in it. */
export function StatusStrip({ cells, className }: { cells: StripCell[]; className?: string }) {
  return (
    <div className={cn("flex h-6 items-stretch gap-[2px]", className)} role="img" aria-label="Status over the selected period, oldest on the left">
      {cells.map((c) => (
        <span
          key={c.from}
          title={`${fmtTime(c.from)} to ${fmtTime(c.to)}: ${c.status === "none" ? "no checks" : `${STATUS_LABEL[c.status]} (${c.checks} check${c.checks === 1 ? "" : "s"})`}`}
          className={cn("min-w-[2px] flex-1 rounded-[2px]", FILL[c.status], c.status === "none" && "opacity-60")}
        />
      ))}
    </div>
  );
}

/** Tiny inline latency trend. Points without a latency are skipped. */
export function LatencySpark({ points, className }: { points: { latencyMs: number | null; status: ProbeStatus }[]; className?: string }) {
  const data = points.filter((p): p is { latencyMs: number; status: ProbeStatus } => typeof p.latencyMs === "number");
  if (data.length < 2) return null;
  const w = 120;
  const h = 28;
  const max = Math.max(...data.map((d) => d.latencyMs), 1);
  const min = Math.min(...data.map((d) => d.latencyMs));
  const span = Math.max(1, max - min);
  const xy = data.map((d, i) => [(i / (data.length - 1)) * w, h - 3 - ((d.latencyMs - min) / span) * (h - 6)] as const);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("h-7 w-full text-[var(--primary)]", className)} preserveAspectRatio="none" role="img" aria-label={`Latency trend, ${min} to ${max} milliseconds`}>
      <path d={line} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export const fmtPct = (n: number | null) => (n === null ? "—" : `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(1)}%`);
export const fmtMs = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n.toLocaleString("en-US")} ms`);

/** Fixed locale + UTC so server and browser print the same text (no hydration mismatch). */
export function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }) + " UTC";
}
