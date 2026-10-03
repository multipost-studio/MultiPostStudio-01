"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface TooltipContextType {
  open: boolean;
  setOpen: (v: boolean) => void;
  tooltipId: string;
}

const TooltipContext = React.createContext<TooltipContextType | null>(null);

export function TooltipProvider({ children }: { children: React.ReactNode; delayDuration?: number }) {
  return <>{children}</>;
}

export function Tooltip({
  children,
  open: controlledOpen,
  onOpenChange,
  content,
}: {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  content?: React.ReactNode;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const tooltipId = React.useId();

  const setOpen = React.useCallback(
    (v: boolean) => {
      if (!isControlled) setUncontrolledOpen(v);
      onOpenChange?.(v);
    },
    [isControlled, onOpenChange],
  );

  // If `content` shorthand is provided, wrap children with Trigger & Content
  if (content !== undefined) {
    return (
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent>{content}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <TooltipContext.Provider value={{ open, setOpen, tooltipId }}>
      <div className="relative inline-flex">{children}</div>
    </TooltipContext.Provider>
  );
}

export const TooltipTrigger = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement> & { asChild?: boolean }
>(({ children, asChild, className, ...props }, ref) => {
  const ctx = React.useContext(TooltipContext);

  const handleMouseEnter = () => ctx?.setOpen(true);
  const handleMouseLeave = () => ctx?.setOpen(false);
  const handleFocus = () => ctx?.setOpen(true);
  const handleBlur = () => ctx?.setOpen(false);

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<any>, {
      ref,
      onMouseEnter: handleMouseEnter,
      onMouseLeave: handleMouseLeave,
      onFocus: handleFocus,
      onBlur: handleBlur,
      "aria-describedby": ctx?.open ? ctx.tooltipId : undefined,
      className: cn((children.props as any).className, className),
      ...props,
    });
  }

  return (
    <button
      ref={ref as any}
      type="button"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      aria-describedby={ctx?.open ? ctx?.tooltipId : undefined}
      className={cn("inline-flex items-center justify-center", className)}
      {...props}
    >
      {children}
    </button>
  );
});
TooltipTrigger.displayName = "TooltipTrigger";

export const TooltipContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    side?: "top" | "bottom" | "left" | "right";
    align?: "start" | "center" | "end";
    sideOffset?: number;
  }
>(({ className, side = "top", align = "center", sideOffset = 4, children, ...props }, ref) => {
  const ctx = React.useContext(TooltipContext);
  if (!ctx?.open) return null;

  const sideClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-1.5",
    left: "right-full top-1/2 -translate-y-1/2 mr-1.5",
    right: "left-full top-1/2 -translate-y-1/2 ml-1.5",
  };

  return (
    <div
      ref={ref}
      id={ctx.tooltipId}
      role="tooltip"
      className={cn(
        "pointer-events-none absolute z-[var(--z-dropdown)] w-max max-w-[min(260px,calc(100vw-2rem))] whitespace-normal break-words rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-2.5 py-1 text-center text-[12px] font-medium text-[var(--text)] shadow-md animate-in fade-in-0 zoom-in-95",
        sideClasses[side],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
});
TooltipContent.displayName = "TooltipContent";
