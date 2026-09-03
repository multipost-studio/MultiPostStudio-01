import type { Metadata } from "next";
import Link from "next/link";
import { requireWorkspace } from "@/lib/session";
import { getAnalytics, type Range } from "@/lib/analytics";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat } from "@/components/ui/misc";
import { HealthRing } from "@/components/health-ring";
import { RangeTabs } from "@/components/range-tabs";
import { MultiLine, Bars, Donut, Heatmap } from "@/components/charts";
import { PlatformBadge } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Analytics" };

const RANGES: Range[] = [7, 14, 30, 90];

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const ctx = await requireWorkspace();
  const { range } = await searchParams;
  const days = (RANGES.includes(Number(range) as Range) ? Number(range) : 30) as Range;
  const a = await getAnalytics(ctx.active.workspace.id, days);

  return (
    <>
      <PageHeader
        title="Analytics"
        description={`Aggregate performance across all connected channels · last ${days} days`}
        actions={
          <div className="flex items-center gap-2">
            <RangeTabs current={days} />
            <Button size="sm" variant="secondary" asChild>
              <a href={`/api/analytics/export?range=${days}&dataset=posts`}>Export CSV</a>
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Followers" value={formatNumber(a.totals.followers)} delta={a.deltas.followerGrowth} hint="growth vs prev" />
        <Stat label="Reach" value={formatNumber(a.totals.reach)} delta={a.deltas.reach} />
        <Stat label="Impressions" value={formatNumber(a.totals.impressions)} delta={a.deltas.impressions} />
        <Stat label="Engagement rate" value={`${a.engagementRate.toFixed(1)}%`} delta={a.deltas.engagementRate} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Reach, impressions & engagement</CardTitle>
          </CardHeader>
          <CardContent>
            <MultiLine
              data={a.series}
              lines={[
                { key: "impressions", label: "Impressions" },
                { key: "reach", label: "Reach" },
                { key: "engagement", label: "Engagement" },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Health score</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <HealthRing score={a.health?.score ?? 0} size={130} />
            <p className="text-center text-[13px] text-[var(--text-muted)]">
              Based on posting consistency, engagement, growth, response speed and content diversity.
            </p>
            <Link href="/insights" className="text-[13px] text-[var(--primary)] hover:underline">
              See what&apos;s driving it →
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Period over period</CardTitle>
            <span className="text-[13px] text-[var(--text-muted)]">This {days}d vs the previous {days}d</span>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-[var(--text-subtle)]">
                    <th className="py-1.5 font-medium">Metric</th>
                    <th className="py-1.5 text-right font-medium">Previous</th>
                    <th className="py-1.5 text-right font-medium">Current</th>
                    <th className="py-1.5 text-right font-medium">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Reach", a.prevTotals.reach, a.totals.reach],
                    ["Impressions", a.prevTotals.impressions, a.totals.impressions],
                    ["Engagement", a.prevTotals.engagement, a.totals.engagement],
                    ["Clicks", a.prevTotals.clicks, a.totals.clicks],
                    ["Saves", a.prevTotals.saves, a.totals.saves],
                    ["Shares", a.prevTotals.shares, a.totals.shares],
                    ["Video views", a.prevTotals.videoViews, a.totals.videoViews],
                    ["Follower growth", a.prevTotals.followerGrowth, a.totals.followerGrowth],
                  ].map(([label, prev, cur]) => {
                    const p = Number(prev), c = Number(cur);
                    const pct = p ? ((c - p) / Math.abs(p)) * 100 : c ? 100 : 0;
                    return (
                      <tr key={label as string} className="border-b border-[var(--border)] last:border-0">
                        <td className="py-1.5 text-[var(--text-muted)]">{label}</td>
                        <td className="py-1.5 text-right tabular-nums text-[var(--text-subtle)]">{formatNumber(p)}</td>
                        <td className="py-1.5 text-right font-medium tabular-nums text-[var(--text)]">{formatNumber(c)}</td>
                        <td className={`py-1.5 text-right font-medium tabular-nums ${pct >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
                          {pct >= 0 ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td className="py-1.5 text-[var(--text-muted)]">Engagement rate</td>
                    <td className="py-1.5 text-right tabular-nums text-[var(--text-subtle)]">{a.prevTotals.engagementRate.toFixed(2)}%</td>
                    <td className="py-1.5 text-right font-medium tabular-nums text-[var(--text)]">{a.engagementRate.toFixed(2)}%</td>
                    <td className={`py-1.5 text-right font-medium tabular-nums ${a.deltas.engagementRate >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
                      {a.deltas.engagementRate >= 0 ? "▲" : "▼"} {Math.abs(a.deltas.engagementRate).toFixed(1)}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Best time to post</CardTitle>
            {a.bestSlots.length > 0 && (
              <span className="text-[13px] text-[var(--text-muted)]">
                Peak:{" "}
                {a.bestSlots
                  .map((s) => `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][s.day]} ${s.hour}:00`)
                  .join(" · ")}
              </span>
            )}
          </CardHeader>
          <CardContent>
            {a.postCount > 0 ? (
              <Heatmap cells={a.heatCells} />
            ) : (
              <p className="py-8 text-center text-[14px] text-[var(--text-muted)]">No published posts in this range.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Performance by format</CardTitle>
          </CardHeader>
          <CardContent>
            {a.byFormat.some((f) => f.posts > 0) ? (
              <Bars
                data={a.byFormat.filter((f) => f.posts > 0).map((f) => ({ label: `${f.format} (${f.posts})`, rate: Number(f.avgEngagementRate.toFixed(2)) }))}
                dataKey="rate"
              />
            ) : (
              <p className="py-8 text-center text-[14px] text-[var(--text-muted)]">No published posts in this range.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top hashtags</CardTitle>
            <a href={`/api/analytics/export?range=${days}&dataset=hashtags`} className="text-[13px] text-[var(--primary)] hover:underline">
              Export
            </a>
          </CardHeader>
          <CardContent>
            {a.byHashtag.length > 0 ? (
              <div className="space-y-1">
                {a.byHashtag.map((h) => (
                  <div key={h.name} className="flex items-center justify-between gap-2 border-b border-[var(--border)] py-1.5 text-[13px] last:border-0">
                    <span className="font-medium text-[var(--text)]">#{h.name}</span>
                    <span className="text-[var(--text-subtle)]">{h.posts} post{h.posts === 1 ? "" : "s"}</span>
                    <span className="font-semibold tabular-nums text-[var(--text)]">{h.avgEngagementRate.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-[14px] text-[var(--text-muted)]">No tagged posts in this range.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Engagement by content pillar</CardTitle>
          </CardHeader>
          <CardContent>
            {a.byPillar.some((p) => p.posts > 0) ? (
              <Bars
                data={a.byPillar.map((p) => ({ label: p.name, rate: Number(p.avgEngagementRate.toFixed(2)) }))}
                dataKey="rate"
              />
            ) : (
              <p className="py-8 text-center text-[14px] text-[var(--text-muted)]">No published posts in this range.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Platform comparison</CardTitle>
          </CardHeader>
          <CardContent>
            {a.byPlatform.length > 0 ? (
              <Donut data={a.byPlatform.map((p) => ({ name: p.platform, value: p.engagement }))} />
            ) : (
              <p className="py-8 text-center text-[14px] text-[var(--text-muted)]">No data yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top performing posts</CardTitle>
            <Link href="/analytics/content" className="text-[13px] text-[var(--primary)] hover:underline">
              Content analytics
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {a.topPosts.map((p) => (
              <Link key={p.id} href={`/composer/${p.id}`} className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] p-2.5 hover:border-[var(--primary)]">
                <PlatformBadge platform={p.platform} size={16} />
                <span className="flex-1 truncate text-[14px] text-[var(--text)]">{p.title}</span>
                <span className="text-[13px] font-semibold text-[var(--success)]">{p.engagementRate.toFixed(1)}%</span>
              </Link>
            ))}
            {a.topPosts.length === 0 && <p className="text-[14px] text-[var(--text-muted)]">Nothing published yet.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {a.worstPosts.map((p) => (
              <Link key={p.id} href={`/composer/${p.id}`} className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] p-2.5 hover:border-[var(--primary)]">
                <PlatformBadge platform={p.platform} size={16} />
                <span className="flex-1 truncate text-[14px] text-[var(--text)]">{p.title}</span>
                <span className="text-[13px] font-semibold text-[var(--danger)]">{p.engagementRate.toFixed(1)}%</span>
              </Link>
            ))}
            {a.worstPosts.length === 0 && <p className="text-[14px] text-[var(--text-muted)]">Nothing published yet.</p>}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
