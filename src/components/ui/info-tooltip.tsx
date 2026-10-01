"use client";

import * as React from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Tap-to-reveal info bubble. Hover-only tooltips don't work on touch, so
 * this toggles on click/tap (same outside-click + Escape pattern as
 * Dropdown) instead of relying on :hover.
 */
export function InfoTooltip({
  description,
  side = "bottom",
  className,
}: {
  description: string;
  side?: "bottom" | "top" | "right";
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className={cn("relative inline-flex shrink-0", className)}>
      <button
        type="button"
        onClick={(e) => {
          // Sits beside a Link/card, never inside one — stopPropagation is a
          // belt-and-braces guard so a future nesting mistake can't turn
          // "show info" into "navigate away".
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="More info"
        aria-expanded={open}
        className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-subtle)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
      >
        <Info size={13} aria-hidden />
      </button>
      {open && (
        <span
          role="tooltip"
          className={cn(
            // Right-anchored (grows left), not left-anchored: every call site
            // places the trigger near the right edge of a narrow container
            // (sidebar drawer, card corner) — a left-anchored bubble measured
            // fine on desktop but overflowed off-screen on a 375px phone.
            "absolute z-50 w-52 max-w-[calc(100vw-2rem)] rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--bg-elevated)] p-2.5 text-[12.5px] leading-snug text-[var(--text-muted)] shadow-lg",
            side === "bottom" && "right-0 top-full mt-1.5",
            side === "top" && "right-0 bottom-full mb-1.5",
            side === "right" && "left-full top-1/2 ml-1.5 -translate-y-1/2",
          )}
        >
          {description}
        </span>
      )}
    </span>
  );
}
