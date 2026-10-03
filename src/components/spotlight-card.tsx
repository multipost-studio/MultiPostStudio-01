"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Cursor-spotlight card — hover lift plus a flame glow that follows the
 *  pointer (zero re-renders; CSS hides it on touch/reduced-motion). */
export function SpotlightCard({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const ref = React.useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      onMouseMove={(e) => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - r.left}px`);
        el.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}
      className={cn("mps-block mps-block-hover mps-spotlight group h-full p-5", className)}
      {...props}
    >
      {children}
    </div>
  );
}
