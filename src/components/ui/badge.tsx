import * as React from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "neutral" | "primary" | "success" | "warning" | "danger" | "info" | "accent";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-[var(--bg-sunken)] text-[var(--text-muted)] border-[var(--border)]",
  primary: "bg-[var(--primary-soft)] text-[var(--primary)] border-transparent",
  success: "bg-[var(--success-soft)] text-[var(--success)] border-transparent",
  warning: "bg-[var(--warning-soft)] text-[var(--warning)] border-transparent",
  danger: "bg-[var(--danger-soft)] text-[var(--danger)] border-transparent",
  info: "bg-[var(--info-soft)] text-[var(--info)] border-transparent",
  accent: "bg-[var(--accent-soft)] text-[var(--accent-hover)] border-transparent",
};

export function Badge({
  tone = "neutral",
  className,
  dot,
  title,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[var(--radius-full)] border px-2 py-0.5 text-[13px] font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
      // Truncated badges (whitespace-nowrap + parent overflow) otherwise hide
      // their text from hover; an explicit title keeps it discoverable.
      title={title ?? (typeof children === "string" ? children : undefined)}
      {...props}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
