"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/* ---------- Switch ---------- */
export function Switch({
  checked,
  onCheckedChange,
  disabled,
  label,
  srLabel,
  id,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
  /** Accessible name when no visible label is shown. */
  srLabel?: string;
  id?: string;
}) {
  const toggle = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label ?? srLabel}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "inline-flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors",
        "focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2",
        checked ? "bg-[var(--primary)]" : "bg-[var(--border-strong)]",
        disabled && "opacity-50",
      )}
    >
      <span
        className={cn(
          "h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-150",
          checked ? "translate-x-4" : "translate-x-0",
        )}
      />
    </button>
  );

  if (!label) return toggle;
  return (
    <label htmlFor={id} className={cn("inline-flex items-center gap-2.5", disabled && "opacity-50")}>
      {toggle}
      <span className="text-[14px] text-[var(--text)]">{label}</span>
    </label>
  );
}

/* ---------- Tooltip (CSS/hover) ---------- */
export function Tooltip({ content, children }: { content: string; children: React.ReactNode }) {
  return (
    <span className="group/tt relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--text)] px-2 py-1 text-[12px] font-medium text-[var(--bg-elevated)] opacity-0 transition-opacity group-hover/tt:opacity-100"
      >
        {content}
      </span>
    </span>
  );
}

/* ---------- Checkbox ---------- */
export function Checkbox({
  checked,
  onCheckedChange,
  label,
  id,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label?: string;
  id?: string;
}) {
  return (
    <label htmlFor={id} className="inline-flex cursor-pointer items-center gap-2 text-[14px] text-[var(--text)]">
      <span
        className={cn(
          "flex h-4 w-4 items-center justify-center rounded-[4px] border transition-colors",
          checked ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--border-strong)] bg-[var(--bg-elevated)]",
        )}
      >
        {checked && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        )}
      </span>
      <input
        id={id}
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onCheckedChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

/* ---------- SegmentedControl ---------- */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-sunken)] p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-[var(--radius-sm)] px-3 py-1 text-[14px] font-medium transition-colors",
            o.value === value
              ? "bg-[var(--surface)] text-[var(--text)] shadow-sm"
              : "text-[var(--text-muted)] hover:text-[var(--text)]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
