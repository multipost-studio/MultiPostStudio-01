"use client";

import * as React from "react";
import { Hash, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Hashtags as chips, with the platform's limit shown and enforced at the point
 * of adding. Removing a chip is an explicit click on that chip; bulk removal
 * goes through the review dialog instead (nothing disappears silently).
 */
export function HashtagManager({
  tags,
  count,
  limit,
  recommended,
  platformName,
  disabled,
  onAdd,
  onRemove,
  onTrimExtras,
}: {
  /** Distinct hashtags currently in the text, e.g. "#saas". */
  tags: string[];
  /** Distinct count the platform sees (caption + first comment). */
  count: number;
  /** Hard limit, if the platform has one. */
  limit: number | null;
  /** Best-practice number, shown as advice only. */
  recommended: number | null;
  platformName: string;
  disabled?: boolean;
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
  onTrimExtras: () => void;
}) {
  const [draft, setDraft] = React.useState("");
  const inputId = React.useId();
  const atLimit = limit != null && count >= limit;
  const over = limit != null ? Math.max(0, count - limit) : 0;
  const cap = limit ?? recommended;

  function submit() {
    if (!draft.trim() || atLimit || disabled) return;
    onAdd(draft);
    setDraft("");
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-sunken)]/50 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--text)]">
          <Hash size={14} aria-hidden /> Hashtags
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[12px] font-medium tabular-nums",
              over > 0 ? "bg-[var(--danger-soft)] text-[var(--danger)]" : "bg-[var(--surface)] text-[var(--text-muted)]",
            )}
          >
            {cap != null ? `${count} / ${cap}${limit == null ? " suggested" : ""}` : count}
          </span>
        </p>
        {over > 0 && (
          <Button size="sm" variant="secondary" onClick={onTrimExtras} disabled={disabled}>
            Keep first {limit} · remove {over}
          </Button>
        )}
      </div>

      {tags.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="Hashtags in this post">
          {tags.map((t, i) => (
            <li
              key={t}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border py-0.5 pl-2.5 pr-1 text-[13px] font-medium",
                limit != null && i >= limit
                  ? "border-[var(--danger)]/40 bg-[var(--danger-soft)] text-[var(--danger)]"
                  : "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)]",
              )}
            >
              {t}
              {limit != null && i >= limit && <span className="sr-only"> (over the limit)</span>}
              <button
                type="button"
                disabled={disabled}
                aria-label={`Remove ${t}`}
                onClick={() => onRemove(t)}
                className="rounded-full p-0.5 text-[var(--text-subtle)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] disabled:opacity-50"
              >
                <X size={12} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <label htmlFor={inputId} className="sr-only">
          Add a hashtag
        </label>
        <input
          id={inputId}
          value={draft}
          disabled={disabled || atLimit}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " " || e.key === ",") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={atLimit ? `${platformName} limit reached: ${count}/${limit}` : "#add-a-hashtag"}
          aria-describedby={atLimit ? `${inputId}-limit` : undefined}
          className="h-8 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 text-[13px] text-[var(--text)] placeholder:text-[var(--text-subtle)] disabled:opacity-60"
        />
        <Button size="sm" variant="secondary" onClick={submit} disabled={disabled || atLimit || !draft.trim()}>
          <Plus size={13} aria-hidden /> Add
        </Button>
      </div>
      {atLimit && (
        <p id={`${inputId}-limit`} className="mt-1.5 text-[12.5px] text-[var(--text-muted)]">
          {platformName} supports a maximum of {limit} hashtags. Remove one to add another.
        </p>
      )}
    </div>
  );
}
