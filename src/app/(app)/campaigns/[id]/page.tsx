import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Calendar, Target, Users, FileText, ArrowRight } from "lucide-react";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { PlatformBadge } from "@/components/brand";
import { formatDate, formatNumber, formatCurrency } from "@/lib/utils";
import { Progress } from "@/components/ui/misc";
import {
  calculateCampaignRollup,
  formatKpiMetricLabel,
} from "@/lib/campaign-analytics";
import {
  CampaignDetailClient,
  RecordResultsButton,
  NewCampaignPostButton,
  GenerateCampaignIdeasButton,
} from "./detail-client";

export const metadata: Metadata = { title: "Campaign" };

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireWorkspace();

  const campaign = await db.campaign.findFirst({
    where: { id, workspaceId: ctx.active.workspace.id },
    include: {
      posts: {
        include: { channels: true, metrics: true },
        orderBy: { createdAt: "desc" },
      },
      ideas: {
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!campaign) notFound();

  const rollup = calculateCampaignRollup(campaign, campaign.posts);
  const cur = campaign.currency.toUpperCase();
  const canEdit = can(ctx.active.role, "content.create");

  return (
    <>
      <PageHeader
        title={campaign.name}
        description={`${campaign.objective} · ${campaign.startDate ? formatDate(campaign.startDate) : "—"} → ${campaign.endDate ? formatDate(campaign.endDate) : "—"}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/campaigns"
              className="text-[13.5px] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
            >
              ← All campaigns
            </Link>
            <Link
              href={`/calendar?campaign=${campaign.id}`}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[13px] font-medium text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors"
            >
              <Calendar size={14} className="text-[var(--primary)]" />
              <span>View in Calendar</span>
            </Link>
            {canEdit && (
              <>
                <GenerateCampaignIdeasButton campaignId={campaign.id} />
                <NewCampaignPostButton campaignId={campaign.id} />
                <RecordResultsButton
                  id={campaign.id}
                  budgetCents={campaign.budgetCents}
                  revenueCents={campaign.revenueCents}
                  conversions={campaign.conversions}
                />
                <CampaignDetailClient
                  id={campaign.id}
                  name={campaign.name}
                  status={campaign.status}
                  objective={campaign.objective}
                  startDate={campaign.startDate ? campaign.startDate.toISOString().slice(0, 10) : null}
                  endDate={campaign.endDate ? campaign.endDate.toISOString().slice(0, 10) : null}
                  goalPosts={campaign.goalPosts}
                  goalEngagement={campaign.goalEngagement}
                  kpiMetric={campaign.kpiMetric}
                  kpiTarget={campaign.kpiTarget}
                  description={campaign.description}
                  targetAudience={campaign.targetAudience}
                  tags={campaign.tags}
                  budgetCents={campaign.budgetCents}
                />
              </>
            )}
          </div>
        }
      />

      {/* Brief & Context Header if present */}
      {(campaign.description || campaign.targetAudience) && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          {campaign.description && (
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3.5">
              <div className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                <FileText size={13} className="text-[var(--primary)]" />
                <span>Campaign Brief</span>
              </div>
              <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--text)] whitespace-pre-line">
                {campaign.description}
              </p>
            </div>
          )}
          {campaign.targetAudience && (
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3.5">
              <div className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                <Users size={13} className="text-[var(--primary)]" />
                <span>Target Audience</span>
              </div>
              <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--text)]">
                {campaign.targetAudience}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Primary Volume & Reach Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Total Posts"
          value={rollup.totalPosts}
          hint={campaign.goalPosts ? `goal ${campaign.goalPosts} (${rollup.postProgressPct ?? 0}%)` : `${rollup.publishedPosts} published`}
        />
        <Stat label="Published Posts" value={rollup.publishedPosts} />
        <Stat label="Total Impressions" value={formatNumber(rollup.impressions)} />
        <Stat
          label="Total Engagement"
          value={formatNumber(rollup.engagement)}
          hint={campaign.goalEngagement ? `goal ${formatNumber(campaign.goalEngagement)} (${rollup.engagementProgressPct ?? 0}%)` : `avg ${rollup.averageEngagementRate}% ER`}
        />
      </div>

      {/* Secondary Financial & Performance Stats */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Stat label="Budget" value={rollup.budget ? formatCurrency(rollup.budget, cur) : "—"} />
        <Stat label="Attributed Rev." value={rollup.revenue ? formatCurrency(rollup.revenue, cur) : "—"} />
        <Stat label="Conversions" value={formatNumber(rollup.conversions)} />
        <Stat label="Est. ROI" value={rollup.roiPct === null ? "—" : `${rollup.roiPct}%`} />
        <Stat label="Audience Reach" value={formatNumber(rollup.reach)} />
        <Stat label="Link Clicks" value={formatNumber(rollup.clicks)} hint={rollup.cpc ? `${formatCurrency(rollup.cpc, cur)} / click` : ""} />
      </div>

      {/* Goal & KPI Progress Bars */}
      {(rollup.postProgressPct !== null || rollup.engagementProgressPct !== null || rollup.kpiProgressPct !== null) && (
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-[14px] flex items-center gap-2">
              <Target size={15} className="text-[var(--primary)]" />
              <span>Goal & KPI Progress</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-2">
            {rollup.kpiProgressPct !== null && campaign.kpiTarget && (
              <div>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="font-medium text-[var(--text)]">
                    {formatKpiMetricLabel(campaign.kpiMetric)} vs KPI Target
                  </span>
                  <span className="tabular-nums text-[var(--text)] font-semibold">
                    {formatNumber(rollup.kpiCurrent)} / {formatNumber(campaign.kpiTarget)} ({rollup.kpiProgressPct}%)
                  </span>
                </div>
                <Progress value={rollup.kpiProgressPct} className="mt-1.5" />
              </div>
            )}
            {rollup.postProgressPct !== null && campaign.goalPosts && (
              <div>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-[var(--text-muted)]">Content Volume vs Goal</span>
                  <span className="tabular-nums text-[var(--text)]">
                    {rollup.totalPosts} / {campaign.goalPosts} posts ({rollup.postProgressPct}%)
                  </span>
                </div>
                <Progress value={rollup.postProgressPct} className="mt-1" />
              </div>
            )}
            {rollup.engagementProgressPct !== null && campaign.goalEngagement && (
              <div>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-[var(--text-muted)]">Audience Engagement vs Goal</span>
                  <span className="tabular-nums text-[var(--text)]">
                    {formatNumber(rollup.engagement)} / {formatNumber(campaign.goalEngagement)} ({rollup.engagementProgressPct}%)
                  </span>
                </div>
                <Progress value={rollup.engagementProgressPct} className="mt-1" />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Channel Breakdown Matrix */}
      {rollup.channelBreakdown.length > 0 && (
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-[14px]">Channel Performance Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--text-muted)] font-medium">
                    <th className="pb-2">Platform</th>
                    <th className="pb-2 text-right">Posts</th>
                    <th className="pb-2 text-right">Impressions</th>
                    <th className="pb-2 text-right">Reach</th>
                    <th className="pb-2 text-right">Engagement</th>
                    <th className="pb-2 text-right">Clicks</th>
                    <th className="pb-2 text-right">Avg ER%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {rollup.channelBreakdown.map((cb) => (
                    <tr key={cb.platform} className="hover:bg-[var(--surface-hover)]">
                      <td className="py-2.5 font-medium text-[var(--text)]">
                        <div className="flex items-center gap-2">
                          <PlatformBadge platform={cb.platform} size={15} />
                          <span className="capitalize">{cb.platform}</span>
                        </div>
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-[var(--text)]">{cb.postsCount}</td>
                      <td className="py-2.5 text-right tabular-nums text-[var(--text)]">{formatNumber(cb.impressions)}</td>
                      <td className="py-2.5 text-right tabular-nums text-[var(--text)]">{formatNumber(cb.reach)}</td>
                      <td className="py-2.5 text-right tabular-nums text-[var(--text)]">{formatNumber(cb.engagement)}</td>
                      <td className="py-2.5 text-right tabular-nums text-[var(--text)]">{formatNumber(cb.clicks)}</td>
                      <td className="py-2.5 text-right tabular-nums font-semibold text-[var(--primary)]">{cb.engagementRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Posts & Linked Ideas Grid */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle>Posts in this campaign ({campaign.posts.length})</CardTitle>
            {canEdit && <NewCampaignPostButton campaignId={campaign.id} />}
          </CardHeader>
          <CardContent className="space-y-2">
            {campaign.posts.length === 0 && (
              <p className="py-4 text-center text-[13.5px] text-[var(--text-muted)]">
                No posts assigned to this campaign yet. Click &quot;New post&quot; to create one.
              </p>
            )}
            {campaign.posts.map((p) => (
              <Link
                key={p.id}
                href={`/composer/${p.id}`}
                className="group flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] p-2.5 hover:border-[var(--primary)] hover:bg-[var(--surface-hover)] transition-all"
              >
                <div className="flex -space-x-1">
                  {p.channels.map((c) => (
                    <PlatformBadge key={c.id} platform={c.platform} size={16} />
                  ))}
                </div>
                <span className="flex-1 truncate text-[13.5px] text-[var(--text)] group-hover:text-[var(--primary)] font-medium">
                  {p.title ?? p.channels[0]?.body?.slice(0, 40) ?? "Untitled Post"}
                </span>
                <StatusBadge status={p.status} />
                <ArrowRight size={13} className="text-[var(--text-subtle)] opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle>Campaign Ideas ({campaign.ideas.length})</CardTitle>
            {canEdit && <GenerateCampaignIdeasButton campaignId={campaign.id} />}
          </CardHeader>
          <CardContent className="space-y-2">
            {campaign.ideas.length === 0 && (
              <p className="py-4 text-center text-[13.5px] text-[var(--text-muted)]">
                No ideas linked. Click &quot;Generate ideas&quot; to brainstorm tailored angles.
              </p>
            )}
            {campaign.ideas.map((i) => (
              <div
                key={i.id}
                className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-[13.5px]"
              >
                <span className="truncate text-[var(--text)] font-medium">{i.title}</span>
                <Badge tone="neutral">{i.stage}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
