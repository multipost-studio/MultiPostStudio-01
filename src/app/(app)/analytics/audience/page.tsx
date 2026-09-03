import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/session";
import { getAnalytics, type Range } from "@/lib/analytics";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat } from "@/components/ui/misc";
import { RangeTabs } from "@/components/range-tabs";
import { TrendArea, Bars, Heatmap } from "@/components/charts";
import { PlatformBadge } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Audience" };
const RANGES: Range[] = [7, 14, 30, 90];

export default async function AudiencePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const ctx = await requireWorkspace();
  const { range } = await searchParams;
  const days = (RANGES.includes(Number(range) as Range) ? Number(range) : 30) as Range;
  const a = await getAnalytics(ctx.active.workspace.id, days);

  const channelFollowers = a.channels.map((c) => ({
    label: c.name,
    followers: c.followers,
    platform: c.platform,
  }));

  const totalFollowers = channelFollowers.reduce((n, c) => n + c.followers, 0);

  return (
    <>
      <PageHeader
        title="Audience"
        description={`Follower growth and distribution · last ${days} days`}
        actions={
          <div className="flex items-center gap-2">
            <RangeTabs current={days} />
            <Button size="sm" variant="secondary" asChild>
              <a href={`/api/analytics/export?range=${days}&dataset=series`}>Export CSV</a>
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Total followers" value={formatNumber(totalFollowers)} delta={a.deltas.followerGrowth} hint="net growth" />
        <Stat label="Net new (range)" value={formatNumber(a.totals.followerGrowth)} />
        <Stat label="Avg daily growth" value={formatNumber(Math.round(a.totals.followerGrowth / days))} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Follower trajectory</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendArea data={a.series} dataKey="followers" color="#c22c2c" height={280} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Followers by channel</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {channelFollowers.map((c) => (
              <div key={c.label}>
                <div className="mb-1 flex items-center gap-2 text-[13px]">
                  <PlatformBadge platform={c.platform} size={16} />
                  <span className="flex-1 truncate text-[var(--text-muted)]">{c.label}</span>
                  <span className="font-medium tabular-nums text-[var(--text)]">{formatNumber(c.followers)}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-sunken)]">
                  <div
                    className="h-full rounded-full bg-[var(--primary)]"
                    style={{ width: `${totalFollowers ? (c.followers / totalFollowers) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
            {channelFollowers.length === 0 && <p className="text-[14px] text-[var(--text-muted)]">No channels connected.</p>}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Daily engagement volume</CardTitle>
          </CardHeader>
          <CardContent>
            <Bars data={a.series.map((s) => ({ label: s.label, engagement: s.engagement }))} dataKey="engagement" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>When your audience engages</CardTitle>
          </CardHeader>
          <CardContent>
            {a.postCount > 0 ? (
              <Heatmap cells={a.heatCells} />
            ) : (
              <p className="py-8 text-center text-[14px] text-[var(--text-muted)]">Publish a few posts to build this.</p>
            )}
          </CardContent>
        </Card>
      </div>
      <p className="mt-3 text-[13px] text-[var(--text-subtle)]">
        Demographic breakdowns (age, location) populate once a platform data connector is authorized.
      </p>
    </>
  );
}
