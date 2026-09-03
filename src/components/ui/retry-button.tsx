"use client";

import { RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Retry control for error boundaries and failed data loads. Pass `onRetry`
 * (e.g. an error boundary's `reset`); omit it to hard-reload the route.
 */
export function RetryButton({
  onRetry,
  children = "Try again",
  className,
}: {
  onRetry?: () => void;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => (onRetry ? onRetry() : window.location.reload())}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-[14px] font-semibold text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2",
        className,
      )}
    >
      <RotateCw size={14} aria-hidden />
      {children}
    </button>
  );
}
