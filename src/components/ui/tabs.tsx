"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function Tabs({
  tabs,
  value,
  onValueChange,
  className,
  label,
}: {
  tabs: { value: string; label: string; count?: number }[];
  value: string;
  onValueChange: (v: string) => void;
  className?: string;
  label?: string;
}) {
  const onKeyDown = (e: React.KeyboardEvent) => {
    // Roving arrow-key navigation per the tabs pattern: arrows move and
    // activate (automatic activation), matching the click behavior.
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const idx = tabs.findIndex((t) => t.value === value);
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const next = tabs[(idx + dir + tabs.length) % tabs.length];
    if (next) onValueChange(next.value);
  };

  return (
    <div
      className={cn("flex gap-1 border-b border-[var(--border)]", className)}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onValueChange(t.value)}
            className={cn(
              "relative -mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[14px] font-medium transition-colors",
              "focus-visible:outline-2 focus-visible:outline-[var(--ring)]",
              active
                ? "border-[var(--primary)] text-[var(--text)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]",
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[12px] tabular-nums",
                  active ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "bg-[var(--bg-sunken)] text-[var(--text-subtle)]",
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
