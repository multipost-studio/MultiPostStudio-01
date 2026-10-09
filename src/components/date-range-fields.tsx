"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MIN_DATE } from "@/lib/date-range";

/**
 * Two date inputs and an Apply button. The page decides what applying means (it writes the URL), so this stays a
 * plain controlled form. Invalid or reversed dates disable Apply and say why; the server validates again anyway.
 */
export function DateRangeFields({
  from,
  to,
  today,
  onApply,
  disabled,
}: {
  from: string;
  to: string;
  /** The current UTC day, from the server, so the max matches what the server will accept. */
  today: string;
  onApply: (from: string, to: string) => void;
  disabled?: boolean;
}) {
  const [a, setA] = React.useState(from);
  const [b, setB] = React.useState(to);
  // Follow the URL when it changes (a preset was picked, or the back button was used): adjust state while rendering, not in an effect.
  const [seen, setSeen] = React.useState({ from, to });
  if (seen.from !== from || seen.to !== to) {
    setSeen({ from, to });
    setA(from);
    setB(to);
  }

  const error = !a || !b ? "Pick both dates" : a > b ? "The start is after the end" : a > today ? "The start is in the future" : a < MIN_DATE ? "Dates before 2020 aren't available" : null;
  const changed = a !== from || b !== to;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="space-y-1.5">
        <span className="block text-[13px] font-medium text-[var(--text-muted)]">From</span>
        <Input type="date" size="sm" value={a} min={MIN_DATE} max={today} onChange={(e) => setA(e.target.value)} className="w-auto" aria-label="From date" />
      </label>
      <label className="space-y-1.5">
        <span className="block text-[13px] font-medium text-[var(--text-muted)]">To</span>
        <Input type="date" size="sm" value={b} min={a || MIN_DATE} max={today} onChange={(e) => setB(e.target.value)} className="w-auto" aria-label="To date" />
      </label>
      <Button size="sm" variant="secondary" disabled={!!error || disabled || (!changed && !!from && !!to)} onClick={() => onApply(a, b)}>
        Apply
      </Button>
      {error && (a || b) && <span role="status" className="pb-2 text-[13px] text-[var(--text-muted)]">{error}</span>}
    </div>
  );
}
