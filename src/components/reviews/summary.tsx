import * as React from "react";
import type { ReviewSummary } from "@/lib/reviews/model";
import { Stars } from "./stars";

/** Average, stars and the five-to-one breakdown. Shared by the landing band and /reviews. */
export function RatingSummary({ summary }: { summary: ReviewSummary }) {
  const max = Math.max(1, ...summary.distribution);
  return (
    <div className="rounded-[24px] border border-[var(--border)] bg-[var(--bg-elevated)] p-6 shadow-[var(--shadow-card)]">
      <div className="flex items-end gap-4">
        <span className="mps-metric text-[56px] font-extrabold leading-none text-[var(--text)]">{summary.average.toFixed(1)}</span>
        <span className="pb-1.5">
          <Stars rating={summary.average} size={20} />
          <span className="mt-1 block text-[13px] font-medium text-[var(--text-muted)]">
            from {summary.count} review{summary.count === 1 ? "" : "s"}
          </span>
        </span>
      </div>
      <ul className="mt-5 space-y-1.5" aria-label="Rating breakdown">
        {summary.distribution.map((n, i) => (
          <li key={i} className="flex items-center gap-2.5 text-[12.5px] text-[var(--text-muted)]">
            <span className="w-8 shrink-0 font-semibold">{5 - i} ★</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-hover)]">
              <span className="mps-rv-bar block h-full rounded-full bg-[#f5a623]" style={{ width: `${(n / max) * 100}%`, animationDelay: `${i * 90}ms` }} />
            </span>
            <span className="w-6 shrink-0 text-right tabular-nums">{n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
