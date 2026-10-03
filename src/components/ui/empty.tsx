import * as React from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
}

export function EmptyState({
  className,
  icon,
  title,
  description,
  action,
  children,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-[280px] w-full flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--border-strong)] bg-[var(--surface)]/40 p-8 text-center animate-in fade-in-50",
        className
      )}
      {...props}
    >
      <div className="mx-auto flex max-w-[420px] flex-col items-center justify-center">
        {children ? (
          children
        ) : (
          <>
            {icon && <EmptyStateIcon>{icon}</EmptyStateIcon>}
            {title && <EmptyStateTitle>{title}</EmptyStateTitle>}
            {description && (
              <EmptyStateDescription>{description}</EmptyStateDescription>
            )}
            {action && <EmptyStateActions>{action}</EmptyStateActions>}
          </>
        )}
      </div>
    </div>
  );
}

export function EmptyStateIcon({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mb-4 flex h-12 w-12 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-hover)] text-[var(--text-muted)] shadow-xs",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function EmptyStateTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-[16px] font-semibold text-[var(--text)]", className)}
      {...props}
    />
  );
}

export function EmptyStateDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn(
        "mt-1.5 text-[14px] leading-relaxed text-[var(--text-muted)]",
        className
      )}
      {...props}
    />
  );
}

export function EmptyStateActions({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mt-5 flex flex-wrap items-center justify-center gap-3", className)}
      {...props}
    >
      {props.children}
    </div>
  );
}
