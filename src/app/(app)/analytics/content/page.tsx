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
        actions={<RangeTabs current={days} />}
      />

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Content type performance (avg engagement rate)</CardTitle>
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
            <CardTitle>Saves by pillar</CardTitle>
          </CardHeader>
          <CardContent>
            {a.byPillar.some((p) => p.saves > 0) ? (
              <Bars data={a.byPillar.map((p) => ({ label: p.name, saves: p.saves }))} dataKey="saves" color="#10b981" />
            ) : (
              <p className="py-8 text-center text-[14px] text-[var(--text-muted)]">No data.</p>
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
