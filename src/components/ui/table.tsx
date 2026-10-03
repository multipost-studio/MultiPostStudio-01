import * as React from "react";
import { cn } from "@/lib/utils";

export const Table = React.forwardRef<
  HTMLTableElement,
  React.TableHTMLAttributes<HTMLTableElement> & { label?: string; wrapperClassName?: string }
>(({ className, wrapperClassName, label, ...props }, ref) => (
  <div
    className={cn(
      "w-full overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)]",
      wrapperClassName,
    )}
    tabIndex={0}
    role="region"
    aria-label={label ?? "Data table"}
  >
    <table
      ref={ref}
      className={cn("w-full border-collapse text-[14.5px] caption-bottom", className)}
      {...props}
    />
  </div>
));
Table.displayName = "Table";

export const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn("bg-[var(--bg-sunken)] [&_tr]:border-b", className)}
    {...props}
  />
));
TableHeader.displayName = "TableHeader";

export const THead = TableHeader;

export const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
));
TableBody.displayName = "TableBody";

export const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn("border-t bg-[var(--surface-hover)] font-medium [&>tr]:last:border-b-0", className)}
    {...props}
  />
));
TableFooter.displayName = "TableFooter";

export const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-b border-[var(--border)] transition-colors hover:bg-[var(--surface-hover)]/60 data-[state=selected]:bg-[var(--surface-active)]",
      className,
    )}
    {...props}
  />
));
TableRow.displayName = "TableRow";

export const TR = TableRow;

export const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, scope = "col", ...props }, ref) => (
  <th
    ref={ref}
    scope={scope}
    className={cn(
      "h-10 px-4 py-2.5 text-left align-middle text-[12.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)] [&:has([role=checkbox])]:pr-0",
      className,
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

export const TH = TableHead;

export const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn("px-4 py-3 align-middle text-[14px] text-[var(--text)] [&:has([role=checkbox])]:pr-0", className)}
    {...props}
  />
));
TableCell.displayName = "TableCell";

export const TD = TableCell;

export const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-[13px] text-[var(--text-subtle)]", className)}
    {...props}
  />
));
TableCaption.displayName = "TableCaption";

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
    <TableHead
      aria-sort={direction === null ? "none" : direction}
      className={cn("p-0", className)}
      {...props}
    >
      <button
        type="button"
        onClick={onSort}
        aria-label={`Sort by ${label}${direction === "ascending" ? " (sorted ascending)" : direction === "descending" ? " (sorted descending)" : ""}`}
        className="flex w-full items-center gap-1.5 px-4 py-2.5 text-left font-semibold uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
      >
        {label}
        <span aria-hidden className="text-[11px] text-[var(--text-subtle)]">
          {direction === "ascending" ? "▲" : direction === "descending" ? "▼" : "△"}
        </span>
      </button>
    </TableHead>
  );
}
