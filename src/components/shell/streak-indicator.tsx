"use client";

import Link from "next/link";

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
  nextMilestone: number | null;
  daysToNextMilestone: number | null;
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

/**
 * The Lucide flame outline plus an inner core, as separate SVG groups so the
 * outer body and the hot centre can move out of phase (see .mps-flame in
 * globals.css). Colour comes from the --flame token set by the status.
 */
function FlameGlyph() {
  const outline = "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z";
  return (
    <svg className="mps-flame" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path className="mps-flame__outer" d={outline} />
      <path className="mps-flame__core" stroke="none" d="M12 20.5a3.6 3.6 0 0 0 3.6-3.6c0-1.3-.8-2.2-1.6-3.2-.6.9-1.1 1.4-1.9 1.4-.9 0-1.4-.8-1.9-1.7-1 .9-1.8 2-1.8 3.5A3.6 3.6 0 0 0 12 20.5z" />
    </svg>
  );
}

export function StreakIndicator({ streak }: { streak: StreakSummary }) {
  const showCount = streak.current > 0;
  const text = label(streak);

  return (
    <Link
      href="/insights/streak"
      title={text}
      aria-label={text}
      data-status={streak.status}
      data-ignite={streak.status === "active" ? "1" : undefined}
      className={`mps-streak relative inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border ${TONE[streak.status]}`}
    >
      <span aria-hidden className="mps-streak__halo" />
      <FlameGlyph />
      {/* Sparks only rise on hover (CSS), so they cost nothing at rest. */}
      <span aria-hidden className="mps-streak__spark" />
      <span aria-hidden className="mps-streak__spark" />
      <span aria-hidden className="mps-streak__spark" />
      <span aria-hidden className="mps-streak__spark" />
      {showCount && (
        <span
          key={streak.current}
          aria-hidden
          className="mps-pop absolute -bottom-1 -right-1 min-w-[15px] rounded-full border border-[var(--bg-elevated)] bg-[var(--primary)] px-[3px] text-center text-[10px] font-bold leading-[14px] text-[var(--primary-text)] tabular-nums"
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
