import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

const tones: Record<Tone, string> = {
  neutral: "bg-[var(--bg-sunken)] text-[var(--text-muted)] border-[var(--border)]",
  primary: "bg-[var(--primary-soft)] text-[var(--primary)] border-transparent",
  success: "bg-[var(--success-soft)] text-[var(--success)] border-transparent",
  warning: "bg-[var(--warning-soft)] text-[var(--warning)] border-transparent",
  danger: "bg-[var(--danger-soft)] text-[var(--danger)] border-transparent",
  info: "bg-[var(--info-soft)] text-[var(--info)] border-transparent",
};

export function Badge({
  tone = "neutral",
  className,
  dot,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[var(--radius-full)] border px-2 py-0.5 text-[13px] font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
      {...props}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {props.children}
    </span>
  );
}
