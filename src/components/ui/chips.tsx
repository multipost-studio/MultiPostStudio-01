"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-[13px] transition-colors",
        on ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]" : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)]",
      )}
    >
      {children}
    </button>
  );
}

/** Free-text multi-value input with suggestions from values actually seen in the data. */
export function ChipInput({ label, values, suggestions, onChange, placeholder }: { label: string; values: string[]; suggestions: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = React.useState("");
  const listId = React.useId();
  const add = (raw: string) => {
    const v = raw.trim();
    if (v) onChange([...new Set([...values, v])]);
    setDraft("");
  };
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium text-[var(--text-muted)]">{label}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full border border-[var(--primary)] bg-[var(--primary-soft)] py-0.5 pl-2.5 pr-1 text-[13px] text-[var(--primary)]">
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))} className="rounded-full p-0.5 hover:bg-[var(--primary)]/20">
              <X size={12} aria-hidden />
            </button>
          </span>
        ))}
        <input
          value={draft}
          list={listId}
          onChange={(e) => {
            const v = e.target.value;
            // Picking a datalist suggestion fires onChange with the full value: take it immediately.
            if (suggestions.includes(v)) add(v);
            else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(draft);
            }
          }}
          onBlur={() => add(draft)}
          placeholder={values.length ? "" : placeholder}
          aria-label={`Add ${label.toLowerCase()}`}
          className="h-8 min-w-[9rem] flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-transparent px-2.5 text-[13px] text-[var(--text)] placeholder:text-[var(--text-subtle)]"
        />
        <datalist id={listId}>
          {suggestions.filter((s) => !values.includes(s)).map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
    </div>
  );
}

