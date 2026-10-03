import * as React from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      role="navigation"
      aria-label="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  );
}

export const PaginationContent = React.forwardRef<
  HTMLUListElement,
  React.ComponentProps<"ul">
>(({ className, ...props }, ref) => (
  <ul ref={ref} className={cn("flex flex-row items-center gap-1", className)} {...props} />
));
PaginationContent.displayName = "PaginationContent";

export const PaginationItem = React.forwardRef<
  HTMLLIElement,
  React.ComponentProps<"li">
>(({ className, ...props }, ref) => (
  <li ref={ref} className={cn("", className)} {...props} />
));
PaginationItem.displayName = "PaginationItem";

type PaginationLinkProps = {
  isActive?: boolean;
  href?: string;
  onClick?: () => void;
  size?: "default" | "sm" | "lg" | "icon";
} & React.ComponentProps<"a">;

export function PaginationLink({
  className,
  isActive,
  size = "sm",
  href,
  children,
  ...props
}: PaginationLinkProps) {
  const Comp: any = href ? Link : "button";
  return (
    <Comp
      aria-current={isActive ? "page" : undefined}
      href={href ?? "#"}
      className={cn(
        "inline-flex items-center justify-center rounded-[var(--radius-md,8px)] px-3 h-8 text-sm font-medium transition-colors",
        isActive
          ? "border border-[var(--border)] bg-[var(--surface-active,rgba(255,255,255,0.1))] text-[var(--foreground)]"
          : "text-[var(--muted-foreground)] hover:bg-[var(--surface-hover,rgba(255,255,255,0.05))] hover:text-[var(--foreground)]",
        className
      )}
      {...props}
    >
      {children}
    </Comp>
  );
}

export function PaginationPrevious({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink
      aria-label="Go to previous page"
      size="default"
      className={cn("gap-1 pl-2.5", className)}
      {...props}
    >
      <ChevronLeft className="h-4 w-4" />
      <span>Previous</span>
    </PaginationLink>
  );
}

export function PaginationNext({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink
      aria-label="Go to next page"
      size="default"
      className={cn("gap-1 pr-2.5", className)}
      {...props}
    >
      <span>Next</span>
      <ChevronRight className="h-4 w-4" />
    </PaginationLink>
  );
}

export function PaginationEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      className={cn("flex h-8 w-8 items-center justify-center text-[var(--muted-foreground)]", className)}
      {...props}
    >
      <MoreHorizontal className="h-4 w-4" />
      <span className="sr-only">More pages</span>
    </span>
  );
}
