import * as React from "react";
import { cn } from "@/lib/utils";

const STAR = "M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8L12 2.5z";

/**
 * A row of five stars filled to `rating` (fractions allowed, so 4.6 shows 4 and a bit).
 * Server-safe; the accessible label carries the number so the stars can be decoration.
 */
export function Stars({ rating, size = 16, className }: { rating: number; size?: number; className?: string }) {
  const value = Math.max(0, Math.min(5, rating));
  const label = `${Number.isInteger(value) ? value : value.toFixed(1)} out of 5 stars`;
  const row = (fill: string) => (
    <span className="flex gap-0.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
          <path d={STAR} fill={fill} />
        </svg>
      ))}
    </span>
  );
  return (
    <span role="img" aria-label={label} className={cn("relative inline-flex", className)}>
      <span className="text-[var(--border-strong)]">{row("currentColor")}</span>
      <span className="absolute inset-y-0 left-0 overflow-hidden text-[#f5a623]" style={{ width: `${(value / 5) * 100}%` }}>
        <span className="flex w-max">{row("currentColor")}</span>
      </span>
    </span>
  );
}
