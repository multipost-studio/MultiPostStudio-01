"use client";

import { CheckCircle2, AlertTriangle, XCircle, Sparkles } from "lucide-react";
import { type SeoCheckItem } from "@/lib/blog";

export function SeoChecklistCard({
  score,
  checks,
  wordCount,
  readMins,
}: {
  score: number;
  checks: SeoCheckItem[];
  wordCount: number;
  readMins: number;
}) {
  const scoreColor =
    score >= 80 ? "text-[var(--success)]" : score >= 50 ? "text-[var(--warning)]" : "text-[var(--danger)]";
  const barColor =
    score >= 80 ? "bg-[var(--success)]" : score >= 50 ? "bg-[var(--warning)]" : "bg-[var(--danger)]";

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-[var(--primary)]" />
          <h3 className="text-[14px] font-semibold text-[var(--text)]">Content & SEO Health</h3>
        </div>
        <div className="flex items-baseline gap-1">
          <span className={`text-xl font-bold tabular-nums ${scoreColor}`}>{score}</span>
          <span className="text-[12px] text-[var(--text-subtle)]">/100</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--border)]">
        <div className={`h-full transition-all duration-300 ${barColor}`} style={{ width: `${score}%` }} />
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--text-subtle)]">
        <span>{wordCount} words</span>
        <span>~{readMins} min read</span>
      </div>

      {/* Checklist items */}
      <ul className="mt-3 space-y-2">
        {checks.map((item) => (
          <li key={item.id} className="flex items-start gap-2 text-[12px]">
            {item.status === "pass" && <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-[var(--success)]" />}
            {item.status === "warn" && <AlertTriangle size={14} className="mt-0.5 shrink-0 text-[var(--warning)]" />}
            {item.status === "fail" && <XCircle size={14} className="mt-0.5 shrink-0 text-[var(--danger)]" />}
            <div className="min-w-0">
              <span className="font-medium text-[var(--text)]">{item.label}: </span>
              <span className="text-[var(--text-muted)]">{item.detail}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
