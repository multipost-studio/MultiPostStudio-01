"use client";

import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import type { Insight, Severity } from "@/lib/mascot-brain/types";
import { cn } from "@/lib/utils";

const DOT: Record<Severity, string> = {
  critical: "bg-[var(--danger)]",
  warn: "bg-[var(--warning)]",
  info: "bg-[var(--info)]",
  win: "bg-[var(--success)]",
};
const LABEL: Record<Severity, string> = { critical: "Urgent", warn: "Needs you", info: "Idea", win: "Nice" };

/**
 * "Today": the ranked briefing built from live workspace data. Each card says
 * what is happening, why it matters, and does the next step in one tap. "Later"
 * quiets it for a while (a worse situation comes back on its own).
 */
export function AssistantToday({
  insights,
  loaded,
  onSnooze,
  go,
  onAsk,
}: {
  insights: Insight[];
  loaded: boolean;
  onSnooze: (insight: Insight) => void;
  go: (href: string) => void;
  onAsk: () => void;
}) {
  if (!loaded) {
    return (
      <div className="space-y-2 p-3" aria-busy="true" aria-label="Loading your briefing">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-[var(--radius)] bg-[var(--surface-hover)]" />
        ))}
      </div>
    );
  }
  if (insights.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
        <CheckCircle2 size={28} aria-hidden className="text-[var(--success)]" />
        <p className="text-[14px] font-semibold text-[var(--text)]">You are all caught up</p>
        <p className="text-[13px] leading-snug text-[var(--text-muted)]">Nothing is failing, waiting or expiring. I will tell you the moment that changes.</p>
        <button type="button" onClick={onAsk} className="mt-1 text-[13px] font-semibold text-[var(--primary)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--ring)]">Ask me something</button>
      </div>
    );
  }
  return (
    <ul className="space-y-2 p-2.5">
      {insights.map((i) => (
        <li key={i.id} className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3">
          <div className="flex items-start gap-2.5">
            <span aria-hidden className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", DOT[i.severity])} />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold leading-snug text-[var(--text)]">
                {i.title} <span className="sr-only">({LABEL[i.severity]})</span>
              </p>
              <p className="mt-0.5 text-[12.5px] leading-snug text-[var(--text-muted)]">{i.body}</p>
              <div className="mt-2 flex items-center gap-3">
                {i.action && (
                  <a
                    href={i.action.href}
                    onClick={(e) => {
                      e.preventDefault();
                      go(i.action!.href);
                    }}
                    className="inline-flex rounded-full bg-[var(--primary)] px-3 py-1 text-[12.5px] font-semibold text-[var(--primary-text)] hover:bg-[var(--primary-hover)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
                  >
                    {i.action.label}
                  </a>
                )}
                <button type="button" onClick={() => onSnooze(i)} className="text-[12.5px] font-medium text-[var(--text-subtle)] hover:text-[var(--text)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--ring)]">
                  Later
                </button>
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
