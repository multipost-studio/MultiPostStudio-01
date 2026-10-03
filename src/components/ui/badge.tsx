import * as React from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "neutral" | "primary" | "success" | "warning" | "danger" | "info" | "accent";
export type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-[var(--bg-sunken)] text-[var(--text-muted)] border-[var(--border)]",
  primary: "bg-[var(--primary-soft)] text-[var(--primary-hover)] border-transparent",
  success: "bg-[var(--success-soft)] text-[var(--success)] border-transparent",
  warning: "bg-[var(--warning-soft)] text-[var(--warning)] border-transparent",
  danger: "bg-[var(--danger-soft)] text-[var(--danger)] border-transparent",
  info: "bg-[var(--info-soft)] text-[var(--info)] border-transparent",
  accent: "bg-[var(--accent-soft)] text-[var(--accent-hover)] border-transparent",
};

const variantToTone: Record<BadgeVariant, BadgeTone> = {
  default: "primary",
  secondary: "neutral",
  destructive: "danger",
  outline: "neutral",
  success: "success",
  warning: "warning",
  info: "info",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  variant?: BadgeVariant;
  dot?: boolean;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ tone, variant, className, dot, title, children, ...props }, ref) => {
    const resolvedTone: BadgeTone = tone ?? (variant ? variantToTone[variant] : "neutral");

    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex max-w-full shrink-0 items-center gap-1.5 overflow-hidden text-ellipsis rounded-[var(--radius-full)] border px-2.5 py-0.5 text-[12px] font-medium whitespace-nowrap transition-colors",
          tones[resolvedTone],
          variant === "outline" && "border-[var(--border-strong)] bg-transparent text-[var(--text)]",
          className,
        )}
        title={title ?? (typeof children === "string" ? children : undefined)}
        {...props}
      >
        {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
        {children}
      </span>
    );
  },
);
Badge.displayName = "Badge";
