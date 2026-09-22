import * as React from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  className,
  children,
  tourId,
  wash,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
  /** Stable anchor for the product tour spotlight (`data-tour`). */
  tourId?: string;
  /** Opt-in signature ambience band (emerald/teal wash, theme-aware). Off by default. */
  wash?: "a" | "b" | "c" | "d";
}) {
  return (
    <div className={cn("mb-5 sm:mb-6", wash && "relative", className)} data-tour={tourId}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-balance text-xl font-semibold tracking-tight text-[var(--text)]">{title}</h1>
          {description && <p className="mt-1 max-w-prose text-[14px] text-[var(--text-muted)]">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
      {wash && <div aria-hidden className={`mps-pagewash mps-pagewash--${wash}`} />}
    </div>
  );
}
