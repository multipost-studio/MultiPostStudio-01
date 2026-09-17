import * as React from "react";
import { cn } from "@/lib/utils";

export function Table({
  className,
  label,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement> & { label?: string }) {
  return (
    // tabindex + region role so keyboard users can scroll wide tables; the
    // label names the region for screen readers.
    <div
      className="w-full overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)]"
      tabIndex={0}
      role="region"
      aria-label={label ?? "Data table"}
    >
      <table className={cn("w-full border-collapse text-[15px]", className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("bg-[var(--bg-sunken)]", className)} {...props} />;
}

export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn("border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-hover)]/60", className)}
      {...props}
    />
  );
}

export function TH({
  className,
  scope = "col",
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope={scope}
      className={cn(
        "px-4 py-2.5 text-left text-[13px] font-semibold uppercase tracking-wide text-[var(--text-muted)]",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Sortable column header: a button with full sort semantics. `direction` is
 * null when this column isn't the sort key.
 */
export function SortTH({
  className,
  label,
  direction,
  onSort,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & {
  label: string;
  direction: "ascending" | "descending" | null;
  onSort: () => void;
}) {
  return (
    <TH
      aria-sort={direction === null ? "none" : direction}
      className={cn("p-0", className)}
      {...props}
    >
      <button
        type="button"
        onClick={onSort}
        aria-label={`Sort by ${label}${direction === "ascending" ? " (sorted ascending)" : direction === "descending" ? " (sorted descending)" : ""}`}
        className="flex w-full items-center gap-1 px-4 py-2.5 text-left uppercase focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
      >
        {label}
        <span aria-hidden className="text-[11px] text-[var(--text-subtle)]">
          {direction === "ascending" ? "▲" : direction === "descending" ? "▼" : "△"}
        </span>
      </button>
    </TH>
  );
}

export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-3 text-[14px] text-[var(--text)] align-middle", className)} {...props} />;
}
