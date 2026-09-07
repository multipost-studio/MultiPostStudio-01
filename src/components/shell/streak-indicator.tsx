"use client";

import Link from "next/link";
import { Flame } from "lucide-react";

/**
 * Persistent streak indicator in the topbar.
 *
 * The dashboard card explains the streak; this is the ambient reminder that
 * follows the user around the app, so it carries only the number and a colour.
 * Status is conveyed by an accessible label as well as colour — the tint alone
 * would be invisible to a screen reader and ambiguous to a colourblind user.
 */
export type StreakSummary = {
  current: number;
  status: "none" | "active" | "at_risk" | "broken";
  todayScheduled: boolean;
};

const TONE = {
  active: "border-[var(--success)] text-[var(--success)]",
  at_risk: "border-[var(--warning)] text-[var(--warning)]",
  broken: "border-[var(--border-strong)] text-[var(--text-subtle)]",
  none: "border-[var(--border-strong)] text-[var(--text-subtle)]",
} as const;

function label(s: StreakSummary): string {
  const d = `${s.current} day${s.current === 1 ? "" : "s"}`;
  switch (s.status) {
    case "active":
      return `Posting streak: ${d}. Published today.`;
    case "at_risk":
      return s.todayScheduled
        ? `Posting streak: ${d}. A post is scheduled for today.`
        : `Posting streak: ${d} — at risk. Nothing published today yet.`;
    case "broken":
      return "No active posting streak. Publish today to start one.";
    default:
      return "No posting streak yet. Publish your first post to start one.";
  }
}

export function StreakIndicator({ streak }: { streak: StreakSummary }) {
  const showCount = streak.current > 0;
  const text = label(streak);

  return (
    <Link
      href="/insights/streak"
      title={text}
      aria-label={text}
      className={`relative inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border ${TONE[streak.status]} transition-colors hover:bg-[var(--surface-hover)]`}
    >
      <Flame size={15} aria-hidden />
      {showCount && (
        <span
          aria-hidden
          className="absolute -bottom-1 -right-1 min-w-[15px] rounded-full border border-[var(--bg-elevated)] bg-[var(--primary)] px-[3px] text-center text-[10px] font-bold leading-[14px] text-[var(--primary-text)] tabular-nums"
        >
          {streak.current > 99 ? "99+" : streak.current}
        </span>
      )}
      {/* A dot only when action is needed, so the icon isn't permanently noisy. */}
      {streak.status === "at_risk" && !streak.todayScheduled && (
        <span
          aria-hidden
          className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[var(--warning)] ring-2 ring-[var(--bg-elevated)]"
        />
      )}
    </Link>
  );
}
