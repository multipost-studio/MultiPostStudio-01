import type { Metadata } from "next";
import Link from "next/link";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Progress } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/misc";
import { formatDate, formatNumber, formatCurrency } from "@/lib/utils";
import { CampNew } from "./campaigns-client";

export const metadata: Metadata = { title: "Campaigns" };

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const ctx = await requireWorkspace();
  const { new: openNew } = await searchParams;

  const campaigns = await db.campaign.findMany({
    where: { workspaceId: ctx.active.workspace.id },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { posts: true, ideas: true } },
      posts: { where: { status: "published" }, include: { metrics: true } },
    },
  });

  const canEdit = can(ctx.active.role, "content.create");

  const compare = campaigns.map((c) => {
    const engagement = c.posts.reduce(
      (s, p) => s + p.metrics.reduce((n, m) => n + m.likes + m.comments + m.shares + m.saves, 0),
      0,
    );
    const impressions = c.posts.reduce((s, p) => s + p.metrics.reduce((n, m) => n + m.impressions, 0), 0);
    const roi = c.budgetCents && c.budgetCents > 0 ? Math.round(((c.revenueCents - c.budgetCents) / c.budgetCents) * 100) : null;
    return {
      id: c.id,
      name: c.name,
      color: c.color,
      objective: c.objective,
      posts: c._count.posts,
      engagement,
      impressions,
      er: impressions ? (engagement / impressions) * 100 : 0,
      budget: c.budgetCents ?? 0,
      revenue: c.revenueCents,
      conversions: c.conversions,
      roi,
      currency: c.currency.toUpperCase(),
    };
  });

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Group content around an objective and track it end to end."
        actions={canEdit && <CampNew open={openNew === "1"} />}
      />

      {campaigns.length === 0 ? (
        <EmptyState
          title="No campaigns yet"
          description="Create a campaign to organize posts around a launch, event or theme."
          action={canEdit && <CampNew />}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((c) => {
            const engagement = c.posts.reduce(
              (s, p) => s + p.metrics.reduce((n, m) => n + m.likes + m.comments + m.shares + m.saves, 0),
              0,
            );
            const postPct = c.goalPosts ? Math.min(100, (c._count.posts / c.goalPosts) * 100) : 0;
            return (
              <Link
                key={c.id}
                href={`/campaigns/${c.id}`}
                className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--primary)]"
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                    <span className="text-[15px] font-semibold text-[var(--text)]">{c.name}</span>
                  </span>
                  <Badge tone={c.status === "active" ? "success" : c.status === "completed" ? "info" : "neutral"}>{c.status}</Badge>
                </div>
                <p className="mt-1 text-[13px] capitalize text-[var(--text-muted)]">{c.objective}</p>
                <p className="mt-1 text-[12px] text-[var(--text-subtle)]">
                  {c.startDate ? formatDate(c.startDate) : "—"} → {c.endDate ? formatDate(c.endDate) : "—"}
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[16px] font-semibold tabular-nums text-[var(--text)]">{c._count.posts}</p>
                    <p className="text-[11px] text-[var(--text-subtle)]">posts</p>
                  </div>
                  <div>
                    <p className="text-[16px] font-semibold tabular-nums text-[var(--text)]">{c._count.ideas}</p>
                    <p className="text-[11px] text-[var(--text-subtle)]">ideas</p>
                  </div>
                  <div>
                    <p className="text-[16px] font-semibold tabular-nums text-[var(--text)]">{engagement}</p>
                    <p className="text-[11px] text-[var(--text-subtle)]">engagement</p>
                  </div>
                </div>
                {c.goalPosts ? (
                  <div className="mt-3">
                    <p className="mb-1 text-[11px] text-[var(--text-subtle)]">
                      {c._count.posts}/{c.goalPosts} posts
                    </p>
                    <Progress value={postPct} />
                  </div>
                ) : null}
              </Link>
            );
          })}
        </div>
      )}

      {campaigns.length > 1 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Compare campaigns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>Campaign</TH>
                    <TH className="text-right">Posts</TH>
                    <TH className="text-right">Impressions</TH>
                    <TH className="text-right">Engagement</TH>
                    <TH className="text-right">Eng. rate</TH>
                    <TH className="text-right">Spend</TH>
                    <TH className="text-right">Revenue</TH>
                    <TH className="text-right">Conv.</TH>
                    <TH className="text-right">ROI</TH>
                  </TR>
                </THead>
                <tbody>
                  {compare.map((c) => (
                    <TR key={c.id}>
                      <TD>
                        <Link href={`/campaigns/${c.id}`} className="flex items-center gap-2 hover:underline">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                          <span className="truncate">{c.name}</span>
                        </Link>
                      </TD>
                      <TD className="text-right tabular-nums">{c.posts}</TD>
                      <TD className="text-right tabular-nums">{formatNumber(c.impressions)}</TD>
                      <TD className="text-right tabular-nums">{formatNumber(c.engagement)}</TD>
                      <TD className="text-right tabular-nums">{c.er.toFixed(1)}%</TD>
                      <TD className="text-right tabular-nums">{c.budget ? formatCurrency(c.budget, c.currency) : "—"}</TD>
                      <TD className="text-right tabular-nums">{c.revenue ? formatCurrency(c.revenue, c.currency) : "—"}</TD>
                      <TD className="text-right tabular-nums">{formatNumber(c.conversions)}</TD>
                      <TD className={`text-right font-semibold tabular-nums ${c.roi === null ? "" : c.roi >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
                        {c.roi === null ? "—" : `${c.roi}%`}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
