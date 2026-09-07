import type { Metadata } from "next";
import Link from "next/link";
import { requireWorkspace } from "@/lib/session";
import { getWorkspaceStreak } from "@/lib/streak-service";
import { STREAK_MILESTONES, dayRange, addDayKey } from "@/lib/streak";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat, EmptyState, InlineEmpty } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Posting streak" };

const WEEKS = 26; // ~6 months — enough to read a habit without a wall of squares.

/**
 * Streak history. Everything here is derived from published posts, so a day
 * only lights up if something actually reached a platform.
 */
export default async function StreakPage() {
  const ctx = await requireWorkspace();
  const tz = ctx.user.timezone || "UTC";
  const streak = await getWorkspaceStreak(ctx.active.workspace.id, tz);
  const active = new Set(streak.activeDays);

  // Grid runs Monday-first and ends on today's week.
  const end = streak.todayKey;
  const start = addDayKey(end, -(WEEKS * 7 - 1));
  const all = dayRange(start, end);
  const weeks: string[][] = [];
  for (let i = 0; i < all.length; i += 7) weeks.push(all.slice(i, i + 7));

  const consistency = all.length
    ? Math.round((all.filter((d) => active.has(d)).length / all.length) * 100)
    : 0;

  const reached = STREAK_MILESTONES.filter((m) => streak.longest >= m);
  const next = streak.nextMilestone;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Posting streak"
        description={`Consecutive days with at least one published post, in ${tz.replace(/_/g, " ")}.`}
        actions={
          <Button asChild size="sm">
            <Link href="/composer/new">Create a post</Link>
          </Button>
        }
      />

      {streak.totalActiveDays === 0 ? (
        <EmptyState
          title="No posting history yet"
          description="Once a post publishes, this page tracks your day-by-day consistency, your longest run, and the milestones you've reached."
          action={
            <Button asChild size="sm">
              <Link href="/composer/new">Create your first post</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Current streak" value={`${streak.current}d`} />
            <Stat label="Longest streak" value={`${streak.longest}d`} />
            <Stat label="Active days" value={String(streak.totalActiveDays)} />
            <Stat label={`Consistency · ${WEEKS}w`} value={`${consistency}%`} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Last {WEEKS} weeks</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Scrolls on narrow screens rather than squashing the squares. */}
              <div className="overflow-x-auto">
                <div className="flex gap-1" style={{ minWidth: WEEKS * 16 }}>
                  {weeks.map((week) => (
                    <div key={week[0]} className="flex flex-col gap-1">
                      {week.map((day) => {
                        const isToday = day === streak.todayKey;
                        const did = active.has(day);
                        const cls = did
                          ? "bg-[var(--success)]"
                          : isToday
                            ? "bg-[var(--warning-soft)] border border-[var(--warning)]"
                            : "bg-[var(--bg-sunken)] border border-[var(--border)]";
                        return (
                          <div
                            key={day}
                            title={`${day} — ${did ? "published" : isToday ? "nothing published yet today" : "no posts"}`}
                            className={`h-3 w-3 rounded-[3px] ${cls}`}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-4 text-[12px] text-[var(--text-subtle)]">
                <span className="inline-flex items-center gap-1.5">
                  <i className="h-3 w-3 rounded-[3px] bg-[var(--success)]" /> Published
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <i className="h-3 w-3 rounded-[3px] border border-[var(--warning)] bg-[var(--warning-soft)]" /> Today,
                  nothing yet
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <i className="h-3 w-3 rounded-[3px] border border-[var(--border)] bg-[var(--bg-sunken)]" /> No posts
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Milestones</CardTitle>
            </CardHeader>
            <CardContent>
              {reached.length === 0 ? (
                <InlineEmpty
                  title="No milestones yet"
                  hint={`Your longest run is ${streak.longest} day${streak.longest === 1 ? "" : "s"}. The first milestone is ${STREAK_MILESTONES[0]} days.`}
                />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {STREAK_MILESTONES.map((m) => {
                    const hit = streak.longest >= m;
                    return (
                      <Badge key={m} tone={hit ? "success" : "neutral"}>
                        {m} days{hit ? "" : " · locked"}
                      </Badge>
                    );
                  })}
                </div>
              )}
              {next && (
                <p className="mt-3 text-[13px] text-[var(--text-muted)]">
                  {streak.current > 0
                    ? `${next - streak.current} more consecutive day${next - streak.current === 1 ? "" : "s"} to reach ${next}.`
                    : `Start a new run — the next milestone is ${next} days.`}
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
