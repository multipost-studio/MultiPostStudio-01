import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { PlatformBadge } from "@/components/brand";
import { formatDate, formatNumber } from "@/lib/utils";
import { CampaignDetailClient } from "./detail-client";

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
      ideas: true,
    },
  });
  if (!campaign) notFound();

  const published = campaign.posts.filter((p) => p.status === "published");
  const engagement = published.reduce(
    (s, p) => s + p.metrics.reduce((n, m) => n + m.likes + m.comments + m.shares + m.saves, 0),
    0,
  );
  const impressions = published.reduce((s, p) => s + p.metrics.reduce((n, m) => n + m.impressions, 0), 0);

  return (
    <>
      <PageHeader
        title={campaign.name}
        description={`${campaign.objective} · ${campaign.startDate ? formatDate(campaign.startDate) : "—"} → ${campaign.endDate ? formatDate(campaign.endDate) : "—"}`}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/campaigns" className="text-[14px] text-[var(--text-muted)] hover:underline">
              ← All campaigns
            </Link>
            {can(ctx.active.role, "content.create") && (
              <CampaignDetailClient
                id={campaign.id}
                name={campaign.name}
                status={campaign.status}
                objective={campaign.objective}
              />
            )}
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Posts" value={campaign.posts.length} hint={campaign.goalPosts ? `goal ${campaign.goalPosts}` : ""} />
        <Stat label="Published" value={published.length} />
        <Stat label="Impressions" value={formatNumber(impressions)} />
        <Stat label="Engagement" value={formatNumber(engagement)} hint={campaign.goalEngagement ? `goal ${formatNumber(campaign.goalEngagement)}` : ""} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Posts in this campaign</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {campaign.posts.length === 0 && <p className="text-[14px] text-[var(--text-muted)]">No posts assigned yet. Set the campaign in the composer.</p>}
            {campaign.posts.map((p) => (
              <Link key={p.id} href={`/composer/${p.id}`} className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] p-2.5 hover:border-[var(--primary)]">
                <div className="flex -space-x-1">
                  {p.channels.map((c) => (
                    <PlatformBadge key={c.id} platform={c.platform} size={16} />
                  ))}
                </div>
                <span className="flex-1 truncate text-[14px] text-[var(--text)]">
                  {p.title ?? p.channels[0]?.body?.slice(0, 40) ?? "Untitled"}
                </span>
                <StatusBadge status={p.status} />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ideas ({campaign.ideas.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {campaign.ideas.length === 0 && <p className="text-[14px] text-[var(--text-muted)]">No ideas linked.</p>}
            {campaign.ideas.map((i) => (
              <div key={i.id} className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-2 text-[14px]">
                <span className="truncate text-[var(--text)]">{i.title}</span>
                <Badge tone="neutral">{i.stage}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
