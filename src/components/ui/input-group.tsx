import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputGroupProps extends React.HTMLAttributes<HTMLDivElement> {}

export const InputGroup = React.forwardRef<HTMLDivElement, InputGroupProps>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "relative flex w-full items-center [&>input]:pr-10 [&>svg:first-child]:left-3 [&>svg:last-child]:right-3 [&>svg]:absolute [&>svg]:top-1/2 [&>svg]:-translate-y-1/2 [&>svg]:pointer-events-none [&>svg]:text-[var(--muted-foreground)]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
);
InputGroup.displayName = "InputGroup";

export interface InputAddonProps extends React.HTMLAttributes<HTMLDivElement> {
  placement?: "left" | "right";
}

export const InputAddon = React.forwardRef<HTMLDivElement, InputAddonProps>(
  ({ className, placement = "left", children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex items-center px-3 text-sm text-[var(--muted-foreground)] select-none bg-[var(--surface-hover)] border border-[var(--border)]",
        placement === "left" ? "rounded-l-[var(--radius-md)] border-r-0" : "rounded-r-[var(--radius-md)] border-l-0",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
);
InputAddon.displayName = "InputAddon";
