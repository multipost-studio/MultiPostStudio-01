"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface TooltipContextType {
  open: boolean;
  setOpen: (v: boolean) => void;
  tooltipId: string;
  anchorRef: React.RefObject<HTMLDivElement | null>;
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
  className,
}: {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  content?: React.ReactNode;
  /** Wrapper display override. Default `inline-flex` shrink-wraps the trigger;
   *  pass e.g. `flex w-full` when the trigger must keep full width. */
  className?: string;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const tooltipId = React.useId();
  const anchorRef = React.useRef<HTMLDivElement | null>(null);

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
    <TooltipContext.Provider value={{ open, setOpen, tooltipId, anchorRef }}>
      <div ref={anchorRef} className={cn("relative", className ?? "inline-flex")}>{children}</div>
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
>(({ className, side = "top", align = "center", sideOffset = 6, children, style, ...props }, ref) => {
  const ctx = React.useContext(TooltipContext);
  const open = !!ctx?.open;
  const [pos, setPos] = React.useState<{ left: number; top: number } | null>(null);

  // Rendered in a portal with fixed coordinates: an absolutely-positioned tooltip
  // inside a scroll/overflow-hidden container (the sidebar rail) is clipped and
  // never visible.
  React.useLayoutEffect(() => {
    if (!open) return;
    const rect = ctx?.anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    setPos(
      side === "right"
        ? { left: rect.right + sideOffset, top: cy }
        : side === "left"
          ? { left: rect.left - sideOffset, top: cy }
          : side === "bottom"
            ? { left: cx, top: rect.bottom + sideOffset }
            : { left: cx, top: rect.top - sideOffset },
    );
  }, [open, side, sideOffset, ctx?.anchorRef]);

  if (!open || !pos || typeof document === "undefined") return null;

  const transform = {
    right: "translate(0, -50%)",
    left: "translate(-100%, -50%)",
    bottom: "translate(-50%, 0)",
    top: "translate(-50%, -100%)",
  }[side];

  return createPortal(
    <div
      ref={ref}
      id={ctx!.tooltipId}
      role="tooltip"
      style={{ position: "fixed", left: pos.left, top: pos.top, transform, ...style }}
      className={cn(
        "pointer-events-none z-[var(--z-tooltip,9999)] w-max max-w-[min(260px,calc(100vw-2rem))] whitespace-normal break-words rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-2.5 py-1 text-center text-[12px] font-medium text-[var(--text)] shadow-md animate-in fade-in-0",
        className,
      )}
      {...props}
    >
      {children}
    </div>,
    document.body,
  );
});
TooltipContent.displayName = "TooltipContent";
