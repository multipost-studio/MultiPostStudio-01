import type { Metadata } from "next";
import Link from "next/link";
import { requireWorkspace } from "@/lib/session";
import { getAnalytics, type Range } from "@/lib/analytics";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { RangeTabs } from "@/components/range-tabs";
import { Bars } from "@/components/charts";
import { PlatformBadge } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { formatNumber, formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Content analytics" };
const RANGES: Range[] = [7, 14, 30, 90];

export default async function ContentAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const ctx = await requireWorkspace();
  const { range } = await searchParams;
  const days = (RANGES.includes(Number(range) as Range) ? Number(range) : 30) as Range;
  const a = await getAnalytics(ctx.active.workspace.id, days);

  const all = [...a.topPosts, ...a.worstPosts].filter((v, i, arr) => arr.findIndex((x) => x.id === v.id) === i);
  const rows = [...all].sort((x, y) => y.impressions - x.impressions);

  return (
    <>
      <PageHeader
        title="Content analytics"
        description={`Post-by-post performance · last ${days} days · ${a.postCount} published`}
        actions={
          <div className="flex items-center gap-2">
            <RangeTabs current={days} />
            <Button size="sm" variant="secondary" asChild>
              <a href={`/api/analytics/export?range=${days}&dataset=posts`}>Export CSV</a>
            </Button>
          </div>
        }
      />

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Format performance (avg engagement rate)</CardTitle>
          </CardHeader>
          <CardContent>
            {a.byFormat.some((f) => f.posts > 0) ? (
              <Bars data={a.byFormat.filter((f) => f.posts > 0).map((f) => ({ label: `${f.format} (${f.posts})`, rate: Number(f.avgEngagementRate.toFixed(2)) }))} dataKey="rate" />
            ) : (
              <p className="py-8 text-center text-[14px] text-[var(--text-muted)]">No data.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Engagement rate by pillar</CardTitle>
          </CardHeader>
          <CardContent>
            {a.byPillar.some((p) => p.posts > 0) ? (
              <Bars data={a.byPillar.map((p) => ({ label: p.name, rate: Number(p.avgEngagementRate.toFixed(2)) }))} dataKey="rate" />
            ) : (
              <p className="py-8 text-center text-[14px] text-[var(--text-muted)]">No data.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top hashtags</CardTitle>
          </CardHeader>
          <CardContent>
            {a.byHashtag.length > 0 ? (
              <div className="space-y-1">
                {a.byHashtag.slice(0, 8).map((h) => (
                  <div key={h.name} className="flex items-center justify-between border-b border-[var(--border)] py-1.5 text-[13px] last:border-0">
                    <span className="font-medium text-[var(--text)]">#{h.name}</span>
                    <span className="text-[var(--text-subtle)]">{h.posts}</span>
                    <span className="font-semibold tabular-nums text-[var(--text)]">{h.avgEngagementRate.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-[14px] text-[var(--text-muted)]">No tagged posts.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No published posts in this range" description="Publish a few posts to see per-post analytics." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Post</TH>
              <TH>Pillar</TH>
              <TH className="text-right">Impressions</TH>
              <TH className="text-right">Engagement</TH>
              <TH className="text-right">Saves</TH>
              <TH className="text-right">Eng. rate</TH>
              <TH className="text-right">Published</TH>
            </TR>
          </THead>
          <tbody>
            {rows.map((p) => (
              <TR key={p.id}>
                <TD>
                  <Link href={`/composer/${p.id}`} className="flex items-center gap-2 hover:underline">
                    <PlatformBadge platform={p.platform} size={14} />
                    <span className="max-w-[280px] truncate">{p.title}</span>
                  </Link>
                </TD>
                <TD className="text-[var(--text-muted)]">{p.pillar}</TD>
                <TD className="text-right tabular-nums">{formatNumber(p.impressions)}</TD>
                <TD className="text-right tabular-nums">{formatNumber(p.engagement)}</TD>
                <TD className="text-right tabular-nums">{formatNumber(p.saves)}</TD>
                <TD className="text-right font-semibold tabular-nums">{p.engagementRate.toFixed(1)}%</TD>
                <TD className="text-right text-[var(--text-subtle)]">{p.publishedAt ? formatDate(p.publishedAt) : "—"}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
