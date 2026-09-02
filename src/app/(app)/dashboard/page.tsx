import Link from "next/link";
import type { Metadata } from "next";
import {
  CalendarClock,
  CheckCheck,
  MessageSquareWarning,
  TrendingUp,
  Sparkles,
  PenLine,
  Lightbulb,
  Plug,
  Megaphone,
  ArrowRight,
} from "lucide-react";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat, EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HealthRing } from "@/components/health-ring";
import { StatusBadge } from "@/components/status-badge";
import { PlatformBadge } from "@/components/brand";
import { TrendArea } from "@/components/charts";
import { formatNumber, formatTime, relativeTime, truncate } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function DashboardPage() {
  const ctx = await requireWorkspace();
  const wsId = ctx.active.workspace.id;
  const first = ctx.user.name.split(" ")[0];

  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const endToday = new Date(startToday.getTime() + 86_400_000);

  const [
    todayPosts,
    approvals,
    hotConversations,
    latestHealth,
    snapshots,
    insights,
    opportunities,
    activity,
    goals,
  ] = await Promise.all([
    db.post.findMany({
      where: { workspaceId: wsId, scheduledAt: { gte: startToday, lt: endToday }, status: { in: ["scheduled", "approved"] } },
      include: { channels: { include: { channel: true } } },
      orderBy: { scheduledAt: "asc" },
    }),
    db.approvalRequest.findMany({
      where: { post: { workspaceId: wsId }, status: { in: ["in_review", "changes_requested"] } },
      include: { post: true },
      take: 5,
      orderBy: { createdAt: "desc" },
    }),
    db.conversation.findMany({
      where: { workspaceId: wsId, status: { in: ["open", "pending"] }, priority: { gte: 2 } },
      orderBy: [{ priority: "desc" }, { lastMessageAt: "desc" }],
      take: 5,
    }),
    db.healthScore.findFirst({ where: { workspaceId: wsId }, orderBy: { date: "desc" } }),
    db.metricSnapshot.findMany({ where: { workspaceId: wsId, channelId: null }, orderBy: { date: "asc" }, take: 30 }),
    db.insight.findMany({ where: { workspaceId: wsId, dismissed: false }, take: 3, orderBy: { createdAt: "desc" } }),
    db.opportunity.findMany({ where: { workspaceId: wsId, status: "open" }, orderBy: { score: "desc" }, take: 3 }),
    db.activityEvent.findMany({ where: { workspaceId: wsId }, orderBy: { createdAt: "desc" }, take: 8, include: { actor: true } }),
    db.contentGoal.findMany({ where: { workspaceId: wsId } }),
  ]);

  const recent = snapshots.slice(-14);
  const followersNow = snapshots.at(-1)?.followers ?? 0;
  const followersPrev = snapshots.at(-8)?.followers ?? followersNow;
  const followerDelta = followersPrev ? ((followersNow - followersPrev) / followersPrev) * 100 : 0;

  const sumWindow = (key: "reach" | "engagement" | "impressions") =>
    recent.reduce((s, r) => s + (r[key] as number), 0);
  const engRate = sumWindow("impressions") ? (sumWindow("engagement") / sumWindow("impressions")) * 100 : 0;

  const chartData = recent.map((s) => ({
    label: new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    followers: s.followers,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">
          {greeting()}, {first}
        </h1>
        <p className="text-[14px] text-[var(--text-muted)]">
          Here&apos;s your briefing for {ctx.active.workspace.name} · {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Create post", href: "/composer/new", icon: PenLine },
          { label: "Add idea", href: "/ideas?new=1", icon: Lightbulb },
          { label: "Connect account", href: "/integrations", icon: Plug },
          { label: "New campaign", href: "/campaigns?new=1", icon: Megaphone },
        ].map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="group flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--primary)] hover:bg-[var(--primary-soft)]/30"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary-soft)] text-[var(--primary)]">
              <a.icon size={17} />
            </span>
            <span className="text-[14px] font-medium text-[var(--text)]">{a.label}</span>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Today's priorities */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Today&apos;s priorities</CardTitle>
              <Link href="/calendar" className="text-[13px] text-[var(--primary)] hover:underline">
                Open calendar
              </Link>
            </CardHeader>
            <CardContent className="space-y-4">
              <Priority icon={<CalendarClock size={15} />} label={`${todayPosts.length} post${todayPosts.length === 1 ? "" : "s"} scheduled today`}>
                {todayPosts.length === 0 ? (
                  <p className="text-[14px] text-[var(--text-subtle)]">Nothing scheduled. Your queue has open slots.</p>
                ) : (
                  <ul className="space-y-2">
                    {todayPosts.map((p) => (
                      <li key={p.id} className="flex items-center gap-2">
                        <span className="text-[13px] font-medium tabular-nums text-[var(--text-muted)] w-14">
                          {p.scheduledAt ? formatTime(p.scheduledAt) : "—"}
                        </span>
                        <div className="flex -space-x-1">
                          {p.channels.slice(0, 3).map((c) => (
                            <PlatformBadge key={c.id} platform={c.platform} size={18} />
                          ))}
                        </div>
                        <Link href={`/composer/${p.id}`} className="flex-1 truncate text-[14px] text-[var(--text)] hover:underline">
                          {p.title ?? truncate(p.channels[0]?.body ?? "Untitled", 60)}
                        </Link>
                        <StatusBadge status={p.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </Priority>

              <Priority icon={<CheckCheck size={15} />} label={`${approvals.length} pending approval${approvals.length === 1 ? "" : "s"}`}>
                {approvals.length === 0 ? (
                  <p className="text-[14px] text-[var(--text-subtle)]">No posts waiting on review.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {approvals.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-2">
                        <Link href="/approvals" className="truncate text-[14px] text-[var(--text)] hover:underline">
                          {a.post.title ?? "Untitled post"}
                        </Link>
                        <Badge tone={a.status === "changes_requested" ? "warning" : "info"}>
                          {a.status === "changes_requested" ? "Changes requested" : `Stage ${a.currentStage + 1}`}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </Priority>

              <Priority icon={<MessageSquareWarning size={15} />} label={`${hotConversations.length} conversation${hotConversations.length === 1 ? "" : "s"} need attention`}>
                {hotConversations.length === 0 ? (
                  <p className="text-[14px] text-[var(--text-subtle)]">Inbox is calm right now.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {hotConversations.map((c) => (
                      <li key={c.id} className="flex items-center gap-2">
                        <PlatformBadge platform={c.platform} size={16} />
                        <Link href="/inbox" className="flex-1 truncate text-[14px] text-[var(--text)] hover:underline">
                          <span className="font-medium">{c.authorName}</span>{" "}
                          <span className="text-[var(--text-muted)]">{truncate(c.preview, 50)}</span>
                        </Link>
                        {c.sentiment === "negative" && <Badge tone="danger">Negative</Badge>}
                      </li>
                    ))}
                  </ul>
                )}
              </Priority>
            </CardContent>
          </Card>

          {/* Performance summary */}
          <Card>
            <CardHeader>
              <CardTitle>Performance · last 14 days</CardTitle>
              <Link href="/analytics" className="text-[13px] text-[var(--primary)] hover:underline">
                Full analytics
              </Link>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Followers" value={formatNumber(followersNow)} delta={followerDelta} />
                <Stat label="Reach" value={formatNumber(sumWindow("reach"))} />
                <Stat label="Engagement" value={formatNumber(sumWindow("engagement"))} />
                <Stat label="Eng. rate" value={`${engRate.toFixed(1)}%`} />
              </div>
              <div className="mt-4">
                <TrendArea data={chartData} dataKey="followers" />
              </div>
            </CardContent>
          </Card>

          {/* AI recommendations */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5">
                <Sparkles size={15} className="text-[var(--primary)]" /> AI recommendations
              </CardTitle>
              <Link href="/insights" className="text-[13px] text-[var(--primary)] hover:underline">
                All insights
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {insights.length === 0 ? (
                <EmptyState title="No insights yet" description="Publish a few posts and MultiPost Studio will start surfacing patterns." />
              ) : (
                insights.map((ins) => (
                  <div key={ins.id} className="rounded-[var(--radius-md)] border border-[var(--border)] p-3">
                    <p className="text-[14px] font-medium text-[var(--text)]">{ins.what}</p>
                    <p className="mt-1 text-[13px] text-[var(--text-muted)]">
                      <span className="font-medium text-[var(--text)]">Why: </span>
                      {ins.why}
                    </p>
                    <p className="mt-1 text-[13px] text-[var(--primary)]">
                      <span className="font-medium">Do next: </span>
                      {ins.action}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right rail */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Social Health Score</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              <HealthRing score={latestHealth?.score ?? 0} size={140} />
              <div className="w-full space-y-1.5 text-[13px]">
                {latestHealth &&
                  [
                    ["Consistency", latestHealth.consistency],
                    ["Engagement", latestHealth.engagement],
                    ["Growth", latestHealth.growth],
                    ["Response speed", latestHealth.responseSpeed],
                    ["Content diversity", latestHealth.diversity],
                  ].map(([k, v]) => (
                    <div key={k as string} className="flex items-center justify-between">
                      <span className="text-[var(--text-muted)]">{k}</span>
                      <span className="font-medium tabular-nums text-[var(--text)]">{v as number}</span>
                    </div>
                  ))}
              </div>
              <Button asChild variant="secondary" size="sm" className="w-full">
                <Link href="/analytics">How to improve</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Content opportunities</CardTitle>
              <Link href="/opportunities" className="text-[13px] text-[var(--primary)] hover:underline">
                All
              </Link>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {opportunities.map((o) => (
                <Link
                  key={o.id}
                  href="/opportunities"
                  className="block rounded-[var(--radius-md)] border border-[var(--border)] p-3 hover:border-[var(--primary)]"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">{o.type}</span>
                    <Badge tone="primary">Score {o.score}</Badge>
                  </div>
                  <p className="mt-1 text-[13px] text-[var(--text)]">{o.title}</p>
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Goals this period</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {goals.map((g) => {
                const pct = Math.min(100, (g.current / g.target) * 100);
                return (
                  <div key={g.id}>
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="capitalize text-[var(--text-muted)]">{g.metric.replace(/_/g, " ")}</span>
                      <span className="font-medium tabular-nums text-[var(--text)]">
                        {g.current} / {g.target}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-sunken)]">
                      <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2.5">
                {activity.map((a) => (
                  <li key={a.id} className="flex gap-2 text-[13px]">
                    <ArrowRight size={13} className="mt-0.5 shrink-0 text-[var(--text-subtle)]" />
                    <span className="text-[var(--text-muted)]">
                      <span className="font-medium text-[var(--text)]">{a.actor?.name ?? "System"}</span> {a.summary.toLowerCase()}
                      <span className="text-[var(--text-subtle)]"> · {relativeTime(a.createdAt)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Priority({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-[14px] font-semibold text-[var(--text)]">
        <span className="text-[var(--primary)]">{icon}</span>
        {label}
      </div>
      <div className="pl-6">{children}</div>
    </div>
  );
}
