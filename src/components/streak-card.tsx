import Link from "next/link";
import { Flame, CalendarClock, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { WorkspaceStreak } from "@/lib/streak-service";

/**
 * Posting streak, on the dashboard right rail.
 *
 * Every value is derived from real publish history (see lib/streak-service).
 * There is no placeholder path: a workspace that has never published gets the
 * "none" state, not a zero that looks like a loading glitch.
 *
 * The tone stays flat-professional — a number, a status, and one action. No
 * confetti, no mascot; this sits next to billing and analytics.
 */

const RING = {
  active: "border-[var(--success)] text-[var(--success)]",
  at_risk: "border-[var(--warning)] text-[var(--warning)]",
  broken: "border-[var(--border-strong)] text-[var(--text-subtle)]",
  none: "border-[var(--border-strong)] text-[var(--text-subtle)]",
} as const;

function copy(s: WorkspaceStreak): { title: string; body: string; cta: string | null } {
  const d = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
  switch (s.status) {
    case "active":
      return {
        title: `${d(s.current)} in a row`,
        body: s.nextMilestone
          ? `Published today. ${d(s.daysToNextMilestone ?? 0)} to your ${s.nextMilestone}-day milestone.`
          : "Published today. You're past every milestone — remarkable consistency.",
        cta: null,
      };
    case "at_risk":
      return {
        title: `${d(s.current)} in a row`,
        body: s.todayScheduled
          ? "You're covered — a post is scheduled for today. It counts once it publishes."
          : "Nothing has published today yet. Schedule or publish a post to keep the run going.",
        cta: s.todayScheduled ? null : "Schedule a post",
      };
    case "broken":
      return {
        title: "Start a new streak",
        body: s.longest
          ? `Your longest run was ${d(s.longest)}. Publish today to begin the next one.`
          : "Publish today to begin your first run.",
        cta: "Create a post",
      };
    default:
      return {
        title: "Start your streak",
        body: "Publish your first post and MultiPost Studio will track your posting consistency from here.",
        cta: "Create a post",
      };
  }
}

export function StreakCard({ streak }: { streak: WorkspaceStreak }) {
  const { title, body, cta } = copy(streak);
  const showCount = streak.status === "active" || streak.status === "at_risk";

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start gap-3.5">
          <div
            className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-full border-2 ${RING[streak.status]}`}
            aria-hidden
          >
            {showCount ? (
              <span className="text-[19px] font-bold leading-none tabular-nums">{streak.current}</span>
            ) : (
              <Flame size={20} />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[15px] font-semibold text-[var(--text)]">{title}</p>
              {streak.status === "at_risk" && !streak.todayScheduled && (
                <Badge tone="warning">At risk</Badge>
              )}
              {streak.status === "at_risk" && streak.todayScheduled && (
                <Badge tone="info">Scheduled</Badge>
              )}
              {streak.status === "active" && <Badge tone="success">On track</Badge>}
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-muted)]">{body}</p>

            {(streak.longest > 0 || streak.totalActiveDays > 0) && (
              <p className="mt-2 text-[12px] text-[var(--text-subtle)]">
                Longest {streak.longest} · {streak.totalActiveDays} active{" "}
                {streak.totalActiveDays === 1 ? "day" : "days"}
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {cta && (
                <Button asChild size="sm">
                  {/* Real composer. Its schedule modal already defaults to
                      now + 1h, i.e. today, so no fake prefill param is needed. */}
                  <Link href="/composer/new">
                    <CalendarClock size={14} /> {cta}
                  </Link>
                </Button>
              )}
              {streak.status === "at_risk" && streak.todayScheduled && (
                <span className="inline-flex items-center gap-1.5 text-[13px] text-[var(--success)]">
                  <CheckCircle2 size={14} /> Covered for today
                </span>
              )}
              <Link
                href="/insights/streak"
                className="text-[13px] font-medium text-[var(--primary)] hover:underline"
              >
                View history
              </Link>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
