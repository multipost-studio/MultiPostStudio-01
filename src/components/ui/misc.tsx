import * as React from "react";
import { cn, initials, hueFromString } from "@/lib/utils";

/* ---------- Avatar ----------
 * No photo? Render a deterministic gradient identicon + initials — a real,
 * on-brand avatar rather than a stock-photo placeholder. Same name -> same look.
 */
export function Avatar({
  name,
  src,
  size = 32,
  className,
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const hue = hueFromString(name);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold overflow-hidden text-white",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: src
          ? undefined
          : `linear-gradient(135deg, hsl(${hue} 48% 46%), hsl(${(hue + 12) % 360} 56% 32%))`,
      }}
      aria-hidden
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}

/* ---------- Skeleton ---------- */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mps-skeleton h-4 w-full", className)} {...props} />;
}

/* ---------- Spinner ---------- */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block h-4 w-4 rounded-full border-2 border-[var(--border-strong)] border-t-[var(--primary)] animate-[mps-spin_0.6s_linear_infinite]",
        className,
      )}
    />
  );
}

/* ---------- Progress ---------- */
export function Progress({ value, className }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-[var(--bg-sunken)]", className)}
    >
      <div className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-500" style={{ width: `${v}%` }} />
    </div>
  );
}

/* ---------- EmptyState ---------- */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-6 py-12 text-center",
        className,
      )}
    >
      {icon && (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary-soft)] text-[var(--primary)]">
          {icon}
        </div>
      )}
      <p className="text-[16px] font-semibold text-[var(--text)]">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-[14px] text-[var(--text-muted)]">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ---------- ErrorState ---------- */
export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this. Try again in a moment.",
  retry,
}: {
  title?: string;
  description?: string;
  retry?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-[var(--danger-soft)] bg-[var(--danger-soft)]/40 px-6 py-10 text-center">
      <p className="text-[16px] font-semibold text-[var(--text)]">{title}</p>
      <p className="mt-1 max-w-sm text-[14px] text-[var(--text-muted)]">{description}</p>
      {retry && <div className="mt-4">{retry}</div>}
    </div>
  );
}

/* ---------- Stat ---------- */
export function Stat({
  label,
  value,
  delta,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  delta?: number;
  hint?: string;
}) {
  const up = (delta ?? 0) >= 0;
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-[13px] font-medium uppercase tracking-wide text-[var(--text-subtle)]">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold text-[var(--text)] tabular-nums">{value}</p>
      {delta !== undefined && (
        <p
          className={cn(
            "mt-1 inline-flex items-center gap-1 text-[13px] font-medium",
            up ? "text-[var(--success)]" : "text-[var(--danger)]",
          )}
        >
          <span aria-hidden>{up ? "▲" : "▼"}</span>
          {Math.abs(delta).toFixed(1)}%<span className="text-[var(--text-subtle)] font-normal"> {hint ?? "vs prev"}</span>
        </p>
      )}
    </div>
  );
}

/* ---------- Divider ---------- */
export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-0 border-t border-[var(--border)]", className)} />;
}

/* ---------- SectionTitle ---------- */
export function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={cn("text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-subtle)]", className)}>
      {children}
    </h2>
  );
}
